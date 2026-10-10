# aecon email design system

Status: draft for Joel, 2026-10-11. Scope: every outgoing aecon email (receipts, alerts, lifecycle, operator). Companion to `docs/designs/email-system.md` (architecture, kinds, queue) and `docs/designs/design-system-spec.md` (app UI tokens, voice).

Decisions already made by Joel:

- aecon sends its own receipts. Stripe automatic receipts get turned off.
- We build on emailcn blocks (shadcn registry), not hand-rolled markup.
- React Email and Resend stay. The sending domain aecon.ai is verified in Resend.
- Footer legal identity (company name, ABN, address) is pending. One placeholder constant holds it until then.

Research tags used below: [EC] emailcn, [M] methodology, [R] receipts, [REPO] repo state, [B] brand and voice sources. Source claims from vendor blogs are practitioner consensus, not measured results, and are marked as such.

---

## 1. Principles

| # | Rule | Reference |
|---|------|-----------|
| P1 | Trigger on behaviour. Time is only a delay or a cap, never the trigger. Three named scheduled exceptions: monthly statement (8), week one wrap (30), operator digest (31). | [M1] customer.io event-based messaging |
| P2 | One short drip for the first 7 to 14 days is fine. Everything after it is triggered. | [M2] mailsoftly onboarding practices |
| P3 | One email, one behavioural goal, one primary CTA. A secondary text link is allowed only for the receipt or settings. | [M3] customer.io onboarding recipe, [M4] sequenzy Linear teardown |
| P4 | Write the exit condition yourself. Every email has a suppress-if, because tooling does not provide one. Frequency caps are ours too. | [M5] customer.io recipe (no built-in exit) |
| P5 | Subject is about 50 characters and carries the key fact (amount, state). The preheader carries the overflow. | [M6] Postmark best practices |
| P6 | From name is the product (`aecon`). No noreply. Replies route to a monitored inbox. | [M7] Postmark |
| P7 | Absolute dates and times in the recipient's timezone. Never "today" or "yesterday". | [M8] Postmark, [B] S:162 date format |
| P8 | Do not send empty content. If there is nothing to say, skip the send or say something useful. | [M9] Postmark |
| P9 | Infrequent account emails state who did it, what aecon is, and why the recipient got this. | [M10] Postmark |
| P10 | Plain text mirrors the HTML. Short links, each on its own line. | [M11] Postmark |
| P11 | Authenticate with SPF, DKIM and DMARC on aecon.ai. Keep streams separate: transactional and alert apart from lifecycle and operator. Every lifecycle email carries a visible unsubscribe link and `List-Unsubscribe` plus `List-Unsubscribe-Post` headers (one click). | [M12] Postmark, [REPO] stream union `convex-schema.ts:157-163` |
| P12 | Never email a secret. Send a time-limited link. Security and account-change notices carry no marketing and minimal personal data. | [M13], [M14] wpmailsmtp, termsfeed GDPR |
| P13 | Money tone: what happened, then the money state, then one next step. Never say money moved before Stripe confirms. | [B] S:172, S:204 |
| P14 | Destructive account actions (export, deletion, email change) get a confirmation step and a notice to the old address. Practitioner pattern only, not regulator guidance. | [M15] GitHub issue, flagged weak |
| P15 | Do not hand-roll. Every template composes emailcn blocks and our tokens. A new layout needs a named emailcn reference (block or component, checked against llms.txt) before it is written. | Joel decision, [EC] install docs |

Count: 15 rules. P14 and P15 are the two that rest on judgement rather than a cited consensus.

---

## 2. Visual system

### 2.1 Tokens

Source: `src/emails/brand.ts` (existing), [B] S:45-67, D:70-74. Emailcn exposes one shared `EmailTheme` shape converted by `createEmailTailwindConfig(defaultTheme)` into the React Email `Tailwind config` prop [EC /docs/theming]. The full emailcn token list is not published, so we write one `aeconTheme` object and check each key against the installed theme file at build time (task B2).

| Token | Light | Dark | Note |
|-------|-------|------|------|
| Page background | Chalk `#E8E4DA` | Charcoal `#141414` | [B] S:56 |
| Card surface | `#FFFFFF` | `#1E1E1E` | dark surface is our choice, not in the brand sources |
| Text | Charcoal `#141414` | Chalk `#E8E4DA` | |
| Muted text | `#595854` | `#B3AFA5` | light from [B] S:67, dark is ours, check 4.5:1 |
| Button fill | Forest `#24543D` | Forest `#24543D` with white text, plus a 1px border of Chalk at 30% | Forest on Charcoal is about 2.1:1, under the 3:1 UI-boundary minimum, so the border carries the edge. Verify before Q1 closes |
| Hairline | 8% of text colour, pre-mixed to a solid hex | same | `color-mix` is unsupported in many clients, so pre-mix [B] S:62 |
| Radius | control 6px, card 10px | same | [B] S:45-47 |
| Gold `#E5AA35` | not used in email | not used in v1, held back (2.4) | [B] D:70 |

