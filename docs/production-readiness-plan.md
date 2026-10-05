# Production readiness

**Evidence reconciled:** 5 October 2026 · **Scope:** the supported Admin-only alpha

The [deployment map](operations/deployments.md) owns hosts and release provenance.
[TODOS.md](../TODOS.md) owns remaining actions. This record states what the
acceptance evidence proves and where that proof stops. It is not a live health
feed or permission to spend, invite users or activate services.

## Accepted foundation

| Boundary | Evidence | Limit |
| --- | --- | --- |
| Managed mainnet Call | 20 paid CLI purchases across five published Tools; original Quote/Call/attempt/Provider-obligation joins and exact native/chain reconciliation | Controlled Admin/promotional-credit exercise, not external Customer traction or paid chat proof |
| Replay and uncertainty | Same-key replay retains the original receipt; uncertain payment recovers from its original reference; unused expired authorization releases credit | No blind new purchase to recover a possibly submitted effect |
| Failure containment | Nine native Formance money scenarios cover paid/unpaid errors, invalid output, timeouts, drift, replay, insufficient credit and concurrent limits | Provider/custody/RPC faults in this matrix are controlled fixtures |
| Owner payment controls | Fresh MFA pause/refusal, preserved replay while paused, and audited resume to the original Admin audience | No audience expansion; current readiness still governs admission |
| Recovery and records | Scoped real RDS and Convex/storage restores; retained financial evidence with exact-version archive/readback; founder content review and useful-result feedback | No joint restore of the later 20 purchases; export is an operator procedure, not continuous automation |
| Discovery and clients | 5 October guest/signed-in search, detail and comparison; current and legacy MCP negotiation; downloadable CLI 0.2.1 | No new paid performance measurement or claim of public npm availability |

The full [execution journal](archive/2026-10-05/production-readiness-plan.md)
preserves contracts, exact revisions, failure drills and the progression from
initial diagnosis through acceptance. Later evidence supersedes an earlier open
item only where it proves that item; archiving the journal does not close it.

## Twenty real mainnet payments

The following is the retained acceptance snapshot. Amounts and balances are
historical observations, not current spend capacity.


The authenticated CLI completes 20 settled purchases across five published
Tools: OneSource block number (7), network information (6), chain ID (5),
live balance (1), and Coincap prices (1). There are 21 admitted Calls in total:
one earlier Coincap authorization expires unused and releases its reservation.
An Exa Quote refusal never admits a Call. The unused authorization and rejected
Quote are excluded from the 20 paid results.

Native, fully paginated readback at 14:23 UTC verifies every Quote/Call/attempt/
Provider-obligation join and all 20 original Formance settlements. The 21
signing reservations contain 20 settled records and one unused record, with
zero liability. Eleven Account-history pages contain exactly 20 promotional
uses, one promotional refund and the original promotional grant; transaction
references are unique. The reported first Call retains its original Provider
payment. Replaying the last Call with the same input and idempotency key returns
the original Call, chain transaction and accounting references without another
purchase.

| Reconciled fact | Amount |
| --- | ---: |
| Original promotional credit | AUD 5.000000 |
| Gross buyer Charges | AUD 0.033209 |
| Report refund | AUD 0.001444 |
| Net buyer use | AUD 0.031765 |
| Remaining promotional credit | AUD 4.968235 |
| Original treasury funding | USDC 9.905153 |
| Gross Provider payments | USDC 0.023000 |
| Remaining wallet balance | USDC 9.882153 |
| Protected buffer within wallet balance | USDC 0.500000 |
| Available treasury after buffer | USDC 9.382153 |
| Buyer and treasury holds | 0 |

Independent RPC verification completes at 14:27 UTC. Infura and Alchemy agree
on Base safe block `52167296`, hash
`0xa8a1842ab11757b4f325941b21316ae85eda5c2b8e2997ae818b6d2f2e34089e`,
and the exact wallet balance above. All 40 receipt checks (20 on each provider)
match successful status, USDC contract, payer, payee, amount and original
`AuthorizationUsed` nonce, with at least 12 confirmations. This safe-block
proof is distinguished from the treasury observer's older finalized checkpoint;
its audit must preserve the corresponding cash timing adjustment.

