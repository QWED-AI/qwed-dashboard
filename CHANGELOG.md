# Changelog

All notable changes to this project are listed here. Versions follow [Semantic Versioning](https://semver.org/). While the version is 0.x, a minor version can change what the dashboard shows or needs from the server.

## [0.2.0]

New screens for members, agents, batch jobs and the server; a Verification Context signature check; the qwed-verification 9.0.0 server features; the qwedai.tech look; and signed releases. The dashboard still only shows what the server stored. It never works out a verdict or an admission itself.

### Works with

**qwed-verification 9.0.0 or later.** Every server feature the screens use is in 9.0.0, so this release needs no change on qwed-verification's main branch.
- **Settings › Server** lists each feature with the release that brought it, and marks it from the server's version.
- On an older server, the header asks for 9.0.0 and points there.
- Each screen that needs a newer server says which release (#55).

### Overview

- The chart counts by admission as well as by verdict, and two cards show where the denials come from, by verifier and by API key (#53).
- **Time to answer, by verifier:** the median and the 95th percentile of how long the server took, slowest first, from qwed-verification #528 (#53).
- Every count opens the decision ledger on the records behind it, with the range the Overview counted (#90).
- **Fixed:**
  - the Time to answer table stays inside its card (#88);
  - the server cards sit in the grid (#92);
  - the sample whole-chain check says it covers every audit entry, not a period (#79).

### Header, footer and the Server screen

- The header shows the server's version and whether it is current, and opens **Settings › Server**. The footer names the server and the address the dashboard calls (#50, #52).
- Search for a record id or proof_ref from the header (#51).
- **Settings › Server** has:
  - the connection;
  - this dashboard's version;
  - the server's signing keys, with a note when a key this browser saw before is gone;
  - what the server supports (#55).

### Records

- A message a caller supplied is shown apart from what the verifier said (#49).
- **Batch job** screen: the records of one `POST /verify/batch` job together, opened from the ledger and the record (#57).
- **Check signature** on a Verification Context record checks the document's ES256 signature in the browser, as the SDK does (#54).
  - A copy that servers before qwed-verification #532 redacted is named as the likely reason it does not match (#77).
- The attestation of a natural-language result is checked against the translated expression the server signed (#85).
- **Fixed:** the record page drew the Attestation card twice (#98).

### API keys, members, agents and security events

- **API keys:**
  - **Rotate** a key with your session (#56);
  - each key's owner, its expiry and the server's rotation flag;
  - the organisation's name in the side menu (#64).
- **Members:** the organisation's users, their roles and whether they are active (#66).
- **Agents:** the organisation's agents, and each agent's activity and spend against its daily limit (#72).
- **Security events:**
  - opens with the server's threat summary (#68);
  - each event names its user (#70).
- Sign-in says why a password over 72 bytes cannot sign in, and the README shows `qwed init --owner-email` (#75).

### Look

- The dashboard matches qwedai.tech: its colours, Geist type, logo and layout (#94, #95, #97).
- Sign-in and Not found sit on the site's lake scene.
- Each page's heading has its own mist.
- A Light / Dark / System switch.
- Whole ledger rows open their record.
- Relative times on keys.
- Tables of many columns stack below 1100 px wide, not only on phones.

### Hosted preview

- https://demo.qwedai.tech runs the dashboard from main, so the sample data can be explored without installing anything.
- On Netlify, a link straight to a page such as `/ledger` opens it (#99).
- **Explore with sample data** returns to the page that was asked for (#99).

### Releases

- Each release carries an SBOM (CycloneDX) next to the zip, with both in `SHA256SUMS`.
- The zip has two attestations, signed through Sigstore by the release workflow: its build provenance and the SBOM. The workflow checks them with `gh attestation verify` before it publishes.
- Releases are cut only from main, and the workflow can be run by hand on main as a dry run (#100).
- New `SECURITY.md` and `RELEASING.md`. The README shows how to check a download (#100).

### Dependencies

- vite 8.3.4, and minor and patch updates to the npm packages and GitHub Actions (#82, #84, #87).

## [0.1.0]

The first release. The dashboard shows what a QWED server verified, as the server stored it. It never works out a verdict or an admission itself.

### Sign-in and API keys

- Sign in with an email and password (`POST /auth/signin`). The session stays in `sessionStorage`, so closing the tab signs you out.
- Explore with sample data, which stays in the browser, without a server.
- API keys screen: list, create and revoke keys, with when each key was last used (#15, #25).
- A clear message when the QWED server cannot be reached, in place of "502: Bad Gateway" (#40).
- The README explains how to create the first owner on a new server (#41).

### Overview

- Counts by stored verdict and admission over the 24 hours or 7 days up to the newest record, with a verdict chart and breakdowns by verifier and API key (#28).
- "Not admitted (DENY)" counts the records the server stored DENY for, a stored BLOCKED included (#38).
- Needs attention lists BLOCKED and UNVERIFIABLE records, records with no readable verdict, and VERIFIED records the server did not admit. It counts the chosen range, and opens the ledger on it (#20, #38, #46).
- A whole-chain audit check, a 90-day activity summary loaded on request, and the latest security events (#24, #33, #25).

### Decision ledger

- Every record, newest first, with the stored verdict, the admission and what the verifier said, and older records loaded page by page (#19, #21, #30).
- Filters by verdict, verifier, admission and text, and by the range the Overview counted (#38, #46).
- Export CSV of the records shown, for owners and admins, with formula-looking cells made safe (#32).

### Record

- The stored result, the reason, proof_ref and admission, and a note when the server's attestation check, not the verifier, blocked a result (#22, #31).
- Check attestation: checks the ES256 attestation the server stored against its public keys, in the browser (#39).
- Check the record's audit chain entry (#24).

### Layout

- A phone layout, with the menu behind a button and stacked table rows (#26).

### Works with

[qwed-verification](https://github.com/QWED-AI/qwed-verification). Some of what the dashboard shows needs changes on its `main` branch that are not in a release yet (the newest is 7.3.0):
- the stored verdict, the admission and paging in the ledger ([#484](https://github.com/QWED-AI/qwed-verification/issues/484), [#307](https://github.com/QWED-AI/qwed-verification/issues/307));
- the audit checks with a signed-in session, and the whole-chain check ([#485](https://github.com/QWED-AI/qwed-verification/issues/485));
- key last-used times and security events ([#486](https://github.com/QWED-AI/qwed-verification/issues/486)).

The README says what the dashboard shows against a server without them.
