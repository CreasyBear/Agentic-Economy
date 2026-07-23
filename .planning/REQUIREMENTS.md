---
milestone: protocol-kernel-product-conversion
status: active
created: 2026-07-20
---

# Requirements — Phase 3A one reliable paid operation

- [x] **P3A-R1 Exact offer:** bind BTC/USD, one provider revision, endpoint,
  price, payment target, principal, input digest and invocation generation.
- [x] **P3A-R2 Durable payment custody:** persist prepared and
  possibly-submitted states before their external boundaries without exposing
  credential, signature or payment payload material.
- [x] **P3A-R3 Separate command truth:** query release, payment authorization,
  paid submission, settlement evidence and quote delivery remain independently
  reconstructable.
- [x] **P3A-R4 Safe uncertainty:** every unusable result after possible paid
  submission requires exact reconciliation; no retry or new authorization is
  available while uncertainty remains.
- [x] **P3A-R5 Exact result:** the operation owner normalizes a finite positive
  BTC/USD price, source, observation/receipt time, freshness and raw evidence
  reference.
- [x] **P3A-R6 Shared semantics:** human and agent hosts consume one versioned
  `agentic-paid-operation:v1` object with typed errors and continuations.
- [x] **P3A-R7 Restore and dedupe:** duplicate delivery, reload and cold restore
  create zero unintended signatures, paid sends or current effect generations.
- [x] **P3A-R8 Evidence honesty:** local/mock environment, evidence class,
  provider fixture identity and claim ceiling survive every projection and
  snapshot.
- [x] **P3A-R9 Human comprehension:** the compact operation surface makes task,
  provider, maximum charge, shared data, payment/release truth and safe next
  action understandable without protocol vocabulary.
- [x] **P3A-R10 Experience quality:** Astryx neutral, keyboard, visible focus,
  44px targets, non-colour states, bounded announcements, responsive reflow,
  zoom and reduced motion pass focused checks.
- [x] **P3A-R11 Product-proof closeout:** focused source, fixture, parity,
  browser, accessibility and independent review has no unresolved P0/P1.

R1–R10 are source- and labelled-local-fixture complete through revision
`6933fac0`. The mounted Chromium evaluation covers 320px reflow, declared 400%
zoom emulation, computed focus, reduced-motion behavior, one atomic live
region, accessibility-tree semantics and query-agnostic projection parity.
This is automated local evidence, not a real screen-reader session or human
comprehension study. R11 closed at revision `eec9131c`: 153 focused tests,
seven browser evals and both official local packet verifiers passed from clean
tree `1490ceea9590281d1941aa6d0955fc782f5084a9`; independent review found no
unresolved P0/P1 inside the labelled local/mock boundary.

## Non-requirements

No real credentials or payment, independent settlement, public endpoint,
Convex persistence, hosted/provider/customer-value proof, multi-provider
selection, automatic fallback, caching/resale, workflow builder, booking,
standing mandate, Full autonomy or production exposure.

---

# Requirements — Phase 3B second-provider plug-in test

- [x] **P3B-R1 Provider-owned variation:** Provider B owns its publication,
  endpoint, revision, payment recipient, raw result schema and normalization;
  shared hosts never parse either provider payload.
- [x] **P3B-R2 Explicit selection:** exactly one provider is selected before
  authority is granted; provider identity and material digest are bound into
  the invocation, payment attempt and result source.
- [x] **P3B-R3 Shared contract unchanged:** Provider A and Provider B use the
  existing `agentic-paid-operation:v1` semantics, application service, host
  commands and query-agnostic card without provider branches.
- [x] **P3B-R4 Equivalent normalized result:** both providers produce the same
  `BtcUsdQuoteResult` contract and generic presentation block vocabulary while
  retaining their attributable source identity and raw evidence digest.
- [x] **P3B-R5 No fallback:** timeout, refusal, malformed result or uncertain
  payment at Provider A causes zero Provider B authorizations and sends.
- [x] **P3B-R6 Switching is a new consequence:** choosing Provider B after a
  safely terminated Provider A invocation creates a new invocation, authority,
  payment identifier and charge boundary; it never resumes Provider A state.
- [x] **P3B-R7 Restore and dedupe:** both selected providers survive snapshot
  restoration without changing target identity or creating duplicate
  signatures, sends or effect generations.
- [x] **P3B-R8 Differential proof:** the conformance suite runs the same
  success, refusal, uncertainty, reconciliation, invalid-result and restore
  cases against both providers and proves unchanged host behavior.
- [x] **P3B-R9 Evidence honesty:** final evidence is generated once from the
  clean integrated revision and remains labelled local/mock; browser checks are
  regression evidence only.

## Phase 3B non-requirements

No provider ranking, comparison UI, automatic fallback, cheapest-provider
selection, load balancing, caching, real provider, real payment, hosted route,
Convex persistence, new semantic schema, new lifecycle state, new host command
or customer-value claim.

---

# Requirements — Phase 3C hosted paid-operation product trial

