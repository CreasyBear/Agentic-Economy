# Info Architecture — Schemas & Data-Flow Routes (source-ground walk)

> Walk of the maintained schemas, projections, routes, and invariants against the dirty working tree on 2026-08-08.
> Authority: Convex durable state and deterministic domain modules. Models, providers, imported documents, and browser
> input are observations/proposals until deterministic validation. Public and operator surfaces consume projections.
> Companion: `.planning/codebase/PROMPT-DATA-FLOW.md` owns prompt/model/tool/stream/evaluation flows; this map owns
> the information architecture, schemas, personas, routes, authority, and reachable gaps.

## 0. How to read this

- Every material claim names a current path and symbol (line numbers are re-checked against the dirty tree on 2026-08-08).
- `src/modules/**/public.ts` and the internal projection modules own domain/public shapes; route and action files are ports.
- `convex/*.ts` functions are the durable adapters. `convex/schema.ts` registers the in-domain table bundles.
- `ServiceDto.endpoints[]` is the canonical agent-native listing surface. `operationRef` is the executable operation identity.

---

## 1. Information architecture (four personas, one spine)

```
                                      ┌──────────────────────────────────────┐
                                      │ Convex durable source                 │
                                      │ 22 in-domain bundles                  │
                                      │ convex/schema.ts:26-49                │
                                      └──────────────┬───────────────────────┘
                                                     │
      buyer/public reads                             │ source writes/readbacks
  / → services + plan → /$slug → /$slug/inquiry       │ /claim → /owner/supply
  /t/new → /t/$threadId → /api/answer/turn             │ curated/admin admission
                                                     ▼
                        deterministic projections, gates, and evidence
```

Personas and current entry points:

- **Buyer/customer**: `/` (`src/routes/index.tsx`), `/$slug` and `/$slug/inquiry`
  (`src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`), plus `/t/new` and `/t/$threadId`
  (`src/routes/t.new.tsx`, `src/routes/t.$threadId.tsx`).
- **Owner/supplier**: `/claim` and `/claim/form` (`src/routes/claim.tsx`, `src/routes/claim.form.tsx`),
  then `/owner/supply` (`src/routes/_operator/owner.supply.tsx`).
- **Developer**: `/developers/discovery` (`src/routes/_operator/developers.discovery.tsx`) for
  source-owned read-only catalog facts and machine-readable artifacts.
- **Admin/support/reviewer**: `/_operator/*` (`src/routes/_operator.tsx`) with surface-specific
  membership/action gates, not a blanket role gate.
- **One spine**: business/business-context + catalog rows → capability-derived
  `BusinessSupplyProjection` snapshot → public business DTO → canonical `ServiceDto`/`endpoints[]`;
  admitted operation execution and inquiry/customer-request writes remain separate controlled paths.

---

## 2. Schema inventory

### 2.1 Customer-request engine and plan

- `ServerCapabilityDescriptor`, `ResolvedCapabilitySelection`, and `bindCustomerCapabilityDescriptor`
  (`src/modules/customer-request/semantic-interpreter.ts:617-718`) expose registry search vocabulary,
  `operationRef`, contract refs, input bindings, and teaching examples; they do not grant authority.
- `RequestGraph`/`RequestGraphUnavailable` and compile/replay result types
  (`src/modules/customer-request/application/interpret-compile/types.ts`) carry the deterministic
  graph, bindings, mappings, snapshot digest, and replay facts.
- `RequestEligibility` and `CapabilityDomain`
  (`src/modules/customer-request/application/interpret-compile/eligibility.ts`,
  `capability-domain.ts`) are the hostile/greenfield/no-candidate and crypto/fiat/none gates.
- `PreviewCustomerRequestInput`, preview steps/results, `MAX_PREVIEW_STEPS=32`, and
  `MAX_PREVIEW_OPTIONS=64` (`src/modules/customer-request/application/interpret-compile/preview.ts:1-190`)
  are inspect-only, expiring, `authority: 'inspect_only'` outputs.
- `ConsumerPlan`, `ConsumerPlanOption`, `ConsumerPlanResult`, decision records, next actions, and
  `projectConsumerPlan` (`src/modules/customer-request/application/consumer-plan-projection.ts:1-193`)
  rehydrate options from the same services page; `MAX_PLAN_BYTES=120_000` is a separate cap.
