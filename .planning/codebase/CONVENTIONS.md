---
title: Codebase Conventions
analysis_date: 2026-08-01
scope: Full repository
---

# Codebase Conventions

**Analysis date:** 2026-08-01  
**Scope:** TypeScript/React application, Convex backend, evaluation harnesses, scripts, and tests across the repository.

## Executive summary

The dominant production language is strict TypeScript in an ESM package. Domain logic is organized behind explicit public module seams, with private implementation under `internal/`. Runtime state and API contracts are represented with narrow literal unions and discriminated result objects rather than broad strings or exception-driven business flow. React surfaces use `Ae*` component names, route files follow TanStack Router file conventions, and Convex functions validate arguments at the server boundary. Tests and evaluation code intentionally exercise refusals, authority, redaction, idempotency, recovery, and public projections instead of only happy-path rendering.

## Formatting and language posture

- `package.json` declares ESM (`"type": "module"`) and uses TypeScript 6 with `tsx` for direct script execution.
- The TypeScript compiler posture in `tsconfig.json` is strict: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `isolatedModules`, and `noEmit` are enabled. `allowJs` is false and `forceConsistentCasingInFileNames` is enabled.
- The TypeScript and most modern JavaScript samples are two-space indented, single-quoted, and semicolonless, with trailing commas in multiline calls/objects. Representative examples are `src/modules/common/deep-freeze.ts`, `src/routes/api.answer.turn.ts`, and `tools/dev/local-dev.mjs`.
- `scripts/audit-action-surfaces.mjs` is an existing style exception that uses semicolon-terminated statements; do not infer a second production convention from that one script.
- Imports are normally grouped as external packages, a blank line, project alias imports, then relative/private imports. Type-only imports use `import type` or inline `type` specifiers. `src/components/ae/chat/AeChat.tsx` and `src/components/ae/artifacts/AeGenerativeAnswer.tsx` show this grouping.
- `@/*` and `~/*` resolve to `src/*` through `tsconfig.json`; route-specific aliases exist for owner/admin routes. Prefer these aliases for cross-module imports and relative paths for same-module internals.
- There is no repository-wide Prettier/Biome configuration in the top-level config inventory. Existing file style is therefore the primary formatting contract, with `oxlint` configured by `.oxlintrc.json` for correctness and selected rule exceptions.

## Naming and file layout

- Domain code lives in `src/modules/<domain>/`; public exports are gathered in `public.ts`, while implementation-only pieces are nested under `internal/` or clearly named private files. `src/modules/answer/public.ts` is the canonical large seam: it re-exports public functions, schemas, types, and DTO builders without exposing private paths to callers.
- Domain files use lower-kebab or lower-case descriptive names (`route-mandate.ts`, `answer-schema.ts`, `notificationOutbox.ts`), exported types use PascalCase, functions and local values use camelCase, and stable protocol/status constants use uppercase names such as `AnswerTurnStatusValues` in `src/modules/answer-thread/answer-thread.schema.ts`.
- React components are function components with `Ae` prefixes for product surfaces (`AeChat`, `AeGenerativeAnswer`, `AeCreditTopUpPanel`). Component files are PascalCase `.tsx`; props are exported as `<ComponentName>Props` when the component is a reusable seam. Shared primitives remain under `src/components/ui/`.
- TanStack route modules use file-system names (`src/routes/index.tsx`, `src/routes/t.$threadId.tsx`, `src/routes/api.answer.turn.ts`, and nested `_operator` route files). The generated `src/routeTree.gen.ts` is a codegen output, not a domain interface.
- Convex functions are named for the command/query and source owner (`enqueueInquiryNotificationDispatch`, `readCurrentOwnerNotificationDispatchReadback` in `convex/notificationOutbox.ts`). Their argument and return validators sit near the function exports.
- Tests mirror the behavior boundary and use `.test.ts`/`.test.tsx`; browser tests use `.spec.ts`/`.spec.tsx`. Test filenames are domain- and behavior-oriented (`route-mandate.test.ts`, `customer-request-v2-application-path.test.ts`, `thread-first.spec.ts`) rather than implementation-numbered.
- Evaluation cases have stable IDs and coverage tags in `eval/answer/lib/cases.ts`; generated reports are written under `output/eval/` by the evaluation commands.

