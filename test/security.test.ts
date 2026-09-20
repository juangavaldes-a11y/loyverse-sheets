import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithTimeout, safeEqual } from "../src/security.js";

test("safeEqual handles matching and differently sized secrets", () => {
  assert.equal(safeEqual("same", "same"), true);
  assert.equal(safeEqual("same", "different"), false);
  assert.equal(safeEqual("same", "fail"), false);
});

test("fetchWithTimeout passes request options and a signal", async () => {
  const originalFetch = globalThis.fetch;
  let received: RequestInit | undefined;
  globalThis.fetch = async (_url, init) => { received = init; return new Response("ok"); };
  try {
    const controller = new AbortController();
    await fetchWithTimeout("https://example.com", { method: "POST", signal: controller.signal }, 100);
    assert.equal(received?.method, "POST");
    assert.ok(received?.signal);
    await fetchWithTimeout("https://example.com");
    assert.ok(received?.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});