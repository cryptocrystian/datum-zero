/**
 * M2-5a — email transport credential resolution (CR-34, MANIFEST §3). Mirrors
 * packages/adapters/src/secrets.ts: credentials are resolved from the VAULT — never the DB, never
 * committed. In dev the "vault" is the process env; in prod the same env is populated from AWS Secrets
 * Manager at deploy time. Returns null when not provisioned → the caller FAILS CLOSED.
 *
 * Default provider is AWS SES (over its SMTP endpoint) — it keeps auth email inside the AWS boundary we
 * already use for Secrets Manager, i.e. one fewer third-party subprocessor to disclose (SOC 2 / gov
 * procurement). Postmark/Resend are swappable behind the same EmailPort if SES deliverability bites.
 */
export interface SesTransportConfig {
  from: string;
  replyTo: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}

/**
 * Resolve SES SMTP credentials from the vault (env-backed). Returns null when any required value is
 * absent, which token-gates the live send path (the caller fails closed rather than sending blind).
 * The SMTP password is a secret and comes ONLY from env — never a literal, never the DB.
 */
export function resolveSesCredentials(
  env: Record<string, string | undefined> = process.env,
): SesTransportConfig | null {
  const from = env.EMAIL_FROM;
  const smtpHost = env.SES_SMTP_HOST; // e.g. email-smtp.us-east-1.amazonaws.com
  const smtpUser = env.SES_SMTP_USER; // SES SMTP username (derived from an IAM user)
  const smtpPass = env.SES_SMTP_PASSWORD; // vault-provisioned; never in the repo/DB
  if (!from || !smtpHost || !smtpUser || !smtpPass) return null;
  return {
    from,
    replyTo: env.EMAIL_REPLY_TO ?? from,
    smtpHost,
    smtpPort: Number(env.SES_SMTP_PORT ?? 587),
    smtpUser,
    smtpPass,
  };
}
