# aecon production north star

Owner: Joel. Last revised: 30 September 2026. Companion: `docs/production-premortem-and-measurement.md` (inverse premortem, the metric tree, and seven layers of checks). Execution plan and infrastructure: `docs/production-readiness-plan.md`. Operating model: `docs/operating-model.md` (OpenRouter-style AUD credits, alpha and beta phases, tax, Stripe, custody). This document says where we are going and how we will know we have arrived. Every wave of work should move a milestone below forward. If it doesn't, don't do it.

## Destination
aecon runs one production deployment with real money on. A person, or their agent, asks for something the x402 directory sells. aecon picks a ranked listing, pays the seller in USDC from the person's prepaid AUD balance, within limits they set, and shows the answer along with what it cost. It is secure, safe, intuitive and antifragile: a failure demotes one listing or one Call, never the journey.

## Non-negotiables
1. **One money world per deployment.** Production is real money everywhere: Stripe live, Formance production, Base mainnet. Development deployments are sandbox tooling. No user ever sees a test mode, and no path mixes the two worlds.
2. **Fail closed.** Missing or mismatched money configuration stops payments. It never falls back to sandbox, test or a fixture.
3. **Directory first.** Every x402 listing aecon can pay is callable by default. The curated catalogue is a later shelf for aecon's own services.
4. **aecon records delivery, not quality.** A paid 200 counts as a success. Ratings and distinct buyers judge quality. Buyers do their own due diligence, backed by real rankings and a limited-liability statement.
5. **Money only interrupts once.** One sheet covers sign-in, paying on, and credit. Calls under the limits need no approval. Step-up auth guards changes to money authority: raising limits, keys, withdrawals and payment methods.
6. **Familiar before unique.** Chat works like Perplexity for paid APIs. Agents get OpenRouter-style search → describe → call.
7. **Clean cutover.** Deleted lanes (canary, sandbox defaults, per-Call approval, hedging copy) never come back as shims.

## Where we are (evidence, 30 September 2026)
| Area | State |
|---|---|
| Directory | 20,603 indexed listings with a concrete price per listing. Resolve-on-Run is built (`convex/x402Directory.ts`, `convex/lib/chat/tools/callableRef.ts`) |
| Chat journey | Built in source: Run, the one sheet, resuming after credit, the paid chip, the balance pill, describe → quote → call → answer. **No paid Call has been proven live end to end** |
| Money rails | Stripe top-up with GST on the fee (R2). Formance ledger. CDP custody signing with policy caps. x402 settlement verified against 2 RPCs. FX feed fixed |
| Selection | Evidence scorer, pick plus alternates, delivery evidence per listing (other session, committed) |
| Isolation | **Not safe for production.** 16 findings, 10 of them P0 (`docs/reviews/rebuild/2026-09-30-production-isolation-audit.md`) |
| Dev loop | Fragile: the local Convex database is 8.8 GB and cold starts take 3-6 minutes. The Mac's swap is full |
| CI | GitHub Actions minutes are exhausted until 1 October. The local `npm run gate` is the gate |

## Milestones

### M0: Stable branch and dev loop
- Merge `well-30/rebuild-a` to `main` through `npm run gate`.
- Compact or reset the local database so the stack stays up. One session per checkout.
- Prove one full paid Call on the development deployment (Base Sepolia): chat Run, Quote, Call, settlement, receipt, paid chip. This is engineering proof of the loop, not a user mode.

**Exit:** the gate is green on main, and one sandbox Call is recorded end to end with its receipt.

### M1: One money world (isolation)
Deliver the isolation plan in full:
- A required `AE_DEPLOYMENT_ENVIRONMENT` with no default.
- Delete `hosted_alpha`, `standard` and the synthetic fixture profile.
- Quote and Call admit only the deployment's environment.
- Issuance and owner chat follow the deployment. Invalid claims are refused.
- No raw signer in production.
- Production refuses Stripe test keys, and Formance's environment must equal the deployment's.
- Treasury capacity must be recent.
- The directory, search, chat and Market filter by environment.
- The dev seed and the sandbox route return 404 in production.

