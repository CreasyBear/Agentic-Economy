# S5 preflight gates

**Status:** required before Scope 5 implementation or demo closeout beyond governance/source-local private seams.

## S5-G1 demo anti-theatre tabletop

Before a demo artifact exists, map each step to AE source rows and user/business value:

| Demo step | AE-owned source rows | Value proved | What it does not prove |
|---|---|---|---|
| Request/proposal | Capability request / proposal input refs | Demand can be scoped for owner review | Autonomous execution. |
| Owner checkpoint | Authorization checkpoint / guardrail decision | Human approval is explicit | Payment, dispatch, or fulfillment. |
| External evidence | Bound external evidence event refs/hashes | Evidence can attach after checkpoint | Provider authority or live money. |
| Result artifact | Result artifact hash/ref | Outcome can be reconstructed | Production service delivery. |
| Receipt/status | Public receipt readback | Hash-only status can be checked | Full private evidence disclosure. |

## S5-G2 hackathon vs product wedge mapping

Each demo README/deck must state:

- buyer/operator/business roles;
- repeated real behavior represented;
- AE product horizon proved;
- claims explicitly not proved: live payment, production availability, marketplace liquidity, autonomous fulfillment, provider quality, broad action catalog.

## S5-G4 verifier privacy/enumeration

Required tests/fixtures:

- no list/search endpoint for receipts;
- unknown/guessed refs fail safely;
- rate-limit by IP/principal where available;
- output equals `PublicActionReceiptReadback` exactly;
- raw prompts, traces, provider payloads, Stripe payloads, customer ids, endpoint refs, keys, and webhook secrets absent;
- human copy excludes public `KNOWN`/`UNKNOWN`/`UNAVAILABLE`/`NEXT_STEP` ledger labels and protocol vocabulary.

## S5-G5 Stripe/test-mode/live-money matrix

Every artifact mentioning Stripe, pay, paid, checkout, charge, payment, refund, dispute, reconciliation, or receipt must include a row:

| Claim | Proof level | Provider mode | Evidence pointer | Public wording allowed | Missing gate |
|---|---|---|---|---|---|

Allowed current wording is source/local/test-mode only. Live or production money requires a future accepted money decision record, deployed test-mode predecessor smokes, refund/dispute/reconciliation proof, support/kill rows, and copy scans.
