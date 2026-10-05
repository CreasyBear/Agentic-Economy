> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../README.md) for its successor and remaining limits.

# Admin console and operator tooling — rebuild review

**Lens.** What the admin console does, what alpha actually needs an operator to do, and which of those jobs belong in the Convex dashboard, the Stripe dashboard, or Sentry instead of a custom screen.

**Date.** 29 September 2026. Source in this checkout. The 28 September live pass in [sweep-admin.md](../alpha/sweep-admin.md) is prior observation of the local admin shell, not a new browser run. It is used only where it shows operating reality (empty queues, two settled Calls, Clerk MFA claim absent).

**Boundary.** `/admin` is platform staff. `/owner` is the customer workspace (credit, Tools, Calls, team). This note does not treat the owner console as internal tooling. Support is already decided: a prefilled email carrying the Call reference, no case table and no admin inbox (`docs/reviews/maturity/00-decisions.md:32`).

## Verdict

Alpha does not need this console. It needs a handful of domain writes, an audit row when those writes happen, and the vendor consoles that already hold payments, function logs, and data.

The console is about **11,000 lines** of production UI, routes, client contracts, and Convex admin modules, plus about **4,800 lines** of tests. It ships twelve pages, a CSV export, six object browsers, four exception queues, a metrics warehouse, a dual-control approval inbox, and a seven-phase command sheet. One of the six commands (`change_commercial_policy`) has no screen that can start it. Two permissions in the role matrix have no caller. The one operator job named in the start line — approve USDC replenishment — is not a screen at all.

Keep the mutations that change market admission or money, and keep them auditable. Delete the browsers, the investor metrics pipeline, the approval inbox, and the configuration lamps. Operate alpha from:

| Job | Console |
|---|---|
| Read or patch a row, run an internal function, see cron and `[ae.*]` logs | Convex dashboard |
| Checkout, webhook delivery, tax rate, card outcome | Stripe dashboard |
| Uncaught web errors and `degrade()` warnings | Sentry |
| Top up the custody wallet | Coinbase CDP (not one of the three, but it is the replenishment UI) |
| Turn on the MFA claim the command sheet requires | Clerk dashboard |

The one custom surface worth carrying into a rebuild is **source-authority verification** (and, beside it, **suppress / unsuppress**) on a single Provider. Those actions bind a human decision to a publication digest. A raw table edit in the Convex dashboard can skip that check. Everything else the console renders, the three dashboards already show more honestly.

## What the console actually does

Navigation is six links: Overview, Search, Exceptions, Providers, Metrics, Audit (`src/components/ae/layout/app-shell/app-shell.contracts.ts:43-50`). Object routes are not in the nav; Search and cross-links open them. Every admin route is `noindex`. A non-admin sees “Admin access required”.

### Reads

| Surface | What it shows | Write? |
|---|---|---|
| `/admin` | Formance config parses or not; x402 custody env present or not; Clerk `fva` claim present or absent; the literal `convex: 'ok'`; four exception links; last-7-day headline; recently viewed refs stored on this device | No |
| `/admin/search` | Exact ref for Call, Quote, Tool version, Workspace, Agent, Provider. Malformed and missing are distinct. Dispute and admission-case refs are not searchable | No |
| `/admin/exceptions` | One kind and one partition at a time: uncertain Calls in `reconciliation_required` older than 15 minutes; removal disputes (opened / updated / contested); source-authority review (review required / legacy unset); admission cases (submitted / under review). Recent terminal purchase resolutions | No. The page does not resolve, close, or verify |
| `/admin/providers` | Published, claimed, unpublished, suppressed businesses | No |
| `/admin/providers/$slug` | Tool versions, connections, admissions, disputes, source-authority cards | Yes: suppress, close dispute, verify source |
| `/admin/calls/$callRef` | State, buyer purchase status, receipt, related Quote / Tool / Workspace / Agent, up to 50 audit rows joined on `correlationId` | No |
| Quote, Tool, Workspace, Agent routes | One joined read each: quote consumption, publication disposition and source-authority state, member counts, credential and spending policy, recent Calls | No |
| `/admin/metrics` | Perth-day snapshots for 7 / 30 / 90 days. Range totals withheld unless every day in the window has a complete snapshot. Copy calls these “investor-reportable ratios” | No |
| `GET /api/admin/metrics-export` | Admin-only CSV of the same days. Omits fields the snapshot does compute (`uncertainCallsOpenAtClose`, `newTransactingWorkspaces`, `newTransactingProviders`) | No |
| `/admin/audit-events` | Filterable `auditEvents`, unexpired approval proposals, grant/revoke membership | Yes: membership, and approve of a proposal |

