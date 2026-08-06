# Codebase Structure

**Analysis Date:** 2026-08-06

Physical map of the **current** dirty working tree (HEAD `4a17c63`, uncommitted work included). For conceptual organization (layers, data flow, key abstractions) see `ARCHITECTURE.md`; for prompt/model/data-flow see the separately maintained `.planning/codebase/PROMPT-DATA-FLOW.md` (untouched).

## Directory Layout

```
Agentic-Economy/
├── src/                          # application source
│   ├── routes/                   # TanStack file routes (pages, api.*, oauth, well-known)
│   ├── modules/                  # bounded-context domain packages (36 contexts)
│   ├── components/               # UI components
│   │   ├── ae/                   #   AE domain components (chat, plan, supply, operator…)
│   │   ├── ui/                   #   shadcn/ui primitives
│   │   └── ai-elements/          #   AI-stream message/prompt/reasoning components
│   ├── lib/                      # non-domain helpers (server, http, ui, observability, client)
│   ├── hooks/                    # shared React hooks
│   ├── styles/                   # globals.css, base.css (Tailwind v4)
│   ├── content/                  # brand copy
│   ├── routeTree.gen.ts          # generated route tree (do not hand-edit)
│   ├── router.tsx                # TanStack router instance
│   └── start.ts                  # TanStack Start bootstrap (request middleware)
├── convex/                       # Convex durable backend (schema, source of truth)
│   ├── _generated/               #   codegen output (do not edit)
│   ├── schema.ts                 #   composed table schema
│   ├── convex.config.ts          #   app/env/components wiring
│   ├── *.ts                      #   per-context tables + port/execution/seed/cron functions
│   └── *.test.ts                 #   Convex-aware tests
├── tests/                        # test suites
│   ├── unit/  integration/  e2e/  deploy-smoke/  seo/
│   ├── imports/                  #   import-boundary / retirement gates
│   ├── ui-contract/  types/  eval/  helpers/  fixtures/  setup/  scripts/
├── eval/                         # evaluation harnesses & gates
│   ├── answer/  engine/  quality/  consumer/  product-foundry/  parity/  toolcall/
├── tools/                        # dev + release tooling (tsx/node scripts)
│   ├── dev/  release/  ae/
├── scripts/                      # repo-level scripts (audit-action-surfaces.mjs)
├── vendor/                       # vendored protocol kernels (handshake-protocol-kernel)
├── examples/                     # example integrations (routing-provider)
├── outputs/  output/             # run artifacts / evidence packets (git-ignored output/)
├── .planning/                    # GSD planning artifacts (codebase/, research/, phases/, adr/, …)
├── docs/                         # codemap/, architecture/, agents/
├── .github/workflows/            # CI (kernel-release-gate.yml, react-doctor.yml)
├── .claude/  .agents/            # agent context + skills/rules
└── config files                  # package.json, vite.config.ts, tsconfig.json, vitest.config.ts,
                                  # playwright*.config.ts, .oxlintrc.json, .env.example, components.json
```

## Directory Purposes

**`src/modules/`** — the heart of the codebase: one folder per bounded context. Each context typically exposes:
- `public.ts` — redacted projection types + pure helpers consumed by routes/components/clients.
- `*.functions.ts` / `*.actions.ts` — Convex functions/actions.
- `internal/` — private schema (`convex-schema.ts`/`schema.ts`), implementation, ports, sub-logic; nothing here is imported by other contexts.

Key contexts:
- `customer-request/` — the NL→plan→execute core (`semantic-interpreter.ts`, `compiler.ts`, `route-mandate.ts`, `agent-contract.ts`, `eligibility.ts`, `evaluation.ts`, `legacy-v1.ts`, `openrouter-transport.ts`; `internal/convex-v2-schema.ts`).
- `capability-supply/` — provider admission + publication + provenance (`internal/admit-provider-schema.ts`, `internal/publication/*`, `operation-projection.ts`, `supplied-quote.ts`, `supply-funnel.functions.ts`).
- `action-invocation/` — payment-bearing paid actions (`standing-mandate.ts`, `durable.ts`, `application-service.ts`, `host-projection.ts`).
- `money/` — ledger, live-money-gate, topup, payout-policy, stripe-webhook, pricing (`internal/ledger.ts`).
- `registry/`, `catalog/`, `discovery/` — searchable operation/catalog/discovery projections.
- `answer/`, `answer-thread/` — model answer synthesis + answer-thread persistence/UI stream.
- `inquiries/`, `work-tree/`, `harness/`, `security/`, `settings/`, `study/`, `external-run/`, `notification-outbox/`, `observability/`, `sandbox-supply/`, `business/`, `business-tools/`, `demand/`, `storefront/`, `seo/`, `model-gateway/`, `network-guard/`, `governed-action/`, `project-spine/`, `imported-commitment/`, `provider-integrations/`, `capability-contract/`, `capability-contract-registry/`, `routing-kernel/` (retired stub), `dev/`.
- `common/` — shared primitives: `action.ts` (action contract), `result.ts`, `stable-hash.ts`, `canonical-digest.ts`, `json-pointer.ts`, `base64-codec.ts`, CSRF/matching helpers.
- `actions/index.ts` — the single cross-surface action registry.

