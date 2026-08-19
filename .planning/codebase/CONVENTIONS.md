# Coding Conventions

**Analysis Date:** 2026-08-19

## Naming Patterns

**Files:**
- Source files are kebab-case TypeScript: `answer-gate.ts`, `live-money-gate.ts`, `source-write-admission.ts`.
- React components are PascalCase `.tsx` files. Product UI under `src/components/ae/` uses the `Ae` prefix (`AeQueryPanel.tsx`, `AeGenerativeAnswer.tsx`, `AeChat.tsx`). Domain section files without the prefix exist when they are not standalone product components (`ClaimFormSections.tsx`, `OwnerInquiryNextStep.tsx`).
- Module seams are fixed names, not kebab-case: `public.ts`, `server.ts`, `testing.ts`, plus `internal/` for private implementation.
- Convex-adjacent domain files use dotted role suffixes: `*.functions.ts` (source reads/writes), `*.actions.ts` (TanStack / action-registry entry), `*.schema.ts` (Zod / Convex document contracts). Examples: `src/modules/registry/registry.functions.ts`, `src/modules/inquiries/inquiry.actions.ts`, `src/modules/answer-thread/answer-thread.schema.ts`.
- Tests mirror the domain folder, not the source tree: `tests/unit/answer/answer-gate.test.ts`, `tests/unit/chat/ae-query-panel.test.tsx`, `tests/e2e/landing-answer.spec.ts`. Playwright uses `.spec.ts`; Vitest uses `.test.ts` / `.test.tsx`.
- Route files follow TanStack file routing: `src/routes/api.$.ts`, `src/routes/claim.tsx`, `src/routes/llms[.]txt.ts`.
- Do not invent `index.ts` barrels inside `src/modules/*/`. The public seam is `public.ts`.

**Functions:**
- Use camelCase verbs: `runAnswerGate`, `buildProblem`, `evaluateLiveMoneyGate`, `claimBusiness`, `validateCapabilityPublication`.
- Type guards are `isX`: `isMoneyRefusal`, `isPublicOperationRef`, `isStableProblemCode`, `isAnswerToolUseAgentError`.
- Convex-test / unit seam injectors are `setXForTests` and return a restore function: `setPublicRegistrySourcePortForTests`, `setHttpRateLimitAdmissionForTests`, `setSearchGapRecorderForTests`.
- Factories that brand IDs live in `src/modules/common/ids.ts` (`brandNonEmpty`). Operation refs use `createPublicOperationRef` in `src/modules/capability-supply/public.ts`.

**Variables:**
- camelCase locals. Prefix unused Convex/auth payload parameters with `_` (`_ignoredPayload`, `_db`) rather than omitting the parameter.
- Boolean names are predicates: `retryable`, `ok`, `complete`. Do not use `isOk` when the discriminant is already `kind`.
- Money amounts are never `number`. Use `ExactAmount` (`currency`, `units`, `exponent`) from `src/modules/money/internal/exact-amount.ts`.

**Types:**
- PascalCase types and type aliases: `ProblemDetails`, `MoneyRefusal`, `ExactAmount`, `PublicOperationRef`.
- Discriminated unions use `kind` (domain results) or `type` (events/parts): `{ kind: 'accepted' } | { kind: 'refused' }`, `{ kind: 'ok' } | { kind: 'error' }`, `{ type: 'thread' } | { type: 'one-line' }`.
- Status and result fields are literal unions, never `string`. Enforced by `scanTypeScriptStandards` in `src/lib/ui/contract-scans.ts` (`broad-status-string`).
- Branded string IDs live in `src/modules/common/ids.ts` (`OwnerId`, `BusinessId`, `OperationKey`, `CorrelationId`, …).
- Prefer `Readonly<{ ... }>` for public records. Prefer `readonly T[]` over `T[]` on public arrays.

**Constants:**
- Value catalogs are `XValues` + derived union: `PROBLEM_KINDS` / `ProblemKind` in `src/lib/errors.ts`; `ClaimStatusValues` in `src/modules/business/public`; `LIVE_MONEY_COUNSEL_DECISIONS` in `src/modules/money/internal/live-money-gate.ts`.
- Stable machine tokens are `snake_case` strings: `live_money_gate_open`, `grounding_failed`, `method_not_allowed`, `catalog_publish_wrong_owner`.

