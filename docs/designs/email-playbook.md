# aecon email and funnel playbook

Mined from 30 marketing prompt runs: the AiCMO collection, the digital-marketing-pro skills and founders-kit. Duplicates are merged and ranked. Only changes that fit a self-serve, prepaid, pay-per-call product at aecon's stage are kept. Row numbers refer to the catalogue in `email-design-system.md` (D = decision, P = principle, T = build task). "Refs" means `email-references.md`. Rejected ideas, the source index and the cross-check are in the appendices at the end.

Ground rules that apply throughout:

- aecon has no send log, delivery events, `lifecycle_unsubscribed` events or cohort data yet (rows 5, 11, 13, 14 and 26 to 28 exist in code, 26 to 28 behind `AE_STALLED_EMAILS_ENABLED`). Every number below is either a working number from the design docs or marked unknown. No benchmark from a source prompt is adopted as a target.
- Every new send ships dark behind its own off switch (D9) and needs a `consentBasis` (Q3 open), one-click unsubscribe (T12) and the suppression checks in section 3 first.
- Where a source prompt conflicts with the design system, the design system wins, and the conflict is named in Appendix A or C.
- Founders-kit is a link directory with no method. It contributed 1 low-confidence reference-library step and nothing else.
- Every email has one job. Receipts, tax invoices and deletion notices carry no upsell and no feedback ask.

## 1. What changes in our emails

Ranked within each stage, highest leverage first. "Row" is an existing catalogue row. "NEW" has no catalogue row and is a proposal for Joel. Amounts in examples are tokens such as `{amount}`; real ledger values are used in tests.

### 1.1 Top of funnel (1 change)

| # | Change | Maps to | Why |
|---|--------|---------|-----|
| T3 | Welcome body shows the three-step path as a numbered list (add credit, connect your agent, make the first call). Keep one button, "Add credit". Preheader stays "You only pay per call." Intent variant of the body slot where `intent_answered` exists. No drip: welcome, then triggered mail only. | Row 4 (body steps-list slot) | Sets the path without a second CTA. Stays behind the Phase 3 gate (D5). |

Deferred until there are a few hundred signups (a working number): first-touch UTM capture (`$initial_utm_*` in PostHog may already cover it) and a "Where did you hear about aecon?" signup question. Both add work or friction before anyone can read the answers. Before either ships, confirm the privacy notice covers sign-up attribution capture.

### 1.2 Middle of funnel (5 changes)

| # | Change | Maps to | Why |
|---|--------|---------|-----|
| M1 | Fix the first-call failure path first. Build row 34 with the fix named from the error type, plain text, no sorry. Trigger: a new `provider_call_failed` event (source: failed provider call row in the call ledger, first one after `agent_connected`, before any `first_call`), which T16 must emit. Exit on `first_call`. Build rows 28 and 34 ahead of rows 29 and 30 in T13 and T15. | Row 34 (N), build order | Most direct leak between agent_connected and first_call. |
| M2 | Row 28 never called: body is a short numbered first-call guide (connect, call once, read the receipt) and nothing else. No balance, no diagnosis; diagnosis belongs to row 34. Omit any cause line until real error codes exist in the ledger. Subject stays "Your agent is connected. Make a first call". | Row 28 | Aha candidate is first_call within 72 h. |
| M3 | Row 26 not funded: lead with state and one step. Body: "Your aecon account is set up. Add credit and your agent can start making paid calls. You pay per call, so you only spend what your agent uses." CTA "Add credit". Optional preheader variant: "GST and the service fee are shown before you pay." Keep the 24 h delay. Re-check exits and suppressions at send time (section 3). | Row 26 | Fact first, no agitation. |
| M4 | Row 27 no agent: every personalised token degrades to copy that still converts. No balance means "Connect your first agent to aecon, then your first call is one step away." Show one real ledger call (provider, price, time) as proof where one exists. Never invent an example price. | Row 27 and any template printing `{balance}`, `{amount}`, `{n}` | Missing amount renders as `--` in the design system, which must never reach a subject. |
| M5 | HELD: a plain reply line on rows 26 to 28 ("What stopped you? Reply and we will read it."). Held until inbound routing and triage ownership are confirmed. Reply-To stays `support@aecon.ai` (D2); a `support+kind@` form is only adopted if Resend inbound routing is confirmed (conflict in Appendix C). | Rows 26, 27, 28 | Cheapest source of objection data, but there is no inbound handler in the stack today. |

