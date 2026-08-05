import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { CanonicalOrder } from '@pinaka-delivery-hub/canonical-model';

export const RABBITMQ_QUEUE = 'pdh_orders_queue';
export const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

export interface MessagePublisher {
  publish(topic: string, message: unknown): Promise<void>;
}

class OrderEventBus {
  private listeners: Array<(envelope: EventEnvelope<CanonicalOrder>) => void> = [];

  subscribe(listener: (envelope: EventEnvelope<CanonicalOrder>) => void) {
    this.listeners.push(listener);
  }

  async publish(envelope: EventEnvelope<CanonicalOrder>) {
    console.log(`[Event Bus Published] EventID: ${envelope.eventId} | Topic: ${envelope.eventType}`);
    
    // Notify in-memory listeners in same process
    this.listeners.forEach((listener) => listener(envelope));

    // Dispatch event across process boundary to order-service (Port 3002)
    try {
      await fetch('http://localhost:3002/api/v1/orders/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-correlation-id': envelope.correlationId,
        },
        body: JSON.stringify(envelope),
      });
    } catch {
      // Order service might be offline or initializing
    }
  }
}

export const GlobalOrderEventBus = new OrderEventBus();
