# Coding Conventions

**Analysis Date:** 2026-08-04

## Naming Patterns

**Files:**
- Keep product/domain code under `src/modules/<domain>/`; expose cross-surface contracts through `public.ts`, keep implementation-only code under `internal/`, and put explicit host adapters in `*.functions.ts` or `*.convex.ts` (`src/modules/work-tree/public.ts`, `src/modules/work-tree/work-tree.functions.ts`, `src/modules/work-tree/convex.ts`).
- Use lower-kebab names for authored TypeScript modules and explicit suffixes for seams: `*.actions.ts` for registered action declarations, `*.functions.ts` for TanStack/source adapters, and `*.test.ts`/`*.test.tsx` for Vitest (`src/modules/customer-request/customer-request.actions.ts`, `src/modules/inquiries/inquiry.functions.ts`).
- Convex entrypoints retain lower-camel filenames that match their exported function family (`convex/customerRequestV2.ts`, `convex/capabilitySupply.ts`, `convex/notificationOutbox.ts`). TanStack route filenames follow route syntax (`src/routes/api.answer.turn.ts`, `src/routes/$slug.tsx`).
- React product components use PascalCase filenames and the `Ae` prefix; shared primitives remain in `src/components/ui/` (`src/components/ae/chat/AeChat.tsx`, `src/components/ae/action-invocation/AePaidOperationCard.tsx`). shadcn primitives are generated into `src/components/ui/` with kebab names and the `new-york` style per `components.json`.
- Value-only exports that must leave a component file for react-doctor `only-export-components` are split into sibling `*.exports.ts` modules; type-only exports stay in the component module (`src/components/ae/provider-facts.tsx` + `src/components/ae/provider-facts.exports.ts`, `src/components/ui/button.tsx` + `src/components/ui/button-groups.tsx`/`button-variants.ts`).

**Functions:**
- Name functions and commands in camelCase with a verb describing the read or transition (`readPublicTargetAdmissionThroughSource` in `src/modules/inquiries/inquiry.functions.ts`, `createWorkTreeThroughSource` in `src/modules/work-tree/work-tree.functions.ts`).
- Name action constants with the domain operation followed by `Action`, and register every action explicitly in `src/modules/actions/index.ts` (`registrySearchAction`, `customerRequestConfirmAction`, `workTreeCreateAction`).
- Name Convex exports with lower-camel operation names and keep the handler at the boundary (`publishCapability` in `convex/capabilitySupply.ts`, `enqueueInquiryNotificationDispatch` in `convex/notificationOutbox.ts`).
- Name React components and their prop types in PascalCase (`AeResearchProcess` and `AeResearchProcessProps` in `src/components/ae/chat/AeResearchProcess.tsx`).

**Variables:**
- Use camelCase for locals and parameters; use uppercase for protocol limits and stable storage/config keys (`MAX_ANSWER_TURN_BODY_BYTES` in `src/routes/api.answer.turn.ts`, `RECENT_THREADS_STORAGE_KEY` in `src/components/ae/chat/AeChat.tsx`).
- Represent finite vocabularies with `as const` value tuples and derive the union (`RegistryProjectionStatusValues` in `src/modules/registry/public.ts`, `AuditEventTypeValues` in `src/modules/observability/public.ts`).
- Use `operationKey`, `correlationId`, revision, digest, and explicit actor/principal names rather than anonymous strings at durable transition boundaries (`src/modules/work-tree/work-tree.functions.ts`, `convex/customerRequestV2.ts`).

**Types:**
- Use PascalCase names and discriminated unions keyed by `kind`, `status`, or another explicit tag (`ActionResult` in `src/modules/common/action.ts`, `WorkTreeDecisionReceipt` in `src/modules/work-tree/work-tree.functions.ts`).
- Publish source-owned identifiers as branded types and keep public DTOs immutable with `Readonly` fields/arrays (`src/modules/common/ids.ts`, `src/modules/registry/public.ts`).
- Preserve literal precision with `as const`, `satisfies`, and exhaustive maps; derive Zod/Convex validator types rather than duplicating broad string unions (`src/modules/answer-thread/answer-thread.schema.ts`, `tests/types/domain-contracts.test.ts`).

## Code Style

**Formatting:**
- Authored TypeScript, TSX, and Convex code uses two-space indentation, single quotes, no semicolons, and trailing commas in multiline literals/calls (`src/modules/common/deep-freeze.ts`, `src/routes/api.answer.turn.ts`, `tests/unit/actions/action-contract-compatibility.test.ts`).
- No repository-wide Prettier, Biome, or ESLint configuration is present; follow the nearest authored file. The imported implementation in `src/components/ai-elements/code-block.tsx` is a deliberate double-quote/semicolon exception.
- Preserve strict compiler settings in `tsconfig.json`: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `isolatedModules`, `resolveJsonModule`, and `moduleResolution: Bundler`.