## Types, schemas, and contract modeling

- Prefer `Readonly<...>` for published domain structures and readonly arrays for data that should not be mutated. `src/modules/common/action.ts` and `src/modules/customer-request/route-mandate.ts` use readonly contracts heavily.
- Runtime state is modeled with discriminated unions keyed by `kind`, `status`, or another explicit tag. Examples include `accepted`/`refused` decisions in `src/modules/action-invocation/application-service.ts`, `allowed`/`denied` access in `src/modules/answer-thread/internal/turn-guard.ts`, and `ok`/`error` Convex results in `convex/notificationOutbox.ts`.
- State/status vocabularies are narrow literal unions. The established source-of-truth pattern is a `Values` tuple plus indexed union (`AnswerTurnStatusValues` → `AnswerTurnStatus`) in `src/modules/answer-thread/answer-thread.schema.ts`, paired with a validator in a module-owned `internal/validators` file. The test `tests/types/domain-contracts.test.ts` checks validator inference against exported unions and uses `@ts-expect-error` for invalid literals.
- Zod is used for untrusted request and public payload validation (`src/modules/answer/answer-schema.ts`, `src/routes/api.answer.turn.ts`). Convex functions define `v.*` argument/return validators adjacent to the function (`convex/notificationOutbox.ts`). Invalid input normally becomes a typed refusal/error, not an uncaught business exception.
- Exhaustive maps use `satisfies Record<Union, ...>` where a domain union must be covered; `src/modules/answer-thread/internal/answer-response-planner.ts` is a representative map. Use `as const` for literal preservation and protocol/schema/version values.
- Avoid explicit `any`, `as any`, `as unknown as`, non-null assertions, broad `string` statuses, and unbounded `v.any()` in domain code. These are explicit repository standards in `.planning/ENGINEERING-STANDARDS.md` and are checked by `tests/imports/ts-standards.test.ts` against runtime code and negative fixtures.
- Public modules should return exported DTOs/results and should not leak private storage records, provider SDK shapes, or Convex runtime objects. `src/modules/answer/public.ts` and the public projections tested by `tests/unit/answer-thread/public-projection.test.ts` demonstrate this boundary.

## Functions, data flow, and side effects

- Keep pure domain transitions and validation in module functions, then adapt them at route/Convex/host boundaries. `src/modules/customer-request/route-mandate.ts` separates compile/verify logic from authentication and durable issuance; `src/modules/common/deep-freeze.ts` is a small pure utility.
- Use object spreads with conditional properties to preserve exact optional-property semantics (`src/routes/api.answer.turn.ts` and `convex/notificationOutbox.ts`). Do not populate optional fields with `undefined` when omission carries meaning.
- Use named constants for protocol limits, storage keys, and stable identifiers (`MAX_ANSWER_TURN_BODY_BYTES` in `src/routes/api.answer.turn.ts`; `RECENT_THREADS_STORAGE_KEY` in `src/components/ae/chat/AeChat.tsx`).
- Action registration is centralized in `src/modules/actions/index.ts`. New actions are defined through `defineAction`, registered once, and checked for unique IDs at module load; public lookup and MCP naming derive from the registry rather than hand-maintained duplicate maps.
- External effects are represented by explicit adapters/ports and evidence records. `convex/notificationOutbox.ts` stores durable attempts and operation reconstruction; action invocation code in `src/modules/action-invocation/` carries authority, lease, effect, and reconciliation state instead of hiding these transitions in ad hoc callbacks.

## React and UI conventions

