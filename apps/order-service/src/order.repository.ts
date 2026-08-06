import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import Redis from 'ioredis';
import { CanonicalOrder, OrderStatus } from '@pinaka-delivery-hub/canonical-model';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { OrderEntity } from './entities/order.entity';
import { OrderItemEntity } from './entities/order-item.entity';

const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const CACHE_TTL_SECONDS = 300; // 5 minutes cache TTL

@Injectable()
export class OrderRepository implements OnModuleInit {
  private dataSource?: DataSource;
  private orderRepo?: Repository<OrderEntity>;
  private redisClient?: Redis;
  private isDbConnected = false;
  private isRedisConnected = false;
  private inMemoryStore: CanonicalOrder[] = [];

  async onModuleInit() {
    // 1. Initialize PostgreSQL Connection
    try {
      this.dataSource = new DataSource({
        type: 'postgres',
        host: process.env.POSTGRES_HOST || 'localhost',
        port: Number(process.env.POSTGRES_PORT) || 5432,
        username: process.env.POSTGRES_USER || 'pdh_user',
        password: process.env.POSTGRES_PASSWORD || 'pdh_password',
        database: process.env.POSTGRES_DB || 'pinaka_delivery_hub',
        entities: [OrderEntity, OrderItemEntity],
        synchronize: true, // Auto-create tables in local dev
      });

      await this.dataSource.initialize();
      this.orderRepo = this.dataSource.getRepository(OrderEntity);
      this.isDbConnected = true;
      console.log('🐘 [PostgreSQL] Connected successfully to Database: pinaka_delivery_hub');
    } catch (err: any) {
      console.log(`⚠️ [PostgreSQL] Connection fallback to In-Memory store (${err.message})`);
      this.isDbConnected = false;
    }

    // 2. Initialize Redis Client Connection
    try {
      this.redisClient = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });

