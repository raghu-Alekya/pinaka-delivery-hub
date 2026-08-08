import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { CanonicalOrder } from '@pinaka-delivery-hub/canonical-model';
import * as amqp from 'amqplib';

export const RABBITMQ_QUEUE = 'pdh_orders_queue';
export const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

export interface MessagePublisher {
  publish(topic: string, message: unknown): Promise<void>;
}

class OrderEventBus {
  private connection?: amqp.ChannelModel;
  private channel?: amqp.Channel;
  private isRabbitMqConnected = false;
  private listeners: Array<(envelope: EventEnvelope<CanonicalOrder>) => void> = [];

  constructor() {
    this.initRabbitMQ();
  }

  private async initRabbitMQ() {
    try {
      this.connection = await amqp.connect(RABBITMQ_URL);
      this.channel = await this.connection.createChannel();
      await this.channel.assertQueue(RABBITMQ_QUEUE, { durable: true });
      this.isRabbitMqConnected = true;
      console.log(`🐇 [RabbitMQ AMQP] Connected successfully to Queue: ${RABBITMQ_QUEUE} (${RABBITMQ_URL})`);
    } catch (err: any) {
      console.log(`⚠️ [RabbitMQ AMQP] Offline (${err.message}). Using HTTP/In-Memory Event Bus.`);
      this.isRabbitMqConnected = false;
    }
  }

  subscribe(listener: (envelope: EventEnvelope<CanonicalOrder>) => void) {
    this.listeners.push(listener);
  }

  async subscribeToRabbitMQ(callback: (envelope: EventEnvelope<CanonicalOrder>) => Promise<void>) {
    if (!this.channel) {
      await this.initRabbitMQ();
    }

    if (this.isRabbitMqConnected && this.channel) {
      try {
        await this.channel.assertQueue(RABBITMQ_QUEUE, { durable: true });
        console.log(`🐇 [RabbitMQ Consumer] Listening for messages on Queue: ${RABBITMQ_QUEUE}`);

        this.channel.consume(RABBITMQ_QUEUE, async (msg) => {
          if (msg !== null) {
            try {
              const content = msg.content.toString();
              const envelope: EventEnvelope<CanonicalOrder> = JSON.parse(content);
              console.log(`📥 [RabbitMQ Consumer Received] EventID: ${envelope.eventId} | CorrelationID: ${envelope.correlationId}`);
              
              await callback(envelope);
              this.channel?.ack(msg); // Acknowledge message processing
            } catch (err: any) {
              console.error(`❌ [RabbitMQ Consumer Error] ${err.message}`);
              this.channel?.nack(msg, false, false); // Send to Dead-Letter Queue / reject
            }
          }
        });
      } catch (err: any) {
        console.error(`⚠️ [RabbitMQ Consumer Setup Error] ${err.message}`);
      }
    }
  }

  async publish(envelope: EventEnvelope<CanonicalOrder>) {
    console.log(`[Event Bus Published] EventID: ${envelope.eventId} | Topic: ${envelope.eventType}`);

    // 1. Publish to RabbitMQ AMQP Queue
    if (this.isRabbitMqConnected && this.channel) {
      try {
        const messageBuffer = Buffer.from(JSON.stringify(envelope));
        this.channel.sendToQueue(RABBITMQ_QUEUE, messageBuffer, { persistent: true });
        console.log(`🐇 [RabbitMQ AMQP Published] Queue: ${RABBITMQ_QUEUE} | EventID: ${envelope.eventId}`);
      } catch (err: any) {
        console.error(`⚠️ RabbitMQ Publish Error: ${err.message}`);
      }
    }

    // 2. Notify local in-memory listeners
    this.listeners.forEach((listener) => listener(envelope));

    // 3. Fallback HTTP event dispatch to order-service (Port 3002)
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
      // Order service HTTP might be offline or initializing
    }
  }
}

export const GlobalOrderEventBus = new OrderEventBus();
