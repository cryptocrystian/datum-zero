/**
 * M2-5a — magic-link email content (CR-34), branded per docs/DESIGN-SYSTEM.md: industrial dark navy
 * canvas, cadmium-gold emphasis, monospace for the link + expiry. Minimal transactional auth email —
 * NOT marketing. Evidence-framed, no verdict language. Pure (url + expiry in → subject/html/text out)
 * so it is unit-testable with no I/O.
 *
 * Email clients strip <style> + external assets unpredictably, so every style is inline and there are
 * no remote images. A plain-text alternative always accompanies the HTML.
 */
export interface MagicLinkContent {
  subject: string;
  html: string;
  text: string;
}

// Brand hexes (docs/DESIGN-SYSTEM.md — mirrors app/globals.css tokens).
const MIDNIGHT = "#1a253a";
const DARKNAVY = "#121926";
const CARDBG = "#151926";
const SLATE = "#6d7278";
const GOLD = "#e9d700";
const WHITE = "#ffffff";
const MONO = "'SFMono-Regular', 'Consolas', 'Liberation Mono', Menlo, monospace";
const SANS = "'Helvetica Neue', Arial, sans-serif";

/** Format the expiry as a stable, human UTC string (deterministic — no locale/timezone drift). */
function expiryLabel(expiresAt: Date): string {
  return `${expiresAt.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export function buildMagicLinkEmail(url: string, expiresAt: Date): MagicLinkContent {
  const expiry = expiryLabel(expiresAt);
  const subject = "Your Datum Zero cockpit sign-in link";

  const text = [
    "DATUM ZERO SYSTEMS — Cockpit sign-in",
    "",
    "Use this single-use link to sign in. It expires at " + expiry + ".",
    "",
    url,
    "",
    "If you didn't request this, you can ignore this email — no action is taken.",
    "Access is concierge-provisioned; this link only works for a provisioned account.",
  ].join("\n");

  const html = `<!-- transactional auth email -->
<div style="margin:0;padding:0;background:${MIDNIGHT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MIDNIGHT};">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:${CARDBG};border:1px solid ${SLATE}44;border-radius:4px;">
        <tr><td style="padding:28px 28px 8px 28px;">
          <div style="font-family:${MONO};font-size:11px;letter-spacing:2px;text-transform:uppercase;color:${SLATE};">Datum Zero Systems &middot; Reality Ledger</div>
          <h1 style="margin:10px 0 0 0;font-family:${SANS};font-size:20px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${WHITE};">Cockpit Sign-in</h1>
        </td></tr>
        <tr><td style="padding:12px 28px 0 28px;">
          <p style="margin:0;font-family:${SANS};font-size:14px;line-height:1.5;color:${WHITE};">Use the single-use link below to sign in to the cockpit.</p>
        </td></tr>
        <tr><td style="padding:20px 28px 8px 28px;">
          <a href="${url}" style="display:block;padding:12px 16px;background:${DARKNAVY};border:1px solid ${GOLD};border-radius:4px;font-family:${MONO};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${WHITE};text-decoration:none;text-align:center;">[ Open Sign-in Link ]</a>
        </td></tr>
        <tr><td style="padding:4px 28px 24px 28px;">
          <p style="margin:0;font-family:${MONO};font-size:11px;color:${SLATE};">Expires ${expiry} &middot; single-use</p>
          <p style="margin:12px 0 0 0;font-family:${SANS};font-size:12px;line-height:1.5;color:${SLATE};">If you didn't request this, ignore this email — no action is taken. Access is concierge-provisioned; this link only works for a provisioned account.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`;

  return { subject, html, text };
}
