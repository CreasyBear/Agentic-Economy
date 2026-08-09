---
milestone: protocol-kernel-product-conversion
status: completed-historical-mechanics
created: 2026-07-20
---

> **SUPERSESSION NOTICE — 2026-08-08.** These requirements preserve the completed
> BTC/USD paid-operation proof and its durable payment/evidence invariants. They
> are not the current product category, V1 contract family, wedge, or active
> implementation destination. Current authority is
> [`ADR-032`](adr/ADR-032-founder-category-and-ownership.md),
> [`PROJECT.md`](PROJECT.md), [`VISION-conceptual-map.md`](VISION-conceptual-map.md),
> and [`wayfinder/MAP.md`](wayfinder/MAP.md). The current V1 candidate is
> public-document structured extraction with field-level provenance; it needs a
> separate execution plan before implementation.

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
