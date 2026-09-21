# Platform validation register

**Status:** wave 2 register drafted — tasks defined; no representative-user walk closed this session  
**Date:** 2026-09-21  
**Authority:** [PRODUCT.md](../../PRODUCT.md) core market journeys 1–6; [CONTEXT.md](../../CONTEXT.md) vocabulary; [platform-job-map.md](./platform-job-map.md); [platform-journey-blueprint.md](./platform-journey-blueprint.md); [platform-nav-route-map.md](./platform-nav-route-map.md); [platform-experience-register.md](./platform-experience-register.md) EX-03 (completion evidence vs component presence); [jev-platform-integration-register.md](./jev-platform-integration-register.md)  
**Companion:** [platform-design-package.md](./platform-design-package.md) part 8 — validate complete tasks on both sides.

Grades follow the design package. In this register **Grade** is the *validation* status of the task, not a claim that the product journey is finished:

| Grade | Meaning here |
| --- | --- |
| `CHARTER` | PRODUCT.md / CONTEXT.md require the outcome; source is not yet enough to run the task as written |
| `PARTIAL` | Supporting source and/or automated contracts exist; completion + comprehension + received outcome are not shown |
| `OPEN` | Representative user has not attempted the task; do not treat dest inspection as a pass |
| `IMPLEMENTED` / `SEEN` | Reserved for a later walk or hosted proof that records the *task outcome*. Not used below. |

Evidence letters match EX-03: **S** inspected source · **T** automated test · **L** fresh local browser observation · **D** declared product/design target. None of these is hosted or production proof.

This file names tasks and measurement. It does not implement product behaviour, invent pass rates, or close EX-03.

---

## Principle

Conversion alone can reward concealed consequences.

A Customer who “completes checkout” while confusing listed catalog price with an expiring Quote, or a Provider who “publishes” a wrong price that buyers then honour, looks like success on a completion counter. So does an Agent that Calls after funding with no Spending policy, or a Call that reaches a terminal UI state while delivery, payment, and purchase resolution remain unreconciled.

Pair every completion measure with:

1. **Comprehension** — the actor can explain the objects they just used (Quote ≠ listed price; funding ≠ authority; Charge ≠ Provider earnings ≠ Payout; delivery ≠ payment status ≠ purchase resolution).
2. **Received outcome** — the Customer has a usable contribution or an honest pending/failed state with a stable `callRef`; the Provider has attributable earnings or a truthful payout block, not a dashboard that merely rendered.

A passing component test, a grammar landmark, or a dest that loaded is not that pair. EX-03: completion evidence covers outcomes, not presence of components or source classes.

---

## How to run a task

Give the actor the **Task** column only. Do not name dests, routes, compare trays, recovery buttons, or “use Quote then Call.” Record which dests they actually used.

Measure, for every task:

| Measure | What to record |
| --- | --- |
| **Completion** | Did they reach the stated success without a facilitator hint? |
| **Wrong turns** | Dest or object they treated as the answer that was not (directory import as Tool; Overview as Calls; a new Call as retry). |
| **Hesitation** | Pauses at funding vs authority, listed price vs Quote, earnings vs Payout, no-fit vs “nothing exists.” |
| **Lost work** | Constraints, compare set, selected Tool, Quote, draft Publication, or grant discarded by Back, refresh, login, or tab change. |
| **Error recovery** | After a refusal, expiry, unavailable dest, or interrupt: one supported next action, or abandonment. |
| **Comprehension** | Spoken or written explanation of the objects and money facts, checked against CONTEXT.md. |

Distinguish no-fit, unavailable, and user abandonment (EX-03). Do not score “they found the page” as task success.

---

## Task index

