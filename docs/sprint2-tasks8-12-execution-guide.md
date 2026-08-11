# 📘 Pinaka Delivery Hub — Sprint 2 Technical Execution Guide (Tasks 8 – 12)

**Date:** August 11, 2026  
**Repository:** `pinaka-delivery-hub`  
**Target Audience:** Software Engineers, Lead Architects, Technical Project Managers, System Administrators  
**Status:** COMPLETED & VERIFIED (0 TypeScript Errors) ✅

---

## 📌 Executive Overview & Architecture Scope

This technical document details the implementation, architecture, impacted files, business implications, and step-by-step execution workflows for **Tasks 8 through 12** of the Pinaka Delivery Hub (PDH) multi-channel food aggregator integration platform.

### Microservices & Ports Architecture Matrix

```text
               ┌─────────────────────────────────────────────────────────┐
               │           REACT LIVE ORDER BOARD & GATEWAY              │
               │                   http://localhost:3000                 │
               └────────────────────────────┬────────────────────────────┘
                                            │
        ┌───────────────────────────────────┼───────────────────────────────────┐
        │                                   │                                   │
┌───────▼────────┐                ┌─────────▼────────┐                ┌─────────▼────────┐
│  CONNECTOR SVC │                │   ORDER SERVICE  │                │   MERCHANT SVC   │
│   (Port 3001)  │                │   (Port 3002)    │                │   (Port 3003)    │
└───────┬────────┘                └─────────┬────────┘                └─────────┬────────┘
        │                                   │                                   │
        │       ┌───────────────────────────┴───────────────────────────┐       │
        └──────►│    GLOBAL EVENT BUS & RABBITMQ (amqp://localhost:5672) │◄──────┘
                └───────────────────────────┬───────────────────────────┘
                                            │
        ┌───────────────────────────────────┼───────────────────────────────────┐
        │                                   │                                   │
┌───────▼────────┐                ┌─────────▼────────┐                ┌─────────▼────────┐
│    MENU SVC    │                │  INVENTORY SVC   │                │   ANALYTICS SVC  │
│   (Port 3004)  │                │   (Port 3005)    │                │   (Port 3006)    │
└────────────────┘                └──────────────────┘                └──────────────────┘
```

| Microservice / Module | Port | Technology Stack | Primary Purpose |
| :--- | :--- | :--- | :--- |
| **`connector-service`** | `3001` | NestJS, `class-validator` | Normalizes DoorDash & Swiggy webhooks to `CanonicalOrder` models. |
| **`order-service`** | `3002` | NestJS, TypeORM, PostgreSQL, Redis | Manages canonical order lifecycle, SQL persistence, and fast reads. |
| **`merchant-service`** | `3003` | NestJS, TypeORM, PostgreSQL, Redis | Manages store operational hours, auto-accept toggles, and API keys. |
| **`menu-service`** | `3004` | NestJS, TypeORM, PostgreSQL, Redis | Handles master menu catalog, price overrides, and instant 86-Item (sold out) control. |
| **`inventory-service`** | `3005` | NestJS, TypeORM, PostgreSQL, Redis | Auto-deducts ingredient stock on order placement and fires low-stock alerts. |
| **`analytics-service`** | `3006` | NestJS, TypeORM, PostgreSQL, Redis | Calculates real-time gross revenue, order volume, AOV, and platform share. |

---

## 🐇 TASK 8: Production RabbitMQ AMQP Message Broker (`pdh-rabbitmq`)

### 1. Purpose & Business Implication
In enterprise microservices, synchronous HTTP calls between services can fail or timeout during traffic spikes. Task 8 introduces asynchronous **AMQP queue messaging** via Docker container **`pdh-rabbitmq`** (Port `5672`).
* **Implication:** Guarantees zero message loss. If a downstream service (`order-service` or `inventory-service`) experiences a temporary network hiccup, RabbitMQ stores the message safely in a durable queue (`pdh_orders_queue`) until acknowledged (`ack`).

