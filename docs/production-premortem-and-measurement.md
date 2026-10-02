# From today to a mature product: inverse premortem, measurement, and checks

Companion to `docs/production-north-star.md`. Revised 30 September 2026.

## 1. Inverse premortem: it is late 2027 and aecon is a mature product. What made that inevitable?
1. **Every paid answer was reconciled.** Stripe in = ledger credits = spend + balances, and USDC out = on-chain transfers, checked continuously. Nobody ever had to ask where the money went.
2. **The first minute felt like Perplexity.** Ask, see a price, get the answer. Money interrupted once.
3. **Rankings came from aecon's own delivery evidence**, not declared call counts. Wash traders and broken sellers sank on their own.
4. **Unit economics were positive per answer.** The model cost of turning a request into a paid Call stayed below what aecon earned on it.
5. **The regulatory perimeter was settled before users arrived**: stored value, AML/CTF, consumer law, tax.
6. **Production could not reach sandbox**, and missing config stopped payments instead of degrading them.
7. **aecon measured every step of the journey**, so each week's work attacked the biggest measured drop-off, not a guess.
8. **One person could run it.** Alerts were few and true, runbooks existed, and the kill switch was one action.
9. **Supply didn't depend on one vendor's goodwill.** Directory ingestion, custody and settlement each had a known fallback or exit.
10. **Seller output could not make the agent spend.** Tool results were data, never instructions.

Each of those is a gap today. Section 2 turns them into failure modes.

## 2. Premortem: aecon failed. Why? (items not yet on the roadmap are marked NEW)

### Money
- **NEW: chargebacks after irreversible spend.** Card top-ups can be reversed and USDC can't. Guard: Stripe Radar and 3DS, a small first top-up cap, velocity limits, chargeback-rate monitoring, and a policy for accounts with disputed top-ups.
- **NEW: AUD↔USDC float and FX exposure.** aecon holds AUD liabilities (balances) and pays in USDC. FX moves between top-up and spend are aecon's risk. Guard: a float policy (target USDC runway in days), an FX buffer in pricing (the round-up to A$0.01 already favours aecon), and daily float reporting.
- **NEW: accounting.** Prepaid balances are a liability, not revenue. Revenue is the fee. GST applies to the fee at top-up (R2). BAS, revenue recognition and treasury accounting need an accountant's sign-off before M5.
- **NEW: refunds for aecon-side failures.** They need a funded, ledgered path, not a manual adjustment.
- **Treasury key compromise or a CDP outage** (single custody vendor). Guard: CDP policy caps (per Call and daily max, built), policy digest monitoring, an incident runbook, and a written exit plan (a second signer).

### Unit economics
- **NEW: model cost per answered request vs revenue per answer.** A 4-step chat turn (search, describe, quote, call, answer) spends LLM tokens that may cost more than the A$0.01-0.05 Call it leads to. If aecon's fee is taken only at top-up, per-turn model cost is unfunded. Measure it from day one. Options if it's negative: cheaper models for plumbing steps, deterministic describe and input-fill for common schemas, or a small per-Call fee.

### Regulation and legal
- **NEW: AML/CTF.** Converting customer AUD into USDC payments may bring aecon within AUSTRAC digital-currency-exchange obligations. It needs legal advice before M5.
- **Stored value / purchased payment facility** (already on the watch list). Needs a legal perimeter review.
- **Consumer law.** ACL guarantees can't be excluded for consumers. The liability statement must be drafted accordingly.
- **Privacy (APP).** Queries can contain personal information and are sent to third-party sellers. That must be disclosed; retention and deletion must be defined.

### Security and abuse
- **NEW: prompt injection from seller output.** A seller's response is fed to the model and could instruct it to call more paid Tools or leak data. Guards: at most 1 Call per turn (built), tool output treated as data in the instructions, no paid Call triggered by content inside Tool output, and eval cases for injected output.
- **Fraud through the directory.** A malicious seller lists a Tool, farms purchases with stolen cards, and cashes out USDC. Guard: velocity limits per seller, a new-seller exposure cap, and monitoring of payTo concentration.
- **Admin takeover.** Guard: admin MFA (built for commands), two-person approval for money-authority changes once there are two admins, and alerts on admin actions.
- **SSRF and hostile endpoints** (partly built). Re-resolve at Call time, size caps.

### Supply and protocol
- **NEW: dependence on Bazaar discovery.** Coinbase can change the discovery API or its terms. Guard: a second discovery source (PayAI is already ingested), a cached index, and graceful degradation to the last good index (already fail-open).
- **NEW: listings without an input schema** fail at resolve (`schema_missing`). That's a slice of the directory aecon can't sell. Decide: accept a free JSON object with a warning, or skip them.
- **x402 protocol versions** (v1 `X-PAYMENT`, v2 `PAYMENT-SIGNATURE`). Guard: SDK pinning, a version matrix in the call matrix, and a watch on upstream releases.
- **Base-only payments** (M7).

