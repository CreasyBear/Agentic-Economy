# T11 — Supply landing and self-serve API publishing

## Context

Ticket `.planning/wayfinder/tickets/T11-supply-funnel.md` asks for the supply side of the marketplace: a dedicated landing page and a resumable path from an API-native business to a published, priced service that can receive an agent call. The destination is binding in `.planning/wayfinder/MAP.md` Destination v2: businesses list agent-callable services free, choose a per-call price (a free call price is allowed), agent operators use prepaid AE credit, and AE takes a rake on paid calls.

The live source already has the required lower rails, but no owner-facing composition:

- Catalog Offerings are the human source of business facts, price notes, comparable price, and access paths. The owner editor and its resumable browser draft are `src/components/ae/offerings/AeOwnerOfferings.tsx` and `src/components/ae/offerings/owner-offering.functions.ts`.
- Capability publication is the source-owned promotion path. `normalizeCapabilityPublication` accepts AE envelope, OpenAPI HTTP, MCP, and x402 input; `preparePublicationDraft`/`admitPublicationDraft` normalize and admit it; `publishCapabilityCommand` registers the contract, offering, binding, and publication with idempotent operation identity.
- T5 already landed `PUBLIC_CREDENTIAL_REF = 'none'`. It is admitted only for `http-json:v1`; readiness skips credential resolution and route transport omits `Authorization`.
- Readiness is a source-owned observation with a five-minute healthy TTL and one-minute unhealthy TTL. It returns explicit credential, endpoint, HTTP, content-type, size, and response refusals.
- `convex/catalogSupplyProjection.ts` derives Offering support from exact catalog lineage plus admitted/conformant capability bindings and fresh healthy readiness. The public `/api/v1/services` and MCP actions use the same `projectPublicServicesPage` projection. `/mcp` exposes the registered read-only MCP actions; it is not a second catalog.
- Owner writes are authenticated browser writes. `convex/capabilitySupply.ts:publishCapability` checks `ownsPublishedBusiness` from the Clerk session. T3 API keys are billing identity (`principalId: clerk_api_key:<id>`), not owner publish authority and not a reason to expose a write action through anonymous MCP.

Research is binding. The funnel order and status rail borrow Apify's Development → Publication/monetization → Testing → Promotion sequence and its explicit publication completion state. Pricing uses Apify PPE's measurable primary event and maximum-cost idea plus RapidAPI's free hard-cap shape, without copying RapidAPI tier names or prices. The landing and single-player value use Chen's hard-side and atomic-network patterns. Payment copy uses Gurley's in-flow payment-flow/rake framing. The three initial measurements adapt the named a16z fill-rate, time-to-match, and market-depth metrics. Sources: `research/2026-07-30-marketplace-pattern-borrow.md` §§1,3,4,5 and “Transferable shape for AE”; `research/2026-07-30-flywheel-patterns.md` §§1–2 and “Transferable shape for AE”.

## Decisions settled

