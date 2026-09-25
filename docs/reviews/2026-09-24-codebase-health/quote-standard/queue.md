# Convex root queue — 2026-09-25, wave 9 closeout

**1** depth-one non-test `convex/*.ts` root exceeds 200 scanner lines (newline-inclusive `contents.split("\n").length`). This is a size-priority queue, not a fresh verdict on shared-core check 4. The 29-RPC root below is registration-only; its explicit 274-line pin is retained under [protocol §5](../../../operations/convex-root-protocol.md). No root exceeds its pin.

| Score | Root | Lines / pin | Criticality | Failed checks | `src/` importer | 60d commits / tier | Over pin |
|---:|---|---:|---:|---:|---:|---:|---:|
| 6 | `convex/capabilityProviderConnections.ts` | 274 / 274 | 3 | 1 (size only) | 0 | 10 / 2 | no |

No other oversized roots remain. `chatTools.ts` had zero RPCs and was deleted; `chatAnonymous.ts`, `chatGenerate.ts`, `chatShares.ts` and `registry.ts` are below 200 lines.
