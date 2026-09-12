# Platform maturity sprint

Date: 2026-09-12
Branch: well-7/app-shell

This sprint matures three app-level gaps found in the 2026-09-12 census (see [app-maturity-audit.md](./app-maturity-audit.md)). Governing constraint: every lane EXTENDS an existing repo primitive and locks it with an enforcement pattern already running in CI. No new architecture, no new patterns.

## Lanes

| Lane | Gap | Primitive extended | Lock reused |
| --- | --- | --- | --- |
| 1 | 640 silent catches destroy error causes | captureRouteException (src/lib/observability/capture-route-exception.ts:3) | ratchet test, pattern from tests/imports/module-boundaries-ratchet.test.ts and tools/dev/deps-ratchet.ts:24-28 |
| 2 | Failures never reach users as actionable detail | buildProblem / RFC 9457 ProblemDetails (src/lib/errors.ts:95-146) | tests/unit/http/problem-envelope-drift.test.ts:39-61 |
| 3 | Env unvalidated; fails at runtime not boot | DEPLOYMENT_MANIFEST.configuration (src/lib/deployment/manifest.ts:196-204) | npm run env:example:check, already in test:release:source |

## Lane 1 — Error legibility

- Baseline: 640 bare `} catch {` of 863 total catch sites (74%); 0 log within 3 lines; 76 capture*Exception sites codebase-wide. Re-derive: `grep -rn '} catch {' src convex --include='*.ts' --include='*.tsx' | grep -v _generated | grep -v '\.test\.' | wc -l`
- Build: `degrade(cause, fallback, context)` in src/lib/observability/degrade.ts. Reports at Sentry level 'warning' with tags, returns fallback. Rationale: warning not error — 640 error-level events would bury real outages; a successful degrade must not page. A failed fallback stays error-level.
- Build: canonical `Degraded` union in src/lib/errors.ts, replacing per-module hand-rolled `{ kind: 'unavailable' }`.
- Lock: tests/imports/bare-catch-ratchet.test.ts, ceiling 640, may only decrease. TypeScript + vitest, not .mjs (repo rule 9; deps-ratchet.ts migrated off .mjs).
- Scope decision: FULL SWEEP of all 640, executed in waves by directory, one agent per file, to limit conflict with the in-flight well-7 working tree.
- Priority wave first (money/reconciliation, silently dropping work): convex/capabilityCallWorker.ts:205,224,271,290 and convex/moneyX402PaymentAuthorization.ts:44,59,94,541.
- Highest-density files: provider-connection-handoff.ts (29), agent-access-oauth-api.ts (16), agent-access.functions.ts (12), jitProviderConsequence.ts (11), provider-workspace.functions.ts (10).

## Lane 2 — Failure reaches the user

- Key finding that shrinks this lane: `createServerFn({...}).validator(zod).handler()` is already the dominant backend pattern (src/routes/privacy.remove-business.tsx:31-33). Server-side zod validation ALREADY RUNS. The zod error is discarded in a catch and flattened to a generic string.
- Add RFC 9457 `invalid-params` member to ProblemDetails (spec-defined member, not invented). Envelope already carries correlation ref via header (src/lib/server/problem.ts:22-23).
- Map existing .validator(zod) failures into invalid-params.
- Form library decision: **TanStack Form**. Rationale: same team as TanStack Router/Start already in use; shadcn/ui went form-agnostic in Oct 2025 with official <Field> support for it; Standard Schema means zod 4.4.3 schemas plug in with no adapter. Tradeoff accepted: controlled inputs only. Rejected: react-hook-form (larger ecosystem but introduces a second state paradigm alongside the TanStack stack).
- Named defects to fix: generic string at src/components/ae/supply/AeSupplySourceNativeStart.tsx:301; form unmounts on error with no path back at src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx:346.
- Reference implementation to copy: correlationRef threaded src/lib/server/agent-access-oauth-store.ts:236 -> convex/capabilitySupplyPublish.ts:659/685 -> AeAgentAccessAuthorizeForm.tsx:308 -> rendered :558-560.
- Lock: Problem envelope adoption is 17 of 62 api* routes (27%). Ratchet upward.

## Lane 3 — Config validated at boot

- Baseline: ~70 env vars declared across manifest groups; fieldRules (21 entries, manifest.ts:154-175) declare kinds url/boolean/host-list/credential-ref as DOCUMENTATION ONLY, never validated. readTrimmedEnv 72 uses vs raw process.env 53 uses.
- Build: src/lib/deployment/env-schema.ts mapping each declared kind to a zod 4 schema; validateEnvironment() returns ALL problems in RFC 9457 invalid-params shape ({name, reason}).
- Decision: extend the existing manifest; do NOT adopt @t3-oss/env-core. Rationale: t3-env cannot consume the requiredProduction/conditional/forbiddenProduction grouping, so adopting it means discarding working CI infrastructure (env:example:check). Standard Schema keeps zod 4 either way. No new dependency.
- Follow-on: collapse 53 raw process.env reads onto readTrimmedEnv, then ratchet raw reads toward zero.

## Sequencing and gates

1. Contracts (blocking, single owner): src/lib/errors.ts gains Degraded + invalid-params; src/lib/observability/degrade.ts created. Both lanes 1 and 2 depend on this file, so one agent owns it.
2. Parallel: Lane 3 env-schema.ts (independent, no file overlap).
3. Lane 1 ratchet test at ceiling 640, then sweep waves by directory.
4. Lane 2 form conversions + invalid-params mapping, after contracts land and @tanstack/react-form is installed.
5. Wire validateEnvironment() into boot.

Gate per step: `npm run typecheck` scoped by grep to owned files, then `npm run lint`, then the narrow relevant vitest file. Full `npm run gate` only at lane close.

## Out of scope (from the audit, deliberately deferred)

- No user.deleted webhook handler (convex/auth.ts:142-145)
- Unbounded read convex/x402DirectoryIndexBackfill.ts:21
- .filter() without .withIndex() at convex/lib/callLifecycle/dispatch.ts:540; 87 .filter() calls across 39 files unclassified
- Dead scaffolding convex/lib/authorityRegistrars.ts (imported nowhere)
- No root catch-all 404 route
- HTTP layer census incomplete: 5 of 61 api route files sampled
- Transactional email / admin back-office: existence unknown
