# Phase 2 internal execution evidence

State: `IMPLEMENTING`

This ledger belongs only to Phase 2 implementation. It records source evidence,
hostile counterexamples, papercuts and later external-evidence assignments. It is
not an acceptance verdict.

## Frozen preflight

- Starting handoff: `d20d62d8255ee7a38ce7cb8f1c618b1e0393d4e0`.
- Accepted Phase 1 source ancestor:
  `ae284871d9d5bad40245182aefd6f2050d53b556`.
- Phase 1 verdict: `SOURCE_ACCEPTED_EVIDENCE_OPEN`.
- Working branch: `codex/ae-maturity-phase-2`.
- Phase 2 launch commit `7c84f8df3` was verified to change exactly
  `PHASE-1-LEARNINGS.md` and `PHASE-2-LAUNCH.md`, then cherry-picked as
  `cdd5acda7`.
- Housekeeping commit `b2040bd31` was verified to change exactly
  `HOUSEKEEPING.md`, `PROGRAM-OPERATIONS.md`, `PROGRAM-PAPERCUTS.md` and
  `PROGRAM-STATE.md`, then cherry-picked as `19fd59612`.
- Project checks use Node 22 from
  `/Users/joelchan/.nvm/versions/node/v22.22.0/bin`.
- The complete launch packet, frozen plan, root/leaf/phase gates, Phase 1 final
  acceptance and Ox output, Convex project rules, Unlazy/TDD/GSD execution rules,
  Convex authz/expert/reviewer/test/cron/verify rules and housekeeping contract
  were read before source work.

## Blast-radius inventory

The exact expanded path inventory is
`contracts/phase-2-blast-radius.json`. Its tracked non-test, non-generated
TypeScript/JavaScript universe contains 809 files with SHA-256
`aa3d4f2ac807790a88f6d54b55b34278c088cf7417525418a1da50902661ec3e`.

The current regex inventory measures 17 `agentAccessPrincipals` files, 7
`agentAccessGrants` files, 19 direct Convex identity files, 41 `process.env`
files, 56 Connection-concept files, 16 cron/scheduler files, 22
callback/webhook files and 79 reconciliation files. These narrower lexical counts
do not replace the launch packet's broader measured counts (827, 17, 8, 19, 37,
62, 21, 29 and 163 respectively). The integration driver owns the union of the
launch inventory, the current exact path inventory and every discovered real
surface; no count reduction narrows migration scope.

`convex/crons.ts` registers exactly ten jobs. All ten remain driver-owned and must
be explicitly bound to a workload Principal and one active Account context or to
a tested explicit public/system exemption.

## Frozen typed-port contract

All Phase 2 canonical services import Phase 1 `PrincipalRef`, `AccountRef` and
`AccountActionContext` from `src/modules/principal-account/public.ts`. They do not
derive canonical identity, ownership or Account context from Credentials, Clerk,
provider identifiers or request arguments.

### P2-01 delegation port

The context-local public API must expose generation-bound `DelegationGrant` and
`DelegationAuthoritySnapshot` values plus a transactional store/service for root
grant issuance, multi-hop child delegation, consequence-time authorization and
ancestry revocation. A child is the intersection of every ancestor's scopes,
resources, budget and strict expiry. Grant ancestry is acyclic, fully attributed
and generation-pinned. Revocation monotonically advances generation. New work is
admitted only against current server time; admitted work receives an immutable
snapshot for completion or reconciliation.

### P2-03 Connection port

The context-local public API must expose stable Connection and lease references,
Connection lifecycle state, authority/generation bindings and install, explicit
share, lease, refresh, revoke and delete operations. A lease binds the Connection
generation, owning Account, actor Principal, Grant generation and strict expiry.
Refresh/revoke/delete or Grant-generation change invalidates stale leases before
new effects. The new module is the canonical lifecycle to which existing
capability-supply adapters are migrated by the driver; it is not a second truth.

### P2-04 secret port

The context-local public API must expose a provider-neutral `SecretStore`, opaque
secret references/generations, JIT retrieval and two-phase rotation. The production
adapter is real Infisical Cloud HTTP behavior using replaceable OIDC machine-token
acquisition and short-lived tokens. Secret material exists only inside the
callback-scoped memory lease, never in Convex, environment projections, logs,
errors, evidence or snapshots. Rotation writes and validates a new generation
before an atomic pointer-advance request. Vault outage fails closed for new work.

### P2-02 authority-boundary port

Wave 2 may consume the Phase 1 Account registry and P2-01/P2-03 typed outputs. Its
public seam resolves a caller or workload into exactly one explicit Principal +
Account context, checks current delegation/Connection generation at each new
consequence, and emits a pinned admission snapshot. HTTP, MCP, CLI, callbacks,
workers, jobs, all crons and reconciliation use typed adapters over this seam. No
internal entry point receives ambient superuser authority.

### P2-05 recovery/security port

Wave 2 composes Phase 1 declared RecoveryPolicy and trusted succession facts with
P2-01 authority and P2-04 secret-canary contracts. Break-glass requires declared
threshold/delay/freeze state, replay-resistant canonical approval, two distinct
attributed operators, and a non-impersonating privileged action record. Freeze
never transfers ownership. Recovery proof is consumed once and remains audited.

## TDD seams

The frozen observable seams are each leaf's context-local `public.ts` service API,
the driver's shared authority-boundary adapters and the real production surface
composition. Tests proceed in vertical red/green slices through those public
interfaces. External Infisical HTTP/OIDC is the only mocked system boundary;
canonical domain collaborators are exercised through real in-memory stores or
integration adapters.

## Execution log

- Wave 0 preflight and inventories: in progress.
- Wave 1 P2-01/P2-03/P2-04: pending typed executor dispatch.
- Wave 1 driver integration: pending.
- Wave 2 P2-02/P2-05: pending.
- Phase integration, hostile verification, release and housekeeping: pending.

## Phase 2 papercuts

Phase-local intake is recorded here during implementation, then canonicalized into
`PROGRAM-PAPERCUTS.md` at Phase 2 close with category, evidence, consequence,
owner, owning gate and follow-up.

## Open external evidence

- Hosted Infisical OIDC, live vault retrieval/rotation and audit-stream evidence:
  external only; owner is the later hosted security/production evidence gate.
- Hosted Clerk/Convex Account isolation evidence: external only after source
  composition; owner is the later hosted security/production evidence gate.
- The Phase 1 live reset adapter proof remains owned by its later migration/runtime
  gate and is not reclassified as Phase 2 source evidence.
