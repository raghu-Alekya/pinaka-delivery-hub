export interface EventEnvelope<T = unknown> { eventId: string; eventType: string; timestamp: string; payload: T; }
