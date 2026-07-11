# Codebase Structure

**Analysis Date:** 2026-07-11

## Directory Layout

```text
Agentic-Economy/
├── .agents/                 # Agent context and repo-local project skills
├── .github/workflows/       # CI and evaluation gates
├── .planning/               # GSD project, phase, evidence, and codebase-map artifacts
├── convex/                  # Deployable backend, schema, HTTP, cron, and adapters
│   └── _generated/          # Convex-generated API and data-model types
├── docs/                    # Maintainer technical documentation
├── eval/answer/             # Answer cases, evaluators, assertions, and runners
├── examples/                # Agent/routing/provider integration examples
├── public/                  # Static brand and illustration assets
├── scripts/                 # Verification, deployment, fixture, and operational CLIs
├── src/                     # TanStack Start application and domain code
│   ├── components/          # Product, Astryx, animation, and AI UI
│   ├── lib/                 # Cross-cutting runtime adapters
│   ├── modules/             # Bounded domain modules and public seams
│   ├── routes/              # File-based pages, resources, and HTTP APIs
│   └── styles/              # Global CSS
├── tests/                   # Unit through deployed-smoke verification
├── vendor/                  # Vendored protocol/kernel material
├── package.json             # npm scripts and dependencies
├── tsconfig.json            # Strict TypeScript and aliases
├── vite.config.ts           # Web build/deployment configuration
├── vitest.config.ts         # Vitest configuration
└── playwright.config.ts     # Browser/E2E configuration
```

## Directory Purposes

**`src/routes/`:**
- Purpose: URL-owned adapters for SSR pages, authenticated operator pages, public resources, and APIs.
- Contains: TanStack `createFileRoute` files and route-local helpers prefixed with `-`.
- Key files: `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routes/registry.tsx`, `src/routes/api.answer.turn.ts`, `src/routes/$slug.tsx`, `src/routes/_operator.tsx`.
- Subdirectories: `src/routes/_operator/` holds owner/admin/developer routes and private presentation helpers.

**`src/modules/`:**
- Purpose: Bounded domain models, application adapters, and explicit cross-module APIs.
- Contains: `public.ts`, `*.functions.ts`, `*.actions.ts`, contracts, and module-private `internal/` implementations.
- Key domains: `answer`, `answer-thread`, `business`, `catalog`, `inquiries`, `registry`, `routing-kernel`, `security`, `notification-outbox`, `observability`, and `harness`.
- Other domains include `billing`, `business-action`, `capabilities`, `clearance`, `demand`, `discovery`, `lifecycle`, `procurement`, `protected-action`, `settings`, `storefront`, and `seo`.
- Foundation: `src/modules/common/` owns IDs, hashes, result/action contracts, Convex literal helpers, and audit interfaces.

**`src/components/`:**
- Purpose: Shared React presentation outside route ownership.
- Subdirectories: `src/components/ae/` for product UI, `src/components/astryx/` for Astryx integration, `src/components/ai-elements/` for answer/chat primitives, and `src/components/animate/` for animation helpers.
- Product groups include `artifacts/`, `chat/`, `feedback/`, `forms/`, `harness/`, `inquiries/`, `landing/`, `layout/`, `listing/`, `operator/`, `primitives/`, `readback/`, and `status/`.

**`src/lib/`:**
- Purpose: Cross-domain runtime infrastructure.
- Subdirectories: `http/`, `server/`, `observability/`, `operator/`, and `ui/`.
- Key files: `src/lib/server/convex-source.ts`, `src/lib/server/source-write-admission.ts`, `src/lib/http/security-headers.ts`, `src/lib/ui/contract-scans.ts`.

**`convex/`:**
- Purpose: Deployable persistence/transaction boundary, backend auth, scheduled work, and machine HTTP endpoints.
- Key files: `convex/schema.ts`, `convex/http.ts`, `convex/crons.ts`, `convex/authz.ts`, `convex/source_state.ts`, `convex/sourceWriteAdmission.ts`, `convex/routingKernel.ts`, `convex/routingKernelStoreAdapter.ts`.
- Domain entry points generally use domain names (`convex/inquiries.ts`); extracted kernel responsibilities use focused `routingKernel*.ts` siblings.

