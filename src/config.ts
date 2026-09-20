import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
  LOYVERSE_AUTH_MODE: z.enum(["personal", "oauth"]).default("personal"),
  LOYVERSE_ACCESS_TOKEN: z.string().optional(),
  LOYVERSE_CLIENT_ID: z.string().optional(),
  LOYVERSE_CLIENT_SECRET: z.string().optional(),
  LOYVERSE_SCOPES: z.string().default("ITEMS_READ INVENTORY_READ RECEIPTS_READ STORES_READ MERCHANT_READ"),
  TOKEN_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  GOOGLE_SPREADSHEET_ID: z.string().min(1),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(1),
  POLL_INTERVAL_MINUTES: z.coerce.number().nonnegative().default(15),
  HISTORY_START_AT: z.string().datetime().default("2020-01-01T00:00:00.000Z"),
  ADMIN_API_KEY: z.string().min(24).optional(),
}).superRefine((value, context) => {
  if (value.LOYVERSE_AUTH_MODE === "personal" && !value.LOYVERSE_ACCESS_TOKEN) {
    context.addIssue({ code: "custom", path: ["LOYVERSE_ACCESS_TOKEN"], message: "Required in personal mode" });
  }
  if (value.LOYVERSE_AUTH_MODE === "oauth") {
    for (const key of ["LOYVERSE_CLIENT_ID", "LOYVERSE_CLIENT_SECRET", "TOKEN_ENCRYPTION_KEY"] as const) {
      if (!value[key]) context.addIssue({ code: "custom", path: [key], message: "Required in OAuth mode" });
    }
  }
});

export type Config = z.infer<typeof schema>;

export function loadConfig(): Config {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}