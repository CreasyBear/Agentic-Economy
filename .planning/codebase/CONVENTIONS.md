# Coding Conventions

**Analysis Date:** 2026-08-15

## Naming Patterns

**Files:**
- Use kebab-case for domain and utility modules: `src/modules/answer/internal/contract-input-binding.ts`, `src/lib/server/request-correlation.ts`, and `src/modules/capability-supply/route-transport-runtime.ts`.
- Use PascalCase for React component modules and match the exported component name: `src/components/ae/chat/AeChat.tsx`, `src/components/ae/artifacts/AeGenerativeAnswer.tsx`, and `src/components/ui/AlertDialog.tsx`-style primitives such as `src/components/ui/alert-dialog.tsx`.
- Keep route filenames aligned with TanStack file routing, including dots and `$` parameters: `src/routes/api.answer.turn.ts`, `src/routes/operations.$operationRef.tsx`, and `src/routes/t.$threadId.tsx`.
- Use explicit role suffixes for module seams: `public.ts` for supported imports, `server.ts` for server-only APIs, `*.functions.ts` for server-function adapters, `*.actions.ts` for action declarations, and `convex.ts` for Convex-facing projections; examples are `src/modules/answer/public.ts`, `src/modules/answer/server.ts`, and `src/modules/answer/convex.ts`.
- Put implementation details beneath `internal/`; consumers must import through a module seam. This is enforced by `tests/imports/private-imports.test.ts` and scanned by `src/lib/ui/contract-scans.ts`.
- Name tests after the behavior or boundary under test with `.test.ts`/`.test.tsx`; reserve `.spec.ts` for Playwright browser and deploy-smoke suites under `tests/e2e/` and `tests/deploy-smoke/`.

**Functions:**
- Use camelCase verb phrases: `buildProblem`, `projectAnswerOperationResult`, `resolveInitialDraft`, and `readAnswerThreadTurnRows` in `src/lib/errors.ts`, `src/modules/answer/internal/operation-result-presentation.ts`, `src/components/ae/chat/AeChat.tsx`, and `convex/answerThreads.ts`.
- Prefix pure constructors/projections with `build`, `project`, `to`, `parse`, `normalize`, or `resolve`; prefix side effects with `create`, `record`, `persist`, `issue`, `revoke`, `delete`, or `emit`. Representative catalogs are `src/modules/answer/public.ts` and `src/modules/capability-supply/public.ts`.
- Prefix runtime type guards with `is` and return a type predicate, as in `isAdapterConfig` in `tests/helpers/convex-fixtures.ts` and `isAnswerTurnProblemCode` in `src/lib/errors.ts`.
- Name React event callbacks `handleX`, component callback props `onX`, and state transitions with an action verb; `src/components/ae/chat/AeChat.tsx` uses `handleSubmit`, `handleNewQuestion`, `onSettledTurn`, and `clearLiveTurnIfSettled`.
- Use named exports for functions and components. Default exports are limited to framework-required configuration/schema files such as `vite.config.ts`, `vitest.config.ts`, and `convex/schema.ts`.

**Variables:**
- Use camelCase for local values and parameters, with names that preserve domain meaning rather than generic `data`: `reservationKey`, `requestDigest`, `operationInvokeContext`, and `checkpointDigest` in `src/routes/api.answer.turn.ts` and `convex/answerThreads.ts`.
- Use SCREAMING_SNAKE_CASE for immutable module-level limits, patterns, and enumerations: `MAX_ANSWER_TURN_BODY_BYTES` in `src/routes/api.answer.turn.ts`, `ANSWER_THREAD_MAX_TURNS` in `convex/answerThreads.ts`, and `PROBLEM_KINDS` in `src/lib/errors.ts`.
- Suffix React refs with `Ref`, state setters with `set`, and booleans with `is`, `has`, `show`, or capability-specific adjectives; see `generationRef`, `setStreamingBusy`, `hasNonAuthoritativeOptimisticTurn`, and `showWelcome` in `src/components/ae/chat/AeChat.tsx`.
- Prefix intentionally unused destructured fields/parameters with `_`, as in `_savedAt` in `src/components/ae/chat/AeChat.tsx` and `_businessId` in `tests/helpers/discovery-fixture-routes.ts`.
- Use singular nouns for one domain entity and plural nouns for collections; avoid encoding type names in identifiers. `turnRows`, `reservationRows`, and `filtered` in `convex/answerThreads.ts` are representative.

