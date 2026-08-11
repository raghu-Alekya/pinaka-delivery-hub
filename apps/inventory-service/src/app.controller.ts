import { Controller, Get, Post, Patch, Param, Body, NotFoundException } from '@nestjs/common';
import { GlobalOrderEventBus } from '@pinaka-delivery-hub/messaging';
import { InventoryRepository } from './inventory.repository';

const inventoryRepository = new InventoryRepository();
inventoryRepository.onModuleInit();

// Listen to order events for automatic stock deduction
GlobalOrderEventBus.subscribe(async (envelope: any) => {
  await inventoryRepository.deductStockForOrder(envelope);
});

GlobalOrderEventBus.subscribeToRabbitMQ(async (envelope: any) => {
  await inventoryRepository.deductStockForOrder(envelope);
});

@Controller('api/v1/inventory')
export class AppController {
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: 'inventory-service',
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
  async getInventoryByMerchant(@Param('merchantId') merchantId: string) {
    const items = await inventoryRepository.getInventoryByMerchant(merchantId);
    const lowStockItems = items.filter((i) => i.isLowStock);

    return {
      success: true,
      merchantId,
      totalItems: items.length,
      lowStockCount: lowStockItems.length,
      inventory: items,
    };
  }

  @Patch(':merchantId/items/:ingredientId')
  async updateStock(
    @Param('merchantId') merchantId: string,
    @Param('ingredientId') ingredientId: string,
    @Body('currentStock') currentStock: number
  ) {
    const updated = await inventoryRepository.updateStock(merchantId, ingredientId, currentStock);
    if (!updated) {
      throw new NotFoundException(`Ingredient '${ingredientId}' for merchant '${merchantId}' not found`);
    }

    return {
      success: true,
      message: `Stock updated for ${updated.name} to ${updated.currentStock} ${updated.unit}`,
      item: updated,
    };
  }

  @Post('events')
  async handleOrderEvent(@Body() envelope: any) {
    const result = await inventoryRepository.deductStockForOrder(envelope);
    return {
      success: true,
      deductedItems: result.deductedItems,
      lowStockAlerts: result.lowStockAlerts,
    };
  }
}
