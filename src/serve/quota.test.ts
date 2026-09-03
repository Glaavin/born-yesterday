import { describe, it, expect } from "vitest";
import { isOperatorRequest } from "./quota";

describe("isOperatorRequest — the operator gate fails closed (Story 23.1)", () => {
  it("closed when the env key is unset or empty — the production default", () => {
    expect(isOperatorRequest("anything", undefined)).toBe(false);
    expect(isOperatorRequest("anything", "")).toBe(false);
  });

  it("closed when the request presents no header", () => {
    expect(isOperatorRequest(null, "secret")).toBe(false);
    expect(isOperatorRequest(undefined, "secret")).toBe(false);
    expect(isOperatorRequest("", "secret")).toBe(false);
  });

  it("closed on mismatch; open ONLY on an exact, non-empty match", () => {
    expect(isOperatorRequest("wrong", "secret")).toBe(false);
    expect(isOperatorRequest("secret", "secret")).toBe(true);
  });
});
