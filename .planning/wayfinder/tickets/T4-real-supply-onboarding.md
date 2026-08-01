# T4 — Shortest honest path to one independently operated provider

Labels: `wayfinder:research` (AFK). Status: **resolved 2026-07-30** (research by RealSupplyResearch agent; full report at `agent://RealSupplyResearch`). Block on T2 was worked around by covering both rail options.

## Question

Every open endpoint today is AE's own labelled sandbox. Which existing integration shape reaches "independently operated provider evidence" with the least new machinery?

## Resolution

**Candidate shape:** owner-linked catalog Offering + one published `external_operation` access path, then a capability-supply publication promoted with exact catalog origin/access-path lineage (ADR-026 "one graph" promotion — already in source; no Phase 4 Business Account machinery needed).

**Contract the provider must satisfy:**
- Descriptor: public HTTPS URL (no credentials/private hosts), method in the admitted set, docs URL, interface description, pricing prose (`src/modules/catalog/internal/offering-supply.ts`; owner mutation requires source-write + authenticated owner + current offering revision).
- Capability publication: contract v2 + offering registration (price fixed/range/on_request must match), binding with endpointUrl + `env:NAME` credentialRef, origin `{kind: catalog_offering, offeringRef/revision/sourceHash}` (`src/modules/capability-supply/internal/publication/draft.ts`).
- Admission: adapter one of `http-json:v1`, `mcp-jsonrpc:v1`, `x402-fetch:v2`; publication starts inactive; admin `setEligibility` with exact hashes/evidence; readiness probe must be healthy and current (`internal/readiness-probe.ts`).
- Gap: every adapter currently REQUIRES an env credential, so a truly keyless public endpoint has no adapter — the one piece of new machinery is a public/no-credential sentinel for `http-json:v1` (or an explicit "listed but not AE-routed" stance).

**Rail split (T2 undecided):**
- Free/no-rail (recommended for the first provider): provider exposes public HTTPS GET/POST; least machinery; services API may list it, but must not label it `open`/AE-supported without routeable readiness evidence.
- Inbound x402: NOT claimable today — AE has only the outbound signer; an inbound challenge would need a separate adapter/route plus custody/settlement/reconciliation. If the provider itself speaks x402, use the x402 importer with exact price fields, and require challenge validation + one real paid call before any upgrade (a 402 probe alone is insufficient).

**Claim ceiling:** after one externally hosted conformance call: "this business publishes a machine endpoint; AE last checked it reachable at <timestamp>". Never "verified", never booking/payment/fulfilment/customer value. Real-customer evidence remains a separate, later class.
