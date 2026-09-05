# Establish the implementation execution baseline

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee: Joel / vocabulary-rationalisation baseline subagent
Parent: ../map.md
Blocked by:

## Question

What exact branch, commit, index, dirty/untracked source and documentation
state must be preserved as the recoverable boundary for the approved vocabulary
implementation? Establish a private source archive outside the checkout using
native Git/archive operations, excluding dependencies, caches, build dumps and
secrets; retain per-file checksums and prove representative dirty and untracked
bytes can be restored. Record the accepted plan, implementation-carrying map
notes, and this baseline issue without claiming application, schema, database,
deployment or financial-backup completion.

The baseline must preserve concurrent work already present in the shared dirty
checkout. No reset, staging, commit, push, deployment, database mutation or
broad test run is in scope. The issue closes only when the branch/HEAD/index,
owned baseline paths, archive location and read/extraction verification are
recorded, with historical test failures separated from refactor evidence.

## Acceptance

- [x] Starting branch, HEAD, index state, dirty paths and untracked paths are
      captured without exposing secrets.
- [x] `codex/vocabulary-rationalisation` is established without discarding or
      overwriting pre-existing work.
- [x] A task-specific source archive outside the checkout contains tracked
      source plus relevant untracked implementation/documentation, excludes
      `node_modules`, caches, build dumps and secrets, and has a checksum index.
- [x] Archive extraction to a task-temporary directory proves representative
      dirty tracked and untracked bytes match the captured baseline.
- [x] The accepted plan is saved at
      `docs/designs/vocabulary-rationalisation.md`; the map and work record
      link it, record the implementation/repeated issue pickup override, and
      do not claim delivery or backup completion.
- [x] The work record and map retain historical findings and current baseline
      evidence; no unrelated paths are changed.

## Verification commands and expected results

- `git status --short --branch` — expected to show the preserved dirty tree and
  the established branch, with no staged paths created by this task.
- `git diff --check` — expected to pass for the owned text changes.
- Native archive listing/checksum and extraction checks — expected to show no
  excluded dependency/cache/build/secrets paths and matching representative
  bytes.
- No broad application test command is run in this baseline issue. Any existing
  historical failure is recorded as historical evidence only.

## Explicit exclusions

- No application, schema, generated output, database, client, deployment,
  external tracker, payment or retained-financial-record changes.
- No source migration, implementation rename, compatibility layer, custom
  tracking system or migration engine.
- No staging, commit, push, reset, destructive cleanup or secret export.

## Dependencies and closure evidence

- Depends on the current vocabulary work record and map, existing dirty-tree
  evidence, and Joel's accepted implementation plan in the task request.
- Closure requires the archive path and verification receipt, captured branch /
  HEAD / index evidence, changed-path list, plan/map/work-record links, and a
  concise explanation of any historical test failures not rerun here.

## Answer

Resolved on 2026-09-05 as the Phase 0 source baseline and selected-plan
handoff. The shared worktree was preserved; this issue did not perform source
implementation, schema/data work, deployment or financial backup operations.

### Branch and dirty-tree boundary

- After read-only collision checks, the task established
  `codex/vocabulary-rationalisation` at
  `91a4fff6f68fecd63ac39bbbd4509de0bc0d5b0d`, the preserved starting HEAD.
  Branch creation did not reset, clean, overwrite or otherwise discard the
  existing worktree.
- The index was empty and no paths were staged or committed by this task. At
  capture (`2026-09-05T07:39:15Z`) the checkout had 131 modified tracked paths,
  122 untracked files, and 2,130 total tracked/untracked paths. Git porcelain
  represented some untracked directories as one entry; the path inventory is
  retained in
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/`.
- The private metadata files `status.porcelain`, `branch`, `head`,
  `index.name-status`, `unstaged.name-status`, `unstaged.stat` and
  `untracked.paths` capture the branch, HEAD, index, dirty paths and untracked
  paths without copying file contents or secrets into the tracker.

### Source archive and restore proof

- Native Git path enumeration plus `tar` created the task-specific source
  archive at
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/source-baseline.tar`.
  Its SHA-256 is
  `422b7bcfb2a8f694db0ce824bf2ebaadea7d3ff3c150c71ca7b8b367338b7fb2`.
- The archive contains 2,096 tracked/relevant untracked source and
  documentation paths. It excludes 34 temporary or sensitive-environment
  paths: `.impeccable/`, `tmp/`, environment files and sensitive key/state
  patterns. Forbidden dependency/cache/build-dump/secret path scans passed;
  no secret contents are recorded here. The excluded-path list is
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/excluded.paths`.
- The tracked `.env.example` template was preserved separately because it is a
  dirty configuration input used by refactor consumers. The supplemental
  private archive is
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/env-template-baseline.tar`,
  captured at `2026-09-05T07:46:11Z`; its archive SHA-256 is
  `7222500821bcb701a7a5b739d52672db31ddcff49e329abf517b3c52e8bd0c8d`, and
  worktree/extracted SHA-256 is
  `69cddf6e54515cf358740453f9356269140795116bdb9acd2b3aae450d76cb5e` for
  both. No environment value is reproduced in this record.
- Per-file SHA-256 manifests are retained at
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/worktree.sha256`
  (captured source) and
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/archive.sha256`
  (extracted source). `tar -tf` read the archive, native
  extraction completed at `/tmp/ae-vocabulary-source-extract.aEzWXp`, and the
  complete 2,096-line checksum comparison passed.
  The temporary extraction was removed after verification; the persistent
  backup directory is private (`0700`).
