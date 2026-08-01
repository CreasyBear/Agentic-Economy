---
name: ae-convex-guardrails
description: Use for AE Convex functions, schemas, schedulers, auth, storage, query cost, or codegen failures. Keep module ownership, bounded work, and source-versus-deployment proof exact.
---

# AE Convex guardrails

> **North star:** Tell your AI what you need. It finds the right business, compares real options, gets your approval, and moves the work through to completion. Businesses publish what they do once, then earn whenever agents bring them work.

**Hierarchy:** ambition → customer promise → executable journey → hidden controls → proof.

Read `convex/_generated/ai/guidelines.md` completely before editing Convex code;
it is the installed API authority. Also read `.planning/PROJECT.md`,
`UBIQUITOUS_LANGUAGE.md`, relevant ADRs, live source, and focused tests. If an
optional `AGENTS.md` exists, consult it.

## Own and bound state

Trace the public entrypoint, scheduled continuations, owning schema fragment,
indexes, auth derivation, growing reads, external effects, and tests.
`convex/schema.ts` composes tables; define domain tables in the owning
`src/modules/<domain>/internal/schema.ts` or `internal/convex-schema.ts`.
Use ordered indexes (`by_field1_and_field2`) and query fields in index order.
Keep high-churn or unbounded children out of parent documents.

Use indexed reads with `take`, pagination, `first`, or `unique`. Treat
`.collect()` as exceptional only with proven fixed-size data or a test adapter;
never use `.collect().length` for scalable counts. Scheduled work needs durable
progress, bounded batches, idempotent command identity, observable terminal
state, and backoff.

Derive identity with `ctx.auth.getUserIdentity()` and use `tokenIdentifier` for
ownership. Keep sensitive functions internal. Put Node-dependent code in a
dedicated `"use node";` action file and keep query/mutation imports free of
`node:*`. Public reads are bounded and cacheable; changing authority-bearing
state uses `no-store`.

## Direct proof

Run the focused transition test and `npm run typecheck`. For schema/module-graph
changes, run `npm run check:convex-codegen` once configured and authorized.
Inspect the first exact error: environment/control-plane failures are not
source proof, module-resolution errors follow transitive imports, and schema
errors require validator/index inspection. Local tests/codegen prove source
behavior and bundle/schema validity—not deployment, scheduler cessation, cost
containment, or hosted behavior.
