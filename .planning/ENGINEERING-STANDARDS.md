# Engineering Standards — Agentic Economy

**Status:** implementation constitution.
**Audience:** senior SWE / staff SWE.

## Prime directive

Build the smallest production-grade system that proves the Phase 1 spine.

```text
claim -> publish -> public business service catalog page -> registry/search -> discovery -> operator health
```

If a change does not strengthen that spine or an authority spec, cut it.

## Required skills/modes

| Work | Required skill/mode | Gate it creates |
|---|---|---|
| Any implementation | `/ponytail full` | Delete/simplify first. No future abstractions. |
| Module/interface design | `codebase-design` | Deep module, small interface, tests through seam. |
| TanStack routes/server functions | TanStack Start/Router project skills | Routes are adapters; input validators; DTO/result unions. |
| Convex schema/functions | Convex project rules | Source-owned state, auth-derived actors, codegen. |
| Clerk auth | `clerk-tanstack-patterns` | Clerk UX + Convex authority, no request owner IDs. |
| Payments | `stripe-best-practices` | Reject in Phase 1; future Billing/Checkout/Connect discipline. |
| UI | `accessibility`, `make-interfaces-feel-better` | Mobile, keyboard, focus, errors, loading, empty states. |
| Review | `/mattpocock-review` | Standards and Spec axes separate. |
| Security | `cso` lens | Threat model, source-owned admin, audit, redaction. |
| SEO/AEO | `seo-audit`, `ai-seo` | Crawl/schema/robots/llms gates. |
| GTM | `launch`, `marketing-plan` | Launch stages, claims register, channel attribution. |

## Theatre detector

Reject prose/code that claims:

- production-ready without named gates,
- trusted without source owner and trust tier,
- agent-native without manifest contract and route behavior,
- payment-ready without provider readback/idempotency/receipt/reversal,
- marketplace before supply/demand mechanics,
- AI without a user flow,
- later without phase and non-goal,
- source-mined without ledger row.

Docs must be one of: invariant, interface, state machine, failure mode, acceptance gate, runbook, decision record.

## Source authority

- `PROJECT.md` owns state variants, module interfaces, and durable model.
- Domain specs own specialized gates: `SECURITY-SPEC.md`, `AI-SPEC.md`, `SEO-AEO-SPEC.md`, `GTM-READINESS.md`, `SOURCE-MINING.md`.
- This file defines engineering process and enforceable standards.
- Do not restate variants differently. Link to the owner.

## TypeScript hard spec

Compiler posture:

```text
strict: true
exactOptionalPropertyTypes: true
noUncheckedIndexedAccess: true
useUnknownInCatchVariables: true
noImplicitOverride: true
allowJs: false unless generated-file exception is named
```

Domain code rules:

- No explicit `any`.
- No `as any`.
- No `as unknown as`.
- No non-null assertions.
- No `v.any()` in Convex schema/functions outside a documented boundary adapter with a type test.
- No broad `string` statuses.
- No TypeScript `enum`; use const tuple unions.
- No `Partial<Record<Union, ...>>` for required maps.
- Use `satisfies Record<Union, ...>` for labels, badges, transitions, audit handlers, copy projections, and status maps.
- Expected failures return discriminated result unions.
- Exceptions are for programmer/infrastructure faults only.

Allowed casts:

- `as const`,
- `satisfies`,
- generated code,
- one documented validator-helper cast with a type test proving equality.

Required source scan gate:

```text
test:ts-standards scans src/modules/**, convex/**, apps/web/** excluding generated files for:
  explicit any
  as any
  as unknown as
  non-null assertions
  v.any()
  status: string / sourceState: string style broad statuses
  inexact Convex returns
```

Required type tests:

- invalid statuses fail to compile,
- invalid result codes fail to compile,
- validator-inferred types equal exported domain types,
- route loader/server DTOs do not widen literals,
- every required `Record<Union, ...>` map is exhaustive.

## Validator/source-of-truth pattern

Each owning module exports:

```ts
export const StatusValues = ['one', 'two'] as const
export type Status = (typeof StatusValues)[number]
export const StatusSchema = z.enum(StatusValues)
```

Convex schema either imports runtime-safe domain validators or uses one approved helper that converts the tuple to Convex `v.union(...)`. The helper is type-tested.

Banned: global `validators.ts` dumping ground.

## Route/server-function boundary

Every `createServerFn` with input uses `.inputValidator`.

Every loader/server function returns an exported module DTO/result union.

Routes may import:

