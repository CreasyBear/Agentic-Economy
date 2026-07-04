# S2-G3 Wedge-Agnostic Contract Pack

## Verdict

**S2-G3 verdict: GO for source-local Scope 2 capability-table work.**

**02-02 can proceed source-locally from this S2-G3 gate** because the contract below gives implementers a concrete wedge-agnostic fixture matrix, a forbidden-field scan target, allowed generic descriptor/table fields, and an orthogonal `operationMode` rule. This is not deployed/provider proof and does not clear any live launch, owner-pull, assistant-distribution, or public-copy gate.

Proof level: **source/local preflight only**.

## Evidence

- `PRODUCT.md` defines AE as a trust/discovery layer and keeps public authority to reading, comparing, routing, and qualified inquiry. It explicitly warns that AE must not imply booking, payment, dispatch, or autonomous execution before those systems exist.
- `PRODUCT.md` trust labels include `business_supplied`, `checked`, `stale`, `contradicted`, and `unsupported`; it forbids unqualified `verified` unless a specific verification standard exists and is met.
- `SCOPE-02-INDEX.md` makes S2-G3 required before 02-02/02-04 and states the wedge invariant: no `serviceArea`/`suburb`/`hours`/`urgency`/`emergency`-style fields in the new capability tables.
- `ADR-002` D1/D3 define the closed capability axis and discriminated descriptors: `informational_page`, `inquiry_intake`, `business_endpoint`, and `action_card` only.
- `ADR-002` D2 requires new business-grain tables (`businessCapabilities`, `capabilityCheckAttempts`) and forbids widening business rows; `action_card` stores a reference only, never copied provider/payment fields.
- `ADR-002` D4 fixes per-capability trust states to exactly `business_supplied`, `checked`, `stale`, `contradicted`, `unsupported`.
- `ADR-002` D9 requires derive-then-additive migration: `serviceCapabilities` stays untouched and reversible.
- `ADR-002` D10 makes `operationMode: human_operated | agent_operated | hybrid` an orthogonal business disclosure, not a capability kind or trust upgrade.
- `ADR-002` D11 requires an enforced wedge-agnostic invariant for `businessCapabilities` and `capabilityCheckAttempts`.
- 02-01 summary records Scope 2 as source-local complete, with the pure capability model and no local-service-shaped fields in `src/modules/capabilities`.
- Issue #1 / 02-01 map-line evidence for named resolutions:
  - **#12 resolved:** keep v1 `businessCapabilities` plus retained `serviceCapabilities`; no v1 rename or fold; any later fold waits until business-grain `inquiry_intake` fully replaces service-grain reads **without moving local-service fields upward**.
  - **#13 resolved:** `operationMode` remains self-declared, `business_supplied` disclosure; it is never a trust upgrade. Checked endpoint proof may support endpoint trust but is not required to say the business reports human/automated/hybrid operation.
  - **#15 resolved:** `capability` is an optional hard filter; existing callers are unchanged. Locality stays hard only for location-bearing supply and becomes ranking/context for location-neutral capability kinds. The agentTools snapshot update belongs to 02-04 and must be deliberate.

## Missing evidence

- No deployed Convex/provider check-engine proof is claimed here.
- No `ae-endpoint-check:v1` live fetch, domain-control challenge, deployed smoke, or provider readback is claimed here.
- No public copy, SEO/discovery, operation-mode UI, or agentTools snapshot update is cleared here; those remain 02-04 work and must also pass PM-03/PM-05 and copy scans.
- This artifact does not clear PM-01 owner-pull, PM-02 assistant distribution, or any Scope 1 deployed-provider gate. It only clears S2-G3 for source-local 02-02 implementation.

## Blocks / Unlocks

### Unlocks

- 02-02 may implement source-local capability tables, schema/type contracts, derive-then-additive backfill, `capability_check` source-write scope, and `tests/imports/wedge-agnostic-capability.test.ts` against this pack.
- 02-02 may derive `informational_page` and `inquiry_intake` rows from existing published service-shaped state while keeping `serviceCapabilities` untouched.
- 02-02 may include a schema-level `action_card` descriptor only as a reference shape; it must not copy action/payment/provider details.

