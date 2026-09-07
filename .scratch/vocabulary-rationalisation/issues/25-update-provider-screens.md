# Update Provider screens

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee:
Assigned role: Luna Max / Provider identity, connection, publication and offboarding presentation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 29, 30

## Source acceptance — 2026-09-06

Provider lifecycle presentation is SOURCE ACCEPTED with the complete issue14
module and its passed independent correction review. Issue14's current receipt
owns the exact path, test, protected-evidence and shared-workspace handoff.
Provider listing return links now target the existing Tool section; setup,
connection, publication/readiness, retry and offboarding behavior is retained.
Financial workspace sections remain issue26; public/installed producer cutovers
and final integrated/hosted proof remain their existing owners. This closure
records source acceptance, not deployment or a fully green integrated release.

## Outcome

Update the existing Provider setup, identity, connection, publication, public
listing, supply workspace, readiness and offboarding screens after issues
10-22 establish the core and public contracts. Change only AE-owned
person-facing vocabulary, accessible names, error/retry copy and copyable
Provider guidance. Preserve the existing connection handoff, source admission,
Offering/Publication/Listing lifecycle, readiness/eligibility checks, public
business record and offboarding/reconnect workflow.

A Provider performs a canonical Tool. Provider supply is not a second market
object: Offering, Publication, Listing, Source and portfolio Service remain
separate concepts. A Provider is not automatically the Seller or the payment
recipient; those records and the existing financial readback remain distinct.

## Fixed mappings and protected boundaries

| Current AE-owned screen term | Required presentation | Protection |
| --- | --- | --- |
| Supplier (performing party) | Provider | Change only AE-owned identity and supply copy. Preserve generic IAM `Principal`, `Account`, `Business`, `User` and `Credential` meanings. |
| Supplier Operation / supplier operation | Provider Tool / provider tool | A Provider performs a Tool; do not create a new Provider-specific callable object. |
| `supplierRef`/supplier identity in AE-owned Provider screens | `providerRef`/Provider identity | Consume issue 14's fields. Preserve separate Seller, payment-recipient and external registry fields. |
| `supplier_operations:v1` | `provider_tools:v1` | AE-owned display/schema label only; do not rewrite external registry or protocol schema values. |
| `marketActiveSuppliers` | `marketActiveProviders` | Consume the issue 13/14 table and projection handoff; do not perform a competing schema rename here. |
| Provider Tool current/published projection | post-13 `current-tool.ts` / `published-tool.ts` consumers | Preserve version, admission, publication, availability, provenance and qualified-use semantics. |
| paid operation invocation shown in supply history | Call | Consume issue 16's `callRef`, `quoteRef`, `toolRef` and Call status labels; never call it a Provider obligation or payout. |

Keep Offering, Publication, Listing, Source, portfolio Service, Provider
obligation, Seller, payment recipient, Charge and Payout distinct. Preserve
external OpenAPI `operationId`, MCP methods, OAuth/x402 fields, opaque IDs,
canonical hashes/signatures, business-record identifiers and source-native
credentials. No screen copy may imply that a wallet, credential, funding or
endpoint establishes a Provider/Seller role.

## Finite implementation allowlist

Every path is literal. Issue 13/14 own mechanical Tool/Provider type, field,
projection and source propagation in shared consumers first. This ticket owns
only the presentation text, accessible names, error/retry states and
copyable setup guidance in those consumers.

### Public Provider identity and listing screens

- `src/components/ae/listing/AeProviderListingPage.tsx`
- `src/components/ae/listing/PublicBusinessNotFound.tsx`
- `src/components/ae/layout/AeNotFound.tsx`
- `src/components/ae/provider-facts.exports.ts`
- `src/components/ae/provider-facts.tsx`
- `src/components/ae/settings/AeWorkspaceGeneral.tsx`
- `src/components/ae/supply/AeProviderToolDetail.tsx`
- `src/components/ae/supply/AeSupplyAgentProof.tsx`
- `src/components/ae/supply/AeSupplyLanding.tsx`
- `src/components/ae/supply/AeSupplySourceNativeStart.tsx`
- `src/components/ae/supply/AeOwnerProviderConnections.tsx`
- `src/components/ae/supply/provider-connection-target.ts`
- `src/components/ae/offerings/AeOwnerOfferings.tsx`
- `src/components/ae/offerings/AeProviderWorkspace.tsx` — issue 25
  owns Provider lifecycle, setup, connection, publication, availability,
  withdrawal and offboarding sections only. Issue 26 owns the financial
  `earnings`/payout section after this Provider pass.