### 2. Files Changed / Created
* 📄 [`libs/messaging/src/index.ts`](file:///c:/Projects/pinaka-delivery-hub/libs/messaging/src/index.ts) — Implemented `OrderEventBus` AMQP publisher, durable queue assertion, consumer acknowledgement, and multi-consumer fallback targets.
* 📄 [`package.json`](file:///c:/Projects/pinaka-delivery-hub/package.json) — Installed `amqplib`, `@types/amqplib`, and `@nestjs/microservices`.

### 3. Step-by-Step Execution & Verification
1. Ensure RabbitMQ container is running: `docker compose up -d`
2. Restart `connector-service` (3001) and `order-service` (3002).
3. Send DoorDash webhook:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3001/api/v1/connectors/doordash/webhook" `
     -Method POST `
     -Headers @{ "Content-Type" = "application/json"; "x-correlation-id" = "t8-verify" } `
     -Body '{"order_id": "DD-800", "store_id": "STORE-01", "total": 25.00, "items": [{"name": "Burger", "qty": 1, "price": 25.00}]}'
   ```
4. Observe terminal log: `🐇 [RabbitMQ AMQP Published] Queue: pdh_orders_queue`.
5. Access RabbitMQ Web Console: 👉 **[`http://localhost:15672`](http://localhost:15672)** (`guest` / `guest`).

---

## 🏪 TASK 9: Merchant & Store Configuration Management (`apps/merchant-service`)

### 1. Purpose & Business Implication
Multi-tenant restaurant platforms need a single source of truth to manage store operational states, operating hours, auto-accept rules, and delivery channel API keys.
* **Implication:** Allows restaurant owners to pause ordering (Busy / Kitchen Pause mode), toggle auto-accepting orders, and store sandbox API keys (`DOORDASH`, `SWIGGY`) centrally on Port `3003`.

### 2. Files Changed / Created
* 📄 [`apps/merchant-service/src/merchant.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/merchant-service/src/merchant.entity.ts) — TypeORM entity mapping `merchants` table.
* 📄 [`apps/merchant-service/src/merchant.repository.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/merchant-service/src/merchant.repository.ts) — Database persistence & Redis caching (`merchant:<id>`).
* 📄 [`apps/merchant-service/src/app.controller.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/merchant-service/src/app.controller.ts) — REST endpoints for merchant management.
* 📄 [`apps/merchant-service/src/main.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/merchant-service/src/main.ts) — NestJS service bootstrap on Port `3003`.

### 3. Step-by-Step Execution & Verification
1. Start service: `npx nx serve merchant-service`
2. Query default store `STORE-01`:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3003/api/v1/merchants/STORE-01" -Method GET
   ```
3. Toggle store status to `PAUSED` (Busy Mode):
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3003/api/v1/merchants/STORE-01/status" `
     -Method PATCH `
     -Headers @{ "Content-Type" = "application/json" } `
     -Body '{"status": "PAUSED"}'
   ```

---

## 🍕 TASK 10: Multi-Platform Menu Synchronization Engine & 86-Item Control (`apps/menu-service`)

### 1. Purpose & Business Implication
Managing separate menu portals for DoorDash, Swiggy, and Uber Eats creates price discrepancies and out-of-stock order cancellation penalties.
* **Implication:** Provides a master menu catalog per merchant. When a kitchen runs out of an item, managers can **"86 / Pause"** that item across all aggregators instantly (`isAvailable: false`). All sync events are permanently logged in PostgreSQL table `menu_sync_logs`.

### 2. Files Changed / Created
* 📄 [`apps/menu-service/src/entities/menu-item.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/menu-service/src/entities/menu-item.entity.ts) — Master menu item entity.
* 📄 [`apps/menu-service/src/entities/menu-sync-audit.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/menu-service/src/entities/menu-sync-audit.entity.ts) — Audit trail table `menu_sync_logs`.
* 📄 [`apps/menu-service/src/menu.repository.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/menu-service/src/menu.repository.ts) — Database persistence & Redis caching (`menu:<id>`).
* 📄 [`apps/menu-service/src/app.controller.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/menu-service/src/app.controller.ts) — REST endpoints for menu CRUD, 86-Item control, and platform sync.

### 3. Step-by-Step Execution & Verification
1. Start service: `npx nx serve menu-service`
2. Query master menu for `STORE-01`:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3004/api/v1/menus/STORE-01" -Method GET
   ```
3. 86 / Pause Item `ITEM-102` (Truffle Fries):
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3004/api/v1/menus/STORE-01/items/ITEM-102/86" `
     -Method PATCH `
     -Headers @{ "Content-Type" = "application/json" } `
     -Body '{"isAvailable": false}'
   ```
4. Trigger full menu synchronization to aggregators:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3004/api/v1/menus/STORE-01/sync" -Method POST
   ```

---

## 📦 TASK 11: Inventory & Stock Auto-Deduction Engine (`apps/inventory-service`)

### 1. Purpose & Business Implication
Manual inventory tracking leads to overselling ingredients during rush hours.
* **Implication:** Maps menu items (`ITEM-101 Cheeseburger`) to raw ingredients (`ING-01 Beef Patty`, `ING-02 Burger Bun`). When an order is placed, stock is automatically deducted in PostgreSQL & Redis. If stock falls below `reorderThreshold`, low-stock warning alerts are triggered automatically.

### 2. Files Changed / Created
* 📄 [`apps/inventory-service/src/entities/inventory.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/inventory-service/src/entities/inventory.entity.ts) — Ingredient stock entity.
* 📄 [`apps/inventory-service/src/inventory.repository.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/inventory-service/src/inventory.repository.ts) — Auto-deduction algorithm & threshold checks.
* 📄 [`apps/inventory-service/src/app.controller.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/inventory-service/src/app.controller.ts) — REST API endpoints & event subscriber.

### 3. Step-by-Step Execution & Verification
1. Start service: `npx nx serve inventory-service`
2. Check baseline stock:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3005/api/v1/inventory/STORE-01" -Method GET
   ```
3. Place order via DoorDash webhook (`connector-service` Port 3001) for 2 Cheeseburgers.
4. Observe log in `inventory-service` terminal: `📦 [Auto-Stock Deduction Complete] Deducted stock for 2 ingredient mappings`.
5. Re-query inventory: Stock for `ING-01` (Beef Patty) auto-deducts from 50 to 48!

---

## 📊 TASK 12: Real-Time Revenue Analytics & Platform Metrics Engine (`apps/analytics-service`)

### 1. Purpose & Business Implication
Restaurant executives require real-time visibility into financial performance and channel revenue share.
* **Implication:** Subscribes to order events and instantly calculates gross revenue ($), order counts, average order value (`AOV`), and platform share (DoorDash vs Swiggy) without blocking order ingestion.

### 2. Files Changed / Created
* 📄 [`apps/analytics-service/src/entities/analytics-snapshot.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/analytics-service/src/entities/analytics-snapshot.entity.ts) — Table `analytics_snapshots`.
* 📄 [`apps/analytics-service/src/analytics.repository.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/analytics-service/src/analytics.repository.ts) — Real-time revenue aggregator & Redis cache (`analytics:<id>`).
* 📄 [`apps/analytics-service/src/app.controller.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/analytics-service/src/app.controller.ts) — REST API endpoints & order event listener.

### 3. Step-by-Step Execution & Verification
1. Start service: `npx nx serve analytics-service`
2. Query live analytics snapshot:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:3006/api/v1/analytics/STORE-01" -Method GET
   ```
3. Post new order webhook for $29.98 to `connector-service` (Port 3001).
4. Observe log in `analytics-service` terminal: `📊 [Analytics Updated] Store #STORE-01 Revenue: $1279.98`.
5. Re-query analytics: `totalRevenue` auto-increments by $29.98!

---

## 🗄️ PostgreSQL Database Schemas & Management Web UIs

All microservices write to PostgreSQL database **`pinaka_delivery_hub`** in Docker container **`pdh-postgres`** (Port `5432`).

### Relational Database Tables Summary

| Table Name | Schema Purpose | Entity File Location |
| :--- | :--- | :--- |
| **`orders`** | Stores canonical order headers, customer JSONB, address JSONB, and total amounts. | [`apps/order-service/src/entities/order.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/order-service/src/entities/order.entity.ts) |
| **`order_items`** | Stores line items (item name, quantity, unit price) linked via foreign key. | [`apps/order-service/src/entities/order-item.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/order-service/src/entities/order-item.entity.ts) |
| **`merchants`** | Stores merchant profiles, status (`OPEN`/`PAUSED`), auto-accept toggles, and channel API keys. | [`apps/merchant-service/src/merchant.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/merchant-service/src/merchant.entity.ts) |
| **`menu_items`** | Stores master menu items, prices, 86 availability status, and platform price overrides. | [`apps/menu-service/src/entities/menu-item.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/menu-service/src/entities/menu-item.entity.ts) |
| **`menu_sync_logs`** | Stores audit trail records for every menu sync execution event. | [`apps/menu-service/src/entities/menu-sync-audit.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/menu-service/src/entities/menu-sync-audit.entity.ts) |
| **`inventory_items`** | Stores raw ingredient stock quantities, reorder thresholds, and recipe mappings. | [`apps/inventory-service/src/entities/inventory.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/inventory-service/src/entities/inventory.entity.ts) |
| **`analytics_snapshots`**| Stores live revenue metrics, total orders, AOV, and platform breakdown JSONB. | [`apps/analytics-service/src/entities/analytics-snapshot.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/analytics-service/src/entities/analytics-snapshot.entity.ts) |

### Infrastructure Management Web Consoles

1. **pgAdmin 4 (PostgreSQL Web UI):** 👉 **[`http://localhost:5050`](http://localhost:5050)** (`admin@pdh.com` / `pdh_password`)
2. **Redis Commander (Redis Web UI):** 👉 **[`http://localhost:8081`](http://localhost:8081)**
3. **RabbitMQ Management Dashboard:** 👉 **[`http://localhost:15672`](http://localhost:15672)** (`guest` / `guest`)

---

## 🌿 GitHub Branch Release Guide

Each task has been developed on isolated feature branches ready for Pull Request code reviews:

```bash
# Task 8: Production RabbitMQ AMQP Broker
git checkout -b feature/messaging-env
git add . && git commit -m "feat(messaging): Task 8 completed - RabbitMQ AMQP messaging integration"
git push origin feature/messaging-env

# Task 9: Merchant Service
git checkout -b feature/merchant-service
git add . && git commit -m "feat(merchant): Task 9 completed - Merchant store config management"
git push origin feature/merchant-service

# Task 10: Menu Service & 86 Engine
git checkout -b feature/menu-service
git add . && git commit -m "feat(menu): Task 10 completed - Multi-platform menu sync and 86-item engine"
git push origin feature/menu-service

# Task 11: Inventory Service
git checkout -b feature/inventory-service
git add . && git commit -m "feat(inventory): Task 11 completed - Stock auto-deduction and low stock alerts"
git push origin feature/inventory-service

# Task 12: Analytics Service
git checkout -b feature/analytics-service
git add . && git commit -m "feat(analytics): Task 12 completed - Real-time revenue analytics & platform metrics"
git push origin feature/analytics-service
```
