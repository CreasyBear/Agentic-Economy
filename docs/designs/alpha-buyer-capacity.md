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

## Remaining boundary

This treasury test uses one credential. A separate registered issuance/replacement
regression confirms that current replacement advances budget/rate generations
with credential generation; the successor is correctly unavailable until
promotion, but its fresh budget generation can reset allowance. That repair and
actual shared-capacity proof remain separate. AM-20 also requires attributable
funding/policy refusal and continuation coverage. Test actual rotation behavior;
do not assign equal budget generations in a fixture and treat that assumption as
proof. Hosted acceptance remains separate.
