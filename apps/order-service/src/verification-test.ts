import { CanonicalOrder } from '@pdh/canonical-model';
import { EventEnvelope } from '@pdh/event-contracts';
import { PlatformConnector } from '@pdh/connector-sdk';

export function testImports() {
  const order: CanonicalOrder = {
    id: 'ord-123',
    storeId: 'store-456',
    platform: 'swiggy',
    status: 'RECEIVED',
    totalAmount: 499.00,
    createdAt: new Date().toISOString()
  };

  const event: EventEnvelope<CanonicalOrder> = {
    eventId: 'evt-789',
    eventType: 'ORDER_CREATED',
    timestamp: new Date().toISOString(),
    payload: order
  };

  console.log('Successfully verified @pdh/* library imports:', { order, event });
}
