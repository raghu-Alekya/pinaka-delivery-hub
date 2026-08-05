import { Controller, Get, Patch, Param, Body, NotFoundException } from '@nestjs/common';
import { CanonicalOrder, OrderStatus } from '@pinaka-delivery-hub/canonical-model';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { GlobalOrderEventBus } from '@pinaka-delivery-hub/messaging';

// In-Memory Database Store for order domain
const orderDatabase: CanonicalOrder[] = [];

// Subscribe order-service to Global Event Bus on module load
GlobalOrderEventBus.subscribe((envelope: EventEnvelope<CanonicalOrder>) => {
  console.log(`[Order Service Received Event] CorrelationID: ${envelope.correlationId}`);
  console.log(`📥 Ingested Order #${envelope.payload.externalOrderId} from ${envelope.payload.platform}`);

  // Store or update order in database
  const existingIdx = orderDatabase.findIndex((o) => o.id === envelope.payload.id);
  if (existingIdx >= 0) {
    orderDatabase[existingIdx] = envelope.payload;
  } else {
    orderDatabase.unshift(envelope.payload);
  }
});

@Controller('api/v1/orders')
export class AppController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'order-service',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  readiness() {
    return {
      status: 'ready',
    };
  }

  @Get()
  getAllOrders() {
    return {
      success: true,
      count: orderDatabase.length,
      orders: orderDatabase,
    };
  }

  @Get(':id')
  getOrderById(@Param('id') id: string) {
    const order = orderDatabase.find((o) => o.id === id || o.externalOrderId === id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }
    return {
      success: true,
      order,
    };
  }

  @Patch(':id/status')
  updateOrderStatus(
    @Param('id') id: string,
    @Body('status') newStatus: OrderStatus
  ) {
    const order = orderDatabase.find((o) => o.id === id || o.externalOrderId === id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    order.status = newStatus;
    order.updatedAt = new Date().toISOString();

    console.log(`[Order Service Status Update] Order #${order.externalOrderId} -> Status: ${newStatus}`);

    return {
      success: true,
      message: `Order status updated to ${newStatus}`,
      order,
    };
  }
}
