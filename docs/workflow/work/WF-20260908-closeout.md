# WF-20260908 — Vocabulary sprint and repository closeout

**Status:** implemented locally; verification and retained limits below.
**Authority:** Joel approved the full closeout program on 2026-09-08, including
separate commits for the 11 pending source edits, archival retirement of legacy
drafts, exact SDK relocation and retirement of the two redundant checkouts.
The original checkout on `codex/vocabulary-rationalisation` is authoritative.
No deployment, public API, schema or commercial behavior change is included.

## Recovery and evidence

Archive directory:
`/Users/joelchan/Documents/Coding/Backups/Agentic-Economy/closeout-2026-09-08`
(mode `0700`). The committed [integrity inventory](WF-20260908-closeout-archives.json)
contains archive hashes, counts and availability limits. Each local archive has
an accompanying file manifest with original paths, sizes, SHA-256 hashes,
permissions and symlink targets. `RECOVERY.md` explains reconstruction.

| Preserved set | Recovery artifact |
| --- | --- |
| Current checkout at pre-closeout `d5fb0a220`; 2,181 existing tracked/nonignored files and all 47 pending statuses | `current-worktree.tar.gz`, manifest and binary patches |
| Detached old vocabulary checkout at `fe09a6463`; 2,165 files including all 368 versions not found in the checked commits | `old-vocabulary-worktree.tar.gz`, manifest and binary patches |
| Complete Git history and refs, including both retired checkout bases | `repository.bundle`; `git bundle verify` passed |
| The 24 already-deleted legacy files, recovered from pre-closeout HEAD | `retired-legacy-originals.tar.gz` |
| Three superseded designs and complete vocabulary chronology before compaction | `superseded-document-originals.tar.gz` |
| Referenced temporary evidence and recursively referenced supporting logs/snapshots | `vocabulary-temporary-evidence.tar.gz` |
| Local-only papercut ledger and dated audit, retained without new triage | `historical-papercut-references.tar.gz` |
| Complete research sets, release receipts, screenshots and design outputs | `research-and-output-artifacts.tar.gz`, `historical-qa-artifacts.tar.gz` |

Every archive was extracted into a separate temporary directory and its file
hashes, modes and symlinks checked before source removal. The old checkout was
checked again against its snapshot before retirement. Recovery scratch was removed.
`closeout-verification.tar.gz` preserves the focused check outputs, corrected
install failures and first five commit logs. Full raw evidence requires access to this local archive; it is not remotely
hosted. This committed record and the vocabulary acceptance receipt remain
reviewable from a clean checkout without private transcripts or runtime state.

`/tmp/ae-vocabulary-source-extract.aEzWXp` was already missing. It is recorded
as missing, not reconstructed. Private operational transcripts, credentials and
database state were excluded and retained in place. Historical manifests can
retain original path names, including deleted gates; those are provenance,
not maintained links or current execution instructions.

## Changes and ownership

- Source cleanup: shared object guards and no-store responses; unused internal
  exports, date formatters, home loader and release path helper removed.
  Commit `59d64218d`; focused checks below preserve observable behavior.
- Governance: six pending vocabulary/workflow edits reconciled in `524e4b1d1`.
- Operations: four pending records committed in `a00bded94`; the AWS pause and
  native Convex export remain dated, synthetic-environment evidence. Capture
  integrity does not establish restoration, resumed availability or production.
- Legacy retirement: 24 superseded gates, diagram variants, design drafts and
  Superdesign session files archived; maintained structure references repaired.
  Resuming that retired design session requires restoring its archived state.
- Documentation: three superseded designs retain concise authority/recovery
  pointers; Package 4's current action contract and Package 5's source links
  corrected; vocabulary chronology compacted while retaining results, decisions,
  repair matrix and open proof limits. The cold-review register and all 36
  original audit files remain unchanged. Package 4/5 evidence and Package 7's
  implementation hold are retained.
- SDK: exact Formance 7.0.0 tarball moved to root `vendor/`; both consumers,
  generated lockfiles and provenance references updated. All package versions
  and integrity values are unchanged. npm 11 regenerated development/optional
  metadata as well as the two location fields in the main lockfile. Commit
  `22eb64033`; legacy retirement and recovery inventory are in `f93181b46`.
- Queue: existing workflow-01, workflow-02 and workflow-06 closed for this adopted
  scope in [TODOS.md](../../../TODOS.md); other findings retain their own scope.

## Verification

All project checks used Node `22.22.0` and npm `11.5.1`.

