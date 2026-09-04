# Coding Conventions

**Analysis Date:** 2026-09-04

## Naming Patterns

**Files:**
- Use lowercase kebab-case for domain, library, and helper files under `src/modules/` and `src/lib/`, such as `src/modules/common/canonical-digest.ts`, `src/modules/capability-execution/operation-invoke-contracts.ts`, and `src/lib/server/bounded-request-body.ts`.
- Use semantic suffixes for boundary roles: `.actions.ts` for action contracts, `.functions.ts` for server-function adapters, `schema.ts` for public validation surfaces, `contracts.ts` for type contracts, and `public.ts` or `index.ts` for curated module entries. Examples are `src/modules/capability-execution/operation-invoke.actions.ts`, `src/modules/registry/registry.functions.ts`, `src/modules/market/contracts.ts`, and `src/modules/capability-supply/public.ts`.
- Use PascalCase filenames for product React components, normally with the `Ae` prefix inside `src/components/ae/`, such as `src/components/ae/market/AeOperationCard.tsx` and `src/components/ae/layout/AeOperatorShell.tsx`. Keep low-level shared UI primitives lowercase, as in `src/components/ui/dialog.tsx` and `src/components/ui/button.tsx`.
- Follow TanStack Router's file-route grammar under `src/routes/`: dots encode URL segments/layout nesting, `$` encodes parameters, and literal dotted asset names use brackets. Examples are `src/routes/api.v1.operations.$invocationRef.reconcile.ts`, `src/routes/_operator/owner.settings.connections.tsx`, and `src/routes/robots[.]txt.ts`.
- Follow Convex file routing with lower-camel filenames at the `convex/` root, such as `convex/capabilityOperationInvocations.ts` and `convex/moneyStripeWebhookInbox.ts`; place decomposed backend helpers below `convex/lib/`, as in `convex/lib/operationInvocations/admission.ts`.
- Name tests after the observable capability or contract and use `.test.ts`/`.test.tsx`; reserve `.spec.ts` for Playwright browser and deployment smoke suites. Examples are `tests/unit/money/stripe-money-provider.test.ts`, `tests/integration/canonical-operation-reads.test.ts`, and `tests/e2e/developer-discovery.spec.ts`.

**Functions:**
- Use lower camelCase for functions and name them as actions or projections: `createOperationInvokeService` in `src/lib/server/operation-invoke-api.ts`, `gatewayFailureToProblem` in `src/lib/errors.ts`, and `convexTestWithWorkers` in `tests/helpers/convex-fixtures.ts`.
- Prefix boundary readers and validators with explicit verbs such as `read`, `resolve`, `parse`, `validate`, `project`, `sanitize`, `record`, or `require`; representative files are `src/lib/server/read-trimmed-env.ts`, `src/lib/server/canonical-url.ts`, `src/modules/capability-supply/public.ts`, and `src/lib/server/gateway-telemetry.ts`.
- Name React components and component fixtures in PascalCase, as in `DialogFixture` and `SheetFixture` in `tests/unit/ui/modal-lifecycle.test.tsx`.
- Use `handle...` for transport handlers and `...Handler` for reusable Convex handler implementations, as shown in `src/lib/server/operation-invoke-api.ts` and `convex/moneyConnect.ts`.

**Variables:**
- Use lower camelCase for local values, parameters, and object fields throughout `src/lib/server/operation-invoke-api.ts` and `convex/moneyStripeWebhookInbox.ts`.
- Use `UPPER_SNAKE_CASE` for immutable protocol constants, limits, patterns, and activation timestamps, such as `MAX_OPERATION_INVOKE_BODY_BYTES` in `src/lib/server/operation-invoke-api.ts`, `PROBLEM_KINDS` in `src/lib/errors.ts`, and `ACCOUNT_SECURITY_HISTORY_ACTIVATED_AT` in `convex/securityAccountHistory.ts`.
- Use stable lower-snake-case strings for machine codes and discriminants, such as `authentication_required`, `reconciliation_required`, and `operation_not_current` in `src/lib/errors.ts` and `src/modules/capability-execution/operation-invoke-contracts.ts`.
- Use domain-specific `...Ref`, `...Id`, `...At`, `...Digest`, `...Generation`, and `...Revision` suffixes consistently; examples are defined in `src/modules/capability-execution/operation-invoke-contracts.ts` and persisted by `convex/moneyManagedCall.ts`.

