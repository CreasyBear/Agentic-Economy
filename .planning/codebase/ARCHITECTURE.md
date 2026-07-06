# Architecture

**Analysis Date:** 2026-07-06

## System Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                          TanStack Start app shell                            │
│  `src/start.ts` → `src/router.tsx` → `src/routes/__root.tsx`                 │
├──────────────────────────┬──────────────────────────┬────────────────────────┤
│ Public human surfaces    │ Machine/HTTP surfaces    │ Operator surfaces      │
│ `/`, `/registry`,        │ `/api/businesses*`,      │ `/_operator` layout,   │
│ `/$slug`, `/$slug/inquiry│ `/api/agent/tools`,      │ `/owner*`, `/admin*`,  │
│ `/claim`, static pages   │ `/api/answer*`,          │ `/developers.discovery`│
│ `src/routes/*.tsx`       │ `/llms.txt`, `/$slug/ucp`│ `src/routes/_operator` │
└──────────────┬───────────┴──────────────┬───────────┴───────────────┬────────┘
               │                          │                           │
               ▼                          ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                    Route adapters and action contracts                       │
│  `src/modules/actions/index.ts`, `src/modules/common/action.ts`,             │
│  `src/modules/*/*.actions.ts`, `src/modules/*/*.functions.ts`                │
└───────────────────────────────┬──────────────────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Domain module seams                                 │
│  `src/modules/*/public.ts`, `src/modules/*/internal/*`, readbacks, DTOs,     │
│  source ports, route-facing server functions, validation, projection builders│
└──────────────┬───────────────────────────────┬───────────────────────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────────┐  ┌────────────────────────────────────────┐
│ Convex source-of-truth runtime   │  │ UI, answer, harness, observability     │
│ `src/lib/server/convex-source.ts`│  │ `src/components`, `src/modules/answer*`│
│ `convex/schema.ts`, `convex/*.ts`│  │ `src/modules/harness`, `src/lib/*`     │
└────────────────┬─────────────────┘  └────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Durable source state                                 │
│  Convex tables composed from module schema fragments in `convex/schema.ts`   │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Start middleware | Registers request middleware for observability, security headers, CSRF, source-write admission, and Clerk unless local E2E bypass is enabled. | `src/start.ts` |
| Root route | Defines the document shell, Astryx theme/link/layer providers, conditional Clerk provider, observability boot, error boundary, toaster, and global CSS. | `src/routes/__root.tsx` |
| Router | Creates the TanStack router from the generated route tree, default preload/pending/not-found behavior, view transitions, and scroll restoration. | `src/router.tsx` |
| Public route files | Own URL shape, loaders, metadata, server-function calls, and rendering composition for human routes. | `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/claim.tsx` |
| Operator route layout | Applies one shared auth boundary and shell to owner/admin/developer leaves; route leaves own role-specific readback and denial states. | `src/routes/_operator.tsx`, `src/routes/_operator/*`, `src/lib/operator/route-options.ts` |
| Action registry | Central registry for explicit operation contracts; registry membership is not the same as public quiet-agent exposure. | `src/modules/actions/index.ts` |
| Action model | Defines action surfaces (`ui`, `http`, `agentJson`, `agentTools`), read/write flags, boundaries, schemas, and execution context. | `src/modules/common/action.ts` |
| Harness tool projection | Filters registered actions into quiet-agent and answer-model tools; quiet public agent tools are `registry.search`, `registry.detail`, and `inquiry.submit`. | `src/modules/harness/tool-contract.ts` |
| Registry domain | Lists/searches public catalog facts and resolves published inquiry targets; it does not book, charge, dispatch, or send inquiries. | `src/modules/registry/public.ts`, `src/modules/registry/registry.functions.ts`, `convex/registry.ts` |
| Catalog/claim domain | Handles owner claim and publish source adapters, public catalog DTO/readback creation, and claim success/status route data. | `src/modules/catalog/public.ts`, `src/modules/catalog/owner-claim.functions.ts`, `convex/business.ts`, `convex/catalog.ts` |
| Inquiry domain | Handles qualified first-contact inquiry submission, customer receipt readback, owner inbox/thread operations, privacy tombstones, and operator reconstruction. | `src/modules/inquiries/public.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/route-readbacks.ts`, `convex/inquiries.ts` |
| Discovery domain | Builds assistant/crawler/developer artifacts from source-owned catalog/discovery state without merchant-origin or callable/payment overclaims. | `src/modules/discovery/public.ts`, `src/modules/discovery/discovery.functions.ts`, `convex/discovery.ts` |
| Answer/thread domains | Stream grounded answer turns, call only registered read tools for model answers, maintain answer-thread access, and gate final prose. | `src/modules/answer/public.ts`, `src/modules/answer-thread/public.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer/internal/answer-gate.ts` |
| Clearance and source admission | Resolve principal identity and signed write admission for assistant/public writes before Convex source mutations are attempted. | `src/modules/clearance/public.ts`, `src/modules/clearance/clearance.functions.ts`, `src/modules/security/source-write-admission.ts`, `src/lib/server/source-write-admission.ts`, `convex/sourceWriteAdmission.ts` |
| Security/admin domain | Owns CSRF/rate-limit/duplicate/dispute/admin readbacks and source-owned admin authority helpers. | `src/modules/security/public.ts`, `src/modules/security/admin-readback.functions.ts`, `convex/security.ts`, `convex/authz.ts` |
| Observability domain | Owns audit/funnel/operator-control/source-sync readbacks and redaction boundaries. | `src/modules/observability/public.ts`, `src/modules/observability/funnel.functions.ts`, `convex/observability.ts` |
| Capability/protected-action/business-action domains | Carry later-rung capability, protected-action, and receipt-backed business-action source/local seams; public posture remains proposal/source-local unless gates prove otherwise. | `src/modules/capabilities/public.ts`, `src/modules/protected-action/public.ts`, `src/modules/business-action/public.ts`, `convex/capabilities.ts`, `convex/protectedActions.ts`, `convex/businessActions.ts` |
| Billing domain | Owns owner/admin billing readbacks, test/provider evidence routes, and billing source state; live/public money claims remain gated. | `src/modules/billing/public.ts`, `src/modules/billing/billing.functions.ts`, `convex/billing.ts`, `convex/billingStore.ts` |
| Notification outbox | AE-owned notification source state; provider routes/adapters record redacted provider refs and do not become message truth. | `src/modules/notification-outbox/public.ts`, `src/lib/server/notification-provider.ts`, `convex/notificationOutbox.ts`, `src/routes/api.notification.*.ts` |
| UI composition | Renders public/operator/listing/inquiry/chat/harness UI with Astryx first and AE behavioral wrappers where already present. | `src/components/ae`, `src/components/astryx`, `src/components/ai-elements`, `src/styles/globals.css` |

## Pattern Overview

**Overall:** File-route adapters over domain-owned public seams, with Convex as durable source state and explicit action contracts for every operation that fans out to humans, HTTP, agent JSON, or quiet tools.

**Key Characteristics:**
- Keep route files in `src/routes` as adapters: validate search/body, call server functions or action handlers, choose shells, and render readbacks.
- Put domain behavior behind `src/modules/<domain>/public.ts` plus route/server adapters named `*.functions.ts`; keep private helpers under `src/modules/<domain>/internal`.
- Compose Convex schema centrally in `convex/schema.ts`, but keep table definitions owned by module fragments such as `src/modules/business/internal/schema.ts` and `src/modules/inquiries/internal/convex-schema.ts`.
- Treat Convex as source of truth through `src/lib/server/convex-source.ts`; public reads use public source clients, authenticated reads/writes use Clerk-derived Convex tokens.
- Mutating source writes require source-write admission from `src/lib/server/source-write-admission.ts` and Convex-side verification in `convex/sourceWriteAdmission.ts`.
- Declare reusable operations with `defineAction` in `src/modules/*/*.actions.ts`, register them explicitly in `src/modules/actions/index.ts`, and let harness filters decide quiet-agent/answer exposure.
- Preserve the product boundary everywhere: AE can publish, compare, summarize, route to next step, and send a qualified inquiry when listed; AE does not book, charge, dispatch, auto-fulfil, or imply live provider proof.

## Layers

**Surface Routing:**
- Purpose: Own URL shape, loaders, route handlers, search/body validation, route metadata, response headers, and shell choice.
- Location: `src/routes`, including public root routes, `_operator` pathless layout, API route files, and escaped artifact routes.
- Contains: `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/api.businesses.ts`, `src/routes/api.agent.tools.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`.
- Depends on: Domain seams/functions in `src/modules`, shells in `src/components/ae/layout`, and server helpers in `src/lib`.
- Used by: TanStack Start via generated `src/routeTree.gen.ts` and runtime `src/router.tsx`.

**UI Composition:**
- Purpose: Render public, owner, admin, developer, registry, listing, inquiry, chat, artifact, and feedback surfaces.
- Location: `src/components` and `src/styles`.
- Contains: AE route shells in `src/components/ae/layout`, listing UI in `src/components/ae/listing`, inquiry UI in `src/components/ae/inquiries`, chat UI in `src/components/ae/chat`, artifacts in `src/components/ae/artifacts`, Astryx adapters in `src/components/astryx`, and globals/tokens in `src/styles`.
- Depends on: Astryx components, domain DTO/readback types, `@/lib/ui/*` presentation helpers, and route data.
- Used by: `*.tsx` routes and owner/admin leaves.

**Action Contracts and Harness:**
- Purpose: Define reusable operation contracts and project them into UI/HTTP/agent JSON/quiet tool/harness surfaces with explicit boundaries.
- Location: `src/modules/common/action.ts`, `src/modules/actions/index.ts`, `src/modules/*/*.actions.ts`, `src/modules/harness`.
- Contains: Registry, inquiry, storefront, demand, settings, and business-action action definitions; harness tool descriptors and approval policies.
- Depends on: Zod schemas, module functions, and `ActionContext`.
- Used by: HTTP routes such as `src/routes/api.businesses*.ts`, quiet agent tools at `src/routes/api.agent.tools.ts`, answer tool execution, dev/eval harnesses, and tests.

**Domain Modules:**
- Purpose: Own business rules, DTOs, route readbacks, schemas, reducers, source ports, and public seams.
- Location: `src/modules`.
- Contains: `business`, `catalog`, `registry`, `discovery`, `inquiries`, `answer`, `answer-thread`, `harness`, `clearance`, `security`, `observability`, `settings`, `storefront`, `demand`, `capabilities`, `protected-action`, `business-action`, `billing`, `notification-outbox`, `lifecycle`, and `seo`.
- Depends on: `src/modules/common`, module-local internals, server helpers under `src/lib/server`, and Convex function references.
- Used by: Routes, actions, Convex wrappers, and tests.

**Server Function / Source Adapter Layer:**
- Purpose: Bridge TanStack server functions and route handlers to Convex queries/mutations/actions while hiding transport and local fixture fallbacks.
- Location: `src/modules/*/*.functions.ts`, `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/server/bounded-request-body.ts`, `src/lib/server/*provider.ts`.
- Contains: `createServerFn` handlers, source port implementations, authenticated/public Convex HTTP clients, source-write admission creation, webhook/provider helpers, and local E2E bypass checks.
- Depends on: Clerk server auth, Convex HTTP client, environment configuration, source-write admission, and provider SDK wrappers where applicable.
- Used by: Route loaders/actions, HTTP handlers, action runners, and owner/admin pages.

**Convex Runtime:**
- Purpose: Store durable state and execute source-owned reads/writes with validators, indexes, authz, and admission checks.
- Location: `convex`.
- Contains: Schema composition in `convex/schema.ts`, domain functions such as `convex/registry.ts`, `convex/business.ts`, `convex/catalog.ts`, `convex/inquiries.ts`, `convex/discovery.ts`, `convex/security.ts`, `convex/observability.ts`, `convex/answerThreads.ts`, `convex/billing.ts`, and generated files in `convex/_generated`.
- Depends on: Module-owned schema fragments under `src/modules/*/internal`, Convex validators, source-write admission, Clerk identity, and shared runtime helpers such as `convex/source_state.ts`.
- Used by: Source adapters in `src/lib/server/convex-source.ts` and Convex dev/codegen tooling.

**Discovery / SEO / Agent-Readable Outputs:**
- Purpose: Publish assistant-readable and crawler-readable artifacts derived from source-owned catalog/discovery state.
- Location: `src/modules/discovery`, `src/modules/seo`, `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, `src/routes/api.discovery.schema.ts`, `src/routes/api.discovery.examples.ts`, `src/routes/api.discovery.fixtures.ts`.
- Contains: Manifest builders, `llms.txt`, sitemap/robots routes, discovery schema/examples, and noindex/canonical helpers.
- Depends on: Registry/catalog source data and discovery Convex state.
- Used by: Search engines, assistants, integration tests, and developer discovery pages.

