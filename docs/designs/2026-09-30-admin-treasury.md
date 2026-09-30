# Admin Treasury: managing the USDC float (30 September 2026)

## Operating model (decided)
- Users hold **AUD credit** for services, bought by card through Stripe. They never own or hold crypto, and aecon does not custody crypto for users.
- aecon holds its **own USDC float** in a CDP wallet on Base and pays every seller from it. aecon is merchant of record: it buys the service and resells it for AUD.
- So the float is aecon's working capital, and the admin must be able to see it, trust it, refill it and stop spending from it.

## What exists to build on
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
   - **Drift** = on-chain balance − (available + committed). Green at 0, amber within tolerance, red beyond it.
2. **Runway.**
   - USDC settled in the last 24 hours and 7 days.
   - Runway in days = float ÷ 7-day average daily burn.
   - The low-water mark and target float, both editable.
3. **Coverage.**
   - Total customer AUD balances converted to USD at the current reference rate, against the float.
   - The coverage ratio shows how much of what customers could spend right now the float can pay for. This is where the working-capital gap shows.
4. **In flight.**
   - Committed USDC across open Calls.
   - The reconciliation queue: count, value and oldest age, linked to each Call.
   - Today's spend against the custody daily max.
5. **Actions.**
   - **Refill:** shows the production deposit address, network (Base, `eip155:8453`) and asset (USDC contract), with a copy button and a QR code. There is no outbound transfer from the app. Money only leaves through seller payments within policy caps, which keeps the blast radius small.
   - **Pause payments:** the kill switch. New Quotes refuse with a plain message, while in-flight Calls finish or reconcile. It needs fresh MFA and is audited. Resume uses the same flow.
   - **Set low-water mark / target float:** fresh MFA, audited.

## Mechanics
- **Deposits book themselves.** When an observation shows the on-chain balance rose by more than the capacity accounts explain, the observer books `world → treasury:corporate:{t}:available` for the difference. It records the observation ref as evidence and lists the deposit on the page. No manual step means no drift from forgetting. A balance *fall* that isn't explained by settlements is never booked automatically; it raises a red drift alert. That is the signal for a compromise or a bug.
- **Reconciler** (every 15 minutes, as L4 in the measurement doc) checks four things:
  - The on-chain balance equals ledger available + committed, within tolerance.
  - Settled USDC equals the verified on-chain transfers.
  - Stripe credits equal the ledger's AUD credits.
  - No reservation is older than N minutes without a state.
- **Quote freshness.** The treasury observation used by a Quote must be younger than N minutes, otherwise `treasury_capacity_unavailable`.
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

## Open decisions
1. Drift tolerance (suggested: USD 0.01) and the Quote observation freshness (suggested: 10 minutes).
2. Low-water default (suggested: 3 days of runway) and target (suggested: 14 days).
3. Should pausing payments also need a second approver once there are two owner-admins? Suggested: no. Stopping should be fast; only resuming needs care.
