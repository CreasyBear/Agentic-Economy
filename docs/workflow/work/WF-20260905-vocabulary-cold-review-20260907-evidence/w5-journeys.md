# Wave 5 — cold journey review

Review target: HEAD `a51e17b221c6b73851c5873502d8150120ef3aad` (source cutover `3770b43bac9bf3ea11478664ee8249ec4ddf505e`). Node `v22.22.0`, npm `11.5.1`. I used `git show HEAD:path` for source so unrelated dirty worktree edits were excluded.

## Inspected boundary

- Anonymous discovery: `src/modules/actions/index.ts`, registry Tool actions/contracts, `src/routes/api.v1.market-tools.{list,search,describe,compare}.ts`.
- Buyer chain: `src/routes/api.v1.tools.quote.ts`, `src/routes/api.v1.tools.call.ts`, `src/lib/server/call-api.ts`, `src/modules/capability-execution/{quote.actions,call.actions,call-recovery.actions,call-entry.ts}`.
- Durable handoff: `convex/capabilityQuotes.ts`, `convex/capabilityCalls.ts`, `convex/lib/callLifecycle/callActions.ts`, `convex/capabilityCallWorker.ts`, and the Formance reservation path.
- Recovery/UI: `src/routes/api.v1.calls*.ts`, `src/routes/calls.$callRef.tsx`, recovery contracts and suggested actions.
- Provider-facing caller: `src/lib/server/supply-landing.functions.ts`, `src/routes/for-providers.tsx`, `src/components/ae/supply/AeSupplyLanding.tsx`, and its authority test.
- Public status copy: `src/routes/status.tsx`.

## Confirmed findings

### P2 — Provider landing readback silently loses all public Tool inspection actions

Confidence: 10/10. Provenance: missed caller after the Tool action rename; the stale code predates `3770b43` but is inside the cutover boundary.

- Evidence: `src/lib/server/supply-landing.functions.ts:9-15` filters `listMcpActions()` with `action.id.startsWith('registry.operations.')`.
- Producer: `src/modules/actions/index.ts:71-76,125-129` registers/exposes the four anonymous read actions as `registry.tools.list`, `registry.tools.search`, `registry.tools.describe`, and `registry.tools.compare`; `tests/unit/actions/registry.test.ts:96-122` asserts exactly those IDs.
- Trigger/path: GET `/for-providers` (`src/routes/for-providers.tsx:7-8`) calls `loadSupplyLandingReadbackServer`, which applies the impossible prefix before rendering `<AeSupplyAgentProof tools={tools}>` (`src/components/ae/supply/AeSupplyLanding.tsx:153-156`). With the current action registry, `tools` is always `[]` even when the catalogue is healthy.
- Observable impact: the Provider page's “What agents can inspect” proof omits the available Tool-market read actions, so the Provider's supply-to-inspection journey presents an empty/incomplete machine surface. The listing projection is fetched independently and can still render, masking the defect.
- Test gap/reproduction: `tests/unit/capability-supply/supply-landing-authority.test.ts:11-50` mocks the old `registry.operations.search` ID and therefore verifies the stale filter rather than the real registry. Replacing that fixture with `registry.tools.search` makes the current implementation return no tools; a real registry-backed caller test would catch it.
- Minimal correction direction: derive the landing readback from the current anonymous Tool read action set (or a shared predicate) and update the test fixture/assertion to current IDs. Do not add legacy aliases.

### P3 — Public status page still calls the canonical Tool/Call surface “Operation API”

Confidence: 9/10. Provenance: pre-existing public copy from the earlier golden-cycle page, omitted by the current cutover (not introduced by `3770b43`).

- Evidence: `src/routes/status.tsx:27` labels the market probe `Operation API` and says `Search and new Operation calls are ready`; line 36 describes `Operation API`; line 96 says individual `Operation` readiness is shown in the catalogue and on each `Operation` page.
- Trigger/path: any user visiting `/status` sees this copy while the same source exposes `/api/v1/market-tools/*`, `tool.quote`, `tool.call`, `/tools/$toolRef`, and the Tool vocabulary throughout the current market UI.
- Observable impact: users and operators are directed to an obsolete product vocabulary when checking the exact search-to-Quote-to-Call surface. This is copy/information architecture drift, not a transport failure.
- Minimal correction direction: update the four public strings to Tool/Call terminology and add a focused status-copy assertion so a future source cutover cannot leave this page behind.

## Counterevidence considered

The primary buyer chain itself is internally joined: market Tool navigation points to the current Tool routes; `tool.quote` returns a caller-bound Quote whose continuation is `tool.call`; `callAction` requires `quoteRef` plus idempotency, and the Convex call path reserves the managed balance before dispatch. Recovery routes and action descriptors use `call.status`, `call.cancel`, and `call.reconcile`, with reconciliation required before uncertain retry. I found no confirmed authority, reservation, delivery-state, or recovery-contract mismatch in that path.

The old strings in `src/lib/server/call-api.ts` and reconciliation evidence (`operationKey`, `operationRef`, `invocationRef`, and hash/evidence formats) were treated as protected implementation/evidence vocabulary per the brief. The `healthStatus` input in `tools.actions.ts` is projected after source filtering by design and does not establish a journey bug. The owner Call page's cancellation-state gating and its synthetic status projection after recovery looked worth a runtime check, but source inspection did not prove an incorrect observable result; they remain verification gaps rather than findings.

## Verification limits / explicit gaps

No broad tests, compiler, hosted deployment, live Convex data, or Provider endpoint were run, per the cold-review brief. The P2 finding is a deterministic source-level caller mismatch and a directly reproducible mocked-test gap. The P3 finding is verified from current public source copy; its runtime visual presentation was not browser-tested.
