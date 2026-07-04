# Scope 05 — Transactions + Receipts (INDEX)

**ADR:** [.planning/adr/ADR-005-transactions-receipts.md](../../adr/ADR-005-transactions-receipts.md)
**Scope label:** `scope:5` · **Wayfinder map:** issue #1 (`Decisions so far`)
**Direction:** `local://five-scopes.md` scope 5 — productize the Phase 6 one-slug spike into the hackathon-ready receipt-backed action loop.
**Sequencing:** `1 -> 3 -> 5`. Scope 5 needs scope 2 (an agent-operated demo business) + scope 3 (attributed identity for door exposure); scope 1 (deployed smokes) gates live money. All of those stay **cross-scope preflight gates**, not scope-5 work.

Honesty posture (whole scope): every plan is `production_executable: false`. This scope delivers the loop, the public read-only verifier, and the demo kit as **source/local, Stripe test-mode proof only**. Live money is not implemented (gated behind D6). `businessAction.propose` is authored but not registered (gated behind scope 3). No plan claims booking/payment/dispatch/autonomous fulfillment; "verified" is never used unqualified.

## Validation-first gate

Read `.planning/scopes/PREMORTEM-VALIDATION-GATES.md` and `.planning/scopes/PHASED-EXECUTION-PREP.md` before executing this scope. Scope 5 implementation beyond governance is blocked by non-kill verdicts for **PM-01 owner pull**, **PM-02 assistant distribution** where agent-facing propose/readback surfaces are involved, **PM-03 launch wedge lock**, **PM-04 hands require pull**, and **PM-05 trust-language red-team**. Scope-local gates:

- **S5-G1 demo anti-theatre tabletop** before 05-04.
- **S5-G2 hackathon-path vs product-wedge mapping** before 05-01 closeout and 05-04 README copy.
- **S5-G3 propose exposure STOP gate:** authoring is allowed, registration/exposure is impossible without a Scope-3 completion artifact and deliberate agentTools snapshot diff.
- **S5-G4 public verifier privacy/enumeration decision** before route work.
- **S5-G5 Stripe/test-mode/live-money evidence boundary matrix** in every Scope-5 summary/demo artifact.


---

## Decisions digest (ADR-005 D1–D8)

| D | Decision | Where implemented |
|---|---|---|
| D1 | Amend the one-slug door to a **closed, typed, individually-admitted** slug set; each slug passes the 6-point per-slug admission checklist. No generic `executeAction`, no caller-supplied slugs. | 05-01 (decision record), 05-02 (widening) |
| D2 | v1 slug set = **exactly two** slugs: `provision-paid-intake-endpoint` (paid) + `publish-agent-intake-endpoint` (non-paid money-free mirror). | 05-01 (card lock), 05-02 (implement) |
| D3 | Author `businessAction.propose` (proposal-only, discriminated readback union, mandate-bound). **Exposure gated on scope 3** — authored but NOT registered. | 05-03 |
| D4 | v1 checkpoint approval is **owner-side only**; buyer intent is the up-front mandate. No interactive buyer-approval verb. | 05-03 (boundary recorded) |
| D5 | Public **read-only, hash-only, non-enumerable** receipt verification: `businessAction.verifyReceipt` (read action) + JSON HTTP route; reuse `PublicActionReceiptReadback`. | 05-01 (privacy/copy), 05-03 (implement) |
| D6 | Scope 5 stays **Stripe test-mode only**; live mode gated behind the D6 chain (scope-1 deployed smokes + a new `06-LIVE-MONEY-EVIDENCE-DECISION.md` + reconciliation/dispute proof + copy scans). Not implemented here. | 05-01 (draft record contents) |
| D7 | Demo kit under `examples/receipt-backed-business-action/` (seed + Hermes-shaped agent script + README + `.env.example`). | 05-04 |
| D8 | Hackathon proof is strictly separated from production acceptance; kit output labeled test-mode/local; copy scans reject production/autonomous/money claims. | 05-04 |

---

## Tickets (all 7 scope-5 wayfinder issues)

