# Scope 02 — Capability registry / assistant-readable supply (CURRENT INDEX)

**Status:** active lightweight execution index.  
**Historical context:** `.planning/archive/scopes/scope-02-capability-registry/`.  
**ADR:** `.planning/adr/ADR-002-capability-registry-agent-native-supply.md`.  
**Boundary:** source/local model and check work only until deployed evidence exists; no public wording may use internal `capability`/`endpoint` vocabulary without PM-05 adaptation.

## Current truth

- Archived Scope 2 plans remain source-local planning context, not standalone permission to ship public/deployed claims.
- 02-01 is source-local complete per archived `02-01-SUMMARY.md`.
- S2-G3 is GO for source-local 02-02/02-04 consumption, provided schemas stay wedge-agnostic and `operationMode` stays disclosure, not trust.
- S2-G2 threat fixtures are required before 02-03 check-engine work; active fixture contract lives at `S2-G2-endpoint-check-threat-fixtures.md`.
- Deployed/provider capability-check proof waits on Scope 1 issue #5 and a real allowed host/domain-control setup.
- Public/demo copy waits on `.planning/scopes/PM-05-ADAPTATION-PLAN.md`.

## Execution order

| Work | Source | Current status | Gate |
|---|---|---|---|
| 02-01 resolve capability model tickets | Archived 02-01 plan/summary | Complete as source-local context | Do not re-open unless current code contradicts it. |
| 02-02 capability tables/migration | Archived 02-02 plan | Source-local executable after assumptions check | S2-G3; no service-shaped fields; no public copy. |
| S2-G2 threat fixture pack | Active `S2-G2-endpoint-check-threat-fixtures.md` | Complete as source-local fixture contract | Covers SSRF/injection/freshness/contradiction cases and no dispatch. |
| 02-03 check engine/endpoint standard | `02-03-SUMMARY.md`; archived 02-03 plan | Source-local complete: ingestion, runtime action/mutation split, hourly cron, and fail-loud deployed smoke landed | Deployed proof waits on #5; provider smoke still requires deployed base URL, host allowlist/domain-control setup, seeded business, real attempt row, facets/readback, and trust-state evidence. |
| 02-04 search/discovery/disclosure copy | Archived 02-04 plan | Source-local labels only until PM-05 GO | PM-05 adaptation, PM-01/PM-02 proof for product claims. |

## Scope-4 dependency output

Before Scope 4 may dispatch to a business reply channel, Scope 2 must produce an internal contract with:

- normalized same-origin `dispatchUrl` for the registered business reply channel;
- outbound signing-key reference and inbound verification-key reference;
- checked+fresh endpoint readback with freshness timestamp;
- same-origin/domain-control evidence;
- SSRF/refusal results for private/link-local/loopback/DNS-rebind/redirect cases;
- statement that check success authorizes **only** later Scope-4 preflight consideration, not POST/dispatch by itself.

## Done for source-local 02-02/02-03

- Wedge-agnostic capability storage/tests pass.
- S2-G2 fixture pack passes.
- 02-03 Task 1 parses business-origin `ae-ucp:v1` manifests as checked input only: documented keys retained, owner text sanitized, forbidden authority/readback/payment/action claims rejected, same-origin URLs required, and issue #11 contradiction hard fields surfaced.
- 02-03 Task 2 persists per-capability trust states through the runtime split: `convex/capabilityCheck.ts` performs hardened GET/HEAD node fetches with timeout/body cap/TLS/SSRF/redirect/origin guards and delegates persistence by internal mutation reference; `convex/capabilities.ts` idempotently records attempts, computes trust via the pure oracle, applies backoff/no-repair degradation, and emits redacted readbacks.
- 02-03 Task 3 rechecks due capabilities hourly through an indexed, bounded selector (`by_recheckEnabled_staleThresholdAt`) and schedules `capabilityCheck.runEndpointCheck` with a persisted source-owned recheck payload. `test:provider-smoke:capability-check` fails loudly until deployed evidence is configured.
- Deployed/provider proof is explicitly not claimed.
- Human copy uses PM-05 public replacements or remains internal.