- Route authority is `RouteMandate`/steps/principals/authorization and compile/verify results
  (`src/modules/customer-request/application/route-mandate.ts`); durable V2 and route-mandate tables
  are composed by `src/modules/customer-request/internal/convex-schema.ts:239-286`.

### 2.2 Business, catalog, registry, and canonical Service DTOs

- `PublicOfferingAccessPathDto`, `PublicOfferingDto`, `PublicBusinessCatalogApiV2Dto`,
  page/search/detail results (`src/modules/registry/internal/offering-api-projection.ts:10-87`)
  are the public business/catalog wire shapes. `projectBusinessSupplyToPublicApi` at `:96-173`
  derives access paths, support/readiness, trust, photos, disposition, and access summary.
- Catalog prices are `OfferingPrice` (`src/modules/catalog/internal/offering-price.ts:10-128`):
  fixed/from/range/quote_only, with exact `{currency, units, exponent}` amounts and unit/tax terms;
  the old `amountMinor`/`maximumAmountMinor` description is not current.
- `BusinessSupplyProjection` and `PublicOfferingSupplyProjection`
  (`src/modules/catalog/internal/offering-supply.ts:105-137`) are rebuilt from business/context/catalog
  rows by `convex/capabilitySupplyProjection.ts:36-145`; snapshots are stored in
  `businessSupplyProjectionSnapshots` (`src/modules/catalog/internal/schema.ts:140-211`).
- Canonical agent-native types are `ServiceEndpointPricingDto`, `ServiceEndpointDto`,
  `ServicePriceSummaryDto`, `ServiceDto`, and `ServiceOfferingDto`
  (`src/modules/registry/internal/service-projection.ts:24-113`). A service is one business with
  flat `endpoints[]`, `networks[]`, `integrationType`, optional `priceSummary`, and `ae.source`
  (`business_published` or `ae_sandbox`). Endpoint `ae` carries `operationRef?`, `offeringRef`,
  provenance, access, and settlement support.
- `PublicServicesApiSchemaVersion='public-services-api:v2'` and the single producer
  `projectServiceFromBusinessDto` (`src/modules/registry/internal/services-api-projection.ts:25-305`)
  join a service endpoint to an operation only on an exact, unambiguous offering operation-map link.
  Endpoint pricing/payment metadata is derived there; `networks[]` is sorted unique endpoint payment
  networks. Service price summaries aggregate only the available exact pricing facts.
- `toConsumerSupplyOption` (`src/modules/registry/public.ts:87-148`) copies `service.ae.source`
  into plan evidence and uses an open endpoint only for next-action selection. Provenance is no longer
  inferred from a quote endpoint.
- Registry action schemas mirror the public DTOs (`src/modules/registry/registry.actions.ts:129-343`);
  services list/search actions (`:549-665`) read the public business page, re-apply inquiry admission,
  read the capability operation map, then project the canonical services.

### 2.3 Durable schema root

- `convex/schema.ts:3-24,26-49` currently imports and spreads **22** bundles:
  actionInvocation, answerThread, business, catalog, capabilityContractRegistry, capabilitySupply,
  customerRequest, registry, routingKernel, demand, discovery, harness, inquiry, notificationOutbox,
  observability, security, money, settings, projectSpine, workTree, study, and externalRun.
- Key in-domain bundle declarations are `business/internal/schema.ts:13-75` (owners, businesses,
  contexts, claims), `catalog/internal/schema.ts:140-211` (four catalog/projection tables),
  `capability-supply/internal/convex-schema.ts:110-248`, `registry/internal/schema.ts:294-329`
  (four registry tables), `answer-thread/internal/convex-schema.ts:11-56`,
  `inquiries/internal/convex-schema.ts`, `notification-outbox/internal/schema.ts`,
  `money/internal/convex-schema.ts`, `security/internal/schema.ts`, and the customer-request
  V2/route-mandate composition above. The root count is 22 bundle spreads, not 23.
- Public catalog reads come from `convex/registry.ts:130-219`, which reads published,
  unsuppressed `businessSupplyProjectionSnapshots`; registry projection/search tables are read
  models, not an alternate public authority.

### 2.4 Capability admission, operation registry, and execution

- Supply funnel contracts (`src/modules/capability-supply/supply-funnel.functions.ts:17-175`) are
  `SupplyFunnelStep`, step state/refusal, draft/readback, call-log/liquidity, pricing result, and
  `SupplyPublicationAdmission`. The owner funnel is intentionally a bounded demo boundary.
