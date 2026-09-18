# Platform completion and engineering audit

> **Review scope correction:** This was a representative first pass, not comprehensive platform acceptance. Joel has requested systematic coverage with short-lived, one-question Luna Max agents. The [systematic review register](systematic-review/README.md) now governs coverage; the findings and execution order below are provisional inputs pending that review.

**Assessment:** the core architecture is worth keeping, but the repository does **not** yet support final source acceptance or full-platform completion sign-off. Close a small set of concrete defects and finish the supported commercial acceptance contracts. A general rewrite is not justified by this evidence.

**Scope:** current working tree rooted at `06a89ebe3cf4747589a7d98c869cad35e1fa3fe6`, 12 September 2026. Three Luna Max workstreams assessed product completeness, architecture, and engineering correctness. We used the new skills alongside existing Convex/project guidance, followed by bounded critic passes. No application source was edited or reverted; no browser/E2E, hosted service, deployment or paid activity was run.

## The decision

- **Source acceptance:** blocked at the last check. Lint failed; TypeScript reported 57 diagnostics across 15 files. The dependency ratchet passed. The tree was changing during the check.
- **Begin writing/diagnosing E2E:** reasonable once the active changes settle. Existing commercial roadmap gaps do not prohibit testing implemented behavior.
- **Baseline the paid end-to-end journey:** first correct the funds-recovery scheduling gap, add the missing HTTP rate admission, and correct Tool freshness/pagination provenance. Otherwise tests risk validating incomplete or misleading behavior.
- **Paid alpha/full-platform completion:** not established. Quote commercial disclosure, canonical purchase-resolution acceptance, owner visibility, remedy handling and hosted/client proof remain material work or explicit scope decisions.

## What to keep

The independent workstreams agreed on the value of the short **Tool → Quote → Call → recovery** path, common action contracts across HTTP/MCP/CLI, and the separation of authority, funding, delivery, settlement and commercial responsibility. Keep those distinctions.

Keep caller-bound Quote validation, exact money operations, reservation/idempotency controls, stable Call references and explicit uncertainty. Preserve Provider freeze/revoke/offboarding protections, source-write fences, evidence digests, managed workpool infrastructure and testable source/application seams. These controls have concrete jobs; removing them to make the source look smaller would weaken the product.

## Highest-value corrections

### 1. Ambiguous money reservations can miss automatic recovery — E-4

`markReservationUnknown` records a reconciliation-required Call without initializing the scheduling envelope. Its attach-conflict/outcome-unknown callers return a replay that bypasses the usual initialization path. The automatic sweep selects only rows with `reconciliation.nextAttemptAt`. A manual reconcile call can repair that omission, but automatic recovery should not depend on it.

**Smallest correction:** initialize reconciliation atomically in the uncertainty transition, preserving its reason and evidence. Add an observable regression test: an ambiguous reservation becomes a due candidate and enters the bounded recovery path without manual intervention. This does not justify a new queue service or a new purchase identity.

Evidence: [convex/moneyManagedCall.ts:263](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/convex/moneyManagedCall.ts:263>); [independent recovery cross-check](platform-audit/recovery-crosscheck.md). Supported by two auditors examining this specific path; no live funds incident was reproduced.

### 2. Paid Tool/Quote/Call HTTP routes bypass existing rate admission — E-1

The existing HTTP wrapper, policy and Convex bucket implementation are available, but six relevant routes call their handlers directly. The final bounded recheck found no global middleware or lower request-rate admission covering them. Spending ceilings control economic authority; they do not cap request volume or recovery churn.

**Smallest correction:** apply the existing wrapper and an appropriate read/mutation policy, with route-level 429 and header tests. Preserve the existing authentication and spending controls. Do not build a second limiter.

Evidence: [src/routes/api.v1.tools.call.ts:12](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/routes/api.v1.tools.call.ts:12>); [late-drift revalidation](platform-audit/late-drift-e1.log).

### 3. Tool freshness and pagination follow an unrelated projection — A-4

Tool search reads current publications, while freshness and cursor scope use completion of the business-search projection. That projection reads publications but writes `registrySearchDocuments`; it is not the generation being paged. A live Tool result can therefore be reported stale/absent, and an unrelated rebuild can invalidate its next-page cursor.

**Smallest correction:** bind freshness and pagination to the actual catalog source/generation. Preserve existing public contracts where possible. Prove that an unrelated business projection refresh does not invalidate Tool pagination and that genuine catalog changes get the intended freshness treatment.

Evidence: [src/modules/registry/tools.actions.ts:26](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/modules/registry/tools.actions.ts:26>); [full architecture report](platform-audit/architecture.md).

## Product coherence before paid alpha

These are acceptance gaps, not proof the platform needs a new architecture:

