# aecon email system design

## Goal

Ship the full email workflow on the existing pipeline: `enqueue.ts`, `notificationWorkpool`, `notificationDelivery.ts` and `notificationDeliveries`. Add React Email templates, Resend delivery webhooks, suppression, per-stream unsubscribe and observability. Add no registry or dispatcher. Templates are chosen by `switch` on the `eventKind` union. Today five families send plain text (approval, usage alerts, statement ping, stalled nudges, operator digest). Eight or more moments send nothing.

**Overlaps resolved**
- **Streams:** one `stream` field (`transactional | alert | lifecycle | operator`) and one `required` boolean. `alert` is new: user-controlled account-service mail (Low Credit, spend caps, call failure spike). Security mail is `transactional` with `required: true`.
- **Toggles:** receipts, refunds and security mail are never mutable. User-controlled: `lifecycleEmails`, `providerSummary` and the existing alert preferences. Statement mail keeps its existing `invoiceReady` gate and usage-alert consent policy (see Decisions log, item 5).
- **Provider status mail:** transactional (factual, no promotion).
- **Suppression:** hard bounces block all mail to the address. Complaints block alert and lifecycle only. Required mail is never suppressed by a complaint (explicit test).
- **Webhook dedupe:** two new tables (`emailSuppressions`, `emailWebhookEvents`), not a field on the delivery row.
- **Research gap:** five families, not four. Usage alerts are included.

## Catalogue

Streams: T = transactional, A = alert, L = lifecycle, O = operator. "Req" means required, with no unsubscribe. "Wire at" marks a state-change point where no mail call exists today. Every template lives in `src/emails/templates/`. Money amounts are read from ledger rows at send time, never from trigger args.

