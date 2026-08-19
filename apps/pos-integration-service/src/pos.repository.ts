import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import Redis from 'ioredis';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { CanonicalOrder } from '@pinaka-delivery-hub/canonical-model';
import { PosSyncLogEntity } from './pos.entity';

const CACHE_TTL_SECONDS = 300; // 5 minutes cache TTL


@Injectable()
export class PosRepository implements OnModuleInit {
  private dataSource?: DataSource;
  private posLogRepo?: Repository<PosSyncLogEntity>;
  private redisClient?: Redis;
  private isDbConnected = false;
  private isRedisConnected = false;
  private inMemoryStore: PosSyncLogEntity[] = [];

  // ── Idempotency guard ────────────────────────────────────────────────────
  // Prevents duplicate WooCommerce orders from the 3 delivery paths:
  // (in-memory bus) + (RabbitMQ subscriber) + (HTTP fallback POST)
  private readonly recentlySynced = new Map<string, number>();
  private readonly DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
  private isDuplicate(externalOrderId: string): boolean {
    const now = Date.now();
    for (const [id, ts] of this.recentlySynced.entries()) {
      if (now - ts > this.DEDUP_WINDOW_MS) this.recentlySynced.delete(id);
    }
    if (this.recentlySynced.has(externalOrderId)) {
      console.warn(`⚠️ [POS Dedup] Skipping duplicate for Order #${externalOrderId}`);
      return true;
    }
    this.recentlySynced.set(externalOrderId, now);
    return false;
  }
  // ─────────────────────────────────────────────────────────────────────────

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
        entities: [PosSyncLogEntity],
        synchronize: true,
      });

      await this.dataSource.initialize();
      this.posLogRepo = this.dataSource.getRepository(PosSyncLogEntity);
      this.isDbConnected = true;
      console.log('🐘 [POS Integration PostgreSQL] Connected to Database: pinaka_delivery_hub');
    } catch (err: any) {
      console.log(`⚠️ [POS Integration PostgreSQL] Offline (${err.message}). Using In-Memory fallback.`);
      this.isDbConnected = false;
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
      console.log('⚡ [POS Integration Redis] Connected to Redis Container on port 6379');
    } catch (err: any) {
      console.log(`⚠️ [POS Integration Redis] Offline (${err.message}). Proceeding without cache.`);
      this.isRedisConnected = false;
    }
  }


  async syncOrderToLivePOS(envelope: EventEnvelope<CanonicalOrder>): Promise<PosSyncLogEntity> {
    const order = envelope.payload;

    // ── Deduplicate: skip if already synced within 10 min ──
    if (this.isDuplicate(order.externalOrderId)) {
      return {
        id: `dedup-${order.externalOrderId}`,
        externalOrderId: order.externalOrderId,
        status: 'SKIPPED_DUPLICATE',
        merchantId: order.merchantId || 'Pinaka_013',
        posSystemType: 'WOOCOMMERCE_REST',
        posTargetUrl: process.env.POS_TARGET_URL || 'https://merchantrestaurant.alektasolutions.com/',
        payload: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any;
    }
    // ───────────────────────────────────────────────────────

    const merchantId = order.merchantId || 'Pinaka_013';
    const targetUrl = process.env.POS_TARGET_URL || 'https://merchantrestaurant.alektasolutions.com/';

    console.log(`📡 [POS Sync Relay] Relay order #${order.externalOrderId} to POS target: ${targetUrl} (Store: ${merchantId})`);

    const restaurantId     = Number(process.env.POS_RESTAURANT_ID      || 1);
    const captainId        = Number(process.env.POS_CAPTAIN_ID         || 1);
    const defaultProductId = Number(process.env.POS_DEFAULT_PRODUCT_ID || 1972);

    let syncStatus = 'FAILED';
    let parentOrderId: string | number | undefined;
    let parentRes: any;
    let kotRes: any;

    try {
      // ── Step 1: Create parent online order ──────────────────────────────────
      parentRes = await this.postPosOrder({
        flag_type:      'parent_online_order',
        restaurant_id:  restaurantId,
        created_via:    'online',
        order_type:     'Online Order',
        order_datetime: new Date().toISOString(),
        customer_note:  `Online Order #${order.externalOrderId} via ${order.platform || 'DoorDash'}`,
        billing: {
          first_name: order.customer?.fullName?.split(' ')[0] || 'Online',
          last_name:  order.customer?.fullName?.split(' ')[1] || 'Customer',
          phone:      order.customer?.phone || '+919876543210',
          address_1:  order.deliveryAddress?.street || 'Online Order',
          city:       order.deliveryAddress?.city   || 'Bengaluru',
          postcode:   order.deliveryAddress?.zipCode || '560001',
        },
        meta_data: [
          { key: '_order_type',        value: 'Online Order' },
          { key: '_online_order',      value: 'yes' },
          { key: '_external_order_id', value: order.externalOrderId },
          { key: '_channel',           value: order.platform || 'DOORDASH' },
          { key: '_store_id',          value: merchantId },
          { key: 'is_pos_online',      value: 'yes' },
        ],
      });

      parentOrderId = this.extractPosOrderId(parentRes);
      if (parentOrderId === undefined) {
        syncStatus = 'FAILED_PARENT';
        console.warn(`⚠️ [POS Sync] Parent order created but no id returned for #${order.externalOrderId}: ${JSON.stringify(parentRes)}`);
      } else {
        console.log(`✅ [POS Parent OK] Order #${order.externalOrderId} → Pinaka POS Parent ID: #${parentOrderId}`);

        // ── Step 2: Create KOT linked to parent ──────────────────────────────
        kotRes = await this.postPosOrder({
          flag_type:       'kot_order',
          parent_order_id: parentOrderId,
          restaurant_id:   restaurantId,
          captain_id:      captainId,
          line_items: (order.items || []).map((item) => ({
            product_id: this.resolvePosProductId(item.externalItemId, defaultProductId),
            quantity:   Number(item.quantity || 1),
          })),
        });

        console.log(`✅ [POS KOT OK] KOT linked to Parent #${parentOrderId} | Order Type: Online Order | Total: ₹${parentRes.total || order.totalAmount}`);
        syncStatus = 'SYNCED_TO_POS';
      }
    } catch (err: any) {
      if (syncStatus === 'FAILED' || syncStatus === 'FAILED_PARENT') {
        console.warn(`⚠️ [POS Sync Relay Exception] (${targetUrl}): ${err.message}`);
      } else {
        syncStatus = 'FAILED_KOT';
        console.warn(`⚠️ [POS KOT Exception] Parent #${parentOrderId} created but KOT failed: ${err.message}`);
      }
    }

    // ── Persist POS Sync Log in PostgreSQL ──────────────────────────────────
    const logPayload = { parentRes, kotRes };
    let logEntry: PosSyncLogEntity;
    if (this.isDbConnected && this.posLogRepo) {
      const entity = this.posLogRepo.create({
        merchantId,
        externalOrderId: order.externalOrderId,
        posSystemType:   'WOOCOMMERCE_REST',
        status:          syncStatus,
        posTargetUrl:    targetUrl,
        payload:         logPayload,
      });
      logEntry = await this.posLogRepo.save(entity);
    } else {
      logEntry = {
        id:              `uuid-pos-${Date.now()}`,
        merchantId,
        externalOrderId: order.externalOrderId,
        posSystemType:   'WOOCOMMERCE_REST',
        status:          syncStatus,
        posTargetUrl:    targetUrl,
        payload:         logPayload,
        createdAt:       new Date(),
        updatedAt:       new Date(),
      };
      this.inMemoryStore.unshift(logEntry);
    }

    await this.setCache(`pos_log:${logEntry.id}`, logEntry);
    return logEntry;
  }

  async getPendingPosOrders(merchantId: string): Promise<PosSyncLogEntity[]> {
    if (this.isDbConnected && this.posLogRepo) {
      return await this.posLogRepo.find({
        where: { merchantId },
        order: { createdAt: 'DESC' },
        take: 20,
      });
    }
    return this.inMemoryStore.filter((l) => l.merchantId === merchantId);
  }

  // ── POS HTTP helpers (mirrors app.controller.ts) ──────────────────────────

  private async postPosOrder(payload: Record<string, unknown>): Promise<any> {
    const posOrdersUrl =
      process.env.POS_ORDERS_URL ||
      'https://merchantrestaurant.alektasolutions.com/wp-json/pinaka-restaurant-pos/v1/orders';

    const configuredAuthorization = process.env.POS_AUTHORIZATION?.trim();
    const configuredToken = process.env.POS_API_TOKEN?.trim().replace(/^Bearer\s+/i, '');
    const authorization =
      configuredAuthorization ||
      (configuredToken ? `Bearer ${configuredToken}` : undefined);

    if (!authorization) {
      throw new Error('POS authentication is not configured. Set POS_AUTHORIZATION or POS_API_TOKEN.');
    }

    const response = await fetch(posOrdersUrl, {
      method: 'POST',
      headers: {
        Authorization:  authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let result: any;
    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      result = { raw: text };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${JSON.stringify(result)}`);
    }
    return result;
  }

  private extractPosOrderId(response: any): string | number | undefined {
    return (
      response?.id ??
      response?.order_id ??
      response?.data?.id ??
      response?.data?.order_id ??
      response?.data?.order?.id ??
      response?.data?.order?.order_id
    );
  }

  private resolvePosProductId(externalItemId: string | undefined, fallback: number): number {
    if (!externalItemId) return fallback;
    const exact = Number(externalItemId);
    if (Number.isInteger(exact) && exact > 0) return exact;
    const numericSuffix = externalItemId.match(/(\d+)$/)?.[1];
    const parsedSuffix = numericSuffix ? Number(numericSuffix) : NaN;
    return Number.isInteger(parsedSuffix) && parsedSuffix > 0 ? parsedSuffix : fallback;
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