- Representative bytes matched between the captured worktree and extraction:
  `PRODUCT.md`
  (`2ecf35a926ad80e334f9d25775e47d69918777fb96dd3c40fdc23c7923028882`),
  `src/modules/actions/index.ts`
  (`43a5c5cce624fe0427a4e6dde96fe732fab71529570966e3042dbe94e3dd7c17`),
  this issue file at its claimed-baseline point
  (`b4e61fb9aa24503b319dc3c7ca549bd545d1b1eecb429a93d79343c69450127a`) and
  `convex/moneyStripeWebhookInbox.ts`
  (`88fae68aed95c4c55f7ef6b14771702dc7924b5c321e463ca5c9732fc44fc479`).

### Plan and test handoff

- The full accepted plan is now the single selected artifact at
  `docs/designs/vocabulary-rationalisation.md`. The map and work record link
  it and record Joel's explicit override carrying implementation and repeated
  issue pickup/closure through the existing Wayfinder issues. The map still
  protects the planning history and does not claim application implementation.
- Coordinator-run baseline evidence is kept separate from this issue's narrow
  archive proof: `npm run typecheck` passed; `npm run test:unit` passed (459
  files / 4,041 tests); `npm run test:ts-standards` failed its one test with 26
  pre-refactor findings (1 unknown-double-cast, 1 convex-any-validator and 24
  non-null assertions); `npm run test:integration` passed (112 files, 1
  skipped; 1,083 tests, 4 skipped). These are baseline findings, not vocabulary
  regressions or waived acceptance. No broad application suite was run by this
  subagent.
- No Convex backup/restore or hosted-test cutover evidence exists here. The
  archive is source rollback evidence only; it is not a database, Convex,
  payment or financial-history backup. The deployment-operations issue remains
  responsible for those targets and proof.

The selected plan, map, work record and this resolution are the only checkout
records changed by this baseline task beyond establishing the working branch.
Other dirty and untracked paths remain concurrent work owned elsewhere.

## Comments

- 2026-09-05 — Claimed before baseline work by the vocabulary-rationalisation
  baseline subagent. The task request explicitly authorises carrying
  implementation and repeated issue pickup/closure into the map; this is an
  execution-scope override to the planning-only default, not an approval to
  alter product direction or start implementation before the plan is recorded.

### Current local checkpoint receipt — 2026-09-05

Joel subsequently authorised a local Git checkpoint of all current, reviewed,
nonignored dirty work. This is a new source checkpoint, not the original
07:39:15 source archive and not evidence that the vocabulary implementation,
database, deployment or financial-history work is complete.

- Pre-checkpoint branch: `codex/vocabulary-rationalisation`.
- Pre-checkpoint `HEAD`:
  `91a4fff6f68fecd63ac39bbbd4509de0bc0d5b0d`.
- Pre-checkpoint index: empty; no staged paths were present. The branch and
  worktree were preserved; no reset, checkout, clean, push or deployment was
  used.
- Candidate capture saw 131 modified tracked paths and 153 nonignored
  untracked files. The reviewed checkpoint candidate set contains 251 files
  (all current modified tracked files plus nonignored untracked files after
  the exclusions below). The complete path list and per-file SHA-256 capture
  are retained privately at
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/local-checkpoint-20260905/candidate.paths`
  and
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/local-checkpoint-20260905/candidate.sha256`.
  The candidate manifest digests are recorded in the same private directory;
  no file contents or credential values are copied into this receipt.
- The checkpoint deliberately excludes, without deleting or altering, the 23
  generated visual critique/review artifacts under
  `.impeccable/` and the 10 generated PDF-render artifacts under
  `tmp/pdfs/agentic-blueprint-review/`. The exact excluded file paths are
  retained at
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/local-checkpoint-20260905/excluded.paths`.
  They remain visible as untracked work for a later explicit decision. The
  tracked `.env.example` template is included in the candidate set; ignored
  environment files, private backups, Terraform state/provider directories,
  dependency caches and other ignored paths are not force-added.
- A read-only high-signal credential screen found no private-key header,
  cloud/API token or bearer-token match. Four source/test locations contained
  secret-shaped names or test fixtures and were retained as reviewed source,
  without printing their values: `infra/package4/modules/release-environment/cloudflare.tf`,
  `tests/unit/capability-supply/provider-connection-handoff.test.ts`,
  `tests/unit/money/stripe-money-provider.test.ts` and
  `tools/release/operation-gateway-production-smoke-hosted-money.ts`. No
  dedicated repository secret scanner is configured. The only executable
  pre-commit hook is the existing staged-file React Doctor advisory scan; it
  will run during commit and its result will be reported separately.
- Existing source rollback evidence at
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/source-baseline.tar`
  and its checksum/extraction proof is unchanged. This local Git checkpoint
  includes the current implementation, current documentation, Phase 0 issue
  queue, operations records, plugin/infrastructure examples and the two newly
  prepared vocabulary issues as ordinary source history; it does not replace
  or modify that private archive.
- The current local checkpoint is authorised to use the commit message
  `chore: checkpoint existing implementation and vocabulary preparation`.
  The resulting commit SHA, cached file count, hook result and any intentionally
  remaining dirty paths are recorded by the coordinator after the non-amend
  commit. No other issue, map, work record or source path is modified by this
  receipt update.
