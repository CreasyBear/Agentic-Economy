<!-- Persisted from session agent artifact `agent://AgentFrontier` on 2026-07-13.
     Evidence labels OBSERVED/INFERRED/UNKNOWN preserved from source.
     Owner: Founder. Next review: 2026-08-13. Superseded-by: (none). -->

# Agent capability ceiling for consequential business action (13 July 2026)

## Executive judgment

- **OBSERVED — Today’s ceiling:** frontier agents are useful operators of **bounded, reversible, well-instrumented workflows**, not trustworthy general delegates. They can research, populate forms, draft/send communications under supervision, make reservations, and complete user-approved purchases. They are not reliable enough for open-ended, long-horizon, irreversible work without checkpoints, limits, and recovery paths.
- **OBSERVED — The decisive gap is not “can it click?” but “can it preserve intent?”** OSWorld 2.0’s best agent completed only **20.6%** of 108 realistic long workflows, despite a **54.8% partial score**; failures came from lost constraints, missed mid-task changes, guessing instead of asking, and skipped verification—not merely GUI control ([OSWorld 2.0](https://arxiv.org/html/2606.29537)).
- **INFERRED — 2028:** agents should reliably finish many bounded, hours-to-days business workflows when the domain exposes structured tools and machine-checkable state. Unattended authority will still be selectively granted, capped, and revocable; ambiguity and liability will lag raw capability.
- **INFERRED — 2031:** agents may coordinate multi-day or multi-week workflows in structured domains, but “month-scale software horizon” is not evidence of month-scale autonomous procurement, care, legal, or operational judgment. Real-world deployment will remain jagged by domain and consequence.
- **Bottom line for AE:** capability growth increases the value of a governance/clearing rail **if** it is a thin, interoperable authority-and-evidence layer. It does not justify a universal workflow runtime or a claim that browsers will disappear.

## 1. Today’s honest ceiling

### What the evaluations actually establish

- **OBSERVED:** METR defines a 50%-time horizon as the human-expert duration at which an agent succeeds half the time—not elapsed autonomous runtime. Its suite is primarily self-contained software, ML, and cybersecurity work ([METR methodology](https://metr.org/time-horizons/)).
- **OBSERVED:** METR’s long-run software/research trend is roughly one horizon doubling every **6–7 months**; it projected a **167-working-hour / one-month** 50%-horizon around 2030 under linear extrapolation ([METR limitations](https://metr.org/notes/2026-01-22-time-horizon-limitations/)).
- **OBSERVED:** this trend is not directly transferable to business operations. METR reports visual-computer-use horizons **40–100× lower** than software/research, domain variation by orders of magnitude, factor-of-about-two uncertainty in individual horizon estimates, and no defensible 99% reliability estimate. It explicitly says a horizon of X does **not** mean tasks under X should be delegated ([METR limitations](https://metr.org/notes/2026-01-22-time-horizon-limitations/)).
- **OBSERVED:** OSWorld 2.0 is the strongest reality check available: 108 workflows, median skilled-human time about **1.6 hours**, average **318 tool calls** for one tested frontier setup, 31 self-hosted services, dynamic messages, hidden state, and cross-application evidence. Best strict completion was **20.6%** at 500 steps; completion approached zero on the longest tasks ([paper](https://arxiv.org/html/2606.29537)).
- **OBSERVED:** the same paper notes a frontier model at **83.5%** on short OSWorld-Verified tasks but only 20.6% on OSWorld 2.0. Short benchmark saturation therefore overstates end-to-end professional autonomy ([OSWorld 2.0](https://arxiv.org/html/2606.29537)).
- **OBSERVED:** τ²-bench tests support interactions where both user and agent change shared state. On new telecom tasks, pass@1 was **34% GPT-4.1, 42% o4-mini, 49% Claude 3.7 Sonnet**; requiring communication/coordination cost roughly **20 percentage points** versus agent-only control ([τ²-bench](https://arxiv.org/pdf/2506.07982)).
- **OBSERVED:** benchmark user simulation itself remained imperfect (telecom simulator **16% error**, **6% critical error**), so even these results should not be read as exact field reliability ([τ²-bench](https://arxiv.org/pdf/2506.07982)).
- **OBSERVED:** OpenAI’s 2025 ChatGPT agent scored **35.27%** overall on SpreadsheetBench, or **45.54%** with direct `.xlsx` editing, versus a reported human **71.33%**; OpenAI also warned that it still makes mistakes and that slide export can diverge from the viewer ([launch report](https://openai.com/index/introducing-chatgpt-agent/)).

### What today’s systems can do well

- **OBSERVED:** narrow retrieval, summarization, comparison, drafting, structured API calls, form filling, cart preparation, reservations, appointment scheduling, calendar operations, and routine support resolution—especially where current state and success criteria are machine-readable.
- **OBSERVED:** Salesforce’s own Help deployment handled **45,000 conversations/week**, over **1 million** total by early July 2025, with resolution “in the 85% range.” But Salesforce staged the rollout, manually reviewed early conversations, curated conflicting content, maintained scorecards, and treated rapid human handoff as a correct outcome for nuanced cases ([Salesforce customer-zero report](https://www.salesforce.com/news/stories/ai-agent-customer-service-salesforce-learnings/)).
- **INFERRED:** production success is presently closer to **high-volume bounded service operations with escalation** than to a general autonomous employee. Public case studies rarely publish denominator-complete error, reversal, or loss data.

### Failure modes that matter for consequential action

- **OBSERVED:** long-horizon drift: dropped constraints and incomplete task-level state.
- **OBSERVED:** dynamic-state blindness: missed emails, changed availability, or transient UI state.
- **OBSERVED:** ambiguity mishandling: agents guess when they should pause and ask.
- **OBSERVED:** verification deficit: OSWorld 2.0 agents spent under **7%** of their budget detecting and repairing errors ([OSWorld 2.0](https://arxiv.org/html/2606.29537)).
- **OBSERVED:** prompt injection and data exfiltration remain live browser-agent risks; both OpenAI and Google explicitly warn that web content can manipulate agents ([OpenAI](https://openai.com/index/introducing-chatgpt-agent/), [Google](https://support.google.com/chrome/answer/16821166?hl=en)).
- **INFERRED:** irreversibility multiplies ordinary model error. A wrong draft is cheap; a sent email, accepted contract, charged card, cancelled booking, or disclosed record changes the liability surface even if base error rates are identical.
- **UNKNOWN:** independently audited field rates for unauthorized purchases, mistaken sends, booking reversals, downstream loss, and insurer claims across consumer agents. Vendors do not publish enough incident-denominator data to estimate them.

## 2. The 2026 delegation boundary: what is actually allowed unattended

- **OBSERVED — ChatGPT agent:** can plan/book travel, schedule appointments, shop, update spreadsheets, and run recurring reports. It requests explicit confirmation before consequential actions such as purchases; email sending requires active “Watch Mode”; bank transfers are refused ([OpenAI launch](https://openai.com/index/introducing-chatgpt-agent/)).
- **OBSERVED — ChatGPT commerce:** the user clicks **Buy**; the merchant remains merchant of record and owns settlement, refunds, chargebacks, and compliance. Delegated payment credentials are **single-use**, amount-capped, checkout/merchant-scoped, and expiring ([checkout spec](https://developers.openai.com/commerce/specs/checkout), [payment spec](https://developers.openai.com/commerce/specs/payment)).
- **OBSERVED — Gemini/Chrome:** can compare and cart products, book accommodation, manage dining/food delivery, schedule appointments, draft communications, and fetch receipts. It asks users to take over for final financial transactions, terms acceptance, and account creation; it seeks confirmation before sending communications, modifying data, forms, or scheduling. Google says users are responsible for mistakes and should monitor sensitive tasks ([Google Auto Browse help](https://support.google.com/chrome/answer/16821166?hl=en)).
- **OBSERVED — Alexa+:** shipped integrations cover smart-home actions, OpenTable/Vagaro reservations, grocery and food orders, and service discovery. Amazon claims an agent can arrange a repair without supervision; this is first-party product evidence, not an independently measured reliability claim ([Amazon launch](https://www.aboutamazon.com/news/devices/new-alexa-generative-artificial-intelligence)).
- **OBSERVED — Siri AI:** as of 13 July 2026, action-rich Siri AI is in developer testing and promised as a user beta later in 2026—not mature general availability. Demonstrated actions include drafting email, editing/sharing photos, cross-app actions, and an Apple Cash bill split; Apple does not establish unattended open-web purchasing ([Apple announcement](https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/)).
- **OBSERVED — Claude computer use:** Anthropic’s original release called it public beta, slow and error-prone, and highlighted prompt injection plus missed transient events from screenshot-based perception ([Anthropic](https://www.anthropic.com/research/developing-computer-use)).
- **INFERRED — practical authority ladder:** unattended read/search → reversible drafts/cart creation → low-risk bounded writes → confirmed communications/bookings → user-approved, amount-capped purchases. High-value transfers, contracts, regulated eligibility decisions, destructive account changes, and safety-critical operations remain human-gated or prohibited.

## 3. Credible 2028 and 2031 trajectory

### 2028

- **INFERRED:** extending METR’s 6–7-month doubling trend for roughly two years implies about **8–16×** longer horizons on its software/research distribution—not 8–16× reliability on arbitrary business work.
- **INFERRED:** likely frontier: hours-to-days workflows across CRM, email, calendars, procurement catalogs, support tools, and commerce APIs, with agents monitoring events, requesting clarification, and recovering from routine failures.
- **INFERRED:** unattended use expands where systems provide explicit policy, typed tools, idempotency, spend/recipient/time caps, precondition checks, authoritative state readback, reversible execution, and escalation.
- **UNKNOWN:** whether browser-only agents close the 40–100× visual-computer-use gap, or whether structured APIs remain necessary for dependable action.

### 2031

- **OBSERVED basis:** METR’s straight-line extrapolation reaches a one-month software/research 50%-horizon around 2030, while warning that years-long extrapolation and collaborative work are underdetermined ([METR](https://metr.org/notes/2026-01-22-time-horizon-limitations/)).
- **INFERRED:** by 2031, top agents may operate multi-day/week business processes with persistent memory and event-driven replanning in structured domains. This supports delegated procurement, scheduling, case administration, and vendor coordination—not blanket authority over all economically consequential choices.
- **INFERRED:** the gating metric shifts from pass@1 to **bounded expected loss**: probability × consequence × detectability × reversibility. Capability alone cannot answer who authorized the act, whether terms changed, what was executed, or who bears loss.
- **UNKNOWN:** whether reliability improvements continue exponentially, plateau, or are dominated by scaffolding, environment design, and regulation; whether courts treat agent acts mainly through existing agency, contract, negligence, payments, and consumer law or create agent-specific doctrines.

## 4. What unlocks unattended consequential action

- **OBSERVED:** shipped commerce already converges on scoped credentials, maximum amount, expiry, merchant binding, idempotency, signed requests, authoritative merchant state, and webhook lifecycle truth ([OpenAI commerce specs](https://developers.openai.com/commerce/specs/payment)).
- **INFERRED:** the minimum trust stack is: authenticated principal → explicit mandate → canonical preview of exact terms → bounded credential → one-use/idempotent execution → authoritative receipt → outcome tracking distinct from receipt → replayable evidence → revocation/dispute path.
- **INFERRED:** insurance helps only after telemetry makes risk priceable. Evidence completeness, caps, auditability, and recoverability are likely underwriting prerequisites; no primary-source evidence yet shows a mature mass market for autonomous-agent transaction insurance.
- **OBSERVED:** the EU AI Act is risk/use-case based, not an “agent law.” High-risk systems face risk management, logging, documentation, human oversight, accuracy/robustness, and deployer obligations; most obligations phase in during 2026–2027 ([European Commission overview](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)).
- **OBSERVED:** Colorado’s enacted law defines consequential decisions in education, employment, finance, government services, healthcare, housing, insurance, and legal services and requires reasonable care, documentation, impact assessment, monitoring, and consumer protections for high-risk AI ([SB24-205](https://leg.colorado.gov/laws/session-laws/SB24-205/198/download)).
- **INFERRED:** regulation is pushing toward provable governance artifacts, but neither cited regime mandates a universal clearing rail or resolves ordinary commercial agency/liability across jurisdictions.

## 5. Does rising capability create more or less need for a clearing rail?

### Case for **more**

- **INFERRED:** more capable agents increase action volume, delegation depth, cross-agent transactions, and the blast radius of a misunderstood mandate.
- **INFERRED:** bilateral browser sessions do not inherently prove principal identity, authority scope, exact accepted terms, nonce use, execution identity, or later outcome. Those are counterparty and dispute problems, not reasoning problems.
- **OBSERVED analogue:** OpenAI commerce independently adopted constrained single-use authority, signatures, idempotency, authoritative readback, lifecycle webhooks, and merchant-owned liability—the same problem family a neutral governance rail addresses.
- **INFERRED:** heterogeneous agents and businesses benefit from a shared evidence vocabulary because each side otherwise must trust vendor-specific logs and confirmation UI.

### Case for **less**

- **OBSERVED:** computer-use agents can already operate ordinary human websites; Amazon explicitly positions browser navigation as a way to arrange services without bespoke integration ([Amazon](https://www.aboutamazon.com/news/devices/new-alexa-generative-artificial-intelligence)).
- **INFERRED:** dominant platforms may internalize identity, confirmations, payments, fraud, and disputes, making a separate horizontal protocol commercially unnecessary for many consumer flows.
- **INFERRED:** existing rails—OAuth, passkeys, card-network tokenization, PSP controls, merchant order systems, email/calendar audit logs, and contract law—may absorb governance incrementally.
- **INFERRED:** a new rail loses if integration cost exceeds fraud/dispute savings, if it demands workflow migration, or if it claims authority over outcomes it cannot observe.

## Implication for AE

- **INFERRED — strongest thesis:** AE’s credible ceiling is not “the operating system for every agent action.” It is a **neutral, optional clearing envelope for delegated actions where two parties need portable proof of authority, exact terms, execution, and outcome state**.
- **INFERRED — design bet:** remain transport-agnostic: browser, API, MCP, voice, or human operator may execute. AE should govern admission and evidence, not require agents to stop using human interfaces.
- **INFERRED — wedge logic:** R1’s one governed inquiry/send is appropriately low-consequence but exercises the durable primitives. Advance authority only when each rung proves principal binding, exact-term confirmation, replay resistance, receipt/outcome separation, revocation, and dispute replay.
- **UNKNOWN — adoption ceiling:** whether neutral clearing becomes TLS/SWIFT-like depends less on model capability than on distribution, liability recognition, multi-party interoperability, and whether major platforms permit portable mandates and receipts rather than closed proprietary proofs.