- `src/components/ae/offerings/offering-presentation.ts`
- `src/components/ae/offerings/provider-workspace-projection.ts`
- `src/components/ae/offerings/provider-workspace.functions.ts`
- `src/components/ae/offerings/provider-identity.functions.ts`

The three offering helper paths are shared presentation consumers: issue 14
owns their mechanical Provider/Tool type and field propagation; this issue
owns user-visible labels and errors only. Do not change server authorization,
admission or publication decisions in these files.

### Provider routes

- `src/routes/for-providers.tsx`
- `src/routes/$slug.tsx`
- `src/routes/_operator/owner.offerings.tsx`
- `src/routes/_operator/owner.offerings.new.tsx`
- `src/routes/_operator/owner.offerings.$offeringRef.tsx`
- `src/routes/_operator/owner.supply.tsx`
- `src/routes/_operator/owner.supply.$offeringRef.tsx`
- `src/routes/_operator/owner.supply.connections.new.tsx`
- `src/routes/_operator/owner.supply.connections.oauth.callback.tsx`
- `src/routes/_operator/owner.settings.connections.tsx`
- `src/routes/_operator/owner.settings.workspace.tsx`
- `src/routes/privacy.remove-business.tsx`

`src/routes/$slug.ucp.ts` is a machine UCP producer owned by issue 21 and is
read-only here. `src/routes/_operator/owner.settings.payouts.tsx` is the
money/payout handoff owned by issue 26 and is read-only here except for a
literal route-link handoff if its target changes.

### Shared brand copy, section-owned here

- `src/content/brand-copy.ts` — own only the `BUSINESS_DOOR` export. Leave
  `AGENT_INSTRUCTION`, `AGENT_DOOR` and `AGENT_PAGE` to issue 23, `HOME` to
  issue 24 and `ABOUT` to issue 27. The section handoff is serialized 23 → 24
  → 25; do not rewrite unrelated exports.

### Focused existing behaviour tests

- `tests/unit/ui/listing-first-screen.test.tsx`
- `tests/unit/ui/provider-workspace.test.tsx`
- `tests/unit/ui/owner-provider-connections.test.tsx`
- `tests/unit/ui/provider-tool-detail.test.tsx`
- `tests/unit/ui/supply-funnel-landing.test.tsx`
- `tests/unit/ui/supply-funnel-publisher-home.test.tsx`
- `tests/unit/ui/supply-source-native-start.test.tsx`
- `tests/unit/catalog/public-business-page-not-found.test.tsx`
- `tests/unit/routes/provider-workspace-compatibility-routes.test.ts`
- `tests/unit/routes/provider-workspace-route.test.ts`
- `tests/unit/routes/owner-provider-connection-handoff-route.test.ts`
- `tests/unit/routes/owner-provider-identity-outcome.test.tsx`
- `tests/unit/routes/provider-connection-cleanup-route.test.ts`
- `tests/unit/routes/supply-owner-routes.test.ts`
- `tests/unit/routes/privacy-removal-outcome.test.tsx`

`tests/unit/ui/provider-workspace.test.tsx` is the shared workspace
evidence test. Issue 25 owns Provider lifecycle assertions; issue 26 may run
it and owns only its earnings/payout assertions after the file handoff. No
two workers may edit the shared assertions at the same time.

## Post-core handoff and sequencing

The worker must receive literal completion receipts from the preceding owners:

- Issue 13 supplies `src/modules/capability-supply/tool-source.ts`,
  `tool-projection.ts`, `current-tool.ts`, `published-tool.ts`,
  `src/modules/common/tool-ref.ts`, registry `tool-paths.ts` and the Tool
  projection/export paths. Preserve opaque `operation:v1:` identifier bytes
  even when the module is now named `tool-ref.ts`.
- Issue 14 supplies Provider-facing source/projection paths including
  `provider-tool-status.ts`, `convex/capabilityProviderTools.ts`,
  `convex/capabilityProviderToolProjection.ts`,
  `convex/capabilitySupplyCurrentTool.ts`, Provider identity fields and
  `marketActiveProviders`.
- Issue 15/16 supply `quoteRef`, `callRef`, `toolRef`, Tool version/material
  and Call status/recovery names used in Provider activity/readiness views.
- Issue 19 supplies the public `market-tools` and `tools/call` contract names;
  issue 20/21 supply installed-client/discovery/plugin names. This ticket
  consumes their exact producers in copyable Provider guidance and does not
  invent aliases or Provider action IDs.
- Issue 22 supplies generated artifacts after its producer checkpoints. Do
  not hand-edit generated router, Convex or client output.

## Explicit exclusions and sequencing

