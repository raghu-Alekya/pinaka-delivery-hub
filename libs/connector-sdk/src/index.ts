import { CanonicalOrder, PlatformSource } from '@pinaka-delivery-hub/canonical-model';

export interface ConnectorResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export abstract class BaseConnector {
  abstract readonly platform: PlatformSource;

  // Convert incoming webhook payload from platform (e.g. Swiggy/DoorDash) to Canonical format
  abstract parseWebhookPayload(rawBody: any, headers: Record<string, string>): CanonicalOrder;

  // Send status update back to third-party platform
  abstract updateOrderStatus(externalOrderId: string, status: string): Promise<ConnectorResponse<boolean>>;
}