- UI components,
- generated Convex client/hooks intended for routes,
- `src/modules/<module>` public seam files.

Routes must not import:

- provider SDKs,
- `convex/schema`,
- Convex stores/runtime internals,
- module private files,
- Node-only libraries unless server-only route and explicitly justified.

Generated Convex files are read-only codegen outputs and never become domain interfaces.

## Convex standards

- Convex functions validate untrusted input.
- Actor/admin authority is derived inside Convex/server boundary, not from browser payload.
- Retryable mutations/projections require durable idempotency key.
- Consequential mutations write typed audit events in the same logical operation.
- Public queries return allowlisted DTOs only.
- Admin queries/mutations read source-owned admin membership.
- Indexes exist for every query path in public/admin routes.
- Schema changes require codegen.

Retryable operations:

```text
claim create
publish
suppress/unsuppress
dispute open/close
registry projection sync/retry
manifest generate/regenerate
admin membership changes
operator control changes
```

## Side-effect/outbox standard

No best-effort external/projection write without durable attempt state.

Projection attempts must store:

```text
attemptId
logicalKey
sourceHash/sourceVersion
projectionKind
status
retryCount
retryAfter
lastErrorCode
lastErrorRedacted
startedAt
finishedAt
```

Readback alone is insufficient. Every failed/stale readback needs a repair action or explicit no-repair decision.

## Audit standard

Use the typed event union in `SECURITY-SPEC.md`.

Rules:

- no optional actor/target for consequential events,
- event ID and idempotency key required,
- before/after state where a state changes,
- reason/evidence for admin actions,
- redacted payload + payload hash,
- correlation ID always present.

## Admin/security standard

- No env-only admin authority.
- No route-only admin authority.
- No admin route without both `beforeLoad` UX guard and server/Convex guard.
- CSRF/same-site Origin required for session-cookie mutations.
- Suppression is fail-closed and shared by all public projections.
- Public outputs use allowlist builders.
- Owner-authored text is untrusted data for agent surfaces.

## UCP/discovery standard

Follow `AI-SPEC.md`.

Banned in Phase 1 runtime/public outputs:

```text
payment_handlers
paymentRequired=true or payment-required flow claims
MCP tool catalog
OpenAPI services
API keys
agent-callable
standard merchant-origin /.well-known/ucp claim
```

Approved public DTOs may include `callable: false` and `paymentRequired: false` only as explicit negative capability flags. Tests must fail if either is true or described as a live action/payment surface.

Every advertised URL must route-test or be omitted.

## SEO/AEO standard

Follow `SEO-AEO-SPEC.md`.

- Public pages need metadata/canonical/noindex/schema contract.
- Sitemap includes only eligible canonical public URLs.
- Robots excludes private routes and intentionally handles AI/search crawlers.
- `llms.txt` is a truth file, not authorization.

## GTM standard

Follow `GTM-READINESS.md`.

- Public launch requires owner activation and funnel readbacks.
- Marketing assets use claims register.
- Broad launch waits until activation/index/discovery/copy gates are green.

## Import/source-mining gates

`test:imports` / `test:source-mining` must fail on:

- banned future-surface directories,
- route importing provider SDKs,
- route importing module private implementation,
- module importing route,
- module importing another module private file,
- runtime importing `.planning`,
- phase-numbered runtime names,
- backup path imports,
- Stripe/x402/wallet/payment identifiers in Phase 1 core/discovery code.

Allowed mentions in `.planning` future-gate docs and tests that assert absence.

## Testing standards

Required scripts by Phase 1 close:

```text
npm run typecheck
npm run check:convex-codegen
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:a11y
npm run test:copy
npm run test:imports
npm run test:source-mining
npm run test:types
npm run test:ts-standards
npm run test:seo
npm run build
```

Deployment/readback gate before public launch:

```text
Vercel preview/live route HTTP smoke
Convex deployment/codegen readback
Clerk middleware/session readback
/claim
/{slug}
/{slug}/ucp
/llms.txt
/sitemap.xml
/robots.txt
/admin/* 401/403 for non-admin
cache/content-type/CORS headers for discovery routes
```

## PR review checklist

Every PR states:

1. Spine link strengthened.
2. Source-mined backup files and ledger rows.
3. Module owner.
4. State/result/audit variants changed and dispatch points updated.
5. Idempotency key behavior.
6. Audit events written.
7. Projection/readback/repair behavior.
8. Security boundary touched.
9. Copy/discovery/SEO/GTM claims affected.
10. Commands run and exact result.

Reject if any answer is missing for non-trivial code.
