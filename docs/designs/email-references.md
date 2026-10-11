# aecon email references

Status: 2026-10-11. Companion to `docs/designs/email-design-system.md` (read only, not edited here). Purpose: external design and funnel guidance that aecon adopts, each rule cited, so nothing is hand-rolled. Vendor blogs are practitioner guidance, not measured results. Dates matter: Campaign Monitor is 2019 (older), Litmus dark mode is Feb 2025 (check client support again), Litmus accessibility is Mar 2026.

Excluded sources: 2 (candidate sources dropped before this list was fixed, not cited anywhere below).

Source keys: [LDM] Litmus dark mode, [CM] Campaign Monitor design, [LA] Litmus accessibility, [GEC] Good Email Code h1, [RE] React Email docs, [GA] Google Analytics UTM, [MC] Mailchimp opt-in, [HS] HubSpot double opt-in, [UP1] Userpilot aha moment, [UP2] Userpilot onboarding sequence, [UP3] Userpilot self-serve, [UP4] Userpilot best practices, [CIO] Customer.io onboarding, [ST] Stripe receipts, [GG] Google sender requirements, [BM1] Baremetrics cancellation, [BM2] Baremetrics dunning. URLs are in section 4.

---

## 1. Email design guide: rules aecon adopts

### 1.1 Layout

| Rule | Source | Note for aecon |
|------|--------|----------------|
| 600px is usually the sweet spot, most emails are 600 to 640px wide. | [CM] | The design system pins 560px. Within the common range's low side, keep, but record it as a deliberate choice. |
| One-column emails work on desktop and mobile. | [CM] | Matches the one skeleton. |
| Use a logical hierarchy with large headlines so readers can scan. | [CM] | Heading then lead then one slot. |
| Use ready-made components rather than hand-built table layouts. Container is the main wrapper. Components were tested in popular clients. | [RE] | Same stance as D8 and P15. |
| Components must be converted to an HTML string before sending through a provider. | [RE] | Render step before Resend. |

### 1.2 Type and headings

| Rule | Source |
|------|--------|
| Body copy 16px on mobile, increase it if small on desktop. | [CM] |
| Under 14px on desktop takes effort to read, so raise the minimum from 14 to 16px on smaller devices. | [LA] |
| Use an h1, but do not force one if it does not fit. Only one h1 per email. | [GEC] |
| All structured content needs headings, no headings means no structure. | [GEC] |
| A screen reader user can jump to the h1 to find the start of the main content. | [GEC] |

### 1.3 Buttons and links

| Rule | Source |
|------|--------|
| One clear, easy-to-click CTA button, keep CTAs to a minimum. | [CM] |
| Avoid "click here". Give links context so users know where they lead. | [LA] |

### 1.4 Images and alt text

| Rule | Source |
|------|--------|
| Helpful alt text that adds to the message. Write overlaying image text as the alt text. | [CM] |
| Null alt for images screen readers need not read, descriptive alt for those that matter. | [LA] |
| Use live HTML text wherever possible: it supports screen readers and scales when zoomed. | [LA] |

### 1.5 Dark mode

| Rule | Source |
|------|--------|
| Include `<meta name="color-scheme" content="light dark">` and `<meta name="supported-color-schemes" content="light dark">` in the head. | [LDM] |
| Avoid pure #FFFFFF on pure #000000, it can cause eye strain. | [LDM] |
| Add a translucent outline or glow to transparent PNGs with dark text so they stay legible. | [LDM] |
| Prefer transparent backgrounds where possible. APNG rather than GIF for animation. | [LDM] |
| Let subscribers switch between light and dark where possible, and at minimum meet WCAG AA contrast. | [LDM] |
| A plain-text email triggers dark mode in Apple Mail. The minimum code that blocks it is a 2x1 image. | [LDM] |

### 1.6 Accessibility

| Rule | Source |
|------|--------|
| High contrast between copy and background. Colour is never the only way important information is conveyed. | [LA] |
| Set the `lang` attribute to the email's language. | [LA] |
| Use `role="presentation"` on each table that holds content the subscriber needs to read. | [LA] |

### 1.7 Footer and compliance

