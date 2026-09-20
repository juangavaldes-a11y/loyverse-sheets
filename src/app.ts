import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import pino from "pino";
import type { Config } from "./config.js";
import type { LoyverseAuth } from "./auth.js";
import type { LoyverseClient } from "./loyverse.js";
import type { BackupService } from "./sync.js";
import { safeEqual } from "./security.js";
import { validLoyverseSignature, validWebhookPayload } from "./webhook.js";

const logger = pino();

export function createApp(config: Config, auth: LoyverseAuth, loyverse: LoyverseClient, backup: BackupService) {
  const app = express();
  let syncRunning = false;

  const runSync = async () => {
    if (syncRunning) return;
    syncRunning = true;
    try {
      logger.info({ result: await backup.syncAll() }, "Loyverse backup completed");
    } catch (error) {
      logger.error({ error }, "Loyverse backup failed");
    } finally {
      syncRunning = false;
    }
  };

  const registerWebhooks = async () => {
    if (config.LOYVERSE_AUTH_MODE !== "oauth") throw new Error("Secure webhooks require OAuth mode; use polling with a personal token");
    const url = `${config.PUBLIC_BASE_URL.replace(/\/$/, "")}/webhooks/loyverse`;
    for (const type of ["inventory_levels.update", "items.update", "receipts.update"]) {
      await loyverse.ensureWebhook(url, type);
    }
  };

  app.use((request, response, next) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    response.on("finish", () => {
      logger.info({ requestId, method: request.method, path: request.path, status: response.statusCode,
        durationMs: Date.now() - startedAt }, "HTTP request");
    });
    next();
  });
  app.get("/health", (_request, response) => response.json({ ok: true }));

  app.get("/auth/loyverse", (_request, response) => response.redirect(auth.createAuthorizationUrl()));
  app.get("/auth/loyverse/callback", async (request, response, next) => {
    try {
      const code = typeof request.query.code === "string" ? request.query.code : "";
      const state = typeof request.query.state === "string" ? request.query.state : "";
      if (!code || !state) throw new Error("Missing OAuth code or state");
      await auth.exchangeCode(code, state);
      if (config.PUBLIC_BASE_URL.startsWith("https://")) await registerWebhooks();
      void runSync();
      response.type("text").send("Loyverse connected. The first Google Sheets backup has started.");
    } catch (error) {
      next(error);
    }
  });

  app.post("/webhooks/loyverse", express.raw({ type: "application/json", limit: "1mb" }), (request, response) => {
    const rawBody = request.body as Buffer;
    const valid = config.LOYVERSE_AUTH_MODE === "oauth"
      && validLoyverseSignature(rawBody, request.header("x-loyverse-signature"), config.LOYVERSE_CLIENT_SECRET!);
    if (!valid) return response.status(401).json({ error: "Invalid webhook authentication" });
    if (!validWebhookPayload(rawBody)) return response.status(400).json({ error: "Invalid webhook payload" });
    void runSync();
    return response.status(202).json({ accepted: true });
  });

  app.use(express.json({ limit: "100kb" }));
  const requireAdmin = (request: Request, response: Response, next: NextFunction) => {
    const token = request.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (!config.ADMIN_API_KEY || !safeEqual(token, config.ADMIN_API_KEY)) {
      return response.status(401).json({ error: "Unauthorized" });
    }
    return next();
  };
  app.post("/admin/sync", requireAdmin, (_request, response) => {
    void runSync();
    response.status(202).json({ accepted: true });
  });
  app.post("/admin/register-webhooks", requireAdmin, async (_request, response, next) => {
    try {
      await registerWebhooks();
      response.json({ registered: true });
    } catch (error) {
      next(error);
    }
  });
  app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
    logger.error({ error }, "Request failed");
    response.status(500).json({ error: "Internal server error" });
  });

  return { app, runSync };
}