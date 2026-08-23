# Treg Engineering Map

**Analysis Date:** 2026-08-23
**Pinned source:** [`superdesigndev/treg@603540f`](https://github.com/superdesigndev/treg/tree/603540f653994080d4f507a9a3564e1017c28eef)
**Pinned commit date:** 2026-08-22T10:01:05+10:00

Static findings are labeled **Source evidence** when they come from the pinned
files. **README/live claim** identifies documentation or deployment intent in
`README.md`, `USAGE.md`, or workflow comments; no live service was queried.
Secret values are intentionally omitted.

## Stack and dependencies

- **Source evidence:** `pyproject.toml` defines the `tools-registry` Python
  package, version `0.12.0`, requiring Python `>=3.12,<3.14`. The runtime is
  asynchronous Python: FastAPI and Uvicorn are in the `[server]` extra, while
  `treg = "treg.cli:main"` exposes the CLI.
- **Source evidence:** Base installation depends on `httpx>=0.27` and
  `questionary>=2.0`; server installation adds `sqlmodel>=0.0.22`,
  `sqlalchemy[asyncio]>=2.0`, `aiosqlite>=0.20`, `asyncpg>=0.30`,
  `cryptography>=43`, `pydantic-settings>=2.5`, `pyyaml>=6`, `stripe>=12`,
  and `mcp>=2`.
- **Source evidence:** `pyproject.toml` uses Hatchling and builds a wheel from
  `src/treg`; package-resident assets under `src/treg/web/` and
  `src/treg/catalog/` are shipped with the Python package.
- **Source evidence:** `uv.lock` is present. The dev group adds
  `pytest>=8.3`, `pytest-asyncio>=0.24`, and the server extra. Test async mode
  is automatic in `pyproject.toml`.
- **Source evidence:** `package.json` describes the separate `treg-dsh` ESM
  plugin bundle (`dsh/index.js`, `dsh/cordis.patch.yml`, `dsh/skills`). Node is
  needed for that bundle, not for the Python server or CLI.
- **Source evidence:** `src/treg/web/index.html` is a package-resident dashboard
  and `src/treg/__main__.py` starts the server; there is no separate frontend
  compilation entry point in the pinned source.
- **README/live claim:** `README.md` presents the base install as a light CLI
  and the server extra as the self-hosted registry runtime. The manifest and
  import paths are the authoritative static evidence for that split.

## Configuration/deployment

- **Source evidence:** `src/treg/config.py` defines `Settings` with
  `env_prefix="TREG_"`, `.env` loading, ignored extra keys, and cached
  `get_settings()`. Important names are `TREG_DATABASE_URL`, `TREG_SECRET_KEY`,
  `TREG_SESSION_SECRET`, `TREG_PUBLIC_URL`, `TREG_API_TOKEN`, and
  `TREG_ADMIN_TOKEN`.
- **Source evidence:** Human login names are `TREG_GITHUB_CLIENT_ID`,
  `TREG_GITHUB_CLIENT_SECRET`, `TREG_GOOGLE_CLIENT_ID`, and
  `TREG_GOOGLE_CLIENT_SECRET`. Email names are `TREG_RESEND_API_KEY`,
  `TREG_EMAIL_FROM`, and `TREG_EMAIL_DEV_MODE`.
- **Source evidence:** Billing names are `TREG_STRIPE_SECRET_KEY`,
  `TREG_STRIPE_WEBHOOK_SECRET`, `TREG_DEMO_STRIPE_KEY`, and
  `TREG_DEMO_STRIPE_WEBHOOK_SECRET`; runtime limits include
  `TREG_RUN_PROOF`, `TREG_RUN_ALLOWED_BINS`, `TREG_RUN_RLIMITS`,
  `TREG_RUN_CPU_SECONDS`, and `TREG_RUN_FSIZE_MB`.
- **Source evidence:** Provider policy is controlled by
  `TREG_PLATFORM_PROVIDERS` and the `TREG_PLATFORM_KEY_<PROVIDER>` family,
  including `TREG_PLATFORM_KEY_TIKHUB`, `TREG_PLATFORM_KEY_DATAFORSEO`,
  `TREG_PLATFORM_KEY_BRIGHTDATA`, `TREG_PLATFORM_KEY_SERPAPI`,
  `TREG_PLATFORM_KEY_HUNTER`, `TREG_PLATFORM_KEY_APIFY`,
  `TREG_PLATFORM_KEY_TOMBA`, and `TREG_PLATFORM_KEY_TOMBA_SECRET`.
- **Source evidence:** `src/treg/__main__.py` invokes Uvicorn on `0.0.0.0` and
  reads `PORT`; `render.yaml` starts it with `python -m treg`.
- **Source evidence:** `render.yaml` defines a Render Python web service and
  managed PostgreSQL database, builds with `pip install ".[server]"`, wires
  `TREG_DATABASE_URL` from the database, and checks `/meta`. Dashboard-managed
  secrets are marked `sync:false`; their values are not committed.
- **Source evidence:** `src/treg/config.py` rewrites PostgreSQL URL schemes for
  the async driver and refuses a missing persistent `TREG_SECRET_KEY` for a
  non-SQLite database. SQLite is the local fallback.
- **Source evidence:** `.github/workflows/ci.yml` runs on pushes to `main` and
  pull requests, installs Python 3.13 through uv, and runs the suite with
  `pytest-xdist`. `.github/workflows/catalog-drift.yml` is a scheduled GitHub
  Actions job, not an application process.
- **README/live claim:** `README.md` documents public URLs, sign-in modes,
  local setup, and cron-oriented operations. `render.yaml` is the pinned
  deployment declaration; no live Render state was checked.

## External integrations

- **Source evidence — database:** `src/treg/db.py` creates an async SQLAlchemy
  engine using `aiosqlite` for SQLite and `asyncpg` for PostgreSQL. `models.py`
  stores orgs, memberships, tools, secrets, calls, runs, audits, OAuth state,
  and billing/ledger records.
- **Source evidence — human auth:** `src/treg/api.py` and `src/treg/auth.py`
  implement GitHub and Google callbacks. GitHub uses the configured GitHub OAuth
  endpoints; Google uses OAuth/OIDC endpoints from `src/treg/config.py`.
- **Source evidence — email:** `src/treg/email.py` sends OTPs, invitations,
  receipts, and related messages through Resend at the configured API endpoint;
  delivery is best effort and uses `TREG_RESEND_API_KEY` and `TREG_EMAIL_FROM`.
- **Source evidence — OAuth registry:** `src/treg/oauth_providers.py` contains
  curated entries for Google Search Console, Google Analytics, Google Business
  Profile, Google Ads, YouTube, LinkedIn, Slack, X, TikTok, Facebook, Instagram,
  Meta Ads, Microsoft Ads, Snapchat Ads, TikTok Ads, and Pinterest Ads. Each
  entry records API base, authorization/token URLs, scopes, probe paths, and
  provider-specific headers or PKCE behavior.
- **Source evidence — API-key registry:** The same registry covers Apollo, PDL,
  Akta, Hunter, Crunchbase, TikHub, Bright Data, Semrush, JustOneAPI,
  ScrapeCreators, DataForSEO, SE Ranking, Moz, Majestic, Serpstat, Lusha,
  Coresignal, Diffbot, TheCompaniesAPI, LeadMagic, Fiber AI, CompanyEnrich,
  Ocean.io, Tomba, PredictLeads, Findymail, Brand.dev, Icypeas, LeadsForge,
  influencers.club, CoinGecko, Polygon, Finnhub, Twelve Data, FMP, EODHD,
  Marketstack, Tiingo, SpyFu, Apify, Meta Ad Library, and SerpApi.
- **Source evidence — payment:** `src/treg/billing.py` is the only Stripe
  integration boundary for hosted Checkout, Setup, Portal, webhook validation,
  top-ups, auto-top-up, refunds, disputes, and idempotent ledger crediting.
  `src/treg/api.py` also exposes the optional demo/live-wire Stripe routes.
- **Source evidence — telemetry/support:** `src/treg/analytics.py` batches
  server events to PostHog when `TREG_POSTHOG_KEY` is configured. Intercom
  browser/support integration is gated by `TREG_INTERCOM_APP_ID` and
  `TREG_INTERCOM_SECRET`; `src/treg/api.py` derives the identity hash.
- **Source evidence — MCP:** `src/treg/mcp.py` mounts an optional MCP server
  under `/mcp/`; `src/treg/mcp_oauth.py` implements MCP client registration,
  authorization, token, revoke, and well-known metadata endpoints.
- **Source evidence — provider execution:** `src/treg/proxy.py` relays HTTP
  provider calls; `src/treg/runner.py` executes allow-listed CLIs; and
  `src/treg/localproxy.py` handles local HTTPS interception. The registry does
  not model each upstream provider as a Python SDK.

## Catalog data/curation

- **Source evidence:** `src/treg/catalog/` is the catalog source. Hand-curated
  provider YAML files and generated `<provider>.extended.yaml` files describe
  endpoint IDs, capabilities, platform/scope, method/path, input, test request,
  cost/tier, verification/status, documentation, and examples.
- **Source evidence:** `src/treg/catalog/capabilities.yaml`, `fx.yaml`, and
  `aliases.yaml` are control files; captured JSON responses are under
  `src/treg/catalog/examples/`.
- **Source evidence:** `src/treg/catalog_store.py` loads controls and sorted
  provider YAML, loads core before extended data, normalizes records, merges
  proposed capabilities, and caches the result for the process lifetime.
- **Source evidence:** `scripts/catalog_ingest.py` fetches public specs/rate
  cards and writes extended YAML using a cache; `scripts/catalog_validate.py`
  checks provider names, IDs, pricing metadata, and secret leakage.
- **Source evidence:** `scripts/catalog_verify*.py` performs live endpoint checks
  and captures examples. `scripts/catalog_drift.py` compares selected provider
  data with a public spec and is run for TikHub by scheduled CI.
- **Source evidence:** `pyproject.toml` and `render.yaml` package/deploy the
  catalog with the server wheel; runtime loading is from the installed
  `src/treg` package, not from a separate database or frontend bundle.
- **README/live claim:** `README.md` describes catalog discovery and endpoint
  usage as the public product behavior. Static loader behavior above is sourced
  from `src/treg/catalog_store.py` and the catalog scripts.

## Conventions/error contracts

- **Source evidence:** Routes and integrations are async; outbound work uses
  `httpx.AsyncClient`, and blocking Stripe SDK calls are moved off the event
  loop in `src/treg/billing.py`.
- **Source evidence:** Settings are read through `get_settings()` in
  `src/treg/config.py`; callers should use named settings rather than reading
  environment variables directly in feature modules.
- **Source evidence:** Provider endpoint records are normalized before they are
  returned or proxied by `src/treg/catalog_store.py`; API, CLI, and MCP share
  that normalized shape.
- **Source evidence:** Secrets are represented by metadata/status in API output;
  `src/treg/crypto.py`, `src/treg/injectors.py`, and `src/treg/proxy.py` keep
  plaintext credentials at the injection boundary.
- **Source evidence:** Billing is idempotent and credits are granted only after
  verified Stripe webhook events in `src/treg/billing.py`; call/run/audit state
  remains in `src/treg/models.py`.
- **Source evidence:** Health probe results in `src/treg/health.py` distinguish
  invalid, unknown, and successful tool states and persist the result for UI/API
  consumers.
- **README/live claim:** `README.md` documents the proxy rule as relaying an
  upstream request while injecting credentials server-side. It is a product
  statement; implementation evidence is `src/treg/proxy.py` and the injectors.

## Test organization/coverage

- **Source evidence:** Tests are separate under `tests/` and use
  `tests/test_*.py`. Coverage spans access/auth, org isolation, billing/ledger,
  catalog API and validation, OAuth, providers/injectors, proxy/egress, CLI,
  local execution, MCP, health, sandbox, and security rounds.
- **Source evidence:** Representative files are `tests/test_auth.py`,
  `tests/test_billing.py`, `tests/test_catalog_api.py`,
  `tests/test_oauth_registry.py`, `tests/test_egress.py`,
  `tests/test_localproxy.py`, `tests/test_mcp.py`, `tests/test_health.py`,
  `tests/test_run.py`, `tests/test_security_round4.py`, and
  `tests/test_orgs_isolation.py`.
- **Source evidence:** `pyproject.toml` sets `asyncio_mode = "auto"` and
  `pythonpath = ["."]` so tests can import standalone `scripts/` modules.
- **Source evidence:** `.github/workflows/ci.yml` runs `uv run --with
  pytest-xdist pytest -n auto -q`, with a 15-minute job timeout. Docs-only direct
  pushes can skip the suite; pull requests still run it.
- **Source evidence:** No coverage threshold or coverage-report configuration
  appears in `pyproject.toml` or the inspected CI workflow.
- **README/live claim:** `README.md` reports a test count and the command
  `uv run pytest -q`; the static map treats that count as a documentation claim,
  not a freshly collected result. The CI comment reports a different approximate
  count, so neither is used as a verified coverage metric here.

## Operational jobs

- **Source evidence:** `.github/workflows/catalog-drift.yml` schedules daily
  `scripts/catalog_drift.py tikhub` and supports manual dispatch.
- **Source evidence:** `.github/workflows/stale.yml` and Dependabot provide
  repository maintenance schedules; they do not run inside the Treg service.
- **Source evidence:** `src/treg/health.py` exposes `/health/run` and the CLI
  command `treg health --run` for credential probes, OAuth refresh, stale-state
  cleanup, and guarded owner webhooks.
- **Source evidence:** `render.yaml` declares `/meta` for Render service health
  checks but declares no Render cron service. Periodic health execution is an
  external caller/cron responsibility in this snapshot.
- **README/live claim:** `README.md` says health can run on demand or via cron;
  this is an operational usage claim, not evidence of a configured scheduler.

## Security controls

- **Source evidence:** `src/treg/crypto.py` encrypts persisted secrets with
  Fernet and hashes machine tokens. Persistent non-SQLite operation requires
  `TREG_SECRET_KEY`; an empty local SQLite key is treated as ephemeral.
- **Source evidence:** `src/treg/session.py` signs browser sessions, while
  `src/treg/auth.py` and `src/treg/api.py` enforce provider callbacks, OTP,
  machine identity, membership, and admin boundaries.
- **Source evidence:** `src/treg/proxy.py` applies SSRF checks controlled by
  `TREG_PROXY_SSRF_CHECK`; `src/treg/health.py` applies public-host checks before
  posting owner webhooks.
- **Source evidence:** `src/treg/runner.py` uses an executable allow-list,
  scrubbed environment, throwaway HOME, time/output limits, and POSIX rlimits
  controlled by `TREG_RUN_*`. `src/treg/fsjail.py` supplies an optional macOS
  sandbox profile for local execution.
- **Source evidence:** Platform credentials are gated by
  `TREG_PLATFORM_PROVIDERS`; `src/treg/injectors.py` injects them without placing
  them into organization secret records. `TREG_RUN_PROOF` gates shared-key grant
  release.
- **Source evidence:** `.gitleaks.toml` exists for repository secret scanning;
  the inspected workflow comments describe a least-privilege read-only CI job.

## Known concerns/fragile areas

- **Source evidence:** SQLite permits ephemeral secret-key operation, while
  persistent PostgreSQL requires `TREG_SECRET_KEY`; moving environments without
  the same key makes encrypted credentials unavailable.
- **Source evidence:** `src/treg/catalog_store.py` has a process-local cache and
  degrades missing or half-written catalog data to an empty result. In a multi-
  worker deployment, each worker can therefore observe its own load boundary.
- **Source evidence:** `scripts/catalog_ingest.py` and live verification depend
  on public provider specifications, rate cards, and credentials; provider drift
  is detected selectively by scheduled CI rather than by every request.
- **Source evidence:** `src/treg/runner.py` documents resource limits and
  allow-lists but does not provide container isolation. CLI execution remains a
  host-level security boundary.
- **Source evidence:** Platform credentials are a high-impact shared resource;
  the allow-list/kill-switch behavior in `src/treg/config.py` and `render.yaml`
  must remain aligned with provider pricing and key settings.
- **Source evidence:** `src/treg/health.py` relies on an external scheduler for
  recurring health runs; `render.yaml` does not declare that scheduler.
- **README/live claim:** Public setup and deployment examples in `README.md`
  describe intended operation, but no production endpoint, Render dashboard, or
  provider account was live-verified for this map.

## Licensing/source reuse fact

- **Source evidence:** `LICENSE` grants Apache License 2.0 rights with additional
  terms. The additional terms expressly permit modification and redistribution,
  including internal commercial use, but restrict using the original or modified
  work as a hosted, managed, or embedded service for third parties without the
  licensor's prior written authorization.
- **Source evidence:** `pyproject.toml` points its license metadata at `LICENSE`,
  while `package.json` declares `Apache-2.0` for the `treg-dsh` package. The full
  `LICENSE` text, including additional terms, is the controlling source for reuse
  review.
- **README/live claim:** `README.md` summarizes the project as Apache 2.0 with
  additional terms and links to `LICENSE`; that summary does not replace the
  license file when evaluating source reuse.

---

*Engineering analysis: 2026-08-23*
