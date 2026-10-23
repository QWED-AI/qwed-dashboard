# QWED Dashboard

An open-source web dashboard for [QWED verification](https://github.com/QWED-AI/qwed-verification). It shows what your QWED server verified, as the server stored it: the decision ledger, each record, and whether its audit chain entry is intact.

**Status: early work in progress.** This first version covers sign-in, the decision ledger, a record view and the per-entry audit chain check.

## What it does and does not do

- It reads verdicts and admissions from what the server stored. It never works out a verdict or an admission itself; the QWED verifier is the only authority for both.
- When the server did not store a value, the dashboard says "not recorded" instead of filling it in. Today the `/verify/*` routes store the engine result without its admission, so most records show admission as not recorded.
- It does not run or replay the actions that were verified.

## Run it

You need Node.js 22.12 or later and a running QWED server (`qwed-verification`).

```bash
npm ci
cp .env.example .env
npm run dev
```

Then open <http://localhost:5173>. During development, requests to `/api` go to the server in `QWED_API_URL` (default `http://localhost:8000`).

To look around without a server, choose **Explore with sample data** on the sign-in page. Sample data stays in your browser.

### Build

```bash
npm run build
```

`dist/` is a static site. Serve it behind the same origin as your QWED server and route `/api` to it, or set `VITE_QWED_API_BASE` at build time to call the server directly (the server's `QWED_CORS_ORIGINS` must then allow the dashboard's origin).

## How it talks to the server

| Screen | Server route | Credential |
|---|---|---|
| Sign in | `POST /auth/signin` | email and password |
| Overview, Decision ledger | `GET /audit/logs` | session token |
| Record | `GET /audit/logs/{id}` | session token |
| API keys | `GET`, `POST /auth/api-keys`, `DELETE /auth/api-keys/{id}` | session token |
| Audit chain entry check | `GET /admin/compliance/verify/{id}` | session token of an owner or admin |
| Whole-chain check (Overview) | `GET /admin/compliance/verify-trail` | session token of an owner or admin |
| Security events (also the Overview card) | `GET /admin/security/events` | session token of an owner or admin |

The API keys screen shows when each key was last used. qwed-verification records it from [#486](https://github.com/QWED-AI/qwed-verification/issues/486), at most once a minute per key; on an older server every key reads "No use recorded". The security events screen needs #486 too.

The Overview counts the newest 200 records the server returns, over the 24 hours or 7 days up to the newest record. When older records in that range are not loaded, it says how far back the counts reach. It groups the stored verdicts; it never works one out.

The session token is kept in `sessionStorage`, so closing the tab signs you out.

The audit chain checks take the signed-in session from qwed-verification releases with [#485](https://github.com/QWED-AI/qwed-verification/issues/485). An older server takes only an owner or admin API key for the entry check and has no whole-chain check. Against such a server the dashboard asks for a key when you first run an entry check, keeps it in memory for that tab and never stores it.

## Development

```bash
npm run typecheck
npm test
```

## Browser testing

This project is tested with BrowserStack.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
