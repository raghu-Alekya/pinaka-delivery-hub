import { Controller, Get, Post, Patch, Param, Body, NotFoundException, UsePipes, ValidationPipe } from '@nestjs/common';
import { CanonicalOrder } from '@pinaka-delivery-hub/canonical-model';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { GlobalOrderEventBus } from '@pinaka-delivery-hub/messaging';
import { UpdateOrderStatusDto } from '@pinaka-delivery-hub/validation';

// In-Memory Database Store for order domain
const orderDatabase: CanonicalOrder[] = [];

function saveOrderToDb(envelope: EventEnvelope<CanonicalOrder>) {
  if (!envelope || !envelope.payload) return;

  console.log(`[Order Service Received Event] CorrelationID: ${envelope.correlationId}`);
  console.log(`📥 Ingested Order #${envelope.payload.externalOrderId} from ${envelope.payload.platform}`);

  const existingIdx = orderDatabase.findIndex((o) => o.id === envelope.payload.id);
  if (existingIdx >= 0) {
    orderDatabase[existingIdx] = envelope.payload;
  } else {
    orderDatabase.unshift(envelope.payload);
  }
}

GlobalOrderEventBus.subscribe((envelope: EventEnvelope<CanonicalOrder>) => {
  saveOrderToDb(envelope);
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

  @Post('events')
  handleOrderEvent(@Body() envelope: any) {
    saveOrderToDb(envelope as EventEnvelope<CanonicalOrder>);
    return { success: true };
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
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  updateOrderStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto
  ) {
    const order = orderDatabase.find((o) => o.id === id || o.externalOrderId === id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    order.status = dto.status;
    order.updatedAt = new Date().toISOString();

    console.log(`[Order Service Status Update] Order #${order.externalOrderId} -> Status: ${dto.status}`);

    return {
      success: true,
      message: `Order status updated to ${dto.status}`,
      order,
    };
  }
}
