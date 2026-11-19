import fs from "node:fs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class WebhookDeliveryEngine {
  constructor({ maxRetries = 3, baseDelayMs = 150, dlqPath = "dead_letter_queue.json" } = {}) {
    this.maxRetries = maxRetries;
    this.baseDelayMs = baseDelayMs;
    this.dlqPath = dlqPath;
    this.processedEventIds = new Set();
    this.deadLetterQueue = [];
  }

  /**
   * Processes a webhook event with idempotency protection and exponential backoff retries.
   */
  async deliver(event, targetHandler) {
    const { event_id, type, payload } = event;

    // 1. Idempotency Guard (prevents duplicate processing)
    if (this.processedEventIds.has(event_id)) {
      return {
        status: "DUPLICATE_IGNORED",
        event_id,
        attempts: 0,
        message: "Event ID already processed; skipped duplicate delivery.",
      };
    }

    // 2. Retry Loop with Exponential Backoff
    let lastError = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await targetHandler(event);
        this.processedEventIds.add(event_id);
        return {
          status: "DELIVERED",
          event_id,
          attempts: attempt,
          downstreamResponse: result,
        };
      } catch (err) {
        lastError = err.message;
        if (attempt < this.maxRetries) {
          const backoffMs = this.baseDelayMs * Math.pow(2, attempt - 1);
          await sleep(backoffMs);
        }
      }
    }

    // 3. Route to Dead-Letter Queue (DLQ) after max retries exhausted
    const dlqEntry = {
      failed_at_utc: new Date().toISOString(),
      event_id,
      type,
      attempts: this.maxRetries,
      last_error: lastError,
      payload,
    };
    this.deadLetterQueue.push(dlqEntry);
    fs.writeFileSync(this.dlqPath, JSON.stringify(this.deadLetterQueue, null, 2), "utf8");

    return {
      status: "MOVED_TO_DLQ",
      event_id,
      attempts: this.maxRetries,
      last_error: lastError,
    };
  }

  /**
   * Replays all failed events currently stored in the Dead-Letter Queue.
   */
  async replayDeadLetterQueue(targetHandler) {
    const pending = [...this.deadLetterQueue];
    this.deadLetterQueue = [];
    const results = [];

    for (const item of pending) {
      const outcome = await this.deliver(
        { event_id: item.event_id, type: item.type, payload: item.payload },
        targetHandler
      );
      results.push(outcome);
    }
    fs.writeFileSync(this.dlqPath, JSON.stringify(this.deadLetterQueue, null, 2), "utf8");
    return results;
  }
}