**Planning / Proof Posture:**
- Purpose: Constrain current implementation and public claims.
- Location: `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/scopes/SCOPE-EXECUTION-READINESS.md`, `.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md`, `.planning/source-mining/phase-1-ledger.md`.
- Contains: Phase/product boundaries, source-mining rules, active blockers, evidence gates, and posture caveats.
- Depends on: Current source verification; planning files are not runtime state.
- Used by: Future GSD planning/execution agents.

## Public, Private, and Source-Owned Surfaces

**Public human surfaces:**
- `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/claim.tsx`, `src/routes/claim.success.tsx`, `src/routes/about.tsx`, `src/routes/help.tsx`, `src/routes/privacy.tsx`, `src/routes/terms.tsx`, and `src/routes/privacy.remove-business.tsx` render human-facing public flows.
- Public shell/navigation lives in `src/components/ae/layout/AePublicShell.tsx`; public routes must avoid owner/admin jargon and internal protocol vocabulary.

**Machine-readable public surfaces:**
- `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, and `src/routes/api.businesses.$slug.ts` expose public catalog DTOs.
- `src/routes/api.agent.tools.ts` lists/invokes quiet agent tools; harness filtering limits quiet tools to `registry.search`, `registry.detail`, and `inquiry.submit`.
- `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, and discovery schema/example routes expose assistant/crawler/developer artifacts.

