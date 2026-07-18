# Coding Conventions

**Analysis Date:** 2026-07-18  
**Last mapped commit:** `5ea44454`

Authority for process and hard TypeScript rules: `.planning/ENGINEERING-STANDARDS.md`.  
Module layout and actions: `.agents/skills/ae-actions-and-modules/SKILL.md`.  
Deep-module vocabulary: `.agents/skills/codebase-design/SKILL.md`.  
Convex composition: `.agents/skills/ae-convex-guardrails/SKILL.md`.

## Naming Patterns

**Files:**
- Domain modules under `src/modules/<domain>/` use kebab-case directories (`customer-request`, `capability-supply`, `answer-thread`).
- Module surface files: `<domain>.actions.ts`, `<domain>.functions.ts`, `public.ts`, plus `internal/` for private implementation.
- Application/deepened slices use kebab-case file names: `start-or-resume.ts`, `lease-next-dispatch.ts`, `serialize.ts`, `ports.ts`, `types.ts`, `index.ts` (example: `src/modules/customer-request/route-execution/machines/`).
- Convex hosts use camelCase filenames matching the domain: `convex/inquiries.ts`, `convex/capabilitySupply.ts`, `convex/customerRequestRouteExecution.ts`.
- Convex ports/adapters sit beside the host: `convex/inquirySourceStatePorts.ts`, `convex/customerRequestRouteExecutionJournalPorts.ts`, `convex/customerRequestEvidenceLoadPorts.ts`.
- Tests mirror the module path under `tests/unit/<domain>/…` with `*.test.ts` (behavior) or `*-thinness.test.ts` (architecture/thin-host gates).
- Playwright specs use `*.spec.ts` under `tests/e2e/` and `tests/deploy-smoke/`.

**Functions:**
- Prefer camelCase verbs that name the domain operation: `submitInquiry`, `startOrResume`, `listEligibleCapabilitySupply`, `assembleCustomerEvidenceExport`.
- Convex-exported functions keep the same public names as the host API (`export const submitPublicInquiry`, `export const startOrResume`).
- Ports factories are named `<domain><Concern>Ports` or `*MutationPorts` / `*LoadPorts`: `inquirySourceStatePorts`, `journalMutationPorts`, `evidenceLoadPorts`, `capabilitySupplyGraphPorts`.
- Module entrypoints called from Convex often use an `*FromModule` or `*Application` / `*Module` suffix: `queryCapabilityGraphFromModule`, `reportRouteProblemApplication`, `submitInquiryModule`.
- Barrel re-exports in `public.ts` import `* as …Impl` / `… as …Impl` then re-export the clean name (pattern in `src/modules/inquiries/public.ts`).

**Variables:**
- camelCase locals; `UPPER_SNAKE` only for true constants in tests/fixtures when needed.
- Discriminated results use `kind` (and often `reason`) — not broad `status: string`.
- Brand helpers via `brandNonEmpty` from `@/modules/common/ids` for typed IDs in tests and domain code.

**Types:**
- Prefer ` cons`t tuple + derived union over TypeScript `enum`:
  ```ts
  export const StatusValues = ['one', 'two'] as const
  export type Status = (typeof StatusValues)[number]
  export const StatusSchema = z.enum(StatusValues)
  ```
- Ports interfaces live in the module (`src/modules/.../ports.ts`) and stay free of Convex `Doc` / `MutationCtx` / `QueryCtx`.
- Result unions are discriminated (`kind: 'registered' | 'refused' | …`). Use `satisfies` for fixtures and exhaustive maps.
- Exhaustive switches assign `const _exhaustive: never = value` (or `exhaustive`) in the default branch — see `src/modules/customer-request/application/route-plan-projection/project-run.ts`, `src/lib/ui/status-presentation.ts`.

## Code Style

**Formatting:**
- No Prettier config or `format` script detected in package manifests.
- Match surrounding file style: 2-space indent, single quotes, no semicolons omitted inconsistently within a file — follow the file you edit.
- Prefer multi-line object/args when call sites already wrap; keep thin Convex handler bodies short enough that thinness tests pass.

**Linting:**
- Primary linter: **oxlint** via `npm run lint` → `oxlint src convex tests tools examples --deny-warnings`.
- Config: `.oxlintrc.json` — `correctness` category as error; `suspicious` off; TypeScript + oxc plugins; ignores `convex/_generated/**`, `tests/fixtures/**`, `vendor/**`.
- Additional enforceable standards live in Vitest scan gates (`npm run test:ts-standards`, `npm run test:imports`, `npm run test:copy`, `npm run test:ui-contract`), not only oxlint.