| Rule | Source |
|------|--------|
| Footer needs at least the sender's address and an unsubscribe link. | [CM] |
| Bulk senders need SPF, DKIM and DMARC. The From domain must align with the SPF or DKIM domain. | [GG] |
| Marketing and subscribed mail supports one-click unsubscribe (`List-Unsubscribe` and `List-Unsubscribe-Post`, RFC 2369 and 8058) and a visible body link. | [GG] |
| Keep Postmaster Tools spam rate below 0.30%, and aim below 0.10%. | [GG] |

### 1.8 Plain text

No source in the verified list gives a plain-text authoring rule. The only cited fact is the Apple Mail dark-mode side effect [LDM]. Plain text stays governed by P10 and section 3 of the design system.

### 1.9 Campaign links

| Rule | Source |
|------|--------|
| Always use utm_source, utm_medium and utm_campaign. | [GA] |
| Values are case sensitive. Use lowercase as standard practice. | [GA] |
| Separate parameters from the URL with `?`, each pair with `&`. | [GA] |
| Missing UTMs show as (not set) in reporting. | [GA] |

---

## 2. Full funnel for aecon

Journey events: signed_up, intent_answered, funded, agent_connected, first_quote, first_call, activated, topped_up, retained_w1 (design system section 4). Catalogue row numbers refer to that doc. "Proposed" means not in the catalogue.

### 2.1 TOFU: discover a tool, newsletter and welcome, attribution

Rules:
- Capture first touch with UTM on every outbound link, lowercase, with source, medium and campaign [GA].
- Double opt-in sends a confirmation email and adds the person only after the click. It suits a quality-first list and reduces spam signups. Single opt-in suits growth [MC].
- Under HubSpot's model, unconfirmed contacts cannot be emailed, and a follow-up sends only after confirmation [HS].

| Email | Trigger | Suppress-if | Metric | Catalogue |
|-------|---------|-------------|--------|-----------|
| Newsletter or tool-discovery signup confirmation (proposed) | Public signup form submitted | Already confirmed | Confirmation click rate | gap |
| Newsletter welcome (proposed) | Opt-in confirmed [HS] | Owner already `signed_up` | Click, then `signed_up` | gap |
| Account welcome | `signed_up` plus provisioned | `funded` present | Funding click, `funded` in 24 h | row 4 |

Decision for Joel: newsletter is out of scope today (design system 2.5 lists Newsletter as not installed). If one is added, use double opt-in, since aecon favours list quality over growth [MC].

### 2.2 MOFU: sign up, load credit, connect agent, first paid call

Rules:
- The aha moment ties to core product value, not setup, and must be reachable by most new users [UP1]. For aecon the candidates are `first_call` and `agent_connected`. Choose by comparing day-3 completers against non-completers on 30-day retention, then A/B against current onboarding [UP1].
- One email, one explicit action [UP2]. One key action per onboarding [UP3].
- Pick one behavioural goal per automation, trigger on a segment change, wait before prompting, then target only those who have not completed the goal [CIO].
- Measure conversions, not opens or clicks, with a goal and a conversion window (example one week) [CIO].
- Cadence: simple tools 3 to 5 emails in week one, complex ones 8 to 10 over two weeks or more. Re-engage after 5 to 7 days without login [UP2].
- Use email to reinforce in-app actions, not repeat them [UP2]. Keep checklists to 3 to 5 tasks [UP3, UP4]. Do not leave empty states [UP4].
- Vendor-cited, treat with care: 40 to 60% of new SaaS users never return after sign-up [UP4].

| Email | Trigger | Suppress-if | Metric | Catalogue |
|-------|---------|-------------|--------|-----------|
| Stalled: not funded | `signed_up`, no `funded` at 24 h | `funded`, opt-out | `funded` in 48 h | row 26 |
| Stalled: no agent | `funded`, no `agent_connected` at 48 h | `agent_connected` | `agent_connected` in 72 h | row 27 |
| Stalled: never called | `agent_connected`, no `first_call` at 72 h | `first_call` | `first_call` in 72 h | row 28 |
| First call failed | First call fails | `first_call` | `first_call` in 72 h | row 34 |
| Funding failed | Payment failed | Later success | `topped_up` in 48 h | row 6 |
| Goal and conversion window definition per sequence (proposed) | n/a, analytics | n/a | Conversion in window [CIO] | gap |
| Varied framing across nudges, ending benefit-led (proposed copy rule) | n/a | n/a | n/a | gap [CIO] |

### 2.3 BOFU: first receipt and tax invoice, top-up nudges, habit

