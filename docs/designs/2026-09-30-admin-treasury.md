# Admin Treasury: managing the USDC float (30 September 2026)

## Operating model (decided)
- Users hold **AUD credit** for services, bought by card through Stripe. They never own or hold crypto, and aecon does not custody crypto for users.
- aecon holds its **own USDC float** in a CDP wallet on Base and pays every seller from it. aecon is merchant of record: it buys the service and resells it for AUD.
- So the float is aecon's working capital, and the admin must be able to see it, trust it, refill it and stop spending from it.

## Starting evidence (30 September 2026; superseded by implementation below)
- **Treasury observation:**
  - The cron `observe x402 treasury` reads the CDP wallet's USDC balance on Base and Base Sepolia (`convex/moneyTreasuryObservation.ts:31-40,108-154`).
  - It stores environment, network, available units and observation time.
  - Quotes refuse with `treasury_capacity_unavailable` when the latest observation is missing or too low (`issueQuote.ts:199-203`).
- **Ledger capacity:**
  - Formance accounts `treasury:corporate:{t}:available`, which a Call reserve moves to `committed`.
  - Settlement moves `committed` to `providers:{p}:settlement` (`formance-schema.ts:367-477`).
  - USDC is booked as `USDC/6`.
- **Custody caps:** `AE_X402_CUSTODY_MAX_ATOMIC` (per Call) and `AE_X402_CUSTODY_DAILY_MAX_ATOMIC`, enforced by the CDP policy (`x402-custody-configuration.ts:11-83`, `cdp-x402-payment-policy.ts:70-110`).
- **Customer liability:** the sum of `accounts:{a}:available` (AUD).
- **Admin shell:**
  - `/admin` shows a read-only config banner (Formance, custody, FVA, Convex).
  - Admin commands require a second-factor proof no older than 10 minutes.
  - The proposal machinery supports two-person approval.

Gaps found in the blind-spots review: nothing books on-chain deposits into ledger capacity, nothing reconciles ledger against chain, observations have no age check at Quote, and one address serves test and real money.

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

## Build order
1. Production CDP account separated from sandbox; Quote freshness check.
2. Deposit booking from observations plus the reconciler (money-invariant checks and drift).
3. The `/admin/treasury` page, read-only: Float, Runway, Coverage, In flight.
4. Actions: refill details, pause payments (the launch-gate `paymentsOpenTo` gains `none`), and the low-water and target settings.
5. Alerts wired to the thresholds.

## Implementation evidence and remaining acceptance (1 October 2026)

The reconciler publishes sealed snapshots every 15 minutes, retaining independent metrics when a source is unavailable. Source histories are bounded and reread to detect concurrent changes. Native reads have a 30-second elapsed budget and five-second request bounds; read saturation cannot yield a partial matched result. Snapshot publication is monotonic and idempotent, with durable alert episodes. New episodes and severity escalation use the existing structured observability path with a stable alert identity.

The operator screen consumes the real query and command boundaries, groups Float, Runway, Coverage, In flight and Actions, distinguishes latest CDP observation from finalized chain/native evidence, and retains input and command identity across unknown outcomes. Defaults are three days for low water and 14 days for target, with a fixed USDC alternate. Pause remains immediate; resume requires all four checks matched, an observation younger than 10 minutes, a report/finalized block younger than 20 minutes and current spend capacity.

The native controller integration proves actual opening/buffer/funding/reservation/settlement posting, the four matched comparisons, orphan cash detection, five durable publications and retained critical alerts across native outage. Stripe and RPC are external fixtures; this is local native-ledger proof, not deployed financial acceptance. The current broader 20-writer native-template concurrency failure is tracked separately and blocks readiness until resolved. Browser acceptance, receipt of alerts by the deployed receiver, QR dependency approval and the full release gate remain outstanding.