### Blocks until later gates

- 02-03 external fetch/check engine remains blocked on the separate S2-G2 threat fixture pack and deployed/provider evidence.
- 02-04 operation-mode disclosure, registry.search filtering, llms/UCP summaries, human labels, and agentTools snapshot changes remain blocked until 02-02 lands and public-copy gates are satisfied.
- No local-service fields may move upward from `businessServices`/existing local catalog structures into `businessCapabilities`, `capabilityCheckAttempts`, business rows, registry rows, discovery rows, action rows, or receipt rows.

## Next consuming plan

Primary consumer: `.planning/scopes/scope-02-capability-registry/02-02-capability-tables-migration-PLAN.md`.

Secondary consumer: `.planning/scopes/scope-02-capability-registry/02-04-search-discovery-disclosure-copy-PLAN.md` for the `operationMode` and #15 locality/filtering rules after 02-02 succeeds.

## Contract spine

### Closed capability kinds

The v1 business-grain capability kind set is exactly:

```ts
[
  'informational_page',
  'inquiry_intake',
  'business_endpoint',
  'action_card',
]
```

No `other`, no `service`, no `booking`, no `dispatch`, no `payment`, no `emergency`, no `operationMode` capability kind.

### Capability trust states

The v1 per-capability trust state set is exactly:

```ts
[
  'business_supplied',
  'checked',
  'stale',
  'contradicted',
  'unsupported',
]
```

No `verified`. No `listed` as a per-capability state in the new capability model. `checked` means a defined check passed; it does not mean verified, bookable, payable, callable, dispatchable, or autonomous.

### Allowed generic table fields

`businessCapabilities` may use only generic business-grain capability fields:

- `businessId`
- `capabilityId`
- `kind`
- `trustState`
- `descriptor`
- `serviceId` as an optional migration/reference link only
- `sourceHash`
- `sourceVersion`
- timestamps such as `createdAt`, `updatedAt`, `checkedAt`, or equivalent source-owned time fields
- idempotency fields such as `logicalKey` if needed for derive-then-additive backfill

`capabilityCheckAttempts` may use only generic check/attempt fields:

- `attemptId`
- `businessId`
- `capabilityId`
- `checkStandardVersion`
- `status`
- facet/readback fields for reachability, schema conformance, freshness, contradiction, and redacted failure evidence
- `retryCount`
- `retryAfter`
- `failureCode`
- `failureMessageRedacted`
- `staleThresholdAt`
- `latestReadback`
- `repairAction`
- `repairResult`
- timestamps and source/audit IDs needed for reconstruction

Allowed descriptor shapes are only:

```ts
type InformationalPageDescriptor = {
  kind: 'informational_page'
  publicUrl: string
}

type InquiryIntakeDescriptor = {
  kind: 'inquiry_intake'
  serviceId?: ServiceId
  firstRequestMode: 'inquiry_available' | 'quote_request_available' | 'not_available_yet'
  publicChannel: 'public_business_contact' | 'ae_status_only' | 'not_available'
}

type BusinessEndpointDescriptor = {
  kind: 'business_endpoint'
  originUrl: string
  manifestUrl: string
  schemaRef: string
}

type ActionCardDescriptor = {
  kind: 'action_card'
  actionSlug: 'provision-paid-intake-endpoint'
  cardRef: string
}
```

`action_card` descriptors are reference-only. They must not duplicate provider, price, rail, checkout, payment, wallet, settlement, balance, credit, or fulfillment fields.

## Forbidden service-shaped fields

The following concepts must not appear as fields, descriptor keys, table columns, Convex validators, type members, row properties, DTO capability properties, action properties, receipt properties, or public/machine capability summary fields in the core capability model:

