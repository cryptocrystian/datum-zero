import type { EmailPort } from "./port";
import { devEmailPort } from "./dev";
import { sesEmailPort } from "./ses";
import { resolveSesCredentials } from "./secrets";

export type { EmailPort, MagicLinkEmail } from "./port";
export { devDeliveryAllowed } from "./dev";

/**
 * M2-5a — select the email transport (CR-34). Provider is env-driven (`EMAIL_PROVIDER`), defaulting to
 * SES in production and the dev stub otherwise. FAIL CLOSED on two counts:
 *   • the dev adapter is REFUSED in production (its console/temp-file exposure is account-takeover);
 *   • SES with unprovisioned vault credentials THROWS rather than sending blind.
 */
export function getEmailPort(env: Record<string, string | undefined> = process.env): EmailPort {
  const isProd = env.NODE_ENV === "production";
  const provider = (env.EMAIL_PROVIDER ?? (isProd ? "ses" : "dev")).toLowerCase();

  if (provider === "dev") {
    if (isProd) {
      throw new Error("EMAIL_PROVIDER=dev is not permitted in production (CR-34) — refusing to expose magic links");
    }
    return devEmailPort(env);
  }

  if (provider === "ses") {
    const cfg = resolveSesCredentials(env);
    if (!cfg) {
      throw new Error("SES email credentials are not provisioned in the vault (CR-34) — failing closed");
    }
    return sesEmailPort(cfg);
  }

  throw new Error(`Unknown EMAIL_PROVIDER '${provider}' (CR-34)`);
}
