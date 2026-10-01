# Founder console

## Active delivery goal — 1 October 2026

Deliver a working founder operating console on the existing `/admin` surface.
Joel can sign in, understand actual marketplace traction and money, find an
affected Account or purchase, take a supported authorized action, and verify its
outcome. Unauthorized and revoked users cannot read or operate the console.
Completion includes the deployed application, actual telemetry receipt and alert
verification; a component preview or SDK connection check does not complete it.
The app goal tool rejected this side conversation because it is not a persistent
thread; this existing design document records the requested goal and acceptance.

### Design and execution

Thesis: absorb the work of connecting business activity, customer impact and
operational evidence so the founder spends attention on decisions. The previous
brief below is implementation history, not the final acceptance standard.

Keep the existing admin authority, command receipts, treasury, PostHog, Sentry,
ARC and AE component system. Add no service or general reporting framework.
Use one calm home for business movement and material exceptions, with connected
activity and Account drilldowns that preserve period and environment. Missing
coverage stays distinct from zero activity. Source records own business facts;
browser analytics provide acquisition and interaction context.

Work sequence (one owner, isolated `codex/founder-console` worktree):

- [x] Integrate the latest committed money foundation without changing the shared checkout.
- [x] Establish environment-scoped, funding-aware marketplace measurements and Account activity in source.
- [x] Complete the founder home and connected purchase/Account investigation paths.
- [x] Connect existing money/readiness/exception controls to context and existing command readback.
- [ ] Complete actual application telemetry, useful vendor dashboards and alert delivery.
- [ ] Pass behavioral checks, repository checks, full release gate and browser acceptance.
- [ ] Deliver the matching release and verify founder access, refused access and live evidence.

### Contracts and complexity decisions

Requires: current server-verified admin permission, a validated period, and an
explicit deployment environment. Money classifications require the original
authoritative booking; an absent classification is unknown, never purchased.
Ensures: each headline has a definition, evidence window and connected records;
repeat activity counts distinct Accounts, and customer-funded activity excludes
promotional-only purchases. An Account is not silently relabelled a person.
Invariant: money, delivery, resolution and authorization remain distinct;
partial reads do not produce complete totals; reads never dispatch purchases or
change funds. Existing command authority, idempotency, MFA and approval rules own
every mutation and its receipt.
On violation: refuse unauthorized reads before loading business records, reject
invalid filters, preserve unavailable/partial evidence, and retain pending or
unknown command outcomes until authoritative readback establishes a result.

Complexity budget: extend the existing metric and admin read boundaries only
where the founder needs funded-activity meaning or a contextual record list.
This adds typed projections and their validators/tests, buying consistent metric
definitions and removing manual joins from the UI. Reuse existing persisted
snapshots and commands rather than add another database, scheduler, security
layer, BI engine or autonomous-agent system. Keep additions with real callers;
remove duplicate display-only wrappers and mock-only flows.

Cognitive-load audit: the prior home gives six independent regions equal weight,
places purchase readiness after charts/vendor links, and asks the founder to
choose record kinds and supply opaque references. Prioritize material blockers;
offer readable Account/purchase lists and contextual navigation; keep detailed
technical evidence available without making it the initial decision surface.
Visual hierarchy should work with sparse real data, not depend on a demo chart.

Acceptance evidence must establish actual meanings and behavior: environment and
funding isolation, distinct/repeat Account counting, partial/missing coverage,
authorized/refused reads and exports, contextual navigation, and supported
command pending/replay/confirmed states. Record deployment and runtime evidence
separately from local source checks.

Telemetry error strategy: the live development diagnostic exposed a programmer
error in the privacy scrubber: arrays became objects, invalidating Sentry's
exception/frame/breadcrumb schema. Requires: arbitrary telemetry values, including
nested arrays and cycles. Ensures: a redacted copy with array order and shape
preserved. Invariant: input remains unchanged and repeated references are not
misclassified as cycles. On violation: unreadable elements are filtered locally;
cycles and excessive depth stay bounded. The reporting boundary remains nothrow
for business requests, while transport recovery belongs to the existing SDK.
Keep the small array branch in the existing scrubber; no new reporting wrapper or
retry loop. Regression evidence covers real Sentry event shapes, secret removal,
unchanged inputs, repeated references, cycles and throwing element getters.
Admin visits also stop product analytics for that page runtime, including later
SPA navigation; Sentry remains separately redacted. Fresh public visits continue
to measure acquisition without counting founder console work as product usage.
Vitest now blanks inherited Sentry/PostHog credentials; SDK contract tests opt in
with fake keys and mocked transports. The isolated Playwright source-proof server
disables telemetry. This prevents routine negative test cases becoming vendor
incidents; it does not disable telemetry in the actual local or hosted app.

### Current acceptance evidence

- The full source release gate passed on 1 October: 7,577 unit tests; 2,674
  integration tests; source, clean type, import/security, SEO, CLI and browser
  checks. Conditional integration/browser tests remain skipped where their
  external prerequisites are unavailable. Small browser-discovered navigation
  and filter-label fixes are being checked against the final source.
