import assert from "node:assert/strict";
import test from "node:test";
import { LoyverseAuth } from "../src/auth.js";
import type { OAuthTokens } from "../src/token-store.js";
import { jsonResponse, oauthConfig } from "./helpers.js";

class MemoryStore {
  saved?: OAuthTokens;
  constructor(private loaded?: OAuthTokens) {}
  async load() { return this.loaded; }
  async save(tokens: OAuthTokens) { this.saved = tokens; this.loaded = tokens; }
}

test("personal authentication returns its token and rejects OAuth initiation", async () => {
  const auth = new LoyverseAuth({ ...oauthConfig, LOYVERSE_AUTH_MODE: "personal", LOYVERSE_ACCESS_TOKEN: "personal" });
  assert.equal(await auth.getAccessToken(), "personal");
  assert.throws(() => auth.createAuthorizationUrl(), /OAuth mode is not enabled/);
});

test("OAuth URL contains an exact callback, scopes, and one-time state", () => {
  const auth = new LoyverseAuth({ ...oauthConfig, PUBLIC_BASE_URL: "https://sync.example.com/" }, new MemoryStore());
  assert.equal(auth.redirectUri, "https://sync.example.com/auth/loyverse/callback");
  const url = new URL(auth.createAuthorizationUrl());
  assert.equal(url.origin + url.pathname, "https://api.loyverse.com/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "client-id");
  assert.equal(url.searchParams.get("scope"), oauthConfig.LOYVERSE_SCOPES);
  assert.match(url.searchParams.get("state")!, /^[a-f0-9]{64}$/);
});

test("OAuth exchange validates state, stores tokens, and prevents replay", async () => {
  const store = new MemoryStore();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const http = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return jsonResponse({ access_token: "access", refresh_token: "refresh", expires_in: 3600 });
  };
  const auth = new LoyverseAuth(oauthConfig, store, http);
  const state = new URL(auth.createAuthorizationUrl()).searchParams.get("state")!;
  await auth.exchangeCode("code", state);
  assert.equal(store.saved?.accessToken, "access");
  assert.match(String(calls[0]?.init?.body), /grant_type=authorization_code/);
  await assert.rejects(auth.exchangeCode("code", state), /Invalid or expired OAuth state/);
});

test("OAuth exchange requires a refresh token and redacts upstream bodies", async () => {
  const noRefresh = new LoyverseAuth(oauthConfig, new MemoryStore(), async () => jsonResponse({ access_token: "a", expires_in: 1 }));
  const state = new URL(noRefresh.createAuthorizationUrl()).searchParams.get("state")!;
  await assert.rejects(noRefresh.exchangeCode("code", state), /did not return a refresh token/);

  const failed = new LoyverseAuth(oauthConfig, new MemoryStore(), async () => new Response("secret-body", { status: 401 }));
  const failedState = new URL(failed.createAuthorizationUrl()).searchParams.get("state")!;
  await assert.rejects(failed.exchangeCode("code", failedState), (error: Error) => {
    assert.match(error.message, /\(401\)/);
    assert.doesNotMatch(error.message, /secret-body/);
    return true;
  });
});

test("OAuth access loads valid tokens and refreshes expired tokens", async () => {
  const valid = new LoyverseAuth(oauthConfig, new MemoryStore({ accessToken: "valid", refreshToken: "r", expiresAt: Date.now() + 120_000 }));
  assert.equal(await valid.getAccessToken(), "valid");

  const store = new MemoryStore({ accessToken: "old", refreshToken: "original", expiresAt: 0 });
  const refreshed = new LoyverseAuth(oauthConfig, store, async () => jsonResponse({ access_token: "new", expires_in: 3600 }));
  assert.equal(await refreshed.getAccessToken(), "new");
  assert.equal(store.saved?.refreshToken, "original");
});

test("OAuth access fails clearly before connection", async () => {
  const auth = new LoyverseAuth(oauthConfig, new MemoryStore());
  await assert.rejects(auth.getAccessToken(), /OAuth is not connected/);
});

test("OAuth pending states are bounded", () => {
  const auth = new LoyverseAuth(oauthConfig, new MemoryStore());
  for (let count = 0; count < 100; count += 1) auth.createAuthorizationUrl();
  assert.throws(() => auth.createAuthorizationUrl(), /Too many pending OAuth requests/);
});