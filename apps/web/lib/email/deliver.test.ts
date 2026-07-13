import { describe, it, expect, vi } from "vitest";
import { deliverMagicLink, type DeliveryAlert } from "./deliver";
import type { EmailPort } from "./port";

const MSG = { to: "a@b.co", url: "https://cockpit.example/api/auth/callback/nodemailer?token=SECRET_T", expiresAt: new Date("2026-07-13T18:30:00Z") };

function port(over: Partial<EmailPort> = {}): EmailPort {
  return { provider: "ses", sendMagicLink: vi.fn().mockResolvedValue(undefined), ...over };
}

describe("deliverMagicLink (M2-5a/CR-34) — fail closed, no enumeration", () => {
  it("on success, does not alert", async () => {
    const alert = vi.fn<DeliveryAlert>();
    const p = port();
    await deliverMagicLink(() => p, MSG, alert);
    expect(p.sendMagicLink).toHaveBeenCalledOnce();
    expect(alert).not.toHaveBeenCalled();
  });

  it("on send failure, ALERTS server-side and swallows (never throws → UI stays generic)", async () => {
    const alert = vi.fn<DeliveryAlert>();
    const p = port({ sendMagicLink: vi.fn().mockRejectedValue(new Error("SES down")) });
    await expect(deliverMagicLink(() => p, MSG, alert)).resolves.toBeUndefined();
    expect(alert).toHaveBeenCalledOnce();
    const ctx = alert.mock.calls[0][0];
    expect(ctx.to).toBe("a@b.co");
    expect(ctx.provider).toBe("ses");
    expect(ctx.error).toMatch(/SES down/);
  });

  it("never leaks the magic-link url/token to the alert", async () => {
    const alert = vi.fn<DeliveryAlert>();
    const p = port({ sendMagicLink: vi.fn().mockRejectedValue(new Error("boom")) });
    await deliverMagicLink(() => p, MSG, alert);
    const serialized = JSON.stringify(alert.mock.calls[0][0]);
    expect(serialized).not.toContain("SECRET_T");
    expect(serialized).not.toContain(MSG.url);
  });

  it("when port selection itself throws (misconfig), still alerts and swallows", async () => {
    const alert = vi.fn<DeliveryAlert>();
    await expect(
      deliverMagicLink(
        () => {
          throw new Error("no creds");
        },
        MSG,
        alert,
      ),
    ).resolves.toBeUndefined();
    expect(alert).toHaveBeenCalledOnce();
    expect(alert.mock.calls[0][0].error).toMatch(/no creds/);
  });
});
