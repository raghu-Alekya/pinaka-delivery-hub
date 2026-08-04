export interface EventEnvelope<T = any> {
  eventId: string;
  eventType: 'ORDER_RECEIVED' | 'ORDER_STATUS_CHANGED' | 'MENU_SYNC_REQUESTED';
  source: string;
  timestamp: string;
  correlationId: string;
  version: string;
  payload: T;
}
