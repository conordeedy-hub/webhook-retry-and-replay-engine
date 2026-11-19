import { signPayload, verifySignature } from "./security.js";
import { WebhookDeliveryEngine } from "./queue_engine.js";

const WEBHOOK_SECRET = "whsec_live_demo_secret_key_2026";
const engine = new WebhookDeliveryEngine({ maxRetries: 3, baseDelayMs: 100 });

// Simulated downstream service that fails twice before recovering
let transientFailures = 2;
async function flakyBillingService(event) {
  if (event.type === "invoice.payment_failed_perm") {
    throw new Error("HTTP 503: Downstream ERP database offline");
  }
  if (event.type === "invoice.paid" && transientFailures > 0) {
    transientFailures--;
    throw new Error("HTTP 502: Temporary upstream gateway timeout");
  }
  return { accepted: true, processedType: event.type };
}

async function runDemo() {
  console.log("\n=== WEBHOOK SECURITY, RETRY & DEAD-LETTER QUEUE DEMO ===\n");

  // 1. Tampered Signature Test
  const rawEvent1 = JSON.stringify({ event_id: "evt_001", type: "user.created", payload: { userId: 42 } });
  const isTamperedValid = verifySignature(WEBHOOK_SECRET, rawEvent1, "sha256=invalid_forged_signature");
  console.log(`1. Forged HMAC Signature Check -> Valid: ${isTamperedValid} (Rejected with HTTP 401)`);

  // 2. Valid Signature + Transient Timeout Recovery (Retries & Succeeds on Attempt 3)
  const validEvent = { event_id: "evt_002", type: "invoice.paid", payload: { amount: 14900 } };
  const sig2 = signPayload(WEBHOOK_SECRET, JSON.stringify(validEvent));
  if (verifySignature(WEBHOOK_SECRET, JSON.stringify(validEvent), sig2)) {
    const res2 = await engine.deliver(validEvent, flakyBillingService);
    console.log(`2. Transient Outage Recovery   -> ${res2.status} on attempt #${res2.attempts}`);
  }

  // 3. Duplicate Webhook Replay Protection (Idempotency)
  const dupRes = await engine.deliver(validEvent, flakyBillingService);
  console.log(`3. Duplicate Delivery Guard    -> ${dupRes.status} (${dupRes.message})`);

  // 4. Permanent Downstream Failure -> Routed to Dead-Letter Queue
  const failingEvent = { event_id: "evt_003", type: "invoice.payment_failed_perm", payload: { amount: 5000 } };
  const res4 = await engine.deliver(failingEvent, flakyBillingService);
  console.log(`4. Exhausted Retries           -> ${res4.status} after ${res4.attempts} attempts (${res4.last_error})`);

  // 5. Manual Operator Replay after Downstream Service Recovers
  console.log("5. Downstream Service Restored -> Replaying Dead-Letter Queue...");
  const healthyService = async (evt) => ({ accepted: true, recovered: evt.event_id });
  const replayResults = await engine.replayDeadLetterQueue(healthyService);
  console.log(`   -> Replay Outcome: ${replayResults[0].status} for ${replayResults[0].event_id}\n`);
}

runDemo();
