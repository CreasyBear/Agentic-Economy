# Journey events and product roast, 2026-10-11

Scope: read-only traces on branch codex/email-design plus live curl checks of aecon.ai and app.aecon.ai. No env files read, no sends, nothing run live beyond GET and the public search POST. Deployment flag values were not checked anywhere.

Totals for Part 1: 43 triggers. Emitted 5, partial 17, missing 21.

## Part 1: email trigger coverage

Status key: emitted = producer wired end to end (send may still be dark behind a flag); partial = producer or event exists but content, suppression or reach is incomplete; missing = no producer. "Reachable" means by a real user. Email numbers refer to docs/designs/email-design-system.md.

| Trigger | Emails | Status | Where | Reachable by a real user | Data gaps | Fix | Verification |
|---|---|---|---|---|---|---|---|
| signed_up plus account provisioned | 4 Welcome | emitted (was partial) | provisioning.ts:338-342; enqueue.ts:26-27,81; delivery.ts:154-184; account-notice.tsx | Yes, on first authenticated server call, not on Clerk sign-up alone (no user.created handler). Dark unless AE_EMAIL_PHASE3_ENABLED=true | Flag value unread; playbook T3 unread; email-system.md:21 stale | No trigger change. Reconcile playbook T3 with template; optional funded check in readAccountNoticeContext; fix email-system.md:21. Keep flag unset until a sandbox send is verified | Confirmed |
| totalUnits at or above A$1,000 | 5 Funding tax invoice | missing | enqueue.ts:18-22,150-164; render.tsx:47; tax-invoice-control.ts:69-76; design lines 164, 312 | No. Payer gets funding_receipt only | Production tax policy and env unverified | Load legalName and ABN into funding_receipt props (delivery.ts ~120); add tax_invoice case and template. Threshold gates only the document block | Confirmed |
| funded journey event | 4, 26, 5, 27 | emitted | events.ts:53; stripeEventPipeline.ts:285; stalled.ts:34,46 | Stripe path yes; x402 emits no funded event; no 27 trigger | Stripe delivery, flags unverified | Optional enqueue-time suppression; email 27 needs a delayed-send path | Confirmed |
| payment_intent.payment_failed | 6 Funding failed | missing | stripe-money-webhook.ts:53-64; stripeEventPipeline.ts:179-193 | Partly: async_payment_failed sets failed state, no email | phase2Enabled unchecked | Pick trigger (doc or mapper), enqueue funding_failed after pipeline:192 with 48 h topped_up suppression, add test | Confirmed |
| Charge pending beyond N minutes | 7 Payment stuck | missing | schema:134; enqueue.ts:19; design:166,316 | No | N undefined | Define N; add kind, sweep over pending moneyFundingCommands, enqueue keyed by command ref | Confirmed |
| Calendar month closed with calls | 8 Call statement | partial | moneyMonthlyUsageDraft.ts:24; usageAlerts.ts:47-51,100-103; statement-ready.tsx | Web only (Complete month button). No cron; requestAutomaticMonths has no caller | Zero-call guard not traced | Skip zero-call months; pass totals, call rows, year in props | Confirmed |
| Approval request created | 10 Agent approval | partial | callReservationActions.ts:244-260; callRecoveryProjection.ts:53-58; enqueue.ts:116-145; agent-approval.tsx | Produced in code; entry route not fully traced. No amount threshold; cap is 3 per hour, not 5 | Stream switch, workpool unverified | Pass maximumSpend, requestRef to CTA; replace suppressed over-cap rows with an "N waiting" roll-up | Confirmed |
| Approval decided or expired | 10 (suppress) | emitted | delivery.ts:185-196; admissionApprovals.ts:40 | Yes (send-time suppress) | Approve/deny does not mark row suppressed (untraced) | None needed; optional early suppress | n/a |
| Balance below threshold | 11 Low credit | partial | usageAlerts.ts:52-80; sourceVersions.ts:25-31 | Partly: after a Call or report completes; top-ups never evaluate | No crossing or 2x re-arm state; month-keyed dedupe; 60 s freshness drop | Armed/disarmed state, re-arm above 2x, evaluate on funding success, episode key | Confirmed |
| Balance zero, call refused | 12 Credit exhausted | missing | quoteValuation.ts:365 (no enqueue); usage-alert-evidence.ts:2 | Refusal yes, email no | Prod flag unread | Producer at issueQuote.ts:210-213; do not route via usageAlerts; add delivery branch | Confirmed |
| Monthly spend cap hit | 13 Spend cap reached | partial | usageAlerts.ts:59-69; usage-alert.tsx:13-14 | Web only to set cap; alert fires after paid Call | No cap amount, reset date, timezone; subject generic | Add cap and period end to evidence and template; subject "Spend cap reached" | Confirmed |
| spend_cap_changed | 13 (suppress if raised) | missing | configure.ts:87-150 | Web only, no event | CLI budget commands unchecked | Add event name, emit in configure.ts, suppress 24 h on raise | Confirmed |
| provider_call_failed (first) | 34 First call failed | missing | schema.ts:17-18; dispatchFinalize.ts ~71 | Failure yes, email no | API key last four not stored | Add event, emit on provider fault before first_call, add kind and template | Confirmed |
| API key revoked | 16 Key revoked | missing | revocation.ts:207-265 | Revoke yes (web), email no | No last-four field; no batching code | Enqueue after audit row; build 10 min batch first | Confirmed |
| Pause cleared | 18 Account restored | missing | authorization.ts:70-88 (freeze only) | No | account_paused also unproduced | Add restore writer, enqueue, extend gate | Confirmed |
| Member added, removed, role changed | 19 Role or membership | missing | memberships/ (no enqueue) | State change on web, no email | CLI/MCP unchecked | Enqueue in membershipCreated/Updated/Deleted | Confirmed |
| Clerk primary email change | 20 Email changed | missing | clerk-security-webhook.ts:107-125 | No | No prior address stored | Snapshot old email, compare on user.updated, enqueue to both | Confirmed |
| Data export complete | 21 Data export ready | missing | api.owner.data-export.ts; personal-data-export.functions.ts:90 | Export works (sync, no step-up, no email) | No job id or expiry | Make export a gated mutation with record, enqueue on completion | Confirmed |
| Deletion requested with step-up | 22 Deletion requested | missing | retire.ts; owner.settings.privacy.tsx | No request flow, only Clerk user.deleted | Grace length (Q2) open | Add request mutation, kind, template | Confirmed |
| deletion_cancelled | 35 Deletion cancelled | missing | schema.ts:16-19 | No | Q2 open | Resolve Q2, then request and cancel state | Confirmed |
| Grace period ends in 3 days | 36 Final reminder | missing | crons.ts (none) | No | Release worktree unsearched | Answer Q2, add state and cron | Confirmed |
| Deletion executed | 23 Deletion completed | missing | retire.ts:149 | No | Clerk subscription unverified | Capture address before delete, enqueue, text-only template | Confirmed |
| Listing passes publish checks | 24 Provider live | partial | prepared.ts:386-391 | Yes when flags allow | Name and publish time not in payload | Wire name and publishedAt through | Confirmed |
| Provider removed or fails verification | 25 Provider offboarded | partial | verifyPages.ts:126-129 (success only) | Removal yes; failed verification sends nothing | AE_SITE_URL effect unverified | Fix doc or enqueue on block path | Confirmed |
| provider_first_call | 24 metric, M6 | missing | dispatchFinalize.ts:75 (buyer only) | No | Provider id from toolRef unconfirmed | Add event, resolve provider account, emit | Confirmed |
| signed_up, no funded after 24 h | 26 Stalled not funded | partial | stalled.ts:34-64; journey/stalled.ts:8-27; crons.ts:27 | Cron only, needs flag and owner opt-in; x402 funders still emailed | No balance check, no consent evidence | Live-balance check, emit funded on x402, pass consent evidence | Confirmed |
| agent_connected, no first_call | 28 Stalled never called | emitted (was partial) | records.ts:170; journey/stalled.ts:11; stalled.ts:42-93 | Producers yes; send needs flag and opt-in | 24 h in code vs 72 h in doc; row 34 clause unbuilt | Align timing, drop or build clause, align subject | Confirmed |
| first_call then activated | 29 First call done | partial | dispatchFinalize.ts:65-88 (PostHog only) | Event yes, email no | ownerId equals accountRef unverified | Add kind and template; enqueue when first_call emit returns true | Confirmed |
| retained_w1 | 30 Week one wrap | partial (was missing) | dispatchFinalize.ts:66-87 | Event yes, email no | No week-stats read model | Hook enqueue after emit; add kind, template, query | Confirmed |
| Daily operator digest | 31 Operator digest | partial | scheduled-workloads.ts:45; operatorDigest.ts:85-157 | Operator inbox only | Spec differs from built behaviour | Update design doc to match; decide P8 skip | Confirmed |
| 3 days after auto top-up fail | R1 follow-up | missing | design:191 only | No auto top-up exists | Doc says 24 h, not 3 days | Confirm timing; build attempt record first | Confirmed |
| Payment method attached or detached | 33 Card added or removed | missing | stripe-money-webhook.ts:53-65 | No | Actor unavailable | Add webhook cases, event name, kind | Confirmed |
| Dormant after use (7 days) | R2 Inactivity nudge | missing | playbook:54,75 | No | Deferred until 30 days of events | None now | Confirmed |
| One-click or settings unsubscribe | All lifecycle | partial | convex/http.ts:40-71; preferences.ts:257-290 | Only via a lifecycle email | No lifecycle_unsubscribed event | Add event, generic send-time suppression, consentBasis | Confirmed |
| Resend bounce or complaint | All kinds | emitted | http.ts:43; emailWebhook.ts:53 | If Resend subscription configured | Operator send lacks suppression check | Add readSendSuppression before notificationDelivery.ts:98 | n/a |
| Resend delivery events | Metrics | partial | emailWebhook.ts:43-104; delivery.ts:66-70,253 | Partially | Click link not parsed; stream/env tags unverified | Parse clicks, rank guard at :253, fix doc path | Confirmed |
| email_sent event | All | missing | delivery.ts:233-263 | No | None | Emit in completeDeliveryHandler after sent patch | Confirmed |
| Lifecycle caps and priority | Lifecycle kinds | partial | enqueue.ts:27-60 | No lifecycle cap exists | Welcome is transactional | Add lifecycle branch to alertCapCode | Confirmed |
| Quiet hours 8am to 8pm | Lifecycle | partial (was missing) | design:230,318 | Not implemented | No owner timezone field | Store timezone, compute runAt, recheck at send | Changed from missing |
| Alert batch windows | 9 to 16 | partial | enqueue.ts:24-30; usageAlerts.ts:45,63,67 | Partly | No key mutation found | Armed flag; provider plus 6 h key | Confirmed |
| consentBasis enforcement | Lifecycle | missing | enqueue.ts:63-120; stalled.ts:52-58 | Only stalled path, opt-in not stored as basis | Q3 open | Close Q3; add optional fields, then require | Confirmed |
| Feature gates | 4, 26 to 28, new | partial | enqueue.ts:10-27,79-81; stalled.ts:34,40 | Stalled and welcome gated; T13 kinds unwired | Live flag values unread | Run `npx convex env list` on dev and prod; add per-kind switches (D9) | Confirmed |
| Send-time suppression and account state | All non-security | partial | notificationDelivery.ts:19-62; stalled.ts:21-32 | Internal only | No deletion-pending writer | Add account-active gate in readNotificationContext | Confirmed |