**Operator/private surfaces:**
- `src/routes/_operator.tsx` owns the pathless operator layout and shared auth admission; leaves in `src/routes/_operator` render owner, admin, and developer views.
- `src/lib/server/require-operator-session.ts` establishes signed-in status only; owner/admin authority must be resolved by source-owned readbacks/mutations, not by route presence alone.

**Provider/webhook/server-only surfaces:**
- `src/routes/api.notification.resend-webhook.ts`, `src/routes/api.notification.resend-dispatch.ts`, `src/routes/api.notification.novu-dispatch.ts`, `src/routes/api.billing.webhook.ts`, and `src/routes/api.business-actions.stripe-webhook.ts` are server route handlers that must verify signatures/secrets and persist redacted source evidence before any public/operator readback treats a provider event as source state.

**Fixture/demo surfaces:**
- `src/app`, `src/future-phases`, `tests/fixtures`, `tests/spike`, `examples/agent-experience`, and `eval/answer` are not primary product runtime surfaces. Treat them as prototypes, guardrail fixtures, spikes, or eval harnesses unless a route/module seam explicitly imports them.

## Data Flow

### Registry Search / Public Catalog Read

1. `/registry` is created in `src/routes/registry.tsx:63`; search params are validated and bounded in `src/routes/registry.tsx:64-70`.
2. The route loader calls `readRegistryRouteServer` at `src/routes/registry.tsx:53-61`, then `loadRegistryRouteReadback` chooses list vs search at `src/routes/registry.tsx:85-91`.
3. `src/modules/registry/registry.functions.ts:77-89` exposes route-facing list/search helpers; `src/modules/registry/registry.functions.ts:44-56` binds those helpers to Convex source query references.
4. `convex/registry.ts:207-294` owns list, search, detail, and inquiry-target source queries over published public catalog data.
5. Human UI renders the same readback in `src/routes/registry.tsx`; machine routes such as `src/routes/api.businesses.search.ts` use action/domain seams to expose public JSON.

