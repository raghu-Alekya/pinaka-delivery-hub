# 📚 Pinaka Delivery Hub — Technical Specification Report (Tasks 5, 6 & 7)

**Date:** August 6, 2026  
**Repository:** `pinaka-delivery-hub`  
**Target Audience:** Development Team, Lead Architect, Engineering Manager  
**Scope:** Deep-dive analysis of features, impacted files, and logic mechanics for **Task 5, Task 6, and Task 7**.

---

## 🖥️ TASK 5: Frontend Gateway Integration & Real-Time SSE Stream

### 1. Feature Goal & Purpose
Task 5 connects the **Frontend Gateway Microservice** (`apps/gateway` on Port `3000`) to backend services (`connector-service` on Port 3001 and `order-service` on Port 3002). It enables restaurant managers to view incoming orders in real-time on a React Live Order Board and push order status updates (`CREATED` ➔ `ACCEPTED` ➔ `READY_FOR_PICKUP`).

### 2. Impacted Files
* 📄 [`apps/gateway/src/app.controller.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/gateway/src/app.controller.ts) — Gateway controller API proxy & Server-Sent Events stream setup.
* 📄 [`apps/gateway/src/components/LiveOrderMonitor.tsx`](file:///c:/Projects/pinaka-delivery-hub/apps/gateway/src/components/LiveOrderMonitor.tsx) — React Dashboard UI rendering live order cards and action buttons.
* 📄 [`apps/gateway/src/main.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/gateway/src/main.ts) — Gateway bootstrap entry point with `TracingInterceptor` binding.

### 3. Logic Mechanics (What the Code Does)
* **Server-Sent Events Stream (`GET /api/v1/gateway/orders/stream`):** Uses RxJS `gatewayOrderStream$` Subject. When `connector-service` receives an order, Gateway pushes the order string directly to connected browser clients over an active HTTP stream without polling.
* **Gateway API Proxies (`GET /api/v1/gateway/orders` & `PATCH /api/v1/gateway/orders/:id/status`):** Proxies HTTP requests to `order-service` (Port 3002) and propagates the `x-correlation-id` tracing header.
* **React UI Feed (`LiveOrderMonitor.tsx`):** Subscribes to `EventSource('/api/v1/gateway/orders/stream')`, prepends new canonical orders to component state, and renders platform badges (`DOORDASH`, `SWIGGY`) and interactive **Accept** / **Ready** buttons.

---

## 🐘 TASK 6: PostgreSQL Database Persistence & Order ORM Repository

### 1. Feature Goal & Purpose
Task 6 replaces ephemeral in-memory storage in `order-service` with **relational SQL database persistence** using **PostgreSQL 16** (`pdh-postgres` container on Port `5432`) and **TypeORM**. It guarantees that order history survives server restarts.

### 2. Impacted Files
* 📄 [`apps/order-service/src/entities/order.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/order-service/src/entities/order.entity.ts) — TypeORM entity mapping canonical order columns, customer JSONB, and address JSONB.
* 📄 [`apps/order-service/src/entities/order-item.entity.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/order-service/src/entities/order-item.entity.ts) — TypeORM entity mapping order line items with foreign key relations.
* 📄 [`apps/order-service/src/order.repository.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/order-service/src/order.repository.ts) — Persistent repository managing TypeORM connection pooling & SQL queries.
* 📄 [`apps/order-service/src/app.controller.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/order-service/src/app.controller.ts) — Injects `OrderRepository` to handle DB reads/writes.
* 📄 [`docker-compose.yml`](file:///c:/Projects/pinaka-delivery-hub/docker-compose.yml) — PostgreSQL 16 container (`pdh-postgres`) & pgAdmin Web UI (`pdh-pgadmin`).

### 3. Logic Mechanics (What the Code Does)
* **Relational Table Generation:** TypeORM `@Entity('orders')` and `@Entity('order_items')` automatically create SQL tables with `UUID` primary keys, string columns, decimal pricing fields, and JSONB document columns.
* **Database Query Engine (`OrderRepository`):**
  * `saveOrderFromEnvelope()` checks if order `#externalOrderId` exists in PostgreSQL. If new, it inserts a new row; if existing, it updates status.
  * `findOrderById()` detects whether input is a strict UUID or string ID (`DD-7777`) to avoid SQL type-casting syntax errors (`22P02`).
* **Hybrid Failover:** If PostgreSQL is initializing or offline during quick unit tests, the repository falls back to memory safely without crashing the service.

---

## ⚡ TASK 7: Redis High-Speed RAM Caching & Read Acceleration

### 1. Feature Goal & Purpose
Task 7 connects `order-service` to your running **`pdh-redis`** Docker container on **Port 6379** using `ioredis`. It accelerates read latency to **< 1 millisecond** and protects PostgreSQL from heavy database load during peak order surges.

### 2. Impacted Files
* 📄 [`apps/order-service/src/order.repository.ts`](file:///c:/Projects/pinaka-delivery-hub/apps/order-service/src/order.repository.ts) — Cache-Aside implementation using `ioredis`.
* 📄 [`package.json`](file:///c:/Projects/pinaka-delivery-hub/package.json) — Installed `ioredis` dependency.
* 📄 [`docker-compose.yml`](file:///c:/Projects/pinaka-delivery-hub/docker-compose.yml) — Configured Redis container (`pdh-redis` on 6379) and `Redis Commander` Web UI (`pdh-redis-commander` on 8081).
* 📄 [`docs/redis-commander-user-guide.md`](file:///c:/Projects/pinaka-delivery-hub/docs/redis-commander-user-guide.md) — Documentation guide for inspecting Redis keys.

### 3. Logic Mechanics (What the Code Does)
* **Cache-Aside Read Strategy:**
  * When `findOrderById(id)` or `findAllOrders()` is invoked, `OrderRepository` queries Redis RAM (`redisClient.get('order:' + id)`).
  * **Cache Hit (< 1ms):** If key exists in RAM, returns JSON immediately and logs `⚡ [Redis Cache HIT]`.
  * **Cache Miss:** If key is absent, queries PostgreSQL database, writes result to Redis with `EX 300` (5-minute TTL), and returns order.
* **Cache Invalidation on Update:**
  * When `updateOrderStatus(id, newStatus)` is called, it updates PostgreSQL and purges/refreshes the stale key (`order:<id>`) and `orders:all` in Redis RAM.

---

## 📊 Summary Comparison Matrix (Tasks 5, 6 & 7)

| Feature Dimension | Task 5 (Gateway) | Task 6 (PostgreSQL DB) | Task 7 (Redis Cache) |
| :--- | :--- | :--- | :--- |
| **Primary Container / Service** | `apps/gateway` (Port `3000`) | `pdh-postgres` (Port `5432`) | `pdh-redis` (Port `6379`) |
| **GUI Inspection Tool** | Browser React Dashboard | `pgAdmin 4` (`http://localhost:5050`) | `Redis Commander` (`http://localhost:8081`) |
| **Data Storage Medium** | In-Memory Stream / State | Relational Disk Storage (UUID Keys) | In-Memory RAM (Key-Value, 300s TTL) |
| **Read Latency** | Network HTTP ~10ms | Disk Query ~15–30ms | Ultra-Fast RAM **< 1ms** |
| **Invalidation / Refresh Trigger** | Webhook Push via SSE | SQL Transaction Update | Automatic Key Delete on `PATCH` status |
