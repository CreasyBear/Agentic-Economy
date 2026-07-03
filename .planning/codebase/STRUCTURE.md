# Codebase Structure

**Analysis Date:** 2026-07-03

## Directory Layout

```text
agentic-economy/
├── AGENTS.md                         # Always-on AE operating contract
├── PRODUCT.md                        # Product thesis and safe trust boundary
├── DESIGN.md                         # Visual/copy/design-system authority
├── package.json                      # npm scripts, dependencies, package manager
├── tsconfig.json                     # strict TypeScript settings and aliases
├── vite.config.ts                    # TanStack Start, Vite, Tailwind, Sentry config
├── vitest.config.ts                  # Vitest node test config
├── playwright.config.ts              # Browser E2E config
├── autumn.config.ts                  # Autumn product/pricing configuration
├── doctor.config.ts                  # React Doctor configuration
├── convex/                           # Convex functions, schema, auth, generated API
├── src/
│   ├── routes/                       # TanStack file routes and API handlers
│   ├── components/                   # AE UI, AI elements, Astryx link adapter
│   ├── modules/                      # Domain modules, source seams, actions, harness
│   ├── lib/                          # Cross-cutting server/browser/UI helpers
│   ├── hooks/                        # Shared React hooks
│   ├── styles/                       # Global CSS, tokens, answer/shell/widget styles
│   ├── app/                          # Astryx/Next-style reference pages, not routes
│   ├── future-phases/                # Parked phase route/readback code
│   ├── router.tsx                    # TanStack router factory
│   ├── routeTree.gen.ts              # Generated TanStack route tree
│   └── start.ts                      # TanStack Start middleware bootstrap
├── tests/                            # Unit, integration, E2E, copy, SEO, UI-contract tests
├── eval/                             # Answer evaluation and promptfoo harness source
├── public/                           # Static images, favicon, landing assets
├── workflows/                        # Local workflow notes/runbooks
├── tools/                            # Repo-local CLI helpers such as graphify wrapper
├── .planning/                        # Product/phase/codebase planning artifacts
├── .ui-craft/                        # UI design memory, tokens, surface notes
├── .agents/skills/                   # Project-local agent skills
├── .codex/skills/                    # Codex/GSD/tooling skills mirror
└── output/, test-results/, .output/   # Generated run/build/browser artifacts
```

## Directory Purposes

**Root guidance/config files:**
- Purpose: Define the product, visual, engineering, and runtime contracts.
- Contains: `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `CLAUDE.md`, `NOTES.md`, `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `doctor.config.ts`, `autumn.config.ts`.
- Key files: `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `package.json`, `vite.config.ts`.

**`src/routes/`:**
- Purpose: TanStack Start file-route adapters and HTTP API route handlers.
- Contains: Public pages, thread routes, owner/admin/developer consoles, webhooks, machine-readable JSON/text routes, SEO/discovery routes.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/t.$threadId.tsx`, `src/routes/api.answer.turn.ts`, `src/routes/api.agent.tools.ts`.
- Rule: Add URL entry points here; route code should validate input and delegate domain work to `src/modules/*`.

**`src/components/ae/`:**
- Purpose: AE product UI components and surface-specific composition.
- Contains: Chat, answer artifacts, provider cards, registry/listing components, inquiry UI, operator shells, readbacks, harness viewer, forms, feedback, motion, status, brand pieces.
- Key files: `src/components/ae/chat/AeChat.tsx`, `src/components/ae/chat/AeAnswerPromptInput.tsx`, `src/components/ae/artifacts/AeGenerativeAnswer.tsx`, `src/components/ae/primitives/AeProviderCard.tsx`, `src/components/ae/listing/AeProviderListingPage.tsx`, `src/components/ae/layout/AeOperatorShell.tsx`, `src/components/ae/harness/AeHarnessRunViewer.tsx`.
- Rule: Put reusable AE-branded UI here, grouped by product surface or primitive family.

**`src/components/ai-elements/`:**
- Purpose: Local AI/chat primitives installed as project-owned code.
- Contains: Prompt input, message, reasoning, sources, shimmer, suggestions.
- Key files: `src/components/ai-elements/prompt-input.tsx`, `src/components/ai-elements/message.tsx`, `src/components/ai-elements/reasoning.tsx`, `src/components/ai-elements/sources.tsx`.
- Rule: Use for AI/chat primitives below AE-specific product composition; keep AE business rules in `src/components/ae/*` or `src/modules/*`.

**`src/components/astryx/`:**
- Purpose: Adapters between Astryx UI primitives and TanStack Router.
- Contains: Router-aware link bridge.
- Key files: `src/components/astryx/RouterLink.tsx`.
- Rule: Keep cross-library adapter code here instead of spreading link compatibility throughout routes.

**`src/components/ui/`:**
- Purpose: Empty compatibility directory in the mapped tree.
- Contains: Not detected.
- Key files: Not detected.
- Rule: Do not add new UI here unless deliberately restoring a compatibility adapter; prefer Astryx primitives plus `src/components/ae/*`.

