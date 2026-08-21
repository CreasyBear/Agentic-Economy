# Coding Conventions — Agentic-Economy

**Analysis Date:** 2026-08-21
**Scope:** Full repository, current working tree (large uncommitted refactor included: module splits under `convex/` and `src/components/ae/`, deleted inquiry/work-tree families, `eval/answer` harness split into `lib/eval-*.ts`)
**Sources of truth:** `AGENTS.md`, `RULES.MD`, `UBIQUITOUS_LANGUAGE.md`, `.planning/ENGINEERING-STANDARDS.md`, `tsconfig.json`, `.oxlintrc.json`, `vitest.config.ts`, `convex/_generated/ai/guidelines.md`, and the working-tree source itself.

<!-- refreshed: 2026-08-21 -->

---

## 1. Naming Patterns

### 1.1 File and Directory Naming

| Artifact | Convention | Example |
| --- | --- | --- |
| App/Convex modules (kebab-case) | `kebab-case.ts` | `src/modules/answer-thread/internal/answer-response-planner.ts` |
| Convex backend files | camelCase, one domain per file | `convex/moneyPayoutTransferBegin.ts`, `convex/capabilitySupplyOwnerFunnelCommands.ts` |
| Convex-adjacent split files | dotted role suffix | `convex/capabilitySupplyOperationKeyless.ts`, `convex/moneyPayoutTransferSettlement.ts` |
| React components | `PascalCase.tsx`, `Ae` prefix for product components | `src/components/ae/readback/AeAdminReadbackPanel.tsx`, `src/components/ui/button.tsx` |
| Route files (TanStack Start) | dot-namespaced under `src/routes/` | `src/routes/api.answer.turn.ts`, `src/routes/api.answer.turn.stop.ts`, `src/routes/$slug.tsx` |
| Module seams | reserved file names | `public.ts`, `server.ts`, `testing.ts` per module |
| Tests | `*.test.ts(x)` mirroring source layout | `tests/unit/answer/answer-gate.test.ts`, `convex/agentAccessPolicy.test.ts` |
| Playwright specs | `*.spec.ts` under typed directories | `tests/e2e/public-owner-ui.spec.ts`, `tests/deploy-smoke/phase2-support-record-smoke.spec.ts` |
| Eval harness (non-test) | plain `.ts` under `eval/` | `eval/answer/lib/eval-turn.ts`, `eval/braintrust/answer.eval.ts` |

Directories under `src/modules/` are kebab-case (`answer-thread/`, `capability-supply/`, `action-invocation/`); logic lives in `internal/` subdirectories (`src/modules/capability-supply/internal/operation-ledger/policy.ts`).

### 1.2 Function and Variable Naming

- Functions: camelCase verbs — `runAnswerGate`, `finalizeReservedAnswerTurnError`, `readCapabilityOperationSearch`, `evaluateLiveMoneyGate`.
- Boolean predicates: `isX` / `hasX` / `shouldX`.
- Type guards: `isX` returning a type predicate.
- Convex command handlers: `<verb><Noun>Handler` exported from domain files and registered in the command module (e.g. `reserveConnectAccountHandler`, `finalizeConnectAccountHandler` in `convex/moneyConnect.ts`).
- Test factories: `makeX` / `snapshot` / `seedX` helpers (`tests/helpers/convex-fixtures.ts`: `ownerAdmin`, `publishedBusinessOwner`).
- Unused parameters: `_` or `_name` prefix.
- Money values: always `ExactAmount` (branded), never bare numbers — `src/modules/money/public` re-exports `ExactAmount`; consumers import it as `import type { ExactAmount } from '@/modules/money/public'` (see `src/modules/action-invocation/x402-payment-attempt.ts`).

### 1.3 Type Naming

- Types/interfaces: PascalCase (`AnswerTurnState`, `WorkflowJob` in `tests/unit/release/green-release-baseline.test.ts`).
- Discriminated unions use a literal `kind` or `type` field (e.g. `{ kind: 'refused', code: 'connect_account_unlisted', retryable: false }` returned by `convex/moneyConnect.ts`).
- Status/state vocabularies are const-tuple-derived literal unions, not TypeScript `enum` (no `enum` anywhere in first-party code).
- Branded string IDs from `src/modules/common/ids.ts`: `OwnerId`, `BusinessId`, etc., created via `brandNonEmpty`.
- Generated Convex types: `Id<'tableName'>`, `Doc<'tableName'>`, `QueryCtx`, `MutationCtx`, `ActionCtx` from `./_generated/*` (type-only imports — see §4.2).
- Exhaustive lookup maps: `satisfies Record<Union, Payload>` — e.g. `src/modules/security/internal/admin-authority.ts` (`satisfies Record<AdminRole, Record<AdminAction, boolean>>`), `src/lib/ui/status-presentation.ts` (`satisfies Record<AeStatus, AeStatusPresentation>`), `src/components/ae/readback/AeAdminReadbackPanel.tsx`.

