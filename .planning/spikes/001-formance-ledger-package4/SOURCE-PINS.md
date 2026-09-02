# Official source pins

| Component | Pin | Immutable evidence |
|---|---|---|
| Formance Ledger | `v2.4.12` | source commit `f43a7078e7e1b9f6a354307ef994431593bf57e0`; arm64 image `ghcr.io/formancehq/ledger@sha256:4d72bd5cbf0a83a0cce9b37ea96a376ba33197517e40b97d16c43c36753727df` |
| Formance TypeScript SDK | `@formance/formance-sdk@7.0.0` | isolated npm lockfile (added by gate 1) |
| PostgreSQL | `16-alpine` | arm64 image `postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685` |
| Node.js | `22.22.0` | local installed runtime |

## Vendored standalone configuration

`upstream/docker-compose.yml` is the `examples/standalone/docker-compose.yml`
configuration from the pinned Ledger source, reduced only by these required
security and scope edits:

1. Removed Gateway and Console because the spike starts Ledger only.
2. Removed the upstream hard-coded PostgreSQL password and uses local container
   trust inside the private Compose network; no host PostgreSQL port is exposed.
3. Added the official `migrate` command as a one-shot prerequisite because
   automatic schema upgrade is disabled.
4. Corrected the worker service to invoke the official `worker` command rather
   than inheriting the image's default `serve` command.

The upstream file SHA-256 is
`138149bfad80a5857d45a443eb685cadb867f56ea64e8459c1d9ecb43edfa3a8`.
`docker-compose.spike.yml` is the declarative overlay: it pins image digests,
binds the API to loopback, enables strict schema enforcement, and explicitly
disables auto-upgrade and experimental features.
