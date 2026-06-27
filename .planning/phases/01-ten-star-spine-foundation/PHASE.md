---
phase: 01-ten-star-spine-foundation
plan: 00
type: phase-master
wave: 0
depends_on: []
files_modified: []
autonomous: false
requirements: []
---

# Phase 1 Plan — Ten-Star Spine Foundation

**Status:** implementation-ready after review-panel remediation.
**Primary authority:** `../../ENGINEERING-STANDARDS.md` plus domain specs.
**GSD role:** master authority document, not a direct executor slice. Execute the PR-specific `*-PLAN.md` files.

<objective>
Define the full Phase 1 spine, PR order, non-goals, gates, and launch closeout expectations. This file governs PR-specific executor plans but is not one broad implementation task.
</objective>

## Outcome

Ship one narrow, production-grade spine for the launch ICP:

claim -> publish public business service catalog page -> registry/search/API projection -> AE-hosted discovery -> operator health/repair

Launch ICP: owner/operator or admin of an AU urgent/local-service business, starting with emergency trades.

## Non-negotiables

- No ABN required for T0 claim/publish.
- No chat/inbox in Phase 1.
- No payment/wallet/credits/Stripe/x402 in Phase 1 runtime.
- No protected actions/callable tools in Phase 1.
- No skills/request-market/expert/hosted-agent/voice/persona/marketplace code.
- No developer platform/API keys/MCP/OpenAPI in Phase 1.
- No public copy overclaims booking, payment, verification, agent action, partner integrations, or demand.
- No backup code without source-mining ledger.

## Required docs before coding

Implementation agents must read:

```text
.planning/PROJECT.md
.planning/ENGINEERING-STANDARDS.md
.planning/SOURCE-MINING.md
.planning/SECURITY-SPEC.md
.planning/AI-SPEC.md
.planning/SEO-AEO-SPEC.md
.planning/GTM-READINESS.md
.planning/AGENTIC-MARKET-STUDY.md
.planning/phases/01-ten-star-spine-foundation/PREMORTEM.md
```

## System boundary diagram

```text
[Browser]
  | untrusted input
  v
[TanStack route/createServerFn]
  | validates DTO, handles UX redirects, passes idempotency/correlation
  v
[Convex query/mutation/action]
  | derives actor/admin from auth, validates boundary input
  v
[Owning module]
  | business / registry / discovery / security / observability
  v
[Durable source state]
  | Convex tables, audit, operation keys, projection attempts
  v
[Generated projections]
  | public business service catalog page, registry, sitemap, llms, UCP fallback, admin readbacks
```

No browser-supplied owner/admin/actor ID is authority.

## State transition contract

| Command | Owner | Preconditions | Transition | Idempotency | Audit | Projection effect |
|---|---|---|---|---|---|---|
| `claimBusiness` | business | rate limit ok, CSRF ok, valid T0 identity fields | `draft/authenticated` claim created | `claim:create:{actor}:{slug}:{hash}` | `claim.created` or rejection event | none |
| `publishBusinessCatalog` | catalog | owner owns claim, at least one valid service, not suppressed, publish enabled | business `published`; service rows + capability rows current | `catalog:publish:{claimId}:{sourceHash}` | `claim.published` | queue registry + discovery projection |
| `syncCatalogProjection` | registry | catalog eligible | attempt `queued -> indexed/failed` | `registry:sync:{businessId}:{sourceHash}` | sync event | index/read model updated |
| `buildCatalogDiscoveryManifest` | discovery | business public + not suppressed | manifest `available/degraded/unavailable/stale` | `discovery:generate:{businessId}:{sourceHash}:{ucpVersion}` | discovery event | route output/cache state |
| `suppressBusiness` | business | source-owned admin | business/service/capability `suppressed` as scoped | `business:suppress:{targetId}:{reason}` | suppression event | invalidate page/search/sitemap/llms/UCP |
| `openDispute` | security | valid contact hash/reason | claim/business `contested` or dispute open | `dispute:open:{businessId}:{contactHash}` | `dispute.opened` | public status may degrade |
| `setOperatorControl` | observability/security | source-owned admin | control toggled | `control:set:{key}:{value}:{admin}` | `operator_control.changed` | routes degrade/deny |

