import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { CanonicalOrder } from '@pinaka-delivery-hub/canonical-model';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { GlobalOrderEventBus } from '@pinaka-delivery-hub/messaging';
import {
  ConnectorContext,
  ConnectorError,
  FetchConnectorHttpClient,
  WebhookRequest,
} from '@pinaka-delivery-hub/connector-sdk';
import { connectorRegistry } from './connector-registry';

@Controller('api/v1/connectors')
export class AppController {
  private readonly posOrdersUrl =
    process.env.POS_ORDERS_URL ||
    'https://merchantrestaurant.alektasolutions.com/wp-json/pinaka-restaurant-pos/v1/orders';

  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'connector-service',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  readiness() {
    return {
      status: 'ready',
    };
  }

  @Get()
  connectors() {
    return connectorRegistry.list().map(({ descriptor }) => descriptor);
  }

  @Post(':connector/webhook')
  async handleConnectorWebhook(
    @Param('connector') connectorId: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Query() query: Record<string, string | string[] | undefined>,
    @Req() request: { rawBody?: Buffer },
  ) {
    const normalizedConnectorId = connectorId.trim().toLowerCase();
    let connector;
    try {
      connector = connectorRegistry.get(normalizedConnectorId);
    } catch (error) {
      throw new NotFoundException({
        statusCode: 404,
        message: `Connector '${connectorId}' is not registered`,
        availableConnectors: connectorRegistry.list().map((item) => item.descriptor.id),
        error: 'Not Found',
      });
    }

    const correlationHeader = headers['x-correlation-id'];
    const activeCorrelationId =
      (Array.isArray(correlationHeader) ? correlationHeader[0] : correlationHeader) ||
      `corr_${crypto.randomUUID()}`;
    const envPrefix = normalizedConnectorId.replace(/-/g, '_').toUpperCase();
    const context: ConnectorContext = {
      configuration: {
        connectorId: normalizedConnectorId,
        merchantId: process.env[`${envPrefix}_MERCHANT_ID`] || '',
        settings: {
          apiBaseUrl: process.env[`${envPrefix}_API_BASE_URL`] || '',
        },
        credentials: {
          apiToken: process.env[`${envPrefix}_API_TOKEN`] || '',
          apiKey: process.env[`${envPrefix}_API_KEY`] || '',
          webhookSecret: process.env[`${envPrefix}_WEBHOOK_SECRET`] || '',
        },
      },
      correlationId: activeCorrelationId,
      httpClient: new FetchConnectorHttpClient(),
      logger: {
        debug: (message, metadata) => console.debug(message, metadata || {}),
        info: (message, metadata) => console.info(message, metadata || {}),
        warn: (message, metadata) => console.warn(message, metadata || {}),
        error: (message, metadata) => console.error(message, metadata || {}),
      },
      now: () => new Date(),
    };
    const webhookRequest: WebhookRequest = {
      method: 'POST',
      path: `/api/v1/connectors/${normalizedConnectorId}/webhook`,
      headers,
      query,
      rawBody: request.rawBody ?? Buffer.from(JSON.stringify(body)),
      body,
    };

    try {
      if (connector.verifyWebhook) {
        const verification = await connector.verifyWebhook(webhookRequest, context);
        if (!verification.valid) {
          throw new BadRequestException(verification.reason || 'Webhook signature is invalid');
        }
      }

      const events = await connector.parseWebhook(webhookRequest, context);
      if (events.length !== 1) {
        throw new BadRequestException(
          `Expected one order event but connector returned ${events.length}`,
        );
      }
      const canonicalOrder = events[0].payload;
      console.log(
        `[${connector.descriptor.displayName} Webhook Received] CorrelationID: ${activeCorrelationId}`,
      );

      const envelope: EventEnvelope<CanonicalOrder> = {
        eventId: events[0].id,
        eventType: 'ORDER_RECEIVED',
        source: 'connector-service',
        timestamp: events[0].occurredAt,
        correlationId: activeCorrelationId,
        version: '1.0.0',
        payload: canonicalOrder,
      };

      const posOrders = await this.createPosTakeawayOrder(canonicalOrder);
      await GlobalOrderEventBus.publish(envelope);

      return {
        success: true,
        connector: connector.descriptor.id,
        orderId: canonicalOrder.id,
        posOrders,
        envelope,
        canonicalOrder,
      };
    } catch (error) {
      if (error instanceof ConnectorError) {
        throw new BadRequestException({
          statusCode: error.statusCode || 400,
          message: error.message,
          code: error.code,
          error: 'Bad Request',
        });
      }
      throw error;
    }
  }

  private async createPosTakeawayOrder(order: CanonicalOrder) {
    const restaurantId = Number(process.env.POS_RESTAURANT_ID || 1);
    const captainId = Number(process.env.POS_CAPTAIN_ID || 1);
    const defaultProductId = Number(process.env.POS_DEFAULT_PRODUCT_ID || 1652);

    const parent = await this.postPosOrder({
      flag_type: 'parent_online_order',
      restaurant_id: restaurantId,
      created_via: 'online',
      order_datetime: new Date().toISOString(),
    });

    const parentOrderId = this.extractPosOrderId(parent);
    if (parentOrderId === undefined) {
      throw new BadGatewayException(
        'POS created the parent order but did not return an id or order_id',
      );
    }

    const kot = await this.postPosOrder({
      flag_type: 'kot_order',
      parent_order_id: parentOrderId,
      restaurant_id: restaurantId,
      captain_id: captainId,
      line_items: order.items.map((item) => ({
        product_id: this.resolvePosProductId(item.externalItemId, defaultProductId),
        quantity: item.quantity,
      })),
    });

    return { parentOrderId, parent, kot };
  }

  private resolvePosProductId(externalItemId: string, fallback: number): number {
    const exact = Number(externalItemId);
    if (Number.isInteger(exact) && exact > 0) return exact;
    const numericSuffix = externalItemId.match(/(\d+)$/)?.[1];
    const parsedSuffix = numericSuffix ? Number(numericSuffix) : NaN;
    return Number.isInteger(parsedSuffix) && parsedSuffix > 0 ? parsedSuffix : fallback;
  }

  private async postPosOrder(payload: Record<string, unknown>): Promise<any> {
    const configuredAuthorization = process.env.POS_AUTHORIZATION?.trim();
    const configuredToken = process.env.POS_API_TOKEN
      ?.trim()
      .replace(/^Bearer\s+/i, '');
    const authorization =
      configuredAuthorization ||
      (configuredToken ? `Bearer ${configuredToken}` : undefined);

    if (!authorization) {
      throw new BadGatewayException(
        'POS authentication is not configured. Set POS_AUTHORIZATION or POS_API_TOKEN.',
      );
    }

    if (!configuredAuthorization && configuredToken?.split('.').length !== 3) {
      throw new BadGatewayException(
        'POS_API_TOKEN is not a valid JWT. It must contain three dot-separated segments and may optionally start with Bearer.',
      );
    }

    try {
      const response = await fetch(this.posOrdersUrl, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      let result: any;
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        result = { raw: text };
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(result)}`);
      }
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadGatewayException(`POS order creation failed: ${message}`);
    }
  }

  private extractPosOrderId(response: any): string | number | undefined {
    return (
      response?.id ??
      response?.order_id ??
      response?.data?.id ??
      response?.data?.order_id ??
      response?.data?.order?.id ??
      response?.data?.order?.order_id
    );
  }

}
