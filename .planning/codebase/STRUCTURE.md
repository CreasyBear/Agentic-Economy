# Codebase Structure

**Analysis date:** 2026-07-10

## Repository Layout

```text
Agentic-Economy/
├── src/                         Shipped TanStack Start application
│   ├── routes/                  File routes, HTTP handlers, route-local helpers
│   ├── modules/                 Domain modules and stable module boundaries
│   ├── components/              Shared React UI
│   ├── lib/                     Cross-cutting infrastructure and presentation helpers
│   ├── styles/                  Global CSS, tokens, and legacy bridge styles
│   ├── hooks/                   Small shared client hooks
│   ├── future-phases/           Excluded/non-shipping future material
│   ├── router.tsx               Router factory
│   ├── routeTree.gen.ts         Generated TanStack route tree
│   └── start.ts                 TanStack server request middleware
├── convex/                      Convex functions, composed schema, generated bindings
├── tests/                       Unit, integration, E2E, boundary, copy, and contract tests
├── eval/answer/                 Answer-quality evaluation cases, scoring, and runners
├── public/                      Static brand and illustration assets
├── docs/                        Curated product/engineering documentation
├── scripts/                     Repository automation and operational checks
├── examples/agent-experience/   Agent-interface audit harness/example
├── vendor/                      Vendored protocol kernel material
├── workflows/                   Workflow artifacts
├── packages/                    Local generated SDK/CLI dist output; not active workspaces
├── .planning/                   GSD state, maps, plans, audits, research, and design records
├── .agents/skills/              Repository-owned agent skills
├── package.json                 Runtime dependencies and verification commands
├── vite.config.ts               Web build/deployment configuration
├── vitest.config.ts             Vitest configuration
├── playwright.config.ts         Browser/E2E configuration
├── tsconfig.json                Strict TypeScript and path aliases
├── DESIGN.md                    Design-system authority
├── PRODUCT.md                   Product truth and positioning layers
└── CONTEXT.md                   Current domain/context material
```

## `src/routes/`: Application Edges

TanStack Router derives paths from filenames. The generated graph is `src/routeTree.gen.ts`; authored routes are under `src/routes/`.

### Public pages

- `src/routes/index.tsx`: home/answer entry surface.
- `src/routes/registry.tsx`: searchable public provider registry.
- `src/routes/$slug.tsx`: public provider detail.
- `src/routes/$slug.inquiry.tsx`: qualified inquiry form for a provider.
- `src/routes/claim.tsx` and `src/routes/claim.success.tsx`: owner claim flow.
- `src/routes/t.$threadId.tsx`, `src/routes/i.$threadId.tsx`, `src/routes/q.$answerId.tsx`: public answer/inquiry/share projections.
- `src/routes/r.tsx` and `src/routes/r.$requestId.tsx`: request-hub surfaces.
- `src/routes/about.tsx`, `help.tsx`, `privacy.tsx`, `terms.tsx`: informational/legal pages.

### Operator pages

`src/routes/_operator.tsx` is a pathless shared operator layout. Its children are in `src/routes/_operator/`:

- `owner.*`: owner status, inquiries, protected/business actions, billing, receipts, and settings.
- `admin.*`: claims, inquiries, action proposals, monetization, runs, audit events, and index health.
- `developers.discovery.tsx`: developer discovery readback.
- `-*.ts(x)`: route-local readback adapters, panels, facts, forms, and row components.

The TypeScript aliases in `tsconfig.json` map `@/routes/owner.*`, `@/routes/admin.*`, and `@/routes/developers.discovery` to this pathless route directory.

### Machine and integration routes

- `src/routes/api.businesses.ts`, `api.businesses.search.ts`, `api.businesses.$slug.ts`: public catalog JSON.
- `src/routes/api.answer*.ts`, `api.chat*.ts`: answer, model, thread, and SSE turn endpoints.
- `src/routes/api.agent.tools.ts`: quiet action discovery/invocation.
- `src/routes/api.discovery.*.ts`: discovery schemas, examples, and fixtures.
- `src/routes/api.storefront.import-draft.ts`: guarded storefront draft import.
- `src/routes/api.billing.webhook.ts` and `api.business-actions.stripe-webhook.ts`: Stripe/Autumn event boundaries.
- `src/routes/api.notification.*.ts`: Resend/Novu dispatch and webhook boundaries.
- `src/routes/api.observability.funnel.ts`: client funnel capture.
- `src/routes/llms[.]txt.ts`, `robots[.]txt.ts`, `sitemap[.]xml.ts`, `$slug.ucp.ts`, `SKILL[.]md.ts`, and `[.]well-known/`: discovery/crawler/assistant artifacts.

### Route-local files