### 1.4 Constants

- Module-level constants: SCREAMING_SNAKE_CASE (`PROBLEM_KINDS` in `src/lib/errors.ts`, `LIVE_MONEY_GATE_POLICY` in `src/modules/money/internal/live-money-gate.ts`, `ANSWER_OPERATION_EFFECT_TOOL_IDS` in `src/modules/answer-thread/answer-thread.schema.ts`).
- TanStack Start server route option objects: `XRoute` / `XMethod` / `XMiddleware` naming exported alongside the route (`src/routes/api.answer.turn.ts`).

---

## 2. Code Style

### 2.1 Formatting (no formatter config; consistency by convention + review)

- 2-space indentation, single quotes, no semicolons, trailing commas in multiline literals.
- No Prettier/Biome/ESLint/EditorConfig; lint enforcement is **Oxlint** run with `--deny-warnings` (`.oxlintrc.json`: `categories.correctness = 'error'`, `suspicious = 'off'`, plugins `typescript` + `oxc`, `ignorePatterns` includes `convex/_generated/**`, `tests/fixtures/**`, `vendor/**`).
- `npm run papercut -- -m <model> "message"` is the mandated channel for logging small frictions (per `AGENTS.md`).

### 2.2 TypeScript Strictness (`tsconfig.json`)

- `strict: true`, `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`, `useUnknownInCatchVariables: true`, `noImplicitOverride: true`, `allowJs: false`.
- Path aliases: `@/*` → repo-root `src/*` (primary), `~/*` also mapped; `convex/_generated/**` excluded from the app program.
- Forbidden by scanner (`src/lib/ui/contract-scans.ts` `scanTypeScriptStandards`, enforced by `tests/imports/ts-standards.test.ts`):
  - explicit `any` (except documented JSON-boundary `v.any()` via `isDocumentedJsonBoundary`),
  - non-null `!` assertions,
  - `as unknown as` double casts.
- No TypeScript `enum`; no hard-coded broad status strings; no hard-coded CSRF literals; `VITE_AE_SOURCE_WRITE_SECRET` must never appear in client code.
- Catch clauses receive `unknown` (`useUnknownInCatchVariables`); narrow with helpers rather than casting.

### 2.3 Imports

- **Imports live at the top of the module.** Inline imports inside function bodies are forbidden by workspace rule *except* the documented lazy-load seam (below).
- Ordering within the import block: `node:` builtins → external packages → `@/` alias → `./` relative (see `tests/unit/release/green-release-baseline.test.ts` header for a canonical example).
- Prefer `import type { ... }` for type-only dependencies, including from module seams and generated Convex modules:
  - `import type { BusinessContext } from '@/modules/business/public'` (`src/modules/discovery/internal/manifest-projection.ts`)
  - `import type { MutationCtx } from './_generated/server'` (`convex/moneyChargeBrokered.ts`, `convex/capabilitySupplyOwnerFunnelCommands.ts`)
- **Sanctioned inline import (lazy seam):** route handlers and action `run` functions use `await import('@/modules/.../server')` to keep Node-only/server-only modules out of the client route graph. The reason is stated in a comment, e.g. `src/routes/api.answer.turn.ts`: `// Static import would pull Node-only answer execution into the client route graph.` Other verified sites: `src/routes/api.answer.turn.stop.ts`, `src/routes/api.health.ts`, `src/routes/api.observability.funnel.ts`, `src/modules/storefront/storefront.actions.ts`, `src/modules/registry/operations.actions.ts`. The boundary suites in `tests/imports/route-boundary.test.ts` and `tests/imports/private-imports.test.ts` police these seams; fixtures for violations live in `tests/fixtures/bad-imports/`.

### 2.4 Comments

- File-level doc comments state the module's responsibility and its seam role.
- JSDoc on exported functions for non-obvious contracts (units, retryability, authority requirements).
- Fail-closed gates carry comments explaining *why* refusal is the safe default (e.g. `src/modules/money/internal/live-money-gate.ts`, `convex/authz.ts` `readActiveAdminMembership` returning `undefined` by design — known-red pin).
- No narration comments (`// increment the counter` style) and no change-log comments.

---

