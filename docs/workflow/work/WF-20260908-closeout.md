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
| Complete research sets, release receipts, screenshots and design outputs | `research-and-output-artifacts.tar.gz`, `historical-qa-artifacts.tar.gz` |

Every archive was extracted into a separate temporary directory and its file
hashes, modes and symlinks checked before source removal. The old checkout was
checked again against its snapshot before retirement. Recovery scratch was removed.
Full raw evidence requires access to this local archive; it is not remotely
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
  metadata as well as the two location fields in the main lockfile.
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
| Protected local state/configuration | 5,928 file metadata records unchanged before/after cleanup |

The source tests cover funding amount exactness, reservation/release/settlement
mapping, replay/uncertainty and official SDK hooks. Live Formance integration and
spike scripts require an explicitly selected running ledger; they were not
activated for dependency relocation. An initial install using npm `--prefix`
through macOS's `/tmp` alias produced a malformed temporary lockfile and failed;
rerunning from the physical clean directory regenerated valid metadata and passed.
No version or integrity drift was accepted.

## Cleanup and retained limits

The detailed local `cleanup-receipt.json` records each removed path and basis.
About **4.56 GB of logical files** were removed from archived copies and idle
caches, excluding the two retired worktrees. Recovery archives plus Git bundle
occupy about **292 MB** before the small final verification-log archive. Logical
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

Retained deliberately:

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
