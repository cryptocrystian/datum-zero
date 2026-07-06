import type { DeliveryAdapter } from "./types";
import { genericWebhookAdapter } from "./generic-webhook";

/**
 * Delivery-adapter registry (CR-05). One routing interface; targets register here.
 * M0-09 implements GENERIC_WEBHOOK only. NATIVE_JIRA (M0-10) and demand-driven NATIVE_* (M2)
 * register against the SAME interface — no special-casing in the outbox.
 */
const REGISTRY: Record<string, DeliveryAdapter> = {
  [genericWebhookAdapter.targetType]: genericWebhookAdapter,
};

export function getAdapter(targetType: string): DeliveryAdapter | undefined {
  return REGISTRY[targetType];
}

export function supportedTargets(): string[] {
  return Object.keys(REGISTRY);
}
