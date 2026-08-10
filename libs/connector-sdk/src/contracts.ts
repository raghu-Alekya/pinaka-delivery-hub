import { CanonicalOrder, OrderStatus, PlatformSource } from '@pinaka-delivery-hub/canonical-model';

export enum ConnectorCapability {
  WEBHOOKS = 'WEBHOOKS',
  ORDER_STATUS_UPDATE = 'ORDER_STATUS_UPDATE',
}

export interface ConnectorDescriptor {
  readonly id: string;
  readonly displayName: string;
  readonly platform: PlatformSource;
  readonly version: string;
  readonly capabilities: readonly ConnectorCapability[];
}

export interface ConnectorHttpRequest<TBody = unknown> {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: TBody;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface ConnectorHttpResponse<TData = unknown> {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly data: TData;
}

export interface ConnectorHttpClient {
  request<TData = unknown, TBody = unknown>(request: ConnectorHttpRequest<TBody>): Promise<ConnectorHttpResponse<TData>>;
}

export interface ConnectorConfiguration {
  readonly connectorId: string;
  readonly merchantId: string;
  readonly settings: Readonly<Record<string, string | number | boolean | null>>;
  readonly credentials: Readonly<Record<string, string>>;
}

export interface ConnectorLogger {
  debug(message: string, metadata?: Readonly<Record<string, unknown>>): void;
  info(message: string, metadata?: Readonly<Record<string, unknown>>): void;
  warn(message: string, metadata?: Readonly<Record<string, unknown>>): void;
  error(message: string, metadata?: Readonly<Record<string, unknown>>): void;
}

export interface ConnectorContext {
  readonly configuration: ConnectorConfiguration;
  readonly correlationId: string;
  readonly httpClient: ConnectorHttpClient;
  readonly logger: ConnectorLogger;
  readonly signal?: AbortSignal;
  readonly now: () => Date;
}

export interface WebhookRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly query: Readonly<Record<string, string | readonly string[] | undefined>>;
  readonly rawBody: Uint8Array;
  readonly body: unknown;
}

export interface ParsedPlatformEvent {
  readonly id: string;
  readonly kind: 'ORDER_CREATED' | 'ORDER_UPDATED' | 'ORDER_CANCELLED' | 'UNKNOWN';
  readonly occurredAt: string;
  readonly payload: CanonicalOrder;
}

export type ConnectorOperationResult<T> =
  | { readonly success: true; readonly data: T; readonly metadata?: Readonly<Record<string, unknown>> }
  | { readonly success: false; readonly error: ConnectorError; readonly metadata?: Readonly<Record<string, unknown>> };

export class ConnectorError extends Error {
  constructor(message: string, readonly code: string, readonly retryable = false, readonly statusCode?: number) {
    super(message);
    this.name = 'ConnectorError';
  }
}

export interface PlatformConnector {
  readonly descriptor: ConnectorDescriptor;
  verifyWebhook?(request: WebhookRequest, context: ConnectorContext): Promise<{ valid: boolean; reason?: string }>;
  parseWebhook(request: WebhookRequest, context: ConnectorContext): Promise<readonly ParsedPlatformEvent[]>;
  updateOrderStatus?(
    request: { merchantId: string; externalOrderId: string; status: OrderStatus; idempotencyKey?: string },
    context: ConnectorContext,
  ): Promise<ConnectorOperationResult<void>>;
}

export function connectorSuccess<T>(data: T, metadata?: Readonly<Record<string, unknown>>): ConnectorOperationResult<T> {
  return { success: true, data, ...(metadata ? { metadata } : {}) };
}

export function connectorFailure<T = never>(error: ConnectorError): ConnectorOperationResult<T> {
  return { success: false, error };
}

/** @deprecated Implement PlatformConnector for new integrations. */
export interface ConnectorResponse<T> { success: boolean; data?: T; error?: string; }

/** @deprecated Implement PlatformConnector for new integrations. */
export abstract class BaseConnector {
  abstract readonly platform: PlatformSource;
  abstract parseWebhookPayload(rawBody: unknown, headers: Record<string, string>): CanonicalOrder;
  abstract updateOrderStatus(externalOrderId: string, status: string): Promise<ConnectorResponse<boolean>>;
}