      await this.redisClient.connect();
      this.isRedisConnected = true;
      console.log('⚡ [Redis Cache] Connected successfully to Redis Container on port 6379');
    } catch (err: any) {
      console.log(`⚠️ [Redis Cache] Redis offline (${err.message}). Proceeding without cache.`);
      this.isRedisConnected = false;
    }
  }

  async saveOrderFromEnvelope(envelope: EventEnvelope<CanonicalOrder>): Promise<CanonicalOrder> {
    const payload = envelope.payload;
    console.log(`[Order Service Received Event] CorrelationID: ${envelope.correlationId}`);
    console.log(`📥 Ingested Order #${payload.externalOrderId} from ${payload.platform}`);

    let canonical: CanonicalOrder = payload;

    if (this.isDbConnected && this.orderRepo) {
      try {
        let entity = await this.orderRepo.findOne({ where: { externalOrderId: payload.externalOrderId } });
        if (!entity) {
          entity = this.orderRepo.create({
            merchantId: payload.merchantId,
            externalOrderId: payload.externalOrderId,
            platform: payload.platform,
            status: payload.status,
            subtotal: payload.subtotal || 0,
            tax: payload.tax || 0,
            deliveryFee: payload.deliveryFee || 0,
            totalAmount: payload.totalAmount || 0,
            customer: payload.customer,
            deliveryAddress: payload.deliveryAddress,
            items: (payload.items || []).map((item) => {
              const itemEntity = new OrderItemEntity();
              itemEntity.externalItemId = item.externalItemId;
              itemEntity.name = item.name;
              itemEntity.quantity = item.quantity;
              itemEntity.unitPrice = item.unitPrice;
              return itemEntity;
            }),
          });
        } else {
          entity.status = payload.status;
        }

        const saved = await this.orderRepo.save(entity);
        canonical = this.mapToCanonical(saved);
      } catch (err: any) {
        console.error(`⚠️ DB Save Error: ${err.message}. Falling back to memory.`);
      }
    } else {
      const existingIdx = this.inMemoryStore.findIndex((o) => o.externalOrderId === payload.externalOrderId);
      if (existingIdx >= 0) {
        this.inMemoryStore[existingIdx] = payload;
      } else {
        this.inMemoryStore.unshift(payload);
      }
    }

    // Cache order in Redis
    await this.setCache(`order:${canonical.externalOrderId}`, canonical);
    await this.setCache(`order:${canonical.id}`, canonical);
    await this.deleteCache('orders:all');

    return canonical;
  }

  async findAllOrders(): Promise<CanonicalOrder[]> {
    // 1. Check Redis Cache First
    const cachedOrders = await this.getCache<CanonicalOrder[]>('orders:all');
    if (cachedOrders) {
      console.log('⚡ [Redis Cache HIT] Served ALL orders from Redis RAM in <1ms');
      return cachedOrders;
    }

    // 2. Cache Miss -> Query PostgreSQL DB
    let orders: CanonicalOrder[] = [];
    if (this.isDbConnected && this.orderRepo) {
      try {
        const entities = await this.orderRepo.find({ order: { createdAt: 'DESC' } });
        orders = entities.map((e) => this.mapToCanonical(e));
      } catch (err: any) {
        console.error(`⚠️ DB FindAll Error: ${err.message}`);
        orders = this.inMemoryStore;
      }
    } else {
      orders = this.inMemoryStore;
    }

    // 3. Save to Redis Cache (TTL 300s)
    await this.setCache('orders:all', orders);
    return orders;
  }

  async findOrderById(id: string): Promise<CanonicalOrder | null> {
    // 1. Check Redis Cache First
    const cachedOrder = await this.getCache<CanonicalOrder>(`order:${id}`);
    if (cachedOrder) {
      console.log(`⚡ [Redis Cache HIT] Served Order #${id} from Redis RAM in <1ms`);
      return cachedOrder;
    }

    // 2. Cache Miss -> Query PostgreSQL DB
    let order: CanonicalOrder | null = null;
    if (this.isDbConnected && this.orderRepo) {
      try {
        const isUuid = UUID_REGEX.test(id);
        const whereCondition = isUuid ? [{ id }, { externalOrderId: id }] : { externalOrderId: id };

        const entity = await this.orderRepo.findOne({ where: whereCondition as any });
        if (entity) order = this.mapToCanonical(entity);
      } catch (err: any) {
        console.error(`⚠️ DB FindById Error: ${err.message}`);
      }
    }

    if (!order) {
      order = this.inMemoryStore.find((o) => o.id === id || o.externalOrderId === id) || null;
    }

    // 3. Save to Redis Cache
    if (order) {
      await this.setCache(`order:${id}`, order);
      await this.setCache(`order:${order.externalOrderId}`, order);
    }
    return order;
  }

  async updateOrderStatus(id: string, newStatus: OrderStatus): Promise<CanonicalOrder | null> {
    let updatedOrder: CanonicalOrder | null = null;

    if (this.isDbConnected && this.orderRepo) {
      try {
        const isUuid = UUID_REGEX.test(id);
        const whereCondition = isUuid ? [{ id }, { externalOrderId: id }] : { externalOrderId: id };

        const entity = await this.orderRepo.findOne({ where: whereCondition as any });
        if (entity) {
          entity.status = newStatus;
          const saved = await this.orderRepo.save(entity);
          updatedOrder = this.mapToCanonical(saved);
        }
      } catch (err: any) {
        console.error(`⚠️ DB UpdateStatus Error: ${err.message}`);
      }
    }

    if (!updatedOrder) {
      const order = this.inMemoryStore.find((o) => o.id === id || o.externalOrderId === id);
      if (order) {
        order.status = newStatus;
        order.updatedAt = new Date().toISOString();
        updatedOrder = order;
      }
    }

    // Invalidate Redis Cache for Stale Order State
    if (updatedOrder) {
      await this.setCache(`order:${id}`, updatedOrder);
      await this.setCache(`order:${updatedOrder.externalOrderId}`, updatedOrder);
      await this.deleteCache('orders:all');
      console.log(`⚡ [Redis Cache Purged & Updated] Order #${updatedOrder.externalOrderId} -> Status: ${newStatus}`);
    }

    return updatedOrder;
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

  private async setCache(key: string, value: any, ttlSeconds = CACHE_TTL_SECONDS): Promise<void> {
    if (!this.isRedisConnected || !this.redisClient) return;
    try {
      await this.redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Ignore cache write errors
    }
  }

  private async deleteCache(key: string): Promise<void> {
    if (!this.isRedisConnected || !this.redisClient) return;
    try {
      await this.redisClient.del(key);
    } catch {
      // Ignore cache delete errors
    }
  }

  private mapToCanonical(entity: OrderEntity): CanonicalOrder {
    return {
      id: entity.id,
      merchantId: entity.merchantId,
      externalOrderId: entity.externalOrderId,
      platform: entity.platform,
      status: entity.status,
      customer: entity.customer || { fullName: 'Customer', phone: '' },
      items: (entity.items || []).map((item) => ({
        id: item.id,
        externalItemId: item.externalItemId,
        name: item.name,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
      })),
      subtotal: Number(entity.subtotal),
      tax: Number(entity.tax),
      deliveryFee: Number(entity.deliveryFee),
      totalAmount: Number(entity.totalAmount),
      deliveryAddress: entity.deliveryAddress || { street: '', city: '', zipCode: '' },
      createdAt: entity.createdAt ? entity.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: entity.updatedAt ? entity.updatedAt.toISOString() : new Date().toISOString(),
    };
  }
}
