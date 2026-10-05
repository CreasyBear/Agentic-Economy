# Founder console

## Active delivery goal — 1 October 2026

### Console quality review and ARC refactor

Reviewed source, backend contracts, existing tests, the authenticated ARC MCP
catalogue and the actual desktop/mobile console before changing product code
(review began 12:19 UTC; implementation began after 12:34 UTC). Interview skipped:
Joel explicitly requested execution and at least seven useful ARC components.

Thesis: the founder should see activity, recognize a material exception and reach
its evidence without remembering identifiers or interpreting implementation codes.
The primary action is opening the underlying purchase or Account. Keep the AE
shell, authoritative reads and existing money commands. No new service, schema,
reporting engine or production access is part of this refactor.

Concrete findings: compressed query/render code obscures states; dead overview
metrics remain after the dashboard replacement; the Metrics page requests its
report in two components; recent references read browser storage during initial
render; Overview is incorrectly marked active on nested admin routes; the mobile
organization switcher crowds the account menu; readiness occupies most of the
first mobile screen. Tables need readable records and explicit loaded-row scope.

| Official ARC item | Real use |
| --- | --- |
| `alert` | Payment readiness and incomplete measurement evidence |
| `accordion` | Exact-reference investigation and recently viewed records |
| `segmented-control` | Reporting and purchase periods with keyboard selection |
| `sortable-data-table` | Loaded purchase and Account records, including mobile layout |
| `search-field` | Controlled Account name search and clear |
| `filter-toolbar` | Applied outcome, funding and Account filters, removal and reset |
| `empty-state` | Empty results, distinct from loading, refusal and unscanned pages |
| `badge` | Literal delivery, Account and readiness status |

These eight newly installed items join the existing Pro `metrics-dashboard`.
Transitive dependencies do not count. Install through the official shadcn
registry, retaining the existing scoped foundation and AE keyboard focus.
Reject the number-only metric card for exact currency and the editable data grid
for read-only purchases. No demo data, invented trends or replacement chart.

Added: eight maintained vendor components and a scoped token bridge. Bought:
accessible keyboard controls, responsive record layout and consistent state
presentation without custom equivalents. Net: keep this requested UI capability;
remove superseded controls, dead metrics and duplicate read ownership. Keep small
row/render helpers with their existing pages; no general table or query framework.

Requires: a validated admin search, authorized backend data and explicit evidence
coverage. Ensures: changes preserve period, funding meaning, exact amounts, cursor
continuation and the original record links. Invariant: sorting affects loaded
rows only; an empty filtered source page is not an exhausted query; Account totals
are server-deduplicated; missing values never become zero; these controls never
mutate money or dispatch purchases. On violation: reject unknown filter values,
retain refusal/unavailable states and withhold incomplete totals. Clock and local
storage reads occur after mounting; expired readiness never presents a pass.
Period controls remain mounted during report loading; the previous period's
values are withheld until the selected period's authoritative report arrives.

Verification targets: filter add/remove/reset and route meaning, loaded-row sort,
exact money and unknown funding, clear/search, filtered-page continuation, server
refusal, readiness expiry and independent error boundaries; then repository
checks and actual desktop/mobile/light/dark/keyboard browser review. Closed ARC
disclosures must immediately leave focus navigation, including during animation.

Observed browser findings fixed during verification: clearing Account search must
not remount its input; changing a report period must not lose keyboard focus; a
closed animated accordion must make its contents inert immediately. Dark warning
text measures 5.84:1 contrast. Tested actual local Clerk/Convex pages at 390, 768,
1024 and 1440 pixels, light/dark and reduced motion. Native filter changes preserve
their route meaning, and only the current admin navigation item is marked active.
Source tests additionally cover exact micro-unit currency, unknown funding,
empty-but-unscanned pagination, refusal, readiness expiry and storage-free SSR.

Refactor validation, 1 October: `npm run check` passed. The final full gate passed
with `AE_DEPLOYMENT_ENVIRONMENT=development AE_FORMANCE_ENVIRONMENT=sandbox npm run gate`
under Node 22/npm 11.5.1: 7,646 unit tests, 2,695 integration tests, 16 browser
journeys and 18 accessibility cases, plus clean types, import/security boundaries,
SEO, the public build and packaged CLI. Existing conditional coverage remains
skipped (1 unit, 61 integration, 14 browser; 3 integration todo). This proves the
local source and runtime refactor; production admission, alert delivery and the
coordinated backend/web release remain the delivery goal's open acceptance work.

React Doctor changed-scope review against `e84d9112e`: 5 error-level and 36 warning
advisories remain; this is not a clean scanner result. Four error diagnostics flag
upstream height/width/margin animation: the dismissible Alert path is unused here,
and the filter menu's small back control intentionally changes layout (with a
reduced-motion path). The observer diagnostic misses `useReflowGlide`'s explicit
ResizeObserver/MutationObserver disconnection and animation cleanup on unmount.
Retain the maintained components after actual browser inspection. Other warnings
include existing/shared function complexity, stable disclosure indices, explicit
table roles needed by the mobile CSS layout and shared Motion imports. Account
search intentionally separates an unsubmitted draft from the route query; the
effect synchronizes browser navigation without remounting or losing input focus.
No scanner rules were disabled and no score was uploaded.

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
- [x] Pass behavioral checks, repository checks, full release gate and local browser acceptance.
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