- `serviceArea`
- `suburb`
- `jobSuburb`
- `stateTerritory`
- `hoursOrUnknown`
- `hours`
- `openingHours`
- `urgency`
- `emergency`
- `emergency_callout`
- `emergency_callout_interest` as an output capability kind or descriptor field
- `serviceRadius`
- `postcode` / `postalCode`
- `availabilityWindow`
- `afterHours`

Allowed exception: 02-02 backfill code may read legacy local-service inputs from existing catalog/service rows and may use optional `serviceId` as a migration/reference link. It must not promote those legacy fields into `businessCapabilities`, `capabilityCheckAttempts`, or `CapabilityDescriptor`.

## Three-business fixture matrix

These fixtures are source-local contract fixtures. They are not proof of deployed provider behavior, live owner adoption, public copy readiness, booking, payment, dispatch, or autonomous fulfillment.

| Fixture | Business shape | Operation disclosure | Source-local input | Expected capability rows | Must not create |
|---|---|---|---|---|---|
| Local service | `fixture-local-service`: a plumbing/leak-repair business with existing service-shaped catalog rows | `operationMode: 'human_operated'`, trust `business_supplied`; stored on business only in 02-04, not on capability rows | Existing `businessServices` may contain `serviceArea`/`hoursOrUnknown`; existing `serviceCapabilities` may include `quote_request` or legacy `emergency_callout_interest` | 1. `{ kind: 'informational_page', trustState: 'business_supplied', descriptor: { kind: 'informational_page', publicUrl: '/b/fixture-local-service' } }`  2. `{ kind: 'inquiry_intake', trustState: 'business_supplied', serviceId: 'svc-local-service-001', descriptor: { kind: 'inquiry_intake', serviceId: 'svc-local-service-001', firstRequestMode: 'quote_request_available', publicChannel: 'ae_status_only' } }` | No `serviceArea`, `hours`, `suburb`, `urgency`, or `emergency` field in capability tables. Legacy `emergency_callout_interest` never becomes a capability kind; it can only fold into generic `inquiry_intake` when a published first-request path exists. |
| Software/content/agency | `fixture-software-agency`: a software/content/automation agency with no local-service geography | `operationMode: 'hybrid'`, trust `business_supplied`; not a capability kind | A claimed/published business page and a business-origin manifest URL on the controlled origin | 1. `{ kind: 'informational_page', trustState: 'business_supplied', descriptor: { kind: 'informational_page', publicUrl: '/b/fixture-software-agency' } }`  2. `{ kind: 'inquiry_intake', trustState: 'business_supplied', descriptor: { kind: 'inquiry_intake', firstRequestMode: 'inquiry_available', publicChannel: 'ae_status_only' } }`  3. `{ kind: 'business_endpoint', trustState: 'checked', descriptor: { kind: 'business_endpoint', originUrl: 'https://software-agency.example', manifestUrl: 'https://software-agency.example/.well-known/ucp', schemaRef: 'ae-ucp:v1' } }` only after source-local check fixture says all four `ae-endpoint-check:v1` facets pass | No `serviceArea`, `suburb`, `hours`, or local ranking fields. No `verified`; `checked` is the endpoint standard result only. No booking/payment/dispatch flags. |
| Commerce/ops | `fixture-commerce-ops`: an e-commerce operations or returns workflow business | `operationMode: 'agent_operated'`, trust `business_supplied`; self-declared and never a trust upgrade | A business page, a machine-readable business endpoint, and optionally a source-owned action-card reference admitted by the separate action-card owner | 1. `{ kind: 'informational_page', trustState: 'business_supplied', descriptor: { kind: 'informational_page', publicUrl: '/b/fixture-commerce-ops' } }`  2. `{ kind: 'business_endpoint', trustState: 'stale', descriptor: { kind: 'business_endpoint', originUrl: 'https://commerce-ops.example', manifestUrl: 'https://commerce-ops.example/.well-known/ucp', schemaRef: 'ae-ucp:v1' } }` when the check fixture is past the 1h business-endpoint freshness window  3. Optional schema-only/source-owned row: `{ kind: 'action_card', trustState: 'unsupported', descriptor: { kind: 'action_card', actionSlug: 'provision-paid-intake-endpoint', cardRef: 'source-local:fixture-commerce-ops:provision-paid-intake-endpoint:v1' } }` unless later P6 evidence admits a stronger state | No seller catalog, SKU, checkout, Stripe/Autumn, wallet, balance, credit, price, dispatch, fulfillment, or payment-handler fields in capability rows. `agent_operated` does not mean callable/autonomous/dispatchable. |

