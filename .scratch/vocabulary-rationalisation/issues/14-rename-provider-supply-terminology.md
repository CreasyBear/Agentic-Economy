# Rename Provider supply terminology

## Current Provider module — SOURCE ACCEPTED

Oversight completed the whole-module review and passed the bounded thirteen-file
correction delta on 2026-09-06. All four findings are resolved: protected x402
v1 `Supplier:` signed bytes and a complete literal regression; seven corrected
readiness/publication/UI fixture files; three existing `#tools` return targets;
and bounded Provider display strings. No new material findings remain. This
accepts issue14 and issue25 Provider lifecycle presentation as group four of ten.

Evidence and handoff:

- Original comparison: `/tmp/ae-provider-review-baseline-20260906/manifest.json`.
- Reviewed candidate: `/tmp/ae-provider-review-final-candidate-20260906/manifest.json`.
- Corrected immutable candidate:
  `/tmp/ae-provider-review-corrected-candidate-20260906/manifest.json` (1,788 files,
  zero capture changes). Its thirteen Provider correction paths are separate
  from the five independent Quote files present in the same snapshot.
- Final net Provider paths:
  `/tmp/ae-provider-module-final-owned-paths-20260906.txt` (91 paths). The signed
  claim source was restored to its original bytes and remains explicit in
  `/tmp/ae-provider-review-correction-paths-20260906.txt`.
- Whole review: `/tmp/ae-provider-independent-review-20260906.md`. Oversight's
  follow-up checked every correction diff/current hash and confirmed PASS.
- Owner behavior: 28 files/185 tests; checkpoint corrections: 4 files/34 tests;
  independent additional coverage: 40 files/317 tests with twelve failures
  subsequently resolved by the 10-file/67-test correction run. These groups
  overlap and must not be summed. Full lint and scoped corrective lint pass.
- Last compiler checkpoint: 363 diagnostics/80 files, with no Provider-owned
  diagnostics. Nine shared `capabilityQuotes.ts` errors belong to Quote. This
  precedes the bounded review corrections and Quote implementation; no repeated
  global scan was required for the accepted delta.
- CLI startup passes. Doctor remains 6/11 because of later buyer-contract
  fixtures; Provider rows agree. Installed-client acceptance remains open.
- React Doctor's whole-branch maintainability analysis is incomplete, with no
  valid score. No Provider errors or findings on its changed lines were found.
- No generated change was needed: Convex API/dataModel derive source imports.

Quote now resumes its complete prepared module, including shared schema/backend
and direct Call handoffs. Public supply wrapper/action IDs/routes remain issue19
ownership. Package5 historical receipts, canonical hashes, signatures, opaque
identifiers and upstream Seller/payee/protocol fields remain exact. Financial
workspace sections remain issue26. No deployment, data operation or source
commit occurred; integrated and hosted acceptance remain separate.

The earlier active/preparation sections below are historical receipts.

## Complete Provider module preparation — read-only, implementation held

One Luna Max owner prepares the next dependency-ordered module while catalogue
is the sole source writer. Inventory definitions, schemas, serializers, exports,
publication/admission/connection/offboarding callers, Provider workspace/UI,
fixtures, Package5/development script consumers, tests and generated dependencies
before any Provider edit. Preserve the existing map and fixed vocabulary; no
new planning, implementation, tests, generation or live operations during prep.

The complete boundary is issue14 plus issue25's Provider lifecycle presentation;
financial workspace sections and Quote/Call/money/public-consumer implementations
remain later owners. Shared canonical Tool producers are catalogue-owned until
acceptance. Record only concrete shared seams and remaining targeted reads;
never turn downstream compiler diagnostics into new assignments. The prepared
inventory will continue into implementation after catalogue acceptance.


### Prepared inventory — coordinator scope reconciliation

The read-only inventory below returned with one actual compaction. No conceptual
re-inventory is needed; its remaining targeted reads continue after catalogue
acceptance. The fixed queue and prior explicit caller assignments resolve these
inventory ownership ambiguities:

- Provider owns Provider identity/source-authority endpoints in `convex/catalog.ts`
  and `owner-workspace.functions.ts`, plus their Provider workspace/connection
  callers. These are not prerequisites the catalogue owner must implement.
- Provider owns owner-facing Provider Tool status, `capabilityProviderTools.ts`
  owner readback, source preview, publication/admission/readiness/withdrawal and
  `internal/publication/*`. Catalogue owns canonical public Tool projection,
  read/search/compare and its concrete shared producer handoff. Do not broaden
  catalogue to Provider lifecycle or wait for Provider work to settle itself.
- The earlier explicit Package5 clarification remains authoritative: retained
  script/test filenames are current consumers. This Provider boundary owns their
  current imports and Tool/Quote/Call fields together under the fixed mappings;
  broader Quote/Call implementation remains later. These current fields are not
  an invented permanent compatibility exception. Never execute the live script.
- `external_operation` is the external Offering access-path DTO discriminator
  in registry projections, not an admitted canonical Tool. Preserve that external
  DTO/source meaning and bytes; do not rename it by lexical inference.
- Issue25 Provider lifecycle presentation is included in this complete module,
  not a second later screen pass. Issue26 earnings/payout semantics stay separate.
- Keep the existing native route generation; any newly evidenced generation need
  is parent-owned and serialized after its producing source changes.

# Provider publication/connection inventory — continuation 1

Compaction receipt: one actual context compaction occurred. The coordinator’s latest input arrived before a second. Inventory was not restarted.

Execution authority remained the original checkout:

- `/Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy`
- branch `codex/vocabulary-rationalisation`
- `pwd` verified
- Node `v22.22.0`
- npm `11.5.1`
- a19f checkout was not used for execution
- no writes, tests, compiler, generation, installs, scripts, live operations, commits, deployments or subagents were performed

Implementation remains held pending catalogue acceptance. Catalogue is the sole active source-writing module.

## Contract boundary

Tool is the only callable supply unit.

Provider performs the Tool. Seller, payment recipient, Provider obligation, Charge, Payout, delivery and Purchase resolution remain separate facts. Offering, Publication, Listing, Source, portfolio Service and Provider connection remain separate objects.

The preserved chain is:

```text
source -> candidate Tool -> admission -> publication -> readiness/eligibility
      -> Provider connection/authority -> Call consumer -> delivery/recovery
      -> purchase/outcome consumers
```

## Catalogue-owned seams to consume, not re-inventory

Current post-13 Tool seams:

- `src/modules/capability-supply/public.ts`
- `src/modules/capability-supply/published-tool.ts`
- `src/modules/capability-supply/source-preview.ts`
- `src/modules/capability-supply/internal/publication/*`
- `convex/capabilitySupplyToolQueries.ts`
- `convex/capabilitySupplyToolShared.ts`
- `convex/capabilitySupplyToolOriginMap.ts`
- `convex/capabilitySupplyToolPorts.ts`
- `convex/capabilitySupplyTools.ts`
- `convex/capabilitySupplyCurrentTool.ts`
- `convex/capabilityProviderToolProjection.ts`
- `convex/capabilityProviderTools.ts`

Catalogue currently owns canonical Tool projections, public Tool reads/search/comparison, registry actions, market comparison/UI, shared Tool schema seams and shared fixture producers. Provider work must consume the accepted Tool contract and must not sweep catalogue-local names such as `operationRecord`, `operation`, `OperationLedgerPorts` or Tool serializer internals.

Current catalogue/provider contract mismatches requiring acceptance reconciliation:

- Provider workspace calls `catalog:getCurrentOwnerProviderIdentity`; current `convex/catalog.ts` exports `getCurrentOwnerSupplierIdentity`.
- Provider identity calls `catalog:ensureProviderBusiness`; current catalogue exports `ensureSupplierBusiness`.
- `AeProviderWorkspace.tsx` imports `renameProviderDisplayNameServer`; current `src/lib/server/owner-workspace.functions.ts` exports `renameSupplierDisplayNameServer`, backed by `catalog:renameSupplierBusiness`.
- Provider connection and owner-supply paths still call `catalog:authorizeSupplierBusiness`.
- `convex/capabilityProviderTools.ts` owner readback still returns an `operation` object.
- `provider-tool-status.ts` and supply action readbacks still use `supplier_operations:v1`.

These are shared/source-authority seams. They are not to be independently repaired before catalogue acceptance.

## Current Provider definitions and remaining changes

### Provider Tool status

Current definition:

- `src/modules/capability-supply/provider-tool-status.ts`
- `tests/unit/capability-supply/provider-tool-status.test.ts`
- `convex/capabilityProviderTools.ts`
- `src/components/ae/offerings/provider-workspace.functions.ts`
- `src/components/ae/offerings/provider-workspace-projection.ts`
- `src/components/ae/supply/AeProviderToolDetail.tsx`

