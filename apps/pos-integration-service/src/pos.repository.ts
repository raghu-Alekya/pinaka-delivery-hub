import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import Redis from 'ioredis';
import { EventEnvelope } from '@pinaka-delivery-hub/event-contracts';
import { CanonicalOrder } from '@pinaka-delivery-hub/canonical-model';
import { PosSyncLogEntity } from './pos.entity';

const CACHE_TTL_SECONDS = 300; // 5 minutes cache TTL

// Comprehensive Live WooCommerce Catalog Product ID Map for https://merchantrestaurant.alektasolutions.com/
const WOOCOMMERCE_CATALOG_MAP: Record<string, number> = {
  'paneer tikka': 13843,
  'chicken tikka': 1972,
  'chicken tandoori': 1972,
  'tandoori chicken': 1972,
  'special chicken biryani': 4218,
  'chicken curry': 5823,
  'butter chicken': 1920,
  'chicken tikka masala': 1922,
  'chicken 65': 1968,
  'chicken lollipop': 1970,
  'pepper chicken': 1976,
  'chicken manchurian': 1974,
  'bbq chicken wings': 2000,
  'chicken popcorn': 1998,
  'mutton seekh kebab': 1978,
  'mutton curry': 1924,
  'tandoori mushroom': 13845,
  'mushroom tandoori': 14152,
  'veg seekh kebab': 13847,
  'capsicum tandoori': 14147,
  'thumbs up': 16725,
  'coke': 6880,
  'cola': 6926,
  'beer': 7999,
  'corona': 6412,
  'order amount': 8974,
};

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

  private resolveWooCommerceProductId(itemName?: string, itemId?: string): number {
    // 1. Check numeric externalItemId
    const parsedId = parseInt(String(itemId), 10);
    if (!isNaN(parsedId) && parsedId > 0) return parsedId;

    // 2. Match catalog name
    if (itemName) {
      const lowerName = itemName.toLowerCase().trim();
      for (const [key, prodId] of Object.entries(WOOCOMMERCE_CATALOG_MAP)) {
        if (lowerName.includes(key) || key.includes(lowerName)) {
          return prodId;
        }
      }
    }

    // 3. Fallback to generic Order Amount Product ID (8974) or Paneer Tikka (13843)
    return 1972; // Default to Chicken Tikka (1972) if name contains chicken, or 8974
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



    // Build line items matching live WooCommerce Product IDs and custom webhook name & price overrides
    const lineItems = (order.items || []).map((item) => {
      const productId = this.resolveWooCommerceProductId(item.name, item.externalItemId);
      const itemPrice = Number(item.unitPrice || 0);
      const itemQty = Number(item.quantity || 1);
      const itemTotal = (itemPrice * itemQty).toFixed(2);

      return {
        product_id: productId,
        name: item.name || 'Online Item', // Custom Name Override for POS Receipt/Screen
        quantity: itemQty,
        subtotal: String(itemTotal),
        total: String(itemTotal),
      };
    });

    if (lineItems.length === 0) {
      const fallbackTotal = Number(order.totalAmount || order.subtotal || 199).toFixed(2);
      lineItems.push({ product_id: 1972, name: 'Chicken Tandoori', quantity: 1, subtotal: String(fallbackTotal), total: String(fallbackTotal) });
    }

    // ── Use Pinaka POS custom endpoint so the plugin writes order_type = 'Online Order'
    // to its custom DB table — making the WooCommerce admin column show correctly.
    const posPayload = {
      flag_type: 'parent_online_order',
      restaurant_id: 1,
      created_via: 'online',
      order_type: 'Online Order',
      order_datetime: new Date().toISOString(),
      customer_note: `Online Order #${order.externalOrderId} via ${order.platform || 'DoorDash'}`,
      billing: {
        first_name: order.customer?.fullName?.split(' ')[0] || 'Online',
        last_name: order.customer?.fullName?.split(' ')[1] || 'Customer',
        phone: order.customer?.phone || '+919876543210',
        address_1: order.deliveryAddress?.street || 'Online Order',
        city: order.deliveryAddress?.city || 'Bengaluru',
        postcode: order.deliveryAddress?.zipCode || '560001',
      },
      line_items: lineItems,
      meta_data: [
        { key: '_order_type',        value: 'Online Order' },
        { key: '_online_order',      value: 'yes' },
        { key: '_external_order_id', value: order.externalOrderId },
        { key: '_channel',           value: order.platform || 'DOORDASH' },
        { key: '_store_id',          value: merchantId },
        { key: 'is_pos_online',      value: 'yes' },
      ],
    };
    // Pinaka POS endpoint requires Bearer JWT, not Basic auth
    const posJwtToken = process.env.PINAKA_POS_JWT_TOKEN ||
      'eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJodHRwczpcL1wvbWVyY2hhbnRyZXN0YXVyYW50LmFsZWt0YXNvbHV0aW9ucy5jb20iLCJpYXQiOjE3ODY1MDk1MzMsIm5iZiI6MTc4NjUwOTUzMywiZXhwIjoxNzg5MTAxNTMzLCJkYXRhIjp7InVzZXIiOnsiaWQiOjUsImRldmljZSI6IiIsInBhc3MiOiIyYjhlMjJlOTM2ZTY0N2JhNDRmOWJhMmY3Y2Q1ZmFjNiJ9fX0.R7_4kHcFW6CnHbyrscNtcSG8KX3z110dKHfr66hLt68';
    const authHeader = `Bearer ${posJwtToken}`;
    const requestUrl = `${targetUrl.replace(/\/$/, '')}/wp-json/pinaka-restaurant-pos/v1/orders`;

    let syncStatus = 'FAILED';

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify(posPayload),
      });

      const resData: any = await response.json();

      if (response.ok || response.status === 201 || response.status === 200) {
        syncStatus = 'SYNCED_TO_POS';
        console.log(`✅ [POS Sync Success] Online Order #${order.externalOrderId} → Pinaka POS Order ID: #${resData.id} | Order Type: Online Order | Total: ₹${resData.total || order.totalAmount}`);
      } else {
        syncStatus = `FAILED_${response.status}`;
        console.warn(`⚠️ [POS Sync Error ${response.status}] Pinaka POS error: ${resData.code || resData.message || JSON.stringify(resData)}`);
      }
    } catch (err: any) {
      console.warn(`⚠️ [POS Sync Relay Exception] (${targetUrl}): ${err.message}`);
    }

    // Persist POS Sync Log in PostgreSQL Table 'pos_sync_logs'
    let logEntry: PosSyncLogEntity;
    if (this.isDbConnected && this.posLogRepo) {
      const entity = this.posLogRepo.create({
        merchantId,
        externalOrderId: order.externalOrderId,
        posSystemType: 'WOOCOMMERCE_REST',
        status: syncStatus,
        posTargetUrl: targetUrl,
        payload: posPayload,
      });
      logEntry = await this.posLogRepo.save(entity);
    } else {
      logEntry = {
        id: `uuid-pos-${Date.now()}`,
        merchantId,
        externalOrderId: order.externalOrderId,
        posSystemType: 'WOOCOMMERCE_REST',
        status: syncStatus,
        posTargetUrl: targetUrl,
        payload: posPayload,
        createdAt: new Date(),
        updatedAt: new Date(),
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

  private async setCache(key: string, value: any): Promise<void> {
    if (!this.isRedisConnected || !this.redisClient) return;
    try {
      await this.redisClient.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
    } catch {
      // Ignore cache write error
    }
  }
}
