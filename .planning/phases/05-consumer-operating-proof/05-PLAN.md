---
phase: 05-consumer-operating-proof
status: planned_blocked_on_gate_0
goal: public inspect-only exact-Offering comparison
plans: 8
waves: 8
authority: founder-accepted 05-CONTEXT.md D-01 through D-17
---

# Phase 05 execution authority

## Decision supported

Phase 5 decides whether AE can help a person or agent choose between exact
published Offerings without login and without starting work. The accepted loop
is Browse businesses → inspect one Offering → shortlist exact Offering revisions
→ compare source-owned facts → explain trade-offs against stated priorities
(D-01–D-03). The entire phase is `inspect_only`; quote, request, inquiry,
invocation, Customer Request, booking, payment, dispatch and provider effects
are outside the executable boundary (D-11).

The plan is informed by the live dirty-tree Offering lane, ADR-026, the current
v1 registered-action/v2 HTTP mismatch, the UI-SPEC, the Nyquist validation map
and the source ownership map. It does not treat the dirty shared checkout as an
integration revision.

## Gate 0 and custody

Plan 05-01 cannot execute from the current dirty shared tree. Before any child
dispatch, the parent integrator must supply an exact base revision/tree, one
named custody owner, a literal file allowlist for the complete Offering lane,
and a clean result revision/tree. Untracked Offering owners, modified schema and
generated edges, synthetic legacy identities and fail-closed cutover flags must
be reconciled as one coherent predecessor parcel. If that custody cannot be
produced, the phase stops at 05-01; no later plan may infer or recreate the
canonical Offering contract.

Every executor works in an isolated child worktree from its declared predecessor
revision. It may modify only `files_modified`, must not stage or restore unrelated
work, and returns: base revision/tree, result revision/tree, changed paths,
commands/results, observable behavior, unresolved finding, earliest blocker,
evidence class, claim ceiling and next safe parent action. The parent integrator
alone merges children and confirms the next wave base.

## Dependency graph

```text
05-01 custody/integration
  -> 05-02 catalog history + profile-bearing Offering facts
  -> 05-03 registry codecs/actions + three public HTTP adapters
  -> 05-04 Answer, Answer Thread and discovery consumer migration
  -> 05-05 comparison semantics
  -> 05-06 public human UI and loader
  -> 05-07 fixed comparison POST, actual-loader parity and transfer evals
  -> 05-08 clean parent integration, accessibility checkpoint and hosted packet
```

| Wave | Plans | Dispatch rule |
|---|---|---|
| 1 | 05-01 | Parent custody gate; no current-tree execution |
| 2 | 05-02 | Catalog historical eligibility and profile-bearing Offering facts first |
| 3 | 05-03 | Starts from integrated 05-02 so registry codecs/actions must preserve both closed profiles |
| 4 | 05-04 | Starts after registry parity and migrates the literal live consumer inventory |
| 5 | 05-05 | Adds pure comparison semantics after all Offering-v2 consumers are explicit |
| 6 | 05-06 | Produces the actual public loader and accessible UI projection |
| 7 | 05-07 | Starts from 05-06 and compares the actual loader result with the fixed POST action result |
| 8 | 05-08 | Parent integrates all results, proves clean source/build/accessibility, then deploys that exact revision |

## Artifact manifest

| Plan | Owned production artifacts | Owned proof artifacts | Observable loop |
|---|---|---|---|
| 05-01 | complete inherited Offering/catalog/Convex/registry/discovery/UI lane and generated edges, bounded by a parent-issued literal allowlist | existing Offering/schema/parity tests plus custody record in summary | exact committed Offering-v2 predecessor with safe cutover and fail-closed flags |
| 05-02 | `src/modules/catalog/internal/offering-{supply,source,public-history}.ts`, catalog public/schema owner, `convex/catalog*.ts` bounded history/query owners, accepted ADR-026 amendment | `tests/unit/catalog/offering-public-history.test.ts`, comparison contract/profile tests | exact previously-public revision resolves without substitution; two closed profile versions validate |
| 05-03 | `src/modules/registry/{public.ts,registry.functions.ts,registry.actions.ts}`, strict v2 projection/codecs, Convex return validation and three public business HTTP adapters | registry action/API/parity/runtime-guard tests including both profile versions | Catalog facts survive registry HTTP → registered action unchanged and safe |
| 05-04 | registry-adjacent, Answer, Answer Thread and discovery Offering-v2 consumers plus a literal source-facing inventory gate | Answer tool-call, discovery parity, copy and import checks | every live action-output consumer is explicit, profile-preserving and unable to reconstruct `services[]` |
| 05-05 | `src/modules/comparison/internal/{contract,profiles/*,resolve,compare,brief,projection}.ts`, `public.ts` | resolver/comparator/brief tests | at most four exact refs compare; default/tie/blockers unranked; priority order and complete deterministic brief inspectable |
| 05-06 | public registry/business/Offering/compare routes, bounded presentation resolver/adapter, answer-first comparison components, generated route tree | presentation, UI, copy, SEO, browser and accessibility specs | no-login visitor receives a direct grounded answer, reads decisive differences/caveats, can disclose full evidence, and refreshes/shares exact truth even without a model |
| 05-07 | comparison registered action plus fixed anonymous `POST /api/compare` importing only `comparisonCompareAction` | actual loader/POST parity, recursive import fence and vertical/horizontal transfer evals | agent receives the same semantics as the real public loader and no effect owner is reachable |
| 05-08 | release tooling, clean parent integration gate, manual accessibility checkpoint, hosted smoke and closeout | typecheck/build/codegen/focused matrices, VoiceOver notes, frozen manifest and zero-effect readback | exact integrated revision passes source and human checks before the same revision is hosted |

