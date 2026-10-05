# Treasury operator contract

**Status:** maintained design contract · **Consolidated:** 5 October 2026

The treasury is AE's corporate USDC working capital. Customer AUD credit,
corporate cash, Provider obligation and settlement are separate facts. The
[original design and review](../archive/2026-10-05/designs/2026-09-30-admin-treasury.md)
retain starting gaps and dated acceptance. Source/configuration own actual
cadence and thresholds; [readiness](../production-readiness-plan.md) owns runtime evidence.

## The page: `/admin/treasury`

One screen, five blocks, in this order.

1. **Float.**
   - On-chain USDC on Base, with the observation age.
   - Ledger capacity available and committed.
   - **Cash comparison** = finalized on-chain balance − (available + Call commitments + protected buffer), adjusted only by attributable transfers between the measurement times. Show a matched result only when history is complete; unavailable evidence cannot appear green. Cash tolerance is USDC 0.01.
2. **Runway.**
   - USDC settled in the last 24 hours and 7 days.
   - Runway in days = available USDC ÷ seven-day average daily gross Provider payments. Call commitments and the protected buffer are excluded; returned funds do not rewrite gross payments.
   - The low-water mark and target float, both editable.
3. **Coverage.**
   - Purchased and promotional AUD credit, including reserved credit, converted to USDC at the recorded reference rate, against available USDC. Show purchased and promotional totals separately.
   - The coverage ratio shows how much of what customers could spend right now the float can pay for. This is where the working-capital gap shows.
4. **In flight.**
   - Committed USDC across open Calls.
   - The reconciliation queue: count, value and oldest age, linked to each Call.
   - Settled payments over the rolling 24-hour window plus unresolved signing liability, against the current custody daily maximum.
5. **Actions.**
   - **Refill:** shows the production deposit address, network (Base, `eip155:8453`) and asset (USDC contract), with a copy button. A QR code remains pending approval of a maintained QR dependency; do not handroll an encoder. There is no outbound transfer from the app. Money only leaves through seller payments within policy caps, which keeps the blast radius small.
   - **Pause payments:** the kill switch. New Quotes refuse with a plain message, while in-flight Calls finish or reconcile. It needs fresh MFA and is audited. Pause takes one owner; resume uses two-owner approval when two owners exist, restores the saved audience, and requires fresh reconciliation and current capacity.
   - **Set low-water mark / target float:** fresh MFA, audited.

## Mechanics
- **Deposits book from transfer evidence.** The original positive balance-minus-ledger proposal was rejected: measurement timing can misidentify settlement as a deposit. Finalized incoming USDC Transfers are booked once by network/transaction/log identity. A durable pending range survives interrupted native posting; its cursor advances only after exact native readback. A clean custody generation establishes one opening checkpoint, allocating the configured protected buffer before funds become spendable. Populated ledgers, wallet rotation and changed buffer targets require cutover evidence. Unexplained decreases raise attention; they never create a compensating credit.
- **Reconciler** (every 15 minutes, as L4 in the measurement doc) checks four things:
  - Finalized chain balance matches available + Call commitments + protected buffer after independently attributed timing adjustments, within USDC 0.01.
  - Settled USDC equals the verified on-chain transfers.
  - Stripe payment/refund identity and status match every native principal, fee and tax posting. Pending, partial or unrecorded refunds remain explicit attention.
  - Native Call commitments match durable Calls and signing reservations. Reservations unresolved for 30 minutes remain attention.
- **Quote freshness.** The treasury observation used by a Quote must be younger than 10 minutes, otherwise `treasury_capacity_unavailable`.
- **Separate production custody.** A dedicated CDP account and address for production, never shared with sandbox.
- **Alerts:**
  - Float below the low-water mark.
  - Observation stale.
  - Drift red.
  - Reconciliation older than the time bound.
  - Daily max at 80%.

## Evidence and remaining limits

Later implementation adds bounded, stable native/chain history reads, durable
publication and monotonic snapshots. Incomplete, stale, conflicting or changing
source evidence cannot yield a matched result. Keep independent native balances
readable when external evidence is unavailable. Replayed deposit recognition
cannot create new money.

Production reconciliation and pause/replay/resume have scoped acceptance in the
readiness record. That evidence does not establish continuous RPC availability,
a new screening service, new dependencies or automatic treasury acquisition.
