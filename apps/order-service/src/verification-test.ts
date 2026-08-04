import { CanonicalOrder, OrderStatus, PlatformSource } from '@pdh/canonical-model';
import { EventEnvelope } from '@pdh/event-contracts';
import { BaseConnector, ConnectorResponse } from '@pdh/connector-sdk';

export class MockConnector extends BaseConnector {
  readonly platform = PlatformSource.SWIGGY;

  parseWebhookPayload(rawBody: any): CanonicalOrder {
    return {
      id: 'ord-123',
      merchantId: 'merch-001',
      externalOrderId: rawBody.order_id || 'ext-456',
      platform: PlatformSource.SWIGGY,
      status: OrderStatus.CREATED,
      customer: {
        fullName: 'John Doe',
        phone: '+1234567890'
      },
      items: [
        {
          id: 'item-1',
          externalItemId: 'ext-item-1',
          name: 'Burger',
          quantity: 1,
          unitPrice: 15.00
        }
      ],
      subtotal: 15.00,
      tax: 1.50,
      deliveryFee: 2.00,
      totalAmount: 18.50,
      deliveryAddress: {
        street: '123 Main St',
        city: 'Metropolis',
        zipCode: '10001'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  async updateOrderStatus(externalOrderId: string, status: string): Promise<ConnectorResponse<boolean>> {
    console.log(`Updating order ${externalOrderId} to status ${status}`);
    return { success: true, data: true };
  }
}

export function testImports(): void {
  const connector = new MockConnector();
  const order = connector.parseWebhookPayload({ order_id: 'SW-99' });

  const event: EventEnvelope<CanonicalOrder> = {
    eventId: 'evt-789',
    eventType: 'ORDER_RECEIVED',
    source: 'connector-service',
    timestamp: new Date().toISOString(),
    correlationId: 'corr-001',
    version: '1.0.0',
    payload: order
  };

  console.log('Successfully verified @pdh/* library imports:', { order, event });
}
