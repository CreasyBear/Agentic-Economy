---
phase: 01-ten-star-spine-foundation
source_plan: 01-15
status: blocked
created: 2026-06-28
updated: 2026-06-28
evidence_timestamp_utc: 2026-06-28T10:38:00Z
requirements: [R10]
owner_rows_recorded: 0
owner_rows_required: 5
---

# Phase 01 Alpha Evidence

R10 internal-alpha readiness is blocked. No real friendly-owner activation rows
were available during Plan 01-15, so this artifact records the missing evidence
instead of converting local Sam rehearsal or instrumentation tests into owner
proof.

## Gate Decision

| Gate | Status | Evidence |
|---|---|---|
| Five real owner activation rows | BLOCKED | 0 of 5 rows recorded. |
| Durable activation readback fields | BLOCKED | Query/readback model exists, but no real owner rows were supplied. |
| Share or interest evidence | BLOCKED | No real `share_url_copied` or consented `owner_interest_submitted` evidence was supplied. |
| Attribution | BLOCKED | No real source/channel attribution rows were supplied. |
| Friction/failure notes | BLOCKED | No observed owner friction or failure notes were supplied. |
| No unresolved P0 evidence | BLOCKED | Non-browser local suite passed, but full local Playwright failed on `/registry`, Convex codegen is auth-gated, and deploy smoke inputs are missing. |
| Claims-register proof | LOCAL ONLY | Copy/SEO/API/discovery claim scans passed locally; no live owner evidence exists. |

## Required Row Shape

Each real owner row must include:

| Field | Required proof |
|---|---|
| Pseudonymous owner label | Non-identifying owner label and support owner. |
| Source/channel attribution | Where the owner came from and when the attempt happened. |
| Activation readback | `businessId`, `stage`, `publishSeen`, `statusSeen`, `capabilityHealthSeen`, `sharedOrInterestSubmitted`, `attributionRecorded`, and `lastEventAt`. |
| Share or interest | `share_url_copied` or consented `owner_interest_submitted`. |
| Friction/failure | Observed `frictionCode`, `failureCode`, or explicit `none_observed`. |
| No-P0 evidence | Local/deploy/codegen status at the time of the owner attempt. |
| Claims-register link | Route/API/discovery/SEO/GTM claim evidence for the owner-visible copy. |

## Current Row Inventory

| Slot | Evidence status | Activation readback | Share/interest | Attribution | Friction/failure | Decision |
|---:|---|---|---|---|---|---|
| 1 | Missing real owner attempt. | Missing. | Missing. | Missing. | Missing. | Blocked. |
| 2 | Missing real owner attempt. | Missing. | Missing. | Missing. | Missing. | Blocked. |
| 3 | Missing real owner attempt. | Missing. | Missing. | Missing. | Missing. | Blocked. |
| 4 | Missing real owner attempt. | Missing. | Missing. | Missing. | Missing. | Blocked. |
| 5 | Missing real owner attempt. | Missing. | Missing. | Missing. | Missing. | Blocked. |

## Existing Instrumentation

The activation readback model exists and is locally tested:

- `src/modules/observability/public.ts` exports `OwnerActivationState`, `OwnerActivationReadback`, `initialOwnerActivationState`, `applyFunnelEvent`, and `buildOwnerActivationReadback`.
- `src/modules/observability/internal/funnel.ts` maps publish, status, capability-health, share/interest, attribution, friction, and failure events to activation readbacks.
- `tests/unit/observability/funnel.test.ts` covers activated and blocked journeys.

This proves the row shape can be computed locally. It does not prove five real
owner attempts happened.

## No-P0 Evidence Snapshot

| Area | Status | Evidence |
|---|---|---|
| Typecheck | PASS | `npm run typecheck`. |
| Unit/integration/scanner/SEO/UI/build | PASS | `npm run test:unit`, `npm run test:integration`, `npm run test:copy`, `npm run test:imports`, `npm run test:source-mining`, `npm run test:types`, `npm run test:ts-standards`, `npm run test:seo`, `npm run test:ui-contract`, `npm run build`. |
| Local browser | FAIL CLOSED | `npm run test:e2e` failed 2 `/registry` checks because generated Convex public function `registry:listPublicBusinessCatalog` was unavailable to the local server. |
| Local a11y | PASS LOCAL | `npm run test:a11y` passed with command-scoped local Clerk bypass. |
| Convex codegen | AUTH GATE | `npm run check:convex-codegen` returned `401 Unauthorized: MissingAccessToken`. |
| Deploy smoke | BLOCKED | Required deploy URLs, storage states, and business slug were missing, so smoke was not run. |

## Verification

| Command | Result | Evidence |
|---|---:|---|
| `npm run test:unit -- tests/unit/observability/funnel.test.ts` | PASS | Package script ran the unit suite: 31 files, 110 tests passed. |
| `test -f .planning/phases/01-ten-star-spine-foundation/01-ALPHA-EVIDENCE.md` | PASS | Artifact exists. |
| `awk '!/^#/ && /friendly-owner-row/ { count += 1 } END { print count + 0 }' .planning/phases/01-ten-star-spine-foundation/01-ALPHA-EVIDENCE.md` | BLOCKED | Output was `0`; five real rows are missing. |

## Required Next Evidence

1. Authenticate the Convex CLI and rerun `npm run check:convex-codegen`.
2. Provide real deployed Vercel/Convex/Clerk URLs and owner/admin storage states, then run `npm run test:deploy-smoke`.
3. Collect five real owner attempts with durable activation readbacks.
4. For each owner, record attribution, share/interest, friction/failure notes, no-P0 status, and claims-register proof.
5. Only then mark internal-alpha readiness green.
