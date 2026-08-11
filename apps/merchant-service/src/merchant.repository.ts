import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import Redis from 'ioredis';
import { MerchantEntity, StoreStatus } from './merchant.entity';

const CACHE_TTL_SECONDS = 600; // 10 minutes cache TTL for store config

@Injectable()
export class MerchantRepository implements OnModuleInit {
  private dataSource?: DataSource;
  private merchantRepo?: Repository<MerchantEntity>;
  private redisClient?: Redis;
  private isDbConnected = false;
  private isRedisConnected = false;
  private inMemoryStore: MerchantEntity[] = [];

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
        entities: [MerchantEntity],
        synchronize: true,
      });

      await this.dataSource.initialize();
      this.merchantRepo = this.dataSource.getRepository(MerchantEntity);
      this.isDbConnected = true;
      console.log('🐘 [Merchant PostgreSQL] Connected to Database: pinaka_delivery_hub');
      await this.seedDefaultMerchant();
    } catch (err: any) {
      console.log(`⚠️ [Merchant PostgreSQL] Offline (${err.message}). Using In-Memory fallback.`);
      this.isDbConnected = false;
      this.seedDefaultMerchantInMemory();
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
      console.log('⚡ [Merchant Redis] Connected to Redis Container on port 6379');
    } catch (err: any) {
      console.log(`⚠️ [Merchant Redis] Offline (${err.message}). Proceeding without cache.`);
      this.isRedisConnected = false;
    }
  }

  private async seedDefaultMerchant() {
    if (this.merchantRepo) {
      const existing = await this.merchantRepo.findOne({ where: { merchantId: 'STORE-01' } });
      if (!existing) {
        const defaultMerchant = this.merchantRepo.create({
          merchantId: 'STORE-01',
          storeName: 'Pinaka Bistro Downtown',
          status: StoreStatus.OPEN,
          autoAcceptOrders: true,
          operatingHours: { openTime: '09:00', closeTime: '22:00' },
          channels: [
            { platform: 'DOORDASH', externalStoreId: 'STORE-DOORDASH-01', apiKey: 'dd_sandbox_key_9982', enabled: true },
            { platform: 'SWIGGY', externalStoreId: 'REST-SWIGGY-IND-01', apiKey: 'sw_sandbox_key_4410', enabled: true },
          ],
        });
        await this.merchantRepo.save(defaultMerchant);
        console.log('🏪 [Merchant Service] Seeded default store: STORE-01');
      }
    }
  }

  private seedDefaultMerchantInMemory() {
    const existing = this.inMemoryStore.find((m) => m.merchantId === 'STORE-01');
    if (!existing) {
      this.inMemoryStore.push({
        merchantId: 'STORE-01',
        storeName: 'Pinaka Bistro Downtown',
        status: StoreStatus.OPEN,
        autoAcceptOrders: true,
        operatingHours: { openTime: '09:00', closeTime: '22:00' },
        channels: [
          { platform: 'DOORDASH', externalStoreId: 'STORE-DOORDASH-01', apiKey: 'dd_sandbox_key_9982', enabled: true },
          { platform: 'SWIGGY', externalStoreId: 'REST-SWIGGY-IND-01', apiKey: 'sw_sandbox_key_4410', enabled: true },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  async findAllMerchants(): Promise<MerchantEntity[]> {
    if (this.isDbConnected && this.merchantRepo) {
      try {
        return await this.merchantRepo.find();
      } catch {
        // Fallback
      }
    }
    return this.inMemoryStore;
  }

  async findMerchantById(merchantId: string): Promise<MerchantEntity | null> {
    // 1. Check Redis Cache
    const cached = await this.getCache<MerchantEntity>(`merchant:${merchantId}`);
    if (cached) {
      console.log(`⚡ [Redis Cache HIT] Served Merchant #${merchantId} configuration in <1ms`);
      return cached;
    }

    // 2. Query Database
    let merchant: MerchantEntity | null = null;
    if (this.isDbConnected && this.merchantRepo) {
      try {
        merchant = await this.merchantRepo.findOne({ where: { merchantId } });
      } catch {
        // Fallback
      }
    }

    if (!merchant) {
      merchant = this.inMemoryStore.find((m) => m.merchantId === merchantId) || null;
    }

    // Save to Cache
    if (merchant) {
      await this.setCache(`merchant:${merchantId}`, merchant);
    }
    return merchant;
  }

  async saveMerchant(dto: Partial<MerchantEntity>): Promise<MerchantEntity> {
    let saved: MerchantEntity;

    if (this.isDbConnected && this.merchantRepo) {
      const entity = this.merchantRepo.create(dto);
      saved = await this.merchantRepo.save(entity);
    } else {
      const idx = this.inMemoryStore.findIndex((m) => m.merchantId === dto.merchantId);
      const entry: MerchantEntity = {
        merchantId: dto.merchantId || `STORE-${Date.now()}`,
        storeName: dto.storeName || 'New Pinaka Store',
        status: dto.status || StoreStatus.OPEN,
        autoAcceptOrders: dto.autoAcceptOrders ?? true,
        operatingHours: dto.operatingHours || { openTime: '09:00', closeTime: '22:00' },
        channels: dto.channels || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      if (idx >= 0) this.inMemoryStore[idx] = entry;
      else this.inMemoryStore.unshift(entry);
      saved = entry;
    }

    // Purge and Refresh Cache
    await this.setCache(`merchant:${saved.merchantId}`, saved);
    return saved;
  }

  async updateStoreStatus(merchantId: string, status: StoreStatus): Promise<MerchantEntity | null> {
    const merchant = await this.findMerchantById(merchantId);
    if (!merchant) return null;

    merchant.status = status;
    merchant.updatedAt = new Date();

    return await this.saveMerchant(merchant);
  }

  async updateAutoAccept(merchantId: string, autoAccept: boolean): Promise<MerchantEntity | null> {
    const merchant = await this.findMerchantById(merchantId);
    if (!merchant) return null;

    merchant.autoAcceptOrders = autoAccept;
    merchant.updatedAt = new Date();

    return await this.saveMerchant(merchant);
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
}