### Product and model
- **NEW: the model picks the wrong listing or fills the input wrong.** The buyer pays for a useless answer (paid 200 = success), and trust erodes quietly. Guard: measure input validity and pick accuracy, replay evaluations (`tools/eval` exists), and show the chosen listing and input on the receipt so buyers can see what was asked.
- **Latency.** Search, describe, quote, then a Call that waits up to 25 s makes an answer slow. An SLO is needed.
- **Retention.** A novelty first answer with no reason to come back. Measure the returning paid users each week.

### Operations
- **NEW: bus factor of one.** One founder operates everything. Guard: runbooks, few and true alerts, the kill switch, and delegated admin by M6.
- **NEW: support.** Users will need help with money questions from the first day of alpha. Guard: a support channel, receipt-linked help, and a response-time target.
- **The dev process** (known): CI minutes, sessions working in parallel, the size of the local database.

## 3. Measure everything: the metric tree
**North star:** paid answers delivered per week (a completed paid Call followed by an answer shown), and weekly returning paid users.

| Layer | Metrics | Source (existing → needed) |
|---|---|---|
| Journey funnel | ask → options shown → Run pressed → sheet shown / completed → Quote committed → Call completed → answer shown → rated; drop-off at each step | `funnel-event-schema.ts` and `[ae.journey]` outcomes (search, quote, call, funding, chat, publish) → add the Run, sheet and answer-shown events |
| Money invariants | Stripe credited = ledger credits. Per Call: AUD debited = Quote. USDC settled = on-chain transfer. Balance ≥ 0. Open reservations older than N min = 0 | Formance, Stripe readback, settlement records → **NEW scheduled reconciler** |
| Treasury | USDC float, days of runway at the current burn rate, observation age | `observe x402 treasury` cron → add the runway and an alert |
| Reliability (SLOs) | Chat first token p95; Run → answer p95 (target < 25 s); Call success rate; settlement verification latency; Stripe webhook lag; error rate per journey | Sentry, journey metrics → define SLOs and alerts |
| Supply | Payable listings; listings with ≥1 aecon delivery; resolve failures by reason; seller success rate | directory index, `toolSelectionDecisions`, delivery evidence |
| Model quality | Pick accuracy (eval replay); `input_invalid` rate; `tool_unavailable` rate; answers with no Call | `tools/eval`, Quote refusal reasons |
| Unit economics | LLM cost per turn and per paid answer; revenue per paid answer; margin | OpenRouter usage → **NEW cost capture per turn** |
| Trust | Refunds, disputes, chargeback rate, support tickets per 100 paid answers, ratings distribution | Stripe, support, ratings |
| Security | Failed auth, MFA challenges, admin actions, rate-limit hits, CDP policy refusals | Clerk, audit events, CDP |

Rules: every metric has an owner, a threshold and an action. A metric nobody acts on gets deleted.

## 4. Check everything: seven layers of verification
| Layer | What it proves | Cadence | State |
|---|---|---|---|
| L1 Static gate | Types, lint, module boundaries, file sizes, **production isolation test** | Every change (`npm run gate`) | Gate exists; isolation test is M1 |
| L2 Money contract matrix | For each case (success, seller 500, timeout, price change, replay, insufficient funds, concurrent spend): HTTP result, ledger, holds, audit and upstream hit count all correct | Every change | NEW (treg-style call matrix) |
| L3 Deployment readiness | All production config present and consistent; boot fails closed | Every deploy | Readiness panel is M1/M2 |
| L4 Production invariants | The scheduled reconciler asserts the money equations and alerts on any difference | Every 15 min, plus a daily report | NEW |
| L5 Synthetic journeys | Free paths (search, describe, the Quote inspection without Call) probed from outside | Every 5 min | NEW. A paid probe is a decision (see below) |
| L6 Real-user telemetry | Funnel, SLOs, errors, cost per answer | Continuous dashboards | Partial (Sentry, journey metric) |
| L7 Human review | Weekly reconciliation and metrics review; incident reviews; monthly trust-centre and watch-list review | Weekly / monthly | NEW ritual |

**Decision needed on paid probes.** A scheduled real Call from an admin account would prove the money path in production every hour, but it spends real cents. It must be booked as an ordinary buyer purchase on the admin account, not as a platform-spend lane. The deleted canary is the lesson: no second charge lane.

## 5. Where these land on the roadmap
| Milestone | Add |
|---|---|
| M0 | Cost capture per turn; funnel events for Run, sheet and answer shown |
| M1 | Isolation test (L1); money contract matrix (L2) |
| M2 | Reconciler (L4); synthetic free-path probes (L5); SLOs and alerts; treasury runway alert |
| M3 | Chargeback guards (Radar, 3DS, first top-up cap, velocity limits); a funded refund path; prompt-injection eval cases |
| M4 | Legal review: AML/CTF (AUSTRAC), stored value, ACL wording, privacy disclosure; accountant sign-off on the treatment of the prepaid liability |
| M5 | Support channel and response target; weekly review ritual (L7); unit-economics review gate (must be positive or have a plan) |
| M6 | Delegated admin (bus factor); second discovery source confirmed |
| M7 | x402 version matrix in L2; per-network reconciliation |
