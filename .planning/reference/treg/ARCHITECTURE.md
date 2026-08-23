# Treg Architecture

**Analysis Date:** 2026-08-23
**Source snapshot:** [`superdesigndev/treg@603540f`](https://github.com/superdesigndev/treg/tree/603540f653994080d4f507a9a3564e1017c28eef)
**Source commit date:** 2026-08-22T10:01:05+10:00

## Scope/source pin

This card describes the pinned Treg implementation only. It maps module ownership,
request and credential flows, persistence boundaries, and deployment wiring. Source
paths below are relative to the pinned repository root. Configuration names are
identified by name only; no secret values are reproduced.

## Runtime/deployment

- `src/treg/__main__.py` is the process entry point for `python -m treg`; it starts
  the FastAPI application from `src/treg/api.py` through Uvicorn.
- `src/treg/cli.py` is exposed as the `treg` console script by `pyproject.toml`.
  The CLI is an HTTP client rather than a second server implementation.
- `src/treg/config.py` loads `TREG_`-prefixed settings with Pydantic Settings and
  caches the settings object for process use. `TREG_DATABASE_URL` selects SQLite
  or PostgreSQL; `TREG_SECRET_KEY` protects persistent encrypted credentials.
- `render.yaml` defines a Render web service, a managed PostgreSQL database, the
  `pip install ".[server]"` build, `python -m treg` start, and `/meta` health check.
- `src/treg/web/index.html` is a package-resident single-page dashboard. The
  Python package, catalog YAML, examples, and web assets are loaded from the
  installed package; there is no separate frontend build pipeline in this snapshot.
- `.github/workflows/ci.yml` runs the Python test suite with uv; deployment
  configuration is in `render.yaml`, not in the CI workflow.

## Module ownership

| Responsibility | Owning path | Boundary |
|---|---|---|
| HTTP routes and application lifespan | `src/treg/api.py` | Composes settings, DB, auth, billing, catalog, proxy, health, and optional MCP. |
| Configuration | `src/treg/config.py` | Defines environment-backed settings and provider/platform policy. |
| Persistence setup | `src/treg/db.py` | Builds the async SQLAlchemy engine/session and initializes SQLModel metadata. |
| Persistent entities | `src/treg/models.py` | Defines organizations, memberships, tools, calls, runs, audits, secrets, OAuth, and ledger records. |
| Encryption and identity tokens | `src/treg/crypto.py` | Encrypts stored credentials and hashes/verifies machine tokens. |
| Browser sessions | `src/treg/session.py` | Signs and validates the session cookie using `TREG_SESSION_SECRET` or the secret-key fallback. |
| Human and CLI authentication | `src/treg/auth.py`, `src/treg/api.py` | Owns GitHub/Google callbacks, email OTP, and CLI handshake routes. |
| OAuth connection registry | `src/treg/oauth.py`, `src/treg/oauth_providers.py` | Implements provider-specific authorize, token, refresh, probe, and resource discovery behavior. |
| Catalog loading | `src/treg/catalog_store.py` | Reads package YAML and normalizes endpoint records for API, CLI, and MCP consumers. |
| Provider binding/injection | `src/treg/providers.py`, `src/treg/injectors.py` | Resolves provider auth shapes and injects env, CLI, header, or query credentials. |
| Upstream relay | `src/treg/proxy.py` | Performs server-side HTTP calls, SSRF checks, timeout enforcement, and response relay. |
| Local proxy/grants | `src/treg/localproxy.py`, `src/treg/localrun.py` | Provides local HTTPS interception and short-lived local credential grants. |
| CLI subprocess execution | `src/treg/runner.py`, `src/treg/shell.py` | Runs allow-listed commands with scrubbed environment, limits, and ephemeral shims. |
| Billing and credits | `src/treg/billing.py` | Integrates Stripe and coordinates top-up, hold, settlement, and webhook bookkeeping. |
| Health and cleanup | `src/treg/health.py` | Probes configured tools, refreshes OAuth, expires stale state, and sends guarded webhooks. |
| MCP surface | `src/treg/mcp.py`, `src/treg/mcp_oauth.py` | Exposes catalog/tool calls and MCP OAuth metadata/token flows. |

## Data model

- `src/treg/models.py` uses SQLModel over SQLAlchemy. `src/treg/db.py` creates an
  async engine with `aiosqlite` for SQLite and `asyncpg` for PostgreSQL, then
  creates the model metadata and runs guarded compatibility migrations.
- Organization tenancy is represented by `Org` and `Membership`; tools and
  credentials are attached to an organization rather than to a global browser
  session. Calls, runs, and audit records retain execution history and actor
  context.
- `Secret` stores encrypted credential material. Encryption/decryption is kept
  in `src/treg/crypto.py`; API responses expose metadata and status, not secret
  plaintext.
- OAuth connections and pending consent state are persisted through the OAuth
  models used by `src/treg/oauth.py`; pending client secrets and tokens are
  encrypted before persistence.
- Billing entities in `src/treg/models.py` represent balances, holds, ledger
  entries, Stripe customer/payment references, top-ups, auto-top-up state, and
  referral/accounting records.
- `src/treg/ratestore.py` stores ephemeral OTP and rate-limit state in the same
  database boundary, so login and abuse controls work across web workers.

## Catalog load/search

- `src/treg/catalog_store.py` reads from `src/treg/catalog/` at runtime. It loads
  `capabilities.yaml`, `fx.yaml`, `aliases.yaml`, then all provider `*.yaml`
  files in sorted order; a provider core file is loaded before its
  `.extended.yaml` companion.
- Provider records are YAML objects containing endpoint identity, capability,
  platform, scope, HTTP method/path, input schema, test request, cost/tier,
  verification/status, documentation, and example references. JSON response
  fixtures live under `src/treg/catalog/examples/`.
- The loader normalizes records, merges proposed capabilities, and keeps a
  process-local `_CACHE`. Missing or half-written catalog data degrades to an
  empty result rather than changing the API schema.
- `scripts/catalog_ingest.py` obtains public specs/rate cards, uses its cache,
  and writes generated `<provider>.extended.yaml`; hand-curated core YAML wins
  over generated extensions. `scripts/catalog_validate.py` checks names, IDs,
  pricing metadata, and secret leakage. `scripts/catalog_verify*.py` performs
  live checks and captures examples.
- API catalog routes in `src/treg/api.py`, CLI catalog commands in
  `src/treg/cli.py`, and tools in `src/treg/mcp.py` consume the normalized store;
  they do not each parse provider files independently.

## Authentication/tenant resolution

- Browser requests enter `src/treg/api.py`, where a signed cookie from
  `src/treg/session.py` identifies the human account. The cookie signing key is
  `TREG_SESSION_SECRET`, falling back to `TREG_SECRET_KEY`.
- `GET /auth/github` and its callback use `TREG_GITHUB_CLIENT_ID` and
  `TREG_GITHUB_CLIENT_SECRET`, then fetch GitHub identity/email data. Google
  login uses `TREG_GOOGLE_CLIENT_ID` and `TREG_GOOGLE_CLIENT_SECRET` with the
  configured OIDC user-info endpoint.
- `src/treg/email.py` supplies email OTP and invitation delivery. The
  `POST /auth/email/start` and `POST /auth/email/verify` routes use the
  database-backed rate store and resolve the resulting account into an Org and
  Membership.
- CLI authentication is a browser-assisted handshake through
  `/auth/cli/start`, `/auth/cli/poll`, `/auth/cli/orgs`, and
  `/auth/cli/approve`; the CLI stores its non-secret connection settings at the
  configured local path and sends machine credentials over HTTP.
- Admin/superadmin routes are separately gated by the admin token setting. Org
  selection is explicit for organization-scoped calls; membership checks occur
  before tools, connections, billing, and health data are read or changed.

## Credential ladder

1. A caller selects an organization tool binding. `src/treg/providers.py` maps
   the tool to a provider and its expected key, OAuth, or CLI credential shape.
2. Organization-owned credentials are loaded from encrypted `Secret` records by
   `src/treg/crypto.py`; `src/treg/injectors.py` places them in the provider's
   header, query, environment, or CLI argument location.
3. OAuth-backed tools use a stored connection from `src/treg/oauth.py`, refresh
   it when needed, and inject only the resulting request credential. OAuth leaf
   grants for local execution are short-lived and scoped.
4. A platform key is eligible only when the provider is in `TREG_PLATFORM_PROVIDERS`
   and its corresponding `platform_key_*` setting exists in `src/treg/config.py`.
   Platform credentials are not copied into organization secret records.
5. Local execution may receive a time-limited grant from `src/treg/localrun.py`;
   shared-key release requires the configured `TREG_RUN_PROOF` policy. The
   server scrubs inherited environment variables before launching a command.

## Proxy relay

- `src/treg/proxy.py` is the server relay used for catalog endpoint calls. Its
  shared `httpx.AsyncClient` applies the configured call timeout, connection
  limits, SSRF protection, and upstream response handling.
- The relay removes hop-by-hop headers and Treg control headers while preserving
  the provider request shape and adding credentials through
  `src/treg/injectors.py`. It records the call context without storing secret
  values in the response.
- `src/treg/localproxy.py` is not a second provider API: it is the local HTTPS
  interception path for commands that need local credential injection. It uses a
  generated local CA and the configured capture-host policy.
- `src/treg/fsjail.py` can add a macOS sandbox profile around local execution;
  server subprocesses in `src/treg/runner.py` use allow-lists, scrubbed HOME,
  time/output caps, and POSIX resource limits rather than container isolation.

## Reserve/settle/replay

- A billable call is authorized in `src/treg/api.py` and `src/treg/billing.py`
  before the outbound relay or CLI run. The billing layer creates an idempotent
  hold against the organization's credit balance and applies the configured
  timeout/grace policy.
- On completion, the actual provider/tool cost is settled into the ledger. A
  failed or rejected call releases or closes the hold according to the recorded
  outcome; Stripe credit is accepted only from verified webhook processing.
- `src/treg/models.py` retains call, run, audit, hold, settlement, and provider
  metadata so a result can be inspected without replaying the provider request.
- `src/treg/sandbox.py` is the deterministic demo/sandbox path. It synthesizes
  calls and can use an optional seeded Stripe tool; it does not silently replay
  production provider traffic or send ordinary upstream requests.

## CLI/API/MCP flow

```text
treg CLI / dashboard / MCP client
        -> authenticated API route in src/treg/api.py
        -> org/membership + credential + billing checks
        -> catalog resolution and proxy or runner
        -> provider response, call/run record, and audit event
```

- `src/treg/cli.py` calls the HTTP API for catalog, connection, health, billing,
  and tool operations. `src/treg/shell.py` creates ephemeral PATH shims that
  route registered CLIs through local grants or the server.
- `src/treg/mcp.py` is optionally mounted under `/mcp/` when the `mcp` server
  extra is installed. MCP tools use the same catalog and call path rather than
  bypassing tenant, credential, or billing checks.
- `src/treg/mcp_oauth.py` implements MCP client registration, authorize/token/
  revoke routes, and well-known metadata. It validates audiences against the
  public host aliases configured in `src/treg/config.py`.

## Health/OAuth/audit

- `src/treg/health.py` runs configured tool probes, OAuth refresh/expiry checks,
  stale pending-consent cleanup, and invite cleanup. `/health/run` supports an
  organization run; an authorized all-organization run uses `all_orgs=1`.
- Health may POST a membership-owned webhook URL after applying the SSRF/public
  host guard in `src/treg/health.py`. The route is callable by `treg health --run`;
  `render.yaml` provides only the service health check, so periodic execution is
  external to this snapshot rather than a declared Render cron service.
- `src/treg/oauth.py` performs PKCE/state handling, token exchange, refresh, and
  expiry tracking. `src/treg/oauth_providers.py` supplies exact provider bases,
  authorization/token URLs, probes, and discovery/enrichment calls.
- `src/treg/models.py` audit records are written around authentication, secret,
  connection, billing, call, run, and administrative events. `src/treg/analytics.py`
  is a separate best-effort telemetry sink and is not the audit source of truth.

## Structure appendix

```text
src/treg/
├── api.py                 # FastAPI routes and lifespan composition
├── config.py              # TREG_ settings and policy
├── db.py / models.py      # async persistence and SQLModel entities
├── auth.py / session.py   # identity and signed browser sessions
├── oauth.py               # generic OAuth state/token lifecycle
├── oauth_providers.py     # curated provider registry
├── catalog_store.py       # YAML catalog loading and normalization
├── providers.py           # provider binding definitions
├── injectors.py           # env/CLI/header/query credential injection
├── proxy.py               # server-side upstream relay
├── localrun.py / runner.py# local grants and subprocess execution
├── billing.py             # Stripe and credit ledger operations
├── health.py              # probes, refresh, cleanup, guarded callbacks
├── mcp.py / mcp_oauth.py  # MCP tools and MCP OAuth front door
├── cli.py / shell.py      # HTTP CLI and command shims
├── web/index.html         # package-resident dashboard
└── catalog/               # provider YAML, taxonomy, rates, aliases, examples
```

Add route composition to `src/treg/api.py`, persistence entities to
`src/treg/models.py` with initialization support in `src/treg/db.py`, provider
bindings to `src/treg/providers.py`/`src/treg/oauth_providers.py`, and catalog
endpoint data under `src/treg/catalog/`; preserve the existing boundaries so
CLI and MCP continue to consume the same authenticated call path.

---

*Architecture analysis: 2026-08-23*