Rules: inline styles only (Tailwind output is inlined by React Email). No gradients, no shadows. Regular (400) and medium (500) weights only [B] S:168.

### 2.2 Type

Manrope is not reliably available in mail clients. Stack: `Manrope, -apple-system, 'Segoe UI', Arial, Helvetica, sans-serif` (the existing `EMAIL_FONT` already ends in Arial and Helvetica, so we add the system fonts ahead of them). We do not load a webfont, so Manrope applies only where installed; Arial is the real face for most readers and the layout must hold in it. Sizes: body 16px / 24px, small print 13px / 20px, heading 22px / 28px at weight 500. Sentence case everywhere, no uppercase, no eyebrows [B] S:168.

### 2.3 The one skeleton

Every email, with no exceptions, renders this order. Slots map to emailcn blocks (2.5).

```
[preheader, hidden]
HEADER      logo tile + "aecon" wordmark text
HEADING     one line, sentence case
LEAD        1 to 2 sentences: what happened, then money state (P13)
BODY SLOT   one of: receipt table | notification body | statement table | steps list | digest list
CTA         exactly one button (P3). Sole exception: row 23, text only, no button
REASON      one line: why you got this, and who triggered it (P9)
FOOTER      legal identity constant, settings link, unsubscribe link (lifecycle), support address, privacy link
```

- Container: `max-w-container mx-auto` per emailcn [EC /docs/installation], pinned to 560px in our theme because emailcn gives no pixel width. Side padding 24px, 16px at narrow widths.
- Header: the symbol on a Chalk tile, so it stays legible in dark mode (matches the existing `layout.tsx` approach [REPO]). The horizontal lockup exists only as SVG and many clients drop SVG, so we do not use it until rasterised (task B1).
- Footer: one constant, `EMAIL_LEGAL_LINES`, imported from `src/emails/brand.ts`. It never renders invented company details. While it is empty, enqueue refuses every lifecycle (L) send and the funding receipt (5), because commercial mail without sender identity breaches Spam Act 2003 (Cth) s17 (statute text not checked against ACMA). Security and alert mail may still send with support address only.
- Button: one style, 44px minimum height, Forest fill, 6px radius, label under 4 words, bulletproof (table based, as the emailcn blocks provide).

### 2.4 Dark mode

Approach: light palette inline as the base, then `@media (prefers-color-scheme: dark)` overrides in a `<style>` in the head, plus `color-scheme` and `supported-color-schemes` meta. Clients that ignore the media query (older Outlook, some Gmail modes) show light, which must remain fully legible. Logo: Chalk tile with Forest symbol in both modes, so no asset swap is needed. The Chalk and gold symbol is held back for a later pass [B] D:53, D:57.

### 2.5 Which emailcn blocks we install, and the slot each fills

Source of truth: https://www.emailcn.run/llms.txt. It lists block families at `/docs/blocks/react-email/{notification,receipts,onboarding,...}` and publishes no props. Slugs and props below are unverified until B2 reads the installed files. Install is via the shadcn registry after configuring the `@emailcn` namespace in `components.json` [EC /docs/installation]. Theme is installed as a `theme-<id>` item and then edited to `aeconTheme`. Licence is not stated in the pages fetched, so see Q3 and treat the install as blocked until confirmed.

| Slot | emailcn reference | Used by | Fit |
|------|-------------------|---------|-----|
| Notification body and CTA | Blocks > notification family (`/docs/blocks/react-email/notification`) | approval, alerts, stalled, provider, role, key, pause | direct, props read in B2 |
| Receipt | Blocks > receipts family (`/docs/blocks/react-email/receipts`) | funding receipt | partial. It is a product receipt with subtotal, tax and total. We map credit amount to one item and rename tax to GST only when GST status is confirmed |
| Order summary table | Components > Ecommerce > Order Summary (a component, not a block) | refunds, call statement, rows 29 and 30 | closer fit for refunds and statements than the receipt block |
| Onboarding | Blocks > onboarding family (`/docs/blocks/react-email/onboarding`) | welcome, stalled steps | contents not fetched, check before mapping (B2) |
| Authentication | authentication category | none. Clerk owns verification, sign-in and invite | we do not install it |
| Invitations, Newsletter | not installed | not needed now | no lifecycle marketing newsletter in scope |

No gap is hand-rolled by default. Statement table composes the Ecommerce Order Summary component per row group, welcome composes the onboarding block, operator digest composes the notification block with a list. Only if B2 shows none of these fits does a template fall back to `Section`, `Row`, `Column` from `@react-email/components` 1.0.12 [REPO package.json:95], and then it records the named emailcn reference it copied from (P15).

---

## 3. Voice and copy

