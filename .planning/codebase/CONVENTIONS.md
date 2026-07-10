# Coding Conventions

**Analysis date:** 2026-07-10

## Governing Standards

- `.planning/ENGINEERING-STANDARDS.md` is the repository's implementation constitution. It defines the TypeScript hard spec, module boundaries, route/Convex rules, audit requirements, source scans, and verification ladder.
- `CLAUDE.md` adds change-discipline guidance: inspect before coding, prefer the smallest durable solution, keep edits surgical, and define verifiable success criteria.
- `tsconfig.json` enforces the core language posture: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `isolatedModules`, and `noEmit`.
- There is no ESLint, Prettier, or Biome configuration in the current repository. Formatting is maintained by matching nearby source, while repository-specific static constraints are executable Vitest scans under `tests/imports/` and `tests/ui-contract/`.

## Language and Formatting

- Source is TypeScript/TSX in ESM mode (`"type": "module"` in `package.json`); JavaScript source is disallowed by `allowJs: false` in `tsconfig.json`.
- Files consistently use single quotes, omit semicolons, and include trailing commas in multiline literals and parameter lists. Representative examples include `src/modules/common/result.ts` and `src/modules/registry/internal/validators.ts`.
- Use two-space indentation. Break long calls, generic types, object literals, and JSX props across lines rather than compressing them.
- Import groups are separated by blank lines: platform or package imports first, then repository aliases. Type-only dependencies use `import type`, as in `tests/integration/registry-api.test.ts`.
- Prefer the `@/` alias for `src/` imports. `tsconfig.json` also defines `~/`, but repository source predominantly uses `@/`.
- Generated outputs are not hand-edited. `src/routeTree.gen.ts` and `convex/_generated/` are generated surfaces; the latter is excluded from TypeScript input and source scans.

## Naming

- Files use lowercase kebab-case for general modules and components, for example `src/modules/common/stable-hash.ts` and `src/components/ae/chat/answer-turn-state.ts`.
- TanStack file-based route names encode route hierarchy with dots and dynamic segments with `$`, for example `src/routes/api.businesses.$slug.ts` and `src/routes/_operator/admin.runs.$turnId.tsx`.
- Route-local implementation files begin with `-` so they are excluded from route generation, for example `src/routes/-registry-search-params.ts` and `src/routes/_operator/-owner-billing-readback.ts`.
- React component files may retain PascalCase when matching an exported component or vendor-derived surface, such as `src/components/ai-elements/MessageContent.tsx`.
- Types, React components, schemas, and exported constant-value tuples use PascalCase: `ModuleResult`, `IndexStatusSchema`, and `IndexStatusValues`.
- Functions and local variables use camelCase. Boolean names describe the condition (`retryable`, `hasMore`, `paymentRequired`) rather than using ambiguous flags.
- Domain string values and result codes use `snake_case`, while human-facing route slugs and URLs use kebab-case.
- Test names describe observable behavior in complete phrases, for example `it('keeps durable public DTOs strict across registry and API outputs', ...)` in `tests/integration/registry-api.test.ts`.

## Type and Domain Modeling

- Model finite domain vocabularies as readonly tuples plus derived unions, not TypeScript enums:

  ```ts
  export const StatusValues = ['one', 'two'] as const
  export type Status = (typeof StatusValues)[number]
  ```

- Pair boundary validation with the owning vocabulary. Zod schemas use the tuple directly, as `z.enum(IndexStatusValues)` does in `src/modules/registry/internal/validators.ts`.
- Expected failures are discriminated result unions. `src/modules/common/result.ts` establishes `kind: 'ok' | 'error'`, literal `code` values, and an explicit `retryable` field for errors.
- Prefer readonly DTOs and explicit input/output types at module and transport boundaries. Public projections must be allowlisted rather than serialized from persistence records.
- Use `satisfies Record<Union, ...>` for exhaustive maps. Do not use broad `string` status fields, `enum`, `Partial<Record<...>>` for required maps, explicit `any`, `as any`, `as unknown as`, or non-null assertions.
- Allowed narrowing patterns are `as const`, `satisfies`, generated-code casts, and the single documented validator-helper exception described by `.planning/ENGINEERING-STANDARDS.md`.
- `tests/types/domain-contracts.test.ts`, `tests/types/capability-contracts.test.ts`, and related files use `expectTypeOf` to prove schema/type equality and literal preservation.

## Module Boundaries

