import { BadRequestException, Body, Controller, Get, Headers, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { OrderStatus } from '@pinaka-delivery-hub/canonical-model';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { GlobalOrderEventBus } from '@pinaka-delivery-hub/messaging';
import {
  ConnectorContext,
  ConnectorError,
  FetchConnectorHttpClient,
  PlatformConnector,
  WebhookRequest,
} from '@pinaka-delivery-hub/connector-sdk';
import { connectorRegistry } from './connector-registry';

@Controller('api/v1/connectors')
export class AppController {
  private readonly httpClient = new FetchConnectorHttpClient();
  private readonly registry = connectorRegistry;

  @Get('health')
  health() { return { status: 'ok', service: 'connector-service', timestamp: new Date().toISOString() }; }

  @Get('ready')
  readiness() { return { status: 'ready', registeredConnectors: this.registry.list().length }; }

  @Get()
  listConnectors() { return { success: true, connectors: this.registry.list().map((connector) => connector.descriptor) }; }

  @Post(':connectorId/webhook')
  async handleWebhook(
    @Param('connectorId') connectorId: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | readonly string[] | undefined>,
    @Query() query: Record<string, string | readonly string[] | undefined>,
  ) {
    const connector = this.getConnector(connectorId);
    const correlationId = this.header(headers, 'x-correlation-id') ?? `corr_${crypto.randomUUID()}`;
    console.info(`[Connector Service] connector selected connectorId=${connectorId} correlationId=${correlationId}`);
    const context = this.createContext(connector, correlationId);
    const request: WebhookRequest = {
      method: 'POST',
      path: `/api/v1/connectors/${connectorId}/webhook`,
      headers,
      query,
      rawBody: new TextEncoder().encode(JSON.stringify(body)),
      body,
    };
    try {
      if (connector.verifyWebhook) {
        const verification = await connector.verifyWebhook(request, context);
        if (!verification.valid) throw new BadRequestException(verification.reason ?? 'Invalid webhook signature');
      }
      const events = await connector.parseWebhook(request, context);
      if (events.length === 0) throw new BadRequestException('Webhook did not contain a supported event');
      const envelopes: EventEnvelope[] = [];
      for (const event of events) {
        console.info(`[Connector Service] publishing parsed event connectorId=${connectorId} eventId=${event.id} correlationId=${correlationId}`);
        const envelope: EventEnvelope = {
          eventId: event.id,
          eventType: 'ORDER_RECEIVED',
          source: `connector-service:${connectorId}`,
          timestamp: event.occurredAt,
          correlationId,
          version: connector.descriptor.version,
          payload: event.payload,
        };
        await GlobalOrderEventBus.publish(envelope);
        envelopes.push(envelope);
      }
      const canonicalOrder = events[0].payload;
      console.info(`[Connector Service] webhook completed connectorId=${connectorId} orderId=${canonicalOrder.id} eventCount=${events.length} correlationId=${correlationId}`);
      return { success: true, orderId: canonicalOrder.id, envelope: envelopes[0], canonicalOrder, eventCount: events.length };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof ConnectorError) throw new BadRequestException({ code: error.code, message: error.message });
      throw error;
    }
  }

  @Patch(':connectorId/orders/:externalOrderId/status')
  async updateOrderStatus(
    @Param('connectorId') connectorId: string,
    @Param('externalOrderId') externalOrderId: string,
    @Body() body: { status: OrderStatus; merchantId?: string },
    @Headers() headers: Record<string, string | readonly string[] | undefined>,
  ) {
    const connector = this.getConnector(connectorId);
    if (!Object.values(OrderStatus).includes(body.status)) throw new BadRequestException('Invalid order status');
    const correlationId = this.header(headers, 'x-correlation-id') ?? `corr_${crypto.randomUUID()}`;
    const merchantId = body.merchantId ?? this.header(headers, 'x-merchant-id') ?? 'default';
    console.info('[Connector Service] status update accepted locally', {
      connectorId: connector.descriptor.id,
      externalOrderId,
      merchantId,
      status: body.status,
      correlationId,
    });
    return {
      success: true,
      connectorId: connector.descriptor.id,
      externalOrderId,
      merchantId,
      status: body.status,
      correlationId,
      metadata: { mode: 'local', platformRequestSent: false },
    };
  }

  private getConnector(id: string): PlatformConnector {
    try { return this.registry.get(id); } catch { throw new NotFoundException(`Connector '${id}' is not registered`); }
  }

  private createContext(connector: PlatformConnector, correlationId: string, merchantId = 'default'): ConnectorContext {
    const prefix = connector.descriptor.id.toUpperCase().replace(/-/g, '_');
    return {
      correlationId,
      httpClient: this.httpClient,
      logger: console,
      now: () => new Date(),
      configuration: {
        connectorId: connector.descriptor.id,
        merchantId,
        settings: { apiBaseUrl: process.env[`${prefix}_API_BASE_URL`] ?? '' },
        credentials: {
          apiToken: process.env[`${prefix}_API_TOKEN`] ?? '',
          apiKey: process.env[`${prefix}_API_KEY`] ?? '',
        },
      },
    };
  }

  private header(headers: Record<string, string | readonly string[] | undefined>, name: string): string | undefined {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value as string | undefined;
  }
}