- Import/admission contracts and source kinds (`src/modules/capability-supply/internal/publication-importers.ts`)
  support `ae_envelope`, `openapi_http`, `mcp`, and `x402`; normalization/dereferencing precedes
  `defineCapabilityContract` (`src/modules/capability-contract/public.ts:9-21,106-342`) and
  publication admission (`src/modules/capability-supply/internal/publication/{admit,draft,publish}.ts`).
- `PublicOperationRef` and `createPublicOperationRef`
  (`src/modules/capability-supply/public.ts:10-35`) produce opaque `operation:v1:<64hex>` identities.
  `PublicOperationDescriptor`, operation search/detail/compare/inspect, and
  `CatalogOfferingOperationMapEntry` (`src/modules/capability-supply/operation-projection.ts:9-109`)
  preserve parameters, `catalogPrice`, origin, and network.
- `convex/capabilitySupplyOperations.ts:99-160,292-456,571-650,708-748` validates and reads
  current routeable operations, recomputes the operation ref, and builds the offeringRef-keyed map
  only for exact admitted/integrated catalog-origin links.
- Generic keyless execution is `operation.execute`
  (`src/modules/capability-execution/operation-execute.functions.ts:1-305`,
  `operation-execute.actions.ts:13-140`). It reads the DB descriptor by operationRef, validates
  caller input against the DB contract, constructs one bounded HTTP request, and returns a
  validated result/evidence or refusal; it does not hand-register providers.

### 2.5 Inquiry and notification outbox

- `R1TargetAdmission`, `PublicInquiryAffordance`, target selection, availability, supply projection,
  validation, submission, and receipt types/functions live in `src/modules/inquiries/route-readbacks.ts`
  and `src/modules/inquiries/public.ts`.
- `projectCurrentOfferingInquiryAvailability/Page/Detail` (`src/modules/registry/public-inquiry-projection.ts:62-179`)
  re-checks source admission on every read and removes only unadmitted `human_request/ae_inquiry`
  paths; phone, website, and external-operation paths are untouched.
- Inquiry/thread, governed-send, and notification delivery state are durable in
  `src/modules/inquiries/internal/convex-schema.ts` and `src/modules/notification-outbox/internal/schema.ts`;
  owner views are refs/status/readbacks rather than raw customer data.

### 2.6 Answer, thread, and evidence artifacts

- `AnswerEvent`, `AnswerSnapshot`, `AnswerSource`, work steps, plans, artifacts, and artifact
  discriminators (`src/modules/answer/answer-synthesizer.ts:61-160`,
  `src/modules/answer/answer-schema.ts:14-122,175-195`) define the answer projection.
- Thread records, turn/tool-call records, statuses, timing, harness summaries, and frozen evidence
  (`src/modules/answer-thread/answer-thread.schema.ts:16-249`) are persisted by
  `src/modules/answer-thread/internal/convex-schema.ts:11-56`; `FrozenTurnEvidence` is the private
  evidence boundary and `FrozenTurnProse` is the public answer payload.
- `buildPublicThreadProjection` (`src/modules/answer-thread/internal/public-projection.ts`)
  redacts private evidence before `getPublicThreadProjection` is served by
  `convex/answerThreads.ts:591-650`. The SSE wire is `ANSWER_TURN_DATA_PART`/
  `AnswerTurnFrame` (`src/modules/answer/answer-ui-stream.ts`).

### 2.7 Money and governed action

- Exact pricing and refusals are `PricingConfig`, `PricingResolution`, `MoneyRefusalCode`, and
  `ExactAmount` (`src/modules/money/public.ts:1-80`, `src/modules/money/internal/exact-amount.ts`);
  money accounts, append-only entries, transactions, usage/free-tier records, topups, payouts,
  and Stripe events are bundled in `src/modules/money/internal/convex-schema.ts`.
- `MoneyInvocationPort` (`src/modules/money/public.ts:225-235`) is consumed by
  `src/modules/action-invocation/dynamic-published-adapter.ts:280-457`. Durable authorization,
  price reconstruction, idempotency, CAS, debit/payout/rake writes, unknown-outcome reconciliation,
  refunds, and payout release are in `convex/moneyLedger.ts:174-278,334-360,522-560`.
- The action registry is the single dispatch surface (`src/modules/actions/index.ts:79-146`);
  governed-action encoding/verification is `src/modules/governed-action/public.ts`.

### 2.8 Operator, security, harness, and discovery

