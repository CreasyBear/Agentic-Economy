---
name: ae-convex-guardrails
description: Use for AE Convex functions, schemas, schedulers, auth, storage, query cost, or codegen failures. Apply the generated Convex rules, module-owned schema pattern, bounded-work controls, and source-versus-deployment proof boundary.
---

# AE Convex guardrails

Read `convex/_generated/ai/guidelines.md` completely before editing Convex code.
It is the API authority for the installed Convex version. This skill adds AE's
repository and operating constraints.

## Loop

1. **Trace.** Read the public entrypoint, every scheduled continuation, the
   owning schema fragment, indexes, auth derivation, and focused tests. Inventory
   every query that can grow and every external effect.
2. **Bound.** Put tables in the owning module's schema fragment and compose them
   in `convex/schema.ts`. Use indexed reads with `take`, pagination, `first`, or
   `unique`; isolate high-churn child rows. Give scheduled work an explicit stop
   condition, bounded batch, idempotent command identity, and observable state.
3. **Contain.** Derive identity with `ctx.auth.getUserIdentity()` and use
   `tokenIdentifier` for ownership. Keep sensitive functions internal. Put a
   Node-dependent action in a dedicated file beginning with `"use node";`; that
   file exports actions only. Keep modules imported by queries and mutations
   free of `node:*`.
4. **Prove locally.** Run the focused test for the changed transition, then
   `npm run typecheck`. For schema or Convex module-graph changes, run
   `npm run check:convex-codegen` once the environment is configured and a
   control-plane call is authorized. This command disables TypeScript checking.
5. **State the evidence level.** Local tests and dry-run codegen prove local
   source behavior and bundle/schema validity. They do not prove deployment,
   scheduler cessation, production cost containment, or hosted behavior.

The loop is complete only when every changed table, index, scheduled edge,
authentication decision, growing read, and external effect is accounted for,
and the earliest unproven boundary is named.

## Schema ownership

`convex/schema.ts` is a composition root. Define tables in the owning
`src/modules/<domain>/internal/schema.ts` or `internal/convex-schema.ts`
fragment, export a `*Tables` object, and spread it into the root. Do not put new
domain tables inline in the root or let a route own them.

Name indexes `by_field1_and_field2` in field order and query fields in that
order. Do not store an unbounded or high-churn child collection in a parent
document.

## Cost and scheduler safety

- Treat `.collect()` as an exception requiring a proven fixed-size table or
  test-only adapter. Slicing after `collect()` is still an unbounded read.
- Never use `.collect().length` for a scalable count; maintain a transactional
  counter when an exact count is required.
- A self-rescheduling function must make durable progress toward termination.
  A zero-delay retry without a terminal state, attempt bound, or backoff is a
  cost amplifier.
- Public crawler and discovery reads need bounded database work plus appropriate
  cache headers. Authenticated, authority-bearing, and changing execution state
  uses `no-store`.
- During a suspected cost incident, inspect source and local tests first. Do not
  repeatedly run codegen, seed commands, functions, or hosted probes. One-shot
  local containment is not active until the relevant deployment is verified.

## Failure diagnosis

Read the first exact error:

- Missing deployment/env, DNS, telemetry, or control-plane failure: environment,
  not source proof.
- A module-resolution or Node API error: follow the named Convex function's
  transitive imports and isolate Node code as above.
- `convex/schema.ts` or a module fragment: inspect validators and index names,
  then run `tests/unit/schema/convex-schema.test.ts`.
- TypeScript errors: `npm run typecheck`; codegen deliberately will not find
  them.

Use `rg`, not a one-file grep, when tracing transitive `node:*`, `.collect()`,
or `ctx.scheduler` risks.