### Journey fixes needed before each email works, by funnel stage

1. Acquire and sign-up: handle Clerk user.created (or accept first server call as the trigger); decide welcome stream (transactional bypasses opt-out); reconcile playbook T3; set AE_EMAIL_PHASE3_ENABLED only after a sandbox send. Define consentBasis (Q3) before any lifecycle send.
2. Fund: emit funded from x402 paths; add live-balance check to the stalled not funded sweep; wire funding_failed (choose trigger), payment_stuck (define N), tax invoice email; evaluate low credit on funding success.
3. Connect agent and first call: align never-called timing (24 h vs 72 h); add provider_call_failed event and email 34; add first_call_done (29) hooked to the first_call emit; ship the lifecycle cap (one per 24 h, four in 14 days).
4. Use and spend: low credit crossing state with 2x re-arm; credit_exhausted producer; spend cap copy (amount, reset date) and spend_cap_changed; approval request CTA with requestRef and roll-up; statement email with zero-call skip and real content; week-one wrap (30); owner timezone and quiet hours.
5. Account control and security: key revoked, role or membership changed, email changed (needs old address snapshot), account paused and restored writers, payment method changed.
6. Provider side: provider_live payload (name, time), provider_offboarded failure path, provider_first_call event.
7. Leave and data rights: export as a gated job with expiry, deletion request, cancel, 3-day reminder and completed notice (needs Q2 grace length first).
8. Measurement and compliance: email_sent event, click parsing, lifecycle_unsubscribed event, suppression check on the operator send, per-kind switches.

