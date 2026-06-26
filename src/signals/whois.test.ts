import { describe, it, expect } from "vitest";
import { socketWhois, type WhoisConnect } from "./whois";

const MAX = 1 << 20; // must match WHOIS_MAX_BYTES

// Minimal fake socket we can drive manually.
function makeFakeSocket() {
  const handlers: Record<string, Array<(arg?: unknown) => void>> = {};
  const fake = {
    destroyed: false,
    setEncoding() {},
    write() {},
    destroy() {
      this.destroyed = true;
    },
    on(ev: string, cb: (arg?: unknown) => void) {
      (handlers[ev] ||= []).push(cb);
    },
    emit(ev: string, arg?: unknown) {
      (handlers[ev] || []).forEach((cb) => cb(arg));
    },
  };
  return fake;
}

describe("socketWhois byte cap", () => {
  it("caps accumulated bytes and destroys the socket on overflow", async () => {
    const fake = makeFakeSocket();
    const connect: WhoisConnect = () => fake;

    const p = socketWhois("whois.example", "domain", 5000, connect);
    fake.emit("connect");
    fake.emit("data", "x".repeat(MAX + 1000)); // overflow

    const result = await p;
    expect(result.length).toBe(MAX);
    expect(fake.destroyed).toBe(true);
  });

  it("returns the full response under the cap on close", async () => {
    const fake = makeFakeSocket();
    const connect: WhoisConnect = () => fake;

    const p = socketWhois("whois.example", "domain", 5000, connect);
    fake.emit("connect");
    fake.emit("data", "Creation Date: 1997-09-15\n");
    fake.emit("close");

    expect(await p).toBe("Creation Date: 1997-09-15\n");
    expect(fake.destroyed).toBe(false);
  });
});