| ID | Actor | Task (short) | Grade |
| --- | --- | --- | --- |
| VAL-01 | Customer | Find a fit under three constraints; explain total cost | PARTIAL |
| VAL-02 | Customer / Agent | Buy/Call, leave, return to current status | PARTIAL |
| VAL-03 | Customer | Change, cancel, or recover a Call | PARTIAL |
| VAL-04 | Provider | Publish, then correct price or availability | PARTIAL |
| VAL-05 | Customer | Resume after an interrupted transaction | PARTIAL |
| VAL-06 | Customer | Record no-fit; later withdraw matching eligibility | PARTIAL |
| VAL-07 | Customer | Grant Spending policy separately from funding | PARTIAL |
| VAL-08 | Provider | See earnings as distinct from Payout | PARTIAL |

All eight remain **OPEN human walks**. Grade **PARTIAL** means supporting S/T exists; it is not a pass rate.

---

## VAL-01 — Three constraints and total cost

| Field | Content |
| --- | --- |
| **Actor** | Customer (Agent may search on their behalf) |
| **Task** | You need an outside capability that must satisfy three hard constraints you care about (for example: a stated geography, a stated output form, and a stated budget). Find an option that meets all three. Explain what the total cost would be if you proceeded — including what the catalog shows today versus what a Quote would bind — and what is not included. |
| **Job IDs** | J-B01, J-B02 |
| **Dest IDs** | `DEST-PUBLIC-MARKET` / `DEST-BUYER-MARKET`; likely `RES-TOOL`, `RES-ASK-THREAD` |
| **What success looks like** | A shortlist or a single inspectable Tool version with the three constraints retained; exclusions or no-fit stated if they cannot all be met. The actor can say listed display price (`displayPriceFromPricingConfig` chain) is not the payable Quote, and can name expiry, budget ceiling, and that a Call has not happened. Imported directory metadata is not treated as executable supply. |
| **What to measure** | Completion of a defended choice or explicit none; wrong turns into raw catalogue scroll or a directory card treated as a Tool; hesitation at price fields; lost constraints after tab/compare; recovery from unavailable detail (EX-01); comprehension of Quote vs listed price vs Charge. |
| **Current evidence** | **S** search/compare/quote surfaces (`registry.tools.search` / `compare`, `tool.quote`, Market compare). **T** `tests/eval/jev-journeys.test.ts` (label isolation, no-match vs unavailable, not a purchase); `tests/eval/jev-bazaar-metrics.test.ts` (ranking metrics; empty-relevant ≠ ranking failure); `tests/eval/jev-market-coverage.test.ts` (retrieval-union controls). Frozen inference: [output/jev-journeys-2026-09-20-v2/REPORT.md](../../output/jev-journeys-2026-09-20-v2/REPORT.md) — 24 comparison/prepare/match cases, **no Tools purchased or executed**; [output/jev-agent-loop-2026-09-20/REPORT.md](../../output/jev-agent-loop-2026-09-20/REPORT.md) — fixture catalogue, **no Quote, policy, payment, or delivery**. **L** EX-01/EX-03 inspected `/market` and a detail *exception*; three-constraint + cost explanation not tasked. **D** PRODUCT.md journeys 1–2. `tools/dev/ds-journey-cases.ts` cases `market-search`, `market-compare`, `tool-detail` score **grammar**, not matching intelligence (see below). |
| **Grade** | **PARTIAL** |
| **Owner** | JI-04b (buyer-experience); comparison/no-fit path in the Jev integration register |
| **Blocker** | JI-04b: chat builds a synthetic `interactive-chat` principal and cannot complete authorised Quote/Call (EX-04). EX-01: displayed card may not open a truthful detail. No human walk of Quote vs listed price. D01 pending for public assessment changes. |

---

## VAL-02 — Call, leave, return to status