### Public Business Detail / Inquiry Path

1. `src/routes/$slug.tsx` renders a public listing from registry/catalog readbacks; `src/routes/$slug.inquiry.tsx` renders the qualified inquiry route for a published business/service target.
2. The inquiry form submits through `submitPublicInquiryServer` at `src/modules/inquiries/inquiry.functions.ts:295-297`.
3. `submitPublicInquiryThroughSource` begins at `src/modules/inquiries/inquiry.functions.ts:325`; target resolution is isolated in `src/modules/inquiries/inquiry.functions.ts:397-432`.
4. Convex mutation references are bound at `src/modules/inquiries/inquiry.functions.ts:277-293`; `convex/inquiries.ts` persists the inquiry, thread, audit/funnel, delivery/outbox state, and owner readbacks.
5. The flow sends a human first-contact message for owner review only; it does not book, charge, dispatch, confirm availability, or auto-fulfil.

### Quiet Agent Tool Path

1. `src/routes/api.agent.tools.ts:36-43` owns the `/api/agent/tools` route.
2. `src/routes/api.agent.tools.ts:45-49` lists quiet tools via `filterQuietAgentToolContracts(buildHarnessToolContracts(listAgentToolActions()))`.
3. `src/modules/harness/tool-contract.ts:25-34` pins public quiet tool IDs and answer-model read tool IDs.
4. `src/modules/harness/tool-contract.ts:326-340` derives quiet/answer exposure from action surfaces plus the pinned allowlist, and `src/modules/harness/tool-contract.ts:343-386` assigns read/write approval policy.
5. `src/routes/api.agent.tools.ts:69-207` validates bounded JSON, action input, identity/admission, and executes the selected tool with boundaries intact.