| Check | Result |
| --- | --- |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| Focused Vitest source/route/Clerk/deployment/transport/release/Formance set | 13 files, 191 tests pass; one live Formance file/four tests skipped |
| Discovery route parity and Clerk/module import boundaries | 3 files, 16 tests pass |
| Clean root and isolated-spike `npm ci --ignore-scripts --offline` | Both pass; both installed SDK versions equal `7.0.0` |
| Clean-install Formance unit boundary and release integrity tests | 2 files, 33 tests pass; four live integration tests skipped |
| Removed-symbol search across `src`, `tests`, `tools` | No remaining callers |
| Operations registry | YAML parses without duplicate keys; schema identifier and explicit synthetic/non-restoration boundaries pass |
| Archive recovery | All extracted files match manifests; Git bundle verified |
| `git diff --check` and changed-document links | Pass in a fresh committed-tree extraction; four pre-existing local-only papercut links labelled with archive recovery |
| Protected review evidence and marketing file hashes | 89 files unchanged |
| Protected local state/configuration | 5,928 file metadata records unchanged before/after cleanup |

The source tests cover funding amount exactness, reservation/release/settlement
mapping, replay/uncertainty and official SDK hooks. Live Formance integration and
spike scripts require an explicitly selected running ledger; they were not
activated for dependency relocation. An initial install using npm `--prefix`
through macOS's `/tmp` alias produced a malformed temporary lockfile and failed;
rerunning from the physical clean directory regenerated valid metadata and passed.
No version or integrity drift was accepted.

## First-pass cleanup and retained limits

The detailed local `cleanup-receipt.json` records each removed path and basis.
About **4.56 GB of logical files** were removed from archived copies and idle
caches, excluding the two retired worktrees. Recovery archives plus Git bundle
occupy about **292 MB**, including final verification logs. Logical
sizes are not a measurement of physical APFS free-space change.

Removed: verified research/output copies, referenced temporary evidence copies,
archived historical QA, idle Terraform provider downloads, Vercel build output,
local Vite/test/Doctor caches, generated TanStack scratch and workflow `.DS_Store`.
Excluded private files within temporary review folders remain; cleanup did not
apply a generic `ae-*` deletion rule or terminate browser processes.

The tasks **Complete the mature vocabulary refactor** and **Roast Package 6 against
the maturity…** were archived through Codex. Their `a19f` and `44f9` checkouts were
idle, contained no ignored state, and were removed after recovery verification.
Task history is retained. The former was compared against its complete manifest;
the latter was clean and its base is retained in the Git bundle.

Retained at the first checkpoint (later archival is recorded below):

- Dirty Package 4 release checkout and Convex restore checkout, including export.
- All Convex databases/exports, Terraform state/configuration/locks, Vercel
  environment/configuration files and private operational logs.
- Active marketing workflow record, byte-identical to the pre-closeout snapshot;
  the active website project and unrelated temporary files.
- Tracked research, `.scratch`, `.impeccable`, `.aislop`, `.superstack`, the
  React Doctor false-positive rationale and active planning/package evidence.
- Empty app worktree placeholders whose ownership could not be established;
  they contain no recoverable payload and were not force-pruned.

This does not clear the vocabulary receipt's 26-finding standards baseline,
G02 operational policy, installed commercial execution, hosted release,
production money, restore proof or Package 6/7 holds. No aggregate-green or
production acceptance is claimed. The AWS pause's existing 13 September revisit
requirement remains in the operations records; no resume or automation was added.

## Remaining housekeeping — 2026-09-08

Joel requested the remaining document, scratch and admin cleanup after the first
six closeout commits. Base revision: `eac5a95f4`. This pass reduces active-file
sprawl without changing application behavior, data, deployment or package scope.

The supplemental recovery directory is `remaining-housekeeping/` under the archive
location above. Its `files.tar.gz` and `manifest.json` preserve **558 original
files**, exact hashes/modes and symlinks; extraction and mode restoration were
verified before removal. `closeout-commits.bundle` preserves the six first-pass
commits incrementally after `d5fb0a220`; restore the parent Git bundle first.
Original source and private runtime state remain in their existing homes.

