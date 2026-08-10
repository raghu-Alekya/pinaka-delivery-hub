import { ConnectorError, ConnectorHttpClient, ConnectorHttpRequest, ConnectorHttpResponse } from './contracts';

export class FetchConnectorHttpClient implements ConnectorHttpClient {
  constructor(private readonly defaultTimeoutMs = 10_000, private readonly fetchImplementation: typeof fetch = fetch) {}

  async request<TData = unknown, TBody = unknown>(request: ConnectorHttpRequest<TBody>): Promise<ConnectorHttpResponse<TData>> {
    const startedAt = Date.now();
    const requestId = request.headers?.['x-correlation-id'] ?? request.headers?.['idempotency-key'] ?? 'not-provided';
    console.info(`[Connector SDK HTTP] request started method=${request.method} url=${request.url} requestId=${requestId}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? this.defaultTimeoutMs);
    const abort = () => controller.abort();
    request.signal?.addEventListener('abort', abort, { once: true });
    try {
      const headers = new Headers(request.headers);
      let body: BodyInit | undefined;
      if (request.body !== undefined) {
        headers.set('content-type', headers.get('content-type') ?? 'application/json');
        body = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
      }
      const response = await this.fetchImplementation(request.url, { method: request.method, headers, body, signal: controller.signal });
      const text = await response.text();
      const data = text && response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text || undefined;
      if (!response.ok) {
        console.error(`[Connector SDK HTTP] request failed method=${request.method} url=${request.url} status=${response.status} durationMs=${Date.now() - startedAt} requestId=${requestId}`);
        throw new ConnectorError(`Platform API returned HTTP ${response.status}`, `PLATFORM_HTTP_${response.status}`, response.status === 429 || response.status >= 500, response.status);
      }
      console.info(`[Connector SDK HTTP] request completed method=${request.method} url=${request.url} status=${response.status} durationMs=${Date.now() - startedAt} requestId=${requestId}`);
      return { status: response.status, headers: Object.fromEntries(response.headers.entries()), data: data as TData };
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      console.error(`[Connector SDK HTTP] request errored method=${request.method} url=${request.url} durationMs=${Date.now() - startedAt} requestId=${requestId} error=${error instanceof Error ? error.message : 'unknown'}`);
      throw new ConnectorError(controller.signal.aborted ? 'Platform request timed out' : 'Platform network request failed', controller.signal.aborted ? 'PLATFORM_TIMEOUT' : 'PLATFORM_NETWORK_ERROR', true);
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', abort);
    }
  }
}