- Do not edit `PRODUCT.md`, `AGENTS.md`, `CONTEXT.md`, the accepted design,
  Wayfinder map, work record, any other issue file, generated artifacts,
  API/MCP producers, CLI/distribution,
  llms/SKILL/plugin machine copy, deployment state or documentation owned by
  issues 27/28.
- Do not rename the upstream `operationId`, MCP method, OAuth/x402 fields,
  external registry record, opaque ID/hash/signature, Seller/payment-recipient
  field or financial namespace. Do not blank or discard external ToolLink
  fields merely because their names contain `operation`.
- Do not change Offering, Publication, Listing, Source or portfolio Service
  into Tool records, or change source admission/readiness/offboarding rules.
- Do not add a Provider onboarding flow, SDK, integration, alias, filter,
  infrastructure or route hierarchy. Preserve existing OAuth/source-native
  connection, reconnect, withdraw, republish and offboarding controls.
- Do not edit `AeSupplyEarningsCard.tsx`, money formatters, owner credit/funding
  routes or payout transfer behavior; issue 26 owns them. Provider lifecycle
  copy in the shared workspace must be handed to issue 26 before its financial
  section is edited.
- Do not claim a public Provider listing, Seller identity, payout, delivery or
  purchase resolution from presentation copy alone.

## Verification commands and expected results

Run from the project checkout with Node 22 and npm 11.5.1 selected:

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" node --version
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm --version
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run --no-file-parallelism \
  tests/unit/ui/listing-first-screen.test.tsx \
  tests/unit/ui/provider-workspace.test.tsx \
  tests/unit/ui/owner-provider-connections.test.tsx \
  tests/unit/ui/provider-tool-detail.test.tsx \
  tests/unit/ui/supply-funnel-landing.test.tsx \
  tests/unit/ui/supply-funnel-publisher-home.test.tsx \
  tests/unit/ui/supply-source-native-start.test.tsx \
  tests/unit/catalog/public-business-page-not-found.test.tsx \
  tests/unit/routes/provider-workspace-compatibility-routes.test.ts \
  tests/unit/routes/provider-workspace-route.test.ts \
  tests/unit/routes/owner-provider-connection-handoff-route.test.ts \
  tests/unit/routes/owner-provider-identity-outcome.test.tsx \
  tests/unit/routes/provider-connection-cleanup-route.test.ts \
  tests/unit/routes/supply-owner-routes.test.ts \
  tests/unit/routes/privacy-removal-outcome.test.tsx
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck
```

Expected results are Node 22.x, npm 11.5.1, all focused Provider screen and
route tests green, and typecheck green after issues 10-22. The worker must
also run the exact issue 14 supply contract tests at its checkpoint; no
Provider screen assertion may be loosened to hide a source or authorization
regression. Record pre-existing baseline failures separately.

## Acceptance

- Provider setup, identity, connection, source-native handoff, publication,
  readiness, public listing, availability, withdrawal, republish and
  offboarding screens say Provider and Tool where those are AE-owned concepts,
  while preserving every current transition and retry/cancel guard.
- Provider identity is not conflated with Business, Customer, Agent, Seller or
  payment recipient. Public listing and business-not-found states preserve
  safe identity/error behavior and do not leak credentials, connection secrets
  or opaque internal records.
- Offering, Publication, Listing, Source and portfolio Service labels remain
  distinct from a canonical Tool. External registry/protocol names and
  ToolLink fields remain intact.
- Connection/admission/publication/offboarding error paths remain actionable
  and accessible: OAuth/source handoff failure, invalid/unavailable
  publication/readiness, and public listing/business-not-found or offboarding
  failure each exposes a stable retry/back/next action without changing server
  semantics.
- Provider copyable guidance uses the exact post-19/20/21 producer names and
  existing workflows. It does not add a new SDK, alias, action ID or route.
- The shared workspace Provider section is handed to issue 26 with the
  financial earnings/payout boundary explicitly untouched; focused tests and
  typecheck show no new failure.

## Closure evidence

Attach focused test and typecheck output, the final literal changed-path list,
and a short before/after assertion note for connection failure/retry,
publication/readiness failure, and public listing/offboarding recovery. Include
the `brand-copy.ts` BUSINESS_DOOR handoff and the exact shared-workspace
Provider/financial section boundary delivered to issue 26. Confirm that no
machine producer, generated output, API/MCP contract or payout implementation
was edited.

## Comments

This is a downstream presentation task, not implementation proof for the
Provider rename. Pre-cutover `supplier`/`operation` source names may remain
until issues 13/14 land; the worker must follow the receipts rather than
choosing additional vocabulary or treating those expected names as a failure.
