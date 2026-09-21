import assert from "node:assert/strict";
import test from "node:test";
import type { LoyverseAuth } from "../src/auth.js";
import { LoyverseClient } from "../src/loyverse.js";
import { jsonResponse } from "./helpers.js";

const auth = { getAccessToken: async () => "access-token" } as LoyverseAuth;

test("request authenticates and returns JSON", async () => {
  const client = new LoyverseClient(auth, async (url, init) => {
    assert.equal(url, "https://api.loyverse.com/v1.0/items");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer access-token");
    return jsonResponse({ ok: true });
  });
  assert.deepEqual(await client.request("/items"), { ok: true });
});

test("request redacts 4xx response bodies", async () => {
  const client = new LoyverseClient(auth, async () => new Response("private details", { status: 403 }));
  await assert.rejects(client.request("/items"), (error: Error) => {
    assert.match(error.message, /403/);
    assert.doesNotMatch(error.message, /private details/);
    return true;
  });
});

test("request retries throttling using retry-after", async () => {
  let attempts = 0;
  const waits: number[] = [];
  const client = new LoyverseClient(auth, async () => {
    attempts += 1;
    return attempts === 1
      ? new Response("", { status: 429, headers: { "retry-after": "0.001" } })
      : jsonResponse({ recovered: true });
  }, async (milliseconds) => { waits.push(milliseconds); });
  assert.deepEqual(await client.request("/items"), { recovered: true });
  assert.deepEqual(waits, [1]);
});

test("request retries server errors and eventually fails", async () => {
  const waits: number[] = [];
  const client = new LoyverseClient(auth, async () => new Response("private", { status: 500 }),
    async (milliseconds) => { waits.push(milliseconds); });
  await assert.rejects(client.request("/items"), /failed after retries \(500\)/);
  assert.deepEqual(waits, [1000, 2000, 4000, 8000]);
});

test("pagination follows cursors and rejects malformed pages", async () => {
  const urls: string[] = [];
  const client = new LoyverseClient(auth, async (url) => {
    urls.push(url);
    return url.includes("cursor=next") ? jsonResponse({ items: [{ id: 2 }] }) : jsonResponse({ items: [{ id: 1 }], cursor: "next" });
  });
  assert.deepEqual(await client.paginate<{ id: number }>("/items", "items", { show_deleted: "true" }), [{ id: 1 }, { id: 2 }]);
  assert.match(urls[0]!, /limit=250/);
  assert.match(urls[1]!, /cursor=next/);

  const malformed = new LoyverseClient(auth, async () => jsonResponse({ items: "wrong" }));
  await assert.rejects(malformed.paginate("/items", "items"), /did not contain items/);
});

test("ensureWebhook skips enabled hooks and creates missing hooks", async () => {
  const requests: Array<{ url: string; method?: string; body?: string }> = [];
  let hooks: unknown[] = [{ url: "https://hook", type: "items.update", status: "ENABLED" }];
  const client = new LoyverseClient(auth, async (url, init) => {
    requests.push({ url, method: init?.method, body: String(init?.body ?? "") });
    return jsonResponse(init?.method === "POST" ? { id: "new" } : hooks);
  });
  await client.ensureWebhook("https://hook", "items.update");
  assert.equal(requests.length, 1);
  hooks = [];
  await client.ensureWebhook("https://hook", "receipts.update");
  assert.equal(requests.length, 3);
  assert.match(requests[2]!.body!, /receipts.update/);
});

test("ensureWebhook accepts wrapped live API responses and rejects unknown shapes", async () => {
  const wrapped = new LoyverseClient(auth, async () => jsonResponse({
    webhooks: [{ url: "https://hook", type: "items.update", status: "ENABLED" }],
  }));
  await wrapped.ensureWebhook("https://hook", "items.update");

  const malformed = new LoyverseClient(auth, async () => jsonResponse({ data: [] }));
  await assert.rejects(malformed.ensureWebhook("https://hook", "items.update"), /unexpected response/);
});