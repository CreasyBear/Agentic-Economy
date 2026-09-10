# PR 4 evidence: operations and final decision

## Result

`PASS`

The spike decision is `ADOPT`. All required semantic and operational gates
passed inside the isolated stack using official components and tools.

The original `codex/package4-closure` dirty manifest still hashes to
`1d00104ce935329732fd37a029be61152f14f189e9469ea7f93debd02461e12b`,
exactly matching the pre-spike baseline. No application file changed.

## Scale and pagination

The operations proof seeded 10,000 named-template bookings through official
atomic bulk requests, then traversed them with native cursor pagination:

```text
transactions       10,000
unique references  10,000
page size           15 (official endpoint maximum)
pages               667
pagination time     1.92 seconds
```

Exact-reference lookup, schema readback, balance readback, and idempotent replay
all passed. The same checks passed after a PostgreSQL restart.

## Backup and restore

Only PostgreSQL's official tools were used:

1. `pg_dump -Fc` produced a backup inside the named disposable PostgreSQL
   container.
2. Ledger, worker, and Gateway were stopped.
3. The disposable `ledger` database was rebuilt.
4. `pg_restore` restored the backup.
5. Ledger's official `migrate` command ran.
6. Ledger, worker, and Gateway restarted healthy.
7. The 10,000-reference pagination, schema, balance, exact-reference, and
   idempotency checks all passed again.

No product read queried PostgreSQL directly. PostgreSQL access was limited to
the approved backup/restore rehearsal.

## Version upgrade

A separate named volume rehearsed the official upgrade:

```text
Ledger v2.4.11
  sha256:f6a7955a0a29ecb9890f955fd578d47b4649276dcd6cdb613ad5376fb6c8b43c
        ↓ official migrate command
Ledger v2.4.12
  sha256:4d72bd5cbf0a83a0cce9b37ea96a376ba33197517e40b97d16c43c36753727df
```

Ten pre-upgrade bookings retained their schema, balances, references, and
idempotency after the upgrade. The upgrade stack used the same pinned Gateway
and PostgreSQL images as the main spike.

## Health, metrics, and diagnostics

- Official Ledger, worker, Gateway, and PostgreSQL health checks passed.
- Worker, Ledger API, and PostgreSQL restarts preserved readback.
- Official in-memory OpenTelemetry metrics reported Ledger v2.4.12 service and
  database query timing without adding a collector to the spike.
- The final 2,000-line service-log scan found no authorization header, bearer
  token, Stripe key, wallet secret, mnemonic, payment signature, client secret,
  or password assignment.
- Docker Compose remains development/CI-only.

## Deployment and cost disposition

### Development and deterministic CI

Use the pinned official images locally with the named disposable stack. This
has no Formance licence charge; the open-source core is MIT licensed.

### Startup production

Do not deploy this Compose topology. OSS production requires Kubernetes,
managed PostgreSQL, private networking, a maintained authentication gateway,
backups/restores, upgrades, monitoring, and on-call ownership. Those operating
costs are real even though the licence is free.

The current Formance pricing page describes Enterprise as an annual custom
quote. Formance's published 2026 comparison material states a self-hosted
Enterprise starting point of USD 120,000/year; Private Cloud remains custom.
Private Cloud includes Formance-managed single-tenant infrastructure, support,
authentication, backups, and an SLA. Australian hosting/residency is not
proven by the public cloud-region list, which currently lists US, EU, and
Singapore-on-request. Obtain contractual Australian-region and residency
evidence before selecting it for production.

For the current no-user startup phase:

1. adopt OSS Formance for local development, deterministic CI, and the
   Package 4 application cutover;
2. keep all production money and mainnet effects disabled;
3. compare a managed OSS deployment with a Formance Private Cloud quote before
   the first real-value production launch; and
4. never expose the unauthenticated local Gateway publicly.

Official references:

- [Formance pricing](https://www.formance.com/pricing)
- [Deployment overview](https://docs.formance.com/deploy/overview)
- [Cloud regions](https://docs.formance.com/deploy/cloud/overview)
- [Ledger backup guidance](https://docs.formance.com/deploy/self-hosted/backups)
- [Ledger schema and templates](https://docs.formance.com/modules/ledger/working-with/ledger-schema)
- [Filtering and cursor pagination](https://docs.formance.com/modules/ledger/working-with/filtering-queries)

## Final architecture

```text
Convex
  authority + policy + Commitment + durable command lifecycle
        │
        ▼
private existing money Action
  closed Formance command mapping + supported-range guard
        │
        ▼
official Formance TypeScript SDK
        │
        ▼
Formance
  named bookings + balances + reservations + reversals

Stripe / CDP / x402
  external settlement evidence and existing submission fences
```

No custom ledger, client, parser, retry engine, projection engine, or workflow
engine was introduced.

## Cutover authorization

The separate Package 4 cutover may now:

1. add the official SDK at the existing money Action boundary;
2. install the approved immutable schema;
3. replace and remove the four paused Convex journal/projection tables in the
   same verified no-user cutover;
4. route funding and managed-Call reservations through named templates and
   native atomic bulk; and
5. retain Convex only for domain evidence, frozen document snapshots,
   authority, command state, and reconciliation ownership.

Dual writes, compatibility storage, and a second monetary authority remain
prohibited.
