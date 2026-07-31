export interface PlatformConnector { platformName: string; fetchOrders(): Promise<unknown[]>; acknowledgeOrder(orderId: string): Promise<boolean>; }
