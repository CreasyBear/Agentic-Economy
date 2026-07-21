---
phase: 04
name: market-activation
status: proposed_ready_for_founder_review
decision_owner: Founder
planned: 2026-07-21
depends_on:
  - Phase 3C integrated exact-revision source closure
governing_decisions:
  - PRODUCT.md
  - DESIGN.md
  - ADR-009
  - ADR-010
  - ADR-019
  - ADR-020
  - ADR-021
  - proposed ADR-022
  - proposed ADR-023
---

# Phase 4 — Market activation context

## Executive decision

Phase 4 turns AE from a hosted operation exemplar into a founder-operable
commercial loop:

```text
make one business routeable
  → obtain three attributable quotes for one clear customer need
  → compare what actually came back
  → authorize one exact offer
  → start it once and preserve progress or uncertainty
```

The founder must be able to sit beside a business or prospective customer and
use the product. Engineering completion does not require real providers or
customers to join. Labelled fixtures, mock endpoints and hosted-sandbox
readback are valid implementation evidence. Provider adoption, demand,
fulfilment and customer value remain later operating evidence.

## Recognizable reference outcome

The reference vertical is one digital-service procurement outcome:

> Get up to three viable offers for a defined small-business digital project,
> compare them against the customer's stated priorities, and start the chosen
> provider under the exact accepted terms.

The exact fixture may describe a five-page small-business website because it is
easy to understand and validate. Shared source and UI must not contain
website-, quote-count-, or provider-specific branches. “Three” is policy for
this Customer Request, not a kernel cardinality.

## Phase outcomes

### Phase 4A — Routeable supply onboarding

A founder or authenticated business owner can take one business from public
facts to one admitted, bound, readiness-checked and publishable operation. The
surface states exactly why the operation is draft, blocked, ready, published,
stale or paused.

### Phase 4B — Three viable quotes

A customer can state one bounded need, disclose only the material requirements,
contact up to three qualified suppliers and compare attributable current
offers. Partial, refused, expired, invalid and uncertain responses remain
visible. No selection, authorization or work start occurs in 4B.

### Phase 4C — Close one and see it through

A customer can select one current offer, review its exact consequence, grant
authority, start the provider operation once and resume from durable Activity.
Possible external release remains reconcile-only. Provider acknowledgement,
payment, fulfilment and outcome truth remain separate.

## Locked product direction

- Business identity and public listing remain owned by `business` and
  `catalog`.
- Executable supply remains owned by the existing capability contract,
  offering, binding, publication, eligibility and readiness graph.
- Customer Request owns the broader objective, requirements, sourcing coverage,
  comparison, selection history and composition.
- Every supplier contact and close operation is a Registered Action with an
  attributable Action Invocation or Request-owned action attempt.
- Operation-owned results remain authoritative. Customer Request and Activity
  store references and continuity projections, not competing business truth.
- `/` remains Ask. `/registry` remains business/supply discovery. Protected
  `/owner/capabilities` activates supply. `/activity` resumes customer work.
- Human and structured-agent surfaces consume the same source-created semantic
  objects. Components do not parse provider payloads.
- The existing paid-operation card stays paid-operation-specific. A non-paid
  close operation links to or wraps its own action detail; it does not import
  payment panels as a universal lifecycle.

## Explicit non-goals

Phase 4 does not require or claim:

- real customer acquisition or provider conversion;
- real credentials, payments, settlement or fulfilment;
- marketplace liquidity, ranking quality or willingness to pay;
- automatic provider fallback or auction mechanics;
- a universal quote, booking, order, activity or action aggregate;
- model-generated executable UI;
- a second registry, authority system or provider control plane;
- production safety or unattended Full autonomy.

## Source snapshot and rebase rule

Planning was grounded against the shared tree at `2debf4b9` and the read-only
Phase 3C snapshot `491a7ed547f86dc6f1285cb0bbbf09f2400b9688`
(`641163590419d18c5a8d0ca61e005626ff59f6c9`). Phase 3C was still integrating.

The Phase 4 parent must re-run the source map against the final Phase 3C
revision before dispatch. This is a rebase check, not a product-design gate. It
may correct filenames and interfaces; it may not reopen the accepted Phase 4
outcome without a source contradiction.

After that check, the parent updates `.planning/ROADMAP.md` and
`.planning/STATE.md` in one exact-path documentation commit: record the true
Phase 3C result/revision, add the 4A → 4B → 4C graph, and make 4A the next
transition only after the founder accepts ADR-022/023. Until then, this package
is the complete proposed plan and does not falsely mark implementation active.

## Program end condition

Phase 4 closes when the founder can demonstrate, through exact-revision
labelled hosted-sandbox surfaces, the whole reference loop from supply setup to
one safely started or honestly uncertain piece of work. Every displayed fact
must survive reload and be traceable to its source owner. No unresolved P0/P1
may remain inside that declared surface.

That proves the product is ready for founder-led onboarding and trials. It does
not prove that the market works.
