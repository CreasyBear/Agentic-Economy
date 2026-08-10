# Codebase Concerns

**Analysis Date:** 2026-08-09

## Tech Debt

- **Answer tool authority is duplicated across contracts.** `src/modules/answer-thread/answer-thread.schema.ts` defines `ANSWER_READ_TOOL_IDS`, `src/modules/harness/tool-contract.ts` repeats the same IDs as `AnswerModelToolIds`, and `src/modules/answer-thread/internal/answer-tool-registry.ts` owns a separate `ANSWER_READ_ACTIONS` array. The model path in `src/modules/answer/internal/answer-tool-use-agent.ts` and the turn runner can therefore drift when a read action changes. Consolidate the IDs and action lookup behind one registry contract and retain one boundary drift test.

## Known Bugs

- **Homepage category chips still advertise unavailable presets.** `src/routes/index.tsx` labels chips as asks the engine resolves, including `search the web` and `wikipedia`, while `tests/unit/market-terminal/feeds.test.ts` explicitly excludes `wikipedia-rest.page-summary` and the general search providers. `src/modules/answer-thread/internal/turn-orchestrator.ts` can mark explicit web search unavailable when no executable operation is selected. Users following a chip can receive a refusal instead of the promised result. Remove unavailable chips or replace them with currently executable, source-backed asks; keep the chip test tied to the canonical feed inventory.

## Security Considerations

- **Deleting an answer thread does not delete its harness journal.** `convex/answerThreads.ts` deletes turns, reservations, tool calls, and the thread, but `deleteAnswerThreadBatch` never removes `harnessSessionEntries`. Finalization stores private harness material there from `src/modules/answer-thread/internal/answer-turn-finalization.ts`, and `convex/answerThreads.ts` rehydrates it through `by_runId_seq`. A user can therefore delete the visible thread while linked private execution evidence remains available to owner/admin readbacks. Extend the bounded deletion cascade to linked run entries and test both owner and admin readbacks after deletion.

- **Shared answer links have revocation but no expiry or read admission.** `src/modules/answer-thread/internal/share-token.ts` models only active/revoked state and `src/routes/s.$shareToken.tsx` performs public projection reads without a rate-limit check. A leaked bearer URL remains usable until manual revocation and can be replayed for repeated reads. Add an explicit expiry/TTL check to the durable grant, rate-limit the public route by token/requester, and record access/revocation evidence without weakening HMAC verification.

## Performance Bottlenecks

- **The direct answer tool path has no default execution timeout.** `src/modules/answer-thread/internal/tool-runner.ts` calls `runHarnessTool` without `timeoutMs`; `src/modules/harness/action-tool.ts` treats timeout as optional, and `src/modules/harness/tool-contract.ts` exposes it as optional metadata. A stalled registry action can keep a turn pending until the request aborts. Set a bounded answer-tool/run budget, pass the request `AbortSignal`, and preserve timeout status in the durable tool result; do not claim a latency regression without measurement.

## Fragile Areas

- **Node-only schema dereferencing must remain outside the Convex graph.** `src/modules/capability-supply/internal/schema-deref.ts` imports `@apidevtools/json-schema-ref-parser`, whose Node dependencies cannot enter Convex bundles. Admission callers and `convex/` code have different runtime constraints, so a convenience import can make code generation or deployment fail. Keep dereferencing in the node-side boundary, inject it from node callers, and enforce the boundary with an import test.

- **The Node 22 requirement is enforced only by the local launcher.** `package.json` declares `engines.node` as `22.x`, but `tools/dev/local-dev.mjs` performs the hard check only for its `dev:local` path. Direct Vite, build, typecheck, or Convex commands can use another runtime and fail with toolchain-dependent errors. Add one repository preflight/version-manager or CI pin shared by every supported entry point; keep the launcher check as a fast local diagnostic.

## Scaling Limits

- **Readiness refresh has a fixed batch and no failure backoff or lease.** `convex/crons.ts` schedules `internal.capabilitySupply.scheduleDueCapabilityProbes` every minute; `convex/capabilitySupply.ts` selects at most 20 rows whose validity is near expiry and schedules all immediately. `src/modules/capability-supply/internal/graph/record-probe-result.ts` records unhealthy validity but does not provide a durable next-attempt lease/backoff. Persistently unhealthy rows can be reconsidered each cycle and consume the batch ahead of other due rows. Add durable next-probe/backoff and lease state, then prove fair progress with a deterministic scheduler test.

- **Answer and harness records have no scheduled retention policy.** `convex/crons.ts` cleans inquiry buckets, source-write nonces, and OAuth grants, but not `answerThreads`, `answerTurns`, or `harnessSessionEntries`; finalization in `src/modules/answer-thread/internal/answer-turn-finalization.ts` can append multiple journal entries per turn. Data therefore remains until explicit deletion, with no bounded archive/compaction path. Define retention by data class, compact or archive private run evidence, and schedule bounded cleanup with an auditable receipt.