- Components use React hooks and local state for interaction, with small helper functions for serialization, projection, and copy. `src/components/ae/chat/AeChat.tsx` keeps browser storage behind dedicated read/write/sanitize helpers and maintains an in-memory fallback when storage is unavailable.
- UI tests and components prefer semantic roles, labels, and visible state over implementation selectors. `tests/unit/ui/demand-console.test.tsx` uses Testing Library `screen.getByRole`/`getByText`, and `tests/e2e/thread-first.spec.ts` uses Playwright `getByRole` and URL assertions.
- Product copy and status surfaces should disclose real state and boundaries. `src/components/ae/customer-request/AeCustomerRequestWorkspace.tsx` maps failed network calls to explicit state while preserving the request; `src/components/ae/console/AeCreditTopUpPanel.tsx` reports refusal without implying a payment occurred.
- Styling uses the existing UI primitives and utility composition (`cn` in `src/lib/utils.ts`, shared components under `src/components/ui/`), with product components under `src/components/ae/`. UI contract scanning is exercised by `tests/ui-contract/ui-contract.test.ts`.

## Validation and error handling

- Request boundaries validate size, syntax, and schema in order. `src/routes/api.answer.turn.ts` bounds the body, catches JSON parse failures, uses `safeParse`, checks rate limits, checks thread access, and returns a typed JSON error or SSE response.
- Convex functions validate untrusted arguments, derive identity/authority inside the server boundary, and return typed error/refusal unions. `convex/notificationOutbox.ts` checks system/operator access before loading state, persists source-owned state, and records operation/audit reconstruction on success.
- Expected domain failures are values (`{ kind: 'refused', code: ... }`, `{ kind: 'error', code, reason }`, or `{ ok: false, code }`). `src/modules/action-invocation/application-service.ts`, `src/modules/business/internal/claim.ts`, and `src/lib/server/bounded-request-body.ts` are representative.
- Exceptions are reserved for programmer/infrastructure faults or boundary parsing where a local recovery is defined. The CLI in `tools/ae/cli.ts` catches typed `CliFailure` and connection refusal separately, then renders an exit-safe message. Browser components catch optional storage/clipboard/telemetry failures and preserve a truthful fallback state (`src/components/ae/chat/AeChat.tsx`, `src/components/ae/forms/AeCopyPublicUrlButton.tsx`).
- Tests routinely assert refusal precedence and no side effect, not just the returned code. `tests/unit/plan-proposal/proposal-contract.test.ts` checks budget/frontier validation before transport; `tests/unit/convex/notification-outbox-runtime.test.ts` checks authorization, idempotent replay, redaction, audit rows, and no mutation after CSRF refusal.
- Security-sensitive paths use explicit source admission, CSRF/origin checks, redaction, and bounded input. These conventions are visible in `convex/notificationOutbox.ts`, `src/routes/api.answer.turn.ts`, and `tests/unit/security/csrf-rate-limit.test.ts`.

## Script and configuration conventions

- Node scripts use `node:` built-ins, explicit async `main` flows, environment-driven configuration, and non-zero exit codes for failed evidence. `eval/answer/scripts/audit-coverage.ts` prints structured JSON on success and issue-coded diagnostics on failure; `eval/engine/run-suite.ts` writes a JSON report and exits 1 when the report is not okay.
- Configuration is kept explicit and close to the runner: `vitest.config.ts` owns unit/integration discovery and setup, `playwright.config.ts` owns browser projects/timeouts/retries, `.oxlintrc.json` owns lint scope/ignores, and `doctor.config.ts` documents advisory React diagnostics exceptions.
- Generated/vendor/build paths are intentionally excluded or ignored in `tsconfig.json`, `.oxlintrc.json`, and test target helpers. Do not treat `convex/_generated`, `vendor/`, `tests/fixtures/`, or `.vercel/output/` as ordinary authored source.

## Maintainer checklist

1. Put domain behavior behind the owning module's public seam and keep routes/hosts thin.
2. Preserve exact literal unions, validator/source-of-truth parity, and readonly DTO boundaries.
3. Return typed refusals/errors for expected outcomes; reserve throws for faults that cannot be represented as domain results.
4. Add focused tests for state transitions, authority, effects, redaction, recovery, and negative paths.
5. Keep browser/UI assertions semantic and copy truthful; avoid exposing internal IDs or future capabilities.
6. Run the narrowest relevant command from `package.json` before expanding to release/hosted proof.

> Completion: conventions mapping written for the full repository on 2026-08-01; line count: 85.
