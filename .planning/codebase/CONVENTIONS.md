# Coding Conventions

**Analysis Date:** 2026-08-02

## Naming Patterns

**Files:**
- Keep domain code under `src/modules/<domain>/`; use a public seam at `src/modules/<domain>/public.ts`, private implementation under `internal/`, and explicit host/port adapters such as `src/modules/catalog/owner-claim.functions.ts`.
- Use descriptive lower-case or lower-kebab names for module files (`src/modules/customer-request/route-mandate.ts`); Convex entrypoints retain the existing lower-camel convention (`convex/notificationOutbox.ts`).
- Use PascalCase `.tsx` files for React product components, with the `Ae` product prefix (`src/components/ae/chat/AeChat.tsx`); shared primitives live in `src/components/ui/`.
- Follow TanStack Router file names for routes (`src/routes/t.$threadId.tsx`, `src/routes/api.answer.turn.ts`) and do not treat generated `src/routeTree.gen.ts` as an authored interface.

**Functions:**
- Name functions and exported commands in camelCase with a verb that identifies the transition or read (`src/modules/action-invocation/application-service.ts`, `convex/capabilitySupply.ts`).
- Name React components in PascalCase and reusable prop types as `<ComponentName>Props` (`src/components/ae/chat/AeChat.tsx`); Convex functions identify their source-owned operation (`enqueueInquiryNotificationDispatch` in `convex/notificationOutbox.ts`).

**Variables:**
- Use camelCase for locals and parameters; reserve uppercase names for protocol limits, storage keys, and stable value tuples (`MAX_ANSWER_TURN_BODY_BYTES` in `src/routes/api.answer.turn.ts`, `RECENT_THREADS_STORAGE_KEY` in `src/components/ae/chat/AeChat.tsx`).
- Keep protocol/status vocabularies in `*Values` const tuples and derive unions from them (`AnswerTurnStatusValues` in `src/modules/answer-thread/answer-thread.schema.ts`).

**Types:**
- Use PascalCase type names and discriminated unions keyed by `kind`, `status`, or another explicit tag (`ActionResult` in `src/modules/common/action.ts`, `PublicThreadProjection` in `src/modules/answer-thread/public.ts`).
- Publish immutable contracts with `Readonly` objects and readonly arrays; use branded IDs for source-owned identifiers (`src/modules/common/ids.ts`, `src/modules/common/action.ts`).
- Preserve literal precision with `as const` and exhaustive `satisfies Record<Union, ...>` maps (`src/modules/answer-thread/internal/answer-response-planner.ts`).

## Code Style

