export enum OrderStatus {
  CREATED = 'CREATED',
  ACCEPTED = 'ACCEPTED',
  IN_KITCHEN = 'IN_KITCHEN',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum PlatformSource {
  DOORDASH = 'DOORDASH',
  UBER_EATS = 'UBER_EATS',
  GRUBHUB = 'GRUBHUB',
  SWIGGY = 'SWIGGY',
  ZOMATO = 'ZOMATO',
  WOOCOMMERCE = 'WOOCOMMERCE',
}

export interface OrderCustomer {
  id?: string;
  fullName: string;
  phone: string;
  email?: string;
}

export interface OrderItem {
  id: string;
  externalItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  options?: Array<{ name: string; value: string; price: number }>;
}

export interface CanonicalOrder {
  id: string;
  merchantId: string;
  externalOrderId: string;
  platform: PlatformSource;
  status: OrderStatus;
  customer: OrderCustomer;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  totalAmount: number;
  deliveryAddress: {
    street: string;
    city: string;
    zipCode: string;
    coordinates?: { latitude: number; longitude: number };
  };
  createdAt: string;
  updatedAt: string;
}

export interface CanonicalValidationResult {
  valid: boolean;
  errors: string[];
}

/** Runtime validation for orders after a connector has normalized its payload. */
export function validateCanonicalOrder(order: CanonicalOrder): CanonicalValidationResult {
  const errors: string[] = [];
  const requiredText = (value: unknown, path: string) => {
    if (typeof value !== 'string' || value.trim().length === 0) errors.push(`${path} is required`);
  };
  const nonNegativeNumber = (value: unknown, path: string) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) errors.push(`${path} must be a number`);
    else if (value < 0) errors.push(`${path} must be at least 0`);
  };

  requiredText(order.id, 'id');
  requiredText(order.merchantId, 'merchantId');
  requiredText(order.externalOrderId, 'externalOrderId');
  if (!Object.values(PlatformSource).includes(order.platform)) errors.push('platform is invalid');
  if (!Object.values(OrderStatus).includes(order.status)) errors.push('status is invalid');
  requiredText(order.customer?.fullName, 'customer.fullName');
  requiredText(order.customer?.phone, 'customer.phone');

  if (!Array.isArray(order.items) || order.items.length === 0) {
    errors.push('items must contain at least one item');
  } else {
    order.items.forEach((item, index) => {
      requiredText(item?.id, `items[${index}].id`);
      requiredText(item?.externalItemId, `items[${index}].externalItemId`);
      requiredText(item?.name, `items[${index}].name`);
      if (typeof item?.quantity !== 'number' || !Number.isInteger(item.quantity)) {
        errors.push(`items[${index}].quantity must be an integer`);
      } else if (item.quantity < 1) {
        errors.push(`items[${index}].quantity must be at least 1`);
      }
      nonNegativeNumber(item?.unitPrice, `items[${index}].unitPrice`);
    });
  }

  nonNegativeNumber(order.subtotal, 'subtotal');
  nonNegativeNumber(order.tax, 'tax');
  nonNegativeNumber(order.deliveryFee, 'deliveryFee');
  nonNegativeNumber(order.totalAmount, 'totalAmount');
  requiredText(order.deliveryAddress?.street, 'deliveryAddress.street');
  requiredText(order.deliveryAddress?.city, 'deliveryAddress.city');
  requiredText(order.deliveryAddress?.zipCode, 'deliveryAddress.zipCode');
  requiredText(order.createdAt, 'createdAt');
  requiredText(order.updatedAt, 'updatedAt');

  return { valid: errors.length === 0, errors };
}
