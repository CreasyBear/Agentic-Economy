# Formance Ledger for Package 4

**Idea key:** `formance-package4-ledger`

**Status:** in progress

**Decision:** pending

## Hypothesis

Formance Ledger v2.4.12, used only through `@formance/formance-sdk` v7.0.0,
can be the authoritative Package 4 booking and balance system. Agentic Economy
would retain authority, policy, Commitment, command, status, and reconciliation
state in Convex while delegating booking arithmetic, balances, reservations,
reversals, references, and ledger idempotency to Formance.

## Hard constraints

- No application or root dependency changes.
- No custom HTTP, response parser, SDK patch/fork, raw-response access, or
  direct PostgreSQL product reads.
- No custom posting store, balance projection, ledger idempotency, retry
  engine, workflow engine, or free-form production Numscript.
- Stable Ledger `v2.4.12`, SDK `v7.0.0`, PostgreSQL 16, Node 22, and the
  SDK's stable `machine` interpreter only.
- The dirty `codex/package4-closure` worktree remains untouched.

## Ordered gates

1. Boot the official Ledger API and worker against PostgreSQL with strict
   schema enforcement and no experimental features.
2. Round-trip every Package 4 amount boundary exactly through the public SDK
   models on Node 22.
3. If and only if gate 2 passes, run the same SDK use in the supported Convex
   Node Action runtime.
4. If and only if both exactness gates pass, test native booking semantics,
   idempotency, contention, recovery, pagination, backup, restore, and upgrade.

Silent rounding, missing exact readback, SDK validation failure for bigint
strings, or inability to run the SDK in Convex is an immediate `REJECT`. Later
gates are not run after a hard-gate failure.

## Reproduction

All commands are run from this directory. The Docker Compose project is
`ae-p4-formance-spike`; only `postgres`, `migrate`, `ledger`, and `worker` are
started. The named volume is `ae-p4-formance-spike-postgres` and is disposable.

```sh
docker compose -f upstream/docker-compose.yml -f docker-compose.spike.yml \
  up -d postgres migrate ledger worker
```

The exact SDK command will be recorded with the gate evidence after the
isolated manifest and lockfile are installed.

## Scope after a decision

`ADOPT` permits a separate Package 4 cutover that removes the paused Convex
journal atomically. `REJECT` permits resuming the Convex ledger only after the
buyer AUD sale and Provider USDC cost are separated. This spike itself changes
neither implementation.
