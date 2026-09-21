# Loyverse to Google Sheets

A TypeScript integration that backs up Loyverse items, variants, current and historical inventory snapshots, and receipt-line sales valuation into Google Sheets. It supports scheduled polling and Loyverse webhooks.

## Production Setup Order

Use this order because the Loyverse callback URL depends on the final Render service URL:

1. Create the Google Sheet and Google service account.
2. Create the Render Web Service and copy its public URL.
3. Create the Loyverse OAuth application with the exact Render callback URL.
4. Add all environment variables to Render and deploy.
5. Open `/auth/loyverse` on the Render service and approve access.
6. Confirm the first backup in Render logs and Google Sheets.

## Callback URL

Register this exact production redirect URL in the [Loyverse Developer Dashboard](https://developer.loyverse.com/apps):

```text
https://loyverse-sync.example.com/auth/loyverse/callback
```

Replace `loyverse-sync.example.com` with a domain you control. The value must exactly match `PUBLIC_BASE_URL` plus `/auth/loyverse/callback`.

For Render, this normally looks like:

```text
https://YOUR-SERVICE.onrender.com/auth/loyverse/callback
```

Do not register `localhost` for a Render deployment. Do not add a trailing slash, and do not reuse an old callback URL after a redeploy or failed authorization attempt because OAuth `state` values are temporary and single-use.

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

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Open **APIs & Services > Library**, find **Google Sheets API**, and enable it.
3. Open **IAM & Admin > Service Accounts** and create a service account named `loyverse-sheets`. A project role is not required.
4. Open that service account, select **Keys > Add key > Create new key > JSON**, and choose **Create**. The browser downloads the only copy of that private key, normally into `Downloads`.
5. Create the destination Google Sheet.
6. Open the downloaded JSON locally, copy its `client_email`, and share the sheet with that address as **Editor**. Do not change `client_email`.
7. Copy the ID between `/d/` and `/edit` in the Google Sheet URL. For example, the ID in `https://docs.google.com/spreadsheets/d/abc123/edit` is `abc123`.

If the JSON download is not visible, press `Ctrl+J` in the browser and choose **Show in folder**. Google cannot display the private key again; create a new key if the downloaded file is lost.

Convert the JSON to one line and copy it to the Windows clipboard from Git Bash:

```bash
node -e "const fs=require('fs'); const p=process.argv[1]; process.stdout.write(JSON.stringify(JSON.parse(fs.readFileSync(p,'utf8'))))" ~/Downloads/YOUR-KEY.json | clip
```

Paste it directly into Render as `GOOGLE_SERVICE_ACCOUNT_JSON`. Do not paste the JSON into chat, source code, GitHub, or logs. Do not add extra surrounding quotes; preserve the escaped `\n` characters inside `private_key`.

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

1. Open the [Loyverse Developer Dashboard](https://developer.loyverse.com/apps) and select **Add app**. If labels such as `apps_list.add_app` appear, reload without browser translation/extensions or use an English private browser window.
2. Use a name such as `Loyverse Google Sheets`, the repository URL as the website, and a short description of the backup integration.
3. Add the exact Render callback URL shown above.
4. Copy the generated Client ID and Client Secret into Render. Never commit the Client Secret.
5. Set `LOYVERSE_AUTH_MODE=oauth`, the read scopes, and `TOKEN_ENCRYPTION_KEY`.
6. After Render deploys, open `https://YOUR-SERVICE.onrender.com/auth/loyverse`.
7. Sign in to the Loyverse merchant account that contains the POS data and approve access.
8. The callback stores encrypted tokens, attempts to register signed webhooks, and starts the initial backup. If webhook registration fails, polling remains active and OAuth still succeeds.

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

## Deploy on Render

Create a Render **Web Service** from this GitHub repository using:

```text
Runtime: Node
Branch: main
Build Command: npm ci && npm run build
Start Command: npm start
Health Check Path: /health
```

Set the following environment variables in **Render > Service > Environment**:

| Variable | Value source |
| --- | --- |
| `NODE_VERSION` | Set to `22` |
| `PUBLIC_BASE_URL` | Render URL, for example `https://YOUR-SERVICE.onrender.com` |
| `LOYVERSE_AUTH_MODE` | Set to `oauth` |
| `LOYVERSE_CLIENT_ID` | Loyverse Developer Dashboard |
| `LOYVERSE_CLIENT_SECRET` | Loyverse Developer Dashboard |
| `LOYVERSE_SCOPES` | `ITEMS_READ INVENTORY_READ RECEIPTS_READ STORES_READ MERCHANT_READ` |
| `TOKEN_ENCRYPTION_KEY` | A generated 64-character hexadecimal secret |
| `ADMIN_API_KEY` | A second independently generated secret |
| `GOOGLE_SPREADSHEET_ID` | Text between `/d/` and `/edit` in the Sheet URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Complete compact service-account JSON |
| `POLL_INTERVAL_MINUTES` | `15` is a reasonable default |
| `HISTORY_START_AT` | Earliest receipt date, for example `2020-01-01T00:00:00.000Z` |

Do not set `PORT`; Render provides it. Generate each security key separately:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

For a native Render Node service, attach a persistent disk at:

```text
/opt/render/project/src/data
```

The encrypted OAuth refresh token is stored at `data/loyverse-tokens.enc`. Without a persistent disk, a restart or redeploy can remove it and require OAuth authorization again. Render persistent disks require an eligible paid service. Run only one service instance while the token store and synchronization lock are local files/process state.

After saving the environment, deploy the latest commit. Verify:

```text
GET https://YOUR-SERVICE.onrender.com/health
```

Expected response:

```json
{"ok":true}
```

Then start OAuth by opening:

```text
https://YOUR-SERVICE.onrender.com/auth/loyverse
```

Do not open the callback URL directly. A successful authorization displays `Loyverse connected. The first Google Sheets backup has started.`

## Container Deployment

Build the included container and deploy it behind a stable HTTPS domain:

```powershell
docker build -t loyverse-google-sheets .
docker run --env-file .env -p 3000:3000 -v loyverse-data:/app/data loyverse-google-sheets
```

For the Docker image, persist `/app/data`; this differs from the native Render mount path above. For a multi-instance deployment, replace the local token store with a managed encrypted database or secret store and use a distributed job lock.

## Verify and Troubleshoot

Successful synchronization produces a Render log similar to:

```json
{"result":{"items":0,"variants":0,"inventory":0,"salesLines":0},"msg":"Loyverse backup completed"}
```

Zero counts are expected for a new Loyverse merchant account. The five Sheet tabs should still be created with headers. Add an item or test sale, wait for the polling interval, or trigger a protected manual sync:

```bash
curl -X POST \
	-H "Authorization: Bearer $ADMIN_API_KEY" \
	https://YOUR-SERVICE.onrender.com/admin/sync
```

Common failures:

- **`Required in personal mode`**: `LOYVERSE_AUTH_MODE` is absent or not exactly `oauth`, so configuration falls back to personal mode.
- **Loyverse authorization returns 403 with a localhost callback**: set `PUBLIC_BASE_URL` to the Render HTTPS URL and register the exact matching callback in Loyverse.
- **Callback reports an invalid or expired state**: deploy first, then restart from `/auth/loyverse`; never reuse an old authorization or callback URL.
- **Google returns 403**: enable Google Sheets API in the service account's project and share the destination Sheet with its exact `client_email` as Editor.
- **OAuth succeeds but webhook registration warns**: polling remains active. Use the protected `/admin/register-webhooks` endpoint to retry after checking Render logs.
- **Authorization disappears after redeploy**: attach the persistent disk at `/opt/render/project/src/data` and authorize again once.
- **No data but backup completes**: confirm the authorized Loyverse merchant account actually contains items, inventory, or receipts.

Render logs contain the detailed server-side error under `err`, while browser responses intentionally remain generic. Never publish log lines containing authorization codes, OAuth state values, tokens, or Google private keys.

## Data Notes

- Loyverse returns current inventory levels, not a pre-existing stock history. The first run captures the current state; `Inventory_History` builds historical snapshots from that point onward.
- `Sales_Valuation` treats refunds as negative and cancelled receipts as zero. Gross profit is net line sales minus `cost_total`.
- API pagination uses the maximum page size of 250. HTTP 429 and server errors are retried with backoff.
- Loyverse's documented account limit is 300 requests per 300 seconds. Keep polling conservative and retain webhook reconciliation.
- Every inventory sync appends rows. Apply a Google Sheets retention/archive policy before approaching the spreadsheet cell limit.