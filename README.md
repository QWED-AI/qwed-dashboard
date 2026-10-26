# QWED Dashboard

An open-source web dashboard for [QWED verification](https://github.com/QWED-AI/qwed-verification). It shows what your QWED server verified, as the server stored it: the decision ledger, each record, and whether its audit chain entry is intact.

**Status: early work in progress.** This first version covers sign-in, the decision ledger, a record view and the per-entry audit chain check.

## What it does and does not do

- It reads verdicts and admissions from what the server stored. It never works out a verdict or an admission itself; the QWED verifier is the only authority for both.
- When the server did not store a value, the dashboard says "not recorded" instead of filling it in.
- The admission is the one the server stored with the record ([qwed-verification #307](https://github.com/QWED-AI/qwed-verification/issues/307)). The verify routes store `BLOCKED` for the decision a Verification Context calls `DENY` ([#324](https://github.com/QWED-AI/qwed-verification/issues/324)), so the dashboard shows it as DENY and says it was stored as BLOCKED. Routes that decide no admission (logic, stats, fact, image, RAG, process, consensus), and records from before the server stored one, show it as not recorded, unless the stored result holds one itself: a Verification Context document keeps its admission, and the dashboard shows that.
- When the server's attestation check, not the verifier, made a result BLOCKED ([qwed-verification #320](https://github.com/QWED-AI/qwed-verification/issues/320)), the record says so and shows, where the server kept them, the verdict the verifier reached and its proof_ref, as not admitted. It recognises these by the `trust_gate.` and `api.attestation.` prefixes of the stored `constraint_id`.
- **Check attestation.** The server stores the attestation it signed with a VERIFIED result, and the record page can check it. The check runs in your browser with the server's public keys (`GET /.well-known/jwks.json`), and it reports:
  - whether the ES256 signature matches the server's key, and whether the issuer is the key's owner;
  - whether the claims match what the record stored: the request (its SHA-256), the verdict, the proof_ref and the admission;
  - whether the attestation has expired (24 hours by default).

  It says so when the key is no longer among the server's keys: the key was rotated, or the server makes a key per process and has restarted. Web Crypto, which the check needs, works only on HTTPS and on localhost.
- It does not run or replay the actions that were verified.

## Run it

You need Node.js 22.12 or later and a running QWED server (`qwed-verification`).

```bash
npm ci
cp .env.example .env
npm run dev
```

Then open <http://localhost:5173>. During development, requests to `/api` go to the server in `QWED_API_URL` (default `http://localhost:8000`). If that server is not running, the dev proxy answers 502, and the dashboard says the QWED server could not be reached. It says the same when the network fails, or when another proxy answers 502, 503 or 504 without the server's JSON body.

To look around without a server, choose **Explore with sample data** on the sign-in page. Sample data stays in your browser.

### First sign-in on a new server

A new QWED server has no user, and the dashboard can only sign in. Create the first owner with the server's sign-up route (`POST /auth/signup`). The example is for Bash; set `QWED_URL` to the server `QWED_API_URL` points at:

```bash
QWED_URL=http://localhost:8000   # the server QWED_API_URL points at
python3 -c '
import getpass, json, sys
ask = lambda prompt: (sys.stderr.write(prompt), input())[1]
email = ask("Owner email: ")
org = ask("Organisation name: ")
print(json.dumps({"email": email, "password": getpass.getpass("Owner password: "), "organization_name": org}))
' | curl -sS -X POST "$QWED_URL/auth/signup" -H "Content-Type: application/json" --data-binary @-
```

It asks for the owner's email, the organisation's name and a password. The password is not echoed. The request body goes to `curl` on standard input, so the password stays out of your shell history and the process list. On Windows, run it in Git Bash or WSL, not in PowerShell or Command Prompt; in Git Bash, use `python` in place of `python3`.

- Each sign-up creates a new organisation, with you as its owner. The email and the organisation name must not be taken already.
- Sign in to the dashboard with that email and password, then create an API key on the **API keys** screen.
- Send your verify requests with that key. The dashboard shows your organisation's records only, so records made with another organisation's key do not appear.

`qwed init` creates an organisation of its own, with an email and password it does not show you, and hands you only an API key. Records made with that key belong to that organisation, and you cannot sign in to it here. Use a key created in the dashboard instead.

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
| 90-day activity summary (Overview, on request) | `GET /admin/compliance/report/soc2/{org_id}` | session token of an owner or admin |
| Security events (also the Overview card) | `GET /admin/security/events` | session token of an owner or admin |
| Attestation check (Record) | `GET /.well-known/jwks.json` | none |

The API keys screen shows when each key was last used. qwed-verification records it from [#486](https://github.com/QWED-AI/qwed-verification/issues/486), at most once a minute per key; on an older server every key reads "No use recorded". The security events screen needs #486 too.

The Overview counts the newest 200 records the server returns, over the 24 hours or 7 days up to the newest record. When older records in that range are not loaded, it says how far back the counts reach. It groups the stored verdicts and admissions; it never works either out.

A VERIFIED verdict means the check ran to a proof, not that the claim holds, so the stored admission is counted beside it:
- **Not admitted (DENY):** counts the records the server stored DENY for, a stored BLOCKED included, whatever their verdict.
- **Needs attention:** lists the VERIFIED records the server did not admit. BLOCKED and UNVERIFIABLE records are listed by their verdict, so a denied one is not counted twice. It counts the chosen 24 hours or 7 days, as the tiles do, and opens the ledger on that range.
- **Decision ledger:** filters by admission: ADMIT, DENY, or not recorded. Opened from Needs attention, it shows the records received in that range only; **Show all dates** shows every loaded record again.

**Export CSV** on the decision ledger, for owners and admins, saves the records it shows, with the filters applied, as a CSV file built in the browser: record id, time received (UTC, marked with `Z`), verifier, request, the stored verdict and admission as the ledger shows them (and the stored admission word where it differs), the verifier's message, proof_ref, API key, and the attestation refusal where there is one, with the verdict and proof_ref the verifier reached in their own columns. It covers the loaded records only; load older ones first to include them. It does not use the server's CSV routes, which carry no stored verdict or admission yet ([qwed-verification #508](https://github.com/QWED-AI/qwed-verification/issues/508)). A cell a spreadsheet may read as a formula gets a leading apostrophe: one that starts with a tab, carriage return, line feed or NUL, or with `=`, `+`, `-` or `@` (or their full-width forms) after any leading white space. Members and viewers do not get the button. The file is built from rows the ledger already shows them, so this limits the export, not what they can read.

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
