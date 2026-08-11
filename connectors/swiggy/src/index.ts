import { PlatformSource } from '@pinaka-delivery-hub/canonical-model';
import { JsonFoodDeliveryConnector } from '@pinaka-delivery-hub/connector-sdk';

export class SwiggyConnector extends JsonFoodDeliveryConnector {
  constructor() {
    super({
      descriptor: { id: 'swiggy', displayName: 'Swiggy', platform: PlatformSource.SWIGGY, version: '1.0.0' },
      orderIdFields: ['swiggy_order_id', 'order_id', 'orderId', 'id'],
      merchantIdFields: ['restaurant_id', 'store_id', 'merchant_id'],
      totalFields: ['final_bill', 'total', 'total_amount'],
      itemsFields: ['cart.items', 'items', 'order.items'],
      itemNameFields: ['title', 'name'],
      itemQuantityFields: ['quantity', 'qty'],
      itemPriceFields: ['price', 'unit_price'],
    });
  }
}

/** @deprecated Use SwiggyConnector. */
export interface swiggyConnector { name: 'swiggy'; }