Current state union:

`Draft`, `Needs setup`, `Submitted`, `Under review`, `Published`, `Paused`, `Action required`, `Retired`.

Current continuation actions include:

`supply.source.preview`, `supply.status`, `supply.recheck`, `supply.republish`, `supply.offboarding.status`.

Remaining Provider boundary work:

- `supplier_operations:v1` → `provider_tools:v1` in the status schema, Convex readback and supply action readbacks.
- Replace AE-owned user-facing `Operation`/`Operations` wording with `Tool`/`Tools`.
- Rename only AE-owned status/result fields and symbols.
- Preserve `businessRef`, `providerRef`, `toolRef`, publication revision, source provenance, readiness, health, qualified-use and call-receipt semantics.

### Provider approval

Current definition and persistence:

- `src/modules/capability-supply/provider-approval.ts`
- `tests/unit/capability-supply/provider-approval.test.ts`
- `convex/capabilityProviderApprovals.ts`
- `convex/_generated` function dependency `capabilityProviderApprovals:*`

Current behavior is already Provider-specific:

- authority generation/digest
- provider/provider-account/connection references
- scope/resource grants
- replay/conflict checks
- credential-material exclusion
- approval decision digest and evidence

No broad vocabulary change is required. Preserve approval digest material and decision evidence.

### Provider offboarding

Current definitions:

- `src/modules/capability-supply/provider-offboarding.ts`
- `convex/capabilityProviderOffboarding.ts`
- `convex/lib/providerOffboardingFreeze.ts`
- Provider workspace offboarding section in `AeProviderWorkspace.tsx`

Current lifecycle:

`cancelled → freezing → draining → waiting_for_obligations → revoking_connections → verifying_cleanup → retired`, with `action_required` branches.

Current gates:

- routeability freeze
- publication withdrawal
- Call drain
- Provider obligation and payout checks
- connection revocation/cleanup
- Offering retirement
- retention policy verification

Remaining AE-owned Tool cutover:

- `routeable_operations_remain` → Tool wording.
- `routeableOperationCount` → Tool wording.
- `operationTargetCount` → Tool target wording.
- `capabilityProviderOffboardingTargets.kind: 'operation'` → `'tool'`.
- `withdrawOperationTargetsPage`, `afterOperationRef`, `nextOperationRef`, `withdraw-operations-*` and related Provider workflow labels → Tool wording where they are AE-owned workflow contracts.
- `operationProviderRouteabilityIsFrozen` → Tool-oriented symbol.
- Offboarding UI and messages must refer to Tools.

Preserve:

- Call and obligation gates
- payout-resolution semantics
- `operationKey`
- persisted digest/version material such as `provider-offboarding-operation-authority:v1`
- target snapshot/history evidence
- generated Convex function contracts until the generator checkpoint

### Provider connection and authority

Current public export surface:

- `src/modules/capability-supply/provider-connection.ts`
- `src/modules/capability-supply/provider-connection-handoff.ts`
- `src/modules/capability-supply/server.ts`
- `src/modules/capability-supply/supply-funnel.functions.ts`

Current internal definitions:

- `src/modules/capability-supply/internal/provider-connection/types.ts`
- `command-model.ts`
- `shared.ts`
- `lease.ts`
- `owner-projection.ts`
- `audit.ts`

Current connection lifecycle:

`active`, `reauthorization_required`, `revocation_pending`, `revoked`, `cleanup_required`.

Current supported lanes:

- HTTP credential connection
- MCP OAuth connection
- credentialless x402 connection
- reconnect/reauthorization
- owner revoke
- lease issue/consume/expire/invalidate
- cleanup retry and outcome-unknown recovery

Current persisted/provider connection fields include:

- `connectionRef`
- `businessId`
- `providerRef`
- `providerAccountRef`
- adapter/source origin/environment/authentication
- granted scopes/resources
- authority generation/digest
- lifecycle/health/expiry/revocation
- credential or secret pointer state
- x402 method/payee
- evidence and command history

Remaining changes are limited to AE-owned Provider/Tool terminology and source-authority caller names. Connection semantics, authority checks, credentials, OAuth, x402 and cleanup behavior remain unchanged.

Important protected implementation:

`internal/provider-connection/lease.ts` intentionally maps `callRef` to `invocationRef` and `toolRef` to `operationRef` while calculating the lease digest. This is canonical hash material and must not be renamed.

## Persisted schemas and indexes

Primary schema source:

- `src/modules/capability-supply/internal/convex-schema.ts`
- `convex/schema.ts`
- `convex/capabilitySupplyShared.ts`
- `convex/capabilitySupplyValues.ts`
- `convex/capabilitySupplyRowMappers.ts`
- `convex/capabilitySupplyWriterPorts.ts`

Provider-relevant tables:

- `capabilityPublications`
  - Tool/publication/revision, business, source, binding, authority, readiness and disposition fields
  - indexes by publication/revision, Tool/disposition, network/disposition, business/disposition, readiness expiry, binding/disposition and source route/disposition
- `capabilitySupplyAdmissionCases`
  - admission case, business/provider/Tool/publication refs, source digest/revision, authority, state, blockers and evidence
  - indexes by case, publication/revision, Tool/version, business/submission and state/update
- `capabilityProviderToolProjections`
  - business/provider/Tool/offering/publication/binding refs and revision
  - indexes by business/update, business/Tool and business/offering
- `capabilityProviderOffboardingCases`
  - Provider/business ownership, authority provenance, target counts, workflow step/state, blockers, retention and evidence
- `capabilityProviderOffboardingTargets`
  - current `operation | offering | connection` target kinds; `operation` is the remaining Provider Tool target inconsistency
- `capabilityOfferings`
  - portfolio Offering record; remains distinct from Tool
- `capabilityTransportBindings`
  - source/binding/endpoint/authority and Provider connection references
- `capabilityProviderConnections`
  - durable connection and authority lifecycle
  - indexes by connection, business/lifecycle, business/connection, Provider/lifecycle and connection/authority generation
- `capabilityProviderConnectionAttempts`
  - HTTP/MCP source attempt, OAuth/secret state, draft/connection refs and expiry
  - indexes by attempt, command, lifecycle/expiry and business/update
- `capabilitySupplySourceDrafts`
  - source selection/draft lifecycle and connection reference
- `capabilityProviderConnectionLeases`
  - Call/Tool/connection/provider authority snapshot and lease lifecycle
- `capabilityProviderApprovals`
  - approval decision and connection authority generation

Shared schema boundaries:

- `convex/marketPresence.ts`
  - current `marketActiveProviders` aggregate/table handoff
- `convex/marketListingEvidence.ts`
  - evidence aggregate and evidence namespace; preserve
- `convex/convex.config.ts`
  - `marketActiveProviders`, `marketActiveTools` and retained `marketOperationEvidence` component
- `registeredToolMappings`
  - catalogue-owned Tool mapping; do not create a competing Provider table
- `operationKeys`
  - generic idempotency/action ledger; preserve

No Provider implementation may independently rename shared schema writers or create compatibility tables.

## Publication, admission, source and readiness

Current publication source family:

- `src/modules/capability-supply/supply-publication-v2.ts`
- `src/modules/capability-supply/source-preview.ts`
- `src/modules/capability-supply/source-authority-review.functions.ts`
- `src/modules/capability-supply/source-first-owner.ts`
- `src/modules/capability-supply/internal/admit-provider-schema.ts`
- `src/modules/capability-supply/internal/publication/{admit,draft,index,lifecycle,ports,provenance,publish,refresh,source,validate,withdraw}.ts`
- `src/modules/capability-supply/internal/supply-funnel/{publication-admit,publication-import,source-first-owner,types}.ts`
- `src/modules/capability-supply/internal/publication-importer-{agent-plugin,mcp,openapi,types,x402-bazaar,x402}.ts`
- `src/modules/capability-supply/internal/publication-importers.ts`

Current behavior:

- preview OpenAPI, MCP, Agent Plugin and x402 sources
- derive a bounded source candidate
- validate input/output schemas
- require Provider authority for protected sources
- create/save source drafts
- admit and prepare canonical publication material
- bind Provider connection authority
- publish one exact Tool revision
- perform readiness/eligibility/probe checks
- support refresh, withdrawal and republish
- retain source digest/revision, publication revision and evidence

Remaining changes:

- `SupplyOperationCandidate` and related AE-owned candidate/result names → Tool terminology.
- Owner-facing source/admission/error copy → Provider/Tool vocabulary.
- `OwnerSupplyOperationEvidence` and AE-owned status/refusal labels → Tool vocabulary.
- `operation_not_found`, `operation_not_keyless`, `operation_not_executable`, `operation_conflict`, `operation_commitment_stale` require bounded review as supply-module result names.
- `source.operation` in OpenAPI import material is source-native/OpenAPI structure and is not a blanket rename.
- `external_operation` access-path/source enum requires contract-owner confirmation before any change.
- `operationKey`, operation ledger names, source digests, publication hashes and upstream operation identifiers remain protected.

