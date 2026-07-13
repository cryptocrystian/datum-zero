/**
 * M2-5a — EmailPort seam (CR-34, CR-20). Mirrors StoragePort / RadiometricPort: transactional email
 * delivery behind a swappable port so the provider is a config change, and the dev path is preserved.
 *
 * The only message this port carries today is the auth magic link. The magic-link URL is a BEARER
 * credential — an adapter MUST NOT log or persist it (the dev adapter's console/temp-file convenience
 * is the sole, non-production exception; see lib/email/dev.ts).
 */
export interface MagicLinkEmail {
  to: string;
  url: string;
  expiresAt: Date;
}

export interface EmailPort {
  /** Provider id for diagnostics ("dev" | "ses" | ...). Never a secret. */
  readonly provider: string;
  /** Deliver a magic-link email. MUST throw on failure (fail closed — never silently drop). */
  sendMagicLink(msg: MagicLinkEmail): Promise<void>;
}
