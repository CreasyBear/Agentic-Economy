# Codebase Structure

**Analysis Date:** 2026-07-06

## Directory Layout

```text
agentic-economy/
├── src/                         # TanStack Start app, route adapters, UI, modules, server helpers
│   ├── routes/                  # File-based routes; `_operator/` owns owner/admin/developer leaves
│   ├── modules/                 # Domain seams, source adapters, actions, schemas, reducers, readbacks
│   ├── components/              # Astryx adapters and AE behavioral UI shells/components
│   ├── lib/                     # Cross-cutting server, HTTP, operator, observability, and UI helpers
│   ├── hooks/                   # Shared React hooks
│   ├── styles/                  # Global CSS import order, Astryx/Tailwind tokens, legacy bridge
│   ├── app/                     # Prototype/demo pages outside the active route tree
│   ├── future-phases/           # Excluded future-phase sketches; not shipped runtime
│   ├── routeTree.gen.ts         # Generated TanStack route tree
│   ├── router.tsx               # Router factory
│   └── start.ts                 # TanStack Start request middleware entry
├── convex/                      # Convex schema composition, functions, stores, authz, generated API
│   └── _generated/              # Generated Convex API/types; do not hand-edit
├── tests/                       # Boundary, unit, integration, e2e, copy, SEO, deploy-smoke, fixture tests
├── eval/answer/                 # Answer evaluation harness and promptfoo-style config
├── examples/agent-experience/   # Agent-experience audit examples and runners
├── public/                      # Static assets
├── vendor/                      # Vendored reference packages, currently handshake-protocol-kernel provenance
├── workflows/                   # Workflow support docs
├── .agents/                     # Project-local agent skills/instructions; `shadcn` skill detected
├── .planning/                   # GSD state, scopes, source-mining ledger, codebase maps, audits, brand docs
├── package.json                 # Scripts and package metadata
├── tsconfig.json                # Strict TS config and route/module aliases
├── vite.config.ts               # Vite/TanStack Start/Nitro/Tailwind/Sentry build config
├── vitest.config.ts             # Vitest config
├── components.json              # Component tooling configuration
├── DESIGN.md                    # Visual/UI authority
├── PRODUCT.md                   # Product thesis/trust contract
└── AGENTS.md                    # Always-on repository instructions
```

## Directory Purposes