Sources: [B] V:7-23, S:142-185, R:53. Vocabulary: "aecon" only in UI and email, never "Agentic Economy". "Credit", "call", "provider", "receipt". Never: capability, endpoint, listing, wallet, readiness, evidence, sorry, invalid, unlock, seamless, leverage, US$ [B] V:13, S:142-153. No em dashes, no uppercase, no Title Case, no exclamation marks.

| Element | Rule | Do | Don't |
|---------|------|----|-------|
| Subject | About 50 characters. Key fact first. Sentence case. No prefix tags. Amounts come from the ledger, never hardcoded. | `A$20.00 added to your aecon credit` | `Your Receipt From Agentic Economy!` |
| Preheader | Adds what the subject could not fit. Never repeats it. | `New balance A$34.20. Receipt number AE-1042.` | `View this email in your browser` |
| Greeting | First name if known, else none. No "Dear". | `Hi Sam,` | `Dear valued customer,` |
| Body length | Lead 1 to 2 sentences. Total under 80 words outside tables. | `Your agent's calls are failing. 6 of 10 calls failed since 1:14 pm.` | Three paragraphs of context |
| CTA | Verb plus object, 1 to 3 words. One per email. | `View receipt`, `Add credit`, `Review request` | `Click here`, `Learn more`, `Get started now` |
| Money | At least 2 decimals, trailing zeros trimmed beyond that. `A$0.003`. Non-AUD: `0.02 USDC`. Missing: `--` [B] S:155-158 | `Charged A$0.003.` | `$0.0030 AUD` |
| Money tone | What happened, money state, one step [B] S:172. Say "you weren't charged" only when the ledger shows no charge row for that call | `The call failed. Check your agent's key.` | `Sorry, something went wrong with your payment.` |
| Failure tone | Plain, factual, no apology, no blame | `We couldn't confirm the charge yet. Check the receipt before retrying.` | `Payment invalid.` |
| Dates | `2 Jul 2026, 1:14 pm` in recipient timezone, fall back to Australia/Sydney with the zone shown. The abbreviation (AEST or AEDT) is derived from the send date, never hardcoded; Sydney is on AEDT from 4 Oct 2026 [B] S:162-165 | `2 Jul 2026, 1:14 pm AEST` | `today at 1pm` |
| Security | State what, when, from where, and what to do if not you. No marketing, no upsell. | `Your sign-in email changed on 2 Jul 2026, 1:14 pm. If this wasn't you, contact support@aecon.ai.` | `While you're here, check out our new providers!` |
| Sign-off | None. The reason line closes the email. | `You're getting this because you topped up your aecon credit.` | `Cheers, the aecon team` |

Plain text: generated from the same React tree via `@react-email/render` plain-text mode [REPO render.tsx], one link per line, link text short.

---

## 4. Catalogue

Streams: T transactional, A alert, L lifecycle, O operator. Status: E existing (rendered today), E-unwired (kind exists in the 40-literal union `convex-schema.ts:118-157` but no call site per `email-system.md:185`), N new kind. Clerk column: C means Clerk owns it, we do not send.

Event names come from `src/modules/observability/internal/schema.ts:16-19` (signed_up, intent_answered, funded, agent_connected, first_quote, first_call, activated, topped_up, retained_w1). Where a trigger is a state change rather than a journey event, the state is named. Events this design needs that are not in that list and must be added as emitted events: `provider_first_call`, `spend_cap_changed`, `auto_topup_failed`, `deletion_cancelled`, `lifecycle_unsubscribed`, `email_sent`.

Common suppress-if for every non-security row: stream switch off for the owner (`enqueue.ts:15`), address on the Resend suppression list, or the same kind sent to the same owner inside its cap. Rows list only what is extra.

