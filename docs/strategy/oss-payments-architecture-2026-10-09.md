# OSS payments architecture comparison, 2026-10-09

This is an independent review: two haiku discovery sweeps, a haiku map of what aecon wrote by hand, six haiku deep reads, then an opus architect verdict. It was read-only.

Platforms surveyed: Hyperswitch, TigerBeetle, BTCPay Server, x402 protocol (x402-foundation), Cloudflare Agents SDK (x402 integration), Google AP2 (Agent Payments Protocol), Stripe AI (agent toolkit), Formance Ledger, Coinbase AgentKit, Uniswap Permit2, RequestNetwork, Lightning Labs Aperture (L402 reverse proxy), Coinbase x402 (spec, SDKs, facilitator reference), qntx/facilitator, L402 protocol spec (Lightning Labs), Crossmint SDK, mcccsm/x402-list-mcp (x402 service discovery), MetaMask/mcp-x402 (experimental), xpaysh/xpay-x402 (zero-auth facilitator), open-x402-bazaar (SaylorInnovations), CryptoAPIs buyer-side x402 MCP (cryptoapis-mcp-x402-pay), Jannis-E/x402-mcp-server, mc9max/x402-facilitator-lite (self-hosted facilitator)

## Verdict
The protocol, signing and ledger layers are already wrapped. The handrolled parts that hurt are three wrappers around those libraries: a synchronous 12-confirmation finality wait, a timer-based recovery path, and a readiness gate that fails hard. Upstream x402, BTCPay and Hyperswitch each solve these with smaller, proven patterns. The state machine, budget policy, quotes and discovery are bespoke because no OSS project does them, and that part is the moat, not the problem.

**Spot-checks**
- CONFIRMED: `x402Authorization.ts:613` has `{ minimumConfirmations: 12, timeoutMs: 60_000 }`.
- CONFIRMED: `observe.ts:208` has `scheduler.runAfter(60_000, …beginResponseRecovery)`.
- CORRECTED: `responseRecovery.ts:50` is `60_000 * 2 ** attempt`. That is exponential backoff, not a fixed 60s.
- CONFIRMED: `/api/ready` returns 503 `payments_unavailable` when `sourceChecks.ts:43` emits `reference_rate_stale`. Any stale rate is a hard fail, with no serve-stale window.
- CONFIRMED: LOC is 785 / 419 / 440 / 857 / 448 / 284 / 2,401.
- CONFIRMED: x402-foundation/x402 has 6,692 stars, Apache-2.0, last push 2026-10-07. `PENDING_SETTLEMENT_TTL_MS = 5*60*1000`. `settleReceipt.ts:60` calls `waitForTransactionReceipt({hash})` with no confirmation count. coinbase/x402 (163 stars) is not the main repo.
- CONFIRMED: BTCPay has 7,789 stars, last push 2026-10-09. `NBXplorerListener.cs:365-372` sets confirmations by SpeedPolicy (0/1/2/6).
- CONFIRMED: Hyperswitch has 45,297 stars, last push 2026-10-09.
- UNVERIFIED: that the 87s breaks down as 12 confirmations plus 60s recovery. This is inferred, not traced.
- Also found: aecon already handles `settlement_pending` (`x402Authorization.ts:594`) and already ships `@convex-dev/workpool` 0.4.10 and `@convex-dev/workflow` 0.4.6.

## Component table
| aecon component | LOC | Bespoke? | What the ecosystem does | Action | Why |
|---|---|---|---|---|---|
| Signer / CDP custody | n/m | Wrapped | `@x402/fetch`, CDP | Keep | Already the library |
| Receipt reader (`x402-evm-receipt-reader.ts`) | 284 | Partial | `@x402/evm` settleReceipt waits for 1 receipt and checks the Transfer log | Adopt dependency | Drop the custom confirmation counting |
| Authorization admission | 785 | Yes | x402 `verify` then `settle` hooks | Copy pattern | Split the verify and settle hooks. Remove the in-line finality wait |
| Brokered call | 419 | Yes | Cloudflare settles after work (unpaid exposure) | Keep bespoke | aecon records before releasing results, which is stronger |
| Recovery (`recovery/x402.ts`, `observe.ts`, `responseRecovery.ts`) | 440 + dir 2,231 | Yes | Upstream `settlement_pending` plus a pending store keyed by signature. Hyperswitch uses a process tracker with a backoff schedule | Adopt workpool, copy store pattern | Hand-written `runAfter` timers duplicate what workpool already does |
| Route transport / payment | 857 + 448 | Yes | `@x402/core` HTTP facilitator client | Shrink toward dependency | Mostly wire plumbing |
| Attempt state machine | 2,401 | Yes | Hyperswitch Intent/Attempt split, BTCPay Processing/Invalid states | Keep, align vocabulary | No OSS project has durable multi-instance attempt state |
| Readiness and reference rate | 305 | Yes | Hyperswitch serves a stale FX rate while refreshing | Copy pattern | Fixes the production 503 |
| Quotes | 1,888 | Yes | No equivalent (prices are static `priceUSD`) | Keep | Moat |
| Ledger | ~12,700 | Wrapped (Formance) | TigerBeetle two-phase pending/post/void | Copy pattern | Model finality as pending, then posted |
| Budget / spend policy | 753 | Yes | AgentKit uses a per-payment cap and URL allowlist | Keep, add allowlist | AgentKit's controls are thinner |
| Discovery / facilitator ingest | ~16,700 / 1,221 | Yes | Bazaar extension, x402-list-mcp | Keep, conform to Bazaar format | Distribution surface |

