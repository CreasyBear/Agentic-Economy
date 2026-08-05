# CONVENTIONS.md

**Analysis Date:** 2026-08-05

Coding conventions and architecture invariants for the Agentic-Economy codebase. These are the rules a contributor must follow; they are enforced in practice by a multi-stage release gate (`npm run gate:release`), a dedicated boundary-scan test suite (`tests/imports`), and `oxlint`. Prefer these over any remembered style from other projects.

<!-- refreshed: 2026-08-05 -->

## 1. Code style (mechanical)

- **2-space indent, no tabs.** Single quotes for all strings, **no semicolons**, **trailing commas** on every multi-line array/object literal. This is consistent across `src/`, `convex/`, `tests/`, and tooling; follow `vitest.config.ts` / `package.json` as the canonical examples.
- **ESM throughout.** `"type": "module"` in `package.json`; `import`/`export` syntax, no CommonJS `require`.
- **TypeScript strictness is load-bearing.** `tsconfig.json` enables `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `forceConsistentCasingInFileNames`, `isolatedModules`, `noEmit`. `typecheck` is `tsc --noEmit` and is part of the release gate.
  - `exactOptionalPropertyTypes` means optional fields must be *omitted* (or explicitly `undefined` only where allowed) rather than set to `undefined` — do not pass `field: undefined` to satisfy an `x?: T`.
  - `noUncheckedIndexedAccess` means index/array access yields `T | undefined`; guard before use (the codebase uses `!` postfix and existential checks deliberately in hot paths).
- **Path aliases.** `@/*` and `~/*` both resolve to `./src/*`; `@/routes/*` special-cases the Vercel operator routes. `convex/` code imports adjacent modules by relative path (`../src/…`) or via `convex/_generated/api`. See `tsconfig.json` `paths`.
- **`as const` and explicit literals.** Discriminated-union `kind` fields use `as const`; capability/schema constants use explicit string literal versions (e.g. `contractFormat: 'ae.capability-contract:v2' as const`). These literal kinds are part of the wire/provenance contract and must not drift.

## 2. Naming conventions

- **`snake_case` for machine-identity strings** (action ids, capability ids, contract refs, data-use effect ids, provenance statuses): `capabilityId`, `contractRef`, `selectionKey`, `route.reference.resolve`, `curated_publication`. UI-visible prose is human-readable; identifiers are snake/kebab.
- **`camelCase` for functions/variables/props**: `discoverAndFilterDescriptors`, `createConfiguredRequestInterpreter`, `openCapabilityDecisionModel`.
- **`PascalCase` for types/interfaces/classes**: `CapabilityDecisionModel`, `RegisteredEvaluationBinding`, `TestConvex`.
- **Follow a `noun-verb` / `<domain>.<action>` contract-id scheme** (`plumbing.callout`, `fx.rate`), which doubles as the discovery `searchTerms` vocabulary.
- **Files are `kebab-case.ts`** (`deterministic-interpreter.ts`, `capability-domain.ts`); test files mirror the module name with `.test.ts` appended.
- **Actions are a single registry.** `src/modules/actions/index.ts` is the single cross-surface action registry; routes, MCP, CLI, and UI must consume it and MUST NOT duplicate domain logic in their own action maps.

## 3. Module boundaries (deep modules, explicit seams)

- **One public surface per domain.** Each `src/modules/<domain>/` exposes its API through `public.ts` (or an index); implementation lives in sibling/internal files. Consumers import from the public module, never reaching into internals. Examples: `src/modules/capability-contract/public.ts`, `src/modules/capability-supply/public.ts`, `src/modules/customer-request/application/interpret-compile`, `src/modules/customer-request/compiler`.
- **`internal/` marks private internals.** `src/modules/capability-supply/internal/` (e.g. `admit-provider-schema.ts`, `readiness-probe.ts`) holds admission/normalization that is deliberately not public API.
- **Deterministic kernel owns authority.** The deterministic kernel (compilers, validators, interpreters, publish guards) owns validation, persistence, and authority. Model/provider observations are untrusted until they pass deterministic validation. Authority precedes effects; see `src/modules/capability-supply/internal/publication/publish.ts`.
- **Convex is the durable source of truth.** `convex/*.ts` functions persist authoritative state; `src/modules/*` define the domain logic; `src/routes/`, MCP, CLI, and UI consume *redacted projections*, never raw documents. Do not put persistence/authority in a route handler.
- **`internal/` files and `convex/` functions that pair with a domain module** follow one-to-one naming (`src/modules/<domain>/<x>.functions.ts` ↔ `convex/<x>.ts`) so provenance is greppable.
- **Import boundaries are enforced by tests.** `tests/imports/*-boundaries.test.ts` statically fail on cross-layer imports (route → kernel, public → internal, client → convex), plus `ts-standards.test.ts` for style enforcement. When adding a module, extend the matching boundary test; never route around it.

## 4. Error handling

- **Return discriminated unions instead of throwing** for expected control flow. Branches carry a `kind` plus authoring:
  - `{ kind: 'accepted', useRef, operationKey, state: 'settled', … }`
  - `{ kind: 'refused', reason: 'authentication_required', status: 401 }`
  - `{ kind: 'no_candidates' | 'unavailable', schemaVersion: 'registry-operations:v1', … }`
  - `{ kind: 'verified' | 'deployed' | … }` for release/verification flows.
- **Machine-readable error keys for host/integration failures**: `hosted_release_revision_mismatch`, `vercel_git_source_deployment_failed:ERROR`, `customer_request_interpretation_provider_invalid`. Use underscore-delimited snake keys; assert on them in tests (`rejects.toThrow(...)`).
- **Throw only for genuine invariants** (programming errors, unrepresentable states). Deterministic-return branches cover the rest.
- **Never leak provider/model internals to public surfaces.** Silence internal `[ERROR] provider_invalid unknown_finish_reason` chatter at the transport seam; keep CLI answers clean (see `PROMPT-DATA-FLOW.md`).
- **Idempotency guards are correct and must not be weakened.** `src/modules/capability-supply/internal/publication/publish.ts:92` rejects `contract_identity_conflict` (one `capabilityId`+`version` → one content digest). When source drift changes a contract (e.g. adding `inputExamples`), retire-and-replace the stale curated publication (`withdrawCuratedCapability` / `retireLegacyExaV1` patterns in `convex/capabilitySupply.ts` / `convex/curatedProviders.ts`) rather than bypassing the guard.

## 5. Lean / no-reinvention rules (from `CLAUDE.md`)

The eight lean rules apply:
1. **No backward-compatibility layers.** Delete outdated code outright; no shims, aliases, migration fallbacks.
2. **Simplest implementation that meets current needs.** No premature abstraction or config layers.
3. **Layer gradually** — minimal end-to-end first, then build up. Never tear down working code for unfinished complexity.
4. **Modular components with separation of concerns.**
5. **Prefer mature, maintained libraries** over rewrites.
6. **Check existing dependencies before adding new ones** (see `src/modules/capability-contract/public.ts` plain AJV JSON imports as a precedent).
7. **Architect for the long haul** — no "swap later" half-measures.
8. **Use proven patterns from mature products**, don't reinvent.

The `reuse-vs-handroll-audit` / `de-handroll-audit` skills formalize the evidence-backed keep-or-replace decision before ripping out or hand-rolling a seam. Do not add a dependency or a hand-rolled module without that check.

## 6. Deterministic-kernel authority (Architecture invariant)

- **Discovery ≠ selection ≠ authority.** The engine path is NL → `discoverAndFilterDescriptors` (registry `capabilitySupplyOperations:search`) → interpreter (`createConfiguredRequestInterpreter`) → `compileCustomerRequest`. Discovery narrows the pool; the *deterministic interpreter* makes final selections; the *deterministic kernel* validates and persists. Model output is a *proposal*, never the source of truth.
- **Composite recovery is deliberation, not authority.** When the model returns zero selections but a discovery-narrowed pool is non-empty, the composite interpreter falls through to the deterministic interpreter (the AI-SDK *stable-terminal* pattern). The deterministic interpreter still proposes nothing when truly unmatched — it never fabricates a capability.
- **Cross-capability domain guard.** `src/modules/customer-request/application/interpret-compile/capability-domain.ts` refuses capability/fiat mismatches (e.g. crypto routed to an ECB-fiat-only op) at selection time, keeping the kernel honest.
- **Tri-state provenance + inputExamples.** Capabilities carry `curated`/`imported`/`observed-real` provenance (`provenance-tristate`); contracts carry `inputExamples` teaching data that is threaded into the model descriptor. Provenance informs promotion, never bypasses validation.

## 7. Testing style (see TESTING.md)

- Vitest with `globals: false` — always `import { describe, expect, it, vi } from 'vitest'`.
- Unit tests are pure and value-driven (passed-in dependencies), not global-mock-heavy; integration tests use `convex-test` against a real in-memory Convex.
- Stub the AI SDK's `fetch` with `mockImplementation(async () => modelResponse({ … }))` — a fresh `Response` per call — never `mockResolvedValue(modelResponse({…}))`, whose eagerly-built body is one-shot.
- Tests defend observable contracts (discriminated kinds, refusal reasons, boundary behavior) and fail on plausible bugs — not implementation text.