| Field | Content |
| --- | --- |
| **Actor** | Customer; Agent acts through Account + Spending policy |
| **Task** | Arrange a bounded purchase for a capability you already chose, then leave the product (close the tab or go do other work). Come back later and find the *current* status of that purchase without starting a second one. |
| **Job IDs** | J-B03, J-A01, J-A02 |
| **Dest IDs** | `DEST-BUYER-CALLS` (`/activity`); `RES-CALL` (`/calls/$callRef`) |
| **What success looks like** | One `callRef` joins authority, Charge attempt, and dispatch. After return, the actor opens that Call and can say whether delivery, payment, and purchase resolution agree or which is still open. Suggested next action is not a fresh Call after possible dispatch. The wider project stays in the harness. |
| **What to measure** | Completion of leave-and-return to the same Call; wrong turns into Overview, Market, or a new Quote; hesitation at pending vs failed vs resolved; lost `callRef`; recovery when summaries are unavailable but history remains (EX-03 empty/unavailable split); comprehension that a receipt page is not the same as purchase resolution. |
| **Current evidence** | **S** `AeActivity`, `CallReceiptWorkspace`, `call.status`. **T** call receipt/status/recovery unit tests (`tests/unit/capability-execution/call-receipt-*.ts`, `tests/unit/routes/call-status-route.test.tsx`, `tests/unit/convex/capability-call-projection.test.ts`) — contracts, not a leave-and-return scenario. **L** EX-03 inspected empty Calls; **no purchase exercised**. **D** PRODUCT.md journey 3. DS compact cases `calls`, `call-receipt` are grammar only. |
| **Grade** | **PARTIAL** |
| **Owner** | JI-04b for the authorised Agent path; capability-execution for Call identity and receipt |
| **Blocker** | Same synthetic-authority chat path as VAL-01. Buyer-ia: listing Quote/Call and signed-in header not walked. No paid or sandbox Call this session. Hosted/package acceptance remains JI-07b / LP-3–LP-4. |

---

## VAL-03 — Change, cancel, or recover a Call

| Field | Content |
| --- | --- |
| **Actor** | Customer (support/recovery operator may assist: J-S01) |
| **Task** | A Call you already started did not finish cleanly. Get to a state you can explain to the business: cancel if nothing should run, or recover/reconcile if dispatch may have happened. Do not create a second Charge to “try again.” |
| **Job IDs** | J-B08; J-S01 if an operator helps |
| **Dest IDs** | `RES-CALL`; `DEST-BUYER-CALLS` |
| **What success looks like** | Recovery uses `call.status` / `call.cancel` / `call.reconcile` only when there is no terminal result. The actor can point to one Call identity and say what is known, unknown, and the single supported next action. A new Call is not offered as retry after possible dispatch. |
| **What to measure** | Completion of a supported recovery transition or honest open uncertainty; wrong turn into a second `tool.call`; hesitation at cancel vs reconcile; lost receipt after refresh; error recovery when reconcile mismatches; comprehension that delivery ≠ payment ≠ purchase resolution. |
| **Current evidence** | **S** `CallRecoveryPanel`, `src/modules/capability-execution/call-recovery.actions.ts`, cancel/reconcile routes. **T** `tests/unit/capability-execution/call-recovery-actions.test.ts`, `tests/unit/convex/capability-call-recovery.test.ts`, `tests/unit/market-terminal/recovery.test.ts`, `tests/unit/server/mcp-api-call-recovery.test.ts`. Job map grades J-B08 **IMPLEMENTED** for source acceptance — that is contract evidence, not this task walk. **L** none (EX-03: recovery not exercised). **D** PRODUCT.md Agent operating model; CONTEXT.md Suggested next action. |
| **Grade** | **PARTIAL** |
| **Owner** | capability-execution; J-S01 support playbook remains OPEN in the job map |
| **Blocker** | No uncertain Call in a representative session. Hosted production proof is outside source acceptance. Complete principal-reseller purchase-resolution record remains CHARTER. |

---

## VAL-04 — Publish, then correct a mistake