**Exit:** all 10 P0 findings are closed, and one isolation test (with production set, every door refuses) is green and stays in the gate.

### M2: Production infrastructure
Provision the following, then run a restore drill. Admin Treasury design: `docs/designs/2026-09-30-admin-treasury.md` (float page, automatic deposit booking, reconciler, pause payments):
- Convex production deployment and Vercel production.
- Production Clerk.
- Secrets:
  - Stripe live restricted keys, webhook and the GST rate id.
  - Formance production.
  - The CDP custody bundle and policy ids.
  - `AE_X402_RPC_URLS_JSON` with 2 Base mainnet endpoints.
  - `AE_CANONICAL_BASE_URL`.
- Backups, and a restore drill performed once.
- Monitoring and alerts:
  - The treasury USDC float below its threshold.
  - Settlement failures and the reconciliation queue depth.
  - Stripe webhook failures.
  - Quote refusal spikes by reason.
  - Error rate per journey.

**Exit:** the readiness panel shows all green, the restore drill is documented, and every alert has been fired once on purpose.

### M3: Money on, admins only
The launch gate `paymentsOpenTo = admins`. Joel's account makes real Calls on Base mainnet.

Drills:
- A seller returns 500: the buyer is not charged.
- A timeout after payment: reconciled, not paid twice.
- The price changes between Quote and Call: refused before payment.
- Insufficient balance: the sheet opens and the Call resumes.
- A Call over the limit: refused, with a way to raise the limit.

**Exit:** 20 real Calls across at least 5 listings, reconciled to the cent: Stripe in = Formance AUD = spend + balance, and USDC out = on-chain transfers. All the drills pass.

### M4: Trust centre published
The pages below go live and are linked from the footer, the sheet and every receipt. Legal review covers the liability and stored-value wording.

**Exit:** published and reviewed.

### M5: Closed alpha (invited workspaces)
- 10-25 invited users, with caps of A$1 per Call, A$5 a day and A$20 a month.
- A support channel and a weekly reconciliation.
- A kill switch: payments close in one admin action.

**Exit:** two weeks with zero money incidents, clean reconciliations, and a Run success rate above the agreed floor.

### M6: Open alpha
An admin proposal (fresh MFA, audited) sets `paymentsOpenTo = everyone`. Caps rise only through step-up auth.

### M7: Beyond Base
1. Other EVM networks with EIP-3009 USDC (Polygon, Arbitrum, OP): the payment profile becomes a list per environment, with a treasury balance per network and RPCs per network.
2. Solana, a separate project: `@x402/svm`, CDP Solana accounts and a different settlement verifier.

### Later
aecon's own services on a Browse shelf, saved jobs, multi-Tool plans (the only place a Quote is shown).

## Trust centre (what we publish and keep true)
- **How money works.** A prepaid AUD balance topped up by card through Stripe. GST applies to the top-up fee. aecon pays sellers in USDC on Base through x402. The limits you set. The balance is not a deposit and earns no interest.
- **What aecon does and doesn't promise.**
  - aecon doesn't verify sellers or the quality of their answers.
  - A paid answer is final.
  - A seller error or a non-answer is not charged.
  - Failures on aecon's side are refunded to your balance.
  - Limitation of liability as allowed by law. Consumer guarantees under the ACL cannot be excluded, so this needs legal review.
- **How rankings work.** The signals are relevance, aecon's own delivery results, distinct buyers (damped, with wash trades filtered out), ratings, freshness and price. Rankings reflect live traffic, not a benchmark.
- **Security.**
  - Sign-in via Clerk. Step-up MFA for limits, keys, withdrawals and payment methods.
  - Custody on CDP, with policy caps per Call and per day.
  - How secrets are handled.
  - Incident response, and a responsible-disclosure contact.