1. **Dedicated supply route.** Add public `GET /for-providers` (`src/routes/for-providers.tsx`) and keep `/` as the demand-side one-view. `/for-providers` is a landing page, not a directory and not a second catalog. Its signed-out CTA is `/claim?source=supply`; its signed-in-owner CTA is `/owner/supply`. The owner route remains under the existing `/_operator` authentication boundary. This is the smallest supply-first atomic network: one API publisher plus one reliable operation, not a promise of catalog scale. [Flywheel pattern, Chen atomic network and hard side](../research/2026-07-30-flywheel-patterns.md#1-andrew-chen--the-cold-start-problem)

2. **Hero sentence is exact and deliberately not an invented growth claim.** Use this researched sentence verbatim as the supply offer:

   > List your API service; agents discover it and pay per successful call from prepaid AE credit; you set the price (free tier allowed); AE meters each call and pays you less a disclosed rake.

   Keep the sentence in a labelled “Supply offer” block, with the current evidence note at the decision point: “Your listing, checks, and call records are visible here; live metering and payouts depend on the enabled money rail.” Do not insert a guessed rake percentage. `[HITL]` T12 must settle the AE rake and payout/KYC policy before copy may change “a disclosed rake” to “you keep X%” or say “automatic payouts.” [Marketplace pattern, “Supply offer sentence — COPY”](../research/2026-07-30-marketplace-pattern-borrow.md#transferable-shape-for-ae); [Flywheel pattern, payment-flow and rake](../research/2026-07-30-flywheel-patterns.md#2-gurley--a16z-marketplace-canon)

3. **Payment is collected in-flow, never invoiced to the provider later.** The landing, pricing review, and owner call log show the deterministic shape `gross call price → disclosed AE fee → provider net`. The publish confirmation must show the same preview before committing. T11 does not implement settlement or payout; T12 owns the append-only credit/charge ledger and refusal vocabulary. A provider is never billed later as a marketplace tax. [Flywheel pattern, Gurley payment-flow factor and rake](../research/2026-07-30-flywheel-patterns.md#2-gurley--a16z-marketplace-canon); [Marketplace pattern, “Rake and payout rail — COPY”](../research/2026-07-30-marketplace-pattern-borrow.md#transferable-shape-for-ae)

4. **The “what assistants see” proof is generated, never hand-typed.** The route loader calls `listMcpActions()` and maps each result through `describeActionForAgent`; it also calls `registryServicesListAction` and keeps the returned `projectPublicServicesPage` result. `AeSupplyAgentProof` renders those descriptors and current service rows, including an honest empty state. It must not contain a hard-coded tool count, action description, service example, price, provider, or endpoint. Human headings use “What assistants can see”; technical IDs may appear only in a disclosure/details block populated from descriptors. The proof is a projection of the same action registry, `/api/v1/services`, and `/mcp` surfaces, not evidence that an operation is routeable or fulfilled. [Marketplace pattern, service-card shape and flattened-price warning](../research/2026-07-30-marketplace-pattern-borrow.md#5-agenticmarket--x402-directory-and-service-card-pricing); [Flywheel pattern, source-first supply and evidence boundary](../research/2026-07-30-flywheel-patterns.md#transferable-shape-for-ae)

5. **One semantic object remains the catalog Offering plus capability promotion.** Do not add a supply catalog, copy `ServiceDto`, or create a second price authority. The flow updates the existing Catalog Offering and its `external_operation` access path, then promotes that exact Offering lineage into capability-supply with `origin.kind = 'catalog_offering'`. `/api/v1/services`, the MCP service actions, the public business listing, and the owner preview continue to project the existing source. [Marketplace pattern, Apify README/public Store projection](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)

6. **A same-browser draft is the resumable state; published records are the durable state.** Reuse `OWNER_OFFERING_DRAFT_STORAGE_KEY` for the Describe step and add `OWNER_SUPPLY_DRAFT_STORAGE_KEY = 'ae.supplyFunnelDraft.v1'` for normalized source/config, probe evidence, pricing config, test-call receipt, and completed step keys. Validate the version and size on every read; discard malformed drafts. Store no provider secret, API key, payment credential, or raw authorization value in browser state. A credential field stores only an `env:NAME` reference. On a new browser/device, resume from the durable Catalog Offering or published capability records, not from a secret. This avoids a second server state machine while preserving refresh/back/retry behavior. [Marketplace pattern, Apify explicit completion status and resumable publication stages](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)

7. **Pricing uses the T12 public type, with a named free-only seam until T12 lands.** Import `PricingConfig`, `pricingConfigSchema`, `normalizePricingConfig`, and `resolveInvocationPrice` only from `src/modules/money/public.ts`. The exact v1 shape is:

   ```ts
   {
     version: 'pricing:v1',
     unit: 'call',
     currency: string,                 // uppercase ISO-4217
     paidAmountMinor: number,           // safe non-negative integer
     freeTier?: { maxCalls: number; window: 'day' | 'month' } // positive integer
   }
   ```

   The UI defaults to `{ version: 'pricing:v1', unit: 'call', currency: 'AUD', paidAmountMinor: 0 }`, which is a free call by `resolveInvocationPrice` (`reason: 'zero_price'`). It does not invent a free quota number. When T12 is not yet available, `src/modules/capability-supply/internal/supply-funnel/pricing-port.ts` exposes `PricingConfigPort` and the explicitly named `stubPricingConfigPort`; the stub validates the same closed shape, resolves only the zero-price result, and refuses paid pricing with `price_unavailable`. Once T12 lands, the real port delegates to `normalizePricingConfig` and `resolveInvocationPrice`; free-tier usage is read in the same money mutation, never trusted from the browser. Use a free hard-cap row plus optional paid per-call price, but do not use `BASIC`, `PRO`, `ULTRA`, `MEGA`, or any universal tier name. [Marketplace pattern, RapidAPI plan matrix and Apify PPE primary/custom events](../research/2026-07-30-marketplace-pattern-borrow.md#transferable-shape-for-ae); [Flywheel pattern, modest rake and prepaid credit](../research/2026-07-30-flywheel-patterns.md#transferable-shape-for-ae)

8. **Credentialed supply is server-held or refused.** A keyless HTTP JSON operation uses the exact `none` sentinel. A credentialed HTTP/MCP/x402 operation accepts only an environment reference matching the existing adapter rules; `src/modules/capability-supply/internal/credential-runtime.ts` resolves it server-side for a probe/test call and returns no secret in output, logs, receipts, or drafts. `[HITL]` A deployment owner must register the named environment secret before a credentialed business can pass readiness. If the secret manager/vault is not available, the credentialed path returns `credential_unavailable` and the owner can still complete a keyless HTTP flow. No browser-pasted secret and no anonymous agent publish action is added. [Marketplace pattern, Smithery credential handling and configuration refusal](../research/2026-07-30-marketplace-pattern-borrow.md#6-smithery--registry-cards-install-configuration-and-auth-ux); [Payments skill, server-held credentials and fail-closed payment boundary](../../../../skill://ae-agentic-payments-stack)

9. **Testing is an explicit owner action and is not an agent call.** The owner must click a clearly labelled “Send test request” control and confirm any disclosed provider-side cost or external effect. The test uses the exact admitted endpoint/config and contract input, but it does not debit AE credit, create provider earnings, or mark liquidity. x402 test calls are refused with `payment_execution_unsupported` until the T12 payment path is available; an ambiguous post-release result is `outcome_unknown` and blocks publish until reconciliation. A successful test proves only a response receipt and schema/evidence compatibility. [Marketplace pattern, Apify Testing stage and run-cost cap](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication); [Payments skill, release uncertainty and reconciliation](../../../../skill://ae-agentic-payments-stack)

10. **No demand is required for the single-player publisher mode.** After the final step, the owner sees (a) the public listing URL, (b) fresh probe state and expiry, (c) the published operation documentation URL and machine surfaces, and (d) an append-only call log with an honest “No agent calls yet” state. The earnings panel is present but `unavailable_until_money_rail` until T12 supplies a real ledger/payout readback; it never renders zeros as earnings and never fabricates demand. This is “publish, test, meter, document, observe” utility for the hard side before network density exists, not a social referral or viral mechanic. [Flywheel pattern, Chen single-player mode/hard side and Apify creator loop](../research/2026-07-30-flywheel-patterns.md#1-andrew-chen--the-cold-start-problem); [Flywheel pattern, transferable single-player supply mode](../research/2026-07-30-flywheel-patterns.md#transferable-shape-for-ae)

11. **Three liquidity measurements are emitted from the first call, with no catalog-count vanity metric.** Add `capabilityCallEvents` to `src/modules/capability-supply/internal/convex-schema.ts` and compose it in `convex/schema.ts`. Rows are append-only, bounded by an indexed business/time read, contain digests rather than raw customer text, and are operational observations rather than the T12 money ledger.

   - `supply_liquidity_fill_observed`: emitted by `recordCapabilityCallObservation` in `src/modules/capability-supply/internal/liquidity.ts`, called from `src/modules/action-invocation/dynamic-published-execution.ts` after `observationResult` is classified. It records `taskDigest`, offering/publication refs, `outcome: 'filled' | 'zero'`, and a closed `zeroReason` (`no_routeable_supply`, `readiness_unavailable`, `provider_refused`, `credential_unavailable`, `price_unavailable`, `insufficient_credit`, `input_invalid`, or `outcome_unknown`). This is the numerator/denominator for fill rate and explains every zero.
   - `supply_liquidity_first_success_observed`: emitted at the same post-call seam only for the first successful call for a task digest. It records `taskStartedAt`, `successfulAt`, and `durationMs`; the owner/admin read model reports p50 and p95 from these durations. A response receipt is not translated into fulfilment.
   - `supply_liquidity_depth_observed`: emitted in `src/modules/customer-request/application/interpret-compile/interpret.ts:interpretCompileCommit` immediately after `loadRequestGraph` returns (or returns `no_routeable_supply`), with a digest of the canonical customer task and `eligibleDepth = graph.bindings.length` (zero on the typed unavailable branch). This is per-task eligible/reliable depth, not total listings.

   Add focused source tests for all three event writes, deduplication of the first-success event, every zero reason, and bounded depth. [Flywheel pattern, a16z fill rate/zeros, time-to-match, and market depth](../research/2026-07-30-flywheel-patterns.md#2-gurley--a16z-marketplace-canon)

12. **Claim ceilings are explicit.** Before T12 ledger/payout and hosted readback, public copy may say that a business can describe, check, price, and publish a service; that assistants receive the same published service projection; and that a test response was observed in labelled local/dev or sandbox evidence. It must not say real agent demand, provider fulfilment, settlement, payout, booking, dispatch, guaranteed availability, production uptime, “verified,” or “automatic payouts.” Use `published`, `checked`, `last checked`, and `needs attention`; use `verified` only with a named standard and evidence reference. Keep `capability`, `MCP`, `OpenAPI`, `gateway`, `source-owned`, `readback`, `fixture`, and `autonomous` out of public human copy. `[HITL]` Copy review is required before `/for-providers` becomes indexable. [Public-copy guardrails](../../../../skill://ae-public-copy-guardrails); [Flywheel pattern, evidence boundaries](../research/2026-07-30-flywheel-patterns.md#4-openrouter-provider-flywheel)

## Approach

### 1. Add the public supply landing and generated proof

1. Add `src/routes/for-providers.tsx` with a public loader and metadata. The loader calls a new `loadSupplyLandingReadback` from `src/modules/capability-supply/supply-funnel.functions.ts`; it must not import Convex, a provider SDK, or any `internal/*` module. Render `AeSupplyLanding` from `src/components/ae/supply/AeSupplyLanding.tsx` inside `AePublicShell`. [Marketplace pattern, Apify Store detail page follows publisher description and publication state](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)
2. In `loadSupplyLandingReadback`, build `tools = listMcpActions().map(describeActionForAgent)` and obtain services by calling `registryServicesListAction.run({ data: { limit: 10 }, context: { caller: 'ui' } })`. Preserve the returned `PublicServicesApiPage` and its `services`; do not create a hand-written proof DTO. Cap rendered action descriptors and service rows with the same bounded limits used by the source action. [Flywheel pattern, source-owned supply readback rather than catalog-count vanity](../research/2026-07-30-flywheel-patterns.md#transferable-shape-for-ae)
3. Add `AeSupplyAgentProof.tsx`. Render the generated action names, summaries, read-only boundary text, and output/schema disclosure from `AgentToolDescriptor`; render service name, business, published summary, `pricingSummary`, structured `price`, endpoints, and public links from `ServiceDto`. When the list is empty, say “No services are listed yet” and render the CTA; do not seed a fake example. [Marketplace pattern, agentic.market service-card projection and price-unit clarity](../research/2026-07-30-marketplace-pattern-borrow.md#5-agenticmarket--x402-directory-and-service-card-pricing)
4. Render the exact researched offer sentence, the gross → AE fee → provider net block, one primary “Start listing” CTA to `/claim?source=supply`, and a secondary “Open publisher console” link to `/owner/supply`. `[HITL]` Run the public-copy review before setting `index,follow`; until then keep development evidence labels and do not add a provider earnings number. [Marketplace pattern, Apify/agentic.market clarity and service projection](../research/2026-07-30-marketplace-pattern-borrow.md#transferable-shape-for-ae); [Gurley payment-flow framing](../research/2026-07-30-flywheel-patterns.md#2-gurley--a16z-marketplace-canon)

### 2. Preserve the claim-to-owner transition

1. Extend `ClaimSearchParams`/`readClaimPrefill` in `src/routes/claim.tsx` with the closed `source?: 'supply'` query value. Carry it through `/claim/form`, `submitOwnerClaimServer`, and `/claim/success` without storing it in the catalog. [Flywheel pattern, hard-side acquisition must create provider utility rather than a generic growth loop](../research/2026-07-30-flywheel-patterns.md#7-rapidapi--what-made-and-broke-the-flywheel)
2. In `src/routes/claim.success.tsx`, when `source === 'supply'`, add the primary “List an API service” button to `/owner/supply`; keep the existing public-page and owner-status actions. Do not change claim ownership or review semantics. [Flywheel pattern, atomic network starts with one reliable provider operation](../research/2026-07-30-flywheel-patterns.md#transferable-shape-for-ae)
3. Keep owner authentication in `operatorLayoutRouteOptions`/`requireOperatorBeforeLoad`. The source mutation for capability promotion must re-check Clerk ownership; the browser route never chooses a business ID outside the owner readback. This is an owner flow, not T3 agent-key authority. [Flywheel pattern, hard-side acquisition without social mechanics](../research/2026-07-30-flywheel-patterns.md#1-andrew-chen--the-cold-start-problem)

### 3. Add owner supply readback and resumable funnel host

1. Add `src/routes/_operator/owner.supply.tsx` (`GET /owner/supply`) with `operatorRouteOptions`. Its loader calls `readOwnerSupplyFunnelServer` and returns the current claimed business, Offering summaries, active publication summaries, and the latest call-log/earnings state. Render `AeSupplyPublisherHome.tsx`; never load all businesses or all calls. [Flywheel pattern, Chen single-player mode gives the hard side utility before demand](../research/2026-07-30-flywheel-patterns.md#1-andrew-chen--the-cold-start-problem)
2. Add `src/routes/_operator/owner.supply.$offeringRef.tsx` (`GET /owner/supply/:offeringRef`) with the same auth boundary. Its loader calls `readOwnerSupplyFunnelServer({ offeringRef })` and reconstructs a valid same-browser draft from durable current Offering/publication state when the session draft is absent. [Marketplace pattern, Apify publication is staged and resumable before Store promotion](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)
3. Add `src/components/ae/supply/AeSupplyFunnel.tsx` with exactly six ordered steps and an explicit rail state union: `not_started | in_progress | completed | refused | stale`. Step buttons only enable the current frontier; a completed step can be reopened and makes later steps `stale` until rechecked. Save after every transition under `OWNER_SUPPLY_DRAFT_STORAGE_KEY`; never save secrets. [Marketplace pattern, Apify Development → Publication + monetization → Testing → Promotion stages](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)
4. Add `src/modules/capability-supply/supply-funnel.functions.ts` with server functions and source ports. The module public seam (`src/modules/capability-supply/public.ts`) exports the result/state types and port factory; routes import only this seam. Use `sourceQuery`/`sourceMutation` from `src/lib/server/convex-source.ts`, not client Convex imports. [Marketplace pattern, Apify explicit stages and completion status](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)

### 4. Implement the six source-owned steps

#### Step 1 — Describe

- Reuse `AeOwnerOfferingEditor`, `publishGateRefusal`, `readOwnerOfferingSupplyServer`, and `saveOwnerOfferingServer` from `src/components/ae/offerings/` rather than a second facts editor. Extend the editor host with a `next: 'supply'` handoff so a saved Offering returns to `/owner/supply/:offeringRef`. [Marketplace pattern, Apify README/description is the publisher's public Store entry](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)
- Require the existing publish-gate facts (`name`, `category`, `summary`) and one `external_operation` access-path draft. Keep the Catalog Offering status `draft` while the six-step flow is incomplete; the final Publish step changes it to `published`. The path descriptor remains the source of the displayed operation name, URL, documentation URL, authentication summary, and owner-authored summary. [Marketplace pattern, publication requires display information and permissions before promotion](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)
- Completion is `{ step: 'describe', state: 'completed', offeringRef, revision, sourceHash }` from the owner readback. Refusals reuse `invalid_offering`, `invalid_access_path`, `revision_conflict`, `authorization_denied`, `source_unavailable`, and the existing partial-save `completedSteps` response. [Marketplace pattern, Apify README/description before publication](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)

#### Step 2 — Endpoint and configuration

- Add `AeSupplyEndpointConfigStep.tsx` with `sourceKind: 'openapi_http' | 'mcp' | 'x402'` and fields that map exactly to `CapabilityPublicationImport`: pasted bounded descriptor/document JSON, operation/tool/resource selector, endpoint/server URL, method/query mapping, protocol version/tool name where applicable, request timeout, and credential reference. Do not fetch arbitrary remote descriptors in the browser or server; the endpoint URL is the operation target, while the pasted descriptor is the contract source. [Marketplace pattern, Apify publication collects explicit display/configuration inputs before Store publication](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)
- Call `preparePublicationDraft` then `admitPublicationDraft` through a source-owned server function. Use the existing importer, contract registry encoding, `admitRegisteredTransport`, and the binding rules. Build stable IDs from `businessId`, `offeringRef`, and `revision`; do not accept IDs supplied by the browser as authority. [Marketplace pattern, Smithery explicit configuration and auth setup rather than opaque universal proxying](../research/2026-07-30-marketplace-pattern-borrow.md#6-smithery--registry-cards-install-configuration-and-auth-ux)
- Completion stores the normalized source digest, encoded contract digest, admitted adapter/config digest, exact draft binding, and `publicationRef` candidate. Refusals are the existing `source_invalid`, `source_too_large`, `source_too_deep`, `source_version_unsupported`, `selector_invalid`, `operation_not_found`, `schema_missing`, `schema_profile_unsupported`, `transport_unsupported`, `commercial_metadata_inconsistent`, `payment_execution_unsupported`, `adapter_not_registered`, `adapter_config_invalid`, and `adapter_config_too_large`. [Marketplace pattern, Apify publication information/permissions sequence](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)

#### Step 3 — Keyless or credentialed readiness probe

- Build `CapabilityProbeTarget` from the admitted draft and call `runCapabilityReadinessProbe` using server `send` and `resolveCapabilityCredential`. For `http-json:v1` + `credentialRef: 'none'`, assert the T5 path: `credential_unavailable` cannot be returned due to missing credentials, the request has no `Authorization` header, and evidence includes `probe:credential_not_required`. For credentialed paths, resolve only `env:NAME`; missing/blank returns `credential_unavailable`. [Marketplace pattern, Apify Testing stage validates the published operation before promotion](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)
- Completion requires `outcome: 'healthy'`, `credentialState: 'ready'`, `healthState: 'healthy'`, a valid `validUntil`, and the complete evidence refs. Render “Last checked” and expiry, never “verified” or “live.” Refusals preserve the existing `credential_rejected`, `target_not_public`, `transport_unreachable`, `http_redirect`, `http_4xx`, `http_5xx`, `response_content_type_invalid`, `response_too_large`, and `response_invalid` outcomes. [Marketplace pattern, RapidAPI health caveat forbids an unsupported healthy claim](../research/2026-07-30-marketplace-pattern-borrow.md#4-rapidapi--plan-matrix-and-health-caveat)
- Bind the observation to `probeTargetDigest` and the exact source/config/Offering revision. Any changed URL, source digest, path lineage, credential reference, or adapter config marks the step stale and refuses publish with `target_changed`/`revision_changed`. [Marketplace pattern, Apify testing and health caveat from RapidAPI](../research/2026-07-30-marketplace-pattern-borrow.md#4-rapidapi--plan-matrix-and-health-caveat); [Flywheel pattern, OpenRouter public performance signals are mechanics not causal proof](../research/2026-07-30-flywheel-patterns.md#4-openrouter-provider-flywheel)

#### Step 4 — Pricing

- Render one unit only: `unit: 'call'`. Use T12 `pricingConfigSchema` and `normalizePricingConfig` through `PricingConfigPort`; default to the exact zero-price config in Decisions (7). Show the optional free-tier cap as one row with `maxCalls` and `window`, plus one paid amount in minor units/currency. Do not render RapidAPI tier names, a flattened list of endpoint prices, or a guessed provider percentage. [Marketplace pattern, RapidAPI free hard-cap matrix and Apify PPE event unit](../research/2026-07-30-marketplace-pattern-borrow.md#transferable-shape-for-ae)
- Resolve the preview with `resolveInvocationPrice({ config, freeCallsUsed: 0, priceDigest })`. Completion requires a valid config and a deterministic gross/fee/net preview; a paid result cannot be selected through `stubPricingConfigPort`. Refusals are `price_unavailable`, `pricing_config_invalid`, and `currency_mismatch`; T12 ledger refusals remain T12-owned and are not duplicated in this module. [Marketplace pattern, Apify PPE event unit and RapidAPI free hard-cap matrix](../research/2026-07-30-marketplace-pattern-borrow.md#transferable-shape-for-ae); [Flywheel pattern, low rake avoids supplier leakage](../research/2026-07-30-flywheel-patterns.md#2-gurley--a16z-marketplace-canon)

#### Step 5 — Test call

- Add `src/modules/capability-supply/internal/supply-funnel/test-call.ts` as the source-owned owner-test seam. It validates the owner input against the exact admitted contract, constructs a bounded test authority (`attemptRef`, `operationKeyDigest`, `grantDigest`, `maximumSpend`, expiry), and delegates transport to `invokeRegisteredRouteTransport`/`invokePreparedRouteTransport`. It must use the same adapter config and server credential resolver as readiness. [Marketplace pattern, Apify Testing stage and maximum run-cost control](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)
- Require a fresh owner click and display the endpoint, operation, request fields, possible provider cost, and external-effect warning before release. Never pass the test through the T12 credit/charge ledger, never create provider earnings, and never count it as a liquidity fill. Refuse `input_invalid`, `credential_unavailable`, `adapter_config_invalid`, `payment_execution_unsupported`, and `outcome_unknown`; a provider response outside the contract is `response_invalid`. Do not retry after release when the outcome is unknown. [Flywheel pattern, payment-flow and unknown-outcome boundaries require in-flow authority, not later billing](../research/2026-07-30-flywheel-patterns.md#2-gurley--a16z-marketplace-canon)
- Completion stores only bounded output digest, response summary, evidence refs, and observed time. Do not store credentials or arbitrary response bodies. `[HITL]` The owner must explicitly confirm the test call; `[HITL]` x402 test calls require T12 payment/settlement policy before enabling. [Marketplace pattern, Apify Testing stage and maximum run-cost control](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication); [Payments skill: ae-agentic-payments-stack, exact spend ceiling and unknown outcome](ae-agentic-payments-stack)

#### Step 6 — Publish

- Add a source-owned `publishOwnerCapability` orchestration seam in `convex/capabilitySupply.ts` and `src/modules/capability-supply/supply-funnel.functions.ts`. The Convex mutation re-checks the current Clerk owner, current Catalog Offering revision, and current published `external_operation` path; it derives `origin.kind = 'catalog_offering'`, `offeringRef`, `offeringRevision`, `offeringSourceHash`, `declaredAccessPathRef`, and `accessPathSourceHash` server-side. [Marketplace pattern, Apify promotion follows completed publication and explicit Store state](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication)
- In one idempotent owner operation: publish the Catalog Offering/path, call `publishCapabilityCommand`, set capability offering/binding eligibility to active/admitted/conformant using the exact registration hashes, and persist the fresh probe observation only when its `probeTargetDigest` still matches. Use operation key `owner-supply:${businessId}:${offeringRef}:${revision}:publish` and the existing source-write admission/correlation fields. [Flywheel pattern, atomic network requires one reliable service before broader supply](../research/2026-07-30-flywheel-patterns.md#transferable-shape-for-ae)
- Completion is `published` with a source publication ref, exact revision, public listing URL, and current readiness lifecycle. If publication succeeds but the projection rebuild is pending, show “Published; public page is updating,” not “callable.” Refusals include `authorization_denied`, `registration_context_invalid`, `contract_identity_conflict`, `offering_identity_conflict`, `binding_identity_conflict`, `operation_key_conflict`, `offering_integrity_failure`, `binding_integrity_failure`, `catalog_offering_origin_changed`, `readiness_stale`, and `price_unavailable`. A replay returns the same publication result. [Marketplace pattern, Apify Publish on Store after testing](../research/2026-07-30-marketplace-pattern-borrow.md#1-apify--actor-monetization-and-store-publication); [Flywheel pattern, provider earnings follow publish → discovery → usage mechanics](../research/2026-07-30-flywheel-patterns.md#3-apify-creator-flywheel)

### 5. Add the single-player readback, call log, and earnings boundary

1. Add `capabilityCallEvents` to `src/modules/capability-supply/internal/convex-schema.ts` with indexes `by_businessId_and_observedAt` and `by_taskDigest_and_observedAt`. Store `eventRef`, business/offering/publication refs, task digest, event kind, outcome, zero reason, duration, observed time, evidence refs, and an `environment` label. Do not store raw request text, credentials, response bodies, or T12 ledger details. [Flywheel pattern, a16z metrics require task-level events and zero reasons, not listing counts](../research/2026-07-30-flywheel-patterns.md#2-gurley--a16z-marketplace-canon)
2. Add bounded `readOwnerSupplyCallLog`/`readOwnerSupplyLiquiditySummary` source functions. A query reads at most a fixed page (for example 50) by owner/business and time cursor; an owner read never scans the table. If an aggregate is required for p50/p95, use a bounded day-bucket rollup owned by this module or the installed aggregate component; do not use `.collect().length`. [Flywheel pattern, time-to-first-success and depth are operational liquidity measures, not vanity counters](../research/2026-07-30-flywheel-patterns.md#2-gurley--a16z-marketplace-canon)
3. Add `AeSupplySinglePlayerPanel.tsx` and `AeSupplyCallLog.tsx`. Link the current `/${slug}` page, endpoint documentation URL, `/api/v1/services` and `/mcp` machine surfaces, the readiness evidence, and the call log. Empty state is “No agent calls yet.” Add `AeSupplyEarningsCard` with a typed `unavailable_until_money_rail` state and no placeholder dollars. [Flywheel pattern, Chen “come for the tool” utility for supply and Apify documentation/earnings loop](../research/2026-07-30-flywheel-patterns.md#1-andrew-chen--the-cold-start-problem)

### 6. Emit the three liquidity metrics at their source events

1. Add `recordCapabilityCallObservation` and `recordCapabilityDepthObservation` to `src/modules/capability-supply/internal/liquidity.ts`, with a source port for append-only writes and deterministic event IDs. Keep this module free of payment authority; it accepts a T12 charge outcome only as a labelled input (`insufficient_credit` is never redefined). [Flywheel pattern, instrument the atomic network at task/call transitions](../research/2026-07-30-flywheel-patterns.md#2-gurley--a16z-marketplace-canon)
2. Wire fill and time-to-first-success events in `src/modules/action-invocation/dynamic-published-execution.ts` after the route transport observation is classified and before the result is returned to its host. The event receives the invocation/task digest, exact publication revision, `startedAt`, outcome, and response evidence. It must emit exactly once for a successful first call and exactly once for a zero/refusal outcome. [Flywheel pattern, fill rate and time-to-match are the first liquidity proof](../research/2026-07-30-flywheel-patterns.md#2-gurley--a16z-marketplace-canon)
3. Wire depth in `src/modules/customer-request/application/interpret-compile/interpret.ts` immediately after `ports.loadRequestGraph(input.networkId)` returns. Pass the canonical task digest and `graph.bindings.length`; on the typed unavailable path record zero with `no_routeable_supply` or the returned bounded reason. Do not use raw customer text as a metric key. [Flywheel pattern, per-service/task market depth](../research/2026-07-30-flywheel-patterns.md#2-gurley--a16z-marketplace-canon)
4. Add focused tests that prove each source event is emitted at the exact transition, that retries/replays do not double-count, and that p50/p95 inputs are durations from first task request to first successful provider response. [Flywheel pattern, a16z-adapted metrics](../research/2026-07-30-flywheel-patterns.md#2-gurley--a16z-marketplace-canon)

### 7. Keep projections and assistant surfaces in parity

- Preserve `src/modules/registry/internal/services-api-projection.ts:projectPublicServicesPage` as the only flattening projection. If T12 requires machine-visible free-tier fields, extend `PublicOfferingDto`, `ServiceDto`, their Zod output schema, and focused projection tests additively from `PricingConfig`; do not add a second pricing string or flatten endpoint prices. The owner proof must consume the resulting `ServiceDto` unchanged. [Marketplace pattern, agentic.market price ambiguity requires explicit unit/event relation](../research/2026-07-30-marketplace-pattern-borrow.md#5-agenticmarket--x402-directory-and-service-card-pricing)
- Keep `registryServicesListAction` and `registryServicesSearchAction` in `src/modules/registry/registry.actions.ts` as the only service discovery inputs. Keep their current boundaries: read-only, public facts only, no payment/booking/fulfilment claim. [Flywheel pattern, supply-side utility is a proof surface, not a demand or fulfilment claim](../research/2026-07-30-flywheel-patterns.md#1-andrew-chen--the-cold-start-problem)
- Keep `listMcpActions`/`mcpToolName` in `src/modules/actions/index.ts` and `createAeMcpServer` in `src/lib/server/mcp-api.ts` as the machine proof seam. Do not expose owner publish/test actions through anonymous MCP. The `/mcp` tool set remains derived from action `surfaces`, not a hand-maintained landing-page list. [Marketplace pattern, agentic.market endpoint unit and price ambiguity warning](../research/2026-07-30-marketplace-pattern-borrow.md#5-agenticmarket--x402-directory-and-service-card-pricing)

## Critical files and anchors

### Existing source owners to reuse

- `src/components/ae/offerings/AeOwnerOfferings.tsx:201-214,216-409,411-505` — publish gate, draft restoration, details form, external-operation path editor, and no-secret browser draft pattern.
- `src/components/ae/offerings/owner-offering.functions.ts:23-109,111-225` — owner Offering readback, source mutations, partial-save completion keys, and revision conflict mapping.
- `src/routes/_operator/owner.offerings.new.tsx:13-47` and `src/routes/_operator/owner.offerings.$offeringRef.tsx:12-61` — owner auth shell and Offering editor navigation to extend with `next=supply`.
- `src/routes/_operator/owner.status.tsx:24-103` and `src/components/ae/status/AeCapabilityList.tsx:8-18` — owner public-page/status composition to link, not duplicate.
- `src/modules/catalog/internal/offering-supply.ts:31-123,178-325` — Offering lineage, external-operation validation, `PublicOfferingSupplyProjection`, and support reasons.
- `convex/catalogSupplyProjection.ts:14-84` — source-owned support derivation from Catalog Offering origin, admitted/conformant binding, and fresh readiness.
- `src/modules/capability-supply/internal/publication-importers.ts:23-116,118-295,341-410` — normalized publication draft and importer refusal vocabulary.
- `src/modules/capability-supply/internal/publication/draft.ts:18-139` — preparation and admission seam.
- `src/modules/capability-supply/internal/publication/publish.ts:23-176` — idempotent publish command, exact registration hashes, publication insertion, audit, and probe scheduling.
- `src/modules/capability-supply/internal/publication/lifecycle.ts:8-84` — inactive/active state and every readiness/admission/conformance refusal reason.
- `src/modules/capability-supply/internal/readiness-probe.ts:22-155` — target, outcome, TTLs, keyless sentinel path, and bounded response validation.
- `src/modules/capability-supply/internal/transport-adapters.ts:8-194` — `PUBLIC_CREDENTIAL_REF`, adapter admission, endpoint SSRF boundary, and credential rules.
- `src/modules/capability-supply/internal/graph/probe-digest.ts` and `src/modules/capability-supply/internal/graph/record-probe-result.ts` — exact target digest and readiness recording/rebuild seams.
- `convex/capabilitySupply.ts:373-407,438-572,574-657` — owner-gated publish, readiness observation, probe target/result, withdraw, and refresh adapters.
- `src/modules/registry/internal/services-api-projection.ts:11-120` — `ServiceDto`, `PublicServicesApiPage`, `projectPublicServicesPage`, endpoint projection, and open/external distinction.
- `src/modules/registry/registry.actions.ts:373-422` — service list/search actions and their current MCP surfaces/boundaries.
- `src/modules/actions/index.ts:81-88` — `listMcpActions` and deterministic `mcpToolName`.
- `src/lib/server/mcp-api.ts:21-68` and `src/routes/mcp.ts:5-13` — anonymous read-only MCP admission and `/mcp` host.
- `src/routes/api.v1.services.ts:12-40` and `src/routes/api.v1.services.search.ts` — HTTP service projection adapters.
- `src/modules/common/action.ts:245-273` — `AgentToolDescriptor`/`describeActionForAgent` generated proof shape.
- `.planning/wayfinder/plans/T3-oauth-issuance-PLAN.md:7-13,28-42` — API-key identity and authority ceiling; do not use the key as owner publish authority.
- `src/modules/money/public.ts` (T12 planned) — `PricingConfig`, `pricingConfigSchema`, `normalizePricingConfig`, `resolveInvocationPrice`; T11 uses this public seam only.

### New files/symbols to add

- `src/routes/for-providers.tsx` — public landing route and loader.
- `src/components/ae/supply/AeSupplyLanding.tsx`, `AeSupplyAgentProof.tsx`, `AeSupplyPublisherHome.tsx`, `AeSupplyFunnel.tsx`, `AeSupplyEndpointConfigStep.tsx`, `AeSupplySinglePlayerPanel.tsx`, `AeSupplyCallLog.tsx`, `AeSupplyEarningsCard.tsx` — thin renderers with no source authority.
- `src/routes/_operator/owner.supply.tsx` and `src/routes/_operator/owner.supply.$offeringRef.tsx` — owner readback/funnel hosts.
- `src/modules/capability-supply/supply-funnel.functions.ts` — `loadSupplyLandingReadback`, owner readback, step transitions, probe/test/publish server adapters.
- `src/modules/capability-supply/internal/supply-funnel/pricing-port.ts` — `PricingConfigPort` and `stubPricingConfigPort` until T12 public money types are available.
- `src/modules/capability-supply/internal/supply-funnel/test-call.ts` — owner-confirmed bounded test invocation.
- `src/modules/capability-supply/internal/credential-runtime.ts` — server-only env-reference resolver.
- `src/modules/capability-supply/internal/liquidity.ts` — `capabilityCallEvents` event contracts, deterministic event IDs, fill/time/depth emission.
- `src/modules/capability-supply/internal/convex-schema.ts` — `capabilityCallEvents` table/index fragment; `convex/schema.ts` remains composition-only.
- `convex/capabilitySupply.ts` — owner-funnel readback, server-derived Catalog Offering origin, and publish orchestration; keep network I/O in an action/route adapter if required by Convex runtime.
- `src/modules/observability` is not a second owner of these events; if a transport adapter needs a server port, it calls the capability-supply liquidity seam.
- `src/routes/claim.tsx` and `src/routes/claim.success.tsx` — carry the closed `source=supply` handoff only.
- `tests/unit/capability-supply/supply-funnel.test.ts`, `tests/unit/capability-supply/supply-liquidity.test.ts`, `tests/unit/capability-supply/credential-runtime.test.ts`, `tests/unit/catalog/owner-offering-editor.test.tsx` (extend), `tests/unit/registry/services-api-projection.test.ts` (extend), `tests/unit/routes/supply-landing.test.ts`, `tests/unit/ui/supply-funnel.test.tsx`, `tests/unit/schema/convex-schema.test.ts` (extend), and `tests/e2e/supply-funnel.spec.ts`.

## Rival patterns to avoid

- **agentic.market flattened prices:** never render a single comma-separated price list for an Offering with multiple endpoint prices. Expose `unit: call`, currency, paid amount, free-tier rule, and the exact endpoint/event relation. [Marketplace pattern, agentic.market price ambiguity](../research/2026-07-30-marketplace-pattern-borrow.md#5-agenticmarket--x402-directory-and-service-card-pricing)
- **RapidAPI universal tier names:** do not use `BASIC`, `PRO`, `ULTRA`, or `MEGA`, and do not copy example quotas or prices. Use one free-call/default row and an explicitly labelled paid per-call amount from `PricingConfig`. [Marketplace pattern, RapidAPI provider plan matrix](../research/2026-07-30-marketplace-pattern-borrow.md#4-rapidapi--plan-matrix-and-health-caveat)
- **RapidAPI central proxy:** AE does not proxy every provider through one shared gateway. The binding keeps each provider endpoint and adapter identity; readiness and route transport fail closed per operation. [Flywheel pattern, RapidAPI central-proxy failure](../research/2026-07-30-flywheel-patterns.md#7-rapidapi--what-made-and-broke-the-flywheel)
- **High rake and later supplier billing:** never make a provider wait for a later invoice or hide gross/fee/net. The actual AE rate is a T12 HITL decision. [Flywheel pattern, Gurley rake warning](../research/2026-07-30-flywheel-patterns.md#2-gurley--a16z-marketplace-canon)
- **Catalog-count growth mechanics:** no social invites, referral rewards, crypto/token incentives, or “N APIs listed” KPI. The first supply metric is one reliable operation and a first successful call. [Flywheel pattern, skip list and atomic network](../research/2026-07-30-flywheel-patterns.md#transferable-shape-for-ae)

## Verification

Run from the repository root. Development and fixture results remain labelled `local/dev`; a readiness or test response is contract evidence, not independent provider fulfilment.

1. **Pure funnel and refusal contracts:**

   ```sh
   npx vitest run \
     tests/unit/capability-supply/publication-importers.test.ts \
     tests/unit/capability-supply/transport-adapter-registry.test.ts \
     tests/unit/capability-supply/readiness-probe.test.ts \
     tests/unit/capability-supply/publication-commands.test.ts \
     tests/unit/capability-supply/supply-funnel.test.ts \
     tests/unit/capability-supply/supply-liquidity.test.ts
   ```

   Required cases: every six-step completion state; refresh/stale step recovery; keyless `none` omits `Authorization`; credentialed missing/rejected; all importer/admission/probe refusals; free default and paid T12/stub refusal; test response success/refusal/unknown; publish idempotent replay and exact Catalog Offering origin mismatch.

2. **Projection and action parity:**

   ```sh
   npx vitest run \
     tests/unit/registry/services-api-projection.test.ts \
     tests/unit/registry/offering-api-projection.test.ts \
     tests/unit/actions/registry.test.ts \
     tests/unit/server/mcp-api.test.ts \
     tests/unit/routes/services-one-view.test.ts
   ```

   Assert the landing proof contains only `describeActionForAgent(listMcpActions())` output and `projectPublicServicesPage` output; no hand-written action count or service row appears. Assert `/api/v1/services`, `registry.services_list`, and anonymous MCP `tools/list` retain the same action boundaries and service projection. Assert no owner publish/test action is exposed in anonymous MCP.

3. **Owner UI and resume behaviour:**

   ```sh
   npx vitest run \
     tests/unit/catalog/owner-offering-editor.test.tsx \
     tests/unit/routes/supply-landing.test.ts \
     tests/unit/ui/supply-funnel.test.tsx \
     tests/unit/schema/convex-schema.test.ts
   npx playwright test tests/e2e/supply-funnel.spec.ts
   ```

   Drive `/for-providers` with an empty service projection and with one labelled service; verify generated proof, exact offer sentence, gross/fee/net disclosure, and claim CTA. In the owner flow, save Describe, reload, resume Endpoint/Config, run keyless readiness, enter the free default, confirm the owner test call, publish, and observe the listing URL/probe/docs/call-log panel. Then exercise stale config, missing credential, test-call refusal, revision conflict, and publish replay. Verify the call log says “No agent calls yet” before any agent invocation and the earnings state is typed unavailable.

4. **Liquidity events:**

   ```sh
   npx vitest run \
     tests/unit/customer-request/application/*.test.ts \
     tests/unit/action-invocation/durable-action-invocation.test.ts \
     tests/unit/capability-supply/supply-liquidity.test.ts
   ```

   Assert a zero routeable graph emits `supply_liquidity_depth_observed` with depth `0` and a reason, a successful provider response emits one fill and one first-success duration, a provider refusal emits one zero with its reason, retries/replays do not double-count, and owner/business reads are bounded by the declared indexes.

5. **Architecture, copy, and type gates:**

   ```sh
   npm run typecheck
   npm run test:imports
   npm run test:ui-contract
   npm run test:seo
   npm run check:convex-codegen
   ```

   Run Convex codegen once the local control plane is configured. Inspect emitted `/for-providers` HTML and metadata, owner route text, `/api/v1/services`, and MCP tool descriptors. Copy scans must reject booking, checkout, payment-as-completed, dispatch, fulfilment, guaranteed availability, production uptime, “verified,” internal implementation vocabulary, RapidAPI tier names, and flattened endpoint-price text. Record the evidence class as source/fixture/labelled local-dev/hosted readback; do not upgrade it.

6. **Parity smoke:**

   ```sh
   npm run dev
   curl -sS http://127.0.0.1:3000/for-providers
   curl -sS 'http://127.0.0.1:3000/api/v1/services?limit=10'
   curl -sS -X POST http://127.0.0.1:3000/mcp \
     -H 'Content-Type: application/json' \
     -H 'Accept: application/json, text/event-stream' \
     --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
   ```

   Confirm the page proof and both machine surfaces are generated from the same local/dev source projection. A successful local response proves only the labelled development contract; it does not prove hosted reachability, independent supply, settlement, payout, fulfilment, or customer value.

## Assumptions and contingencies

- **T12 ordering:** T12 lands `src/modules/money/public.ts` before paid pricing is enabled. Until then, `stubPricingConfigPort` allows only the zero-price config and emits no ledger call. T11 never implements `insufficient_credit`, ledger CAS, payout, or charge reconciliation; it consumes T12's refusal vocabulary and exact public types.
- **Credential custody:** The current repository has no provider-secret vault. Keyless `http-json:v1` is the first executable path. Credentialed readiness/test is available only when `[HITL]` deployment secrets for the selected `env:NAME` exist; otherwise the typed refusal is shown and the draft remains resumable. Never persist a secret to Convex, session storage, logs, fixtures, receipts, or agent JSON.
- **x402:** Existing x402 adapter admission and runtime remain intact, but a self-serve test cannot sign or settle a provider payment until T12 supplies the exact credit/payment authority. Refuse before release with `payment_execution_unsupported`; after a real release begins, surface `outcome_unknown`/reconciliation-required and never auto-retry.
- **Catalog path drift:** If a Catalog Offering revision or external-operation access path changes after the probe, `origin` and `probeTargetDigest` no longer match. Mark Endpoint, Readiness, Pricing, and Test stale; require the owner to recheck instead of silently promoting the old source.
- **Projection lag:** `publishCapabilityCommand` and Catalog projection are idempotent but projection rebuild may be pending. Owner copy says “Published; public page is updating” until the public readback is current; it never says the service is callable from a stale snapshot.
- **Descriptor inputs:** T11 accepts bounded pasted OpenAPI/MCP/x402 descriptors to reuse the existing importers. It does not add remote descriptor fetching, arbitrary SSRF exceptions, or a universal API gateway. A future safe import source may be added only as a separately reviewed importer.
- **Machine pricing projection:** If T12 adds a typed `pricing` field to `PublicOfferingDto`/`ServiceDto`, add it additively and source it from `PricingConfig`; until that contract is live, preserve the existing `price` plus exact `pricingSummary` and do not invent free-tier fields in the landing proof.
- **Evidence:** Unit tests, local server smoke, keyless probe, and labelled test response prove source/local behaviour only. They do not prove independent provider operation, agent demand, real money movement, payout, or customer value.

## Five riskiest calls

1. Enabling a credentialed provider path without a current server-side secret vault; the plan therefore makes deployment-secret registration an explicit `[HITL]` prerequisite and fails closed.
2. Making the pre-publish test call safe across HTTP, MCP, and x402; the plan refuses x402 until T12 payment authority exists and records unknown outcomes without retry.
3. Carrying a healthy pre-publish probe into the final publication without stale evidence; the plan binds it to `probeTargetDigest`, exact Catalog Offering lineage, adapter config, and revision.
4. Replacing the destination's “you keep X%” sentence with an unapproved rake claim; the plan keeps “a disclosed rake” until T12's rake/KYC/payout `[HITL]` decision and source evidence.
5. Instrumenting a16z liquidity metrics without turning read projections into an unbounded telemetry write path; the plan emits at invocation/compile transitions into bounded indexed append-only events and excludes catalog-count vanity metrics.
