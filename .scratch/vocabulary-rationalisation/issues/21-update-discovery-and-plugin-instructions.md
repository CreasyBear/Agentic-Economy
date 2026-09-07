## Public review requires three contract corrections — 2026-09-07

Independent review of the complete Public candidate requires correction before
acceptance. Report: `/tmp/ae-public-independent-review-20260907.txt`.
The same Public owner is addressing one consolidated batch:

- Acquire a Quote and preserve its reference and command identity across HTTP/MCP Call replay.
- Consume the actual public search v3 and describe v2 projections, including withdrawn readback.
- Unwrap hosted MCP structured results and handle MCP errors explicitly.

The correction includes tests against the actual contracts. The earlier candidate
and review remain the baseline; only the material corrective delta returns for
review. No public API widening or hosted execution is authorized by this return.
Public and final artifact acceptance remain open.

# Update served discovery and existing plugin instructions

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee:
Assigned role: Served catalogue, machine-instruction and plugin consumer owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 29, 30

## Outcome

### Current bounded dispatch — 2026-09-05

`vocab_discovery_contracts_01` claims exactly
`src/modules/discovery/internal/operation-contract.ts` (move to
`tool-contract.ts`), `src/modules/discovery/public.ts`,
`src/modules/discovery/internal/site-manifest.ts` and
`src/modules/discovery/internal/page-markdown.ts`. Propagate the already
declared Tool/Quote/Call constants and examples through these four producers;
preserve original signed reconciliation keys and opaque example identifiers.
No action definitions, other producers, tests, generated outputs or release
operations belong to this batch. Narrow lint/stale-reference/whitespace checks
are batch evidence only; full served parity and parent acceptance stay open.

Handoff: the four-file move/propagation is complete; narrow lint and whitespace
checks passed, zero compactions, no tests run. Root interrupted for the requested
handoff rather than allowing an open-ended worker. Remaining descriptor exports
stay with issue 19. `operationGateway` remains unresolved in this batch; the
coordinator will provide its exact mapping together with its known consumers.

Next claim: `vocab_discovery_catalogue_02` owns exactly
`src/modules/discovery/internal/offering-discovery-file.ts`,
`src/modules/discovery/internal/api-catalog.ts`,
`src/modules/discovery/internal/page-markdown.ts`,
`tests/unit/discovery/api-catalog.test.ts` and
`tests/unit/discovery/offering-llms-index.test.ts`. Update catalogue paths and
Call/Quote constants from their descriptors; the page-markdown change is
restricted to direct helper imports/calls. Narrow lint and whitespace checks
are requested; matching test expectations are updated but full module parity
remains pending. No action definitions, generated output or release operations.

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

### Bounded producer handoff and manifest field claim — 2026-09-05

Manifest field batch handed back: all four assigned files updated; narrow
lint/stale-field/whitespace checks passed, zero compactions. Tests and React
Doctor unrun at this source checkpoint. Its remaining active parity-script
consumer is explicitly assigned below, not left as an unowned follow-up.

`vocab_discovery_parity_04` claims exactly `eval/parity/check-parity.mjs`,
`tests/imports/tool-surface-conformance.test.ts` and
`tests/integration/discovery-route-parity.test.ts`. Propagate fixed public paths,
action names, manifest kinds and `toolGateway`, retaining every check/scenario.
The script must not execute network/live behavior: syntax/lint/static checks
only. Behavioral parity remains open. The previous descriptor worker released
the shared conformance test before this claim.

`vocab_discovery_catalogue_02` returned its five-file change; source lint and
whitespace checks passed, zero compactions. Its matching tests were updated but
intentionally not run during the source pass.

Coordinator resolves the remaining AE-owned field mapping as
`operationGateway` → `toolGateway`, consistent with callable Operation → Tool
and the selected Tool gateway filename mapping. `vocab_manifest_field_03`
claims exactly `src/modules/discovery/internal/site-manifest.ts`,
`src/routes/status.tsx`, `tests/unit/routes/status-route.test.tsx` and
`tests/unit/discovery/site-discovery-manifest.test.ts`. Only this field and its
direct consumers change; no layout, interaction, endpoint, alias or version
change. Existing current-manifest hashing remains derived; embedded signed
evidence and historical bytes remain protected. Narrow lint/whitespace checks
are batch proof only. Module tests and React regression checks remain pending
the integrated source checkpoint.

