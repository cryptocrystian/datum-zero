import { describe, it, expect } from "vitest";
import { validateIntegrationInput, allowedConfigKeys, type IntegrationInput } from "./admin";

const base: IntegrationInput = {
  targetType: "GENERIC_WEBHOOK",
  displayName: "Generic Webhook (client IT)",
  config: { url: "https://client.example/webhooks/datum-zero" },
  secretVaultKey: "datumzero/webhook/hmac",
  isActive: true,
};

describe("validateIntegrationInput — non-secret delivery config (OPS-2, CR-05/CR-03)", () => {
  it("accepts a well-formed integration", () => {
    expect(validateIntegrationInput(base)).toEqual({ ok: true });
  });

  it("accepts each supported target type with its whitelisted config", () => {
    expect(validateIntegrationInput({ ...base, targetType: "CSV_S3", config: { bucket: "client-dz", prefix: "dz/" } }).ok).toBe(true);
    expect(validateIntegrationInput({ ...base, targetType: "NATIVE_JIRA", config: { baseUrl: "https://x.atlassian.net", projectKey: "DZ" } }).ok).toBe(true);
  });

  it("requires a displayName and a known targetType", () => {
    expect(validateIntegrationInput({ ...base, displayName: "  " }).ok).toBe(false);
    expect(validateIntegrationInput({ ...base, targetType: "NATIVE_TELEPATHY" }).ok).toBe(false);
  });

  it("rejects a config KEY that names a secret (CR-03)", () => {
    for (const k of ["token", "apiKey", "api_key", "password", "secret", "authorization", "privateKey", "accessKey"]) {
      const r = validateIntegrationInput({ ...base, config: { [k]: "anything" } });
      expect(r.ok, `key ${k} must be rejected`).toBe(false);
    }
  });

  it("rejects an unknown config field for the target type", () => {
    expect(validateIntegrationInput({ ...base, config: { bucket: "x" } }).ok).toBe(false); // bucket isn't a webhook field
  });

  it("rejects a config VALUE that looks like a raw secret (CR-03)", () => {
    const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig";
    expect(validateIntegrationInput({ ...base, config: { url: jwt } }).ok).toBe(false);
    expect(validateIntegrationInput({ ...base, config: { url: "AKIAIOSFODNN7EXAMPLE" } }).ok).toBe(false);
  });

  it("treats secretVaultKey as a REFERENCE — rejects raw-secret-looking values", () => {
    expect(validateIntegrationInput({ ...base, secretVaultKey: "eyJhbGciOiJIUzI1NiJ9.abc.def" }).ok).toBe(false);
    expect(validateIntegrationInput({ ...base, secretVaultKey: "sk-ABCDEFGHIJKLMNOP0123456789" }).ok).toBe(false);
    expect(validateIntegrationInput({ ...base, secretVaultKey: "has spaces and stuff" }).ok).toBe(false);
    // a path-style reference that merely NAMES the token is fine (it is not the secret)
    expect(validateIntegrationInput({ ...base, secretVaultKey: "datumzero/jira/api-token" }).ok).toBe(true);
  });

  it("allows an empty secretVaultKey (integration without a linked secret)", () => {
    expect(validateIntegrationInput({ ...base, secretVaultKey: null }).ok).toBe(true);
  });

  it("exposes only non-secret whitelisted config keys per type", () => {
    expect(allowedConfigKeys("GENERIC_WEBHOOK")).toEqual(["url"]);
    expect(allowedConfigKeys("NATIVE_JIRA")).toEqual(["baseUrl", "projectKey"]);
    for (const keys of Object.values({ a: allowedConfigKeys("CSV_S3") })) {
      for (const k of keys) expect(/token|secret|password|key/i.test(k)).toBe(false);
    }
  });
});
