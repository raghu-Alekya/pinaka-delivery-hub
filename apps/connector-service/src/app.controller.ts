import { Controller, Get, Post, Body, Headers } from '@nestjs/common';
import { CanonicalOrder, OrderStatus, PlatformSource } from '@pinaka-delivery-hub/canonical-model';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { GlobalOrderEventBus } from '@pinaka-delivery-hub/messaging';

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
    const activeCorrelationId = correlationId || `corr_${crypto.randomUUID()}`;
    console.log(`[DoorDash Webhook Received] CorrelationID: ${activeCorrelationId}`);

    // Transform raw DoorDash payload to CanonicalOrder model
    const canonicalOrder: CanonicalOrder = {
      id: `ord_${crypto.randomUUID()}`,
      merchantId: body.store_id || 'STORE-DOORDASH-01',
      externalOrderId: String(body.order_id || body.id || `DD-${Date.now()}`),
      platform: PlatformSource.DOORDASH,
      status: OrderStatus.CREATED,
      customer: {
        fullName: body.customer?.name || 'DoorDash Customer',
        phone: body.customer?.phone || '+1000000000',
        email: body.customer?.email
      },
      items: (body.items || []).map((item: any, idx: number) => ({
        id: `item_${idx + 1}`,
        externalItemId: String(item.id || item.item_id || `ITEM-${idx}`),
        name: item.name || 'DoorDash Item',
        quantity: Number(item.quantity || item.qty || 1),
        unitPrice: Number(item.price || item.unit_price || 0)
      })),
      subtotal: Number(body.subtotal || body.total || 0),
      tax: Number(body.tax || 0),
      deliveryFee: Number(body.delivery_fee || 0),
      totalAmount: Number(body.total || body.total_amount || 0),
      deliveryAddress: {
        street: body.delivery_address?.street || '123 Main St',
        city: body.delivery_address?.city || 'Metropolis',
        zipCode: body.delivery_address?.zip_code || '10001'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Wrap in EventEnvelope
    const envelope: EventEnvelope<CanonicalOrder> = {
      eventId: `evt_${crypto.randomUUID()}`,
      eventType: 'ORDER_RECEIVED',
      source: 'connector-service',
      timestamp: new Date().toISOString(),
      correlationId: activeCorrelationId,
      version: '1.0.0',
      payload: canonicalOrder
    };

    // Await event publication to order-service
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
    const activeCorrelationId = correlationId || `corr_${crypto.randomUUID()}`;
    console.log(`[Swiggy Webhook Received] CorrelationID: ${activeCorrelationId}`);

    // Transform raw Swiggy payload to CanonicalOrder model
    const canonicalOrder: CanonicalOrder = {
      id: `ord_${crypto.randomUUID()}`,
      merchantId: body.restaurant_id || 'RESTAURANT-SWIGGY-01',
      externalOrderId: String(body.swiggy_order_id || body.order_id || `SW-${Date.now()}`),
      platform: PlatformSource.SWIGGY,
      status: OrderStatus.CREATED,
      customer: {
        fullName: body.customer_details?.name || 'Swiggy Customer',
        phone: body.customer_details?.mobile || '+910000000000'
      },
      items: (body.cart?.items || body.items || []).map((item: any, idx: number) => ({
        id: `item_${idx + 1}`,
        externalItemId: String(item.item_id || `ITEM-${idx}`),
        name: item.name || item.title || 'Swiggy Dish',
        quantity: Number(item.quantity || 1),
        unitPrice: Number(item.price || item.total_price || 0)
      })),
      subtotal: Number(body.bill_subtotal || body.subtotal || 0),
      tax: Number(body.tax_amount || 0),
      deliveryFee: Number(body.delivery_charges || 0),
      totalAmount: Number(body.final_bill || body.total || 0),
      deliveryAddress: {
        street: body.delivery_address?.address_line_1 || '45 MG Road',
        city: body.delivery_address?.city || 'Bengaluru',
        zipCode: body.delivery_address?.pincode || '560001'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Wrap in EventEnvelope
    const envelope: EventEnvelope<CanonicalOrder> = {
      eventId: `evt_${crypto.randomUUID()}`,
      eventType: 'ORDER_RECEIVED',
      source: 'connector-service',
      timestamp: new Date().toISOString(),
      correlationId: activeCorrelationId,
      version: '1.0.0',
      payload: canonicalOrder
    };

    // Await event publication to order-service
    await GlobalOrderEventBus.publish(envelope);

    return {
      success: true,
      orderId: canonicalOrder.id,
      envelope,
      canonicalOrder
    };
  }
}
