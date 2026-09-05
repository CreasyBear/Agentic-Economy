# Update served discovery and existing plugin instructions

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee: Luna Max / discovery and plugin implementation owner
Assigned role: Served catalogue, machine-instruction and plugin consumer owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 29, 30

## Outcome

Update the served API catalogue, `llms.txt`, `/SKILL.md`, machine-readable site
manifest, markdown projections, discovery examples/schema and the existing
Agentic Economy plugin so they all describe the same approved Tool -> Quote ->
Call -> result journey. Preserve the existing producer pattern: route/action
descriptors are the source of truth and served outputs are projections, not a
second hand-maintained contract. This ticket owns discovery/plugin copy and
producer projections; issue 22 owns generated/package artifacts and issue 27
owns the current root documentation.

## Fixed mapping and boundary rules

Use the exact target map in
`docs/designs/vocabulary-rationalisation.md:261-291`, after issue 19 declares
the source action/route contracts. The anonymous CLI `describe` step remains
`registry.tools.describe`/public Tool detail; caller-specific Quote issuance is
the existing authenticated `call`-mediated flow and target `tool.quote` action,
not a new `describe` mapping or alias.

MCP names remain derived from action IDs. Retain `/mcp`, JSON-RPC methods,
official SDK lifecycle, OAuth standard fields, x402 fields, upstream OpenAPI
`operationId`, opaque IDs/hashes/signatures, market-request APIs and portfolio
Service/Offering/Publication/Listing/Source distinctions. Provider, Seller,
payment recipient, Charge, Provider obligation, payable, payout, delivery,
payment and purchase-resolution facts stay separate.

The external registry is a metadata authority, not the canonical market:
`GET /api/v1/registry` remains `api-registry:v1` with its existing query/access
filters and imported record/link fields. A source record becomes a callable
Tool only after AE admission and publication. Do not blanket-replace every
registry reference, discard external Tool link fields or make imported
metadata executable.

Every current example must be labelled current/pre-cutover until issue 19/22
land. Approved-target examples must not imply a live target route. Use one
useful x402-primary journey selected from existing maintained acceptance data;
do not add a weather proxy, free tier, playground, SDK, alias or new discovery
surface.

## Finite implementation allowlist

Only these discovery, route-projection, plugin and maintained discovery-test
paths are in scope. Do not sweep `src/modules/discovery`, `src/routes` or
`plugins` by directory.

### Discovery producers and projections

- `src/modules/discovery/public.ts`
- `src/modules/discovery/developer-discovery.ts`
- `src/modules/discovery/internal/agent-skill.ts`
- `src/modules/discovery/internal/api-catalog.ts`
- `src/modules/discovery/internal/developer-discovery-route-projection.ts`
- `src/modules/discovery/internal/developer-discovery-support-matrix.ts`
- `src/modules/discovery/internal/developer-discovery-types.ts`
- `src/modules/discovery/internal/discovery-files.ts`
- `src/modules/discovery/internal/manifest-projection.ts`
- `src/modules/discovery/internal/offering-discovery-file.ts`
- `src/modules/discovery/internal/offering-manifest.ts`
- `src/modules/discovery/internal/operation-contract.ts`
- `src/modules/discovery/internal/page-markdown.ts`
- `src/modules/discovery/internal/schema-values.ts`
- `src/modules/discovery/internal/site-manifest.ts`
- `src/modules/discovery/site-manifest-version.ts`

### Served route boundaries

- `src/routes/[.]well-known/api-catalog.ts`
- `src/routes/[.]well-known/ucp.ts`
- `src/routes/SKILL[.]md.ts`
- `src/routes/api.discovery.examples.ts`
- `src/routes/api.discovery.schema.ts`

### Existing plugin and maintained tests

- `plugins/agentic-economy/skills/use-agentic-economy/SKILL.md`
- `tests/unit/discovery/api-catalog.test.ts`
- `tests/unit/discovery/page-markdown.test.ts`
- `tests/unit/discovery/offering-llms-index.test.ts`
- `tests/unit/discovery/developer-discovery-parity.test.ts`
- `tests/unit/discovery/developer-discovery-kill-rules.test.ts`

### Protected read-only boundary (do not edit here)

- `src/routes/api.v1.registry.ts`
- `src/modules/registry/public.ts`

Use those paths only to validate external-registry preservation and link-field
semantics. HTTP/MCP action and route contract changes belong to issue 19; CLI
source/package changes belong to issue 20; generated dist/public archive work
belongs to issue 22.

## Explicit exclusions and sequencing