**Types:**
- Use PascalCase for exported types and interfaces, such as `ProblemDetails` in `src/lib/errors.ts`, `GatewayTelemetryEvent` in `src/lib/server/gateway-telemetry.ts`, and `PublishedOperationFixture` in `tests/integration/canonical-operation-reads.test.ts`.
- Model domain results as discriminated unions with a required `kind` field and literal variants; use the patterns in `src/modules/capability-execution/operation-invoke-contracts.ts` and `src/modules/money/public.ts`.
- Prefer immutable shapes with `Readonly<{ ... }>` and `readonly` arrays at domain boundaries, as used in `src/modules/capability-execution/operation-invoke-contracts.ts` and `src/modules/module-boundaries.ts`.
- Derive types from validators when that keeps runtime and compile-time contracts together: Zod schemas and `z.infer` appear in `src/modules/observability/funnel.functions.ts`, while Convex validators use `Infer` in `convex/moneyStripeWebhookInbox.ts`.
- Use Convex `Doc<'table'>`, `Id<'table'>`, `QueryCtx`, `MutationCtx`, and `ActionCtx` rather than string IDs or untyped contexts, per `convex/_generated/ai/guidelines.md` and examples in `convex/moneyManagedCall.ts`.

## Code Style

**Formatting:**
- No standalone formatter configuration is present; `package.json` exposes linting but no formatting script. Follow the nearest file's style and keep formatting-only churn out of feature changes.
- The dominant current style in `src/routes/api.v1.operations.call.ts`, `src/lib/server/operation-invoke-api.ts`, and newer Convex files such as `convex/moneyStripeWebhookInbox.ts` is single quotes, no semicolons, trailing commas in multiline structures, and two-space indentation.
- Some retained files use double quotes and semicolons, including `src/modules/money/public.ts`, `convex/externalRegistry.test.ts`, and `scripts/test-cli-package.mjs`. Preserve local consistency unless a dedicated mechanical migration is authorized; `oxlint.config.ts` explicitly rejects turning style migrations into release-gate noise.
- Break complex conditions and chained Convex queries across lines, with the callback close to the query it constrains; use `convex/moneyManagedCall.ts` and `tests/integration/canonical-operation-reads.test.ts` as patterns.
- Omit optional object members instead of setting them to `undefined`, using conditional spreads such as `...(value === undefined ? {} : { value })`; this matches `exactOptionalPropertyTypes` in `tsconfig.json` and patterns in `src/lib/errors.ts`.

