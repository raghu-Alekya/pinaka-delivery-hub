import { PlatformSource } from '@pinaka-delivery-hub/canonical-model';
import { JsonFoodDeliveryConnector } from '@pinaka-delivery-hub/connector-sdk';

export class DoorDashConnector extends JsonFoodDeliveryConnector {
  constructor() {
    super({
      descriptor: { id: 'doordash', displayName: 'DoorDash', platform: PlatformSource.DOORDASH, version: '1.0.0' },
      orderIdFields: ['order_id', 'orderId', 'id'],
      merchantIdFields: ['store_id', 'storeId', 'merchant_id'],
      totalFields: ['total', 'total_amount', 'pricing.total'],
      itemsFields: ['items', 'order.items'],
      itemNameFields: ['name', 'title'],
      itemQuantityFields: ['qty', 'quantity'],
      itemPriceFields: ['price', 'unit_price'],
    });
  }
}

/** @deprecated Use DoorDashConnector. */
export interface doordashConnector { name: 'doordash'; }