**Types:**
- Use PascalCase nouns for object types and PascalCase result names for discriminated unions: `ActionContext`, `ActionDefinition`, `DraftReadResult`, and `AnswerTurnProblem` in `src/modules/common/action.ts`, `src/components/ae/chat/AeChat.tsx`, and `src/lib/errors.ts`.
- Prefer `type` aliases over `interface`; current domain contracts consistently use `type` in `src/modules/common/action.ts`, `src/modules/answer/answer-schema.ts`, and `src/modules/answer-thread/answer-thread.schema.ts`.
- Represent state and outcomes as discriminated unions with a `kind`, `status`, `reason`, or `type` discriminator rather than optional-field bags. Examples include `DraftReadResult` in `src/components/ae/chat/AeChat.tsx` and Convex result validators in `convex/answerThreads.ts`.
- Derive string unions from `as const` arrays when values are shared at runtime and compile time, as with `PROBLEM_KINDS` and `ANSWER_TURN_PROBLEM_CODES` in `src/lib/errors.ts`.
- Use `Readonly<T>`, readonly properties, and `readonly` arrays for public contracts and immutable evidence. Examples are `ActionModelUsage` in `src/modules/common/action.ts` and `PublicOperationDescriptor` consumers in `src/modules/answer/internal/contract-input-binding.ts`.
- Use `satisfies` to check fixtures, lookup tables, and literal objects without widening them; examples are `ANSWER_TURN_PROBLEM_DEFINITIONS` in `src/lib/errors.ts`, `PendingAnswerTurnDraft` in `src/components/ae/chat/AeChat.tsx`, and operation fixtures in `tests/unit/answer/operation-result-presentation.test.ts`.
- Use an explicit `never` assignment in the default branch of switches over unions. Current examples include `src/components/ae/chat/use-answer-turn-lifecycle.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, and `src/modules/customer-request/application/preparation-egress/project.ts`.

## Code Style

**Formatting:**
- Use the repository's established TypeScript style: two-space indentation, single quotes, no semicolons, trailing commas in multiline constructs, and braces on the same line. Representative current files are `src/routes/api.answer.turn.ts` and `src/components/ae/chat/AeChat.tsx`.
- No Prettier or Biome configuration is present; formatting is maintained by repository convention and TypeScript-aware editor tooling, while `oxlint` supplies static checks through `package.json`.
- Break long object literals and fluent query chains across lines, preserving one operation per line; Convex examples appear throughout `convex/answerThreads.ts`.
- Use early returns for invalid, unavailable, and terminal states rather than deeply nested branches. `handleAnswerTurnRequest` in `src/routes/api.answer.turn.ts` and `readPendingAnswerTurnDraft` in `src/components/ae/chat/AeChat.tsx` are representative.
- Under `exactOptionalPropertyTypes`, omit absent optional properties instead of assigning `undefined`; use conditional spreads such as `...(value === undefined ? {} : { value })` in `src/lib/errors.ts`, `src/routes/api.answer.turn.ts`, and `convex/answerThreads.ts`.
- Use `null` for explicit absence in serializable/domain results and `undefined` for omitted optional properties. Convex functions must return serializable values; `convex/_generated/ai/guidelines.md` prohibits relying on `undefined` as a Convex value.

**Linting:**
- Run `npm run lint`; `package.json` invokes `oxlint src convex tests tools --deny-warnings`, so warnings fail the gate.
- Run `npm run typecheck`; `tsconfig.json` enables `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, and `forceConsistentCasingInFileNames`.
- Keep imports at module scope. The workspace rule and current modules such as `src/modules/common/action.ts` prohibit inline imports except documented runtime-boundary cases.
- The documented exception is a dynamic runtime split, not convenience loading: `src/routes/api.answer.turn.ts` dynamically imports `@/modules/answer-thread/server` because a static import would pull Node-only execution into the client route graph.
- Add narrow lint suppressions only with a reason on the same line. `src/components/ae/chat/use-answer-turn-lifecycle.ts` documents why one `react-doctor/exhaustive-deps` suppression is safe.
- React quality is additionally scanned by `npm run doctor` from `package.json` and the advisory `.github/workflows/react-doctor.yml` workflow.