- Operator roles/nav and route options are `src/lib/operator/navigation.ts` and
  `src/lib/operator/route-options.ts`; `src/routes/_operator.tsx` applies the sign-in shell gate.
- Admin action/readback authority is `src/modules/security/internal/admin-authority.ts` and
  `admin-readbacks.ts`; `readAdminRouteShell` yields redacted `kind:denied|allowed` rows.
  Convex surfaces `readAdminClaims`, `readAdminAuditEvents`, and `readAdminIndexHealth`
  (`convex/security.ts:402-418`) through `readAdminRows` (`:706-755`), which checks active
  membership before reading bounded source rows.
- Developer discovery is read-only (`src/routes/_operator/developers.discovery.tsx:12-23`,
  `src/modules/discovery/developer-discovery.ts`); run evidence is admin-only through
  `src/modules/harness/run-viewer.functions.ts`.

---

## 3. DATA-FLOW ROUTES (every numbered journey)

### J1 — Buyer Ask → shortlist → detail/inquiry

**R1 Ask → services + plan (parallel read tracks):** `/` search validation and loader
(`src/routes/index.tsx:70-96,143`) call `loadOneViewReadback` (`:104`), which runs registry service
search and `customerRequestPlanPreviewAction` in parallel. Registry search is
`src/modules/registry/registry.actions.ts:549-665` → public business read → inquiry admission →
`projectServiceFromBusinessDto`. Plan preview is `src/modules/customer-request/application/plan-preview.actions.ts`
→ `convex/customerRequestApplication.ts` → `previewCustomerRequest` with descriptor discovery,
proposal/compile recovery, bounded options, expiry, and honest unavailable/needs-information output.
The page projects the result through `projectConsumerPlan` and renders `AeServiceList`/
`AeConsumerPlan` (`src/routes/index.tsx:171`, `src/components/ae/listing/AeServiceList.tsx`,
`src/components/ae/plan/AeConsumerPlan.tsx`).

**R2 refine:** `AeConsumerPlan` needs-information output navigates back to `/?q=...`
(`src/components/ae/plan/AeConsumerPlan.tsx:58-116`), re-running R1.

**R3 detail:** a service row links to `/$slug`; the open endpoint CTA is an executable/quote
next action, while “business details” uses the public business DTO.

### J2 — Business listing + inquiry

**R4 catalog projection:** catalog writes (`convex/catalog.ts`) and business/context rows are
rebuilt into `BusinessSupplyProjection` (`convex/capabilitySupplyProjection.ts:36-145`);
`convex/registry.ts:130-219` reads published, unsuppressed snapshots and returns
`PublicBusinessCatalogApiV2Dto`.

**R5 API/read ports:** `src/modules/registry/registry.functions.ts` and
`registry.actions.ts` expose list/search/services/detail; `/api/businesses*` and
`/api/v1/services*` (`src/routes/api.businesses.ts`, `api.businesses.search.ts`,
`api.businesses.$slug.ts`, `api.v1.services.ts`, `api.v1.services.search.ts`) use the same
projection/admission path and RFC 9457 error helper where boundary errors are mapped.

**R6 detail:** `src/modules/catalog/public-route.functions.ts:12-55` loads the public page and
registry detail, computes supply/inquiry/SEO, and `src/routes/$slug.tsx:24-50` renders
`AeProviderListingPage`. The detail badge currently passes `source="business_published"`
(`src/components/ae/listing/AeProviderListingPage.tsx:230-234`).

**R7 inquiry submit:** `/$slug/inquiry` reads `readPublicTargetAdmissionServer`, validates the
form, calls the inquiry route readback/submit path, and returns a receipt containing thread/access
references (`src/modules/inquiries/route-readbacks.ts`, `src/modules/inquiries/route-actions.ts`).

### J3 — Owner supply and capability admission

**R8 claim:** `/claim` → `/claim/form` → `submitOwnerClaimServer`
(`src/modules/catalog/owner-claim.functions.ts:132-151`) → durable business claim/catalog publish
(`:153-235`) → `/claim/success`.