Caps: one lifecycle email per owner per 24 h and at most 4 in the first 14 days (design wording, unchanged). Every nudge sends once per owner. No calendar drip.

Moved out of this playbook: M6 provider follow-up (held until the `provider_first_call` event exists and provider volume shows the gap; the 14-day wait was a guess).

### 1.3 Bottom of funnel (5 changes)

| # | Change | Maps to | Why |
|---|--------|---------|-----|
| B1 | Funding tax invoice: shorten subject to "Tax invoice for {amount} aecon credit". Body stays factual, CTA "View receipt". No next-step line, no connect-an-agent link; that prompt is row 27 only. | Row 5 | Funding is the highest-intent moment, and a tax invoice stays transactional. |
| B2 | First call done: subject "Your first aecon call: charged {amount}" stays. Receipt trail only. No "how charges work" block, no cross-sell, no top-up ask, no social proof. | Row 29 | Receipt trail reinforces the in-app action. |
| B3 | Low credit: add one line, "Auto top-up keeps calls running. Turn it on in settings." as the one settings link. No runway projection. Threshold and 2x hysteresis unchanged. Measure `topped_up` within 24 h before further copy work. | Row 11 | Balance running out is the real prepaid churn moment. |
| B4 | Credit exhausted (row 12) is built but unwired to refused calls. Wire it as a build task, confirm it sends within minutes, names the tool and the refused call, and says only what the ledger confirms. Do not build a separate refused-call email. | Row 12 (non-suppressible, E-unwired) | A source proposed a duplicate of row 12. |
| B5 | Each CTA lands on a page whose heading matches the email's subject noun (add credit, connect an agent, view call, balance). Route all L-stream links through `emailUrl` with campaign = row kind and content = `cta` or `footer`. Verify the funding page shows the total with fee and GST before Stripe checkout so it equals the tax invoice, and keep Stripe's automatic receipts on until aecon's invoice is proven on hosted (T11 and T16 before T17). | Rows 26 to 30, 34, `links.ts`, T11, T16, T17 | A wrong landing page never converts; a failed send with Stripe receipts off leaves the buyer with no receipt. |

### 1.4 Retention (3 changes)

| # | Change | Maps to | Why |
|---|--------|---------|-----|
| R1 | Auto top-up failed: build the row 32 first notice (N today), then one follow-up at day 3 if still unresolved, subject "Your automatic top-up hasn't gone through yet", exit on any later successful top-up. Row 12 is the hard stop. No multi-email dunning. Funding failed (row 6) stays one email. | Row 32 (N) plus NEW follow-up | Prepaid, not subscription, so the risk is an agent stalling. |
| R2 | Inactivity nudge, one send per dormancy episode. Trigger: funded, at least one call, balance above zero, then no call for 7 days (start value, from the 5 to 7 day range, unmeasured). Subject names the real balance, for example "Your aecon credit is still there". CTA "Make a call". No discount, no apology, no second send until data exists. Build only after the first 30 days of events. | NEW (after row 30, kind `dormant_after_use`, stream L) | Fills the largest gap in Refs section 3. |
| R3 | Land T12 (unsubscribe route, `List-Unsubscribe` and `-Post` headers, `consentBasis` enforced at send time) and the suppression list (section 3) before any L-stream kind is switched on. Honour opt-outs within 5 working days and keep the unsubscribe facility working for 30 days after each send (Spam Act 2003 (Cth); counsel confirms, along with sender identification). Operator digest (row 31) gains counts only: stage counts, dormant with balance, deletion requests. Skip when nothing changed. | T12, row 31, Q3 | Gate before volume. |

Moved to the product backlog, not email decisions: auto top-up setup nudge (three-top-up trigger is a guess), spend cap early heads-up (a working 80 percent threshold, beside row 13), week-one wrap upsell and feedback ask (row 30 stays a plain ledger recap). Deletion rows 22 and 23 stay factual with no feedback ask; churn feedback is by opt-in interview with verbal consent (Appendix A).

