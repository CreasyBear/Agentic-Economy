# Coding Conventions

**Analysis Date:** 2026-08-09

## Naming Patterns

- `package.json` declares strict ESM (`"type": "module"`); domain directories and non-React files use lower-kebab-case (`src/modules/capability-supply/`, `src/modules/answer-thread/`).
- React components and their exports use PascalCase (`src/components/ae/chat/AeThreadTurnStreamSection.tsx`); TanStack route filenames mirror generated route identities (`src/routes/api.answer.turn.ts`, `src/routes/t.new.tsx`).
- Functions, variables, and ports use lower camel case; protocol/limit constants use upper snake case (`MAX_ANSWER_TURN_BODY_BYTES`, `ANSWER_TURN_DATA_PART`).
- Domain states are exact literal tuples plus indexed unions (`src/modules/business/public.ts`); Convex and Zod validators repeat those literals at persistence and wire boundaries.
- Boundary identities use semantic brands (`src/modules/common/ids.ts`, `src/modules/common/canonical-digest.ts`); operation and mapping references have explicit `operation:v1:`/`mapping:v1:` validation (`src/modules/capability-supply/public.ts`).
- Tagged outcomes use discriminated `kind` or `status` unions rather than broad status strings (`src/modules/capability-supply/internal/admit-provider-schema.ts`, `convex/answerThreads.ts`).

## Code Style

- Current source consistently observes two-space indentation, single-quoted strings, no semicolons, trailing commas, and native ESM imports (`src/start.ts`, `src/modules/common/canonical-digest.ts`, `convex/answerThreads.ts`).
- No repository Prettier, ESLint, or Biome configuration is present; `npm run lint` invokes `oxlint src convex tests tools --deny-warnings` using `.oxlintrc.json`.
- `tsconfig.json` is strict and no-emit: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `isolatedModules`, and `forceConsistentCasingInFileNames` are enabled.
- Optional fields are preserved with conditional spreads; callers narrow `unknown` before use and favor readonly contract shapes (`src/modules/answer/public.ts`, `src/modules/capability-contract/public.ts`).
- Public schemas use Zod strict objects/unions and bounded JSON; Convex functions expose exact `v.object`/`v.union` return validators. Documented JSON adapter boundaries are the explicit `v.any()` exception (`src/lib/ui/contract-scans.ts`).
- Product routes and `src/components/ae` use semantic visual tokens. `scanUiContract` rejects raw colors, broad transitions, hard-coded layers, generic shadows, raw overlays, arbitrary visual tokens, and route-local scroll listeners.
- These are dominant patterns, not proof that every historical file is clean: generated `src/routeTree.gen.ts`, evidence tools under `tools/dev/`, and adjacent `src/components/ai-elements/code-block.tsx` retain observed legacy/intentional deviations.

## Import Organization

- The common grouping is external/Node imports, a blank line, then `@/` project imports; relative imports serve same-module siblings and test helpers. Type-only imports are explicit (`src/start.ts`, `tests/unit/answer/answer-selected-operation-loop.test.ts`).
- Consumers use a module's `public.ts`; server-only and Convex-safe hosts use `server.ts` or `convex.ts`, while test overrides are exposed through `testing.ts` (`src/modules/answer-thread/`, `src/modules/capability-execution/`).
- Routes are not allowed to own Convex transport or import module internals; `tests/imports/private-imports.test.ts` and `tests/imports/route-boundary.test.ts` scan these boundaries.
- `convex/schema.ts` is the intentional composition exception for importing module-owned schema fragments; public/Convex seam files may import their own `internal` implementation (`src/lib/ui/contract-scans.ts`).
- Import ordering is not mechanically uniform in all current files; preserve the public/private boundary rather than adding a global sorter.

## Error Handling