## Part 2: product roast

Method: five personas plus agent view, live curl of aecon.ai and app.aecon.ai plus source reads. Only findings confirmed by two independent checks are ranked. Counts: 28 confirmed (6 blockers, 22 majors). Several items were reported by more than one persona and are merged into themes below.

### Theme 1: launch state contradicts itself (blockers)

Public copy (llms.txt, /launch, brand-copy.ts:71) says public accounts, AUD funding and paid purchases are not open. The app says otherwise: /status "Tool search and new Calls are ready", /for-agents "Start setup" and "pay per Call in AUD", SKILL.md "Quote then Call", the owner Credit page with funding reads, and the homepage hero "Pay per request". Search results show A$ prices on tools that are all `setup_required`.
Smallest fix: one availability string everywhere, sourced from /launch. Replace "Start setup" with "Join the waitlist", the status Calls row with "not open", and show "not available yet" instead of prices. Gate the Credit nav behind the same flag.
Evidence: aecon.ai/launch; app.aecon.ai/status, /for-agents, /SKILL.md; src/routes/-status.functions.ts:70; src/routes/_operator/owner.credit.tsx.

### Theme 2: install and connect path is broken (blockers and majors)

The CLI tarball link 404s on both hosts, the npm name differs from the docs (`@agentic-economy/cli` vs `@aecon/cli`, 404), /developers has no copyable command, and /status and /support return 404 on aecon.ai even though routes exist. Names also drift: aecon, Agentic Economy, `ae`, MCP key `agentic-economy`, three tool-name styles.
Smallest fix: publish or host the tarball and add a CI curl plus `ae --version` check; put one `claude mcp add --transport http aecon https://app.aecon.ai/mcp` line on /developers (confirm unauthenticated tools/list first); fix /status and /support 404s with a CI smoke check; pick one server key and tool prefix.
Evidence: src/lib/cli-distribution.ts:32; packages/cli/package.json; curl 404s; src/start.ts:149.

