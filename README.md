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
| Decision ledger | `GET /audit/logs` | session token |
| Record | `GET /audit/logs/{id}` | session token |
| Audit chain check | `GET /admin/compliance/verify/{id}` | owner or admin API key |

The session token is kept in `sessionStorage`, so closing the tab signs you out. The audit chain check route accepts only an API key, so the dashboard asks for one when you first run a check. It keeps the key in memory for that tab and never stores it.

## Development

```bash
npm run typecheck
npm test
```

## Licence

Apache-2.0. See [LICENSE](LICENSE).
