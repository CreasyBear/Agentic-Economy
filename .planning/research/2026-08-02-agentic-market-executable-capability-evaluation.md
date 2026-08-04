# Agentic Market executable-capability evaluation

**Date:** 2026-08-02  
**Evidence class:** current source + live read-only discovery/challenge observations; no payment authorized or submitted  
**Decision:** proceed with a small AE-native experiment, but do **not** make Agentic Market a transparent runtime dependency and do **not** authorize production x402 payment yet.

## Executive verdict

The architectural thesis is sound:

```text
Customer asks in natural language
  -> Answer Engine discovers/explains routeable supply
  -> deterministic Customer Request compiler produces a typed proposal-only RoutePlan
  -> customer confirms exact route and aggregate spend ceiling
  -> RouteMandate attenuates authority to exact steps
  -> Workpool executes registered bindings
  -> provider outputs are validated, journaled, and materialized into later inputs
  -> final customer-safe result is projected back
```

Most of that kernel already exists. AE already has exact capability contracts, imported OpenAPI/MCP/x402 drafts, routeable-supply loading, deterministic multi-step compilation, digest-bound RouteMandates, per-step grants and spend reservations, Workpool execution, x402 challenge matching/signing, durable possibly-submitted state, output validation, inter-step evidence materialization, reconciliation-before-retry, and public readback.

The missing product path is not “another agent framework.” It is four concrete seams:

1. **External publication is unreachable.** The OpenAPI/MCP/x402 importers are pure source helpers; no authenticated application command can durably publish one. The owner funnel instead hardcodes the AE demo quote contract.
2. **Machine discovery is too shallow.** Public catalog/UCP surfaces expose descriptive access paths and an `aeSupportedAction` boolean, not a stable executable operation descriptor with contract identity, schemas, price, effect, recovery, and current routeability.
3. **Answer has no typed Request handoff.** Answer is deliberately read-only. Its inquiry handoff emits a URL; it does not produce a Customer Request reference or an inspect-only plan artifact.
4. **Paid production execution is unsafe/incomplete.** Current x402 readiness can transmit the raw signing key as a Bearer token; the Customer Request transport bypasses the open first-dollar money gate and ledger; sub-cent x402 prices do not fit AE’s implicit two-decimal `amountMinor` model; and paid non-2xx outcomes lack a production payment reconciliation path.

Therefore:

- **Yes:** build the representative journey.
- **Yes:** use live Agentic Market/CDP Bazaar equivalents as external supply evidence.
- **No:** do not let the model call arbitrary marketplace URLs, choose payment recipients, or raise ceilings.
- **No:** do not pay until the P0 payment gates below are closed.
- **No:** do not project third-party indexed services as provider-authored AE business claims.

## What live external evidence established

### Candidate operations

Read-only discovery found suitable Base-mainnet x402 v2 operations:

| Candidate | Exact operation | Advertised price | Useful test role |
|---|---|---:|---|
| Timezone Converter | `GET https://402timezones.vercel.app/api/convert-timezone` with `from`, `to`, `time` query parameters | $0.001 USDC | Cheapest single-operation live challenge/execution canary |
| Exa search | `POST https://api.exa.ai/search` | $0.007 USDC | Search official sources |
| Exa contents | `POST https://api.exa.ai/contents` | $0.001 USDC | Fetch selected pages for grounded synthesis |

The direct unpaid endpoints returned valid `402 Payment Required` challenges. The Timezone challenge bound the **full URL including its query**, amount `1000`, Base USDC asset, payee, and timeout. Exa search advertised amount `7000` on Base and Solana; Exa contents advertised `1000`. These observations prove live challenge compatibility, not payment, settlement, provider output correctness, or customer value.

The Agentic Market catalog is useful for candidate discovery, but its flattened parameter records are not authoritative contracts: it marked parameters optional where live Bazaar JSON Schema marked Timezone `from`/`to` and Exa `query`/`urls` required. Import must pin the live x402 `PaymentRequired` resource/accepts data and live Bazaar schemas, then reject disagreement.

### Primary-source constraints

CDP Bazaar is a discovery index, not an execution authority. Its official documentation says:

