# Decision: REJECT Formance for Package 4

## Verdict

`REJECT`

Formance Ledger v2.4.12 may preserve exact integers internally, but the pinned
official TypeScript SDK v7.0.0 does not preserve Package 4 amounts at its public
API boundary:

1. Default responses decode monetary values through JavaScript `number` and
   silently round required values.
2. Ledger's official bigint-as-string response mode is incompatible with the
   SDK's generated number-only response validators.

Adoption requires using the official SDK without custom HTTP, custom parsing,
`rawResponse`, interceptors, generated-code patches, or a fork. No permitted
path satisfies exactness, so Formance cannot be the Package 4 ledger authority.

## Risk horizon

This is not an immediate limit on an ordinary Package 4 purchase. AUD and USDC
use six-decimal integer units, so JavaScript's exact-integer ceiling corresponds
to `9,007,199,254.740991` whole currency units. The current funding maximum is
`25,000.000000` AUD, roughly 360,288 times below that boundary.

The first practical exposure is a hot shared account's cumulative input or
output volume. Formance returns those lifetime totals with account and
transaction evidence even when the current balance and the individual posting
remain small. A shared treasury, revenue, tax, or control account therefore
reaches the unsafe boundary at approximately A$9.007 billion of cumulative
flow. Illustrative transaction counts are:

| Average flow | Transactions to unsafe cumulative volume |
|---:|---:|
| A$1 | 9.007 billion |
| A$10 | 900.7 million |
| A$100 | 90.1 million |
| A$1,000 | 9.0 million |
| A$10,000 | 900,719 |

At A$100 million annual flow, that boundary is about 90 years away; at A$1
billion, about nine years; at A$10 billion, less than one year. Account layout
can move the date, but partitioning solely to avoid an SDK representation bug
would add product-ledger routing and cross-ledger reconciliation complexity.
It is not an approved substitute for exact SDK support.

The failure is still unsuitable for a monetary authority because default SDK
behavior silently rounds. Enabling the server's bigint-as-string mode does not
defer the problem: it makes the current SDK reject even small successful
responses because its generated validators require JSON numbers.

## Package 4 consequence

Resume the paused Convex ledger only after correcting the commercial model:

- the customer AUD leg records prepayment, sale revenue, and applicable GST;
- corporate USDC treasury is a separate asset and capacity control;
- Provider USDC cost and payable are separate from buyer AUD;
- one Call reference links the two economic legs without transferring buyer AUD
  directly into a Provider AUD obligation.

The existing exact-string/`bigint` boundary, durable command identity,
submission fence, and reconciliation rules remain authoritative. Do not retain
the Formance dependency, deployment, schema, or a dual-write path.

## Reconsideration condition

Reconsider Formance only when a maintained official SDK release:

- is published as an immutable installable artifact;
- supports Node 22 or the then-current Convex Node runtime;
- sends and receives every Ledger amount as an exact string or `bigint`;
- models the server's bigint-as-string option in generated request and response
  types; and
- passes this committed exactness matrix without patches or custom parsing.

As of 2026-09-02, Ledger pull request `#1663` is open and unmerged. It adds the
existing bigint-as-string header to Ledger's OpenAPI contract, which is the
necessary first step for generated clients. It is not sufficient evidence by
itself: a subsequent official TypeScript SDK release must regenerate exact
request and response models and pass the spike. Treat this as `REJECT today;
retest on vendor release`, not a permanent rejection of Formance.
