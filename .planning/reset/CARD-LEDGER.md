# Atomic Operation Market Reset — Card Ledger

Every unit of reset work is a card. The orchestrator owns this file; workers read their own row
and write a receipt. Status values: `pending`, `dispatched`, `validated`, `reviewed`, `committed`, `blocked`.

Receipts live in [`RECEIPTS.md`](RECEIPTS.md). Operating contract in [`OPERATING-MODEL.md`](OPERATING-MODEL.md).

## Phase 0 — Preserve the current baseline

| Card | Role | Concern | Status |
| --- | --- | --- | --- |
| P0-a | committer | Triage 13 stashes: archive refs, adopt/abandon note, no silent drop | committed |
| P0-b | committer | Slice-commit 308 dirty paths by concern; no single mega-commit | committed |
| P0-c | committer | Push branch and tag pre-reset baseline; verify remote SHA | committed |
| P0-d | validator | Full source gate on the tagged revision; measured pass/fail receipt | validated |
| P0-e | scribe | Rebase STATE / PROJECT / CAPABILITY-MAP to the tag | committed |

Exit gate: porcelain empty, stash list resolved, baseline tag on remote, gate receipt filed.

## Phase 1 — Close the category additively

Nothing deleted. Live money stays fail-closed. Each card runs executor → validator → reviewer → committer.

| Card | Concern | Depends on | Status |
| --- | --- | --- | --- |
| P1-b | Immutable Delivery / Qualified Use receipts after contract-valid delivery + replay/conflict tests | P0 | committed |
| HK-ts-standards | Close the three `test:ts-standards` violations the settlement slice left behind | P1-b | committed |
| P1-e-1 | Refuse the provider-direct x402 lane in production; keep it open below production for conformance proof | P0 | committed |
| HK-faux-runtime | Move local-E2E bypass authority out of `capability-execution` deployable graph | P1-b | committed |
| P1-a-core | Pool buyer money on the Clerk owner (`owner:{ownerId}:{currency}`); keep per-key attribution on transactions, usage, budgets | P0 | committed |
| P1-e-2 | Canonical `/api/v1/operations/call`; dual-serve `/execute` identically; no new action registered | P0 | committed |
| HK-lockfile-drift | `npm ci` fails `EUSAGE` on `main`: `package.json` and `package-lock.json` are out of sync, so no clean install succeeds | — | pending |
| HK-topup-derivation | `beginCreditTopupThroughSource` prefix-checks a caller-supplied `accountRef` and digests that value; derive it server-side from the principal's owner instead. Convex `reserveCreditTopup` still re-derives and refuses mismatches, so this is defence in depth, not a hole | P1-a-core | committed |
| P1-a-sweep | Decide and implement what happens to any legacy `clerk_api_key:*` buyer balance. P1-a-core only refuses when one is found; moving money needs its own card and evidence | P1-a-core | committed |
| P1-a-proj | `callVia` + `paymentLane` on operation detail projections | P1-a-core, P1-e-2 | committed |
| P1-c | Disputes, exact reversals, supplier `recoveryDue` | P1-b | committed |
| P1-d1 | Immutable Qualified-Use UTC-daily payout allocation plus automatic/read-only owner transfer status surface | P1-c | committed |
| P1-d2 | Reserve provider earnings before provider transfer I/O; exact success/failure/unknown/reversal handling | P1-d1 | committed |
| P1-d3 | Idempotent daily settlement cron | P1-d2 | recon |
| P1-f | Standard-artifact `supply.publish` / `withdraw` / `earnings` over existing importers; agent keys publish under a narrow owner-bound scope; withdraw drains rather than cancels | P1-e-2 | committed |
| P1-g | Persist dynamic operation tool calls in Answer evidence; instrument legacy business/services traffic | P0 | committed |

P1-b ran ahead of P1-a: the receipt keys on `businessId` and `invocationRef`, neither of which the
account re-key touches, so the dependency the plan assumed does not exist in the code.

P1-a and P1-e each split once reconnaissance measured them. The brokered-only refusal (P1-e-1) was
independent of the route rename and shipped first; the route work (P1-e-2) turned out not to depend
on the account re-key, since `/execute` was already the paid invoke path.

## Phase 2 — Decouple without changing behavior