- sellers declare input/output schemas through the x402 v2 Bazaar extension;
- the CDP Facilitator indexes a route only after successful **settlement**, not verification alone;
- catalog and semantic search are read-only discovery surfaces;
- ranking blends relevance with facilitator-observed reach, volume, recency, metadata quality, hosting, and curation;
- fetched `skillUrl` content must still be treated as untrusted data;
- the API is under active development.

Sources:

- [CDP x402 Bazaar](https://docs.cdp.coinbase.com/x402/bazaar)
- [CDP x402 buyer quickstart](https://docs.cdp.coinbase.com/x402/quickstart-for-buyers)
- [CDP Bazaar search API used for live candidate inspection](https://api.cdp.coinbase.com/platform/v2/x402/discovery/search?query=Exa%20web%20search&network=eip155%3A8453&maxUsdPrice=0.02&limit=5)
- [Agentic Market machine catalog](https://api.agentic.market/v1/services)

CDP’s TypeScript buyer guidance recommends a CDP-managed wallet so the application does not hold raw private keys. That is a better production custody direction than AE’s current raw EVM key in a Convex environment variable.

## Current AE architecture: reusable, not replaceable

### Supply admission

Existing source:

- `src/modules/capability-supply/internal/publication-importers.ts`
  - bounded source inspection;
  - OpenAPI 3.1, MCP, and x402 normalization;
  - public HTTPS enforcement;
  - exact method/query selectors;
  - local JSON Schema only;
  - commercial metadata consistency;
  - canonical capability contract and adapter draft generation.
- `src/modules/capability-supply/internal/publication/draft.ts`
  - normalizes and admits a draft.
- `src/modules/capability-supply/internal/publication/publish.ts`
  - persists exact contract/offering/binding/publication identities and schedules readiness.
- `src/modules/capability-supply/published-operation.ts`
  - materializes a runtime operation only from current publication, contract, binding, and readiness evidence.

Gap: `admitSupplyPublicationDraft` is only a pure helper. `convex/capabilitySupply.ts::publishOwnerCapability` ignores imported descriptors/schemas/query/payment metadata and hardcodes the demo quote contract. A live Agentic Market operation therefore cannot currently become routeable supply through a supported application seam.

### Plan and authority kernel

Existing source:

- `src/modules/customer-request/application/interpret-compile/graph.ts` loads only current eligible published supply and exact active contracts.
- `src/modules/customer-request/semantic-interpreter.ts` restricts model proposals to known selection keys and registered input schemas. The model cannot construct routes, identifiers, approvals, recipients, or authority.
- `src/modules/customer-request/compiler.ts` deterministically composes actions, route edges, costs, evidence, recovery, and digests. Inter-step mapping exists only for exactly matching registered semantic/schema identities.
- `src/modules/customer-request/route-mandate.ts` binds one principal, Request revision, route generation, exact route/step material, effects, data use, evidence, expiry, and aggregate maximum spend.
- `convex/customerRequestRouteMandateAdmission.ts` rechecks supply and attenuates the mandate to one exact step grant while reserving cumulative spend.
- `convex/customerRequestRouteTransportWorker.ts` executes through the existing Workpool and registered HTTP/MCP/x402 transport runtime.
- `convex/customerRequestRouteExecutionJournalPorts.ts` validates provider output against the exact active contract before it can feed a later step.

This is already the intended Agent Engine. Do not route published capabilities through the static `src/modules/actions/index.ts` registry or let the model emit URLs. Capability-derived action IDs plus exact bindings are the correct seam.

### Answer and customer journey

Existing Answer is intentionally read-only:

- `/api/answer/turn` streams bounded Answer events.
- `runAnswerToolUseAgent` exposes only read tools.
- `customerRequestPlanPreviewAction` already produces an `inspect_only` consumer-safe plan preview through the real Customer Request source.
- inquiry handoff currently emits a provider/inquiry URL only.

The right change is a typed **inspect-only plan/handoff artifact**, not a paid Answer tool. Answer may explain a route and navigate the user into the same Customer Request. Confirmation, mandate issuance, and execution remain behind Customer Request authentication and explicit authority.

## Representative experiment

### Customer job

> “Find the current official Australian electrical-licensing requirements relevant to hiring an electrician, read the three strongest government sources, and summarize the requirements with citations.”

### Intended plan

```text
Step 1: exa.search
  input:  { query, numResults: 3 }
  output: normalized { results: [{ title, url, score }] }
  ceiling: $0.007 USD

Step 2: exa.contents
  input:  { urls: selected Step 1 result URLs }
  output: normalized { pages: [{ url, text }] }
  ceiling: $0.001 USD

Maximum route spend: $0.008 USD
Final synthesis: Answer Engine consumes only validated Step 2 evidence
```

This is the sharpest architectural test because it crosses discovery, typed planning, explicit approval, cumulative spend, two live x402 calls, validated inter-step data, evidence, recovery, and customer-safe readback.

### One additional deterministic seam required

Exa search returns result objects, while Exa contents accepts an array of URLs. The current compiler intentionally maps only matching semantic/schema identities; it does not invent transforms. Add a **registered response projection owned by the provider binding** (for this experiment, a fixed `results[*].url -> /urls` projection validated against both schemas). The model must not write JSON pointers or transformation code. If a bounded projection cannot be represented safely, run Exa search as the first one-step live canary and retain the existing local two-step transport proof; do not fake a live chain.

## Required changes, in order

### P0 — before any wallet is funded or payment enabled

1. **Fix x402 readiness credential disclosure.** `runCapabilityReadinessProbe` resolves every non-public credential and `probeRequest` puts it in `Authorization: Bearer ...`, including the EVM private key used by `createEvmX402PaymentSignature`. An x402 readiness probe needs only an unsigned HEAD/GET challenge; it must never send signing material. Rotate any wallet key that has ever passed through this readiness path.
2. **Represent sub-cent money exactly.** `$0.001`, `$0.007`, and `$0.008` cannot be represented by an integer field implicitly interpreted as currency minor units with exponent 2. Replace the implicit model at this boundary with an explicit atomic decimal amount, e.g. `{ currency, atomicAmount, exponent }`, or a separately typed x402 asset amount plus exact FX/ceiling policy. UI and authority must render and compare the same value. Provider-declared exponents are untrusted; pin asset/network decimals from an AE-owned allowlist.
3. **Unify RouteMandate payment with the money ledger and first-dollar gate.** Per-step spend reservation is authority, not a charge. Before signing, the route worker must call the source-owned money authorization/ledger seam and refuse while `first-dollar-compliance-au` remains open.
4. **Complete paid-outcome reconciliation.** A signed request followed by timeout, lost response, or non-2xx can still have settled. Persist payment response/facilitator/chain evidence and move ambiguous paid outcomes to reconciliation-required, never ordinary retryable failure.
5. **Use bounded managed custody.** Prefer a CDP-managed/server wallet or HSM/KMS-backed signer with a dedicated low-balance wallet, network/asset/payee/amount policy, no key export, balance/allowance caps, and attested deployed configuration. Raw environment private keys are not sufficient production custody proof.

### P1 — smallest AE-native supply path

6. Add one authenticated, idempotent **external capability import command** that performs normalize → admit → publish. Bind source digest, provider identity, exact business/offering/access-path revision where genuinely provider-authored, and readiness evidence.
7. Keep Agentic Market/CDP Bazaar as an **external discovery source**. Persist its provenance and trust tier. Do not imply the indexed service is an AE business claim or that ranking is an AE endorsement. Do not publish it into the human business catalog unless ownership/authorization is established.
8. Add a safe machine operation projection: stable operation ID/version, contract ref/digest, bounded input/output schemas, fixed price, effects, authority mode, retry/recovery/cancellation, provenance, readiness expiry, and routeable status. Exclude credentials, raw adapter config, private evidence, and internal refusal details.
9. Add the fixed Exa response projection described above, owned and hashed with the binding.
10. Add an Answer read-only plan/handoff artifact reusing `customerRequestPlanPreviewAction`; navigation continues the same Request. Answer never executes or pays.

### P2 — hosted/provider/customer evidence

11. Import Timezone and Exa from fresh live source, run unsigned readiness, and assert exact resource/query/network/asset/payee/schema consistency.
12. Exercise the full journey on a fresh hosted deployment with runtime-selected supply, not a hardcoded fixture.
13. After P0 approval, run one funded mainnet attempt with a capped wallet and explicit customer approval. Capture challenge, authorization digest, payment identifier, provider response, payment response/facilitator or chain receipt, validated output, next-step materialization, final citations, and redacted customer readback.

## Acceptance and refusal matrix

### Must pass

- Candidate originates from a pinned live source with source digest and provenance.
- Exact full resource URL is preserved; GET query is part of identity.
- Input/output schemas are bounded and locally valid.
- Network, scheme, asset, payee, amount, timeout, method, and required fields agree across pinned metadata and live challenge.
- Publication, contract, offering, binding, admission, conformance, readiness, and access-path revisions are current.
- Model proposal contains only registered action IDs and typed inputs.
- Compiler produces a digest-stable plan and exact aggregate ceiling.
- Customer explicitly approves that exact plan/ceiling.
- Mandate and step grants bind principal, recipient, data use, effects, expiry, and cumulative spend.
- Money gate and ledger authorize before signing.
- Provider output validates before persistence or downstream use.
- Replay cannot duplicate payment; unknown outcome reconciles before retry.
- Final answer cites provider-derived evidence without claiming payment proves correctness.

### Must refuse with no provider call

- Unknown/model-invented operation, endpoint, recipient, asset, network, or amount.
- Catalog/live-schema disagreement.
- Remote schema reference or unsupported schema feature.
- Private, redirected, or DNS-rebound target.
- GET challenge omits/changes the registered query.
- Price cannot be represented exactly.
- Provider-declared token decimals are not pinned by AE.
- Stale publication, access path, readiness, contract, or binding digest.
- Missing credential/custody attestation.
- Effect, data recipient/purpose, per-step ceiling, aggregate ceiling, principal, or expiry mismatch.
- First-dollar gate open or ledger refusal.
- Invalid output/evidence mapping.
- Possibly submitted payment without completed reconciliation.

## Proof ladder

1. **Existing source proof:** importer, publication, route compiler, mandate, grant, transport, x402, output-validation, replay, partial/unknown/cancel, and two-step chaining tests.
2. **New local contract proof:** exact Timezone/Exa fixtures captured from live metadata; import and all negative disagreement cases.
3. **New captured-provider journey:** real compiler/mandate/Workpool with deterministic captured 402 and response frames; no payment.
4. **Live unsigned proof:** fresh discovery + fresh 402 challenges; no signer.
5. **Hosted nonspending proof:** fresh deployment discovers and previews current operation descriptors.
6. **Paid provider proof:** one capped-wallet attempt after P0 gates; payment and provider evidence captured separately.
7. **Customer-value proof:** an Australian user receives useful, source-grounded output and can inspect what ran, what was paid, and what remains uncertain.

Existing high-value proof anchors include:

- `tests/unit/capability-supply/publication-importers.test.ts`
- `tests/integration/capability-publication.test.ts`
- `tests/integration/capability-supply-registration.test.ts`
- `tests/unit/capability-supply/route-transport-runtime.test.ts`
- `tests/unit/action-invocation/dynamic-published-operation.test.ts`
- `tests/integration/customer-request-v2-multi-capability-route.test.ts`
- `tests/unit/customer-request/hosted-agent-journey.test.ts`

These prove local contracts. They do not establish deployed reachability, production custody, payment settlement, provider fulfillment, or Australian customer value.

## Final recommendation

Implement one narrow vertical slice, not a marketplace subsystem:

1. repair the P0 payment boundary;
2. make one external import command reachable;
3. expose one safe machine descriptor;
4. add inspect-only Answer → Customer Request handoff;
5. import Exa search and contents with pinned live metadata;
6. compile and approve the exact `$0.008` route;
7. first run it with captured responses and unsigned live challenges;
8. only then authorize one capped real payment.

Agentic Market/CDP Bazaar should answer **“what external capability might exist?”** AE’s own admission, contract, plan, mandate, ledger, transport, validation, and evidence layers must answer **“what this principal may execute now, for whom, at what exact cost, with what recovery.”**
