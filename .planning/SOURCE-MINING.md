# Source-Mining Contract

**Purpose:** use `Agentic-Economy-Backup` without copying its coupling.

## Rule

No implementation PR may copy backup code unless the source-mining ledger names:

1. backup source file,
2. invariant kept,
3. implementation rejected,
4. fresh module seam,
5. tests rewritten against that seam,
6. banned imports/symbols verified absent.

If this ledger is missing, implementation stops.

Phase 1 seed ledger: `source-mining/phase-1-ledger.md`.

## Required ledger shape

| Fresh module | Backup evidence | Keep | Cut | Fresh seam | Test to write | Banned imports/symbols |
|---|---|---|---|---|---|---|
| business | `convex/claimPublishing.ts`, claim routes | no-ABN T0 publish, source-owned audit | route-local business rules, silent index miss | `claimBusiness`, `publishBusiness` Convex mutations | no-ABN claim, idempotent publish, wrong-owner reject | old claim route imports, phase names |
| registry | `src/lib/registry/directory/*`, `src/lib/search/meilisearch.ts` | public projection, index-gap readback | Meilisearch-first dependency, warning-only sync | `syncBusinessProjection`, projection attempts | forced adapter failure + retry | direct search writes from routes |
| discovery | `src/lib/registry/discovery/ucpManifest.ts`, `src/routes/$slug.ucp.ts` | generated UCP-shaped projection, version pinning | payment handlers, placeholder MCP tools, dead schema URLs, `.well-known` overclaim | `buildUcpManifest`, `pathKind` fallback | valid/degraded/suppressed manifests | `payment_handlers`, `buildMcpToolDefinitions` in Phase 1 |
| lifecycle | `src/lib/registry/lifecycle/*` | held-money, external-authority, time-bound, proof-gap primitives | runtime engine, vertical workflows | descriptor-only typed contract | descriptor tests, no executable claims | workflow/runtime imports |
| observability | Phase 35 validation, logger split | redaction, visible gaps | Node-only imports in Convex graph | `emitAuditEvent`, `redactLogValue`, gap reads | redaction + Convex-safe import test | Node builtins in Convex-safe files |
| security/admin | backup admin membership patterns, source-owned standards | durable admin role/grant/revoke audit | env-only admin authority | `requireAdmin`, admin memberships | active/revoked/admin-denied tests | env-only role checks |

## Banned backup surfaces in Phase 1

Implementation scans must fail on new runtime paths or imports containing:

```text
skills
request-market
requestMarket
expert
hosted-agent
hostedAgent
voice
persona
benchmark
leaderboard
wallet
credits
billing
stripe
x402
payment_handlers
protectedActions
proposeAction
actionGateway
MCP tool catalog
OpenAPI service descriptor
```

Allowed only in `.planning` future-gate prose and tests that assert absence.

Approved negative DTO flags (`callable: false`, `paymentRequired: false`) are allowed only in public catalog/discovery schemas and tests. Scans must fail on truthy/executable usage, payment-required flow claims, or public copy that implies callable/payment capability.

## Source-mining workflow

Before coding a module:

```text
1. Read the backup evidence named in this file and the current Phase 1 plan.
2. Add/update the ledger row in the PR description or local source-mining note.
3. Extract invariants, not folder shape.
4. Implement the fresh seam.
5. Write tests at the fresh seam.
6. Run banned import/symbol scan.
```

## Acceptance gate

`test:imports` or `test:source-mining` must prove:

- no banned backup directories exist in fresh runtime source,
- no direct import from backup path exists,
- every copied or adapted invariant has a ledger row,
- Phase 1 routes import only public module seams,
- no phase-numbered runtime names exist.