## Import Organization

**Order:**
1. Import platform and third-party runtime dependencies first, then third-party types. `src/components/ae/chat/AeChat.tsx` begins with React, TanStack Router, Lucide, and Zod.
2. Insert a blank line, then import repository modules through `@/` public or server seams. `src/routes/api.answer.turn.ts` imports `@/lib/server/*` and `@/modules/*` after external packages.
3. Import relative same-feature modules last. `src/components/ae/chat/AeChat.tsx` keeps `./thread-records-store`, `./AeThreadHeader`, and sibling helpers in this group.
4. In Convex files, import `convex/server` and `convex/values`, then generated APIs, then repository/feature modules. `convex/answerThreads.ts` follows this structure.
5. Use `import type` for type-only dependencies and combine it with value imports where readable; examples are `src/modules/common/action.ts` and `tests/helpers/convex-fixtures.ts`.

**Path Aliases:**
- Use `@/*` for `src/*`; it is defined in `tsconfig.json` and mirrored by `vitest.config.ts`.
- `~/*` also resolves to `src/*`, but current application code predominantly uses `@/`; follow the dominant `@/` convention in `src/routes/api.answer.turn.ts` and `src/modules/answer/public.ts`.
- Route compatibility aliases in `tsconfig.json` map legacy route names such as `@/routes/owner.*` to `src/routes/_operator/owner.*`; do not add new aliases when `@/` or a relative sibling import is sufficient.
- Convex modules use relative imports for `./_generated/*` and cross the root boundary explicitly for shared source modules, as in `convex/answerThreads.ts`.
- Import across module boundaries through `public.ts`, `server.ts`, or another declared seam. `tests/imports/private-imports.test.ts` is the executable guardrail.

## Error Handling

**Patterns:**
- Model expected domain refusals and state transitions as typed result unions, not exceptions. `convex/answerThreads.ts` returns `reserved`, `replayed`, `conflict`, and `refused` variants; `src/components/ae/chat/AeChat.tsx` returns typed storage outcomes.
- Use the shared RFC 9457 problem model for HTTP errors. Build canonical errors with `buildProblem`/`buildAnswerTurnProblem` in `src/lib/errors.ts`, then return them through `problem` in `src/lib/server/problem.ts`.
- Parse untrusted input as `unknown` and validate before use. `src/routes/api.answer.turn.ts` bounds request bytes, parses JSON into `unknown`, then uses `answerTurnRequestSchema.safeParse`.
- Redact provider/private failure details at transport boundaries. `gatewayFailureToProblem`, `buildAnswerTurnProblem`, and `redactAnswerTurnProblem` in `src/lib/errors.ts` expose stable codes and safe details only.
- Throw exceptions for violated internal invariants, unavailable required configuration, and impossible fixture state. Use stable machine-readable messages such as `fixture_operation_ref_invalid` in `tests/unit/answer/operation-result-presentation.test.ts` and `answer_thread_source_write_rejected:*` in `convex/answerThreads.ts`.
- Create custom `Error` subclasses only when callers need structured classification or metadata. Examples include `AnswerTurnProtocolError` in `src/modules/answer/answer-ui-stream.ts`, `ConvexSourceError` in `src/lib/server/convex-source.ts`, and `SourceWriteAdmissionError` in `src/lib/server/source-write-admission.ts`.
- Catch narrowly and distinguish expected aborts/source failures from unknown failures. `src/routes/api.answer.turn.ts` checks `isAbortError`, maps known source errors, and emits a canonical fallback.
- Empty catches are acceptable only for explicitly optional/degraded functionality and require an explanatory comment, as in the optional sidebar refresh and malformed-storage cleanup paths in `src/components/ae/chat/AeChat.tsx`.
- At public security boundaries, fail closed and avoid existence leaks. The authorization cases in `convex/externalRuns.test.ts` verify that anonymous callers receive `authorization_denied` before resource existence is disclosed.

## Logging

