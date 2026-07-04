# Phase 1: Ten-Star Spine Foundation — Research

**Researched:** 2026-06-27  
**Domain:** Fresh TanStack Start + Convex + Clerk launch spine, source-owned public catalog, discovery/readback, and guardrail architecture  
**Confidence:** HIGH for repo/document state and backup source-mine evidence; MEDIUM for package-version details because this research did not run package registry checks.

## User Constraints

- Phase 1 delivers only the narrow launch spine: `claim -> publish -> public business service catalog page -> registry/search/API -> AE-hosted discovery -> operator health/repair`. [CITED: `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/phases/01-ten-star-spine-foundation/01-SPEC.md`]
- The repo is planning-only. Runtime implementation has not started. `package.json`, `apps/`, `src/`, `convex/`, and `tests/` are absent. [VERIFIED: glob 2026-06-27]
- `AGENTS.md`, `.planning/config.json`, and `.planning/REQUIREMENTS.md` are absent. Validation should be treated as enabled because the GSD researcher default says absence of `workflow.nyquist_validation=false` means include validation architecture. [VERIFIED: glob 2026-06-27; CITED: `.codex/agents/gsd-phase-researcher.md`]
- PR00 source-mining is completed context, not an executable plan to recreate. New executable implementation slices start at `01-01` with substrate/guardrails. [CITED: `.planning/phases/01-ten-star-spine-foundation/01-CONTEXT.md`]
- `../Agentic-Economy-Backup` is a source mine only. Copy invariants, not folders; no direct imports; every adapted invariant needs a ledger row and fresh seam tests. [CITED: `.planning/SOURCE-MINING.md`, `.planning/source-mining/phase-1-ledger.md`, `.planning/PROJECT.md`]
- Convex is source of truth. Browser input never supplies `actor`, `ownerId`, `adminId`, or `claimedByOwnerId` as authority. Routes are adapters over public module seams/DTOs. [CITED: `.planning/PROJECT.md`, `.planning/ENGINEERING-STANDARDS.md`, `.planning/SECURITY-SPEC.md`]
- Public discovery is blocked until admin membership, suppression, operator controls, audit, projection/readback queues, and dispatchable repair actions exist. [CITED: `.planning/phases/01-ten-star-spine-foundation/01-CONTEXT.md`, `.planning/SECURITY-SPEC.md`]
- Public/owner copy must not imply bookings, payments, callable tools, protected actions, ABR verification, partner integrations, guaranteed response, marketplace liquidity, MCP/OpenAPI/API-key capability, or demand. [CITED: `.planning/PROJECT.md`, `.planning/AI-SPEC.md`, `.planning/GTM-READINESS.md`, `.planning/phases/01-ten-star-spine-foundation/01-UI-SPEC.md`]
- Explicit negative machine flags `callable: false` and `paymentRequired: false` are allowed only in approved public DTO/manifest schema and tests; truthy/executable/payment-positive usage fails. [CITED: `.planning/AI-SPEC.md`, `.planning/SOURCE-MINING.md`, `.planning/phases/01-ten-star-spine-foundation/FABLE-5-FOUNDATION-REVIEW.md`]
- UI must follow the Civic Signal Board framework: `DESIGN.md`, `.impeccable/design.json`, `.planning/FRONTEND-DESIGN-FRAMEWORK.md`, and `01-UI-SPEC.md` are implementation authorities. [CITED: `DESIGN.md`, `.impeccable/design.json`, `.planning/FRONTEND-DESIGN-FRAMEWORK.md`, `.planning/phases/01-ten-star-spine-foundation/01-UI-SPEC.md`]
- No package install, project-wide test, build, lint, or formatter was run during this research because no runtime scaffold exists and the assignment forbids those commands. [VERIFIED: tool transcript]

## Summary

Phase 1 is not a directory, marketplace, protocol demo, or backup rewrite. The planner must create a small production-grade spine where one AU urgent/local-service owner can claim without ABN, publish source-owned service facts, expose those facts through one `PublicCatalogDto`, and see separate public/index/discovery/trust/capability readbacks with repair paths. [CITED: `.planning/PROJECT.md`, `.planning/phases/01-ten-star-spine-foundation/01-SPEC.md`]

The first implementation slice must be `01-01` substrate and guardrails: create the runtime skeleton, package scripts, test folders, import/source-mining/copy/TS/UI-contract scans, and seeded bad fixtures before any public claim route or discovery output ships. PR00 is already done as context in `.planning/source-mining/phase-1-ledger.md`; recreating PR00 would be bloat. [CITED: `.planning/phases/01-ten-star-spine-foundation/01-CONTEXT.md`, `.planning/phases/01-ten-star-spine-foundation/PHASE.md`]

**Primary recommendation:** Plan Phase 1 as nine executable slices: `01-01` substrate/guardrails, `01-02` contracts/schema/idempotency/admin authority, `01-03` claim/publish/suppress, `01-04` admin/disputes/operator controls, `01-05` public owner routes/UI, `01-06` registry/search/API/repair, `01-07` discovery/llms/sitemap/robots, `01-08` gates/reviews/GTM evidence, `01-09` deployment/readback closeout. Do not collapse these into one broad implementation plan. [CITED: `.planning/phases/01-ten-star-spine-foundation/PHASE.md`, `.planning/ROADMAP.md`]

## Current State

| Item | Observed state | Planner action |
|---|---|---|
| `package.json` | Absent. [VERIFIED: glob 2026-06-27] | `01-01` creates it with non-no-op scripts. |
| `apps/` | Absent. [VERIFIED: glob 2026-06-27] | `01-01` creates `apps/web` TanStack Start app only. |
| `src/` | Absent. [VERIFIED: glob 2026-06-27] | `01-01` creates `src/modules`, `src/components`, `src/styles`, `src/lib/ui` seams before routes. |
| `convex/` | Absent. [VERIFIED: glob 2026-06-27] | `01-02` creates schema/functions after guardrails. |
| `tests/` | Absent. [VERIFIED: glob 2026-06-27] | `01-01` creates test directories and fail-first seeded fixtures. |
| `AGENTS.md` | Absent. [VERIFIED: glob 2026-06-27] | No AGENTS-derived constraints to copy; use `.planning/*` authorities. |
| `.planning/config.json` | Absent. [VERIFIED: glob 2026-06-27] | Treat validation architecture as enabled. |
| `.planning/REQUIREMENTS.md` | Absent. [VERIFIED: glob 2026-06-27] | Treat `01-SPEC.md` as locked Phase 1 requirements source. |
| `01-RESEARCH.md` | Created by this artifact. | Planner should consume it; do not overwrite without a new research pass. |

No runtime migration is needed because there is no runtime state yet. The planner should not add data migrations, compatibility shims, or backup import bridges. [CITED: `.planning/phases/01-ten-star-spine-foundation/01-SPEC.md`, `.planning/STATE.md`]

## Source-Mine Translation

Use only the ledger-named backup files/areas. Do not inspect or import unrelated backup directories. [CITED: `.planning/source-mining/phase-1-ledger.md`]

