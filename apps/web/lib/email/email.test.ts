import { describe, it, expect, vi } from "vitest";
import { buildMagicLinkEmail } from "./content";
import { resolveSesCredentials } from "./secrets";
import { devDeliveryAllowed, devEmailPort } from "./dev";
import { sesEmailPort, type MailTransport } from "./ses";
import { getEmailPort } from "./index";

const URL = "https://cockpit.datumzero.example/api/auth/callback/nodemailer?token=abc123&email=a%40b.co";
const EXPIRES = new Date("2026-07-13T18:30:00Z");

const SES_ENV = {
  NODE_ENV: "production",
  EMAIL_PROVIDER: "ses",
  EMAIL_FROM: "no-reply@datumzero.example",
  SES_SMTP_HOST: "email-smtp.us-east-1.amazonaws.com",
  SES_SMTP_USER: "AKIAEXAMPLE",
  SES_SMTP_PASSWORD: "smtp-secret-value",
};

describe("buildMagicLinkEmail (M2-5a/CR-34) — branded, plain-text fallback, explicit expiry", () => {
  const { subject, html, text } = buildMagicLinkEmail(URL, EXPIRES);

  it("carries the link + expiry in both html and text", () => {
    expect(subject).toMatch(/sign-in/i);
    expect(html).toContain(URL);
    expect(text).toContain(URL);
    expect(html).toContain("2026-07-13 18:30 UTC");
    expect(text).toContain("2026-07-13 18:30 UTC");
  });

  it("is branded (gold accent) and inline-styled with no remote assets", () => {
    expect(html).toContain("#e9d700"); // cadmium gold
    expect(html).not.toMatch(/<img|src=|<link/i); // no remote images/stylesheets
  });

  it("uses no verdict language (CR-12)", () => {
    for (const s of [subject, html, text]) {
      expect(s).not.toMatch(/\b(violation|breach|back-charge|penalty|liable|enforce)\b/i);
    }
  });
});

describe("resolveSesCredentials (M2-5a/CR-34) — vault (env)-backed, fail closed", () => {
  it("returns null when any credential is missing", () => {
    expect(resolveSesCredentials({ EMAIL_FROM: "x@y.co" })).toBeNull();
    expect(resolveSesCredentials({})).toBeNull();
  });

  it("returns config when fully provisioned; defaults port 587 and replyTo=from", () => {
    const cfg = resolveSesCredentials(SES_ENV);
    expect(cfg).not.toBeNull();
    expect(cfg!.smtpPort).toBe(587);
    expect(cfg!.replyTo).toBe(cfg!.from);
    expect(cfg!.smtpPass).toBe("smtp-secret-value");
  });
});

describe("dev adapter (M2-5a/CR-34) — dev-only, fail closed in production", () => {
  it("devDeliveryAllowed is false in production, true otherwise (both branches)", () => {
    expect(devDeliveryAllowed({ NODE_ENV: "production" })).toBe(false);
    expect(devDeliveryAllowed({ NODE_ENV: "development" })).toBe(true);
    expect(devDeliveryAllowed({})).toBe(true);
  });

  it("devEmailPort REFUSES to send in production (never exposes a magic link)", async () => {
    const port = devEmailPort({ NODE_ENV: "production" });
    await expect(port.sendMagicLink({ to: "a@b.co", url: URL, expiresAt: EXPIRES })).rejects.toThrow(/production/i);
  });
});

describe("sesEmailPort (M2-5a/CR-34) — mocked SES client, fail closed", () => {
  const cfg = resolveSesCredentials(SES_ENV)!;

  it("sends the branded message through the transport (no live send)", async () => {
    const sendMail = vi.fn<MailTransport["sendMail"]>().mockResolvedValue({ messageId: "0000" });
    const port = sesEmailPort(cfg, { sendMail });
    await port.sendMagicLink({ to: "pilot@op.example", url: URL, expiresAt: EXPIRES });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const msg = sendMail.mock.calls[0][0];
    expect(msg.to).toBe("pilot@op.example");
    expect(msg.from).toBe(cfg.from);
    expect(msg.html).toContain(URL);
    expect(msg.text).toContain(URL);
  });

  it("propagates a transport failure (fail closed — never silently drops)", async () => {
    const sendMail = vi.fn<MailTransport["sendMail"]>().mockRejectedValue(new Error("SES throttled"));
    const port = sesEmailPort(cfg, { sendMail });
    await expect(port.sendMagicLink({ to: "x@y.co", url: URL, expiresAt: EXPIRES })).rejects.toThrow(/SES throttled/);
  });
});

describe("getEmailPort (M2-5a/CR-34) — env selection, fail closed", () => {
  it("returns the dev port in non-production", () => {
    expect(getEmailPort({ NODE_ENV: "development" }).provider).toBe("dev");
  });

  it("REFUSES the dev provider in production (account-takeover surface)", () => {
    expect(() => getEmailPort({ NODE_ENV: "production", EMAIL_PROVIDER: "dev" })).toThrow(/not permitted in production/i);
  });

  it("defaults to SES in production and returns it when the vault is provisioned", () => {
    expect(getEmailPort(SES_ENV).provider).toBe("ses");
  });

  it("fails closed when SES credentials are not provisioned", () => {
    expect(() => getEmailPort({ NODE_ENV: "production", EMAIL_PROVIDER: "ses" })).toThrow(/not provisioned/i);
  });

  it("rejects an unknown provider", () => {
    expect(() => getEmailPort({ NODE_ENV: "development", EMAIL_PROVIDER: "carrier-pigeon" })).toThrow(/unknown/i);
  });
});
