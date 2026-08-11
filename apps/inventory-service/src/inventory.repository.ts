import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import Redis from 'ioredis';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { CanonicalOrder } from '@pinaka-delivery-hub/canonical-model';
import { InventoryItemEntity } from './entities/inventory.entity';

const CACHE_TTL_SECONDS = 300; // 5 minutes cache TTL

@Injectable()
export class InventoryRepository implements OnModuleInit {
  private dataSource?: DataSource;
  private inventoryRepo?: Repository<InventoryItemEntity>;
  private redisClient?: Redis;
  private isDbConnected = false;
  private isRedisConnected = false;
  private inMemoryStore: InventoryItemEntity[] = [];

  async onModuleInit() {
    // 1. PostgreSQL Connection
    try {
      this.dataSource = new DataSource({
        type: 'postgres',
        host: process.env.POSTGRES_HOST || 'localhost',
        port: Number(process.env.POSTGRES_PORT) || 5432,
        username: process.env.POSTGRES_USER || 'pdh_user',
        password: process.env.POSTGRES_PASSWORD || 'pdh_password',
        database: process.env.POSTGRES_DB || 'pinaka_delivery_hub',
        entities: [InventoryItemEntity],
        synchronize: true,
      });

      await this.dataSource.initialize();
      this.inventoryRepo = this.dataSource.getRepository(InventoryItemEntity);
      this.isDbConnected = true;
      console.log('🐘 [Inventory PostgreSQL] Connected to Database: pinaka_delivery_hub');
      await this.seedDefaultInventory();
    } catch (err: any) {
      console.log(`⚠️ [Inventory PostgreSQL] Offline (${err.message}). Using In-Memory fallback.`);
      this.isDbConnected = false;
      this.seedDefaultInventoryInMemory();
    }

    // 2. Redis Connection
    try {
      this.redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });

