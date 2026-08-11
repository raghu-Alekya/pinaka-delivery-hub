import { PlatformSource } from '@pinaka-delivery-hub/canonical-model';
import { JsonFoodDeliveryConnector } from '@pinaka-delivery-hub/connector-sdk';

export class GrubhubConnector extends JsonFoodDeliveryConnector {
  constructor() {
    super({
      descriptor: { id: 'grubhub', displayName: 'Grubhub', platform: PlatformSource.GRUBHUB, version: '1.0.0' },
      orderIdFields: ['order_id', 'orderId', 'id'],
      merchantIdFields: ['restaurant_id', 'restaurantId', 'merchant_id'],
      totalFields: ['total', 'total_amount', 'charges.total'],
      itemsFields: ['items', 'order.items'],
      itemNameFields: ['name', 'title'],
      itemQuantityFields: ['quantity', 'qty'],
      itemPriceFields: ['price', 'unit_price'],
    });
  }
}

/** @deprecated Use GrubhubConnector. */
export interface grubhubConnector { name: 'grubhub'; }