## Operation-mode orthogonal disclosure rule

`operationMode` is not part of the capability model in 02-02. It is an 02-04 business disclosure with exactly these values:

```ts
['human_operated', 'agent_operated', 'hybrid']
```

Rules:

1. `operationMode` belongs to the business grain, not `businessCapabilities`, `capabilityCheckAttempts`, descriptors, action cards, threads, or receipts.
2. `operationMode` always has `business_supplied` trust unless a later explicit verification standard exists. Endpoint checks do not verify business operation mode.
3. `operationMode` never creates a fifth capability kind.
4. `operationMode` never changes `CapabilityTrustState`.
5. `operationMode: 'agent_operated'` must not produce public or machine claims that AE can call, book, dispatch, transact with, supervise, or autonomously fulfill the business.
6. A checked `business_endpoint` may improve the endpoint's own capability trust state, but it does not upgrade operation-mode trust.
7. Per #13, the proof bar for operation disclosure is self-declared business-supplied disclosure; checked endpoint proof is not required merely to state that the business reports human/automated/hybrid operation.

## Exact assertions for `tests/imports/wedge-agnostic-capability.test.ts`

02-02 must encode these assertions in `tests/imports/wedge-agnostic-capability.test.ts`.

### 1. Closed kind and trust constants stay wedge-agnostic

Assert `src/modules/capabilities/public.ts` contains exactly the four business capability kinds:

```ts
['informational_page', 'inquiry_intake', 'business_endpoint', 'action_card']
```

Assert it does not add any of:

```ts
['service', 'local_service', 'service_area', 'emergency', 'emergency_callout', 'booking', 'dispatch', 'payment', 'operationMode', 'other']
```

Assert `CapabilityTrustStateValues` contains exactly:

```ts
['business_supplied', 'checked', 'stale', 'contradicted', 'unsupported']
```

Assert `CapabilityTrustStateValues` does not contain `verified`, `bookable`, `dispatchable`, `payable`, `callable`, or `autonomous`.

### 2. Capability schema uses descriptor union, not wide optional columns

Read `src/modules/capabilities/internal/schema.ts` and assert the `businessCapabilities` validator has a single `descriptor` union keyed by descriptor `kind`.

Assert the capability table definitions do not contain wide optional columns for descriptor-specific values outside the descriptor union. In particular, the table row must not have top-level fields like `publicUrl`, `originUrl`, `manifestUrl`, `schemaRef`, `actionSlug`, or `cardRef` unless those names appear inside the descriptor validator.

Assert `serviceId` is the only permitted service-grain migration/reference field.

### 3. Forbidden local-service field scan

Scan the capability schema/table definitions and fail if any forbidden token appears as a field/validator/type key:

```ts
[
  'serviceArea',
  'suburb',
  'jobSuburb',
  'stateTerritory',
  'hoursOrUnknown',
  'hours',
  'openingHours',
  'urgency',
  'emergency',
  'emergency_callout',
  'serviceRadius',
  'postcode',
  'postalCode',
  'availabilityWindow',
  'afterHours',
]
```

Important implementation note: do not make this a naive repo-wide ban. Existing catalog/service files can still contain local-service legacy inputs, and backfill may read them. The failing condition is introducing those concepts into `businessCapabilities`, `capabilityCheckAttempts`, or `CapabilityDescriptor`.

### 4. Legacy service capability fold stays generic

Assert backfill maps legacy service-grain capability kinds into generic business-grain rows:

- `phone_inquiry` -> `inquiry_intake`
- `quote_request` -> `inquiry_intake`
- `emergency_callout_interest` -> `inquiry_intake` or no row when no published first-request path exists
- `ae_hosted_discovery` -> `informational_page`

Assert no derived row has `kind: 'phone_inquiry'`, `kind: 'quote_request'`, `kind: 'emergency_callout_interest'`, or `kind: 'ae_hosted_discovery'`.

Assert `serviceCapabilities` is not renamed, deleted, folded, or treated as authoritative for the new business-grain model in 02-02. Per #12, it is retained in v1.

### 5. Three-business fixture expectations

Include the fixture matrix above directly in test data or in a helper imported only by the test, then assert:

- every fixture capability uses one of the four closed `BusinessCapabilityKindValues`;
- every fixture trust state uses one of the five `CapabilityTrustStateValues`;
- every descriptor's `kind` matches the row `kind`;
- local-service fixture has no capability-table fields named `serviceArea`, `hours`, `suburb`, `urgency`, or `emergency`;
- software/content/agency fixture can be represented without any local-service field;
- commerce/ops fixture can be represented without seller catalog, SKU, checkout, wallet, payment, provider, credit, or balance fields;
- `operationMode` appears only on the fixture business metadata, never inside a capability descriptor or capability row.

### 6. Money/provider quarantine for new capability files

Scan the new capability files and fail if capability schema/descriptors/check attempts contain money/provider rail tokens:

```ts
[
  'wallet',
  'x402',
  'autumn',
  'stripe',
  'paymentHandler',
  'payment',
  'provider',
  'checkout',
  'settlement',
  'credits',
  'balance',
  'price',
  'currency',
]
```

Allowed exception: test descriptions and comments may name forbidden tokens only in the assertion list. Production capability schema/code must not use them as fields or descriptor keys.

### 7. No row widening outside capability tables

Assert 02-02 does not add capability/endpoint/provider/payment fields to business, registry, or discovery source rows. This assertion should be anchored to schema/table definitions, not to unrelated existing strings, because discovery already has its own manifest/status vocabulary.

Minimum target files:

```ts
[
  'src/modules/business/internal/schema.ts',
  'src/modules/registry/internal/schema.ts',
  'src/modules/discovery/internal/schema.ts',
  'convex/schema.ts',
]
```

Expected result: only `convex/schema.ts` imports/registers the new `businessCapabilities` and `capabilityCheckAttempts` tables; existing business/registry/discovery table shapes remain additive-compatible and are not widened with capability payload columns.

### 8. `operationMode` is not accidentally introduced in 02-02

Assert `src/modules/capabilities/public.ts` and `src/modules/capabilities/internal/schema.ts` do not contain `operationMode`, `human_operated`, `agent_operated`, or `hybrid`.

02-04 may add those values to the business model as a separate business disclosure. 02-02 must not add them to capability rows or descriptors.

### 9. Test command wiring

`npm run test:imports` must include `tests/imports/wedge-agnostic-capability.test.ts` without weakening existing import scans or adding a new broad allowance.

If the package script is already pattern-based and automatically includes this file, the test should assert its own assumptions rather than changing package scripts unnecessarily.

## Exact 02-02 proceed rule

02-02 may proceed source-locally when all of the following are true:

1. This artifact exists.
2. 02-01 remains source-local complete.
3. The new tables are additive and do not widen existing business/registry/discovery rows.
4. The new invariant test rejects service-shaped and money/provider fields in capability tables.
5. Backfill is derive-then-additive and idempotent.
6. `serviceCapabilities` is retained per #12.
7. No public copy, route copy, deployed provider proof, live fetch proof, booking, payment, dispatch, autonomous fulfillment, or unqualified verification claim is introduced.

If any of these fail, the S2-G3 status becomes **ADAPT** for 02-02. If implementers cannot represent the software/content/agency or commerce/ops fixtures without local-service fields, the status becomes **BLOCKED** until the capability schema is redesigned.