### Coordinator assignment — complete active producer filenames

In this issue, move `src/modules/discovery/internal/operation-contract.ts` to
`src/modules/discovery/internal/tool-contract.ts` and update its existing
`src/modules/discovery/public.ts` importer. Apply the fixed Tool/Call symbol
mapping to its AE-owned examples; preserve opaque example identifiers and
protected reconciliation digest material. Issue 13/16/19 first update their
owned fields/contracts in the original file; this issue owns the final move.
The supply inventory projection consumes issue 19's `supply.tools.list`,
`supply.tools.list:v1`, `/api/v1/supply/tools/list` and `toolsList` mapping.

The following active release-tooling files also belong to this issue's
mechanical filename/import propagation. Keep their existing responsibilities;
do not rewrite dated receipts or alter historical receipt schemas/digests.

| Existing path under `tools/release/` | Target path under `tools/release/` |
| --- | --- |
| `operation-gateway-production-smoke.ts` | `tool-gateway-production-smoke.ts` |
| `operation-gateway-production-smoke-discovery.ts` | `tool-gateway-production-smoke-discovery.ts` |
| `operation-gateway-production-smoke-hosted-owner.ts` | `tool-gateway-production-smoke-hosted-owner.ts` |
| `operation-gateway-production-smoke-hosted-runtime.ts` | `tool-gateway-production-smoke-hosted-runtime.ts` |
| `operation-gateway-production-smoke-hosted-money.ts` | `tool-gateway-production-smoke-hosted-money.ts` |
| `operation-gateway-production-smoke-invocation.ts` | `tool-gateway-production-smoke-call.ts` |
| `operation-gateway-production-smoke-money.ts` | `tool-gateway-production-smoke-money.ts` |
| `operation-gateway-production-smoke-receipt.ts` | `tool-gateway-production-smoke-receipt.ts` |
| `validate-operation-gateway-production-smoke-receipt.ts` | `validate-tool-gateway-production-smoke-receipt.ts` |

Move these exact files under `tests/unit/release/` by replacing only their
`operation-gateway-` filename prefix with `tool-gateway-`:
`operation-gateway-production-smoke-config.test.ts`,
`operation-gateway-production-smoke-discovery.test.ts`,
`operation-gateway-production-smoke-earnings.test.ts`,
`operation-gateway-production-smoke-harness.ts`,
`operation-gateway-production-smoke-receipt.test.ts`, and
`operation-gateway-production-smoke-status.test.ts`.
Also update the exact imports in `tests/unit/release/payout-provider-replay.test.ts`.
Give issue 22's sole root-package writer the two exact producer paths for
`smoke:gateway:production` and `validate:release:gateway`; root `package.json`
is read-only here. Existing command keys are retained. Issue 22 applies this
receipt at its early checkpoint before accepting checks. These exact source
files and their move targets extend the finite allowlist. Core 13/16/18
field-only changes precede these moves; issue 21 alone owns these filenames.

Retain historical output receipt filenames and their CI assertions, the
recorded authorization target `/api/v1/release/operation-gateway`, and generic
`GatewaySmoke` names: a filename move does not change authenticated material
or imply a new route. Keep dated `package5-provider-operations.ts` and its test
filename; update current Tool-link fields only through their existing owners.

Verification: use the existing Vitest command to run the five renamed smoke
tests and `payout-provider-replay.test.ts` (all pass), plus the existing
discovery tests and typecheck. Do not execute the hosted production smoke
command during this source-only assignment. The two package command paths
must resolve to the moved files. No generated artifact is hand-edited.

- 2026-09-05 — Prepared as the finite discovery/plugin owner after the DX review.
  The anonymous `describe` versus call-mediated Quote flow is deliberate; no
  CLI or HTTP contract is redefined here.
