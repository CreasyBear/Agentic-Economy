# Official source pins

| Component | Pin | Immutable evidence |
|---|---|---|
| Formance Ledger | `v2.4.12` | source commit `f43a7078e7e1b9f6a354307ef994431593bf57e0`; arm64 image `ghcr.io/formancehq/ledger@sha256:4d72bd5cbf0a83a0cce9b37ea96a376ba33197517e40b97d16c43c36753727df` |
| Formance Ledger upgrade source | `v2.4.11` | arm64 image `ghcr.io/formancehq/ledger@sha256:f6a7955a0a29ecb9890f955fd578d47b4649276dcd6cdb613ad5376fb6c8b43c`; used only for the disposable upgrade rehearsal |
| Formance Stack | `v3.2.10` | signed source commit `892837f10b2b9f4a8aeb6a96fe7a9d6aa802b056`; component manifest binds Ledger `v2.4.12` and Gateway `v2.3.1` |
| Formance Gateway | `v2.3.1` | multi-platform image `ghcr.io/formancehq/gateway@sha256:239926753312410ee9a602aa0bffe1e5c89cd340540a98a6df58694f3d6e4165` |
| Formance Operator | `v3.9.6` | signed source commit `7eca0ae56054064a1d8c47fd3a097368d1e1670c`; multi-platform image `ghcr.io/formancehq/operator@sha256:3781ee4dd554c3933b2bc972732de4d5b37db6afebb7612616d00800dfcab418` |
| Formance TypeScript SDK | `@formance/formance-sdk@7.0.0` | official release commit `c3b90dd5134ac91ee221f77b39992d617280098e`; isolated package and lockfile added by gate 1 |
| PostgreSQL | `16-alpine` | arm64 image `postgres@sha256:cf78e76683b9ca8c5733cbbdce6c9262b45b6767934dd0a95e671f9a0fc20685` |
| Node.js | `22.22.0` | local installed runtime |

## Vendored standalone configuration

`upstream/docker-compose.yml` is the `examples/standalone/docker-compose.yml`
configuration from the pinned Ledger source, reduced only by these required
security and scope edits:

1. Removed Console and retained the official Gateway after the user explicitly
   approved it for the SDK's `/api/ledger` routes.
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

The Gateway overlay intentionally supersedes the older standalone example's
`v2.0.31` tag. Stack `v3.2.10` is the release authority for the compatible
Gateway `v2.3.1` and Ledger `v2.4.12` pair; the upstream standalone file remains
unchanged so the overlay difference is reviewable.

`gateway-v2.3.1.Caddyfile` follows the Gateway `v2.3.1` implementation at commit
`d99593eb2705093e25686ed7711f9f9089390770`. Its topology changes are the Compose
service hostname (`ledger` instead of loopback), port `8080`, and removal of
disabled audit/NATS declarations for modules outside this deployment. Its
`endpoints` block uses the nested service syntax implemented by the release's
`UnmarshalCaddyfile`; the tag's root example omits that nesting and incorrectly
registers three unhealthy endpoints. This behavior is covered by the stack
health assertion rather than silently accepted.

The vendored `upstream/Caddyfile` is byte-for-byte the standalone Caddyfile
from Ledger source commit `f43a7078e7e1b9f6a354307ef994431593bf57e0`.

## SDK release packaging

Formance tagged and released `v7.0.0` on GitHub but did not publish that
version to npm; the registry's `latest` tag was `6.1.1` when this spike ran.
The spike therefore reproduced Formance's own publish lifecycle without
altering source:

```sh
git checkout c3b90dd5134ac91ee221f77b39992d617280098e
npm ci --ignore-scripts
npm run build
npm pack
```

The resulting official-source package is
`vendor/formance-formance-sdk-7.0.0.tgz` with SHA-256
`8caab624bddecebc5fed54dd7a39116279ee7c29e782cb0923e4f9aa00174104`.
The isolated lockfile pins that local artifact. No SDK source or generated file
was edited.