Impossible transitions return typed errors and are tested.

## Public catalog claim fields

Minimum T0 claim/publish fields:

```text
name
category
suburb
slug
services: non-empty list of:
  serviceName
  serviceCategory
  serviceArea
  hoursOrUnknown
  publicFirstRequestDisclosure: public channel/label or no-contact reason; no raw private contact
  firstRequestMode: inquiry_available | quote_request_available | not_available_yet
sourceRefs
ownerMessage
```

ABN optional. ABR verification later only.

Incomplete workflow-critical facts produce visible owner tasks, not polished empty pages.

## PR sequence

Each PR must leave owned gates green. No public exposure before abuse/admin/suppression substrate exists.

### PR00 — Source-mining ledger

Create source-mining ledger entries for each Phase 1 module before implementation.

Deliverables:

```text
.planning/source-mining/phase-1-ledger.md or equivalent section in PR
backup file -> invariant kept -> implementation cut -> fresh seam -> tests -> banned symbols
```

Minimum backup sources:

- `convex/claimPublishing.ts`
- `src/lib/registry/README.md`
- `src/lib/registry/directory/*`
- `src/lib/registry/discovery/ucpManifest.ts`
- `src/routes/$slug.ucp.ts`
- `src/lib/registry/lifecycle/*`
- `src/lib/search/meilisearch.ts`
- backup admin membership/auth patterns
- `tests/seo/discovery-files.test.ts`

Acceptance:

- source-mining ledger exists,
- banned source imports/symbols scan seed exists for PR01 executable guardrails,
- no runtime code copied from backup,
- every future PR references relevant ledger row.

### PR01 — Substrate and guardrails

Create minimal app skeleton and scripts.

Deliverables:

```text
package.json
apps/web/
convex/
src/modules/
tests/unit/
tests/integration/
tests/e2e/
tests/types/
tests/imports/
tests/copy/
tests/seo/
```

Required scripts:

```json
{
  "typecheck": "tsc --noEmit",
  "check:convex-codegen": "convex codegen --typecheck=disable",
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration",
  "test:e2e": "playwright test tests/e2e",
  "test:a11y": "playwright test tests/e2e/a11y",
  "test:copy": "vitest run tests/copy",
  "test:imports": "vitest run tests/imports",
  "test:source-mining": "vitest run tests/imports/source-mining.test.ts",
  "test:types": "vitest run tests/types",
  "test:ts-standards": "vitest run tests/imports/ts-standards.test.ts",
  "test:seo": "vitest run tests/seo",
  "build": "vite build"
}
```

Acceptance:

- no rejected Phase 1 directories,
- import/source-mining/ts-standards scans fail on seeded bad fixtures,
- no no-op scripts.

### PR02 — Contracts, schema, indexes, idempotency, admin authority

Implement state unions, domain-owned validators, Convex schema, indexes, admin model, idempotency state, audit event union, lifecycle descriptor contract.

Tables:

```text
owners
businesses
businessContexts
businessServices
serviceCapabilities
claims
operationKeys
registryProjectionItems
registryProjectionAttempts
indexStatus
discoveryManifests
discoveryManifestAttempts
auditEvents
operatorControls
disputes
suppressionRules
adminMemberships
adminMembershipAuditEvents
abuseRateLimitBuckets
claimFingerprints
funnelEvents
ownerActivationState
```

Required indexes:

