# 02-03 Summary — Endpoint check engine / endpoint standard

**Status:** source-local complete; deployed/provider proof remains blocked on configured deployed evidence.

## Landed

- **Task 1 ingestion:** business-origin `ae-ucp:v1` manifests strict-parse as checked input only. Documented keys are retained, owner text is sanitized, forbidden authority/readback/payment/action claims are rejected, same-origin URLs are required, and issue #11 contradiction hard fields surface instead of silently rewriting AE-held facts.
- **Task 2 runtime split:** `convex/capabilityCheck.ts` performs the hardened Node runtime endpoint fetch and never writes directly to Convex state. `convex/capabilities.ts` records attempts idempotently, computes trust state through the pure oracle, applies retry/backoff/no-repair transitions, and stores redacted readbacks.
- **Task 3 cron:** `convex/crons.ts` registers `recheck due business capabilities` hourly. `convex/capabilities.ts` selects only explicitly enabled due rows through `by_recheckEnabled_staleThresholdAt`, bounds the batch, and schedules `internal.capabilityCheck.runEndpointCheck` with the persisted source-owned recheck payload.
- **Task 3 provider smoke:** `npm run test:provider-smoke:capability-check` runs `tests/deploy-smoke/scope2-capability-check-smoke.spec.ts`. Without deployed evidence env it fails loudly and lists all required inputs; it rejects screenshots, dashboards, env-var presence, webhook arrival alone, external URLs, and local-only source assertions as proof.

## Proof observed

- `npx vitest run tests/unit/capabilities/ingest-manifest.test.ts tests/unit/capabilities/check-engine.test.ts` — 2 files passed, 16 tests passed.
- `npm run typecheck` — passed.
- `npm run check:convex-codegen` — passed.
- `npm run test:ts-standards` — passed.
- `npm run build` — passed.
- `npm run test:provider-smoke:capability-check` — failed loudly as intended without deployed evidence env; this is not external proof.

## Still not claimed

- No deployed capability-check provider proof is claimed until Scope 1 issue #5 supplies the deployed environment, host allowlist/domain-control configuration, seeded agent-operated demo business, real attempt row, facet/readback text, and resulting trust state.
- No public claim should say or imply `verified` endpoint, callable business endpoint, payment/action capability, autonomous operation, deployed provider proof, booking, dispatch, or payment completion from this source-local work.
