export enum OrderStatus {
  CREATED = 'CREATED',
  ACCEPTED = 'ACCEPTED',
  IN_KITCHEN = 'IN_KITCHEN',
  READY_FOR_PICKUP = 'READY_FOR_PICKUP',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum RetailOrderStatus {
  CREATED = 'CREATED',
  ACCEPTED = 'ACCEPTED',
  PICKING_IN_PROGRESS = 'PICKING_IN_PROGRESS',
  AWAITING_SUBSTITUTION_APPROVAL = 'AWAITING_SUBSTITUTION_APPROVAL',
  PACKED_STAGED = 'PACKED_STAGED',
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
  ORDEROUT = 'ORDEROUT',
  // Retail & Grocery Extensions (PCH)
  INSTACART = 'INSTACART',
  DOORDASH_GROCERY = 'DOORDASH_GROCERY',
  UBER_CONVENIENCE = 'UBER_CONVENIENCE',
  BLINKIT = 'BLINKIT',
  ZEPTO = 'ZEPTO',
  SHOPIFY = 'SHOPIFY',
  PINAKA_POS = 'PINAKA_POS',
}

export enum TemperatureZone {
  AMBIENT = 'AMBIENT',
  CHILLED = 'CHILLED',
  FROZEN = 'FROZEN',
  HAZMAT_ALCOHOL = 'HAZMAT_ALCOHOL',
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

export interface RetailOrderItem {
  id: string;
  sku: string;
  upcBarCode: string;
  name: string;
  quantityRequested: number;
  quantityPicked: number;
  isWeightBased: boolean;
  unitOfMeasure?: 'KG' | 'GRAM' | 'LB' | 'OZ' | 'UNIT';
  estimatedWeight?: number;
  actualWeight?: number;
  unitPrice: number;
  totalPrice: number;
  temperatureZone: TemperatureZone;
  aisleLocation?: { aisle: string; shelf: string; bin: string };
  substitutionAllowed: boolean;
  substitutedWithItem?: {
    sku: string;
    name: string;
    upcBarCode: string;
    quantity: number;
    unitPrice: number;
  };
  itemStatus: 'PENDING' | 'PICKED' | 'SUBSTITUTED' | 'OUT_OF_STOCK' | 'REFUNDED';
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

export interface CanonicalRetailOrder {
  id: string;
  merchantId: string;
  storeId: string;
  externalOrderId: string;
  platform: PlatformSource;
  status: RetailOrderStatus;
  customer: OrderCustomer;
  items: RetailOrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  totalAmount: number;
  deliveryAddress: {
    street: string;
    city: string;
    zipCode: string;
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

/** Runtime validation for retail & grocery orders. */
export function validateCanonicalRetailOrder(order: CanonicalRetailOrder): CanonicalValidationResult {
  const errors: string[] = [];
  const requiredText = (value: unknown, path: string) => {
    if (typeof value !== 'string' || value.trim().length === 0) errors.push(`${path} is required`);
  };

  requiredText(order.id, 'id');
  requiredText(order.merchantId, 'merchantId');
  requiredText(order.storeId, 'storeId');
  requiredText(order.externalOrderId, 'externalOrderId');
  if (!Object.values(PlatformSource).includes(order.platform)) errors.push('platform is invalid');
  if (!Object.values(RetailOrderStatus).includes(order.status)) errors.push('status is invalid');

  if (!Array.isArray(order.items) || order.items.length === 0) {
    errors.push('items must contain at least one item');
  }

  return { valid: errors.length === 0, errors };
}