## 3. Patterns

### 3.1 Module Seams

Every domain module under `src/modules/<domain>/` exposes a fixed seam set:

- `public.ts` — barrel of types + pure functions shared across modules (`src/modules/answer/public.ts`, `src/modules/money/public`).
- `server.ts` — server-only entry (lazy-imported by routes/actions; see `src/routes/api.answer.turn.ts` importing `@/modules/answer-thread/server`).
- `testing.ts` — test-only exports (consumed by `tests/`).
- `internal/` — implementation; **never imported from outside the module** (enforced by `tests/imports/private-imports.test.ts`).
- Convex-adjacent modules keep command/query/read splits with dotted suffixes (`convex/capabilitySupplyOwnerFunnelCommands.ts` + `convex/capabilitySupplyOwnerFunnelProjection.ts` + `convex/capabilitySupplyOwnerFunnelRead.ts` + `convex/capabilitySupplyOwnerFunnelAgentRead.ts`).

### 3.2 Action Registry

- All agent-callable operations register in `src/modules/actions/index.ts` with `ActionSurface` contracts from `src/modules/common/action.ts` (`ActionParameter`, `ActionResult`, `AgentToolDescriptor`).
- Action `run` implementations lazy-import their module server seam (`src/modules/registry/operations.actions.ts`).
- Deleted families (inquiry, study, work-tree, customerRequest) are asserted absent by tests (`tests/unit/actions/registry.test.ts`, `tests/unit/study-actions.test.ts`).

### 3.3 Error Handling

Two complementary models — see `src/lib/errors.ts` and `.planning/ENGINEERING-STANDARDS.md`:

1. **HTTP layer: RFC 9457 problem details.** `src/lib/server/problem.ts` builds `application/problem+json` responses with `Cache-Control: no-store`; kinds/codes are stable machine tokens from `PROBLEM_KINDS` / `DEFAULT_STATUS` in `src/lib/errors.ts` (Google API code mapping via `kindForStatus`, `defaultTitle`). Server routes return problems for method violations (`methodNotAllowed` in `src/routes/api.answer.turn.ts`), admission failures (`assertHttpAdmission`), and unexpected faults; `remoteProblemToProblem` / `gatewayFailureToProblem` normalize upstream failures.
2. **Domain layer: discriminated result unions, not exceptions, for expected refusals.** Money and publication operations return `{ ok: true, ... } | { ok: false, code: '<named-refusal>', retryable }`-style results (e.g. `convex/moneyConnect.ts` `{ kind: 'refused', code: 'connect_account_unlisted', retryable: false }`; publication validation in `src/modules/capability-supply/internal/publication/validate.ts` maps reasons to actionable `publicationValidationFix` strings — the "named refusals" pattern). Exceptions are reserved for truly unexpected invariant violations.

**Money is fail-closed.** `src/modules/money/internal/live-money-gate.ts` (`LIVE_MONEY_GATE_POLICY`, `evaluateLiveMoneyGate`) refuses live spend unless every policy condition holds; Connect reserve/finalize handlers currently always refuse (known-red pin); payout transfer commands use localized `refusedPayout` helpers (`convex/moneyPayoutTransferBegin.ts`) rather than a shared helper.

**Admin authority is fail-closed.** `convex/authz.ts` `readActiveAdminMembership` intentionally returns `undefined` (known-red pin), so `assertAdminAuthority` denies; `actorFromIdentity` derives business actors from Clerk identity claims.

### 3.4 Exhaustive Switches

Workspace rule: every `switch` over a discriminated union or literal union ends with a `never` check in the default case. Canonical form in `src/lib/ui/status-presentation.ts`:

```ts
default: {
  const _exhaustive: never = status
  return _exhaustive
}
```

Exhaustive *maps* use `satisfies Record<Union, ...>` (see §1.3) so adding a variant fails compilation at the map site.

### 3.5 Convex Patterns (per `convex/_generated/ai/guidelines.md` — read before any Convex work)

