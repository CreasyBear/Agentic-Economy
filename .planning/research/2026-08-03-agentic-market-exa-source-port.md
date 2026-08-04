# Agentic Market Exa source-port decision

**Date:** 2026-08-03  
**Research ticket:** [#197 — Locate the reusable Agentic Market Exa implementation](https://github.com/CreasyBear/Agentic-Economy/issues/197)  
**Evidence class:** Primary-source repository and provider-documentation review; no paid request or settlement was made.

## Decision

No public Agentic Market Exa service implementation was found. The public Agentic Market page/API and the public Frames catalog expose descriptions, endpoint URLs, pricing hints, and payment metadata—not server source, deployment code, provider credentials, facilitator configuration, persistence, or an Exa-specific implementation.

AE should therefore:

1. **Port nothing from Agentic Market.** Its listing is discovery input, not source or authority.
2. **Recreate one narrow AE-owned Exa adapter** for `POST https://api.exa.ai/search` and `POST https://api.exa.ai/contents`.
3. **Adapt official x402 package behavior** behind AE's existing deterministic authority, budget, ledger, evidence, and reconciliation boundaries.
4. **Use Exa's official SDK shapes as compatibility references**, but do not use its API-key client for the paid path: it sends `x-api-key`, which Exa documents as bypassing x402.
5. **Do not port Frames' Bun/faremeter buyer runtime or Coinbase wallet CLI/custody.** Their concepts may inform descriptor pinning, bounded retry, and receipts, but their ownership seams do not match AE.

This is a public-source availability finding, not proof that Agentic Market has no private implementation.

## Source-to-reuse matrix

| Surface | Primary source | Observed facts | Decision |
|---|---|---|---|
| Agentic Market listing | [Service page](https://agentic.market/services/api-exa-ai), [service API](https://api.agentic.market/v1/services/exa-ai) | Catalog metadata for Exa `/search` and `/contents`; no source, deployment, tests, schemas, or reuse license | Discovery only; never execution/payment authority |
| Official Exa client | [`exa-labs/exa-js@65a79c4`](https://github.com/exa-labs/exa-js/tree/65a79c4943a53c5930fb640f72cca7a85980dcb7) | `exa-js` 2.16.3; MIT; typed API-key client; sends `x-api-key`; no x402 code | Adapt request/result/error shapes only |
| Exa x402 contract | [Official x402 guide](https://exa.ai/docs/reference/x402-guide) | x402 only on `/search` and `/contents`; `402` → `PAYMENT-REQUIRED`; retry with `PAYMENT-SIGNATURE`; settlement evidence in `PAYMENT-RESPONSE` | Provider boundary contract; live challenge owns recipient/amount/network |
| Official x402 transport | [`x402-foundation/x402@17fc989`](https://github.com/x402-foundation/x402/tree/17fc9890ade45a570a019352a3573391ad5d1e1f) | `@x402/fetch`, `@x402/core`, `@x402/evm` 2.20.0; Apache-2.0; bounded 402 parsing, payload creation, paid retry, recovery hook | Depend on/adapt package seam; keep AE authority and persistence outside it |
| Frames catalog | [`microchipgnu/frames-monorepo@c72475f`](https://github.com/microchipgnu/frames-monorepo/tree/c72475f008e3d401ed545bb4b1411faecd02cf44) | MIT; stored Bazaar descriptors and merchant enrichment; `@frames-ag/pay` 0.5.1 uses Bun and faremeter; no Exa server | Descriptor/receipt concepts only; no wholesale port |
| Coinbase wallet reference | [`coinbase/agentic-wallet-skills`](https://github.com/coinbase/agentic-wallet-skills), [`coinbase/awal`](https://github.com/coinbase/awal) | Wallet/Bazaar CLI UX; no Exa service implementation | Operator UX reference only |

## Public-source search performed

- Read the Agentic Market Exa service page and service API.
- Searched GitHub repositories and code for Agentic Market + Exa, `api.exa.ai/search`, and the catalog identifier `bazaar.api-exa-ai-search`.
- Inspected Exa's official JavaScript SDK source, tests, license, and commit history.
- Inspected official x402 TypeScript packages, payment schemas, selection behavior, fetch wrapper, tests, and license.
- Inspected the closest marketplace-side public implementation: Frames catalog snapshots, Agentic Market enrichment scraper, pay specification, paid-fetch/dispatch code, tests, package metadata, and license.
- Inspected Coinbase's public wallet/Bazaar references.

No public Agentic Market backend, deployment manifest, facilitator setup, persistence code, or Exa seller implementation surfaced.

## Contracts and invariants to preserve

### Exa boundary

- Paid routes are exactly `/search` and `/contents`; do not infer x402 support for `/answer`, Websets, Research, or other SDK methods.
- An API key or bearer credential selects Exa's API-key billing path and bypasses x402.
- `/search` accepts the provider-documented search body; the paid path is capped at 10 results per Exa's x402 guide.
- `/contents` accepts provider-documented URLs/IDs; model-generated arbitrary URLs must not bypass the selected search-result projection.
- Provider responses and catalog data remain untrusted until schema validation.

### x402 boundary

- Parse the exact `PAYMENT-REQUIRED` challenge returned for the requested resource.
- Select only registered network/scheme pairs and enforce AE's asset/network/recipient/amount policy before signing.
- Interpret `amount` as an atomic-unit string; do not use catalog decimal hints as settlement truth.
- Preserve request bodies and headers across the paid retry.
- Reject a request that already contains `PAYMENT-SIGNATURE` or legacy `X-PAYMENT`; never create an unbounded payment loop.
- Persist payment authorization before submission and retain `PAYMENT-RESPONSE`/challenge digests as private evidence.
- Settlement failure, timeout after possible payment, or missing response evidence must become reconciliation-required/unknown—not success.

### AE-owned decisions

The transport library must not decide caller identity, mandate/grant, route selection, request schema, recipient policy, spend ceilings, custody, money-ledger state, final execution status, public redaction, or customer copy.

## Licensing boundary

- `exa-js` and Frames source are MIT. Preserve copyright/license notices if code or substantial portions are copied.
- Official x402 TypeScript packages are Apache-2.0. Prefer consuming their public APIs; if source is copied, preserve license/notices and mark material modifications.
- The Agentic Market listing exposed no source license or backend reuse grant.

This is a source-based engineering checklist, not legal advice.

## Contradictions and caveats

- Frames' merchant snapshot reports `advertises_x402: false` while separate Bazaar descriptors identify x402v2 routes. This makes the catalog unsuitable as payment authority.
- Catalog `price_hint`, `pay_to`, liveness, traffic, and marketplace-presence fields are mutable discovery hints—not current provider truth.
- The Agentic Market listing does not prove which Exa request fields are accepted on the paid path.
- No live paid request was made; this report proves source/documentation behavior, not wallet, facilitator, settlement, or hosted AE execution.
- Package versions and licenses must be resolved again immediately before implementation.

## Implementation handoff

Build the adapter only after the Agent runtime rationalization prerequisite is accepted. Focused proof should cover:

- non-402 passthrough;
- 402 parsing and exact scheme/network selection;
- body/header preservation on paid retry;
- malformed/pre-paid request refusal;
- no-wallet and unsupported-network refusal;
- bounded payment creation/recovery;
- unknown/reconciliation-required outcomes after possible payment;
- exclusion of payment payloads, signatures, private identifiers, and raw provider internals from public projections.

## Conclusion

**Recreate:** the minimal AE Exa route adapter and AE-owned schemas/evidence/reconciliation boundary.  
**Adapt:** official x402 client/fetch semantics and Exa request/result/error shapes.  
**Do not port:** an Agentic Market backend that is not public, Frames' runtime, AWAL custody, or the full API-key Exa SDK into the paid path.