| Email | Recipient | Str | Trigger | Subject | Action | Pref | Cap/dedupe | Template |
|---|---|---|---|---|---|---|---|---|
| Welcome | new owner | T | wire at account creation (none found) | Welcome to aecon | Set up your account | Req, one-time, no pitch | per account ever | welcome |
| Stalled nudge x3 | owner | L | `stalled.ts:11-27`, cron `scheduled.ts:127-129` | existing | Next undone step | `stalledStepEmails` (off) + `AE_STALLED_EMAILS_ENABLED` | once per step ever; max 1 per 72h | stalled-step |
| Agent approval | owner | T | `callRecoveryProjection.ts:55` -> `notifications.ts:45-50` | `<Agent> needs your approval` | Review request | Req | per approval id | agent-approval |
| Key issued | owner | T | wire at `interactiveCredentialLifecycle.ts` | A new agent key was created | Review keys | Req | per key id; over 3 an hour fold into one | key-issued |
| Key revoked | owner | T | same file | An agent key was revoked | Review keys | Req | per key id | key-revoked |
| Account paused | owner | T | `security.ts:170`, `moneyCommercialPolicy.ts:98` | Your aecon account is paused | See why; what you can do; support contact | Req | per suspension event | account-paused |
| Account restored | owner | T | same, on lift | Your aecon account is active again | Open dashboard | Req | per event | account-restored |
| Funding receipt | payer | T | `moneyStripeWebhookWorker.ts` (x402 funding likewise) | Receipt: A$20.00 added as Credit | View receipt | Req | per funding ref or Stripe event id | funding-receipt |
| Funding failed | payer | T | same worker, failure path | Your Credit top-up did not complete | Try again | Req | per funding ref | funding-failed |
| Task refunded | buyer | T | `moneyManagedCallRemedy*.ts` | Refunded: `<Tool>` did not complete | View Task | Req | per call; over 3 an hour fold (see Folding) | task-refunded |
| Task stuck | buyer | T | recovery unresolved over 1h, wire at `moneyManagedCallRemedy*` | A Task is taking longer than usual | See Task | Req | once per call; suppressed once a refund exists | task-stuck |
| Low Credit | owner | A | `usageAlerts.ts:27` | Credit is running low: A$4.20 left | Add Credit | low-credit pref | once per crossing; re-arms on recovery | low-credit |
| Credit exhausted | owner | T | same crossing at zero | Credit is zero, Tasks will fail | Add Credit | Req | once per crossing | credit-exhausted |
| Spend cap 80% / exceeded | owner | A | `usageAlerts.ts:61-69` | Account usage alert (existing) | Review limits | usage-alert pref | once per period per level | usage-alert |
| Call failure spike | owner | A | `usageAlerts.ts` `call_failure_spike` | existing | Review calls | usage-alert pref | existing | usage-alert |
| Monthly statement | owner | T | `attachment.ts:47` -> `usageAlerts.ts:52` | Your October statement is ready | Download statement | existing `invoiceReady` gate | per period | statement-ready |
| Role changed | member | T | wire at membership change (none found) | Your role is now Admin | Open workspace | Req | per change | role-changed |
| Membership changed | admins | T | same event, `preferences.ts:79` | Team membership changed | View team | Req (no toggle) | per event | team-membership |
| Email address changed | owner, to the old address | T | wire at Clerk primary-email change | Your email address was changed | Secure your account | Req | per change | email-changed |
| Data request received | owner | T | wire at access, export or deletion request | We received your data request | View request | Req | per request | data-request |
| Tool submitted | provider | T | `capabilityProviderApprovals.ts` | We have your Tool | View status | Req | per submission | provider-submitted |
| Tool admitted or refused | provider | T | same | Your Tool was admitted / needs changes | Publish, or fix and resubmit | Req | per decision | provider-decision |
| Tool is live | provider | T | `capabilitySupplyPublish.ts` | `<Tool>` is live | View listing | Req | per Tool | provider-live |
| First paid Task | provider | T | `moneyProviderObligations.ts` | Your first paid Task | View earnings | Req, one-time | per Tool ever | provider-first-paid |
| Payout on its way | provider | T | `moneyTreasury.ts` | A$120.00 is on its way | View payout | Req | per payout | provider-payout |
| Payout failed | provider | T | same | Your payout did not go through | Update payout details; reason class shown | Req | per payout | provider-payout-failed |
| Weekly earnings | provider | L | new cron, only when active | Your week on aecon | View earnings | `providerSummary` (on) | weekly; skip if empty | provider-weekly |
| Offboarding confirmed | provider | T | `capabilityProviderOffboarding.ts` | Your Provider account is closed | View final statement | Req | once | provider-offboarded |
| Operator digest | operator | O | `operatorDigest.ts:117-123`, `scheduled.ts:122-123` | AE stalled accounts, `<date>` | Open console | operator allowlist | `operator-digest:<date>` | operator-digest |
| Exception alert | operator | O | `adminConsoleExceptions.ts` | Exception: `<kind>` | Open exception | operator allowlist | 1 per kind per hour; global 10 per hour, then one rollup | operator-exception |

**Count:** 30 emails. T 23, A 3, L 2, O 2.

**Folding:** a fold is a separate send with `sourceEventRef = fold:<recipient>:<kind>:<hour bucket>`. Once the fourth event in an hour arrives, individual sends stop for that bucket and one fold row covers the rest. Individual and folded mail never share a `sourceEventRef`. Weekly summary `sourceEventRef` = `week:<ISO week>`.

**Not sent:** per-call success receipts, milestone mail, win-back or NPS, drip beyond the three nudges, anything duplicating Clerk (verification, sign-in, invite), sandbox or testnet funding, promotion inside receipts or statements, approval reminders.

## Architecture

**Data flow:** trigger point -> `enqueueEmail({kind, recipient, sourceEventRef})` -> checks in order (suppression, stream kill switch, preference, dedupe, caps, `assertAdmission` with a per-stream bucket) -> insert `pending` row -> `notificationWorkpool.enqueueAction` -> `sendDeliveryEmail` (`"use node"`) -> `switch(eventKind)` loader builds props from `sourceEventRef` -> `renderEmail` -> Resend -> store `vendorMessageId` -> `sent`. Resend webhook -> route -> node action `emailWebhook` -> monotonic state change and suppression insert.

