import type { LoyverseAuth } from "./auth.js";
import { fetchWithTimeout } from "./security.js";

const API_BASE = "https://api.loyverse.com/v1.0";
type HttpRequest = (url: string, init?: RequestInit) => Promise<Response>;
type Sleep = (milliseconds: number) => Promise<void>;

export interface Item {
  id: string;
  item_name: string;
  reference_id?: string | null;
  category_id?: string | null;
  track_stock: boolean;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Variant {
  variant_id: string;
  item_id: string;
  sku?: string | null;
  barcode?: string | null;
  option1_value?: string | null;
  option2_value?: string | null;
  option3_value?: string | null;
  cost?: number | null;
  purchase_cost?: number | null;
  default_price?: number | null;
  stores?: Array<{ store_id: string; price?: number | null; pricing_type?: string; available_for_sale?: boolean }>;
  updated_at: string;
  deleted_at?: string | null;
}

export interface InventoryLevel {
  variant_id: string;
  store_id: string;
  in_stock: number;
  updated_at: string;
}

export interface ReceiptLine {
  id: string;
  item_id: string;
  variant_id: string;
  item_name: string;
  variant_name?: string | null;
  sku?: string | null;
  quantity: number;
  gross_total_money: number;
  total_money: number;
  cost: number;
  cost_total: number;
  total_discount: number;
}

export interface Receipt {
  receipt_number: string;
  receipt_type: "SALE" | "REFUND";
  refund_for?: string | null;
  receipt_date: string;
  updated_at: string;
  cancelled_at?: string | null;
  store_id: string;
  total_money: number;
  total_tax: number;
  total_discount: number;
  line_items: ReceiptLine[];
}

interface Webhook {
  url: string;
  type: string;
  status: string;
}

export class LoyverseClient {
  constructor(
    private readonly auth: LoyverseAuth,
    private readonly httpRequest: HttpRequest = fetchWithTimeout,
    private readonly sleep: Sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {}

  async paginate<T>(path: string, resultKey: string, params: Record<string, string> = {}): Promise<T[]> {
    const all: T[] = [];
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ ...params, limit: "250" });
      if (cursor) query.set("cursor", cursor);
      const page = await this.request<Record<string, unknown>>(`${path}?${query.toString()}`);
      const rows = page[resultKey];
      if (!Array.isArray(rows)) throw new Error(`Loyverse response did not contain ${resultKey}`);
      all.push(...rows as T[]);
      cursor = typeof page.cursor === "string" ? page.cursor : undefined;
    } while (cursor);
    return all;
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await this.httpRequest(`${API_BASE}${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${await this.auth.getAccessToken()}`,
          accept: "application/json",
          ...(init?.body ? { "content-type": "application/json" } : {}),
          ...init?.headers,
        },
      });
      if (response.ok) return response.json() as Promise<T>;
      await response.arrayBuffer();
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`Loyverse API request failed (${response.status})`);
      }
      if (attempt === 4) throw new Error(`Loyverse API failed after retries (${response.status})`);
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
      await this.sleep(waitMs);
    }
    throw new Error("Unreachable retry state");
  }

  async ensureWebhook(url: string, type: string): Promise<void> {
    const response = await this.request<unknown>("/webhooks/");
    const existing = Array.isArray(response)
      ? response as Webhook[]
      : typeof response === "object" && response !== null && Array.isArray((response as { webhooks?: unknown }).webhooks)
        ? (response as { webhooks: Webhook[] }).webhooks
        : undefined;
    if (!existing) throw new Error("Loyverse webhook list returned an unexpected response");
    if (existing.some((hook) => hook.url === url && hook.type === type && hook.status === "ENABLED")) return;
    await this.request("/webhooks/", {
      method: "POST",
      body: JSON.stringify({ url, type, status: "ENABLED" }),
    });
  }
}