| Disposition | Result / authority retained |
| --- | --- |
| Completed vocabulary and earlier connection scratch queues | Archived `.scratch/` in full. Current vocabulary acceptance stays in its work record; operational issues stay in the maintained cutover preflight. The earlier installer-based connection queue is historical; the later native-client map and its remaining real-client proof are preserved in the same archive. |
| Earlier candidate roadmap / phase files | Archived `.planning/PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, configuration and phase queues. A single `.planning/README.md` points to the active root delivery roadmap. Phase 01.1's approved planning context is parked for re-prioritization, not completed or cancelled. |
| Raw reference and visual-review clutter | Archived sparse reference clones, obsolete design reviews/rebrand snapshots, paused gauntlet registers, `.impeccable/` and temporary PDF renders. Source-pinned spike qualification, active benchmark research/design foundations and the Twenty quality record remain. Sparse clones retain captured objects; uncached upstream blobs can still require the original remote. |
| Root research sprawl | Six dated papers moved into existing `research/`, including the vocabulary proposal. Relative links were repaired; 18 former source links now target verified historical commit `66b7deb122743d6b56658eaa8677f04fe9d2f4c4` (two end-line anchors corrected to the actual file length). Two existing local incentive-research notes are tracked so the moved paper remains self-contained. Arguments and historical vocabulary were not rewritten. Root Markdown count falls from **28 to 21**. |
| Superseded design pointers | Removed the three now-redundant stub files; originals and their earlier pointers remain recoverable. `docs/designs` falls from seven Markdown files to four active/supporting designs. |
| Papercut administration | Retired the append-only root ledger. `TODOS.md` routes all **44** September IDs exactly once to existing owners, preserves the six explicit source-resolved dispositions and states what still needs revalidation. It does not claim old findings are current bugs or automatically fixed. |
| Package 7 dependency correction | Replaced the obsolete tentative-glossary hold with accepted vocabulary/source status. Proposed-contract re-review, retained-data/release boundaries and Package 7 implementation approval remain. No feature, schema or vendor activation occurred. |
| Local advisory hook | Corrected workflow-07. No relevant files, missing installed tool, success, reported diagnostics and unavailable/incomplete scans are distinguishable; tool unavailability is not called a regression. The hook uses the installed version, sends no score/telemetry request, downloads no fallback and preserves advisory commit behavior. Original hook is `files/local-hooks/pre-commit` in the archive. |

**539 files** were removed after archival or as documentation-area OS metadata,
including ignored reference-clone files; the six relocated studies are counted
separately. Removed logical bytes: **29,591,765** (this is not physical free-space
measurement). The supplemental compressed file archive is approximately **21 MB**.
Tracked content remains recoverable through Git as well as the local archive.
The active marketing workflow file and all 36 original cold-review audit files
remain unchanged. Operational state, credentials, financial evidence and
Package 4/5 release holds remain preserved.

Validation: shell syntax and eight isolated hook boundary scenarios pass, all
advisory exits remain zero, the papercut routing covers IDs 001–044 without gaps
or duplicates, maintained links are checked in a fresh committed-tree extraction,
and operations-registry changes are limited to evidence pointers/comments.
Existing large benchmark records remain explicitly local references rather than
broken clean-checkout links. One older Phase 2 assessment was already unavailable;
its historical citation is labelled unavailable rather than reconstructed.
Application tests are not rerun for documentation moves and a local advisory-hook
configuration change. The earlier source verification and its limitations stand.

Remaining non-housekeeping work is explicit in `TODOS.md`: fresh desktop skill
exposure observation, source-grounded architecture review, paused design/hardening
work and existing package/runtime/commercial proof. This pass does not alter global
skill configuration or call a paused or unimplemented feature complete.

## External-share layout cleanup — 2026-09-08

The read-only housekeeping challenge against `f61cb58e9` found current tooling
mixed with orphan scaffolds and historical material. Joel approved the cleanup.

- Filed the two maintained specialist Playwright profiles under `tests/config/`;
  preserved test discovery, authenticated server working directory, inherited
  environment, and CI's staging report path. The default config remains at root.
- Retired the unwired Phase 1 deployment profile and its obsolete smoke test.
  Current source checks cover headers, public metadata/discovery and admin
  boundaries. **Hosted middleware, deployed HTML metadata and real owner/admin
  browser-session isolation still require release proof.** Retirement is not
  a claim that source tests replace that hosted qualification.
- Removed the three orphan root Claude/Cursor metadata files. Native MCP
  connection commands and the maintained `plugins/agentic-economy/` bundle remain.
- Filed strategy papers under `docs/strategy/`, earlier learning history under
  `docs/workflow/history/`, and the obsolete analytics inventory/application
  diagram under `research/architecture/`. The JSON inventory is preserved verbatim.
- Replaced non-portable active-reference links with maintained summaries where
  appropriate. Local corpora, installed-dependency citations and unavailable
  historical source are labelled explicitly rather than presented as clone-local
  links. Raw cold-review evidence remains unchanged.

The tracked root falls from 51 entries to 41, including 12 to 10 Markdown files.
Five obsolete files were retired and seven files relocated; originals remain in
Git history at the base revision. No dependencies, application contracts, data,
credentials or deployment settings changed. The active marketing record remains
outside this commit. Source-sharing cleanup does not establish public release,
installed-client compatibility or production acceptance.

Validation: `npm run typecheck`, targeted Oxlint and 11 focused test files
(70 tests) passed. Playwright `--list` preserved all discovered specs and resolved
project settings: authenticated 4, staging 2, default 52. The same comparison
passed against an extracted candidate Git tree using the existing pinned local
dependencies. A configured, synthetic environment check also preserved the
authenticated server command/cwd/environment and staging report destination.
No authenticated or hosted browser session was run. The extracted tree contains
no missing relative Markdown targets or absolute machine-file links; strategy
paper content, the raw analytics inventory, cold-review corpus and active marketing
record were checked for preservation. Raw historical/local evidence stays explicitly
local; a fresh dependency installation was not repeated for script-path changes.