- 138 focused tests establish funding/environment isolation, exact amounts,
  Account deduplication, filtered-page continuation, payload redaction,
  anonymous/non-admin/revoked refusal, partial publication, late-refund rebuild,
  duplicate build start and refusal of stale snapshot publication.
- Real Clerk development sign-in and the isolated anonymous Convex backend on
  port 3212 demonstrated denied admin access before membership, then admitted
  the verified Joel Chan identity. The local founder membership is acceptance
  configuration; no hosted role was changed. Account name search, detail and
  contextual purchase links were exercised against that actual backend.
- The daily refresh uses existing Convex scheduling, scans changed Calls in a
  48-hour overlap and backfills missing days within 90 days. Snapshots are dated
  observations. An outage beyond that overlap requires explicit historical
  rebuild; this does not claim continuous reconciliation or true cohort
  retention. Internal production activity has no separate exclusion yet and is
  explicitly disclosed beside the metrics.
- Browser inspection found internal filter codes and navigation hidden in the
  general workspace menu. Human labels and a persistent admin navigation now
  reuse existing Select and navigation definitions. Cost: a small conditional
  view in the existing operator frame; benefit: every admin investigation has a
  visible return path without creating another shell or route hierarchy.
- Idempotency review: repeated build identity does not reset counts; publication
  carries its generation creation time; an older completion cannot overwrite a
  newer published snapshot. Failed/partial generations leave prior published
  evidence intact. No added read path mutates money or dispatches a Call.

Live rollout observations (1 October): Vercel `agentic-economy` serves
`app.aecon.ai` from main `d104a80099214df0500e54850b5a5a4b96cfbc9c`.
Convex's project lists development `cool-crab-306` and production
`cautious-zebra-473`; its production page reports the last deployment 17 days
earlier. Vercel's saved Production `CONVEX_URL` and `VITE_CONVEX_URL` both target
`https://cautious-zebra-473.convex.cloud`. Current HTTP readback at 11:48:59 UTC
returned `/api/ready` 503 with `deployment_manifest_invalid`,
`convex_probe_skipped`, and `sellable: false`. Saved target settings and HTTP
readiness are distinct evidence. Do not promote this console by redeploying that
older main revision. A matching web/backend release must repair these actual
foundation failures before production acceptance.