| Fresh seam | Backup evidence read | Keep | Cut | Tests planner must require |
|---|---|---|---|---|
| `src/modules/business/public.ts` + `convex/business.ts` | Backup `convex/claimPublishing.ts:49-80,88-95,97-205,260-266` has required T0 fields, duplicate-owned response, owner membership creation, payload hash, audit write, and returned public path. [VERIFIED: `../Agentic-Economy-Backup/convex/claimPublishing.ts`] | no-ABN T0 publish shape, source-owned owner binding, payload hash/audit, duplicate response. | `serverToken` authority, browser-supplied `clerkUserId`, `ctx: any`, `trustTier: "live"`, `publicStatus: "active"`, `chatUrl`, env-token admin/actor authority. | `tests/integration/claim-publish.test.ts` covers no-ABN success, wrong-owner reject, missing/foreign CSRF, idempotent publish, duplicate claim audit, raw contact absent. |
| `src/modules/registry/public.ts` | Backup registry README describes claim→publish→index→discoverable→callable→agent-discoverable flow and Convex as truth with Meilisearch best-effort sync. [VERIFIED: `../Agentic-Economy-Backup/src/lib/registry/README.md:7-25,43-47`] | claim→publish→index→discoverability spine and visible index gap concept. | callable stage, Meilisearch-first dependency, best-effort warning-only sync, route direct writes. | `tests/integration/projection-repair.test.ts` forced adapter failure, failed attempt row, retry/rebuild success, no duplicate audit/projection side effects. |
| `src/modules/registry/internal/search.ts` | Backup `meilisearch.ts` verifies startup and best-effort `syncClaimResult` that never throws. [VERIFIED: `../Agentic-Economy-Backup/src/lib/search/meilisearch.ts:178-220,226-266,284-333`] | health/readback semantics and searchable fields: name/category/suburb/state. | external search in Phase 1, warning-only failures, global search singleton, chat/profile URL fields. | `tests/unit/registry-search.test.ts` deterministic Convex-backed matching for business name, service name, category, suburb/state/postcode/service-area tokens. |
| `src/modules/discovery/public.ts` | Backup UCP builder pins version and emits manifest, degraded services, CORS/cache headers via `/$slug/ucp`. [VERIFIED: `../Agentic-Economy-Backup/src/lib/registry/discovery/ucpManifest.ts`; `../Agentic-Economy-Backup/src/routes/$slug.ucp.ts:7-48`] | generated manifest idea, version pin, route-tested JSON, content-type/cache/CORS/nosniff behavior, degraded manifest posture. | `.well-known/ucp` standard-origin claim, `payment_handlers`, live OpenAPI services, MCP tool definitions, placeholder input schemas, owner/runtime action claims. | `tests/seo/discovery-files.test.ts` and `tests/integration/discovery-manifest.test.ts` valid/degraded/suppressed manifest, dead-link check, no MCP/OpenAPI/payment/callable fields, header behavior. |
| `src/modules/lifecycle/public.ts` | Backup lifecycle contract defines `held_money`, `external_authority`, `time_bound`; README names proof-gap posture and descriptor moat. [VERIFIED: `../Agentic-Economy-Backup/src/lib/registry/lifecycle/types.ts:1-14,15-58,70-119`; `../Agentic-Economy-Backup/src/lib/registry/lifecycle/README.md:10-18,37-48`] | descriptor-only moat, primitives, one reference vertical descriptor, compile-time exhaustiveness. | runtime workflow engine, protected action execution, vertical workflow code, settlement/payment/proof runtime. | `tests/unit/lifecycle-descriptor.test.ts` primitive union, one reference descriptor, no executable runtime/callable/payment/proof fields. |
| `src/modules/security/public.ts` + `src/modules/observability/public.ts` | Backup admin membership has source-owned membership/audit shapes, first-admin bootstrap, grant/revoke, evidence refs; admin guards also show backend-admin magic authority trap. [VERIFIED: `../Agentic-Economy-Backup/convex/adminMemberships.ts`; `../Agentic-Economy-Backup/convex/adminGuards.ts:1-57`] | role/state/grant/revoke/break-glass audit, evidence refs, one-time bootstrap denial after active admin. | `security_admin`/`payout_admin` Phase 1 roles, `env_migration` as live authority, backend-admin magic authority as sufficient proof. | `tests/integration/admin-authority.test.ts` first bootstrap success, second denial, env/session-only denial, support/reviewer denied actions, denied audit event. |
| `src/modules/seo/public.ts` + discovery file generators | Backup SEO tests cover sitemap private exclusions, hosted HTTPS guard, robots private routes, `llms.txt` boundaries, JSON-LD escaping. [VERIFIED: `../Agentic-Economy-Backup/tests/seo/discovery-files.test.ts:14-190`; `../Agentic-Economy-Backup/src/lib/seo/localBusiness.ts:37-85`] | canonical/noindex/schema invariants, HTTPS/public-origin checks, JSON-LD escaping, optional ABR attribution posture. | chat URLs, pricing/how-it-works launch claims, ABN non-null assertion, ratings/offers/payment schema, protocol/callable copy. | `tests/seo/public-business-seo.test.ts` JSON-LD escape, no review/rating/offer/payment fields, noindex/sitemap rules, robots/llms route parity. |

The ledger already records these keep/cut decisions; implementation PRs should cite the relevant row and backup line anchors in PR notes, not re-open source-mining as a broad scavenger hunt. [CITED: `.planning/source-mining/phase-1-ledger.md`]

## Architecture Approach

### Responsibility map

| Capability | Primary tier | Secondary tier | Rationale |
|---|---|---|---|
| Claim owner/business identity | `convex/` + `src/modules/business` | `src/modules/security` | Claim changes source state and owner binding; browser only submits untrusted facts. [CITED: `.planning/PROJECT.md`, `.planning/SECURITY-SPEC.md`] |
| Publish catalog | `src/modules/catalog` + Convex mutation | `src/modules/registry`, `src/modules/discovery` | Publish writes service/capability source rows and queues projections; routes do not assemble DTOs. [CITED: `.planning/PROJECT.md`, `.planning/phases/01-ten-star-spine-foundation/01-CONTEXT.md`] |
| Public DTO/read model | `src/modules/catalog/public.ts` | `src/modules/seo`, `src/modules/discovery`, routes | `catalog` solely owns `PublicCatalogDto` and derived subsets. [CITED: `FABLE-5-FOUNDATION-REVIEW.md`, `.planning/AI-SPEC.md`] |
| Registry/search/API | `src/modules/registry` | `apps/web` route adapters | Deterministic Convex-backed matching first; no Meilisearch in Phase 1. [CITED: `.planning/ROADMAP.md`, `.planning/source-mining/phase-1-ledger.md`] |
| AE-hosted UCP/llms/sitemap/robots | `src/modules/discovery` | `src/modules/seo` | Generated projections from eligible catalog DTO; every URL route-tested or omitted. [CITED: `.planning/AI-SPEC.md`, `.planning/SEO-AEO-SPEC.md`] |
| SEO metadata/schema | `src/modules/seo` | route adapters | Module-owned metadata/schema builders; no route ad hoc JSON-LD. [CITED: `.planning/SEO-AEO-SPEC.md`] |
| Admin authority/CSRF/rate limit/disputes | `src/modules/security` + Convex | `apps/web` guards | Server/Convex derives authority; route `beforeLoad` is UX only. [CITED: `.planning/SECURITY-SPEC.md`, `.planning/ENGINEERING-STANDARDS.md`] |
| Audit/idempotency/funnel/operator controls | `src/modules/observability` | business/catalog/registry/discovery call it | Operation keys and `auditEvents` are cross-spine infrastructure, not route utilities. [CITED: `.planning/PROJECT.md`, `FABLE-5-FOUNDATION-REVIEW.md`] |
| UI shells/status/forms | `src/components/ae/*`, `src/lib/ui/*` | `apps/web` routes | Design system is a deep module; routes compose, not style. [CITED: `.planning/FRONTEND-DESIGN-FRAMEWORK.md`, `01-UI-SPEC.md`] |