**R9 owner funnel:** `/owner/supply` loader
(`src/routes/_operator/owner.supply.tsx:8-22`) reads `readOwnerSupplyFunnelServer`
(`src/modules/capability-supply/supply-funnel.functions.ts:117-146`) → Convex
`readOwnerSupplyFunnel`. Step mutations/actions are bounded by owner identity, business/offering/
revision, operationKey, and value schema. `advanceOwnerSupplyStep` currently returns completion
without persisting the arbitrary step value (`convex/capabilitySupplyOwnerFunnel.ts:227-243`).
`publishOwnerCapability` publishes the explicitly documented `ae-demo-services.quote`
AE-envelope template (`:246-303`), not the curated provider importer.

**R10 real admission:** curated/admin `admitCapabilityPublication`
(`convex/capabilitySupply.ts:697`) → `publication/admit.ts` → source normalization/import
(`publication-importers.ts`) → provider-schema/contract gates → `publish.ts`/`draft.ts` →
offering/binding/publication registration and readiness scheduling.

**R11 contract persistence:** `convex/capabilityContractDocuments.ts:36` stores immutable contract
documents; operation-key request hashes replay or refuse conflicts, and capability identity/version
dedupe prevents a second contract.

**R12 lifecycle/public projection:** readiness probe/scheduling/withdrawal in
`convex/capabilitySupply.ts` feed lifecycle and `capabilitySupplyProjection`; operation
search/detail/compare/inspect use `operation-projection.ts`. Curated publications are seeded by
`src/modules/capability-supply/curated-provider-publications.ts` and published through the same
durable supply seams.

### J4 — Agent thread, engine, execution, and money

**R13 SSE turn:** `/t/new` and `/t/$threadId` submit to `POST /api/answer/turn`
(`src/routes/api.answer.turn.ts:28-42,56-158`). Body, content type, rate, session/access, and
`x-ae-turn-key` idempotency are bounded before `streamAnswerTurn`
(`src/modules/answer-thread/internal/turn-orchestrator.ts:124`). Retrieval-first reads
registry operations or web discovery; finalization validates allowed slugs/checksums, emits typed
events, and persists answer/thread evidence.

**R14 thread readback:** `/t/$threadId` → `readThreadRouteServer`
(`src/routes/t.$threadId.tsx`) → `getPublicThreadProjection` → redacting
`buildPublicThreadProjection` → `AeChat`.

**R15 separate plan producer:** customer-request preview (R1) produces `ConsumerPlanResult`;
the answer artifact union mentions `consumer-plan`, but plan preview remains the current live
producer.

**R16 confirm/run:** `customerRequestConfirmAction`/`customerRequestRunAction`
(`src/modules/customer-request/customer-request.actions.ts`) call
`customerRequestApplication:confirmRoute/runRoute` (`convex/customerRequestApplication.ts`),
then route execution/transport worker opens dispatch, checks mandate expiry/target safety,
marks release, authorizes x402 when required, and records an outcome
(`convex/customerRequestRouteTransportWorker.ts`).

**R17 paid charge:** dynamic-published action `preReleaseCheck`
(`src/modules/action-invocation/dynamic-published-adapter.ts:280-457`) calls
`moneyPort.authorizeInvocationCharge`; `convex/moneyLedger.ts:174-278` reconstructs published price,
checks exact amount/currency/authority/account version, replays by idempotency, and atomically
records operator debit, provider accrual, and AE rake. Topup, payout release, refund, and
outcome-unknown reconciliation are separate ledger commands.

### J5 — Operator/security

**R18 shell and authorization:** `src/routes/_operator.tsx` runs
`requireOperatorBeforeLoad`; each admin surface calls a source query and Convex
`requireAdminAuthority`/`readCurrentActiveMembership`, rather than trusting a route role string.

**R19 readbacks:** admin server adapters
(`src/modules/security/admin-readback.functions.ts:22-99`) call the three Convex admin queries;
`readAdminRows` (`convex/security.ts:706-755`) checks membership, bounds source reads, and returns
redacted rows. `/developers/discovery` is sign-in/read-only content and intentionally does not use
admin membership.

---

## 4. Authority, provenance, redaction, idempotency, and evidence invariants

- **Durable authority:** `convex/schema.ts:26-49` is the registered schema root; durable reads/writes
  go through Convex functions, while domain modules perform deterministic validation/projection.
- **Actor before effect:** admin authority (`security/internal/admin-authority.ts`), owner
  ownership (`convex/capabilitySupplyOwnerFunnel.ts:231-258`), and Convex identity checks precede
  claim, publication, inquiry, execution, and money mutations.
- **Model non-authority:** capability discovery and model proposals select from a deterministic
  registry graph; they cannot invent providers, operationRefs, prices, routes, effects, approvals,
  payment, or terminal evidence.
