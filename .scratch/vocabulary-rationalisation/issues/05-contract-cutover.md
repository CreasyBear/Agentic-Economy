# Choose one coordinated vocabulary cutover and necessary exceptions

Type: grilling
Label: wayfinder:grilling
Status: resolved
Parent: ../map.md
Blocked by: 02, 03, 04

## Question

How do AE-owned clients, public contracts, generated artifacts and stored models
move to the agreed vocabulary together? Joel supports whole-platform migration;
choose exact boundaries from the inventory rather than assuming this authorises
breaking independently used integrations or rewriting immutable references.

Decide which changes are direct renames, which need an existing platform migration
mechanism, and which old protocol/historical names remain. If compatibility is
necessary, identify its real consumer and removal condition; do not retain two
permanent product vocabularies or introduce speculative duplicate APIs/tables.
Preserve behaviour and money/authority semantics. Record API/version/cache/client
update implications without treating interface naming as implementation approval.

## Answer

Resolved by Joel's accepted `Mature vocabulary refactor — implementation plan`
on 2026-09-05. AE-owned clients, contracts, storage names and current product
surfaces move as one coordinated cutover; there are no users requiring legacy
client support. Do not retain parallel old product APIs, aliases, duplicate
tables or a compatibility vocabulary. Directly rename AE-owned definitions and
their known callers, tests, files, functions, indexes, events and physical
tables through the ordered implementation tickets. External protocol fields
and values remain whatever their upstream standard requires.

The public contract cutover is exact:

| Existing | Replacement |
| --- | --- |
| `registry.operations.*` | `registry.tools.*` |
| `operation.inspect` | `tool.quote` |
| `operation.invoke` | `tool.call` |
| `operation.list` | `call.list` |
| `operation.status/cancel/reconcile` | `call.status/cancel/reconcile` |
| `/api/v1/market-operations/*` | `/api/v1/market-tools/*` |
| `/api/v1/operations/inspect` | `/api/v1/tools/quote` |
| `/api/v1/operations/call` | `/api/v1/tools/call` |
| `GET /api/v1/operations` | `GET /api/v1/calls` |
| `/api/v1/operations/{invocationRef}` and recovery suffixes | `/api/v1/calls/{callRef}` and the same suffixes |
| `operationRef`, `commitmentRef`, `invocationRef` | `toolRef`, `quoteRef`, `callRef` |

The AE-owned non-identity schema label `supplier_operations:v1` becomes
`provider_tools:v1`. MCP `/mcp`, MCP methods, upstream OpenAPI `operationId`,
OAuth standard fields, x402 payment fields, portfolio Service APIs and
market-request APIs are not redesigned. MCP tool names remain derived from
their action IDs. The physical table mappings are owned by the relevant core
issues in the accepted plan, including `actionInvocation*` ->
`actionExecution*`, `capabilitySupplierOperationProjections` ->
`capabilityProviderToolProjections`, `registeredOperationMappings` ->
`registeredToolMappings`, `capabilityOperationCommitments` -> `capabilityQuotes`,
`capabilityOperationInvocations` -> `capabilityCalls`,
`capabilityOperationCallProjections` -> `capabilityCallProjections`, and the
`marketOperation*`/`marketActive*` -> `marketTool*`/`marketActive*` mappings.
No generic IAM, financial or Convex component table is renamed merely because
an old word appears in it.

Rebuild development and test data only after a verified supported Convex
backup and restoration demonstration. Preserve old outcome evidence, external
payment history, webhook history and storage references; do not rewrite backup
archives to simulate renames. Use the hosted-test maintenance window and
reconnect fresh identities and seed data only after callback/job isolation is
proven. There is no production/mainnet rollout, domain change or new Vercel
project in this cutover. Rollback restores the matched previous
application/backend configuration and retained data; any new external
financial effect is reconciled before rollback and is never blindly replayed.

The following distinctions remain explicit throughout the cutover: generic IAM
`Principal`, Account, Business, User, Credential and DelegationGrant; Offering,
Publication, Listing, Source and portfolio Service; qualified `SuppliedQuote`;
Provider, Seller and payment recipient; Charge, Provider obligation, payable
amount, payout, delivery status and payment status. Opaque identifier prefixes,
canonical hash material, signatures and external financial namespaces are
protected byte-level exceptions. A Quote remains bound inputs, price, terms,
permissions, expiry and retry conditions; a Call remains one accepted Tool use;
generic Action execution remains distinct; purchase resolution/status is not a
second purchase object.

## Dependencies and sequencing

- Issue 09 establishes current canonical prose, while issues 29 and 30 review
  the accepted execution queue independently. Baseline issue 08 and both
  reviews block core implementation issues 10–28.
- Shared source/schema/public-contract writers are serialized by the core
  tickets. Generated Convex/router/CLI/public artifacts run only after their
  source owners and through existing generators.
- Issue 31 completes deployment preflight before local data rebuild, live QA and
  the hosted-test cutover (issues 33–35). Issue 36 closes evidence and hands
  coherent contracts to held Package 6 and Package 7 owners.
- The rejected standalone-register proposal is superseded; no duplicate
  tracker, migration engine or purchase object is authorised.

## Closure evidence

- [x] Whole-platform AE-owned client and contract cutover, with no legacy
      consumer or permanent alias requirement, is recorded.
- [x] Exact HTTP/action/reference and schema-label mappings are recorded, with
      upstream protocol and MCP boundaries explicit.
- [x] Physical table renames are delegated to their owning core issues and
      generic IAM, financial, portfolio and Convex component names are
      protected from blanket renaming.
- [x] Backup/restore, fresh-seed, maintenance-window, callback-isolation and
      rollback constraints are recorded without performing a reset or deploy.
- [x] Historical evidence and external financial history are retained, and
      Package 6/7 remain held until the refactor handoff is complete.
