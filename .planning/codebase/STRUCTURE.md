# Codebase Structure

**Analysis Date:** 2026-07-07

## Directory Layout

```text
Agentic-Economy/
├── .agents/                 # Repo-specific skill instructions and guardrails
├── .planning/               # GSD plans, phases, scopes, audits, generated maps
├── convex/                  # Convex schema, functions, auth config, generated API
├── docs/                    # Durable engineer/public docs
├── eval/                    # Answer evaluation suites, providers, scripts
├── examples/                # Agent-experience audit examples
├── packages/                # Local SDK/CLI packages
├── public/                  # Static assets, brand/logo/images
├── scripts/                 # Project automation scripts
├── src/                     # TanStack Start app, routes, modules, components
├── tests/                   # Unit, integration, copy, import, e2e, eval tests
├── tools/                   # Tooling helpers
├── vendor/                  # Vendored protocol/reference material
├── workflows/               # Workflow artifacts
├── package.json             # Scripts and dependencies
├── tsconfig.json            # TypeScript strict config and path aliases
├── vite.config.ts           # Vite/TanStack build config
├── vitest.config.ts         # Vitest config
├── playwright.config.ts     # Local browser/e2e config
└── playwright.deploy-smoke.config.ts # Deployed/provider smoke config
```

## Directory Purposes

**`.agents/skills/`:**
- Purpose: Project-specific instructions that constrain implementation and mapping.
- Contains: AE skills for actions/modules, agent identity, agent surfaces, routing/discovery, payments, Convex, design, public copy, verification gates.
- Key files: `.agents/skills/ae-actions-and-modules/SKILL.md`, `.agents/skills/ae-agent-surfaces/SKILL.md`, `.agents/skills/ae-convex-guardrails/SKILL.md`, `.agents/skills/ae-verification-gates/SKILL.md`.

**`.planning/`:**
- Purpose: GSD planning state, phase artifacts, audits, scopes, sketches, generated codebase maps, graphs.
- Contains: `adr/`, `archive/`, `audits/`, `brand/`, `codebase/`, `graphs/`, `phases/`, `scopes/`, `sketches/`, `source-mining/`, `vision/`, `wayfinder/`.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

**`convex/`:**
- Purpose: Convex backend source of record.
- Contains: Domain function files, schema composition, auth config, crons, generated API.
- Key files: `convex/schema.ts`, `convex/registry.ts`, `convex/inquiries.ts`, `convex/business.ts`, `convex/catalog.ts`, `convex/answerThreads.ts`, `convex/clearance.ts`, `convex/_generated/api.d.ts`.

**`docs/`:**
- Purpose: Durable docs for engineers, integrators, businesses, customers, onboarding, architecture.
- Contains: Architecture, contribution/onboarding guide, agent interface reference, public help docs, cleanup ledger, vision.
- Key files: `docs/ARCHITECTURE.md`, `docs/CONTRIBUTING.md`, `docs/ONBOARDING.md`, `docs/AGENT-INTERFACE.md`, `docs/FOR-BUSINESSES.md`, `docs/FOR-CUSTOMERS.md`.

**`eval/`:**
- Purpose: Answer-pipeline evaluation assets and scripts.
- Contains: Answer assertions, providers, promptfoo config, suite/report scripts.
- Key files: `eval/answer/promptfooconfig.yaml`, `eval/answer/scripts/audit-coverage.ts`, `eval/answer/scripts/run-suite.ts`.

**`packages/`:**
- Purpose: Local package outputs for AE CLI/SDK.
- Contains: `packages/ae-cli/`, `packages/ae-sdk/`, and their `dist/` outputs.
- Key files: `packages/ae-cli/dist`, `packages/ae-sdk/dist`.

**`public/`:**
- Purpose: Static public assets.
- Contains: Brand assets, logo files, images, illustrations.
- Key files: `public/brand/logo/ae-favicon.svg`, `public/brand/logo/ae-app-icon.svg`, `public/images/`.

**`src/`:**
- Purpose: Application source.
- Contains: App entry helpers, components, hooks, lib infrastructure, domain modules, routes, server helpers, styles, views.
- Key files: `src/start.ts`, `src/router.tsx`, `src/routeTree.gen.ts`, `src/routes/__root.tsx`, `src/modules/actions/index.ts`.