## Code Style

**Formatting:**
- No Prettier, Biome, ESLint, or EditorConfig file is present. Format is social + TypeScript + Oxlint.
- Dominant new-module style: 2-space indent, single quotes, no semicolons, trailing commas in multiline literals. Match the file you edit. Some older seams use double quotes and semicolons (`src/modules/money/public.ts`, `src/lib/ui/contract-scans.ts`).
- Keep imports at module top. Inline `import()` in function bodies is forbidden unless a documented circular-dependency exception exists.

**Linting:**
- Oxlint is the linter. Config: `.oxlintrc.json`. Command: `npm run lint` → `oxlint src convex tests tools --deny-warnings`.
- Categories: `correctness` is `error`; `suspicious` is `off`. Plugins: `typescript`, `oxc`.
- Explicitly off: `no-unused-vars` (TypeScript handles this), `no-underscore-dangle`, `no-useless-escape`, `no-control-regex`, `typescript/triple-slash-reference`.
- Ignore: `convex/_generated/**`, `tests/fixtures/**`, `vendor/**`.
- Additional standards are **test-enforced**, not Oxlint: `npm run test:ts-standards` scans `src/` and `convex/` via `scanTypeScriptStandards` in `src/lib/ui/contract-scans.ts`.

**TypeScript:**
- Root config: `tsconfig.json`. Convex overlay: `convex/tsconfig.json`. Tools overlay: `tools/tsconfig.json`.
- Strictness that new code must satisfy:
  - `strict: true`
  - `exactOptionalPropertyTypes: true` — do not assign `undefined` to an optional property unless the type includes `| undefined`. Omit the key instead.
  - `noUncheckedIndexedAccess: true` — `array[0]` is `T | undefined`; narrow before use.
  - `useUnknownInCatchVariables: true` — `catch (error)` is `unknown`.
  - `noImplicitOverride: true`
- Path aliases: `@/*` → `src/*`, `~/*` → `src/*`. Route remaps exist for operator routes (`@/routes/owner.*` → `src/routes/_operator/owner.*`).
- `allowJs: false`. Do not add `.js` implementation next to TypeScript sources.
- Generated Convex types in `convex/_generated/` are excluded from the root tsconfig; never edit them.

**TS standards guardrail (must remain green):**
- No explicit `any` (`: any`, `<any`, `as any`).
- No `as unknown as`.
- No non-null assertions (`value!`).
- No `v.any()` in Convex validators except documented JSON-boundary comments in `convex/capabilitySupply.ts`, `convex/capabilitySupplyOperations.ts`, and `src/modules/capability-execution/internal/convex-schema.ts`.
- No `status: string` / `result: string` / `sourceState: string`.
- No hard-coded CSRF literals; no `VITE_AE_SOURCE_WRITE_SECRET`.

## Import Organization

**Order:**
1. Side-effect / environment pragmas (`/// <reference types="vite/client" />`, `/** @vitest-environment jsdom */`).
2. External packages (`vitest`, `zod`, `convex/server`, `@testing-library/react`, `node:fs`).
3. Blank line.
4. Alias imports (`@/modules/...`, `@/lib/...`, `@/components/...`).
5. Relative imports (`./internal/...`, `../helpers/...`).
6. Type-only imports may mix with value imports; prefer `import type` for types.

```typescript
import { describe, expect, it } from 'vitest'

import { runAnswerGate } from '@/modules/answer/public'
import type { AnswerSnapshot } from '@/modules/answer/public'
```

**Path Aliases:**
- Always import product code through `@/`, not relative hops out of `src/`.
- Tests under `tests/` import product through `@/` and fixtures through `../helpers/` or `../fixtures/`.
- Convex files may import `../src/modules/.../public` (see `convex/authz.ts`) or `@/` (Convex tsconfig maps `@/*` → `src/*`).

