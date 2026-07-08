import { describe, it, expect } from "vitest";
import { validateUserInput, ROLES, type UserInput } from "./admin";

const base: UserInput = { email: "new.reviewer@client.example", name: "New Reviewer", role: "REVIEWER" };

describe("validateUserInput — concierge provisioning (OPS-4, CR-14)", () => {
  it("accepts a well-formed provisioning input", () => {
    expect(validateUserInput(base)).toEqual({ ok: true });
  });

  it("accepts every real role", () => {
    for (const role of ["ADMIN", "REVIEWER", "PILOT"]) {
      expect(validateUserInput({ ...base, role }).ok).toBe(true);
    }
    expect(ROLES.sort()).toEqual(["ADMIN", "PILOT", "REVIEWER"]);
  });

  it("rejects an invalid email", () => {
    for (const email of ["", "not-an-email", "no@domain", "spaces in@x.com", "a@b"]) {
      expect(validateUserInput({ ...base, email }).ok, email).toBe(false);
    }
  });

  it("rejects an unknown role", () => {
    expect(validateUserInput({ ...base, role: "SUPERUSER" }).ok).toBe(false);
  });

  it("rejects an over-long name", () => {
    expect(validateUserInput({ ...base, name: "x".repeat(121) }).ok).toBe(false);
  });
});