The final payment transaction is
`0xf0b6074812dd1a58b542000ba6eba46e1728f003140eeb21fd3cfc450823beb0`.
The retained operator evidence includes `stage68-native-reconciliation.json`,
`stage68-chain-reconciliation.json` and `stage68-call22-replay.json`, containing
the complete attributed identities and native results. Provider service inputs,
CLI credentials and RPC URL credentials are not published in this record.

The deployed automatic audit at 14:55 UTC independently passes with 20 Provider
settlements, 44 cash records and 21 reservations matched. Provider settlements
sum to USDC 0.023000; wallet and ledger cash both equal USDC 9.882153, with zero
cash difference, zero timing adjustment and no signing liability or held credit.
The finalized chain checkpoint is block `52167527`, hash
`0xac9d24c1debd4c0374481213529ec70aba0b970ff8d3f1a5ad67445dcde40f89`.
A separate RPC readiness probe initially refuses; one later ordinary refresh
at 14:57 UTC passes all required checks, with the approved screening deferral
still explicit. Retained evidence is `stage69-native-readiness.json`,
`stage69-readiness-retry.json`, `stage69-web-release.json` and the backend deploy
log. The later scheduled audit and readiness refresh also pass, confirmed by
`stage69-resume-native.json`. These are point-in-time observations; recurring
RPC availability remains a limit.

## Availability and decision limits

Historic completed Calls took approximately 71–132 seconds and used recovery.
The receipt-ordering race was repaired in PR #358, but no subsequent paid run
establishes a speedup. Tool duration estimates use the exact Tool identity, a
30-day window and at least five samples; the current CoinCap Tool has only one
recorded observation, so median and p95 remain unavailable.

Nine scheduled treasury checks on 5 October, 07:44:37–08:24:28 UTC, span the
20-minute evidence-expiry window and match 44 cash records, 20 settlements and
21 reservations with zero difference and no liability. Independent readiness
probes still intermittently refuse on unavailable RPC evidence. A failed source
or audit must withhold new paid admission; it must not fabricate disagreement,
relax quorum/freshness or erase readable native balances.

The observed production audience is Admin-only. `alpha_not_screened_v1` explicitly
defers payee screening. Funding, previous test limits and a completed purchase
do not authorize more users or spending. Read the active policy and remaining
scope before a consequential action.

## Remaining acceptance

- [#288](https://github.com/CreasyBear/Agentic-Economy/issues/288): Joel's go/no-go
  for alpha invitations. This documentation update does not open payments.
- [#279](https://github.com/CreasyBear/Agentic-Economy/issues/279): the separate real
  Base Sepolia paid development chat journey.
- Sustained source availability and measured paid latency after the receipt fix.
- Public CLI publication, hosted metering capacity, any historical backfill,
  automatic report scheduling and financial-evidence export operations.
- The full Australian principal-reseller record and the remaining adviser,
  processor and open-beta qualification in the [operating model](operating-model.md).
- Datadog's [proposed operational coverage](adr/0005-datadog-supported-operational-observability.md),
  including actual notification and recovery evidence, remains unactivated.

## Verification standard

Use Node 22 / npm 11.5.1. `npm run check` verifies source boundaries; the affected
behavior tests verify the changed guarantee; `npm run gate` verifies the frozen
release candidate. The gate includes clean types, unit/integration tests, SEO,
browser and accessibility checks, CLI packaging and the public build.

Record hosted outcomes against the actual web/backend source, environment and
policy. Distinguish source fixtures, native-ledger fixtures, production reads and
real financial effects. Skipped tests, incomplete coverage and inaccessible
artifacts are not successful acceptance. Never erase money history to roll back
an application release.
