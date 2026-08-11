import { Controller, Get, Post, Param, Body, NotFoundException } from '@nestjs/common';
import { GlobalOrderEventBus } from '@pinaka-delivery-hub/messaging';
import { AnalyticsRepository } from './analytics.repository';

const analyticsRepository = new AnalyticsRepository();
analyticsRepository.onModuleInit();

// Listen to incoming order events to automatically increment revenue and platform breakdown
GlobalOrderEventBus.subscribe(async (envelope: any) => {
  await analyticsRepository.recordOrderEvent(envelope);
});

GlobalOrderEventBus.subscribeToRabbitMQ(async (envelope: any) => {
  await analyticsRepository.recordOrderEvent(envelope);
});

@Controller('api/v1/analytics')
export class AppController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'analytics-service',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  readiness() {
    return {
      status: 'ready',
    };
  }

  @Get(':merchantId')
  async getAnalyticsByMerchant(@Param('merchantId') merchantId: string) {
    const snapshot = await analyticsRepository.getAnalyticsByMerchant(merchantId);
    if (!snapshot) {
      throw new NotFoundException(`Analytics metrics for merchant '${merchantId}' not found`);
    }

    return {
      success: true,
      merchantId,
      metrics: {
        totalRevenue: Number(snapshot.totalRevenue),
        totalOrders: Number(snapshot.totalOrders),
        averageOrderValue: Number(snapshot.averageOrderValue),
        platformBreakdown: snapshot.platformBreakdown,
        statusBreakdown: snapshot.statusBreakdown,
        lastUpdated: snapshot.updatedAt,
      },
    };
  }

  @Post('events')
  async handleOrderEvent(@Body() envelope: any) {
    const updated = await analyticsRepository.recordOrderEvent(envelope);
    return {
      success: true,
      merchantId: updated.merchantId,
      totalRevenue: Number(updated.totalRevenue),
      totalOrders: Number(updated.totalOrders),
      averageOrderValue: Number(updated.averageOrderValue),
    };
  }
}