**Linting:**
- Run `npm run lint`, which invokes Oxlint over `src`, `convex`, `tests`, and `tools` with `--deny-warnings`; the command and version are defined in `package.json`.
- Extend the shared `@nkzw/oxlint-config` and keep correctness violations at error severity; repository overrides live in `oxlint.config.ts`.
- Do not introduce unused variables, debugger statements, or unapproved console methods. `oxlint.config.ts` permits only `console.error`, `console.info`, and `console.warn` in runtime code, while tests and tools have a broader console allowance.
- Do not use broad runtime `any`, non-null assertions, `v.any()`, broad status strings, hard-coded source-CSRF material, or client-exposed source-write secrets; these constraints are executable in `tests/imports/ts-standards.test.ts` through `src/lib/ui/contract-scans.ts`.
- Keep selected critical paths under their configured classic complexity ceilings of 10, 20, or 30. The exact scoped paths and thresholds are maintained in `oxlint.config.ts`; do not expand an allowlist simply to land a change.
- Run `npm run typecheck` against the strict TypeScript settings in `tsconfig.json`: `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `useUnknownInCatchVariables`, and `noImplicitOverride` are all enabled.
- After changing React code, use the repository's `npm run doctor` command and respect the narrow false-positive configuration in `doctor.config.ts`; do not broadly disable React diagnostics.

## Import Organization

**Order:**
1. Import Node built-ins and third-party packages first, using `node:` specifiers for built-ins; see `src/lib/observability/sentry.server.ts`, `tests/helpers/openrouter-contract-server.ts`, and `tools/dev/run-with-cleanup.mjs`.
2. Insert a blank line, then import application modules through the `@/` alias; see `src/lib/server/operation-invoke-api.ts` and `src/modules/capability-execution/operation-invoke-contracts.ts`.
3. Use relative imports for same-directory implementation details, generated Convex files, or when code runs outside the root TypeScript alias environment; see `convex/moneyStripeWebhookInbox.ts`, `tests/helpers/convex-fixtures.ts`, and `scripts/test-cli-package.mjs`.
4. Co-locate `type` specifiers with their owning import where readable, or use `import type` for type-only dependencies; both patterns appear in `src/lib/server/gateway-telemetry.ts` and `tests/helpers/convex-fixtures.ts`.

**Path Aliases:**
- Prefer `@/*` for `src/*`; it is declared in `tsconfig.json` and mirrored for Vitest in `vitest.config.ts`.
- `~/*` also maps to `src/*` in `tsconfig.json`, but current runtime and test examples predominantly use `@/`; use `@/` for new imports unless matching a local established seam.
- Import route aliases through the explicit owner/admin/developer route mappings in `tsconfig.json` only when route-level code requires them.
- Convex code should import generated APIs relatively from `./_generated/*` and cross into shared domain code through `../src/modules/...`; examples are `convex/moneyManagedCall.ts` and `convex/moneyStripeWebhookInbox.ts`.
- Do not deep-import arbitrary module internals. Only use entries declared in `MODULE_BOUNDARY_MANIFEST` in `src/modules/module-boundaries.ts`; `tests/imports/module-boundaries.test.ts` rejects undeclared entries, reverse edges, cycles, and stale exceptions.

## Error Handling

**Patterns:**
- Return explicit tagged domain outcomes for expected business states rather than throwing: `completed`, `pending`, `refused`, `needs_authority`, and `reconciliation_required` are modeled in `src/modules/capability-execution/operation-invoke-contracts.ts`; money refusals follow the same pattern in `src/modules/money/public.ts`.
- Validate all untrusted boundaries before use. Use Zod strict objects in `src/modules/capability-execution/operation-invoke-contracts.ts`, Convex validators in `convex/moneyStripeWebhookInbox.ts`, and manual `unknown` narrowing where a schema is not available, as required by `convex/_generated/ai/guidelines.md`.
- Project HTTP failures through the shared RFC 9457 model in `src/lib/errors.ts` and build responses with `problem()` from `src/lib/server/problem.ts`; do not invent route-local error envelopes.
- Keep public error codes stable and bounded. `isStableProblemCode` and `remoteProblemToProblem` in `src/lib/errors.ts` deliberately discard arbitrary remote/provider prose.
- Throw `Error` with stable machine-readable tokens for broken invariants, corrupt persisted state, invalid configuration, or impossible test setup; examples include `canonical_source_publication_missing` in `tests/integration/canonical-operation-reads.test.ts` and validation errors in `tools/release/`.
- Treat caught values as `unknown`, sanitize before telemetry, and keep diagnostics fail-open. `captureServerException` in `src/lib/observability/sentry.server.ts` cannot alter the domain response if Sentry fails.
- Fail closed at authority, identity, source-write, payment, and operation-currentness boundaries. The negative paths in `tests/unit/server/operation-invoke-api.test.ts`, `convex/securityAccountHistory.test.ts`, and `tests/integration/canonical-operation-reads.test.ts` are the reference behavior.

## Logging

**Framework:** Sentry for exception capture, PostHog for product/funnel telemetry, bounded action timing sinks for gateway events, and restricted structured console output. Implementations live in `src/lib/observability/sentry.server.ts`, `src/lib/observability/posthog.server.ts`, `src/modules/observability/funnel.functions.ts`, and `src/lib/server/gateway-telemetry.ts`.

**Patterns:**
- Sanitize exception, event, breadcrumb, URL, and metadata values before sending them to external observability services; use `src/lib/observability/private-route-safety.ts` and `src/lib/observability/sentry.server.ts`.
- Attach correlation IDs and bounded allowlisted scalar dimensions instead of request bodies, prompts, provider outputs, or secrets; `src/lib/server/gateway-telemetry.ts` is the canonical gateway pattern.
- Use stable event names and structured objects or serialized JSON when console output is necessary, as in `convex/capabilitySupplyReadiness.ts`, `convex/marketRegistryGraduation.ts`, and `src/modules/capability-execution/invocation-worker/recovery/x402.ts`.
- Use `console.error` for failures, `console.warn` for recoverable/reconciliation conditions, and `console.info` for bounded operational events. Runtime `console.log` is not permitted by `oxlint.config.ts`.
- Do not let logging throw or change the user-visible result; the fail-open pattern is explicit in `src/lib/observability/sentry.server.ts`.

## Comments

**When to Comment:**
- Explain why a boundary, compatibility path, security restriction, or non-obvious workaround exists; examples include the runtime dependency direction in `src/modules/module-boundaries.ts`, reserved response headers in `src/lib/server/problem.ts`, and the Node Web Storage compatibility rationale in `tests/setup/web-storage.ts`.
- Keep inline comments near the exact exceptional behavior they justify, such as the Nitro route/preset rationale in `vite.config.ts` and test-browser cleanup protections in `tools/dev/run-with-cleanup.mjs`.
- Do not narrate straightforward code. Most domain helpers in `src/modules/common/` and route wrappers in `src/routes/` remain self-describing through names and types.
- Preserve compatibility terminology where identifiers still use historical words such as `supplier`; `AGENTS.md` requires new product prose to use the canonical vocabulary in `CONTEXT.md` without silently breaking source compatibility.

**JSDoc/TSDoc:**
- Use JSDoc for shared public contracts, protocol projections, and safety-sensitive utilities where callers need semantic guarantees; see `src/lib/errors.ts`, `src/lib/server/problem.ts`, and `src/lib/server/gateway-telemetry.ts`.
- Keep internal helpers unannotated when the signature and type names already state the contract; `convex/moneyStripeWebhookInbox.ts` and `src/modules/capability-execution/operation-invoke-contracts.ts` provide the dominant pattern.
- Use `@link` references only when tying a public helper to another canonical type or projection, as in `src/lib/errors.ts`.

## Function Design

**Size:** Use small pure validators, projections, and mappers for domain decisions, then compose them in explicit boundary orchestrators. Reference `src/lib/errors.ts` for pure projections and `src/lib/server/operation-invoke-api.ts` for an adapter that delegates rather than owning domain semantics.

**Parameters:**
- Prefer one typed object parameter for multi-field commands and options, commonly wrapped in `Readonly`; examples are `ProblemInput` in `src/lib/errors.ts` and `OperationInvokeHandlerOptions` in `src/lib/server/operation-invoke-api.ts`.
- Inject genuinely external seams through narrow options/ports: authentication and invocation services in `src/lib/server/operation-invoke-api.ts`, Stripe clients in `src/lib/server/stripe-money-provider.ts`, and timing sinks in `src/lib/server/gateway-telemetry.ts`.
- Keep external identifiers and timestamps explicit inputs when determinism or authorization depends on them; patterns are tested in `tests/unit/server/operation-invoke-api.test.ts` and `tests/integration/canonical-operation-reads.test.ts`.
- For Convex functions, always declare `args` and `returns` validators and type contexts with generated types, following `convex/_generated/ai/guidelines.md` and `convex/moneyStripeWebhookInbox.ts`.

**Return Values:**
- Return precise domain unions for expected outcomes and reserve exceptions for invariant/configuration failures; reference `src/modules/capability-execution/operation-invoke-contracts.ts` and `src/modules/money/public.ts`.
- Use `undefined` for absent local optional values and `null` where Convex wire/storage contracts require it; `convex/_generated/ai/guidelines.md` notes that `undefined` is not a valid Convex value.
- Annotate exported boundary functions when inference would hide the public contract; examples include `problem(): Response` in `src/lib/server/problem.ts`, `captureServerException(): void` in `src/lib/observability/sentry.server.ts`, and fixture helpers in `tests/helpers/convex-fixtures.ts`.

## Module Design

**Exports:**
- Use named exports for application behavior, types, validators, and constants. Default exports are limited mainly to framework-owned configuration/registration surfaces such as `convex/schema.ts`, `convex/http.ts`, `vite.config.ts`, and `vitest.config.ts`.
- Expose domain modules only through the entry files declared by `MODULE_BOUNDARY_MANIFEST` in `src/modules/module-boundaries.ts`; add a public entry deliberately rather than importing a convenient internal path.
- Keep transport routes thin: route files such as `src/routes/api.v1.operations.call.ts` bind methods to handlers, while validation and behavior live in `src/lib/server/` and `src/modules/`.
- Keep Convex public functions explicit and sensitive helpers internal. Use `query`/`mutation`/`action` only for intended public APIs and `internalQuery`/`internalMutation`/`internalAction` otherwise, per `convex/_generated/ai/guidelines.md` and `convex/moneyStripeWebhookInbox.ts`.

**Barrel Files:**
- Use curated `public.ts` or `index.ts` files as enforceable module contracts, not broad export-everything barrels. Examples include `src/modules/capability-supply/public.ts`, `src/modules/actions/index.ts`, and `src/components/ae/website/index.ts`.
- Do not add a barrel solely for import convenience. The permitted surface must be added to `src/modules/module-boundaries.ts` and remain compatible with `tests/imports/module-boundaries.test.ts`.
- Keep test-only white-box access exceptional and enumerated in `MODULE_BOUNDARY_MANIFEST.testOnlyWhiteBoxExceptions` in `src/modules/module-boundaries.ts`; new behavioral tests should prefer public surfaces.

---

*Convention analysis: 2026-09-04*
