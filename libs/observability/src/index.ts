import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

export const logger = {
  log: (msg: string, correlationId?: string) => {
    const prefix = correlationId ? `[CorrelationID: ${correlationId}]` : '[PDH Log]';
    console.log(`${prefix} ${msg}`);
  },
  error: (msg: string, correlationId?: string) => {
    const prefix = correlationId ? `[CorrelationID: ${correlationId}]` : '[PDH Error]';
    console.error(`${prefix} ${msg}`);
  }
};

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const response = http.getResponse();

    if (!request) {
      return next.handle();
    }

    // 1. Extract incoming x-correlation-id header or generate new unique tracing UUID
    const rawCorrelationHeader = request.headers?.['x-correlation-id'];
    const correlationId = Array.isArray(rawCorrelationHeader)
      ? rawCorrelationHeader[0]
      : rawCorrelationHeader || `corr_${crypto.randomUUID()}`;

    // 2. Attach correlation ID to request context & response header
    request.correlationId = correlationId;
    if (response && response.setHeader) {
      response.setHeader('x-correlation-id', correlationId);
    }

    const { method, url } = request;
    const startTime = Date.now();

    console.log(`📡 [HTTP INCOMING] [CorrelationID: ${correlationId}] ${method} ${url}`);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode || 200;
          console.log(`✅ [HTTP COMPLETED] [CorrelationID: ${correlationId}] ${method} ${url} - Status: ${statusCode} (${duration}ms)`);
        },
        error: (err) => {
          const duration = Date.now() - startTime;
          const statusCode = err.status || response.statusCode || 500;
          console.error(`❌ [HTTP FAILED] [CorrelationID: ${correlationId}] ${method} ${url} - Status: ${statusCode} (${duration}ms)`);
        }
      })
    );
  }
}
