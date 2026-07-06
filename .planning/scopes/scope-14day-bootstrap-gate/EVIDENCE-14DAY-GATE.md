# 14-day bootstrap gate evidence

**Status:** scaffold only; no run evidence recorded yet.  
**Scope:** first falsifiable storefront + qualified-inquiry demand test.  
**Posture:** no booking, payment, dispatch, automatic fulfillment, broad marketplace, live-money, or autonomous-operation claim.  
**Clock state:** not started. Start only after setup counts and pre-clock instrumentation checks below are real.

## Proof-level rule

Local/source proof, deployed proof, provider proof, and live proof are different states. This artifact may count only non-secret evidence with a pointer, timestamp/date, and reconstruction path. Screenshots, dashboards, env vars, or polite interest alone do not count as pass evidence.

## Setup counts before day 1

| Setup count | Required | Actual | Evidence pointer | Proof level | Notes |
|---|---:|---:|---|---|---|
| Source-backed profiles | 30-50 | 0 | _not started_ | none | Each counted profile needs source URL, freshness date, boundary label, and owner-confirmation status. |
| Manually recruited providers | 10 | 0 | _not started_ | none | Count only direct outreach targets with date/channel/status. |
| Attributable targeted sessions planned | 100 over 14 days | 0 | _not started_ | none | Every link/source must carry `utm_*`, `ref`, partner, outreach, assistant, or referral attribution. |

## Pre-clock instrumentation dry-run

| Metric | Required before clock | Current repo finding | Status | Evidence / ticket |
|---|---|---|---|---|
| Attributable targeted sessions | One dry-run session has attributable, reconstructable session/correlation evidence. | `visitor_attributed` is emitted client-side and captured by PostHog; `/api/observability/funnel` skips events without `businessId`, so generic targeted sessions are not currently source-owned Convex rows. | BLOCKED if source-owned session count is required; otherwise external PostHog export must be explicitly accepted and attached. | Narrow ticket: add source-owned targeted-session ledger or define accepted PostHog export proof. |
| Registry / answer demand context | One dry-run registry or answer path records search/query intent with attribution. | `registry_search`, `answer_query_started`, `answer_registry_searched`, `answer_provider_selected`, and `inquiry_attempted` are legal events; current client emitters cover registry and chat paths. | PARTIAL | Attach dry-run correlation IDs before day 1. |
| Qualified inquiry pass metric | One dry-run qualified inquiry persists an `inquiry_submitted` receipt with session/correlation/business refs. | Inquiry reducer emits `inquiry_submitted` funnel records and audit/operation rows; source tests exist but are not run by this template. | READY FOR DRY-RUN | Attach thread/operation/funnel refs before day 1. |
| Provider correction / listing request pass metric | One dry-run provider correction, maintenance, or listing request has a source-owned supplier-action row or explicit operator evidence ref. | `/privacy/remove-business` creates security dispute/audit receipt (`dispute.opened`), not an owner-maintenance funnel/source row; `owner_interest_submitted` exists in the event vocabulary but has no caller. | BLOCKED | Narrow ticket: add supplier-maintenance evidence row or operator evidence ledger before counting supplier pass. |
| Optional source/profile click-through | One dry-run profile/source click records business/session/correlation refs. | `service_registry_result_clicked` exists in `FunnelEventTypeValues` but no caller emits it. | BLOCKED or mark unavailable | Narrow ticket: add profile/source click emitter before treating click-through as measurable. |
| Trust pass | Copy/SEO/agent-audit checks show zero booking/payment/dispatch/autonomous overclaim. | Copy scan paths exist; deployed outside-in agent audit remains gated by issue #36 and issue #5. | PARTIAL | Attach `npm run test:copy`, SEO check, and outside-in audit refs when run. |

## Source-backed profile ledger

| Profile | Metro / category extension | Source URL | Freshness date | Boundary label | Owner-confirmed? | Notes |
|---|---|---|---|---|---|---|
| _not started_ |  |  |  |  |  |  |

## Provider recruitment ledger

| Provider | Outreach date | Channel / campaign | Profile ref | Response status | Counted supplier action? | Evidence pointer | Notes |
|---|---|---|---|---|---|---|---|
| _not started_ |  |  |  |  | no |  |  |

Supplier pass counts only voluntary correction, maintenance, claim/listing request, or explicit provider request to be listed. Polite interest, page views, or disputes from non-providers do not count.

## 14-day session and inquiry rollup

