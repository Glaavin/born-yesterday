import { describe, it, expect } from "vitest";
import { panelEnabled, panelAuthorized } from "./gate";

/**
 * The panel's security posture is the gate. These assert it FAILS CLOSED at both
 * layers — Story 26 W8's central requirement: missing or malformed → absent,
 * never open.
 */
describe("source panel gate — fails closed (Story 26 W8)", () => {
  describe("panelEnabled — route existence", () => {
    it("absent when BY_OPERATOR_KEY is unset or empty (the production default)", () => {
      expect(panelEnabled(undefined)).toBe(false);
      expect(panelEnabled("")).toBe(false);
    });
    it("present only when a non-empty key is configured", () => {
      expect(panelEnabled("secret")).toBe(true);
    });
  });

  describe("panelAuthorized — per-request key (reuses the 23.1 operator path)", () => {
    it("closed when the env key is unset, whatever the header says", () => {
      expect(panelAuthorized("anything", undefined)).toBe(false);
      expect(panelAuthorized("anything", "")).toBe(false);
    });
    it("closed when the request presents no header", () => {
      expect(panelAuthorized(null, "secret")).toBe(false);
      expect(panelAuthorized(undefined, "secret")).toBe(false);
      expect(panelAuthorized("", "secret")).toBe(false);
    });
    it("closed on a mismatch; open only on an exact match", () => {
      expect(panelAuthorized("wrong", "secret")).toBe(false);
      expect(panelAuthorized("secret", "secret")).toBe(true);
    });
  });
});
