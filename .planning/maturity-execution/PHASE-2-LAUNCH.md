# Phase 2 launch packet: authority, connections and secrets

State: **PREPARED, NOT AUTHORIZED TO LAUNCH**

Phase 2 may start only when the fresh Phase 1 repair acceptance task commits a
verdict of `SOURCE_ACCEPTED` or `SOURCE_ACCEPTED_EVIDENCE_OPEN` against exact
candidate `71e2163091ad5cd15259821f82730ebaf6777abf`. Any different candidate
requires a new acceptance run. `CHANGES_REQUIRED`, a missing report, a dirty base
or an uncommitted verdict fails closed.

## Authoritative inputs

The Phase 2 task reads these files completely before any source work:

- `PLAN.md`
- `PHASE-1-LEARNINGS.md`
- `PHASE-1-BLAST-RADIUS.md`
- the committed fresh Phase 1 repair acceptance report and Ox output
- `gates/leaf-P2-01.md` through `gates/leaf-P2-05.md`
- `gates/phase-2.md`
- `AGENTS.md` and `convex/_generated/ai/guidelines.md`

No milestone, roadmap, requirements set or replacement architecture plan may be
created. The existing contract and gates are complete. The task uses Unlazy's
orchestrated workflow, typed GSD executor roles and an independent verifier without
manufacturing GSD roadmap state.

## No-discretion execution rules

1. Set one task goal: implement and independently verify Phase 2 only; stop before
   Phase 3/5/6 fan-out.
2. Do not ask the user to choose architecture, naming, tenancy, recovery, secrets,
   delegation or Connection semantics already frozen in `PLAN.md`.
3. Do not infer identity, Account or ownership from Clerk, Credentials, legacy
   owners, provider identifiers or request arguments.
4. Do not accept authorization-, approval-, receipt- or lease-shaped request data
   as trusted provenance. Resolve canonical facts and consume/reconcile them.
5. Do not edit production code outside assigned ownership. If overlap is discovered,
   both workers stop and the integration driver repairs ownership first.
6. Leaves do not edit `convex/schema.ts`, `convex/http.ts`, generated files, root
   scripts/config, public cross-context barrels or legacy surface adapters.
7. Source acceptance may leave named live Infisical, hosted Clerk, audit-stream or
   other external evidence open at its owning later gate. It may not leave stubs,
   fake production adapters, source bypasses or untested invariants.
8. Use Node 22 for every project check:
   `PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH`.
9. Every changed critical authority, Connection, secret and recovery path requires
   100% statements, branches, functions and lines.
10. The phase implementer cannot grant final acceptance. It stops at an exact clean
    ref for a new Standards/Spec/Ox acceptance task.

## Measured blast radius

Measured on Phase 1 repair candidate `71e2163091`:

- 827 non-test, non-generated TypeScript/JavaScript production files inspected.
- 17 production files reference `agentAccessPrincipals`.
- 8 production files reference `agentAccessGrants`.
- 19 production files call `ctx.auth.getUserIdentity()`.
- 37 production files read `process.env`.
- 62 production files touch provider-Connection concepts.
- 21 production files touch cron/scheduler concepts.
- 29 production files touch callback/webhook concepts.
- 163 production files touch reconciliation concepts.
- `convex/crons.ts` registers ten scheduled jobs that require explicit workload
  Principal and Account context or an explicit public/system exemption.

Consequences:

- P2-02 is a source-surface migration, not only a new helper module.
- P2-03 must consolidate existing provider-Connection semantics behind the new
  canonical context; it must not create an unrelated second Connection truth.
- P2-04 may store secret references and generations in Convex, never material.
- P2-05 must reuse Phase 1 Account recovery facts; it may not introduce parallel
  ownership-transfer authority.

## Frozen ownership

| Execution unit | Exclusive production ownership | Exclusive test ownership | Forbidden overlap |
|---|---|---|---|
| P2-01 delegation | `src/modules/authority/delegation/**` | `tests/unit/authority/delegation/**`, `tests/maturity/leaf-P2-01.test.ts` | Phase 1 Account/Principal registries, root schema, legacy grants |
| P2-02 authority context | `src/modules/authority/context/**`, `src/lib/server/authority-boundary/**` | `tests/unit/authority/context/**`, `tests/maturity/leaf-P2-02.test.ts` | Public route/Convex/MCP/CLI/job/cron composition; driver owns wiring |
| P2-03 Connections | `src/modules/connections/lifecycle/**` | `tests/unit/connections/lifecycle/**`, `tests/maturity/leaf-P2-03.test.ts` | Existing capability-supply provider-Connection adapters; driver owns migration |
| P2-04 secrets | `src/modules/secrets/**` | `tests/unit/secrets/**`, `tests/maturity/leaf-P2-04.test.ts` | Environment sync, Connection lifecycle, root dependencies/config |
| P2-05 recovery/security | `src/modules/authority/recovery/**` | `tests/security/maturity/**`, `tests/maturity/leaf-P2-05.test.ts` | Phase 1 recovery ownership facts, delegation core, staff composition |
| Integration driver | local schema composition, `convex/schema.ts`, `convex/http.ts`, generated files, public barrels, root scripts/config, legacy adapters, HTTP/MCP/CLI/callback/job/cron/reconciliation wiring, phase tests/docs | cross-leaf integration, generated isolation matrix, release and acceptance handoff | No leaf may edit these files |