| Day | Attributable sessions | Qualified inquiries | Provider actions | Trust findings | Optional profile/source clicks | Evidence pointer |
|---|---:|---:|---:|---|---:|---|
| 1 | 0 | 0 | 0 | _not started_ | 0 |  |
| 2 | 0 | 0 | 0 | _not started_ | 0 |  |
| 3 | 0 | 0 | 0 | _not started_ | 0 |  |
| 4 | 0 | 0 | 0 | _not started_ | 0 |  |
| 5 | 0 | 0 | 0 | _not started_ | 0 |  |
| 6 | 0 | 0 | 0 | _not started_ | 0 |  |
| 7 | 0 | 0 | 0 | safety review only | 0 |  |
| 8 | 0 | 0 | 0 | _not started_ | 0 |  |
| 9 | 0 | 0 | 0 | _not started_ | 0 |  |
| 10 | 0 | 0 | 0 | _not started_ | 0 |  |
| 11 | 0 | 0 | 0 | _not started_ | 0 |  |
| 12 | 0 | 0 | 0 | _not started_ | 0 |  |
| 13 | 0 | 0 | 0 | _not started_ | 0 |  |
| 14 | 0 | 0 | 0 | final scan required | 0 |  |

## Pass-rule calculation

| Rule | Threshold | Actual | Verdict | Evidence pointer |
|---|---:|---:|---|---|
| Consumer pass | >=10 qualified inquiries from 100 attributable sessions | 0 | NOT RUN |  |
| Supplier pass | >=5 provider corrections/maintenance/listing requests | 0 | NOT RUN |  |
| Trust pass | 0 public/assistant overclaim | _unknown_ | NOT RUN |  |
| Optional quality signal | Source/profile click-through before inquiry | _unavailable_ | UNAVAILABLE unless instrumented |  |

## Trust scan and PM-05 ledger

| Surface | Command / reviewer | Result | Evidence pointer | Notes |
|---|---|---|---|---|
| Public copy | `npm run test:copy` | NOT RUN |  | Required before verdict. |
| SEO metadata | current SEO command / tests | NOT RUN |  | Required before verdict if SEO/public metadata changed. |
| Assistant-visible descriptors | outside-in agent audit | NOT RUN |  | Deployed proof gated by issue #36/#5. |
| Evidence-summary claim ledger | PM-05 claim ledger row | NOT RUN |  | Add row before shipping any public evidence-summary copy. |

## Verdict

**Verdict:** NOT RUN  
**Date:** _pending_  
**Decision:** no public platform-rung widening is authorized by this scaffold.

Choose exactly one after day 14:

- **GO:** consumer pass + supplier pass + trust pass. Continue only storefront/inquiry/freshness work.
- **ADAPT:** exactly one of consumer or supplier pass fails. Change wedge, channel, onboarding script, profile content, or distribution plan and rerun a time-boxed test.
- **STOP:** both consumer and supplier pass fail, or trust pass fails. Stop public platform widening and revise the product thesis.

## Blockers and follow-up tickets

| ID | Blocker | Required resolution before clock | Owner / status |
|---|---|---|---|
| 14D-G1 | Source-owned targeted-session count is source-local implemented but not target-environment proven for the 14-day run. | Source-local code/tests now persist valid no-`businessId` `visitor_attributed` rows, keep owner activation state business-scoped, and reconstruct count once per `utm_campaign` run id + pseudonymous session with explicit attribution and host-only/redacted referrer evidence. Before clock start: execute a target-environment dry-run, attach non-secret event/export refs, run id, and dedupe policy. | Source-local implemented; target dry-run open |
| 14D-G2 | Optional profile/source click-through is source-local implemented but not target-environment proven for the 14-day run. | Source-local code/tests now expose a public catalog `businessId` ref and emit `service_registry_result_clicked` through the registry primary "View details" action with businessId, pseudonymous session, correlation, UTM/run attribution when present, slug, query length, and result position. Before clock start: execute a target-environment dry-run from an attributable session, click a registry profile/source result, and attach non-secret `/api/observability/funnel` or accepted export refs showing event row(s), run id, businessId, correlation/session, payload, and dedupe/count policy. | Source-local implemented; target dry-run open |
| 14D-G3 | Supplier correction/listing pass is source-local implemented but not target-environment proven for the 14-day run. | Source-local helper/tests now reconstruct business-scoped supplier actions from `authenticated`/`published` claim/listing rows or `owner_interest_submitted` rows only when tied to direct recruitment or explicit accepted non-dispute operator evidence for the same provider/listing; privacy/removal disputes remain excluded. Before clock start: execute a target-environment dry-run and attach non-secret claim/business refs, recruitment or operator-evidence refs, run window, count output, dedupe policy, and evidence that no privacy/removal dispute path was counted. | Source-local implemented; target dry-run open |
| 14D-G4 | Deployed outside-in assistant audit is blocked. | Resolve issue #36/#5 or keep assistant-facing launch claims blocked. | Open |
