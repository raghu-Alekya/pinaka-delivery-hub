import { Controller, Get, Post, Body, Headers, BadRequestException } from '@nestjs/common';
import { CanonicalOrder, OrderStatus, PlatformSource } from '@pinaka-delivery-hub/canonical-model';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { GlobalOrderEventBus } from '@pinaka-delivery-hub/messaging';
import { CreateDoorDashOrderDto, CreateSwiggyOrderDto } from '@pinaka-delivery-hub/validation';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

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
  async handleDoorDashWebhook(
    @Body() body: any,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const dto = plainToInstance(CreateDoorDashOrderDto, body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints || {}));
      throw new BadRequestException({ statusCode: 400, message: messages, error: 'Bad Request' });
    }

    const activeCorrelationId = correlationId || `corr_${crypto.randomUUID()}`;
    console.log(`[DoorDash Webhook Received] CorrelationID: ${activeCorrelationId}`);

    const canonicalOrder: CanonicalOrder = {
      id: `ord_${crypto.randomUUID()}`,
      merchantId: dto.store_id,
      externalOrderId: String(dto.order_id),
      platform: PlatformSource.DOORDASH,
      status: OrderStatus.CREATED,
      customer: {
        fullName: 'DoorDash Customer',
        phone: '+1000000000',
      },
      items: dto.items.map((item: any, idx: number) => ({
        id: `item_${idx + 1}`,
        externalItemId: `ITEM-${idx}`,
        name: item.name,
        quantity: Number(item.qty),
        unitPrice: Number(item.price)
      })),
      subtotal: Number(dto.total),
      tax: 0,
      deliveryFee: 0,
      totalAmount: Number(dto.total),
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
  async handleSwiggyWebhook(
    @Body() body: any,
    @Headers('x-correlation-id') correlationId?: string
  ) {
    const dto = plainToInstance(CreateSwiggyOrderDto, body);
    const errors = await validate(dto);
    if (errors.length > 0) {
      const messages = errors.flatMap((e) => Object.values(e.constraints || {}));
      throw new BadRequestException({ statusCode: 400, message: messages, error: 'Bad Request' });
    }

    const activeCorrelationId = correlationId || `corr_${crypto.randomUUID()}`;
    console.log(`[Swiggy Webhook Received] CorrelationID: ${activeCorrelationId}`);

    const canonicalOrder: CanonicalOrder = {
      id: `ord_${crypto.randomUUID()}`,
      merchantId: dto.restaurant_id,
      externalOrderId: String(dto.swiggy_order_id),
      platform: PlatformSource.SWIGGY,
      status: OrderStatus.CREATED,
      customer: {
        fullName: 'Swiggy Customer',
        phone: '+919652747307'
      },
      items: (dto.cart?.items || []).map((item: any, idx: number) => ({
        id: `item_${idx + 1}`,
        externalItemId: `ITEM-${idx}`,
        name: item.title,
        quantity: Number(item.quantity),
        unitPrice: Number(item.price)
      })),
      subtotal: Number(dto.final_bill),
      tax: 0,
      deliveryFee: 0,
      totalAmount: Number(dto.final_bill),
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