```text
owners.by_clerkUserId
businesses.by_slug
businesses.by_publicStatus_slug
businessServices.by_business_status
businessServices.by_slug_serviceSlug
serviceCapabilities.by_business_service_status
claims.by_owner_status
claims.by_business_status
operationKeys.by_actor_operation_key
registryProjectionItems.by_business
registryProjectionItems.by_service
registryProjectionAttempts.by_business_status
registryProjectionAttempts.by_logicalKey
indexStatus.by_target_status
indexStatus.by_status_lastAttempt
discoveryManifests.by_business_version
discoveryManifestAttempts.by_business_status
auditEvents.by_business_createdAt
auditEvents.by_correlationId
suppressionRules.by_target_status
disputes.by_business_status
adminMemberships.by_clerkUserId_state
operatorControls.by_key
abuseRateLimitBuckets.by_scope_key_window
claimFingerprints.by_fingerprint_status
funnelEvents.by_session_createdAt
funnelEvents.by_business_createdAt
funnelEvents.by_source_stage
ownerActivationState.by_business_stage
```

Lifecycle descriptor contract:

```text
LifecycleClass
LifecyclePrimitive = held_money | external_authority | time_bound | proof_gap
one reference vertical descriptor
no runtime engine
```

Acceptance:

- state variants match `PROJECT.md`,
- no duplicate validator literal lists,
- no `any`, `as any`, `v.any`, broad statuses, non-null assertions,
- type tests prove validators/domain types align,
- admin role grant/revoke/break-glass audit shape exists,
- operation key table or equivalent durable idempotency state exists,
- service/catalog tables cannot imply money, booking, callable tools, or future-surface availability.
- abuse/rate-limit bucket and claim fingerprint state exists before claim routes,
- funnel event and owner activation state exists before GTM gates,

### PR03 — Business claim/publish/suppress module, abuse controls in path

Implement `business` + required `security` helpers before public routes.

Interfaces:

```ts
claimBusiness(input, opts)
publishBusinessCatalog(input, opts)
suppressBusiness(input, opts)
getPublicBusinessCatalog(slug)
readCatalogHealth(businessId)
rateLimitClaim(input)
detectDuplicateClaim(input)
assertCsrf(input)
```

Rules:

- actor derived server-side,
- no ABN required,
- slug uniqueness deterministic,
- publish requires at least one valid service row,
- per-service first-request capabilities expose safe first-request disclosure plus explicit negative flags (`callable=false`, `paymentRequired=false`) in DTO/manifest/admin diagnostics,
- rate limit and duplicate checks occur in claim path,
- CSRF/same-site Origin enforced for session-cookie mutations,
- publish writes audit + queues registry/discovery projections in same logical flow,
- publish idempotent across business, service, capability, audit, and projection attempts,
- suppression atomically updates scoped public status, suppression rule, audit, index/discovery invalidation.

Acceptance tests:

- no-ABN claim succeeds,
- missing/foreign CSRF rejected,
- anonymous publish rejected,
- wrong-owner publish rejected,
- empty service list rejected,
- capability marked available never emits booking/payment/callable semantics,
- duplicate slug conflict/suffix behavior deterministic,
- duplicate/suspicious claim audited,
- rate-limit buckets and duplicate fingerprints are written/read through source-owned state,
- first-request disclosure appears in public DTOs while raw contact values remain absent,
- repeated publish returns same result and one audit/projection attempt per logical target,
- scoped suppression hides `getPublicBusinessCatalog`,
- impossible transitions return typed errors.

### PR04 — Abuse recovery, disputes, admin readback shell

Add admin authority and recovery before public indexing/discovery routes.

Routes/modules:

```text
/admin/claims
/admin/audit-events
/admin/index-health shell if admin-protected
/privacy/remove-business
```

Rules:

- every `/admin/*` has `beforeLoad` UX guard + server/Convex admin guard,
- role/action matrix enforced; support/reviewer denied for suppression, membership changes, operator controls, and dispute-close transitions,
- owner contention/recovery/transfer model exists,
- canonical removal path is `/privacy/remove-business`,
- operator controls exist for claims/publish/registry/discovery/public-copy safe mode.

Acceptance:

- non-admin 401/403,
- admin grant/revoke audited,
- business contention creates auditable state,
- admin transfer/recovery changes authority safely,
- emergency suppression and operator controls are queryable and audited.

### PR05 — Public claim and business routes as thin adapters

Routes:

```text
/
/claim
/claim/success
/[slug]
```

Rules:

