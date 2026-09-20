import type { Config } from "../src/config.js";

export const oauthConfig: Config = {
  PORT: 3000,
  PUBLIC_BASE_URL: "https://sync.example.com",
  LOYVERSE_AUTH_MODE: "oauth",
  LOYVERSE_CLIENT_ID: "client-id",
  LOYVERSE_CLIENT_SECRET: "client-secret",
  LOYVERSE_SCOPES: "ITEMS_READ INVENTORY_READ RECEIPTS_READ",
  TOKEN_ENCRYPTION_KEY: "a".repeat(64),
  GOOGLE_SPREADSHEET_ID: "spreadsheet-id",
  GOOGLE_SERVICE_ACCOUNT_JSON: "{}",
  POLL_INTERVAL_MINUTES: 0,
  HISTORY_START_AT: "2020-01-01T00:00:00.000Z",
  ADMIN_API_KEY: "admin-key-that-is-long-enough",
};

export function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", ...headers } });
}