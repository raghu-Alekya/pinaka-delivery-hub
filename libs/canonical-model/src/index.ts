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
