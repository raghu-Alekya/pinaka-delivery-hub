import { CanonicalOrder, OrderStatus, validateCanonicalOrder } from '@pinaka-delivery-hub/canonical-model';
import { createHmac, timingSafeEqual } from 'node:crypto';
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
  readonly webhookSignature?: WebhookSignatureOptions;
}

export interface WebhookSignatureOptions {
  /** Header names are checked in order, case-insensitively. */
  readonly headerNames: readonly string[];
  /** ConnectorConfiguration.credentials key containing the shared signing secret. */
  readonly secretCredential?: string;
  readonly algorithm?: 'sha256' | 'sha512';
  /** Optional prefix used by providers, for example `sha256=`. */
  readonly prefixes?: readonly string[];
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
  if (!Number.isFinite(parsed)) throw new ConnectorError(`${field} must be a number`, 'INVALID_CANONICAL_ORDER', false, 400);
  if (options.integer && !Number.isInteger(parsed)) throw new ConnectorError(`${field} must be an integer`, 'INVALID_CANONICAL_ORDER', false, 400);
  if (options.min !== undefined && parsed < options.min) throw new ConnectorError(`${field} must be at least ${options.min}`, 'INVALID_CANONICAL_ORDER', false, 400);
  return parsed;
}

function customerName(body: JsonRecord, fallback: string): string {
  const direct = text(first(body, [
    'customer.name', 'customer.full_name', 'customer_name',
    'payload.customer.customerName', 'billing.name',
  ])).trim();
  if (direct) return direct;
  const combined = [text(first(body, ['billing.first_name'])), text(first(body, ['billing.last_name']))]
    .map((part) => part.trim()).filter(Boolean).join(' ');
  return combined || fallback;
}

export class JsonFoodDeliveryConnector implements PlatformConnector {
  readonly descriptor: ConnectorDescriptor;

  constructor(private readonly options: JsonFoodDeliveryConnectorOptions) {
    this.descriptor = { ...options.descriptor, capabilities: [ConnectorCapability.WEBHOOKS, ConnectorCapability.ORDER_STATUS_UPDATE] };
  }

  async verifyWebhook(request: WebhookRequest, context: ConnectorContext): Promise<{ valid: boolean; reason?: string }> {
    const signatureOptions = this.options.webhookSignature;
    if (!signatureOptions) return { valid: true };

    const credentialName = signatureOptions.secretCredential ?? 'webhookSecret';
    const secret = context.configuration.credentials[credentialName]?.trim();
    if (!secret) {
      context.logger.error('[Connector SDK] webhook signing secret is not configured', {
        connectorId: this.descriptor.id,
        correlationId: context.correlationId,
        credentialName,
      });
      return { valid: false, reason: `Webhook verification is not configured for '${this.descriptor.id}'` };
    }

    const headers = Object.fromEntries(
      Object.entries(request.headers).map(([name, value]) => [name.toLowerCase(), value]),
    );
    const signatureValue = signatureOptions.headerNames
      .map((name) => headers[name.toLowerCase()])
      .map((value) => Array.isArray(value) ? value[0] : value)
      .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
    if (!signatureValue) {
      return { valid: false, reason: `Missing ${signatureOptions.headerNames.join(' or ')} webhook signature header` };
    }

    let supplied = signatureValue.trim();
    for (const prefix of signatureOptions.prefixes ?? ['sha256=', 'sha512=']) {
      if (supplied.toLowerCase().startsWith(prefix.toLowerCase())) {
        supplied = supplied.slice(prefix.length).trim();
        break;
      }
    }

    const digest = createHmac(signatureOptions.algorithm ?? 'sha256', secret).update(request.rawBody).digest();
    const candidates = [digest.toString('hex'), digest.toString('base64')];
    const valid = candidates.some((candidate) => {
      const expected = Buffer.from(candidate, 'utf8');
      const actual = Buffer.from(supplied, 'utf8');
      return expected.length === actual.length && timingSafeEqual(expected, actual);
    });
    if (!valid) {
      context.logger.warn('[Connector SDK] webhook signature rejected', {
        connectorId: this.descriptor.id,
        correlationId: context.correlationId,
      });
    }
    return valid ? { valid: true } : { valid: false, reason: 'Webhook signature is invalid' };
  }

