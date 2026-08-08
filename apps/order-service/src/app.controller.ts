import { Controller, Get, Post, Patch, Param, Body, NotFoundException, ParseEnumPipe } from '@nestjs/common';
import { OrderStatus } from '@pinaka-delivery-hub/canonical-model';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { GlobalOrderEventBus } from '@pinaka-delivery-hub/messaging';
import { OrderRepository } from './order.repository';

// Instantiate OrderRepository instance cleanly for order domain
const orderRepository = new OrderRepository();
orderRepository.onModuleInit();

// Local Event Bus Subscription
GlobalOrderEventBus.subscribe((envelope: EventEnvelope<any>) => {
  orderRepository.saveOrderFromEnvelope(envelope);
});

// RabbitMQ AMQP Queue Consumer Subscription
GlobalOrderEventBus.subscribeToRabbitMQ(async (envelope: EventEnvelope<any>) => {
  await orderRepository.saveOrderFromEnvelope(envelope);
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
  async handleOrderEvent(@Body() envelope: any) {
    const saved = await orderRepository.saveOrderFromEnvelope(envelope);
    return { success: true, order: saved };
  }

  @Get()
  async getAllOrders() {
    const orders = await orderRepository.findAllOrders();
    return {
      success: true,
      count: orders.length,
      orders,
    };
  }

  @Get(':id')
  async getOrderById(@Param('id') id: string) {
    const order = await orderRepository.findOrderById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }
    return {
      success: true,
      order,
    };
  }

  @Patch(':id/status')
  async updateOrderStatus(
    @Param('id') id: string,
    @Body('status', new ParseEnumPipe(OrderStatus)) status: OrderStatus
  ) {
    const updated = await orderRepository.updateOrderStatus(id, status);
    if (!updated) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    console.log(`[Order Service Status Update] Order #${updated.externalOrderId} -> Status: ${status}`);

    return {
      success: true,
      message: `Order status updated to ${status}`,
      order: updated,
    };
  }
}
