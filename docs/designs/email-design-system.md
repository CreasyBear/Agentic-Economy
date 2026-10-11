# aecon email design system

Status: updated with Joel's decisions, 2026-10-11. Scope: every outgoing aecon email (receipts, alerts, lifecycle, operator). Companion to `docs/designs/email-system.md` (architecture, kinds, queue) and `docs/designs/design-system-spec.md` (app UI tokens, voice). Where this doc and the app's own docs disagree on brand, the website wins (D1).

## Decisions

Dated 2026-10-11, Joel. Authoritative over anything else in this doc.

| # | Decision | Closes |
|---|----------|--------|
| D1 | Brand source of truth is the live website https://aecon.ai and its repo `/Users/joelchan/Documents/Coding/App-Dev/live/agentic-economy-website` (read-only reference). Email tokens match what the website ships (section 2.1, each token cites file:line), not the app's docs. | old Q1 (button colour) |
| D2 | Legal identity: Agentic Economy Technologies Pty Ltd, ABN 98 700 838 115, trading as Agentic Economy, brand aecon, Western Australia. No street address is published, so none is rendered and none is invented. Contact and reply-to: support@aecon.ai. ABN matches `agentic-economy-website/src/data/site.ts:4`. | old Q2 (identity), old Q4 (replies inbox), pending footer constant |
| D3 | aecon is GST registered. GST applies only on loading credit. The credit top-up email is a "Tax invoice" (section 6.1). Call receipts and statements are plain "Receipt" and "Statement" with no GST line. | old Q2 (GST) |
| D4 | aecon sends its own receipts. Joel turns Stripe automatic receipts off. | earlier decision, kept |
| D5 | Welcome email is built now and stays behind its existing gate (`provisioning.ts:340`). | old Q5 |
| D6 | Key issued notice: every key creation, batched at 10 minutes. | old Q6 |
| D7 | No email states a record-retention period. | old Q9 |
| D8 | Every email is built from emailcn blocks and components via its registry. Licence checked: MIT (section 2.5). Never hand-roll markup that an emailcn item provides. | old Q3 (licence) |
| D9 | Everything stays dark: no new send path is enabled by default. Each new kind ships behind its own off-by-default switch. | |
| D10 | React Email and Resend stay. The sending domain aecon.ai is verified in Resend. | earlier decision, kept |

Research tags used below: [EC] emailcn, [M] methodology, [R] receipts, [REPO] repo state, [B] app brand and voice sources, [W] website repo (paths relative to `agentic-economy-website`). Source claims from vendor blogs are practitioner consensus, not measured results, and are marked as such.

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

Source: the website, not `src/emails/brand.ts`. Every value below was read from the website repo on 2026-10-11 and cites `file:line` relative to `agentic-economy-website`. The website is Tailwind v4 CSS variables with a light `:root` and a `.dark` block; email maps these to a light base plus a dark media query (2.4). Emailcn exposes one shared `EmailTheme` shape converted by `createEmailTailwindConfig(defaultTheme)` into the React Email `Tailwind config` prop [EC /docs/theming]. We write one `aeconTheme` object from this table and check each key against the vendored theme file (task T1 vendors it, T2 writes it).

| Token | Light | Dark | Website source |
|-------|-------|------|----------------|
| Page background | `#E8E4DA` (chalk) | `#141414` | `src/styles.css:77` light, `:113` dark |
| Text | `#141414` | `#E8E4DA` | `src/styles.css:78` light, `:114` dark |
| Card surface | `#F2EFE7` | `#1E1E1E` | `src/styles.css:79` light, `:115` dark |
| Muted text | `#595854` | `#B5B3AE` | `src/styles.css:88` light, `:124` dark |
| Hairline and borders | `#C5C1B8` | `#404040` | `src/styles.css:92` light, `:128` dark. Solid hexes, so no pre-mixing is needed |
| Button fill and text (primary) | fill `#141414`, text `#E8E4DA` | fill `#E8E4DA`, text `#141414` | `src/styles.css:83-84` light, `:119-120` dark, applied by `src/components/ui/button.tsx:10-11` (`bg-primary text-primary-foreground`) |
| Forest (brand accent, footer band) | `#24543D` | `#24543D` | `src/styles.css:72` (`--brand-forest`); footer band `src/components/layout/footer.module.css:3` |
| Footer text on forest | chalk `#E8E4DA` | same | `src/components/layout/footer.module.css:4` |
| Footer muted text on forest | `#C1C7BB` | same | `footer.module.css:6-10` mixes chalk 80% into forest (oklch); pre-mixed here in sRGB, approximate |
| Footer divider on forest | `#4F745F` | same | `footer.module.css:12` mixes chalk 22% into forest (oklch); pre-mixed in sRGB, approximate |
| Footer link hover gold | `#DFCA93` | same | `footer.module.css:35` (hover). Email has no hover, so gold is not used in email v1 |
| Failure and error text | `#941D14` | `#FF9185` | `src/styles.css:91` light, `:127` dark |
| Control and card radius | 10px (button, card) | same | `--radius: 0.625rem` at `src/styles.css:103`; button uses `rounded-lg` (`button.tsx:6`) which is `--radius` (`styles.css:53`) |
| Button height | 44px | same | `h-11` at `button.tsx:24` |
| Footer link radius | 4px (focus only, not used in email) | | `footer.module.css:32` |

