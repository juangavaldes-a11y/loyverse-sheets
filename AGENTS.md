# Repository Agent Guide

## Project

This is a Node.js 20+ TypeScript backend that synchronizes Loyverse POS data to Google Sheets. Source files use ESM and compile to JavaScript under `dist/`.

## Commands

- Install dependencies: `npm ci`
- Build: `npm run build`
- Run tests: `npm test`
- Enforce coverage: `npm run coverage`
- Run locally: `npm run dev`
- Run one synchronization: `npm run sync`
- Run compiled service: `npm start`

Before completing code changes, run `npm run build`, `npm test`, and `npm run coverage`. Maintain at least 90% statement, branch, function, and line coverage.

## Architecture

- `src/app.ts`: Express routes, webhook handling, and synchronization locking.
- `src/auth.ts`: Loyverse personal-token and OAuth authorization-code flows.
- `src/loyverse.ts`: Paginated Loyverse REST client and retry behavior.
- `src/sheets.ts`: Google Sheets writes.
- `src/sync.ts`: Item, variant, inventory, and sales valuation transformations.
- `src/token-store.ts`: AES-256-GCM encrypted OAuth token persistence.
- `src/security.ts`: Shared timeout and constant-time comparison utilities.
- `test/`: Node test runner and Supertest coverage.

Keep API clients and transformation logic separate. Prefer constructor-injected dependencies for external HTTP, storage, timers, and Google APIs so tests remain deterministic.

## Security Invariants

- Never commit `.env`, API tokens, OAuth credentials, service-account JSON, encrypted token data, logs, `dist/`, `coverage/`, or `node_modules/`.
- Never put credentials or webhook secrets in URLs, query strings, logs, or returned error messages.
- OAuth callback `state` values must be random, short-lived, bounded, and single-use.
- Preserve constant-time comparison for bearer tokens and webhook signatures.
- Verify OAuth-owned Loyverse webhooks against the exact raw request bytes before parsing JSON.
- Personal access-token mode must use polling. Do not enable unsigned personal-token webhooks.
- Keep outbound request timeouts, retry limits, and Loyverse 429 handling.
- Keep API scopes read-only unless a requested feature explicitly requires write access.
- Store OAuth refresh tokens only in encrypted persistent storage.

## Data Behavior

- Follow Loyverse cursor pagination and the maximum page size of 250.
- Treat refunds as negative sales and cancelled receipts as zero valuation.
- Gross profit is net line sales minus `cost_total`.
- `Inventory_Current` is replaced; `Inventory_History` is appended.
- Loyverse exposes current inventory, not inventory history predating this integration.

## Change Discipline

- Keep changes focused and preserve the existing strict TypeScript and ESM style.
- Add or update tests for behavior changes, especially auth, webhook, retry, valuation, and Sheets-write paths.
- Do not weaken coverage thresholds or exclude additional source files merely to pass coverage.
- Update `README.md` and `.env.example` when configuration or deployment behavior changes.