**`src/routes`:**
- Purpose: Own URL shape for public pages, API/JSON routes, assistant-readable artifacts, webhook/dispatch endpoints, and owner/admin/developer route leaves.
- Contains: Public human routes (`src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/claim.tsx`), API routes (`src/routes/api.businesses.ts`, `src/routes/api.agent.tools.ts`, `src/routes/api.answer.turn.ts`), artifact routes (`src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, `src/routes/$slug.ucp.ts`), and pathless operator layout/leaves (`src/routes/_operator.tsx`, `src/routes/_operator/*`).
- Key files: `src/routes/__root.tsx`, `src/routes/_operator.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/api.agent.tools.ts`, `src/routes/api.answer.turn.ts`.
- Guidance: Keep routes thin. Validate inputs, call `src/modules` seams/functions/actions, set response metadata/headers, and render readbacks. Do not put durable authority or provider SDK logic directly in routes unless the route is a narrow verified webhook/dispatch adapter.

**`src/routes/_operator`:**
- Purpose: Owner, admin, and developer pages under the shared `_operator` pathless layout.
- Contains: Owner inquiry/status/settings/billing/action pages (`owner.*.tsx`), admin queue/readback pages (`admin.*.tsx`), and developer discovery (`developers.discovery.tsx`).
- Key files: `src/routes/_operator/owner.inquiries.tsx`, `src/routes/_operator/owner.status.tsx`, `src/routes/_operator/admin.index-health.tsx`, `src/routes/_operator/admin.inquiries.tsx`, `src/routes/_operator/developers.discovery.tsx`.
- Guidance: Use `src/lib/operator/route-options.ts`; signed-in admission happens once at `src/routes/_operator.tsx`, while owner/admin denial and role-specific data must come from module/Convex readbacks.

**`src/modules`:**
- Purpose: Domain-owned business logic, action contracts, route readbacks, source adapters, validation schemas, DTOs, state reducers, and Convex table fragments.
- Contains: `actions`, `common`, `business`, `catalog`, `registry`, `discovery`, `inquiries`, `answer`, `answer-thread`, `harness`, `clearance`, `security`, `observability`, `settings`, `storefront`, `demand`, `capabilities`, `protected-action`, `business-action`, `billing`, `notification-outbox`, `lifecycle`, `seo`, and `dev`.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/registry/public.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/public.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/discovery/public.ts`, `src/modules/harness/tool-contract.ts`.
- Guidance: Add new domain behavior here before adding route logic. Public imports should go through `public.ts`, `*.functions.ts`, or `*.actions.ts`; private helpers stay in `internal/`.

**`src/modules/actions`:**
- Purpose: Central explicit action registry.
- Contains: `src/modules/actions/index.ts` importing action consts from registry, inquiry, storefront, demand, settings, and business-action modules.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`.
- Guidance: To add an operation-backed surface, define it in the owning module as `<domain>.actions.ts`, give it truthful `summary`, `boundaries`, `surfaces`, and `readOnly`, then register it in `src/modules/actions/index.ts`. Quiet public exposure also requires harness allowlist changes in `src/modules/harness/tool-contract.ts`.

**`src/modules/business`:**
- Purpose: Business identity, claim/public/suppression state contracts, and source-owned business table schema.
- Contains: `src/modules/business/public.ts` and `src/modules/business/internal/schema.ts`.
- Key files: `src/modules/business/public.ts`, `src/modules/business/internal/schema.ts`, `convex/business.ts`.
- Guidance: Put business-level status transitions, public visibility, owner binding concepts, and suppression rules here; catalog/service facts belong in `src/modules/catalog`.

**`src/modules/catalog`:**
- Purpose: Owner claim/publish source adapters and public catalog/service/capability DTOs.
- Contains: `src/modules/catalog/public.ts`, `src/modules/catalog/owner-claim.functions.ts`, and `src/modules/catalog/internal/schema.ts`.
- Key files: `src/modules/catalog/owner-claim.functions.ts`, `convex/catalog.ts`, `convex/business.ts`.
- Guidance: Use for claim/publish flows and service catalog write/read models. Do not make public route files own catalog assembly.

**`src/modules/registry`:**
- Purpose: Public registry list/search/detail, registry projection/readback contracts, and inquiry-target resolution.
- Contains: `src/modules/registry/public.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/registry/registry.actions.ts`, and `src/modules/registry/internal/*`.
- Key files: `src/modules/registry/registry.functions.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/registry/internal/schema.ts`, `convex/registry.ts`.
- Guidance: Add public search/list/detail behavior here. Keep search source-port/fallback behavior in `registry.functions.ts` and durable query logic in `convex/registry.ts`.

**`src/modules/discovery`:**
- Purpose: Assistant/crawler/developer discovery artifacts derived from catalog/registry source state.
- Contains: `src/modules/discovery/public.ts`, `src/modules/discovery/developer-discovery.ts`, `src/modules/discovery/discovery.functions.ts`, and `src/modules/discovery/internal/schema.ts`.
- Key files: `src/modules/discovery/public.ts`, `src/modules/discovery/developer-discovery.ts`, `src/modules/discovery/discovery.functions.ts`, `convex/discovery.ts`.
- Guidance: Use for UCP-shaped fallback manifests, `llms.txt`, developer discovery, sitemap/robots helpers, and manifest attempts. Do not add merchant-origin, callable, payment-handler, MCP/OpenAPI, or live capability overclaims without a new gate.

**`src/modules/inquiries`:**
- Purpose: Qualified inquiry public submit flow, customer receipt readbacks, owner inbox/thread mutations, notification binding, privacy tombstones, and operator reconstruction.
- Contains: `src/modules/inquiries/public.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/inquiries/route-readbacks.ts`, `src/modules/inquiries/customer-record-client.tsx`, and internal reducers/schemas.
- Key files: `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/route-readbacks.ts`, `src/modules/inquiries/internal/convex-schema.ts`, `convex/inquiries.ts`.
- Guidance: This is the first owned conversion path. Keep it human-first: first-contact inquiry for owner review, not booking/dispatch/payment/fulfillment.

**`src/modules/answer` and `src/modules/answer-thread`:**
- Purpose: Grounded answer generation, answer IDs/prose/schema, answer-thread state, turn streaming, follow-ups, tool running, and public projections.
- Contains: Public seams (`public.ts`), server functions (`answer-thread.functions.ts`), schemas (`answer-thread.schema.ts`), and internals for orchestration/tool running/gating.
- Key files: `src/modules/answer/public.ts`, `src/modules/answer/internal/answer-gate.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer-thread/public.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/internal/tool-runner.ts`, `src/modules/answer-thread/internal/convex-schema.ts`, `convex/answerThreads.ts`.
- Guidance: Answer-model tools stay read-only (`registry.search`, `registry.detail`) unless the action/tool contract, gates, and proof posture deliberately change.

**`src/modules/harness`:**
- Purpose: Tool contracts, run loops, approval policy, evidence envelopes, session journals, emission guardrails, run viewer readbacks, and harness persistence schema.
- Contains: `src/modules/harness/tool-contract.ts`, `action-tool.ts`, `approval-policy.ts`, `run-loop.ts`, `evidence-envelope.ts`, `session-journal.ts`, `run-viewer.functions.ts`, `harness.functions.ts`, `internal/convex-schema.ts`.
- Key files: `src/modules/harness/public.ts`, `src/modules/harness/tool-contract.ts`, `src/modules/harness/run-loop.ts`, `convex/harnessSessions.ts`.
- Guidance: Use harness for agent/eval/tool execution infrastructure, not product feature authority.

**`src/modules/clearance`:**
- Purpose: Principal identity, signed write admission, web-bot-auth/agent identity, and Convex protocol clearance seams.
- Contains: `src/modules/clearance/public.ts`, `src/modules/clearance/clearance.functions.ts`, `src/modules/clearance/principal-contract.ts`, internal principal/clearance schemas.
- Key files: `src/modules/clearance/clearance.functions.ts`, `convex/clearance.ts`, `convex/spikeHandshakeRuntime.ts`.
- Guidance: Use for identity/clearance before assistant-origin writes. Keep principal and source-admission evidence explicit.

**`src/modules/security`:**
- Purpose: CSRF/rate-limit/duplicate/dispute/admin readbacks, provider API base URL validation, and source-write admission primitives.
- Contains: `src/modules/security/public.ts`, `src/modules/security/source-write-admission.ts`, `src/modules/security/admin-readback.functions.ts`, `src/modules/security/removal-dispute.functions.ts`, internal schema.
- Key files: `src/modules/security/source-write-admission.ts`, `src/modules/security/admin-readback.functions.ts`, `src/modules/security/internal/schema.ts`, `convex/security.ts`, `convex/authz.ts`.
- Guidance: Put trust-boundary and authorization helpers here; do not duplicate route-local authority checks.

**`src/modules/observability`:**
- Purpose: Audit/funnel/operator-control/targeted-session/supplier-action/source-sync records and readbacks.
- Contains: `src/modules/observability/public.ts`, `funnel.functions.ts`, `funnel.source.ts`, `funnel.capture.server.ts`, `source-sync-gate.ts`, and internal schema.
- Key files: `src/modules/observability/public.ts`, `src/modules/observability/funnel.functions.ts`, `src/modules/observability/internal/schema.ts`, `convex/observability.ts`.
- Guidance: Observability evidence can support gates, but telemetry is not business/action/payment authority unless the owning source module consumes it explicitly.

**`src/modules/settings`:**
- Purpose: Owner notification preferences and settings actions/source adapters.
- Contains: `src/modules/settings/public.ts`, `src/modules/settings/settings.functions.ts`, `src/modules/settings/settings.actions.ts`, internal schema.
- Key files: `src/modules/settings/settings.actions.ts`, `convex/settings.ts`.
- Guidance: Use for signed-in owner settings only; do not mix account identity, catalog facts, or provider configuration into settings actions.

**`src/modules/storefront` and `src/modules/demand`:**
- Purpose: Storefront draft import seams and registry empty-state demand capture.
- Contains: `src/modules/storefront/storefront.actions.ts`, `src/modules/storefront/storefront.functions.ts`, `src/modules/demand/demand.actions.ts`, `src/modules/demand/demand.functions.ts`, internal schemas.
- Key files: `src/routes/api.storefront.import-draft.ts`, `src/modules/storefront/storefront.actions.ts`, `src/modules/demand/demand.functions.ts`, `convex/demand.ts`.
- Guidance: Storefront import creates owner-reviewed drafts, not verified listings. Demand capture records unmet search intent, not a promise to contact or match a business.

**`src/modules/capabilities`:**
- Purpose: Capability contracts, endpoint checks, support matrix, and capability storage seams.
- Contains: `src/modules/capabilities/public.ts`, internal capability schemas/check logic.
- Key files: `src/modules/capabilities/public.ts`, `convex/capabilities.ts`, `convex/capabilityCheck.ts`.
- Guidance: Keep capability checks and descriptors bounded by current proof. Capability availability is not booking/payment/dispatch readiness.

**`src/modules/protected-action`:**
- Purpose: Owner-pending protected actions, selected action gateway/policy/retention/support contracts.
- Contains: `src/modules/protected-action/public.ts`, `contact-follow-up.functions.ts`, internal schema.
- Key files: `src/modules/protected-action/contact-follow-up.functions.ts`, `convex/protectedActions.ts`, `convex/protectedActionStore.ts`.
- Guidance: Treat as owner-approved/protected-action infrastructure; do not expose it through quiet public tools by default.

**`src/modules/business-action`:**
- Purpose: Receipt-backed business-action proposal/source-local evidence seams and owner/admin readbacks.
- Contains: `src/modules/business-action/public.ts`, `business-action.functions.ts`, `business-action.actions.ts`, internal schema.
- Key files: `src/modules/business-action/business-action.functions.ts`, `src/modules/business-action/business-action.actions.ts`, `convex/businessActions.ts`, `convex/businessActionStore.ts`.
- Guidance: Current action is proposal-only and not a quiet public tool. Keep Phase 6/source-local/test-mode caveats in public/agent-facing copy.

**`src/modules/billing`:**
- Purpose: Owner billing readbacks, activation/return/cancel routes, billing source functions, Autumn/Stripe source-local evidence support.
- Contains: `src/modules/billing/public.ts`, `billing.functions.ts`, `owner-billing.readback.ts`, `owner-billing.panels.tsx`, internal schema.
- Key files: `src/modules/billing/billing.functions.ts`, `src/modules/billing/owner-billing.readback.ts`, `convex/billing.ts`, `convex/billingStore.ts`.
- Guidance: Billing/provider evidence does not authorize public live-money claims until deployed/provider/live gates are explicitly met.

**`src/modules/notification-outbox`:**
- Purpose: AE-owned notification source state and readbacks.
- Contains: `src/modules/notification-outbox/public.ts`, internal schema.
- Key files: `src/modules/notification-outbox/public.ts`, `src/modules/notification-outbox/internal/schema.ts`, `convex/notificationOutbox.ts`, `src/lib/server/notification-provider.ts`.
- Guidance: Provider adapters record delivery attempts/results; AE outbox state remains source authority.

**`src/modules/lifecycle`:**
- Purpose: Descriptor-only lifecycle moat contract.
- Contains: `src/modules/lifecycle/public.ts` and internal descriptors.
- Key files: `src/modules/lifecycle/public.ts`, `tests/unit/lifecycle/lifecycle-descriptor.test.ts`.
- Guidance: Keep `held_money`, `external_authority`, `time_bound`, and `proof_gap` as descriptors unless a future plan explicitly adds runtime workflow execution.

**`src/modules/seo`:**
- Purpose: Public route metadata, canonical/noindex/JSON-LD helpers, and SEO/AEO guardrails.
- Contains: `src/modules/seo/public.ts`, `src/modules/seo/public-route.ts`, internal helpers.
- Key files: `src/modules/seo/public.ts`, `tests/seo/*`.
- Guidance: Use source-backed public facts only; do not add ratings/offers/payment schema without source evidence.

**`src/components`:**
- Purpose: UI composition using Astryx first, plus AE behavioral wrappers and chat/artifact/readback components.
- Contains: `src/components/astryx`, `src/components/ae`, `src/components/ai-elements`, and small animation helpers.
- Key files: `src/components/ae/layout/AePublicShell.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/listing/AeProviderListingPage.tsx`, `src/components/ae/chat/*`, `src/components/ae/artifacts/AeGenerativeAnswer.tsx`, `src/components/astryx/RouterLink.tsx`.
- Guidance: Use Astryx components and existing AE behavioral wrappers. Do not grow a separate bespoke presentation system when Astryx covers the component.

**`src/lib`:**
- Purpose: Cross-cutting helpers that are not owned by one domain module.
- Contains: `src/lib/server` for Convex/source/provider/server helpers, `src/lib/http` for response/security headers, `src/lib/operator` for navigation/route options, `src/lib/observability` for Sentry/PostHog/funnel client/server helpers, and `src/lib/ui` for presentation/contract scans.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/server/require-operator-session.ts`, `src/lib/server/bounded-request-body.ts`, `src/lib/operator/route-options.ts`, `src/lib/ui/contract-scans.ts`.
- Guidance: Put reusable cross-domain infrastructure here; if a helper encodes domain state or policy, keep it in the owning `src/modules/<domain>` instead.

**`src/styles`:**
- Purpose: Global style ordering, Astryx/Tailwind integration, tokens, base styles, and small legacy bridge.
- Contains: `src/styles/globals.css`, `src/styles/tokens.css`, `src/styles/base.css`, `src/styles/legacy.css`.
- Key files: `src/styles/globals.css`, `src/styles/tokens.css`.
- Guidance: Global CSS changes should preserve import order and token authority; component styling should use Astryx semantics and layout utilities.

**`convex`:**
- Purpose: Durable backend schema, source functions, source-state stores, authz, crons, and generated Convex API files.
- Contains: Schema composition (`convex/schema.ts`), source functions (`convex/registry.ts`, `convex/catalog.ts`, `convex/inquiries.ts`, `convex/discovery.ts`, `convex/security.ts`, `convex/observability.ts`, `convex/billing.ts`), store files (`convex/*Store.ts`), auth helpers (`convex/authz.ts`, `convex/auth.config.ts`), and generated files under `convex/_generated`.
- Key files: `convex/schema.ts`, `convex/source_state.ts`, `convex/sourceWriteAdmission.ts`, `convex/authz.ts`, `convex/_generated/ai/guidelines.md`.
- Guidance: Read `convex/_generated/ai/guidelines.md` before Convex edits. Add tables to module schema fragments, then compose them in `convex/schema.ts`.

**`tests`:**
- Purpose: Guardrails and behavior checks for source/runtime boundaries, copy/SEO, contracts, UI, E2E, deploy smoke, and bad-pattern fixtures.
- Contains: `tests/unit`, `tests/integration`, `tests/e2e`, `tests/deploy-smoke`, `tests/imports`, `tests/copy`, `tests/seo`, `tests/types`, `tests/fixtures`, `tests/spike`, and helpers.
- Key files: `tests/imports/route-boundary.test.ts`, `tests/imports/private-imports.test.ts`, `tests/imports/source-mining.test.ts`, `tests/copy/phase1-banned-copy.test.ts`, `tests/integration/registry-api.test.ts`, `tests/deploy-smoke/*`.
- Guidance: Use tests as executable boundary documentation. `tests/fixtures/bad-*` intentionally contain violations and are not product examples.

**`eval/answer`:**
- Purpose: Answer-quality evaluation harness and report generation.
- Contains: Prompt/config/scripts/fixtures for answer eval.
- Key files: `eval/answer/promptfooconfig.yaml`, `eval/answer/scripts/*`.
- Guidance: Use for answer/search evaluation work, not runtime product routing.

**`examples/agent-experience`:**
- Purpose: Agent-experience audit examples/runners.
- Contains: Audit driver scripts and example artifacts.
- Key files: `examples/agent-experience/run-audit.ts`.
- Guidance: These examples support audit gates; they are not proof of deployed assistant success without evidence artifacts.

**`public`:**
- Purpose: Static assets served directly.
- Contains: Brand/logo/image assets.
- Key files: `public/images`, `public/brand` if present.
- Guidance: Put only static, non-secret assets here.

**`.planning`:**
- Purpose: GSD state, phase/scopes, source-mining ledger, codebase maps, graph outputs, brand docs, audits, and evidence artifacts.
- Contains: `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/scopes`, `.planning/source-mining/phase-1-ledger.md`, `.planning/codebase`, `.planning/audits`, `.planning/brand`.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/scopes/SCOPE-EXECUTION-READINESS.md`, `.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md`.
- Guidance: Planning constrains implementation and public posture but is never runtime source state.

**`.agents`:**
- Purpose: Project-local agent skills and support scripts.
- Contains: At least `.agents/skills/shadcn/SKILL.md`; package scripts also reference `.agents/skills/ui-craft/scripts/*`.
- Key files: `.agents/skills/shadcn/SKILL.md`.
- Guidance: Read project skills before UI/component work. Skill docs guide tooling/conventions; they are not product runtime.

**`vendor`:**
- Purpose: Vendored reference package provenance.
- Contains: `vendor/handshake-protocol-kernel`.
- Key files: `vendor/handshake-protocol-kernel/README-PROVENANCE.md`.
- Guidance: Treat vendored code as reference/dependency context; do not edit unless a plan explicitly owns vendor changes.

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start middleware entry for observability, security headers, CSRF, source-write admission, and Clerk.
- `src/router.tsx`: Router factory using generated `src/routeTree.gen.ts`.
- `src/routes/__root.tsx`: Root document shell, Astryx providers, conditional Clerk provider, global CSS, error boundary, toaster.
- `src/routes/_operator.tsx`: Pathless owner/admin/developer layout and shared signed-in boundary.
- `convex/schema.ts`: Convex schema composition root.

**Public Human Routes:**
- `src/routes/index.tsx`: Home/landing route.
- `src/routes/registry.tsx`: Public registry/search route.
- `src/routes/$slug.tsx`: Public business detail route.
- `src/routes/$slug.inquiry.tsx`: Public qualified inquiry route.
- `src/routes/claim.tsx`: Business claim/publish entry route.
- `src/routes/claim.success.tsx`: Claim/publish status/readback route.
- `src/routes/about.tsx`, `src/routes/help.tsx`, `src/routes/privacy.tsx`, `src/routes/terms.tsx`: Static/support routes.
- `src/routes/privacy.remove-business.tsx`: Removal/dispute route.

**Machine / API / Artifact Routes:**
- `src/routes/api.businesses.ts`: Public catalog list JSON route.
- `src/routes/api.businesses.search.ts`: Public catalog search JSON route.
- `src/routes/api.businesses.$slug.ts`: Public business detail JSON route.
- `src/routes/api.agent.tools.ts`: Quiet agent tools list/invoke route.
- `src/routes/api.answer.turn.ts`: SSE answer turn route.
- `src/routes/api.answer.ts`, `src/routes/api.chat.ts`, `src/routes/api.chat.models.ts`: Chat/answer API surfaces.
- `src/routes/api.discovery.schema.ts`, `src/routes/api.discovery.examples.ts`, `src/routes/api.discovery.fixtures.ts`: Developer discovery surfaces.
- `src/routes/llms[.]txt.ts`: Assistant-readable text index.
- `src/routes/$slug.ucp.ts`: AE-hosted catalog discovery manifest route.
- `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`: Crawler artifacts.

**Webhook / Provider / Dispatch Routes:**
- `src/routes/api.notification.resend-webhook.ts`: Resend webhook adapter.
- `src/routes/api.notification.resend-dispatch.ts`: Resend dispatch bridge.
- `src/routes/api.notification.novu-dispatch.ts`: Novu dispatch bridge.
- `src/routes/api.billing.webhook.ts`: Billing webhook route.
- `src/routes/api.business-actions.stripe-webhook.ts`: Business-action Stripe webhook route.
- `src/routes/api.observability.funnel.ts`: Funnel capture endpoint.
- `src/routes/api.storefront.import-draft.ts`: Storefront import endpoint.

**Operator Routes:**
- `src/routes/_operator/owner.inquiries.tsx`, `src/routes/_operator/owner.inquiries.$threadId.tsx`: Owner inquiry inbox/detail.
- `src/routes/_operator/owner.status.tsx`: Owner status dashboard.
- `src/routes/_operator/owner.settings.tsx`: Owner settings.
- `src/routes/_operator/owner.billing*.tsx`: Owner billing activation/return/receipt/cancel pages.
- `src/routes/_operator/owner.actions*.tsx`, `src/routes/_operator/owner.business-actions*.tsx`: Owner action/business-action pages.
- `src/routes/_operator/admin.*.tsx`: Admin audit, claims, inquiries, index-health, monetization, protected-actions, business-action, run views.
- `src/routes/_operator/developers.discovery.tsx`: Developer discovery readback.

**Action Contracts:**
- `src/modules/common/action.ts`: Action type model and `defineAction`.
- `src/modules/actions/index.ts`: Central action registry.
- `src/modules/registry/registry.actions.ts`: `registry.list`, `registry.search`, `registry.detail`.
- `src/modules/inquiries/inquiry.actions.ts`: `inquiry.submit`, `inquiry.readCustomerRecord`.
- `src/modules/storefront/storefront.actions.ts`: `storefront.importDraft`.
- `src/modules/demand/demand.actions.ts`: `demand.capture`.
- `src/modules/settings/settings.actions.ts`: `settings.updateNotificationPreferences`.
- `src/modules/business-action/business-action.actions.ts`: `businessAction.requestCapability` proposal-only contract.
- `src/modules/harness/tool-contract.ts`: Quiet-agent and answer-model tool projection/approval policy.

**Core Domain Logic:**
- `src/modules/registry/registry.functions.ts`: Registry source adapter and public route helpers.
- `src/modules/registry/internal/search.ts`, `src/modules/registry/internal/search-documents.ts`: Registry search internals.
- `src/modules/catalog/owner-claim.functions.ts`: Claim/publish source adapter.
- `src/modules/inquiries/inquiry.functions.ts`: Inquiry submit/owner thread/customer readback source adapter.
- `src/modules/inquiries/route-readbacks.ts`: Inquiry route model builders.
- `src/modules/discovery/public.ts`: Discovery artifact builders and public contracts.
- `src/modules/discovery/developer-discovery.ts`: Developer discovery schema/readback support.
- `src/modules/answer-thread/internal/turn-orchestrator.ts`: Streaming answer orchestration.
- `src/modules/answer-thread/internal/tool-runner.ts`: Answer tool execution.
- `src/modules/answer/internal/answer-gate.ts`: Final answer grounding/boundary gate.
- `src/modules/security/source-write-admission.ts`: Source-write signing/validation primitives.
- `src/modules/clearance/clearance.functions.ts`: Agent identity and admission source adapter.
- `src/modules/observability/funnel.functions.ts`: Funnel source adapter/readback.
- `src/modules/billing/billing.functions.ts`: Billing source adapters.
- `src/modules/business-action/business-action.functions.ts`: Business-action proposal/evidence source adapters.

**Convex Backend:**
- `convex/schema.ts`: Table composition from module fragments.
- `convex/source_state.ts`: Runtime source-state helpers/types.
- `convex/sourceWriteAdmission.ts`: Convex-side source-write admission verification.
- `convex/authz.ts`: Convex actor/admin authorization helpers.
- `convex/registry.ts`: Public catalog list/search/detail and inquiry target queries.
- `convex/business.ts`, `convex/catalog.ts`: Business/claim/catalog source functions.
- `convex/inquiries.ts`: Inquiry source functions.
- `convex/discovery.ts`: Discovery artifact source functions.
- `convex/observability.ts`: Audit/funnel/operator-control source functions.
- `convex/notificationOutbox.ts`: Notification outbox source functions.
- `convex/billing.ts`, `convex/billingStore.ts`: Billing source state/functions.
- `convex/businessActions.ts`, `convex/businessActionStore.ts`: Business-action source state/functions.
- `convex/protectedActions.ts`, `convex/protectedActionStore.ts`: Protected-action source state/functions.
- `convex/_generated/ai/guidelines.md`: Required Convex coding guidance before Convex edits.

**Cross-Cutting Helpers:**
- `src/lib/server/convex-source.ts`: Convex HTTP source clients, function references, public/authenticated source calls.
- `src/lib/server/source-write-admission.ts`: Server-side admission creation from request/context.
- `src/lib/server/require-operator-session.ts`: Shared operator signed-in guard.
- `src/lib/server/bounded-request-body.ts`: Bounded request body helper.
- `src/lib/server/notification-provider.ts`, `src/lib/server/billing-provider.ts`: Provider helper seams.
- `src/lib/http/security-headers.ts`: Security headers/CSP helpers.
- `src/lib/operator/navigation.ts`, `src/lib/operator/route-options.ts`: Operator nav and route state helpers.
- `src/lib/observability/*`: PostHog/Sentry/funnel client/server helpers.
- `src/lib/ui/contract-scans.ts`: Import/copy/source-mining scan logic used by guardrail tests.

**UI and Styles:**
- `src/components/ae/layout/AePublicShell.tsx`: Public navigation/footer/correction/funnel shell.
- `src/components/ae/layout/AeOperatorShell.tsx`: Owner/admin/developer shell.
- `src/components/ae/listing/AeProviderListingPage.tsx`: Public listing page UI.
- `src/components/ae/inquiries/*`: Public/owner inquiry components.
- `src/components/ae/chat/*`: Chat/answer UI components.
- `src/components/ae/artifacts/*`: Generative answer/map/protected artifact components.
- `src/components/astryx/RouterLink.tsx`: TanStack-to-Astryx link adapter.
- `src/styles/globals.css`: Global style import and app CSS entry.
- `src/styles/tokens.css`: Design tokens.

**Configuration and Authority Docs:**
- `package.json`: Scripts and package metadata.
- `tsconfig.json`: Strict TS settings, includes/excludes, and aliases.
- `vite.config.ts`: Build/dev configuration.
- `vitest.config.ts`: Vitest configuration.
- `components.json`: Component tooling configuration.
- `AGENTS.md`: Always-on product/architecture instructions.
- `DESIGN.md`: Visual/UI authority.
- `PRODUCT.md`: Product thesis/trust contract.
- `.planning/PROJECT.md`: Current implementation charter and source-state contracts.
- `.planning/STATE.md`: Active phase/gate posture.
- `.planning/scopes/SCOPE-EXECUTION-READINESS.md`: Current cross-scope proof gates.
- `.planning/source-mining/phase-1-ledger.md`: Backup source-mining boundaries and banned imports/symbols.

## Naming Conventions

**Files:**
- TanStack routes use file-route names in `src/routes`, including dynamic segments (`src/routes/$slug.tsx`), dotted nested segments (`src/routes/$slug.inquiry.tsx`), escaped literals (`src/routes/llms[.]txt.ts`), and API route files (`src/routes/api.businesses.search.ts`).
- Operator leaf routes live under `src/routes/_operator` as `owner.*.tsx`, `admin.*.tsx`, and `developers.discovery.tsx`.
- Domain public seams are named `public.ts`, as in `src/modules/registry/public.ts` and `src/modules/inquiries/public.ts`.
- Route/server adapters are named `*.functions.ts`, as in `src/modules/registry/registry.functions.ts` and `src/modules/inquiries/inquiry.functions.ts`.
- Operation contracts are named `*.actions.ts`, as in `src/modules/registry/registry.actions.ts` and `src/modules/demand/demand.actions.ts`.
- Private domain implementation lives under `internal`, as in `src/modules/registry/internal` and `src/modules/inquiries/internal`.
- Convex schema fragments use `internal/schema.ts` or `internal/convex-schema.ts`, then compose into `convex/schema.ts`.
- Convex function files are domain-named, as in `convex/registry.ts`, `convex/inquiries.ts`, and `convex/discovery.ts`.

**Directories:**
- Put routes only under `src/routes`.
- Put product/domain behavior under `src/modules/<domain>`.
- Put cross-domain infrastructure under `src/lib/<area>` only when no domain owns it.
- Put reusable route chrome and product UI under `src/components/ae/<area>`.
- Put Astryx adapters under `src/components/astryx`.
- Put generated TanStack route output in `src/routeTree.gen.ts` and generated Convex output under `convex/_generated`.
- Keep future/demos/fixtures in `src/app`, `src/future-phases`, `tests/fixtures`, `tests/spike`, `examples`, or `eval` unless a plan promotes them into runtime.

**Functions:**
- Use camelCase for route helpers and domain functions: `readPublicRegistrySearchPage`, `submitPublicInquiryThroughSource`, `readCurrentOwnerInboxThroughSource`, `streamAnswerTurn`.
- Use `read*` for reads, `submit*` for user-submitted writes, `resolve*` for identity/target/permission resolution, `build*` for DTO/readback/artifact creation, and `create*` for factory/admission/client setup.
- Convex exported functions should name domain action and visibility: `listPublicBusinessCatalog`, `searchPublicBusinessCatalog`, `submitPublicInquiry`.

**Types and Schemas:**
- Use PascalCase for exported types: `ActionContext`, `PublicBusinessCatalogApiPage`, `OwnerInboxReadback`, `HarnessToolContract`.
- Keep Zod schemas beside the action/function they validate unless multiple files in the same module consume them.
- Keep durable table schemas in owning module fragments; only compose them in `convex/schema.ts`.

**Components:**
- Use PascalCase React component names: `AePublicShell`, `AeOperatorShell`, `AeProviderListingPage`, `RouterLink`.
- Existing `Ae*` components are behavioral/product wrappers. Prefer Astryx primitives for new presentation composition.
- Do not add new bespoke visual systems, shadcn/radix wrappers, or handwritten CSS unless explicitly planned.

## Where to Add New Code

**New public human page:**
- Route: `src/routes/<name>.tsx` or `src/routes/$slug.<child>.tsx`.
- Shell: `src/components/ae/layout/AePublicShell.tsx` unless the page is intentionally immersive.
- Domain logic/readback: `src/modules/<domain>/public.ts` and/or `src/modules/<domain>/<domain>.functions.ts`.
- UI: Compose Astryx in the route or add reusable behavioral UI under `src/components/ae/<area>`.
- Guardrails: Check public copy against `AGENTS.md`, `.planning/PROJECT.md`, and copy tests before public claims change.

**New owner/admin/developer page:**
- Route: `src/routes/_operator/owner.<name>.tsx`, `src/routes/_operator/admin.<name>.tsx`, or `src/routes/_operator/developers.<name>.tsx`.
- Shared guard/shell: `src/routes/_operator.tsx`, `src/lib/operator/route-options.ts`, `src/components/ae/layout/AeOperatorShell.tsx`.
- Domain readback: Owning `src/modules/<domain>/*functions.ts` or `public.ts`.
- Authorization: Resolve owner/admin role in Convex/module readbacks; do not rely on path prefix alone.

**New API endpoint:**
- Route: `src/routes/api.<namespace>[.<name>].ts`.
- Operation contract: Add `src/modules/<domain>/<domain>.actions.ts` only if the endpoint represents a reusable AE operation.
- Registration: Import action in `src/modules/actions/index.ts` when applicable.
- Request safety: Use `src/lib/server/bounded-request-body.ts`, Zod validation, and source-write admission for writes.

**New quiet agent tool:**
- Action: Define in `src/modules/<domain>/<domain>.actions.ts` with exact summary, boundaries, input/output schemas, and `surfaces` including `agentTools`.
- Registry: Add to `src/modules/actions/index.ts`.
- Exposure: Update pinned allowlists/policies in `src/modules/harness/tool-contract.ts` intentionally.
- Route: `src/routes/api.agent.tools.ts` should usually not need tool-specific branching beyond admission scope mapping for writes.
- Posture: Do not expose booking/payment/dispatch/protected-action tools without a new proof gate.

**New Convex table/function:**
- Schema fragment: Add table to the owning module under `src/modules/<domain>/internal/schema.ts` or `internal/convex-schema.ts`.
- Composition: Spread the fragment in `convex/schema.ts`.
- Functions: Add domain-named function file under `convex/<domain>.ts` or extend the existing one.
- Source adapter: Bind with `sourceQuery`, `sourceMutation`, or `sourceAction` from `src/lib/server/convex-source.ts` inside the owning module's `*.functions.ts`.
- Guidance: Read `convex/_generated/ai/guidelines.md` before editing Convex code.

**New durable public catalog/search behavior:**
- Domain: `src/modules/registry` for search/list/detail; `src/modules/catalog` for publish/source DTOs.
- Convex: `convex/registry.ts`, `convex/catalog.ts`, and relevant schema fragments.
- Routes: `src/routes/registry.tsx`, `src/routes/$slug.tsx`, or `src/routes/api.businesses*.ts` should stay thin.

**New qualified-inquiry behavior:**
- Public submit/readback: `src/modules/inquiries/inquiry.functions.ts` and `src/modules/inquiries/public.ts`.
- Route readback: `src/modules/inquiries/route-readbacks.ts`.
- UI: `src/components/ae/inquiries`.
- Convex: `convex/inquiries.ts` and `src/modules/inquiries/internal/convex-schema.ts`.
- Rule: Preserve human owner review and no booking/payment/dispatch/auto-fulfil boundary.

**New answer/search behavior:**
- Answer orchestration: `src/modules/answer-thread/internal/turn-orchestrator.ts`.
- Tool execution: `src/modules/answer-thread/internal/tool-runner.ts` and `src/modules/harness/tool-contract.ts`.
- Prose safety: `src/modules/answer/internal/answer-gate.ts`.
- Route: `src/routes/api.answer.turn.ts`.
- Rule: Answer-model tools are read-only unless a deliberate gate changes the model/tool contract.

**New discovery/SEO artifact:**
- Domain: `src/modules/discovery` or `src/modules/seo`.
- Route: `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, or `src/routes/api.discovery.*.ts`.
- Source: Use registry/catalog/discovery readbacks; never duplicate public facts in static files.
- Rule: No merchant-origin UCP, MCP/OpenAPI/payment-handler/callable claims without a future plan/gate.

**New operator control/readback:**
- Domain: `src/modules/observability`, `src/modules/security`, or the owning source module.
- Convex: Add table/function to the owning module/`convex` files.
- UI: `src/routes/_operator/admin.*.tsx` or owner route plus `src/components/ae/operator`.
- Rule: Operator controls are source-owned; do not create env-only live authority.

**New provider/webhook integration:**
- Route: `src/routes/api.<provider-or-domain>.*.ts`.
- Provider helper: `src/lib/server/<provider>.ts` only for cross-domain provider transport; domain state belongs under `src/modules/<domain>`.
- Source state: Owning Convex module/table.
- Rule: Verify signatures/secrets before writes, store redacted refs/hashes, and keep deploy/provider/live proof levels separate.

**New UI component:**
- Existing Astryx primitive first: import from `@astryxdesign/core` where possible.
- AE behavioral wrapper: `src/components/ae/<area>` only when product behavior/readback reuse justifies it.
- Styling: `src/styles/tokens.css`/semantic tokens and layout utilities; avoid bespoke one-off CSS.
- Project skill: read `.agents/skills/shadcn/SKILL.md` only when shadcn/component-registry work is explicitly involved; current repo guidance still prefers Astryx for product UI.

**New shared helper:**
- If domain-specific: `src/modules/<domain>/internal` or `public.ts`.
- If cross-cutting server infrastructure: `src/lib/server`.
- If HTTP response/security: `src/lib/http`.
- If operator navigation/chrome: `src/lib/operator`.
- If UI presentation/scans: `src/lib/ui`.
- If observability transport: `src/lib/observability`.

## Special Directories and Files

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack route tree.
- Generated: Yes.
- Committed: Yes.
- Guidance: Do not hand-edit logic here; route files generate it.

**`convex/_generated`:**
- Purpose: Generated Convex API/data model/server helpers and AI guidelines.
- Generated: Yes.
- Committed: Yes.
- Guidance: Do not hand-edit generated API files. Read `convex/_generated/ai/guidelines.md` before Convex edits.

**`src/app`:**
- Purpose: Prototype/demo pages not in the active TanStack route tree.
- Generated: No.
- Committed: Yes.
- Guidance: Do not treat `src/app/ai-chat`, `src/app/ai-chat-landing`, or `src/app/library` as shipped route surfaces without checking imports/routes.

**`src/future-phases`:**
- Purpose: Future-phase sketches excluded from TypeScript compilation.
- Generated: No.
- Committed: Yes.
- Guidance: `tsconfig.json` excludes this directory. Do not import from it into active runtime.

**`tests/fixtures`:**
- Purpose: Bad-pattern fixtures for import/copy/source-mining scanners.
- Generated: No.
- Committed: Yes.
- Guidance: These intentionally violate rules; never copy their patterns into runtime code.

**`tests/spike`:**
- Purpose: Spike/prototype tests.
- Generated: No.
- Committed: Yes.
- Guidance: Treat as exploratory unless promoted by a plan.

**`tests/deploy-smoke`:**
- Purpose: Fail-loud deployed/provider smoke harnesses.
- Generated: No.
- Committed: Yes.
- Guidance: These prove deployed/provider states only when configured and passing with evidence; absence/skips are blockers, not green proof.

**`eval/answer`:**
- Purpose: Answer eval harness.
- Generated: Mixed outputs under output locations, source config/scripts committed.
- Committed: Yes for configs/scripts.
- Guidance: Use for eval-driven answer work; not a runtime source of public facts.

**`examples/agent-experience`:**
- Purpose: Agent-experience audit examples/runners.
- Generated: No.
- Committed: Yes.
- Guidance: Local audit examples are not deployed assistant proof without evidence artifacts.

**`.planning`:**
- Purpose: GSD planning/state/evidence/codebase docs.
- Generated: Mixed.
- Committed: Yes.
- Guidance: Read `.planning/STATE.md` and scope indexes before making public/posture-sensitive changes. Do not import planning files into runtime.

**`.planning/source-mining/phase-1-ledger.md`:**
- Purpose: Controls what concepts can be mined from `../Agentic-Economy-Backup`.
- Generated: No.
- Committed: Yes.
- Guidance: Backup source is a concept mine only; no direct imports/coupling.

**`vendor/handshake-protocol-kernel`:**
- Purpose: Vendored/provenance reference package.
- Generated: No.
- Committed: Yes.
- Guidance: Do not edit vendor references casually; use package/public seams in source code.

**`.agents/skills/shadcn/SKILL.md`:**
- Purpose: Project-local shadcn/component skill.
- Generated: No.
- Committed: Yes.
- Guidance: Relevant for shadcn/component-registry tasks; current product UI still follows `AGENTS.md`/`DESIGN.md` Astryx-first direction.

## Ownership Boundaries

**Routes vs modules:**
- Routes in `src/routes` own URL/HTTP/rendering adapters only.
- Modules in `src/modules` own domain behavior, state contracts, and source adapters.
- Convex in `convex` owns durable reads/writes.

**Public vs private module imports:**
- Cross-module and route imports should use `public.ts`, `*.functions.ts`, or `*.actions.ts`.
- `internal/` is private to its owning module except where Convex schema composition explicitly imports schema fragments.
- Guardrail tests: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`.

**Source authority vs readback/projection:**
- Convex and source-write-admitted mutations own durable state.
- Registry, discovery, SEO, agent JSON, and UI are projections/readbacks from source state.
- Planning/eval/test artifacts never become runtime source state.

**Human public vs machine public:**
- Human public surfaces live in public `*.tsx` routes and must avoid internal vocabulary.
- Machine public surfaces live in API/artifact routes and may expose structured epistemic labels where allowed.
- Quiet agent tools are filtered by harness allowlists, not by every action with `agentJson`.

**Proof posture vs capability code:**
- Capability/protected-action/business-action/billing modules can exist as source-local or gated seams without authorizing public readiness claims.
- Use `.planning/scopes/SCOPE-EXECUTION-READINESS.md` and `.planning/scopes/scope-14day-bootstrap-gate/EVIDENCE-14DAY-GATE.md` before widening public/product claims.

## Navigation Guidance for Future Agents

1. Start with `AGENTS.md`, `.planning/STATE.md`, and `.planning/PROJECT.md` for current posture.
2. For a URL/UI change, locate the route in `src/routes`, then follow imports into `src/modules/<domain>` and `src/components/ae/<area>`.
3. For durable state, inspect the owning module schema fragment under `src/modules/<domain>/internal` and the corresponding `convex/<domain>.ts` file; then check `convex/schema.ts` composition.
4. For public/machine operation exposure, inspect the action definition, `src/modules/actions/index.ts`, and `src/modules/harness/tool-contract.ts`.
5. For authority-sensitive writes, trace from route/form/tool → `*.functions.ts` → `src/lib/server/source-write-admission.ts` → Convex mutation → `convex/sourceWriteAdmission.ts`.
6. For assistant/answer behavior, trace `src/routes/api.answer.turn.ts` → `src/modules/answer-thread/public.ts` → `src/modules/answer-thread/internal/turn-orchestrator.ts` → `src/modules/answer-thread/internal/tool-runner.ts` → `src/modules/answer/internal/answer-gate.ts`.
7. For discovery/SEO artifacts, trace route handlers under `src/routes` into `src/modules/discovery` or `src/modules/seo`; do not hand-author duplicate static artifacts.
8. For owner/admin pages, start in `src/routes/_operator`, then inspect `src/lib/operator/navigation.ts`, `src/lib/operator/route-options.ts`, and the owning module readback.
9. For provider integrations, start at the API route, then inspect `src/lib/server/*provider.ts`, the owning module functions, and the Convex source state. Verify proof level before making claims.
10. Treat `src/app`, `src/future-phases`, `tests/fixtures`, `tests/spike`, `examples`, and `eval` as non-primary runtime until a current plan says otherwise.

---

*Structure analysis: 2026-07-06*