| Ticket (title) | # | Type | Where handled |
|---|---|---|---|
| Prove per-slug hash chain and receipt verifier across two slugs | #29 | prototype | **05-01 Task 1** (entry resolution/spike) |
| Ratify slug-set door amendment and update ROADMAP door row | #30 | grilling | **05-01 Task 2** (dated decision record in scope dir) |
| Lock the v1 non-paid slug card schema against the demo business | #31 | grilling | **05-01 Task 3** (resolution) |
| Settle public receipt-verification privacy and human-surface copy | #34 | grilling | **05-01 Task 4** (resolution) |
| Draft live-mode money-evidence decision record contents | #32 | research | **05-01 Task 5** (draft record in scope dir) |
| Confirm mandate-at-door binding for `businessAction.propose` | #35 | research | **05-03 preflight gate** (scope-3-coupled; blocks the deferred exposure — never silently pre-answered) |
| Run the full demo-kit receipt loop against a seeded fixture | #33 | prototype | **05-04 Task 1** (resolution; `blocked_by` #31) |

Every resolution task's action resolves the investigation, posts a resolution comment on its issue, closes the issue, and appends one line to the wayfinder map issue #1 `Decisions so far`. #35 stays an open question represented as a named preflight gate because it cannot finalize until scope 3's identity contract lands; #33 cannot be wave 1 because it is `blocked_by` #31 and needs the implemented loop.

---

## Plan sequence + dependency graph

```text
wave 1   05-01  door governance + all pre-implementation resolutions   (D1,D2,D5,D6)
              |   #29 #30 #31 #34 #32 resolved; door + money records written to scope dir
              v
wave 2   05-02  typed slug-set widening + per-slug receipt verifier      (D1,D2)
              |   BusinessActionSlugValues -> closed 2-slug set; actionSlug threaded through hashes;
              |   Convex literalUnion validators; scans extended
              v
wave 3   05-03  agent-door propose (authored, gated) + public verifier    (D3,D4,D5)
              |   businessAction.propose authored NOT registered (#35 gate); verifyReceipt read action + JSON route
              v
wave 4   05-04  demo kit under examples/ + hackathon/production closeout  (D7,D8)
                  #33 loop runs vs seeded local Convex; demo-kit copy + closeout wording gates
```

| Plan | Wave | depends_on | Requirements (D-ids) |
|---|---|---|---|
| 05-01-door-amendment-resolutions-PLAN.md | 1 | — | D1, D2, D5, D6 |
| 05-02-typed-slug-set-verifier-PLAN.md | 2 | 05-01 | D1, D2 |
| 05-03-propose-and-public-verify-PLAN.md | 3 | 05-02 | D3, D4, D5 |
| 05-04-demo-kit-closeout-PLAN.md | 4 | 05-02, 05-03 | D7, D8 |

---

## End conditions

Observable, command-verifiable. **LOCAL** = source/local proof (what this scope delivers). **DEPLOYED / GATED** = honestly not claimed here.

- **LOCAL** — `npm run test:unit` (and the focused `npx vitest run tests/unit/business-action/*`) green with the closed **two-slug** set: `verifyReceiptStatus` reconstructs `complete` and `refused_no_consequence` for **both** slugs and still detects `tampered` / `evidence_mismatch` / `stale_source` / `expired_mandate`.
- **LOCAL** — `npm run typecheck` and `npm run check:convex-codegen` green after the `v.literal(BusinessActionSlug)` → `literalUnion(BusinessActionSlugValues)` validator migration.
- **LOCAL** — `npm run test:copy`, `npm run test:source-mining`, `npm run test:seo`, `npm run test:imports`, `npm run test:ts-standards` green with **zero new allowances** beyond the two admitted slugs + `receipt-backed business operation` in owned contexts.
- **LOCAL** — `businessAction.verifyReceipt` returns a hash-only `PublicActionReceiptReadback` via `POST /api/agent/tools` and `GET/POST /api/business-actions/verify-receipt`; there is **no list/enumeration endpoint**.
- **LOCAL** — demo kit runs end-to-end against a seeded local Convex (`npx playwright test tests/e2e/receipt-backed-business-action-demo.spec.ts` + `npm run test:demo-kit`), reconstructing **success** for the paid slug and **refusal** for the non-paid slug, with test-mode/owner-approval labels.
- **DEPLOYED (not claimed)** — `npm run test:provider-smoke:business-action-stripe` still fails loud until a deployed base URL + source evidence rows are configured; that is scope-1 discipline and is never counted as external proof here.
- **GATED (not implemented)** — Stripe **live** mode remains behind the drafted `06-LIVE-MONEY-EVIDENCE-DECISION.md` chain; `businessAction.propose` remains **unregistered** pending scope-3 attributed identity.
- **DEPLOYED (ADR-006 S1-G3 gate, T3 extended goal)** — the agent-experience audit exercises the `businessAction.verifyReceipt` read path and confirms **zero boundary-overreach**: no agent treats `businessAction.propose` as an autonomous purchase/booking or a completed consequence. Runs against the deployed surface; not claimed until Scope 1 deploys.