| # | Kind | Stream | Status | Clerk | Trigger | Suppress-if (extra) | Goal | Single CTA | Subject | Preheader | Blocks | Metric |
|---|------|--------|--------|-------|---------|---------------------|------|-----------|---------|-----------|--------|--------|
| 1 | Email verification | T | n/a | C | Clerk sign-up | n/a | Verify address | Clerk's | Clerk's | n/a | n/a | n/a (Clerk) |
| 2 | Sign-in code or link | T | n/a | C | Clerk sign-in | n/a | Sign in | Clerk's | Clerk's | n/a | n/a | n/a (Clerk) |
| 3 | Team invite | T | n/a | C | Clerk invite created | n/a | Join account | Clerk's | Clerk's | n/a | n/a | n/a (Clerk) |
| 4 | Welcome | L | E (Phase 3 gate, `provisioning.ts:340`) | no | `signed_up` plus account provisioned | `funded` already present | Get to first top-up | Add credit | `Welcome to aecon. Add credit to start` | `You only pay per call.` | onboarding | Funding page click, `funded` within 24 h |
| 5 | Funding receipt (redesign, also auto top-up success) | T | E (`enqueue.ts:155`) | no | Stripe `checkout.session.completed` or auto top-up charge confirmed, and ledger credit row written | none. Always send | Prove the charge, show new balance | View receipt | `{amount} added to your aecon credit` | `New balance {balance}. Receipt AE-1042.` | receipts or order summary | Delivered, bounce rate, receipt link click |
| 6 | Funding failed | T | E-unwired | no | Stripe `payment_intent.payment_failed` only. `checkout.session.expired` is an abandonment nudge, not sent | A later successful top-up for the same session | Recover the top-up | Try again | `Your {amount} top-up didn't go through` | `Try again or use another card.` | notification | `topped_up` within 48 h |
| 7 | Payment stuck | T | E-unwired (`stuck`) | no | Charge pending beyond N minutes with no Stripe confirmation | Resolved before send | Prevent double payment | View receipt | `We're still confirming your {amount} payment` | `Check the receipt before paying again.` | notification | Receipt link click, then no second charge within 1 h |
| 8 | Call statement (monthly) | T | E (`statement-ready.tsx`, unwired) | no | Month closed, at least 1 call in the month (scheduled exception, P1) | Zero calls in the month (P8) | Show what was spent | View statement | `Your aecon statement for September 2026` | `{total} across {n} calls.` | order summary | Statement link click |
| 9 | Task refunded | T | E (`moneyManagedCallRemedy.ts:180`, `moneyX402Expiry.ts:123`) | no | Refund ledger row written. Cap: one per owner per 10 min, later refunds roll into the next send | none | Confirm money returned | View receipt | `Refunded A$0.003 for a failed call` | `Call AE-77 on 2 Jul 2026, 1:14 pm.` | order summary | Click, support reply rate |
| 10 | Agent approval request | T | E (`enqueue.ts:140`) | no | Agent action over the approval threshold, request created. Cap: one per request, after 5 per hour a single `N requests waiting` | Request already decided or expired | Get a decision | Review request | `Your agent wants to spend A$5.00` | `Approve or decline before 3 Jul 2026, 1:14 pm.` | notification | Decision time, approve rate |
| 11 | Low credit | A | E (`usageAlerts.ts`) | no | Balance crosses below the owner's threshold, once per crossing. Re-arms only after balance rises above 2x the threshold (hysteresis) | Auto top-up on, or balance topped up since | Prevent a stalled agent | Add credit | `Your aecon credit is low: A$2.10 left` | `Calls pause when it reaches A$0.00.` | notification | `topped_up` within 24 h |
| 12 | Credit exhausted | T (non-suppressible, ignores the alert switch) | E-unwired | no | Balance reaches zero and a call is refused | Topped up since | Restore service | Add credit | `Your aecon credit has run out` | `Calls are paused until you add credit.` | notification | `topped_up` within 6 h |
| 13 | Spend cap reached | A | E (`usageAlerts.ts`) | no | Monthly cap hit (code ceiling is monthly, `usageAlerts.ts:67`). Once per period | Cap raised since | Tell owner calls are held | Review cap | `Monthly limit of {cap} reached` | `Calls resume on {date}, {zone}.` | notification | `spend_cap_changed` within 24 h |
| 14 | Call failure spike | A | E (`usageAlerts.ts`) | no | Failure rate above threshold over a window | Alerted for the same provider inside 6 h | Fix the cause | View calls | `6 of 10 calls failed in the last hour` | `Check your agent's key and provider status.` | notification | Failure rate in the next window, from the ledger |
| 15 | Key issued | T | E-unwired | no | API key created. Cap: one per owner per 10 min, batched | none. Always send (Q6) | Security awareness | Review keys | `A new aecon key was created` | `Created 2 Jul 2026, 1:14 pm. Key ending 4f2a.` | notification | Support reply rate |
| 16 | Key revoked | T | E-unwired | no | API key revoked. Cap: one per owner per 10 min, batched | none | Confirm revoke | Review keys | `An aecon key was revoked` | `Revoked 2 Jul 2026, 1:14 pm.` | notification | none (notice only) |
| 17 | Account paused | T | E-unwired | no | Owner or operator pause | none | State what stopped | View account | `Your aecon account is paused` | `Calls are on hold. Here is why.` | notification | Support reply rate |
| 18 | Account restored | T | E-unwired | no | Pause cleared | none | Confirm resumed | View account | `Your aecon account is back on` | `Calls work again.` | notification | none |
| 19 | Role or membership changed | T | E-unwired | no | Member added, removed or role changed | none | Security awareness | Review team | `Sam is now an admin on your aecon account` | `Changed 2 Jul 2026, 1:14 pm by you.` | notification | Support reply rate |
| 20 | Email changed (to old and new address) | T | E-unwired | Hook only. Clerk fires the change, we send the notice | Clerk primary-email change webhook (`email-system.md:39,73`) | none. Never suppressed | Let the owner catch hijack | Contact support | `Your aecon email changed` | `If this wasn't you, contact support@aecon.ai.` | notification | Support reply rate |
| 21 | Data export ready | T | E-unwired (`data request`) | no | Export job complete after step-up auth | Link expired | Deliver the export | Download export | `Your aecon data export is ready` | `The link works until 3 Jul 2026, 1:14 pm.` | notification | Export link click (Resend clicked event) |
| 22 | Deletion requested | T | N | no | Owner requests account deletion (step-up auth passed) | Request cancelled | Confirm intent, state the grace period (Q8) | Confirm deletion | `Confirm deleting your aecon account` | `Nothing is deleted until you confirm.` | notification | Confirm link click, `deletion_cancelled` |
| 23 | Deletion completed | T | N | no | Deletion executed | none | Closure note. No retention claim until counsel confirms (Q9) | none (text only, the one exception to P3) | `Your aecon account was deleted` | `Your account is closed.` | notification, no CTA | none |
| 24 | Provider live | L | E (`capabilitySupply/publish/prepared.ts:388`) | no | Provider listing passes publish checks | none | Tell provider they can earn | View provider page | `Your service is live on aecon` | `Agents can now find and call it.` | notification | Click, first provider call |
| 25 | Provider offboarded | T | E (`verifyPages.ts:127`) | no | Provider removed or failed verification | none | State why and what next | View details | `Your service was removed from aecon` | `Here is what to fix to list it again.` | notification | Re-publish rate |
| 26 | Stalled: not funded | L | E (`stalled.ts`, `AE_STALLED_EMAILS_ENABLED` plus opt-in) | no | `signed_up` with no `funded` after 24 h | `funded`, owner opt-out | Get first top-up | Add credit | `Add credit to start using aecon` | `It takes about a minute.` | onboarding | `funded` within 48 h |
| 27 | Stalled: no agent | L | E (`stalled.ts`) | no | `funded` with no `agent_connected` after 48 h | `agent_connected` | Connect first agent | Connect an agent | `Connect your first agent to aecon` | `Your {balance} is ready to spend.` | onboarding | `agent_connected` within 72 h |
| 28 | Stalled: never called | L | E (`stalled.ts`) | no | `agent_connected` with no `first_call` after 72 h | `first_call`, or row 34 already sent | Get first call | Make a first call | `Your agent is connected. Make a first call` | `Your agent is ready to make its first call.` | onboarding | `first_call` within 72 h |
| 29 | First call done | L | N | no | `first_call` then `activated` | none | Reinforce, show the receipt trail | View call | `Your first aecon call: charged {amount}` | `See exactly what was charged and why.` | order summary | Click, `topped_up` later |
| 30 | Week one wrap | L | N | no | `retained_w1` computed at day 7 (scheduled exception, P1) | Zero calls in week (P8) | Habit, cost clarity | View statement | `Your first week on aecon: {n} calls` | `{spent} spent. Balance {balance}.` | order summary | Week-two call count |
| 31 | Operator digest | O | E (`operator-digest.tsx`, `operator_digest` not found in the kind union, verify) | no | Daily cron (scheduled exception, P1) | Nothing changed since last digest (P8) | Operator awareness | Open console | `aecon operator digest: 3 items need you` | `2 refunds, 1 stuck payment.` | notification with list | Console visit |
| 32 | Auto top-up failed | T | N | no | `auto_topup_failed` (card declined on the automatic charge) | A later successful top-up | Keep service running | Update card | `Your automatic top-up didn't go through` | `Add a working card before your credit runs out.` | notification | `topped_up` within 24 h |
| 33 | Card added or removed | T | N | no | Stripe payment method attached or detached | none | Security awareness | Review payment methods | `A payment card was changed on your aecon account` | `Changed 2 Jul 2026, 1:14 pm.` | notification | Support reply rate |
| 34 | First call failed | L | N | no | First provider call after `agent_connected` fails, before any `first_call` | `first_call` | Unblock a stuck first call | View call | `Your agent's first call didn't complete` | `Check the call details and your agent's key.` | notification | `first_call` within 72 h |
| 35 | Deletion cancelled | T | N | no | `deletion_cancelled` | none | Confirm account is kept | View account | `Your aecon account deletion was cancelled` | `Nothing was deleted.` | notification | none |
| 36 | Deletion final reminder | T | N | no | Grace period ends in 3 days (length per Q8) | Request cancelled | Last chance to cancel | Cancel deletion | `Your aecon account will be deleted soon` | `Cancel before {date}, {zone} to keep it.` | notification | `deletion_cancelled` within 3 days |

