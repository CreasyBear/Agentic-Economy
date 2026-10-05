---
status: proposed
date: 2026-10-05
title: "ADR 0005: Datadog through supported operational integrations"
decision_owner: "Joel Chan"
---

# ADR 0005: Datadog through supported operational integrations

## Context and status

Propose a capped, replaceable Datadog operations layer through supported
integrations and vendor examples. Keep Sentry for exceptions and PostHog for product behaviour.
This is a proposed decision, not acceptance of a deployed integration or
approval to activate products, export telemetry, create credentials or grant IAM.
It follows [PRODUCT.md](../../PRODUCT.md#reference-products-are-the-default).

Source inspected on 5 October 2026: existing consolidation checkout
`codex/chat-flow-repair-2026-10-05` at
`458e8e9207046afd41d36e7210f90c0d962664fd`, based on merged `main`
`0bcfebe4843f362824c5cb4b975fc7ece5f800dc`. Source and the dated
[deployment map](../operations/deployments.md) establish Convex, Vercel, Clerk,
AWS EC2/RDS-hosted Formance, Sentry/PostHog and direct OpenRouter/x402 paths.
They do not establish current provider settings. No Datadog implementation or
prior Datadog ADR was found in this checkout.

Owner-supplied account context: Startup Plan activated 5 October for
`accounts@aecon.ai` on AP2 Australia; one year of free Pro, up to **$100k**.
ISO currency, exact expiry, eligible products/exclusions and product allowances
remain unverified. The last supplied setup inspection found no integrations and
Log Management inactive; the vendor showed no credit balance. Use Plan & Usage
for metered usage, not a fabricated remaining-credit total. Convex Pro entitlement
is supplied context and must be confirmed for the selected deployment.

Recent treasury observation/audit/readiness timing races and RPC failures motivate
separate source and ingestion clocks. The dated
[readiness evidence](../production-readiness-plan.md#availability-and-decision-limits)
records intermittent refusal; the newer deployment map records subsequent fixes
and observation windows. Neither establishes an incident's current status.
The [backup schedule](../../infra/package4/modules/release-environment/backup.tf)
now declares 18:00 UTC after Sunday's maintenance window; verify hosted settings
before claiming the earlier collision resolved. The
[5 October chat repair](../archive/2026-10-05/designs/2026-09-23-generative-commerce-chat-rfc.md#5-october-2026-walkthrough-repair)
and [dated first-run review](../archive/2026-10-05/reviews/rebuild/first-run.md) motivate operational
failure correlation and signup-funnel analysis respectively, without asserting
those older findings remain open.

## Proposed decision and supported paths

Start with five use cases. Configure Datadog's native monitors, saved searches
and integration dashboards; there is no Aecon monitoring application.
Official documentation and examples below were reopened on 5 October 2026.

| Initial use case | Supported implementation and example | Aecon-specific limit or gap |
| --- | --- | --- |
| Outside-in uptime | [Synthetic API test templates and HTTP example](https://docs.datadoghq.com/getting_started/synthetics/api_test/): read-only checks of existing `/api/health`, `/api/ready` and `/api/v1/release`, with explicit status/body/identity assertions and approved locations/frequency. | Health proves liveness; readiness 503 is a refusal, not permission to bypass it. Release proves identity. Start with public, non-effectful requests; authenticated or paid journeys need separate scope. |
| Payment readiness and source freshness | Reuse [`/api/ready`](../../src/routes/api.ready.ts), [`/api/v1/catalogue-status`](../../src/routes/api.v1.catalogue-status.ts) and existing readiness/treasury diagnostics. Query them with native tests; correlate safe events through the Convex stream below. | Public readiness intentionally hides detailed money reasons. If existing events cannot explain timing, add only a safe projection from the existing [readiness reader/producer](../../convex/lib/money/readiness/store.ts): status, bounded reason and source validity times. No second readiness calculator or store. |
| Background jobs | [Convex native Datadog log stream and event examples](https://docs.convex.dev/production/integrations/log-streams#datadog): Pro deployment settings → Datadog site, dedicated API key and bounded tags. Native execution events expose timing, retries, request/job IDs; scheduler/concurrency events expose lag and queues. | No Agent inside hosted Convex. Execution success alone does not prove business completion. Only a demonstrated missing completion/heartbeat signal merits a small event from the existing job producer. Unchanged concurrency stats can legitimately be silent. |
| Backup coverage | [AWS integration](https://docs.datadoghq.com/integrations/amazon-web-services/), [AWS Backup setup/metrics](https://docs.datadoghq.com/integrations/amazon-backup/) and [standard RDS setup/dashboard](https://docs.datadoghq.com/integrations/amazon-rds/): selected regions/namespaces, native job/copy/restore metrics, RDS events and existing CloudWatch alarms. | Retain existing AWS alert routes. Failed jobs, absent expected completion and missing collection are different conditions. A completed backup does not prove restoreability or a joint financial restore. Convex/export coverage stays explicit; reuse existing export/restore receipts if AWS cannot observe it. |
| Searchable logs | Convex's direct stream; [Vercel Marketplace integration](https://docs.datadoghq.com/integrations/vercel/#setup) with selected projects, environments, log sources and sampling; [Datadog Forwarder](https://docs.datadoghq.com/logs/guide/send-aws-services-logs-with-the-datadog-lambda-function/) for approved existing AWS log groups. Use [native log monitor examples](https://docs.datadoghq.com/monitors/types/log/). | Vercel drains have separate Vercel charges. EC2 local logs use the maintained [Agent installation path](https://docs.datadoghq.com/integrations/guide/aws-agent-installation/) only if needed and approved. Trace drains are optional; their existence does not instrument every Aecon function or establish an end-to-end trace. |

For AWS, prefer role delegation and the vendor's configurable
[Terraform provider/example](https://docs.datadoghq.com/integrations/guide/aws-terraform-setup/)
in the existing OpenTofu infrastructure, or its linked CloudFormation quickstart
if that is the approved maintained path. Review compatibility and the saved plan
before apply. The example's all-region collection, extended collection,
SecurityAudit attachment and broad permissions are **not** Aecon approval.
Resolve AP2 endpoints, trust principal/external ID and only the necessary
EC2/RDS/Backup/CloudWatch permissions from current official guidance. Agent
installation and Forwarder provisioning add permissions and resources beyond
metric reads; approve those separately. Verify and pin actual provider/module/SDK
versions and lockfiles during implementation; this ADR invents no version or API.

Reuse [`[ae.journey]` events](../../src/lib/observability/journey.ts) and the
existing [journey definitions](../operations/journey-alerts.md), including valid
outcomes, minimum volumes and windows. Count one representation per attempt.
Convex streams are best effort: events may be delayed, dropped or duplicated.
Log-based ratios are operational estimates, not exact purchase counts. Prove the
receiver's supported query and minimum-volume guard; otherwise retain a dashboard
and a verified simpler alert. Log monitors evaluate indexed Standard-tier logs;
quota exhaustion/sampling can remove their evidence. Missing data is not success.

On acceptance, this ADR replaces only the journey runbook's recommendation of
PostHog as the backend operational-log destination. Keep its event definitions
and Sentry exception path. Verify Datadog delivery before retiring a redundant
PostHog operational stream; retain PostHog product analytics. Until acceptance,
the existing runbook remains the recorded operating choice.

## Data, correlation and authority

Keep the existing [privacy design](../designs/platform-data-privacy.md) and
payload-sparing telemetry boundaries. Proposed semantic events contain only:

| Field group | Allowlist and meaning |
| --- | --- |
| Routing | `service`, `env`, `version`, `provider`, `operation`: bounded values; these are the default custom metric labels. AE environment is explicit, not inferred from Convex's `prod` deployment type. |
| Observation | Signal name, status/outcome and bounded reason code; source observation/valid-until timestamps; duration or age with explicit units. Preserve source time separately from vendor ingestion time. Unknown/missing values stay unknown. |
| Correlation | Optional opaque Aecon request, Convex request, job or Call IDs as log/trace attributes only. Reuse [`X-AE-Request-Id`](../../src/lib/server/request-correlation.ts) and existing Sentry `ae.request_id`. Preserve native IDs; prove propagation before claiming a cross-service join. SDK trace/span IDs are distinct from Aecon request IDs. |

This is an additive event allowlist, not a new database, outbox, exporter or
financial schema. Only the missing Aecon meaning is custom. Use existing logging
paths; use maintained SDKs only where an approved transport requires them.
Do not place request, Account, job, Call or wallet identifiers in metric tags.

Exclude raw prompts/outputs, Tool input/output, credentials, cookies, auth headers,
credential-bearing URLs, personal identifiers, wallet addresses/balances and
ledger records by default. Check exceptions, stack messages, HTTP URLs, native
console output and drain sources before their first external send. Existing
Sentry/PostHog sanitizers do not prove a new drain safe. Receiver-side exclusion
or redaction does not prevent disclosure to the receiver. If a supported path
cannot meet the allowlist before sending, leave that source disconnected and
repair the producer in separately authorised work; do not build a relay.
Alert messages link to protected investigation surfaces and omit log samples
containing sensitive data. Synthetic results must remain payload-safe too.

Formance and existing Convex commercial/authority records remain systems of
record. Payment admission, treasury reconciliation and freshness checks retain
their existing authority. Datadog reports observations and notifications; it
cannot grant payment permission, change audience/limits or infer ledger truth.
Telemetry failure must not change a business result; genuine dependency failures
continue to refuse admission under existing policy.

## Regional, cost and access prerequisites

Use [AP2's documented site parameter](https://docs.datadoghq.com/getting_started/site/)
`ap2.datadoghq.com`; confirm each integration, product, intake and Synthetic
location on the actual account before activation. Sites are independent.
Australia storage does not prove every source, test runner, recipient or support
path stays in Australia. Review recipient/retention commitments under the existing
privacy design; do not silently route unsupported features to another site.

Before enabling anything, Joel must approve eligible products, finite retention,
numeric ingestion/index/host/custom-metric/trace/test budgets, and ongoing cost
after the Startup Plan. Start with minimal sources and sampling, exclude routine
DEBUG/build/SQL content, and meter expected test runs including retries.
[Index quotas and exclusion examples](https://docs.datadoghq.com/logs/log_configuration/indexes/)
cap indexed volume, not ingestion, archives, generated metrics or the total bill.
Reserve indexed capacity for required operational alerts and alert on quota/data
gaps. Inspect Plan & Usage and separate Vercel/AWS charges during the pilot;
credit is not unlimited entitlement or a substitute for a spend ceiling.

Integration-specific API keys, any application-key scopes, secret storage/binding,
AWS delegated role/permissions, Log Management activation and provider setting
changes each require their applicable separate action approval. Keep credentials
out of client bundles and documents. Record approved configuration, owners,
responders and measured acceptance in the existing deployment map, journey runbook
and readiness record; add remaining work only to TODOS/Wayfinder. No new register.

## Portability and exit conditions

Supported integrations reduce implementation work; they do not remove lock-in.
Datadog queries, monitors, dashboards, Synthetic definitions and operator habits
need migration work. The [official Terraform provider and monitor example](https://docs.datadoghq.com/integrations/terraform/)
can make configuration reproducible in existing infrastructure; they do not make
it executable by another backend. Keep signal meaning, thresholds/windows,
responders and source mappings in the existing operations runbooks.

Keep structured Aecon events independent of Datadog query syntax and keep vendor
SDKs outside payment/readiness authority. For later instrumentation, prefer the
maintained OpenTelemetry SDK/API and OTLP where verified runtime/AP2 support meets
the need. [Datadog's OTel guide](https://docs.datadoghq.com/opentelemetry/)
distinguishes full OTel from using its API with a Datadog SDK, with different
feature coverage. This reduces instrumentation replacement; it does not port
alerts or history. Do not introduce a Collector or relay solely for the pilot.

Before expansion, Joel must accept the exit effort and any history loss. Retain
approved native configuration through the existing IaC or supported export, and
prove in authorised isolated scope that Datadog removal preserves authority and
baseline alerts, and one selected safe source can be redirected with its critical
monitor restored using supported tooling. Record effort and coverage lost in the
existing runbook. [Customer-owned log archives](https://docs.datadoghq.com/logs/log_configuration/archives/)
are an optional separately approved retention/cost/IAM choice; they do not prove
portable metric/trace history. Decide which history must survive before export.
Accept a measured post-credit operating budget before expansion; free credits
alone do not justify adoption or a longer commitment.

## Rollout, acceptance and rollback

1. **Review only:** confirm plan terms/AP2 coverage, current resource identities,
   privacy-safe samples, budgets, responder and the exact credential/IAM plan.
   This ADR performs none of those activation actions.
2. **Capped native pilot:** after approval, use official templates/integrations
   for the five cases above, beginning with non-effectful tests and selected log
   sources. Verify real delivery, parsing, environment/release attribution and
   native dashboards before adding semantic signals for demonstrated gaps.
3. **Acceptance before expansion:** in an explicitly authorised isolated scope,
   inject dependency failure, source expiry/timing races, delayed/duplicate or
   absent telemetry, job failure and missed backup/copy completion. Prove failure
   notification reaches the named responder, acknowledgement and recovery
   notification work, sensitive fields are absent, and metered usage stays within
   approved caps. Prove the portability/exit conditions above before expansion.
   Observe normal scheduled cycles across source expiry and the
   relevant backup window. No live fault tests are authorised by this ADR.
4. **Expand only for a measured gap:** Vercel tracing/APM, RUM/session replay,
   security and [Agent Observability](https://docs.datadoghq.com/llm_observability/)
   need their own coverage, privacy and cost justification. Agent Observability
   is metered per ingested LLM span and may capture content. Convex gateway usage
   events apply only to the Convex AI Gateway; Aecon's direct OpenRouter route is
   not automatically covered. Verify runtime/SDK/AP2 support before choosing it.

Rollback disables the newly approved monitors/drains/streams/Agent collection,
removes only its scoped infrastructure/bindings and revokes its dedicated keys
after consumer removal. Preserve existing Sentry/PostHog/CloudWatch coverage,
source authority and financial records. Previously exported data follows the
approved retention/deletion process; disconnecting is not deletion. Record
coverage lost and the rollback result in existing operations records.

## Alternatives and non-goals

- **Keep only Sentry, PostHog and CloudWatch:** credible if the pilot cannot prove
  useful correlation within budget; currently divides operational investigation
  across receivers. It remains the rollback baseline.
- **Replace all telemetry with Datadog:** unnecessary migration of established
  exception and product workflows; reject for the initial adoption.
- **Build a monitoring platform/exporter/queue/dashboard app:** reject. Official
  integrations, native Datadog UI and maintained SDKs cover transport and display.
  Custom work is limited to a documented Aecon semantic gap.

No runtime implementation, installations, credential provisioning, settings
changes, new infrastructure, telemetry activation, rollout, paid Synthetic
transactions or automatic financial remediation is authorised by this document.

## Prepared execution prompt

Use this prompt with this ADR as the proposed design. The engineering review
below is complete; decision acceptance and issue publication remain separate.

**Objective and ownership.** Own one bounded Datadog operational pilot for the
five initial cases above: uptime, readiness/freshness, jobs, backups and searchable
logs. Joel owns direction, access, privacy/cost and activation decisions; the
assigned Datadog executor owns delivery and evidence. Retain Sentry exceptions,
PostHog product behaviour and Formance/Convex financial and readiness authority.
Use native integrations, monitor/dashboard templates and maintained SDKs first.
Custom code needs a documented semantic gap and a separately accepted minimal
design; never build a monitoring platform, exporter, queue or dashboard app.

**Resume from current authority.** Use the designated `aecon-consolidation`
checkout while it remains the delivery checkout; resolve its local path when
executing. Read `AGENTS.md`, `PRODUCT.md`, this
ADR, [TODOS.md](../../TODOS.md#datadog-workstream), the deployment map, journey
runbook, privacy design, relevant source/tests and dated readiness evidence.
Reopen the official integration/example links above before selecting configuration;
verify actual versions and AP2 coverage rather than inventing APIs or pins.
Treat cached learnings as leads: current product/source/hosted evidence wins,
particularly over earlier assumptions of no users or live value. Capture current
branch/HEAD, staged/dirty paths and owned hunks before editing; verify resource
identities separately from source. Do not create branches/worktrees/clones,
contact working agents, overwrite their work or create another tracking document.

**Wayfinder and engineering gate.** Reconcile
[map #256](https://github.com/CreasyBear/Agentic-Economy/issues/256) and
[task #284](https://github.com/CreasyBear/Agentic-Economy/issues/284), including its
[30 September briefing](https://github.com/CreasyBear/Agentic-Economy/issues/284#issuecomment-5906257411).
Reuse #284 for a proposed Datadog operational-coverage amendment; preserve its
Sentry/secret-management scope. Its dated briefing is not current activation
proof. Keep the amendment here until issue-edit authority is given. If its scope
cannot be reconciled, propose the smallest change to the existing Wayfinder
structure; do not silently publish a competing backlog.

Run the installed `wayfinder-delivery` and `/plan-eng-review` on that exact issue
amendment and this ADR before implementation. Apply the same gate to every later
Wayfinder issue, including a proposed semantic signal or optional expansion:
current context/invariants; existing capability and vendor examples; options and
tradeoffs; minimal affected paths/dependencies; architecture and code quality;
privacy/IAM/cost risks; tests, performance, acceptance and rollback. Include
“What already exists”, explicit deferrals and a failure/test flow. Record actual
review findings, resolved choices, remaining blockers and Joel's direction
approval for the exact revision in the existing issue. Reading a skill or writing
this checklist is not a passing review. Reuse an existing approval for unchanged
direction; credential/IAM, activation, fault tests and release still require their
applicable action scope. Investigate a changed assumption before changing design;
after two unchanged failed attempts, stop and diagnose rather than patch repeatedly.

**Phases and proof.** Keep issue detail in #284 after an authorised amendment;
TODOS links it and the selected plan. Record changing runtime facts in the existing
operations/readiness records, not a second status log.

| Phase | Prerequisite and bounded action | Acceptance / handoff evidence |
| --- | --- | --- |
| Inventory and design | Read-only current account/resource inspection only when access is authorised. Confirm AP2, selected Convex Pro deployment, AWS/Vercel targets, current coverage and known gaps. Owner context is Startup Plan activated 5 October 2026 for `accounts@aecon.ai`, one year up to $100k; currency, exact expiry, exclusions and allowances remain unverified. Last supplied inspection had no integrations and inactive logs. | Current identities/time/source, source-to-signal coverage, reviewed native examples and amended issue plan. No credit-balance invention or assumed hosted state. |
| Privacy, cost and access | Before first export, review payload-safe samples/allowlists and numeric product/retention caps, AP2 feature/recipient coverage and separate AWS/Vercel costs. Prepare dedicated key/application scopes, secret owner/storage and selective AWS role plan without values. Joel separately authorises creation/binding, IAM, Log Management and settings changes. | Approved scope/revision, named primary/backup responder and destination, terms/budgets, history-retention/exit plan and permissions plan. Unsafe or unsupported sources stay disconnected. |
| Native pilot | After the applicable approvals, configure Convex direct logs, selected AWS RDS/Backup/CloudWatch collection and non-effectful Synthetic checks with official examples. Add Vercel drains/Forwarder/EC2 Agent only for an approved coverage gap and capped cost. | Each source has verified delivery, parsing, bounded environment/release labels, safe correlation and native monitors/dashboards. Reuse journey windows/minimum volumes; distinguish business failure, source expiry and missing telemetry. No payment-authority changes. |
| Verify and recover | Obtain explicit isolated fault-test and notification-delivery scope. Reuse existing tests for any approved code changes; observe normal source-expiry and backup cycles. | Dependency/RPC refusal, stale or racing clocks, delayed/duplicate/missing events, job failure and missed backup/copy completion detected; notification, acknowledgement and recovery reach named responders; prohibited fields absent; measured usage and post-credit estimate within caps; scoped removal/key revocation and supported source/critical-monitor migration work. Backup success is not restore proof. |
| Handoff or expand | Preserve incomplete criteria. Expand traces/RUM/replay/security/Agent Observability only for a measured gap with another issue review and applicable approval. | Sanitised receipts name revision, environment, configuration IDs, time, procedure, outcome and limits. Record rollback/coverage lost and next owner/action. Direct OpenRouter is not automatically Convex AI Gateway coverage. |

Review this failure/test flow before any configuration:

```text
existing read-only endpoints -> native Synthetic assertions -> alert -> recovery
Convex native events        -> safe intake/index/query       -> alert -> recovery
AWS native collection       -> RDS/Backup monitors           -> alert -> recovery
optional approved drains    -> safe intake/index/query       -> alert -> recovery
source failure/expiry != missing collection; each needs its own acceptance proof
```

Use the installed skills below, resolving their actual paths again at execution.
They are selected guidance, not evidence that their stages ran. No dedicated
Datadog skill is installed; this composition plus official examples supplies the
needed capability without installing tools or creating another skill.

| Stage | Actual installed guidance and limit |
| --- | --- |
| Coordination / every issue design | `wayfinder-delivery`, then `plan-eng-review`. One selected plan and existing tracking home. |
| Target inventory, infrastructure, credential lifecycle and rollback | Repository [deployment-operations](../../.agents/skills/deployment-operations/SKILL.md). Existing OpenTofu and official tools; saved plan before apply, no secret dumps. |
| Privacy, scopes and telemetry delivery | `cso` for material access/data risks; `integration-pattern-auditor` for delivery/loss/duplicates/correlation. Neither licenses a custom relay or queue. |
| Only an approved semantic-code gap | `codebase-architecture` and installed `convex:convex-expert`; first read `convex/schema.ts` and [project Convex guidance](../../convex/_generated/ai/guidelines.md). Reuse existing producers and boundaries. |
| Verification | Existing [diagnostic](../../tests/unit/server/diagnostic-routes.test.ts), [correlation](../../tests/unit/server/request-correlation.test.ts), [journey](../../tests/integration/journey-terminal-emission.test.ts) and [readiness](../../tests/unit/convex/payment-readiness.test.ts) tests. `qa-only` is optional read-only UI regression guidance, not monitor/fault-delivery proof. |
| Separately authorised source release | `ship` and `land-and-deploy`, with deployment-operations. Deferred here; select owned changes only and require repository checks/gate plus matching hosted proof. |

**Status and stop conditions.** `prepared` means a reviewable plan only;
`approved` records the actual bounded authorisation; `configured` needs provider
readback; `receiving-data` needs observed safe delivery; `acceptance-verified`
needs all agreed failure/recovery/privacy/cost proof. Use Wayfinder's
`awaiting-direction`/`active`/`blocked`/`complete` independently of these evidence
stages. Do not advance on command success or a dashboard screenshot alone.

Current authorised scope is document preparation and read-only source/docs/issue
research. Do not log into accounts, provision credentials, apply IAM, export
telemetry, alter settings, activate monitors/drains, install, commit/push/merge,
deploy, fault-test or move funds under this prompt alone. Missing approval/access,
unsupported AP2 coverage, unsafe payloads, unbounded cost, unresolved authority or
shared-file collisions block that action. Finish unaffected preparation; report
exact target/blocker and smallest next approval. Keep colliding drafts in the
assigned task workspace. Roll back only the approved Datadog additions using the
procedure above; never restore financial data as telemetry rollback.

## GSTACK REVIEW REPORT

5 October 2026. Installed `/plan-eng-review`, FULL_REVIEW of this ADR and its
prepared #284 amendment, against `codex/mcp-current-protocol-2026-10-05` at
`1c2ae8ae7fcf42a95f8d02c40bab2cd0b7e6e04f`. Repository source/tests and reopened
official Convex, Datadog log-monitor, AWS and Synthetic examples informed review.
This is a plan verdict, not a review of unrelated branch work or hosted acceptance.

Targeted follow-up on 5 October after Joel raised vendor lock-in: read-only
review against `codex/chat-recommendations-no-pagination-2026-10-05` at
`6bd8d7697ba5fbc3917f81c2283af7273dd3dc31`, using reopened official OTel and
Terraform guidance plus log-archive documentation. The proposed design now makes
configuration/history limits, supported exit proof and post-credit cost explicit.
This extends the plan constraints; it accepts neither adoption nor migration proof.

| Section | Runs / status | Findings |
| --- | --- | --- |
| Scope challenge | 1 / retained | Five cases, native integrations, one existing workstream. No new application, package or transport. |
| Architecture | 1 / clear | Existing authority stays independent of best-effort telemetry. Privacy/AP2/IAM gates precede export. |
| Code quality | 1 / clear | Reuse producers, correlation and operational definitions. No new code defect or framework required by this plan. |
| Tests | 1 / plan clear; live proof pending | Existing Vitest/Convex-test contracts inspected, not rerun. Six acceptance areas below remain required before operational acceptance. |
| Performance | 1 / clear with activation constraints | Readiness probes default to 2 seconds, capped at 5; cadence/locations/retries add backend reads and test charges. AWS polling collects new metrics about every ten minutes on average, plus service delays. Measure detection/recovery timing; retain existing AWS alarms. |

**What already exists:** diagnostic routes and the fail-closed readiness reader;
`[ae.journey]` terminal events, outcome/window/minimum rules and replay tests;
request-correlation validation; Sentry/PostHog workflows; AWS backup/copy/RDS
configuration and alarms. The selected design reuses these, with Datadog native
configuration covering transport, searches, dashboards and notifications.

**Activation evidence, not a new direction decision:**
[maintenance.ts:118](../../convex/lib/capabilitySupply/projection/maintenance.ts)
logs `console.warn('rebuild_all_business_supply_projections_skipped', business.slug, error)`.
A safe journey emitter does not prove the deployment-wide native stream safe.
[Convex's documented configuration](https://docs.convex.dev/production/integrations/log-streams#datadog)
does not establish a producer/topic allowlist. Apply the existing pre-send gate
to the whole selected source, including console and failure/stack payloads; keep
it disconnected until proved safe or a supported source filter is verified.
Receiver exclusions cannot satisfy this requirement. No relay is proposed.

**Failure and test coverage:** source tests below are inspected coverage, not new
passing-run claims. Native acceptance is not run or substituted with unit proof.

```text
health/readiness/release -> HTTP/body/identity assertions -> operator alert/recovery
  existing route tests cover generic refusal, expiry, wrong identity, timeouts
Convex jobs/journeys -> safe source -> indexed parsing/query -> alert/recovery
  existing journey tests cover terminal/replay; native delivery remains unproved
AWS backup/RDS -> selected collection -> completion/deadline monitor -> recovery
  declared schedule/alarms exist; actual collection/delivery remains unproved
all paths -> source-loss / unsafe-field / quota / rollback checks -> honest status
```

| Acceptance area | Existing proof boundary / required native check |
| --- | --- |
| Uptime / readiness / freshness | [Diagnostic tests](../../tests/unit/server/diagnostic-routes.test.ts) and [readiness tests](../../tests/unit/convex/payment-readiness.test.ts) cover expiry/races/refusal. In production assert status/body, `checks.payments` and exact environment/Convex/release identity. `commercial.sellable` or configured funding alone never establishes payment readiness. |
| Jobs / journey queries | [Terminal tests](../../tests/integration/journey-terminal-emission.test.ts) cover replay; prove received parsing, outcome/windows/minimums, failed/overdue jobs and operator delivery. Best-effort duplicates remain estimates. |
| Missing collection | Drop one expected service/environment source while others keep reporting, then recover it. A grouped below-count query can miss a vanished group: prove a source-scoped native rule; never use unchanged concurrency statistics as a heartbeat. [Native log-monitor semantics](https://docs.datadoghq.com/monitors/types/log/#no-data-and-below-alerts). |
| Backup / copy | Prove normal schedule, failure and absent expected completion within the actual job/copy window and collection delay. A completion count is not restore or joint financial recovery proof. |
| Privacy / cost | Prove pre-send allowlist over the entire source and result/alert payloads, indexed capacity/quota loss, finite measured usage including Synthetic retries/locations and AWS/Vercel charges. Unsafe sources stay off. |
| Notification / rollback / exit | In approved isolated scope, prove primary/backup receipt, acknowledgement, recovery and scoped removal/revocation; redirect one safe source and restore its critical monitor through supported tooling. Record effort, history/coverage lost and post-credit cost. Existing coverage and financial records survive. |

**NOT in scope:** application code, custom transport/exporter/queue/dashboard,
RUM/replay/security/Agent Observability, authenticated or paid probes, provider
settings/access, live faults, release or funds movement. These require their
existing gap/approval gates. No new schema or complex code state machine needs
an inline diagram; the configuration/test flow is above.

**Implementation tasks:** no new build tasks from architecture, code quality or
performance; no regression introduced by this documentation. The existing pilot
and its acceptance checks remain in #284/TODOS rather than another task/test-plan
artifact. Zero additional TODOs proposed. No unplanned critical test gaps; all six
native acceptance areas remain unverified. Outside voice skipped for this bounded
review. Sequential execution in the existing checkout; no agents, branches or
worktrees created. No design choices were silently accepted on Joel's behalf.

VERDICT: engineering plan clear within its stated gates. ADR remains proposed;
operational setup/acceptance is not cleared. Direction, terms/AP2, budgets,
source-safety, permissions, responders and fault-test scope still need their
actual approvals/readback before the affected action.

NO UNRESOLVED DECISIONS
