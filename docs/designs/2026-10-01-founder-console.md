# Founder console

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

Release boundary: this branch starts from `codex/production-money` at `9405d77f0`. Integrate it with that work without overwriting later changes, run the full `npm run gate`, deploy the matching backend and web release, then verify a real admin session, revoked/non-admin refusal, production event receipt, snapshot coverage and alert delivery. A successful local build is not a production release. No merge, push or production deployment is included in this isolated side-conversation change.
