# Scope execution readiness map

**Status:** active orchestration map, written after the 2026-07-04 wayfinder/ADR audit.  
**Scope:** Scopes 1-7 plus the 14-day gate.  
**Purpose:** route subagents safely after the wayfinder tickets. This file does not create a public capability or production proof.

## Non-negotiable proof rule

Local/source proof, deployed test-mode proof, deployed provider proof, and live/production proof are different states. A local harness, source test, fixture, screenshot, or skipped smoke is never external proof. Public wording may only use the strongest wording allowed by the evidence artifact named in the same row.

Current assistant-callable actions remain exactly `registry.search`, `registry.detail`, and `inquiry.submit`; only `inquiry.submit` is a write. Any widening requires a deliberate action-snapshot diff, boundary review, and the relevant scope gate.

## Current active blockers

| Blocker | State | Blocks | Allowed preparation |
|---|---|---|---|
| Issue #5 — deployed env and smoke evidence | Open; user-provisioned Vercel/Convex/Clerk/Resend/Novu/Autumn/Stripe/operator inputs missing | Scope 1 deployed closeout, deployed provider proof, issue #36 deployed audit, public/agent-facing launch claims | Harden fail-loud scripts and evidence templates only. Do not record green rows. |
| Issue #36 — deployed agent-experience gate | Open; depends on #5 | Agent-facing GTM claims and any claim that an unbriefed assistant can complete AE's primary flow on the deployed surface | Local harness/remediation work may proceed; local PASS is iteration only. |
| Issue #33 — demo-kit receipt loop | Open/blocked | Runnable receipt-loop demo kit, hackathon proof artifact, any `businessAction.propose` exposure | Planning/governance only. No non-runnable `examples/receipt-backed-business-action/` skeleton. |
| PM-01 owner pull | Open/not proven | Owner-response and supply-pull claims; S2-S5 product proof | Outreach tracker/script/evidence schema. |
| PM-02 assistant distribution | Open/not proven | Assistant distribution/public posture/readback/propose expansion claims | Query table/runbook only. |
| PM-04 hands require pull | Open/not proven | Scope 4 04-02+ and Scope 5 05-02+ product-demo proof | Demo script and acceptance rubric only. |
| PM-05 trust language | ADAPT/not unlocked; fixture/ledger/template scaffolded | Public/demo copy and assistant-visible descriptors | Run `.planning/scopes/PM-05-ADAPTATION-PLAN.md`; keep `.planning/scopes/PM-05-REVIEWER-EVIDENCE.md` empty until real reviewers answer. |
| 14-day bootstrap gate | Active/evidence-free; scaffold exists in `.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md`; G1, G2, and G3 are source-local implemented but target dry-runs remain open; clock remains blocked by target-environment targeted-session proof, target-environment source/profile click proof or explicit exclusion, target-environment supplier-action proof, and issue #36/#5 outside-in audit evidence | Public platform-rung widening beyond storefront prototype + qualified inquiry | Source-backed profile corpus, provider recruitment, target dry-run evidence, and narrow pre-clock blocker tickets only. The clock has not started. |

## Cross-scope lock table

| Downstream work | Minimum Scope 1 source proof | Minimum deployed proof | Other gates | Status now |
|---|---|---|---|---|
| S2 02-01 decisions/model reading | Scope 1 local/source substrate complete | None | PM-03 wedge-agnostic rule | Can use archived summary as source-local context. |
| S2 02-02 capability storage/migration | Scope 1 source substrate + S2-G3 wedge-agnostic pack | None for source-local; #5 for deployed proof | PM-01/PM-02 remain product-proof blockers; PM-05 for copy | Source-local executable after S2-G2/S2-G3 assumptions are checked. |
| S2 02-03 endpoint check engine | Scope 1 source substrate + S2-G2 source-local fixture pack now present | #5 before deployed provider proof | Host allowlist/domain-control config, seeded business, real attempt/facet/readback/trust-state smoke inputs still required before deployed proof | Task 1 ingestion, Task 2 runtime action/mutation split, and Task 3 hourly cron/fail-loud provider smoke are source-local complete. |
| S3 03-04 evidence binding | Scope 1 source substrate + tokenIdentifier posture | #5/#36 before deployed signer/agent-facing claims | S3-G2 ADAPT constraints; no public HSK vocabulary | Source-local evidence binding implemented; deployed/exposure proof still gated. |
| S4 04-02 thread/readback | Scope 1 source substrate | #5/#36 before deployed agent readback claims | S2 endpoint contract for dispatch paths; S3 principal for attributed readback; PM-04/PM-05 | Planning/preflight only until gates materialize. |
| S4 04-03 business reply channel | Scope 1 source substrate | Deployed dev/staging endpoint for proof | S2 checked+fresh dispatchUrl/signing refs, S3 identity, S4-G2/G3/G4 | Blocked from implementation until upstream artifacts exist. |
| S4 04-04 provenance/e2e demo | Scope 1 source substrate | Deployed dev/staging AE + pinned test/demo endpoint | PM-04, PM-05, S4-G5 | Blocked except copy/provenance fixture prep. |
| S5 05-02 slug/verifier prep | Scope 1 source substrate | #5 for provider/deployed proof | ADR-005 D1/D2/D5, S5-G4/S5-G5 | Source-local verifier governance/readback prep implemented; public proof and demo kit still gated. |
| S5 05-03 `businessAction.propose` authoring | Scope 1 source substrate | #5/#36 before agent-door proof | Scope 3 identity/mandate before registration/exposure; snapshot diff | May author private seams only; never register/expose now. |
| S5 05-04 demo kit | Scope 1 source substrate | #5 + pinned dev/staging endpoint | #33, public verifier, propose exposure, PM-04, PM-05 | Blocked. No skeletons. |
| P6 receipt-backed business-action proof | Existing Phase 6 source/local verification | Deployed Stripe/provider smoke before production/deployed claim | Live money future decision for live mode | Historical source/local proof only. |
| P7 answer/search | P1 registry/search truth + answer evidence schema | #36 before agent-facing claims; deployment for production UX | PM-02, PM-05, CSP/model-call decision | Planning map only; implementation must preserve no-write boundary. |