### Answer Turn Path

1. `src/routes/api.answer.turn.ts:15-20` owns `POST /api/answer/turn`.
2. `src/routes/api.answer.turn.ts:25-43` resolves session, bounds request body to 16 KiB, parses JSON, and validates `answerTurnRequestSchema`.
3. `src/routes/api.answer.turn.ts:45-68` rate-limits and checks answer-thread access.
4. `src/routes/api.answer.turn.ts:71-118` streams through `streamAnswerTurn` and appends session cookies.
5. `src/modules/answer-thread/internal/turn-orchestrator.ts` coordinates retrieval/tool calls/finalization; answer model tool contracts are read-only registry tools per `src/modules/harness/tool-contract.ts:31-34`.

### Owner Claim / Publish / Catalog Projection Path

1. `src/routes/claim.tsx` and owner routes call server functions in `src/modules/catalog/owner-claim.functions.ts`.
2. Server functions validate owner-submitted facts and derive source-write admission through `src/lib/server/source-write-admission.ts` before source mutations.
3. `convex/business.ts` and `convex/catalog.ts` own source writes for businesses, claims, services, capabilities, audit, and publish state.
4. Registry/search/readback data is then derived through `src/modules/registry/registry.functions.ts` and `convex/registry.ts`; discovery artifacts are derived through `src/modules/discovery/discovery.functions.ts` and `convex/discovery.ts`.

### Operator Readback Path

1. `src/routes/_operator.tsx:7-10` creates the pathless operator layout with shared options.
2. `src/lib/operator/route-options.ts:17-21` applies `requireOperatorBeforeLoad` once for `/owner/*`, `/admin/*`, and `/developers/*`.
3. `src/lib/server/require-operator-session.ts:9-26` redirects unauthenticated visitors or returns a local E2E operator when bypass is enabled.
4. Leaf routes in `src/routes/_operator` call domain readbacks/mutations; owner/admin role denial belongs to source-owned readbacks and `convex/authz.ts`, not the layout guard alone.

### Discovery Artifact Path