Row count: 36 (3 Clerk-owned, 33 aecon-sent). Existing and wired: 4, 5, 9, 10, 11, 13, 14, 24, 25, 26, 27, 28, 31 (13 rows). Existing, kind present but not wired: 6, 7, 8, 12, 15, 16, 17, 18, 19, 20, 21 (11 rows). New: 22, 23, 29, 30, 32, 33, 34, 35, 36 (9 rows). Status of 8 follows `email-system.md:185` (statement listed as not wired).

---

## 5. Onboarding sequence

Hybrid per P1 and P2: one instant message, then milestone triggers with a delay and an exit. No calendar drip beyond the welcome.

```
signed_up
  +0 min   Welcome (4)                      exit: funded
  +24 h    Stalled: not funded (26)         exit: funded
funded
  +0 min   Funding receipt (5)              always
  +48 h    Stalled: no agent (27)           exit: agent_connected
agent_connected
  +72 h    Stalled: never called (28)       exit: first_call
  first call fails: First call failed (34)  exit: first_call
first_call / activated
  +0 min   First call done (29)             once
  day 7    Week one wrap (30)               once, skip if zero calls
topped_up (second time)  -> enter habit stream, no more lifecycle mail
```

Rules:

- Delay and exit are checked at send time, not at schedule time (P4). The sender re-reads the owner's journey state immediately before enqueue.
- Suppression: any later milestone cancels earlier pending nudges. Owner opt-out in `/owner/settings/notifications` cancels all lifecycle mail. Transactional and security mail ignore lifecycle opt-out. Alert mail follows the alert switch, except row 12.
- Caps: at most one lifecycle email per owner per 24 hours and at most 4 in the first 14 days. The diagram can in theory reach 6 (4, 26, 27, 28, 29, 30). When the cap would be exceeded, drop in this order: 30, 26, 28, then 29. Welcome (4) and 27 are never dropped. Each stalled nudge sends once per owner, never repeats.
- Alert and notice caps: refunds, key issued and revoked batch to one per owner per 10 min. Approvals send one per request, then a single `N requests waiting` after 5 per hour. Low credit re-arms only above 2x its threshold. Spend cap once per period. Failure spike once per 6 h per provider. Credit exhausted (12) is non-suppressible.
- Unsubscribe: every lifecycle email has a visible link and a one-click `List-Unsubscribe-Post` endpoint (build task B18). The route sets the owner's lifecycle opt-out and emits `lifecycle_unsubscribed`. Settings alone is not enough.
- Consent basis: each lifecycle send stores a `consentBasis` (express at sign-up, or inferred from the account relationship) on the email row, and enqueue refuses a send with none. Owner opt-out alone does not establish consent. Which basis applies to the welcome and the `Add credit` nudges is Q10; Spam Act 2003 (Cth) s18 text is not checked against ACMA.
- Timing: the methodology source suggests a first nudge 30 to 60 minutes after sign-up [helply, vendor blog, weak]. We keep the first nudge at 24 h to avoid a second email while the welcome is fresh, and A/B 1 h against 24 h once volume allows (measurement, section 7).
- Quiet hours: lifecycle mail holds until 8:00 am to 8:00 pm in the owner's timezone. Transactional and alert mail never waits. If no timezone is known, fall back to Australia/Sydney.
- Gate: `AE_STALLED_EMAILS_ENABLED` plus owner opt-in stay as they are (`stalled.ts:34,40`). The welcome stays behind the Phase 3 gate until Joel signs off (Q5).
- Stalled state definitions stay as in `convex/lib/journey/stalled.ts:8-12`.