Correction to the earlier draft: the website's primary button is charcoal on chalk in light and chalk on charcoal in dark. Forest is the accent and the footer band, not the button fill. The earlier Forest button with a Chalk border is dropped, and the 2.1:1 Forest-on-Charcoal concern no longer applies. The brand-border token `#7F817B` (`styles.css:76`) is not used.

Rules: inline styles only (Tailwind output is inlined by React Email). No gradients, no shadows. Regular (400) and medium (500) weights only [B] S:168. Contrast pairs above are the website's own choices and have not been measured for email; the render check in task T4 confirms legibility in light and dark.

### 2.2 Type

The website's face is Manrope Variable loaded from `@fontsource-variable/manrope` (`src/styles.css:4`, `package.json:23`, token `--font-sans: "Manrope Variable", sans-serif` at `src/styles.css:16`, applied to `body` at `:170`). Mail clients do not run that CSS. Email stack: `Manrope, -apple-system, 'Segoe UI', Arial, Helvetica, sans-serif`. Manrope applies only where installed; Arial is the real face for most readers and the layout must hold in it. We do not load a webfont, because many clients block it and the fallback must be good enough. Sizes: body 16px / 24px, small print 13px / 20px, heading 22px / 28px at weight 500. Sentence case everywhere, no uppercase, no eyebrows. The website's `.eyebrow` (`src/styles.css:196-203`, uppercase 700) is a website pattern and is not used in email [B] S:168.

### 2.3 The one skeleton

Every email, with no exceptions, renders this order. Slots map to emailcn items (2.5).

```
[preheader, hidden]
HEADER      logo tile + "aecon" wordmark text
HEADING     one line, sentence case
LEAD        1 to 2 sentences: what happened, then money state (P13)
BODY SLOT   one of: tax invoice | receipt table | notification body | statement table | steps list | digest list
CTA         exactly one button (P3). Sole exception: row 23, text only, no button
REASON      one line: why you got this, and who triggered it (P9)
FOOTER      forest band: legal identity, settings link, unsubscribe link (lifecycle), support address, privacy link
```

- Container: `max-w-container mx-auto` per emailcn [EC /docs/installation], pinned to 560px in our theme because emailcn gives no pixel width. Side padding 24px, 16px at narrow widths.
- Header: the Forest symbol on a Chalk tile so it stays legible in dark mode. Asset: `public/brand/aecon-symbol-forest-400.png` in the website repo (PNG exists, SVG is dropped by many clients). The platform repo already holds a copy at `public/brand/email/aecon-symbol-forest-400.png`. The horizontal lockups are SVG only and are not used in email.
- Footer: a forest band (`footer.module.css:3`) with chalk text, and the chalk and gold symbol, the same pairing the website footer uses (`src/components/layout/footer-2.tsx:18`, SVG there; email uses the 400px PNG `public/brand/aecon-symbol-chalk-gold-400.png`, copied into `public/brand/email/` by task T3). Legal line, rendered from the `EMAIL_LEGAL_LINES` constant in `src/emails/brand.ts`: `Agentic Economy Technologies Pty Ltd, ABN 98 700 838 115, trading as Agentic Economy. Western Australia.` Then `support@aecon.ai`, settings link, privacy link, and for lifecycle mail the unsubscribe link. The website footer shows the ABN as a link to the ABR lookup (`footer-2.tsx:33`, `src/data/site.ts:5`); email does the same. No street address appears anywhere. It is not published, so it is never invented, and the constant has no address field.
- Button: one style from the emailcn `button` component, restyled by our theme (2.1): 44px minimum height, 10px radius, charcoal fill with chalk text in light, chalk fill with charcoal text in dark, label under 4 words, bulletproof (table based, as the emailcn component provides).

