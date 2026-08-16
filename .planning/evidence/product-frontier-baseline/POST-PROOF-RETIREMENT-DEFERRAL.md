# Post-proof historical / schema retirement — deferred

Batch 6 of Product-Frontier Cleanup is **deferred** until gateway hosted proof
and settlement source work complete (or a storage/compliance forcing function).

## Must retain until approved

| Surface | Path | Rule |
| --- | --- | --- |
| HTTP 410 retirement | `src/modules/routing-kernel/retirement.ts`, `convex/http.ts` | Keep exact 410 behaviour |
| Live MCP | `src/routes/mcp.ts` | Never conflate with retired Convex `/mcp` |
| Historical readback | `convex/routingKernelV1History.ts` | Export before schema change |
| Quarantined tables | `src/modules/routing-kernel/internal/convex-schema.ts` (~44 tables) | Count/checksum + retention approval |
| Project-spine tables | `src/modules/project-spine/` | Soft-retire after WorkTree successor characterization |

## Stop / go

**Stop (do not drop tables) when:**
- Tier C hosted gateway proof is blocked or failing
- Retention/compliance approval is missing
- Per-table export checksums are incomplete
- Any writer, cron, workflow, or required readback still references the table

**Go (separate deployments) when:**
1. Soft-retirement deployment with no writers
2. Export + approval evidence committed under `.planning/evidence/`
3. Table-drop deployment
4. Intentional update of kernel-retirement / product-frontier manifests + SHA guards
5. Codegen + kernel-retirement + routing/import + schema integration + conformance + full source gate

## Intentional non-action this cleanup

No routing-kernel table drops, no project-spine deletion, no React Email removal,
and no `@tanstack/ai` native schema migration unless a forcing function appears.