Generated `convex/_generated/api.d.ts` belongs to the parent integration step
that changes Convex owners. Generated `src/routeTree.gen.ts` belongs to 05-06
after its source routes exist. Plan 05-08 re-verifies both from the fully
integrated clean tree. Neither may be edited manually or generated from an
incoherent tree.

## Decision coverage and source audit

| Source | ID | Required outcome | Plans | Status |
|---|---|---|---|---|
| GOAL | — | Public no-login exact Offering comparison with inspect-only tradeoff explanation | 01–08 | COVERED |
| REQ | P5-CUSTODY | Exact committed predecessor and safe cutover | 01 | COVERED |
| REQ | P5-CATALOG | Historical eligibility and closed profiles | 02 | COVERED |
| REQ | P5-REGISTRY | Offering-v2 HTTP/action parity and literal consumer migration | 03, 04 | COVERED |
| REQ | P5-COMPARE | Bounded exact comparison and honest ordering | 05 | COVERED |
| REQ | P5-HUMAN | Public accessible Astryx loop | 06 | COVERED |
| REQ | P5-AGENT | Structured parity and transfer | 07 | COVERED |
| REQ | P5-EVIDENCE | Exact hosted packet | 08 | COVERED |
| CONTEXT | D-01, D-02, D-03 | Browse-first public no-login loop | 06, 08 | COVERED |
| CONTEXT | D-04, D-05, D-06 | transient exact Offering revision selection | 02, 05, 06 | COVERED |
| CONTEXT | D-07, D-08, D-09 | provenance, closed profiles, no score, unranked default | 02, 05 | COVERED |
| CONTEXT | D-10, D-11, D-12 | one human/agent semantic owner, effect fence, category neutrality | 03, 04, 05, 06, 07 | COVERED |
| CONTEXT | D-13, D-14, D-15, D-16 | two-category exact hosted evidence and claim ceiling | 07, 08 | COVERED |
| CONTEXT | D-17 | answer-first deterministic brief, bounded model-neutral presentation and complete fallback | 05, 06, 08 | COVERED |
| RESEARCH | — | Max four selections, max three closed priorities, strict codecs, indexed reads, no-store transient comparison | 02–07 | COVERED |
| RESEARCH | — | ADR decision before historical-public meaning changes | 02 | COVERED |
| RESEARCH | — | Existing public registry routes execute registry actions; fixed anonymous comparison POST proves reachability; descriptor presence is insufficient | 03, 04, 07 | COVERED |
| RESEARCH | — | answer-first brief, native disclosed table / equivalent mobile `dl`, bounded presentation fallback, state matrix and zero-effect browser proof | 05, 06 | COVERED |
| RESEARCH | — | exact deployment identity and independently verified frozen packet | 08 | COVERED |

Deferred signed-in saving, quote/request/inquiry, Customer Request/RoutePlan,
reviews/reputation/scoring, crawling/probing, execution, payments, fulfilment,
real-customer proof and market mechanisms do not appear in implementation
tasks. There are no unplanned required source items.

## Phase success and claim ceiling

Closure is permitted only when one authenticated exact-revision hosted
deployment publicly serves labelled `professional_service:v1` and
`machine_data:v1` Offerings, human and structured surfaces deep-agree on the
semantic result, exact refresh/share and changed-revision behavior passes, and
zero effect is observed. The maximum claim is hosted comparison capability over
labelled demonstration data. It does not establish demand, value, supplier
quality, independent fulfilment, willingness to pay, retention, revenue,
production safety, real screen-reader use or human comprehension (D-13–D-16).