| Field | Content |
| --- | --- |
| **Actor** | Provider |
| **Task** | Make a versioned capability callable on the market so buyers can find it. After it is live, you notice the price or availability is wrong. Correct it so the next buyer sees the revised terms, without inventing a second catalogue. |
| **Job IDs** | J-P01 (publish); journey-blueprint Provider **Publish** / **Improve** |
| **Dest IDs** | `DEST-PUBLIC-FOR-PROVIDERS` (door); `DEST-PROVIDER-SUPPLY`; `RES-TOOL` as buyer-visible check; `CTX-BUYER-PROVIDER` if the same person also buys |
| **What success looks like** | Publication is distinct from Listing, Source, and portfolio Service. The corrected `pricingConfig` flows through the existing price chain; buyers see `displayPriceFromPricingConfig`, not a hand-edited label. Withdrawal or republication leaves a truthful draft/error if validation fails. Directory import alone is not treated as a published Tool. |
| **What to measure** | Completion of publish *and* a price/availability correction; wrong turns into public-business marketing as “published”; hesitation at admission vs listing; lost draft across OAuth/handoff; recovery from publish validation failure; comprehension that catalog price is not a Quote. |
| **Current evidence** | **S** publication pipeline, owner tool detail, supply funnel. **T** supply/publication/workspace tests (`tests/unit/capability-supply/supply-actions.test.ts`, `tests/unit/ui/provider-workspace.test.tsx`, related funnel tests). JI-05b: adapter tests pass; **signed-in publication unverified**. **L** EX-02/EX-03 inspected Provider activation; ABN asked and not saved as claimed (EX-02). Publish-then-correct not tasked. **D** PRODUCT.md journey 4. DS cases `for-providers`, `operations`, `operations-tool` are grammar only. |
| **Grade** | **PARTIAL** |
| **Owner** | JI-05b (supply); W-30 identity/onboarding for EX-02 — outside the current buyer-only JI goal |
| **Blocker** | Signed-in end-to-end publication not proven. EX-02 intake/save contract mismatch. Provider demand inbox and “relevant buyers across harnesses” remain CHARTER. |

---

## VAL-05 — Interrupted transaction

| Field | Content |
| --- | --- |
| **Actor** | Customer |
| **Task** | You started a money-or-purchase step and were interrupted. Resume and finish — or stop cleanly — without losing the work you already did and without paying twice. Interruptions to cover (separate attempts, same success bar): returning from a funding session; having to sign in again; a Quote that is no longer valid; a Call that is uncertain after possible dispatch. |
| **Job IDs** | J-B06 (funding return); Evaluate-stage Quote expiry; J-B08 (uncertain Call — do not double-count a VAL-03 pass as this task unless the interrupt was the prompt) |
| **Dest IDs** | `FLOW-FUNDING`; `FLOW-AUTH`; `DEST-BUYER-CREDIT`; `RES-CALL` |
| **What success looks like** | Funding return lands on an explainable credit state (available vs reserved). Login return restores the prior dest or an honest re-entry, not a blank Market with lost Tool/Quote. Expired Quote fails *before* reservation; the actor requotes rather than forcing the old packet. Uncertain Call follows VAL-03 rules. No duplicate Charge. |
| **What to measure** | Completion per interrupt kind; wrong turns into a new top-up or new Call; hesitation at reserved vs available credit; lost Quote or selected Tool across auth; error recovery from cancelled funding (`/fund/cancelled`); comprehension that a funding return is not authority and not a Call. |
| **Current evidence** | **S** `/fund/$fundingSessionId`, credit surfaces, Quote revalidation, Call recovery. **T** `tests/unit/money/account-funding-http.test.ts`, `tests/unit/components/ae-connect-return-poller.test.tsx`, quote/call authority tests, recovery suite in VAL-03. **L** none of the four interrupt kinds walked as a task. **D** PRODUCT.md honour-the-Quote; prepaid credit. DS `credit`, `sign-in` are grammar only. |
| **Grade** | **PARTIAL** |
| **Owner** | money (funding); agent-access / Clerk (login resume); capability-execution (Quote expiry, uncertain Call) |
| **Blocker** | Production money disabled until legal gates (PRODUCT.md implementation boundary). JI-07b waiting on LP-3/LP-4. Route-resume after auth is an EX-03 required evidence item, not shown. |

---

## VAL-06 — No-fit, then withdraw eligibility

