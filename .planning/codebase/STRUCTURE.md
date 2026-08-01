---
name: structure
kind: codebase-map
analysis_date: 2026-08-01
refreshed: 2026-08-01
---

# Repository Structure Map

**Analysis date:** 2026-08-01  
**Repository:** `Agentic-Economy`  
**Scope:** all first-party source, configuration, tests, evaluation, tooling, documentation, and runtime boundary directories.

## Root layout

```text
`package.json` / `package-lock.json`     package metadata, scripts, pinned dependency graph
`tsconfig.json`                          strict TypeScript project and path aliases
`vite.config.ts`                         TanStack Start/Nitro/Vercel build and dev wiring
`vitest.config.ts` / `playwright.config.ts` test runners and browser defaults
`components.json`                        shadcn/ui component configuration
`.env.example` / `.env.local`            declared and local runtime configuration
`src/`                                   browser, route, module, and server helper source
`convex/`                                Convex functions, schema fragments, config, and HTTP
`tests/`                                 unit, integration, E2E, import-boundary, SEO, and smoke tests
`eval/`                                  answer/engine/product-foundry/parity evaluation programs
`tools/` / `scripts/`                    CLI, development hosts, release checks, audits
`docs/` / `.planning/`                   durable engineering/domain docs and planning artifacts
`public/`                                static brand assets and images
`.github/workflows/`                     CI release and React diagnostics workflows
`vendor/` / `examples/`                  provenance record and external/runtime examples
`.convex/` / `.tanstack/` / `.vercel/`   generated/local deployment state; not primary source
```

The root scripts are the operational index: local development is `npm run dev`/`npm run dev:local`, source checks are `npm run typecheck` and `npm run lint`, and the test matrix is split into unit, integration, eval, E2E, type, import, SEO, UI-contract, and build commands (`package.json:7-56`).

## Application source (`src/`)

### Startup, routing, and global document

| Location | Contents and ownership |
| --- | --- |
| `src/start.ts` | TanStack Start server middleware chain: observability, headers, content negotiation, CSRF, source-write admission, and Clerk. |
| `src/router.tsx` | Router factory; consumes generated route tree and sets preload/pending/not-found/scroll defaults. |
| `src/routeTree.gen.ts` | TanStack Router generated route registration; imports every file route and must not be edited by hand (`src/routeTree.gen.ts:7-9`). |
| `src/routes/__root.tsx` | Root document, CSS/head links, conditional Clerk provider, error boundary, route progress, observability boot, and toast/script hosts. |
| `src/content/brand-copy.ts` | Shared product/brand text imported by pages and metadata. |
| `src/styles/` | Global, legacy, token, and base CSS (`src/styles/globals.css`, `src/styles/legacy.css`, `src/styles/tokens.css`, `src/styles/base.css`). |

`tsconfig.json` makes `@/*` and `~/*` resolve to `src/*`, with special route aliases for operator owner/admin/developer files (`tsconfig.json:23-30`).

### File-based routes (`src/routes/`)

Route filenames encode URL segments and protocol families. TanStack Router discovers source files and emits `src/routeTree.gen.ts`.