- routes call module interfaces only,
- claim form collects workflow-critical service catalog fields,
- public business service catalog page derives from source-owned catalog DTO,
- owner/status UX exposes separate `publicStatus`, `indexStatus`, `discoveryStatus`, `trustTier`, service/capability status, human labels for bookings/payments/automated actions not live, and next action; raw `callable=false` and `paymentRequired=false` stay in machine DTOs/manifests/admin diagnostics,
- unpublished/suppressed/unavailable noindex or not-found as appropriate,
- no protocol jargon on owner pages,
- no payment/booking/callable/verified overclaims,
- UI states: loading, empty, invalid input, publish pending, publish failed, published-not-indexed, service/capability degraded, suppressed/unavailable, degraded discovery.

SEO contract:

- `buildPublicBusinessSeo` used,
- title/description/H1/canonical/noindex/schema from source state,
- JSON-LD escaped,
- no review/rating/offer/payment schema.

Acceptance:

- e2e no-ABN claim to published service catalog page,
- public business service catalog page renders what customers can do now per service and what is not live,
- owner can see a clear next action for not-indexed, discovery degraded, service/capability unavailable, not-verified, non-callable, and non-payable states,
- copy scan over route text/form validation passes,
- mobile 375px + keyboard/focus/errors pass,
- route imports pass.

### PR06 — Registry projection, attempts, repair loop

Implement:

```ts
syncCatalogProjection(input, opts)
retryRegistryProjection(input, opts)
listPublicBusinessCatalog(input)
searchPublicBusinessCatalog(query)
getPublicBusinessCatalogBySlug(slug)
getIndexStatus(input)
readCatalogHealth(businessId)
```

Rules:

- projection item generated from source catalog DTO,
- attempts store logical key, source hash/version, retry state, failure code,
- `indexStatus` latest derived/readback only,
- publish queues business + service projection,
- forced adapter failure persists admin-visible failed attempt,
- operator can retry/rebuild from Convex source,
- Convex/public query first; external search only when evidence requires it.
- public JSON list/search/detail share one catalog DTO or explicit subset,
- search can match business name, service name, category, suburb, and service area,
- API returns stable pagination, explicit empty results, and no private owner/contact fields,

Routes:

```text
/registry
/api/businesses
/api/businesses/search
/api/businesses/{slug}
/admin/index-health
```

Acceptance:

- published eligible business services appear in registry/search,
- suppressed/unpublished businesses and scoped suppressed services absent,
- forced failure visible with retry action,
- retry/rebuild succeeds without duplicate audit/projection side effects,
- stale threshold produces business/service readback,
- operator readback can answer source state, projection attempt, affected public surfaces, repair action, and repair result,
- registry has loading/empty/error states.
- public JSON list/search/detail route tests prove schema parity and 404/empty behavior.

### PR07 — Discovery, llms, sitemap, robots

Follow `AI-SPEC.md` and `SEO-AEO-SPEC.md`.

Routes:

```text
/[slug]/ucp
/api/businesses
/api/businesses/search
/api/businesses/{slug}
/llms.txt
/sitemap.xml
/robots.txt
```

Rules:

- Phase 1 supports AE-hosted fallback only,
- manifest includes path kind/status/source hash/version,
- manifest lists source-owned `services[]` and non-callable `capabilities[]`,
- every advertised URL route-tests or is omitted,
- no payment/callable/MCP/OpenAPI/API-key fields,
- owner text treated as untrusted data,
- stale/invalidation policy covers publish/edit/suppress/version bump,
- sitemap includes eligible public canonical pages only,
- robots excludes private/admin/claim-continuation routes and intentionally handles citation crawlers,
- `llms.txt` states unsupported capabilities.
- `llms.txt` documents public registry API routes, query semantics, response fields, examples, and unsupported actions.

Acceptance:

- valid published catalog manifest,
- valid degraded manifest with service/capability reasons,
- manifest/API/llms preserve explicit negative flags for non-callable and non-payable capability,
- suppressed business or service no public manifest exposure and absent from sitemap/search,
- dead-link test passes,
- prompt-injection fixture neutralized,
- content-type/cache/CORS/no-store behavior tested,
- no `.well-known/ucp` standard-origin overclaim.
- documented public registry API routes resolve and match the discovery/SEO schema contract.

