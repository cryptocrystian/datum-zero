import type { DeliveryAdapter, DeliveryResult } from "./types";

/**
 * GENERIC_WEBHOOK adapter (CR-05) — POST the canonical JSON payload to the client's endpoint.
 * The client's IT team maps it to any ticketing tool with no custom code from Datum Zero.
 */
export const genericWebhookAdapter: DeliveryAdapter = {
  targetType: "GENERIC_WEBHOOK",

  async deliver(payload, target, opts): Promise<DeliveryResult> {
    const url = (target.config as { url?: string } | null)?.url;
    if (!url) {
      // Misconfigured integration — not retryable.
      return { ok: false, status: 0, downstreamRef: null, retryable: false };
    }

    const idempotencyKey = (payload as { idempotency_key?: string }).idempotency_key ?? "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeoutMs ?? 10_000);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-idempotency-key": idempotencyKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      let downstreamRef: string | null = null;
      try {
        const body = (await res.clone().json()) as { id?: string; ref?: string; ticket_id?: string };
        downstreamRef = body?.id ?? body?.ref ?? body?.ticket_id ?? null;
      } catch {
        // Non-JSON / empty response body is fine.
      }

      const ok = res.status >= 200 && res.status < 300;
      const retryable = res.status >= 500 || res.status === 429;
      return { ok, status: res.status, downstreamRef, retryable };
    } catch {
      // Network error / timeout — retryable.
      return { ok: false, status: 0, downstreamRef: null, retryable: true };
    } finally {
      clearTimeout(timer);
    }
  },
};