1. Requests hit `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, or discovery API routes.
2. `src/modules/discovery/discovery.functions.ts` reads durable discovery state through Convex or controlled local fallbacks.
3. `src/modules/discovery/public.ts` shapes manifest/text/XML/schema output from source-owned catalog DTOs.
4. `convex/discovery.ts` serves discovery artifacts without private owner data or raw source hashes.

**State Management:**
- Durable state lives in Convex tables composed by `convex/schema.ts:21-39`.
- Route/server-function state is request-scoped; persistent writes must pass through source adapters and Convex mutations.
- Browser state is React-local for filters, forms, pending states, and presentation only.
- Local E2E bypass/fallbacks are explicit test/dev seams (`src/lib/server/local-e2e-bypass.ts`, source-port overrides in `*.functions.ts`) and must not become production authority.
- Planning files under `.planning` constrain work and claims; they are not runtime state.

## Authority Model

**Browser/client authority:**
- Browser input may select a public target (slug, service slug, query, cursor) or submit form content, but it must never provide actor/admin/owner identity as authority.
- `src/routes/__root.tsx:72-74` only decides when the Clerk provider is required for route families; actual write/read authority is still source-derived.

**Operator auth boundary:**
- `src/lib/server/require-operator-session.ts:28-36` establishes a signed-in operator session and redirects unauthenticated users.
- Owner/admin permissions are resolved by Convex authz and source-owned rows (`convex/authz.ts`, `convex/security.ts`, module readbacks), not by path prefix.

**Source-write authority:**
- `src/start.ts:50-58` installs `createSourceWriteAdmissionMiddleware` after CSRF and security headers.
- `src/lib/server/source-write-admission.ts:34-73` creates source-write admissions from server context/request.
- `src/modules/security/source-write-admission.ts` defines scopes, signing, digest, nonce, and validation semantics.
- `convex/sourceWriteAdmission.ts` verifies admission before source writes persist.

**Convex source authority:**
- Authenticated source calls use Clerk tokens via `src/lib/server/convex-source.ts:81-95` and public reads use public clients via `src/lib/server/convex-source.ts:113-149`.
- Schema ownership is module-fragmented but Convex-composed in `convex/schema.ts`.

**Assistant/tool authority:**
- Action surfaces live on action definitions; quiet-agent exposure is an additional allowlist in `src/modules/harness/tool-contract.ts`.
- `inquiry.submit` is the only quiet public write; it requires source admission and returns a receipt/delivery state, not booking/payment/dispatch proof.
- Answer-model tools are read-only (`registry.search`, `registry.detail`) and final prose must pass the answer gate.

## Key Abstractions

**Action:**
- Purpose: A boundary-honest operation shared across UI, HTTP, agent JSON, quiet tools, and harnesses.
- Examples: `src/modules/common/action.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/demand/demand.actions.ts`, `src/modules/settings/settings.actions.ts`.
- Pattern: Use `defineAction`, Zod input/output schemas, explicit `surfaces`, `readOnly`, `summary`, `boundaries`, and parameters; register in `src/modules/actions/index.ts`.

**Public Module Seam:**
- Purpose: Stable route/neighbor import boundary for a domain.
- Examples: `src/modules/registry/public.ts`, `src/modules/inquiries/public.ts`, `src/modules/discovery/public.ts`, `src/modules/business/public.ts`, `src/modules/observability/public.ts`.
- Pattern: Export DTOs, state contracts, reducers, and public functions; keep implementation details under `src/modules/<domain>/internal`.

**Source Port / Source Adapter:**
- Purpose: Hide Convex transport and local fallback behavior from routes.
- Examples: `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/discovery/discovery.functions.ts`, `src/modules/billing/billing.functions.ts`.
- Pattern: Define route-facing helpers/server functions, bind Convex function references with `sourceQuery`/`sourceMutation`, and isolate fallback/test state behind named seams.

**Convex Schema Fragment:**
- Purpose: Let each module own its durable tables while Convex receives one schema export.
- Examples: `src/modules/business/internal/schema.ts`, `src/modules/catalog/internal/schema.ts`, `src/modules/registry/internal/schema.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `src/modules/answer-thread/internal/convex-schema.ts`, `convex/schema.ts`.
- Pattern: Add tables in the owning module fragment and spread them in `convex/schema.ts`; do not create route-owned table definitions.

**Route Readback:**
- Purpose: Package source facts, safe copy, denial states, and next actions for UI rendering.
- Examples: `src/modules/inquiries/route-readbacks.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/billing/owner-billing.readback.ts`.
- Pattern: Build complete route models before rendering; routes should not stitch private rows or provider payloads directly.

**Source-Write Admission:**
- Purpose: Bind mutating requests to server-origin evidence, scope, digest, operation/correlation IDs, expiry, and replay controls.
- Examples: `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`, `convex/sourceWriteAdmission.ts`.
- Pattern: Browser submits intent; server creates admission; Convex verifies admission before source mutation effects.

**Public Quiet Tool Contract:**
- Purpose: Convert action contracts into assistant-callable descriptors with validation, approval policy, and public projection.
- Examples: `src/modules/harness/tool-contract.ts`, `src/modules/harness/action-tool.ts`, `src/routes/api.agent.tools.ts`.
- Pattern: Registered action + pinned exposure allowlist + harness policy; do not expose new quiet tools by only adding an action.

**Lifecycle Descriptor:**
- Purpose: Carry future moat primitives as descriptor-only source state without runtime workflow execution.
- Examples: `src/modules/lifecycle/public.ts`, `src/modules/lifecycle/internal`.
- Pattern: Use descriptor contracts for `held_money`, `external_authority`, `time_bound`, and `proof_gap`; do not ship workflow engine, protected action execution, booking, settlement, or physical-world proof claims under Phase 1.

## Entry Points

**Application start:**
- Location: `src/start.ts`
- Triggers: TanStack Start server bootstrap.
- Responsibilities: Install observability, security headers, CSRF, source-write admission, and Clerk middleware.

**Router/root document:**
- Location: `src/router.tsx`, `src/routes/__root.tsx`, `src/routeTree.gen.ts`
- Triggers: Client/server route rendering.
- Responsibilities: Generated route tree, root providers, global CSS, Clerk provider selection, error boundary, and not-found UI.

