# Changelog

All notable changes to this project are listed here. Versions follow [Semantic Versioning](https://semver.org/). While the version is 0.x, a minor version can change what the dashboard shows or needs from the server.

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