---

## 6. Receipts spec

Principle: aecon owns the receipt. Stripe's own receipt email is turned off (Settings > Business > Customer emails > Payments > Successful payments) [R docs.stripe.com/receipts]. Also check Settings > Billing > Subscriptions and emails > "Send finalised invoices" for a second duplicate [R docs.stripe.com/invoicing/send-email]. Caveat from Stripe: with the setting off and an auto-charged invoice, the customer gets nothing from Stripe, so aecon's send must be reliable before the switch is flipped (task B16 ordering).

Title: "Receipt", not "Tax invoice", until GST status is confirmed. A non-GST-registered business must not say "tax invoice" or show GST [R reckon.com]. ATO pages returned 403 in research, so every ATO figure below is from secondary sources and needs checking with the ATO or an accountant before launch.

### 6.1 Top-up receipt (kind 5)

Source: ledger credit row and the Stripe charge, read at send time. Nothing is cached in the template props that the ledger can supply.

| Field | Source | Note |
|-------|--------|------|
| Title | constant `Receipt` | switches to `Tax invoice` only via one flag, `GST_REGISTERED`, see Q2 |
| Receipt number | ledger receipt id, format `AE-####` | unique, sequential per ledger |
| Date and time | ledger `createdAt`, recipient timezone | `2 Jul 2026, 1:14 pm {zone}`, abbreviation from the date |
| Customer name and email | account owner | |
| Seller legal name, ABN, address | `EMAIL_LEGAL_LINES` constant (placeholder) | pending Joel. Not rendered while empty, so receipt is not issued as a compliant document until filled (Q2) |
| Line | `aecon credit` with credit amount | one item in the receipt block |
| GST | omitted while unconfirmed. When registered: a GST line, or "Total includes GST" | amount shown from ledger, not recomputed in the template |
| Total charged | Stripe confirmed amount | only after Stripe confirms (P13) |
| Payment method | card brand and last four from Stripe | |
| New credit balance | ledger balance after this credit | |
| Receipt link | hosted receipt route in the aecon app | does not expire. Stripe's links expire after 30 days [R], so we do not link to Stripe |
| Support and privacy | support address, privacy URL | Stripe also requires these on its own receipts [R] |