### 1.5 Cross-cutting template changes (4)

| # | Change | Maps to |
|---|--------|---------|
| X1 | `lang="en-AU"`, `role="presentation"` on layout tables, logo alt "aecon", one h1 per email, body 16 px on mobile. | `layout.tsx` (T5), Refs 1.2, 1.4, 1.6 |
| X2 | Verify the live DMARC record for aecon.ai (publish `p=none` with `rua` if missing) and add Google Postmaster Tools. | DNS, P11 |
| X3 | Plain text mirror generated from the same content, one image at most (the logo tile), no marketing in security mail. | P10, P12 |
| X4 | Review rows 4, 5 and 26 to 28 drafts against Really Good Emails and Email Copy from Great Companies as a reference check. Reference only, no layouts copied. | D8, P15 |

### 1.6 Build order

0. Gate: Q3 (consent basis) is closed by Joel before any lifecycle send ships. Decision owner: Joel. Date: Joel sets it; nothing in steps 2 onward is switched on before it.
1. T12 consent and unsubscribe, suppression list, T16 `email_sent`, delivery and `provider_call_failed` events, T4 `emailUrl` rules (section 4).
2. Row 34, row 28, row 26, row 27 copy (M1 to M4). Wire row 12 (B4).
3. Row 5, row 11 checks (B1, B3).
4. Row 29, row 32 and its follow-up (R1).
5. R2 only after the first 30 days of events.

## 2. Copy and subject-line rules

Add these to section 3 of the design system. Where a source gave a longer target, the shorter design-system rule wins.

1. Fact first. Lead with what happened or the current state, then one step. No hook, curiosity gap, urgency, scarcity or loss framing on money, alert, receipt or security mail.
2. Subject length: about 50 characters, with the key fact inside the first 40 so it survives a mobile cut. Preheader 40 to 90 characters, carrying the overflow, never repeating the subject.
3. No first name in subjects. Body greeting is "Hi Sam," only when the name is known, otherwise no greeting. No "there" fallback.
4. Subjects use real ledger amounts. Never hardcode an amount, and never let a missing value render as `--` in a subject or body. If a fallback reads badly, skip the send (P8).
5. One button per email, verb plus object, under four words ("Add credit", "View receipt", "Connect an agent", "Make a call", "Update card"). No "Learn more", "Get started", "Click here". One settings or receipt text link is the only permitted second link (P3). No P.S. line.
6. Body under 80 words for lifecycle mail. This overrides the 150 to 350 word targets in the sources.
7. Banned in subject and body, and screened before send: free, bonus, no fee, cash, earn, "% off", "don't miss out", "last chance", "game-changing", "I hope this finds you well", "reach out", "enterprise-grade", exclamation marks, em dashes, emoji. aecon charges GST and a service fee on loading, so any fee-free wording would be misleading as well as a spam risk. Name the fee-inclusive amount when a load email is about money.
8. No invented or computed proof. No customer counts, percentages, testimonials, "teams like X", analyst quotes, money-back claims, peer benchmarks or projections such as "lasts about 4 days". A claim appears only if it comes from the ledger or a verified source. Same for time estimates until measured.
9. Money tone (P13): what happened, money state, one next step. Say "you weren't charged" only when the ledger shows no charge row. Never say money moved before Stripe confirms. Failure tone is plain: "The call failed. Check your agent's key." No apology.
10. From name stays "aecon" with no sign-off (P6). No human signature. One open decision: BM1 supports a named sender for hand-sent churn interviews. Joel decides, interview outreach only.
11. Copy lint before merge: flag banned words, openers over 25 words with no concrete outcome, and any `{token}` without a fallback. A readability target (grade 6 to 8 account mail, 8 to 10 developer mail) is a drafting aim, not a measured result.
12. Security and transactional mail switch the persuasion layer off. Receipts, tax invoice, key, card, email-change, role and deletion notices stay factual: no upsell, no feedback ask, no next-step pitch.

Subject examples that pass: "Add credit to start using aecon" (row 26), "Your agent is connected. Make a first call" (row 28), "Tax invoice for {amount} aecon credit" (row 5), "A new key was created for your aecon account" (row 15, batched per D6).

## 3. Segmentation, suppression and triggers

