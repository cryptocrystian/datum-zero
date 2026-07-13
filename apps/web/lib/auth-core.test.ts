import { describe, it, expect } from "vitest";
import { signInErrorRedirect } from "./auth-core";

describe("signInErrorRedirect (M2-5a/CR-34) — no account enumeration", () => {
  it("AccessDenied maps to the generic 'check your email' (identical to a real send)", () => {
    // Un-provisioned/inactive email must be indistinguishable from a successful send.
    expect(signInErrorRedirect("AccessDenied")).toBe("/signin?sent=1");
  });

  it("any genuine fault maps to a generic retry, never revealing existence", () => {
    expect(signInErrorRedirect("Configuration")).toBe("/signin?error=auth");
    expect(signInErrorRedirect("Verification")).toBe("/signin?error=auth");
    expect(signInErrorRedirect(undefined)).toBe("/signin?error=auth");
  });
});