Record keeping: a secondary source suggests 5 years for GST records, but the ATO pages returned 403 and it is unchecked. No retention period appears in any email copy until counsel confirms it (Q9). The receipt number and rendered content stay reproducible from the ledger.

Under A$1,000 the tax invoice minimum is: the words "tax invoice", seller identity and ABN, issue date, item description with quantity and price, and GST shown as an amount or "total includes GST" [R sprintlaw, invoicemama, secondary]. Buyer right to a tax invoice starts at A$82.50 including GST, and the buyer-identity threshold is unclear in the sources (likely A$1,000). Our top-ups can exceed A$82.50, so Q2 matters.

### 6.2 Call statement (kind 8, plus the per-call row in 29)

| Field | Source |
|-------|--------|
| Period | statement month |
| Call id | ledger call id |
| Timestamp | call time, recipient timezone |
| Provider and product | provider name and product title (not "endpoint") |
| Units and unit price | ledger |
| Subtotal, GST (when applicable), total | ledger |
| Running balance | ledger |
| Link to originating top-up receipt | receipt route |

Statements over 25 rows show the first 25 and a line `N more calls`, with no second link. The single CTA, View statement, opens the full list.

---

## 7. Measurement

Metric per email is in the catalogue. Tracking:

- Links: every link built through `emailUrl`, which wraps `withUtm` with `utm_source=aecon`, `utm_medium=email` (`src/emails/links.ts` [REPO]). Add `utm_campaign=<kind>` and `utm_content=<slot>` (cta or footer) in one place in `emailUrl`. No per-template UTM strings.
- Product events: PostHog, using the journey events already in `observability/internal/schema.ts:16-19`. Each metric of the form "`funded` within 48 h" is a PostHog funnel from `email_sent(kind)` to the event, with the person joined by owner id.
- Delivery events: Resend webhooks (delivered, bounced, complained, opened, clicked) stored against the email row. Track delivery and bounce rate per kind over time [M Postmark]. Opens are directional only, since Apple Mail Privacy Protection inflates them, and no catalogue metric uses them. Click and downstream event are the metrics that count. Support reply rate: replies go to `support+<kind>@aecon.ai` (Reply-To), counted from Resend received email per kind in 7 days.
- Experiments: A/B journey completion against a time-based baseline [Customer.io snippet, weak]. First test: row 26 at 1 h vs 24 h. Holdout 10% for lifecycle only. Never hold out transactional, alert or security mail.
- Health thresholds: bounce under 2%, complaint under 0.1%, lifecycle unsubscribe under 1% per send, measured from our own `lifecycle_unsubscribed` events (the Resend webhook list does not report unsubscribes). These are working numbers, not sourced, and are revisited after 30 days of data.

---

## 8. Build plan

Ordered, atomic: one file or one template per task. Each ends in a verify that is real use (render and send to a Resend sandbox address, or run the existing code path), not a new test suite (project rule 10). No task sends to real customers.

