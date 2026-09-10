# PR 0 evidence — official stack boot

**Executed:** 2026-09-02

**Host architecture:** Apple arm64

**Docker Engine:** 29.1.3

## Result

`PASS`

- PostgreSQL 16 became healthy in the named disposable volume.
- The official `ledger migrate` command completed successfully before either
  long-running service started.
- Ledger API ran the image's default stable `serve` command.
- The worker ran the official `worker` command.
- `GET /_healthcheck` returned:

```json
{"storage-driver-up-to-date":"OK"}
```

- `GET /_info` identified Ledger `v2.4.12`, PostgreSQL storage, strict schema
  enforcement, no ledgers, and no experimental features:

```json
{
  "data": {
    "server": "ledger",
    "version": "v2.4.12",
    "config": {
      "storage": {"driver": "postgres", "ledgers": []},
      "schemaEnforcementMode": "strict"
    },
    "experimentalFeatures": null
  }
}
```

Only `postgres`, `migrate`, `ledger`, and `worker` were created. PostgreSQL
has no host port; Ledger is bound to `127.0.0.1:3068`. Gateway, Console,
Payments, Wallets, Flows, Reconciliation, NATS, and experimental interpreters
are absent.

## Command

```sh
docker compose -f upstream/docker-compose.yml -f docker-compose.spike.yml \
  up -d postgres migrate ledger worker
```

The source worktree manifest still hashes to
`1d00104ce935329732fd37a029be61152f14f189e9469ea7f93debd02461e12b`.
