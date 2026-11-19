# Webhook Security, Retry & Dead-Letter Queue Engine (`webhook-retry-and-replay-engine`)

A lightweight, zero-dependency **JavaScript (Node.js)** reliability engine that validates incoming webhook signatures using **HMAC-SHA256**, prevents duplicate event processing via **idempotency keys**, handles transient downstream outages with **exponential backoff retries**, and routes failed events to a **Dead-Letter Queue (DLQ)** with operator replay support.

## Why I Built This
Modern SaaS platforms rely on webhooks to synchronize billing, CRM, and customer events across REST APIs. When downstream services time out or duplicate webhooks arrive, data falls out of sync. This project implements the core reliability and security patterns used in production API gateways and SaaS integration pipelines.

## Key Features
- **HMAC-SHA256 Signature Verification (`security.js`):** Uses constant-time cryptographic comparison (`crypto.timingSafeEqual`) to authenticate incoming webhook payloads and reject forged requests.
- **Idempotency Deduplication (`queue_engine.js`):** Tracks processed `event_id` values to prevent duplicate side effects when providers re-send identical webhooks.
- **Exponential Backoff Retries:** Automatically retries transient failures (`HTTP 502/503`) with configurable retry counts and backoff delays.
- **Dead-Letter Queue & Replay (`dead_letter_queue.json`):** Persists exhausted events to disk for root-cause inspection and replays them cleanly once downstream services recover.

## Quickstart (Zero External Dependencies)
Requires Node.js 18+. No `npm install` or external packages required.

```bash
git clone https://github.com
cd webhook-retry-and-replay-engine
node demo.js
```

## Sample Output
```text
=== WEBHOOK SECURITY, RETRY & DEAD-LETTER QUEUE DEMO ===

1. Forged HMAC Signature Check -> Valid: false (Rejected with HTTP 401)
2. Transient Outage Recovery   -> DELIVERED on attempt #3
3. Duplicate Delivery Guard    -> DUPLICATE_IGNORED (Event ID already processed; skipped duplicate delivery.)
4. Exhausted Retries           -> MOVED_TO_DLQ after 3 attempts (HTTP 503: Downstream ERP database offline)
5. Downstream Service Restored -> Replaying Dead-Letter Queue...
   -> Replay Outcome: DELIVERED for evt_003
```
