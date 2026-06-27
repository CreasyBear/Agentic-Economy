# Agentic Economy — Fresh Repo Engineering Charter

**Status:** root authority for implementation.
**Audience:** senior engineer building the system.
**Not:** product brochure, investor memo, marketplace deck, protocol explainer.

## Launch ICP and problem

**ICP:** owner/operator or admin of an Australian urgent/local service business, starting with emergency plumbing/electrical/trades.

**Not ICP for Phase 1:** builders, agent developers, marketplaces, enterprise platforms, consumers, generic directories, payment providers, or protocol hobbyists.

**Problem:** these businesses are losing high-intent demand before they see it because search and assistants cannot tell whether the business is reachable, credible, and what safe first request can start.

**Phase 1 product contract:** one controlled public business service catalog. The owner can claim without ABN, publish truthful services and non-callable first-request capabilities, see page/index/discovery health per business and service, and expose machine-readable discovery without implying bookings, payments, actions, or verification.

**Wedge:**

claim -> publish services -> public business service catalog page/registry/discovery -> see service and discovery health

## Fresh repo decision

`Agentic-Economy-Backup` is not the base branch. It is a source mine.

Phase 35 proved:

- the SQCT/registry spine is real,
- lifecycle primitives are the moat,
- publish-to-index gaps need visible readback,
- six of seven deferred surfaces were spine-woven,
- pruning in place would preserve coupling under new names.

Fresh repo rule:

```text
copy invariants, not folders
copy tests only after rewriting against fresh seams
copy no runtime code without a source-mining ledger row
```

See `SOURCE-MINING.md`.

## Product ideas reduced to engineering invariants

| Product idea | Engineering invariant |
|---|---|
| Business-owned front door | A published business has one public slug controlled by source-owned owner binding. |
| Claim before verification | ABN/ABR is optional and never gates T0 publish. |
| Truthful first request | `services[]` is non-empty at publish; each service owns service area, contact/no-contact reason, hours/unknown, and per-service `firstRequestMode`. |
| Discoverability | Public page, registry/search, public JSON catalog, UCP, llms, and sitemap are generated projections from the same catalog state. |
| Honest trust | Copy/badges derive only from `publicStatus`, `trustTier`, `indexStatus`, `discoveryStatus`, per-service capability status, and source evidence. |
| Operator confidence | Every claim/publish/service/index/discovery/suppression failure has status, audit, and repair/readback. |
| Future money-safe | IDs, idempotency keys, append-only audit, authority seams, and redacted readbacks exist before payment code. |

## External registry analogue

Agentic.Market/Bazaar is the comparison set for registry shape, not for payments. Copy the boring parts:

```text
source-owned service metadata -> public business service catalog page -> list/search/detail JSON -> llms/SKILL-style guidance -> sitemap/robots/schema -> validation/readback
```

Do not copy x402, wallet, settlement, API keys, MCP/OpenAPI action catalogs, usage ranking, or callable endpoint claims into Phase 1. See `AGENTIC-MARKET-STUDY.md`.

## Anti-positioning

AE Phase 1 is not:

- a marketplace,
- a booking system,
- a payment system,
- an ABN/ABR registry,
- a protocol product,
- a developer platform,
- proof of customer demand,
- standard merchant-origin UCP unless the merchant origin serves it,
- autonomous agents,
- hosted agents,
- skills/request market,
- voice runtime,
- wallet/credits.

Owner-facing copy must not lead with:

```text
SQCT
router
UCP
MCP
llms
manifest
lifecycle
callable
agent-native
wallet
marketplace
request market
verified
```

Owner-facing copy may say:

```text
claimed/unclaimed
reachable/unreachable
inquiry/quote request available or unavailable
indexed/not indexed
discovery available/degraded/unavailable
verification not supplied
```

## Required authority specs

Implementation must follow:

- `ENGINEERING-STANDARDS.md`
- `SOURCE-MINING.md`
- `SECURITY-SPEC.md`
- `AGENTIC-MARKET-STUDY.md`
- `AI-SPEC.md`
- `SEO-AEO-SPEC.md`
- `GTM-READINESS.md`
- `FRONTEND-DESIGN-FRAMEWORK.md`
- `../DESIGN.md`
- `../.impeccable/design.json`
- `phases/01-ten-star-spine-foundation/01-UI-SPEC.md`
- `phases/01-ten-star-spine-foundation/PHASE.md`

If these conflict, prefer the more specific spec for that domain and update the docs to remove drift.

## System boundary

```text
Browser/UI
  -> TanStack Start route/createServerFn
      -> Convex query/mutation/action
          -> owning module implementation
              -> projection/external adapter
                  -> public business service catalog page / public JSON catalog / registry / discovery / admin readback
```

Rules:

- Routes may use Clerk for redirect/session UX.
- Convex functions derive actor/admin authority from Convex auth/Clerk token state.
- Browser input never supplies `actor`, `ownerId`, `adminId`, or `claimedByOwnerId` as authority.
- Modules expose public seams; routes do not import provider SDKs or module internals.
- Planning files are never runtime state.

## Runtime module ownership

```text
apps/web/                    TanStack Start route adapters and UI only
convex/                      source of truth, indexes, auth-critical mutations
src/modules/business/         claim, owner binding, suppress, admin recovery, business identity
src/modules/catalog/          service inventory, first-request capabilities, public business catalog DTO
src/modules/registry/         registry projection, search sync, projection attempts, index health
src/modules/discovery/        UCP fallback, llms, sitemap, robots projections from catalog DTO
src/modules/lifecycle/        descriptor-only lifecycle primitive contract
src/modules/observability/    typed audit, redaction, operational gaps, operator controls
src/modules/security/         CSRF, rate limit, duplicate/abuse detection, dispute intake, admin authority
src/modules/seo/              public metadata/schema/canonical/noindex builders
```

Suppression belongs to `business` because it transitions `publicStatus`. `security` owns abuse inputs and authorization helpers.

## State contracts

Project-level states. Implement once. Do not restate variants differently elsewhere.

```ts
type ClaimStatus =
  | 'draft'
  | 'authenticated'
  | 'published'
  | 'contested'
  | 'disputed'
  | 'suppressed'

type PublicStatus =
  | 'unpublished'
  | 'published'
  | 'suppressed'

type TrustTier =
  | 'claimed'
  | 'contact_confirmed'
  | 'listed'
  | 'registry_verified'

type IndexStatus =
  | 'not_queued'
  | 'queued'
  | 'indexed'
  | 'failed'
  | 'stale'

type DiscoveryStatus =
  | 'unavailable'
  | 'degraded'
  | 'available'
  | 'stale'

type FirstRequestMode =
  | 'inquiry_available'
  | 'quote_request_available'
  | 'not_available_yet'

type PublicFirstRequestDisclosure = {
  mode: FirstRequestMode
  publicDisclosure: string
  publicChannel: 'public_business_contact' | 'ae_status_only' | 'not_available'
  noContactReason?: string
  rawContactExcluded: true
}

type ServiceCapabilityStatus =
  | 'available'
  | 'degraded'
  | 'unavailable'
  | 'stale'

type CapabilityKind =
  | 'phone_inquiry'
  | 'quote_request'
  | 'emergency_callout_interest'
  | 'ae_hosted_discovery'

type OperatorControlKey =
  | 'claims_enabled'
  | 'publish_enabled'
  | 'registry_enabled'
  | 'discovery_enabled'
  | 'public_copy_safe_mode'
```

Rules:

- `published` does not imply `indexed`.
- `claimed` does not imply registry verification.
- `available` discovery does not imply callable/payable.
- `available` service capability does not imply booking, payment, protected action, or automated response.
- Suppressed businesses, services, and capabilities are not page/search/sitemap/llms/UCP visible except as safe degraded owner/admin readback.
- No boolean state soup for these concepts.

## Lifecycle moat contract

Phase 1 carries the lifecycle moat as a descriptor-only contract.

Required primitives:

```text
held_money
external_authority
time_bound
proof_gap
```

At least one reference vertical descriptor must exist, but no workflow engine, protected action, booking, settlement, or physical-world proof claim ships in Phase 1.

## Minimal durable model

| Table | Owner | Purpose |
|---|---|---|
| `owners` | business | Clerk actor mapping, owner identity projection |
| `businesses` | business | canonical business record, owner binding, public/trust/lifecycle state |
| `businessContexts` | business | approved business-level public facts: category, suburb, ownerMessage, sourceRefs |
| `businessServices` | catalog | source-owned service rows: name, category, area, hours/unknown, sort order, public status |
| `serviceCapabilities` | catalog | per-service first-request capability rows: kind, status, explicit negative flags (`callable=false`, `paymentRequired=false`), safe first-request disclosure, reason, source hash |
| `claims` | business | claim lifecycle and submitted-fact hash |
| `operationKeys` | observability/business | idempotency for retryable mutations/projections |
| `registryProjectionItems` | registry | current public business/service registry item generated from catalog state |
| `registryProjectionAttempts` | registry | queued/succeeded/failed/stale projection attempts and retry data |
| `indexStatus` | registry | latest derived index status/readback for business and optional service/capability |
| `discoveryManifests` | discovery | generated catalog manifest metadata and status |
| `discoveryManifestAttempts` | discovery | manifest generation attempts/failures |
| `abuseRateLimitBuckets` | security | actor/IP/device/anonymous rate-limit state and expiry |
| `claimFingerprints` | security | keyed duplicate/impersonation fingerprints for claim abuse detection |
| `funnelEvents` | observability/GTM | privacy-safe activation and channel-attribution event stream |
| `ownerActivationState` | observability/GTM | derived owner activation milestones and current gate status |
| `auditEvents` | observability | typed append-only reconstruction events |
| `operatorControls` | observability/security | source-owned runtime kill-switches |
| `disputes` | security/business | owner/contention challenge path |
| `suppressionRules` | business/security | public visibility suppression record for business/service/capability |
| `adminMemberships` | security | source-owned admin authority |
| `adminMembershipAuditEvents` | security | admin grant/revoke/break-glass audit |