**Linting:**
- Run `npm run lint`, which invokes `oxlint src convex tests tools --deny-warnings`; correctness is an error category and the TypeScript/OXC plugins plus `no-debugger` are enabled in `.oxlintrc.json`.
- Keep generated, intentionally invalid, and vendor inputs out of ordinary lint changes: `.oxlintrc.json` ignores `convex/_generated/**`, `tests/fixtures/**`, and `vendor/**`.
- Treat React Doctor as advisory and preserve its source-reviewed exception/retired-file list in `doctor.config.ts`; the release baseline explicitly checks that the workflow uses `blocking: none` (`tests/unit/release/green-release-baseline.test.ts`), and the `react-doctor.yml` workflow runs the audit separately.

## Import Organization

**Order:**
1. Import third-party packages first, then leave a blank line (`src/modules/customer-request/customer-request.actions.ts`).
2. Import project aliases such as `@/...` and `~/...`, grouping related types and values together (`src/modules/registry/registry.actions.ts`).
3. Import same-domain relatives and private implementation paths last; Convex adapters additionally keep generated bindings and local ports explicit (`src/modules/work-tree/work-tree.functions.ts`, `convex/capabilitySupply.ts`).

**Path Aliases:**
- Use `@/*` or `~/*` for `src/*`; use `@/routes/owner.*`, `@/routes/admin.*`, and `@/routes/developers.discovery` only for their scoped route aliases declared in `tsconfig.json`.
- Import other modules through their public seam, not `internal/`; static boundary suites enforce this for routes, capability supply, customer requests, and action hosts (`tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`, `tests/imports/action-invocation-host-boundaries.test.ts`).
- Preserve the nearest existing grouping in server adapters such as `src/lib/server/convex-source.ts`; do not introduce a second alias convention merely to reorder an unrelated file.

## Error Handling

**Patterns:**
- Return typed domain outcomes such as `{ kind: 'ok' }`, `{ kind: 'refused', code }`, `{ kind: 'error', code, reason }`, or `{ ok: false, code }`; preserve the discriminated result through host adapters and Convex readbacks (`src/modules/work-tree/work-tree.functions.ts`, `convex/notificationOutbox.ts`).
- At HTTP boundaries, bound the body, parse JSON, validate the schema, then perform admission/access/work; map expected failures to sanitized status/code JSON (`src/lib/server/bounded-request-body.ts`, `src/routes/api.answer.turn.ts`, `src/lib/server/json-error.ts`).
- Use strict Zod objects/unions for public inputs and `v.*` args plus explicit `returns` validators for Convex exports (`src/modules/inquiries/inquiry.functions.ts`, `convex/capabilitySupply.ts`).
- Catch `unknown`, narrow it with `instanceof`, a code guard, or a schema, and map only known source refusals; do not expose provider payloads, credentials, or raw exception text (`src/modules/work-tree/work-tree.functions.ts`, `src/lib/server/convex-source.ts`).
- Throw for programmer/configuration/infrastructure faults when no typed business alternative exists; omit absent optional properties with conditional spreads to satisfy `exactOptionalPropertyTypes` (`src/modules/common/ids.ts`, `src/routes/api.answer.turn.ts`).

## Logging

**Framework:** `console` with stable event/code strings; development/evidence tools also emit structured JSON (`src/modules/customer-request/openrouter-transport.ts`, `tools/dev/action-invocation-development-evidence.ts`).

**Patterns:**
- Log redacted provider/interpreter failures with stable codes and operational context, never raw request bodies, prompts, credentials, or provider payloads (`src/modules/customer-request/application/interpret-compile/interpreter.ts`).
- Keep diagnostics and observer sinks non-authoritative: a throwing observer must not change command truth (`src/modules/action-invocation/application-service.ts`, `tests/unit/action-invocation/application-service-observer.test.ts`).
- Assert redaction in tests whenever logs, evidence, notifications, or readbacks cross a boundary (`tests/unit/convex/notification-outbox-runtime.test.ts`, `tests/eval/answer-pipeline.test.ts`).

## Comments

**When to Comment:**
- Comment invariants, security boundaries, recovery/ordering requirements, and deliberate local exceptions; avoid narrating obvious syntax (`src/modules/common/deep-freeze.ts`, `src/routes/api.answer.turn.ts`).
- Keep comments beside the behavior they constrain, including public disclosure boundaries and test-only seams (`src/components/ae/chat/AeResearchProcess.tsx`, `tests/setup/no-search-gap-writes.ts`).

