# QWED Dashboard

An open-source web dashboard for [QWED verification](https://github.com/QWED-AI/qwed-verification). It shows what your QWED server verified, as the server stored it: the decision ledger, each record, and whether its audit chain entry is intact.

**Status: early, version 0.x.** It covers sign-in, API keys, members, an overview, the decision ledger, a record view with its attestation and audit chain checks, and security events. [CHANGELOG.md](CHANGELOG.md) lists what each version has.

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
- **Check signature** on a Verification Context record. qwed-verification 8.0.0 signs each document it issues (spec 1.1): its `attestation` is an ES256 token, of type `qwed-context+jwt`, over the hash of every other field of the document, with its verdict, admission and proof_ref. The record page checks it as the SDK's `verify_document_attestation` does, in your browser, with the same keys. It reports:
  - whether the signature matches the server's key, and whether the issuer is the key's owner;
  - whether it covers this document: the SHA-256 of the document's canonical JSON, without the `attestation`, matches the hash the token signs. The browser encodes it as qwed-verification does, and the tests check that against documents and hashes a server produced;
  - whether it states the document's verdict, admission and proof_ref;
  - whether it has expired.

  The signature shows the server issued the document as stored. It adds nothing to the verdict or the admission. A spec 1.0 document carries no signature, and the card says so. The server replaces personal data, such as an email address, with a marker like `[EMAIL_REDACTED]` in the copy it stores, after it signed the document. Such a copy is not the document the server signed, so its hash cannot match ([qwed-verification #532](https://github.com/QWED-AI/qwed-verification/issues/532)). When a copy that does not match holds such markers, the card names redaction as the likely reason. A document with a signature is checked whatever spec version it names, so a signed 1.1 document relabelled 1.0 fails the check rather than reading as unsigned.
- It shows a message a caller supplied apart from what the verifier said, and labels it as the caller's. A Verification Context record is built from a diagnostic its caller sent (`POST /verification-context/from-diagnostic`). A server with [qwed-verification #321](https://github.com/QWED-AI/qwed-verification/issues/321) stores its own notice as the message and keeps the caller's apart; an older one, 7.3.0 included, stores the caller's message as the record's. So the dashboard counts only that notice as the server's words, and shows any other message in such a record as the caller's.
- Requests are the caller's text too. Wherever one is shown next to what the verifier said, each is under its own label.
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

Have the web server or proxy that serves it send these headers with every page, so no other site can show the dashboard in a frame. In a frame, a page could lead a signed-in owner into clicks they did not mean, such as revoking an API key.

```
Content-Security-Policy: frame-ancestors 'none'
X-Frame-Options: DENY
```

They must come from the server: a `<meta>` tag in the page cannot set `frame-ancestors`. `X-Frame-Options` covers browsers that do not read `frame-ancestors`. In nginx, for example:

```nginx
add_header Content-Security-Policy "frame-ancestors 'none'" always;
add_header X-Frame-Options "DENY" always;
```

Check a deployment with `curl -sI https://<dashboard-host>/keys`: both headers should be in the response.

### Releases

Each [release](https://github.com/QWED-AI/qwed-dashboard/releases) has the built site as `qwed-dashboard-vX.Y.Z.zip` and its SHA-256 checksum in `SHA256SUMS`. Check the download, then unpack it:

```bash
sha256sum -c SHA256SUMS
unzip qwed-dashboard-vX.Y.Z.zip
```

The zip holds one folder with the built site. It was built without `VITE_QWED_API_BASE`, so it calls `/api` on its own origin: serve it with `/api` routed to your QWED server, as above. To call the server directly instead, build from source with `VITE_QWED_API_BASE` set.

To make a release, a maintainer:
1. sets the new version in `package.json` and `package-lock.json` (`npm version X.Y.Z --no-git-tag-version`), and adds a `## [X.Y.Z]` section to `CHANGELOG.md`;
2. merges that change;
3. tags the merge commit `vX.Y.Z` and pushes the tag.

The release workflow then checks that the tag matches `package.json`, runs the tests, the build and `npm audit`, and publishes the release with the zip, the checksum and the version's notes from the changelog.

## How it talks to the server

| Screen | Server route | Credential |
|---|---|---|
| Sign in | `POST /auth/signin` | email and password |
| Overview, Decision ledger, Batch job | `GET /audit/logs` | session token |
| Record | `GET /audit/logs/{id}` | session token |
| API keys | `GET`, `POST /auth/api-keys`, `DELETE /auth/api-keys/{id}` | session token |
| Rotate a key (API keys) | `POST /admin/keys/rotate?key_id={id}` | session token, on a server with [#505](https://github.com/QWED-AI/qwed-verification/issues/505) |
| Audit chain entry check | `GET /admin/compliance/verify/{id}` | session token of an owner or admin |
| Whole-chain check (Overview) | `GET /admin/compliance/verify-trail` | session token of an owner or admin |
| 90-day activity summary (Overview, on request) | `GET /admin/compliance/report/soc2/{org_id}` | session token of an owner or admin |
| Members | `GET /auth/users` | session token of an owner or admin, on a server with [#507](https://github.com/QWED-AI/qwed-verification/issues/507) |
| Security events (also the Overview card) | `GET /admin/security/events` | session token of an owner or admin |
| Threat summary (Security events) | `GET /admin/security/threats/{org_id}` | session token of an owner or admin, on a server with [#506](https://github.com/QWED-AI/qwed-verification/issues/506) |
| Attestation check, document signature check (Record) | `GET /.well-known/jwks.json` | none |
| Server status (header) and version (footer) | `GET /health` | none |
| Server screen (Settings) | `GET /health`, `GET /.well-known/jwks.json` | none |

**Settings › Server**, which the header's server pill also opens, has four parts:
- **Connection:** the server's version, the address the dashboard calls and when the server last answered.
- **This dashboard:** its version.
- **Signing keys:** the server's public keys, with when this browser first saw each. When a key this browser saw before is no longer published, it says so until you dismiss it: the key was rotated, or the server was given neither `QWED_SIGNING_KEY` nor `QWED_SIGNING_KEY_FILE`, so it made a new one when it restarted. When the keys cannot be refreshed, it says so and that the list is from the last check that worked. What it has seen is kept in this browser's `localStorage` only, and sample data never reads or changes it.
- **What this server supports:** the features that need qwed-verification 8.0.0, read from the server's version.

The header names the server and its version, from `GET /health`, asked again every minute and when the tab regains focus. A server older than qwed-verification 8.0.0 gets a note saying which views need 8.0.0. When the server cannot be reached, the header says so; each screen already says what it could not load. When something else answers, such as a page that is not JSON because `/api` is not routed to QWED, or an error status, the header says the check failed, and the footer gives the reason. The version only picks this wording; it never changes a verdict or an admission the dashboard shows. The footer gives the dashboard's version, the server's version and address, and the project's links.

The API keys screen shows when each key was last used. qwed-verification records it from [#486](https://github.com/QWED-AI/qwed-verification/issues/486), at most once a minute per key; on an older server every key reads "No use recorded". The security events screen needs #486 too.

From [qwed-verification #504](https://github.com/QWED-AI/qwed-verification/issues/504), the API keys screen also shows:
- **Owner:** whose key each one is, by email, with your own marked "(you)". Owners and admins see every key in their organisation, members and viewers only their own. A key the server names no user for reads "No user".
- **Expires:** when the key stops working, or "Never". A key past its expiry is marked Expired; the server refuses it.
- **Rotation required:** a tag on a key the server flags for rotation, which it does in the 7 days before the key expires.

The side menu names the organisation by its display name, from [#518](https://github.com/QWED-AI/qwed-verification/issues/518). Both are on qwed-verification's main branch and in no release yet. A server before them sends none of these fields, so the screen leaves out the Owner and Expires columns and the menu gives the organisation's id. A session signed in before the upgrade keeps the id until you sign in again.

**Settings › Security events** opens with the server's **threat summary** for the last 24 hours ([qwed-verification #506](https://github.com/QWED-AI/qwed-verification/issues/506), on its main branch and in no release yet). It shows the server's threat level (LOW, MEDIUM, HIGH or CRITICAL), which the server rates from its own thresholds on high-severity events and blocked attempts; the dashboard shows the rating and works none out. It also shows the number of security events, blocked attempts and high-severity events, the failures in the last 10 minutes, the events per security layer, and when the server made the summary. The server counts those recent failures in its own memory, so that count starts again when it restarts. Only owners and admins may see it. A server before #506 takes only an API key there and answers the session with 401 "Missing x-api-key header"; the card says so, and the session stays signed in.

Each event's **User** is named by email from the members list (`GET /auth/users`, [#507](https://github.com/QWED-AI/qwed-verification/issues/507)), with your own marked "(you)". When the list does not name the user, because the server has no such route (8.0.0) or the user is not on it, the column gives the id ("User 4"). An event with no user reads "not recorded". Only owners and admins see either list.

**Settings › Members** lists the users of your organisation, oldest first, as `GET /auth/users` returns them ([qwed-verification #507](https://github.com/QWED-AI/qwed-verification/issues/507), on its main branch and in no release yet). Each row shows the user's email, with your own marked "(you)", their role, whether they are active, and when they joined. Deactivated users stay listed. The tiles count the active users by role and the deactivated ones apart. The screen only reads, as the route does: inviting users and changing roles are not part of it. Only owners and admins may list members; a member or viewer is told so. A server before #507 answers 404, and the screen says it needs a release with #507.

**Rotate**, next to Revoke on each key, asks the server to revoke the key and make a new one in its place, named after it ("<name> (Rotated)"). Callers still sending the old key are refused until they have the new one, and the confirmation says so. The new key is shown once, with Copy, as a created key is. Only one full key can be shown, so while one is shown and not yet saved, Create and Rotate of another key wait, and so do they while a key is being made. The server's rules apply: anyone but a viewer can rotate their own key, and an owner or admin can rotate another user's key, but not one whose owner ranks higher. The key list names a key's owner from qwed-verification #504, but not the owner's role (and a server before #504 names no owner), so the dashboard cannot tell which keys rank higher. It offers Rotate on every key to anyone but a viewer, and shows the server's reason when it refuses. The route takes the signed-in session from [qwed-verification #505](https://github.com/QWED-AI/qwed-verification/issues/505), which is on its main branch and in no release yet. An older server, 8.0.0 included, takes only an API key there; the dashboard says so, and the session stays signed in.

The Overview counts the newest 200 records the server returns, over the 24 hours or 7 days up to the newest record. When older records in that range are not loaded, it says how far back the counts reach. It groups the stored verdicts and admissions; it never works either out.

A VERIFIED verdict means the check ran to a proof, not that the claim holds, so the stored admission is counted beside it:
- **Not admitted (DENY):** counts the records the server stored DENY for, a stored BLOCKED included, whatever their verdict.
- **Needs attention:** lists the VERIFIED records the server did not admit. BLOCKED and UNVERIFIABLE records are listed by their verdict, so a denied one is not counted twice. It counts the chosen 24 hours or 7 days, as the tiles do, and opens the ledger on that range.
- **Records by verdict or by admission:** the chart stacks each hour or day by stored verdict, or, switched to Admission, by ADMIT, DENY and admission not recorded.
- **Not admitted, by verifier** and **by API key:** the records stored with DENY in the range, with the share of that verifier's or key's records; each opens the ledger on them.
- **Decision ledger:** filters by admission (ADMIT, DENY, or not recorded) and by API key (each key, named from the key list where it is there, or not recorded). Opened from the Overview, it shows the records received in that range only; **Show all dates** shows every loaded record again.

**Export CSV** on the decision ledger, for owners and admins, saves the records it shows, with the filters applied, as a CSV file built in the browser: record id, time received (UTC, marked with `Z`), verifier, request, the stored verdict and admission as the ledger shows them (and the stored admission word where it differs), the verifier's message, proof_ref, API key, and the attestation refusal where there is one, with the verdict and proof_ref the verifier reached in their own columns. A message a caller supplied is in the last column, `caller_message`, apart from the verifier's. For a Verification Context record, `verifier_message` holds the server's notice, as the ledger labels it, and not the verifier's words. It covers the loaded records only; load older ones first to include them. It does not use the server's CSV routes, which carry no stored verdict or admission yet ([qwed-verification #508](https://github.com/QWED-AI/qwed-verification/issues/508)). A cell a spreadsheet may read as a formula gets a leading apostrophe: one that starts with a tab, carriage return, line feed or NUL, or with `=`, `+`, `-` or `@` (or their full-width forms) after any leading white space. Members and viewers do not get the button. The file is built from rows the ledger already shows them, so this limits the export, not what they can read.

**Batch job** (`/batches/{job id}`) lists the records of one `POST /verify/batch` job together. The server writes one record per item, with the job's id beside the item's result, and the ledger row and record view of an item link its job. It shows how many items the loaded records hold, how many were stored with ADMIT or DENY or with no admission, and when they were received; **Show only the items not admitted** keeps the DENY ones. Each item keeps its own verdict and admission: the job has none of its own, and the dashboard works none out. An item that failed shows the error the server stored for it, here and on the ledger. It covers the loaded records only, so an older job's items may need **Load 200 older records**. It names the API key that sent the job, from the key each item's record stores, and opens the ledger on that key's records. Owners and admins can export the items shown as CSV, as on the ledger.

**Find a record** in the header, on every screen (`/` moves the focus to it): a record id opens that record; anything else, such as a proof_ref, opens the decision ledger with it as the search. The server has no route that finds a record by proof_ref, so that search covers the loaded records.

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