**Public registry and catalog:**
- Location: `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/api.businesses*.ts`
- Triggers: Human browsing, search, and public JSON reads.
- Responsibilities: Public catalog readbacks, bounded search/list/detail, and public DTO responses.

**Qualified inquiry:**
- Location: `src/routes/$slug.inquiry.tsx`, `src/modules/inquiries/inquiry.functions.ts`, `convex/inquiries.ts`
- Triggers: Public form submission or quiet tool `inquiry.submit`.
- Responsibilities: Validate target/contact/message, source-admit write, persist receipt/thread/outbox/audit/funnel readbacks.

**Quiet agent tools:**
- Location: `src/routes/api.agent.tools.ts`, `src/modules/harness/tool-contract.ts`, `src/modules/actions/index.ts`
- Triggers: Assistant/tool clients listing or invoking actions.
- Responsibilities: Expose only allowed descriptors, bound payloads, validate identity/admission, run action contracts.

**Answer turn SSE:**
- Location: `src/routes/api.answer.turn.ts`, `src/modules/answer-thread/public.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`
- Triggers: Chat/answer UI POST.
- Responsibilities: Session/rate/access checks, retrieval/tool use, streamed answer state, evidence, and prose gate.

**Operator workspace:**
- Location: `src/routes/_operator.tsx`, `src/routes/_operator/*`, `src/lib/operator/route-options.ts`
- Triggers: `/owner/*`, `/admin/*`, `/developers/*`.
- Responsibilities: Shared signed-in boundary, route shell, owner/admin/developer readbacks and controls.

**Provider/webhook routes:**
- Location: `src/routes/api.notification.*.ts`, `src/routes/api.billing.webhook.ts`, `src/routes/api.business-actions.stripe-webhook.ts`
- Triggers: Provider dispatch/webhook/smoke requests.
- Responsibilities: Verify request authenticity, normalize/redact provider facts, record source-owned evidence/readbacks, fail loudly when configured proof is absent.

## Architectural Constraints

- **Threading:** JavaScript event-loop request model; no worker-thread architecture detected in the inspected runtime seams.
- **Source of truth:** Convex tables/functions are durable authority; route loaders and React state are projections.
- **Module boundaries:** Routes may import public seams/functions/actions, not module internals or Convex schema fragments. Guardrails live in `tests/imports/route-boundary.test.ts` and `tests/imports/private-imports.test.ts`.
- **Generated files:** `src/routeTree.gen.ts` and `convex/_generated/*` are generated. Do not hand-author logic there.
- **Future-phase quarantine:** `src/future-phases` is excluded by `tsconfig.json`; do not treat it as shipped runtime.
- **Backup/source mine boundary:** `.planning/source-mining/phase-1-ledger.md` allows concept extraction from `../Agentic-Economy-Backup` only; runtime imports/coupling to the backup are banned by source-mining guardrails.
- **Public copy posture:** Public human surfaces must not use internal/protocol words listed in `AGENTS.md`, and cannot imply booking, payment, dispatch, autonomous fulfillment, generic marketplace, live-money, or provider proof.
- **Action exposure:** `src/modules/actions/index.ts` includes more operations than the quiet agent door. Public quiet exposure is filtered by `src/modules/harness/tool-contract.ts`.
- **Convex editing:** Before editing Convex files, read `convex/_generated/ai/guidelines.md` per `AGENTS.md`.

## Anti-Patterns

### Route-owned authority or direct source mutation

**What happens:** A route accepts `ownerId`, `adminId`, `actor`, source-state fields, or provider facts from the browser and writes directly.
**Why it's wrong:** It bypasses Clerk/Convex authority, source-write admission, idempotency, and audit/readback constraints.
**Do this instead:** Validate browser intent in the route, create server-side source admission through `src/lib/server/source-write-admission.ts`, and write through the owning module/Convex function (`src/modules/inquiries/inquiry.functions.ts`, `convex/inquiries.ts`).

### Public exposure by registry membership alone

**What happens:** A new action is added to `src/modules/actions/index.ts` and assumed to be public/assistant-callable.
**Why it's wrong:** The action registry also holds UI/HTTP/agentJson/hidden actions; quiet tools require the pinned allowlist and policy in `src/modules/harness/tool-contract.ts`.
**Do this instead:** Add the action, set surfaces truthfully, update harness allowlists only with boundary review, and verify quiet descriptor changes through action/tool tests.

### Public/provider proof overclaim

