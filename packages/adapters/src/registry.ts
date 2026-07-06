import type { DeliveryAdapter } from "./types";
import { genericWebhookAdapter } from "./generic-webhook";
import { nativeJiraAdapter } from "./jira";

/**
 * Delivery-adapter registry (CR-05). One routing interface; targets register here.
 * GENERIC_WEBHOOK (M0-09) + NATIVE_JIRA (M0-10) both implement the SAME interface — no special-casing
 * in the outbox. Demand-driven NATIVE_* (M2) register the same way.
 */
const REGISTRY: Record<string, DeliveryAdapter> = {
  [genericWebhookAdapter.targetType]: genericWebhookAdapter,
  [nativeJiraAdapter.targetType]: nativeJiraAdapter,
};

export function getAdapter(targetType: string): DeliveryAdapter | undefined {
  return REGISTRY[targetType];
}

export function supportedTargets(): string[] {
  return Object.keys(REGISTRY);
}
