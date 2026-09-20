import { google, type sheets_v4 } from "googleapis";
import type { Config } from "./config.js";

export type Cell = string | number | boolean | null;

export class SheetsBackup {
  private readonly sheets: sheets_v4.Sheets;
  private readonly spreadsheetId: string;

  constructor(config: Config, sheets?: sheets_v4.Sheets) {
    this.spreadsheetId = config.GOOGLE_SPREADSHEET_ID;
    if (sheets) {
      this.sheets = sheets;
      return;
    }
    let credentials: object;
    try {
      credentials = JSON.parse(config.GOOGLE_SERVICE_ACCOUNT_JSON) as object;
    } catch {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON must be valid one-line JSON");
    }
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    this.sheets = google.sheets({ version: "v4", auth });
  }

  async replace(title: string, headers: string[], rows: Cell[][]): Promise<void> {
    await this.ensureSheet(title);
    const range = this.range(title);
    await this.sheets.spreadsheets.values.clear({ spreadsheetId: this.spreadsheetId, range });
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${range}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers, ...rows] },
    });
  }

  async append(title: string, headers: string[], rows: Cell[][]): Promise<void> {
    if (rows.length === 0) return;
    const created = await this.ensureSheet(title);
    if (created) {
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.range(title)}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: [headers] },
      });
    }
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${this.range(title)}!A:A`,
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: rows },
    });
  }

  private async ensureSheet(title: string): Promise<boolean> {
    const spreadsheet = await this.sheets.spreadsheets.get({
      spreadsheetId: this.spreadsheetId,
      fields: "sheets.properties.title",
    });
    if (spreadsheet.data.sheets?.some((sheet) => sheet.properties?.title === title)) return false;
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
    return true;
  }

  private range(title: string): string {
    return `'${title.replaceAll("'", "''")}'`;
  }
}