## Scope index routing

| Scope | Active index | Historical/source-local context | Current posture |
|---|---|---|---|
| S1 production landing | `.planning/scopes/scope-01-production-landing/SCOPE-01-INDEX.md` | n/a | Source/config mostly complete; deployed evidence blocked on #5; agent audit deployed gate blocked on #36/#5. |
| S2 capability registry | `.planning/scopes/scope-02-capability-registry/SCOPE-02-INDEX.md` | `.planning/archive/scopes/scope-02-capability-registry/` | Active lightweight index points to archived plans and current gate overrides. |
| S3 identity/clearance | `.planning/scopes/scope-03-handshake-identity-clearance/SCOPE-03-INDEX.md` | `.planning/archive/scopes/scope-03-handshake-identity-clearance/` | Source-local continuation may use archived 03-04 map; public/exposure proof gated. |
| S4 communication rail | `.planning/scopes/scope-04-comms-rail-threads/SCOPE-04-INDEX.md` | `.planning/archive/scopes/scope-04-comms-rail-threads/` | Active lightweight index consumes resolved #22-#28 and keeps implementation behind upstream/preflight gates. |
| S5 transactions/receipts | `.planning/scopes/scope-05-transactions-receipts/SCOPE-05-INDEX.md` | `.planning/archive/scopes/scope-05-transactions-receipts/` | Active lightweight index overrides stale #33/#35 wording and keeps demo loop blocked. |
| S7 answer/search | `.planning/scopes/scope-07-answer-thread-ai/SCOPE-07-INDEX.md` | `.planning/archive/phases/07-answer-thread-ai/` | Planning stub only; preserves read-only answer boundary and deployment/PM gates. |
| 14D bootstrap gate | `.planning/scopes/scope-14day-bootstrap-gate/SCOPE-14DAY-INDEX.md` | n/a | Active product gate; no public widening until evidence. |

## Scope-1 deployed evidence matrix

`issue #5` may keep the historical title, but closure uses this exact matrix.

| Row | Kind | Setup or proof | Required non-secret evidence |
|---|---|---|---|
| 1 | Phase 1 header/canonical smoke | Proof | Host, route list, header assertions, canonical host result, no secret values. |
| 2 | Phase 2 support-row smoke | Proof | Host, business slug, `human_inquiry_owner_inbox` support row refs, status, operator next action. |
| 3 | Real inquiry + notification readback | Proof | Inquiry/thread refs, dispatch ids, operation/correlation refs, redacted state transitions. |
| 4 | Resend provider dispatch smoke | Proof | Deployed route, dispatch id, redacted provider message ref/hash, provider state, no raw owner email. |
| 5 | Novu provider dispatch smoke | Proof | Deployed route, dispatch id, Novu transaction/readback refs, provider state, no secrets. |
| 6 | P5 Autumn/Stripe test-mode smoke | Proof, not live money | Source-owned event/ref, provider readback ref/hash, reconciliation/support evidence, test-mode marker. |
| 7 | P6 Stripe test-mode business-action smoke | Proof, not production claim | Signed webhook admission refs, receipt reconstruction refs, support/kill state, no raw Stripe/customer/private payloads. |

If the team wants to keep saying "five provider smokes," rows 3-7 are the provider suite and rows 1-2 are substrate/setup proof. Closure still requires the whole matrix unless an ADR amends it.

## PM-05 claim ledger requirement

Before any public human copy, demo README/deck, SEO metadata, `llms.txt`/agent descriptor, action summary/boundary, or evidence summary ships, attach a ledger row:

| Claim text | Surface | Proof level | Evidence pointer | Missing gates | Allowed wording | Forbidden adjacent wording | Owner phase |
|---|---|---|---|---|---|---|---|

Use `.planning/scopes/PM-05-ADAPTATION-PLAN.md` as the consuming plan and `.planning/scopes/PM-05-CLAIM-LEDGER.md` for rows. Until that plan has scan diffs plus three real reviewer responses, PM-05 remains ADAPT.
