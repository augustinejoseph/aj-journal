import { describe, it, expect } from "vitest";
import { allowed } from "../lib/access";
describe("single owner policy", () => {
  it("fails closed without configuration", () =>
    expect(allowed("owner@example.com", undefined)).toBe(false));
  it("rejects anonymous sessions", () =>
    expect(allowed(null, "owner@example.com")).toBe(false));
  it("rejects other accounts and suffix attacks", () => {
    expect(allowed("other@example.com", "owner@example.com")).toBe(false);
    expect(allowed("owner@example.com.attacker.org", "owner@example.com")).toBe(
      false,
    );
  });
  it("matches the exact email without case sensitivity", () =>
    expect(allowed("Owner@Example.com", "owner@example.com")).toBe(true));
});
