# PM-05 promise fixture

**Status:** reviewer fixture, not shipped copy.  
**Reviewed by:** no uninvolved reviewer evidence recorded yet.  
**Proof level:** planning/source-local language gate only.

This fixture is the single promise reviewers should read when answering the PM-05 questions. It does not authorize public/demo copy, assistant-visible descriptor changes, new actions, deployed proof, or live-money claims.

## Public human promise

Agentic Economy helps people and assistants find business-supplied pages that are safe to compare.

A listing can show:

- what the business has supplied or published;
- what AE has checked and when it was last checked;
- which details still need confirmation;
- what the person can do next.

Where a listing supports it, AE can send a qualified first-contact inquiry to the business for owner review. The business decides how to respond.

AE does not book work, take payment, dispatch a provider, promise availability, rank businesses by reviews, or complete a job for the customer.

## Assistant-visible promise

An assistant may use AE to read, compare, summarize, and route a person to the next safe step.

The assistant tool list is exactly:

- `registry.search` — read-only search across published business listings.
- `registry.detail` — read-only detail lookup for one published business listing.
- `inquiry.submit` — sends a qualified inquiry for owner review when the listing supports it.

Only `inquiry.submit` writes. It creates a first-contact message; it does not book, charge, dispatch, reserve, accept a quote, or complete a transaction.

If a person asks for booking, payment, dispatch, or autonomous fulfillment, the assistant must state AE's boundary and return the person to the listed next step.

## Demo and future-scope wording

Source/local or test-mode demos may describe receipt records, owner-reviewed proposals, status pages, and test-mode payment evidence only when the same sentence says the proof level.

Allowed demo phrasing examples:

- "source/local receipt record demo; no production proof claimed"
- "test-mode payment evidence; no live payment"
- "owner-reviewed proposal request; not a booking or payment"
- "status page for a recorded receipt; private payloads remain unavailable"

This fixture does not permit public claims about live availability, deployed provider proof, production payment, marketplace liquidity, autonomous fulfillment, or a business replying through AE unless a named evidence row exists.
