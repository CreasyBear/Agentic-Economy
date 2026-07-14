# Coding Conventions

**Analysis Date:** 2026-07-14
**Evidence Base:** Live working tree at `63f7fac5`, remote `origin/main` at `aca296db`, plus current CI and tests. The shared local tree is ahead 3, behind 10, and materially dirty; neither ref is a complete description of the files on disk.

## Naming Patterns

**Files:**
- Use kebab-case for general modules and utilities (`src/lib/server/bounded-request-body.ts`, `src/modules/common/stable-hash.ts`).
- Domain modules expose deliberate surfaces: `public.ts`, `*.actions.ts`, `*.functions.ts`, with implementation under `internal/` (`src/modules/capability-supply/public.ts`, `src/modules/inquiries/internal/commands.ts`).
- TanStack file routes encode paths: `_operator` is a layout segment and `$name` is a parameter (`src/routes/_operator/owner.settings.tsx`, `src/routes/api.requests.$requestRef.options.ts`).
- Match the containing UI directory: established AE components are PascalCase (`src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx`); module and utility files are normally kebab-case.
- Vitest files use descriptive `*.test.ts[x]`; Playwright files use `*.spec.ts` (`tests/unit/customer-request/customer-request-workspace.test.tsx`, `tests/e2e/thread-first.spec.ts`).

**Symbols:**
- Use camelCase for functions, variables, hooks, and handlers; PascalCase for React components and types; UPPER_SNAKE_CASE only for true module constants.
- Prefer verbs that reveal ownership and effect: `compile`, `project`, `register`, `publish`, `authorize`, `admit`, `record`, `inspect`, `resume`.
- Test-only seams must say so (`setAnswerThreadPortForTests`, `createAnswerThreadTestStore`).
- Types have no `I` prefix. Prefer readonly objects, exact identifiers, and discriminated unions with literal `kind`, `state`, `status`, `reason`, or `code` fields.

## Code Style and Type Safety

**Formatting:**
- Use two-space indentation, single quotes, trailing commas in multiline constructs, and no semicolons. No project Prettier configuration or line-length rule exists; match surrounding source.
- Never hand-edit generated `convex/_generated/**` or `src/routeTree.gen.ts`.

**Enforcement:**
- `npm run lint` runs Oxlint over `src`, `convex`, `tests`, `tools`, and `examples`; `.oxlintrc.json` enables correctness rules but deliberately disables the suspicious category and unused-variable rule.
- `tsconfig.json` enables `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, and `isolatedModules`.
- `tests/imports/ts-standards.test.ts` supplements the compiler by rejecting unsafe assertions, broad `any`, non-null assertions, and weak domain status types.
- Validate untrusted values with Zod, Convex validators, or the capability contract JSON-Schema boundary. Narrow optionals before object construction; conditionally spread instead of writing explicit `undefined`.

## Import and Ownership Boundaries

**Order and paths:**
1. Node built-ins and external packages.
2. Blank line, then `@/` production imports (`@/` and `~/` both map to `src/`, but `@/` is dominant).
3. Blank line, then relative same-owner or Convex imports.
4. Mark type-only imports with `import type` or inline `type`.

**Public seams:**
- Cross-domain code imports the owning module's `public.ts`; validators, persistence commands, adapter details, and schemas stay internal. Static enforcement lives in `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, and domain boundary suites.
- Shared operations are declared in `src/modules/*/*.actions.ts` and registered through `src/modules/actions/index.ts`.
- The canonical customer wire contract is `src/modules/customer-request/agent-contract.ts`; HTTP handlers consume it through `src/lib/server/customer-request-*.ts`, human UI consumes `src/modules/customer-request/customer-projection.ts`, and routes remain thin delegates under `src/routes/api.requests*.ts` and `src/routes/api.v1.requests*.ts`.
- Keep capability grammar, supply registration, commercial offering, transport binding, credentials, eligibility, compilation, and ranking as separate authorities (`src/modules/capability-contract/public.ts`, `src/modules/capability-supply/public.ts`). Provider or vertical vocabulary must not control kernel branches.
- Runtime product behavior belongs under `src/` and `convex/`; `tools/`, `examples/`, tests, generated maps, and planning files may prove or operate behavior but cannot own it. `tests/imports/customer-request-source-completeness.test.ts` checks part of this rule.

## Function and Module Design

- Prefer a single typed input object for multi-field operations and explicit return types at exported/effect boundaries.
- Use early guards and exhaustive discriminator handling. Pure domain functions are deterministic; inject clocks, fetch, stores, interpreters, and provider adapters at effect boundaries.
- Model expected refusal, conflict, waiting, unknown outcome, and unsupported states as typed results rather than exceptions. Throw for malformed boundaries, missing infrastructure, and violated invariants.
- Bind replay to deterministic keys and digests. Exact replay returns the prior result; changed material under the same key is a conflict.
- Named exports are standard. Default exports are reserved mainly for framework-required route/config/schema objects.

## Error Handling, Security, and Observability

- At HTTP boundaries, bound bodies, parse defensively, validate once, return stable public codes, and use `Cache-Control: no-store` where state or identity is involved (`src/lib/server/customer-request-api.ts`).
- Fail closed on missing auth, stale revisions, invalid contract digests, unpublished or ineligible supply, mismatched preparation, exceeded authority, missing evidence, and unknown provider outcomes.
- Catch at ownership boundaries. Do not expose exception messages, credentials, raw customer values, provider payloads, or internal identifiers.
- Sentry/PostHog are centralized in `src/modules/observability/`; redact before telemetry via `src/modules/observability/internal/redaction.ts`. No single general-purpose logger exists, so do not scatter console diagnostics through domain code.
- Use `try/finally`, `afterEach`, or explicit restoration whenever replacing environment, globals, clocks, ports, servers, or mocks.

## Convex Conventions

- Read `convex/_generated/ai/guidelines.md` before Convex work. Every public/internal function declares `args` and `returns`, uses generated wrappers and contexts, and queries via indexes rather than filter scans.
- Authorization comes from `ctx.auth.getUserIdentity()` and `identity.tokenIdentifier`, never caller-provided user IDs. Human server handlers acquire a Clerk `convex` token through `src/lib/server/convex-source.ts`; agent endpoints use the separate service-assertion boundary.
- Compose module-owned table fragments in `convex/schema.ts`. Keep internal operations internal and public functions intentionally small.

## Shared-Tree Discipline

- The repository is actively shared. Before editing, inspect `git status --short`, `git diff -- <path>`, and branch divergence; stage only explicitly owned files.
- Never use `git clean`, `git reset --hard`, bulk checkout/restore, or permanent deletion. Move removals to Trash under the repository safety policy.
- A green remote run proves its exact clean SHA, not this dirty, divergent workspace. Conversely, local uncommitted tests can pass for source that has never reached CI or production. Record the proof rung explicitly.
- Do not rewrite unrelated planning, generated graphs, provider integrations, inquiries, or concurrent ticket work merely to make a local aggregate gate green.

---

*Convention analysis: 2026-07-14*
*Update when patterns or authority boundaries change*
