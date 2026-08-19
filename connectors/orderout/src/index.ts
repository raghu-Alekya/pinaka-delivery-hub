import { PlatformSource } from '@pinaka-delivery-hub/canonical-model';
import { JsonFoodDeliveryConnector } from '@pinaka-delivery-hub/connector-sdk';

export class OrderOutConnector extends JsonFoodDeliveryConnector {
  constructor() {
    super({
      descriptor: {
        id: 'orderout',
        displayName: 'OrderOut',
        platform: PlatformSource.ORDEROUT,
        version: '1.0.0',
      },
      orderIdFields: ['order_id', 'orderId', 'id', 'number', 'source.orderNumber', 'source.externalReferenceId', 'order_number', 'reference_id'],
      merchantIdFields: ['store_id', 'storeId', 'merchant_id', 'destination.externalRestaurantId', 'destination.restaurantId', 'location_id'],
      totalFields: ['total', 'total_amount', 'pricing.total', 'payload.order.total', 'subtotal'],
      itemsFields: ['items', 'order.items', 'payload.order.items', 'line_items', 'order_items'],
      itemNameFields: ['name', 'title', 'item_name'],
      itemQuantityFields: ['qty', 'quantity'],
      itemPriceFields: ['price', 'unit_price'],
    });
  }
}

/** @deprecated Use OrderOutConnector. */
export interface orderoutConnector { name: 'orderout'; }