Leading-hyphen files such as `src/routes/-home-landing.tsx`, `src/routes/-registry-search-controls.tsx`, and `src/routes/_operator/-owner-inquiries-readback.ts` are colocated implementation details excluded from route generation. Prefer this location when a component or readback adapter has exactly one route owner; promote it to `src/components/` or a module only when it becomes shared.

## `src/modules/`: Domain Ownership

Each directory is a bounded domain or an explicit shared seam.

```text
src/modules/<domain>/
├── public.ts                    Stable types and domain operations
├── <domain>.functions.ts        Server/Convex transport adapters (where used)
├── <domain>.actions.ts          Reusable Action contracts (where exposed)
├── server.ts                    Explicit server-only exports (selected modules)
└── internal/                    Private policies, validators, projections, schema
```

Current modules:

| Directory | Responsibility |
|---|---|
| `actions/` | Explicit registry of all reusable Actions. |
| `common/` | IDs, results, hashes, action types, audit contracts. |
| `business/` | Owner/business/claim identity and visibility. |
| `catalog/` | Published services/capabilities and owner publish flow. |
| `registry/` | Public catalog read/search/detail and search projection. |
| `discovery/` | Assistant/crawler manifests and source-state artifacts. |
| `inquiries/` | Qualified inquiry and owner/customer thread flows. |
| `procurement/` | Request hub and provider matching. |
| `answer/` | Grounded answer generation and evidence/safety gates. |
| `answer-thread/` | Thread persistence, turn orchestration, tools, projections. |
| `harness/` | Agent/eval run, approval, evidence, replay, and tool contracts. |
| `clearance/` | Principals, signatures, mandates, Web Bot Auth. |
| `security/` | Authz support, CSRF, rate limits, disputes, admission. |
| `protected-action/` | Owner-pending proposal and gateway contracts. |
| `business-action/` | Business action proposals, reservations, Stripe evidence. |
| `billing/` | Billing operations and provider readbacks. |
| `notification-outbox/` | Durable notification state and commands. |
| `observability/` | Audit, funnel, outbox, operator control, source sync. |
| `settings/` | Owner settings and notification preferences. |
| `storefront/` | Guarded external import into an owner-reviewed draft. |
| `demand/` | Unmet-demand capture. |
| `capabilities/` | Capability manifests and endpoint check standard. |
| `seo/` | Canonical, metadata, JSON-LD, and public-route SEO. |
| `lifecycle/` | Lifecycle descriptors/reference vertical. |
| `dev/` | Development seed fixtures. |

Do not bypass another module's `public.ts` from production code unless the importing file is an explicitly designated adapter. Tests may target `internal/` to prove private algorithms, but routes must not.

## `convex/`: Durable Source Functions

`convex/schema.ts` composes schema fragments owned by `src/modules/*/internal/`. Domain-named Convex files provide the runtime boundary:

- Core product state: `convex/business.ts`, `catalog.ts`, `registry.ts`, `inquiries.ts`, `answerThreads.ts`, `procurement.ts`.
- Trust and protected flows: `convex/authz.ts`, `authzMigration.ts`, `clearance.ts`, `security.ts`, `protectedActions.ts`, `businessActions.ts`, `sourceWriteAdmission.ts`.
- Operations: `convex/billing.ts`, `notificationOutbox.ts`, `settings.ts`, `observability.ts`, `harnessSessions.ts`.
- Discovery/capability: `convex/discovery.ts`, `capabilities.ts`, `capabilityCheck.ts`.
- Shared storage helpers: `convex/source_state.ts`, `billingStore.ts`, `businessActionStore.ts`, `protectedActionStore.ts`, `devSeedStore.ts`.
- Scheduling/dev: `convex/crons.ts`, `devSeed.ts`, `spikeHandshakeRuntime.ts`.
- Auth configuration: `convex/auth.config.ts`.
- Generated bindings: `convex/_generated/` (never hand-edit).

Schema fragments should remain with their owning modules; `convex/schema.ts` should not accumulate domain validators or business logic.

## `src/components/`: Shared Presentation

`src/components/ae/` is organized by UI responsibility rather than page:

- Foundation: `primitives/`, `layout/`, `forms/`, `feedback/`, `status/`, `motion/`.
- Product: `landing/`, `listing/`, `inquiries/`, `operator/`, `readback/`.
- Agent/answer: `chat/`, `artifacts/`, `harness/`.

`src/components/ai-elements/` contains lower-level message, reasoning, source, shimmer, and suggestion components. `src/components/astryx/` contains application adapters for Astryx, notably router links and navigation progress. Shared UI should be design-system-backed; single-page UI belongs beside its route.

## `src/lib/`: Cross-Cutting Infrastructure