**Module seams (hard rule):**
- Routes and sibling modules import `src/modules/<name>/public.ts` (or `server.ts` / `testing.ts` when those exist). Never `@/modules/<name>/internal/...`.
- Enforced by `scanPrivateImports` and `scanRouteBoundaries` in `src/lib/ui/contract-scans.ts`, run by `npm run test:imports`.
- Tests **may** import `internal/` when they are pinning a private contract (`tests/types/domain-contracts.test.ts` imports `@/modules/observability/internal/validators`). Production routes may not.
- `server.ts` is the server-only seam (LLM agent, Stripe, secrets). Example: `src/modules/answer/server.ts` re-exports `runAnswerToolUseAgent`; `src/modules/money/server.ts` owns Stripe webhook/server functions.
- `testing.ts` is the test-only seam. Example: `src/modules/answer-thread/testing.ts` re-exports `setAnswerThreadPortForTests`. Do not import `testing.ts` from routes or `public.ts`.

**Forbidden imports:**
- Runtime must not import `.planning/` or a backup repo (`scanBackupImports`).
- Routes must not import `convex/schema` or `convex/browser` / `convex/server`.
- Handshake / x402 / MCP SDKs stay in reviewed transport adapters (`forbidden-handshake-import`).
- Deployable source must not import `tests/helpers`, `tests/fixtures`, or `tools/dev` (`tests/imports/development-evidence-boundary.test.ts`).
- Answer / customer-request modules must not import `src/modules/capability-supply` (`tests/imports/capability-supply-boundaries.test.ts`).

## Error Handling

**Patterns:**
- HTTP errors are RFC 9457 `application/problem+json`. Canonical model: `src/lib/errors.ts`. Wire helper: `src/lib/server/problem.ts`. Status-only helper: `src/lib/server/json-error.ts`. Method 405: `src/lib/server/method-guard.ts`.
- Domain operations return discriminated results, they do not throw for expected refusals:

```typescript
export type MoneyRefusal = Readonly<{
  kind: 'refused'
  code: MoneyRefusalCode
  retryable: boolean
  nextAction?: 'credit_topup_required'
  requiredAmount?: ExactAmount
  availableAmount?: ExactAmount
}>
```

- `kind: 'error'` is used on catalog/claim command results (`claim_unauthenticated`, `catalog_publish_wrong_owner` in `src/modules/catalog/public.ts` / `src/modules/business/public.ts`).
- `kind: 'refused'` plus `code` / `refusalCode` is the named-refusal pattern (money, work-tree, capability publication, operation invoke).
- Throw only for programmer/protocol violations (missing required fixture, malformed AE stream chunks). Answer streaming treats malformed AE chunks as fail-closed protocol errors (`src/modules/answer/answer-ui-stream.ts`).
- Catch variables are `unknown`. Narrow with `isRecord` (`src/modules/common/is-record.ts`) or a type guard. Do not `as Error`.
- Remote/provider problem bodies are **not** copied into user-facing `title`/`detail`. `remoteProblemToProblem` and `gatewayFailureToProblem` in `src/lib/errors.ts` rebuild human text locally and only pass through a stable `code`, canonical `kind`, and `retryable`.

**RFC 9457 wire object:**

```typescript
export function problem(input: ProblemInput, headers: Readonly<Record<string, string>> = {}): Response {
  const details = buildProblem(input)
  // Content-Type and Cache-Control are reserved.
  responseHeaders.set('Content-Type', 'application/problem+json')
  responseHeaders.set('Cache-Control', 'no-store')
  return new Response(JSON.stringify(details), { status: details.status, headers: responseHeaders })
}
```

Use `problem({ kind, code, ... })` from `src/lib/server/problem.ts`. Do not hand-roll `{ error: string }` JSON. `type` is always `'about:blank'`. `kind` is a `PROBLEM_KINDS` value (`INVALID_ARGUMENT`, `NOT_FOUND`, `no_data`, …). `code` is the stable snake_case token. `no_data` is HTTP 200 by design (ok-outcome, not an error).