### PR08 — Copy, import, type, SEO, security, GTM gate suite

Required green commands:

```text
npm run typecheck
npm run check:convex-codegen
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:a11y
npm run test:copy
npm run test:imports
npm run test:source-mining
npm run test:types
npm run test:ts-standards
npm run test:seo
npm run build
```

Required checks:

- banned future directories absent,
- banned money/provider identifiers absent from runtime core/discovery,
- no public overclaim in product/SEO/GTM assets,
- no route imports provider SDKs/private module files,
- all state/DTO/event variants have consuming dispatch points,
- all public projection allowlists tested,
- security tests from `SECURITY-SPEC.md` pass,
- funnel events and owner activation state exist and are queryable,
- claims register covers public copy.
- copy/DTO tests prove `publicStatus`, `indexStatus`, `discoveryStatus`, `trustTier`, service/capability status, `callable`, and `paymentRequired` are not collapsed into one "live" state.

Review:

- `/mattpocock-review` Standards + Spec axes,
- fix or explicitly record every finding,
- no merged axes.

### PR09 — Deployment/readback closeout

Local green is not launch-ready.

Required evidence:

```text
Vercel preview/live URL
Convex deployment/codegen readback
Clerk middleware/session readback
HTTP smoke for /, /claim, /registry, /api/businesses, /api/businesses/search?q=, /api/businesses/{slug}, /{slug}, /{slug}/ucp, /llms.txt, /sitemap.xml, /robots.txt
/admin/* 401/403 for non-admin
cache/content-type/CORS header checks
Search Console/Bing setup when domain exists
AI visibility baseline when public domain exists
```

Acceptance:

- production/preview route behavior matches local tests,
- no private URLs in sitemap/llms,
- published page not noindexed,
- private/admin routes not indexable,
- admin/operator health can reconstruct claim->publish->index->manifest,
- runtime kill-switches tested.

## Runtime kill-switches

Source-owned `operatorControls` required before public launch:

```text
claims_enabled
publish_enabled
registry_enabled
discovery_enabled
public_copy_safe_mode
```

Each has actor, reason, expiry, audit, admin readback, and behavior test.

## GTM readiness gate

Follow `GTM-READINESS.md`.

Phase 1 can enter only internal alpha until:

- owner activation events exist,
- channel attribution events exist,
- claims register enforced,
- no P0 security/copy/index/discovery gaps,
- internal alpha gate passes.

## Launch checklist

Phase 1 is not done until:

- [ ] source-mining ledger complete,
- [ ] no rejected directories/tables/fields,
- [ ] no-ABN claim/publish works,
- [ ] abuse/CSRF/duplicate checks in claim path,
- [ ] admin authority source-owned,
- [ ] idempotency durable for retryable operations,
- [ ] publish queues projection and records repairable failures,
- [ ] public business service catalog page shows workflow-critical facts,
- [ ] owner flow proves claim -> publish -> status readback -> share URL,
- [ ] UI, public JSON/API, llms, UCP fallback, and copy gates preserve separate status fields and negative capability flags,
- [ ] registry/search excludes ineligible records,
- [ ] discovery outputs are valid, honest, suppression-aware,
- [ ] SEO/AEO discovery files and schema valid,
- [ ] public copy and GTM copy obey claims register,
- [ ] suppression hides page/search/sitemap/llms/UCP,
- [ ] runtime kill-switches work,
- [ ] deployment/readback gate passes,
- [ ] `/mattpocock-review` complete.

## Scope rejection list

Implementation stops if these appear in runtime source before their phase:

```text
payments, stripe, x402, wallet, credits, billing
protected actions, proposeAction, action gateway
skills, request market, experts, hosted agents, voice, personas
MCP tools, OpenAPI services, API keys, SDK/CLI/plugin surfaces
marketplace/liquidity/ranking/benchmarks/leaderboards
```

Allowed only in `.planning` future-gate docs and tests that assert absence.