**`src/routes/`** — TanStack file routes. Conventions: `index.tsx` (home), `$slug.tsx` (public business page), `claim*` (owner claim), `$slug.inquiry.tsx`, `sign-in.$`/`sign-up.$` (Clerk), `_operator/*` (owner/admin console: `admin.*`, `owner.*`, `developers.*`, `agent-access.*`), API routes (`api.*.ts`), OAuth (`oauth.*.ts`), `[.]well-known/*` (OAuth/UCMP/HTTP-message-signatures discovery), sitemap/robots/`llms.txt`.

**`src/components/`** — `ae/` (AE domain UI, one folder per concern: `chat/`, `plan/`, `services/`, `supply/`, `operator/`, `status/`, `listing/`, `landing/`, `customer-request/`, `action-invocation/`, `harness/`, `magic/` motion, `primitives/`, `layout/`, `forms/`, `offerings/`, `home/`, `artifacts/`), `ui/` (shadcn primitives), `ai-elements/` (message/prompt/reasoning/code-block).

**`src/lib/`** — non-domain helpers: `server/` (MCP, rate-limit, sandbox provider, work-tree agent API, auth/OAuth APIs, source-write-admission), `http/` (CSRF, cookies, security-headers, content-negotiation, oauth-challenge), `ui/` (status-presentation, format-*, contract-scans, journey-events), `observability/` (Sentry/PostHog/funnel), `client/`, `operator/`, `dev/`, `utils.ts`.

**`convex/`** — durable backend. `schema.ts` composes all context tables from `src/modules/**/internal/*`; `convex.config.ts` declares env + components (workflow, workpool, rateLimiter, aggregate); `_generated/` holds codegen. Ports (`*Ports.ts`), execution workers (`customerRequestRouteExecution.ts`, `customerRequestRouteTransportWorker.ts`, `customerRequestRouteCancellationWorker.ts`), journals/ledgers, `devSeed.ts`, `crons.ts`, and Convex-aware tests live here.

**`tests/`** — `unit/`, `integration/`, `e2e/` (Playwright), `deploy-smoke/`, `seo/`, `imports/` (boundary/retirement gates), `ui-contract/`, `types/`, `eval/`, plus `helpers/`, `fixtures/`, `setup/`, `scripts/`.

**`eval/`** — evaluation harnesses (answer suite, engine eval, quality gates, parity, consumer, product-foundry, toolcall).

**`tools/`** — `dev/` (run-with-cleanup.mjs, local-dev, evidence packets, smoke scaffolds), `release/` (kernel-retirement verify, production credential verify), `ae/` (CLI).

**`output/`**, **`outputs/`**, **`test-results/`**, **`playwright-report/`**, **`.vercel/output/`** — generated/run artifacts.

## Key File Locations

- **Entry points:** `src/start.ts` (bootstrap + middleware), `src/router.tsx` + `src/routeTree.gen.ts` (router), `src/routes/index.tsx`, `convex/convex.config.ts`, `convex/http.ts`, `convex/crons.ts`.
- **Configuration:** `package.json` (scripts, engines Node ≥22, npm@11.5.1), `vite.config.ts` (TanStack Start + Nitro/Vercel, `nodejs22.x`), `tsconfig.json`, `vitest.config.ts`, `playwright*.config.ts`, `.oxlintrc.json`, `components.json` (shadcn), `.env.example`, `convex/schema.ts`, `convex/tsconfig.json`.
- **Core logic:** `src/modules/<context>/` (see above). Cross-cutting: `src/modules/common/action.ts`, `src/modules/actions/index.ts`.
- **Server functions/actions:** `src/modules/*/*.functions.ts`, `*.actions.ts`, `src/lib/server/*`, plus `convex/*.ts` ports.
- **UI:** `src/components/ae/**`, `src/components/ui/**`, `src/routes/**`.
- **Tests:** `tests/unit/`, `tests/integration/`, `tests/e2e/`, `tests/imports/` (boundary gates that must stay green), `convex/*.test.ts`, `tests/deploy-smoke/`.
- **Docs/maps:** `.planning/codebase/` (this map + `PROMPT-DATA-FLOW.md`), `AGENTS.md`, `CLAUDE.md`, `RULES.MD`, `UBIQUITOUS_LANGUAGE.md`, `docs/architecture/`.