Overview’s Convex lamp cannot go red. The query returns `convex: 'ok'` unconditionally (`convex/lib/adminConsole/reads/overview.ts:40-44`). Formance is “configured” when ledger env parses, and the values are never shown (`src/modules/money/server.ts:31-34`). Custody is the same kind of boolean over CDP env (`convex/lib/adminConsole/reads/overview.ts:26-42`). None of the four lamps probe Stripe, Formance health, CDP balance, or cron success.

### Writes the UI can start

Six commands share one wire envelope, `adminCommandArgsValue` (`convex/lib/adminConsole/commands/contracts.ts:25-46`): source-write fields plus `operationKey`, `correlationId`, `action`, `input`, `reasonCode`, `evidenceRefs`, `expectedStateDigest`, `approval`, and `proof`. The client type is `AdminCommandArgs` (`src/lib/operator/admin-console/contracts.ts:189-199`). The sheet walks reason → evidence → proof → preview → confirm → receipt (`src/components/ae/admin/actions/actions.contracts.ts:30`). A missing proof is refused as `mfa_reverification_required` (`convex/lib/adminConsole/commands/commandEnvelope.ts:144`); the client then asks Clerk for strict MFA (`src/components/ae/admin/actions/useAdminCommandProof.ts:12-17`). When the session has no `fva` claim, preview and confirm only show a warning and a link to Account security (`src/components/ae/admin/actions/AdminActionSheet.tsx:51-53`). They do not disable the button. The 28 September sweep still found the claim **Absent**, and treated guarded writes as blocked until the Clerk JWT template includes `{{session.factor_verification_age}}` and a fresh factor (`docs/reviews/alpha/sweep-admin.md:7,28`). That fix is a Clerk dashboard change. The overview lamp only reports it.

| Command | Who may run it | Where the button is | Second approval |
|---|---|---|---|
| `verify_capability_source_authority` | `owner_admin` only | Provider source-authority panel. The sheet is pre-filled with publication ref, revision, source digest, and source URL | Never |
| `set_business_suppression` | `owner_admin` only | Provider detail | Only when two or more active `owner_admin` memberships exist |
| `close_removal_dispute` | `owner_admin` only | Provider detail | Never |
| `grant_admin_membership` / `revoke_admin_membership` | `owner_admin` only | Audit page. Grant stays disabled until both a Clerk user id and a token identifier are typed; revoke until the user id is typed (`src/components/ae/admin/audit/AdminMembershipActions.tsx:67-68`) | Granting `owner_admin`, or revoking an `owner_admin`, and only once two owners exist. A support or reviewer grant does not require a second person |
| `change_commercial_policy` | `owner_admin` only | **No composer.** The approval sheet can render a proposal if one already exists | Yes, once two owners exist |

Second approval is skipped entirely while fewer than two active owner-admins exist (`convex/lib/adminConsole/approvals/approvals.ts:63-69`). With one operator, the approval inbox cannot contain a proposable action that the same person is allowed to leave pending. The 24-hour proposal TTL and the paginated inbox exist for a staff organisation alpha does not have.

`support` may read and “annotate triage”. `reviewer` may read. `annotate_triage` and `control_kernel_incidents` appear only in the role matrix (`src/modules/security/internal/admin-authority.ts:13-52`). No route calls them.

