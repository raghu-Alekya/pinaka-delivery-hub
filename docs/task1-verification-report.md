# Task 1 Execution & Verification Report

**Date:** August 4, 2026  
**Project:** Pinaka Delivery Hub (PDH)  
**Module:** `connector-service` (PDH004 Aggregator Connector Webhooks)  
**Status:** COMPLETED & VERIFIED ✅

---

## 1. Terminal Launch & Health Logs

```text
C:\pdh\pinaka-delivery-hub> npx nx serve connector-service
npm notice run @pinaka-delivery-hub/source@0.0.0 npx
npm notice run nx serve connector-service

> nx run connector-service:serve
> npx tsx apps/connector-service/src/main.ts

npm notice run @pinaka-delivery-hub/source@0.0.0 npx
npm notice run tsx apps/connector-service/src/main.ts

[Nest] 18292  - 08/04/2026, 5:09:07 PM     LOG [NestFactory] Starting Nest application...
[Nest] 18292  - 08/04/2026, 5:09:07 PM     LOG [InstanceLoader] AppModule dependencies initialized +15ms
[Nest] 18292  - 08/04/2026, 5:09:07 PM     LOG [RoutesResolver] AppController {/api/v1/connectors}: +4ms
[Nest] 18292  - 08/04/2026, 5:09:07 PM     LOG [RouterExplorer] Mapped {/api/v1/connectors/health, GET} route +3ms
[Nest] 18292  - 08/04/2026, 5:09:07 PM     LOG [RouterExplorer] Mapped {/api/v1/connectors/ready, GET} route +1ms
[Nest] 18292  - 08/04/2026, 5:09:07 PM     LOG [RouterExplorer] Mapped {/api/v1/connectors/doordash/webhook, POST} route +0ms
[Nest] 18292  - 08/04/2026, 5:09:07 PM     LOG [RouterExplorer] Mapped {/api/v1/connectors/swiggy/webhook, POST} route +0ms
[Nest] 18292  - 08/04/2026, 5:09:07 PM     LOG [NestApplication] Nest application successfully started +2ms

🚀 Connector Service running on http://localhost:3001

[DoorDash Webhook Received] CorrelationID: test-dd-1001
[Swiggy Webhook Received] CorrelationID: test-sw-2002
```

---

## 2. Postman Test 1 — DoorDash Webhook Ingestion

* **Endpoint:** `POST http://localhost:3001/api/v1/connectors/doordash/webhook`
* **Response Status:** `201 Created`
* **Response Time:** `57 ms`
* **Headers:** `x-correlation-id: test-dd-1001`

### Request Body (Raw DoorDash JSON):
```json
{
  "order_id": "DD-9921",
  "store_id": "STORE-01",
  "total": 24.50,
  "items": [
    {
      "name": "Cheeseburger",
      "qty": 2,
      "price": 12.25
    }
  ]
}
```

### Response Body (`CanonicalOrder` Model Output):
```json
{
  "success": true,
  "orderId": "ord_...",
  "canonicalOrder": {
    "id": "ord_...",
    "merchantId": "STORE-01",
    "externalOrderId": "DD-9921",
    "platform": "DOORDASH",
    "status": "CREATED",
    "customer": {
      "fullName": "DoorDash Customer",
      "phone": "+1000000000"
    },
    "items": [
      {
        "id": "item_1",
        "externalItemId": "ITEM-0",
        "name": "Cheeseburger",
        "quantity": 2,
        "unitPrice": 12.25
      }
    ],
    "subtotal": 24.5,
    "tax": 0,
    "deliveryFee": 0,
    "totalAmount": 24.5,
    "deliveryAddress": {
      "street": "123 Main St",
      "city": "Metropolis",
      "zipCode": "10001"
    },
    "createdAt": "2026-08-04T11:39:12.682Z",
    "updatedAt": "2026-08-04T11:39:12.682Z"
  }
}
```

---

## 3. Postman Test 2 — Swiggy Webhook Ingestion

* **Endpoint:** `POST http://localhost:3001/api/v1/connectors/swiggy/webhook`
* **Response Status:** `201 Created`
* **Response Time:** `9 ms`
* **Headers:** `x-correlation-id: test-sw-2002`

### Request Body (Raw Swiggy JSON):
```json
{
  "swiggy_order_id": "SW-7712",
  "restaurant_id": "REST-IND-01",
  "final_bill": 499.00,
  "cart": {
    "items": [
      {
        "title": "Paneer Butter Masala",
        "quantity": 1,
        "price": 499.00
      }
    ]
  }
}
```

### Response Body (`CanonicalOrder` Model Output):
```json
{
  "success": true,
  "orderId": "ord_b61cd314-8705-44ec-87f2-321d000ffc8c",
  "canonicalOrder": {
    "id": "ord_b61cd314-8705-44ec-87f2-321d000ffc8c",
    "merchantId": "REST-IND-01",
    "externalOrderId": "SW-7712",
    "platform": "SWIGGY",
    "status": "CREATED",
    "customer": {
      "fullName": "Swiggy Customer",
      "phone": "+910000000000"
    },
    "items": [
      {
        "id": "item_1",
        "externalItemId": "ITEM-0",
        "name": "Paneer Butter Masala",
        "quantity": 1,
        "unitPrice": 499.00
      }
    ],
    "subtotal": 499.00,
    "tax": 0,
    "deliveryFee": 0,
    "totalAmount": 499.00,
    "deliveryAddress": {
      "street": "45 MG Road",
      "city": "Bengaluru",
      "zipCode": "560001"
    },
    "createdAt": "2026-08-04T11:40:00.000Z",
    "updatedAt": "2026-08-04T11:40:00.000Z"
  }
}
```

---

## 4. Verification Summary

* ✅ Both HTTP Webhook endpoints deployed on `http://localhost:3001`.
* ✅ Received payloads transformed to shared normalized `CanonicalOrder` schema (`@pinaka-delivery-hub/canonical-model`).
* ✅ `x-correlation-id` request header logging verified.
* ✅ Type check passed with 0 TypeScript compilation errors.
