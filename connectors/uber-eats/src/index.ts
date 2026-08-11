import { PlatformSource } from '@pinaka-delivery-hub/canonical-model';
import { JsonFoodDeliveryConnector } from '@pinaka-delivery-hub/connector-sdk';

export class UberEatsConnector extends JsonFoodDeliveryConnector {
  constructor() {
    super({
      descriptor: { id: 'uber-eats', displayName: 'Uber Eats', platform: PlatformSource.UBER_EATS, version: '1.0.0' },
      orderIdFields: ['order.id', 'order_id', 'orderId', 'id'],
      merchantIdFields: ['store.id', 'store_id', 'merchant_id'],
      totalFields: ['payment.charges.total', 'total', 'total_amount'],
      itemsFields: ['cart.items', 'items', 'order.items'],
      itemNameFields: ['title', 'name'],
      itemQuantityFields: ['quantity', 'qty'],
      itemPriceFields: ['price.unit_price', 'price', 'unit_price'],
    });
  }
}

/** @deprecated Use UberEatsConnector. */
export interface ubereatsConnector { name: 'uber-eats'; }
