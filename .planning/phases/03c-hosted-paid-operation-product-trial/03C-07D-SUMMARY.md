# Phase 3C Plan 07D — hourly proof false-negative correction

## Decision supported

The hosted packet verifier may accept an otherwise exact three-operation proof
when the journey crosses a UTC-hour boundary. The lifetime total remains
exactly three, while the current hourly window is interpreted as a positive
safe integer bounded by the configured policy rate.

This cut changes proof interpretation only. It does not change admission,
gateway, journey timing, persistence, schema, lifecycle, collector authority,
or the evidence class.

## Custody and scope

The child started detached and clean at revision
`0aa37cd998da45b42161229342eed730f5409a87`, tree
`44e27bd6709e49d6b0bc82eb30efa46176630a7d`. The branch-owning parent
worktree remained `codex/phase3c-execution` at the same revision.

The official custody verifier accepted
`/tmp/ae-phase3c-parent-custody-0aa37cd9.json` with canonical SHA-256
`6cce54e9636cbe17ed0091f5435705ce2c5ee2c64c72c58f3c22c1bd6bf805d4`.
The raw JSON SHA-256 is
`320a01fa6181b6cf22ea3247bffc3223d88aa269e7abe60143c134c42f1776b9`.
It contains exactly 66 inherited entries. Their intersection with the final
five-path allowlist is zero.

Owned paths are:

- `tools/release/paid-operation-hosted-proof-contract.ts`
- `tests/unit/release/paid-operation-hosted-release.test.ts`
- `.planning/phases/03c-hosted-paid-operation-product-trial/03C-07D-SUMMARY.md`
- `.planning/phases/03c-hosted-paid-operation-product-trial/03C-CLOSURE-CLASSIFICATION.md`
- `tests/imports/paid-operation-trial-residue.test.ts`

No Convex, gateway, journey, workflow, package, route, UI, product, design,
generated, or inherited custody path changed.

## RED and source correction

An otherwise-valid packet set `admittedTotal` to 3, `activeReservations` to 0,
policy rate to 3, and `admittedInWindow` to 2. The fixture recomputed the raw
source-observation digest and packet checksum. Before the source correction,
the focused release suite reported exactly one failure, with 25 controls
passing; the verifier returned `internal_observation_mismatch` instead of
`packet_integrity_verified`.

The verifier still requires the exact policy bounds `{ total: 3,
concurrency: 1, rate: 3 }` and exact lifetime total 3. It now requires the
current-window count to be a safe integer greater than or equal to 1 and less
than or equal to `policy.bounds.rate`. The separate zero-active-reservation,
released-reservation, cohort, command, effect, invocation, deployment,
credential, and live-authority checks are unchanged.

The final boundary fixture proves current-window counts 1, 2, and 3 verify,
while 0 and `policy.bounds.rate + 1` refuse as
`internal_observation_mismatch`.

## Mechanical closure reconciliation

The source-local residue gate exposed an inherited closure snapshot drift at
the supplied base: Git derived 91 Phase 3C paths while the test and
classification still described the earlier 89-path Plan 07B set. The missing
paths were the Plan 07C summary and the Plan 07C delta in the paid-operation
application service. Adding this summary makes the exact current inventory 92.

The closure update adds only the missing rows: Plan 07C and Plan 07D summaries
as `trial-only`, and the pre-existing application-service Phase 3C delta as
`paid-operation-owned`. No existing classification changes. The residue test
keeps exact missing/extra equality and explicit synthetic omission/extra
falsifiers.

## Verification record

| Command | Result |
| --- | --- |
| `npm run test -- tests/unit/release/paid-operation-hosted-release.test.ts` | PASS after correction — 1 file, 27 tests. |
| `npm run test -- tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts` | PASS — 1 file, 14 tests. |
| `npm run test -- tests/imports/paid-operation-trial-residue.test.ts` | PASS after mechanical reconciliation — 1 file, 4 tests. |
| `npm run verify:paid-operation:hosted-source-local` | PASS after preserving the initial closure failure — 4 files, 71 tests. |
| changed-path `oxlint --deny-warnings` | PASS — zero diagnostics. |
| `tsc --noEmit --pretty false` | Inherited broad baseline remains exit 2 with 108 diagnostics/331 lines; zero diagnostics name an owned TypeScript path. First inherited diagnostic is `convex/capabilitySupply.ts(583,3)`. |
| `git diff --check` | PASS before staging; staged form is rechecked in the Git handoff. |

Dependencies were not installed or fetched. The clean child used an ignored,
temporary `node_modules` symlink to the existing local AE dependency tree; the
link is moved to Trash before handoff.

## Evidence and claim ceiling

Evidence is limited to source inspection and local packet/persistence/import
fixtures. It proves the bounded verifier interpretation under those fixtures.

It does not prove hosted reachability, credentials, deployment, provider
fulfilment, payment, settlement, production safety, accessibility or
comprehension in use, customer value, or demand.

## Remaining authority and next safe action

This child is a source candidate only. The parent remains the sole integration,
release, deployment, Convex, external-effect, and completion-claim authority.
After auditing the exact commit and diff, the parent may integrate it and rerun
the source-local gates at the integrated revision. No hosted or control-plane
step is authorized by this record.