**`tests/`:**
- Purpose: Behavioral and structural verification across product layers.
- Subdirectories: `unit/`, `integration/`, `e2e/`, `deploy-smoke/`, `dev-smoke/`, `eval/`, `imports/`, `types/`, `copy/`, `seo/`, `ui/`, `ui-contract/`, `ai/`, `scripts/`, `spike/`, `fixtures/`, and `helpers/`.
- Key guardrails: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/ts-standards.test.ts`.

**`scripts/`:**
- Purpose: Repository proof, maintenance, integration, deployment, and fixture orchestration.
- Rule: Keep reusable product rules in `src/modules/`; scripts call rather than duplicate them.

**`eval/answer/`:**
- Purpose: Offline/live evaluation of answer quality, coverage, tool use, and response contracts.
- Contains: `lib/`, `scripts/`, `assertions/`, provider gates, Promptfoo config, and documentation.
- Key files: `eval/answer/promptfooconfig.yaml`, `eval/answer/scripts/run-suite.ts`, `eval/answer/scripts/audit-coverage.ts`.

**`examples/`:**
- Purpose: Executable integrations and external-agent contract demonstrations.
- Subdirectories: `examples/agent-experience/`, `examples/external-agent-contract-prototype/`, `examples/routing-agent-directory/`, `examples/routing-provider/`.

**`public/`:** Static brand, favicon, and illustration assets, notably `public/brand/logo/` and `public/images/illustration/`.

**`.planning/`:** GSD-owned project truth, requirements, roadmap, phase plans, evidence, design artifacts, and `codebase/` maps.

**`.agents/`:** Project agent guidance, `.agents/brand-context.md`, and repo-local skills under `.agents/skills/`.

**`.github/workflows/`:** CI, evaluation, and source-owned verification workflow YAML.

**`docs/`:** Durable maintainer documentation, currently including `docs/ROUTING-KERNEL.md`.

**`vendor/`:** Locally vendored upstream/reference material under `vendor/handshake-protocol-kernel/`.

## Key File Locations

**Entry Points:**
- `src/start.ts`: TanStack Start middleware composition.
- `src/router.tsx`: Router factory.
- `src/routes/__root.tsx`: HTML/provider root.
- `src/routeTree.gen.ts`: Generated route registry.
- `convex/http.ts`: Convex HTTP/protocol router.
- `convex/crons.ts`: Scheduled jobs.
- `eval/answer/scripts/run-suite.ts`: Evaluation CLI.
- `examples/agent-experience/run-audit.ts`: Agent experience audit CLI.

**Configuration:**
- `package.json`: Dependencies and verification commands.
- `tsconfig.json`: Strict compiler options and `@/*` aliases.
- `vite.config.ts`: TanStack Start, Nitro/Vercel Node, React, Tailwind, Astryx SSR, and Sentry.
- `vitest.config.ts`: Test discovery/environment.
- `playwright.config.ts`: Local compact/wide Chromium projects.
- `playwright.deploy-smoke.config.ts`: Hosted smoke config.
- `doctor.config.ts`: React Doctor config.
- `.env.example`: Documented environment surface; real `.env*` files are ignored.

**Core Logic:**
- `src/modules/*/public.ts`: Supported domain contracts.
- `src/modules/*/internal/`: Private rules, schemas, policies, and validators.
- `src/modules/*/*.functions.ts`: Server-function adapters.
- `src/modules/*/*.actions.ts`: Server action/application adapters.
- `src/modules/routing-kernel/internal/kernel.ts`: Neutral routing lifecycle.
- `src/modules/answer/internal/`: Grounding/model/tool/evidence orchestration.
- `convex/source_state.ts`: Database/source-state mapping.
- `convex/schema.ts`: Table composition.

**Security and Transport:**
- `src/lib/server/convex-source.ts`: Web-to-Convex gateway.
- `src/lib/server/source-write-admission.ts` and `convex/sourceWriteAdmission.ts`: Request and backend write admission.
- `convex/authz.ts`: Human actor/authority resolution.
- `src/modules/security/`: Admin, abuse, dispute, duplicate, and admission contracts.
- `src/modules/routing-kernel/caller-identity.ts`: Agent signature verification.
- `src/modules/routing-kernel/authorization.ts`: Routing authorization.

**Testing:**
- `tests/unit/`: Pure logic/focused behavior.
- `tests/integration/`: Cross-boundary application behavior.
- `tests/e2e/`: Browser journeys and `tests/e2e/a11y/` accessibility.
- `tests/deploy-smoke/`: Hosted public/auth/provider proof.
- `tests/imports/`: Architecture/TypeScript guardrails.
- `tests/ui-contract/`: Design, route, copy, and component contracts.
- `tests/fixtures/`: Scanner/integration fixtures.

**Documentation:**
- `README.md`: Setup and overview.
- `UBIQUITOUS_LANGUAGE.md`: Domain terminology.
- `docs/ROUTING-KERNEL.md`: Kernel architecture/operations.
- `.planning/PROJECT.md`: Project intent and scope.
- `.planning/codebase/`: Generated current-state references.

## Naming Conventions

**Files:**
- `kebab-case.ts` for utilities/internal modules, e.g. `src/modules/common/stable-hash.ts`.
- `camelCase.ts` for Convex functions and some adapters, e.g. `convex/sourceWriteAdmission.ts`.
- `PascalCase.tsx` for reusable components, e.g. `src/components/ae/operator/AeOperatorDataTable.tsx`.
- TanStack route notation: dots nest paths, `$param` is dynamic, `_operator` is pathless, `[.]` escapes a literal dot, and leading `-` excludes colocated helpers.
- `public.ts` is the approved cross-module façade; `internal/` is private.
- `*.functions.ts` denotes server functions; `*.actions.ts` denotes server actions/application adapters.
- `*.test.ts(x)` is Vitest; `*.spec.ts` is primarily Playwright/browser-level.
- `UPPERCASE.md` is reserved for canonical project/reference documents.

**Directories:**
- Lowercase kebab-case for domains such as `answer-thread/`, `notification-outbox/`, and `routing-kernel/`.
- Plural names for collections (`components/`, `modules/`, `routes/`, `tests/`).
- `internal/` consistently marks module-private implementation.
- Test folders name proof classes rather than mirroring every source directory.

## Where to Add New Code

**New Domain Capability:**
- Public API: `src/modules/<domain>/public.ts`.
- Pure implementation: `src/modules/<domain>/internal/`.
- Web adapter: `src/modules/<domain>/<domain>.functions.ts` or `.actions.ts`.
- Persistence adapter: `convex/<domain>.ts`.
- Tables: module-local `internal/schema.ts` or `convex-schema.ts`, composed in `convex/schema.ts`.
- Tests: `tests/unit/` plus `tests/integration/` for transport/persistence.

**New Page or API:**
- Route: `src/routes/<tanstack-file-route>.tsx` or `.ts`.
- Private helper: colocated `src/routes/-<name>.ts(x)`.
- Reusable UI: `src/components/ae/<concern>/`.
- Domain behavior: use a module public/server seam; do not import Convex schemas in routes.
- Tests: `tests/integration/`, `tests/e2e/`, and applicable `tests/ui-contract/`.

**New Component:**
- Product UI: `src/components/ae/<concern>/Ae<Name>.tsx`.
- Astryx adapter: `src/components/astryx/<Name>.tsx`.
- Answer primitive: `src/components/ai-elements/`.
- Proof: `tests/ui/`, `tests/unit/`, `tests/ui-contract/`, and Playwright where needed.

**New Convex Operation:**
- Add to owning `convex/<domain>.ts`; keep domain rules in `src/modules/<domain>/`.
- Reuse `convex/authz.ts` and `convex/sourceWriteAdmission.ts` for authority.
- Run Convex codegen; never hand-edit `convex/_generated/`.

**New Routing Binding:**
- Contract/lifecycle: `src/modules/routing-kernel/`.
- Provider adapter registration: `convex/routingKernelBindings.ts`.
- Store behavior: `convex/routingKernelStoreAdapter.ts` and focused siblings.
- Transport: `src/modules/routing-kernel/http.ts`, `mcp.ts`, or `descriptor.ts`, mounted in `convex/http.ts`.
- Update `docs/ROUTING-KERNEL.md` and contract tests.

**New Cross-Cutting Utility:**
- Domain-neutral primitive: `src/modules/common/`.
- Server adapter: `src/lib/server/`.
- HTTP helper: `src/lib/http/`.
- Browser/UI helper: `src/lib/ui/`.
- Observability adapter: `src/lib/observability/`.
- Keep single-domain utilities inside their owning module.

**New Script/Evaluation:**
- Answer evaluation logic: `eval/answer/lib/`, runner in `eval/answer/scripts/`.
- General operational proof: `scripts/`.
- Integration example: `examples/<integration-name>/`.
- Expose stable commands in `package.json` and hosted gates in `.github/workflows/`.

## Special Directories

**`convex/_generated/`:** Generated by Convex codegen; committed, never edited manually.

**`src/routeTree.gen.ts`:** Generated from `src/routes/`; committed, not manually edited.

**`.vercel/`, `.tanstack/`, `.output/`, `.vinxi/`:** Framework/deployment build artifacts; ignored.

**`output/`:** Generated evaluation/audit reports; ignored by default.

**`.planning/`:** Workflow-managed planning/proof artifacts; not runtime source.

**`vendor/handshake-protocol-kernel/`:** Committed upstream/reference material; preserve its ownership boundary.

**`src/future-phases/`:** Deferred material excluded by `tsconfig.json`; not active runtime proof.

**`node_modules/`:** npm-installed dependencies; ignored.

---

*Structure analysis: 2026-07-11*
*Update when directory structure changes*