**Named refusals:**
- Prefer a precise `code` over a blanket `schema_profile_unsupported` / generic 400.
- Capability publication maps each refusal to an actionable `fix` string in `publicationValidationFix` (`src/modules/capability-supply/internal/publication/validate.ts`). Add a `switch` arm when adding a refusal reason.
- Operation invoke / MCP / work-tree surfaces emit `refusalCode` on failed outcomes (`src/lib/server/operation-invoke-api.ts`, `src/lib/server/mcp-api.ts`, `src/modules/work-tree/internal/root-loop.ts`).
- Telemetry may record `refusalCode` only when it matches `IDENTIFIER_PATTERN` (`src/lib/server/gateway-telemetry.ts`). Never put provider payloads in telemetry.

**Fail-closed money:**
- Live money is gated by source-owned policy in `src/modules/money/internal/live-money-gate.ts`, **not** an environment flag. `LIVE_MONEY_GATE_POLICY` currently has all counsel decisions `open` and Stripe `mode: 'test'`, `readiness: 'unavailable'`.
- `evaluateLiveMoneyGate()` returns `{ kind: 'refused', code: 'live_money_gate_open', retryable: false }` until every counsel decision is `accepted` with an `artifactRef` and Stripe is `live`/`ready`.
- Missing/invalid policy parses fail closed to `live_money_gate_open`. Stripe not live fails closed to `stripe_setup_required`.
- Money math uses `ExactAmount` string units, never IEEE floats. Align/rescale through `addExactAmounts` / `compareExactAmounts` in `src/modules/money/internal/exact-amount.ts`.
- Ledger writes are idempotent: digest mismatch → `ledger_idempotency_conflict`; unknown Stripe outcome → `*_outcome_unknown` / `*_reconciliation_required`, not a guessed success.

**Convex:**
- Always read `convex/_generated/ai/guidelines.md` before writing Convex functions (`AGENTS.md`).
- Always include `args` validators (`v.*`) on `query` / `mutation` / `action` and their `internal*` variants.
- Public vs internal: a function only your code calls is `internalQuery` / `internalMutation` / `internalAction`, not `query`/`mutation`/`action`.
- Do not return `undefined` from Convex handlers (becomes `null`). Use `null` or a discriminated result.
- Authz lives in `convex/authz.ts` and resolves actors from `ctx.auth.getUserIdentity()`, never from browser-supplied admin payloads.

## Logging

**Framework:** PostHog (`posthog-node`) behind `src/lib/observability/posthog.server.ts`. Client funnel events go through `src/lib/observability/funnel-client.ts` and `src/lib/observability/capture-client-events.ts`. There is no Pino/Winston logger.

**Patterns:**
- Observability must never alter application behavior. `captureServerEvent` swallows errors in `try/catch`.
- Sanitize before emit: `sanitizeTelemetryValue` in `src/lib/observability/private-route-safety.ts`. Distinct IDs and event names are sanitized.
- Gateway telemetry is an allowlisted scalar projection (`recordGatewayTelemetry` in `src/lib/server/gateway-telemetry.ts`). Do not add input/output/provider content fields.
- Funnel / audit events use exact literal unions from `src/modules/observability/public.ts`, not free-form strings.
- Do not `console.log` in product paths. Agent papercuts go to `PAPERCUTS.md` via `npm run papercut -- -m <model> "message"` (`AGENTS.md`), not into runtime logs.
- Search-gap instrumentation is a no-op under tests (`tests/setup/no-search-gap-writes.ts`) so eval traffic does not write to a real deployment.

## Comments

**When to Comment:**
- File-level module docs on `public.ts` / `server.ts` stating the seam and what callers must not import (`src/modules/answer/public.ts`).
- Why a fail-closed gate exists, not what the next line does (`LIVE_MONEY_GATE_POLICY` comment: "Source-owned first-dollar policy. Do not replace this with an environment flag.").
- Documented `v.any()` JSON-boundary comments that the TS-standards scanner allowlists.
- Vitest environment pragmas and setup-file rationale (`tests/setup/web-storage.ts`).

**JSDoc/TSDoc:**
- Use JSDoc on exported helpers that other modules consume (`buildProblem`, `problem`, `evaluateLiveMoneyGate`, `publicationValidationFix`).
- `{@link Name}` for in-repo symbols. Do not duplicate the type signature in prose.
- Do not comment obvious assignments.

## Function Design

