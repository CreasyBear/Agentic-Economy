# Buyer capacity under contention

AM-20 requires current funding, Agent allowance, legal exposure and treasury
capacity to bound every accepted purchase. A Quote does not reserve capacity.
Concurrent accepted commands must therefore compete at the existing atomic
ledger reservation boundary. A refusal must leave no partial reservation or
paid effect, and remain usable through the supported retry when capacity returns.

## Treasury proof — 14 September 2026

The existing `tests/integration/capability-call-workpool.test.ts` now issues two
Quotes while treasury capacity is sufficient for one Call, then submits both
distinct commands concurrently through registered Convex actions. It uses the
real local Formance ledger and Workpool; only external Provider, CDP, RPC and
exchange-rate responses are fixtures.

One Call is admitted. The refused command and its repeated attempt leave exactly
one AUD1.20 buyer hold, one AUD1.20 Agent allowance/exposure reservation and one
USDC1 treasury commitment. Cancelling the admitted Call returns the capacity;
the previously refused command can then proceed. After cancelling that Call and
unpausing/draining the worker queue, all four capacities return to their starting
values, with zero payment signatures or paid Provider requests.

## Observed failure and repair

The initial fixture's default one-Call concurrency limit masked treasury
contention. Independent review required the exact rejection reason. With the
policy permitting two Calls, the real ledger returns `INSUFFICIENT_FUND` for the
treasury account after a staged successful element, followed by a cancellation
error. AE accepted only all-success or all-error response arrays and incorrectly
marked this rolled-back Call as requiring reconciliation. An abbreviated
all-error response had the same classification gap.

