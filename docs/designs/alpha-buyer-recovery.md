# Resume interrupted buyer purchases

## Buyer contract

After a paid Call acknowledgement is lost, a fresh installed CLI process resumes
the retained purchase identity through the registered routes. Before execution,
the buyer may cancel with a distinct cancellation command identity; cancellation
excludes claim atomically and its hold returns once. After possible submission,
status and cancellation preserve uncertainty and the hold without another paid
Provider request, signature or purchase. Resume never silently purchases again.

## Existing boundary

Use the existing paid Convex/Workpool/Formance integration and installed CLI
helper. Replace only external Provider/CDP/RPC/rate responses and deliberately
lose the HTTP acknowledgement after the real Call route accepts the purchase.
The registered HTTP, source, worker and ledger paths remain real.

The first red case resumes successfully, then cancellation reports not-found
because its command idempotency key is compared with the purchase key. These are
separate commands. Check the exact Call, principal and credential for cancellation;
retain the full purchase key check for worker refusal. Current authority remains
required at the registered cancellation entry point.

Reuse the existing atomic pre-claim exclusion and refund-only cleanup for both
refused and cancelled unstarted Calls. Preserve their distinct terminal states.
Rename the internal refund helper/proof/selector flag to describe pre-claim
refunds, and require absence of every canonical control/attempt before cleanup.
Schedule within the cancelling mutation. Existing reconciliation disposition,
lease/backoff/manual review and Formance idempotency govern interruptions. Native
compound-index selection covers both terminal states without scanning historical
manual-review rows. Claimed/possibly-released recovery is not widened.

## Verification and ownership

- Bounded worker: dispatch transition, capabilityCalls registration, reconciliation selection.
- Parent: refund action/caller names, cancelled-call response cleanup, existing integration and focused tests.
- Release task: prepared installed CLI, combined checks and hosted acceptance.

## Source evidence — 14 September 2026

All five cases in `tests/integration/capability-call-workpool.test.ts` pass with
real local Formance and the release owner's offline-installed CLI. Fresh CLI
processes retain one Call and its original reservation after acknowledgement
loss. A distinct cancellation key succeeds before claim and returns the balance
from AUD8.80 to AUD10, with no paid Provider request or signature. After possible
submission, cancellation and unverified reconciliation evidence preserve the
AUD8.80 balance and uncertainty. Repeated resume retains the Call; a fresh
purchase attempt is refused. Exactly one signature and paid Provider request
occur in that scenario. Existing paid delivery, refusal/refund interruption,
replay and free-Call cases remain passing.

This proof also exposed two client contract gaps: recovery used a duplicate,
narrower evidence parser, and a terminal response omitted its retained Call
reference. Recovery now uses the canonical generic/x402 input union, checks the
evidence's Call identity, and preserves the known Call reference in CLI output.
The release owner verified all 25 CLI recovery cases and rebuilt the tested
installed artifact. Seven focused backend suites passed 193 tests; the three
suites affected by the final cancellation guard passed 119 tests on rerun.
These overlapping counts are separate verification runs.

Run the integration proof with `AE_FORMANCE_INTEGRATION=true`,
`AE_FORMANCE_GATEWAY_URL=http://127.0.0.1:3069` and `AE_TEST_INSTALLED_CLI`
pointing to the prepared installed binary. Run
`npm test -- tests/integration/capability-call-workpool.test.ts --no-file-parallelism`.

No hosted acceptance or alpha-complete claim follows from these source tests.
Trusted later settlement/remedy and broader client parity require their own
registered evidence. AM-20 capacity, treasury and concurrent-credential
obligations remain open; returning an unstarted hold does not prove them.