| Route family | Representative paths | Structure |
| --- | --- | --- |
| Public pages | `src/routes/index.tsx`, `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/t.$threadId.tsx`, `src/routes/q.$answerId.tsx` | Landing/catalog, business listing, inquiry, thread, and answer readback pages. The home route uses validated search, server loader, pending/error components, and composed readback (`src/routes/index.tsx:25-66`). |
| Auth/claims | `src/routes/sign-in.$.tsx`, `src/routes/sign-up.$.tsx`, `src/routes/claim.tsx`, `src/routes/claim.form.tsx`, `src/routes/claim.success.tsx` | Clerk entry and business claim flow. Auth-sensitive prefixes are selected by `requiresClerkProvider` in `src/routes/__root.tsx:107-109`. |
| Operator layout | `src/routes/_operator.tsx` | Pathless parent for owner/admin/developer routes; mounts the shared shell and applies the session guard (`src/routes/_operator.tsx:7-25`). |
| Owner/admin/developer pages | `src/routes/_operator/owner.*`, `src/routes/_operator/admin.*`, `src/routes/_operator/developers.discovery.tsx`, `src/routes/_operator/agent-access*.tsx` | Authenticated supply, offerings, inquiries, status/settings, support/problem, discovery, agent-access, and admin readback screens. |
| Answer APIs | `src/routes/api.answer.turn.ts`, `src/routes/api.answer.follow-up-chips.ts`, `src/routes/api.answer.threads.ts`, `src/routes/api.answer.threads.$threadId.ts`, `src/routes/api.answer.eval-status.ts` | Session-aware answer streaming, follow-up chips, thread read/delete, and eval gating. |
| Customer request APIs | `src/routes/api.requests.ts`, `src/routes/api.requests.$requestRef*.ts`, `src/routes/api.v1.requests*.ts` | Current and explicitly retained v1 request lifecycle endpoints for facts, messages, options, authorization, run, cancellation, evidence, problems, and repeat permissions. |
| Registry/storefront APIs | `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/routes/api.v1.services.ts`, `src/routes/api.v1.services.search.ts`, `src/routes/api.storefront.*` | Public catalog/service reads and imported/enriched storefront drafts. |
| Discovery/agent protocols | `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, `src/routes/SKILL[.]md.ts`, `src/routes/[.]well-known/` | UCP/discovery manifests, crawl artifacts, agent skill, OAuth metadata, signature directory, and protected-resource metadata. |
| MCP/OAuth | `src/routes/mcp.ts`, `src/routes/oauth.authorize.ts`, `src/routes/oauth.device_authorization.ts`, `src/routes/oauth.register.ts`, `src/routes/oauth.token.ts` | MCP streamable HTTP and agent authorization/token protocol endpoints. |
| Provider/webhook APIs | `src/routes/api.demo-provider.*`, `src/routes/api.sandbox.*`, `src/routes/api.notification.*`, `src/routes/api.stripe.webhook.ts`, `src/routes/oauth.*` | Development provider hosts, sandbox capability checks, notification dispatch/webhooks, billing webhook, and OAuth surfaces. |
| Compatibility/retired APIs | `src/routes/api.v1.release.ts`, `src/routes/api.v1.requests.schema.ts`, `src/routes/api.requests.schema.ts`, `src/routes/api.v1.requests.*` | Versioned schemas and compatibility surfaces while current V2/action routes are canonical. |

A route may be a page, a server function loader, or a protocol handler. For example, `src/routes/api.businesses.search.ts:17-23` declares a GET handler and `src/routes/api.answer.turn.ts:15-21` declares a POST handler; both delegate into modules rather than storing domain logic in the route.

### Domain modules (`src/modules/`)

Each bounded context is a top-level directory. `public.ts` is the cross-context entry seam; `internal/` holds private helpers/schema/ports. Action declarations use `*.actions.ts`; source/Convex adapters commonly use `*.functions.ts`; schemas use `*.schema.ts` or `internal/*schema.ts`.

| Module path | Key sublocations | Primary structure role |
| --- | --- | --- |
| `src/modules/common/` | `action.ts`, `canonical-digest.ts`, `stable-hash.ts`, `ids.ts`, `audit-events.ts` | Shared contracts, identity/digest utilities, bounded JSON, event metadata. |
| `src/modules/security/` | `public.ts`, `source-write-admission.ts`, `internal/` | Source-write admission, admin readback, removal/dispute controls. |
| `src/modules/network-guard/` | `public.ts` | Host/network allowlists and safe external boundaries. |
| `src/modules/capability-contract/` | `public.ts` | Contract document, schema validation, input/evidence/lifecycle semantics. |
| `src/modules/capability-contract-registry/` | `public.ts`, `internal/` | Registry persistence and contract lookup boundary. |
| `src/modules/capability-supply/` | `public.ts`, `published-operation.ts`, `supplied-quote.actions.ts`, `supply-funnel.functions.ts`, `route-transport-runtime.ts`, `internal/` | Offering/binding publication, readiness, quote and route transport. |
| `src/modules/customer-request/` | `public.ts`, `customer-request.actions.ts`, `customer-request.functions.ts`, `compiler.ts`, `application/`, `interpret-compile/`, `route-execution/`, `v2-*`, `preparation-egress/`, `internal/` | Demand interpretation, graph compilation, plan/preparation/authority, execution, recovery, evidence and support operations. |
| `src/modules/action-invocation/` | `index.ts`, `application-service.ts`, `durable.ts`, `standing-mandate.ts`, `dynamic-published-*`, `paid-operation-*`, `internal/` | Invocation state machine, host application, mandates, dynamic operations, payment and reconciliation. |
| `src/modules/plan-proposal/` | `public.ts`, `internal/` | Model plan/proposal contracts, validation, budgets, events, and storage. |
| `src/modules/answer/` | `public.ts`, `answer-schema.ts`, `answer-synthesizer.ts`, `internal/` | Structured answer snapshots, artifacts, grounding, layout, prose, model selectors and message parts. |
| `src/modules/answer-thread/` | `public.ts`, `answer-thread.schema.ts`, `answer-thread.functions.ts`, `internal/`, `turns/` | Thread records, projections, session access, turn orchestration and route-path implementations. |
| `src/modules/harness/` | `public.ts`, `run-loop.ts`, `tool-contract.ts`, `harness.schema.ts`, `session-journal.ts`, `replay-projection.ts`, `internal/` | Bounded model/tool loop, approval/evidence policy, run reporting and replay. |
| `src/modules/decision-map/` | `public.ts`, `decision-map-client.tsx`, `decision-map.functions.ts`, `internal/` | Decision-map contracts, client journey/readback and Convex persistence. |
| `src/modules/project-spine/` | `public.ts`, `internal/` | Versioned project-spine status and workflow contract. |
| `src/modules/model-gateway/` | `public.ts` | Single OpenRouter provider/model/cost seam. |
| `src/modules/registry/` | `public.ts`, `registry.actions.ts`, `registry.functions.ts`, `public-inquiry-projection.ts`, `internal/` | Public business/offering/service API, search source selection, projections, and inquiry target resolution. |
| `src/modules/catalog/` | `public.ts`, `owner-claim.functions.ts`, `claim-draft.ts`, `public-route.functions.ts`, `internal/` | Business/catalog ownership, offerings, publishing and public route projection. |
| `src/modules/business/` | `public.ts`, `internal/` | Business identity/ownership/readback contracts. |
| `src/modules/storefront/` | `public.ts`, `storefront.actions.ts`, `storefront.functions.ts`, `internal/` | External discovery/import/enrichment draft and storefront projection. |
| `src/modules/discovery/` | `public.ts`, `discovery.functions.ts`, `developer-discovery.ts`, `internal/` | Discovery manifests, examples, developer discovery and crawl artifacts. |
| `src/modules/imported-commitment/` | `index.ts`, `import-claim.ts`, `observe-current.ts`, `contracts.ts` | Imported claims/commitments and current-observation records. |
| `src/modules/sandbox-supply/` | `public.ts`, `sandbox-supply.actions.ts`, `checkup-quote.ts`, `workflow-cohorts.ts` | Labelled sandbox capability/quote acceptance and workflow evidence. |
| `src/modules/inquiries/` | `public.ts`, `inquiry.actions.ts`, `inquiry.functions.ts`, `internal/` | Public inquiry, customer record, owner inbox and delivery projections. |
| `src/modules/notification-outbox/` | `public.ts`, `internal/`, `operator/` | Notification enqueue/dispatch, provider readback and operator repair controls. |
| `src/modules/demand/` | `public.ts`, `demand.actions.ts`, `demand.functions.ts`, `internal/` | Demand capture and source persistence. |
| `src/modules/money/` | `public.ts`, `money.functions.ts`, `internal/` | Billing/payment provider and ledger contracts. |
| `src/modules/settings/` | `public.ts`, `settings.actions.ts`, `settings.functions.ts`, `internal/` | Owner/operator settings and notification preferences. |
| `src/modules/business-tools/` | `public.ts`, `internal/` | Business-facing tool contracts/readbacks. |
| `src/modules/provider-integrations/` | `shipping/public.ts` | Provider-specific input derivation; keeps shipping facts out of generic request logic. |
| `src/modules/observability/` | `public.ts`, `funnel.*`, `source-sync-gate.ts`, `internal/` | Funnel/source-sync instrumentation and server-facing observability contracts. |
| `src/modules/seo/` | `public.ts`, `public-route.ts`, `internal/` | Public business/thread SEO contracts and route projection. |
| `src/modules/governed-action/` | `public.ts`, `vectors.json`, `internal/` | Governed action vectors/contract boundary. |
| `src/modules/dev/` | `public.ts`, `internal/` | Development-only seams and fixtures. |
| `src/modules/actions/` | `index.ts`, `legacy-invocation-result-compatibility.ts` | Central action registry and surface filters. |

The directory names are not merely organizational: Convex schema assembly imports the corresponding internal schema fragments (`convex/schema.ts:3-24`), while Convex application handlers import module public APIs and inject module-specific ports (`convex/customerRequestApplication.ts:21-66`).

### UI components (`src/components/`)

- `src/components/ae/` is product-specific UI grouped by user journey and shell: `layout/`, `chat/`, `customer-request/`, `inquiries/`, `supply/`, `offerings/`, `status/`, `claim/`, `listing/`, `artifacts/`, `decision-map/`, `console/`, `readback/`, `operator/`, `forms/`, `feedback/`, `landing/`, and `primitives/`.
- `src/components/ae/layout/AePublicShell.tsx` owns the public navigation/footer/mobile shell; `src/components/ae/layout/AeOperatorShell.tsx` owns operator chrome and density context (`src/components/ae/layout/AePublicShell.tsx:56-86`, `src/components/ae/layout/AeOperatorShell.tsx:38-64`).
- `src/components/ae/chat/` contains thread sidebar, transcript, input, streaming/replay sections, answer-turn state, and session context; `src/components/ae/customer-request/` contains request workspace/result panels.
- `src/components/ui/` contains lower-level reusable primitives such as `button.tsx`, `input.tsx`, `tabs.tsx`, `sidebar.tsx`, `carousel.tsx`, and `breadcrumb.tsx`; `src/components/ai-elements/` contains AI presentation primitives such as `code-block.tsx`.
- Product components use `Ae` PascalCase names (`src/components/ae/chat/AeChat.tsx`, `src/components/ae/supply/AeSupplyFunnel.tsx`), while generic primitives use lowercase kebab/file names (`src/components/ui/button.tsx`).

### Libraries and helpers (`src/lib/`)

| Directory | Boundary |
| --- | --- |
| `src/lib/server/` | Node/server-only HTTP helpers, Convex transport, source-write admission, customer-request browser API, OAuth/MCP, canonical URLs, SSE, and provider/webhook adapters. |
| `src/lib/client/` | Browser-only auth redirect and local E2E auth helpers. |
| `src/lib/http/` | Request/response protocol utilities, discovery responses, headers, search-query parsing, OAuth challenges. |
| `src/lib/observability/` | Sentry/PostHog client/server bootstrap, event capture, and private-route safety. |
| `src/lib/operator/` | Operator navigation, route options, role/path decisions. |
| `src/lib/dev/` | Development-only browser/server helpers. |
| `src/lib/compat/` | Production JSX runtime compatibility shim selected by `vite.config.ts:66-80`. |
| `src/lib/ui/` | UI-specific helpers and view utilities. |
| `src/lib/utils.ts` | Small shared UI utility entry. |

`src/lib/server/convex-source.ts` is the important infrastructure seam: it exposes typed `sourceQuery`, `sourceMutation`, and `sourceAction` references plus public/authenticated transport functions (`src/lib/server/convex-source.ts:57-80`, `src/lib/server/convex-source.ts:133-202`).

## Convex backend (`convex/`)

### Deployment and schema files

- `convex/convex.config.ts` declares allowed environment keys and installs `@convex-dev/workflow` and `@convex-dev/workpool` (`convex/convex.config.ts:6-21`).
- `convex/auth.config.ts` configures Clerk JWT issuer/domain and Convex audience (`convex/auth.config.ts:3-12`).
- `convex/schema.ts` composes table maps from domain-owned schemas for action invocation, answer threads, plans, decisions, business/catalog, supply, requests, registry, discovery, harness, inquiries, outbox, observability, security, money, settings, and project spine (`convex/schema.ts:25-47`).
- `convex/http.ts` is the Convex HTTP router for sandbox providers and retired routing/MCP endpoints (`convex/http.ts:11-50`).
- `convex/crons.ts` declares hourly security, inquiry, and nonce cleanup (`convex/crons.ts:5-28`).
- `convex/_generated/` contains framework-generated API/server/data-model files and AI guidance; it is excluded from the TypeScript source include (`tsconfig.json:33-44`).

### Convex entrypoint families

| Family | Files | Representative functions |
| --- | --- | --- |
| Customer request | `convex/customerRequestApplication.ts`, `convex/customerRequestV2.ts`, `convex/customerRequestRouteExecution.ts`, `convex/customerRequestRouteMandate.ts`, `convex/customerRequestRouteTransportWorker.ts`, `convex/customerRequestV2*Ports.ts` | Preview/submit/refine/facts/resume/compare/confirm/run/cancel/problem/evidence/repeat-permission, V2 aggregate/replay, mandate and dispatch lifecycle. |
| Supply/catalog | `convex/capabilitySupply.ts`, `convex/catalog.ts`, `convex/catalogSupplyProjection.ts`, `convex/capabilitySupply*Ports.ts`, `convex/sandboxAcceptanceSupply.ts` | Capability publication/readiness/graph/eligibility, offering publication/cutover, supply projection and labelled sandbox seed. |
| Public registry/discovery | `convex/registry.ts`, `convex/discovery.ts`, `convex/catalog.ts`, `convex/storefront*`-related routes | Catalog/list/search/detail, public offering supply, discovery health/manifests/LLMs/sitemap, registry repair/readback. |
| Answer/plan/harness | `convex/answerThreads.ts`, `convex/enginePlans.ts`, `convex/harnessSessions.ts`, `convex/projectSpine.ts` | Answer thread/turn/tool-call persistence, engine plans, harness session records, project-spine workflows and status. |
| Inquiry/notifications | `convex/inquiries.ts`, `convex/notificationOutbox.ts`, `convex/inquiry*`, `convex/notificationOutbox*` | Public inquiry, owner/customer readbacks, replies/privacy, dispatch outbox/webhooks/retry/no-repair. |
| Identity/security | `convex/authz.ts`, `convex/security.ts`, `convex/sourceWriteAdmission.ts`, `convex/authzMigration.ts`, `convex/settings.ts` | Authorization/readback, abuse limits, source-write nonces, migrations and settings. |
| Money/observability | `convex/moneyLedger.ts`, `convex/moneyStripe.ts`, `convex/observability.ts` | Ledger/provider state, Stripe-facing operations, funnel/observability persistence. |
| Compatibility/support | `src/modules/customer-request/legacy-v1.ts`, `convex/routingKernelV1History.ts`, `convex/routingKernel*`, `convex/README.md` | Retained V1/retirement history, compatibility ports, and backend notes. |

Convex files use `query`, `mutation`, `action`, or internal variants and validate their boundary values with `convex/values`; customer-request actions are visibly grouped by lifecycle in `convex/customerRequestApplication.ts:661-1058`, while registry queries are grouped by public catalog/supply projection in `convex/registry.ts:243-406`.

## Test and evaluation structure

### Tests (`tests/`)

| Directory | Test contract |
| --- | --- |
| `tests/unit/` | Focused module/UI behavior such as `tests/unit/plan-proposal/proposal-contract.test.ts`, `tests/unit/answer-thread/public-projection.test.ts`, `tests/unit/chat/ae-thread-turn-stream-section.test.tsx`, and `tests/unit/operator-navigation.test.ts`. |
| `tests/integration/` | Convex/source/action composition and cross-module flows, including `tests/integration/customer-request-v2-application-path.test.ts`, `tests/integration/registry-api.test.ts`, `tests/integration/answer-turn-intent-routing.test.ts`, and `tests/integration/answer-thread-source-write.test.ts`. |
| `tests/e2e/` | Browser journeys, auth boundaries, accessibility, inquiry/discovery loops, customer-request decision experience, and paid-operation surfaces (`tests/e2e/customer-request-decision-experience.spec.ts`, `tests/e2e/chat-discovery-inquiry-loop.spec.ts`, `tests/e2e/a11y/`). |
| `tests/deploy-smoke/` | Hosted/deployment lifecycle readbacks for customer requests, notifications, support, and billing (`tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts`, `tests/deploy-smoke/phase2-resend-dispatch-smoke.spec.ts`). |
| `tests/imports/` | Architectural dependency rules: route boundaries, private imports, capability/customer-request boundaries, action-invocation hosts, kernel retirement, and TypeScript standards (`tests/imports/route-boundary.test.ts`, `tests/imports/customer-request-boundaries.test.ts`, `tests/imports/action-invocation-host-boundaries.test.ts`). |
| `tests/seo/` | Public business/thread SEO, discovery artifacts, canonical URLs, and agent skill output (`tests/seo/public-business-seo.test.ts`, `tests/seo/discovery-files.test.ts`). |
| `tests/ui-contract/` | UI contract scan (`tests/ui-contract/ui-contract.test.ts`). |
| `tests/types/` | Domain contract/type-level coverage (`tests/types/domain-contracts.test.ts`). |
| `tests/fixtures/` | Discovery/customer-request/capability fixtures plus deliberately bad imports, UI, and standards fixtures. |
| `tests/helpers/`, `tests/setup/` | Test adapters such as OpenRouter contract server, source-write admission, web storage, and answer-thread ports. |
| `tests/scripts/` | Graph freshness assertion program and test (`tests/scripts/assert-graph-fresh.ts`, `tests/scripts/assert-graph-fresh.test.ts`). |

Test filenames preserve the boundary under test: `*.test.ts`/`*.test.tsx` are Vitest tests; browser specs use `*.spec.ts`; directories mirror the domain or contract under test.

### Evaluation programs (`eval/`)

- `eval/answer/` contains Promptfoo configuration, providers, assertions, scripts, and answer-evaluation README; answer release gating is surfaced by `src/routes/api.answer.eval-status.ts` and `package.json:38-42`.
- `eval/engine/` contains JSON cases, a suite runner, and helper libraries (`eval/engine/cases.json`, `eval/engine/run-suite.ts`).
- `eval/product-foundry/` contains action-bundle, partial-entry, portfolio, and public projections (`eval/product-foundry/action-bundles.ts`, `eval/product-foundry/portfolio.ts`).
- `eval/parity/` contains parity program documentation, TSV results, and a checker (`eval/parity/program.md`, `eval/parity/results.tsv`, `eval/parity/check-parity.mjs`).
- `eval/consumer/` contains comparator/rubric artifacts for consumer-facing evaluation (`eval/consumer/COMPARATOR.md`, `eval/consumer/RUBRIC.md`).

## Tooling, scripts, and external boundaries

- `tools/ae/` is the machine-facing CLI, with command families under `tools/ae/commands/` and argument/output helpers under `tools/ae/lib/`; it deliberately calls public HTTP/action surfaces (`tools/ae/cli.ts:1-20`).
- `tools/dev/` hosts local dev startup, source-write secret setup, sandbox/provider hosts, paid-operation surfaces, and evidence/conformance scripts (`tools/dev/local-dev.mjs`, `tools/dev/sandbox-route-provider-host.ts`).
- `tools/release/` owns exact-revision deployment, production credential/smoke checks, release readback, and routing-kernel retirement manifests (`tools/release/deploy-customer-request-git-source.ts`, `tools/release/customer-request-production-smoke.ts`, `tools/release/verify-kernel-retirement.mjs`).
- `scripts/` contains repository audits such as `scripts/audit-action-surfaces.mjs`.
- `examples/routing-provider/` currently holds deployment metadata under `examples/routing-provider/.vercel/`; the provider implementation/runtime hosts are under `tools/dev/` and `src/modules/provider-integrations/`.
- `vendor/handshake-protocol-kernel/README-PROVENANCE.md` records the provenance of the vendored handshake artifact; the directory is not the active application source.
- `.github/workflows/kernel-release-gate.yml` runs clean source/contract/browser/build proof and, on main, exact-revision hosted Convex/Vercel readback (`.github/workflows/kernel-release-gate.yml:17-126`); `.github/workflows/react-doctor.yml` is the separate React diagnostics workflow.

## Documentation and planning structure

- `.planning/PROJECT.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, and `.planning/config.json` are project-level planning state/configuration.
- `.planning/adr/` stores architecture decision records, including customer-request ports, capability registry, action-plane, evidence/projection, and payment/comms decisions (`.planning/adr/ADR-016-customer-request-v2-preparation-ports.md`, `.planning/adr/ADR-002-capability-registry-agent-native-supply.md`).
- `.planning/wayfinder/` stores product maps, journeys, engine notes, and runbooks; `.planning/research/` stores dated research notes.
- `docs/architecture/` and `docs/agents/` hold durable architecture/agent guidance; `UBIQUITOUS_LANGUAGE.md` and `.planning/VISION-conceptual-map.md` hold domain vocabulary and product framing.
- `.planning/codebase/` is the generated map destination for the seven GSD codebase documents; this refresh writes `ARCHITECTURE.md` and `STRUCTURE.md` here while sibling mappers own the other five files.

## Naming and dependency conventions

| Convention | Evidence and implication |
| --- | --- |
| File routes encode URL structure | `$slug`, `t.$threadId`, `api.answer.turn`, `api.requests.$requestRef.*`, and `[.]well-known` filenames under `src/routes/` become route segments through TanStack Router (`src/routeTree.gen.ts:11-83`). |
| Public module seam | Every major domain has `src/modules/<context>/public.ts`; private implementation is placed in `src/modules/<context>/internal/` as shown by `src/modules/answer-thread/public.ts` and `src/modules/registry/public.ts`. |
| Action declaration suffix | Cross-surface commands/reads live in `*.actions.ts`, such as `src/modules/registry/registry.actions.ts`, `src/modules/customer-request/customer-request.actions.ts`, and `src/modules/inquiries/inquiry.actions.ts`. |
| Source/Convex function suffix | Source transport wrappers use `*.functions.ts`, such as `src/modules/registry/registry.functions.ts` and `src/modules/customer-request/customer-request.functions.ts`; Convex ports use named `convex/*Ports.ts` files. |
| Schema suffix | Domain persistence/runtime contracts use `*.schema.ts` or `internal/*schema.ts`, such as `src/modules/answer-thread/answer-thread.schema.ts` and `src/modules/customer-request/internal/convex-schema.ts`. |
| Product component prefix | Product UI uses `Ae` plus PascalCase (`AeChat.tsx`, `AeOperatorShell.tsx`, `AeSupplyFunnel.tsx`); generic UI uses lowercase component filenames under `src/components/ui/`. |
| Tests mirror boundary | Unit/integration directories mirror module names; test files use `*.test.ts[x]`, browser specs use `*.spec.ts`, and import tests encode architectural rule names (`tests/imports/*.test.ts`). |
| Convex function naming | Backend functions are verb/domain names (`publishCapability`, `queryCapabilityGraph`, `submitPublicInquiry`, `readPublicCatalogDiscoveryManifest`) in files named after the bounded context (`convex/capabilitySupply.ts`, `convex/inquiries.ts`, `convex/discovery.ts`). |
| Generated artifacts are marked | `src/routeTree.gen.ts` says generated and not hand-editable (`src/routeTree.gen.ts:7-9`); `convex/_generated/` is excluded from source TypeScript (`tsconfig.json:43-44`). |

## Important locations for navigation

1. Start with `src/start.ts`, `src/router.tsx`, `src/routes/__root.tsx`, and `src/routeTree.gen.ts` to understand runtime boot and route registration.
2. Follow a machine or UI capability through `src/modules/actions/index.ts`, its `*.actions.ts`, its `*.functions.ts`, and `src/lib/server/convex-source.ts` before reading the corresponding Convex file.
3. For demand lifecycle, start at `src/modules/customer-request/application/public.ts`, then `convex/customerRequestApplication.ts`, `convex/customerRequestV2.ts`, and the relevant `convex/customerRequest*Ports.ts` adapters.
4. For supply/catalog, start at `src/modules/capability-contract/public.ts`, `src/modules/capability-supply/public.ts`, `convex/capabilitySupply.ts`, `convex/catalog.ts`, `convex/registry.ts`, and `convex/discovery.ts`.
5. For chat, start at `src/routes/api.answer.turn.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer/public.ts`, `convex/answerThreads.ts`, and `src/components/ae/chat/`.
6. For production proof, read the command in `package.json`, the matching `tests/` suite, and `.github/workflows/kernel-release-gate.yml`; do not treat `outputs/` JSON as source (`outputs/workflow-eval-*.json`).

## Completion

Completion confirmation (2026-08-01): complete; `ARCHITECTURE.md` — 180 lines; `STRUCTURE.md` — 236 lines.