### Writes that are operator work and are not in the console

These are internal Convex functions. The dashboard (or `npx convex run` with a deploy key) is the UI. That is the right shape for alpha.

| Function | What the operator is doing | Web route |
|---|---|---|
| `recoveryBreakGlass.submitRecoveryApproval` / `authorizeRecoveryOperation` | Admit a recovery the normal path will not take | None. `internalMutation` only (`convex/recoveryBreakGlass.ts:10-19`). Audit label `admin.break_glass_used` exists so a past use can be filtered; the sweep found no such rows and no button |
| `moneyManagedCallRemedyActions.resolveLostResult` / `resolveInvalidResult` | After a paid Call loses its response: restore buyer credit and account for the Provider, given the existing transaction hash. No new signature, Provider call, or chain transfer | None. `internalAction` (`convex/moneyManagedCallRemedyActions.ts:25-38`) |
| `moneyTreasury.recordObservation` | Record CDP USDC balance as treasury evidence | No button. Cron `observe x402 treasury` every 15 minutes calls it (`src/lib/deployment/scheduled-workloads.ts:38`, `convex/moneyTreasuryObservation.ts:86-129`) |

`syncFormanceCapacity` states the replenishment rule in code: an observation refresh reuses the original funding and **never replenishes** spent or reserved capacity (`src/modules/money/formance-workflows.ts:144-149`). Quote admission separately caps spendable capacity by the latest wallet observation. Topping up USDC is a transfer in the custody wallet, not an admin command.

`docs/operations/local-stripe-test-mode.md:54` still says nothing outside unit tests calls `recordObservation`, and tells the operator to hand-assemble a `npx convex run`. That sentence is stale. The cron is the writer. A failed or skipped run shows up as a Convex log reason (`custody_disabled`, `balance_*`, `custody_buffer_out_of_range`), not as an admin banner.

## What alpha needs an operator to do

The start line is one Australian customer, one agent, one admitted x402 Tool, one AUD funding method, one controlled paid Call, and explicit recovery (`START_LINE.md:202-219`). Production money stays off until the legal gates in `PRODUCT.md:611-616`. The only operator sentence in that scope is: “Operator-approved USDC replenishment with automated coverage monitoring, reconciliation, warnings and Call admission” (`START_LINE.md:218-219`).

Mapped onto the code that exists, the jobs are:

1. **Make funding real in Stripe.** Test (and later live) secret, webhook secret, and an AU-inclusive GST tax rate. Checkout refuses without the tax rate id. Hosted webhook endpoints are created in the Stripe dashboard, not by an admin form (`docs/operations/local-stripe-test-mode.md`). Inspection of a payment, a failed webhook, or a refund is the Stripe dashboard. Admin metrics do not include funding (`docs/reviews/alpha/health/observability.md:109`).

2. **Put USDC in the custody wallet and confirm the next observation.** Fund via the Coinbase CDP faucet or treasury, leave `observe x402 treasury` running, and confirm a `moneyTreasuryObservations` row. Call admission reads that row. There is no approval object, no warning inbox, and no replenishment button. The start-line phrase is ahead of the code. Building a screen would invent a second funding path. The operator action is the wallet transfer plus a Convex row check. Warnings, if they are needed, are a Convex log or a Sentry/log alert on `kind: 'skipped'`, not a new page.

3. **Verify the one Tool’s source authority.** This is the domain decision: the publication’s revision and source digest either match the evidence or they do not (`src/components/ae/admin/provider-object/SourceAuthorityReviewPanel.tsx:14-24`). A Convex data-browser edit of `sourceAuthorityState` would not record the reason, the evidence ref, or the expected digest. Keep this command. It is a one-time (and occasional re-review) act for alpha’s single Tool, not a queue product. The 28 September sweep already showed the cost of the queue: Provider detail labelled publications “Review required” while the review-required partition was empty (`docs/reviews/alpha/sweep-admin.md:10`).