  async parseWebhook(request: WebhookRequest, context: ConnectorContext): Promise<readonly ParsedPlatformEvent[]> {
    context.logger.info('[Connector SDK] webhook parsing started', {
      connectorId: this.descriptor.id,
      correlationId: context.correlationId,
    });
    const body = record(request.body);
    const externalOrderId = text(first(body, [
      ...this.options.orderIdFields,
      'order_id', 'orderId', 'id', 'number',
      'source.orderNumber', 'source.externalReferenceId',
      'payload.order.orderId', 'payload.order.id',
    ]));
    const merchantId = text(first(body, [
      ...this.options.merchantIdFields,
      'store_id', 'storeId', 'merchant_id', 'merchantId',
      'destination.storeId', 'destination.store_id',
      'destination.restaurantId', 'destination.restaurant_id',
      'destination.externalRestaurantId',
      'payload.destination.storeId', 'payload.destination.store_id',
    ]), context.configuration.merchantId);
    if (!externalOrderId) throw new ConnectorError('externalOrderId is required', 'INVALID_CANONICAL_ORDER', false, 400);
    if (!merchantId) throw new ConnectorError('merchantId is required', 'INVALID_CANONICAL_ORDER', false, 400);
    const rawItems = first(body, [
      ...this.options.itemsFields,
      'items', 'order.items', 'payload.order.items', 'line_items',
    ]);
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new ConnectorError('items must contain at least one item', 'INVALID_CANONICAL_ORDER', false, 400);
    }
    const items = (Array.isArray(rawItems) ? rawItems : []).map((value, index) => {
      const item = record(value);
      const externalItemId = text(first(item, ['external_id', 'externalItemId', 'product_id', 'item_id', 'itemId', 'sku', 'id']), `ITEM-${index + 1}`);
      const suppliedName = text(first(item, this.options.itemNameFields)).trim();
      const name = suppliedName || `Product ${externalItemId}`;
      return {
        id: `item_${index + 1}`,
        externalItemId,
        name,
        quantity: requiredNumber(first(item, this.options.itemQuantityFields), `items[${index}].quantity`, { integer: true, min: 1 }),
        unitPrice: requiredNumber(first(item, this.options.itemPriceFields), `items[${index}].unitPrice`, { min: 0 }),
      };
    });
    const total = requiredNumber(first(body, [
      ...this.options.totalFields,
      'total', 'total_amount', 'pricing.total', 'order.total',
      'payload.order.total',
    ]), 'totalAmount', { min: 0 });
    const now = context.now().toISOString();
    const order: CanonicalOrder = {
      id: `ord_${crypto.randomUUID()}`,
      merchantId,
      externalOrderId,
      platform: this.descriptor.platform,
      status: OrderStatus.CREATED,
      customer: {
        fullName: customerName(body, `${this.descriptor.displayName} Customer`),
        phone: text(first(body, [
          'customer.phone', 'customer.phone_number', 'customer_phone',
          'payload.customer.phoneNumber', 'billing.phone',
        ]), 'not-provided'),
        email: text(first(body, [
          'customer.email', 'payload.customer.email',
          'payload.customer.customerEmail', 'billing.email',
        ])) || undefined,
      },
      items,
      subtotal: number(first(body, ['subtotal', 'pricing.subtotal', 'payload.order.subtotal'])) || total,
      tax: number(first(body, ['tax', 'tax_amount', 'total_tax', 'pricing.tax', 'payload.order.tax'])),
      deliveryFee: number(first(body, [
        'delivery_fee', 'deliveryFee', 'pricing.delivery_fee',
        'payload.order.deliveryFee', 'payload.order.deliveryCharge',
      ])),
      totalAmount: total,
      deliveryAddress: {
        street: text(first(body, [
          'delivery_address.street', 'deliveryAddress.street', 'address.line1',
          'payload.customer.streetName', 'shipping.address_1',
        ]), 'not-provided'),
        city: text(first(body, [
          'delivery_address.city', 'deliveryAddress.city', 'address.city',
          'payload.customer.city', 'shipping.city',
        ]), 'not-provided'),
        zipCode: text(first(body, [
          'delivery_address.zip_code', 'deliveryAddress.zipCode', 'address.postal_code',
          'payload.customer.zipCode', 'shipping.postcode',
        ]), 'not-provided'),
      },
      createdAt: text(first(body, ['created_at', 'createdAt', 'date_created', 'source.placedOn']), now),
      updatedAt: now,
    };
    const validation = validateCanonicalOrder(order);
    if (!validation.valid) {
      throw new ConnectorError(validation.errors.join('; '), 'INVALID_CANONICAL_ORDER', false, 400);
    }
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