The integration driver records the exact expanded file inventory before fan-out.
An unlisted shared file remains driver-owned.

## Dependency waves

### Wave 0: launch preflight

- Verify the committed Phase 1 acceptance verdict and exact accepted ref.
- Create Phase 2 leaf and integration execution ledgers before source work.
- Remeasure the blast radius; changes from the counts above are evidence, not an
  invitation to revise scope.
- Freeze typed ports among delegation, context, Connections, secrets and recovery.

### Wave 1: independent canonical cores

Run P2-01, P2-03 and P2-04 as fresh typed executors with disjoint ownership.

- P2-01 implements multi-hop monotonic narrowing, cycle rejection, server-time
  expiry, generation revocation and complete actor/subject attribution.
- P2-03 implements install, explicit sharing, lease, refresh, revoke and delete;
  stale/revoked generations cannot begin effects.
- P2-04 implements a provider-neutral `SecretStore`, production Infisical Cloud
  adapter, OIDC short-lived authentication, JIT memory-only retrieval, two-phase
  rotation and fail-closed provider outage behavior.

The driver integrates local schema/ports after all three leaf gates are rerun.

### Wave 2: consumers of the canonical cores

Run P2-02 and P2-05 as fresh typed executors after Wave 1 integration.

- P2-02 centralizes Principal + Account + Grant admission and supplies typed
  adapters for HTTP, MCP, CLI, callbacks, workers, jobs, crons and reconciliation.
- P2-05 composes declared Account recovery, dual-attributed break-glass, freeze
  without transfer, generated isolation tests and secret-canary proof.

The driver then wires every measured production surface. No surface is exempt by
omission: exemptions must be explicit public/system contracts with tests.

## Required counterexamples

At minimum, the Phase 2 suite must attempt and reject:

- child Grant scope, budget, expiry or resources wider than any ancestor;
- delegation cycles, stale generations, revoked ancestors and expiry races at the
  consequence point;
- Credential, Clerk identity or request argument used as resource owner;
- active stranger, wrong Account, missing workload context and internal superuser;
- callback/job/cron/reconciliation invocation without explicit Principal + Account;
- stale Connection lease after refresh, revoke, delete or Grant generation change;
- secret material in Convex rows, logs, errors, environment projections, test
  snapshots or audit payloads;
- vault outage admitting new consequential work;
- rotation pointer advance before the new generation validates;
- single-operator break-glass, operator impersonation, freeze implying transfer and
  recovery proof replay;
- symlink/ignored-artifact or prepared-workspace contamination of release evidence.

Every exploit found during implementation becomes a retained regression test.

## Integration and completion gates

The Phase 2 driver must prove:

- all 35 leaf gates and all 6 phase gates independently report `ALL MET` with zero
  operational `ABANDON` entries;
- the generated protected-surface matrix covers HTTP, MCP, CLI, callbacks, workers,
  jobs, all ten crons and reconciliation entry points;
- no legacy direct-resource, Clerk-owner, Credential-owner or implicit-superuser
  path bypasses the canonical boundary;
- property/state-machine tests cover delegation narrowing, cycles, generation,
  revocation, expiry and Connection lifecycle races;
- secret canaries never leave the vault boundary in source/integration tests;
- the exact Node 22 `npm run test:release:source` passes from clean source without
  inherited ignored artifacts;
- external-only evidence is named with owner and eventual gate rather than used as
  an ambient source blocker;
- an independent verifier finds no source defect;
- the task hands off an exact clean ref, measured counts and risks, then stops.

After internal completion, the parent creates a new context-independent task to
rerun validation, Standards/Spec review and an Ox red-team. Phase 3, Phase 5 and
Phase 6 remain blocked until that task returns `SOURCE_ACCEPTED` or
`SOURCE_ACCEPTED_EVIDENCE_OPEN`.