- **Operation identity:** only `createPublicOperationRef` creates public refs; every read/execute path
  recomputes the opaque operation:v1 digest from operation/publication/revision/contract material.
- **Origin and join:** service endpoint `operationRef`, parameters, pricing, and networks are
  injected only after the capability projection proves one exact catalog-offering origin/link.
- **Pricing/networks:** exact `{currency,units,exponent}` values are preserved; `Service.networks[]`
  is sorted unique payment-network data from endpoint pricing, not AE's internal partition id.
- **Provenance:** `ServiceDto.a.source` is projected by `services-api-projection.ts`; plan evidence
  copies it in `toConsumerSupplyOption`. Public detail's hardcoded badge is a separate UI limitation.
- **Redaction:** `projectBusinessSupplyToPublicApi`, inquiry admission projection,
  `buildPublicThreadProjection`, and admin readbacks expose DTOs/refs/hashes, not raw durable rows or
  private harness evidence.
- **Idempotency/replay:** operation keys and request hashes guard publication/contract writes;
  `x-ae-turn-key` guards answer turns; route commands, dispatch attempts, and money charges use
  operation/attempt/effect identity and replay-safe transitions.
- **Evidence ladder:** readiness/test/route outcomes, capability call events, money receipts, and
  frozen answer evidence are recorded before a claim is projected as source-owned/complete. A
  provider result is not completion evidence merely because a model described it.
- **HTTP boundary:** `src/lib/server/problem.ts:1-21` builds RFC 9457 `application/problem+json`
  responses from the shared problem model. Routes explicitly guard unsupported methods and map
  source failures; HTTP-200 domain outcomes/SSE/HTML remain separate contracts.

---

## 5. Reachable gaps and risks (source-proven on 2026-08-08)

- **Registry operation schema omission:** `src/modules/registry/operations.actions.ts:66-95`
  defines a `catalogPrice` schema but the descriptor output does not include it, while the canonical
  operation projection (`src/modules/capability-supply/operation-projection.ts:331-344`) does.
  The action wire declaration can therefore under-report a current price field.
- **Detail provenance mismatch:** `AeProviderListingPage` hardcodes `business_published`
  (`src/components/ae/listing/AeProviderListingPage.tsx:230-234`), while canonical services carry
  `ae.source`; a detail page cannot currently show sandbox provenance.
- **Owner funnel is deliberately not general admission:** `publishOwnerCapability`
  (`convex/capabilitySupplyOwnerFunnel.ts:246-303`) emits one static AE-envelope demo contract,
  and `advanceOwnerSupplyStep` (`:227-243`) does not persist arbitrary step values. The real
  OpenAPI/MCP/x402 importer is only the curated/admin path.
- **Provider earnings are bounded:** `convex/moneyLedger.ts:646-662` reads the newest 100 ledger
  rows and returns `truncated: rows.length === 100`; consumers must not treat a truncated response
  as a complete historical statement.
- **Answer consumer-plan artifact remains a separate seam:** the answer artifact allow-list names
  `consumer-plan`, while `buildArtifactsFromSnapshot` (`src/modules/answer/internal/snapshot-artifacts.ts`)
  does not construct that artifact; live plan data still comes from customer-request preview.
- **Public thread query contract is weaker than private thread queries:** `getPublicThreadProjection`
  accepts only `threadId` (`convex/answerThreads.ts:591-594`), unlike `getAnswerThread` and
  `getThreadTurns` which require `pseudonymousSessionId` (`:522-532,430-444`). The public route's
  private-record access-key path is the compensating boundary and should remain explicit.
- **Preview degradation:** `projectConsumerPlan` caps serialized plans at 120,000 bytes and
  `loadOneViewReadback` converts preview failures into an unavailable branch
  (`src/routes/index.tsx:104-113`); this is honest but does not distinguish every failure cause
  to the buyer.
- **RFC route audit remains necessary:** registry route parsing and action schema validation are
  split across `src/routes/api.businesses.ts:32-77` and `src/modules/registry/registry.actions.ts`;
  any parse thrown outside the shared `problem()` mapper can bypass the intended RFC 9457 envelope.

---

_Refreshed and anchor-checked against the dirty working tree on 2026-08-08. Source paths above are the
current authority; this map intentionally does not preserve disproven counts, DTO names, pricing
shapes, provenance rules, or route claims from earlier walks._
