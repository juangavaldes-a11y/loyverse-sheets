import assert from "node:assert/strict";
import test from "node:test";
import { salesRows } from "../src/sync.js";
import type { Receipt } from "../src/loyverse.js";

const receipt: Receipt = {
  receipt_number: "1-1", receipt_type: "SALE", receipt_date: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z", store_id: "store", total_money: 8,
  total_tax: 0, total_discount: 2,
  line_items: [{ id: "line", item_id: "item", variant_id: "variant", item_name: "Coffee",
    quantity: 1, gross_total_money: 10, total_money: 8, cost: 3, cost_total: 3, total_discount: 2 }],
};

test("sales valuation signs refunds and calculates gross profit", () => {
  const sale = salesRows([receipt])[0]!;
  const refund = salesRows([{ ...receipt, receipt_type: "REFUND" }])[0]!;
  assert.equal(sale[16], 5);
  assert.equal(refund[14], -8);
  assert.equal(refund[16], -5);
});

test("cancelled receipts have zero effective valuation", () => {
  const row = salesRows([{ ...receipt, cancelled_at: "2026-01-02T00:00:00Z" }])[0]!;
  assert.equal(row[13], 0);
  assert.equal(row[16], 0);
});