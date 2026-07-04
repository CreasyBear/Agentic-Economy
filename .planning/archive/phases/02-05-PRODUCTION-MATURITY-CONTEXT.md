# Phases 2-5 Production Maturity Context

**Gathered:** 2026-06-27
**Status:** Source context for P2-P5 planning

## Operating decision

Plan Phases 2-5 as one production system now, then execute in order. A completed phase is not a scaffold, placeholder, docs-only promise, or future surface reservation. It is live-app complete for its scope: source-owned state, real dependencies, env/key setup, tests, deploy/readback smoke, operator recovery, and no overclaiming runtime copy.

"No gates" means no runtime theatre. It does not mean no evidence. Evidence replaces status labels.

## Planning authorities

- `02-05-PRODUCTION-MATURITY-PLAN.md` is the cross-phase execution framing.
- `SECURITY-SPEC.md` is the P1-P5 security authority; phase plans must add to it, not bypass it.
- `GTM-READINESS.md` is the P1-P5 launch/claims/support authority; copy claims must cite live readbacks.

## Production spine

```text
P1 claim/publish/catalog/discovery/admin substrate
  -> P2 human inquiry + owner inbox + Resend/Novu-backed notification outbox
  -> P3 builder/agent read-only discovery + schema/docs/readbacks
  -> P4 one owner-approved protected action + provider/internal attempt + receipt/proof-gap
  -> P5 Autumn/Stripe paid activation rail + billing receipts + reconciliation
```

## Shared module seams

Use deep modules: small route-facing interfaces with source-owned behavior behind them. Routes adapt. Convex/state modules own authority, invariants, idempotency, and readbacks.

| Module seam | First phase | Interface purpose | Future pressure it must survive |
|---|---:|---|---|
| `publicCatalog` | P1 | Published service facts and public DTOs | P2 inquiry availability, P3 docs/schema, P5 selected paid-state facts |
| `ownerAuthority` | P1/P2 | Clerk principal -> source-owned owner/admin permission | P2 inbox, P4 approvals, P5 paid activation |
| `idempotentCommand` | P1 | Stable operation/correlation/idempotency semantics | P2 submit/reply, P4 propose/approve/attempt, P5 checkout/webhook/reconcile |
| `auditReadback` | P1 | Append-only reconstruction events and operator readbacks | Every consequential transition through P5 |
| `privacyProjection` | P1/P2 | Allowlisted public/private projections and redaction | P2 private messages, P3 docs, P5 provider/payment evidence |
| `notificationOutbox` | P2 | Durable Resend/Novu email workflow dispatch and readback for owner/customer notifications | P4/P5 may emit events later without owning channels |
| `developerDiscovery` | P3 | Read-only schema/docs/readbacks generated from source facts | P4 approval-required descriptors, P5 selected-rail descriptors only when true |
| `protectedAction` | P4 | Proposal/policy/owner decision/provider attempt/receipt | P5 money actions must not bypass authority posture |
| `billingRail` | P5 | Autumn/Stripe billing-platform adapter, webhook/readback, receipt, and reconciliation | Future Connect/x402/multi-rail only through explicit additional adapters |

## Cross-phase invariants

1. Browser input never supplies owner/admin/business authority.
2. Public projections are allowlisted builders, not row spreads.
3. Every retryable command has idempotency, correlation, typed replay, and same-key/different-body behavior.
4. Every public claim is generated from source-owned state and has a readback or it does not ship.
5. Every private payload has an explicit projection boundary and redaction scan.
6. Provider/orchestrator/webhook events are evidence, not authority.
7. Protocol files, docs, SDKs, OpenAPI, MCP, and manifests never mint capability.
8. Phase labels do not leak into runtime/source/product names.
9. No one-implementation adapter exists unless an external dependency actually varies now.
10. Full keys/dependencies are set up by the phase that needs them, with local/dev/prod env documentation and readback smoke.

## Production acceptance proof per phase

Each completed phase must provide:

- source-owned tables/functions/modules,
- route surfaces and user-visible paths,
- real dependency/provider/env/key setup where the phase needs it,
- compact and wide UI evidence for changed surfaces,
- unit/integration/E2E coverage for happy path, typed failure paths, authorization, idempotency, stale/duplicate/replay, redaction, and recovery,
- deploy/readback smoke against live configured dependencies or documented sandbox equivalents,
- operator readback/retry/no-repair path,
- copy/protocol/GTM scans proving no false claims,
- source-mining/import scans proving the backup was mined, not copied.

## Full-maturity gaps still left after P5

P5 completes one paid activation rail, not the whole possible company. Deliberate remaining scope:

- autonomous protected execution,
- broad action marketplace,
- multi-action catalog,
- Connect/x402/wallet/credits/request-market settlement,
- hosted agents,
- SDK/CLI/plugin ecosystem,
- multi-channel notification suite,
- merchant-origin UCP unless readback-proven,
- multi-region/SLO/load program beyond the required production proof for this app.

These are future products, not hidden prerequisites for P2-P5.
