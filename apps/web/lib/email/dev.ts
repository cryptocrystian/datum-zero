import type { EmailPort, MagicLinkEmail } from "./port";

/**
 * M2-5a — dev email adapter (CR-34). Preserves the local DX: the magic link is printed to the server
 * log AND stashed in a temp file that /signin reads to show a one-click link.
 *
 * ⚠ The magic-link URL is a bearer credential. Writing/logging it is a DEV-ONLY convenience and MUST
 * NOT happen in production — a leaked link is account takeover. This predicate is the SINGLE source of
 * truth for "dev link exposure allowed", shared by the adapter (write) and /signin (read), and it is
 * enforced fail-closed here as defense-in-depth even though getEmailPort() also refuses dev in prod.
 */
export function devDeliveryAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV !== "production";
}

const DEV_LINK_FILENAME = "dz-magic-link.json";

export function devEmailPort(env: Record<string, string | undefined> = process.env): EmailPort {
  return {
    provider: "dev",
    async sendMagicLink({ to, url, expiresAt }: MagicLinkEmail): Promise<void> {
      // Fail closed: never expose a magic link outside dev, no matter how this adapter is reached.
      if (!devDeliveryAllowed(env)) {
        throw new Error("dev email delivery is not permitted in production (CR-34)");
      }
      const rule = "═".repeat(72);
      // eslint-disable-next-line no-console
      console.log(
        `\n${rule}\n🔗 [auth] DEV magic sign-in link for ${to}:\n${url}\n(expires ${expiresAt.toISOString()})\n${rule}\n`,
      );
      try {
        const [{ writeFile }, os, path] = await Promise.all([
          import("node:fs/promises"),
          import("node:os"),
          import("node:path"),
        ]);
        await writeFile(
          path.join(os.tmpdir(), DEV_LINK_FILENAME),
          JSON.stringify({ identifier: to, url, at: Date.now() }),
          "utf8",
        );
      } catch {
        // best-effort dev convenience; the server log above is always the fallback
      }
    },
  };
}