4. **Suppress that business if it must leave the catalogue.** Same reason as verification: the write is a market-integrity transition with a reason code (`policy_violation`, `legal_notice`, `provider_request`, `fraud_suspected`, lift after review). Rare at one Tool. Keep the mutation. Do not keep a filterable provider directory for it.

5. **Notice a Call that stayed `reconciliation_required`.** The 15-minute cron `reconcile due facilitator invocations` is the first responder (`src/lib/deployment/scheduled-workloads.ts:21`). The exception feed only lists rows older than 15 minutes (`convex/lib/adminConsole/reads/exceptions.ts:12,70-78`), and then it only links to the Call. The human remedy is `resolveLostResult` with the transaction hash. At the volume the sweep saw — two settled Calls, zero uncertain Calls — filtering `capabilityCalls` by state in the Convex dashboard is the list. The feed does not perform the remedy, so it is not the operational surface.

6. **Bootstrap exactly one owner admin.** Env allowlist plus the bootstrap mutation, while zero owner-admins exist (`src/modules/security/internal/admin-authority.ts:84-86`). After that, grant/revoke is unused until a second person joins. Dual control should stay off until that person exists; the code already does this.

7. **Read a failure.** Web render errors, uncaught server errors outside `/api/health` and `/api/ready`, and `degrade()` warnings go to Sentry when `SENTRY_DSN` is set. Convex caught failures are `[ae.degraded]` and `[ae.exception]` console lines; this repo does not configure Convex’s Sentry integration or a log drain (`docs/reviews/alpha/health/observability.md:20,94`). Journey alert rules are a Sentry-UI checklist (`docs/operations/journey-alerts.md`), not an admin page. Nothing in `/admin` pages an operator. `/status` can say new Calls are ready while funding is missing (`docs/reviews/alpha/health/observability.md:84-90`).

Jobs alpha explicitly does **not** include, that the console was built as if it did:

- A support inbox. Cut by decision (`docs/reviews/maturity/00-decisions.md:32`).
- Bank payout ingestion. Operator copy is “payout not yet observed” (`docs/reviews/maturity/00-decisions.md:35`).
- Investor ratios, 90-day coverage, and CSV export. The metrics description says so (`src/components/ae/admin/metrics/metrics.contracts.ts:57-59`). The only readers are `/admin`, the overview strip, and the CSV route.
- Commercial-policy editing in the browser. The live controls (fee bps, tax, treasury buffer, Formance versions) are source (`src/modules/money/internal/commercial-policy.ts`). The change command is real and versioned, and nothing in the UI can fill in `changeKind`, family, revision, and the control object. Alpha changes policy by changing source. A later production change-control mutation can stay internal until two people must approve it.
- Removal disputes and admission-case worklists. Both queues were empty in the live sweep. Closing a dispute is a real command, and it can wait on the Provider record if a dispute row ever exists. It does not justify four partitions.
- `support` and `reviewer` seats. Nobody can do the thing `support` is uniquely allowed to do.

## What to leave to Convex, Stripe, and Sentry

### Convex dashboard

Use it for anything that is “open the row, see the log, run the internal function”.

