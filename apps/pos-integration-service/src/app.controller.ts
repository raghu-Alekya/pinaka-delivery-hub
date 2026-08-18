import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { GlobalOrderEventBus } from '@pinaka-delivery-hub/messaging';
import { PosRepository } from './pos.repository';

const posRepository = new PosRepository();
posRepository.onModuleInit();

// Listen to incoming order events to automatically push to live POS portal
GlobalOrderEventBus.subscribe(async (envelope: any) => {
  await posRepository.syncOrderToLivePOS(envelope);
});

GlobalOrderEventBus.subscribeToRabbitMQ(async (envelope: any) => {
  await posRepository.syncOrderToLivePOS(envelope);
});

@Controller('api/v1/pos')
export class AppController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'pos-integration-service',
      targetPosUrl: 'https://merchantrestaurant.alektasolutions.com/',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  readiness() {
    return {
      status: 'ready',
    };
  }

  @Get('orders/pending')
  async getPendingPosOrders(@Query('merchantId') merchantId?: string) {
    const activeMerchantId = merchantId || 'Pinaka_013';
    const logs = await posRepository.getPendingPosOrders(activeMerchantId);
    return {
      success: true,
      merchantId: activeMerchantId,
      targetPosUrl: 'https://merchantrestaurant.alektasolutions.com/',
      count: logs.length,
      orders: logs,
    };
  }

  @Post('events')
  async handleOrderEvent(@Body() envelope: any) {
    const log = await posRepository.syncOrderToLivePOS(envelope);
    return {
      success: true,
      logId: log.id,
      merchantId: log.merchantId,
      externalOrderId: log.externalOrderId,
      status: log.status,
      targetUrl: log.posTargetUrl,
    };
  }

  @Post('sync')
  async manualPosSync(@Body() envelope: any) {
    const log = await posRepository.syncOrderToLivePOS(envelope);
    return {
      success: true,
      message: `Order #${log.externalOrderId} dispatched to live POS (${log.posTargetUrl})`,
      log,
    };
  }
}