The readiness/eligibility/graph boundary is:

- `src/modules/capability-supply/internal/eligibility/{decision,exact,index,list,ports,projection,replay,write}.ts`
- `src/modules/capability-supply/internal/graph/{ports,qualify-candidate,read-probe-target,record-probe-result}.ts`
- `src/modules/capability-supply/internal/readiness-probe-shared.ts`
- `src/modules/capability-supply/internal/readiness-probe.ts`
- `readiness-probe-http.ts`
- `readiness-probe-mcp.ts`
- `readiness-probe-x402.ts`
- `convex/capabilitySupplyEligiblePorts.ts`
- `convex/capabilitySupplyGraph.ts`
- `convex/capabilitySupplyGraphPorts.ts`
- `convex/capabilitySupplyProbes.ts`
- `convex/capabilitySupplyReadiness.ts`

These consume Tool refs, publication state and Provider connection authority. They require bounded Provider/Tool field propagation only; readiness and eligibility behavior must not change.

## Convex Provider implementations

Current Provider function modules:

- `convex/capabilityProviderApprovals.ts`
- `convex/capabilityProviderConnectionAgents.ts`
- `convex/capabilityProviderConnectionAttempts.ts`
- `convex/capabilityProviderConnectionCleanup.ts`
- `convex/capabilityProviderConnectionCleanupAction.ts`
- `convex/capabilityProviderConnectionMigration.ts`
- `convex/capabilityProviderConnections.ts`
- `convex/capabilityProviderOffboarding.ts`
- `convex/capabilityProviderTools.ts`
- `convex/capabilityProviderToolProjection.ts`
- `convex/lib/providerConnections/{agent,authority,cleanup,codecs,contracts,leases,lifecycle,owner}.ts`
- `convex/lib/providerOffboardingFreeze.ts`

Current exported behavior includes:

- owner/agent connection listing and detail
- HTTP/MCP connection attempt reservation
- OAuth preparation, callback binding and secret provisioning
- x402 inspection, payee claim and credentialless connection
- reconnect/reauthorize
- revoke and lease invalidation
- external cleanup action and retry
- authority migration
- Provider Tool owner/agent projections
- offboarding case creation, freeze, withdrawal, Call drain, obligation/payout gate, connection revoke, verification and retirement

Remaining concrete Convex changes:

- Provider Tool result field names and status schema
- offboarding Tool target/count/cursor vocabulary
- Provider identity source-function names after catalogue acceptance
- bounded stale action/error/copy fields
- Provider fields in shared row mappers/ports
- generated function references after source acceptance

## Supply action and serializer boundary

Current action module:

- `src/modules/capability-supply/supply-actions.ts`

Current action groups:

- source preview
- status
- operations list
- publish
- withdraw
- recheck
- republish
- earnings
- connection list/detail/connect/reconnect/revoke
- offboarding status

Remaining inconsistencies:

- status schema still `supplier_operations:v1`
- status parameter metadata still says `operationRef` while the input schema uses `toolRef`
- expected evidence still includes `supplier_operation_lifecycle` and `supplier_operation_collection`
- action names/summaries still say Supplier/Operation
- source/publish/withdraw/recheck/republish effect metadata still has stale operation wording
- public supply list route remains `supply.operations.list` and `/api/v1/supply/operations/list`

The public action/HTTP route mapping is explicitly issue19-owned. Record the dependency; do not invent new Provider action IDs or public routes in this module pass.

Current serializers/validators:

- Zod status/offboarding/action schemas
- Provider connection lifecycle/projection/command schemas
- source preview and candidate schemas
- publication/import schemas
- Convex `v.*` validators in Provider modules
- stable JSON source descriptors/selectors
- Provider owner projections
- cleanup result codecs
- published Tool parse/materialization

Only AE-owned surrounding names change. Protocol fields, exact selectors, credentials, x402 fields and hash material remain byte-stable.

## Provider workspace and UI

Current post-14 UI paths:

- `src/components/ae/offerings/AeProviderWorkspace.tsx`
- `src/components/ae/offerings/provider-workspace.functions.ts`
- `src/components/ae/offerings/provider-workspace-projection.ts`
- `src/components/ae/offerings/provider-identity.functions.ts`
- `src/components/ae/offerings/AeOwnerOfferings.tsx`
- `src/components/ae/offerings/offering-presentation.ts`
- `src/components/ae/supply/AeProviderToolDetail.tsx`
- `src/components/ae/supply/AeOwnerProviderConnections.tsx`
- `src/components/ae/supply/AeSupplyAgentProof.tsx`
- `src/components/ae/supply/AeSupplyLanding.tsx`
- `src/components/ae/supply/AeSupplySourceNativeStart.tsx`
- `src/components/ae/supply/provider-connection-target.ts`
- `src/components/ae/provider-facts.tsx`
- `src/components/ae/provider-facts.exports.ts`
- `src/components/ae/settings/AeWorkspaceGeneral.tsx`
- `src/components/ae/listing/AeProviderListingPage.tsx`
- `src/components/ae/listing/PublicBusinessNotFound.tsx`
- `src/components/ae/layout/AeNotFound.tsx`

Current workspace sections:

- Tool inventory and lifecycle status
- Provider readiness and connection summary/detail
- public Tool status
- Provider identity
- earnings/payout readback
- Provider offboarding

Issue25 owns Provider/Tool presentation, labels, accessible names, retry/error copy and setup guidance. Issue26 owns earnings/payout semantics.

Concrete remaining UI changes:

- Supplier → Provider
- Operation/Operations → Tool/Tools where the term denotes the AE callable Tool
- `supplier-identity` / `supplier-connections` anchors → Provider anchors
- `AeSupplyAgentProof` operation list/row naming and copy
- `AeSupplyLanding` Supplier eyebrow, Operation publication copy and sentence
- `AeSupplySourceNativeStart` candidate and submission copy
- `AeProviderToolDetail` all lifecycle, withdraw and republish copy
- `AeOwnerProviderConnections` Operation copy and connection guidance
- `offering-presentation.ts` replacement copy currently converts “published offering”/“capabilities” to Operation language
- fix the current “an Tool” grammatical copy in `AeProviderWorkspace.tsx`
- preserve “service” where it means portfolio/source onboarding, not callable Tool

Current stale UI/test contracts observed:

- `src/routes/_operator/owner.settings.workspace.tsx` redirects to `#supplier-identity`
- `src/routes/_operator/owner.settings.connections.tsx` redirects to `#supplier-connections`
- workspace tests still expect `supplier-identity-controls`
- workspace tests still use “Manage supplier identity” and “Try supplier identity again”
- `tests/unit/routes/provider-workspace-compatibility-routes.test.ts`
- `tests/e2e/owner-operations-compatibility.spec.ts`
- `tests/unit/routes/owner-provider-identity-outcome.test.tsx`

Provider connection target IDs from `provider-connection-target.ts` are a current UI anchor contract and should remain stable.

## Provider routes

Current route files:

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

Current route behavior is preserved:

- owner offerings compatibility route loads Provider workspace
- add-service route previews source, starts connection handoff and submits publication
- Tool detail route reads Provider Tool status and performs maintenance actions
- connection routes handle HTTP credentials and MCP OAuth
- public slug route renders the Provider Listing
- privacy route handles public correction/removal
- legacy owner/supply routes remain compatibility routes

Remaining presentation changes include stale titles and metadata such as `Publish an Operation`, `Supplier unavailable`, `Loading supplier`, `Operations`, supplier correction/removal copy and old identity/connection anchors.

Read-only exclusions:

- `src/routes/$slug.ucp.ts`
- `src/routes/_operator/owner.settings.payouts.tsx`, except a literal route-link handoff if required
- route-generation output

## Direct callers and factories

Direct source callers include:

- `src/routes/_operator/owner.offerings.tsx`
- `src/routes/_operator/owner.offerings.new.tsx`
- `src/routes/_operator/owner.supply.$offeringRef.tsx`
- `src/lib/operator/supply-compatibility.ts`
- `src/lib/server/supply-landing.functions.ts`
- `src/lib/server/owner-workspace.functions.ts`
- `src/modules/capability-supply/internal/supply-funnel/connections.ts`
- `src/modules/capability-supply/internal/supply-funnel/source-first-owner.ts`
- `src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts`
- `src/modules/capability-supply/internal/publication/*`
- route transport modules
- catalogue Tool readers and Provider projection consumers

Shared test/factory callers include:

- `tests/unit/capability-supply/publication-commands-harness.ts`
- `tests/unit/capability-supply/publication-importers-harness.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-harness.ts`
- `tests/unit/convex/capability-call-worker-harness.ts`
- `tests/unit/ui/supply-funnel-harness.tsx`
- `tests/integration/capability-supply-registration-harness.ts`
- `tests/integration/capability-supply-owner-funnel-*`
- current catalogue Tool fixture producers

## Behavior test groups

Existing Provider publication/connection/offboarding tests:

- `tests/unit/capability-supply/provider-tool-status.test.ts`
- `tests/unit/capability-supply/admit-provider-schema.test.ts`
- `tests/unit/capability-supply/provider-approval.test.ts`
- `tests/unit/capability-supply/provider-connection.test.ts`
- `tests/unit/capability-supply/provider-connection-handoff.test.ts`
- `tests/unit/capability-supply/owner-x402-connection-environment.test.ts`
- `tests/unit/capability-supply/provider-offboarding.test.ts`
- `tests/unit/capability-supply/supply-source-preview.test.ts`
- `tests/unit/capability-supply/supply-publication-v2.test.ts`
- `tests/unit/capability-supply/supply-funnel.test.ts`
- `tests/unit/capability-supply/supply-actions.test.ts`
- `tests/unit/capability-supply/supply-writers.test.ts`
- `tests/unit/capability-supply/eligible-supply.test.ts`
- `tests/unit/capability-supply/published-tool.test.ts`
- publication command prepare/publish/refresh/republish/thinness/withdraw tests
- publication importer MCP/OpenAPI/x402 tests
- publication lifecycle/validation tests

Convex connection tests:

- `tests/unit/convex/provider-connection-agent-lifecycle.test.ts`
- `tests/unit/convex/provider-connection-authority-migration.test.ts`
- `tests/unit/convex/provider-connection-cleanup.test.ts`
- `tests/unit/convex/provider-connection-revocation.test.ts`
- `tests/unit/convex/credentialless-x402-connection-authority.test.ts`
- `tests/unit/convex/readiness-action-authority.test.ts`

Integration tests:

- `tests/integration/capability-provider-offboarding.test.ts`
- `tests/integration/provider-connection-attempts.test.ts`
- `tests/integration/provider-connection-owner-x402-onboarding.test.ts`
- `tests/integration/provider-business-bootstrap.test.ts`
- `tests/integration/capability-publication-graph.test.ts`
- `tests/integration/capability-publication-owner.test.ts`
- `tests/integration/capability-publication-probe.test.ts`
- `tests/integration/capability-publication-projected-support.test.ts`
- `tests/integration/capability-publication-publish.test.ts`
- `tests/integration/capability-publication-refresh.test.ts`
- `tests/integration/capability-publication-security.test.ts`
- `tests/integration/capability-supply-integration-draft.test.ts`
- `tests/integration/capability-supply-owner-funnel-publish.test.ts`
- `tests/integration/capability-supply-owner-funnel-read.test.ts`
- `tests/integration/capability-supply-owner-funnel-run-test.test.ts`
- `tests/integration/capability-supply-owner-sandbox-staging.test.ts`
- registration binding/eligibility/offering/quarantine tests

UI and route tests:

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
- `tests/unit/server/provider-workspace-functions.test.ts`

Fixture tests currently retain historical filenames:

- `tests/unit/provider-operation-fixture/development-provider-operation.test.ts`
- `tests/unit/provider-operation-fixture/development-provider-operation-packet.test.ts`

They import the new `provider-tool` fixture source but retain old descriptions/action wording. Rename or update only according to the established fixture mapping.

## Development fixtures and Package 5

Current development producers:

- `tools/dev/development-provider-tool-evidence.ts`
- `tools/dev/fixtures/provider-tool/development-provider-tool-context.ts`
- `development-provider-tool-evidence.ts`
- `development-provider-tool-fixture.ts`
- `development-provider-tool-spending-policy.ts`
- `development-provider-tool-objective.ts`
- `development-provider-tool-offset-rule.ts`
- `development-provider-tool-packet.ts`
- `development-provider-tool-provider.ts`
- `development-provider-tool-recovery.ts`
- `development-provider-tool-runner.ts`
- `development-provider-tool-signing-custody.ts`
- `development-provider-tool.actions.ts`

Current source producers already use Provider Tool paths and Tool action names. Do not rework the entire catalogue fixture seam.

Live Package 5 consumer boundary:

- `tools/release/package5-provider-operations.ts`
- `tests/unit/release/package5-provider-operations.test.ts`
- `tools/release/package5-reference-provider-fixtures.ts`
- `tests/unit/release/package5-reference-provider.test.ts`

The Package 5 files retain their filenames, Package 5 identity, receipt formats and historical results. The bounded Provider work covers current imports and Tool fields. Existing `operationRef`, `commitmentRef`, `operation.invoke` and paid Quote/Call fields require later-owner coordination; they are not permanent compatibility exceptions and must not be blanket-renamed in this Provider pass.

Do not execute the development evidence script, Package 5 script or smoke command.

## Generated API/function/route dependencies

Generated outputs are not editable in this inventory:

- `convex/_generated/api.d.ts`
- `convex/_generated/api.js`
- `convex/_generated/dataModel.d.ts`
- `src/routeTree.gen.ts`

Targeted generated dependencies include:

- `capabilityProviderTools:readOwner`
- `capabilityProviderTools:listOwner`
- `capabilityProviderConnections:listOwner`
- Provider connection attempt reserve/read/cancel/prepare/bind functions
- Provider connection reconnect/revoke/cleanup functions
- `capabilityProviderApprovals:*`
- `capabilityProviderOffboarding:readStatus`
- `capabilityProviderOffboarding:startCase`
- `capabilityProviderOffboarding:resumeCase`
- `capabilityProviderOffboarding:cancelCase`
- `internal.capabilityProviderOffboarding.*` workflow steps
- internal Provider connection cleanup/migration/lease functions
- generated route entries for owner offerings/supply/connection routes and `api.internal.provider-connection-cleanup`

Issue22 owns regeneration and generated consistency. Public `registry.operations.*` → `registry.tools.*` and market route cutover belong to issue19. `/api/v1/registry`, `marketExternalRegistry`, `registrySearchDocuments` and `api-registry:v1` remain protected external-registry boundaries.

## Protected exceptions

Preserve exactly:

- upstream `seller` vocabulary and x402 Seller claim material
- payment recipient/payee identity
- OpenAPI `operationId`
- MCP methods, tool names and protocol fields
- OAuth fields and source-native credentials
- x402 fields, payment challenge, network, asset, payee and signature
- opaque IDs and prefixes including `operation:v1:`
- canonical `operationRef`/`invocationRef` mappings used in hashes
- `operationKey`, idempotency and generic action-operation keys
- canonical hashes, signatures, digest versions and test vectors
- published/current Tool snapshot material and historical evidence
- generic IAM `Principal`, `Account`, `Business`, `User`, `Credential`, `DelegationGrant`
- generic Action execution and `src/modules/action-invocation/*`
- financial/evidence namespaces, including Charges, Provider obligations, Payouts, `providerConsequenceJournal`, `marketOperationEvidence` and Qualified Use
- Quote, paid Call, money, delivery, recovery and Purchase consumers owned by later issues
- external registry and public registry contracts
- portfolio Service, Offering, Publication, Listing, Source and Provider connection distinctions
- Package 5 filenames, receipt formats, identity and history
- generated files
- payout/earnings implementation owned by issue26
- UCP route owned by issue21
- dated research and historical results

## Cross-module dependencies

- Catalogue acceptance must settle the canonical Tool projection, public Tool serializer/readback, Provider identity endpoints, `marketActiveProviders`, Provider Tool projection fields and shared fixture producers.
- `sourceWriteAdmission` and `catalog_publish` remain the source-write gate. No new Provider writer, permission, onboarding behavior or architecture is authorized.
- Issue15 owns Quote consumers.
- Issue16 owns paid Call fields and invocation presentation.
- Issue17/18 own money, Provider obligations, Payout, durable consequence and recovery records.
- Issue19 owns public action/HTTP route mappings.
- Issue20 owns CLI contracts.
- Issue21 owns UCP/discovery machine output.
- Issue22 owns generated checkpoints.
- Issue25 owns Provider presentation after the source contract is accepted.
- Issue26 owns earnings/payout UI and route.
- Issue28 owns historical research/results.

## Existing verification commands — not run

Provider domain/publication/connection/offboarding:

