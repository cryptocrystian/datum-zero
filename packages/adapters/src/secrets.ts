/**
 * Secret resolution seam (MANIFEST §3). Integration credentials are referenced by `secretVaultKey`
 * and resolved from the vault — NEVER read from the DB. In dev the "vault" is the process env;
 * in prod `secretVaultKey` resolves via AWS Secrets Manager (M1).
 */

export interface JiraCredentials {
  baseUrl: string;
  email: string;
  apiToken: string;
}

/**
 * Resolve Jira credentials for a configured integration. Returns null when the integration is not
 * linked to a vault entry, or when the (dev, env-backed) credentials are absent — which token-gates
 * the live Jira path. Credentials never come from the database.
 */
export function resolveJiraCredentials(
  secretVaultKey: string | null,
  env: Record<string, string | undefined> = process.env,
): JiraCredentials | null {
  if (!secretVaultKey) return null; // integration not linked to a secret vault entry
  const baseUrl = env.JIRA_BASE_URL;
  const email = env.JIRA_EMAIL;
  const apiToken = env.JIRA_API_TOKEN;
  if (!baseUrl || !email || !apiToken) return null; // creds not present → live path is token-gated
  return { baseUrl, email, apiToken };
}