- HTTP adapters project failures through RFC 9457 `application/problem+json` using `src/lib/errors.ts`, `src/lib/server/problem.ts`, and `src/lib/server/method-guard.ts`; wrong methods have explicit 405 handlers and `Allow` headers (`src/routes/api.v1.operations.execute.ts`).
- Expected domain outcomes are tagged values, not exceptions: publication/admission, answer reservations, exact-money pricing, and operation execution each expose named refusal/conflict/unknown branches.
- `src/routes/api.answer.turn.ts` bounds and parses requests, admits rate limits, authenticates optional gateway requests, reserves durable state, and emits typed SSE error frames; raw provider errors do not cross the route boundary.
- Unknown failures are narrowed/redacted at transports. CLI commands map source failures to `CliFailure` and emit one human diagnostic or structured JSON (`tools/ae/cli.ts`, `tools/ae/lib/output.ts`).
- `src/modules/money/public.ts` uses exact `{ currency, units, exponent }` amounts and typed refusal codes; do not reintroduce floating-point prices or ad hoc money strings.

## Logging

- Server observability is opt-in and isolated in middleware (`src/start.ts`); Sentry/PostHog receive sanitized path, correlation, and error data.
- Convex/server logs use short searchable event names and redacted codes/details (`convex/customerRequestApplication.ts`, `convex/customerRequestCompareResumePorts.ts`).
- CLI diagnostics go to stderr and machine-readable output to stdout. Never log credentials, provider payloads, private database fields, or secret values (`tools/ae/lib/output.ts`).

## Comments

- Comments explain authority, security, lifecycle, protocol, or compatibility rationale rather than restating code (`src/modules/capability-supply/internal/admit-provider-schema.ts`, `src/start.ts`).
- JSDoc marks public pure projections and boundary contracts; tests explain durable-wire and negative-proof invariants (`src/lib/server/problem.ts`, `tests/integration/answer-turn-ui-stream.test.ts`).
- Comments may document scanner exceptions or test-only doubles, but must not normalize them as product patterns; avoid speculative TODO scaffolds.

## Function Design

- Prefer small deterministic functions with explicit readonly inputs/results, guard clauses, and exact tagged returns (`src/modules/common/canonical-digest.ts`, `src/modules/money/internal/exact-amount.ts`).
- Effects sit behind injected ports/options: answer routes accept admission/stream/auth overrides, admission accepts dereferencing seams, and answer-thread persistence exposes `setAnswerThreadPortForTests`.
- Bound request, schema, checkpoint, and model-result sizes before persistence or prompt construction (`src/routes/api.answer.turn.ts`, `src/modules/capability-contract/public.ts`); preserve absent optionals with explicit `undefined` branches.
- React effects keep generation/mounted state and unsubscribe or abort stale work (`src/components/ae/chat/AeThreadTurnStreamSection.tsx`).
- Large orchestrators and Convex transactions remain focused lifecycle exceptions (`src/modules/answer-thread/internal/turn-orchestrator.ts`, `convex/answerThreads.ts`); new code should deepen an existing seam or extract a pure helper.

## Module Design

- Modules are domain-oriented: public contracts in `public.ts`, implementation under `internal/`, server-only effects in `server.ts`, Convex-safe exports in `convex.ts`, and test-only seams in `testing.ts`.
- Routes adapt HTTP to module seams; they parse/guard input and project responses rather than owning persistence, schema composition, or provider transport.
- Convex hosts use generated API references and exact validators; `convex/schema.ts` composes module-owned schema fragments.
- UI primitives live under `src/components/ui`, product/domain components under `src/components/ae`, route composition under `src/routes`, and CLI/tooling under `tools/`.
- `tests/imports/` and `tests/ui-contract/` are executable boundary/style guardrails. Test-only fixture/adapters live under `tests/helpers/` and must not become deployable imports.

*Convention analysis: 2026-08-09*

Updated from the current repository configuration and source tree on 2026-08-09; explicit generated, evidence-tool, and test-only exceptions are retained where observed.