**Size:**
- Keep public seam files as re-export barrels plus a small amount of type-level API (`src/modules/answer/public.ts`, `src/modules/catalog/public.ts`). Deep logic lives under `internal/`.
- Convex handlers stay thin: validate args, call module commands, return a discriminated result. Do not grow business rules inside `convex/*.ts`.
- Prefer many small typed helpers over a 200-line inline closure.

**Parameters:**
- Public functions take one `Readonly<{ ... }>` input object once arity exceeds ~3 fields (`evaluateLiveMoneyGate`, `createPublicOperationRef`, `validatePaymentBinding`).
- Pass branded IDs, not raw strings, across module seams (`OperationKey`, `CorrelationId`).
- Time is `now: number` (epoch ms) injected by the caller so tests stay deterministic.
- Do not read `process.env` inside domain `public.ts`. Env belongs in `server.ts` / `src/lib/server/*` adapters.

**Return Values:**
- Discriminated unions with `kind`. Callers switch on `kind` and read `code` / `refusalCode`.
- Include `retryable: boolean` on refusals and problem details when the client might retry (429 yes; live-money gate no).
- Pure functions return new state; they do not mutate input (`claimBusiness(state, command)` in catalog/business).

## Module Design

**Exports:**
- Every `src/modules/<name>/` exposes `public.ts`. That is the interface other modules and routes learn.
- Optional `server.ts` for Node/secret/LLM/Stripe. Optional `testing.ts` for test injectors.
- Re-export types and values from `internal/` through `public.ts`. Do not make callers reach into `internal/`.
- `src/modules/capability-contract/public.ts` is a deep, dependency-narrow grammar: only `zod`, `@cfworker/json-schema`, and `src/modules/common/*` (enforced by `tests/imports/capability-contract-boundaries.test.ts`).

**Barrel Files:**
- `public.ts` is the barrel. Do not add `index.ts` beside it.
- `src/modules/answer-thread/testing.ts` is a test barrel, not a second public API.

**Internal layout:**
- `internal/` holds implementation, Convex schema fragments, and unpublished helpers.
- Capability-supply deepens into named folders: `internal/publication`, `internal/eligibility`, `internal/operation-ledger`, etc. Neutral files listed in `tests/imports/capability-supply-boundaries.test.ts` must not grow operation/vertical vocabulary.

**UI modules:**
- Product components live in `src/components/ae/<domain>/`.
- Use semantic design tokens, not raw Tailwind palette classes. Enforced by `scanUiContract` (`tests/ui-contract/ui-contract.test.ts`): no hex/rgb/hsl, no `bg-blue-500`, no `space-x-*` (use `gap-*`), no `transition-all`, no hardcoded `z-50`, no `bg-black/40`.
- Role-based queries in tests (`getByRole`) match the accessibility contract of the component.

**Exhaustive switches:**
- Switch over unions must assign the discriminant to `never` in `default` so new variants fail compile:

```typescript
default: {
  const _exhaustive: never = action
  void _exhaustive
  return state
}
```

Canonical examples: `src/components/ae/chat/answer-turn-state.ts`, `src/lib/ui/status-presentation.ts`, `src/modules/capability-supply/internal/x402-invocation-policy.ts`.

## Convex Patterns

Follow `convex/_generated/ai/guidelines.md` (Convex `^1.41.0`):
- Register HTTP in `convex/http.ts` with `httpAction`. Treat `await req.json()` as `unknown`.
- Index names include all fields: `by_field1_and_field2`.
- Do not store unbounded arrays on a document; use a child table.
- Pagination: pass `args.paginationOpts` through unchanged; return `paginationResultValidator`.
- Nested `ctx.runMutation` from a mutation is a subtransaction; catch independently if the caller must continue.

## Adding New Code

- New domain logic: `src/modules/<name>/internal/`, export through `public.ts`, tests in `tests/unit/<name>/`.
- New HTTP error: add a stable `code`, map it in `src/lib/errors.ts` if it is a gateway code, return `problem(...)`.
- New money path: return `MoneyRefusal`, never open the live-money gate from an env flag.
- New union variant: extend the `XValues` array, handle the `switch`, and add a unit test for the new `code`.
- Log papercuts to `PAPERCUTS.md` when tooling friction appears; do not paper over it in product code.

---

*Convention analysis: 2026-08-19*
