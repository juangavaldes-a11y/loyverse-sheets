# Loyverse to Google Sheets

A TypeScript integration that backs up Loyverse items, variants, current and historical inventory snapshots, and receipt-line sales valuation into Google Sheets. It supports scheduled polling and Loyverse webhooks.

## Callback URL

Register this exact production redirect URL in the [Loyverse Developer Dashboard](https://developer.loyverse.com/apps):

```text
https://loyverse-sync.example.com/auth/loyverse/callback
```

Replace `loyverse-sync.example.com` with a domain you control. The value must exactly match `PUBLIC_BASE_URL` plus `/auth/loyverse/callback`.

For local OAuth testing, register:

```text
http://localhost:3000/auth/loyverse/callback
```

Local HTTP is appropriate only for the loopback interface. Loyverse webhook URLs must be public HTTPS URLs, so use an HTTPS tunnel such as Cloudflare Tunnel or ngrok and register its callback URL when testing webhooks locally:

```text
https://your-random-host.ngrok-free.app/auth/loyverse/callback
```

## Authentication Choice

Loyverse supports these two methods:

- **Personal access token:** simplest for a scheduled integration owned by one Loyverse account.
- **OAuth 2.0 authorization code:** appropriate for a distributable app or signed webhooks. Access tokens are refreshed automatically and refresh tokens are encrypted at rest with AES-256-GCM.

Loyverse does **not** document or support the OAuth `client_credentials` grant. The client ID and secret are used with the authorization-code and refresh-token grants, not as a standalone machine credential.

Use only these read scopes:

```text
ITEMS_READ INVENTORY_READ RECEIPTS_READ STORES_READ MERCHANT_READ
```

## Google Setup

1. Create or select a Google Cloud project.
2. Enable **Google Sheets API**.
3. Create a service account and download its JSON key.
4. Create the destination Google Sheet.
5. Share the sheet with the service account's `client_email` as **Editor**.
6. Copy the ID between `/d/` and `/edit` in the Google Sheet URL.

The service creates these tabs:

- `Items`: current catalog, including deleted records.
- `Variants`: SKU, options, cost, purchase cost, and default price.
- `Inventory_Current`: latest quantity and cost/retail valuation by store and variant.
- `Inventory_History`: an appended snapshot on every sync.
- `Sales_Valuation`: historical receipt lines with net sales, cost of goods, and gross profit.

## Configure

Requirements: Node.js 20 or newer.

```powershell
npm install
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put the generated value in `TOKEN_ENCRYPTION_KEY`. Generate a separate random value for `ADMIN_API_KEY`.

Convert the downloaded Google key to one line without exposing it in source control:

```powershell
(Get-Content .\service-account.json -Raw | ConvertFrom-Json | ConvertTo-Json -Compress)
```

Paste that output into `GOOGLE_SERVICE_ACCOUNT_JSON` in `.env`. Set `GOOGLE_SPREADSHEET_ID` and choose an authentication mode.

### Personal Token

1. Create a token in Loyverse Back Office under **Integrations > Access tokens**.
2. Set `LOYVERSE_AUTH_MODE=personal` and `LOYVERSE_ACCESS_TOKEN`.
3. Use scheduled polling. The service intentionally refuses personal-token webhooks because Loyverse does not sign them.

### OAuth App

1. Create an app in the Loyverse Developer Dashboard.
2. Add the exact callback URL shown above.
3. Set `LOYVERSE_AUTH_MODE=oauth`, `LOYVERSE_CLIENT_ID`, `LOYVERSE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`, and the read scopes.
4. Start the service and open `http://localhost:3000/auth/loyverse`, or the corresponding cloud URL.
5. Approve access. The callback stores encrypted tokens, registers signed webhooks when `PUBLIC_BASE_URL` uses HTTPS, and starts the initial backup.

OAuth-owned webhook payloads are checked against `X-Loyverse-Signature` using the raw request bytes and HMAC-SHA1, as required by Loyverse.

## Run

One-time or scheduled sync without a web server:

```powershell
npm run sync
```

Local webhook/OAuth server:

```powershell
npm run dev
```

Production:

```powershell
npm run build
npm start
```

Run the test suite with enforced 90% thresholds:

```powershell
npm run coverage
```

Useful endpoints:

```text
GET  /health
GET  /auth/loyverse
GET  /auth/loyverse/callback
POST /webhooks/loyverse
POST /admin/sync
POST /admin/register-webhooks
```

Send `Authorization: Bearer <ADMIN_API_KEY>` to both admin endpoints. `POLL_INTERVAL_MINUTES=15` runs a reconciliation every 15 minutes; set it to `0` to disable polling.

## Cloud Deployment

Build the included container and deploy it behind a stable HTTPS domain:

```powershell
docker build -t loyverse-google-sheets .
docker run --env-file .env -p 3000:3000 -v loyverse-data:/app/data loyverse-google-sheets
```

Persist `/app/data` in OAuth mode because it contains the encrypted refresh token. For a multi-instance deployment, replace the local token store with a managed encrypted database or secret store and use a distributed job lock.

## Data Notes

- Loyverse returns current inventory levels, not a pre-existing stock history. The first run captures the current state; `Inventory_History` builds historical snapshots from that point onward.
- `Sales_Valuation` treats refunds as negative and cancelled receipts as zero. Gross profit is net line sales minus `cost_total`.
- API pagination uses the maximum page size of 250. HTTP 429 and server errors are retried with backoff.
- Loyverse's documented account limit is 300 requests per 300 seconds. Keep polling conservative and retain webhook reconciliation.
- Every inventory sync appends rows. Apply a Google Sheets retention/archive policy before approaching the spreadsheet cell limit.