## Success criteria

Rollup of plan `success_criteria`:

- 05-01: #29/#30/#31/#34/#32 resolved and closed; the dated door-amendment decision record (ratified 6-point checklist + exact replacement door-row text, **ROADMAP.md not silently edited**) and the drafted live-money record contents exist in the scope dir; the two-slug hash-chain spike proves safe widening.
- 05-02: the closed two-slug set ships; `actionSlug` is threaded through every request/checkpoint/result/receipt hash instead of the singleton constant; Convex validators moved to `literalUnion`; verifier reconstructs success + refusal for both slugs; copy/source/SEO scans green.
- 05-03: `businessAction.propose` is authored with a discriminated `approval_required | clarification_required | refused | proof_gap | error` union and is **not** in the action registry; `businessAction.verifyReceipt` + the JSON route expose only hash-only readbacks with no enumeration.
- 05-04: the demo kit runs the full loop against a seeded local business, reconstructing success + refusal; demo-kit copy and closeout wording gates reject autonomous/marketplace/wallet/checkout/live-money claims and require `source/local proof only` + `production proof not claimed`.

## What good looks like

1. A reviewer reconstructs the full loop (request → checkpoint → evidence → result → receipt) **from receipts alone**, for both slugs, without reading source.
2. Smokes and the demo kit **fail loudly listing every missing input** and are never counted as external/deployed proof.
3. **No new bespoke `Ae*`/CSS primitives**; any verify affordance is an Astryx-only diff and Tailwind is layout glue only.
4. **Copy/source/SEO scans stay green with zero new allowances** beyond the two admitted slugs — no autonomous/marketplace/wallet/checkout/live-money vocabulary anywhere.
5. `businessAction.propose` is authored but **absent from the action registry**; the widened write is unreachable at the anonymous agent door (exposure gated on scope 3).
6. Live Stripe mode is **not implemented**; the drafted live-money record is a gate, and every summary states `source/local proof only` and `production proof not claimed`.

## How to execute (fresh session)

1. **Load skills first:** `ponytail` (delete/simplify, no future abstractions — /ponytail full posture), `codebase-design` + `domain-modeling` (module seam + slug-set ubiquitous language), `convex-best-practices` / `convex-schema-validator` / `convex-functions` / `convex-migration-helper` (validator migration), `convex-security-audit` + `security-threat-model` (door-widening blast radius), `stripe` (test-mode evidence plumbing), `tanstack-start-best-practices` + `tanstack-router-best-practices` (verify route), `playwright` (demo-kit e2e + smokes), `tdd` (all TDD tasks), `wayfinder` + `grilling` (decision records), `code-review` + `learn` (closeout).
2. Read this INDEX, then `ADR-005-transactions-receipts.md`, then `AGENTS.md` (trust contract + banned vocab), `.planning/ENGINEERING-STANDARDS.md` (constitution), `.planning/ROADMAP.md` (doors + bloat detector), `.planning/codebase/CONVENTIONS.md` + `ARCHITECTURE.md` (patterns).
3. Execute plans **in wave order** (05-01 → 05-02 → 05-03 → 05-04); respect each plan's `depends_on` and `<preflight_gates>`.
4. Within a plan, execute tasks in order; TDD where marked (`tdd="true"`); run each task's `<verify>` before moving on.
5. On plan completion, write the `SUMMARY.md` named in that plan's `<output>`. Do not run formatters/linters/full suites — the orchestrator verifies centrally.