| Field | Content |
| --- | --- |
| **Actor** | Customer |
| **Task** | You described a bounded need. Nothing assessed today is a supported fit. Keep a way to hear about relevant supply later, without turning that into a public tender or an automatic purchase. Later, you no longer want to be matched — stop that eligibility. |
| **Job IDs** | J-B04; PRODUCT.md journey 5 |
| **Dest IDs** | `DEST-PUBLIC-MARKET` / `DEST-BUYER-MARKET` (S6 has **no** dedicated chrome dest). Not `DEST-BUYER-CALLS` unless the actor wrongly files a gap as a Call. |
| **What success looks like** | One bounded failed-search phrase retained as a private market-gap signal; 30-day active window; no auto-buy on match. Withdrawal stops matching immediately. No-fit means no supported fit in the *assessed* set, not “nothing exists anywhere.” Credential revocation also stops matching (charter). |
| **What to measure** | Completion of record *and* withdraw; wrong turns into posting to Providers or creating a Call; hesitation at “no results” vs retain gap; lost phrase after refresh; recovery from duplicate-record idempotency; comprehension that status/expiry is not a purchase and not a Provider message. |
| **Current evidence** | **S** `src/modules/market-demand/market-demand.actions.ts`, `convex/marketDemandSignals.ts`, `src/routes/api.v1.market-requests.withdraw.ts`. **T** `tests/unit/market-demand/market-demand-actions.test.ts`, `tests/unit/market-terminal/request-memory.test.ts`, `tests/unit/convex/market-demand-signals.test.ts`, `tests/unit/server/market-demand-api.test.ts`. JI-08a: expiry/withdrawal verified in source; freshness remaining. JI-08b: automatic matching **not implemented**. **L** none; buyer-ia: human dest for gap memory not walked. **D** PRODUCT.md matching eligibility (30 days; no auto-buy). |
| **Grade** | **PARTIAL** |
| **Owner** | market-demand; JI-08a/b (outside current buyer-only JI *implementation* goal; still a validation task) |
| **Blocker** | No interview-backed buyer UX for recording gaps (job map). Matching *notification* consumer CHARTER/PARTIAL. This session cannot close later-supply connection, only record/withdraw contracts. |

---

## VAL-07 — Spending policy separately from funding

| Field | Content |
| --- | --- |
| **Actor** | Customer |
| **Task** | Prepare an Agent to buy through your Account. Put in place the rules for what it may spend, and separately make sure the Account can pay. Show that putting money in does not, by itself, give permission, and that giving permission does not, by itself, create credit. |
| **Job IDs** | J-B05 versus J-B06; J-R02 if the actor is returning |
| **Dest IDs** | `DEST-BUYER-AGENTS`; `DEST-BUYER-CREDIT` |
| **What success looks like** | Versioned Spending policy with limits and permitted Tools recorded; prepaid credit visible as available vs reserved. The actor can refuse the prompt “I topped up, so the Agent can buy.” Credential rotation does not reset aggregate policy history. A one-off click is not a substitute for durable rules. |
| **What to measure** | Completion of *both* grant and fund as separate acts (order may vary); wrong turns that treat credit as a grant or grant as a balance; hesitation at connect vs spend permission (EX-03 L4 strength — preserve); lost grant across credential rotate; recovery from policy denial at Quote; comprehension of funding ≠ authority ≠ purchase. |
| **Current evidence** | **S** connect-agent wizard, spending-limits form, `/agent-access/authorize`, owner credit. **T** `tests/unit/action-execution/spending-policy.test.ts`, `tests/unit/components/ae-agent-spending-limits-form.test.tsx`, credit/funding HTTP tests. **L** EX-03 inspected Agent connection and recorded honest permission copy; paired grant-then-fund (or fund-then-grant) *task* not run. **D** PRODUCT.md operating principles. DS `agent-access`, `key-reveal`, `credit` are grammar only. |
| **Grade** | **PARTIAL** |
| **Owner** | agent-access / user-org ergonomics (W spending and funding lines) |
| **Blocker** | Production money disabled. Not every acquisition path requires a standing policy (CONTEXT.md Request authorization) — the walk must still keep the two facts separate when both are in play. |