**Change**
- `convex/notificationDelivery.ts`: rename `sendApprovalEmail` to `sendDeliveryEmail`. Keep throw-on-429/409/5xx (workpool retries) and terminal 4xx. Keep `deliveryRef` as the idempotency key. Rebuild props at send time, never store them. The existing guard compares `subject`, `text` and `unsubscribeUrl` across two context reads (`:35-39`); it becomes a comparison of a props digest computed from the loader output on both reads.
- `lib/principalAccount/notifications/enqueue.ts`: generalise the approval path (`:6-64`) into `enqueueEmail`. Route `stalled.ts:56-94` (skips admission today) and `usageAlerts.ts:24-35` through it. Admission bucket names are per stream (`email-transactional`, `email-alert`, `email-lifecycle`), replacing the shared `agent-approval-email`, so a stalled sweep cannot starve approvals.
- `lib/principalAccount/notifications/resend.ts` (`:17-56`): Resend client constructor if the spike passes, otherwise a thin fetch wrapper.
- `src/modules/principal-account/account/convex-schema.ts` (`:120-138`, `:261-268`): extend `eventKind`. Add `stream`, `required`, `lastEventAt`. Reuse the existing `vendorMessageId` (written by `completeDeliveryHandler`, `delivery.ts:106-111`); add only index `by_vendorMessageId`. Extend `state` to `pending | sent | delivered | bounced | complained | failed | suppressed`, ranked. `completeDelivery` writes `sent` only when the row is still `pending` and never overwrites a later-ranked state, so a webhook that lands first is safe.
- Tables: `emailSuppressions` (`addressHash`, `domain`, `reason`, `sourceDeliveryRef`, `createdAt`; index `by_addressHash`) and `emailWebhookEvents` (`svixId`, `receivedAt`; index `by_svixId`). Addresses are stored as a hash plus domain, lookups hash first. Retention note: delete webhook events after 30 days.
- `convex/http.ts`: add `POST /resend/webhook` (`:26-53` holds the unsubscribe route). The route reads `request.text()` raw and calls a `"use node"` action in new `convex/emailWebhook.ts` that verifies with `svix`. New `convex/emailTest.ts`.
- **Operator digest stays outside `notificationDeliveries`.** `sendOperatorDigest`, `completeDigest` and the `operator-digest:<date>` key are unchanged, because the delivery row requires `recipientPrincipalRef` and `accountRef` that the digest lacks. Its observability gain is the deliverability line only. The silent skip at `notificationDelivery.ts:62-70` is replaced by a logged failure counted in that line.
- `convex/convex.config.ts:33-35`: declare new env vars (webhook secret, unsubscribe HMAC secret, stream switches).
- New dependencies: `resend` (if spike passes), `@react-email/components`, `@react-email/render`, `svix`. Spike also tries `@react-email/render` under `convex.json` `externalPackages` and measures bundle size against the 64MB node limit.

**Reused:** `notificationDeliveries` dedupe key, `notificationWorkpool` retry policy (8 attempts, 60s backoff), `assertAdmission`, `formatCurrencyAmount`, `preferences.ts`, the Svix verification pattern (Clerk uses its own helper, `clerk-webhook-core.ts:1`, so this is a pattern, not shared code), existing recipient lookup (Clerk verified primary email at send time).

**New, not reused:** `withUtm` exists only in `attribution-spec.md`, not in source. It is built in Task 4 per that spec, then `emailUrl` wraps it.

**Dedupe is authoritative in the delivery row.** Resend's idempotency key lasts 24 hours; a manual re-enqueue later is stopped by the row, not by Resend.

## Templates and brand

