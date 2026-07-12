# Preparation authority inversion premortem

**Date:** 2026-07-12
**Decision:** No-go on the current single-call preparation mechanism. Protected values may move only through an allocation-bound release seam after concrete recipients are known.

## Question

How can a customer safely let AE share only the information needed to compare options—once or under a bounded standing permission—while AE proves before every provider call that the exact data, named recipient, purpose, expiry, and cumulative limit are authorized?

## Failure inversion

Assume this mechanism passed its tests and leaked customer data in production. The causes were:

1. A caller minted a plausible `PreparationGrant`; AE validated its fields but never verified its issuer, signer, delegation, revocation, or remaining use.
2. The opaque router received protected `resolvedInput` before it returned the concrete recipients. Post-call validation documented a disclosure that had already happened.
3. Broad recipient kinds such as `candidate_provider` became ambient permission for any matching business.
4. `maximumRecipients` was counted per quote. New preparation keys, revisions, plans, retries, and generations reset the apparent ceiling.
5. A crash after provider receipt but before persistence caused another release, or an optimistic refund silently restored capacity after an uncertain release.
6. One-use authority remained reusable until expiry; standing authority had no atomic consumption, revocation, or bounded operation semantics.
7. Authority expired or was revoked between discovery, allocation, and transmission.
8. A value-redacted ledger retained deterministic hashes of postcodes, emails, or phone numbers and became a brute-forceable privacy oracle.

## Architecture invariant

```text
resolve Request, Plan and registered contract
  -> discover eligible concrete recipient bindings without protected values
  -> independently verify principal or delegated preparation authority
  -> atomically allocate exact recipient + field + purpose tuples
  -> recheck allocation immediately before release
  -> transmit only the allocated values
  -> collect provider quotes
```

Post-call validation is never disclosure prevention. Provider adapters never accept a raw caller grant or unrestricted `resolvedInput`. Ticket 129 must consume this allocation contract rather than create a parallel authority path.

## Customer contract

Before sharing, human and agent surfaces state in plain language:

- understandable data categories;
- why they are needed;
- the maximum businesses that may receive them;
- when permission expires;
- whether permission is one-time or standing.

After preparation, they show the actual named businesses contacted, categories and purpose, time, and `released`, `not_released`, or `uncertain` status. Grant IDs, signatures, hashes, revisions, binding IDs, leases, and routing objects remain inspection-only.

## Required proof

1. A command carries only an authority reference. A trusted verifier resolves it to an immutable, independently verified snapshot. Signed caller identity proves attribution, never authorization.
2. Wrong evidence, signer, principal, delegation, Request/revision, Plan/action, contract/version, resolved-input commitment, field, concrete recipient, purpose, expiry, revocation version, or use fails before provider invocation.
3. Candidate discovery receives no protected values. Provider release accepts only a valid allocation-bound projection.
4. Single-use permission atomically binds to one operation identity; exact replay is allowed and every different operation is refused.
5. Standing permission has explicit scope, cumulative recipient/exposure/operation ceilings, expiry, revocation, and inspectable status.
6. Allocation and authority consumption are one durable transaction. Concurrent attempts for the last unit of capacity produce exactly one winner.
7. Exact retry returns the existing allocation without incrementing counters. Changed parameters under the same idempotency key conflict.
8. Recipient and exposure ceilings span preparation generations, plans, actions, keys, retries, and lease takeovers. Replanning cannot reset them.
9. Expiry and revocation are checked inside allocation and again immediately before serialization or transmission.
10. Crash or timeout after a possible release remains consumed and `uncertain`; capacity is never silently refunded.
11. The durable ledger records authority snapshot identity, field category, concrete recipient, purpose, operation identity, timestamps, and disposition—but no values, credentials, or deterministic low-entropy value hashes.
12. Typed refusals distinguish invalid evidence, identity/delegation mismatch, stale scope, denied field/recipient/purpose, expiry, revocation, consumed use, exhausted capacity, and allocation conflict, with a customer-semantic next action.
13. Convex integration proves indexed bounded reads, transactional concurrency, crash/retry replay, cross-generation ceilings, and value-redacted persistence. An in-memory test alone is insufficient.
14. A provider spy proves zero calls for every invalid, mismatched, expired, revoked, exhausted, or conflicting case.

## Product and support proof

- A customer can say: “Compare prices by sharing parcel dimensions and pickup and delivery area with up to three connected couriers until 4pm.” They never construct authority protocol.
- Declining explains what comparison cannot proceed; it creates no disclosure.
- Refusal copy says what permission is missing or exhausted and the next safe action.
- Support can determine who was eligible, who actually received which category for what purpose, whether release is certain, and whether further release remains possible without seeing the values.
- A one-time permission disappears after the bounded comparison. A standing permission is inspectable and revocable; revocation stops new releases but never claims previously shared data vanished.

## Primary-source convergence

- OAuth Rich Authorization Requests models fine-grained rights using typed actions, locations, and data types; unknown or malformed authorization details must be rejected, and tamper-sensitive details require integrity protection: [RFC 9396](https://www.rfc-editor.org/rfc/rfc9396.html).
- OAuth security guidance requires least privilege, audience restriction, and sender-constrained authority to reduce replay and token leakage: [RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html).
- GDPR purpose limitation and data minimisation require explicit purposes and data limited to what is necessary for them: [GDPR Article 5](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32016R0679).
- Stripe binds retries to an idempotency key and rejects reuse with changed parameters: [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests).

These are design constraints, not a decision to expose OAuth or payment protocol to customers.

## Go / no-go

**Go:** introduce a verified-authority port, durable allocation store, and allocation-bound release port; make the smallest router split that proves no protected value crosses before allocation.

**No-go:** preserve one opaque `route()` call, accept `PreparationGrant` as command authority, enforce recipients after the quote, count only one generation, or close on unit/in-memory proof.