```sh
npm exec vitest run \
  tests/unit/capability-supply/provider-tool-status.test.ts \
  tests/unit/capability-supply/provider-connection.test.ts \
  tests/unit/capability-supply/provider-connection-handoff.test.ts \
  tests/unit/capability-supply/provider-offboarding.test.ts \
  tests/unit/capability-supply/publication-lifecycle.test.ts \
  tests/unit/capability-supply/publication-commands-publish.test.ts \
  tests/unit/capability-supply/publication-commands-refresh.test.ts \
  tests/unit/capability-supply/publication-commands-withdraw.test.ts \
  tests/unit/capability-supply/supply-funnel.test.ts \
  tests/unit/convex/provider-connection-agent-lifecycle.test.ts \
  tests/unit/convex/provider-connection-authority-migration.test.ts \
  tests/unit/convex/provider-connection-cleanup.test.ts \
  tests/unit/convex/provider-connection-revocation.test.ts \
  tests/integration/capability-provider-offboarding.test.ts \
  tests/integration/capability-publication-publish.test.ts \
  tests/integration/capability-publication-refresh.test.ts \
  tests/integration/provider-connection-attempts.test.ts \
  tests/integration/provider-business-bootstrap.test.ts \
  tests/unit/schema/convex-schema.test.ts
```

UI/routes:

```sh
npm exec vitest run \
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
```

Existing project commands to run only after acceptance:

```sh
npm run typecheck
npm run check:convex-codegen
npm run test:conformance
npm run test:release:package5
```

`npm run smoke:release:package5` executes the live Package 5 script and remains forbidden in this preparation turn.

## Exact remaining targeted reads before editing

No further conceptual inventory is required. Before any implementation, read only these bounded contracts:

1. Catalogue acceptance/current seam:
   - targeted exports and Tool return shapes in `src/modules/capability-supply/public.ts`
   - current `convex/capabilitySupplyToolQueries.ts`
   - current `convex/capabilitySupplyToolShared.ts`
   - current `convex/capabilityProviderTools.ts`
   - accepted `convex/catalog.ts` identity function names

2. Source-write gate:
   - `convex/sourceWriteAdmission.ts`: `requireSourceWrite`, `sourceWriteArgs`
   - `src/lib/server/source-write-admission.ts`: context/request admission and request projection helpers

3. Convex publication/readiness blocks:
   - `convex/capabilitySupplyPublish.ts`: prepared publication handler, publication readback, bootstrap source decoding and Tool/Provider field propagation
   - `convex/capabilitySupplyReadiness.ts`
   - `convex/capabilitySupplyProbes.ts`
   - `convex/capabilitySupplyOwnerFunnel.ts`
   - `convex/capabilitySupplyOwnerFunnelCommands.ts`
   - `convex/capabilitySupplyOwnerFunnelProjection/*`
   - `convex/capabilitySupplyOwnerStaging.ts`
   - `convex/capabilitySupplyOwnerSupply.ts`
   - `convex/capabilitySupplyLists.ts`
   - `convex/capabilitySupplyCommands.ts`
   - `convex/capabilitySupplyPublicationPorts.ts`
   - `convex/capabilitySupplyRowMappers.ts`
   - `convex/capabilitySupplyWriterPorts.ts`

4. Provider connection mutation contracts:
   - `convex/capabilityProviderConnectionAttempts.ts`: owner reserve/read/cancel/source-draft/HTTP prepare/OAuth prepare/OAuth bind
   - `convex/capabilityProviderConnections.ts`: owner list/read/reconnect/revoke/cleanup retry
   - `convex/lib/providerConnections/owner.ts`: owner authority, runtime preparation, revoke and cleanup paths
   - `convex/lib/providerConnections/lifecycle.ts`: create/refresh/revoke/cleanup persistence

5. Remaining UI presentation sources:
   - `src/components/ae/listing/AeProviderListingPage.tsx`
   - `src/components/ae/listing/PublicBusinessNotFound.tsx`
   - `src/components/ae/layout/AeNotFound.tsx`
   - `src/components/ae/settings/AeWorkspaceGeneral.tsx`
   - `src/components/ae/offerings/AeOwnerOfferings.tsx`
   - `src/content/brand-copy.ts`, BUSINESS_DOOR section only
   - targeted route chunks listed above

6. Package 5 bounded consumer:
   - import/selector/Tool fields in `tools/release/package5-provider-operations.ts`
   - corresponding assertions in `tests/unit/release/package5-provider-operations.test.ts`
   - referenced `package5-reference-provider-fixtures.ts` and `package5-reference-provider.test.ts`

7. Generated references:
   - targeted `rg` entries only in `convex/_generated/api.d.ts`, `convex/_generated/api.js`, `convex/_generated/dataModel.d.ts` and `src/routeTree.gen.ts`
   - read `convex/_generated/ai/guidelines.md` immediately before any Convex edit

The next context should begin with these targeted reconciliation reads, then execute the held Provider implementation after catalogue acceptance.

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee:
Assigned role: Luna Max / Provider supply implementation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 29, 30

## Outcome

Replace AE-owned Supplier terminology with Provider terminology across supply
setup, connection, admission, publication, availability and offboarding. The
Provider is the party performing a Tool; the existing connection, publication,
readiness, eligibility, withdrawal, reconnect and offboarding transitions must
remain behaviourally identical. This issue follows issue 13's Tool catalogue
rename and consumes its renamed files and fields in one serialized source and
schema pass.

## Fixed mappings

| Existing AE-owned name | Replacement | Rule |
| --- | --- | --- |
| Supplier (performing party) | Provider | Use only for AE-owned product/source contracts and UI-facing source labels. |
| Supplier Operation / supplier operation | Provider Tool / provider tool | A Provider performs a canonical Tool; do not create a second supply object. |
| `supplierRef`, `supplierId`, `supplier` in AE-owned Provider supply fields | `providerRef`, `providerId`, `provider` | Apply only where the field denotes the performing Provider. Preserve separate Seller/payment-recipient fields. |
| `supplier_operations:v1` | `provider_tools:v1` | AE-owned schema label only; do not change an upstream protocol/schema value. |
| `marketActiveSuppliers` | `marketActiveProviders` | Physical table/index rename, completing issue 13's shared schema checkpoint. |
| `capabilitySupplierOperationProjections` | `capabilityProviderToolProjections` | Already physically renamed by issue 13; update Provider-side row semantics/readers here, without a competing table. |
| `capabilitySupplierOperations.ts` | `capabilityProviderTools.ts` | Consume issue 13's renamed file; update remaining Provider terminology and callers here. |
| `capabilitySupplierOperationProjection.ts` | `capabilityProviderToolProjection.ts` | Consume issue 13's renamed file; preserve its Tool projection behaviour. |
| `supplier-operation-status.ts` | `provider-tool-status.ts` | File and exported status vocabulary are renamed. |

The accepted public action and HTTP mappings belong to issue 19. Record the
dependency for `registry.operations.*` → `registry.tools.*` and the market
route cutover, but do not implement public routes or invent Provider-specific
action IDs in this issue. Issue 22 owns generated artifacts and must regenerate
after this shared source/schema checkpoint and again at final integration.

## Exact owned file mapping

Every path below is literal. No whole-directory assignment is implied. Paths
renamed by issue 13 are shown at their post-13 location where this issue must
make the Provider follow-through; shared files are explicitly serialized.

### Supply source and Provider connection/publication