### Required data flow

```text
Browser/UI
  -> TanStack Start route/createServerFn adapter
      -> Convex query/mutation/action
          -> owning module public seam
              -> module internal implementation
                  -> Convex source state + auditEvents + operationKeys
                      -> generated public projections/readbacks
                          -> page / registry / API / UCP / llms / sitemap / admin health
```

No route writes registry/discovery/search directly. No route imports `convex/schema`, module `internal/*`, backup paths, provider SDKs, or generated Convex document types as domain contracts. [CITED: `.planning/ENGINEERING-STANDARDS.md`, `.planning/phases/01-ten-star-spine-foundation/01-CONTEXT.md`]

## Module Seam Plan

Create public seams before implementation internals. Each domain module has `src/modules/<module>/public.ts`; implementation lives under `internal/`; no domain `index.ts` barrels. [CITED: `FABLE-5-FOUNDATION-REVIEW.md`, `.planning/ENGINEERING-STANDARDS.md`]

### Shared primitive ownership

Do not create a global `validators.ts` dumping ground. Own branded primitives where they originate:

| Primitive | Owning file | Notes |
|---|---|---|
| `BusinessId`, `OwnerId`, `Slug` | `src/modules/business/public.ts` | Created after validation/canonicalization. |
| `ServiceId` | `src/modules/catalog/public.ts` | Service rows belong to catalog. |
| `OperationKey`, `CorrelationId`, `SourceHash`, `AuditEventId` | `src/modules/observability/public.ts` | Used by operation key/audit/projection flows. |
| `AdminActor`, `CsrfToken`, `RateLimitBucketKey` | `src/modules/security/public.ts` | Security-derived only; browser never supplies authority. |

### Files and symbols by module

| Module | Files planner should create | Public symbols |
|---|---|---|
| `business` | `src/modules/business/public.ts`; `src/modules/business/internal/claim.ts`; `src/modules/business/internal/owner-binding.ts`; `src/modules/business/internal/visibility.ts`; `convex/business.ts` | `claimBusiness`, `suppressBusiness`, `isPubliclyDiscoverable`, `BusinessId`, `OwnerId`, `Slug`, `ClaimStatus`, `PublicStatus`, `TrustTier`, discriminated result unions. |
| `catalog` | `src/modules/catalog/public.ts`; `src/modules/catalog/internal/public-catalog-dto.ts`; `src/modules/catalog/internal/first-request.ts`; `convex/catalog.ts` | `publishBusinessCatalog`, `getPublicBusinessCatalog`, `readCatalogHealth`, `PublicCatalogDto`, `PublicFirstRequestDisclosure`, `FirstRequestMode`, `ServiceCapabilityStatus`, `CapabilityKind`. |
| `registry` | `src/modules/registry/public.ts`; `src/modules/registry/internal/projection-attempts.ts`; `src/modules/registry/internal/search.ts`; `convex/registry.ts` | `syncCatalogProjection`, `retryRegistryProjection`, `listPublicBusinessCatalog`, `searchPublicBusinessCatalog`, `getPublicBusinessCatalogBySlug`, `getIndexStatus`, `RegistryProjectionAttempt`, `RegistrySearchResult`. |
| `discovery` | `src/modules/discovery/public.ts`; `src/modules/discovery/internal/ucp-manifest.ts`; `src/modules/discovery/internal/llms.ts`; `src/modules/discovery/internal/sitemap.ts`; `src/modules/discovery/internal/robots.ts`; `convex/discovery.ts` | `buildCatalogDiscoveryManifest`, `regenerateDiscoveryManifest`, `buildLlmsTxt`, `buildSitemapXml`, `buildRobotsTxt`, `DiscoveryStatus`, `DiscoveryPathKind`, `PhaseOneUcpManifest`. |
| `lifecycle` | `src/modules/lifecycle/public.ts`; `src/modules/lifecycle/internal/reference-vertical.ts` | `LifecyclePrimitive = 'held_money' | 'external_authority' | 'time_bound' | 'proof_gap'`, `LifecycleDescriptor`, `ReferenceVerticalDescriptor`; no runtime engine. |
| `observability` | `src/modules/observability/public.ts`; `src/modules/observability/internal/operation-keys.ts`; `src/modules/observability/internal/audit.ts`; `src/modules/observability/internal/funnel.ts`; `src/modules/observability/internal/operator-controls.ts`; `src/modules/observability/internal/redaction.ts`; `convex/observability.ts` | `reserveOperationKey`, `completeOperationKey`, `failOperationKey`, `emitAuditEvent`, `recordFunnelEvent`, `readOwnerActivationState`, `readOperationalGaps`, `readOperatorControls`, `setOperatorControl`, `redactLogValue`. |
| `security` | `src/modules/security/public.ts`; `src/modules/security/internal/csrf.ts`; `src/modules/security/internal/rate-limit.ts`; `src/modules/security/internal/duplicates.ts`; `src/modules/security/internal/admin-authority.ts`; `src/modules/security/internal/disputes.ts`; `convex/security.ts` | `assertCsrf`, `rateLimitClaim`, `detectDuplicateClaim`, `openDispute`, `requireAdmin`, `bootstrapFirstAdmin`, `grantAdminMembership`, `revokeAdminMembership`, role/action permission helpers. |
| `seo` | `src/modules/seo/public.ts`; `src/modules/seo/internal/public-business-seo.ts`; `src/modules/seo/internal/json-ld.ts` | `buildPublicBusinessSeo`, `buildPublicServiceSchema`, `serializeJsonLdForInlineScript`, canonical/noindex/schema result unions. |
| UI framework | `src/styles/tokens.css`; `src/styles/globals.css`; `src/components/ui/*`; `src/components/ae/layout/*`; `src/components/ae/status/*`; `src/components/ae/forms/*`; `src/components/ae/feedback/*`; `src/components/ae/data/*`; `src/lib/ui/status-presentation.ts`; `src/lib/ui/copy.ts`; `src/lib/ui/routes.ts`; `src/lib/ui/contract-scans.ts` | `AePublicShell`, `AeOwnerShell`, `AeAdminShell`, `AeStatusBadge`, `AeStatusCard`, `AeCapabilityList`, `AeClaimFormSection`, `AeReviewBlock`, `AeEmptyState`, `AeQueueList`, `AeAuditEventRow`, `getStatusPresentation`. |