Do not edit the action/HTTP/MCP contracts, route files, CLI command consumers,
package metadata/README/dist/tarball, screens, root README, test data,
deployment state, plan/map/work record or Package 6/7. Do not create a new
catalogue, manifest schema, plugin, SDK, compatibility alias or checker.

Issues 10–18 provide the final core Tool/Quote/Call fields and issue 19 owns
their public contract before this ticket runs. Issue 20 may run concurrently
only on its disjoint CLI allowlist. Issue 22 regenerates shared artifacts after
the producers and contract are ready. Later hosted/live proof belongs to issues
32–35.

## Verification commands and expected results

Use Node 22 and npm 11.5.1 through the project NVM runner:

- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck` — pass for all
  producer/projection imports.
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:types` — pass without
  changing protected external protocol fields.
- Run the listed discovery parity, API-catalog, markdown and kill-rule tests
  through the repository's configured Vitest command — all served projections,
  stale/unavailable handling, routes, copyable commands and hashes agree.
- At the issue 22 integration checkpoint, read the generated API catalogue,
  site manifest, `/llms.txt`, `/SKILL.md` and discovery examples from the
  existing route/generator path and compare them to the declared action/route
  descriptors; do not use a new checker.
- `git diff --check -- src/modules/discovery/public.ts
  src/modules/discovery/developer-discovery.ts
  src/modules/discovery/internal/agent-skill.ts
  src/modules/discovery/internal/api-catalog.ts
  src/modules/discovery/internal/developer-discovery-route-projection.ts
  src/modules/discovery/internal/developer-discovery-support-matrix.ts
  src/modules/discovery/internal/developer-discovery-types.ts
  src/modules/discovery/internal/discovery-files.ts
  src/modules/discovery/internal/manifest-projection.ts
  src/modules/discovery/internal/offering-discovery-file.ts
  src/modules/discovery/internal/offering-manifest.ts
  src/modules/discovery/internal/operation-contract.ts
  src/modules/discovery/internal/page-markdown.ts
  src/modules/discovery/internal/schema-values.ts
  src/modules/discovery/internal/site-manifest.ts
  src/modules/discovery/internal/site-manifest-version.ts
  src/routes/[.]well-known/api-catalog.ts src/routes/[.]well-known/ucp.ts
  src/routes/SKILL[.]md.ts src/routes/api.discovery.examples.ts
  src/routes/api.discovery.schema.ts
  plugins/agentic-economy/skills/use-agentic-economy/SKILL.md
  tests/unit/discovery/api-catalog.test.ts
  tests/unit/discovery/page-markdown.test.ts
  tests/unit/discovery/offering-llms-index.test.ts
  tests/unit/discovery/developer-discovery-parity.test.ts
  tests/unit/discovery/developer-discovery-kill-rules.test.ts` — no whitespace
  errors.

Do not start a backend, deploy, or push schema from this ticket. Any local
backend/codegen activity requires issue 31's local-target/activity-safety
decision and belongs to issue 22.

## Acceptance

- [ ] `/llms.txt`, API catalogue, site manifest, markdown pages, discovery
      examples/schema, `/SKILL.md` and the plugin publish one consistent target
      Tool/Quote/Call flow with current-vs-target state labels.
- [ ] Discovery producers derive paths, methods, action IDs, schemas, MCP names,
      auth, scopes and input/reference fields from the existing owning
      descriptors; no hand-authored duplicate contract is introduced.
- [ ] Anonymous `describe` remains public Tool detail; copyable protected work
      uses the retained `call` flow and target Quote/Call actions, with no
      `inspect` alias or invented command.
- [ ] `/api/v1/registry` remains external `api-registry:v1` metadata; imported
      records and Tool link fields are preserved and never treated as callable
      until admission/publication.
- [ ] Native Codex/Claude Code/Cursor MCP setup and official protocol/OAuth/x402
      fields remain unchanged except for the approved AE-owned action/scope
      mapping from issue 19.
- [ ] Problem, unavailable, stale, empty and retry copy retains existing safe
      machine fields and actionable semantics; no credentials/private input is
      copied. Pending, failed, refunded, delivered and purchase-resolution or
      payment facts remain distinct.
- [ ] Existing discovery tests pass and no unrelated source, CLI, protocol,
      dependency, generated-output or Git changes are included.

## Closure evidence

Attach the changed-path list, producer-source receipt, served projection/parity
receipt, plugin instruction receipt, external-registry boundary check and
focused test results. Mark package/dist/public and hosted/live evidence pending
issue 22 and later verification; this ticket does not claim target routes are
live.

## Comments

- 2026-09-05 — Prepared as the finite discovery/plugin owner after the DX review.
  The anonymous `describe` versus call-mediated Quote flow is deliberate; no
  CLI or HTTP contract is redefined here.