## The 3 swaps with the biggest payoff
**1. Make finality asynchronous**
- Delete: the `minimumConfirmations: 12, timeoutMs: 60_000` wait in the call path (`x402Authorization.ts:613`) and the confirmation counting in `x402-evm-receipt-reader.ts:153-189`.
- Replace with: the `@x402/evm` settle receipt (one block of inclusion) as the release signal. Post a Formance "pending" entry, then promote it to "posted" from an async confirmer. Set the confirmation threshold with a BTCPay-style SpeedPolicy function of amount, so sub-dollar calls need 1 confirmation and larger ones more.
- Fixes: most of the ~87s latency. Trust holds, because reorg risk sits in a pending ledger state instead of blocking the caller.
- Effort: about 3-5 days.

**2. Move recovery onto workpool and a durable pending-settlement store**
- Delete: the `scheduler.runAfter(60_000)` watchdog (`observe.ts:208`), the hand-rolled backoff and lease juggling (`responseRecovery.ts:40-56`), and most of `recovery/x402.ts`.
- Replace with: `@convex-dev/workpool` retries with backoff (already a dependency, already used in `marketDispatchWorkpool.ts`), plus a Convex table that implements upstream's `PendingSettlementStore` interface, keyed by EIP-3009 signature: check for a stored tx hash before any rebroadcast.
- Fixes: the fixed 60s floor on any recovered call, and the risk of double-settling across instances.
- Effort: about 1 week.

**3. Serve stale reference rates within a bounded age**
- Delete: the hard `reference_rate_stale` failure path (`sourceChecks.ts:43`) feeding `readiness.ts:211`.
- Replace with: the Hyperswitch `currency.rs` pattern. Serve the last rate up to a hard max age, refresh in the background under a lock, and fail only past that max age. USDC-denominated x402 payments should not be gated on FX at all; only AUD display and quote conversion need the rate.
- Fixes: the production 503 `payments_unavailable`.
- Effort: about 1-2 days.

## What aecon does that nobody else does
- **Durable, multi-instance payment attempts.** Each attempt is fenced (`attemptRef`, `effectGeneration`). Upstream uses an in-memory store with a 5-minute TTL, Cloudflare has no state, and AgentKit is stateless.
- **Recording before release.** aecon records payment before releasing the result. Cloudflare settles after the work, so the work can go unpaid.
- **Managed buyer custody** with authority expiry on CDP.
- **Spend policy for the buyer:** quotes across many sellers plus monthly budgets and spending periods. OSS projects stop at a per-payment cap.
- **A double-entry ledger behind agent payments.** No x402 project has one.
- **A curated discovery and registry layer over facilitators and sellers.**

Sharpen these. Publish the attempt state names using the Intent/Attempt vocabulary (Hyperswitch-style) and conform discovery to the Bazaar wire format.

## Reading list
1. `https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md`, sections 6.1, 7.1-7.2, 9 and 10.1.
2. `https://github.com/x402-foundation/x402/blob/main/typescript/packages/core/src/facilitator/pendingSettlementStore.ts`, plus `typescript/packages/core/src/server/x402ResourceServer.ts` (`settleWithPendingRetry`, around L1331).
3. `https://github.com/x402-foundation/x402/blob/main/typescript/packages/mechanisms/evm/src/shared/settleReceipt.ts`
4. `https://github.com/btcpayserver/btcpayserver/blob/master/BTCPayServer/Payments/Bitcoin/NBXplorerListener.cs` (L365-377), plus `BTCPayServer/HostedServices/InvoiceWatcher.cs`.
5. `https://github.com/juspay/hyperswitch/blob/main/crates/router/src/utils/currency.rs` (serve-stale FX), plus `crates/router/src/workflows/payment_sync.rs`.

Everything was read-only through `gh api` and grep. Nothing was installed or executed, and no aecon files were edited.
