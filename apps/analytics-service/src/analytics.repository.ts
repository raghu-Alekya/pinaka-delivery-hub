import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import Redis from 'ioredis';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { CanonicalOrder } from '@pinaka-delivery-hub/canonical-model';
import { AnalyticsSnapshotEntity } from './entities/analytics-snapshot.entity';

const CACHE_TTL_SECONDS = 300; // 5 minutes cache TTL

@Injectable()
export class AnalyticsRepository implements OnModuleInit {
  private dataSource?: DataSource;
  private analyticsRepo?: Repository<AnalyticsSnapshotEntity>;
  private redisClient?: Redis;
  private isDbConnected = false;
  private isRedisConnected = false;
  private inMemoryStore: AnalyticsSnapshotEntity[] = [];

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
        entities: [AnalyticsSnapshotEntity],
        synchronize: true,
      });

      await this.dataSource.initialize();
      this.analyticsRepo = this.dataSource.getRepository(AnalyticsSnapshotEntity);
      this.isDbConnected = true;
      console.log('🐘 [Analytics PostgreSQL] Connected to Database: pinaka_delivery_hub');
      await this.seedDefaultAnalytics();
    } catch (err: any) {
      console.log(`⚠️ [Analytics PostgreSQL] Offline (${err.message}). Using In-Memory fallback.`);
      this.isDbConnected = false;
      this.seedDefaultAnalyticsInMemory();
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
      console.log('⚡ [Analytics Redis] Connected to Redis Container on port 6379');
    } catch (err: any) {
      console.log(`⚠️ [Analytics Redis] Offline (${err.message}). Proceeding without cache.`);
      this.isRedisConnected = false;
    }
  }

  private async seedDefaultAnalytics() {
    if (this.analyticsRepo) {
      const existing = await this.analyticsRepo.findOne({ where: { merchantId: 'STORE-01' } });
      if (!existing) {
        const defaultSnapshot = this.analyticsRepo.create({
          merchantId: 'STORE-01',
          totalRevenue: 1250.00,
          totalOrders: 25,
          averageOrderValue: 50.00,
          platformBreakdown: {
            DOORDASH: { revenue: 750.00, orderCount: 15 },
            SWIGGY: { revenue: 500.00, orderCount: 10 },
            UBER_EATS: { revenue: 0.00, orderCount: 0 },
          },
          statusBreakdown: {
            CREATED: 5,
            ACCEPTED: 15,
            READY_FOR_PICKUP: 3,
            DELIVERED: 2,
            CANCELLED: 0,
          },
        });
        await this.analyticsRepo.save(defaultSnapshot);
        console.log('📊 [Analytics Service] Seeded default analytics snapshot for STORE-01');
      }
    }
  }

  private seedDefaultAnalyticsInMemory() {
    if (this.inMemoryStore.length === 0) {
      this.inMemoryStore.push({
        id: 'uuid-analytics-1',
        merchantId: 'STORE-01',
        totalRevenue: 1250.00,
        totalOrders: 25,
        averageOrderValue: 50.00,
        platformBreakdown: {
          DOORDASH: { revenue: 750.00, orderCount: 15 },
          SWIGGY: { revenue: 500.00, orderCount: 10 },
          UBER_EATS: { revenue: 0.00, orderCount: 0 },
        },
        statusBreakdown: {
          CREATED: 5,
          ACCEPTED: 15,
          READY_FOR_PICKUP: 3,
          DELIVERED: 2,
          CANCELLED: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  async getAnalyticsByMerchant(merchantId: string): Promise<AnalyticsSnapshotEntity | null> {
    const cached = await this.getCache<AnalyticsSnapshotEntity>(`analytics:${merchantId}`);
    if (cached) {
      console.log(`⚡ [Redis Cache HIT] Served Analytics Metrics for Store #${merchantId} in <1ms`);
      return cached;
    }

    let snapshot: AnalyticsSnapshotEntity | null = null;
    if (this.isDbConnected && this.analyticsRepo) {
      try {
        snapshot = await this.analyticsRepo.findOne({ where: { merchantId } });
      } catch {
        // Fallback
      }
    }

    if (!snapshot) {
      snapshot = this.inMemoryStore.find((s) => s.merchantId === merchantId) || null;
    }

    if (snapshot) {
      await this.setCache(`analytics:${merchantId}`, snapshot);
    }
    return snapshot;
  }

  async recordOrderEvent(envelope: EventEnvelope<CanonicalOrder>): Promise<AnalyticsSnapshotEntity> {
    const order = envelope.payload;
    const merchantId = order.merchantId || 'STORE-01';
    const amount = Number(order.totalAmount || order.subtotal || 0);
    const platform = (order.platform || 'DOORDASH').toUpperCase() as 'DOORDASH' | 'SWIGGY' | 'UBER_EATS';

    let snapshot = await this.getAnalyticsByMerchant(merchantId);

    if (!snapshot) {
      snapshot = {
        id: `uuid-${Date.now()}`,
        merchantId,
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        platformBreakdown: {
          DOORDASH: { revenue: 0, orderCount: 0 },
          SWIGGY: { revenue: 0, orderCount: 0 },
          UBER_EATS: { revenue: 0, orderCount: 0 },
        },
        statusBreakdown: {
          CREATED: 0,
          ACCEPTED: 0,
          READY_FOR_PICKUP: 0,
          DELIVERED: 0,
          CANCELLED: 0,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // Increment Metrics
    snapshot.totalRevenue = Number((Number(snapshot.totalRevenue) + amount).toFixed(2));
    snapshot.totalOrders = Number(snapshot.totalOrders) + 1;
    snapshot.averageOrderValue = Number((snapshot.totalRevenue / snapshot.totalOrders).toFixed(2));

    // Increment Platform Share
    if (!snapshot.platformBreakdown) {
      snapshot.platformBreakdown = {
        DOORDASH: { revenue: 0, orderCount: 0 },
        SWIGGY: { revenue: 0, orderCount: 0 },
        UBER_EATS: { revenue: 0, orderCount: 0 },
      };
    }

    const currentPlatform = snapshot.platformBreakdown[platform] || { revenue: 0, orderCount: 0 };
    currentPlatform.revenue = Number((Number(currentPlatform.revenue) + amount).toFixed(2));
    currentPlatform.orderCount = Number(currentPlatform.orderCount) + 1;
    snapshot.platformBreakdown[platform] = currentPlatform;

    // Increment Status Count
    if (!snapshot.statusBreakdown) {
      snapshot.statusBreakdown = { CREATED: 0, ACCEPTED: 0, READY_FOR_PICKUP: 0, DELIVERED: 0, CANCELLED: 0 };
    }
    const currentStatus = order.status || 'CREATED';
    if (snapshot.statusBreakdown[currentStatus as keyof typeof snapshot.statusBreakdown] !== undefined) {
      snapshot.statusBreakdown[currentStatus as keyof typeof snapshot.statusBreakdown] += 1;
    }

    snapshot.updatedAt = new Date();

    // Persist to PostgreSQL & Redis
    if (this.isDbConnected && this.analyticsRepo) {
      const entity = this.analyticsRepo.create(snapshot);
      snapshot = await this.analyticsRepo.save(entity);
    } else {
      const idx = this.inMemoryStore.findIndex((s) => s.merchantId === merchantId);
      if (idx >= 0) this.inMemoryStore[idx] = snapshot;
      else this.inMemoryStore.unshift(snapshot);
    }

    await this.deleteCache(`analytics:${merchantId}`);
    console.log(`📊 [Analytics Updated] Store #${merchantId} Revenue: $${snapshot.totalRevenue} | Total Orders: ${snapshot.totalOrders} | AOV: $${snapshot.averageOrderValue}`);

    return snapshot;
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