- **Layout:** `src/emails/layout.tsx` holds the preheader, wordmark with the Gold symbol, content slot, and a footer with legal entity, ABN, postal address and contact line. The footer shows a preferences link, or the unsubscribe link on alert and lifecycle. One Forest CTA per email.
- **Tokens:** `brand.ts` holds Chalk `#E8E4DA` ground, Charcoal `#141414` text, Forest `#24543D` CTA. Inline styles only, no Tailwind in the email path. Font stack Manrope, Arial, Helvetica.
- **Components:** `@react-email/components` primitives. emailcn blocks for Notification (alerts, status) and Order summary (funding receipt, statement, refund). A `Money` helper wraps `formatCurrencyAmount`, so amounts print as A$0.003. Money loaders read funding and refund ledger rows at send time and refuse to send if the amount is missing or not `formatCurrencyAmount`-safe. Stripe fees and tax are not part of "A$20.00 added".
- **Money copy:** refund names the amount, that it went back to Credit (not the card), and the Task id. Receipt Credit terms line needs a policy line from Joel; do not guess. Statement is called "statement", not "tax invoice", until GST and ABN details are confirmed. Payout failed shows a reason class.
- **Links:** `emailUrl(path, {eventKind, content})` wraps `withUtm` with `source=email`, `medium=transactional|alert|lifecycle|operator`, `campaign=<eventKind>`. A grep check bans raw URLs in templates.
- **Dark mode:** light palette default. Add `color-scheme` and `prefers-color-scheme` rules, swap Chalk and Charcoal. Forest stays the button ground with white text and a visible border for Gmail's partial inversion. Test in Apple Mail and Gmail.
- **Plain text:** `toPlainText(html)` for every send, `data-skip-in-text` on decorative elements. Each template exports `PreviewProps` so a fixture render plus plain-text check needs no send.
- **Copy:** Australian English, sentence case, no em dashes, vocabulary Tool, Provider, Task, Credit, Receipt. Grep templates for Order, Wallet, Balance.
- **Preview:** `email:dev` script (command to be confirmed in Task 4) and `emailTest.sendTest({kind, to})`, which sends only to a verified owner address with tag `test`.

## Preferences, consent and unsubscribe

