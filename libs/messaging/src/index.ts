import { CanonicalOrder } from '@pinaka-delivery-hub/canonical-model';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import * as amqp from 'amqplib';

export const RABBITMQ_QUEUE = 'pdh_orders_queue';
export const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

export interface MessagePublisher {
  publish(topic: string, message: unknown): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class OrderEventBus {
  private channel?: amqp.Channel;
  private connectionPromise?: Promise<void>;
  private isRabbitMqConnected = false;
  private consumerStarted = false;
  private readonly listeners: Array<(envelope: EventEnvelope<CanonicalOrder>) => void> = [];

  constructor() {
    void this.initRabbitMQ();
  }

  private initRabbitMQ(): Promise<void> {
    if (this.isRabbitMqConnected && this.channel) return Promise.resolve();
    if (this.connectionPromise) return this.connectionPromise;

    this.connectionPromise = this.connectRabbitMQ().finally(() => {
      this.connectionPromise = undefined;
    });
    return this.connectionPromise;
  }

  private async connectRabbitMQ(): Promise<void> {
    try {
      const connection = await amqp.connect(RABBITMQ_URL);
      const channel = await connection.createChannel();
      await channel.assertQueue(RABBITMQ_QUEUE, { durable: true });

      this.channel = channel;
      this.isRabbitMqConnected = true;

      connection.on('close', () => this.markRabbitMqDisconnected('connection closed'));
      connection.on('error', (error: unknown) => {
        console.error(`[RabbitMQ AMQP] Connection error: ${errorMessage(error)}`);
      });
      channel.on('close', () => this.markRabbitMqDisconnected('channel closed'));
      channel.on('error', (error: unknown) => {
        console.error(`[RabbitMQ AMQP] Channel error: ${errorMessage(error)}`);
      });

      console.log(`[RabbitMQ AMQP] Connected successfully to Queue: ${RABBITMQ_QUEUE} (${RABBITMQ_URL})`);
    } catch (error) {
      this.markRabbitMqDisconnected();
      console.warn(`[RabbitMQ AMQP] Offline (${errorMessage(error)}). Using HTTP/In-Memory Event Bus.`);
    }
  }

  private markRabbitMqDisconnected(reason?: string): void {
    const wasConnected = this.isRabbitMqConnected;
    this.isRabbitMqConnected = false;
    this.channel = undefined;
    this.consumerStarted = false;
    if (reason && wasConnected) console.warn(`[RabbitMQ AMQP] Disconnected: ${reason}`);
  }

  subscribe(listener: (envelope: EventEnvelope<CanonicalOrder>) => void): void {
    this.listeners.push(listener);
  }

  async subscribeToRabbitMQ(callback: (envelope: EventEnvelope<CanonicalOrder>) => Promise<void>): Promise<void> {
    await this.initRabbitMQ();
    if (!this.isRabbitMqConnected || !this.channel || this.consumerStarted) return;

    try {
      await this.channel.assertQueue(RABBITMQ_QUEUE, { durable: true });
      await this.channel.consume(RABBITMQ_QUEUE, async (message) => {
        if (!message) return;
        try {
          const envelope = JSON.parse(message.content.toString()) as EventEnvelope<CanonicalOrder>;
          console.log(`[RabbitMQ Consumer Received] EventID: ${envelope.eventId} | CorrelationID: ${envelope.correlationId}`);
          await callback(envelope);
          this.channel?.ack(message);
        } catch (error) {
          console.error(`[RabbitMQ Consumer Error] ${errorMessage(error)}`);
          this.channel?.nack(message, false, false);
        }
      });
      this.consumerStarted = true;
      console.log(`[RabbitMQ Consumer] Listening for messages on Queue: ${RABBITMQ_QUEUE}`);
    } catch (error) {
      this.consumerStarted = false;
      console.error(`[RabbitMQ Consumer Setup Error] ${errorMessage(error)}`);
    }
  }

  async publish(envelope: EventEnvelope<CanonicalOrder>): Promise<void> {
    console.log(`[Event Bus Published] EventID: ${envelope.eventId} | Topic: ${envelope.eventType}`);
    await this.initRabbitMQ();

    this.publishToRabbitMQ(envelope);
    this.listeners.forEach((listener) => listener(envelope));

    // Dispatch to HTTP targets so all active microservices (order, inventory, analytics) receive the event
    await this.publishThroughHttpFallback(envelope);
  }

  private publishToRabbitMQ(envelope: EventEnvelope<CanonicalOrder>): boolean {
    if (!this.isRabbitMqConnected || !this.channel) return false;
    try {
      this.channel.sendToQueue(RABBITMQ_QUEUE, Buffer.from(JSON.stringify(envelope)), { persistent: true });
      console.log(`[RabbitMQ AMQP Published] Queue: ${RABBITMQ_QUEUE} | EventID: ${envelope.eventId}`);
      return true;
    } catch (error) {
      console.error(`[RabbitMQ Publish Error] ${errorMessage(error)}`);
      this.markRabbitMqDisconnected('publish failed');
      return false;
    }
  }

  private async publishThroughHttpFallback(envelope: EventEnvelope<CanonicalOrder>): Promise<void> {
    const targets = [
      'http://localhost:3002/api/v1/orders/events',
      'http://localhost:3005/api/v1/inventory/events',
      'http://localhost:3006/api/v1/analytics/events',
    ];
    for (const url of targets) {
      try {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-correlation-id': envelope.correlationId },
          body: JSON.stringify(envelope),
        });
      } catch {
        // Service might be offline or initializing
      }
    }
  }
}

export const GlobalOrderEventBus = new OrderEventBus();