      await this.redisClient.connect();
      this.isRedisConnected = true;
      console.log('⚡ [Inventory Redis] Connected to Redis Container on port 6379');
    } catch (err: any) {
      console.log(`⚠️ [Inventory Redis] Offline (${err.message}). Proceeding without cache.`);
      this.isRedisConnected = false;
    }
  }

  private async seedDefaultInventory() {
    if (this.inventoryRepo) {
      const defaultStock = [
        {
          merchantId: 'STORE-01',
          ingredientId: 'ING-01',
          name: 'Beef Patty 100g',
          currentStock: 50,
          reorderThreshold: 10,
          unit: 'pcs',
          isLowStock: false,
          recipeMappings: [{ externalItemId: 'ITEM-101', quantityRequired: 1 }],
        },
        {
          merchantId: 'STORE-01',
          ingredientId: 'ING-02',
          name: 'Burger Bun',
          currentStock: 60,
          reorderThreshold: 15,
          unit: 'pcs',
          isLowStock: false,
          recipeMappings: [{ externalItemId: 'ITEM-101', quantityRequired: 1 }],
        },
        {
          merchantId: 'STORE-01',
          ingredientId: 'ING-03',
          name: 'Truffle Oil Batch',
          currentStock: 8,
          reorderThreshold: 10,
          unit: 'bottles',
          isLowStock: true,
          recipeMappings: [{ externalItemId: 'ITEM-102', quantityRequired: 1 }],
        },
      ];

      for (const item of defaultStock) {
        let entity = await this.inventoryRepo.findOne({ where: { merchantId: 'STORE-01', ingredientId: item.ingredientId } });
        if (!entity) {
          entity = this.inventoryRepo.create(item);
        } else {
          entity.recipeMappings = item.recipeMappings;
        }
        await this.inventoryRepo.save(entity);
      }
      console.log('📦 [Inventory Service] Seeded and updated stock recipes for STORE-01');
    }
  }

  private seedDefaultInventoryInMemory() {
    if (this.inMemoryStore.length === 0) {
      this.inMemoryStore.push(
        {
          id: 'uuid-ing-1',
          merchantId: 'STORE-01',
          ingredientId: 'ING-01',
          name: 'Beef Patty 100g',
          currentStock: 50,
          reorderThreshold: 10,
          unit: 'pcs',
          isLowStock: false,
          recipeMappings: [{ externalItemId: 'ITEM-101', quantityRequired: 1 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'uuid-ing-2',
          merchantId: 'STORE-01',
          ingredientId: 'ING-02',
          name: 'Burger Bun',
          currentStock: 60,
          reorderThreshold: 15,
          unit: 'pcs',
          isLowStock: false,
          recipeMappings: [{ externalItemId: 'ITEM-101', quantityRequired: 1 }],
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );
    }
  }

  async getInventoryByMerchant(merchantId: string): Promise<InventoryItemEntity[]> {
    const cached = await this.getCache<InventoryItemEntity[]>(`inventory:${merchantId}`);
    if (cached) {
      console.log(`⚡ [Redis Cache HIT] Served Inventory for Store #${merchantId} in <1ms`);
      return cached;
    }

    let items: InventoryItemEntity[] = [];
    if (this.isDbConnected && this.inventoryRepo) {
      try {
        items = await this.inventoryRepo.find({ where: { merchantId }, order: { name: 'ASC' } });
      } catch {
        // Fallback
      }
    }

    if (items.length === 0) {
      items = this.inMemoryStore.filter((i) => i.merchantId === merchantId);
    }

    await this.setCache(`inventory:${merchantId}`, items);
    return items;
  }

  async deductStockForOrder(envelope: EventEnvelope<CanonicalOrder>): Promise<{ deductedItems: number; lowStockAlerts: string[] }> {
    const order = envelope.payload;
    const merchantId = order.merchantId || 'STORE-01';
    const lowStockAlerts: string[] = [];
    let deductedCount = 0;

    const inventoryItems = await this.getInventoryByMerchant(merchantId);

    for (const orderItem of order.items || []) {
      for (const invItem of inventoryItems) {
        let quantityRequired = 0;
        const mapping = (invItem.recipeMappings || []).find(
          (m) => m.externalItemId === orderItem.externalItemId || (orderItem.name && orderItem.name.toLowerCase().includes('burger') && m.externalItemId === 'ITEM-101')
        );

        if (mapping) {
          quantityRequired = mapping.quantityRequired;
        } else if (orderItem.name && orderItem.name.toLowerCase().includes('burger') && (invItem.ingredientId === 'ING-01' || invItem.ingredientId === 'ING-02')) {
          quantityRequired = 1;
        }

        if (quantityRequired > 0) {
          const totalDeduction = quantityRequired * orderItem.quantity;
          invItem.currentStock = Math.max(0, Number(invItem.currentStock) - totalDeduction);
          invItem.isLowStock = Number(invItem.currentStock) <= Number(invItem.reorderThreshold);
          invItem.updatedAt = new Date();

          if (invItem.isLowStock) {
            const alertMsg = `⚠️ [LOW STOCK WARNING] ${invItem.name} (${invItem.ingredientId}) stock is ${invItem.currentStock} ${invItem.unit} (<= threshold ${invItem.reorderThreshold})`;
            console.warn(alertMsg);
            lowStockAlerts.push(alertMsg);
          }

          if (this.isDbConnected && this.inventoryRepo) {
            await this.inventoryRepo.save(invItem);
          }
          deductedCount++;
        }
      }
    }

    await this.deleteCache(`inventory:${merchantId}`);
    console.log(`📦 [Auto-Stock Deduction Complete] Deducted stock for ${deductedCount} ingredient mappings (Order #${order.externalOrderId})`);

    return { deductedItems: deductedCount, lowStockAlerts };
  }

  async updateStock(merchantId: string, ingredientId: string, newStock: number): Promise<InventoryItemEntity | null> {
    let updatedItem: InventoryItemEntity | null = null;

    if (this.isDbConnected && this.inventoryRepo) {
      const entity = await this.inventoryRepo.findOne({ where: { merchantId, ingredientId } });
      if (entity) {
        entity.currentStock = newStock;
        entity.isLowStock = newStock <= Number(entity.reorderThreshold);
        updatedItem = await this.inventoryRepo.save(entity);
      }
    } else {
      const item = this.inMemoryStore.find((i) => i.merchantId === merchantId && i.ingredientId === ingredientId);
      if (item) {
        item.currentStock = newStock;
        item.isLowStock = newStock <= Number(item.reorderThreshold);
        item.updatedAt = new Date();
        updatedItem = item;
      }
    }

    if (updatedItem) {
      await this.deleteCache(`inventory:${merchantId}`);
    }
    return updatedItem;
  }

  private async getCache<T>(key: string): Promise<T | null> {
    if (!this.isRedisConnected || !this.redisClient) return null;
    try {
      const data = await this.redisClient.get(key);
      return data ? (JSON.parse(data) as T) : null;
    } catch {
      return null;
    }
  }

  private async setCache(key: string, value: any): Promise<void> {
    if (!this.isRedisConnected || !this.redisClient) return;
    try {
      await this.redisClient.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
    } catch {
      // Ignore cache write error
    }
  }

  private async deleteCache(key: string): Promise<void> {
    if (!this.isRedisConnected || !this.redisClient) return;
    try {
      await this.redisClient.del(key);
    } catch {
      // Ignore cache delete error
    }
  }
}
