import { describe, it, expect } from "vitest";
import { runAllCollectors, type CollectorSpec } from "./collect-all";
import type { CollectorResult } from "../signals/types";

const ok = (name: string): CollectorResult => ({ collector: name, signals: [], ok: true });

describe("runAllCollectors (parallel, partial-OK)", () => {
  it("runs all specs and a throwing collector becomes ok:false without killing the run", async () => {
    let sawSignal = false;
    const specs: CollectorSpec[] = [
      { name: "a", run: async () => ok("a") },
      {
        name: "b",
        run: async () => {
          throw new Error("boom");
        },
      },
      {
        name: "c",
        run: async (signal) => {
          sawSignal = signal instanceof AbortSignal;
          return ok("c");
        },
      },
    ];

    const r = await runAllCollectors(specs, { deadlineMs: 5000 });

    expect(r).toHaveLength(3);
    expect(r[0].ok).toBe(true);
    expect(r[1]).toEqual({ collector: "b", signals: [], ok: false, error: "boom" });
    expect(r[2].ok).toBe(true);
    expect(sawSignal).toBe(true); // the shared deadline signal is threaded in
  });

  it("returns results in spec order", async () => {
    const specs: CollectorSpec[] = ["x", "y", "z"].map((n) => ({ name: n, run: async () => ok(n) }));
    const r = await runAllCollectors(specs, { deadlineMs: 5000 });
    expect(r.map((c) => c.collector)).toEqual(["x", "y", "z"]);
  });
});
