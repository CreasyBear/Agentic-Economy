# Codebase Concerns

**Analysis Date:** 2026-09-01

<!-- refreshed: 2026-09-01 -->

This map records concerns visible in the current on-disk working tree. Items marked **Verified current** are grounded in the source presently present; **Intentional bounded design** identifies explicit limits that become operational concerns at higher volume; **Carried forward** identifies an unresolved proof or planning concern that still needs an owner and evidence rather than asserting a production failure.

Severity is relative to the current marketplace kernel: P1 blocks trustworthy operation or deployment, P2 can mislead users or operators, and P3 is a bounded maintainability or scale risk.

## Tech Debt

### P2 — Anonymous chat has two error vocabularies

**Verified current.** `convex/chatAnonymous.ts` builds error responses as `{code}` JSON, while `src/routes/api.chat.anonymous.ts` projects those upstream responses unchanged. The shared RFC 9457 model in `src/lib/errors.ts` and `src/lib/server/problem.ts` is therefore not applied to Convex-originated anonymous-chat failures. `tests/unit/routes/chat-anonymous.test.ts` currently asserts the ad-hoc `{code}` shape, while `tests/unit/http/problem-envelope-drift.test.ts` scans route source and cannot see the pass-through body.

**Impact:** clients receive different error contracts depending on whether failure occurs in the route proxy or Convex handler, and the drift can survive route-level envelope checks. Normalize non-streaming upstream failures at the backend/proxy boundary and update the contract test without changing successful streaming responses.

### P2 — Read-like demand operations incur durable source-write overhead

**Intentional bounded design with scale cost.** `convex/marketDemandSignals.ts` exposes list/status/read as mutations so they can pass `sourceWriteAdmission`; `src/modules/market-demand/market-demand.actions.ts` calls them through source-mutation helpers. Each request consumes a nonce row in `convex/sourceWriteAdmission.ts`, and cleanup is itself bounded and scheduled.

**Impact:** dashboard polling and public demand reads create write amplification, nonce retention, and cleanup load for operations with read semantics. Preserve the anti-replay boundary, but consider a distinct authenticated read admission path if the protocol can provide equivalent replay protection without one durable nonce write per read.

### P3 — Planning state does not fully describe the dirty source state

**Carried forward.** `.planning/STATE.md` still describes candidate review with no activated phase or plans, while the repository contains substantial in-flight source changes, including `src/components/ae/command-panel/`, `src/components/ae/market/operation-detail/`, layout/settings code, `convex/catalog.ts`, `convex/catalogPublicReads.ts`, and `package.json`.

**Impact:** planning artifacts cannot be treated as a complete implementation status report. Before a phase is activated, reconcile the map and state against the current working tree and distinguish accepted source changes from unaccepted planning work.

## Known Bugs

### P2 — Operation-detail outages can be presented as “no credential”

**Verified current.** `src/routes/operations.$operationRef.tsx` catches `readPublicOperationDetailRouteServer` failures as `source_unavailable`, but independently catches `listAgentAccessKeysServer()` failures and substitutes an empty list. It then derives `hasBuyerCredential` from that substituted list. `src/modules/agent-access/agent-access.functions.ts` obtains keys through an external Clerk API without returning a typed outage result.

**Impact:** an authenticated buyer with a configured key can see a connect/credential CTA during a Clerk or API outage. Keep source-unavailable, unauthenticated, no-credential, and credential-service-unavailable as distinct states; do not infer absence from a failed read.

### P2 — Evidence service failure is indistinguishable from zero activity

**Verified current.** `src/modules/market/server.ts` catches failures from the evidence query and supplies `emptyMarketListingEvidence()` from `src/modules/market/listing-evidence.ts`. That projection renders “No ratings yet”, “No completed calls yet”, and “Not enough data”, which are also the normal zero-sample values.

**Impact:** a temporary evidence outage can be shown as a healthy-but-empty marketplace signal. Preserve an explicit unavailable/unknown state and render `?` or an outage explanation rather than fabricating zero activity.

### P2 — Reconciliation can make failed progress look like no work

**Verified current.** `convex/capabilityOperationInvocationWorker.ts` bounds a reconciliation sweep to 25 items, but catches failures while loading expired candidates, reading owners, claiming work, and finishing work, then continues. The returned counters do not expose those skipped failures.

**Impact:** an operator can observe `selected: 0` or low progress while a query or claim path is failing and backlog remains. Add structured failure counters and an alertable terminal signal after bounded errors, retaining fail-closed behavior.

## Security Considerations

### P2 — Explicit anonymous-chat origin accepts arbitrary HTTP configuration

**Verified current configuration hazard.** `src/routes/api.chat.anonymous.ts` resolves an explicit `CONVEX_SITE_URL` with local HTTP permitted by `validOrigin(..., true)`. The same route can therefore be configured with an arbitrary `http://` origin, unlike internal production provider routes that require HTTPS Convex origins.