Rules:
- Stripe sends receipts only on success, for payments and refunds. Receipt links expire after 30 days. Test payments need a manual receipt send. Receipts must carry legal name, support contact and privacy URL [ST].
- Delayed-confirmation methods can delay the receipt [ST].
- Use behaviour, not guesswork, to set cadence [UP2].

| Email | Trigger | Suppress-if | Metric | Catalogue |
|-------|---------|-------------|--------|-----------|
| Tax invoice for top-up | Funding confirmed | none | Delivered, receipt click | row 5, section 6.1 |
| Refund receipt | Refund row written | none | Click, support reply | row 9 |
| First call done | `first_call`, `activated` | none | `topped_up` later | row 29 |
| Low credit | Below threshold | Auto top-up on | `topped_up` in 24 h | row 11 |
| Credit exhausted | Balance zero, call refused | Topped up | `topped_up` in 6 h | row 12 |
| Week one wrap | `retained_w1` | Zero calls | Week-two calls | row 30 |
| Monthly statement | Month closed | Zero calls | Statement click | row 8 |

### 2.4 Retention: failed payment, inactivity, win-back, leaving feedback, expansion

Rules:
- Failed payment: first email within 24 hours, then about 6 to 7 emails over 27 to 30 days (days 0, 3, 7, 10, 13, 20, 27). Do not send emails 1 and 2 inside 3 days. Tone escalates friendly, direct, re-engagement, final. No alarmist subjects early. Hard cancel about 30 days after failed recovery at the earliest [BM2].
- Cancellation or closure: thank, confirm, state access end date, keep short (under 50 words), no discount inside the confirmation, ask why via a short survey, keep the door open, follow up by reason, send from a named individual [BM1].
- Inactivity: re-engage after 5 to 7 days without login [UP2]. Email is the best channel for inactive users, with exit surveys to learn why they left [UP4].
- Expansion and habit: segment by behaviour and keep testing subject, CTA and timing [UP2].
- Keep spam complaints below 0.10% [GG].

| Email | Trigger | Suppress-if | Metric | Catalogue |
|-------|---------|-------------|--------|-----------|
| Auto top-up failed, first notice | `auto_topup_failed` | Later success | `topped_up` in 24 h | row 32 |
| Failed top-up follow-up cadence, days 3 to 27 (proposed) | Failure unresolved | Resolved | Recovery rate | gap [BM2] |
| Inactivity nudge, 5 to 7 days no call or login (proposed) | No activity 5 to 7 days after activation | Any activity, low-balance already sent | Return call in 7 days | gap [UP2] |
| Win-back (proposed) | Inactive past nudge | Opt-out, deletion requested | Reactivation | gap [UP4] |
| Leaving feedback survey (proposed) | Deletion completed or long inactivity | Opt-out | Response rate | gap [BM1, UP4] |
| Deletion requested, completed, cancelled, reminder | Account deletion flow | per row | Confirm click, cancel rate | rows 22, 23, 35, 36 |
| Expansion nudge, behaviour-segmented (proposed) | Repeated top-ups or cap hits | Opt-out | Larger top-up | gap [UP2] |
| Monthly cap reached | Cap hit | Cap raised | `spend_cap_changed` in 24 h | row 13 |

---

## 3. Gap table against the design system catalogue

Covered cites design-system sections. "Gap" means no row or rule today.

