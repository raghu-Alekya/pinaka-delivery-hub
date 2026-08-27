# 🛒 Pinaka Commerce Hub (PCH) — Master Architectural Strategy & Implementation Blueprint

---

## 💡 Executive Layman's Summary

### What is Pinaka Commerce Hub (PCH)?
Imagine a busy retail store or restaurant. 
- **PCH (Pinaka Commerce Hub)** is the **brain and control room inside the store**. It manages cash registers (POS), barcodes, inventory on shelves, staff shifts, cash drawers, receipt printers, and merchant onboarding.
- **PDH (Pinaka Delivery Hub)** is the **specialized phone and online delivery desk**. It listens for incoming orders from external delivery platforms (DoorDash, Uber Eats, Swiggy, Zomato, Instacart) and passes them into the store's main control room (PCH).

### How do PCH and PDH work together?
1. Every merchant (whether a **Restaurant**, **Grocery Store**, or **Convenience Store**) logs into **`pch.alekyatechsolutions.com`**.
2. If the merchant turns on **Delivery Integration**, **PDH** activates in the background to handle food and grocery aggregators.
3. All orders—whether paid at the cash register (POS) or received online from Uber Eats/Instacart—land in **PCH's Single Unified Dashboard**.

---

## 🏛️ Architectural Strategy & 100% Code Reuse Plan

### Rule #1: Zero Waste Code Policy
We are **NOT throwing away or rebuilding** the existing delivery codebase. Every connector, entity, service, test, and container created under PDH will be **retained, refactored, and expanded**.

### Architecture Mapping: Preserved vs. Extended vs. New

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           PINAKA COMMERCE HUB (PCH)                              │
│                                (NX Monorepo)                                     │
└────────────────────────────────────────┬─────────────────────────────────────────┘
                                         │
       ┌─────────────────────────────────┴─────────────────────────────────┐
       ▼                                                                   ▼
┌──────────────────────────────────────────────┐ ┌──────────────────────────────────────────────┐
│  EXISTING PDH SERVICES (100% REUSED)         │ │  NEW PCH SERVICES (BUILDING INCREMENTALLY)   │
├──────────────────────────────────────────────┤ ├──────────────────────────────────────────────┤
│ 🟢 apps/connector-service (Aggregator Webhooks)│ │ 🆕 apps/picking-service (Barcode Scan/Aisle) │
│ 🟢 apps/order-service (Order State Machine)  │ │ 🆕 apps/substitution-service (Out-of-Stock) │
│ 🟢 apps/pos-integration-service (POS Relay)  │ │ 🆕 apps/staging-service (Cold-Chain Totes)   │
│ 🟢 apps/analytics-service (KPI Dashboards)   │ │ 🆕 apps/subscription-service (Entitlements)  │
│ 🟢 apps/auth-service & libs/auth             │ │ 🆕 apps/device-service (MQTT Local Printers) │
│ 🟢 apps/inventory-service (Stock Sync)       │ │ ⚡ apps/catalog-service (Replaces menu-serv) │
└──────────────────────────────────────────────┘ └──────────────────────────────────────────────┘
```

---

## 🔄 Plain English Layman's Breakdown of Key Concepts

| Concept | Restaurant (PDH) | Retail & Grocery (PCH) | How We Bridge Both |
| :--- | :--- | :--- | :--- |
| **Catalog** | Dishes, Modifiers (e.g. Extra Cheese), Cook time. | SKUs, UPC Barcodes, Aisles, Unit Weights (kg/lb). | `catalog-service` supports both Dish trees and SKU taxonomies. |
| **Order Flow** | Cashier ➔ Kitchen (Cook) ➔ Ready for Pickup. | Picker Scanning ➔ Weight Check ➔ Substitution Approval ➔ Cold Staging. | Unified `Order` state machine handles both Kitchen and Picker workflows. |
| **Pricing** | Fixed dish price ($12.99 + $2 modifier). | Variable weight pricing ($4.50 / kg, final total depends on scale). | Financial engine recalculates subtotal post-picker weigh-in. |
| **Onboarding** | `test.alekyatechsolutions.com` | `pch.alekyatechsolutions.com` | Unified onboarding wizard with vertical selection (Restaurant vs Retail). |

---

## 🛠️ Step-by-Step Build Roadmap

### Phase 1: Workspace Branding & Monorepo Configuration
- [x] Create comprehensive implementation plan & architecture spec in `docs/`.
- [ ] Update `package.json` workspace name from `@pinaka-delivery-hub/source` ➔ `@pinaka-commerce-hub/source`.
- [ ] Verify existing NX workspace builds cleanly with pnpm (`pnpm nx run-many -t build`).

### Phase 2: Extend Canonical Schema (`libs/canonical-model`)
- [ ] Add `RetailOrder`, `RetailOrderItem`, `UPC/EAN` barcode, `TemperatureZone` (`AMBIENT`, `CHILLED`, `FROZEN`), and catch-weight fields.
- [ ] Ensure backward compatibility so existing PDH restaurant delivery orders pass without changes.

### Phase 3: Catalog Microservice (`apps/catalog-service`)
- [ ] Upgrade/extend `menu-service` to `catalog-service`.
- [ ] Add database tables for `departments`, `categories`, `aisles`, `skus`, `barcodes`, and `plu_codes`.

### Phase 4: Retail Picker, Substitution, & Staging Services
- [ ] Implement `apps/picking-service` for handheld barcode scanner routing.
- [ ] Implement `apps/substitution-service` for out-of-stock replacement rules & customer SMS alerts.
- [ ] Implement `apps/staging-service` for cold-chain tote staging.

### Phase 5: Unified Merchant Portal (`pch.alekyatechsolutions.com`)
- [ ] Build multi-tenant merchant onboarding UI supporting both Grocery/Retail and Restaurant verticals.
- [ ] Integrate PDH Delivery Platform Entitlement toggles (Uber Eats, DoorDash, Swiggy, Zomato, Instacart).

---

## 🎯 Layman Verification Checklist
To confirm everything is working properly after each phase:
1. **Can existing delivery webhooks (Uber Eats/DoorDash) still create orders?** ✅ YES.
2. **Can retail barcode scanners pick and weigh items?** ✅ YES.
3. **Does the merchant see all orders in one dashboard?** ✅ YES.