**`tests/`:**
- Purpose: Verification suite and architectural guardrails.
- Contains: Unit, integration, copy, import, source-mining, TypeScript standards, SEO, e2e, a11y, eval, provider smoke, fixtures.
- Key files: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/copy/`, `tests/unit/`, `tests/integration/`, `tests/e2e/`.

**`vendor/`:**
- Purpose: Vendored protocol/reference material that must not become runtime authority by accident.
- Contains: `vendor/handshake-protocol-kernel/`.
- Key files: `vendor/handshake-protocol-kernel/`.

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start request middleware.
- `src/router.tsx`: Router factory over `src/routeTree.gen.ts`.
- `src/routes/__root.tsx`: Root document, providers, CSS, observability shell.
- `src/routeTree.gen.ts`: Generated file-route tree; do not edit manually.

**Routes:**
- `src/routes/index.tsx`: Home/answer entry route.
- `src/routes/registry.tsx`: Public registry UI.
- `src/routes/$slug.tsx`: Public business detail route.
- `src/routes/$slug.inquiry.tsx`: Public inquiry form route.
- `src/routes/_operator.tsx`: Shared owner/admin route group.
- `src/routes/_operator/owner.*.tsx`: Owner UI.
- `src/routes/_operator/admin.*.tsx`: Admin UI.
- `src/routes/_operator/developers.discovery.tsx`: Developer discovery UI.
- `src/routes/api.*.ts`: HTTP API and provider endpoints.
- `src/routes/llms[.]txt.ts`, `src/routes/robots[.]txt.ts`, `src/routes/sitemap[.]xml.ts`: Discovery/SEO files.

**Configuration:**
- `package.json`: Runtime scripts, dependencies, package manager declaration.
- `tsconfig.json`: Strict TypeScript options and path aliases `@/*`, `~/*`, owner/admin route aliases.
- `vite.config.ts`: Vite/TanStack build configuration.
- `vitest.config.ts`: Vitest configuration.
- `playwright.config.ts`: Local E2E configuration.
- `playwright.deploy-smoke.config.ts`: Deploy/provider smoke configuration.
- `autumn.config.ts`: Autumn billing product-ops configuration.
- `convex/auth.config.ts`: Convex auth configuration.
- `.env.example`: Example environment variables. Do not read or quote `.env.local`.
- `.env.local`: Present; contains local environment configuration and must not be read or quoted.

**Core Logic:**
- `src/modules/common/action.ts`: Core action contract type and descriptor conversion.
- `src/modules/actions/index.ts`: Central action registry.
- `src/modules/registry/`: Public catalog list/search/detail logic.
- `src/modules/inquiries/`: Qualified inquiry flow and owner inbox/thread logic.
- `src/modules/answer/`: Answer generation, grounding, model/tool-use logic.
- `src/modules/answer-thread/`: Thread state, turn orchestration, SSE/tool records.
- `src/modules/harness/`: Tool contracts, run loop, policy, evidence/session infrastructure.
- `src/modules/clearance/`: Agent identity, mandates, signing, write admission.
- `src/modules/security/`: Source-write admission, disputes, admin authority/readbacks.
- `src/modules/observability/`: Audit/funnel/operator-control/source-sync state.
- `src/lib/server/convex-source.ts`: Convex source transport wrapper.
- `src/lib/ui/contract-scans.ts`: Static guardrail scanners for imports/copy/source boundaries.

**Convex:**
- `convex/schema.ts`: Schema composition root.
- `convex/_generated/`: Generated Convex API/data model/server files; do not edit.
- `convex/registry.ts`, `convex/catalog.ts`, `convex/business.ts`: Catalog and public registry functions.
- `convex/inquiries.ts`: Inquiry persistence and owner/customer readbacks.
- `convex/answerThreads.ts`, `convex/harnessSessions.ts`: Answer and harness run/session state.
- `convex/clearance.ts`: Agent principal/mandate/protocol store functions.
- `convex/sourceWriteAdmission.ts`, `convex/security.ts`: Security/source-write state.
- `convex/capabilityCheck.ts`: `"use node"` action-only endpoint check pattern for Node built-ins.

**Testing:**
- `tests/unit/`: Domain/unit tests by module.
- `tests/integration/`: Route/server/domain integration tests.
- `tests/imports/`: Architecture import and route-boundary guardrails.
- `tests/copy/`: Public/assistant copy and claim guardrails.
- `tests/types/`: Contract/type drift assertions.
- `tests/e2e/`: Playwright browser tests.
- `tests/e2e/a11y/`: Accessibility browser tests.
- `tests/seo/`: SEO/discovery output tests.
- `tests/fixtures/bad-*`: Negative fixtures for scanner tests; use only with `:*:fixtures` scripts.

## Module Ownership Map

| Module | Owns | Public seam |
|--------|------|-------------|
| `src/modules/actions/` | Central registry of action definitions | `src/modules/actions/index.ts` |
| `src/modules/common/` | Shared action, result, audit, ID, hashing primitives | Direct named files such as `src/modules/common/action.ts` |
| `src/modules/business/` | Business identity, claim/public/suppression state | `src/modules/business/public.ts` |
| `src/modules/catalog/` | Owner claim/publish flows and catalog DTOs | `src/modules/catalog/public.ts`, `src/modules/catalog/owner-claim.functions.ts` |
| `src/modules/registry/` | Public listing/search/detail and inquiry-target resolution | `src/modules/registry/public.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/registry/registry.actions.ts` |
| `src/modules/discovery/` | `llms.txt`, UCP-shaped discovery, sitemap/robots helpers | `src/modules/discovery/public.ts`, `src/modules/discovery/discovery.functions.ts` |
| `src/modules/inquiries/` | Qualified inquiry submit, receipts, owner inbox/thread | `src/modules/inquiries/public.ts`, `src/modules/inquiries/inquiry.functions.ts`, `src/modules/inquiries/inquiry.actions.ts` |
| `src/modules/answer/` | Tool-use answer generation, grounding, answer snapshots | `src/modules/answer/public.ts` |
| `src/modules/answer-thread/` | Thread/turn persistence, turn orchestration, tooling records | `src/modules/answer-thread/public.ts`, `src/modules/answer-thread/answer-thread.functions.ts` |
| `src/modules/harness/` | Tool contracts, policy, evidence envelopes, run loop/session journal | `src/modules/harness/public.ts`, `src/modules/harness/harness.functions.ts` |
| `src/modules/clearance/` | Agent identity, mandates, signing, write admission | `src/modules/clearance/public.ts`, `src/modules/clearance/server.ts`, `src/modules/clearance/clearance.functions.ts` |
| `src/modules/security/` | Source-write admission, disputes, duplicates, admin authority/readbacks | `src/modules/security/public.ts`, `src/modules/security/source-write-admission.ts` |
| `src/modules/observability/` | Audit/funnel/source sync/operator controls | `src/modules/observability/public.ts`, `src/modules/observability/funnel.functions.ts` |
| `src/modules/settings/` | Owner notification preferences | `src/modules/settings/public.ts`, `src/modules/settings/settings.functions.ts`, `src/modules/settings/settings.actions.ts` |
| `src/modules/storefront/` | Storefront draft import | `src/modules/storefront/public.ts`, `src/modules/storefront/storefront.functions.ts`, `src/modules/storefront/storefront.actions.ts` |
| `src/modules/demand/` | Demand capture for unmet searches/intents | `src/modules/demand/demand.functions.ts`, `src/modules/demand/demand.actions.ts` |
| `src/modules/capabilities/` | Capability model and endpoint check standards | `src/modules/capabilities/public.ts` |
| `src/modules/protected-action/` | Owner/admin protected action queues and follow-up contracts | `src/modules/protected-action/public.ts`, `src/modules/protected-action/contact-follow-up.functions.ts` |
| `src/modules/business-action/` | Business-action proposals, Stripe evidence, owner/admin readbacks | `src/modules/business-action/public.ts`, `src/modules/business-action/business-action.functions.ts`, `src/modules/business-action/business-action.actions.ts` |
| `src/modules/billing/` | Owner billing authority/readbacks and provider evidence | `src/modules/billing/public.ts`, `src/modules/billing/billing.functions.ts` |
| `src/modules/notification-outbox/` | Notification outbox source state | `src/modules/notification-outbox/public.ts` |
| `src/modules/lifecycle/` | Descriptor-only future moat/reference verticals | `src/modules/lifecycle/public.ts` |
| `src/modules/seo/` | Public route metadata and JSON-LD helpers | `src/modules/seo/public.ts`, `src/modules/seo/public-route.ts` |
| `src/modules/dev/` | Dev seed fixture data | `src/modules/dev/public.ts` |

## Naming Conventions

**Files:**
- `*.tsx`: React route/components, owner/admin panels, UI.
- `*.ts`: Domain logic, route handlers, schemas, server functions.
- `src/routes/api.<name>.ts`: Machine HTTP routes with `createFileRoute('/api/...')`.
- `src/routes/_operator/<role>.<area>[.$param].tsx`: Owner/admin/developer operator routes.
- `src/routes/$slug.*`: Dynamic public listing child routes.
- `src/routes/llms[.]txt.ts`, `robots[.]txt.ts`, `sitemap[.]xml.ts`: Literal-dot file routes.
- `src/modules/<domain>/<domain>.actions.ts`: Action definitions.
- `src/modules/<domain>/<domain>.functions.ts`: TanStack server functions and `*ThroughSource` adapters.
- `src/modules/<domain>/public.ts`: Public import seam.
- `src/modules/<domain>/internal/schema.ts` or `internal/convex-schema.ts`: Module-owned table fragment.
- `convex/<domain>.ts`: Convex domain functions.
- `*.test.ts`, `*.spec.ts`: Vitest/Playwright tests depending on test tree.

**Directories:**
- `src/modules/<domain>/internal/`: Private implementation and schema. Import only within same module or from `convex/schema.ts` for schema composition.
- `src/routes/_operator/`: Physical route group for owner/admin/developer URLs.
- `tests/unit/<domain>/`: Unit tests aligned with module/domain names.
- `tests/fixtures/bad-*`: Negative scanner fixtures.

**Identifiers:**
- Action IDs use dot namespaces such as `registry.search`, `registry.detail`, `inquiry.submit`.
- Convex index names follow `by_field1_and_field2` in field order.
- Server functions use names such as `submitPublicInquiryServer`; shared source adapters use names such as `submitPublicInquiryThroughSource`.
- Route handlers use `handle*Request` or `handle*` names and return `Response` for machine routes.
- Pinned allowlists use `PascalCase` constants such as `PublicQuietAgentToolIds` and `AnswerModelToolIds`.

## Where to Add New Code

**New Public Page:**
- Primary code: `src/routes/<route>.tsx`
- Domain logic: existing or new module under `src/modules/<domain>/`
- Shared UI: prefer Astryx components and existing `src/components/astryx/`; do not add new bespoke UI systems.
- Tests: `tests/e2e/`, `tests/unit/ui/`, `tests/copy/` if public copy changes.

**New Operator Page:**
- Primary code: `src/routes/_operator/owner.<area>.tsx`, `src/routes/_operator/admin.<area>.tsx`, or `src/routes/_operator/developers.<area>.tsx`
- Server data: `src/modules/<domain>/<domain>.functions.ts`
- Auth/session: use existing server session helpers in `src/lib/server/`
- Tests: `tests/unit/<domain>/`, `tests/integration/`, `tests/e2e/` as appropriate.

**New HTTP/API Route:**
- Primary code: `src/routes/api.<area>.ts`
- Domain work: `src/modules/<domain>/public.ts` or `src/modules/<domain>/*.functions.ts`
- Response helper: reuse patterns from `src/routes/api.businesses.ts`
- Tests: `tests/integration/`; run `npm run test:imports` if imports cross route/module boundaries.

**New Action:**
- Implementation: `src/modules/<domain>/<domain>.actions.ts`
- Shared execution: delegate `run` to `src/modules/<domain>/<domain>.functions.ts` `*ThroughSource` function.
- Registration: add explicit import and array entry in `src/modules/actions/index.ts`.
- Quiet public tool exposure: also update `PublicQuietAgentToolIds` in `src/modules/harness/tool-contract.ts` only when intended.
- Tests: domain unit/integration tests, `npm run test:copy` for summary/boundary text, `npm run test:imports` for seam changes.

**New Durable State/Table:**
- Schema fragment: `src/modules/<domain>/internal/schema.ts` or `src/modules/<domain>/internal/convex-schema.ts`
- Composition: spread the fragment in `convex/schema.ts`
- Functions: `convex/<domain>.ts`
- Source adapters: `src/modules/<domain>/<domain>.functions.ts`
- Tests: `tests/unit/schema/`, domain unit tests, `npm run check:convex-codegen`, `npm run typecheck`.

**New Convex Function:**
- Implementation: `convex/<domain>.ts`
- Pure/domain helpers: `src/modules/<domain>/internal/*` only if Convex-bundle-safe.
- Node built-ins: isolate in an action-only `"use node"` file like `convex/capabilityCheck.ts`.
- Tests: domain unit/integration tests and `npm run check:convex-codegen`.

**New Answer/Router Behavior:**
- Primary code: `src/modules/answer/internal/*` or `src/modules/answer-thread/internal/*`
- Tool exposure: derive specs from action definitions through existing tooling; do not create parallel tool contracts.
- Evidence/accounting: use `src/modules/harness/` and answer-thread tooling.
- Tests: `tests/unit/answer/`, `tests/unit/answer-thread/`, `tests/integration/`, `tests/eval/`.

**New Discovery Surface:**
- Primary code: `src/modules/discovery/internal/*`
- Route: `src/routes/llms[.]txt.ts`, `src/routes/$slug.ucp.ts`, `src/routes/api.discovery.*.ts`, or new route as appropriate.
- Tests: `tests/seo/`, `tests/copy/`, `tests/integration/`.

**New Provider Integration:**
- Server-only implementation: `src/lib/server/*` or owning module `internal/*`
- Route/webhook: `src/routes/api.<provider-or-domain>*.ts`
- Provider source state: owning module or `src/modules/notification-outbox/`, `src/modules/billing/`, `src/modules/business-action/` depending on domain.
- Tests: provider smoke under `tests/deploy-smoke/` only when real external inputs are expected; local unit/integration tests for admission/signature/refusal logic.

**Utilities:**
- Cross-domain primitives: `src/modules/common/` only for domain-safe shared types/helpers.
- Runtime/server utilities: `src/lib/server/`.
- HTTP utilities: `src/lib/http/`.
- UI contract scanners/copy guardrails: `src/lib/ui/contract-scans.ts`.
- Components: `src/components/astryx/` for Astryx bridges, existing `src/components/ae/` only where legacy/custom behavior already exists.

## Special Directories

**`src/routeTree.gen.ts`:**
- Purpose: TanStack Router generated route tree.
- Generated: Yes.
- Committed: Yes.
- Rule: Do not hand-edit; route files drive generation.

**`convex/_generated/`:**
- Purpose: Convex generated API/data model/server types.
- Generated: Yes.
- Committed: Yes in this checkout.
- Rule: Do not hand-edit; generated by Convex codegen.

**`src/future-phases/`:**
- Purpose: Future/deferred phase source snapshots or prototypes excluded from TypeScript compile.
- Generated: No.
- Committed: Yes.
- Rule: Not part of active runtime; `tsconfig.json` excludes it.

**`tests/fixtures/bad-*`:**
- Purpose: Negative fixtures for scanner tests.
- Generated: No.
- Committed: Yes.
- Rule: Do not treat scanner-fixture violations as live runtime violations; run `:*:fixtures` scripts only when changing scanners.

**`.planning/archive/`:**
- Purpose: Historical GSD artifacts and audits.
- Generated: Partly.
- Committed: Yes.
- Rule: Do not use as live architecture authority without verifying against source.

**`packages/*/dist/`:**
- Purpose: Built local package outputs.
- Generated: Yes.
- Committed: Present in this checkout.
- Rule: Prefer source/package scripts for changes; avoid manual edits to built output unless explicitly maintaining published artifacts.

**`.env.local`:**
- Purpose: Local environment configuration.
- Generated: No.
- Committed: Unknown from this scan.
- Rule: Secret-bearing; existence only. Never read or quote contents.

**`.env.example`:**
- Purpose: Example environment documentation.
- Generated: No.
- Committed: Yes.
- Rule: Safe to use as env variable reference if needed; do not infer secret values.

## Planning and Docs Organization

**Durable docs:**
- `docs/ARCHITECTURE.md`: Curated engineer architecture summary.
- `docs/CONTRIBUTING.md`: Contributor guardrails digest.
- `docs/ONBOARDING.md`: Local setup and verification ladder.
- `docs/AGENT-INTERFACE.md`: External integrator reference.
- `CLAUDE.md`: Assistant operating guide present in repo root.

**Generated maps:**
- `.planning/codebase/ARCHITECTURE.md`: Full generated architecture map for planning/execution agents.
- `.planning/codebase/STRUCTURE.md`: Full generated structure and placement map.

**Phase artifacts:**
- `.planning/phases/`: Active phase directories.
- `.planning/scopes/`: Scope-level planning and verification artifacts.
- `.planning/archive/`: Archived phases/audits/spikes; historical, not source authority.

## Verification Commands By Structure Change

Use the narrowest reliable gate first, then broaden as risk increases:

```bash
npm run typecheck              # Any TypeScript/runtime source change
npm run check:convex-codegen   # Convex schema/function/module graph changes
npm run test:unit              # Domain logic changes
npm run test:integration       # Route/server/source-adapter behavior
npm run test:imports           # Module public seam or route-boundary changes
npm run test:copy              # Public or assistant-visible copy/action text
npm run test:seo               # llms.txt, sitemap, robots, JSON-LD, noindex/canonical
npm run test:all               # Broad local pre-PR gate
```

---

*Structure analysis: 2026-07-07*