- Domain code is organized under `src/modules/<domain>/`. Each module owns its model, validators, source state, operations, and public projection.
- `public.ts` is the stable import seam for consumers. Module-private implementation belongs under `internal/`; routes and other modules must not import another module's `internal/` files.
- Framework boundary functions are separated into purpose-named files such as `*.functions.ts` and `*.actions.ts`; UI/readback adapters use names such as `*.readback.ts` and `*.panels.tsx`.
- Routes are adapters. They may compose UI, generated client hooks intended for routes, and module public seams, but must not reach into provider SDKs, `convex/schema`, or module internals.
- Cross-domain primitives live in `src/modules/common/`, including result types, IDs, hashes, audit events, and Convex literal helpers. Avoid generic dumping-ground utilities.
- Convex top-level files compose runtime functions and schemas from source-owned modules. `convex/schema.ts` is a composition root rather than a second domain model.
- The import rules are executable: `tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/backup-imports.test.ts`, and `tests/imports/source-mining.test.ts` scan the repository for boundary violations.

## Functions and Control Flow

- Functions expose explicit inputs and return values at system boundaries. Server functions with input use an input validator; Convex functions validate all untrusted arguments.
- Prefer deterministic pure transformations in domain code and isolate network, persistence, time, and provider access behind named adapters.
- Consequential/retryable operations carry durable logical keys, typed audit data, and idempotency information. Best-effort external writes without attempt state are prohibited.
- Handle expected negative outcomes as data, not exceptions. Reserve throws for programmer errors or infrastructure faults.
- Environment mutations in tests are restored in `afterEach` or `finally`; `tests/integration/registry-api.test.ts` demonstrates preserving the previous value and deleting it when originally absent.
- Avoid hidden global state. Where an in-memory source is used, expose creation/reset helpers so tests can construct isolated state explicitly.

## React and Route Conventions

- TanStack Router file conventions own route discovery; do not edit `src/routeTree.gen.ts` manually.
- Route-specific components and parsing helpers sit beside the route with `-`-prefixed filenames, keeping route adapters smaller without expanding a global component surface.
- Server-only logic is kept behind server functions or server modules rather than imported into client-rendered component code.
- UI tests favor accessible roles and labels, mirroring the product requirement that controls remain keyboard and screen-reader discoverable.
- UI state is explicit: loading, empty, unavailable, error, and success states have distinct components or discriminants rather than being inferred from missing data.
- Public surfaces must avoid internal vocabulary and unsupported capability claims. Copy and UI-contract tests make this a code convention, not merely editorial guidance.

## Validation, Security, and Observability

- Validate untrusted data at HTTP, server-function, provider, and Convex boundaries. Zod is the primary general-purpose schema library; Convex validators own database function contracts.
- Derive actor and administrator authority at trusted server/Convex boundaries. Browser-supplied owner or admin identifiers are not authoritative.
- Public outputs use allowlist builders and tests assert that private identifiers, source hashes, provider payloads, and unsupported capability flags do not leak.
- Consequential mutations emit typed audit events with actor, target, correlation, idempotency, and redacted evidence fields as required by `.planning/ENGINEERING-STANDARDS.md`.
- Logs and receipts distinguish source-owned facts from provider readback and external evidence. Provider success is not silently treated as local authority.
- Error codes are stable machine-readable literals; messages are safe for their audience and must not expose secrets or raw provider responses.

## Documentation and Comments

- Prefer names and types that make behavior self-explanatory. Comments explain a non-obvious invariant, boundary, or operational reason rather than restating code.
- Documentation changes accompany changes to behavior, setup, environment variables, APIs, or authority boundaries.
- Planning documents classify statements as invariants, interfaces, state machines, failure modes, acceptance gates, runbooks, or decisions; unsupported maturity claims are explicitly rejected.
- Keep generated and derived documents subordinate to live code and configuration when they disagree.

## Enforced Checks

- `npm run typecheck` applies the strict TypeScript contract.
- `npm run check:convex-codegen` checks schema/function compatibility without rewriting generated files.
- `npm run test:ts-standards` scans source for banned TypeScript constructs and widened contracts.
- `npm run test:imports` and `npm run test:source-mining` enforce ownership and import boundaries.
- `npm run test:copy`, `npm run test:seo`, and `npm run test:ui-contract` enforce public-language, discovery, and visual-contract constraints.
- Fixture variants such as `npm run test:ts-standards:fixtures` prove the scanners reject known-bad files under `tests/fixtures/`.

---

*Convention analysis: 2026-07-10*
