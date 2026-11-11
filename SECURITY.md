# Security Policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| The latest release | Yes |
| Earlier releases | No |

Security fixes are released for the latest version only. While the version is 0.x, upgrade to the newest release to get a fix.

## What this policy covers

QWED Dashboard is a web app that runs in your browser and talks only to the QWED server you point it at. This repository covers the dashboard itself, for example:

- script injection (XSS) through anything the server returns, such as a request, a verifier message or a name;
- the session or an API key leaving the browser for anywhere but your server, or being kept longer than the dashboard says;
- a CSV export that a spreadsheet can run as a formula;
- the dashboard showing a verdict, an admission or a signature check as other than what the server stored;
- a problem in a release: its zip, its SBOM, its checksums or its attestations.

A problem in the QWED server, its API or its verification engines belongs to [qwed-verification](https://github.com/QWED-AI/qwed-verification/security/policy). If you are not sure which repository it belongs to, report it here and we will move it.

The hosted preview at https://demo.qwedai.tech runs the dashboard from main, with no QWED server behind it. Its sample data stays in your browser. It is covered by this policy too.

## Reporting a vulnerability

Please do **not** report a vulnerability in a public issue, pull request or discussion.

Report it privately through [GitHub Security Advisories](https://github.com/QWED-AI/qwed-dashboard/security/advisories/new), or by email to **rahul@qwedai.tech**.

Please include:

- the dashboard version (shown on the sign-in page) and the QWED server version;
- the steps to reproduce it, and the browser you used;
- what an attacker could do with it.

### What happens next

- We aim to acknowledge a report within **3 business days**. QWED has a single maintainer, so a reply may sometimes take longer.
- We confirm the issue, fix it in a new release and publish an advisory with the affected and fixed versions.
- We agree the timing of disclosure with you. Please give us reasonable time to release a fix first, and do not access or change data beyond what you need to show the issue.

We credit reporters by name in the advisory and the release notes, unless you ask us not to.

## Checking a release

Each release from 0.2.0 on carries a SHA-256 checksum file, an SBOM, and two signed attestations for the zip: where and how it was built, and the SBOM. The README's [Releases](README.md#releases) section shows how to check them before you deploy the dashboard.