Application telemetry proof: the real local app sent a `/market` pageview and
attribution events to PostHog project 491802. After fixing the scrubber and
restarting the app, the diagnostic API returned HTTP 204 and Sentry received
`FounderConsoleAcceptance` at 12:06:09 UTC, event
`a63996fbb304444794e683243f7cac3d`, issue
[7765827546](https://agentic-economy.sentry.io/issues/7765827546/), correctly tagged
`development`, with exception frames and breadcrumbs intact. These establish
application-to-vendor receipt, not production receipt or email delivery. The
PostHog acquisition dashboard keeps production/browser filters, describes repeat
Account activity accurately, and links to the gated AE console instead of a
disabled replay surface. Test-origin vendor issues from the earlier inherited
configuration remain historical development evidence; tests now isolate keys.

Native Convex Sentry exception reporting and PostHog log streaming are blocked
by the current Starter plan. Professional is US$25/member/month plus usage;
Joel's plan decision remains pending. The console itself does not depend on that
upgrade. Production-app telemetry, alert delivery, matched release and hosted
founder admission remain open acceptance work.

## Brief and boundary

Audience: Joel and existing authorized AE operators.
Job: understand marketplace activity, distinguish missing evidence from poor results, and investigate exceptions.
Primary action: open the relevant exception or purchase record.
Data: existing authorized Convex marketplace snapshots, payment-readiness evidence, treasury and exception queries; configured PostHog/Sentry destinations.
Surface: enrich `/admin` and `/admin/metrics` inside the existing operator shell.

Build on the current admin. Keep source/query authority and the AE brand. Install ARC Pro's `metrics-dashboard` through its documented shadcn registry, then replace its demonstration data/export with typed AE readbacks and the protected CSV endpoint. Preserve its responsive chart, interaction and reduced-motion behavior. Use the existing AE shell, readiness, exception and treasury components instead of a second navigation or transaction system.

## Contracts

Requires: Clerk session, canonical operator admission, active admin membership and the relevant server-side permission for every read or export. A client-side route check alone is insufficient.
Ensures: authorized operators can inspect dated marketplace metrics, their completeness and meaning, and navigate to existing recovery surfaces.
Invariant: no sample data or promotional activity is represented as customer-funded revenue; no missing days become zero; no credentials or private purchase payloads enter analytics. Existing transaction mutations and fresh-verification requirements remain authoritative.
On violation: unauthorized reads refuse before fetching records; unavailable telemetry and incomplete snapshots remain explicit. No fallback grants, guessed identities, or public preview bypass.

## Composition and states

| Region | Component | Loading / empty / failure / limited states |
| --- | --- | --- |
| Shell and title | Existing AE operator shell and page header | Existing route pending, signed-out and forbidden states |
| Traction | Installed ARC Pro `metrics-dashboard`, adapted to AE snapshots | Skeleton; no completed days; gap-aware series with totals withheld; query failure isolated; role refusal |
| Payment readiness | Existing ConfigurationBanner | Missing, failed, expired and ready evidence stay distinct |
| Needs attention | Existing exception queue components | Loading, empty, incomplete/unavailable partitions; exact queue links |
| Money and record investigation | Existing treasury, metrics table, object search and recent records | Existing access/refusal and recovery states |
| Measurement connections | Existing observability configuration and approved vendor destinations | Configured is not verified ingestion; absent destinations have setup copy, never fake live badges |

## Design review and cost

Interview skipped: the founder supplied the job and asked for execution. Thesis: one truthful operating home from which the founder can decide what to investigate. Integrity: strong when every region serves activity, risk or investigation. Risks: noisy metrics, false completeness, UI-only gating. Cut decorative demo activity, simulated exports, speculative revenue/retention and duplicate vendor consoles.

Complexity: one licensed dashboard block, its motion dependency and a small AE data adapter. Benefit: reuse responsive chart interactions and keyboard/reduced-motion behavior, instead of a custom chart system. Existing alternatives: the current metrics table stays as accessible detail; existing chart components alone would require composing the dashboard from scratch. Keep the ARC block, preserve the existing data boundaries and avoid a new metrics datastore.

Cognitive-load application: group into activity, attention and operations; date/coverage stays next to values; detail remains one navigation away. The founder should not need to remember IDs or reconcile incompatible time windows. Gestalt application: one shared page alignment, restrained chart accent, stronger gaps between sections than within them, status colors only for literal status. AE focus visibility and Manrope tokens take precedence over ARC's default font/reset conventions.

## Verification

Check metric/range semantics and gaps using behavioral tests. Exercise anonymous, non-admin and revoked-admin access at backend/export boundaries. Verify desktop/mobile, light/dark, keyboard and reduced motion using the existing browser/test setup. Run `npm run check`; only claim live vendor ingestion or deployment after observing it. New vendor accounts, access and release remain explicit operational steps when credentials or approval are required.

## Verified implementation and rollout

- Official ARC MCP authentication succeeded with the supplied Pro account. Installed `@uiarc-pro/metrics-dashboard` through shadcn. The bearer token is outside every repository; Codex refers to `ARC_PRO_TOKEN`. The current desktop tool host may require restart to discover the new MCP registration.
- ARC review applied: semantic AE color bridge, scoped styles, responsive width, true empty/missing states, reduced motion, keyboard chart inspection and real protected CSV. Intentional departures from ARC defaults: retain AE Manrope/typography, visible keyboard focus, and adapt the block's demo-only API to typed authoritative data. The existing AE shell remains the page authority.
- Behavioral checks establish period-correct exact money/count totals, distinct Account deduplication, missing-day gaps, incomplete prior-week suppression, admin isolation, protected export, and telemetry redaction/disable behavior. `npm run check` and `npm run build` passed. Focused suite: 117 tests; three additional vendor-configuration tests passed.
- Browser review used a clearly labelled local fixture harness, never a production auth bypass. Checked 390, 768, 1024 and 1440 widths; light/dark, missing-day and empty states. Fixed dark chart contrast and narrow-label truncation. Screenshots are local evidence under `output/founder-console/`, excluded from commits.
- Existing PostHog project 491802 and Sentry project 4511653575393280 accepted explicit `setup-verification` test events, observed in their UIs. This proves those ingestion destinations, not the production application's deployment or email delivery.
- Saved ten production-only Vercel telemetry variables (browser/server Sentry DSN, environment, PostHog write key, ingestion host and dashboard URL). Vercel confirmed a new deployment is required. No redeploy or backend push occurred. Local public telemetry settings are in ignored `.env.observability.local`; load them explicitly when running a controlled development verification.
- Reused [PostHog founder acquisition dashboard](https://us.posthog.com/project/491802/dashboard/1778627), saved production-environment and browser-library filters, corrected identity guidance and removed unsupported retention/autocapture-funnel tiles without deleting their underlying insights. Browser identities remain session-scoped. Cross-session Customer retention is not yet measured.
- Reused the existing Sentry error monitor and confirmed its high-priority email alert is enabled. It targets suggested assignees or recently active members. No new subscription, access grant or duplicate project was created. Alert email delivery and the Convex journey log-drain/SLI alerts remain unverified.

Release boundary: this branch started from `codex/production-money` at `9405d77f0` and subsequently integrated `b113cc332` and `86abf7d37`. Review against `codex/production-money`, preserving the shared checkout. Vercel branch previews only build the web application; its current build command does not deploy matching Convex functions. Deliver a reviewed matching backend and web release, then verify hosted founder admission, refused access, production event receipt, snapshot coverage and alert delivery. The complete source gate and local browser acceptance are evidence for review, not a production release.