**Compiler posture** (`tsconfig.json` + ENGINEERING-STANDARDS):
- `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `allowJs: false`.
- Path aliases: `@/*` and `~/*` → `./src/*` (plus a few owner/admin route remaps).

## Import Organization

**Order (observed):**
1. Node builtins (`node:fs`, `node:path`) when present.
2. External packages (`vitest`, `zod`, `convex-test`, framework packages).
3. Blank line, then `@/` / `~/` aliases (modules, lib, routes).
4. Relative imports (`.` / `..`) last — types often `import type { … }`.

**Rules:**
- Imports stay at the top of the file (no inline dynamic imports for ordinary module wiring).
- Outside a module, import only `src/modules/<domain>/public` (or documented public sub-barrels such as `application/public`). Never import another module’s `internal/`.
- Routes import public seams only — enforced by `tests/imports/private-imports.test.ts` / `scanPrivateImports` in `src/lib/ui/contract-scans.ts`.
- Convex hosts may import `@/modules/...` public or explicitly deepened internal packages that thinness tests pin (e.g. `@/modules/capability-supply/internal/graph`) **and** local `./…Ports` adapters.
- Pure domain modules must not import `convex/server`, `./_generated`, `MutationCtx`, `QueryCtx`, `ActionCtx`, or `Doc<>`.

**Path Aliases:**
- Prefer `@/modules/...` over deep relative paths from `src/` and tests.
- Convex files use relative imports for sibling Convex adapters (`./inquirySourceStatePorts`) and `@/` for domain modules.

## Error Handling

**Patterns:**
- Expected domain failures return discriminated result unions (`kind: 'refused'`, `kind: 'conflict'`, …) — do not throw for business refusals.
- Throw / reject only for programmer or infrastructure faults.
- Convex mutations/actions validate untrusted input with Convex validators (`v.union`, `v.object`); keep `returns` exact (scan rule `inexact-convex-return`).
- Public/HTTP layers expose allowlisted DTOs and readbacks; do not leak internal identifiers in public copy (copy gates).

## Logging

**Framework:** Application observability goes through domain audit/funnel modules (`src/modules/observability/`) and provider clients — not ad-hoc `console.log` in new domain paths.

**Patterns:**
- Consequential mutations write typed audit events in the same logical operation (ENGINEERING-STANDARDS audit section).
- Redact sensitive payloads; tests cover redaction under `tests/unit/observability/`.

## Comments

**When to Comment:**
- Prefer self-describing names and result `kind`/`reason` strings over narrative comments.
- Document rare exceptions at the site (e.g. allowed `v.any()` boundaries must include the exact comment phrases scanned by `isDocumentedJsonBoundary` in `src/lib/ui/contract-scans.ts`).

**JSDoc/TSDoc:**
- Sparse in domain code; ActionDefinition `summary` / `boundaries` carry the public contract for assistants (`src/modules/common/action.ts`, module `*.actions.ts`).

## Function Design

**Size:**
- Keep Convex **host handlers** thin: wiring + auth + ports call. Thinness tests enforce handler body line budgets (examples: ≤40 lines for route-execution machine shells, ≤90 for `submitPublicInquiry`, ≤120 for `exportCustomerEvidence`).
- Ports **factory** files stay small (commonly ≤80 lines) and only assemble port methods.
- Implementation files under deepened modules and Convex port impls must stay **≤1000 lines** per file (thinness campaign invariant).
- Prefer extracting pure logic into `src/modules/...` rather than growing Convex hosts.

**Parameters:**
- Pass ports/adapters as explicit dependencies (`startOrResume(args, ports)`, `listEligible…(eligibleSupplyPorts(db), input)`).
- Prefer one command/input object over long positional lists for domain operations.

**Return Values:**
- Discriminated unions with literal `kind` (and `reason` when refused/conflicted).
- Avoid `Promise<unknown>` and `returns: v.any()` outside documented, comment-marked boundary adapters.

## Module Design

**Exports:**
- `public.ts` is the only import path for sibling modules and routes.
- Re-export types and functions from `internal/` with clean names; keep `internal/` private (enforced by import scans).
- Actions: declare in `<domain>.actions.ts`, register via import in `src/modules/actions/index.ts`.

**Barrel Files:**
- Use `public.ts` and focused `index.ts` barrels inside deepened slices (e.g. `route-execution/machines/index.ts`, `application/public.ts`).
- Do not create catch-all global `validators.ts` dumping grounds — validators live with the owning module.

**Deepening / thin Convex host (prescriptive):**
1. Move pure / port-driven logic into `src/modules/<domain>/…`.
2. Add a Convex `*Ports.ts` factory that binds `ctx.db` / helpers to the module ports interface.
3. Leave validators, auth checks, and `export const … = mutation|query|action` shells in the Convex host.
4. Lock the split with a `*-thinness.test.ts` that asserts: no redefined moved symbols in the host, ports wiring present, module free of Convex runtime imports, line budgets, and no cross-concern leakage (e.g. journal must not import machines; notification ports must not load source-state).

**Anti-patterns to avoid:**
- Re-inlining moved helpers into `convex/*.ts` after a deepen wave.
- Inventing sibling Convex hosts for each machine (`customerRequestRouteExecutionStart.ts`, etc.) when the campaign forbids them.
- Introducing `WritePlan` / `intendedPatches` DTOs in journal/machines/evidence-load.
- Importing another module’s `internal/` from routes or sibling modules.
- Broad `status: string` / `any` / non-null assertions / `as unknown as` in runtime code.

---

*Convention analysis: 2026-07-18 (commit `5ea44454`)*
