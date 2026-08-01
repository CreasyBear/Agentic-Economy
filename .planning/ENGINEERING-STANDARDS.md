# Engineering Standards — Agentic Economy

**Status:** implementation constitution.
**Audience:** senior SWE / staff SWE.

## Prime directive

Build toward the north star: tell an AI what is needed, find the right
business, compare options, obtain approval, and carry work to completion;
businesses publish once and earn when agents bring work.

**Hierarchy:** ambition → customer promise → executable journey → hidden
controls → proof.

Treat `.planning/PROJECT.md` as destination authority, live source as current
behavior, `UBIQUITOUS_LANGUAGE.md` as vocabulary, and relevant ADRs as seam
contracts. A capability gap is implementation work. Cut anything that adds no
customer journey, source-owned control, or proof.

## Required skills and seams

Use the smallest relevant skill and existing source seam:

| Boundary | Required discipline |
|---|---|
| Action/module | registered action, module owner, thin host, focused contract test |
| Identity/authority | principal-bound exact consequence, expiry, revocation, refusal |
| Payment/effect | server custody, ceiling, attempt, idempotency, reconciliation |
| Convex | module-owned schema, bounded reads, auth-derived identity, codegen |
| Human/machine surface | customer outcome in human copy; exact descriptors in machine output |
| Verification | fastest executable transition, direct response/readback |

Optional local guidance is consulted only when the file exists.

## Theatre detector

Reject claims without their semantic proof:

- production readiness without named executable gates;
- trust without a source owner, trust tier, and evidence;
- callable or payment capability without the actual adapter, authority, and
  intended-surface behavior;
- customer value without the named workflow and supply evidence.

Documents should state an invariant, interface, state machine, failure mode,
acceptance gate, runbook, or decision record. Do not turn them into repeated
checklists.



## Source authority

- `.planning/PROJECT.md` owns state variants, module interfaces, and durable
  model.
- Domain specs own specialized gates when present; this file defines engineering
  process and enforceable standards.
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

Follow `AI-SPEC.md`. Every public projection uses source-owned allowlists,
bounded work, suppression, exact route/schema behavior, and the appropriate
cache/no-store policy. Machine descriptors may name callable, payment, MCP,
OpenAPI, or UCP-shaped surfaces when live source and intended-surface tests
provide them; they state actual effects, authority, evidence, replay, and
recovery. A route or registration alone is not proof of reachable supply.

Every advertised URL and public JSON route resolves in a focused check or is
omitted. Human pages lead with the customer task and next action; any boundary
appears at the decision it changes.

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

## Import and source-mining gates

`test:imports` / `test:source-mining` protect ownership and leakage:

- routes do not import provider SDKs or module private implementation;
- modules do not import routes or another module's private files;
- runtime does not import `.planning`, phase-numbered runtime names, or backup
  paths;
- provider credentials and effect adapters stay behind registered source-owned
  seams.

Technical vocabulary is not a violation. The check is architecture and
reachability—not a universal word ban.

## Testing standard

Run the narrowest check for the changed transition, then expand only over
boundaries it crosses:

```text
domain/action: affected unit or integration test
HTTP/host: focused response inspection
Convex schema/function: focused test, typecheck, authorized codegen
module ownership: test:imports
human/assistant copy: test:ui-contract and rendered readback
discovery/SEO: test:seo and serialized readback
journey: focused Customer Request/development smoke
```

Do not use a broad suite as first diagnosis. Tests assert behavior, effects,
authority, refusal, uncertainty, evidence, and recovery; they do not freeze
marketing prose. Static plans, generated maps, and reports orient the work but
do not prove runtime behavior.

Inspect a named deployed revision only when the task requires hosted evidence.
Record the exact command and earliest failure; unrelated failures are not a
repository-wide gate.

## Review record

Every non-trivial change records only:

1. source owner and boundary touched;
2. state/effect/authority/idempotency/recovery behavior changed;
3. projection/readback or repair behavior;
4. focused commands and exact result.

Review stops when the changed seam is proven or its earliest reproducible
blocker is recorded.
