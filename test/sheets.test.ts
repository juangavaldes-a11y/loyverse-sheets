import assert from "node:assert/strict";
import test from "node:test";
import type { sheets_v4 } from "googleapis";
import { SheetsBackup } from "../src/sheets.js";
import { oauthConfig } from "./helpers.js";

function fakeSheets(existingTitles: string[] = []) {
  const calls: Array<{ operation: string; request: unknown }> = [];
  const client = {
    spreadsheets: {
      get: async (request: unknown) => { calls.push({ operation: "get", request }); return { data: { sheets: existingTitles.map((title) => ({ properties: { title } })) } }; },
      batchUpdate: async (request: unknown) => { calls.push({ operation: "batchUpdate", request }); return {}; },
      values: {
        clear: async (request: unknown) => { calls.push({ operation: "clear", request }); return {}; },
        update: async (request: unknown) => { calls.push({ operation: "update", request }); return {}; },
        append: async (request: unknown) => { calls.push({ operation: "append", request }); return {}; },
      },
    },
  } as unknown as sheets_v4.Sheets;
  return { client, calls };
}

test("Sheets constructor rejects malformed credentials", () => {
  assert.throws(() => new SheetsBackup({ ...oauthConfig, GOOGLE_SERVICE_ACCOUNT_JSON: "bad" }), /valid one-line JSON/);
  assert.doesNotThrow(() => new SheetsBackup(oauthConfig));
});

test("replace creates a missing sheet, clears it, and writes headers", async () => {
  const { client, calls } = fakeSheets();
  await new SheetsBackup(oauthConfig, client).replace("O'Brien", ["id"], [[1]]);
  assert.deepEqual(calls.map((call) => call.operation), ["get", "batchUpdate", "clear", "update"]);
  assert.equal((calls[2]!.request as { range: string }).range, "'O''Brien'");
  assert.deepEqual((calls[3]!.request as { requestBody: { values: unknown } }).requestBody.values, [["id"], [1]]);
});

test("append writes a header only for a newly created sheet", async () => {
  const missing = fakeSheets();
  await new SheetsBackup(oauthConfig, missing.client).append("History", ["id"], [[1]]);
  assert.deepEqual(missing.calls.map((call) => call.operation), ["get", "batchUpdate", "update", "append"]);

  const existing = fakeSheets(["History"]);
  await new SheetsBackup(oauthConfig, existing.client).append("History", ["id"], [[2]]);
  assert.deepEqual(existing.calls.map((call) => call.operation), ["get", "append"]);
});

test("append does nothing for no rows", async () => {
  const { client, calls } = fakeSheets();
  await new SheetsBackup(oauthConfig, client).append("History", ["id"], []);
  assert.equal(calls.length, 0);
});