### Convex schema model

`01-02` must create `convex/schema.ts` with the tables named in `PROJECT.md`: `owners`, `businesses`, `businessContexts`, `businessServices`, `serviceCapabilities`, `claims`, `operationKeys`, `registryProjectionItems`, `registryProjectionAttempts`, `indexStatus`, `discoveryManifests`, `discoveryManifestAttempts`, `abuseRateLimitBuckets`, `claimFingerprints`, `funnelEvents`, `ownerActivationState`, `auditEvents`, `operatorControls`, `disputes`, `suppressionRules`, `adminMemberships`, and `adminMembershipAuditEvents`. No money/action/request/skills/voice/agent runtime tables. [CITED: `.planning/PROJECT.md`, `.planning/phases/01-ten-star-spine-foundation/PHASE.md`]

Required indexes are listed in `PHASE.md` lines 230-262 and should be copied into the `01-02` plan as acceptance, not improvised later. [CITED: `.planning/phases/01-ten-star-spine-foundation/PHASE.md`]

### Operation key state machine

Planner should require an `operationKeys` implementation before claim/publish/projection/discovery/suppression/admin retry work:

```text
reserve(scope, actor, operation, key, requestHash/sourceHash)
  -> if absent: create in_progress
  -> if same key+same hash succeeded: replay stored result/effect refs
  -> if same key+same hash in_progress: return in_progress/retryable typed result
  -> if same key+different hash: reject and audit same_key_different_body
complete(key, resultHash, effectRefs)
fail(key, failureCode, redactedError, retryAfter?)
```

This belongs in `observability`, with typed callers in business/catalog/registry/discovery/security. [CITED: `FABLE-5-FOUNDATION-REVIEW.md`, `.planning/ENGINEERING-STANDARDS.md`]

## UI / Design Framework Implications

The planner must not schedule route screens before executable tokens, shadcn initialization, AE shells, status presentation, and `test:ui-contract` exist. [CITED: `.planning/FRONTEND-DESIGN-FRAMEWORK.md`, `01-UI-SPEC.md`]

First frontend work inside `01-01` should ship only:

1. runtime scaffold,
2. `src/styles/tokens.css` and globals wired to Tailwind/shadcn,
3. shadcn initialization in `apps/web` after scaffold exists,
4. minimal official shadcn primitives actually used: `button`, `card`, `badge`, `alert`, `field`, `input`, `textarea`, `select` if needed, `checkbox` if needed, `skeleton`, `spinner`, `empty`, `separator`,
5. AE shells under `src/components/ae/layout/*`,
6. `src/components/ae/status/AeStatusBadge.tsx` and `src/lib/ui/status-presentation.ts`,
7. one tiny non-mutating route proving the framework (`/` shell preview is acceptable),
8. `test:ui-contract` scanning raw colors, `space-y-*`, `transition-all`, banned owner/public copy, manual status-color classes, custom empty/loading/error markup, local button/status/skeleton lookalikes, arbitrary radius/shadow/z-index, and route-local scroll listeners. [CITED: `.planning/FRONTEND-DESIGN-FRAMEWORK.md`]

Route sequence after UI substrate:

| Route | UI contract |
|---|---|
| `/` | Hero, one primary CTA `Claim your service page`, secondary registry link, max three proof cards, anti-overclaim alert, no payment/developer/marketplace sections. [CITED: `01-UI-SPEC.md`] |
| `/claim` | One-page claim flow unless validation proves stepper; business identity, service facts, first-request disclosure, review/publish; persistent labels and visible disabled reasons. [CITED: `01-UI-SPEC.md`] |
| `/claim/success` / owner status | Canonical one-screen `AeStatusCard` with public URL, service status, visibility, discovery/index health, unavailable capabilities, next action. [CITED: `01-UI-SPEC.md`, `DESIGN.md`] |
| `/{slug}` | First viewport at 375px must include business/service identity, suburb/state, service facts, first-request mode, status/unavailable capability. [CITED: `01-UI-SPEC.md`] |
| `/registry` | Loading/empty/no-results/populated/pagination states; deterministic search; no private fields. [CITED: `01-UI-SPEC.md`] |
| `/admin/claims`, `/admin/index-health`, `/admin/audit-events` | Separate `AeAdminShell`; queues grouped by status/next action; rows show object, source state, failed surface, latest attempt, repair action, correlation ID; non-admin denial state. [CITED: `01-UI-SPEC.md`] |

Visual hard cuts: no default shadcn styling as final UI, no raw route colors, no per-screen theme files, no future nav items, no fake dashboard art, no AI-purple gradients, no decorative status dots, no `transition-all`. [CITED: `DESIGN.md`, `.planning/FRONTEND-DESIGN-FRAMEWORK.md`]

## Security / Admin Model

Plan security as source-owned state, not middleware vibes.

| Area | Required implementation | Tests/gates |
|---|---|---|
| Actor/owner authority | Convex/server boundary derives actor from Clerk/Convex auth; browser request body never includes authority IDs. [CITED: `.planning/SECURITY-SPEC.md`] | Anonymous publish, wrong-owner publish, browser-supplied owner/admin ignored/rejected. |
| CSRF/Origin | `assertCsrf` covers claim submit/publish, suppress/unsuppress, dispute decision, admin membership, operator control changes. [CITED: `.planning/SECURITY-SPEC.md`] | Missing token, foreign Origin, same-site success. |
| Abuse controls | `rateLimitClaim`, `detectDuplicateClaim`, slug collision/duplicate fingerprints, typed rejection/audit. [CITED: `.planning/SECURITY-SPEC.md`] | competitor squat, mass claim, duplicate/suspicious audit, rate-limit bucket persisted. |
| Admin membership | `adminMemberships` with `owner_admin | support | reviewer`, `active | revoked | suspended`; first-admin bootstrap one-time; Clerk/session identifies principal but does not grant admin. [CITED: `.planning/SECURITY-SPEC.md`, `FABLE-5-FOUNDATION-REVIEW.md`] | bootstrap success, second denial, env/session-only denial, grant/revoke audited. |
| Permission matrix | owner_admin can grant/revoke/suppress/operator-control/close disputes; support can read/annotate only; reviewer read-only. [CITED: `.planning/SECURITY-SPEC.md`] | support/reviewer denied suppression, membership changes, operator controls, dispute close; `admin.action_denied` emitted. |
| Audit | `auditEvents` is append-only authority; admin audit table derived/read model keyed by `auditEventId` only. [CITED: `FABLE-5-FOUNDATION-REVIEW.md`] | required fields non-optional; before/after redacted allowlisted diffs or hashes; correlation ID/idempotency key required. |
| Suppression | One fail-closed `isPubliclyDiscoverable` predicate controls page, registry, API/search, sitemap, llms, UCP. [CITED: `.planning/SECURITY-SPEC.md`, `PREMORTEM.md`] | warm-cache suppression hides every public output; unsuppression rebuild/readback path tested. |
| Operator controls | `claims_enabled`, `publish_enabled`, `registry_enabled`, `discovery_enabled`, `public_copy_safe_mode` with actor/reason/expiry/audit/readback. [CITED: `PREMORTEM.md`, `.planning/phases/01-ten-star-spine-foundation/PHASE.md`] | toggles degrade/deny behavior and appear in admin health. |
| Redaction | Owner/contact/token/private evidence never in public DTOs, logs, audit snapshots, readbacks, llms, UCP, JSON-LD. [CITED: `.planning/SECURITY-SPEC.md`] | PII-seeded fixtures absent everywhere; redaction scan. |

