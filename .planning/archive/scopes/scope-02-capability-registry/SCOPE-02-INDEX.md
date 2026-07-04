# Scope 02 — Capability Registry (agent-native supply remodel)

Executable plan set for the separate implementation session. Plan ONLY what
ADR-002 decided; the seven wayfinder tickets are resolved in wave 1 and their
answers feed later plans. Honesty posture: source/local proof only; no
booking/payment/dispatch/autonomous-fulfillment claim; deployed/public launch
of these surfaces stays gated by Scope 1 + GTM readiness; `verified` never
appears unqualified.

## Validation-first gate

Read `.planning/scopes/PREMORTEM-VALIDATION-GATES.md` and `.planning/scopes/PHASED-EXECUTION-PREP.md` before executing this scope. Scope 2 build work is blocked by non-kill verdicts for **PM-01 owner pull**, **PM-02 assistant distribution**, **PM-03 launch wedge lock**, and **PM-05 trust-language red-team**. Scope-local gates:

- **S2-G1 runtime/start cross-scope lock:** 02-01 may resolve tickets/source model; 02-02+ waits for Scope 1 source substrate; deployed/provider proof waits for Scope 1 deployed env.
- **S2-G2 check-engine threat fixture pack:** required before 02-03 external-fetch/check-engine work.
- **S2-G3 wedge-agnostic contract pack:** required before 02-02/02-04 table/disclosure work.


## ADR

- `.planning/adr/ADR-002-capability-registry-agent-native-supply.md` (Status: Proposed) — Decisions D1..D11 are the authoritative WHAT; these plans are the HOW.
- Direction: `local://five-scopes.md` §Scope 2, §Sequencing (S2 starts after S1; parallelizable with S3; S4/S5 depend on S2 endpoints).

## Decisions digest (D-refs)

| D | Decision | Covered by |
|---|----------|-----------|
| D1 | Capability axis = closed four-kind enum (informational_page \| inquiry_intake \| business_endpoint \| action_card); no generic other | 02-01, 02-02 |
| D2 | New business-grain tables (businessCapabilities + capabilityCheckAttempts), never widened business rows; action_card holds a reference | 02-02 |
| D3 | descriptor = discriminated union by kind, no wide optional columns | 02-01, 02-02 |
| D4 | Per-capability trust state = five PRODUCT.md labels; never verified | 02-01, 02-02 |
| D5 | Business-origin ingestion = checked input, not authority (strict-parse, safePublicText, claims pinned false, host allowlist, read+describe) | 02-03 |
| D6 | Named standard ae-endpoint-check:v1 (reachability/schema/freshness/contradiction -> trust states); public plain labels | 02-01 (facets), 02-03 (engine), 02-04 (labels) |
| D7 | Check engine reuses attempt/repair/cron substrate; cron -> action -> mutation; pure transition oracle | 02-03 |
| D8 | registry.search gains optional capability filter; DTO gains business-grain capabilities[]; additive/passthrough; deliberate agentTools snapshot | 02-04 |
| D9 | Migration = derive-then-additive, zero public breakage; serviceCapabilities untouched | 02-02 |
| D10 | Agent operation = orthogonal operationMode disclosure, not a capability kind | 02-04 |
| D11 | Wedge-agnostic invariant enforced by a scan on the capability tables | 02-02 |

## Tickets (Scope 2 resolved wayfinder questions)

Every ticket is resolved in wave 1 (plan 02-01) — resolution comment + close +
one line appended to wayfinder map issue #1 — then cited by the consuming plan
as "resolution of #N".

| Title | # | Type | Resolved in | Consumed by (preflight gate) |
|-------|---|------|-------------|------------------------------|
| Resolve Convex-safe external-fetch path for capability checks | #9 | research | 02-01 T1 | 02-03 (runtime split, SSRF) |
| Prototype domain-control proof for business_endpoint admission | #10 | prototype | 02-01 T2 | 02-03 (host allowlist), 02-04 (#13) |
| Settle contradiction precedence: AE-held facts vs business manifest | #11 | grilling | 02-01 T2 | 02-03 (facet d) |
| Decide capability-table naming and serviceCapabilities fold path | #12 | grilling | 02-01 T3 | 02-02 (table naming/fold) |
| Decide agent-operation disclosure proof bar | #13 | grilling (blocked_by #10) | 02-01 T2 | 02-04 (operationMode copy) |
| Tune ae-endpoint-check:v1 freshness windows and timeouts | #14 | prototype (blocked_by #9) | 02-01 T1 | 02-03 (windows/backoff) |
| Define locality x capability filter composition for registry.search | #15 | grilling | 02-01 T3 | 02-04 (filter composition) |

Standing fog (not tickets; carry forward): stale/unsupported endpoint blocking
vs annotating Scope-4 dispatch; whether business-origin manifests need a
Scope-3 agent-identity signature; trust states driving ranking vs filtering;
whether AE ever caches a fetched manifest body vs hash + facet results only.

## Plan sequence (waves + depends_on)

| Wave | Plan | Title | depends_on | requirements |
|------|------|-------|------------|--------------|
| 1 | 02-01 | Resolve tickets + author pure capability model | — | D1, D3, D4, D6 |
| 2 | 02-02 | Capability tables + derive-then-additive migration | 02-01 | D2, D3, D4, D9, D11 |
| 3 | 02-03 | Check engine + ae-endpoint-check:v1 + cron | 02-01, 02-02 | D5, D6, D7 |
| 4 | 02-04 | registry.search filter + DTO + discovery + disclosure + copy | 02-01, 02-02, 02-03 | D6, D8, D10 |