**`src/components/animate/`:**
- Purpose: Shared animation helper components.
- Contains: Fade-in helper.
- Key files: `src/components/animate/fade-in.tsx`.

**`src/modules/`:**
- Purpose: Domain ownership boundary for contracts, source seams, actions, schemas, and reusable domain logic.
- Contains: `actions`, `answer`, `answer-thread`, `billing`, `business`, `business-action`, `catalog`, `common`, `dev`, `discovery`, `harness`, `inquiries`, `lifecycle`, `notification-outbox`, `observability`, `protected-action`, `registry`, `security`, `seo`.
- Key files: `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/modules/harness/public.ts`, `src/modules/answer-thread/public.ts`.
- Rule: Place domain behavior in the smallest owning module; use `public.ts` for the public module API, `internal/*` for private implementation, `*.functions.ts` for server/source seams, and `*.actions.ts` for action-backed machine operations.

**`src/modules/actions/`:**
- Purpose: Central explicit action registry.
- Contains: Imports and registration for action-backed operations.
- Key files: `src/modules/actions/index.ts`.
- Rule: Register new action-backed assistant/API/UI operations here; do not rely on side-effect registration.

**`src/modules/common/`:**
- Purpose: Shared module-level primitives that multiple domains can depend on.
- Contains: Action contract, branded ID helpers, stable audit/event helpers, chip narrowing.
- Key files: `src/modules/common/action.ts`, `src/modules/common/ids.ts`, `src/modules/common/audit-events.ts`.
- Rule: Put truly cross-domain TypeScript primitives here; avoid UI/server helpers here.

**`src/modules/answer-thread/`:**
- Purpose: Thread-first answer state, streaming orchestration, follow-up intent, tool evidence, Convex seam, public projection.
- Contains: Schema, public exports, server functions, test seam, harness bridge, tool runner, turn orchestrator, public projection, session cookie, turn guard.
- Key files: `src/modules/answer-thread/public.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/internal/tool-runner.ts`, `src/modules/answer-thread/internal/answer-turn-finalization.ts`.
- Rule: Put thread persistence, answer-turn routing, frozen evidence, and follow-up logic here; do not put public catalog search implementation here.

**`src/modules/answer/`:**
- Purpose: Answer synthesis helpers, artifacts, prose, layout profiles, model/tool-use agent support, copy/grounding gates.
- Contains: Answer schemas, synthesizer, prose builders, OpenRouter model helpers, boundary prose, artifact builders, catalog grounding, copy guards.
- Key files: `src/modules/answer/public.ts`, `src/modules/answer/answer-schema.ts`, `src/modules/answer/internal/catalog-grounding.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/answer-layout-profile.ts`.
- Rule: Put content/artifact synthesis here; keep thread persistence in `src/modules/answer-thread/`.

**`src/modules/harness/`:**
- Purpose: OMP-gold harness kernel and evidence/control-plane abstractions.
- Contains: Action-to-tool adapter, tool contracts, approval policy, run loop, collector, session journal, replay/evidence projections, emission guard, protected evidence, strict schema, run-viewer seam/schema/projection.
- Key files: `src/modules/harness/public.ts`, `src/modules/harness/tool-contract.ts`, `src/modules/harness/action-tool.ts`, `src/modules/harness/run-loop.ts`, `src/modules/harness/session-journal.ts`, `src/modules/harness/run-viewer.functions.ts`, `src/modules/harness/internal/convex-schema.ts`.
- Rule: Put reusable tool/run/evidence mechanics here; domain-specific business rules stay in the owning module.

**`src/modules/registry/`:**
- Purpose: Public catalog list/search/detail projections and search/index readbacks.
- Contains: Public DTO contracts, registry actions, Convex source reads, search documents, optional Meilisearch port, projection/index schemas.
- Key files: `src/modules/registry/public.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/registry/internal/search.ts`, `src/modules/registry/internal/catalog-search-port.ts`.
- Rule: Put public business catalog DTO/search behavior here; put owner catalog publishing in `src/modules/catalog/`.

**`src/modules/catalog/`:**
- Purpose: Business service catalog publishing, public business page reads, owner claim route source functions.
- Contains: Catalog model, owner-public flow, publish logic, schema, claim/read server functions.
- Key files: `src/modules/catalog/public.ts`, `src/modules/catalog/owner-claim.functions.ts`, `src/modules/catalog/internal/catalog-model.ts`, `src/modules/catalog/internal/publish.ts`.

**`src/modules/business/`:**
- Purpose: Business identity, ownership claim, public status, trust tier, suppression-aware business records.
- Contains: Business schema and claim logic.
- Key files: `src/modules/business/public.ts`, `src/modules/business/internal/schema.ts`, `src/modules/business/internal/claim.ts`.

**`src/modules/inquiries/`:**
- Purpose: Qualified inquiry submission, owner inbox/thread operations, notification/readback/tombstone state.
- Contains: Public inquiry operations, server functions, action declaration, route readbacks, Convex schema fragment, commands.
- Key files: `src/modules/inquiries/public.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/inquiries/route-readbacks.ts`, `src/modules/inquiries/internal/convex-schema.ts`.
- Rule: Inquiry writes are first-contact records, not booking/payment/dispatch operations.