Security sequencing gate: no public discovery routes before admin membership, suppression, audit, operator controls, and repair dispatches exist. [CITED: `.planning/phases/01-ten-star-spine-foundation/01-CONTEXT.md`]

## Discovery / SEO / AEO Model

### One DTO, many projections

`src/modules/catalog/public.ts` owns `PublicCatalogDto`. The same DTO or explicit typed subsets feed:

```text
/{slug}
/registry
/api/businesses
/api/businesses/search?q=
/api/businesses/{slug}
/{slug}/ucp
/llms.txt
/sitemap.xml
/robots.txt
SEO metadata / JSON-LD
admin readbacks where public-safe
```

No route-local DTOs, DB row spreads, hand-authored manifests, or docs that advertise dead routes. [CITED: `.planning/AI-SPEC.md`, `.planning/SEO-AEO-SPEC.md`, `FABLE-5-FOUNDATION-REVIEW.md`]

### Public catalog DTO requirements

The planner should require at least these fields in `PublicCatalogDto` or explicit subsets:

```ts
type PublicCatalogDto = {
  slug: Slug
  name: string
  category?: string
  suburb?: string
  state?: string
  postcode?: string
  serviceAreaTokens: readonly string[]
  publicUrl: string
  trustTier: TrustTier
  publicStatus: 'published'
  indexStatus: IndexStatus
  discoveryStatus: DiscoveryStatus
  updatedAt: string
  schemaVersion: string
  services: readonly {
    serviceId: ServiceId
    slug: string
    name: string
    category: string
    serviceArea: string
    hoursOrUnknown: string
    publicStatus: 'published'
    firstRequest: PublicFirstRequestDisclosure
    capabilities: readonly {
      kind: CapabilityKind
      status: ServiceCapabilityStatus
      callable: false
      paymentRequired: false
      reason?: string
    }[]
  }[]
}
```

Raw contact values are not public DTO fields. First-request availability may be `inquiry_available` or `quote_request_available` only when there is source-owned public contact/instruction with consent/evidence; otherwise use `not_available_yet`/`ae_status_only` plus `noContactReason`. [CITED: `FABLE-5-FOUNDATION-REVIEW.md`, `.planning/AI-SPEC.md`, `.planning/SECURITY-SPEC.md`]

### Route and file rules

| Surface | Rule | Gate |
|---|---|---|
| `/api/businesses`, `/api/businesses/search?q=`, `/api/businesses/{slug}` | Read-only, no auth/API keys, stable slugs/pagination, explicit empty/404, one schema. | schema parity tests and route HTTP smoke. [CITED: `.planning/AI-SPEC.md`, `.planning/SEO-AEO-SPEC.md`] |
| `/{slug}/ucp` | AE-hosted fallback only with `pathKind='ae_hosted_fallback'`, version/source hash/status/readback, services/capabilities, negative flags. | valid/degraded/suppressed manifest tests, headers, prompt-injection fixture. [CITED: `.planning/AI-SPEC.md`] |
| `/llms.txt` | Truth file listing only current public surfaces, unsupported actions, registry API semantics/examples, privacy/removal path. | dead-link and banned-copy scans. [CITED: `.planning/AI-SPEC.md`, `.planning/SEO-AEO-SPEC.md`] |
| `/sitemap.xml` | Static public URLs plus published non-suppressed `/{slug}` pages only; no claim success/admin/dispute/private/stale UCP URLs. | sitemap tests with suppressed/private fixtures. [CITED: `.planning/SEO-AEO-SPEC.md`] |
| `/robots.txt` | Declare sitemap; disallow private/admin/claim-continuation/dispute evidence; intentionally allow citation/search crawlers unless later decision changes. | robots test and deployment smoke. [CITED: `.planning/SEO-AEO-SPEC.md`] |
| JSON-LD | `LocalBusiness`, `Service`, `BreadcrumbList` only from source-owned fields; escape inline script values; no Review/AggregateRating/Offer/payment fields. | JSON-LD escape/schema tests. [CITED: `.planning/SEO-AEO-SPEC.md`; backup SEO tests] |

Discovery `available` means latest successful readback for the current eligible source hash and surface body/URL hash. It never means callable, payable, verified, or standard merchant-origin UCP. [CITED: `FABLE-5-FOUNDATION-REVIEW.md`, `.planning/AI-SPEC.md`]

## Standard Stack

The stack is already selected by project authority; research should not explore alternatives unless the scaffold fails.

| Layer | Standard | Planner instruction |
|---|---|---|
| Frontend/runtime | TanStack Start + React | Create `apps/web` route adapters/server functions; routes import module public seams and UI components only. [CITED: `.planning/PROJECT.md`, `.planning/FRONTEND-DESIGN-FRAMEWORK.md`] |
| Source state | Convex | Create `convex/schema.ts` and Convex queries/mutations/actions; run codegen in implementation PRs. [CITED: `.planning/PROJECT.md`, `.planning/ENGINEERING-STANDARDS.md`] |
| Auth/session UX | Clerk with Convex authority mapping | Clerk identifies session; Convex/source-owned roles grant owner/admin authority. [CITED: `.planning/PROJECT.md`, `.planning/SECURITY-SPEC.md`] |
| UI primitives | shadcn/ui official registry + Tailwind semantic tokens | Initialize only after scaffold exists; install smallest official primitives per route; no third-party blocks. [CITED: `01-UI-SPEC.md`, `.planning/FRONTEND-DESIGN-FRAMEWORK.md`] |
| Unit/integration/type checks | Vitest + TypeScript strict checks | Create script names listed below; exact packages/versions verified during `01-01`. [CITED: `.planning/ENGINEERING-STANDARDS.md`, `PHASE.md`] |
| E2E/a11y/render checks | Playwright | Cover Sam flow, 375px/wide, keyboard/focus, admin denial, discovery fetches. [CITED: `01-SPEC.md`, `01-UI-SPEC.md`] |
| Deploy/readback | Vercel + Convex + Clerk | Closeout smoke must prove live routes, headers, admin denial, codegen/session readback. [CITED: `.planning/ENGINEERING-STANDARDS.md`, `PHASE.md`] |