- **Harness journal payloads have no application byte cap.** `convex/harnessSessions.ts` accepts `payloadJson`, `publicSummaryJson`, and `privatePayloadJson` as unbounded strings, while `src/modules/answer-thread/internal/answer-turn-finalization.ts` serializes reports directly into them. `src/modules/harness/replay-projection.ts` bounds parsed complexity but not input bytes. Large evidence can approach document/write limits. Enforce per-field byte caps before persistence and retain a digest plus bounded summary for truncated private material.

## Dependencies at Risk

- **The application pins a dated Nitro nightly alias.** `package.json` maps `nitro` to `nitro-nightly@^3.0.1-20260628-090458-3df69609`, and the lockfile preserves that alias. Nightly framework changes can alter TanStack Start/Vite/Nitro behavior outside stable release expectations. Move to a compatible stable version, or isolate the nightly behind a documented compatibility check and CI smoke gate.

- **The schema-ref parser is production-installed but node-only.** `package.json` declares `@apidevtools/json-schema-ref-parser` as a production dependency even though `src/modules/capability-supply/internal/schema-deref.ts` is restricted to node-side admission. An accidental Convex import is a build-breaking bundler failure, not merely a type issue. Keep a mechanical import guard and split the node-only dependency set if deployment packaging permits.

## Missing Critical Features

- **Generic agent execution still supports only keyless HTTP JSON GET operations.** `src/modules/capability-execution/operation-execute.functions.ts` and `src/modules/capability-execution/operation-execute.actions.ts` expose the keyless descriptor/executor lane; the executor validates `http-json:v1` GET operations and fixed query mapping. Curated API-key, POST, x402, and other effectful publications remain deliberately non-executable. Either implement credential isolation/payment/approval and the additional transport lanes, or project those publications as explicitly non-executable on every discovery surface.

- **Hosted gateway readiness is not certified.** `.planning/STATE.md` and `.planning/research/2026-08-09-single-key-capability-gateway-implementation-plan.md` record source completion but hosted proof uncertified; `tools/release/operation-gateway-production-smoke.ts` is the release smoke, not evidence that a configured hosted deployment passed. The product cannot claim production gateway behavior from local tests alone. Run the smoke and browser/readback proof against an explicitly selected configured deployment, preserving the fail-closed manifest in `src/lib/server/deployment-manifest.ts`.

- **The comparison product surface remains incomplete.** `.planning/STATE.md` records no `POST /api/compare`, no registered inspect-only comparison action, and only answer-surface shortlisting; `src/modules/answer` contains `compare_known` handling but `src/routes` has no dedicated comparison endpoint or accessible comparison route. Consumers cannot obtain a stable URL/API comparison artifact outside a thread. Add the smallest source-backed inspect-only comparison seam and route, reusing existing registry facts rather than inventing a second ranking model.

## Test Coverage Gaps

- **No hosted end-to-end test proves descriptor discovery through answer execution.** `tests/unit/answer/answer-selected-operation-loop.test.ts` mocks `executeKeylessOperation`, `tests/unit/capability-execution/operation-execute.test.ts` uses injected pure dependencies, and `tests/unit/market-terminal/feeds.test.ts` uses a fake fetch source. These cover local contracts, not a deployed `capabilitySupplyOperations` read followed by a guarded provider request and persisted answer evidence. Add one isolated local-backend/hosted smoke that reads the canonical descriptor, executes one safe operation, and asserts operation identity plus evidence readback.

- **Thread deletion has no harness-journal privacy assertion.** Answer tests cover visible thread deletion and harness tests cover append/replay independently, but no integration test joins `convex/answerThreads.ts` deletion with `harnessSessionEntries` readback. Add a test that persists private evidence for a turn, deletes the owning thread, and proves owner/admin harness queries cannot recover it.

- **Readiness fairness and backoff are untested.** Existing tests do not demonstrate behavior when more than the 20-row batch in `convex/capabilitySupply.ts` repeatedly fails. Add a deterministic scheduler/probe test using `src/modules/capability-supply/internal/graph/record-probe-result.ts` that proves failed rows back off and healthy/due rows eventually receive a refresh.

---

*Concerns audit: 2026-08-09*

Revalidated against the current dirty working tree, `.planning/STATE.md`, current research/wayfinder references, source boundaries, persistence/schema paths, package scripts, and focused tests on 2026-08-09. Resolved production sandbox/demo route concerns and the selected-operation retrieval ordering issue are intentionally omitted.
