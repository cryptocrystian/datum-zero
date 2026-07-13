import type { EmailPort, MagicLinkEmail } from "./port";
import type { SesTransportConfig } from "./secrets";
import { buildMagicLinkEmail } from "./content";

/**
 * M2-5a — AWS SES production adapter (CR-34). Sends over the SES SMTP endpoint via nodemailer (already
 * a dependency), so no additional AWS SDK / subprocessor SDK is pulled in — SES stays inside the AWS
 * boundary we already use for Secrets Manager. Swapping to Postmark/Resend is a config change behind
 * the same EmailPort.
 *
 * The transport is injectable so tests exercise a MOCKED SES client (no live sends in CI). The magic
 * link is NEVER logged here — only a non-sensitive success/failure breadcrumb (the recipient + a
 * message id), and delivery FAILS CLOSED (throws) so the caller can alert.
 */
export interface MailMessage {
  from: string;
  replyTo: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface MailTransport {
  sendMail(message: MailMessage): Promise<{ messageId?: string }>;
}

/** Build the real SES SMTP transport via nodemailer (dynamic import keeps it out of the test path). */
export async function createSesTransport(cfg: SesTransportConfig): Promise<MailTransport> {
  const nodemailer = (await import("nodemailer")).default;
  const transporter = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465, // 465 = implicit TLS; 587 = STARTTLS
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
  });
  return {
    async sendMail(message: MailMessage) {
      return transporter.sendMail(message);
    },
  };
}

/**
 * SES email port. Pass a transport to unit-test against a mock; omit it and the real SES SMTP
 * transport is lazily constructed on first send.
 */
export function sesEmailPort(cfg: SesTransportConfig, transport?: MailTransport): EmailPort {
  let cached: MailTransport | null = transport ?? null;
  return {
    provider: "ses",
    async sendMagicLink({ to, url, expiresAt }: MagicLinkEmail): Promise<void> {
      const { subject, html, text } = buildMagicLinkEmail(url, expiresAt);
      if (!cached) cached = await createSesTransport(cfg);
      // Throws on transport failure — the caller (auth.ts) alerts server-side; UI stays generic.
      await cached.sendMail({ from: cfg.from, replyTo: cfg.replyTo, to, subject, text, html });
    },
  };
}