**`src/modules/protected-action/`:**
- Purpose: Owner-approved contact follow-up workflow and protected-action receipts/reconstruction.
- Contains: Public contract, contact follow-up source functions, selected action contracts, support/retention/gateway helpers, schema.
- Key files: `src/modules/protected-action/public.ts`, `src/modules/protected-action/contact-follow-up.functions.ts`, `src/modules/protected-action/internal/contact-follow-up.ts`.

**`src/modules/business-action/`:**
- Purpose: Agentic business-action cards, buyer mandates, capability requests, authorization checkpoints, external evidence, action receipts, owner/admin reconstructions.
- Contains: Public operations, source functions, Stripe checkout/webhook source helpers, internal schema/state logic.
- Key files: `src/modules/business-action/public.ts`, `src/modules/business-action/business-action.functions.ts`, `src/modules/business-action/internal/business-action.ts`, `src/modules/business-action/internal/stripe-webhook-source.ts`.
- Rule: Keep receipt/evidence/source integrity here; do not turn public listing routes into payment/dispatch surfaces.

**`src/modules/billing/`:**
- Purpose: Paid activation billing state, owner billing panels/readbacks, admin monetization reconstruction, provider evidence.
- Contains: Public billing operations, server/source functions, owner UI panels, provider readbacks, operations/schema/projections.
- Key files: `src/modules/billing/public.ts`, `src/modules/billing/billing.functions.ts`, `src/modules/billing/owner-billing.panels.tsx`, `src/modules/billing/owner-billing.readback.ts`, `src/modules/billing/internal/operations.ts`.

**`src/modules/discovery/` and `src/modules/seo/`:**
- Purpose: Machine-readable discovery, SEO metadata, `llms.txt`, UCP manifests, sitemap/robots, schema examples.
- Contains: Discovery route support, developer discovery readbacks, source-state/manifest helpers, SEO builders.
- Key files: `src/modules/discovery/public.ts`, `src/modules/discovery/developer-discovery.ts`, `src/modules/discovery/discovery.functions.ts`, `src/modules/seo/public.ts`.

**`src/modules/notification-outbox/`:**
- Purpose: Notification dispatch/readback source state shared by inquiry notification flows.
- Contains: Public notification operations, commands, schema.
- Key files: `src/modules/notification-outbox/public.ts`, `src/modules/notification-outbox/internal/commands.ts`, `src/modules/notification-outbox/internal/schema.ts`.

**`src/modules/observability/`:**
- Purpose: Funnel events, audit records, operator controls, event validation and persistence.
- Contains: Public observability contract, server capture functions, route server functions, internal audit/funnel/schema helpers.
- Key files: `src/modules/observability/public.ts`, `src/modules/observability/funnel.functions.ts`, `src/modules/observability/funnel.capture.server.ts`, `src/modules/observability/internal/audit.ts`.

**`src/modules/security/`:**
- Purpose: Source write admission, admin authority/readbacks, removal disputes, suppression/security tables.
- Contains: Public security operations, source-write admission contract, admin/readback source functions, disputes, schema.
- Key files: `src/modules/security/public.ts`, `src/modules/security/source-write-admission.ts`, `src/modules/security/admin-readback.functions.ts`, `src/modules/security/removal-dispute.functions.ts`.

**`src/modules/dev/`:**
- Purpose: Development seed fixtures and dev-only source state.
- Contains: Dev seed fixture exports.
- Key files: `src/modules/dev/public.ts`, `src/modules/dev/internal/dev-seed-fixture.ts`.

**`src/modules/lifecycle/`:**
- Purpose: Reserved internal lifecycle module directory.
- Contains: Internal directory only in the mapped tree.
- Key files: Not detected.