**Impact:** a production misconfiguration can send anonymous-chat traffic, including user content, over an unencrypted or unintended origin. Make the production validation rule HTTPS-only and reserve HTTP for an explicit local-development mode; ensure `CONVEX_SITE_URL` is represented in the deployment configuration contract.

### P2 — Workload identity drift is not repaired after first creation

**Verified current.** `convex/workloadCron.ts` inserts missing fixed workload principal/account/ownership/membership rows, but existing rows are left untouched. It does not validate that an existing fixed row has the expected kind, lifecycle, authority references, or revision shape.

**Impact:** an out-of-band or partially migrated row can satisfy existence checks while cron jobs run against stale authority. Validate the complete canonical identity shape or fail the deployment/readiness check with an actionable reason; do not silently rewrite ownership data.

## Performance Bottlenecks

### P2 — Source-write nonce cleanup can become read-traffic work

**Intentional bounded design.** `convex/sourceWriteAdmission.ts` persists a nonce for every admitted market-demand read-like call, while its cleanup in `convex/sourceWriteAdmission.ts` is batch-bounded and reschedules when the batch is full. High-frequency list/status polling can therefore compete with product writes and generate recurring cleanup work.

**Mitigation direction:** measure nonce insertion and cleanup saturation separately from demand-query latency, then introduce a read-specific admission primitive only if it preserves the required anti-replay and provenance guarantees.

### P3 — Registry refresh is bounded by moving offset pages

**Verified current.** `src/modules/market/registry-source-adapters.ts` fetches Agentic Market pages by offset. The adapter documents that the source has no snapshot cursor and can grow during a sweep; it uses a 95% service-ID coverage heuristic and hard caps of 200 services, 8 pages, and 1,000 entries. `convex/marketExternalRegistryRefresh.ts` writes in batches of 50.

**Impact:** a moving source can produce a mixed-generation refresh, while growth beyond the cap preserves an older active generation. Keep the safety ceilings, but expose generation freshness/completeness and investigate cursor or source snapshot support before treating the catalog as an exact inventory.

## Fragile Areas

### P2 — Local development bootstrap is best effort

**Verified current.** `tools/dev/local-dev.mjs` provisions platform identities, the local E2E owner, and the development seed after Convex becomes ready, but logs non-zero child results and continues. `convex/workloadCron.ts` requires the fixed machine identity for workload-wrapped cron functions. There is no repository-visible deployment hook connecting production deployment to the fixed identity provisioning mutation.

**Impact:** local startup can appear usable after bootstrap failure, while cron jobs or seed-dependent paths later fail closed. Make bootstrap failure visible and provide a deployment/release provisioning step or readiness gate for required workload identities.

### P2 — Public registry refresh has no point-in-time source boundary

**Verified current.** `src/modules/market/registry-source-adapters.ts` explicitly handles catalog growth during an offset sweep by retaining the highest advertised total and relying on a coverage threshold rather than a source snapshot. `convex/marketExternalRegistryRefresh.ts` preserves the previous active generation when a refresh is incomplete.

**Impact:** this is safe against replacing a good generation with a partial one, but it leaves freshness and completeness difficult to explain to users and operators. Keep the previous generation semantics and record the source generation, observed total, page ceiling, and completion reason.

### P2 — Broad catch-and-fallback boundaries erase failure classification

**Verified current.** The operation-detail loader, market evidence projection, and invocation reconciler each catch broad errors at a boundary and continue with a safe-looking fallback. The fail-closed intent is sound, but the fallback states are not consistently typed or observable.

**Impact:** recovery and support work must infer whether data is absent, unavailable, unauthorized, or skipped. Narrow catches around expected errors and carry typed terminal reasons through the read model and telemetry.

## Scaling Limits

### P2 — Daily payout settlement has fixed lookback, read, and begin caps

**Intentional bounded design.** `convex/moneyPayoutTransferSettlement.ts` scans a seven-day lookback, reads at most 32 pending/unknown rows per period/state, and begins at most 16 eligible transfers per invocation. It has no cursor or continuation token for rows beyond those limits.

**Impact:** a sustained payout backlog can starve rows outside the sampled windows, especially when unresolved rows occupy the bounded reads. Add durable continuation/progress or an explicit backlog metric and alert before increasing limits; retain bounded work per invocation.

### P2 — External registry imports have hard source ceilings

**Intentional bounded design.** `src/modules/market/registry-source-adapters.ts` limits response bytes to 6,291,456, Agentic Market to 200 services/8 pages, TREG shelves to 8, and total imported entries to 1,000. `convex/marketExternalRegistry.ts` additionally bounds admission/search page sizes.

**Impact:** these limits protect Convex and network resources, but larger upstream catalogs will be partially observed or retain an older generation. Surface the exact completion reason and source-reported counts instead of implying a complete external inventory.

## Dependencies at Risk

### P2 — Runtime support boundary differs between workspace and CLI

**Verified current configuration.** The root `package.json` requires Node `22.x` for Convex and declares pinned core versions including `convex` 1.45.0, `@convex-dev/agent` 0.7.1, `ai` 7.x, `vite` 8.x, and `typescript` 5.9.3. `packages/cli/package.json` advertises Node `>=20`.

