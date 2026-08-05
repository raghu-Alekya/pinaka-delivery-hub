import { Controller, Get, Post, Body, Headers, UsePipes, ValidationPipe } from '@nestjs/common';
import { CanonicalOrder, OrderStatus, PlatformSource } from '@pinaka-delivery-hub/canonical-model';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { GlobalOrderEventBus } from '@pinaka-delivery-hub/messaging';
import { CreateDoorDashOrderDto, CreateSwiggyOrderDto } from '@pinaka-delivery-hub/validation';

@Controller('api/v1/connectors')
export class AppController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'connector-service',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  readiness() {
    return {
      status: 'ready',
    };
  }

  @Post('doordash/webhook')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async handleDoorDashWebhook(
    @Body() body: CreateDoorDashOrderDto,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const activeCorrelationId = correlationId || `corr_${crypto.randomUUID()}`;
    console.log(`[DoorDash Webhook Received] CorrelationID: ${activeCorrelationId}`);

    // Transform validated DoorDash DTO to CanonicalOrder model
    const canonicalOrder: CanonicalOrder = {
      id: `ord_${crypto.randomUUID()}`,
      merchantId: body.store_id,
      externalOrderId: String(body.order_id),
      platform: PlatformSource.DOORDASH,
      status: OrderStatus.CREATED,
      customer: {
        fullName: 'DoorDash Customer',
        phone: '+1000000000',
      },
      items: body.items.map((item: any, idx: number) => ({
        id: `item_${idx + 1}`,
        externalItemId: `ITEM-${idx}`,
        name: item.name,
        quantity: Number(item.qty),
        unitPrice: Number(item.price)
      })),
      subtotal: Number(body.total),
      tax: 0,
      deliveryFee: 0,
      totalAmount: Number(body.total),
      deliveryAddress: {
        street: '123 Main St',
        city: 'Metropolis',
        zipCode: '10001'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const envelope: EventEnvelope<CanonicalOrder> = {
      eventId: `evt_${crypto.randomUUID()}`,
      eventType: 'ORDER_RECEIVED',
      source: 'connector-service',
      timestamp: new Date().toISOString(),
      correlationId: activeCorrelationId,
      version: '1.0.0',
      payload: canonicalOrder
    };

    await GlobalOrderEventBus.publish(envelope);

    return {
      success: true,
      orderId: canonicalOrder.id,
      envelope,
      canonicalOrder
    };
  }

  @Post('swiggy/webhook')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async handleSwiggyWebhook(
    @Body() body: CreateSwiggyOrderDto,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const activeCorrelationId = correlationId || `corr_${crypto.randomUUID()}`;
    console.log(`[Swiggy Webhook Received] CorrelationID: ${activeCorrelationId}`);

    const canonicalOrder: CanonicalOrder = {
      id: `ord_${crypto.randomUUID()}`,
      merchantId: body.restaurant_id,
      externalOrderId: String(body.swiggy_order_id),
      platform: PlatformSource.SWIGGY,
      status: OrderStatus.CREATED,
      customer: {
        fullName: 'Swiggy Customer',
        phone: '+910000000000'
      },
      items: (body.cart?.items || []).map((item: any, idx: number) => ({
        id: `item_${idx + 1}`,
        externalItemId: `ITEM-${idx}`,
        name: item.title,
        quantity: Number(item.quantity),
        unitPrice: Number(item.price)
      })),
      subtotal: Number(body.final_bill),
      tax: 0,
      deliveryFee: 0,
      totalAmount: Number(body.final_bill),
      deliveryAddress: {
        street: '45 MG Road',
        city: 'Bengaluru',
        zipCode: '560001'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const envelope: EventEnvelope<CanonicalOrder> = {
      eventId: `evt_${crypto.randomUUID()}`,
      eventType: 'ORDER_RECEIVED',
      source: 'connector-service',
      timestamp: new Date().toISOString(),
      correlationId: activeCorrelationId,
      version: '1.0.0',
      payload: canonicalOrder
    };

    await GlobalOrderEventBus.publish(envelope);

    return {
      success: true,
      orderId: canonicalOrder.id,
      envelope,
      canonicalOrder
    };
  }
}
