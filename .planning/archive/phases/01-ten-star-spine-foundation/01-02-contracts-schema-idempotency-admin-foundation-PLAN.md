---
phase: 01
plan: 02
slug: contracts-schema-idempotency-admin-foundation
status: ready-for-execution
wave: 2
depends_on: [01-01-substrate-and-guardrails]
requirements: [R2, R8, R9, R10]
created: 2026-06-27
---

# 01-02 — Contracts, Schema, Idempotency, Admin Foundation Plan

## Objective

Land the source-owned durable model, literal state unions, Convex schema/indexes, validators, operation-key idempotency, audit contract, admin authority model, lifecycle descriptor contract, and GTM activation state before any claim route can mutate production state.

## Authority Inputs

- `01-SPEC.md` R2, R8, R9, R10.
- `PHASE.md` PR02 tables and indexes.
- `01-PATTERNS.md` clusters 3, 8, 9, 10 and shared deep-module seam rules.
- `.planning/PROJECT.md` state contracts and public module interfaces.
- `.planning/ENGINEERING-STANDARDS.md` TypeScript, Convex, audit, admin, and testing standards.
- `.planning/SECURITY-SPEC.md` admin/security/audit/redaction model.
- Skills: `codebase-design`, `convex`, `convex-setup-auth`, `clerk-tanstack-patterns`, `tanstack-start-best-practices`.

## Scope

### In

- Domain-owned types/validators and Convex schema for Phase 1 only.
- Tables: `owners`, `businesses`, `businessContexts`, `businessServices`, `serviceCapabilities`, `claims`, `operationKeys`, `registryProjectionItems`, `registryProjectionAttempts`, `indexStatus`, `discoveryManifests`, `discoveryManifestAttempts`, `auditEvents`, `operatorControls`, `disputes`, `suppressionRules`, `adminMemberships`, `adminMembershipAuditEvents`, `abuseRateLimitBuckets`, `claimFingerprints`, `funnelEvents`, `ownerActivationState`.
- Required indexes from `PHASE.md` lines 230-262.
- `src/modules/{business,catalog,registry,discovery,security,observability,lifecycle,seo}/public.ts` seams with compile-time contracts only; no exported result variant may represent behavior that has not shipped.
- Operation key reserve/replay/reject semantics at the module level with tests.

### Out

- No public route behavior, no claim mutation flow, no registry projection execution, no discovery output generation.
- No future tables for payments, actions, request market, skills, hosted agents, voice/persona, MCP/OpenAPI/API keys, billing, or wallets.

## Implementation Steps

| ID | Change | Files | Acceptance |
|----|--------|-------|------------|
| 01-02-A | Define branded IDs, literal state unions, result unions, and shared result helpers without global validator dumping ground. | `src/modules/*/public.ts`, `src/modules/common/*` | Type tests reject invalid states and broad strings. |
| 01-02-B | Define Convex schema and required indexes. | `convex/schema.ts` | Convex codegen succeeds; index names match `PHASE.md`; no unapproved tables/fields. |
| 01-02-C | Add domain-owned validators and equality/type tests. | `src/modules/*/internal/*validators*.ts`, `tests/types/*` | Validators and domain types cannot drift; no duplicate literal lists. |
| 01-02-D | Implement operation-key state contract. | `src/modules/observability/internal/operation-keys.ts`, `convex/observability.ts`, unit tests | Same key + same hash replays; same key + different body rejects/audits; in-progress returns retryable state. |
| 01-02-E | Implement audit event and redaction contracts. | `src/modules/observability/internal/{audit,redaction}.ts`, `convex/observability.ts`, tests | Consequential events require actor, target, correlation ID, operation key, event ID, redacted payload/hash, before/after when state changes. |
| 01-02-F | Implement source-owned admin membership and role/action matrix skeleton. | `src/modules/security/internal/admin-authority.ts`, `convex/security.ts`, tests | First owner-admin bootstrap path is auditable; env/session alone never grants admin authority. |
| 01-02-G | Implement lifecycle descriptor-only moat. | `src/modules/lifecycle/public.ts`, `src/modules/lifecycle/internal/reference-vertical.ts`, tests | Exports held_money/external_authority/time_bound/proof_gap primitives and one descriptor; no workflow engine or execution fields. |
| 01-02-H | Add funnel/owner activation state contracts. | `src/modules/observability/internal/funnel.ts`, schema/tests | Activation state can represent publish, status readback, capability health viewed, share/interest, attribution, friction. |

## Product Design Pass

- **Primary user/job/object/outcome:** owner/admin roles are future users; object is source-owned state; outcome is authority and status truth that UI can render without collapsing into "live".
- **Reachable states:** all public/trust/index/discovery/first-request/capability/operator/admin states from `PROJECT.md` exist as typed states, including unavailable/degraded/stale/suppressed/contested.
- **User-visible consequence:** later UI can show precise next action because state variants are not broad strings.
- **Non-goal:** no screens are added in this PR beyond scaffold route fallout.

## Verification

```text
npm run typecheck
npm run check:convex-codegen
npm run test:types
npm run test:unit
npm run test:ts-standards
npm run test:imports
npm run test:source-mining
```

## Stop Conditions

- Any schema field implies money, bookings, callable tools, provider endpoints, request-market demand, or verified status without source evidence.
- Any browser or route-facing type uses generated Convex document types as domain contracts.
- Admin authority depends on env, Clerk session, or route guard without source-owned membership state.
- Operation-key behavior cannot be proven without durable state.