**`src/lib/`:**
- Purpose: Cross-cutting helpers that are not owned by a domain module.
- Contains: Server transports/adapters, observability bootstraps, UI presentation helpers, operator navigation, HTTP helpers, generic utilities.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/server/require-operator-session.ts`, `src/lib/server/sse-response.ts`, `src/lib/operator/navigation.ts`, `src/lib/ui/provider-presentation.ts`, `src/lib/ui/status-presentation.ts`.
- Rule: Use `src/lib/server/*` for server-only integration helpers; use `src/lib/ui/*` for presentation mapping; put domain rules back in `src/modules/*`.

**`src/hooks/`:**
- Purpose: Shared React hooks.
- Contains: Mounted-state, surface-scope, mobile-query helpers.
- Key files: `src/hooks/use-client-mounted.ts`, `src/hooks/use-ae-surface-scope.ts`, `src/hooks/use-mobile.ts`.

**`src/styles/`:**
- Purpose: Global CSS entry, token bridge, shell/widget/answer styling.
- Contains: `globals.css`, `tokens.css`, `base.css`, `shell-public.css`, `shell-operator.css`, `widgets.css`, `primitives.css`, `legacy.css`, `answer/*` CSS slices.
- Key files: `src/styles/globals.css`, `src/styles/tokens.css`, `src/styles/answer/index.css`, `src/styles/answer/thread.css`, `src/styles/answer/chat-shell.css`, `src/styles/answer/query.css`.
- Rule: Import global CSS only through `src/routes/__root.tsx` via `src/styles/globals.css`; prefer Astryx primitives/Tailwind utilities for new UI and targeted CSS slices only when a component/system requires it.

**`src/app/`:**
- Purpose: Astryx/Meta reference pages checked into the tree.
- Contains: Next-style `page.tsx` examples for chat, chat landing, and library layouts.
- Key files: `src/app/ai-chat/page.tsx`, `src/app/ai-chat-landing/page.tsx`, `src/app/library/page.tsx`.
- Rule: Do not add production AE routes here; TanStack Start URLs live in `src/routes/*`.

**`src/future-phases/`:**
- Purpose: Parked code for phase-specific surfaces/readback helpers.
- Contains: Phase 04/05 route helpers and readback code.
- Key files: `src/future-phases/route-helpers.ts`.
- Rule: Do not import from this directory into active runtime without an explicit phase cutover.

**`convex/`:**
- Purpose: Convex source-state functions, schema composition, auth, crons, generated API files, official AI guidance.
- Contains: `convex/schema.ts`, domain function files, store helpers, `convex/authz.ts`, `convex/auth.config.ts`, `convex/crons.ts`, `convex/_generated/*`.
- Key files: `convex/schema.ts`, `convex/answerThreads.ts`, `convex/harnessSessions.ts`, `convex/inquiries.ts`, `convex/registry.ts`, `convex/businessActions.ts`, `convex/billing.ts`, `convex/sourceWriteAdmission.ts`, `convex/_generated/ai/guidelines.md`.
- Rule: Add Convex function entry points here and keep table schema fragments near owning modules under `src/modules/*/internal/*schema*.ts`.

**`tests/`:**
- Purpose: Guard behavior, architecture, imports, copy, UI contracts, source seams, E2E, deploy smoke, and eval freshness.
- Contains: `tests/unit`, `tests/integration`, `tests/e2e`, `tests/copy`, `tests/ui-contract`, `tests/imports`, `tests/types`, `tests/seo`, `tests/eval`, `tests/deploy-smoke`, helpers and fixtures.
- Key files: `tests/unit/harness/run-loop.test.ts`, `tests/unit/answer-thread/answer-harness-operation.test.ts`, `tests/integration/agent-tools-api.test.ts`, `tests/e2e/thread-first.spec.ts`, `tests/imports/route-boundary.test.ts`.

**`eval/`:**
- Purpose: Answer quality/evaluation suite and promptfoo harness source.
- Contains: Answer test cases, scoring, coverage audit, scripts, assertions, promptfoo config.
- Key files: `eval/answer/promptfooconfig.yaml`, `eval/answer/scripts/run-suite.ts`, `eval/answer/lib/scoring.ts`.

**`public/`:**
- Purpose: Static assets served by the app.
- Contains: Favicon, public images, landing assets.
- Key files: `public/favicon.svg`.

**`.planning/`:**
- Purpose: Planning, architecture contracts, phase docs, audits, graph reports, and codebase maps.
- Contains: Product docs, phase docs, React Doctor output, graphify reports, codebase map docs.
- Key files: `.planning/ANSWER-AI-CONTRACT.md`, `.planning/AE-HARNESS-OMP-REGISTER.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**`.ui-craft/`:**
- Purpose: Design memory and typed UI context.
- Contains: Brief, tokens, spec, decisions, patterns, surface notes, reviews/reports.
- Key files: `.ui-craft/brief.md`, `.ui-craft/tokens.md`, `.ui-craft/spec.md`, `.ui-craft/patterns.md`.

**`.agents/skills/` and `.codex/skills/`:**
- Purpose: Local agent/project skill instructions and GSD/tooling skill mirrors.
- Contains: AE inquiry skill, Convex skills, UI Craft skills, TanStack/Clerk/security/GSD/tooling skills.
- Key files: `.agents/skills/submit-qualified-inquiry/SKILL.md`, `.agents/skills/convex/SKILL.md`, `.codex/skills/tanstack-start/SKILL.md`, `.codex/skills/gsd-map-codebase/SKILL.md`.

## Key File Locations

**Entry Points:**
- `src/start.ts`: Request middleware bootstrap for TanStack Start.
- `src/router.tsx`: Router factory and route typing registration.
- `src/routes/__root.tsx`: Root HTML shell, providers, global CSS, metadata.
- `src/routes/index.tsx`: Public home and query-to-chat entry.
- `src/routes/registry.tsx`: Public registry browse/search page.
- `src/routes/$slug.tsx`: Public business listing page.
- `src/routes/$slug.inquiry.tsx`: Public first-contact inquiry page.
- `src/routes/t.$threadId.tsx`: Public answer thread replay/share route.

**Public APIs and Machine Surfaces:**
- `src/routes/api.answer.turn.ts`: Thread-first SSE answer turn POST.
- `src/routes/api.answer.threads.ts`: Session thread list.
- `src/routes/api.answer.threads.$threadId.ts`: Thread detail API.
- `src/routes/api.answer.follow-up-chips.ts`: Deterministic/LLM follow-up chips route.
- `src/routes/api.agent.tools.ts`: Quiet assistant tool list/invocation.
- `src/routes/api.businesses.ts`: Public catalog list JSON.
- `src/routes/api.businesses.search.ts`: Public catalog search JSON.
- `src/routes/api.businesses.$slug.ts`: Public catalog detail JSON.
- `src/routes/llms[.]txt.ts`: Assistant-readable plain text index.
- `src/routes/$slug.ucp.ts`: Public discovery manifest JSON.
- `src/routes/sitemap[.]xml.ts` and `src/routes/robots[.]txt.ts`: SEO crawler routes.

**Owner/Admin/Developer Routes:**
- `src/routes/owner.inquiries.tsx`: Owner inquiry inbox.
- `src/routes/owner.inquiries.$threadId.tsx`: Owner inquiry thread/reply.
- `src/routes/owner.actions.tsx`: Owner protected contact follow-up queue.
- `src/routes/owner.business-actions.tsx`: Owner business-action queue.
- `src/routes/owner.billing.tsx`: Owner billing overview.
- `src/routes/owner.status.tsx`: Owner status/readback surface.
- `src/routes/admin.inquiries.tsx`: Admin inquiry reconstruction.
- `src/routes/admin.protected-actions.tsx`: Admin protected-action reconstruction.
- `src/routes/admin.business-actions.tsx`: Admin business-action reconstruction.
- `src/routes/admin.monetization.tsx`: Admin billing/monetization reconstruction.
- `src/routes/admin.runs.tsx`: Admin run evidence list.
- `src/routes/admin.runs.$turnId.tsx`: Admin run evidence detail.
- `src/routes/admin.claims.tsx`, `src/routes/admin.audit-events.tsx`, `src/routes/admin.index-health.tsx`: Admin status/readback surfaces.
- `src/routes/developers.discovery.tsx`: Developer discovery route.

**Core Logic:**
- `src/modules/actions/index.ts`: Central explicit action registry.
- `src/modules/common/action.ts`: Action contract.
- `src/modules/harness/public.ts`: Harness public export surface.
- `src/modules/harness/tool-contract.ts`: Action-to-tool contract conversion and exposure allowlists.
- `src/modules/harness/action-tool.ts`: Harness tool runtime adapter.
- `src/modules/harness/run-loop.ts`: Harness run loop.
- `src/modules/answer-thread/internal/turn-orchestrator.ts`: Answer turn control flow.
- `src/modules/answer-thread/internal/tool-runner.ts`: Answer read-tool execution.
- `src/modules/answer-thread/internal/answer-turn-finalization.ts`: Frozen evidence and persistence bridge.
- `src/modules/registry/registry.functions.ts`: Public registry source reads.
- `src/modules/inquiries/inquiry.functions.ts`: Qualified inquiry source reads/writes.
- `src/lib/server/convex-source.ts`: Convex HTTP transport and source refs.
- `src/lib/server/source-write-admission.ts`: Server source-write admission middleware/helper.

**Convex:**
- `convex/schema.ts`: Schema composition root.
- `convex/authz.ts`: Business actor/admin authority from Convex identity.
- `convex/answerThreads.ts`: Answer thread/turn/tool-call functions.
- `convex/harnessSessions.ts`: Harness session/entry functions.
- `convex/inquiries.ts`: Inquiry and owner inbox functions.
- `convex/registry.ts`: Public registry queries.
- `convex/catalog.ts`: Catalog publish/read functions.
- `convex/business.ts`: Business claim/status functions.
- `convex/businessActions.ts`: Business-action source functions.
- `convex/protectedActions.ts`: Protected contact follow-up source functions.
- `convex/billing.ts`: Billing source functions.
- `convex/notificationOutbox.ts`: Notification outbox source functions.
- `convex/sourceWriteAdmission.ts`: Source-write verification helpers.
- `src/modules/*/internal/convex-schema.ts` or `src/modules/*/internal/schema.ts`: Module-owned table fragments.
- `convex/_generated/ai/guidelines.md`: Convex coding guidance.

**Styling/UI System:**
- `src/styles/globals.css`: Global CSS entry imported by `src/routes/__root.tsx`.
- `src/styles/tokens.css`: AE token definitions/bridge.
- `src/styles/base.css`: Base project CSS.
- `src/styles/shell-public.css`: Public shell styling.
- `src/styles/shell-operator.css`: Operator shell styling.
- `src/styles/widgets.css`: Widget-level styling.
- `src/styles/answer/index.css`: Answer CSS aggregator.
- `src/components/astryx/RouterLink.tsx`: Astryx-to-TanStack link bridge.
- `src/components/ae/layout/AePublicShell.tsx`: Public shell.
- `src/components/ae/layout/AeOperatorShell.tsx`: Operator shell.

**Configuration:**
- `package.json`: Scripts, dependencies, package manager.
- `tsconfig.json`: Strict TS options and `@/*` / `~/*` aliases.
- `vite.config.ts`: TanStack Start/Vite/React/Tailwind/Sentry config.
- `vitest.config.ts`: Vitest config.
- `playwright.config.ts`: E2E config.
- `convex/auth.config.ts`: Convex auth provider config.
- `.env.example`: Environment variable example; do not read `.env` or `.env.local` contents.

**Testing:**
- `tests/unit/harness/*.test.ts`: Harness kernel tests.
- `tests/unit/answer-thread/*.test.ts`: Answer-thread tests.
- `tests/integration/agent-tools-api.test.ts`: Quiet agent door tests.
- `tests/integration/answer-tool-calls.test.ts`: Answer tool-call tests.
- `tests/e2e/thread-first.spec.ts`: Thread-first browser flow.
- `tests/imports/*.test.ts`: Boundary/import guardrails.
- `tests/ui-contract/*.test.ts`: Public UI/copy/class contract scans.
- `tests/copy/*.test.ts`: Banned/overclaim copy tests.
- `tests/schema/convex-schema.test.ts`: Convex schema expectations.
- `tests/eval/graph-freshness.test.ts`: Graph freshness guard.

## Naming Conventions

**Files:**
- TanStack routes use file-route names: `src/routes/api.answer.turn.ts`, `src/routes/owner.inquiries.$threadId.tsx`, `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`.
- React AE components use `AePascalCase`: `src/components/ae/chat/AeChat.tsx`, `src/components/ae/harness/AeHarnessRunViewer.tsx`, `src/components/ae/primitives/AeProviderCard.tsx`.
- Domain public seams use `public.ts`: `src/modules/registry/public.ts`, `src/modules/billing/public.ts`.
- Domain source seams use `<module>.functions.ts`: `src/modules/inquiries/inquiry.functions.ts`, `src/modules/billing/billing.functions.ts`.
- Action declarations use `<module>.actions.ts`: `src/modules/registry/registry.actions.ts`, `src/modules/inquiries/inquiry.actions.ts`.
- Convex schema fragments use `internal/convex-schema.ts` where the table set is Convex-specific: `src/modules/harness/internal/convex-schema.ts`.
- Domain table/schema contracts may use `internal/schema.ts`: `src/modules/billing/internal/schema.ts`, `src/modules/business/internal/schema.ts`, `src/modules/registry/internal/schema.ts`.
- Pure domain internals live under `internal/*.ts`: `src/modules/catalog/internal/publish.ts`, `src/modules/harness/internal/run-viewer-projection.ts`.

**Directories:**
- Module directories are lowercase and kebab-case where needed: `src/modules/answer-thread`, `src/modules/business-action`, `src/modules/protected-action`, `src/modules/notification-outbox`.
- AE component subdirectories group by product surface or primitive family: `src/components/ae/chat`, `src/components/ae/registry`, `src/components/ae/inquiries`, `src/components/ae/operator`, `src/components/ae/primitives`.
- Tests mirror domain names under `tests/unit/<module>` and use separate top-level groups for `tests/integration`, `tests/e2e`, `tests/copy`, `tests/ui-contract`, `tests/imports`.

**Types and Values:**
- Status unions use const tuple values plus inferred type: see `src/modules/harness/harness.schema.ts` and `src/modules/answer-thread/answer-thread.schema.ts`.
- Result shapes use discriminated unions with `kind`, `code`, `status`, or `reason` instead of broad string payloads.
- IDs use branded helpers from `src/modules/common/ids.ts` in domain logic.
- Action IDs use dotted names: `registry.search`, `registry.detail`, `inquiry.submit`.

## Where to Add New Code

**New Public Route:**
- Route adapter: `src/routes/<route>.tsx` or `src/routes/<route>.ts`.
- UI: `src/components/ae/<surface>/Ae<Name>.tsx` or direct Astryx primitive composition inside the route for one-off glue.
- Domain readback/source logic: `src/modules/<module>/<module>.functions.ts` or `src/modules/<module>/public.ts`.
- SEO: `src/modules/seo/public.ts` or a focused `src/modules/seo/internal/*.ts` helper.
- Tests: `tests/integration/<route>.test.ts`, `tests/e2e/<surface>.spec.ts`, and copy/UI-contract tests when public copy changes.

**New API Endpoint:**
- Route handler: `src/routes/api.<name>.ts`.
- Shared JSON response helpers: reuse `jsonResponse` from `src/routes/api.businesses.ts` when no-store JSON is enough.
- Domain/source logic: `src/modules/<module>/<module>.functions.ts`.
- Tests: `tests/integration/<name>.test.ts` plus unit tests for module behavior.

**New Server Function Seam:**
- Input schema: Zod schema in `src/modules/<module>/<module>.functions.ts`.
- Server fn: `createServerFn()` with `.validator(...)` and a `.handler(...)` that calls a `*ThroughSource` function.
- Convex refs: `sourceQuery`/`sourceMutation` in the same `*.functions.ts` file.
- Source admission for writes: `sourceWriteAdmissionFromContext` from `src/lib/server/source-write-admission.ts`.
- Tests: module unit tests and integration tests for the route/server seam.

**New Assistant-Callable Operation:**
- Define action: `src/modules/<module>/<module>.actions.ts`.
- Register action: `src/modules/actions/index.ts`.
- Harness exposure/policy: update `src/modules/harness/tool-contract.ts` only when it belongs in quiet-agent or answer-model allowlists.
- Route/API: expose through `src/routes/api.agent.tools.ts`; do not add parallel tool registries.
- Tests: `tests/unit/actions/*.test.ts`, `tests/unit/harness/tool-contract.test.ts`, `tests/integration/agent-tools-api.test.ts`.

**New Answer Model Tool:**
- Action must be read-only and registered through `src/modules/actions/index.ts`.
- Add to `AnswerModelToolIds` in `src/modules/harness/tool-contract.ts` only when the public answer loop is allowed to call it.
- Wire execution through `src/modules/answer-thread/internal/tool-runner.ts`.
- Persist evidence with answer turns through `src/modules/answer-thread/internal/answer-turn-finalization.ts`.
- Tests: `tests/unit/answer-thread/tool-runner.test.ts`, `tests/integration/answer-tool-calls.test.ts`, relevant `eval/answer/*` coverage.

**New Harness Runtime Capability:**
- Public exports: `src/modules/harness/public.ts`.
- Kernel logic: `src/modules/harness/<capability>.ts`.
- Durable state: `src/modules/harness/internal/convex-schema.ts` plus `convex/harnessSessions.ts` or a focused Convex file.
- Admin projection/UI: `src/modules/harness/internal/<projection>.ts`, `src/modules/harness/run-viewer.functions.ts`, `src/routes/admin.*.tsx`, `src/components/ae/harness/*`.
- Tests: `tests/unit/harness/*.test.ts`, `tests/unit/convex/*runtime.test.ts` if Convex-backed.

**New Convex Table:**
- Module schema fragment: `src/modules/<module>/internal/convex-schema.ts` or `src/modules/<module>/internal/schema.ts`.
- Schema composition: import and spread the fragment in `convex/schema.ts`.
- Functions: `convex/<module>.ts`.
- Source function refs: `src/modules/<module>/<module>.functions.ts`.
- Tests: `tests/schema/convex-schema.test.ts`, `tests/unit/convex/<module>-runtime.test.ts`.

**New Source Write:**
- Domain command/result: `src/modules/<module>/public.ts` or `src/modules/<module>/internal/*.ts`.
- Server seam: `src/modules/<module>/<module>.functions.ts`.
- Admission: use `sourceWriteAdmissionFromContext` or `sourceWriteAdmissionFromRequest` from `src/lib/server/source-write-admission.ts`.
- Convex verification: verify source-write admission in `convex/<module>.ts` or `convex/sourceWriteAdmission.ts` helpers.
- Tests: source admission tests under `tests/unit/security` and module runtime tests.

**New Owner/Admin Surface:**
- Route: `src/routes/owner.<name>.tsx`, `src/routes/admin.<name>.tsx`, or nested file-route form such as `src/routes/owner.<name>.$id.tsx`.
- Guard/chrome: spread `operatorRouteOptions` from `src/lib/operator/route-options.ts`.
- Shell/navigation: use `AeOperatorShell` and update `src/lib/operator/navigation.ts` when it should appear in nav/command menu.
- Readback: `src/modules/<module>/<module>.functions.ts` plus a route readback helper when useful.
- UI components: `src/components/ae/operator/*` for generic operator pieces or `src/components/ae/<module>/*` for surface-specific pieces.
- Tests: route integration tests, owner/admin runtime tests, and E2E/a11y when workflow changes.

**New Registry/Catalog Projection:**
- Catalog/domain logic: `src/modules/catalog/internal/*` or `src/modules/registry/internal/*`.
- Public DTO changes: `src/modules/registry/public.ts` and `src/modules/registry/internal/search.ts`.
- Convex functions: `convex/registry.ts` or `convex/catalog.ts`.
- Public routes: `src/routes/api.businesses*.ts`, `src/routes/registry.tsx`, `src/routes/$slug.tsx` when visible.
- Tests: `tests/unit/registry/*`, `tests/integration/registry-api.test.ts`, `tests/ui-contract/public-registry-copy.test.ts`.

**New Inquiry Behavior:**
- Domain operation: `src/modules/inquiries/public.ts` or `src/modules/inquiries/internal/commands.ts`.
- Route readback/form validation: `src/modules/inquiries/route-readbacks.ts`.
- Public/owner source seam: `src/modules/inquiries/inquiry.functions.ts`.
- Convex source: `convex/inquiries.ts` and `src/modules/inquiries/internal/convex-schema.ts`.
- Public inquiry UI: `src/components/ae/inquiries/*` and `src/routes/$slug.inquiry.tsx`.
- Keep boundary copy explicit: no booking, charge, dispatch, quote guarantee, or availability guarantee.

**New Billing / Business-Action / Protected-Action Work:**
- Billing: `src/modules/billing/*`, `convex/billing.ts`, owner/admin routes under `src/routes/owner.billing*` and `src/routes/admin.monetization*`.
- Business action: `src/modules/business-action/*`, `convex/businessActions.ts`, routes under `src/routes/owner.business-actions*` and `src/routes/admin.business-actions*`.
- Protected action: `src/modules/protected-action/*`, `convex/protectedActions.ts`, routes under `src/routes/owner.actions*` and `src/routes/admin.protected-actions*`.
- Source writes: use source-write admission and provider webhook verification; do not add public booking/payment/dispatch promises to catalog/listing UI.

**New Visual/Public Copy Work:**
- Read guidance first: `DESIGN.md`, `.ui-craft/brief.md`, `.ui-craft/tokens.md`, `PRODUCT.md`, `AGENTS.md`.
- Tokens/styles: `src/styles/tokens.css`, `src/styles/globals.css`, or focused files under `src/styles/answer/` / shell CSS files.
- Components: `src/components/ae/*` with Astryx primitives from `@astryxdesign/core`.
- Reference material: inspect `src/app/*/page.tsx` only as a composition source, then implement in `src/routes/*`/`src/components/ae/*`.
- Tests: `tests/copy/*`, `tests/ui-contract/*`, `tests/e2e/a11y/*`.

**Utilities:**
- Cross-module domain primitives: `src/modules/common/*`.
- Server integration helpers: `src/lib/server/*`.
- UI presentation helpers: `src/lib/ui/*`.
- Operator navigation/shell data: `src/lib/operator/*`.
- Avoid broad dumping grounds; place helper code in the smallest owning module first.

## Special Directories

**`convex/_generated/`:**
- Purpose: Convex generated API/server/data model types.
- Generated: Yes.
- Committed: Yes, present in the worktree.
- Rule: Do not edit by hand; regenerate with Convex tooling.

**`convex/_generated/ai/`:**
- Purpose: Official Convex AI guidance state and guidelines.
- Generated: Yes.
- Committed: Yes, present in the worktree.
- Rule: Read `convex/_generated/ai/guidelines.md` before Convex work.

**`src/routeTree.gen.ts`:**
- Purpose: Generated TanStack Router route tree.
- Generated: Yes.
- Committed: Yes, present in the worktree.
- Rule: Do not edit by hand; route changes regenerate it.

**`src/app/`:**
- Purpose: Astryx/Meta reference pages (`src/app/ai-chat/page.tsx`, `src/app/ai-chat-landing/page.tsx`, `src/app/library/page.tsx`).
- Generated: Reference/template source.
- Committed: Yes, present in the worktree.
- Rule: Do not treat as TanStack routes; move adapted runtime code into `src/routes/*` and `src/components/ae/*`.

**`src/future-phases/`:**
- Purpose: Parked code for phase-specific surfaces.
- Generated: No.
- Committed: Yes, present in the worktree.
- Rule: Do not import into active runtime without an explicit phase migration.

**`.planning/`:**
- Purpose: Planning state, architecture contracts, phase docs, audits, graph reports, and codebase maps.
- Generated: Mixed.
- Committed: Yes, planning artifacts are intended repo context.
- Rule: Runtime code must not treat `.planning/` as source state.

**`.ui-craft/`:**
- Purpose: Design memory and typed UI context.
- Generated: Mixed.
- Committed: Yes, present in the worktree.
- Rule: Use as design guidance; do not import into runtime code.

**`.agents/skills/`, `.codex/skills/`, `.claude/skills/`, `.cursor/skills/`:**
- Purpose: Local skill instructions and tool-specific skill mirrors.
- Generated: Mixed.
- Committed: Yes, present in the worktree.
- Rule: Use relevant `SKILL.md` files as agent guidance; do not route product runtime logic through skills.

**`eval/`:**
- Purpose: Answer evaluation suites, promptfoo config, coverage/scoring scripts.
- Generated: No, with generated outputs written under `output/eval/`.
- Committed: Source files are present; outputs are run artifacts.
- Rule: Add answer behavior gates here when changing answer synthesis, model/tool behavior, or retrieval quality.

**`graphify-out/`:**
- Purpose: Generated knowledge graph, graph report, manifest, and cache.
- Generated: Yes.
- Committed: Present in the worktree.
- Rule: Use for codebase intelligence; do not import runtime code from it.

**`output/`, `test-results/`, `playwright-report/`, `.output/`, `.tanstack/`, `.tmp/`, `.promptfoo-home/`:**
- Purpose: Generated build/test/eval/browser/runtime artifacts.
- Generated: Yes.
- Committed: Present in the worktree as runtime artifacts/cache.
- Rule: Do not add runtime imports from these directories.

**`.env`, `.env.local`, `.env.example`:**
- Purpose: Environment configuration.
- Generated: No.
- Committed: `.env.example` is safe reference; `.env` and `.env.local` contents are not read for mapping.
- Rule: Document env var names from source/config only; never paste secret values into docs.

---

*Structure analysis: 2026-07-03*