---

## VAL-08 — Earnings are not a Payout

| Field | Content |
| --- | --- |
| **Actor** | Provider |
| **Task** | After buyers have used your published Tool, find out what you have earned and whether any of that has been paid out. Explain the difference. If payout is blocked, say why in business terms, not wallet archaeology. |
| **Job IDs** | Journey-blueprint Provider **Get paid** (no separate `J-P0x` in the job map; do not invent one). Related: J-P02 (demand reached). |
| **Dest IDs** | `DEST-PROVIDER-SUPPLY` (workspace payout/earnings summary). Not a buyer dest. |
| **What success looks like** | Provider earnings and Provider obligation are visible against Calls, distinct from the buyer’s Charge and from a Payout. Held or ineligible payout (`payoutEligibility`, offboarding `payout_resolution_required`) is stated. The actor does not treat workspace “earnings” as cash in their bank. |
| **What to measure** | Completion of an earnings-vs-payout explanation tied to at least one Call; wrong turns into buyer credit or Stripe-as-identity; hesitation at held balances; lost attribution across tool versions; recovery when payout is blocked; comprehension that settlement ≠ purchase resolution and obligation ≠ payout. |
| **Current evidence** | **S** `convex/moneyPayoutPolicy.ts`, `convex/moneyLedger.ts`, workspace payout summary, `AePayoutPolicyForm`, earnings card. **T** `tests/unit/ui/supply-funnel-earnings.test.tsx`, `tests/unit/money/payout-policy.test.ts`, `tests/unit/release/tool-gateway-production-smoke-earnings.test.ts` (harness, not a live payout). **L** none. **D** PRODUCT.md separate Provider obligation vs buyer consideration; foundation lists Provider earnings. Full AU payout + tax documents CHARTER. DS `operations` grammar only. |
| **Grade** | **PARTIAL** |
| **Owner** | money / Provider payout (user-org W payout lines); JI-05b does not certify get-paid |
| **Blocker** | Production money and legal gates. Measurable Provider activation and repeat demand OPEN (job map J-P02). No representative Provider walk of earnings versus payout this session. |

---

## After-launch metrics (both sides)

Do not invent numeric targets. Mark whether the *kind of signal* exists; hosted/production collection is a later evidence layer.

| Metric | Buyer side | Provider side | Grade | PostHog / eval today |
| --- | --- | --- | --- | --- |
| **Provider activation** | A Customer can discover and Quote a newly published Tool | First admitted Publication that is callable | **PARTIAL** (funnel *schema* and publish source exist; activation as an outcome metric is not closed) | PostHog: client in [`src/lib/observability/posthog.client.ts`](../../src/lib/observability/posthog.client.ts) (`captureClientFunnelEvent`, `captureClientProductEvent`, `$pageview` on allowed routes; no session replay). Declared funnel types include `publish_succeeded`, `service_added`, `paid_activation_started`, `owner_interest_submitted` (`FunnelEventTypeValues`). Observed client emitters in this checkout include `visitor_attributed`, `share_url_copied`, `service_registry_result_clicked` — **declared types are not proof they fire**. Evals: none measure activation. JI-05b signed-in publication unverified. |
| **Fulfilment success** | Call reaches a usable contribution or honest pending/fail with `callRef` | Upstream Tool performed; AE observations match terminal Call | **PARTIAL** | PostHog schema includes `receipt_viewed`, `protected_action_receipt_viewed`, `refund_or_dispute_recorded` — not a fulfilment-success rate. Evals: Jev journey/agent-loop reports **did not execute Tools**. Recovery/receipt **T** exists; live fulfilment rate does not. |
| **Support contacts per transaction** | Contacts about a Call / Quote / credit event | Contacts about publication, earnings, or payout | **OPEN** | No support-contact funnel type observed. Help/status dests exist as product surfaces. Evals do not count contacts. |
| **Resolution time** | Time from uncertain/failed Call to explainable resolution or honest open uncertainty | Time from payout block or dispute to a stated next fact | **OPEN** as a measured metric | PostHog schema includes `billing_reconciliation_failed` / `repaired`, `checkout_returned` / `cancelled`. No resolution-timer or support SLA instrumentation claimed. Recovery **T** asserts transitions, not elapsed time. |
| **Repeat use** | Second comparable purchase with retained provenance (journey 6) | Incremental Calls on published Tools; improve loop | **CHARTER** | PostHog `$pageview` and visitor attribution are not repeat-purchase. JI-09a/b **DATA_REQUIRED** (no held-out allocation). Jev reports are not repeat-use evidence. DS `market-saved` is grammar. |