- **Required** (no toggle, no unsubscribe link): all transactional mail. The footer says why and links to settings.
- **Controlled:** `alert` stream (existing `lowCreditAlerts`, usage-alert, statement `invoiceReady` gate) and `lifecycle` (`stalledStepEmails` default off, new `lifecycleEmails` and `providerSummary` default on). Add `consentSource` and `consentAt` to the preference row. Existing rows get no backfill: null `consentAt` means inferred consent. New signups record source and time.
- **Welcome:** transactional, required, CTA is account setup only, no feature pitch. If any pitch is added it becomes commercial and unsubscribable.
- **Credit warning split:** Low Credit is a controlled alert. A non-mutable Credit exhausted email (transactional) covers the case where a user muted the alert and Tasks are about to fail.
- **Hard-bounce banner:** a hard bounce blocks everything, including security mail, so a persistent in-app banner tells the owner their address is failing.
- **Marketing:** empty. A newsletter would use Resend Broadcasts with a separate `newsletter` preference defaulting off, one-click unsubscribe and the ABN.
- **Headers:** `List-Unsubscribe` (https URL) and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` on every alert and lifecycle send.
- **Endpoint:** a rewrite of `http.ts:26-53`, not a generalisation. Today the token is the raw `deliveryRef` (`http.ts:35`, `stalled.ts:97`). The new token is HMAC-signed, carries `{principal, stream}` and no address. Old `d=` links stop working (no backward compatibility; the only sent mail with such links is stalled nudges, off by default). POST (one-click) unsubscribes immediately, needs no auth or session. GET never mutates (link scanners prefetch GET) and shows a confirm page. It flips only that stream's preference. `unsubscribeStalled` becomes a stream-argument mutation and its callers move with it.
- **Settings UI:** one stock Arc/shadcn switch row per controllable category. Required categories listed read-only.

## Deliverability and compliance

- **Domain:** verify `mail.aecon.ai` in Resend and publish the records Resend gives, not values from memory. Check SPF and DKIM alignment (2048-bit DKIM). DMARC at `_dmarc.aecon.ai` starts at `p=none` with `rua` to a monitored mailbox and explicit `sp=`. Ramp to `quarantine` (pct 25, then 100) then `reject`, two clean weeks per stage. List Clerk and Stripe as senders in the reports before tightening.
- **From addresses:** `notify@` (transactional and alert), `hello@` (lifecycle), `ops@` (operator), `news@` (reserved). From name "aecon.ai". Reply-To is a monitored support mailbox.
- **Factual versus commercial:** a message that carries promotion is commercial under the Spam Act, so receipts, statements and welcome never carry cross-sell. Nudges and the weekly summary are commercial: consent recorded, sender identified, working unsubscribe, honoured immediately (final; the statutory window is longer, so no wait is needed).
- **Rate controls:** alerts capped at 1 per kind per day and 3 per day total per recipient; exception alerts globally 10 per hour then one rollup; stalled and usage sends under per-stream `assertAdmission`; 2 to 4 weeks of lifecycle warm-up after transactional volume. Do not add other mail to a new account's first hour beyond welcome, key issued and funding receipt.
- **Complaints:** pause a stream if complaints pass 0.1%. Gmail's limit is 0.3%.
- **Rollback:** `AE_STALLED_EMAILS_ENABLED` plus a per-stream kill switch checked in `enqueueEmail`.
- **Verify before launch (blocks Task 10):** legal entity, ABN and postal address in the footer; Spam Act and Privacy Act wording; Google and Yahoo bulk-sender pages; Stripe dashboard receipt setting.

## Observability and measurement

- **Delivery:** every send is a `notificationDeliveries` row with state, stream and kind. The admin console shows counts by state and stream.
- **Bounce and complaint:** the webhook subscribes to `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`, `email.failed`. It verifies the raw body with Svix headers, dedupes on `svix-id`, matches by `vendorMessageId`, and applies a monotonic transition. A hard bounce inserts into `emailSuppressions` (all mail); a complaint inserts a lifecycle and alert block. Soft bounces and delays only log.
- **Digest:** `buildDigest` (`operatorDigest.ts:104-112`) gains a deliverability line: bounces, complaints, failed sends in 24h, suppressions added, skipped digest sends. Failures stop being silent.
- **PostHog:** server events from `emailWebhook.ts` for `bounced` and `complained` only, with stream and kind, no address.
- **Clicks and journey impact:** UTMs (`utm_campaign=<eventKind>`) land in PostHog. Measure per email: click to the one action, then the next journey step within 7 days (J2 connect, J3 first Credit, J4 first call). Compare stalled-nudge cohorts with a no-nudge baseline before widening.
- **Tags:** every send carries `stream`, `event_kind`, `env`.

## Plan

### Task 1: Spike and primary-source checks
**Contract:** Needs: nothing | Offers: go or no-go on SDK and node render; confirmed dates and records
**Touches:** throwaway Convex node action (deleted after); no product files
**Review:** one reviewer on the findings
- [ ] Render a React Email component in a deployed `"use node"` action with react-dom 19.2.7, also with `@react-email/render` as an external package; record bundle size -> HTML and text returned. Partly: rendered in a `"use node"` internal action handler under vitest (node env), not a deployed action; bundle size measured locally only (see Findings)
- [ ] Confirm Resend SDK idempotency, `tags`, `headers`; confirm `svix` verify runs in a node action; `email dev` command -> notes in this doc. Partly: Resend and svix measured; `email dev` deferred to Task 4 (see Findings)
- [ ] Check Spam Act timing, Google and Yahoo pages, `mail.aecon.ai` DNS, ABN and entity, Stripe receipt setting -> answers recorded under Open decisions. Partly: DNS read and bulk-sender notes only (see Findings)

**Findings (Task 1, 2026-10-10, branch `codex/email-system`)**

Packages, pinned to releases at least two weeks old (installed exact in `package.json`): `@react-email/render` 2.1.0 (2026-07-10), `@react-email/components` 1.0.12 (2026-04-09), `resend` 6.30.0 (2026-09-25), `svix` 2.5.0 (2026-09-11). Not used because too new: `resend` 6.31 to 6.32.1, `svix` 2.6.0 to 2.8.0. `react-dom` 19.2.7 satisfies the peer ranges of both React Email packages.

- **Render (measured).** `render()` is async. `render(el, { plainText: true })` returns text. In a `"use node"` internal action handler under vitest, the HTML starts with a doctype, carries the Forest CTA colour, and the text keeps the body and CTA URL with no tags. A deliberately wrong assertion failed as expected (red), then the real assertions passed (green). The throwaway files were deleted; no product file changed for the spike.
- **Bundle (measured, esbuild node 20 ESM).** Bundled inline, the render spike is 2,184,439 bytes. With `@react-email/components`, `@react-email/render`, `react`, `react-dom`, `resend`, `svix` and `convex` external, it is 1,452 bytes. Installed footprint: `@react-email` 6.4 MB, `svix` 2.4 MB, `resend` 0.3 MB. Inline bundling uses about 3% of the 64 MB node limit, so the risk is cold-start size, not the limit. These figures were measured locally with esbuild, not on the deployed Convex runtime.
- **Recommendation (not applied; Task 1 touches no product files).** Add `@react-email/components`, `@react-email/render`, `react`, `react-dom`, `resend` and `svix` to `convex.json` `node.externalPackages` in Task 3 or Task 6, the first task that imports them from a `"use node"` file. Open risk: a deployed action with externals is not yet proven. Run it once on the dev deployment before Task 6, and confirm the peers `react` and `react-dom` resolve at runtime.
- **Resend SDK (measured with a stubbed `fetch`).** `resend.emails.send(payload, { idempotencyKey })` sends the `Idempotency-Key` header. `tags` and `headers` (for `List-Unsubscribe-Post`) pass through to the body. A 429 comes back as `{ error: { statusCode: 429 } }` and does not throw. Decision: use the SDK (open decision 1 default) and map `error.statusCode` 429, 409 and 5xx onto the existing throw-for-retry policy in `postResendEmail`. SDK internal retries were not checked. Resend's `react` prop was not used, so rendering stays in our `renderEmail`.
- **Svix (measured).** `new Webhook(secret).verify(rawBody, headers)` returns `undefined`, so parse the body after verify. It throws on a body changed by one character. Engines: node 22 or later, which matches `convex.json` `nodeVersion` 22.
- **`email dev`.** Not checked. It is a separate CLI package, not in the installed components, so it belongs to Task 4.
- **DNS (read-only `dig`).** `aecon.ai` SPF is `include:_spf.google.com ~all`. `mail.aecon.ai` has no records yet, so Resend domain verification is still to do. `_dmarc.aecon.ai` is `p=none` with `rua` to a Cloudflare report address.
- **Compliance (from memory, not verified online this session).** Spam Act unsubscribe must take effect within 5 working days. Google and Yahoo bulk-sender rules require SPF or DKIM, DMARC, one-click unsubscribe and a complaint rate under 0.3%. Both need a source check before Task 10.
- **Still needs Joel.** Entity, ABN, postal address, Stripe receipt setting (open decisions 4 and 6).

### Task 2: Schema, suppression tables, env (no behaviour change)
**Contract:** Needs: Task 1 | Offers: new fields, tables, indexes, env vars, unused
**Touches:** `convex-schema.ts`, `convex.config.ts`
**Review:** convex-reviewer
- [ ] Add kinds, `stream`, `required`, `lastEventAt`, ranked states, two tables, `by_vendorMessageId`, and env vars (webhook secret, HMAC secret, stream switches) -> `npx convex dev` pushes cleanly, existing rows still valid

### Task 3: `enqueueEmail`, kill switch, rename (behaviour change, stated)
**Contract:** Needs: Task 2 | Offers: single enqueue entry point with admission on all paths, per-stream buckets, stream kill switch, caps
**Touches:** `enqueue.ts`, `stalled.ts`, `usageAlerts.ts`, `notificationDelivery.ts`, `notifications.ts`
**Review:** idempotency-guardian
- [ ] Generalise and route the three callers; rename `sendApprovalEmail` -> `sendDeliveryEmail`; move the props-digest guard. Stalled mail now passes admission, which is a deliberate change -> existing approval email still arrives via `npx convex run` real use

### Task 4: `withUtm`, templates and render, plain-text parity
**Contract:** Needs: Task 1 | Offers: `withUtm` per attribution spec, `renderEmail` for the five existing kinds
**Touches:** `src/emails/**`, `package.json`, the `withUtm` module
**Review:** better-writing, better-colors
- [ ] Build `withUtm`, layout, `brand.ts`, `links.ts`, `Money`, five Phase 1 templates -> fixture renders match brand; grep finds no raw URLs

### Task 5: Webhook, suppression, unsubscribe
**Contract:** Needs: Task 3 | Offers: delivery states, suppression enforced in `enqueueEmail`, HMAC per-stream unsubscribe
**Touches:** `http.ts`, `emailWebhook.ts`, `enqueue.ts`, `preferences.ts`, `stalled.ts`, settings UI
**Review:** security-review
- [ ] Add verified route (raw body, node action), dedupe, monotonic transitions, suppression check -> Resend bounce test address suppresses the next send; complaint does not block a required email
- [ ] Rewrite unsubscribe as HMAC `{principal, stream}`; POST flips the preference, GET does not mutate -> one-click POST flips only that stream
- [ ] Add hard-bounce in-app banner and settings toggles

### Task 6: Send path swap
**Contract:** Needs: Tasks 4, 5 | Offers: rendered HTML plus text, tags, `vendorMessageId` stored, suppression live before any new volume
**Touches:** `notificationDelivery.ts`, `resend.ts`
**Review:** convex-reviewer
- [ ] Swap plain text for rendered mail on the existing approval, usage, statement and stalled kinds; digest stays on its own action with a counted failure instead of a silent skip -> test send to owner shows tags and stored message id

### Task 7: Observability
**Contract:** Needs: Task 6 | Offers: deliverability line, PostHog events, console counts
**Touches:** `operatorDigest.ts`, `emailWebhook.ts`, admin console
**Review:** one reviewer
- [ ] Add the digest line and bounce events -> a digest shows live counts

### Task 8: Phase 2 templates and triggers, dark
**Status: PARTIAL.** Wired: funding receipt (retry-safe on replay), refund (managed-call remedy and x402 expiry). Not wired: funding failed, stuck, credit exhausted, key issued and revoked, paused and restored, role and team membership, email changed, data request, statement. Folding is not implemented. Tasks 9 and 10 wait on the split below.
**Contract:** Needs: Tasks 6, 7 | Offers: funding receipt, funding failed, refund, stuck, Credit exhausted, key issued and revoked, paused and restored, role and team membership, email changed, data request, statement, wired but gated off
**Touches:** `moneyManagedCallRemedy*.ts`, `moneyStripeWebhookWorker.ts`, `moneyX402Expiry.ts`, `interactiveCredentialLifecycle.ts`, `security.ts`, `moneyCommercialPolicy.ts`, templates
**Review:** idempotency-guardian
- [ ] Wire `enqueueEmail` at each trigger behind the stream switch; money loaders read ledger rows and refuse on missing amounts; fold logic per Folding -> rows appear as `suppressed` with reason `stream_disabled`
- [ ] Split pending Joel's call: 8a = funding receipt and refund (done); 8b = every remaining offer above plus Folding. Do not tick Task 8 done until 8b is wired or split off.

### Task 9: Phase 3 templates and triggers, dark
**Contract:** Needs: Task 8 | Offers: welcome, provider lifecycle, first paid Task, payout, failed payout, weekly summary, offboarding, exception alert
**Touches:** provider modules, `scheduled.ts`, templates
**Review:** one reviewer
- [ ] Wire as in Task 8 -> same dark-launch proof

### Task 10: Turn sending on
**Contract:** Needs: Tasks 1 to 9, DNS verified, legal entity, ABN and address confirmed, Stripe receipts setting settled | Offers: live new mail
**Touches:** env only
**Flips:** enable `transactional`, then `alert` and `lifecycle` after two weeks of clean reports
**Review:** Joel
- [ ] Inbox tests in Gmail, Outlook, Yahoo, iCloud show spf, dkim, dmarc pass -> headers captured
- [ ] Real use: trigger a refund and a funding receipt on a test account -> each email arrives once with a working link and no duplicate Stripe receipt

## Open decisions

1. **Resend SDK or thin fetch.** Default: SDK, falling back to fetch if the spike shows no idempotency option.
2. **Lifecycle sender domain.** Default: `mail.aecon.ai` for all, moving lifecycle to `lc.aecon.ai` only if complaints affect transactional.
3. **Suspension reason in the email.** Default: generic text, a "What you can do" line, support contact, link to the page; no reason in the body (policy call for Joel).
4. **Footer entity, ABN and address.** Default: ABN plus a postal address Joel approves. Blocks Task 10.
5. **Statutory unsubscribe window.** Default: honour immediately (final); verify the statute only for the record.
6. **Stripe receipts.** Default: turn Stripe's customer receipts off so the aecon Receipt is the only one. Settled before the funding receipt goes live.
7. **Refund and key-issued fold threshold.** Default: more than 3 per hour folds into one email.
8. **Alert caps.** Default: 1 per kind per day, 3 per day total per recipient.
9. **Complaint pause threshold.** Default: 0.1% per stream.
10. **Credit terms line on the receipt and statement naming.** Default: no refundability claim until Joel supplies the policy line; "statement" until GST and ABN are confirmed.

## Decisions log

| # | Point (lens) | Ruling | Why |
|---|---|---|---|
| 1 | `withUtm` does not exist (engineering) | Accepted | Moved from Reused to new work in Task 4. |
| 2 | `providerMessageId` duplicates `vendorMessageId` (engineering) | Accepted | Reuse `vendorMessageId`; add index only. `sent` written only from `pending`; states ranked. |
| 3 | Guard compares subject and text (engineering) | Accepted | Guard compares a props digest. |
| 4 | Digest in `notificationDeliveries` needs fields it lacks (engineering) | Accepted, reversed the draft | Digest stays on its own action and key. Simpler than making required fields optional. Gains a deliverability line only. |
| 5 | Statement as required removes consent (engineering) | Accepted | Statement keeps the `invoiceReady` gate; not "Req". `call_failure_spike` added to the catalogue as alert. |
| 6 | Shared admission bucket (engineering) | Accepted | Per-stream bucket names. |
| 7 | Unsubscribe token is a rewrite (engineering) | Accepted; old links die | Rule 1, no backward compatibility. Only stalled nudges (off by default) carry old links. |
| 8 | Money amounts from ledger at send time (engineering) | Accepted | Loaders refuse on missing or unsafe amounts; Stripe receipt setting gates Task 10. |
| 9 | Svix in node action, raw body, `svix` is a new dependency (engineering) | Accepted | Written into Architecture and Task 5. |
| 10 | Task 3 "behaviour neutral" (engineering) | Accepted | Relabelled as a stated behaviour change. Kill switch listed in Task 3 offers. |
| 11 | Suppression after send swap (engineering) | Accepted | Webhook and suppression (Task 5) now precede the send swap (Task 6). |
| 12 | Task 2 env additions in step with webhook (engineering) | Accepted | Env vars declared in Task 2. |
| 13 | Idempotency key lasts 24h (engineering) | Accepted | The delivery row is authoritative; fold and weekly `sourceEventRef` defined. |
| 14 | Welcome framing (recipient) | Accepted | Transactional, setup CTA, no pitch. Moved from L to T. |
| 15 | Low Credit has two jobs (recipient) | Accepted | New `alert` stream plus a required Credit exhausted email. |
| 16 | `providerSummary` and `lifecycleEmails` default on are inferred consent (recipient) | Accepted | `consentSource` recorded; null `consentAt` means inferred; no backfill. Defaults on kept for existing-relationship provider summaries. |
| 17 | Entity and address block Task 10 (recipient) | Accepted | Added to Task 10 needs. |
| 18 | Unsubscribe timing is an open decision (recipient) | Accepted | Immediate honour is final; wording reduced to a record-only check. |
| 19 | Membership changed (L) contradicts Role changed (T) (recipient) | Accepted | Both transactional, required. |
| 20 | Hashed addresses and retention (recipient) | Accepted | Hash plus domain in `emailSuppressions`; 30-day webhook event retention. |
| 21 | Alert cap of 5 per day (recipient) | Accepted | 1 per kind per day, 3 total. |
| 22 | Task stuck and refunded overlap (recipient) | Accepted | Stuck suppressed once a refund exists. |
| 23 | Exception alert flood (recipient) | Accepted | Global 10 per hour, then a rollup. |
| 24 | Key issued noise (recipient) | Accepted | Fold over 3 per hour. |
| 25 | Missing emails (recipient) | Accepted | Funding failed, Data request received, Email changed (to old address) added; Credit exhausted per item 15. |
| 26 | Receipt Credit terms, statement naming (recipient) | Accepted, deferred to Joel | Open decision 10; no guessing. |
| 27 | Refund copy and payout failure reason class (recipient) | Accepted | Written into Templates and the catalogue. |
| 28 | Suspension copy with no reason harms users (recipient) | Partly accepted | Reason stays out (policy for Joel, decision 3); "What you can do" and support contact added. |
| 29 | GET must not mutate; POST needs no auth (recipient) | Accepted | In the endpoint spec; complaint-versus-required test in Task 5. |
| 30 | Hard-bounce in-app banner (recipient) | Accepted | Added in Task 5. |
| 31 | Compliance "Req" label for lifecycle `L` welcome with one-click header (recipient) | Rejected as separate item | Resolved by moving welcome to T (item 14). |