- `src/modules/capability-supply/supplier-operation-status.ts` → `src/modules/capability-supply/provider-tool-status.ts`
- `src/modules/capability-supply/provider-connection.ts`
- `src/modules/capability-supply/provider-connection-handoff.ts`
- `src/modules/capability-supply/provider-approval.ts`
- `src/modules/capability-supply/provider-offboarding.ts`
- `src/modules/capability-supply/supply-actions.ts` (shared with issue 13; issue 13's Tool pass precedes this Provider pass)
- `src/modules/capability-supply/supply-funnel.functions.ts`
- `src/modules/capability-supply/supply-publication-v2.ts`
- `src/modules/capability-supply/source-authority-review.functions.ts`
- `src/modules/capability-supply/source-first-owner.ts`
- `src/modules/capability-supply/published-tool.ts` (the post-13 path for `published-operation.ts`; Provider labels are updated here)
- `src/modules/capability-supply/public.ts` (shared export and Provider-facing source types)
- `src/modules/capability-supply/server.ts` (shared source entry points)
- `src/modules/capability-supply/internal/admit-provider-schema.ts`
- `src/modules/capability-supply/internal/provider-connection/audit.ts`
- `src/modules/capability-supply/internal/provider-connection/command-model.ts`
- `src/modules/capability-supply/internal/provider-connection/lease.ts`
- `src/modules/capability-supply/internal/provider-connection/owner-projection.ts`
- `src/modules/capability-supply/internal/provider-connection/shared.ts`
- `src/modules/capability-supply/internal/provider-connection/types.ts`
- `src/modules/capability-supply/internal/publication/admit.ts`
- `src/modules/capability-supply/internal/publication/draft.ts`
- `src/modules/capability-supply/internal/publication/index.ts`
- `src/modules/capability-supply/internal/publication/lifecycle.ts`
- `src/modules/capability-supply/internal/publication/ports.ts`
- `src/modules/capability-supply/internal/publication/provenance.ts`
- `src/modules/capability-supply/internal/publication/publish.ts`
- `src/modules/capability-supply/internal/publication/refresh.ts`
- `src/modules/capability-supply/internal/publication/source.ts`
- `src/modules/capability-supply/internal/publication/validate.ts`
- `src/modules/capability-supply/internal/publication/withdraw.ts`
- `src/modules/capability-supply/internal/supply-funnel/connections.ts`
- `src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff-contract.ts`
- `src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts`
- `src/modules/capability-supply/internal/supply-funnel/publication-admit.ts`
- `src/modules/capability-supply/internal/supply-funnel/publication-import.ts`
- `src/modules/capability-supply/internal/supply-funnel/source-first-owner.ts`
- `src/modules/capability-supply/internal/supply-funnel/types.ts`
- `src/modules/capability-supply/internal/eligibility/decision.ts`
- `src/modules/capability-supply/internal/eligibility/exact.ts`
- `src/modules/capability-supply/internal/eligibility/index.ts`
- `src/modules/capability-supply/internal/eligibility/list.ts`
- `src/modules/capability-supply/internal/eligibility/ports.ts`
- `src/modules/capability-supply/internal/eligibility/projection.ts`
- `src/modules/capability-supply/internal/eligibility/replay.ts`
- `src/modules/capability-supply/internal/eligibility/write.ts`
- `src/modules/capability-supply/internal/graph/ports.ts`
- `src/modules/capability-supply/internal/graph/qualify-candidate.ts`
- `src/modules/capability-supply/internal/graph/read-probe-target.ts`
- `src/modules/capability-supply/internal/graph/record-probe-result.ts`
- `src/modules/capability-supply/internal/readiness-probe-shared.ts`
- `src/modules/capability-supply/internal/readiness-probe.ts`
- `src/modules/capability-supply/internal/route-transport-http-json.ts`
- `src/modules/capability-supply/internal/route-transport-invoke.ts`
- `src/modules/capability-supply/internal/route-transport-x402-payment.ts`
- `src/modules/capability-supply/internal/route-transport-x402.ts`
- `src/modules/capability-supply/internal/publication-importer-agent-plugin.ts`
- `src/modules/capability-supply/internal/publication-importer-mcp.ts`
- `src/modules/capability-supply/internal/publication-importer-openapi.ts`
- `src/modules/capability-supply/internal/publication-importer-types.ts`
- `src/modules/capability-supply/internal/publication-importer-x402-bazaar.ts`
- `src/modules/capability-supply/internal/publication-importer-x402.ts`
- `src/modules/capability-supply/internal/publication-importers.ts`

### Convex Provider supply and shared schema

- `convex/capabilityProviderApprovals.ts`
- `convex/capabilityProviderConnectionAgents.ts`
- `convex/capabilityProviderConnectionAttempts.ts`
- `convex/capabilityProviderConnectionCleanup.ts`
- `convex/capabilityProviderConnectionCleanupAction.ts`
- `convex/capabilityProviderConnectionMigration.ts`
- `convex/capabilityProviderConnections.ts`
- `convex/capabilityProviderOffboarding.ts`
- `convex/capabilityProviderTools.ts` (post-13 path for `capabilitySupplierOperations.ts`; Provider-side callers only)
- `convex/capabilityProviderToolProjection.ts` (post-13 path for `capabilitySupplierOperationProjection.ts`; Provider-side callers only)
- `convex/capabilitySupplyCommands.ts`
- `convex/capabilitySupplyCurrentTool.ts` (post-13 path for `capabilitySupplyCurrentOperation.ts`)
- `convex/capabilitySupplyEligiblePorts.ts`
- `convex/capabilitySupplyGraph.ts`
- `convex/capabilitySupplyGraphPorts.ts`
- `convex/capabilitySupplyIntegrationDrafts.ts`
- `convex/capabilitySupplyLists.ts`
- `convex/capabilitySupplyOwnerFunnel.ts`
- `convex/capabilitySupplyOwnerFunnelCommands.ts`
- `convex/capabilitySupplyOwnerFunnelProjection.ts`
- `convex/capabilitySupplyOwnerFunnelProjection/contracts.ts`
- `convex/capabilitySupplyOwnerFunnelProjection/offering_projection.ts`
- `convex/capabilitySupplyOwnerStaging.ts`
- `convex/capabilitySupplyOwnerSupply.ts`
- `convex/capabilitySupplyToolPorts.ts` (post-13 path; issue 13 owns the
  `capabilitySupplyOperationPorts.ts` → `capabilitySupplyToolPorts.ts` move;
  this issue owns the Provider field/type follow-through only)
- `convex/capabilitySupplyProjection.ts`
- `convex/capabilitySupplyProbes.ts`
- `convex/capabilitySupplyPublicationPorts.ts`
- `convex/capabilitySupplyPublish.ts`
- `convex/capabilitySupplyReadiness.ts`
- `convex/capabilitySupplyRowMappers.ts`
- `convex/capabilitySupplyShared.ts`
- `convex/capabilitySupplyValues.ts`
- `convex/capabilitySupplyWriterPorts.ts`
- `convex/capabilitySupplyToolQueries.ts` (post-13 path for `capabilitySupplyOperationQueries.ts`)
- `convex/capabilitySupplyToolShared.ts` (post-13 path for `capabilitySupplyOperationShared.ts`)
- `convex/capabilitySupplyTools.ts` (post-13 path for `capabilitySupplyOperations.ts`)
- `convex/capabilitySupplyToolOriginMap.ts` (post-13 path for `capabilitySupplyOperationOriginMap.ts`)
- `convex/marketPresence.ts`
- `convex/marketListingEvidence.ts`
- `convex/convex.config.ts`
- `convex/schema.ts`
- `convex/lib/providerConnections/agent.ts`
- `convex/lib/providerConnections/authority.ts`
- `convex/lib/providerConnections/cleanup.ts`
- `convex/lib/providerConnections/codecs.ts`
- `convex/lib/providerConnections/contracts.ts`
- `convex/lib/providerConnections/leases.ts`
- `convex/lib/providerConnections/lifecycle.ts`
- `convex/lib/providerConnections/owner.ts`
- `convex/lib/providerOffboardingFreeze.ts`
- `convex/providerConsequenceHttp.ts`

`convex/schema.ts`, `convex/marketPresence.ts`, and the capability/market
schema modules are shared writers. Issue 13 completes the Tool-side table
names first; this issue then completes `marketActiveProviders` and Provider
row fields. Issue 15 and issue 16 must wait for this checkpoint. Issue 18 owns
the `providerConsequenceJournal` table and money/durable fields; this ticket
only hands Provider identity through and does not rename its financial or audit
semantics.

### Known callers, fixtures and tests

Rename the two test files whose names carry Supplier terminology; update the
remaining listed tests in place so connection/publication callers are not left
on a definition-only half:

- `tests/unit/capability-supply/supplier-operation-status.test.ts` → `tests/unit/capability-supply/provider-tool-status.test.ts`
- `tests/integration/supplier-business-bootstrap.test.ts` → `tests/integration/provider-business-bootstrap.test.ts`
- `tests/unit/capability-supply/admit-provider-schema.test.ts`
- `tests/unit/capability-supply/owner-x402-connection-environment.test.ts`
- `tests/unit/capability-supply/provider-approval.test.ts`
- `tests/unit/capability-supply/provider-connection-handoff.test.ts`
- `tests/unit/capability-supply/provider-connection.test.ts`
- `tests/unit/capability-supply/provider-offboarding.test.ts`
- `tests/unit/capability-supply/publication-commands-harness.ts`
- `tests/unit/capability-supply/publication-commands-prepare.test.ts`
- `tests/unit/capability-supply/publication-commands-publish.test.ts`
- `tests/unit/capability-supply/publication-commands-refresh.test.ts`
- `tests/unit/capability-supply/publication-commands-republish.test.ts`
- `tests/unit/capability-supply/publication-commands-thinness.test.ts`
- `tests/unit/capability-supply/publication-commands-withdraw.test.ts`
- `tests/unit/capability-supply/publication-importers-harness.ts`
- `tests/unit/capability-supply/publication-importers-mcp.test.ts`
- `tests/unit/capability-supply/publication-importers-openapi.test.ts`
- `tests/unit/capability-supply/publication-importers-x402.test.ts`
- `tests/unit/capability-supply/publication-lifecycle.test.ts`
- `tests/unit/capability-supply/publication-validate.test.ts`
- `tests/unit/capability-supply/supply-funnel.test.ts`
- `tests/unit/capability-supply/supply-publication-v2.test.ts`
- `tests/unit/capability-supply/supply-actions.test.ts` (shared after issue 13)
- `tests/unit/capability-supply/supply-writers.test.ts` (shared after issue 13)
- `tests/unit/capability-supply/eligible-supply.test.ts` (Tool/Provider row consumer)
- `tests/unit/capability-supply/published-tool.test.ts` (post-13 path)
- `tests/unit/convex/provider-connection-agent-lifecycle.test.ts`
- `tests/unit/convex/provider-connection-authority-migration.test.ts`
- `tests/unit/convex/provider-connection-cleanup.test.ts`
- `tests/unit/convex/provider-connection-revocation.test.ts`
- `tests/unit/convex/credentialless-x402-connection-authority.test.ts`
- `tests/integration/capability-provider-offboarding.test.ts`
- `tests/integration/capability-publication-graph.test.ts`
- `tests/integration/capability-publication-owner.test.ts`
- `tests/integration/capability-publication-probe.test.ts`
- `tests/integration/capability-publication-projected-support.test.ts`
- `tests/integration/capability-publication-publish.test.ts`
- `tests/integration/capability-publication-refresh.test.ts`
- `tests/integration/capability-publication-security.test.ts`
- `tests/integration/capability-supply-integration-draft.test.ts`
- `tests/integration/capability-supply-owner-funnel-publish.test.ts`
- `tests/integration/capability-supply-owner-funnel-read.test.ts`
- `tests/integration/capability-supply-owner-funnel-run-test.test.ts`
- `tests/integration/capability-supply-owner-sandbox-staging.test.ts`
- `tests/integration/capability-supply-registration-binding.test.ts`
- `tests/integration/capability-supply-registration-eligibility.test.ts`
- `tests/integration/capability-supply-registration-harness.ts`
- `tests/integration/capability-supply-registration-offering.test.ts`
- `tests/integration/capability-supply-registration-quarantine.test.ts`
- `tests/integration/provider-connection-attempts.test.ts`
- `tests/integration/provider-connection-owner-x402-onboarding.test.ts`
- `tests/integration/provider-business-bootstrap.test.ts` (post-rename path)
- `tests/unit/schema/convex-schema.test.ts`
- `tests/unit/provider-operation-fixture/development-provider-operation.test.ts`
- `tests/unit/provider-operation-fixture/development-provider-operation-packet.test.ts`

The two current fixture test paths above must update their Tool vocabulary in
place or be renamed only with their explicit fixture source mapping below.
The Provider UI, route and historical package tests are later consumers, not
silently omitted callers.

### Current fixture source and generated/consumer handoff

These finite development fixture files are source producers for Provider Tool
examples and must be updated with the source cutover:

- `tools/dev/development-provider-operation-evidence.ts` → `tools/dev/development-provider-tool-evidence.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-context.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-context.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-evidence.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-evidence.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-fixture.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-fixture.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-spending-policy.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-spending-policy.ts` (post-12 path; issue 12 owns the standing-policy rename)
- `tools/dev/fixtures/provider-operation/development-provider-operation-objective.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-objective.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-offset-rule.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-offset-rule.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-packet.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-packet.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-provider.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-provider.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-recovery.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-recovery.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-runner.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-runner.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-signing-custody.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-signing-custody.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation.actions.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool.actions.ts`

Issue 22 regenerates `convex/_generated/api.d.ts`,
`convex/_generated/api.js`, `convex/_generated/dataModel.d.ts` and
`src/routeTree.gen.ts`; do not edit those outputs here. Issue 19/21 own public
routes, installed clients, plugin instructions and external action names.

## Protected boundaries and explicit exclusions

- `Service`, `Offering`, `Publication`, `Listing` and `Source` remain distinct
  records. When their AE-owned callable field is a Tool reference, issue 13's
  `operationRef` → `toolRef` mapping applies; this issue only updates a
  Provider identity field and must not blanket-exclude those Tool references.
- Keep Provider, upstream Seller and payment recipient distinct. The upstream
  `seller` vocabulary in x402/OpenAPI/MCP and these exact source boundaries is
  protected: `src/modules/capability-supply/internal/x402-seller-claim.ts`,
  `src/modules/capability-supply/internal/x402-seller-endpoint-inspector.ts`,
  `src/modules/capability-supply/internal/x402-seller-onboarding/identity.ts`,
  `src/modules/capability-supply/internal/x402-seller-onboarding/types.ts`,
  `src/modules/capability-supply/internal/x402-seller-onboarding/canary.ts`,
  `src/modules/capability-supply/internal/x402-seller-onboarding/promotion.ts`.
  Rename only an AE-owned surrounding Provider field, never the protocol key or
  evidence bytes.
- Keep `/api/v1/registry`, `marketExternalRegistry`,
  `registrySearchDocuments`, `api-registry:v1` and the external registry tests
  unchanged. This issue does not merge external metadata into the market.
- Do not rename generic IAM `Principal`, Account, Business, User, Credential
  or DelegationGrant; generic Action execution remains issue 11. Do not edit
  `src/modules/action-invocation/*` or its tables.
- Issue 18 owns `providerConsequenceJournal`, financial tables, Provider
  obligations, payout/charge fields and durable Call records. Preserve seller,
  payment and authority namespaces while handing Provider references over.
- UI files (`src/components/ae/supply/AeSupplierOperationDetail.tsx`,
  `src/components/ae/offerings/supplier-identity.functions.ts`,
  `src/routes/for-providers.tsx`, `tests/unit/ui/owner-provider-connections.test.tsx`,
  `tests/unit/ui/supplier-operation-detail.test.tsx`,
  `tests/unit/routes/owner-supplier-identity-outcome.test.tsx`) are issue 25's
  finite consumer scope. Do not pre-empt that issue here.
- Historical Package 5/release records and dated research remain issue 28's
  preserve-and-cross-reference scope; do not rewrite
  `research/PACKAGE-5-SUPPLIER-OPERATIONS-PRIMITIVES-RESEARCH.md` or dated results.
  **Coordinator clarification, 2026-09-06:**
  `tools/release/package5-provider-operations.ts` is still executed by the
  maintained `smoke:release:package5` command and included in typecheck; its
  source and `tests/unit/release/package5-provider-operations.test.ts` are live
  consumers, not immutable run evidence. The Provider group's bounded consumer
  slice owns their current imports and Tool/Quote/Call fields together, using
  the fixed source mappings. Retain both filenames, Package 5 identity, receipt
  formats and historical results. Do not execute the live script. This resolves
  the earlier blanket exclusion consistently with issue 21's retained-filename,
  current-link rule; it does not rewrite history or create compatibility aliases.
- No aliases, compatibility framework, migration engine, new dependency,
  generated-file hand edit, deployment, hosted cutover or data reset.

## Dependencies and sequencing

- Baseline 08 and independent reviews 29/30, plus core identity/action/
  authorization issues 10–12, must be closed before dispatch.
- Issue 13 is the preceding shared Tool/schema writer. Issue 14 is the only
  Provider supply writer; issue 15 (Quote) and issue 16 (paid Call) wait for
  this source/schema checkpoint. Shared files such as `supply-actions.ts`,
  `published-tool.ts`, `convex/schema.ts` and `convex/marketPresence.ts` are
  serialized 13 then 14; no worker may claim parallel green halves.
- Issue 19 consumes the final AE-owned Tool/Provider action and route fields;
  issue 22 must run its intermediate generator checkpoint after these physical
  table/function names and its final regeneration later. Issue 18 consumes
  Provider references in money/durable records without moving their ownership.
- The hosted cutover (31/35) and Package 6/7 remain held by their accepted
  dependencies; this ticket does not authorize deployment or reset.

## Verification commands and expected results

Run with Node `22.x` and npm `11.5.1`, using the existing test runner only:

```sh
npm exec vitest run \
  tests/unit/capability-supply/provider-tool-status.test.ts \
  tests/unit/capability-supply/provider-connection.test.ts \
  tests/unit/capability-supply/provider-connection-handoff.test.ts \
  tests/unit/capability-supply/provider-offboarding.test.ts \
  tests/unit/capability-supply/publication-lifecycle.test.ts \
  tests/unit/capability-supply/publication-commands-publish.test.ts \
  tests/unit/capability-supply/publication-commands-refresh.test.ts \
  tests/unit/capability-supply/publication-commands-withdraw.test.ts \
  tests/unit/capability-supply/supply-funnel.test.ts \
  tests/unit/convex/provider-connection-agent-lifecycle.test.ts \
  tests/unit/convex/provider-connection-authority-migration.test.ts \
  tests/unit/convex/provider-connection-cleanup.test.ts \
  tests/unit/convex/provider-connection-revocation.test.ts \
  tests/integration/capability-provider-offboarding.test.ts \
  tests/integration/capability-publication-publish.test.ts \
  tests/integration/capability-publication-refresh.test.ts \
  tests/integration/provider-connection-attempts.test.ts \
  tests/integration/provider-business-bootstrap.test.ts \
  tests/unit/schema/convex-schema.test.ts
npm run typecheck
```

Expected: Provider connection, reconnect, admission, publication, readiness,
withdrawal and offboarding tests pass with unchanged transition and authority
semantics; the active-provider table/index and `provider_tools:v1` label are
present; typecheck passes. Existing baseline `test:ts-standards` findings are
separate evidence and are not reclassified here. Issue 22, not this worker,
runs `npm run check:convex-codegen` against generated outputs.

## Acceptance

- [x] All literal Provider source, schema, fixture, caller and test paths above
      use the fixed Provider/Tool terms, with no definition-only half.
- [x] Supplier→Provider fields, status exports, schema label and
      `marketActiveSuppliers`→`marketActiveProviders` table/index mapping are
      complete, while issue 13's Tool mapping remains intact.
- [x] Provider connection ownership, admission, publication, readiness,
      reconnect, withdraw and offboarding behaviour, leases and authority are
      unchanged.
- [x] Provider, Seller, payment recipient, Provider obligation and Tool
      reference meanings remain separate; upstream protocol fields/values are
      byte-for-byte unchanged.
- [x] External registry and portfolio records remain distinct, and Tool
      references inside retained records are mapped only at their AE-owned
      field boundary.
- [x] Shared schema and generated checkpoints are handed to issues 15, 16 and
      22 in order. No alias, new dependency, custom migration or deployment is
      introduced.

## Closure evidence

Attach the reviewable patch, focused Provider connection/publication/offboarding
test and typecheck output, the final Supplier→Provider/file/table mapping, and
the explicit handoff receipt for issue 15 and issue 22's intermediate generator
checkpoint. Record any occurrence whose meaning is genuinely ambiguous for the
coordinator instead of selecting a new term.

## Queue correction: Provider workspace and downstream file handoff — 2026-09-05

The Provider workspace source family was missing an explicit mechanical move in
the initial allowlist. Add the following exact paths to this issue's source
cutover. The worker updates imports, exported types/functions and Provider/Tool
reference fields in every listed direct caller; issue 25 then owns the visible
Provider lifecycle/setup/publication/offboarding copy in the post-move files.
No Offering, Publication, Listing, Source or portfolio Service record is
renamed or merged.

### Exact Provider workspace source mappings

- `src/components/ae/offerings/AeOwnerOperationsWorkspace.tsx` →
  `src/components/ae/offerings/AeProviderWorkspace.tsx`
- `src/components/ae/offerings/owner-operations-projection.ts` →
  `src/components/ae/offerings/provider-workspace-projection.ts`
- `src/components/ae/offerings/owner-operations.functions.ts` →
  `src/components/ae/offerings/provider-workspace.functions.ts`
- `src/components/ae/offerings/supplier-identity.functions.ts` →
  `src/components/ae/offerings/provider-identity.functions.ts`
- `src/components/ae/supply/AeSupplierOperationDetail.tsx` →
  `src/components/ae/supply/AeProviderToolDetail.tsx`

Within those files, apply these exact AE-owned symbol mappings:

- `AeOwnerOperationsWorkspace` → `AeProviderWorkspace`
- `OwnerOperationsProjectionRow` → `ProviderWorkspaceProjectionRow`
- `OwnerOperationsInventoryRow` / `OwnerOperationsInventoryResult` →
  `ProviderWorkspaceInventoryRow` / `ProviderWorkspaceInventoryResult`
- `OwnerOperationsLifecycleRow` / `OwnerOperationsLifecycleResult` →
  `ProviderWorkspaceLifecycleRow` / `ProviderWorkspaceLifecycleResult`
- `OwnerSupplierOperationStatusResult` → `ProviderToolStatusResult`
- `OwnerOperationsConnectionsResult` / `OwnerOperationsConnectionsDetailResult` →
  `ProviderWorkspaceConnectionsResult` /
  `ProviderWorkspaceConnectionsDetailResult`
- `OwnerOperationsPayoutResult` → `ProviderWorkspacePayoutResult`
- `OwnerOperationsPublicStatusResult` → `ProviderWorkspacePublicStatusResult`
- `OwnerOperationsIdentityDetailResult` → `ProviderWorkspaceIdentityDetailResult`
- `OwnerOperationsPageResult` → `ProviderWorkspacePageResult`
- `projectOwnerOperations` → `projectProviderWorkspace`
- `ensureSupplierBusinessServer` → `ensureProviderBusinessServer`
- `SupplierOperation` / `supplierOperation` → `ProviderTool` /
  `providerTool` wherever those names denote the AE performing-party Tool;
  preserve any upstream `seller` or external protocol field.
- `readOwnerOperationsPageServer` / `readOwnerOperationsPageThroughSource` →
  `readProviderWorkspacePageServer` /
  `readProviderWorkspacePageThroughSource`
- `readOwnerOperationsIdentityDetailServer` →
  `readProviderWorkspaceIdentityDetailServer`
- `readOwnerSupplierOperationStatusServer` → `readProviderToolStatusServer`
- `readOwnerOperationsConnectionsSummaryServer` /
  `readOwnerOperationsConnectionsSummaryThroughSource` →
  `readProviderWorkspaceConnectionsSummaryServer` /
  `readProviderWorkspaceConnectionsSummaryThroughSource`
- `readOwnerOperationsConnectionsDetailServer` →
  `readProviderWorkspaceConnectionsDetailServer`
- `readOwnerOperationsPayoutSummaryServer` /
  `readOwnerOperationsPayoutSummaryThroughSource` →
  `readProviderWorkspacePayoutSummaryServer` /
  `readProviderWorkspacePayoutSummaryThroughSource`
- `readOwnerOperationsPublicStatusServer` /
  `readOwnerOperationsPublicStatusThroughSource` →
  `readProviderWorkspacePublicStatusServer` /
  `readProviderWorkspacePublicStatusThroughSource`

The exact downstream test paths for issue 25/26 are handed over here; issue 14
owns the import/symbol propagation and issue 25/26 own the assertions belonging
to their surfaces:

- `tests/unit/ui/owner-operations-workspace.test.tsx` →
  `tests/unit/ui/provider-workspace.test.tsx`
- `tests/unit/routes/owner-operations-compatibility-routes.test.ts` →
  `tests/unit/routes/provider-workspace-compatibility-routes.test.ts`
- `tests/unit/routes/owner-operations-route.test.ts` →
  `tests/unit/routes/provider-workspace-route.test.ts`
- `tests/unit/server/owner-operations-functions.test.ts` →
  `tests/unit/server/provider-workspace-functions.test.ts`
- `tests/unit/ui/supplier-operation-detail.test.tsx` →
  `tests/unit/ui/provider-tool-detail.test.tsx`
- `tests/unit/routes/owner-supplier-identity-outcome.test.tsx` →
  `tests/unit/routes/owner-provider-identity-outcome.test.tsx`

The following direct callers remain at their existing route/test filenames but
must import the post-14 Provider workspace/detail paths and symbols in the same
mechanical pass:

- `src/routes/_operator/owner.offerings.tsx`
- `src/routes/_operator/owner.offerings.new.tsx`
- `src/routes/_operator/owner.supply.$offeringRef.tsx`
- `src/components/ae/offerings/AeOwnerOperationsWorkspace.tsx` (before move;
  internal relative imports become the post-move Provider paths)
- `src/lib/operator/supply-compatibility.ts`
- `tests/unit/routes/owner-provider-connection-handoff-route.test.ts`
- `tests/unit/ui/offering-surfaces.test.tsx`
- `tests/unit/ui/supply-funnel-publisher-home.test.tsx`
- `tests/e2e/owner-operations-compatibility.spec.ts`

The route compatibility and E2E test filenames above retain their existing
Offering/owner route assertions unless the explicit test mappings above apply;
their imports and visible Provider/Tool labels consume the post-14 files. This
is a serialized handoff to issue 25/26, not permission to redesign lifecycle
routes or financial records. The existing Provider connection, publication,
withdrawal, reconnect, payout and offboarding semantics remain unchanged.

### Root manifest handoff

Root `package.json` is read-only for this issue; issue 22 is the sole manifest
writer at the early generator checkpoint and final integration. Supply this
exact existing key/path receipt without adding a script or dependency:

- `evidence:operation:development` → `evidence:tool:development`, with
  `tools/dev/development-provider-operation-evidence.ts` →
  `tools/dev/development-provider-tool-evidence.ts` as the existing producer
  path.

All other root scripts, package metadata, lockfile entries and command keys
remain unchanged. The `packages/cli/package.json` boundary belongs to issue 20;
this handoff does not claim it.
