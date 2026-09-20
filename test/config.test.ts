import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

const managedKeys = [
  "PORT", "PUBLIC_BASE_URL", "LOYVERSE_AUTH_MODE", "LOYVERSE_ACCESS_TOKEN", "LOYVERSE_CLIENT_ID",
  "LOYVERSE_CLIENT_SECRET", "LOYVERSE_SCOPES", "TOKEN_ENCRYPTION_KEY", "GOOGLE_SPREADSHEET_ID",
  "GOOGLE_SERVICE_ACCOUNT_JSON", "POLL_INTERVAL_MINUTES", "HISTORY_START_AT", "ADMIN_API_KEY",
] as const;

function configure(values: Record<string, string> = {}) {
  for (const key of managedKeys) delete process.env[key];
  Object.assign(process.env, {
    LOYVERSE_AUTH_MODE: "personal",
    LOYVERSE_ACCESS_TOKEN: "token",
    GOOGLE_SPREADSHEET_ID: "sheet",
    GOOGLE_SERVICE_ACCOUNT_JSON: "{}",
    ...values,
  });
}

test("configuration applies defaults and coercion", () => {
  configure({ PORT: "4000", POLL_INTERVAL_MINUTES: "5" });
  const config = loadConfig();
  assert.equal(config.PORT, 4000);
  assert.equal(config.PUBLIC_BASE_URL, "http://localhost:3000");
  assert.equal(config.POLL_INTERVAL_MINUTES, 5);
});

test("configuration requires personal and OAuth credentials", () => {
  configure({ LOYVERSE_ACCESS_TOKEN: "" });
  assert.throws(loadConfig, /LOYVERSE_ACCESS_TOKEN/);
  configure({ LOYVERSE_AUTH_MODE: "oauth", LOYVERSE_ACCESS_TOKEN: "" });
  assert.throws(loadConfig, /LOYVERSE_CLIENT_ID/);
  configure({ LOYVERSE_AUTH_MODE: "oauth", LOYVERSE_CLIENT_ID: "id", LOYVERSE_CLIENT_SECRET: "secret", TOKEN_ENCRYPTION_KEY: "f".repeat(64) });
  assert.equal(loadConfig().LOYVERSE_AUTH_MODE, "oauth");
});

test("configuration reports malformed values", () => {
  configure({ PUBLIC_BASE_URL: "not-a-url", HISTORY_START_AT: "yesterday" });
  assert.throws(loadConfig, /Invalid configuration/);
});