### Theme 3: stale and partial catalogue is not shown to users (majors)

Catalogue is 40 h stale, search returns `partialResults: true`, freshness `absent`, and the quickstart tells agents to distrust a stale catalogue. No banner appears in the UI, llms.txt calls the catalogue "canonical", status says "degraded" while the Tool API row says "Operational", and listings read `not_verified`.
Smallest fix: one banner and top-line summary ("Partial: 6 checked, catalogue 40 h old, 0 ready to call") in UI, API and CLI; name the failing system in the status headline; say "listed" not "admitted" until verified.
Evidence: /api/v1/catalogue-status, /api/v1/market-tools/search, site-manifest.ts:48.

### Theme 4: undisclosed third-party processing (majors)

Every search sends the query and candidate summaries to OpenRouter. It is disclosed only in a JSON `recipient` field, not on /developers, llms.txt, SKILL.md or the provider pages. Providers' listing summaries are also sent.
Smallest fix: one disclosure line on those pages and the privacy page; consider a keyword-only search path.

### Theme 5: vocabulary and docs unreadable to newcomers (majors)

Tool, Call, Plan, Quote, receipt, funding session are never defined; SKILL.md is compressed jargon; the OpenAPI spec advertises `/api/v1/sandbox-reference`, which returns 404; the developer page promises key access that is not open.
Smallest fix: five-line glossary, SKILL.md as five numbered steps with one example each, remove or mark the sandbox path internal, add "accounts open at launch, discovery works now" banner.

### Disputed (not ranked)

- One tool shows three prices (label, indicative AUD, fixed USDC).
- Provider verdict: cannot earn today; /for-providers shows only a title in static HTML and no steps, fees or payout terms.
- Homepage has almost no readable text without JavaScript.
- aecon.ai scoring 69 (C) and ranking #1 of 13 scanned businesses is too small a sample to mean anything.

### Minor, unranked

Status page contradicts itself; How it works is abstract; OpenAPI path 404 from docs; free audit claim untested; MCP discovery file missing and names differ; search rows lack price while list rows have it; duplicated step label and unanswered FAQ on for-agents; 472 KB OpenAPI with no agent subset; discovery requires sign-in for two of three paths; provider copy written for buyers; receipts split across Buy, Settings and Activity; alert settings copy is jargon; developer entry split across two hosts; POST-only discovery; two value propositions on two domains; discovery endpoints differ between origins.

## Part 3: the five things to fix first

1. Make launch state one truth. Use a single availability string sourced from /launch on every page, status row and API description; swap "Start setup" for "Join the waitlist" and hide prices on `setup_required` tools until accounts open.
2. Make the install path work and prove it in CI. Publish or host the CLI tarball under the name the docs use, put one copyable MCP line on /developers, fix the aecon.ai /status and /support 404s, and add a curl plus `ae --version` smoke check.
3. Show catalogue freshness where people look. Add a stale and partial banner to the UI, API summary and CLI, name the failing system in the status headline, and stop calling an unverified catalogue canonical or admitted.
4. Disclose OpenRouter on /developers, llms.txt, SKILL.md, provider pages and the privacy page, and rewrite SKILL.md and a four-word glossary so a first-time agent can follow it.
5. Wire the emails that stop money and trust leaking, in funnel order: emit funded on x402 and add the live-balance check before enabling stalled emails, wire funding_failed and credit_exhausted, fix low-credit crossing and re-arm, then add consentBasis, the lifecycle cap and the email_sent event before turning any lifecycle flag on.