**What happens:** Source-local test-mode billing/business-action/provider evidence is described as production, live money, booking, dispatch, or public readiness.
**Why it's wrong:** `.planning/STATE.md` and `.planning/scopes/SCOPE-EXECUTION-READINESS.md` keep Phase 6 as source/local proof and active deployed/provider/14-day gates open.
**Do this instead:** Say exactly which proof level exists; keep public copy and agent descriptors within current evidence gates.

### Importing module internals across boundaries

**What happens:** A route or sibling module imports `src/modules/<other>/internal/*` to reuse a helper.
**Why it's wrong:** It breaks ownership and lets private implementation leak into public/control surfaces.
**Do this instead:** Export a narrow function/type from the owning `public.ts` or `*.functions.ts`, then import that seam. `tests/imports/private-imports.test.ts` encodes the rule.

### Treating fixture/demo areas as product runtime

**What happens:** Code or docs rely on `tests/fixtures`, `src/app`, `src/future-phases`, `tests/spike`, or `examples/agent-experience` as if they prove shipped behavior.
**Why it's wrong:** These areas are guardrail fixtures, prototypes, spikes, or audit examples.
**Do this instead:** Anchor shipped behavior in `src/routes`, `src/modules`, `convex`, and deployed/source evidence artifacts.

## Error Handling

**Strategy:** Fail closed at trust boundaries, return typed readbacks/errors, and preserve operator reconstruction without leaking private/provider payloads.

**Patterns:**
- Bound request bodies before parsing on agent/answer/API surfaces (`src/routes/api.agent.tools.ts`, `src/routes/api.answer.turn.ts`, `src/lib/server/bounded-request-body.ts`).
- Use Zod validators in action definitions, route server functions, and request handlers.
- Return discriminated results such as `{ kind: 'ok' }`, `{ kind: 'error' }`, `{ kind: 'denied' }`, or `not_found` from domain/server functions.
- Redirect only for missing signed-in operator sessions; role/ownership denial stays in source-owned readbacks.
- Provider/webhook routes verify signatures/secrets before source writes and persist only redacted refs/hashes.
- Observability middleware captures/flushes server exceptions when enabled without making telemetry source authority.

## Cross-Cutting Concerns

**Logging/observability:** `src/lib/observability/*`, `src/modules/observability/*`, and `convex/observability.ts` own PostHog/Sentry/funnel/audit/operator-control seams. Keep redaction and Convex-safe imports separated.

**Validation:** Zod schemas sit beside actions/functions (`src/modules/*/*.actions.ts`, `src/modules/*/*.functions.ts`) and Convex validators sit in `convex/*.ts` or module schema fragments.

**Authentication:** Clerk wraps sign-in/sign-up/operator route families in `src/routes/__root.tsx`; server auth uses Clerk in `src/lib/server/require-operator-session.ts` and `src/lib/server/convex-source.ts`; Convex derives authority from auth/admin rows.

**Security:** CSRF and security headers install in `src/start.ts`; source-write admission spans `src/lib/server/source-write-admission.ts`, `src/modules/security/source-write-admission.ts`, and `convex/sourceWriteAdmission.ts`; route/private import scans live in `tests/imports`.

**SEO/AEO:** `src/modules/seo`, `src/modules/discovery`, and discovery/robots/sitemap/llms routes must derive public facts from source DTOs and avoid private URL/provider/protocol overclaims.

**Design/UI:** `AGENTS.md` and `DESIGN.md` make Astryx the first-choice component system; AE components under `src/components/ae` are current behavioral wrappers, not a license to grow a second bespoke presentation system.

## Phase and Posture Caveats

- `.planning/STATE.md` marks the 14-day bootstrap gate active with open blockers; the clock has not started.
- `.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md` records zero setup/proof rows and keeps public platform-rung widening unauthorized by that scaffold.
- `.planning/scopes/SCOPE-EXECUTION-READINESS.md` distinguishes local/source, deployed, provider, and live proof; do not collapse those states in code comments, docs, public copy, or agent descriptors.
- Phase 6 business-action/Stripe evidence is source/local and test-mode only; `businessAction.requestCapability` is not a quiet public tool and does not prove booking/payment/dispatch.
- Current primary product slice is storefront/registry/catalog plus qualified inquiry; no generic marketplace, wallet, settlement, hosted agent, voice runtime, request market, or autonomous operation should be inferred from dormant/future or source-local seams.

---

*Architecture analysis: 2026-07-06*