- Public functions use `query`/`mutation`/`action` from `./_generated/server` with full argument validators (`v.object({ ... })`); internal helpers use `internalQuery`/`internalMutation`/`internalAction` registered against `internal.*` references.
- Thin registered wrappers delegate to exported `*Handler(ctx, args)` functions so tests and sibling modules can reuse logic (`convex/moneyConnect.ts`, `convex/capabilityOperationInvocations.ts`).
- Handlers return values instead of throwing for expected refusals; never return `undefined` from public mutations — return an explicit result object.
- Context types come from `./_generated/server` as type-only imports (`QueryCtx`, `MutationCtx`, `ActionCtx`); document types from `./_generated/dataModel` (`Doc<'table'>`, `Id<'table'>`, `DataModel`).
- Cross-function calls go through `ctx.runQuery`/`ctx.runMutation`/`ctx.runAction` with `makeFunctionReference` (see `convex/agentAccessPolicy.test.ts` for reference shapes); actions that need Node APIs start with `"use node"` and never touch `ctx.db`.
- Queries: index-backed, bounded (no unbounded `.collect()`), no wall-clock reads inside queries; bulk work is scheduled via `ctx.scheduler` / crons (`convex/crons.ts`).
- Schema in `convex/schema.ts`; index names follow `domain_field_desc` style; new indexes may be staged.
- Auth: Clerk JWT via `convex/auth.config.ts`; identity read with `ctx.auth.getUserIdentity()`; `tokenIdentifier` is the stable principal key.
- Source-write admission: mutating entry points pass through `requireSourceWrite` / source-write admission seams (`convex/sourceWriteAdmission*`, `tests/unit/server/source-write-admission-seam.test.ts`); the local secret is provisioned for dev only (`tests/unit/dev/local-source-write-secret.test.ts`), and `VITE_AE_SOURCE_WRITE_SECRET` is never client-visible.

### 3.6 Logging & Observability

- Client telemetry: PostHog via `src/lib/observability/*`; values pass through `sanitizeTelemetryValue`; funnel events flow through `src/modules/observability/funnel.functions.ts` (which lazy-imports `funnel.capture.server`).
- Server capture (`captureServerEvent`, `captureServerException`) swallows its own errors so telemetry never alters application behavior (`src/lib/observability/posthog.server.ts`).
- No stray `console.log` in first-party code; request correlation via `src/lib/server/request-correlation.ts` (`runWithRequestCorrelation`, `withRequestCorrelationHeader`) wrapped around route handlers (`src/routes/api.health.ts`, `src/routes/api.ready.ts`).
- Audit/proof events (gateway receipts, release evidence) are emitted with explicit `evidenceClass` metadata and `sanitized: true` markers (asserted by `tests/unit/release/green-release-baseline.test.ts`).

### 3.7 Adding New Code (checklist distilled from `RULES.MD` + `.planning/ENGINEERING-STANDARDS.md`)

1. Domain logic goes in `src/modules/<domain>/internal/`; expose through `public.ts` / `server.ts` seams only.
2. HTTP failures use problem kinds from `src/lib/errors.ts` — never ad-hoc status strings or JSON error shapes.
3. Money paths: brand amounts as `ExactAmount`, evaluate the live-money gate, refuse closed, and return named-refusal unions with `retryable` set deliberately.
4. Convex commands: split file per domain role, validators on every public function, thin wrapper + handler pattern, type-only generated imports.
5. New union variant? Add the `never`-checked switch arm and the `satisfies Record<...>` row in the same change.
6. Optional fields must respect `exactOptionalPropertyTypes` (no explicit `undefined` assignment unless the type says `| undefined`).
7. Log frictions via `npm run papercut -- -m <model> "..."`.

---

## 4. UI Conventions

- Semantic design tokens only — no raw hex values in components (enforced by `tests/imports/` UI-contract scans; violation fixtures in `tests/fixtures/bad-ui-contract/route-styles.fixture`).
- Product components are prefixed `Ae` and live under `src/components/ae/` (e.g. `src/components/ae/readback/AeAdminReadbackPanel.tsx`); primitives under `src/components/ui/`.
- Presentation mapping for statuses/tones is centralized in `src/lib/ui/status-presentation.ts` with exhaustive `satisfies` maps.
- Tests query by role/label (`@testing-library/react`, Playwright `getByRole`); see `TESTING.md` §5.

---

## 5. Anti-Patterns (explicitly rejected by `RULES.MD` and scanners)

- Importing another module's `internal/` or reaching past a `public.ts`/`server.ts` seam.
- Inline static imports of server-only modules into route/client graphs (must use the documented lazy seam).
- Throwing exceptions for expected business refusals; returning bare booleans for money outcomes.
- `enum`, `any`, non-null assertions, `as unknown as`, undisciplined `v.any()`.
- Unbounded Convex queries, wall-clock reads in queries, or index-less filters on hot tables.
- Client-visible secrets (`VITE_AE_SOURCE_WRITE_SECRET`), hard-coded CSRF literals, or broad free-text status fields.
- Silent catch blocks in application code (telemetry capture is the only sanctioned swallow).

---

*Conventions analysis: 2026-08-21*