- **Quote commercial packet (P-1):** the compact current DTO is explicitly accepted source scope; the complete seller/provider/terms/effects/data-use/retry decision remains unfinished. Define the required facts or immutable references without duplicating manifest-owned material into every response. Test the same semantics across software-agent surfaces before claiming paid-alpha completion.
- **Receipt meaning (P-2):** output can be complete while payment/purchase is unresolved. Clarify that mixed state and the safe recovery action. The explicit “Run again” action is a new purchase, not an automatic retry; a blanket ban was rejected by the critic pass. Evidence: [src/modules/capability-execution/call-receipt-view.ts:121](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/modules/capability-execution/call-receipt-view.ts:121>).
- **Purchase resolution (P-3):** define one canonical derivation and shared acceptance cases. A new table, identity or independent state machine is not inherently required; keep the current Call/economic facts authoritative.
- **Owner understanding (P-4):** make Agent used/reserved/remaining capacity understandable alongside Account credit. Missing or uncertain values must remain explicit.
- **Remedy (P-5):** close the Call-linked customer remedy path. A narrow, documented manual support process may be an explicit alpha choice; email alone must not imply an implemented case/status lifecycle. Avoid introducing a general dispute platform.
- **Team scope (P-7):** recommend keeping the accepted single-owner start line unless team use is expressly part of alpha. Generic membership storage does not establish a usable team-management journey.

[full product report](platform-audit/product.md) contains evidence, consequences and acceptance proofs for every surface.

## Platform coverage

“Implemented” below means inspected source capability, not hosted or production proof. “Partial” includes implemented controls with incomplete user journeys, accepted commercial scope or validation still outstanding.

| Capability | Source assessment | Next acceptance proof |
| --- | --- | --- |
| Account, Agent authority and credential lifecycle | Partial | Complete one owner approval, rotation/revoke and least-privilege Agent journey on the target origin; decide and document whether alpha remains single-owner or exposes membership administration. |
| AUD funding, account credit and spend visibility | Partial | Verify one funded Account and one Call with exact fee/principal/total, no browser-side credit, durable reconciliation and a clear per-Agent used/remaining view. |
| Directory, service comparison and admitted Tool detail | Implemented | On a hosted origin, show upstream discovery as catalogue information, then reach an admitted Tool and obtain a fresh Quote before any paid action. |
| Caller-bound Quote | Partial | A committed Quote must expose or otherwise prove Provider, Seller, terms, data use, effects, unknowns, retry rule and challenge binding for the exact Tool/input. |
| Paid Call, delivery and uncertainty recovery | Implemented | Hosted Call can complete, refuse, release or enter reconciliation once, and status/cancel/reconcile remain tied to that Call reference. |
| Purchase resolution, remedy and commercial records | Partial | Persist one Call-linked purchase-resolution record that keeps delivery, payment, Seller, Provider obligation, remedy/refund and tax/document evidence distinct; prove an owner remedy request path. |
| Usage, billing documents and reconciliation | Partial | One Call appears consistently in activity, usage, spend, reconciliation and an invoice-ready period projection without duplicated adjustments. |
| Provider publication, connections, earnings, payout and offboarding | Partial | Hosted Provider connects and publishes one Tool, sees a Call/obligation/earning, completes payout readback and finishes the freeze-settle-revoke offboarding journey. |
| Support, notifications/events and operator workflow | Partial | For the chosen alpha scope, either verify explicit polling/email support only or add the owned event/inbox and joined stuck-case surfaces before promising them. |
| Agent HTTP, MCP and CLI surfaces | Partial | Run the same source contract through hosted HTTP, an authenticated MCP client and the installed CLI/package; capture parity for Quote, Call and recovery. |

## Work packages, in execution order

| Package | Boundary and output | Acceptance | Dependency |
| --- | --- | --- | --- |
| 0. Stabilize the active tree | Finish or isolate concurrent work; identify one exact revision/content snapshot | Lint, types and dependency checks green against unchanged source; rerun affected tests | First |
| 1. Schedule reservation recovery | Managed-money uncertainty transition and existing reconciliation initializer | Due-candidate regression plus existing reservation/recovery tests | Stable source |
| 2. Enforce HTTP request admission | Existing paid Tool/Quote/Call routes and shared limiter | Auth/spending behavior preserved; rate-limit/429/header tests pass | Stable source |
| 3. Correct discovery provenance | Tool catalog freshness and opaque cursor scope | Real catalog freshness; unrelated rebuild does not break paging | Stable source |
| 4. Set the commercial acceptance contract | Quote facts/references, derived purchase status, mixed-state receipt and Agent spend visibility | Shared source-level examples and cross-surface contract tests; no speculative new storage | Agreed paid-alpha scope |
| 5. Set alpha operating scope | Single-owner/team boundary and Call-linked remedy/support promise | Named owner and explicit supported/unsupported journeys | Commercial acceptance |
| 6. Execute runtime proof | E2E/Playwright, hosted HTTPS paid canary, installed CLI and authenticated MCP | Evidence tied to origin, source/package revision, Call IDs and recovery outcomes | Relevant source corrections; permissions for live activity |

Packages 1–3 can be separately bounded changes; avoid combining them with broad structural cleanup. This audit recommends work and does not execute it.

## What should not block the next milestone

