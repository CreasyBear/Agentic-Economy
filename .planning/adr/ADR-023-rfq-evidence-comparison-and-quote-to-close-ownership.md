# ADR-023 — RFQ evidence, comparison and quote-to-close ownership

**Status:** proposed
**Date:** 2026-07-21
**Decision owner:** Founder
**Phase:** 4B–4C

## Decision

Customer Request owns a broader quote-sourcing objective: its requirements,
candidate coverage, comparison, selection history and composed continuation.
It does not own provider business facts or create a parallel execution ledger.

Each request for quote is a Registered Action against one qualified published
operation. Its normalized, attributable result is persisted by the reference
operation owner. Existing structured-quote records persist solicitation
attempts and reference the operation result while projecting comparable offer
evidence. Customer Request refers to those records and projects comparable
fields.

A quote is evidence, not a transaction. Selecting a quote is not authority.
Authorizing it is not execution. Starting work requires a distinct registered
close operation bound to the exact Request revision, offer digest, supplier
binding, terms, expiry, principal, disclosure and limits.

The exact selection is a versioned Customer Request transition bound to the
Request revision, route generation and operation-owned quote-result reference.
The close operation's business result remains operation-owned. Shared Action
Invocation or Request execution records own authority, attempts, current effect
generation, uncertainty and safe continuation. Activity is a removable
continuity projection over those source records, not a new aggregate.

## Comparison rules

- “Three” is the sourcing target for the reference Request, not a shared-schema
  requirement.
- Coverage names contacted, responded, unavailable, refused, pending and
  uncertain suppliers separately.
- Offers are comparable only when the registered operation supplies the same
  declared output shape, currency, requirement revision and evidence basis.
- Missing values remain `Not supplied`; expired or invalid evidence cannot be
  selected.
- Ranking requires a declared customer priority and known commercial influence.
- Supplier assertions remain attributed assertions until independently
  verified by the relevant standard.

## Recovery rules

Every provider solicitation and close attempt has independent release truth.
Possible external release forbids retry and automatic fallback until exact
reconciliation establishes a safe continuation. Changing supplier or material
terms creates a new selection, authority and invocation boundary.

Provider acknowledgement does not prove payment, fulfilment or the customer's
outcome. Cancellation does not prove reversal.

## Rejected alternatives

- Promoting the development `supplied-quote` fixture into a production module.
- Creating new generic quote, order, booking or activity tables.
- Parsing provider response paths in Customer Request or UI code.
- Treating eligible supply as a received quote.
- Copying Phase 3C hosted paid-operation tables or card into all operations.
- Retrying an uncertain supplier simply to reach three results.

## Acceptance

ADR-023 may become accepted only when cold restoration creates no duplicate
supplier contact or close effect; comparison rejects materially unlike offers;
selection/authority/attempt identities remain exact; Activity can be rebuilt
from source records; and the human and structured-agent paths expose the same
coverage, consequence, uncertainty and safe continuation.

Evidence remains labelled fixture/local/hosted-sandbox mechanics. No market,
fulfilment, settlement or customer-value claim follows.