| Custom screen | Convex already has |
|---|---|
| Call, Quote, Tool, Workspace, Agent, Provider browsers | Data browser on `capabilityCalls`, `capabilityQuotes`, publication and account tables, with the indexes those pages already query (`by_callRef`, `by_state_and_reconciliation_nextAttemptAt`, and the audit `by_correlationId_and_createdAt` join) |
| Audit event explorer | `auditEvents`. Filters in the console (type, actor, target, correlation, time) are the dashboard’s filter row |
| Exception queues | The same indexed queries. Uncertain Calls are `state = reconciliation_required`. The 15-minute age cut is a product choice, not a dashboard feature; at alpha volume it is unnecessary |
| Approval inbox | `adminApprovalProposals`. Empty until a second owner exists |
| Metrics days | `marketplaceMetricDays` / `marketplaceMetricBuilds`, if the cron is kept. Prefer deleting both (below) |
| Treasury evidence | `moneyTreasuryObservations`. This is the coverage read the start line describes |
| Cron health | The scheduled workload list (`src/lib/deployment/scheduled-workloads.ts:20-39`): facilitator reconciliation, FX, directory refresh, treasury observation, metrics snapshot |
| Lost-result remedy and break-glass | Run the internal function. Arguments are a Call ref and a transaction hash, or the break-glass approval payload. Do not wrap them in the seven-phase sheet |
| “Convex: OK” | Meaningless. Function logs and the deployment’s own health are the signal. `/api/ready` checks a Convex HTTP probe and still treats any status from 200 through 499 as ready (`docs/reviews/alpha/health/observability.md:72`) |

Do not use the data browser to flip `sourceAuthorityState` or suppression. Those two transitions should keep going through the command so the digest, reason, and audit event stay attached.

### Stripe dashboard

The admin console does not show a payment, a Checkout Session, a webhook delivery, a refund, or a tax rate. It should not grow those screens.

| Operator question | Where |
|---|---|
| Did the top-up capture? | Payments, test vs live mode |
| Did `checkout.session.completed` reach the app? | Webhook deliveries, against `POST /api/stripe/webhook` |
| Is the AU inclusive GST rate the one in `STRIPE_AU_INCLUSIVE_GST_TAX_RATE_ID`? | Products → Tax rates |
| Card dispute or Radar review | Stripe. Unrelated to AE “removal dispute”, which is a catalogue takedown (`close_removal_dispute`) |
| Endpoint URL drift | The Stripe dashboard is where the destination and a delivery failure are visible (`docs/operations/local-stripe-test-mode.md`) |

Buyer-visible credit, reservation, and the Call receipt stay in the product (`/owner` and the Call record). Stripe does not know the Quote or the Provider obligation. That split is already the ownership boundary in `PRODUCT.md:563-565`. An admin “payments” page would duplicate Stripe and still be the wrong ledger.

### Sentry

Sentry is the error tracker for the web process when a DSN is set: uncaught requests, client errors posted to `/api/observability/client-error`, and `degrade()` warnings (`docs/reviews/alpha/health/observability.md:16-33`). Admin PostHog events (`admin_command`, `admin_lookup`, `admin_queue_view`) are usage analytics for the console itself (`src/lib/observability/admin-event-props.ts:35-47`). They are not an alert.

Use Sentry for:

- Page-level and request-level failures on the paid path and on public pages.
- The journey rules in `docs/operations/journey-alerts.md`, once `[ae.journey]` (or the Convex log drain those rules depend on) is actually emitted. Until Convex logs reach Sentry, a stuck Call is a Convex log, not a Sentry issue. Do not build an admin chart to stand in for that drain.
- The overview’s impulse to show “is the site up?”. `/api/health` and Sentry uptime cover that. The admin overview cannot.

Do not send operators to Sentry for money state. A captured exception is not a purchase resolution. The Call row and, when they must act, `resolveLostResult` remain the money path.

### The lamps that are a fourth console

Formance presence is not Formance. Ledger drift, a refused posting, and capacity sync belong in Formance’s own ledger UI and in Convex logs around the money commands. CDP “configured” is not a balance; the balance is the observation row and the CDP portal. Clerk “MFA claim absent” is a JWT-template fix in the Clerk dashboard (`{{session.factor_verification_age}}`, as the sweep notes). The overview is a worse version of four other consoles, plus a constant.

## What a rebuild should keep as code

Keep these even if every admin route is deleted:

