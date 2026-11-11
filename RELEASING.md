# Releasing QWED Dashboard

A release is a version tag on main. The [release workflow](.github/workflows/release.yml) builds and publishes it; nothing is uploaded by hand.

## What a release contains

| File | What it is |
| ---- | ---------- |
| `qwed-dashboard-vX.Y.Z.zip` | The built site, in one folder |
| `qwed-dashboard-vX.Y.Z.cdx.json` | The SBOM: every package in the build, in CycloneDX. What ships in the zip has scope `required`; build and test tools are `optional` |
| `SHA256SUMS` | The SHA-256 checksums of the zip and the SBOM |

The zip also has two attestations on this repository, signed through Sigstore by the release workflow: its build provenance (this repository, this tag, this workflow, a GitHub-hosted runner) and the SBOM. The notes come from the version's section in `CHANGELOG.md`.

## Before the first release with these steps

Two repository settings, set once by an admin:

1. **Immutable releases** (Settings › General › Releases): once a release is published, its files and its tag cannot be changed.
2. **A tag ruleset** (Settings › Rules › Rulesets › New tag ruleset), targeting `v*`: restrict creations to admins, and block updates and deletions.

## Steps

1. **Prepare the version in a pull request.**
   - Set the version: `npm version X.Y.Z --no-git-tag-version` (it changes `package.json` and `package-lock.json`).
   - Add a `## [X.Y.Z]` section to `CHANGELOG.md` with every change since the last release.
   - If the dashboard needs a QWED server feature, name the qwed-verification release that has it. Do not release against a feature that is only on qwed-verification's main branch.
2. **Merge it** once CI passes.
3. **Dry run.** Actions › Release › Run workflow, on main. It runs everything a release does, attestations and their checks included, but does not publish. Fix anything it finds before you tag.
4. **Tag the merge commit and push the tag:**

   ```bash
   git switch main && git pull --ff-only
   git tag -a vX.Y.Z -m "qwed-dashboard vX.Y.Z"
   git push origin vX.Y.Z
   ```

   The workflow checks that the tag matches `package.json` and that the commit is on main, runs the tests, the build and `npm audit`, writes the SBOM and the checksums, signs the attestations, verifies them, and publishes the release.
5. **Check the published release** as a user would, with the commands in the README's [Releases](README.md#releases) section.

## If something goes wrong

- **The workflow fails before publishing:** nothing is released. Fix the cause on main and release the next patch version. Do not move or reuse a tag.
- **A published release is wrong:** releases cannot be changed. Publish a fixed patch version, and say in its notes what was wrong with the earlier one.