Only from journey events aecon already emits (`signed_up`, `funded`, `agent_connected`, `first_call`, `activated`, `topped_up`, `retained_w1`, `intent_answered`) or will emit (`email_sent`, `lifecycle_unsubscribed`, `provider_call_failed`, `auto_topup_failed`). Segment sizes are unknown until queried. No firmographic, CRM, enrichment or engagement-score fields.

| Segment | Definition | Entry | Next-best CTA (fixed, not scored) |
|---------|------------|-------|-----------------------------------|
| S1 | Signed up, not funded | `signed_up`, no `funded`, 24 h | Add credit (row 26) |
| S2 | Funded, no agent | `funded`, no `agent_connected`, 48 h | Connect an agent (row 27) |
| S3 | Agent connected, never called | `agent_connected`, no `first_call`, 24 h | Make a first call (row 28), or row 34 on failure |
| S4 | Activated, single top-up | `first_call` and `activated`, one `topped_up` | View call (row 29) |
| S5 | Habit | two or more `topped_up`, or `retained_w1` | View statement (row 30) |
| S6 | Lapsed with balance | no call for 7 days after activation, balance above zero | Make a call (R2, NEW) |
| S7 | Credit at risk | balance under threshold with auto top-up off, or `auto_topup_failed` | Add credit (row 11), Update card (row 32) |

