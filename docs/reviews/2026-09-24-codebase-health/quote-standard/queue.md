# Convex root queue — 2026-09-24, HEAD `459cc674d` + uncommitted wave 7

6 depth-one non-test `convex/*.ts` roots exceed 200 scanner lines. Counts use `contents.split("\n").length` (including the final empty element for newline-terminated files); completed roots below 200 are excluded. This is a size-priority queue, not a fresh verdict on shared-core check 4.

[Protocol §5](../../../operations/convex-root-protocol.md) score = criticality (spine 3, projection/HTTP/other application 2, dev/admin 1) + failed checks (2 for oversized roots with inline depth; 1 for registration-only but oversized `capabilityProviderConnections.ts`) + 2 for a direct `src/` root importer + 60-day churn tier + 3 over its current exception pin. Historical criticality classification is retained; no listed root has a direct `src/` importer. Unproven check 4 is not counted. Churn uses `git log --since=60.days --format=%h -- <file> | wc -l`; tiers are 1–3 (tier 0), 4–6 (tier 1), 7+ (tier 2), with ties kept together. Sort is score descending, churn descending, name ascending. `—` means no pin.

| Score | Root | Lines / pin | Criticality | Failed checks | `src/` importer | 60d commits / tier | Over pin |
|---:|---|---:|---:|---:|---:|---:|---:|
| 8 | `convex/chatAnonymous.ts` | 290 / 213 | 2 | 2 | 0 | 6 / 1 | yes |
| 6 | `convex/chatTools.ts` | 529 / 529 | 2 | 2 | 0 | 24 / 2 | no |
| 6 | `convex/registry.ts` | 443 / 443 | 2 | 2 | 0 | 16 / 2 | no |
| 6 | `convex/capabilityProviderConnections.ts` | 277 / 277 | 3 | 1 | 0 | 10 / 2 | no |
| 6 | `convex/chatGenerate.ts` | 217 / 217 | 2 | 2 | 0 | 10 / 2 | no |
| 6 | `convex/chatShares.ts` | 402 / 402 | 2 | 2 | 0 | 7 / 2 | no |

Current over-pin root: `convex/chatAnonymous.ts` (290 / 213). No pin was raised. `convex/capabilityProviderConnections.ts` remains registration-only (29 RPCs); its 277 scanner lines are an explicit exception.