**Framework:** Structured observability modules plus narrowly scoped `console` calls.

**Patterns:**
- Emit product/funnel events through dedicated adapters, not ad hoc console logging. `src/components/ae/chat/AeChat.tsx` uses `captureClientProductEventOnClient`, `emitFunnelEvent`, and `emitWave1JourneyEvent`.
- Run request work inside correlation context and propagate `correlationId`; `src/routes/api.answer.turn.ts` uses `runWithRequestCorrelation` and passes the identity into operation invocation.
- Sanitize exception data before telemetry. `src/lib/observability/private-route-safety.ts` converts unknown errors into bounded, redacted records.
- Use `console.warn`/`console.error` only at infrastructure boundaries where the output is operational evidence; tests such as `tests/unit/customer-request/openrouter-transport.test.ts` spy on those calls to verify suppression and behavior.
- Do not log request bodies, credentials, provider secrets, or arbitrary caught-error objects. Public problem projection in `src/lib/errors.ts` deliberately excludes supplier responses and private details.

## Comments

**When to Comment:**
- Explain architectural constraints, security boundaries, counterintuitive runtime splits, and why a compromise is safe. Examples are the dynamic-import explanation in `src/routes/api.answer.turn.ts` and source-write trust comments in `src/modules/common/action.ts`.
- Explain intent and invariants, not line-by-line mechanics. `tests/setup/no-search-gap-writes.ts` documents why all tests install a no-op recorder rather than restating the function call.
- Keep comments current-state and prescriptive. Avoid migration history in new comments; public seams such as `src/modules/answer/public.ts` should explain the supported boundary.
- Document deliberate degraded behavior where errors are swallowed, as in `src/components/ae/chat/AeChat.tsx`.
- Use lint-disable comments only with a specific justification and the narrowest possible scope, as in `src/components/ae/chat/use-answer-turn-lifecycle.ts`.

**JSDoc/TSDoc:**
- Use JSDoc for public contracts, security-sensitive semantics, and helpers whose behavior is not obvious from the signature. `src/modules/common/action.ts` documents authority and trust semantics; `src/lib/errors.ts` documents RFC projections and redaction.
- Omit JSDoc for straightforward local helpers whose names and types are sufficient, such as `labelForContractInput` in `src/modules/answer/internal/contract-input-binding.ts`.
- Reference related symbols with `{@link ...}` where it improves navigation, as in `src/lib/errors.ts`.

## Function Design

**Size:** Prefer small pure projectors, validators, and state-transition helpers. When orchestration is necessarily large, extract named seams and keep effects explicit; `src/modules/answer-thread/internal/turn-orchestrator.ts` delegates to focused modules, while `src/components/ae/chat/AeChat.tsx` isolates storage and projection helpers.

**Parameters:** Use a single typed object parameter when a function has multiple related inputs, optional dependencies, or injected test seams. Examples include `handleAnswerTurnRequest(request, options)` in `src/routes/api.answer.turn.ts` and `createSourceWriteAdmission({...})` exercised in `convex/externalRuns.test.ts`. Use positional parameters for small pure transforms such as `labelForContractInput` in `src/modules/answer/internal/contract-input-binding.ts`.

**Return Values:** Return explicit typed domain results and preserve discriminants with `as const` or `satisfies`. Return `Promise<Response>` at HTTP boundaries, serializable result unions at Convex boundaries, and `void` only for side-effect-only helpers. Avoid ambiguous booleans where callers need a reason; `DraftWriteResult` in `src/components/ae/chat/AeChat.tsx` is the preferred pattern.

## Module Design

**Exports:** Expose supported APIs through module seams such as `src/modules/answer/public.ts`, `src/modules/answer/server.ts`, and `src/modules/capability-supply/public.ts`. Keep implementation files under `internal/`, keep server-only code out of client graphs, and use explicit registration arrays rather than module-evaluation side effects as documented in `src/modules/common/action.ts`.

**Barrel Files:** Use curated barrels as contracts, not wildcard aggregators. `src/modules/answer/public.ts` explicitly re-exports selected values and types; `tests/imports/private-imports.test.ts` enforces that routes and other modules do not bypass these seams.

---

*Convention analysis: 2026-08-15*
