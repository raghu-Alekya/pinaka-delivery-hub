import { CanonicalOrder, OrderStatus } from '@pinaka-delivery-hub/canonical-model';
import { ConnectorDescriptor, ConnectorHttpClient } from './contracts';
import { FetchConnectorHttpClient } from './http-client';

export interface ConnectorServiceClientOptions { readonly baseUrl: string; readonly httpClient?: ConnectorHttpClient; }
export interface ServiceRequestOptions { readonly correlationId?: string; readonly timeoutMs?: number; readonly signal?: AbortSignal; }
export interface ConnectorWebhookResponse {
  readonly success: true;
  readonly orderId: string;
  readonly canonicalOrder: CanonicalOrder;
  readonly eventCount: number;
  readonly envelope: unknown;
}

export class ConnectorServiceClient {
  private readonly apiUrl: string;
  private readonly httpClient: ConnectorHttpClient;

  constructor(options: ConnectorServiceClientOptions) {
    this.apiUrl = `${options.baseUrl.replace(/\/$/, '')}/api/v1/connectors`;
    this.httpClient = options.httpClient ?? new FetchConnectorHttpClient();
  }

  async health(options?: ServiceRequestOptions) {
    return (await this.httpClient.request<{ status: 'ok'; service: string; timestamp: string }>({ method: 'GET', url: `${this.apiUrl}/health`, ...this.requestOptions(options) })).data;
  }

  async readiness(options?: ServiceRequestOptions) {
    return (await this.httpClient.request<{ status: 'ready'; registeredConnectors: number }>({ method: 'GET', url: `${this.apiUrl}/ready`, ...this.requestOptions(options) })).data;
  }

  async listConnectors(options?: ServiceRequestOptions) {
    return (await this.httpClient.request<{ success: true; connectors: readonly ConnectorDescriptor[] }>({ method: 'GET', url: this.apiUrl, ...this.requestOptions(options) })).data;
  }

  async sendWebhook<TBody>(connectorId: string, body: TBody, options?: ServiceRequestOptions): Promise<ConnectorWebhookResponse> {
    return (await this.httpClient.request<ConnectorWebhookResponse, TBody>({ method: 'POST', url: `${this.apiUrl}/${encodeURIComponent(connectorId)}/webhook`, body, ...this.requestOptions(options) })).data;
  }

  async updateOrderStatus(
    connectorId: string,
    externalOrderId: string,
    body: { readonly status: OrderStatus; readonly merchantId?: string },
    options?: ServiceRequestOptions & { readonly idempotencyKey?: string },
  ) {
    const base = this.requestOptions(options);
    return (await this.httpClient.request<{ success: true; connectorId: string; externalOrderId: string; status: OrderStatus; correlationId: string }, typeof body>({
      method: 'PATCH',
      url: `${this.apiUrl}/${encodeURIComponent(connectorId)}/orders/${encodeURIComponent(externalOrderId)}/status`,
      body,
      ...base,
      headers: { ...base.headers, ...(options?.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {}) },
    })).data;
  }

  private requestOptions(options?: ServiceRequestOptions) {
    return {
      headers: options?.correlationId ? { 'x-correlation-id': options.correlationId } : undefined,
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    };
  }
}