**Formatting:**
- Authored TypeScript, React, and Convex code uses two-space indentation, single quotes, no semicolons, and trailing commas in multiline literals/calls (`src/modules/common/deep-freeze.ts`, `src/routes/api.answer.turn.ts`, `tests/unit/actions/action-contract-compatibility.test.ts`).
- There is no repository-wide Prettier or Biome configuration; follow the nearest authored file. The imported AI-elements implementation is a deliberate style exception with double quotes and semicolons (`src/components/ai-elements/code-block.tsx`).
- TypeScript is strict and non-emitting: preserve `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, `noImplicitOverride`, `isolatedModules`, and `moduleResolution: Bundler` from `tsconfig.json`.

**Linting:**
- Run `npm run lint` for `oxlint` over `src`, `convex`, `tests`, and `tools`; correctness is an error category and the TypeScript/OXC plugins plus `no-debugger` are enabled in `.oxlintrc.json`.
- Keep generated/vendor/negative-fixture paths out of ordinary lint changes: `.oxlintrc.json` ignores `convex/_generated/**`, `tests/fixtures/**`, and `vendor/**`.
- Keep React Doctor advisory rather than a blocking product gate; its only current rule override and ignored retired routing files are documented in `doctor.config.ts`.

## Import Organization

**Order:**
1. Import third-party packages first, including type-only imports, then leave a blank line (`src/components/ae/chat/AeChat.tsx`, `tests/unit/actions/action-contract-compatibility.test.ts`).
2. Import project aliases such as `@/...` and `~/...` next, grouping related names in multiline imports (`src/components/ae/chat/AeChat.tsx`).
3. Import same-module relatives and private implementation paths last; Convex files additionally keep generated bindings and local adapters explicit (`convex/notificationOutbox.ts`).

**Path Aliases:**
- Use `@/*` or `~/*` for `src/*`; use the owner/admin/developer route aliases only for their scoped route modules, as defined in `tsconfig.json`.
- Keep route and public-module imports on public seams; private-import boundary tests enforce this (`tests/imports/private-imports.test.ts`, `tests/imports/route-boundary.test.ts`).

## Error Handling

**Patterns:**
- Represent expected domain outcomes as discriminated values such as `{ kind: 'refused', code }`, `{ kind: 'error', code, reason }`, or `{ ok: false, code }`; preserve those unions through hosts and Convex readbacks (`src/modules/action-invocation/application-service.ts`, `src/modules/business/internal/claim.ts`, `convex/notificationOutbox.ts`).
- Validate untrusted HTTP input in order: bounded body, JSON parse, schema parse, admission, access, then work. Return sanitized status/code JSON rather than throwing expected failures (`src/lib/server/bounded-request-body.ts`, `src/routes/api.answer.turn.ts`).
- Put `zod` schemas at request/public boundaries and use strict objects or discriminated unions for protocol payloads (`src/modules/answer/answer-schema.ts`); Convex functions declare `v.*` args and return validators next to each export (`convex/customerRequestApplication.ts`, `convex/capabilitySupply.ts`).
- Derive identity and role inside the server/Convex boundary, never from a browser-provided role; preserve anonymous/authenticated actor results and source-owned membership checks (`convex/authz.ts`, `src/lib/server/require-clerk-server-session.ts`).
- Throw only for programmer, configuration, or infrastructure faults where the caller has no typed business alternative; expected boundary failures are returned or mapped to a response (`src/modules/common/ids.ts`, `src/lib/server/json-error.ts`).
- Preserve exact optional-property semantics by omitting absent values with conditional spreads instead of assigning `undefined` (`src/routes/api.answer.turn.ts`, `convex/notificationOutbox.ts`).

## Logging

**Framework:** `console` with structured event/code strings; CLI evidence commands also emit JSON (`src/modules/customer-request/openrouter-transport.ts`, `tools/dev/action-invocation-development-evidence.ts`).

**Patterns:**
- Log provider/interpreter failures with stable redacted codes and enough context for operators, not raw request bodies, credentials, model prompts, or provider payloads (`src/modules/customer-request/application/interpret-compile/interpreter.ts`, `convex/customerRequestApplication.ts`).
- Keep diagnostic observers non-authoritative: observer and diagnostic-sink failures must not change command truth (`src/modules/action-invocation/application-service.ts`).
- Test logging/redaction-sensitive paths by asserting absent private content and durable redacted fields (`tests/unit/convex/notification-outbox-runtime.test.ts`, `tests/eval/answer-pipeline.test.ts`).

## Comments

**When to Comment:**
- Comment the invariant, security boundary, recovery behavior, or reason a seemingly unusual order is required; examples include cycle-safe freezing and stream/error precedence (`src/modules/common/deep-freeze.ts`, `src/routes/api.answer.turn.ts`).
- Keep comments beside the behavior they constrain and avoid narrating obvious syntax; product components use comments to explain public disclosure and state boundaries (`src/components/ae/chat/AeResearchProcess.tsx`).

**JSDoc/TSDoc:**
- Use short JSDoc for public component/module contracts and non-obvious safety guarantees; do not add parameter boilerplate when types already communicate the contract (`src/components/ae/action-invocation/AePaidOperationCard.tsx`, `src/modules/common/deep-freeze.ts`).
- Preserve comments that name generated/vendor exceptions or test seams, because they explain why a local rule differs from the default (`src/components/ai-elements/code-block.tsx`, `tests/setup/no-search-gap-writes.ts`).

## Function Design

**Size:** Keep pure transitions and projections small, and keep routes/Convex handlers thin adapters that validate, authorize, delegate, and serialize (`src/routes/api.answer.turn.ts`, `src/modules/customer-request/route-mandate.ts`, `convex/capabilitySupply.ts`).

**Parameters:** Prefer one object parameter for multi-field commands, make immutable inputs explicit, and inject ports/options for testability instead of reaching for global providers (`src/modules/common/action.ts`, `src/modules/action-invocation/application-service.ts`, `src/lib/server/customer-request-api.ts`).

**Return Values:** Return exported DTOs or discriminated result unions; do not leak Convex documents, provider SDK response shapes, or private storage records through public seams (`src/modules/answer/public.ts`, `src/modules/registry/public.ts`, `convex/notificationOutbox.ts`).

## Module Design

**Exports:** Put cross-surface contracts, schemas, DTO builders, and safe functions in the owning `public.ts`; keep implementation-only helpers under `internal/` and expose explicit `*.functions.ts` adapters for route/Convex/host seams (`src/modules/answer/public.ts`, `src/modules/answer/internal/`, `src/modules/catalog/owner-claim.functions.ts`).

**Barrel Files:** Use intentional domain public barrels, especially `src/modules/actions/index.ts` as the single registered-action catalog; derive lookup/surface names from that registry rather than duplicating maps. Do not import private module files from routes or other domain owners (`tests/imports/private-imports.test.ts`, `tests/imports/action-invocation-host-boundaries.test.ts`).

---

*Convention analysis: 2026-08-02*