| Card | Concern | Depends on | Status |
| --- | --- | --- | --- |
| P2-a | Move generic strict action-to-tool projection from `harness` into `actions`; keep replay-safe journal; remove custom run loop only after parity validator passes | P1 | committed |
| P2-b | Move development/curated fixtures out of `capability-supply` into test/seed ownership | P1 | committed |
| P2-c | Remove Layer-0 imports from Answer and Customer Request; split oversized invoke/projection modules | P2-a | committed |
| P2-d | Keep public five-state invocation vocabulary; keep lease/attempt states internal | P2-c | committed |

## Phase 3 — Port proof before quarantine

Hard gate: no quarantine card runs until every P3 validator is green and each port is committed.

| Card | Concern | Depends on | Status |
| --- | --- | --- | --- |
| P3-transport-proof | Port only the market-owned claim, release, registered-transport, output, and redaction invariants from `transport-canonical.test.ts` to atomic worker/transport proof | P2 | pending |
| P3-cancel-proof | Map only the atomic status, cancel, and reconcile invariants from `cancellation-canonical.test.ts`; explicitly exclude Customer Request provider-cancellation orchestration | P2 | pending |
| P3-invoke-proof | Map only the single-operation identity, authority, replay, settlement, and recovery invariants from `customer-request-v2-multi-capability-route.test.ts`; exclude planning/DAG/confirmation/repeat/problem/support/progress semantics | P2 | pending |
| P3-cutover | After all three proof cards, replace the three Customer Request entries in `npm run test:conformance` and the product-frontier `requiredConformancePaths` (24→26 paths) with these five atomic successors: `tests/unit/convex/capability-operation-worker.test.ts`, `tests/integration/capability-operation-workpool.test.ts`, `tests/unit/capability-execution/operation-recovery-actions.test.ts`, `tests/unit/capability-execution/operation-invoke.test.ts`, `tests/unit/server/operation-invoke-api.test.ts` | P3-transport-proof, P3-cancel-proof, P3-invoke-proof | pending |
| P3-val | Re-run full conformance floor (≥10); assert no path lost without equivalent | P3-cutover | pending |
| P3-rev | Ports do not weaken assertions or substitute fixtures for live kernel proof | P3-val | pending |

## Phase 4 — Replace chat orchestration

| Card | Concern | Depends on |
| --- | --- | --- |
| P4-a | Rewrite `eval/answer/lib/cases.ts` first as the specification for model-chosen market tool use | P3-rev |
| P4-b | Eval suite runs and documents expected tool-use behavior (no router tags) | P4-a |
| P4-c | Drain in-flight router-named checkpoints; migrate thread tool IDs / optional intent; retain thread storage | P4-b |
| P4-d | Replace named router files with one bounded AI SDK tool loop | P4-c |
| P4-e | MCP/CLI/chat parity + "chat has no tool MCP lacks" structural assertion | P4-d |
| P4-f | Review: no chat-only market capability; no quarantined surface reintroduced | P4-e |

## Phase 5 — Quarantine and deprecate

| Card | Concern | Depends on |
| --- | --- | --- |
| P5-a | Three-artifact frontier v2 receipt: manifest, `verify-product-frontier.mjs`, `product-frontier-manifest.test.ts` | P3-rev, P4 |
| P5-b | Freeze writes for Customer Request / WorkTree / Study / inquiries; deregister actions only after notice | P5-a |
| P5-c | Advertise `Deprecation`/`Sunset` + successors in HTTP, MCP, UCP, `SKILL.md`, `llms.txt`, for-agents | P5-b |
| P5-d | Later release card: RFC 9457 HTTP 410 tombstones | P5-c |
| P5-e | Freeze business/services expansion; keep measured public URLs pending founder decision | P5-a |

## Phase 6 — Retire data separately

One table-family card at a time, separate deployments only.

| Card | Concern | Depends on |
| --- | --- | --- |
| P6-* | Per family: freeze writes → drain → export with per-table SHA-256 manifest → retention approval → schema narrow | P5 |

Never dropped: money, invocation, Delivery, dispute, privacy-erasure, governed-send lineage.
Routing-kernel HTTP tombstones are permanent; historical tables drop only after approved checksummed export.
