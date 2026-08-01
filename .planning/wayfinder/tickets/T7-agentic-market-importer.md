# T7 — Seed supply by importing agentic.market's public catalog

Labels: `wayfinder:task` (AFK-capable, founder sign-off on positioning required before shipping). Status: open, unclaimed. Raised by founder question 2026-07-30.

**Reopened 2026-07-30 (grilling session):** the T8-era descope rationale ("their supply is APIs; AE's ICP is no-API locals") is inverted by the API-native wedge decision (MAP Destination v2). Imported API supply is now the supply-bootstrap play: catalog depth for the demand offer and a recruitment list for T11 onboarding ("your API is already listed — claim it and set your price"). Import claims stay `publicly_observed`; the claim-and-price conversion is the funnel. Founder optics sign-off before public shipping still required.

## Question

Bulk-import `GET https://api.agentic.market/v1/services` (public JSON, ~1,963 services) into AE supply: one business+offering per service, endpoints as `external_operation` access paths with `provenance: 'publicly_observed'`, attribution and link-out to the real provider. Purpose: catalog depth, SEO surface, traffic; AE as the consumer lens over power-user supply.

Constraints already established:
- Claims: "found in public information"; never "verified"/"AE-routed" without per-provider readiness evidence (T5 adapter + x402 importer challenge validation + one real paid call).
- USDC pricing needs an honest consumer label; interacts with T2 (rail decision).
- Refresh/staleness policy needed (their catalog churns); imported rows must carry observedAt and expire honestly.
- Founder decides the optics of re-listing a competitor's directory before this ships publicly.

## Resolution

(pending)
