import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { CanonicalOrder } from '@pinaka-delivery-hub/canonical-model';

export const RABBITMQ_QUEUE = 'pdh_orders_queue';
export const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

export interface MessagePublisher {
  publish(topic: string, message: unknown): Promise<void>;
}

// In-Memory Shared Event Bus for local zero-dependency execution & fast verification
class OrderEventBus {
  private listeners: Array<(envelope: EventEnvelope<CanonicalOrder>) => void> = [];

  subscribe(listener: (envelope: EventEnvelope<CanonicalOrder>) => void) {
    this.listeners.push(listener);
  }

  publish(envelope: EventEnvelope<CanonicalOrder>) {
    console.log(`[RabbitMQ Event Bus Published] EventID: ${envelope.eventId} | Topic: ${envelope.eventType}`);
    this.listeners.forEach((listener) => listener(envelope));
  }
}

export const GlobalOrderEventBus = new OrderEventBus();