Suppression, checked at send time for every kind (including every delayed send, so an owner who funds inside row 26's 24 h delay is not sent "Add credit"):

| Kind | Suppress if |
|------|-------------|
| All kinds, all streams | Address on the suppression list (hard bounce, spam complaint, `lifecycle_unsubscribed`); account paused (rows 17, 18) or deletion pending (rows 22, 36) for L-stream kinds |
| 26 stalled not funded | `funded`, owner opt-out |
| 27 stalled no agent | `agent_connected`, owner opt-out |
| 28 stalled never called | `first_call`, row 34 already sent, owner opt-out |
| 34 first call failed | `first_call`, owner opt-out |
| 29 first call done, 30 week one wrap | owner opt-out; row 30 also on zero calls (P8) |
| R2 dormant after use | any call, top-up, a row 11 send in the window, owner opt-out; none within 30 days of a top-up or 6 months of a previous re-engagement send (proposals, unmeasured) |
| R1 top-up follow-up | any later successful top-up, row 12 sent |

Hard bounces and complaints are written to the suppression list by the Resend webhook handler (T16) and block every kind, transactional included except legally required notices to a working address.

Trigger rules:

- Branch on journey state, never on opens or on "opened but did not click". Exits are the milestone event, checked at send time (P4).
- One active lifecycle flow per owner. Welcome, then triggered only. No calendar drip.
- Priority when more than one kind qualifies for an owner (one wins per 24 h, the rest wait or lapse): row 12 and row 11 alerts, then 34, 28, 27, 26, 29, 30, R2. Alerts and receipts are not capped and send immediately.
- Caps: one lifecycle email per 24 h, at most 4 in the first 14 days, quiet hours 8am to 8pm in the owner's timezone, absolute dates in the recipient's timezone (P7, Australia/Sydney fallback).
- Sunset rule: a nudge that gets no response is not repeated. Write it into `stalled.ts` before any re-engagement track exists.
- Lifecycle holdout: 10 percent of eligible owners for lifecycle kinds only, never for transactional, alert or security mail. Held until volume exists.
- Segment check: a saved query that counts owners per segment, reviewed when volume exists. Token fill rate under 80 percent is a data gap, not a copy problem.

## 4. Measurement and UTM governance

### 4.1 Goals

Two goals, recorded in PostHog from `email_sent(kind)` joined on owner id (design section 7):

| Sequence | Goal | Window |
|----------|------|--------|
| Welcome (row 4) | `funded` | 24 h |
| First-call sequence (rows 28 and 34) | `first_call` | 72 h |

Other sequences get a goal after 30 days of data. No sequence is judged until its baseline exists; targets stay unknown for the first 30 days. Instrument first: `email_sent`, Resend delivered, bounced, complained and clicked written to the email row, `lifecycle_unsubscribed`, `provider_call_failed`, `auto_topup_failed` (T16).

### 4.2 Scorecard and the one weekly number

Three metrics, each with source event and working threshold, in PostHog or a sheet (opens excluded: Apple Mail Privacy Protection inflates them): bounce under 2 percent, complaint under 0.10 percent (working number from design section 7; Google's Postmaster targets are not verified here, so check Google's current documentation before relying on them), lifecycle unsubscribe under 1 percent per send. At aecon's size a single bounce is a large percentage, so the operator alert uses absolute counts: any complaint, any hard bounce, any failed send.

The one weekly number: share of the week's signups that reached `first_call` within 7 days. Everything else waits for data.

### 4.3 Experiments

- No subject A/B, CTA test or timing test until volume exists. Send the best-reasoned copy to everyone and log the result. Below the gate, read results as before and after and call them directional.
- Tag every lifecycle `email_sent` with `copy_variant` and `cta_label` so conversion can be cut later.
- Aha moment: first_call is the working definition. Compare day-3 completers with non-completers on 30-day return before moving rows 27 and 28 to `agent_connected`. Needs a few hundred owners per cohort (a working number, same as Appendix B), and interviews with a handful of paying owners until then.

### 4.4 Link governance

- One source of truth: `src/emails/links.ts` (`emailUrl`, T4). Values are typed unions and lowercased: `utm_source` = `aecon`, `utm_medium` = `email`, `utm_content` = `cta` or `footer`, `utm_campaign` = the catalogue kind slug (for example `stalled_not_funded`, `low_credit`). No quarter codes, no audience codes, no per-template strings.
- Tag every outbound link in L-stream mail, including footer links, and the plain text version. `mailto:` links cannot carry UTMs, so show the support address as text.
- Never tag in-app links. Owner routes (`/owner/credit`, `/owner/receipts/:id`) must not call `emailUrl`.
- Transactional, alert and security mail: no UTMs recommended (conflict in Appendix C).

## Review notes

Rejected review items:

- Duplicate ask, welcome and row 26 both say "Add credit": not changed. The design system gives each row one CTA, and a stalled nudge exists to repeat the ask after 24 h without funding. The overlap is reduced by M3 stating the no-credit state and by send-time suppression on `funded`, not by removing a button from either email.

Applied with a different fix than proposed:

- Welcome versus drip: the drip was deleted from section 3 (the rejection in Appendix A stays).
- Old R3 (auto top-up nudge) and R4 (80 percent spend cap alert): moved to the product backlog note in 1.4, not deleted.
- Scorecard cut to three metrics and two goals; analytics cut to one weekly number; UTM monthly check, conversion ladder and Search Console baseline dropped.
- Inbound reply path: M5 held and the old R6 deletion reply ask removed rather than confirmed.
- Physical address: kept as an open question for counsel in Appendix A, not as a blocker.

## Appendix A. Rejected ideas and reasons

Grouped. Full per-run lists of enterprise items are in the source runs. These are the ones that recurred or were tempting.

### A.1 Enterprise or sales-led (no sales team, no accounts)

- MQL, SQL, opportunity, PQL scoring, SDR or AE routing, CSM tasks, QBR, executive sponsor, renewal-window triggers, champion and buying-committee mapping, firmographic or industry personalisation, account tiers by ACV.
- Salesforce, HubSpot, Marketo, Gainsight, ChurnZero, Customer.io, Klaviyo, Braze, Segment, Hightouch and Clearbit-style enrichment (also a privacy problem). Stack is Resend, PostHog and Convex.
- Pipeline dollars, revenue per email, ACV-based ROI, NRR, ARR targets, CFO-grade attribution.

### A.2 Needs data aecon lacks

- 100-point health score, PQL weights, 20 percent and 15 percent anomaly alerts, Revenue Quality Score bands. No baseline, and at low volume one owner moves any percentage.
- Open-rate, click, reply, unsubscribe and activation benchmarks from the prompts (for example 55 to 75 percent opens, 3 to 7 percent replies, 5 to 8 percent reactivation). Unsourced for a pay-per-call product.
- ROI tables, hours-saved previews, peer percentiles ("top 12 percent"), case-study emails, social-proof emails, testimonials. No customers or outcomes to cite, and invention breaks D2 and the voice rules.
- Send-time optimisation and day-of-week tests (no send log). Predictive churn and CLV features.
- Sample-size claims and a 1 h versus 24 h timing test. Not computable yet; removed from the playbook until volume exists.
- AI next-best-action scoring. A fixed state table is used until several hundred owners have reached each state (a judgement, not a sourced figure).
- Usage-drop alert with a 50 percent threshold. No baseline, and row 14 already covers failure spikes.
- Milestone emails at 1, 10 and 100 calls and the second-agent summary email. Held until the ledger shows real usage.

### A.3 Conflicts with aecon rules

- Calendar drips: the 7-, 8-, 12-email onboarding series, the 45-day nurture, the 6-touch 35-day dark-pipeline sequence, the 5-email win-back and farewell series. Conflicts with P1, P2 and the 4-in-14-days cap.
- Open-based branching (no open after 48 h sends a follow-up, "breakup" after 7 days, welcome-unopened suppression of row 26). Conflicts with section 7: opens are directional only.
- Urgency and scarcity: trial expiry, "offer expires tonight", countdowns, early-bird bonuses, soft deadlines, "last chance". aecon has no trial and no deadlines. Conflicts with P13 and the never-list.
- Second CTA or P.S. line, fallback CTA ladders, "See how X achieved Y" outcome CTAs. Conflicts with P3.
- Person as sender or human signature (P6). The "Hi {name}" subject lines and "there" fallbacks. Names in subjects.
- Abandonment email on `checkout.session.expired`. Row 6 deliberately excludes it. A one-email version is a reversal only Joel can choose, so it is not in this playbook.
- A multi-email failed-payment dunning cadence (days 0, 3, 7, 10, 13, 20, 27). Subscription logic. aecon gets one follow-up (R1).
- Win-back at 90 or more days, and a "Lane D" send to people who paid once and went quiet. Held until a shipped product change answers a known reason. R2 is the only dormant send.
- Calendar-style "connect your agent" emails for owners who signed up but never funded. Funding is the first step in the journey, so row 27 covers this after funding.
- Pricing-page visit sequences and any pre-signup marketing email. Newsletter is out of scope (design 2.5). If added, double opt-in.
- Trial, free-tier and "no credit card" copy, referral rewards, team invite incentives, seat expansion, plan upgrades. None exist.
- Product launch announcement email for a new tool. No launch cycle, no real proof, and a launch blast breaks the cap. Revisit when a named tool launch needs it.
- Account credit as an interview incentive until an accountant confirms GST treatment (D3). Gift-card tiers calibrated to ACV.
- Complaint targets of 0.05 percent and 0.08 percent and unsubscribe targets of 0.3 and 0.5 percent from prompts, as aecon thresholds. See the cross-check.

### A.4 Compliance and law

- CAN-SPAM, GDPR and CASL checklists are not the governing law. The Spam Act 2003 (Cth) applies to commercial messages, and the Privacy Act 1988 (Cth) likely applies subject to counsel confirming aecon meets its coverage tests. Q3 (consent wording, s18 unchecked against ACMA) stays open. Counsel confirms. Not verified here.
- A "physical address in every email" requirement is not met today. D2 says no street address is published and none may be invented. Before accepting the legal line and support address as sufficient, look up the ABN and ASIC registered office or a postal business address (a looked-up fact, not an invented one) and have counsel decide whether it satisfies Spam Act sender-identification rules. Not verified here.
- Churn interview recordings need verbal consent, and quotes are anonymised. No outreach to anyone who asked for deletion, opted out or has no confirmed consent basis.

### A.5 Tool sprawl

- New analytics, attribution, CRM or scoring vendors. The nudge-signal computation stays in a scheduled Convex function reading the ledger and calling the existing send path (no new registry or dispatcher).
- GA4 audits, Looker or Metabase dashboards, Zapier to Sheets logging, Notion trackers.
- In-app DAP tooling (Pendo, Appcues, Userflow). Progress-bar copy belongs in-app, not in email.
- Switching ESP to Postmaster-style low-cost vendors. D10 stands: Resend.

## Appendix B. Source index

Counts are from the 30 runs. "In" is recommendations a run returned. "Kept" is recommendations that fed an adopted change or rule in sections 1 to 4, judged by me, with duplicates merged. A recommendation that was merged into another still counts once as kept here. About 288 came in and about 141 were kept, which collapsed to the changes in section 1 and 12 copy rules in section 2 before the review pass trimmed section 1. Enterprise-only and no-data items are in Appendix A.

### B.1 AiCMO prompt collection (23 runs, 227 in, 110 kept)

| Source | In | Kept | Main contribution |
|--------|----|------|-------------------|
| B2B Email Revenue Audit & Lifecycle Optimisation | 10 | 7 | Goal and window per sequence, KPI table, row 26 and 34 copy, consent gate |
| Email Copywriting & Persuasion Architecture | 10 | 6 | Fact-first copy, no P.S., voice never-list, variant tagging |
| Subject Line & Preview Text Optimisation | 10 | 6 | Subject and preheader length, banned financial words, no first name in subjects |
| Transactional Email Revenue Optimisation | 10 | 6 | Row 5 subject length and next-step line, row 11 settings link, no fallback greeting |
| Personalisation & Dynamic Segmentation | 12 | 6 | Segments S1 to S7, fixed CTA table, token fallbacks, CTA scent |
| B2B Email Marketing Program Architecture | 8 | 3 | First-touch UTM capture, personalise only from owned data |
| New User Welcome & 30-Day Activation | 10 | 5 | Short drip then triggered, welcome CTA, deliverability, holdout |
| Behavioural Email Automation Lifecycle | 9 | 5 | Reply-invite on stalled and failure mail, from-name conflict, first_call exit |
| Email Sequence Automation | 10 | 6 | Reject 7-email calendar, no false urgency, how-charges-work block |
| Dark Pipeline Re-Engagement | 9 | 4 | Dormant-after-use kind, suppress-if list, reply question |
| Renewal & Expansion Revenue | 8 | 3 | Dark by default, first-value check-in as reply, copy length |
| Product Launch & Feature Announcement | 10 | 3 | Segment adaptation, UTM convention, recipient timezone |
| UTM Campaign Tracking Governance | 10 | 7 | Typed lowercase union, kind-slug campaign, transactional UTM conflict, monthly check |
| Funnel Performance Diagnostics | 11 | 6 | Instrumentation first, build order, Stripe receipts guard |
| Email Program Analytics & Performance | 9 | 5 | Click-led metrics, engaged definition, complaint threshold check |
| PLG Analytics & Trial-to-Paid | 10 | 3 | Event set, digest counts only, reject fixed thresholds |
| PLG Messaging & Self-Serve Conversion | 11 | 5 | Row 26 steps, row 11 runway line, readability aim, aha from data |
| Developer SDK Adoption & Activation | 9 | 4 | Row 28 debugging guide, row 29 content, three activation KPIs |
| Churn Interview Programme | 11 | 3 | Rows 22 and 23 reply question, consent gate, churn cohort definitions |
| Self-Serve Onboarding Funnel | 10 | 5 | Behaviour triggers, stuck thresholds, fee before checkout |
| Customer Value Realisation | 10 | 4 | Activation milestone, dormancy check-in, guardrails |
| Customer Health Score & Early Warning | 10 | 4 | Stage model not score, runway date, digest block, alert noise |
| Product Usage Signal & Expansion Trigger | 10 | 4 | Low-balance and refused-call logic, strip claims, keep signals in Convex |

### B.2 digital-marketing-pro skills (6 runs) and founders-kit (1 run), 61 in, 31 kept

| Source | In | Kept | Main contribution |
|--------|----|------|-------------------|
| email-sequence skill | 10 | 5 | Ledger proof in rows 27 and 29, paused and deletion suppression, DMARC check |
| funnel-architect skill | 10 | 6 | Provider track, inactivity, accessibility gaps, Postmaster, goal and window |
| funnel-audit skill | 9 | 5 | Intent variants, stage conversion, secondary link on row 5 |
| attribution-model skill | 11 | 5 | First and last touch, conversion ladder, AI-assistant channel, consent check |
| send-email-campaign skill | 9 | 5 | Test-send gate, stream split, absolute-count alerts, no A/B yet |
| dark-funnel skill | 9 | 4 | "Where did you hear" answer, branded search baseline, no referral ask |
| founders-kit README | 3 | 1 | Reference library check only. A link directory, no method |

Totals: 23 plus 7 runs is 30. 227 plus 61 is 288 in, 110 plus 31 is 141 kept.

## Appendix C. Cross-check against email-references.md

Agree:

- One skeleton, one CTA, verb plus object, no "click here" (Refs 1.3). Playbook rules 5 and 6.
- Measure conversions with a goal and window, not opens or clicks (Refs 2.2, CIO). Section 4.1 and 4.2.
- Aha moment chosen from data, not assumed (Refs 2.2, UP1). Section 4.3.
- Inactivity nudge at 5 to 7 days (Refs 2.4, UP2). R2 uses 7 days as an unmeasured start value.
- Leaving feedback by reply (Refs 2.4, BM1): not adopted in deletion mail, which stays factual. Opt-in interview only (Appendix A).
- Newsletter out of scope, double opt-in if added (Refs 2.1). Appendix A.3.
- One-click unsubscribe, SPF, DKIM, DMARC, Postmaster spam rate under 0.10 percent (Refs 1.7, gap row). R3, X2, section 4.2 (Postmaster figure unverified).
- Accessibility gaps (`lang`, `role="presentation"`, h1, alt text, 16 px). X1 closes five of the Refs section 3 gap rows.
- Gap rows now addressed: goal and window for two sequences (4.1), inactivity nudge (R2), lowercase UTM (4.4), spam rate tie to Postmaster (4.2). Leaving feedback and the expansion email moved out of the playbook (1.4).

Conflict, with the recommended resolution:

| Topic | Refs or design says | Sources say | Recommendation |
|-------|---------------------|-------------|----------------|
| Dunning cadence | BM2: days 0, 3, 7, 10, 13, 20, 27 | Several runs adapt it to a longer cadence | One follow-up at day 3 only (R1). Cadence is subscription logic and aecon is prepaid |
| UTMs on transactional mail | Refs 1.9 and T4 tag every email link with `utm_medium=email` | UTM governance run: transactional mail should not carry `utm_medium=email` | Open for Joel. Recommend L-stream only, since in-app receipt navigation and Stripe links can overwrite first touch. If Joel keeps T4 as written, add a separate approved value rather than reuse `email` |
| Named sender | P6: From is aecon | BM1: named sender for cancellation mail | Keep aecon. Joel may grant one named-person exception for hand-sent churn interviews |
| Complaint and unsubscribe thresholds | Design: complaint 0.1 percent, unsubscribe 1 percent (working) | Sources: 0.05 and 0.08 percent complaint, 0.3 and 0.5 percent unsubscribe | Keep 0.1 and 1 percent until 30 days of data. Use 0.3 percent unsubscribe as an early review flag, not a pause rule. Provider guidance not verified here |
| Container width | Refs 2.3: 600 px | Design: pinned 560 px | No source disputes this. Left as the design system has it |
| Subject length | Design P5: about 50 characters | Sources: under 40 characters | Key fact in the first 40, full subject up to about 50 |
| Welcome length and CTA | Design: one CTA, under 80 words | Sources: 150 to 350 words, lead magnet, social CTA | Design wins |
| Calendar drip versus triggers | P1 and P2: trigger on behaviour, one short drip | Most onboarding prompts: fixed day offsets | Design wins. No calendar drip |
| Row 26 and the welcome both ask for credit within a day | Design: both exist | funnel-audit run: avoid two identical asks | Do not suppress on welcome opens (opens are unreliable). Change the copy to state the no-credit state, not repeat the welcome headline |
| Reply address | D2: contact and reply-to is `support@aecon.ai` | Playbook sources and email-design-system.md line 292 use `support+<kind>@aecon.ai` | Open. Keep `support@aecon.ai` until Resend plus-address inbound routing and triage ownership are confirmed (M5 held) |
| Aha moment | Refs 2.2: choose from cohort data | Sources: assume first_call | Use first_call as a working hypothesis only. Revisit at a few hundred owners per cohort (working number) |

Unknown and not invented: list size, send volumes, open, click, unsubscribe, complaint and bounce rates, DMARC policy, sequence conversion rates, segment sizes, typical top-up size, and all provider-side volumes. First 30 days of data replaces every working number in this playbook.
