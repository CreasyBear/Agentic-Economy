# Formance Ledger for Package 4

**Idea key:** `formance-package4-ledger`

**Status:** complete

**Decision:** `ADOPT`

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
- Stack `v3.2.10`, Ledger `v2.4.12`, Gateway `v2.3.1`, SDK `v7.0.0`,
  PostgreSQL 16, Node 22, and the SDK's stable `machine` interpreter only.
- The dirty `codex/package4-closure` worktree remains untouched.

## Ordered gates

1. Boot the official Ledger API and worker against PostgreSQL with strict
   schema enforcement and no experimental features.
2. Round-trip the bounded Package 4 startup range exactly through the public
   SDK models on Node 22. Retain out-of-range probes as known-limit evidence.
3. If and only if gate 2 passes, run the same SDK use in the supported Convex
   Node Action runtime.
4. If and only if both exactness gates pass, test native booking semantics,
   idempotency, contention, recovery, pagination, backup, restore, and upgrade.

All four gates passed. See `PR2-EVIDENCE.md`, `PR3-EVIDENCE.md`, and
`PR4-EVIDENCE.md`.

Package 4 supports only exact values at or below JavaScript's safe-integer
ceiling while using SDK v7. Values above that range are unsupported and must
never reach the SDK. The existing 30-digit probe documents a future SDK limit;
it is not a startup product requirement. Inability to run the supported range
in Convex or failure of the remaining semantic and operational gates still
blocks the implementation cutover.

## Reproduction

All commands are run from this directory. The Docker Compose project is
`ae-p4-formance-spike`; only `postgres`, `migrate`, `ledger`, `worker`, and
the user-approved official `gateway` are started. The named volume is
`ae-p4-formance-spike-postgres` and is disposable.

```sh
docker compose -f upstream/docker-compose.yml -f docker-compose.spike.yml \
  up -d postgres migrate ledger worker gateway
```

```sh
npm ci --ignore-scripts
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" \
  npm run test:supported-range

PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" \
  npm run test:lifecycle

PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" \
  npm run test:contention

PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" \
  npm run test:recovery
```

The supported-range command exits zero while retaining the out-of-range
observations. `npm run test:exactness` retains the original unbounded test and
exits non-zero.

The isolated Convex Action proof is reproducible with:

```sh
PATH="$HOME/.nvm/versions/node/v22.22.0/bin:$PATH" \
  npx convex dev --once --run exactness:run \
  --typecheck=disable --tail-logs disable
```

It provisions only an anonymous local deployment. Remove `.convex/`,
`.env.local`, and `convex/_generated/` after the proof. See `PR1-EVIDENCE.md`
and `DECISION.md` for the accepted bounded range. `PR2-EVIDENCE.md` records
the native commercial lifecycle and the intentionally narrow Action mapping
required by the current official schema and stable interpreter.
`PR3-EVIDENCE.md` records the 100-way scarcity test and restart recovery.

## Scope after a decision

`ADOPT` now permits the separate Package 4 cutover. The cutover removes the
paused Convex journal atomically. This spike itself changes neither application
implementation nor the original dirty Package 4 worktree.