Package legitimacy/version audit was not run in this research. `01-01` should verify package names and versions against official docs and registry before install, then record exact versions in the substrate plan/PR. [CITED: `.codex/agents/gsd-phase-researcher.md`]

## Don't Hand-Roll

| Problem | Do not build | Use/own instead | Why |
|---|---|---|---|
| Auth UI/session | Bespoke login/session widgets | Clerk components/patterns plus Convex-derived authority | Avoid route-local authority and custom auth risk. [CITED: `01-UI-SPEC.md`, `.planning/SECURITY-SPEC.md`] |
| Admin power | Env variables, backend magic token, route-only guards | `adminMemberships` + `requireAdmin` + server/Convex guard | Env/session identifies caller; source state grants role. [CITED: `.planning/SECURITY-SPEC.md`] |
| Search | Meilisearch/external engine first | Deterministic Convex-backed matching | Phase 1 needs correctness/readback, not ranking infra. [CITED: `.planning/ROADMAP.md`, backup Meilisearch evidence] |
| Public DTOs | DB row spreads or route-local shape mappers | `catalog`-owned `PublicCatalogDto` and subsets | Prevents private field leaks and parity drift. [CITED: `FABLE-5-FOUNDATION-REVIEW.md`] |
| Discovery files | Hand-authored manifests/llms/sitemap | Generated from source DTO + route-tested URLs | Prevents dead route/protocol theatre. [CITED: `.planning/AI-SPEC.md`, `.planning/SEO-AEO-SPEC.md`] |
| UI primitives | Route-local buttons/cards/badges/forms | shadcn primitives + AE components | Prevents design drift and inaccessible one-offs. [CITED: `.planning/FRONTEND-DESIGN-FRAMEWORK.md`] |
| Audit/log redaction | Ad hoc `JSON.stringify` logs | `observability` redaction/audit helpers | PII/security proof requires one policy. [CITED: `.planning/SECURITY-SPEC.md`] |
| Retry/idempotency | Double-submit guards in UI only | Durable `operationKeys` state machine | Future money/action safety depends on correct semantics now. [CITED: `FABLE-5-FOUNDATION-REVIEW.md`] |

## Validation Architecture

No commands were run because runtime does not exist. The planner must create these commands as non-no-op scripts and tests. [VERIFIED: current state]