- [ ] **P3C-R1 Durable hosted truth:** source-owned durable records reconstruct
  invocation, exact actor, authority decision, selected provider, payment
  preparation/submission, settlement evidence, result delivery, uncertainty
  and the only safe continuation after process loss.
- [ ] **P3C-R2 Authenticated application seam:** protected human and
  structured-agent adapters bind the authenticated principal and expected
  invocation version to the existing `PaidOperationApplicationService`; routes
  do not own lifecycle or business rules. Caller ownership is never trusted;
  direct-bypass, IDOR and revoked access fail closed, while evaluator
  admission limits remain separate from consequence authority.
- [ ] **P3C-R3 Shared semantics unchanged:** both surfaces consume the same
  `agentic-paid-operation:v1` semantic object and digest without BTC,
  x402 or provider-specific fields in paid-operation lifecycle semantics.
  This proves query/provider variation within paid operations only, not
  compatibility with non-paid Action classes.
- [ ] **P3C-R4 Human trial surface:** an authenticated evaluator can inspect
  a BTC/USD task, source-bound provider, material input, maximum
  charge, disclosed data, payment/result truth, evidence class and only safe
  next action in ordinary customer language. `/actions/paid/new` is
  evaluator-only Sandbox setup; `/` remains canonical product IA and
  `/actions/paid/:invocationRef` is reusable paid Action Detail.
- [ ] **P3C-R5 Structured-agent surface:** an authenticated agent receives the
  same semantic truth, evaluator-scoped setup/create relation, exact expected
  version, typed refusal/error and only currently permitted command without
  manufacturing authority, provider material or reconciliation evidence.
- [ ] **P3C-R6 Explicit provider consequence:** the source owner selects and
  durably binds one existing mock provider before authority from the protected
  evaluator-only Sandbox setup selector.
  Changing provider from safely terminal truth creates a new invocation,
  authority, payment identifier and effect lineage. No customer comparison,
  ranking or fallback is introduced.
- [ ] **P3C-R7 Golden and goblin paths:** the forward golden path proves
  evaluator setup, source-owned creation, consequence review, authority, the
  permission-recorded/not-submitted boundary, one execution, separated
  payment/settlement/result truth and durable restore. Named goblin paths prove
  pre-release refusal, payment possibly submitted, invalid result,
  reconciliation, duplicate delivery, stale/cross-principal refusal, bounded
  admission exhaustion, read outage, ambiguous transport and crash points
  around prepared/submission-started custody. Every goblin path has one safe
  rejoin or visible stop; uncertainty never exposes retry or provider change.
- [ ] **P3C-R8 Interface quality:** Astryx neutral, persistent labels, visible
  focus, keyboard operation, 44px targets, non-colour state cues, bounded live
  announcements, 320px reflow, 400% zoom and reduced motion pass focused
  checks.
- [ ] **P3C-R9 Exact hosted evidence:** a clean exact revision passes focused
  source and browser checks, then hosted readback proves the named deployment,
  authenticated surfaces, revision, fixture provenance and cold continuation.
  Deployment command, target, identity and rollback are source-proven and
  separately authorized before mutation.
- [ ] **P3C-R10 Comprehension and claim ceiling:** evaluators can correctly
  identify what was shared, what may have been paid, whether a result was
  validated and what is safe next; every surface remains labelled hosted
  sandbox and excludes real-payment, settlement, fulfilment, production-safety,
  demand and customer-value claims. A frozen independently scored cohort covers
  human and structured-agent journeys and claims only declared-evaluator
  comprehension.
- [ ] **P3C-R11 Trial residue and retirement:** every introduced artifact is
  classified paid-operation-owned, trial-only, or candidate-shared-after-
  second-use. Import/deletion gates prove trial routes, mocks and
  operation-owned persistence can be removed without damaging neutral Action
  Invocation, and non-paid actions cannot import paid-operation DTOs,
  semantics or payment panels. Closure records sandbox account/record
  retention or expiry, kill-switch owner, residual records and retirement
  trigger; `03C-UI-SPEC.md` becomes phase provenance rather than permanent
  shared law.

## Phase 3C non-requirements

No public anonymous paid-operation route, real credential or payment,
independent settlement, independently operated provider, provider onboarding,
ranking, comparison UI, automatic fallback, workflow composition, broad
Activity surface, standing-mandate selector, Full autonomy, BTC-specific shared
component or model-generated executable UI.

## Phase 3C verification reopening — 2026-07-21

P3C-R1 through P3C-R11 remain unchecked. The retained v1 packet was rebuilt
after the live collector refused and therefore establishes only
`local_packet_integrity_only`. The repair contract is
`03C-REPAIR-PLAN.md`. Cuts 0-4 are locally integrated and their focused source,
UI, browser, residue and v2 verifier gates are green, but no requirement is
upgraded by that local evidence. A fresh exact-revision hosted v2 run remains
required for technical hosted admission. P3C-R10 cannot close until eligible
human comprehension sessions satisfy the frozen instrument; the automated
result remains `automated_adjunct_only`.