| Rule or funnel email | Status | Where |
|----------------------|--------|-------|
| Single column, one skeleton, hierarchy | Covered | 2.3 |
| Container width 600px | Divergent: pinned 560px | 2.3 |
| One CTA, verb plus object, not "click here" | Covered | P3, section 3 |
| Bulletproof button from component | Covered | 2.3, 2.5 |
| Do not hand-roll, use component library | Covered | D8, P15 |
| Body copy 16px mobile, minimum 14px desktop | Gap: no size rule stated | 2.2 |
| Single h1 per email | Gap: heading slot exists, no h1 rule | 2.3 |
| `lang` attribute, `role="presentation"` on layout tables | Gap | none |
| Alt text rules, null alt for decorative | Gap | 2.3 names assets only |
| Live text over image text | Gap | none |
| Colour never sole signal | Gap | none |
| WCAG AA contrast measured | Partial: pairs chosen, not measured | 2.1, T4 |
| `color-scheme` and `supported-color-schemes` meta | Covered | 2.4 |
| Avoid pure black on white | Covered: chalk and charcoal | 2.1 |
| Logo legible in dark mode | Covered: chalk tile | 2.3, 2.4 |
| Plain text mirrors HTML | Covered | P10, section 3 |
| Apple Mail plain-text dark trigger | Gap, low priority | none |
| Footer address and unsubscribe | Partial: no street address by D2, unsubscribe covered | 2.3, D2 |
| SPF, DKIM, DMARC, one-click unsubscribe | Covered | P11, section 5 |
| Spam rate under 0.10% target | Gap: complaint threshold is 0.1% in 7 but not tied to Postmaster | 7 |
| UTM source, medium, campaign, lowercase | Partial: source and medium plus campaign planned, lowercase rule absent | 7 |
| Newsletter and double opt-in | Gap, out of scope | 2.5 |
| Aha moment defined by data | Gap: events named, no cohort method | 4, 7 |
| Goal and conversion window per sequence | Gap | 5, 7 |
| Welcome, stalled nudges, first call, week one | Covered | rows 4, 26 to 30, 34, section 5 |
| Tax invoice and receipts | Covered | rows 5, 9, section 6 |
| Stripe receipts off and expiry handling | Covered | section 6 |
| Failed top-up dunning cadence beyond first email | Gap: only row 32 | 4 |
| Inactivity nudge (5 to 7 days) | Gap | none |
| Win-back | Gap | none |
| Leaving feedback survey | Gap: row 23 has no CTA | row 23 |
| Expansion email | Gap | none |
| Re-engagement behaviour segments | Gap | none |

---

## 4. Source list

| Key | Title | Publisher | URL | Stage |
|-----|-------|-----------|-----|-------|
| LDM | The Ultimate Guide to Dark Mode for Email Marketers (27 Feb 2025) | Litmus | https://www.litmus.com/blog/the-ultimate-guide-to-dark-mode-for-email-marketers | design |
| CM | Email Design: The Best Practices Guide (7 Feb 2019) | Campaign Monitor | https://www.campaignmonitor.com/blog/email-marketing/the-really-good-guide-to-email-design-bonus-checklist/ | design |
| LA | The Ultimate Guide to Email Accessibility (24 Mar 2026) | Litmus | https://www.litmus.com/blog/ultimate-guide-accessible-emails | design |
| GEC | Should you use an h1 in email code? (2 Aug 2022) | Good Email Code | https://www.goodemailcode.com/email-accessibility/should-you-use-an-h1-in-email-code.html | design |
| RE | React Email documentation | React Email (MIT) | https://react.email/docs/introduction | design |
| GA | URLs builders: Collect campaign data with custom URLs | Google Analytics Help | https://support.google.com/analytics/answer/10917952?hl=en | TOFU |
| MC | Single Opt-in vs. Double Opt-in | Mailchimp | https://mailchimp.com/help/single-opt-in-vs-double-opt-in/ | TOFU |
| HS | Set up double opt-in for emails | HubSpot | https://knowledge.hubspot.com/marketing-email/set-up-double-opt-in-for-emails | TOFU |
| UP1 | The Aha Moment: How to Identify It With Data | Userpilot | https://userpilot.com/blog/aha-moment/ | MOFU |
| UP2 | Onboarding Email Sequence for Fast User Activation | Userpilot | https://userpilot.com/blog/onboarding-email-sequence/ | MOFU |
| UP3 | The Ultimate Guide to Self-Serve Onboarding | Userpilot | https://userpilot.com/blog/self-serve-onboarding-saas/ | MOFU |
| UP4 | User Onboarding Best Practices with Examples | Userpilot | https://userpilot.com/blog/user-onboarding-best-practices/ | MOFU |
| CIO | Customer.io Onboarding Campaign | Customer.io | https://docs.customer.io/journeys/send/recipes/onboarding-campaign/ | MOFU |
| ST | Receipts and paid invoices | Stripe | https://docs.stripe.com/receipts | BOFU |
| GG | Google and Yahoo sender requirements | Google Workspace Admin Help | https://support.google.com/a/answer/81126 | BOFU |
| BM1 | How to Write a Subscription Cancellation Email for SaaS | Baremetrics | https://baremetrics.com/blog/subscription-cancellation-email | Retention |
| BM2 | How to Write Dunning Emails (2026) | Baremetrics | https://baremetrics.com/blog/dunning-emails | Retention |

Excluded sources: 2.