Formance's [version-matched atomic implementation](https://github.com/formancehq/ledger/blob/v2.4.12/internal/api/bulking/bulker.go#L108-L128)
rolls back on failure; its [integration test](https://github.com/formancehq/ledger/blob/v2.4.12/test/e2e/api_bulk_test.go#L378-L389)
verifies no transactions commit. The existing adapter now recognizes explicit rejection in a mixed or abbreviated
response and uses its existing reference readback to prove all commands absent
before returning a definite refusal. Partial, unavailable, conflicting or
SDK-invalid evidence retains uncertainty. The official SDK owns response
validation; no duplicate protocol parser was added. Do not
introduce compensation logic, balance projections or another scheduler.

The strengthened registered-action/real-ledger case is the regression test.
It observes the native response without replacing requests or results, checks
all four capacity balances through retry/cancellation, and drains the worker
queue before asserting zero signatures and paid Provider requests. Adapter
unit tests cover negative readback cases. All 42 focused checks passed: six
real-ledger/Workpool/installed-client integration cases, 31 adapter cases and five
existing native-ledger boundary cases, including 100 competing reservations.
Run with `AE_FORMANCE_INTEGRATION=true`,
`AE_FORMANCE_GATEWAY_URL=http://127.0.0.1:3069`, and `AE_TEST_INSTALLED_CLI`
pointing to the release owner's prepared installed CLI, then
`npm test -- tests/integration/capability-call-workpool.test.ts --no-file-parallelism`.

## Credential replacement

Credential/access-grant generation and spending-policy generation identify
different things. Replacement previously advanced both, and the grant writer
required them to match. The funded regression reproduced a fresh Quote for a
successor after the predecessor had reserved the Agent's entire AUD1.20 allowance.

Replacement now loads the authoritative predecessor grant and preserves its
complete normalized policy, including budget/rate generations and limits. It
rejects caller policy, authority-mode or scope drift before creating successor
records. The existing grant writer permits independent
positive policy generations while retaining its normalization, digest, identity,
expiry, replay and stale-grant controls. Credential and access-grant generations
advance from their own predecessors; they need not match each other. Replacement
audit events record the access-grant generation. Planned and compromised-predecessor
paths remain supported. The canonical current grant generation selects the
predecessor before the query's result bound; historical revoked grants cannot
prevent compromise recovery.

The registered, real-ledger test proves that a prepared successor cannot Quote;
after promotion the old credential is refused and the successor receives
`budget_exceeded` while the original reservation consumes the allowance. The
successor can cancel the original Call by its retained reference. Once that
refund restores capacity, its next purchase uses the same principal and budget
generation. Final cancellation and queue drain restore exactly AUD10 of buyer
credit and AUD1.20 of allowance, with no payment signature or paid Provider request.

The focused replacement tests additionally cover caller policy, authority-mode
and scope drift with no successor records; compromise with historical revoked
grants; independent credential/grant generations; promotion replay; and
pre-promotion admission. All 31 checks passed across the
seven-case Workpool integration, the three replacement regressions,
`convex/agentAccessPrincipals.test.ts` and `convex/agentAccessPolicy.test.ts`.
Cold source review found the authority drift, independent-version and revoked-history
cases; all were repaired and the final source remedy cleared review. Focused lint
and diff checks passed. Hosted credential-provider behavior remains
unverified by these source tests.

## Funding refusal and continuation

Two valid Quotes may outlive the funds available when they were issued. The
registered-action/real-ledger test gives the buyer AUD1.20 and issues two Quotes.
The first Call reserves that credit. The second is refused, leaves only the
first Call in storage, and admits no paid effect. This reproduced a missing
`nextAction` on the definite financial refusal. The existing abandonment boundary
now directs the buyer to request a fresh Quote for current funding/allowance
guidance, with AE support as the fallback. Unknown reservation outcomes continue
through existing reconciliation and do not receive this refusal instruction.

The fresh Quote returns `insufficient_balance` with a deterministic
`funding.handoff.create` continuation. The fixture uses the existing funding
calculator and ledger settlement workflow to credit that amount once, proves
funding replay does not credit twice, obtains a new Quote, and completes admission
of the second Call. Cancelling both Calls and draining Workpool returns the
original credit plus the top-up, with no signature or paid Provider request.
Stripe Checkout and its webhook verification remain outside this fixture.

The Quote projector also previously told buyers to change an internal deployment
profile or invoke an internal commercial-policy admin function. `14112aa8c`
reuses the existing support action while preserving the diagnostic reason and
30-second Quote recheck. Its 27 continuation tests pass. The funded regression,
existing Quote tests and reservation tests pass together: 43 tests across three
files. Cold review of both repairs found no remaining defect; focused lint and
diff checks passed.

## Remaining source acceptance

| Obligation | Evidence and next required proof |
| --- | --- |
| Funds change after Quote; definite refusal has safe continuation | Real ledger/registered actions prove refusal, fresh funding guidance, once-only top-up and subsequent admission. Hosted funding handoff is separate. |
| Treasury contention; no partial capacity or paid effect | Real ledger concurrent Calls, reference readback, retry and cancellation proof above. |
| Credential replacement preserves shared capacity and authority | Registered replacement plus funded allowance proof above. |
| Per-Call allowance and period/account refusal reasons | `capability-quotes.test.ts` covers per-Call refusal; rotation covers exhaustion of the existing Agent allowance. Add explicit legal-account exposure and changed-policy-after-Quote acceptance before whole-row closure. |
| Advertised daily and monthly limits | Buyer Quote preparation currently loads `maximumMonthlySpend` into a generation-based allowance (`convex/capabilityQuotes.ts`, `prepareFinancialSubjectsHandler`). The exposed policy includes a separate daily limit. A distinct daily limit and calendar-period rollover are not established by the current evidence; reproduce and design their enforcement before claiming policy acceptance. |
| Concurrency and rate policy | Existing reservation tests cover no insertion on rate refusal and pending/uncertain Call counting for concurrency. Native limiter is mocked there; broader runtime limits remain unproven by that test alone. |

AM-20 remains source-partial. These proofs do not establish hosted acceptance or
close AM-06's full access/history obligations. Preserve that distinction in the
release register.
