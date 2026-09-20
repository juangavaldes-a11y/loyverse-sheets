import type { Config } from "./config.js";
import type { InventoryLevel, Item, LoyverseClient, Receipt, Variant } from "./loyverse.js";
import type { Cell, SheetsBackup } from "./sheets.js";

export const HEADERS = {
  items: ["item_id", "item_name", "reference_id", "category_id", "track_stock", "updated_at", "deleted_at"],
  variants: ["variant_id", "item_id", "item_name", "sku", "barcode", "options", "cost", "purchase_cost", "default_price", "updated_at", "deleted_at"],
  inventory: ["captured_at", "store_id", "variant_id", "item_name", "sku", "in_stock", "unit_cost", "unit_price", "stock_cost_value", "stock_retail_value", "loyverse_updated_at"],
  sales: ["receipt_number", "receipt_date", "receipt_type", "refund_for", "store_id", "cancelled", "line_id", "item_id", "variant_id", "item_name", "variant_name", "sku", "quantity", "gross_sales", "net_sales", "cost_of_goods", "gross_profit", "discount"],
} as const;

export function salesRows(receipts: Receipt[]): Cell[][] {
  return receipts.flatMap((receipt) => {
    const direction = receipt.receipt_type === "REFUND" ? -1 : 1;
    const effective = receipt.cancelled_at ? 0 : direction;
    return receipt.line_items.map((line) => {
      const netSales = effective * line.total_money;
      const cost = effective * line.cost_total;
      return [
        receipt.receipt_number, receipt.receipt_date, receipt.receipt_type, receipt.refund_for ?? null,
        receipt.store_id, Boolean(receipt.cancelled_at), line.id, line.item_id, line.variant_id,
        line.item_name, line.variant_name ?? null, line.sku ?? null, effective * line.quantity,
        effective * line.gross_total_money, netSales, cost, netSales - cost,
        effective * line.total_discount,
      ];
    });
  });
}

export class BackupService {
  constructor(
    private readonly config: Config,
    private readonly loyverse: LoyverseClient,
    private readonly sheets: SheetsBackup,
  ) {}

  async syncAll(): Promise<{ items: number; variants: number; inventory: number; salesLines: number }> {
    const [items, variants, inventory, receipts] = await Promise.all([
      this.loyverse.paginate<Item>("/items", "items", { show_deleted: "true" }),
      this.loyverse.paginate<Variant>("/variants", "variants", { show_deleted: "true" }),
      this.loyverse.paginate<InventoryLevel>("/inventory", "inventory_levels"),
      this.loyverse.paginate<Receipt>("/receipts", "receipts", { created_at_min: this.config.HISTORY_START_AT }),
    ]);
    const itemById = new Map(items.map((item) => [item.id, item]));
    const variantById = new Map(variants.map((variant) => [variant.variant_id, variant]));
    const capturedAt = new Date().toISOString();

    const itemRows = items.map((item) => [item.id, item.item_name, item.reference_id ?? null, item.category_id ?? null, item.track_stock, item.updated_at, item.deleted_at ?? null]);
    const variantRows = variants.map((variant) => [
      variant.variant_id, variant.item_id, itemById.get(variant.item_id)?.item_name ?? null,
      variant.sku ?? null, variant.barcode ?? null,
      [variant.option1_value, variant.option2_value, variant.option3_value].filter(Boolean).join(" / "),
      variant.cost ?? 0, variant.purchase_cost ?? 0, variant.default_price ?? null,
      variant.updated_at, variant.deleted_at ?? null,
    ]);
    const inventoryRows = inventory.map((level) => {
      const variant = variantById.get(level.variant_id);
      const item = variant ? itemById.get(variant.item_id) : undefined;
      const override = variant?.stores?.find((store) => store.store_id === level.store_id);
      const cost = variant?.cost ?? 0;
      const price = override?.price ?? variant?.default_price ?? 0;
      return [capturedAt, level.store_id, level.variant_id, item?.item_name ?? null, variant?.sku ?? null,
        level.in_stock, cost, price, level.in_stock * cost, level.in_stock * price, level.updated_at];
    });
    const valuationRows = salesRows(receipts);

    await this.sheets.replace("Items", [...HEADERS.items], itemRows);
    await this.sheets.replace("Variants", [...HEADERS.variants], variantRows);
    await this.sheets.replace("Inventory_Current", [...HEADERS.inventory], inventoryRows);
    await this.sheets.append("Inventory_History", [...HEADERS.inventory], inventoryRows);
    await this.sheets.replace("Sales_Valuation", [...HEADERS.sales], valuationRows);

    return { items: items.length, variants: variants.length, inventory: inventory.length, salesLines: valuationRows.length };
  }
}