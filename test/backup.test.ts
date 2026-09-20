import assert from "node:assert/strict";
import test from "node:test";
import type { LoyverseClient } from "../src/loyverse.js";
import type { SheetsBackup } from "../src/sheets.js";
import { BackupService } from "../src/sync.js";
import { oauthConfig } from "./helpers.js";

test("full backup joins catalog data and writes all five datasets", async () => {
  const data: Record<string, unknown[]> = {
    "/items": [{ id: "item", item_name: "Coffee", track_stock: true, updated_at: "item-time" }],
    "/variants": [{ variant_id: "variant", item_id: "item", sku: "SKU", cost: 3, purchase_cost: 2,
      default_price: 10, stores: [{ store_id: "store", price: 12 }], updated_at: "variant-time" }],
    "/inventory": [{ variant_id: "variant", store_id: "store", in_stock: 4, updated_at: "stock-time" }],
    "/receipts": [{ receipt_number: "1-1", receipt_type: "SALE", receipt_date: "2026-01-01", updated_at: "receipt-time",
      store_id: "store", total_money: 10, total_tax: 0, total_discount: 0,
      line_items: [{ id: "line", item_id: "item", variant_id: "variant", item_name: "Coffee", quantity: 1,
        gross_total_money: 10, total_money: 10, cost: 3, cost_total: 3, total_discount: 0 }] }],
  };
  const loyverse = { paginate: async (path: string) => data[path] } as unknown as LoyverseClient;
  const writes: Array<{ method: string; title: string; rows: unknown[][] }> = [];
  const sheets = {
    replace: async (title: string, _headers: string[], rows: unknown[][]) => { writes.push({ method: "replace", title, rows }); },
    append: async (title: string, _headers: string[], rows: unknown[][]) => { writes.push({ method: "append", title, rows }); },
  } as SheetsBackup;
  const result = await new BackupService(oauthConfig, loyverse, sheets).syncAll();
  assert.deepEqual(result, { items: 1, variants: 1, inventory: 1, salesLines: 1 });
  assert.deepEqual(writes.map((write) => `${write.method}:${write.title}`), [
    "replace:Items", "replace:Variants", "replace:Inventory_Current", "append:Inventory_History", "replace:Sales_Valuation",
  ]);
  const inventory = writes[2]!.rows[0]!;
  assert.equal(inventory[3], "Coffee");
  assert.equal(inventory[8], 12);
  assert.equal(inventory[9], 48);
});