### 2.4 Dark mode

Approach: light palette inline as the base, then `@media (prefers-color-scheme: dark)` overrides in a `<style>` in the head, plus `color-scheme` and `supported-color-schemes` meta. Clients that ignore the media query (older Outlook, some Gmail modes) show light, which must remain fully legible. The dark values are the website's `.dark` block (`src/styles.css:112-138`, table in 2.1). The button flips with the palette, so no border is needed. Header logo: Chalk tile with Forest symbol in both modes, so no asset swap is needed. The footer band is Forest in both modes.

### 2.5 Which emailcn items we install, and the slot each fills

Source of truth: https://www.emailcn.run/llms.txt. Install is `npx shadcn@latest add @emailcn/react-email/<slug>` after adding the `@emailcn` namespace to `components.json` [EC /docs/installation]. Slugs below were read from the emailcn docs pages on 2026-10-11; props and token keys are read from the vendored files in task T1, and recorded in the file headers.

**Licence.** emailcn is MIT licensed. Evidence: the emailcn docs FAQ ("released under the MIT License", https://www.emailcn.run/docs, structured data `license` field), and the repository LICENSE at https://github.com/shadcn-labs/emailcn/blob/main/LICENSE ("MIT License, Copyright (c) 2026 Shadcn Labs", read 2026-10-11). MIT permits use in closed-source products provided the copyright and permission notice are kept. Obligation: keep the notice in `src/emails/vendor/emailcn/LICENSE`, created by task T1. D8 is satisfied.

| Slot | Registry slug | Used by | Fit |
|------|---------------|---------|-----|
| Theme | `theme-*` item, edited into `aeconTheme` | all | the one shared theme object (T2) |
| Header | `header-with-logo` | all | logo tile slot of the skeleton |
| Notification body and CTA | `block-notification-default` | approval, alerts, stalled, provider, role, key, pause | direct |
| Receipt and tax invoice | `block-receipt-default` | funding receipt (tax invoice) | direct. Rows: credit amount, service fee, GST, total, as in 6.1 |
| Order summary table | `order-summary-table` | refunds, call statement, rows 29 and 30 | closer fit for refunds and statements than the receipt block |
| Onboarding | `block-onboarding-default` | welcome, stalled steps | direct |
| Button | `button` | every CTA | the one button style |
| Footer | `utility-footer` | every email | restyled to the forest band (2.3) |
| Authentication, Invitations, Newsletter | not installed | none | Clerk owns verification, sign-in and invite; no newsletter in scope |

No gap is hand-rolled by default. Only if the vendored files show none fits does a template fall back to `Section`, `Row`, `Column` from `@react-email/components` 1.0.12 [REPO package.json:95], and then it records the named emailcn reference it copied from (P15).

---

## 3. Voice and copy

Sources: [B] V:7-23, S:142-185, R:53. Vocabulary: "aecon" in UI and email copy. The legal name "Agentic Economy Technologies Pty Ltd" appears only in the footer legal line and the tax invoice supplier field (D2). "Credit", "call", "provider", "receipt". Never: capability, endpoint, listing, wallet, readiness, evidence, sorry, invalid, unlock, seamless, leverage, US$ [B] V:13, S:142-153. No em dashes, no uppercase, no Title Case, no exclamation marks.

| Element | Rule | Do | Don't |
|---------|------|----|-------|
| Subject | About 50 characters. Key fact first. Sentence case. No prefix tags. Amounts come from the ledger, never hardcoded. | `Tax invoice for your A$22.00 aecon top-up` | `Your Tax Invoice From Agentic Economy!` |
| Preheader | Adds what the subject could not fit. Never repeats it. | `A$20.00 credit added. New balance A$34.20.` | `View this email in your browser` |
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
| 5 | Funding tax invoice (redesign, also auto top-up success) | T | E (`enqueue.ts:155`) | no | Stripe `checkout.session.completed` or auto top-up charge confirmed, and ledger credit row written | none. Always send | Provide the tax invoice, show new balance | View receipt | `Tax invoice for your {total} aecon top-up` | `{credit} credit added. New balance {balance}.` | receipt | Delivered, bounce rate, receipt link click |
| 6 | Funding failed | T | E-unwired | no | Stripe `checkout.session.async_payment_failed` (the only failure event the pipeline ingests; `payment_intent.payment_failed` is not mapped). `checkout.session.expired` is refused at the webhook, so it cannot reach the send, and it is an abandonment nudge, not sent | A later successful top-up for the same session | Recover the top-up | Try again | `Your {amount} top-up didn't go through` | `Try again or use another card.` | notification | `topped_up` within 48 h |
| 7 | Payment stuck | T | E-unwired (`stuck`) | no | Charge pending beyond N minutes with no Stripe confirmation | Resolved before send | Prevent double payment | View receipt | `We're still confirming your {amount} payment` | `Check the receipt before paying again.` | notification | Receipt link click, then no second charge within 1 h |
| 8 | Call statement (monthly) | T | E (`statement-ready.tsx`, unwired) | no | Month closed, at least 1 call in the month (scheduled exception, P1) | Zero calls in the month (P8) | Show what was spent | View statement | `Your aecon statement for September 2026` | `{total} across {n} calls.` | order summary | Statement link click |
| 9 | Task refunded | T | E (`moneyManagedCallRemedy.ts:180`, `moneyX402Expiry.ts:123`) | no | Refund ledger row written. Cap: one per owner per 10 min, later refunds roll into the next send | none | Confirm money returned | View receipt | `Refunded A$0.003 for a failed call` | `Call AE-77 on 2 Jul 2026, 1:14 pm.` | order summary | Click, support reply rate |
| 10 | Agent approval request | T | E (`enqueue.ts:140`) | no | Agent action over the approval threshold, request created. Cap: one per request, after 5 per hour a single `N requests waiting` | Request already decided or expired | Get a decision | Review request | `Your agent wants to spend A$5.00` | `Approve or decline before 3 Jul 2026, 1:14 pm.` | notification | Decision time, approve rate |
| 11 | Low credit | A | E (`usageAlerts.ts`) | no | Balance crosses below the owner's threshold, once per crossing. Re-arms only after balance rises above 2x the threshold (hysteresis) | Auto top-up on, or balance topped up since | Prevent a stalled agent | Add credit | `Your aecon credit is low: A$2.10 left` | `Calls pause when it reaches A$0.00.` | notification | `topped_up` within 24 h |
| 12 | Credit exhausted | T (non-suppressible, ignores the alert switch) | E-unwired | no | Balance reaches zero and a call is refused | Topped up since | Restore service | Add credit | `Your aecon credit has run out` | `Calls are paused until you add credit.` | notification | `topped_up` within 6 h |
| 13 | Spend cap reached | A | E (`usageAlerts.ts`) | no | Monthly cap hit (code ceiling is monthly, `usageAlerts.ts:67`). Once per period | Cap raised since | Tell owner calls are held | Review cap | `Monthly limit of {cap} reached` | `Calls resume on {date}, {zone}.` | notification | `spend_cap_changed` within 24 h |
| 14 | Call failure spike | A | E (`usageAlerts.ts`) | no | Failure rate above threshold over a window | Alerted for the same provider inside 6 h | Fix the cause | View calls | `6 of 10 calls failed in the last hour` | `Check your agent's key and provider status.` | notification | Failure rate in the next window, from the ledger |
| 15 | Key issued | T | E-unwired | no | API key created. Cap: one per owner per 10 min, batched | none. Always send (D6) | Security awareness | Review keys | `A new aecon key was created` | `Created 2 Jul 2026, 1:14 pm. Key ending 4f2a.` | notification | Support reply rate |
| 16 | Key revoked | T | E-unwired | no | API key revoked. Cap: one per owner per 10 min, batched | none | Confirm revoke | Review keys | `An aecon key was revoked` | `Revoked 2 Jul 2026, 1:14 pm.` | notification | none (notice only) |
| 17 | Account paused | T | E-unwired | no | Owner or operator pause | none | State what stopped | View account | `Your aecon account is paused` | `Calls are on hold. Here is why.` | notification | Support reply rate |
| 18 | Account restored | T | E-unwired, gated by `AE_EMAIL_KIND_ACCOUNT_RESTORED_ENABLED`, no call site because no restore transition exists in code (only freeze, isolate, inspect) | no | Pause cleared | none | Confirm resumed | View account | `Your aecon account is back on` | `Calls work again.` | notification | none |
| 19 | Role or membership changed | T | E-unwired | no | Member added, removed or role changed | none | Security awareness | Review team | `Sam is now an admin on your aecon account` | `Changed 2 Jul 2026, 1:14 pm by you.` | notification | Support reply rate |
| 20 | Email changed (T13 sends to the current address only: Clerk gives the app a digest of the address, not the old plaintext, so the old address is unreachable until a decision to store it. First sighting of an address is a silent baseline) | T | E-unwired | Hook only. Clerk fires the change, we send the notice | Clerk primary-email change webhook (`email-system.md:39,73`) | none. Never suppressed | Let the owner catch hijack | Contact support | `Your aecon email changed` | `If this wasn't you, contact support@aecon.ai.` | notification | Support reply rate |
| 21 | Data export ready | T | E-unwired (`data request`) | no | Export downloaded (T13 reality: the export streams straight from the signed-in route, there is no job or link, so the kind `data_request_received` now means downloaded; at most one per day) | none | Security awareness | Review settings | `Your aecon data export was downloaded` | `If this wasn't you, contact support@aecon.ai.` | notification | Export link click (Resend clicked event) |
| 22 | Deletion requested | T | N | no | Owner requests account deletion (step-up auth passed) | Request cancelled | Confirm intent, state the grace period (Q2) | Confirm deletion | `Confirm deleting your aecon account` | `Nothing is deleted until you confirm.` | notification | Confirm link click, `deletion_cancelled` |
| 23 | Deletion completed | T | N | no | Deletion executed | none | Closure note. No retention claim (D7) | none (text only, the one exception to P3) | `Your aecon account was deleted` | `Your account is closed.` | notification, no CTA | none |
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
| 36 | Deletion final reminder | T | N | no | Grace period ends in 3 days (length per Q2) | Request cancelled | Last chance to cancel | Cancel deletion | `Your aecon account will be deleted soon` | `Cancel before {date}, {zone} to keep it.` | notification | `deletion_cancelled` within 3 days |

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
- Unsubscribe: every lifecycle email has a visible link and a one-click `List-Unsubscribe-Post` endpoint (build task T12). The route sets the owner's lifecycle opt-out and emits `lifecycle_unsubscribed`. Settings alone is not enough.
- Consent basis: each lifecycle send stores a `consentBasis` (express at sign-up, or inferred from the account relationship) on the email row, and enqueue refuses a send with none. Owner opt-out alone does not establish consent. Which basis applies to the welcome and the `Add credit` nudges, and the exact consent wording, is Q3. T15 stores `inferred` for the welcome as a provisional placeholder only; counsel still has to settle the basis and wording before any L-stream send, and the gate keeps it dark. Spam Act 2003 (Cth) s18 text is not checked against ACMA.
- Timing: the methodology source suggests a first nudge 30 to 60 minutes after sign-up [helply, vendor blog, weak]. We keep the first nudge at 24 h to avoid a second email while the welcome is fresh, and A/B 1 h against 24 h once volume allows (measurement, section 7).
- Quiet hours: lifecycle mail holds until 8:00 am to 8:00 pm in the owner's timezone. Transactional and alert mail never waits. If no timezone is known, fall back to Australia/Sydney.
- Gate: `AE_STALLED_EMAILS_ENABLED` plus owner opt-in stay as they are (`stalled.ts:34,40`). The welcome stays behind the Phase 3 gate per D5.
- Stalled state definitions stay as in `convex/lib/journey/stalled.ts:8-12`.

---

## 6. Receipts spec

Principle: aecon owns the receipt (D4). Stripe's own receipt email is turned off by Joel (Settings > Business > Customer emails > Payments > Successful payments) [R docs.stripe.com/receipts]. Also check Settings > Billing > Subscriptions and emails > "Send finalised invoices" for a second duplicate [R docs.stripe.com/invoicing/send-email]. Caveat from Stripe: with the setting off and an auto-charged invoice, the customer gets nothing from Stripe, so aecon's send must be reliable before the switch is flipped (task T17 ordering).

GST (D3): aecon is registered. GST applies only on loading credit, so only the top-up email is a tax invoice. Call receipts, refunds and statements are plain "Receipt" and "Statement" with no GST line. The ATO pages returned 403 in earlier research, so the field list below follows Joel's instruction and is not re-checked against ATO text; the A$1,000 buyer rule is Joel's.

### 6.1 Top-up tax invoice (kind 5)

Source: the funding command, read at send time. The command carries `principalUnits`, `serviceFeeUnits`, `taxUnits` and `totalUnits` (written at `convex/moneyStripeWebhookWorker.ts:98`; the audit that reads them and asserts principal plus fee plus tax equals total is `convex/lib/money/treasury/fundingAudit.ts:83-85`, with the amount mapping at `:185`). The template never recomputes GST or totals. All amounts are formatted with the money formatter (`src/emails/money.ts:4`, `formatMoney`). Nothing is cached in the template props that the command can supply.

| Field | Source | Note |
|-------|--------|------|
| Title | constant `Tax invoice` | |
| Supplier | `EMAIL_LEGAL_LINES` constant | `Agentic Economy Technologies Pty Ltd`, `ABN 98 700 838 115`, trading as Agentic Economy, Western Australia (D2). No street address, none invented |
| Invoice number | ledger receipt id, format `AE-####` | unique, sequential per ledger |
| Date | funding command confirmation time, recipient timezone | `2 Jul 2026, 1:14 pm {zone}`, abbreviation from the date |
| Description | constant `aecon credit` | one description line |
| Credit amount | `principalUnits` | the credit the account receives |
| Service fee | `serviceFeeUnits` | fee on loading, per the money model |
| GST | `taxUnits` | shown as an amount, labelled `GST` |
| Total paid | `totalUnits` | only after Stripe confirms (P13) |
| Buyer | account name and email, or ABN | required when `totalUnits` is A$1,000 or more (below). Optional otherwise, and shown as the account email |
| Payment method | card brand and last four from Stripe | |
| New credit balance | ledger balance after this credit | |
| Receipt link | hosted invoice route in the aecon app | does not expire. Stripe's links expire after 30 days [R], so we do not link to Stripe |
| Support and privacy | `support@aecon.ai`, privacy URL | Stripe also requires these on its own receipts [R] |

Buyer rule: when `totalUnits` is A$1,000 or more (compared as exact integer units at the AUD exponent, not as a float), the invoice must also show the buyer's name or ABN. If the account has no ABN on file, show the account email and name. Below A$1,000 the buyer block is not required.

Record keeping (D7): no email states a retention period. The invoice number and rendered content stay reproducible from the command and ledger rows.

### 6.2 Receipts and statements (kinds 8, 9, 29, 30)

Titled `Receipt` (per call or refund) and `Statement` (monthly). No GST line, no tax invoice wording, no supplier ABN block beyond the footer legal line (D3).

| Field | Source |
|-------|--------|
| Period | statement month |
| Call id | ledger call id |
| Timestamp | call time, recipient timezone |
| Provider and product | provider name and product title (not "endpoint") |
| Units and unit price | ledger |
| Subtotal and total | ledger |
| Running balance | ledger |
| Link to originating top-up invoice | receipt route |

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

Ordered and atomic. Order is the sequence: no two tasks edit the same file unless one follows the other, and files that several tasks touch (`render.tsx`, `enqueue.ts`) are edited only in the tasks listed, in this order. Each task ends in one verify command that exercises the real code path (render, typecheck, or run), not a new test suite (project rule 10). Every command runs from the platform repo, starting with `cd "/Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy-email-design" &&`. The website repo is read-only reference. Nothing sends email, and no send path is enabled by default (D9).

| # | Task | Files | Verify |
|---|------|-------|--------|
| T1 | Licence check, then vendor the emailcn items from 2.5. Re-read the repository LICENSE, abort if it is not MIT. Add the `@emailcn` namespace to `components.json`, install the slugs in 2.5 into `src/emails/vendor/emailcn/`, copy the LICENSE there, and record each slug and its props in the file headers | `components.json`, `src/emails/vendor/emailcn/**` | `curl -sL https://raw.githubusercontent.com/shadcn-labs/emailcn/main/LICENSE \| head -1 \| grep -q "MIT License" && test -s src/emails/vendor/emailcn/LICENSE && npx tsc --noEmit --skipLibCheck -p tsconfig.json 2>&1 \| grep -c "vendor/emailcn" \| grep -qx 0` |
| T2 | Write `aeconTheme` from the table in 2.1 (every value as listed, one place), update `EMAIL_COLORS`, `EMAIL_FONT`, `EMAIL_SENDER_NAME` (`aecon`) and `EMAIL_LEGAL_LINES` (supplier line from D2, support address `support@aecon.ai`, no address field) in `brand.ts`. Check theme keys against the vendored theme file from T1 | `src/emails/theme.ts`, `src/emails/brand.ts` | `npx tsx -e "import {EMAIL_LEGAL_LINES as l} from './src/emails/brand'; import './src/emails/theme'; if(!l.join(' ').includes('98 700 838 115')) process.exit(1)"` |
| T3 | Copy the website's `public/brand/aecon-symbol-chalk-gold-400.png` into the platform repo for the footer band. The Forest 400px PNG is already there | `public/brand/email/aecon-symbol-chalk-gold-400.png` | `file public/brand/email/aecon-symbol-chalk-gold-400.png \| grep -q "PNG image data, 400"` |
| T4 | Extend `emailUrl` with `utm_campaign` and `utm_content` in one place | `src/emails/links.ts` | `npx tsx -e "import {emailUrl} from './src/emails/links'; console.log(emailUrl('https://aecon.ai','/owner/credit',{campaign:'funding_receipt',content:'cta'}))"` prints all three UTM params |
| T5 | Rebuild `layout.tsx` as the one skeleton (2.3) on the vendored header, button and footer, with the forest footer band, dark media query, legal line, support and privacy links, and the unsubscribe slot | `src/emails/layout.tsx` | `npx tsx -e "import {renderEmail} from './src/emails/render'; renderEmail({eventKind:'stalled_not_funded',props:{siteUrl:'https://aecon.ai',unsubscribeUrl:'https://aecon.ai/u'}}).then(r=>{if(!r.html.includes('98 700 838 115')\|\|!r.text.includes('support@aecon.ai'))process.exit(1)})"` |
| T6 | Migrate `account-notice.tsx` kinds onto the notification block, starting with the kinds that already render. Subjects and copy per section 3 | `src/emails/templates/account-notice.tsx` | `npx tsx -e` loop over every `NoticeKind` through `renderEmail`, fail on more than one CTA anchor (`utm_content=cta`; header and footer links are part of the skeleton, 2.3) or any banned word from section 3 |
| T7 | Same migration for `agent-approval.tsx`, `usage-alert.tsx`, `stalled-step.tsx` | those three files | `npx tsx -e` loop rendering each with fixtures, fail unless each has exactly one CTA anchor |
| T8 | `statement-ready.tsx` on the order summary table with the 25-row cap, no GST line (6.2), then `operator-digest.tsx` on the notification block with a list | `src/emails/templates/statement-ready.tsx`, `src/emails/templates/operator-digest.tsx` | render with a 30-row fixture (expect `5 more calls`) and a zero-row fixture (expect the skip path) |
| T9 | Funding tax invoice template on `block-receipt-default`, fields per 6.1 including the A$1,000 buyer rule, amounts through `formatMoney`, plus its `render.tsx` case | `src/emails/templates/funding-receipt.tsx`, `src/emails/render.tsx`, `src/emails/money.ts` | `npx tsx -e` rendering two fixtures (`totalUnits` 2200 and 110000 minor units): both contain `Tax invoice`, `98 700 838 115`, `GST`; only the second contains the buyer name block |
| T10 | Hosted, non-expiring invoice and receipt route that the email links to, reading the existing money document render (`convex/moneyDocumentRender.ts`) | `src/routes/owner.receipts.$id.tsx` | `npx tsc --noEmit -p tsconfig.json` clean, then open the route against a dev ledger receipt id |
| T11 | Wire `funding_receipt` in enqueue to read `principalUnits`, `serviceFeeUnits`, `taxUnits`, `totalUnits` and buyer details at send time and pass them to T9. Stays off by default | `convex/lib/principalAccount/notifications/enqueue.ts` (row and gate, unchanged), `convex/lib/principalAccount/notifications/delivery.ts` (send-time read), `convex/notificationDelivery.ts` (buyer fallback) | `npm run typecheck:convex` and `npm run typecheck` |
| T12 | One-click unsubscribe route, `List-Unsubscribe` and `List-Unsubscribe-Post` headers on L-stream sends, `consentBasis` stored at enqueue and enforced, `lifecycle_unsubscribed` event. Builds on the existing `unsubscribe.ts` token code. Must land before T15 | `src/routes/api.unsubscribe.ts`, `convex/lib/principalAccount/notifications/enqueue.ts`, `convex/lib/principalAccount/notifications/delivery.ts` | `npm run typecheck:convex`, then one dev-only enqueue to a Resend sandbox address and confirm the headers in the rendered send payload |
| T13 | Wire the unwired kinds in this order, each behind its own off switch: funding failed, payment stuck, credit exhausted, key issued (every creation, batched at 10 minutes per D6) and revoked, pause and restore, role, email changed, data export | `convex/lib/principalAccount/notifications/enqueue.ts` plus one call site per kind | `npm run typecheck:convex`, then trigger each state on dev and confirm one enqueued row and the suppress-if |
| T14 | New kinds 22, 23, 29, 30, 32 to 36 added to the kind union with templates. 22, 23, 35 and 36 wait on Q2 for their copy | `src/modules/principal-account/account/convex-schema.ts`, `src/emails/templates/account-notice.tsx`, `src/emails/render.tsx`, `convex/lib/principalAccount/notifications/enqueue.ts` | `npm run typecheck:convex` and render each new kind via `renderEmail` |
| T15 | Welcome on the onboarding block, timing, exits, caps and quiet hours read at send time. The Phase 3 gate (`provisioning.ts:340`) stays closed (D5) | `convex/lib/principalAccount/interactiveAuthority/provisioning.ts`, `convex/lib/journey/stalled.ts`, `convex/lib/principalAccount/notifications/enqueue.ts` | `npm run typecheck:convex`, then walk one dev account through the section 5 sequence with the gate on locally only |
| T16 | Resend webhook writes delivery events to the email row, and PostHog `email_sent` | `src/routes/api.resend.webhook.ts`, `convex/lib/principalAccount/notifications/delivery.ts` | send one sandbox email, see the delivered event and the PostHog event |
| T17 | Joel: turn off Stripe automatic receipts and the finalised invoice email in the dashboard, only after T11 and T16 pass on hosted | Stripe dashboard | one live top-up produces exactly one email, from aecon |
| T18 | Joel: align Clerk verification, sign-in and invite appearance if the branded-email plan exists (Q1) | Clerk dashboard | send a Clerk test email and compare with 2.1 |

**T17 handoff (Joel, dashboard only, no code).** Not done by an agent; no repo change can do it. Do it only after T11 and T16 pass on hosted and the aecon funding receipt send is live there, because with Stripe's receipt off and an auto-charged invoice the customer gets nothing else. Steps: Stripe Settings > Business > Customer emails > Payments > turn off Successful payments; Settings > Billing > Subscriptions and emails > turn off Send finalised invoices. Check: one live top-up produces exactly one email, from aecon, no Stripe receipt. Also still blocking go-live: DNS verified for `mail.aecon.ai`. Entity, ABN and support address are settled in `EMAIL_LEGAL_LINES` (no street address, by decision). Every new send path stays dark by default.

---

## 9. Open questions for Joel

Everything else is decided (see Decisions). Three remain.

1. Clerk branded-email plan. Is Clerk's branded-email plan enabled, so T18 can match the tokens, or do Clerk emails stay stock?
2. Deletion grace period. The repo has no account-deletion grace constant (searched `convex/` for grace, cooling and delay settings on 2026-10-11; only unrelated OAuth grant grace exists). How many days between confirmation and deletion? Row 36 fires 3 days before it ends, and rows 22, 35 and 36 copy depends on it.
3. Consent wording. Is the welcome and `Add credit` nudge covered by express consent at sign-up or inferred consent, and what is the exact consent wording? Spam Act 2003 (Cth) ss17-18 text is unchecked against ACMA, so counsel should confirm the wording before any L-stream send. The sender identity itself is settled (D2).

---

## Review notes

Two reviews (lifecycle, brand and compliance) applied on 2026-10-11, then Joel's decisions the same day. Rejected or reshaped:

- Move row 6 to lifecycle: rejected. A failed payment is a transactional event. Instead the trigger is narrowed to `payment_intent.payment_failed` and the abandonment trigger `checkout.session.expired` is dropped.
- "Rows 16 and 23 have no CTA": row 16 does have one (Review keys). Row 23 is the single named exception to the one-button rule.
- Statement 'View all calls' link: resolved by removing the link, not by relaxing P3.
- Quiet-hour and cap values (10 min batching, 2x hysteresis, drop order) are working numbers chosen here, not sourced. Revisit after 30 days of data.
- Dark-mode button contrast: the earlier Forest button with a Chalk border is gone (D1). The website's charcoal and chalk button pair replaces it. Legibility of the muted text pairs in email is not measured, and T5 checks it by render.
- Pre-mixed footer colours (`#C1C7BB`, `#4F745F`) are sRGB approximations of the website's oklch `color-mix`, not exact.
