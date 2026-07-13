import type { EmailPort, MagicLinkEmail } from "./port";

/**
 * M2-5a — fail-closed magic-link delivery (CR-34). Wraps port selection + send so that a failure is
 * ALERTED server-side (never silently dropped) but NEVER surfaced to the user — the sign-in UI must
 * stay generic ("if that address is provisioned, a link has been sent") regardless of whether the
 * address exists or the send failed. Leaking either would make /signin an account-enumeration oracle,
 * especially attractive against a provisioned-only model.
 *
 * The alert carries enough to diagnose (recipient + provider + error) but NEVER the magic-link URL /
 * token — that is a bearer credential and must not reach the logs.
 */
export interface DeliveryAlertContext {
  to: string;
  provider: string;
  error: string;
}

export type DeliveryAlert = (context: DeliveryAlertContext) => void;

export async function deliverMagicLink(
  getPort: () => EmailPort,
  msg: MagicLinkEmail,
  alert: DeliveryAlert,
): Promise<void> {
  let provider = "unknown";
  try {
    const port = getPort(); // may throw (e.g. SES creds unprovisioned, or dev refused in prod)
    provider = port.provider;
    await port.sendMagicLink(msg);
  } catch (err) {
    // Alert loudly server-side, then swallow — the caller returns normally so the UI stays generic.
    alert({ to: msg.to, provider, error: err instanceof Error ? err.message : String(err) });
  }
}
