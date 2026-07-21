# Phase 4 source and data map

## Reuse map

| Product fact | Current source owner | Phase 4 action |
|---|---|---|
| Business identity/claim | `src/modules/business/**`, `convex/business.ts` | Reuse; migrate owner authorization to token identifier |
| Public listing/services | `src/modules/catalog/**`, `convex/catalog.ts` | Keep discovery-only; do not make executable registry |
| Capability contract | `src/modules/capability-contract-registry/**` | Reuse exact active contract/digest |
| Offering/binding/publication/readiness | `src/modules/capability-supply/**`, `convex/capabilitySupply*.ts` | Add onboarding application/projection, custody port and bounded reads |
| Credential-mode transport | binding/publication/readiness/route runtime under `src/modules/capability-supply/**` | Thread `none | managed_ref` through admission, probe and execution; never resolve or emit auth for `none` |
| Request/requirements | `src/modules/customer-request/**` | Reuse canonical Request and facts/criteria |
| Candidate/quote records | existing routing-kernel preparation tables | Implement durable Convex store; do not add quote tables |
| Comparison | `customer-option-set.ts`, `option-inspection.ts` | Feed strict operation-owned quote results; retain honest cardinality/influence |
| Authority/attempt/recovery | Customer Request v2 execution plus Action Invocation | Reuse; do not add activity/execution aggregate |
| Paid action exemplar | Phase 3C paid-operation source | Link/wrap only for paid operations; never universalize |
| Human inquiry/outbox | `src/modules/inquiries/**` | Keep communication-specific; not quote/business truth |
| Empty-search analytics | `src/modules/demand/**` | Keep analytics-only; not Request/RFQ aggregate |

## Data additions

### Phase 4A

- `capabilityOnboardingDrafts` with exact revision/owner/business/source/digests,
  `credentialMode: none | managed_ref`, opaque managed reference, issues and
  publication reference.
- optional `owners.ownerTokenIdentifier` plus
  `owners.by_ownerTokenIdentifier` during migration.
- removable `registryOperationProjectionItems` with exact publication and
  readiness references plus bounded search index.

### Phase 4B

Add operation-owned `digitalProcurementQuoteResults` and
`digitalProcurementStartWorkResults`. Existing routing-kernel offer rows refer
to these results and retain only the normalized comparison projection. Add the
Convex implementation of `StructuredQuotePreparationStore` over existing
routing-kernel rows and the candidate/attempt/offer indexes named in
`04-PLAN.md`.

### Phase 4C

Add `customerRequestV2QuoteSelections` as the versioned Request transition; do
not add a second Request or order aggregate. No new activity/order tables. If
standalone work appears in Activity, add only
an owner/principal/updatedAt continuity index to the Action Invocation control
projection. Business results stay with their operation owner.

## Query and performance contract

- All growing lists paginate or use explicit cap-plus-one reads.
- Public search returns at most 50 and does not hydrate the full supply graph.
  It follows at most three cursor pages/150 candidates and returns an explicit
  incomplete-coverage state when that ceiling prevents an exhaustive page.
- Expired routeability projection rows are invalidated in indexed batches of
  100; exact routing still revalidates canonical readiness.
- One sourcing action is capped at 32 candidates/attempts/offers; reference
  policy contacts three.
- Activity pages are bounded and ordered; child attempts/problems have explicit
  caps.
- Scale evals seed 1,000 and 10,000 unrelated records and assert unchanged read
  counts/query calls for one exact page. Wall-clock time is diagnostic only.
- Intended Phase 4 paths must remove N+1/full-table reads before exposure.
  Unrelated operator exports may be recorded without becoming the loop.

## Known source liabilities

1. Capability publication still uses Clerk subject/user identity in places;
   token identifier must become canonical before owner exposure.
2. Readiness credential resolution currently accepts `env:NAME`; model this as
   the first founder-assisted `managed_ref` adapter and support `none` for open
   endpoints across admission, readiness and execution. Do not claim
   self-service secret intake.
3. Capability graph candidate hydration is bounded but row-by-row, and current
   Customer Request discovery caps after broad hydration.
4. The active structured-quote runtime defaults to an in-memory store despite
   durable schema/readback records, and it can call quote adapters outside a
   Registered Action invocation. Both must be replaced in the intended path.
5. Registry/catalog and inquiry owner paths contain N+1 or full-table
   `.collect()` reads. Fix only those used by Phase 4 intended surfaces.
6. Existing `supplied-quote` source is explicitly development evidence and may
   not be renamed/promoted as the product RFQ operation.

## Security and privacy contract

- Derive owner/principal from authenticated server context; public inputs never
  choose their owner.
- Guard endpoints against private/link-local DNS, rebinding and redirects.
- Store normalized result facts and bounded evidence references, not raw
  provider bodies or secrets.
- Candidate contact requires exact disclosure allocation per recipient/purpose.
- Cross-principal reads return the same non-enumerating absence behavior.
- Projection membership, URL knowledge, Request possession and quote possession
  are never authority.