| # | Task | File | Verify |
|---|------|------|--------|
| B1 | Rasterise the Forest symbol to a 2x PNG at 96px for the header tile, add to brand assets. Keep horizontal lockup out. | `public/brand/email/aecon-symbol-forest-400.png` (check existing) | open the PNG, confirm transparent and sharp |
| B2 | Confirm emailcn licence (Q3), configure the `@emailcn` namespace, install `theme-<id>`, rename to `aeconTheme`, read llms.txt and the installed notification, receipts and onboarding blocks and the Ecommerce Order Summary component, record real slugs, props and token keys | `components.json`, `src/emails/theme.ts` | `npx tsc --noEmit` on the file, token list pasted into this doc section 2.1 |
| B3 | Add `EMAIL_LEGAL_LINES` handling, `GST_REGISTERED` flag (default false), and the enqueue gate that refuses L-stream and receipt sends while the lines are empty | `src/emails/brand.ts`, `enqueue.ts` | `tsc`, enqueue of a lifecycle kind with empty lines is refused |
| B4 | Extend `emailUrl` with `utm_campaign` and `utm_content` | `src/emails/links.ts` | print one URL from a `npx tsx` one-liner and read the params |
| B5 | Rebuild `layout.tsx` as the one skeleton (2.3), with dark media query, unsubscribe link and plain-text-safe structure | `src/emails/layout.tsx` | render one existing template to HTML and plain text, open both |
| B6 | Install and adapt the emailcn notification block (slug from B2) into the skeleton body slot | `src/emails/blocks/notification.tsx` | render a stub with `ctaLabel` and `ctaHref` |
| B7 | Receipt hosted route (non-expiring link target), built first because the receipt email links to it | one route file under the owner app | open the route with a ledger receipt id |
| B8 | Funding receipt template on the receipts block or Order Summary component, fields per 6.1, data from ledger at send time | `src/emails/templates/funding-receipt.tsx` | trigger a Stripe test top-up on dev, read the received message in Resend sandbox, open its receipt link |
| B9 | Migrate `account-notice.tsx` kinds onto the notification block, one kind per commit-sized edit, starting with the kinds already rendering (count them from the render switch first) | `src/emails/templates/account-notice.tsx` | render each kind via the existing render switch, scan for banned words with grep (section 3) |
| B10 | Same for `agent-approval.tsx`, `usage-alert.tsx`, `stalled-step.tsx` | one file each | render each, check the single-CTA rule by counting `<a>` tags |
| B11 | `statement-ready.tsx` with order summary table and the 25-row cap, then `operator-digest.tsx` | one file each | render with a fixture of 30 calls and with zero (must skip) |
| B12 | Wire the unwired kinds in this order: funding failed, payment stuck, credit exhausted, key issued and revoked, pause and restore, role, email changed, data export | `enqueue.ts` plus one call site each | trigger each state on dev, confirm one email, confirm suppress-if |
| B13 | New kinds 22, 23, 29, 30, 32 to 36 added to the kind union and templates | `convex-schema.ts`, new template files | `convex dev` typecheck, render each |
| B14 | Welcome and onboarding timing with exits, caps and quiet hours read at send time | `provisioning.ts`, `stalled.ts`, enqueue path | walk one test account through the journey on dev, confirm sequence in section 5 |
| B15 | Resend webhook to email row and PostHog `email_sent` event | webhook route, `enqueue.ts` | send one sandbox email, see delivered event and the PostHog event |
| B16 | Turn off Stripe automatic receipts and the finalised invoice email (Joel, in the dashboard) only after B3 is filled in and B8 and B15 pass on hosted | Stripe dashboard | one live top-up produces exactly one receipt, from aecon |
| B18 | One-click unsubscribe route, `List-Unsubscribe` headers on L-stream sends, `consentBasis` stored at enqueue, `lifecycle_unsubscribed` event. Must land before B14 | unsubscribe route, `enqueue.ts` | send a sandbox lifecycle email, confirm headers, click unsubscribe, confirm opt-out set |
| B17 | Clerk dashboard: align verification, sign-in and invite email appearance to the tokens (logo, colours, sender) | Clerk dashboard | send a Clerk test email and compare |

---

## 9. Open questions for Joel

1. Button colour. Brand sources disagree: Forest `#24543D` (S:69, R:36) versus chalk or charcoal (D:72). This doc assumes Forest with a Chalk border for dark-mode contrast. Confirm.
2. GST status. Is aecon registered for GST? If yes, receipts become "Tax invoice" with ABN and a GST line, and A$82.50 and A$1,000 thresholds matter. If no, "Receipt" stays and no GST is shown. Also needed: company name, ABN and address (the pending placeholder).
3. emailcn licence. Not stated on the pages fetched. Is it acceptable to ship its blocks in a closed-source product? Someone needs to read the registry licence before B2.
4. Replies inbox. Which monitored address receives replies (support@aecon.ai assumed in examples)?
5. Welcome email. Phase 3 gate is currently off. Can the redesigned welcome (row 4) go live with the stalled sequence, or does it wait for the full onboarding review?
6. Key issued notice. Send for every key creation, or only keys created outside the owner's active console session? This doc now says every key creation, batched at 10 min.
7. Clerk email appearance. Is Clerk's branded-email plan enabled so B17 can match the tokens, or do Clerk emails stay stock?

8. Deletion grace period. How many days between confirmation and deletion? Row 36 fires 3 days before it ends.
9. Record retention. Counsel or accountant to confirm the retention period for receipts and GST records. No email states a period until then.
10. Consent basis. Is the welcome and `Add credit` nudge covered by express consent at sign-up or inferred consent? Spam Act 2003 (Cth) ss17-18 text is unchecked against ACMA, so counsel should confirm the wording and the sender identity (company name, ABN, address) before any L-stream send.

---

## Review notes

Two reviews (lifecycle, brand and compliance) applied on 2026-10-11. All mustFix items applied. Rejected or reshaped:

- Move row 6 to lifecycle: rejected. A failed payment is a transactional event. Instead the trigger is narrowed to `payment_intent.payment_failed` and the abandonment trigger `checkout.session.expired` is dropped.
- "Rows 16 and 23 have no CTA": row 16 does have one (Review keys). Row 23 is the single named exception to the one-button rule.
- Statement 'View all calls' link: resolved by removing the link, not by relaxing P3.
- Quiet-hour and cap values (10 min batching, 2x hysteresis, drop order) are working numbers chosen here, not sourced. Revisit after 30 days of data.
- Dark-mode contrast: added a border as a mitigation but not measured. Still verify with a render before Q1 closes.
