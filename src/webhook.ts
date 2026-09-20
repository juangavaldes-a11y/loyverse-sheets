import { createHmac } from "node:crypto";
import { z } from "zod";
import { safeEqual } from "./security.js";

const webhookPayload = z.object({
  merchant_id: z.string().min(1),
  type: z.enum(["inventory_levels.update", "items.update", "receipts.update"]),
  created_at: z.string().min(1),
}).passthrough();

export function validLoyverseSignature(rawBody: Buffer, signature: string | undefined, clientSecret: string): boolean {
  if (!signature || !/^[a-f0-9]{40}$/.test(signature)) return false;
  const expected = createHmac("sha1", clientSecret).update(rawBody).digest("hex");
  return safeEqual(expected, signature);
}

export function validWebhookPayload(rawBody: Buffer): boolean {
  try {
    return webhookPayload.safeParse(JSON.parse(rawBody.toString("utf8"))).success;
  } catch {
    return false;
  }
}