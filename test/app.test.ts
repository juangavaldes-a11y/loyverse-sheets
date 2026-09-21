import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import request from "supertest";
import { createApp } from "../src/app.js";
import type { LoyverseAuth } from "../src/auth.js";
import type { LoyverseClient } from "../src/loyverse.js";
import type { BackupService } from "../src/sync.js";
import { oauthConfig } from "./helpers.js";

function makeApp(overrides: { mode?: "personal" | "oauth"; exchangeError?: Error; hookError?: Error } = {}) {
  let syncCount = 0;
  const hooks: string[] = [];
  const errors: unknown[] = [];
  const auth = {
    createAuthorizationUrl: () => "https://api.loyverse.com/oauth/authorize?state=test",
    exchangeCode: async () => { if (overrides.exchangeError) throw overrides.exchangeError; },
  } as unknown as LoyverseAuth;
  const loyverse = { ensureWebhook: async (_url: string, type: string) => {
    if (overrides.hookError) throw overrides.hookError;
    hooks.push(type);
  } } as unknown as LoyverseClient;
  const backup = { syncAll: async () => { syncCount += 1; return { items: 1, variants: 1, inventory: 1, salesLines: 1 }; } } as BackupService;
  const config = overrides.mode === "personal"
    ? { ...oauthConfig, LOYVERSE_AUTH_MODE: "personal" as const, LOYVERSE_ACCESS_TOKEN: "token" }
    : oauthConfig;
  const appLogger = {
    info: () => undefined,
    error: (bindings: unknown) => { errors.push(bindings); },
  } as unknown as Parameters<typeof createApp>[4];
  const result = createApp(config, auth, loyverse, backup, appLogger);
  return { ...result, hooks, errors, getSyncCount: () => syncCount };
}

const payload = Buffer.from(JSON.stringify({ merchant_id: "merchant", type: "items.update", created_at: "2026-01-01T00:00:00Z" }));
const signature = createHmac("sha1", oauthConfig.LOYVERSE_CLIENT_SECRET!).update(payload).digest("hex");
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

test("health and OAuth start routes respond", async () => {
  const { app } = makeApp();
  await request(app).get("/health").expect(200, { ok: true });
  const response = await request(app).get("/auth/loyverse").expect(302);
  assert.match(response.headers.location ?? "", /api\.loyverse\.com/);
});

test("OAuth callback validates input, registers hooks, and starts sync", async () => {
  const integration = makeApp();
  await request(integration.app).get("/auth/loyverse/callback").expect(500, { error: "Internal server error" });
  await request(integration.app).get("/auth/loyverse/callback?code=code&state=state").expect(200);
  await settle();
  assert.deepEqual(integration.hooks, ["inventory_levels.update", "items.update", "receipts.update"]);
  assert.equal(integration.getSyncCount(), 1);
});

test("OAuth callback does not register webhooks on a local HTTP URL", async () => {
  const integration = makeApp();
  const localConfig = { ...oauthConfig, PUBLIC_BASE_URL: "http://localhost:3000" };
  const local = createApp(localConfig,
    { createAuthorizationUrl: () => "url", exchangeCode: async () => undefined } as unknown as LoyverseAuth,
    { ensureWebhook: async () => { throw new Error("should not run"); } } as unknown as LoyverseClient,
    { syncAll: async () => ({ items: 0, variants: 0, inventory: 0, salesLines: 0 }) } as BackupService);
  await request(local.app).get("/auth/loyverse/callback?code=code&state=state").expect(200);
  assert.equal(integration.hooks.length, 0);
});

test("OAuth remains connected and starts polling when webhook setup fails", async () => {
  const hookError = new Error("webhook unavailable");
  const integration = makeApp({ hookError });
  const response = await request(integration.app).get("/auth/loyverse/callback?code=code&state=state").expect(200);
  await settle();
  assert.match(response.text, /polling remains active/);
  assert.equal(integration.getSyncCount(), 1);
  assert.deepEqual(integration.errors[0], { err: hookError });
});

test("webhook requires OAuth signature and a valid supported payload", async () => {
  const { app, getSyncCount } = makeApp();
  await request(app).post("/webhooks/loyverse").set("content-type", "application/json").send(payload.toString()).expect(401);
  const malformed = Buffer.from("not-json");
  const malformedSignature = createHmac("sha1", oauthConfig.LOYVERSE_CLIENT_SECRET!).update(malformed).digest("hex");
  await request(app).post("/webhooks/loyverse").set("content-type", "application/json")
    .set("x-loyverse-signature", malformedSignature).send(malformed.toString()).expect(400);
  await request(app).post("/webhooks/loyverse").set("content-type", "application/json")
    .set("x-loyverse-signature", signature).send(payload.toString()).expect(202, { accepted: true });
  await settle();
  assert.equal(getSyncCount(), 1);
});

test("personal-token mode refuses unsigned webhooks", async () => {
  const { app } = makeApp({ mode: "personal" });
  await request(app).post("/webhooks/loyverse").set("content-type", "application/json").send(payload.toString()).expect(401);
});

test("admin routes require a constant-time bearer token", async () => {
  const integration = makeApp();
  await request(integration.app).post("/admin/sync").expect(401);
  await request(integration.app).post("/admin/sync").set("authorization", `Bearer ${oauthConfig.ADMIN_API_KEY}`).expect(202);
  await settle();
  assert.equal(integration.getSyncCount(), 1);
  await request(integration.app).post("/admin/register-webhooks")
    .set("authorization", `Bearer ${oauthConfig.ADMIN_API_KEY}`).expect(200, { registered: true });
  assert.equal(integration.hooks.length, 3);
});

test("personal mode rejects webhook registration and errors remain private", async () => {
  const { app } = makeApp({ mode: "personal" });
  await request(app).post("/admin/register-webhooks")
    .set("authorization", `Bearer ${oauthConfig.ADMIN_API_KEY}`).expect(500, { error: "Internal server error" });
  const failed = makeApp({ exchangeError: new Error("secret internal detail") });
  const response = await request(failed.app).get("/auth/loyverse/callback?code=code&state=state").expect(500);
  assert.doesNotMatch(response.text, /secret internal detail/);
});

test("request failures log Error objects under Pino's err field", async () => {
  const failure = new Error("diagnostic detail");
  const integration = makeApp({ exchangeError: failure });
  await request(integration.app).get("/auth/loyverse/callback?code=code&state=state").expect(500);
  assert.equal(integration.errors.length, 1);
  assert.deepEqual(integration.errors[0], { err: failure });
  assert.equal("error" in (integration.errors[0] as object), false);
});