The critic passes downgraded supply-barrel cycles and Convex worker coupling to related-work cleanup (A-1/A-2). Their existence alone did not establish a runtime defect or justify replacing the backend. Narrow the money query interfaces (A-5) when a real caller needs that change.

Provider-obligation projection writes are transactional and rebuilds re-read the obligation (A-3). No current stale-write sequence was established. The rollup therefore treats ownership clarification as later design debt, overriding the specialist report's more conservative before-alpha classification. The possible unbounded canary-history read (E-2) also remains later scaling debt because growth beyond existing caps was not demonstrated.

Notifications, a hosted support inbox and a joined operator queue (P-8/P-9) are known later scope. Do not pull them into the narrow managed purchase milestone solely to make the platform checklist look complete. Hosted/package proof (P-6) belongs to subsequent validation; requiring completed E2E before starting E2E would be circular.

## Verification and snapshot limits

| Check | Earlier audited snapshot | Final check window |
| --- | --- | --- |
| `npm run lint` | Pass | Fail: unused `query` import in `convex/capabilitySupplyOwnerCanary.ts:4` |
| `npm run typecheck` | Pass | Exit 2: 57 diagnostics across 15 files |
| `npm run deps:check` | Pass | Pass; accepted cycle ceilings remain 34 and 258 |
| Targeted Vitest | 247 + 130 passing test executions across two runs; 27 distinct files, one file repeated | Not rerun after broad concurrent drift |
| Full gate/build/codegen/E2E/live calls | Deliberately excluded | Deliberately excluded |

[Final check results](platform-audit/final-checks.json), [lint output](platform-audit/final-lint.log), [type errors](platform-audit/final-typecheck-summary.json), [full typecheck output](platform-audit/final-typecheck.log), [dependency output](platform-audit/final-deps-check.log), and [full engineering report](platform-audit/engineering.md) preserve commands and outcomes. Node was v22.22.0; npm was 11.5.1.

The starting checkout already had 359 dirty entries. By the final fingerprint, **139 baseline paths changed or disappeared and 14 new paths appeared** outside this report. Three paths changed during the final checks: `convex/qualifiedUse.ts`, `tests/unit/convex/provider-connection-changed-coverage-check.mjs`, `tsconfig.json`. These counts describe content drift, not necessarily behavioral changes. The audit cannot attribute other tasks' changes or assert a single immutable tested revision. Do not repeatedly chase that moving target; close a stable checkpoint first.

The auditors reported no source/config edits. The report and check artifacts are the only intended audit writes. Coverage is representative across the platform's major boundaries and journeys, not a line-by-line review of every source file, exhaustive security assurance or legal/commercial compliance assessment. Source references were checked for existence and starting-line validity; the critical recovery path received an independent cross-check and request admission received late-drift revalidation.

## Complete finding index

There are 17 observations spanning defects, accepted missing capabilities, design debt, decisions and next validation. This is not a count of 17 release-blocking bugs. Same-agent use of several skill lenses is not counted as independent corroboration.

| ID | Severity | Classification | Rollup timing | Observation |
| --- | --- | --- | --- | --- |
| E-4 | high | defect | before-alpha | Formance reservation uncertainty bypasses the automatic reconciliation queue |
| E-1 | high | defect | before-e2e | Paid Call and recovery HTTP surface has no rate-limit admission |
| A-4 | med | defect | before-e2e | Tool discovery freshness is sourced from the wrong projection |
| P-2 | med | design-debt | before-alpha | Receipt Complete label is ambiguous when payment is unresolved |
| P-1 | high | missing-capability | before-alpha | Committed Quote commercial scope is a known paid-alpha gap |
| P-3 | med | verification-gap | before-alpha | Derived Purchase resolution needs a stable cross-surface acceptance contract |
| P-4 | med | missing-capability | before-alpha | Owner cannot see per-Agent remaining spend with Account spend |
| P-5 | med | missing-capability | before-alpha | Customer remedy request stops at email support |
| P-7 | med | decision | decision-needed | Team authority scope is a product decision, not a completed journey |
| P-6 | med | verification-gap | before-alpha | Hosted and installed agent proof is a next alpha validation |
| A-3 | med | design-debt | later | Provider-obligation projection has competing writers |
| A-5 | med | design-debt | later | MoneyQueryPort couples unrelated read roles and advertises unsupported methods |
| A-1 | low | design-debt | later | Capability-supply public barrel is an internal dependency hub |
| A-2 | low | design-debt | later | Call worker crosses the stated thin Convex host boundary |
| E-2 | low | design-debt | later | Safe seller-canary proof has a potential unbounded-history scaling path |
| P-8 | low | missing-capability | later | Notification and hosted support inbox surfaces are known later scope |
| P-9 | low | missing-capability | later | Operator has no joined queue for stuck commercial work |

[Structured findings and drift inventory](platform-audit/audit.json) · [scope and methodology](platform-audit/scope.md) · [full product report](platform-audit/product.md) · [full architecture report](platform-audit/architecture.md) · [full engineering report](platform-audit/engineering.md)