- `src/lib/server/`: Convex transport, Clerk/operator sessions, bounded request bodies, SSE responses, canonical URLs, webhook/provider adapters, constant-time checks, and source-write admission.
- `src/lib/http/`: discovery response and security-header helpers.
- `src/lib/observability/`: Sentry/PostHog client/server adapters and capture helpers.
- `src/lib/operator/`: operator navigation and route options.
- `src/lib/ui/`: copy, status/provider presentation, time formatting, toast, contract scans, and local E2E client bypass.
- `src/lib/utils.ts`: small generic utility seam.

Keep domain-specific logic out of `src/lib/`; if a rule speaks in business, inquiry, registry, billing, or authorization language, its owner should normally be the corresponding module.

## Styling and Static Assets

- `src/styles/tokens.css`: application token definitions/bridges.
- `src/styles/base.css`: base element behavior.
- `src/styles/globals.css`: global composition imported by `src/routes/__root.tsx`.
- `src/styles/legacy.css`: contained legacy styling pending migration.
- `public/brand/logo/`: production logo/icon assets.
- `public/images/illustration/`: category, map, empty-state, and editorial illustrations.

The design contract is documented in `DESIGN.md`; Astryx packages are the component/theme implementation authority.

## Tests and Evaluation Structure

`tests/` separates proof by boundary:

- `tests/unit/`: pure domain, component, schema, Convex-runtime, and security tests, usually grouped by module.
- `tests/integration/`: route-to-module and multi-domain flows.
- `tests/e2e/`: browser journeys; `tests/e2e/a11y/` contains accessibility flows.
- `tests/deploy-smoke/`: hosted-provider and deployment-boundary smoke tests.
- `tests/dev-smoke/`: local developer/runtime smokes.
- `tests/imports/`: source hygiene and module/route dependency rules.
- `tests/copy/`: public language and overclaim gates.
- `tests/ui-contract/`: design-system and UI contract scans.
- `tests/seo/`, `tests/types/`, `tests/eval/`, `tests/ai/`, `tests/spike/`: focused proof suites.
- `tests/fixtures/` and `tests/helpers/`: controlled invalid fixtures and shared test utilities.
- `tests/scripts/`: executable repository assertions such as graph freshness.

`eval/answer/` is separate from ordinary unit tests because it owns answer cases, evaluators, scoring, coverage audit, Promptfoo configuration, and live/offline study runners. Generated reports belong under `output/`, not source directories.

## Documentation and Planning

- `docs/ARCHITECTURE.md`: curated, human-maintained architecture overview.
- `docs/AGENT-INTERFACE.md`: assistant-facing integration guidance.
- `docs/ONBOARDING.md`, `docs/CONTRIBUTING.md`: engineer workflows.
- `docs/FOR-BUSINESSES.md`, `docs/FOR-CUSTOMERS.md`, `docs/VISION.md`: audience/domain material.
- `docs/agents/`: issue-tracker, domain, and triage instructions for agents.
- `.planning/STATE.md`: current GSD execution state when present.
- `.planning/phases/`, `scopes/`, `adr/`, `research/`, `audits/`: planning and evidence artifacts.
- `.planning/codebase/`: generated current-state repository maps, including this document.
- `.planning/graphs/`: derived dependency/graph material; source files outrank generated graph claims.
- `.planning/brand/` and root `PRODUCT.md`/`DESIGN.md`: product, copy, and visual authorities.

## Generated, Derived, and Non-Source Directories

Do not treat these as authored application source:

- `src/routeTree.gen.ts`: generated route graph.
- `convex/_generated/`: generated Convex API/data-model bindings.
- `.tanstack/`, `.vercel/`: tool/deployment state.
- `output/`, `outputs/`: evaluation/manual run artifacts.
- `playwright-report/`, `test-results/`: browser test artifacts.
- `graphify-out/`: derived graph output/cache.
- `packages/ae-sdk/dist/`, `packages/ae-cli/dist/`: generated local distribution artifacts, not active workspace packages.
- `src/future-phases/`: excluded by `tsconfig.json` and not part of the current shipped surface.

## Naming and Placement Rules

- Use `@/` for imports rooted at `src/`; avoid deep relative traversal across domains.
- Name stable domain exports `public.ts`; name transport adapters `*.functions.ts`; name action declarations `*.actions.ts`.
- Put private domain implementation and owned schema under `internal/`.
- Use leading `-` for route-local files that TanStack must exclude from route generation.
- Keep Convex functions domain-named and module schema fragments module-owned.
- Add shared React components under the narrowest `src/components/ae/<responsibility>/` directory.
- Do not hand-edit generated route or Convex files.
- Do not add a new cross-cutting helper to `src/lib/` when an existing domain owns the vocabulary.

## Current Tree Caution

The repository was heavily dirty during this scan: numerous tracked files are modified or deleted, and many current route/module/test files are untracked. The structure above is a map of the live working directory on 2026-07-10, not merely `HEAD`. Preserve unrelated changes and use `git diff -- <path>` before editing any area. A later clean-checkout map may differ if this concurrent work is not committed.