Both-sides rule: a buyer-only completion (VAL-01–03, 05–07) that never yields a Provider-visible Call does not count as Provider activation or fulfilment. A Provider publish (VAL-04) that no buyer can Quote does not count as activation.

---

## Evidence boundary

| Layer | What it can prove | What it cannot |
| --- | --- | --- |
| **Source** | A path, action, or UI exists and compiles | A person completed a job |
| **Test** | A contract, fixture, or grammar ratchet holds | Hosted behaviour, paid money, or comprehension |
| **Local walk** | What this checkout rendered for a human | Other machines, Clerk/prod config, or legal-on money |
| **Hosted** | A deployed environment accepted a named scenario | Production custody, real buyers, or LP-3/LP-4 |
| **Production** | Live commercial consequences | Nothing below this layer substitutes for it |

EX-03 already recorded: parent ran journey-evaluation and design-grammar suites (**31 passed**); local dests inspected; **no purchase/recovery exercised**. That 31 is component/grammar/eval-*contract* presence, not VAL-* completion.

**This session cannot close** any VAL-01–VAL-08 task. Concretely it cannot close:

- Human completion + comprehension + received outcome for all eight tasks (OPEN walks).
- Authorised Agent Quote → Call → leave → return (VAL-02) or recover (VAL-03 / VAL-05 uncertain).
- Quote versus listed-price explanation with a live Quote (VAL-01).
- Signed-in publish and price correction (VAL-04); earnings-versus-payout with a real Call (VAL-08).
- Funding-return, login-resume, or Quote-expiry walks (VAL-05).
- Buyer-visible no-fit dest and later matching notification (VAL-06); JI-08b automatic matching.
- Hosted acceptance (JI-07b) or production money (legal / LP-3–LP-4).
- Repeat-use or support-contact metrics.

Jev frozen outputs remain smoke/regression records: v2 comparison **is not** a representative accuracy estimate and **purchased nothing**; the agent-loop trial **rejects** an additive hint and **executed no Quote or Call**.

---

## Grammar evals are not matching intelligence

`tools/dev/ds-journey-cases.ts` states at the file head that frozen cases **score sibling-of-discover grammar, not matching intelligence**, and that **Jev evals stay out of this file**. `tests/eval/ds-grammar.test.ts` ratchets SoT class strings, landmarks, and forbidden treatments (`font-bold` titles, generic `shadow-md` cards, and related Wave 1–2 ceilings).

A green `ds-grammar` run, or a `productJourney: 1|2|3|4|5|6` label on a case such as `market-compare` or `call-receipt`, does **not** mean journeys 1–6 were completed. Do not promote those cases into VAL-* pass evidence. Keep Jev files (`jev-journeys`, `jev-bazaar-metrics`, `jev-market-coverage`, agent-loop artefacts) as judgment/ranking *experiment* evidence, still short of Quote, Call, funding, and recovery.

---

## Register maintenance

When a representative walk runs, add **L** (or hosted/production) to the task row, record wrong turns and comprehension notes, and only then consider Grade `SEEN`. When source/tests change a supporting contract, update **S**/**T** and Blocker; do not raise Grade on component presence (EX-03). After-launch metric rows stay CHARTER / PARTIAL / OPEN until an owner names an existing PostHog event or eval denominator — do not add targets in this file.
