import { LoyverseAuth } from "./auth.js";
import { loadConfig } from "./config.js";
import { LoyverseClient } from "./loyverse.js";
import { SheetsBackup } from "./sheets.js";
import { BackupService } from "./sync.js";

export function createServices() {
  const config = loadConfig();
  const auth = new LoyverseAuth(config);
  const loyverse = new LoyverseClient(auth);
  const sheets = new SheetsBackup(config);
  const backup = new BackupService(config, loyverse, sheets);
  return { config, auth, loyverse, backup };
}