**Impact:** the CLI's broader engine declaration permits environments that cannot run the workspace's Convex/build toolchain. Keep the root Node 22 requirement explicit in release automation and document or enforce the CLI's tested runtime matrix; keep lockfile resolution and semver-ranged dependencies under release-gate coverage.

## Missing Critical Features

### P1 — Production-controlled provisioning for cron workload identities

**Verified repository gap.** `convex/workloadCron.ts` contains the idempotent ensure handler, and `tools/dev/local-dev.mjs` invokes local setup, but no repository-visible production deployment/migration hook provisions or verifies the fixed workload principal and account before scheduled jobs run.

**Impact:** a fresh deployment depends on out-of-band identity rows and can have a cron fleet that fails closed immediately after deployment. Add a deployment-safe provisioning/readiness step with exact canonical-shape checks and an operator-visible failure, without weakening workload authorization.

### P1 — Authenticated and paid lifecycle proof is opt-in

**Carried forward.** `.github/workflows/kernel-release-gate.yml` runs authenticated platform proof only for workflow dispatch and runs live gateway proof only when dispatch is on the main branch with explicit live-spend confirmation. `tests/unit/release/green-release-baseline.test.ts` verifies the optional artifact gating rather than executing those external proofs by default.

**Impact:** ordinary source/PR gates do not establish the two-agent authenticated lifecycle, paid gateway invocation, payout, or reconciliation behavior. Keep spend consent explicit, but publish a required staging cadence and artifact retention policy so these kernel paths cannot remain perpetually unproven.

### P2 — Live market-cell proof remains unestablished

**Carried forward.** `.planning/STATE.md` records that the live market-cell category is not selected or proved. This is a proof/completion gap, not a claim that the catalog or adapters are absent.

**Impact:** registry freshness, supplier result handling, and settlement behavior lack an end-to-end representative production-like observation. Record the selected cell, source evidence, expected terminal receipt, and known unknowns when the proof is run.

## Test Coverage Gaps

### P2 — Network guard behavior lacks direct unit coverage

**Verified current test gap.** `src/modules/network-guard/public.ts` and `src/modules/network-guard/server.ts` implement DNS resolution checks, IPv4-mapped IPv6 handling, local-range blocking, manual redirects, and bounded response bodies. Existing tests primarily mock `isPublicHttpTarget`, `createGuardedLookup`, or `sendGuardedHttpRequest`; `tests/unit/security/ssrf-surface-drift.test.ts` is a structural scan rather than direct behavior coverage.

**Needed coverage:** hostname normalization, every relevant private/reserved range, DNS rebinding at connection time, IPv4-mapped IPv6, redirect refusal, and oversized-body refusal.

### P2 — Anonymous upstream RFC 9457 pass-through is not contract-tested

**Verified current test gap.** `tests/unit/routes/chat-anonymous.test.ts` asserts the `{code}` response shape from the current implementation, and `tests/unit/http/problem-envelope-drift.test.ts` does not inspect `convex/chatAnonymous.ts` or the proxy's unchanged upstream body.

**Needed coverage:** backend validation/rate/config failures and proxy failures should all produce the canonical problem shape, while a successful text stream remains a stream with its existing headers.

### P2 — Outage-versus-empty UI states are not protected

**Verified current test gap.** `src/routes/operations.$operationRef.tsx` has no demonstrated test for an access-key service outage, and `src/modules/market/server.ts` has no demonstrated test asserting that an evidence-query failure is distinguishable from an empty evidence result.

**Needed coverage:** preserve typed unavailable states and ensure no-credential/zero-activity copy is not rendered after a dependency failure.

### P2 — Workload bootstrap does not test wrong-existing-row behavior

**Verified current test gap.** `convex/workloadCron.ts` has tests around workload execution, but the ensure path's behavior when a fixed identity row exists with incorrect kind, lifecycle, authority references, or revision is not covered by a focused contract test.

**Needed coverage:** reject or repair only the explicitly approved drift cases, verify no unrelated ownership rows are mutated, and make the readiness failure observable.

### P2 — Reconciliation skipped-error accounting is untested

**Verified current test gap.** The sweep limits and successful terminal counters in `convex/capabilityOperationInvocationWorker.ts` are exercised, but the broad catch branches for candidate load, owner read, claim, and finish do not have a contract asserting surfaced failure counts or alertable terminal reasons.

**Needed coverage:** inject each failure class, assert fail-closed handling, and assert that the returned result/telemetry cannot look like a clean zero-work sweep.

### P2 — Default release gates do not exercise paid external proof

**Verified current gap by workflow contract.** `.github/workflows/kernel-release-gate.yml` deliberately makes authenticated and live gateway proof conditional on dispatch inputs and external artifacts. The default gate therefore cannot catch regressions in live spend, supplier payout, or hosted two-agent lifecycle paths.

**Needed coverage:** run the opt-in proof on a defined staging cadence and retain exact receipts; do not replace it with fixtures or local evidence.

<!-- refreshed: 2026-09-01 -->
