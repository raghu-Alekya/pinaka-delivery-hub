# 🗺️ Pinaka Delivery Hub — Master Project Roadmap & Task Status

**Date:** August 6, 2026  
**Repository:** `pinaka-delivery-hub`  
**Current Milestone:** Sprint 2 Active (7 / 12 Tasks Completed) ✅

---

## ✅ COMPLETED TASKS (1 – 7)

| Task # | Module / Component | Primary Port | Key Achievements / Deliverables | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Task 1** | `apps/connector-service` | `3001` | Ingest DoorDash & Swiggy webhooks and normalize raw payloads into standard `CanonicalOrder` models. | **COMPLETE ✅** |
| **Task 2** | `libs/messaging` & `apps/order-service` | `3002` | Wrap normalized orders into `EventEnvelope` and broadcast `ORDER_RECEIVED` events across microservice boundaries. | **COMPLETE ✅** |
| **Task 3** | `libs/validation` | Workspace | Implement `CreateDoorDashOrderDto`, `CreateSwiggyOrderDto`, `UpdateOrderStatusDto`, and `ParseEnumPipe` status guards. | **COMPLETE ✅** |
| **Task 4** | `libs/observability` | Workspace | Implement `TracingInterceptor` for end-to-end `x-correlation-id` request tracing and execution latency logging. | **COMPLETE ✅** |
| **Task 5** | `apps/gateway` | `3000` | Implement Gateway API proxies, Server-Sent Events (`SSE`) stream (`/api/v1/gateway/orders/stream`), and React `LiveOrderMonitor` UI. | **COMPLETE ✅** |
| **Task 6** | `pdh-postgres` Container | `5432`<br>`5050` | Implement TypeORM `OrderEntity` and `OrderItemEntity` schemas in PostgreSQL (`pinaka_delivery_hub`) with `pgAdmin 4` Web UI. | **COMPLETE ✅** |
| **Task 7** | `pdh-redis` Container | `6379`<br>`8081` | Implement sub-millisecond Redis RAM caching (`order:<id>`, `orders:all`) with automatic cache invalidation and `Redis Commander` Web UI. | **COMPLETE ✅** |

---

## ⏳ PENDING ROADMAP TASKS (8 – 12)

### 🔹 Task 8: Production RabbitMQ AMQP Message Broker (`pdh-rabbitmq`)
* **Scope:** [`libs/messaging`](file:///c:/Projects/pinaka-delivery-hub/libs/messaging) & [`apps/order-service`](file:///c:/Projects/pinaka-delivery-hub/apps/order-service)
* **Goal:** Connect NestJS Microservice AMQP transport to publish and consume durable queues (`pdh_orders_queue`) on `pdh-rabbitmq` container (`amqp://guest:guest@localhost:5672`) with automatic message acknowledgment (`ack`) and Dead-Letter Queues (`DLQ`).

### 🔹 Task 9: Merchant & Store Configuration Management (`apps/merchant-service`)
* **Scope:** [`apps/merchant-service`](file:///c:/Projects/pinaka-delivery-hub/apps/merchant-service) (Port `3003`)
* **Goal:** Manage merchant profiles, store operational hours, auto-accept toggles, and delivery partner API keys (DoorDash API Secret, Swiggy Restaurant ID).

### 🔹 Task 10: Multi-Platform Menu Synchronization Engine (`apps/menu-service`)
* **Scope:** [`apps/menu-service`](file:///c:/Projects/pinaka-delivery-hub/apps/menu-service) (Port `3004`)
* **Goal:** Push menu updates, item price overrides, and 86-ing (marking sold-out items unavailable) out to DoorDash and Swiggy.

### 🔹 Task 11: Inventory & Stock Auto-Deduction Engine (`apps/inventory-service`)
* **Scope:** [`apps/inventory-service`](file:///c:/Projects/pinaka-delivery-hub/apps/inventory-service) (Port `3005`)
* **Goal:** Automatically deduct stock when orders arrive and trigger low-stock alerts when ingredients drop below safety thresholds.

### 🔹 Task 12: Analytics, Revenue & Order Metrics Service (`apps/analytics-service`)
* **Scope:** [`apps/analytics-service`](file:///c:/Projects/pinaka-delivery-hub/apps/analytics-service) (Port `3006`)
* **Goal:** Aggregate hourly revenue metrics, platform order breakdown (DoorDash vs Swiggy), average preparation times, and order cancellation trends.
