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
- [ ] **P3A-R10 Experience quality:** Astryx neutral, keyboard, visible focus,
  44px targets, non-colour states, bounded announcements, responsive reflow,
  zoom and reduced motion pass focused checks.
- [ ] **P3A-R11 Product-proof closeout:** focused source, fixture, parity,
  browser, accessibility and independent review has no unresolved P0/P1.

R1–R9 are source- and labelled-local-fixture complete at revision `a7307c33`.
R10–R11 remain open for a mounted browser evaluation of 320px/400% reflow,
computed focus, reduced-motion media behavior, bounded announcements and
axe/screen-reader behavior. This is an evidence gap, not permission to widen
the product or deployment claim.

## Non-requirements

No real credentials or payment, independent settlement, public endpoint,
Convex persistence, hosted/provider/customer-value proof, multi-provider
selection, automatic fallback, caching/resale, workflow builder, booking,
standing mandate, Full autonomy or production exposure.
