import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { validLoyverseSignature, validWebhookPayload } from "../src/webhook.js";

test("validates the raw Loyverse HMAC-SHA1 signature", () => {
  const body = Buffer.from('{"type":"items.update"}');
  const signature = createHmac("sha1", "secret").update(body).digest("hex");
  assert.equal(validLoyverseSignature(body, signature, "secret"), true);
  assert.equal(validLoyverseSignature(Buffer.from("changed"), signature, "secret"), false);
  assert.equal(validLoyverseSignature(body, undefined, "secret"), false);
  assert.equal(validLoyverseSignature(body, "invalid", "secret"), false);
});

test("validates supported webhook payloads without throwing on malformed JSON", () => {
  assert.equal(validWebhookPayload(Buffer.from(JSON.stringify({ merchant_id: "m", type: "items.update", created_at: "now" }))), true);
  assert.equal(validWebhookPayload(Buffer.from(JSON.stringify({ merchant_id: "m", type: "unknown", created_at: "now" }))), false);
  assert.equal(validWebhookPayload(Buffer.from("not-json")), false);
});