### Required scripts by Phase 1 close

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
npm run test:ui-contract
npm run build
```

The authority docs list all except `test:ui-contract`; add `test:ui-contract` because the frontend framework requires it before the second user-facing route ships. [CITED: `.planning/ENGINEERING-STANDARDS.md`, `.planning/FRONTEND-DESIGN-FRAMEWORK.md`]

### Tests/check files planner should create

| Command | Files | Must prove |
|---|---|---|
| `npm run test:imports` | `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/backup-imports.test.ts` | No backup imports, no `.planning` runtime imports, no module private imports from routes/other modules, no provider SDK imports in routes, no phase-numbered runtime names. |
| `npm run test:source-mining` | `tests/imports/source-mining.test.ts`, `tests/fixtures/bad-source-mining/*` | Banned seed fails: backup path, `phase35`, payments/wallet/x402/Stripe, `payment_handlers`, MCP/OpenAPI/API-key, callable/protected actions, skills/request market/hosted agents/voice/persona/benchmarks. Negative flags allowed only in approved schemas/tests. |
| `npm run test:ts-standards` | `tests/imports/ts-standards.test.ts`, `tests/fixtures/bad-ts-standards/*` | No explicit `any`, `as any`, `as unknown as`, non-null assertions, `v.any()`, broad status strings, inexact Convex returns in domain paths. |
| `npm run test:types` | `tests/types/domain-contracts.test.ts` or `tests/types/*.test-d.ts` | Invalid statuses/result codes fail; validator-inferred types equal exported domain types; route/server DTOs do not widen literals; required `Record<Union, ...>` maps exhaustive; branded IDs/keys not swappable. |
| `npm run test:unit` | `tests/unit/lifecycle-descriptor.test.ts`, `tests/unit/operation-keys.test.ts`, `tests/unit/catalog-public-dto.test.ts`, `tests/unit/seo-json-ld.test.ts`, `tests/unit/ui-status-presentation.test.ts` | Descriptor-only lifecycle, operation key same/different body semantics, public DTO allowlist, JSON-LD escaping, UI labels/tone/next-action mapping. |
| `npm run test:integration` | `tests/integration/claim-publish.test.ts`, `tests/integration/admin-authority.test.ts`, `tests/integration/projection-repair.test.ts`, `tests/integration/discovery-manifest.test.ts`, `tests/integration/suppression-eligibility.test.ts`, `tests/integration/funnel-activation.test.ts` | No-ABN claim/publish, CSRF/rate-limit/duplicate/wrong-owner, admin matrix, durable attempts/retry/no duplicates, valid/degraded/suppressed discovery, one eligibility predicate across all outputs, activation events queryable. |
| `npm run test:e2e` | `tests/e2e/sam-claim-publish.spec.ts`, `tests/e2e/admin-denial.spec.ts`, `tests/e2e/registry-search.spec.ts`, `tests/e2e/discovery-routes.spec.ts` | Sam can claim without ABN and publish; owner status readback; non-admin admin denial; registry/API search story; public routes/discovery fetches. |
| `npm run test:a11y` | `tests/e2e/a11y/phase1-a11y.spec.ts` | 375px and wide viewport, keyboard order/focus, labels/errors, loading/empty/error/suppressed states, no color-only status. |
| `npm run test:copy` | `tests/copy/phase1-banned-copy.test.ts`, `tests/copy/claims-register.test.ts` | Route/form/SEO/GTM copy rejects raw owner-facing `callable`, `paymentRequired`, `verified`, `agent-ready`, booking/payment/marketplace/wallet/partner/demand claims; permits literal negative flags only in machine schema/test contexts. |
| `npm run test:seo` | `tests/seo/public-business-seo.test.ts`, `tests/seo/discovery-files.test.ts`, `tests/seo/public-api-schema.test.ts` | Canonical/noindex/schema rules, sitemap/robots/llms route parity, JSON-LD escape, no private URLs, API list/search/detail schema compatibility. |
| `npm run test:ui-contract` | `tests/ui-contract/class-scan.test.ts`, `tests/ui-contract/component-contract.test.ts`, `tests/ui-contract/status-copy.test.ts` | No raw colors/arbitrary visual tokens, `space-y-*`, `transition-all`, local status colors/buttons/skeletons/empty states, future nav items, route-local scroll listeners. |
| `npm run check:convex-codegen` | Convex generated output check | Schema/functions compile and generated types align; no stale generated contract. |
| `npm run typecheck` | TypeScript project | Strict TS config green; no broad runtime type holes. |
| `npm run build` | App build | Runtime bundle builds after all checks. |

### Phase requirements to validation map

| Req | Core gate |
|---|---|
| R1 source-mining/import guardrails | `test:imports`, `test:source-mining`, `test:ts-standards`, seeded bad fixtures. |
| R2 durable model/type contracts | `check:convex-codegen`, `typecheck`, `test:types`, schema/index tests. |
| R3 claim/publish | `tests/integration/claim-publish.test.ts`, Sam E2E, CSRF/rate-limit/duplicate tests. |
| R4 public page/status readback | Sam E2E, a11y, copy, UI contract, public DTO tests. |
| R5 registry/search/API | registry integration, public API schema/route tests, search E2E. |
| R6 projection/readback/repair | projection repair integration, operation key unit tests, admin index health E2E. |
| R7 discovery | discovery integration, SEO discovery files, dead-link/header tests, prompt-injection fixture. |
| R8 admin/suppression/dispute/operator controls | admin authority integration, suppression eligibility integration, admin denial E2E. |
| R9 lifecycle descriptors | lifecycle unit/type tests plus source/copy scans for no runtime engine. |
| R10 closeout readiness | full command suite, deployment/readback smoke, Matt Pocock review, GTM internal-alpha evidence. |

## Sequencing Recommendations

### First implementation slice: `01-01-substrate-and-guardrails`

Create only the minimal runtime substrate and executable guardrails. Do not implement claim/publish behavior yet.

Deliverables:

```text
package.json
apps/web/
convex/
src/modules/
src/styles/tokens.css
src/styles/globals.css
src/components/ui/                  # shadcn-owned primitives only after initialization
src/components/ae/layout/
src/components/ae/status/
src/lib/ui/status-presentation.ts
src/lib/ui/copy.ts
src/lib/ui/contract-scans.ts
tests/unit/
tests/integration/
tests/e2e/
tests/e2e/a11y/
tests/types/
tests/imports/
tests/copy/
tests/seo/
tests/ui-contract/
tests/fixtures/bad-source-mining/
tests/fixtures/bad-ts-standards/
```

Acceptance:

- Scripts exist and are non-no-op.
- Bad fixtures fail for source-mining, imports, copy, TS standards, UI contract.
- Clean empty/minimal runtime passes guardrails.
- No public exposure beyond a non-mutating shell preview route if needed to prove the UI framework.
- No claim/publish/admin/discovery behavior is faked.

### Later slices

| Slice | Name | Main deliverable | Hard gate before next slice |
|---|---|---|---|
| `01-02` | contracts-schema-idempotency-admin-foundation | Convex schema, indexes, state unions, validators, operation keys, audit event union, admin memberships, lifecycle descriptor, funnel/activation tables. | `typecheck`, `check:convex-codegen`, `test:types`, `test:ts-standards`, operation-key/lifecycle/admin bootstrap tests. |
| `01-03` | business-claim-publish-suppress | `claimBusiness`, `publishBusinessCatalog`, `suppressBusiness`, CSRF/rate-limit/duplicate checks in path, publish queues projections. | no-ABN claim/publish integration; wrong-owner/anonymous/CSRF/rate-limit/duplicate; idempotent publish; scoped suppression hides catalog. |
| `01-04` | admin-dispute-operator-recovery | `/admin/claims`, `/admin/audit-events`, `/privacy/remove-business`, operator controls, contention/transfer/recovery. | non-admin 401/403; support/reviewer denial; grant/revoke/suppress/operator-control audits. |
| `01-05` | public-owner-ui-routes | `/`, `/claim`, `/claim/success`, `/{slug}`, owner status/readback, SEO builders for page. | Sam E2E; 375px/wide/focus/errors; copy scan; noindex/not-found/suppressed states; route imports. |
| `01-06` | registry-search-api-repair | `/registry`, `/api/businesses`, `/api/businesses/search`, `/api/businesses/{slug}`, projection attempts/readbacks/retry, `/admin/index-health`. | published appears; suppressed/unpublished absent; forced failure visible; retry no duplicates; API schema parity. |
| `01-07` | discovery-llms-sitemap-robots | `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, headers, source hash/readback, prompt-injection handling. | valid/degraded/suppressed manifests; dead-link test; no `.well-known`/MCP/OpenAPI/API-key/payment/callable overclaim; header tests. |
| `01-08` | gate-suite-review-alpha-readiness | Full local command suite, claims register, funnel/activation queries, Matt Pocock Standards/Spec review prep, Fable closeout mapping. | all local commands green; review findings fixed/recorded separately; five-friendly-owner internal-alpha evidence, or one-owner rehearsal explicitly marked not alpha-ready. |
| `01-09` | deploy-readback-closeout | Vercel/Convex/Clerk deployment/readback smoke, route HTTP smoke, admin denial, Search Console/Bing if domain exists, AI visibility baseline when public. | preview/live behavior matches local tests; no P0 gaps; GTM internal-alpha gate green. |

Do not split by horizontal UI/backend layers once the substrate exists; each later slice should strengthen one visible spine link and leave its gates green. [CITED: `.planning/ROADMAP.md`, `.planning/ENGINEERING-STANDARDS.md`]

## Hard Non-Goals

The planner must explicitly reject these in every implementation slice:

```text
chat, owner inbox, customer messaging, notifications, owner reply flows
payments, Stripe, x402, wallet, credits, billing, settlement, payment handlers, price fields
protected actions, callable tools, booking/orders, propose/approve/execute gateway, receipts, reversals
skills, request market, experts, hosted agents, voice, persona, marketplace, rankings, benchmarks
API keys, MCP, OpenAPI action/service descriptors, SDK/CLI/plugin surfaces, developer platform docs
business-origin /.well-known/ucp or standard merchant-origin UCP claims
ABN/ABR verification as T0 publish gate
server-side fetch of owner-supplied provider URLs
broad public launch, paid ads, Product Hunt/developer/protocol launch
backup folder imports, copied backup runtime folders, phase-numbered runtime names
```

Allowed mentions are limited to `.planning` future-gate prose and tests that assert absence. [CITED: `01-SPEC.md`, `.planning/SOURCE-MINING.md`, `.planning/ROADMAP.md`, `.planning/AI-SPEC.md`]

## Exact Gates

### Gate before any public exposure

- Source-mining/import/copy/TS/UI guardrails exist and pass clean source/fail bad fixtures.
- Convex schema/state/validators/indexes exist and pass type/codegen checks.
- Admin membership, suppression, audit, operator controls, and repair action dispatch exist.
- `isPubliclyDiscoverable` is shared by every public output.

### Gate before discovery routes

- Public catalog DTO is allowlisted and source-owned.
- Registry projection attempts/readbacks are durable.
- Discovery manifest attempts/readbacks are durable.
- Every advertised public URL route-tests or is omitted.
- Prompt-injection fixture is inert.
- Banned protocol/payment/callable/output scan passes.

### Gate before closeout

- Full local command suite green.
- Deployment/readback smoke covers `/`, `/claim`, `/registry`, `/api/businesses`, `/api/businesses/search?q=`, `/api/businesses/{slug}`, `/{slug}`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`, `/admin/*` non-admin denial, cache/content-type/CORS headers.
- `/mattpocock-review` runs with Standards and Spec axes separate; findings fixed or recorded.
- Fable 5 closeout mapping shows every accepted finding implemented or explicitly rejected with reason/source.
- GTM internal-founder alpha evidence exists: friendly-owner attempts, activation-state rows, friction/failure notes, no unresolved P0 claim/publish/index/security/copy/discovery gaps.

[CITED: `.planning/ENGINEERING-STANDARDS.md`, `.planning/phases/01-ten-star-spine-foundation/PHASE.md`, `.planning/GTM-READINESS.md`, `FABLE-5-FOUNDATION-REVIEW.md`]

## Planning Risks

| Risk | Why it will happen | Planning mitigation |
|---|---|---|
| Backup coupling sneaks in under source-mining | Backup has useful code but wrong seams and future surfaces. | First slice guardrails; every adapted invariant cites ledger row and fresh seam test; no direct import/copy. |
| Public page ships before repair/admin substrate | UI is tempting and looks shippable before operator controls exist. | Plan admin/suppression/audit/operator controls before public discovery; public route gates reference `isPubliclyDiscoverable`. |
| `PublicCatalogDto` fragments across routes | Page/API/UCP/SEO have different shape pressures. | Catalog owns DTO and explicit subsets; route tests compare schema parity. |
| Negative flags get banned accidentally | Copy scans may over-match `callable: false`/`paymentRequired: false`. | Scanner allowlist only approved DTO/schema/test contexts; fail truthy/executable/payment-positive claims. |
| Idempotency becomes UI debounce | Double-click looks solved but projection/audit side effects duplicate. | Operation keys reserve/replay/reject same-key-different-body in durable state before publish/projection. |
| Admin authority becomes Clerk/env-only | Clerk makes route gating easy. | `requireAdmin` reads source-owned membership; route guard is UX only; env/session-only denial test. |
| Suppression leaks via cache/discovery | Page, API, sitemap, llms, UCP may cache separately. | One eligibility predicate plus warm-cache suppression E2E; sourceHash/suppressedAt/no-store cache policy. |
| UI design system becomes route-local CSS | Runtime scaffold pressure leads to quick shadcn defaults. | `tokens.css`, AE shells, status mapper, and `test:ui-contract` before second route. |
| GTM claims outrun product | Agentic.Market/x402 language sounds compelling. | Claims register scan across routes/discovery/marketing assets; broad launch blocked until internal alpha. |
| Planner over-scopes Phase 2+ | Roadmap has attractive later phases. | Every slice states non-goals and bloat cuts; source/copy/import scans reject future-surface identifiers. |

## Sources Used

### Primary authority docs

- `.codex/agents/gsd-phase-researcher.md` — research output expectations, validation/security/package provenance expectations.
- `.planning/phases/01-ten-star-spine-foundation/01-SPEC.md` — locked requirements, acceptance, boundaries.
- `.planning/phases/01-ten-star-spine-foundation/01-CONTEXT.md` — implementation decisions, canonical refs, PR renumbering, module boundaries.
- `.planning/phases/01-ten-star-spine-foundation/FABLE-5-FOUNDATION-REVIEW.md` — accepted Fable 5 platform/deep-module/security/AI/GTM decisions and must-not-regress checks.
- `.planning/phases/01-ten-star-spine-foundation/01-UI-SPEC.md` — UI route map, states, copy, component, a11y, verification contract.
- `.planning/FRONTEND-DESIGN-FRAMEWORK.md` — UI architecture, deep UI seams, token/class/product-design gates, first frontend slice.
- `DESIGN.md` and `.impeccable/design.json` — Civic Signal Board visual seed and sidecar.
- `.planning/PROJECT.md` — ICP, system boundary, module ownership, state contracts, durable model, public interfaces, done definition.
- `.planning/ENGINEERING-STANDARDS.md` — TypeScript/Convex/route/audit/admin/source-mining/testing standards.
- `.planning/SOURCE-MINING.md` and `.planning/source-mining/phase-1-ledger.md` — backup source-mining contract, keep/cut ledger, banned scan seed.
- `.planning/SECURITY-SPEC.md` — threat model, admin model, audit union, allowlists, CSRF, prompt-injection, redaction.
- `.planning/AI-SPEC.md` — AE-hosted UCP fallback, public JSON catalog, discovery state, unsupported capability rules.
- `.planning/SEO-AEO-SPEC.md` — public SEO, sitemap/robots/llms/schema, measurement gates.
- `.planning/GTM-READINESS.md` — launch stages, activation definition, funnel events, claims register, kill rules.
- `.planning/AGENTIC-MARKET-STUDY.md` — registry/API/list/search/detail/llms analogy and x402/payment/callable rejection.
- `.planning/ROADMAP.md` and `.planning/STATE.md` — phase graph, scope cuts, current execution state.
- `.planning/phases/01-ten-star-spine-foundation/PHASE.md` and `PREMORTEM.md` — historical master PR sequence, no-launch gates, kill-switches, repair loops.

### Backup source-mine evidence read

- `../Agentic-Economy-Backup/convex/claimPublishing.ts` — claim/publish evidence and traps.
- `../Agentic-Economy-Backup/src/lib/registry/README.md` — old SQCT spine flow and source-of-truth notes.
- `../Agentic-Economy-Backup/src/lib/registry/directory/registryData.ts` and `registryProjection.ts` — source lookup/projection shape.
- `../Agentic-Economy-Backup/src/lib/search/meilisearch.ts` — search health and best-effort sync trap.
- `../Agentic-Economy-Backup/src/lib/registry/discovery/ucpManifest.ts` and `../Agentic-Economy-Backup/src/routes/$slug.ucp.ts` — manifest/header behavior and payment/MCP/OpenAPI traps.
- `../Agentic-Economy-Backup/src/lib/registry/lifecycle/types.ts` and `README.md` — lifecycle descriptor primitives and proof-gap posture.
- `../Agentic-Economy-Backup/convex/adminMemberships.ts` and `convex/adminGuards.ts` — admin membership evidence and env/backend-authority traps.
- `../Agentic-Economy-Backup/tests/seo/discovery-files.test.ts` and `src/lib/seo/localBusiness.ts` — sitemap/robots/llms/schema/JSON-LD evidence and cuts.

## Metadata

**Research confidence breakdown:**

- Current repo/runtime state: HIGH — directly observed with `glob` and `read`.
- Phase requirements and scope: HIGH — locked in `01-SPEC.md`, `01-CONTEXT.md`, and authority docs.
- Source-mine keep/cut translation: HIGH — ledger plus named backup line ranges were read.
- Architecture/module seams: HIGH — derived from `PROJECT.md`, `ENGINEERING-STANDARDS.md`, Fable 5 decisions, and codebase-design skill.
- Package names/versions: MEDIUM — stack is repo-authoritative, but exact npm versions/package legitimacy must be verified in `01-01` before install.

**Valid until:** 2026-07-27, or earlier if runtime scaffold/package choices are committed.