## Naming Conventions

- **Files:**
  - `public.ts` — module's external projection/API surface.
  - `*.functions.ts` — Convex **functions** (queries/mutations); `*.actions.ts` — Convex **actions**.
  - `*.schema.ts` — Zod/Convex schema; `internal/convex-schema.ts` (or `schema.ts`) — Convex table definitions.
  - Route files: kebab-case with TanStack segment syntax (`$slug.tsx`, `api.v1.services.search.ts`, `[.]well-known/`). API routes named by path segments separated by dots.
  - UI: `Ae*` prefix for AE domain components (`AeConsumerPlan`, `AeServiceRow`, `AeOperatorDataTable`); shadcn primitives lowercase (`button.tsx`, `card.tsx`). `.exports.ts` files re-export a component bundle.
  - Tests: `<unit>.<context>.test.ts` / `.spec.ts` (Playwright), e.g. `customer-request-v2-multi-capability-route.test.ts`.
- **Types:** `*Dto` for projections (e.g. `ServiceDto`, `PublicOfferingDto`, `PublicOfferingSupplyProjection`), `Action*` for the action contract, `*Row`/`*Projection` for read models, `Table*` for schema tables, `*Ports` for Convex port files.
- **Directories:** `internal/` marks private implementation; `src/modules/<context>/internal/` is the module's private seam. `src/components/ae/<concern>/` groups UI by domain concern.
- **Special patterns:** deterministic derivation over hand-maintained maps (e.g. `mcpToolName`, status presentation, route options); refusal/category enums are stable codes that must not be renamed even when strings change.

## Where to Add New Code

- **New feature within a context** → extend `src/modules/<context>/` (logic in the module + Convex table/function in `convex/` if durable) and expose a `public.ts` projection; do **not** add logic in routes/components.
- **New page** → add a route file under `src/routes/` (prefer kebab-case + segment syntax) and a matching `Ae*` component under `src/components/ae/<concern>/`; update `src/components/ae/layout/*` shell/command menu if it needs navigation.
- **New action** → define with `defineAction` in `src/modules/<context>/*.actions.ts` and register it in `src/modules/actions/index.ts` (with a unique `action.id`); surfaces (UI/HTTP/agent/MCP) derive automatically.
- **New HTTP/API endpoint** → route file under `src/routes/api.*.ts` wiring a `src/lib/server/*` handler; add CSRF/security via existing `src/start.ts` middleware (rarely need new).
- **New Convex table** → add to the context's `internal/convex-schema.ts`, then run `npm run check:convex-codegen` to regenerate `convex/_generated/`.
- **New shared utility** → place in `src/lib/<area>/` (ui / http / server / observability) or `src/modules/common/` if it crosses contexts.
- **New test** → `tests/unit/` (vitest) for logic, `tests/integration/` for cross-context/Convex, `tests/e2e/` (Playwright) for user journeys, and add import-boundary coverage in `tests/imports/` if you broaden what a context may import.
- **Follow the lean rules:** reuse existing `src/modules`/`src/lib`/shadcn/`@convex-dev/*` before adding dependencies; never re-add retired `routing-kernel` behavior.

## Special Directories

- `convex/_generated/` — codegen output; regenerate via `npm run check:convex-codegen`. Committed so the repo typechecks off the shelf.
- `src/routeTree.gen.ts` — generated TanStack route tree; regenerated on route changes, do not hand-edit.
- `src/modules/routing-kernel/` — retired legacy engine (`retirement.ts`); the import-boundary tests + `tools/release/verify-kernel-retirement.mjs` keep it dead.
- `vendor/` — vendored third-party protocol kernels (e.g. `handshake-protocol-kernel/`).
- `src/modules/security/internal/vectors.json`, `src/modules/governed-action/vectors.json` — checked-in classified vectors data.
- `.vercel/` — deploy config + **git-ignored** env files (`.env.production.local`, `prod-debug.env`) — never commit credentials.
- `output/`, `outputs/`, `test-results/`, `playwright-report/`, `.convex/local/` — run artifacts; `output/` git-ignored.
- `.convex/` — local Convex deployment state (mostly git-ignored).
- `.planning/` — GSD artifacts (codebase maps, research, phases, ADRs, STATE.md, MANIFEST.md); `config.json` configures GSD.

---
*Structure analysis: 2026-08-06*
<!-- refreshed: 2026-08-06 -->