**JSDoc/TSDoc:**
- Use short JSDoc for public module/action contracts and non-obvious safety guarantees; avoid parameter boilerplate when types state the contract (`src/modules/common/action.ts`, `src/modules/common/deep-freeze.ts`).
- Preserve comments documenting generated/vendor exceptions or why a lint/test rule is intentionally different (`src/components/ai-elements/code-block.tsx`, `doctor.config.ts`).

## Function Design

**Size:** Keep pure transitions, validators, projections, and result mappers small; keep routes, TanStack server functions, and Convex handlers thin: validate, derive authority, delegate to the owning module, and serialize (`src/routes/api.answer.turn.ts`, `src/modules/inquiries/inquiry.functions.ts`, `convex/notificationOutbox.ts`).

**Parameters:** Prefer one object parameter for multi-field commands, make immutable inputs explicit, and inject ports/options for provider, clock, persistence, and test seams instead of reaching for global state (`src/modules/common/action.ts`, `src/modules/customer-request/application/interpret-compile/compile.ts`, `tests/unit/customer-request/application/compare-resume.test.ts`).

**Return Values:** Return exported DTOs or discriminated result unions; project away Convex documents, provider SDK shapes, private IDs, and raw storage records before crossing a public seam (`src/modules/registry/public.ts`, `src/modules/answer/public.ts`, `src/modules/work-tree/work-tree.functions.ts`).

## Module Design

**Exports:** Put cross-surface schemas, contracts, DTO builders, and safe reads in the owning `public.ts`; keep implementation-only state machines and persistence details under `internal/`; expose explicit `*.functions.ts`/`*.convex.ts` adapters for routes, Convex, and hosts (`src/modules/capability-supply/public.ts`, `src/modules/capability-supply/internal/`, `src/modules/capability-supply/convex.ts`).

**Barrel Files:** Use intentional domain barrels and one explicit action registry. `src/modules/actions/index.ts` imports every registered action, asserts unique IDs, and derives MCP names; never rely on module-evaluation side effects or hand-maintained parallel surface maps. Boundary tests in `tests/imports/` and `tests/unit/actions/registry.test.ts` are the contract.

## Behavioral Conventions

The repository records a lazy-minimal-edit doctrine that governs all code changes:

- Prefer the laziest correct solution: reuse an existing helper, pattern, or already-installed dependency before writing new code; the standard library before custom code; a one-liner before a helper (`CLAUDE.md`, `.agents/rules/ponytail.md`).
- Make surgical changes: touch only what a ticket requires, match existing style, and clean up only orphans your own change creates (`CLAUDE.md`).
- Fix root causes, not symptoms: grep every caller of a shared function and fix the shared path once rather than patching a single call site (`.agents/rules/ponytail.md`).
- No speculative abstractions, no new dependency when avoidable, deletion over addition; mark deliberate simplifications with a `ponytail:` comment naming the ceiling and upgrade path (`.agents/rules/ponytail.md`).

## Anti-Patterns

### Importing private modules or duplicating action registration

**What happens:** Routes/hosts import `internal/` implementations or a surface builds its own action list instead of using `src/modules/actions/index.ts` (`tests/imports/private-imports.test.ts`, `tests/unit/actions/registry.test.ts`).
**Why it's wrong:** It bypasses the public contract, creates divergent validation/projections, and lets bundlers tree-shake unregistered actions.
**Do this instead:** Export the safe contract from `src/modules/<domain>/public.ts`, call the owning `*.functions.ts` adapter, and add action declarations to the central registry (`src/modules/common/action.ts`, `src/modules/actions/index.ts`).

### Trusting caller-authored authority or leaking raw source records

**What happens:** A browser/client value is treated as a role, principal, source-write credential, provider response, or public DTO without server derivation/projection (`src/lib/server/convex-source.ts`, `src/modules/work-tree/work-tree.functions.ts`).
**Why it's wrong:** It permits impersonation or disclosure and makes replay/refusal behavior depend on untrusted wire data; the standards and UI-contract scans exist to catch these holes (`tests/imports/ts-standards.test.ts`, `tests/ui-contract/ui-contract.test.ts`).
**Do this instead:** Derive identity/authority inside the server or Convex boundary, validate strict inputs, use branded IDs and source-owned result unions, and project redacted DTOs before returning (`convex/authz.ts`, `src/modules/security/source-write-admission.ts`, `src/modules/registry/public.ts`).

---

*Convention analysis: 2026-08-04*