- `npm run check` and the full `npm run gate` passed on final source
  `e612b8add80da0b5c5cf8aa00caf7fb5cdc31322` on 1 October: 7,632 unit tests;
  2,695 integration tests; 16 browser journeys; 18 accessibility cases; clean
  type/import/security, SEO, public-build and CLI checks. One unit test, 61
  integration tests and 14 browser cases remain skipped; three integration
  cases are todo. Conditional external money/restore drills are not established
  by this local gate. The 64 focused telemetry/diagnostic cases also passed.
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

Review delivery: [draft PR #290](https://github.com/CreasyBear/Agentic-Economy/pull/290)
targets the ongoing `codex/production-money` foundation. Vercel's AE web preview
`Cb8AtWAiqS3dZ6V36CEbmF4JmVHL` built successfully at `e612b8add`. The separate
`agentic-economy-sandbox-tools` check failed because its configured root
`tools/release/package5-reference-provider` is absent from both this branch and
the target money branch. This is a distinct provider project configuration
issue; no replacement target was guessed. A successful web preview does not
establish matching hosted backend functions or production readiness.

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

## Compact operator tables — 1 October follow-up

The founder identified rows dominated by repeated kind labels, full hashes and
multi-line timestamps. The existing official ARC `SortableDataTable` now serves
admin lists and detail tables directly. Source-ordered tables disable local
sorting; Purchases and Accounts retain their existing loaded-row sorting.
Exception rows lead with Business, use compact copyable references and a single
relative time with the absolute timestamp available on hover. Audit evidence
opens in the existing record sheet. Daily metrics divides its existing measures
into Purchases, Quotes, Participation and Resolution views.

Cognitive-load and Rams review: remove repetition before shrinking text; keep the
identity and action legible; expose detailed evidence on demand. On mobile,
record rows become cards while metrics and model-cost comparisons preserve
column alignment inside a horizontal scroller. Non-sortable card headers remain
available to assistive technology without becoming an unreadable visual strip.
The selected segmented option stays visible after resizing. Touch copy/review
controls retain 44px targets.

Complexity decision: keep two opt-in ARC presentation props (density and mobile
layout), an opt-in compact reference with optional link, and one selected audit
row. They remove repeated cell styling and admin TanStack renderer adapters.
Reusing the existing sheet avoids another drawer implementation. A new table
wrapper, backend adapter or component library would add indirection without
removing further burden, so none was added. Shared owner/market record tables
and default reference rendering keep their existing behavior.

Requires: existing authorized read models. Ensures: original references remain
exact in links and clipboard; all evidence and measures remain reachable.
Invariant: preserve source ordering, exact money formatting, unknown states,
pagination and action handlers; no auth, backend or transactional changes.
On violation: retain existing refused, unavailable, partial and empty states.

Verification: 45 focused tests passed across nine files, covering full-reference
copy/link fidelity, audit evidence disclosure, metric precision and keyboard
views, loaded sorting, partial pagination and denied reads. Browser checks on
real local development records confirmed 45px exception rows (previously about
83px at the same width), five compact Provider rows, audit close-focus return,
390px mobile and 1440px desktop layouts without page overflow, keyboard metric
selection, readable mobile metric columns, and light/dark table rendering.
React Doctor against `7ab74bf2a` reported zero new diagnostics; this is a
baseline comparison, not removal of existing advisories. `npm run check` passed.
The complete release gate and hosted rollout were not repeated for this UI
follow-up; previous release evidence does not establish this revision in prod.

### Expressive ARC follow-up

Joel requested a substantially more playful console. Use four additional official
ARC Pro components, fetched from the authenticated MCP and installed through its
shadcn registry: `orbit-logos`, `liquid-tab-bar`, `slot-text`, `expandable-card`.
The orbit gives eight existing operating destinations a visual map and a focused
explanation; liquid tabs select the four compact daily-table views; slot text
replaces the custom numeric tween; the expandable card discloses measurement rules.

Cost: four maintained vendor components and one scoped palette. Benefit: requested
interactive character without an animation framework or new dependency. Keep the
vendor motion mechanics; remove its simulated connection workflow and dead styles.
The alternative was retaining static link columns and custom numeric animation.
No new page, business state, telemetry service or money command is introduced.

Requires: authorized existing console reads and actual destination URLs. Ensures:
internal routes stay internal, external URLs reject credentials/non-HTTPS, exact
formatted values and unavailable/loading states survive animation. Invariant:
configuration never proves telemetry receipt; decorative category colours never
report financial health. On violation: omit invalid analytics links, retain honest
unavailable states and immediately remove closing cards from keyboard access.

Cognitive-load and visual review: category filters narrow eight destinations;
selection names the destination, explains its purpose and exposes one real action.
The usual admin navigation remains available. Deliberate departures from ARC's
restrained styling are the locally scoped violet/mint/peach backdrop and coloured
navigation icons, requested by Joel. Keep AE focus outlines despite ARC's checklist
preference. New controls have 44px targets, pause/hover/focus stop ambient motion,
and reduced-motion rendering has been inspected. No brand endorsement or fake
connection success is shown. Existing compact operational tables stay compact.

Verification: 41 focused tests across seven files cover real links, invalid URL
exclusion, honest configuration states, category keyboard navigation, Escape focus
return, pause, daily measure selection, exact money, authority refusal, readiness
expiry and existing filters/copy behavior. `npm run check` passed. Browser checks
at 390, 768, 1024 and 1440 cover light/dark themes, reduced motion, disclosure focus
and contained table scrolling. The new tabpanel needed `min-width: 0`; the existing
chart's first opacity render and the new disclosure text were made deterministic
to avoid reduced-motion SSR hydration mismatches. No production release was made.

React Doctor included untracked vendor files: two error-level and eight warning
advisories remain. The errors are the intentionally sprung disclosure height and
an unused optional tab-badge width animation. Other advisories concern shared
Motion imports, the maintained orbital component's size and exported tab ID helpers.
Keep these bounded vendor behaviors after browser verification; no rules were
disabled. The existing app already shares Motion, and neither a new lazy-animation
provider nor splitting the upstream orbit into a framework is justified here.

### ARC chart follow-up

Three more official ARC components were installed through the configured registry:
`line-chart`, `donut-chart` and Pro `funnel-chart`. The time series uses a shaded
monotone curve and a gliding date crosshair. The funding ring selects a category
without hiding it or changing its denominator. The two-stage funnel compares
Quotes created in the selected period with those converted to Calls at snapshot
close. It turns vertical in narrow containers. All three use the existing Motion
runtime; package dependencies are unchanged.

Requires: authorized snapshots with complete period coverage for comparisons.
Ensures: funding parts count disjoint settled paid Calls, Quote stages describe
the same creation cohort, dates and units remain inspectable by keyboard.
Invariant: missing days never become zeros or a continuous line; conversion does
not imply delivery, settlement or traction. Exact money headings retain all six
decimals and wrap instead of spilling into adjacent tiles. On violation: retain
the gap-aware chart, withhold funding/comparison totals and explicitly request
review when either a daily or total conversion count exceeds its Quote cohort.

Cost: three maintained vendor components, one small presentation component, and
an optional integer-axis flag. Benefit: the requested chart interactions without
a new charting framework, metrics service or data model. The existing gaps chart
remains the alternative when observations are incomplete because ARC's line
component treats an omitted value as zero. Its adapter accepts only fully
observed points. Retain that boundary instead of rewriting the vendor curve
engine. Vendor array geometry now checks internal indexes under the project's
strict TypeScript configuration. Funnel particle flow is disabled; canvas work
starts only when flow is actually enabled and clears on cancellation.

Cognitive-load application: four metric choices, three period choices and three
labelled chart questions. The selected period and cohort definitions remain
visible; the founder need not remember or reconcile a second date window.
Perception: one large time series, two supporting comparisons. Attention: no
continuous funnel particle stream. Memory: units and exclusions stay beside the
chart. Learning: arrows/Home/End inspect dated values or funnel steps; ring
selection preserves the whole. Funding legend targets are 44px. Empty charts
use compact layouts, with no fabricated rate or activity.

Verification uses real authorized local readbacks for empty/loading states and
an isolated, clearly labelled visual fixture for populated chart geometry and
interaction. That fixture neither creates marketplace records nor bypasses
production authorization and is removed after review. Checked 390, 768, 1024
and desktop layouts, dark contrast, reduced motion and fresh navigation between
Overview and Metrics. A populated phone check exposed money-tile overflow; exact
amounts now wrap as plain text while count headings retain ARC SlotText. Browser
readouts and rendered paths establish working crosshair, ring selection and
funnel inspection, including the vertical funnel. Unit checks cover denominator
stability, Quote conversion, daily/total contradictions, incomplete coverage,
loading replacement, zero activity, gap inspection and six-decimal chart values.

React Doctor reviewed the new vendor files as well as earlier untracked work:
29 diagnostics (four error-level, 25 warnings). Two error-level subscription
advisories are in the ring: Count destroys its MotionValue on unmount, and every
segment stores an unsubscribe/destroy function invoked on removal and unmount;
the scan does not recognize those separate cleanup effects. The two previously
reviewed layout-animation advisories remain. Other warnings concern small-list
iterations, shared Motion imports, vendor component size and optional callbacks.
Keep the verified vendor behavior; no rules were disabled. The production client
MarketplaceActivity chunk, including the dashboard and its existing dependencies,
is about 24 kB gzip plus 5.3 kB gzip CSS. This is not an incremental size estimate.

Final checks and browser proofs are in ignored `output/founder-console/chart-*`
and `charts-*` files. This follow-up is local source work; no release gate,
backend push or production deployment is claimed.

Final verification: `npm run check`, `npm run build` and 51 focused tests across
seven files passed. No package dependencies changed. The labelled fixture server,
its entry files, cache and duplicate MCP source responses were removed. Retained
screenshots distinguish populated visual fixtures from the actual local console.