No money/action/request/skills/voice/agent runtime tables.

## Public module interfaces

Route-facing commands do not accept caller-supplied actor authority.

```ts
// business
claimBusiness(input: ClaimBusinessInput, opts: CommandOptions): Promise<ClaimBusinessResult>
suppressBusiness(input: SuppressBusinessInput, opts: CommandOptions): Promise<SuppressBusinessResult>

// catalog
publishBusinessCatalog(input: PublishBusinessCatalogInput, opts: CommandOptions): Promise<PublishBusinessCatalogResult>
getPublicBusinessCatalog(slug: Slug): Promise<GetPublicBusinessCatalogResult>
readCatalogHealth(businessId: BusinessId): Promise<CatalogHealthResult>

// registry
syncCatalogProjection(input: RegistrySyncInput, opts: CommandOptions): Promise<RegistrySyncResult>
retryRegistryProjection(input: RetryProjectionInput, opts: CommandOptions): Promise<RegistrySyncResult>
searchCatalog(query: RegistryQuery): Promise<RegistrySearchResult>
listPublicBusinessCatalog(input: RegistryListInput): Promise<RegistryListResult>
getPublicBusinessCatalogBySlug(slug: Slug): Promise<GetPublicBusinessCatalogResult>
getIndexStatus(input: IndexStatusQuery): Promise<IndexStatusResult>

// discovery
buildCatalogDiscoveryManifest(input: BuildManifestInput, opts: CommandOptions): Promise<DiscoveryManifestResult>
regenerateDiscoveryManifest(input: RegenerateManifestInput, opts: CommandOptions): Promise<DiscoveryManifestResult>
buildLlmsTxt(): Promise<string>
// security
rateLimitClaim(input: RateLimitInput): Promise<RateLimitResult>
detectDuplicateClaim(input: DuplicateClaimInput): Promise<DuplicateClaimResult>
assertCsrf(input: CsrfInput): Promise<CsrfResult>
openDispute(input: DisputeInput, opts: CommandOptions): Promise<DisputeResult>
requireAdmin(opts: CommandOptions): Promise<AdminActorResult>

// observability
emitAuditEvent(event: AuditEventInput): Promise<void>
recordFunnelEvent(event: FunnelEventInput): Promise<void>
readOwnerActivationState(query: ActivationQuery): Promise<OwnerActivationStateResult>
readOperationalGaps(query: OperationalGapQuery): Promise<OperationalGapResult>
readOperatorControls(): Promise<OperatorControlsResult>
```

`CommandOptions` may include idempotency key and correlation ID. Actor/admin is derived by the server/Convex boundary, not supplied by the browser.

## One-way door register

| Decision | Door | Why | Rollback |
|---|---|---|---|
| Fresh repo over backup | One-way | Avoid preserving coupling | Archive source mine only |
| Convex source of truth | One-way for Phase 1 | State/auth/audit consistency | Migration required |
| Slug ownership semantics | One-way once public | URLs and SEO durability | Redirect/reclaim workflow |
| Admin authority source-owned | One-way | Security/reconstruction | Migration required |
| Generated manifest authority | One-way | Prevent drift and overclaim | Regenerate from source |
| AE-hosted fallback wording | One-way for launch claims | Avoid false UCP standard claim | Copy + route migration later |
| UI wording/layout | Two-way | Easy copy/design iteration | Edit copy/components |
| Convex search vs external search | Two-way in Phase 1 | Can add adapter later | Projection adapter swap |

## Definition of Phase 1 done

A cold clone can prove:

```text
one launch-ICP business can claim without ABN;
publish writes source state, service catalog rows, audit, idempotency, and queued projection;
public business service catalog page renders workflow-critical service facts and unavailable capabilities;
owner/status UX exposes separate `publicStatus`, `indexStatus`, `discoveryStatus`, `trustTier`, service/capability status, `callable=false`, `paymentRequired=false`, and next action;
registry/search/API/discovery outputs are generated from eligible catalog source state;
index/discovery failures have business/service/capability readback and repair path;
suppression removes business/service/capability exposure from page/search/API/sitemap/llms/UCP;
admin and operator controls are source-owned;
SEO/AEO/GTM gates prevent false public claims;
no future-surface code or copy exists.
```