```text
Scope 1 (deployed env, base-URL helper, authz canonicalization) ─┐  cross-scope gate
                                                                  v
02-01 ──> 02-02 ──> 02-03 ──> 02-04
   └──────────────────────────┘  (02-04 also reads 02-01 resolutions #13/#15)
```

## End conditions

Observable, command-verifiable (deployed vs local distinguished honestly):

- LOCAL: all seven tickets closed — `gh issue view 9/10/11/12/13/14/15 --json state` each report `closed`; wayfinder map issue #1 has a "Decisions so far" line per ticket.
- LOCAL: capability model + schema green — `npm run typecheck`, `npm run check:convex-codegen`, `npm run test:ts-standards`, `npm run test:types`, `npx vitest run tests/unit/capabilities` all pass.
- LOCAL: wedge-agnostic invariant enforced — `npm run test:imports` includes and passes `tests/imports/wedge-agnostic-capability.test.ts`.
- LOCAL: additive read surfaces — `npm run test:integration` (incl. agentTools snapshot), `npm run test:copy`, `npm run test:seo`, `npm run test:ui-contract`, `npx vitest run tests/unit/registry/capability-filter.test.ts` all pass; no consumer breakage.
- DEPLOYED (gated, NOT claimed complete locally): `npm run test:provider-smoke:capability-check` passes only against a deployed Convex deployment with host allowlist + a seeded agent-operated demo business; until then it FAILS LOUDLY and does not count as external proof.
- DEPLOYED (Scope-2 "Done" per five-scopes.md): an agent-operated demo business registers a self-hosted capability manifest; AE ingests, checks, and publishes per-capability trust states; registry.search filters on capability; staleness visibly degrades the listing.
- DEPLOYED (ADR-006 S1-G3 gate) — the discovery/registry surfaces pass the agent-experience audit: an unbriefed agent discovers the per-business capability summary + the door from `/llms.txt`, reads listings, and filters by capability without guessing 404s (Doc Quality); no agent overreaches the boundary. Runs against the deployed surface; local runs are iteration-only. Not claimed until Scope 1 deploys.

## Success criteria (rollup of plan success_criteria)

- 02-01: seven tickets resolved/closed/mapped; pure model (closed enum, discriminated descriptor, five trust states, transition oracle, facet evaluator) unit + type tested; no schema/route/copy; `verified` never emitted.
- 02-02: two new tables with D2 indexes + discriminated descriptor; idempotent derive-then-additive backfill; `capability_check` scope end to end; wedge invariant in `test:imports`; codegen/typecheck/ts-standards/imports green.
- 02-03: ingestion strict-parsed/claim-stripped/host-allowlisted/read+describe; cron->action->mutation matches #9; four facets -> five trust states; staleness/contradiction/backoff degrade visibly; readbacks redacted; deployed check smoke fails loudly and is not external proof.
- 02-04: additive passthrough-safe search/DTO with deliberate agentTools snapshot; orthogonal operationMode; boundary-honest machine capability summary with negative flags pinned; copy/SEO/UI-contract green with zero new allowances; public launch stays Scope-1/GTM gated.

## What good looks like (reviewer checklist)

1. A reviewer can reconstruct any capability's trust state from the pure transition oracle + attempt row alone — the engine's live fetch is the only impure step, and it is isolated in a Convex node action.
2. The capability diff adds NO field to `business`/`registry`/`discovery` rows and NO local-services field (serviceArea/suburb/hours/urgency/emergency) to the new tables — the wedge scan fails loudly if either is violated.
3. Every read-surface change is additive: existing agentJson/http/agentTools callers pass unchanged, and the agentTools snapshot moved in exactly one deliberate commit.
4. No new bespoke Ae*/CSS or parallel UI system; any human capability/trust label is Astryx + plain PRODUCT.md copy, and copy scans stay green with zero new claims-register allowances.
5. The fail-loud check smoke enumerates every missing input (base URL, host allowlist, seeded business, attempt/facet/trust evidence) and refuses to count absence, screenshots, dashboards, env vars, or webhook arrival as proof.
6. `verified`, `callable`, `endpoint`, `manifest`, `autonomous`, `agent-native` never appear on a human surface; they stay machine-only and scan-enforced; no booking/payment/dispatch claim anywhere.

## How to execute (fresh session)

1. Read this INDEX, then `.planning/adr/ADR-002-capability-registry-agent-native-supply.md`, `.planning/ENGINEERING-STANDARDS.md`, `AGENTS.md`, and `.planning/ROADMAP.md` bloat detector.
2. Confirm the Scope-1 cross-scope gate (deployed env, canonical base-URL helper, authz tokenIdentifier canonicalization) before starting 02-02+; 02-01 (tickets + pure model) may proceed on source first.
3. Execute plans in wave order: 02-01 -> 02-02 -> 02-03 -> 02-04. Within each plan, run tasks in order, TDD where marked, and run every `<verify>` before advancing.
4. Load skills first, per plan:
   - 02-01: `domain-modeling`, `codebase-design`, `tdd`, `ponytail`, `grilling`.
   - 02-02: `convex-schema-validator`, `convex-migration-helper`, `convex-best-practices`, `codebase-design`, `tdd`, `ponytail`.
   - 02-03: `convex-cron-jobs`, `convex-functions`, `convex-security-audit`, `security-threat-model`, `codebase-design`, `tdd`, `ponytail`.
   - 02-04: `tanstack-start-best-practices`, `convex-best-practices`, `seo-audit`, `ai-seo`, `schema`, `product-design`, `tdd`, `ponytail`.
5. On each plan's completion, write the SUMMARY.md named in its `<output>` (source/local proof only; production/deployed proof named separately and not claimed).
6. The orchestrator runs formatters/linters/full suites centrally — do not run them per plan beyond the cited `<verify>` commands.