- **Data and privacy.** What we store (queries, receipts), retention, export and deletion.
- **Status and incidents.** A status page and an incident history.
- **Receipts and help.** Every receipt says what was paid, to whom, when, and how to get help.

## Watch list
| Risk | Why it matters | Guard |
|---|---|---|
| Test money meets real spend | Fake credit could buy real USDC | M1 isolation test in the gate; one money world per deployment |
| Card chargebacks after USDC is spent | Card payments can be reversed; USDC can't | Stripe Radar and 3DS, a cap on first top-ups, the daily cap, and chargeback monitoring |
| Money-laundering and fraud through top-ups | Stolen cards converted into spend | Top-up caps, velocity limits, KYC thresholds (legal review) |
| Stored-value regulation (AU) | A prepaid balance may count as a purchased payment facility | Legal perimeter review before M5 |
| Treasury float runs dry | Quotes refuse with `treasury_capacity_unavailable` | A low-float alert and a refill runbook |
| Settlement ambiguity | Timeouts after payment | Reconciliation queue alert; never retry as a new purchase |
| Wash-traded listings | About half of x402 volume is self-traded | Rank on distinct buyers and aecon's own delivery evidence, not call counts |
| Hostile or unstable sellers | SSRF, huge responses, price or payTo rotation | Re-resolve at Call time, size caps, the price-match check before payment |
| Stale FX rate | Wrong AUD prices | Refuse after 24 hours (built); alert after 1 hour |
| Stripe webhook loss | A top-up never gets credited | Webhook failure alert, plus the readback reconcile |
| Stripe key drift | Runtime accepts `sk_live`, the manifest demands `rk_live` | Standardise on restricted keys (M1) |
| Dev-loop fragility | Lost days, entangled edits | One session per checkout; control local database growth; never run the gate against production |
| Regressions to deleted lanes | Fragility creeps back | Keep the canary, sandbox defaults, per-Call approval and hedging copy out |

## Operator prerequisites (Joel)
- Mainnet USDC in the CDP wallet on Base, plus a refill runbook.
- Live Stripe account with restricted keys, the webhook and the AU GST tax rate.
- Formance production credentials.
- Two Base mainnet RPC providers.
- Production Clerk instance and domain.
- Legal review of the terms, liability and stored-value perimeter.

## Binding decisions (dated)
- 2026-09-28: eliminate fragility; enhancements fail open to deterministic behaviour.
- 2026-09-29: Bazaar and the x402 directory are the product. Directory first; the catalogue comes second.
- 2026-09-29: a paid 200 is a success; aecon doesn't meter quality.
- 2026-09-29:
  - A Quote is shown only for multi-Tool jobs.
  - Calls under the limits need no approval.
  - No MFA to start spending.
  - No starter credit.
  - Default limits are A$1 per Call, A$5 a day and A$20 a month.
- 2026-09-30: production-first. No user-facing test mode; one money world per deployment.
- 2026-09-30: operate like OpenRouter.
  - aecon is principal, reselling Tool results.
  - Prices pass through at list price, plus a 5.5% top-up fee.
  - Credits: promotional credit is spent first; purchased credit never expires and is refunded on account closure.
  - "Report this answer" refunds with a daily limit.
- 2026-09-30: alpha = 20 invited users with A$10 promotional credit each; Joel funds the float in the production CDP wallet.
- 2026-09-30: open beta = Australian consumers and businesses funding by card (after written Stripe pre-approval); company-funded CDP float.
- 2026-09-30: chat is acquisition and showcase, and a potential sticky service line. Agents and developers are the volume line.

## Open decisions
1. `AE_DEPLOYMENT_ENVIRONMENT` (a new required variable), or derive from `AE_FORMANCE_ENVIRONMENT`. Recommended: the new variable.
2. The launch gate: admins, then everyone, or an invite list of workspaces for M5.
3. Hosting for production: Convex cloud and Vercel (assumed; confirm).
4. The Run success-rate floor for the M5 exit.
