import { CanonicalOrder, OrderStatus } from '@pinaka-delivery-hub/canonical-model';
import {
  ConnectorCapability,
  ConnectorContext,
  ConnectorDescriptor,
  ConnectorError,
  ConnectorOperationResult,
  ParsedPlatformEvent,
  PlatformConnector,
  WebhookRequest,
  connectorFailure,
  connectorSuccess,
} from './contracts';

type JsonRecord = Record<string, unknown>;

export interface JsonFoodDeliveryConnectorOptions {
  readonly descriptor: Omit<ConnectorDescriptor, 'capabilities'>;
  readonly apiBaseUrlSetting?: string;
  readonly orderIdFields: readonly string[];
  readonly merchantIdFields: readonly string[];
  readonly totalFields: readonly string[];
  readonly itemsFields: readonly string[];
  readonly itemNameFields: readonly string[];
  readonly itemQuantityFields: readonly string[];
  readonly itemPriceFields: readonly string[];
}

function record(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function first(source: JsonRecord, fields: readonly string[]): unknown {
  for (const path of fields) {
    let value: unknown = source;
    for (const segment of path.split('.')) value = record(value)[segment];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}
function text(value: unknown, fallback = ''): string { return value === undefined || value === null ? fallback : String(value); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function requiredNumber(value: unknown, field: string, options: { integer?: boolean; min?: number } = {}): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new ConnectorError(`${field} must be a number`, 'INVALID_WEBHOOK_NUMBER', false, 400);
  if (options.integer && !Number.isInteger(parsed)) throw new ConnectorError(`${field} must be an integer`, 'INVALID_WEBHOOK_NUMBER', false, 400);
  if (options.min !== undefined && parsed < options.min) throw new ConnectorError(`${field} must be at least ${options.min}`, 'INVALID_WEBHOOK_NUMBER', false, 400);
  return parsed;
}

export class JsonFoodDeliveryConnector implements PlatformConnector {
  readonly descriptor: ConnectorDescriptor;

  constructor(private readonly options: JsonFoodDeliveryConnectorOptions) {
    this.descriptor = { ...options.descriptor, capabilities: [ConnectorCapability.WEBHOOKS, ConnectorCapability.ORDER_STATUS_UPDATE] };
  }

  async parseWebhook(request: WebhookRequest, context: ConnectorContext): Promise<readonly ParsedPlatformEvent[]> {
    context.logger.info('[Connector SDK] webhook parsing started', {
      connectorId: this.descriptor.id,
      correlationId: context.correlationId,
    });
    const body = record(request.body);
    const externalOrderId = text(first(body, this.options.orderIdFields));
    const merchantId = text(first(body, this.options.merchantIdFields), context.configuration.merchantId);
    if (!externalOrderId) throw new ConnectorError('Webhook order id is required', 'INVALID_WEBHOOK_ORDER_ID', false, 400);
    if (!merchantId) throw new ConnectorError('Webhook merchant id is required', 'INVALID_WEBHOOK_MERCHANT_ID', false, 400);
    const rawItems = first(body, this.options.itemsFields);
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new ConnectorError('Webhook must contain at least one order item', 'INVALID_WEBHOOK_ITEMS', false, 400);
    }
    const items = (Array.isArray(rawItems) ? rawItems : []).map((value, index) => {
      const item = record(value);
      const name = text(first(item, this.options.itemNameFields)).trim();
      if (!name) throw new ConnectorError(`items[${index}].name is required`, 'INVALID_WEBHOOK_ITEM_NAME', false, 400);
      return {
        id: `item_${index + 1}`,
        externalItemId: text(first(item, ['id', 'external_id', 'item_id', 'itemId', 'product_id', 'sku']), `ITEM-${index + 1}`),
        name,
        quantity: requiredNumber(first(item, this.options.itemQuantityFields), `items[${index}].quantity`, { integer: true, min: 1 }),
        unitPrice: requiredNumber(first(item, this.options.itemPriceFields), `items[${index}].unitPrice`, { min: 0 }),
      };
    });
    const total = requiredNumber(first(body, this.options.totalFields), 'totalAmount', { min: 0 });
    const now = context.now().toISOString();
    const order: CanonicalOrder = {
      id: `ord_${crypto.randomUUID()}`,
      merchantId,
      externalOrderId,
      platform: this.descriptor.platform,
      status: OrderStatus.CREATED,
      customer: {
        fullName: text(first(body, ['customer.name', 'customer.full_name', 'customer_name']), `${this.descriptor.displayName} Customer`),
        phone: text(first(body, ['customer.phone', 'customer.phone_number', 'customer_phone']), 'not-provided'),
      },
      items,
      subtotal: number(first(body, ['subtotal', 'pricing.subtotal'])) || total,
      tax: number(first(body, ['tax', 'tax_amount', 'pricing.tax'])),
      deliveryFee: number(first(body, ['delivery_fee', 'deliveryFee', 'pricing.delivery_fee'])),
      totalAmount: total,
      deliveryAddress: {
        street: text(first(body, ['delivery_address.street', 'deliveryAddress.street', 'address.line1']), 'not-provided'),
        city: text(first(body, ['delivery_address.city', 'deliveryAddress.city', 'address.city']), 'not-provided'),
        zipCode: text(first(body, ['delivery_address.zip_code', 'deliveryAddress.zipCode', 'address.postal_code']), 'not-provided'),
      },
      createdAt: text(first(body, ['created_at', 'createdAt']), now),
      updatedAt: now,
    };
    context.logger.info('[Connector SDK] webhook parsed successfully', {
      connectorId: this.descriptor.id,
      correlationId: context.correlationId,
      externalOrderId,
      merchantId,
      itemCount: items.length,
      totalAmount: total,
    });
    return [{ id: `evt_${crypto.randomUUID()}`, kind: 'ORDER_CREATED', occurredAt: now, payload: order }];
  }

  async updateOrderStatus(
    request: { merchantId: string; externalOrderId: string; status: OrderStatus; idempotencyKey?: string },
    context: ConnectorContext,
  ): Promise<ConnectorOperationResult<void>> {
    const baseUrl = text(context.configuration.settings[this.options.apiBaseUrlSetting ?? 'apiBaseUrl']);
    if (!baseUrl) {
      context.logger.warn('[Connector SDK] platform API is not configured; status update accepted locally', {
        connectorId: this.descriptor.id,
        correlationId: context.correlationId,
        externalOrderId: request.externalOrderId,
        status: request.status,
      });
      return connectorSuccess(undefined, { mode: 'local', platformRequestSent: false });
    }
    const token = context.configuration.credentials.apiToken ?? context.configuration.credentials.apiKey;
    try {
      context.logger.info('[Connector SDK] platform status update started', {
        connectorId: this.descriptor.id,
        correlationId: context.correlationId,
        externalOrderId: request.externalOrderId,
        status: request.status,
      });
      const response = await context.httpClient.request({
        method: 'PATCH',
        url: `${baseUrl.replace(/\/$/, '')}/orders/${encodeURIComponent(request.externalOrderId)}/status`,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(request.idempotencyKey ? { 'idempotency-key': request.idempotencyKey } : {}),
          'x-correlation-id': context.correlationId,
        },
        body: { status: request.status, merchantId: request.merchantId },
        signal: context.signal,
      });
      context.logger.info('[Connector SDK] platform status update completed', {
        connectorId: this.descriptor.id,
        correlationId: context.correlationId,
        externalOrderId: request.externalOrderId,
        platformStatus: response.status,
      });
      return connectorSuccess(undefined, { platformStatus: response.status });
    } catch (error) {
      context.logger.error('[Connector SDK] platform status update failed', {
        connectorId: this.descriptor.id,
        correlationId: context.correlationId,
        externalOrderId: request.externalOrderId,
        errorCode: error instanceof ConnectorError ? error.code : 'STATUS_UPDATE_FAILED',
      });
      return connectorFailure(error instanceof ConnectorError ? error : new ConnectorError('Status update failed', 'STATUS_UPDATE_FAILED', true));
    }
  }
}