- **Admin membership as a gate**, including bootstrap-from-empty and “cannot revoke the last owner”. Reads of other people’s Calls must not be public. One env allowlist is enough for alpha. The grant/revoke sheet can go.
- **The two market commands**: `verify_capability_source_authority` and `set_business_suppression`, with reason, evidence, expected revision/digest, idempotency, and an audit event. A single Provider page that opens those sheets is the only custom screen this review would rebuild. It can be an internal function with the same checks if a page is not worth it; the checks themselves are not optional.
- **`close_removal_dispute`** as a mutation on the dispute row, without a worklist, until a dispute exists.
- **Audit writes** on those commands and on break-glass. The audit browser is optional. The rows are not.
- **Internal remedy and break-glass**, still internal, still absent from the web shell.
- **The treasury observation cron** and the Quote gate that reads it. That is automated coverage monitoring. It is not a screen.
- **The facilitator reconciliation cron.** The human list is whatever that cron fails to clear.

Delete with the screens, because nothing else reads them:

- The daily metrics snapshot cron, `marketplaceMetricDays`, `marketplaceMetricBuilds`, `/admin/metrics`, and `/api/admin/metrics-export`. Public catalogue counts are a different API (`/api/v1/market-metrics`) and are not this pipeline (`docs/reviews/alpha/health/observability.md:59`).
- Overview configuration lamps and recently-viewed local storage.
- Exact-reference Search as a product. Call refs in the support email are enough to paste into the Convex dashboard. If the Provider page remains, it does not need a six-type parser in front of it.
- The four-kind exception worklist, including the source-authority partition that already disagrees with Provider detail.
- The approval inbox, proposal table, and 24-hour TTL, until a second owner-admin is a real person. `needsSecondApproval` can stay in the mutation and remain dormant while the count is 1.
- `support` and `reviewer`, and the dead `annotate_triage` / `control_kernel_incidents` permissions.
- A commercial-policy form. Keep the versioned mutation internal for the day policy must change without a deploy. Do not design the six-family control sheet for alpha.
- Admin PostHog capture. It measures use of a console that should not be in the critical path.

## Alpha operator loop, without the console

For the one paid Call the start line asks for, the loop is:

1. Stripe dashboard (test mode): tax rate, webhook endpoint, a successful Checkout. `stripe listen` for the secret, or copy it from the dashboard endpoint. Confirm credit on `/owner/credit`, which is the customer surface, not admin.
2. CDP: fund the custody wallet. Convex logs: the next `observe x402 treasury` run recorded a balance rather than `skipped`. Convex data: one `moneyTreasuryObservations` row. Then Quote.
3. Provider verification: run `verify_capability_source_authority` once, through the retained command, against the publication digest. Then publish.
4. If the Call returns: the customer Call page is the receipt. No admin step.
5. If the Call stays `reconciliation_required` after the 15-minute reconciler: Convex dashboard, that row, then `resolveLostResult` with the transaction hash. Sentry only if the web or action threw.
6. If a webhook or card payment looks wrong: Stripe dashboard, not a metric tile. The daily snapshot will not include it, and it will not page anyone.

That loop uses one custom command (step 3), one internal action (step 5), and otherwise Stripe, Convex, CDP, and Sentry. It does not use Overview, Search, Exceptions, Metrics, Audit, or the object browsers.

## Evidence limits

- Line counts are production `src/components/ae/admin`, admin routes, `src/lib/operator/admin-console`, `convex/lib/adminConsole`, `convex/adminConsole*.ts`, and `convex/lib/security/admin*`, excluding tests: 5,763 + 532 + 703 + 3,647 + 401. Domain modules those commands call (business suppression, source authority, commercial policy, Formance, recovery) sit outside that count and mostly stay.
- No new live click-through was run. Queue emptiness, the MFA block, and “2 settled Calls” are the 28 September sweep.
- Convex, Stripe, and Sentry dashboards were not opened. The claim is that the source sends the relevant facts there (or to a table those dashboards can open), not that a specific project is configured in production. A missing DSN or log drain means the operator currently has neither the admin page nor Sentry for Convex failures (`docs/reviews/alpha/health/observability.md:94`). Connecting the drain is the fix. A custom error screen is not.
