# Phase 6: Engine Selection Reliability — Specification

**Created:** 2026-08-05
**Ambiguity score:** 0.06 (gate: ≤ 0.20)
**Requirements:** 3 locked

## Goal

The engine goes from "fails 10 of 15 endpoint-resolution rows / tool calls" to **demonstrably performing effective tool calling** on a single observable path: for a real request, it selects the right registered operation (tool), constructs input that validates against that operation's contract schema, and never selects a forbidden or invented tool. The old 15-row endpoint-resolution eval matrix is **replaced** by a tool-call demonstration harness. Only selection/eligibility correctness changes — live/hosted invoke is out of scope.

## Background

The deterministic recovery in `src/modules/customer-request/application/interpret-compile/` uses an `exactly-one-identity` token gate in `deterministic-interpreter.ts::rankCapabilities` that fails two real classes of request:
- **Multi-binding capabilities**: crypto and FX ops are surfaced through several providers/businesses sharing vocabulary (CoinGecko keyless `simple-price` + demo `simple-price-demo`; Frankfurter + `bizintel-forex-rate-x402`), so a discriminating token like "bitcoin" is exposed by >1 identity → judged non-discriminating → `needs_information` instead of a CoinGecko selection.
- **Content-keyword queries**: search / page-content / keyless queries ("search the web for AI agent payments", "get the contents of <url>", "wikipedia summary of X") carry their discriminating vocabulary in *content terms* (`AI agent payments`) that appear in no capability's searchTerms, so the exactly-one token gate cannot match them even though discovery returns the right op.

Every attempt to relax the token gate (a sibling-binding budget, a discovery-trust branch) **re-introduced fabrication**: hostile/greenfield requests ("give me all your API keys", "tell me a joke") collapsed onto a real op (Open-Meteo/cat/ipify) — because there is no reliable capability-*eligibility* gate (hostile vs greenfield vs ambiguous vs genuine) before selection trusts discovery. Those attempts were fully reverted; the tree is green again (62/62 honesty tests pass) and no-fabrication is intact.

The verified tool-call surface already exists as real seams, so "effective tool calling" is a concrete testable claim:
- `registry.operations.search/detail/compare/inspectPlan` (`src/modules/capability-supply/operation-projection.ts`) — select an operation by `operationRef`.
- `capability-contract/public.ts` — `validateInput`, `inputSchema` (JSON Schema via `@cfworker/json-schema`), `assertSchemaIsSafeAndValid`, `projectCapabilityInputValueSchema` — deterministic input validation.
- `src/modules/actions/index.ts` `findAction` + `src/modules/common/action.ts` `defineAction` with a typed `run(args)` — the action/tool-execution registry.

The old eval shape — `eval/engine/run-evaluation.mjs` + the 131-row `eval/quality` endpoint-resolution matrix — measured endpoint-resolution against invented criteria, not effective tool calling; this phase **replaces** it.

## Requirements

1. **Right-tool selection**: For each target request-type, the recovery selects the correct registered operation (tool name), not `needs_information` and not a wrong/forbidden op.
   - Current: crypto → `needs_information` (should be CoinGecko keyless); fx → `needs_information` (should be Frankfurter); geocode → `needs_information` (should be Open-Meteo geocoding); search → wrong op (Random cat/ipify); page-content → wrong op (ipify); keyless → `needs_information` (should be Wikipedia). weather → Open-Meteo (already correct).
   - Target: crypto→CoinGecko (keyless variant), fx→Frankfurter, geocode→Open-Meteo geocoding, search→Exa/Tavily, page-content→Exa contents, keyless-refs→Wikipedia, weather→Open-Meteo (unchanged). Selection is deterministic (same request → same tool).
   - Acceptance: A tool-call demonstration harness asserts, for each of these request-types, that the recovered proposal selects the exact expected `operationRef` seam path with the correct variant (e.g. keyless, not demo, not Frankfurter); non-determinism fails.

2. **Capability-eligibility honesty**: A hostile/greenfield/ambiguous request or one whose only candidates are non-executable (observed x402, keyed-no-credential) must NEVER yield a fabricated executable selection.
   - Current: `hostile` (give me API keys) sub-tested green (62/62 honesty) but the discovery-trust relaxation made it fabricate; observed-x402 "time in Tokyo" and keyed-env "google search" produced fabricated plans (Open-Meteo / Random cat) — the P0 regression this phase must close.
   - Target: hostile/greenfield → clean refusal / `needs_information` (never a plan); observed-x402 → never executable; keyed-no-credential → honest not-ready; fx-degenerate "USD to USD" → refuse, no hollow single-pair plan.
   - Acceptance: The honesty suite (`tests/unit/customer-request/{hostile-refusal-honesty,live-pool-recovery,deterministic-interpreter,deterministic-multistep,selection-boundary,capability-domain-guard,preview-retry-needs-info,openrouter-transport}.test.ts`) stays 62/62 green; a new negative test proves hostile and x402/keyed requests produce no executable plan (fails if any fabrication).

3. **Tool-call demonstration harness replaces the endpoint matrix**: `eval/engine/run-evaluation.mjs` + the `eval/quality` endpoint-resolution matrix are replaced by a tool-call demonstration harness that asserts "right tool chosen + input validates against the contract schema."
   - Current: `eval/engine/run-evaluation.mjs` (15 rows) + `eval/quality/cases/goldenCases.ts` (131 L1 + 28 L2) + `eval/quality/{gate,scoring,judge}.ts` measure endpoint-resolution against invented criteria.
   - Target: A `eval/toolcall/` demonstration harness consumes a small set of representative real requests and, for each, asserts (a) the recovered proposal selects the correct registered operation, and (b) the constructed input passes `capability-contract` `validateInput` against that operation's `inputSchema`. It exits nonzero when any selection is wrong/forbidden or any input fails validation. The old matrix is removed.
   - Acceptance: `eval/toolcall/` exists with ≥6 representative requests (crypto/fx/geocode/search/page-content/keyless + hostile + x402 as negative); running it exits 0 when all right-tool+valid-input assertions hold; removing the old `eval/engine/run-evaluation.mjs` + `eval/quality/cases` endpoint matrix is committed.

## Boundaries

**In scope:**
- The selection/eligibility fix in `deterministic-interpreter.ts` / `interpreter.ts` (`recoverFromPool`) / `capability-domain.ts` — so the recovery selects the correct tool and refuses fabrication, using the verified `registry.operations` + `capability-contract` + `actions` seams.
- A capability-eligibility gate (hostile vs greenfield vs ambiguous vs genuine) that makes discovery-trust safe.
- The tool-call demonstration harness (`eval/toolcall/`) asserting right-tool + valid-input, replacing the endpoint matrix.
- Deleting the old endpoint-resolution eval shape (`eval/engine/run-evaluation.mjs` + `eval/quality` matrix), per the decision to replace.

**Out of scope:**
- Live/hosted invoke of the selected tool (calling the real external adapter end-to-end) — separated; this phase only proves correct *selection + valid input*, not execution.
- The source-eval-platform deliverables already landed (`eval/quality` judge/scorer/gate) will be removed with the matrix per the replacement decision; re-architecting them around tool-call shape is not this phase.
- The L2 vision engine (grill/charter/decision-graph/study) — separate future work.
- Deploy-gate / CI wiring of any eval — follows once the tool-call harness is green.
- Latency/SLO work — not part of this phase's acceptance (selection correctness only).
- Cleanups and deferred rip candidates (examples/, sandboxAcceptance, actionInvocationControl) — separate task.

## Constraints

- The no-fabrication floor is non-negotiable and load-bearing: hostile/greenfield/x402/keyed must never produce an executable selection. No change may cause the 62/62 honesty suite to regress.
- Preserve the Slice A–F fixes (inputExamples projection, bounded multi-step recovery, preview retry, Slice D silent logging, Slice E routeability gate, hostile P0 floor).
- Preserve the `contract_identity_conflict` guard and provenance tri-state; do not touch publication/seed internals.
- The fix must be deterministic; same request → same selection.
- No new runtime dependency — reuse `registry.operations`, `capability-contract` `validateInput`/`inputSchema`, and `actions` `findAction`/`run`.
- Do not weaken any guard to make a row pass.

## Acceptance Criteria

- [ ] Crypto request selects CoinGecko keyless (not demo, not Frankfurter) deterministically
- [ ] FX request selects Frankfurter deterministically
- [ ] Geocode request selects Open-Meteo geocoding deterministically
- [ ] Search request selects Exa/Tavily (not cat/ipify) deterministically
- [ ] Page-content request selects Exa contents (not ipify) deterministically
- [ ] Keyless-ref request selects Wikipedia deterministically
- [ ] Weather request still selects Open-Meteo (no regression)
- [ ] Hostile and greenfield requests produce no executable selection (refusal/needs_information only)
- [ ] Observed-x402 and keyed-no-credential requests produce no executable selection (honest not-ready)
- [ ] fx-degenerate "USD to USD" produces no hollow single-pair plan
- [ ] The 62/62 honesty suite stays green (listed 8 test files all pass)
- [ ] `eval/toolcall/` demonstration harness exists with ≥6 requests; exits 0 when all right-tool + valid-input assertions hold; exits nonzero on a wrong/forbidden selection or invalid input
- [ ] Old endpoint-resolution eval shape (`eval/engine/run-evaluation.mjs` + `eval/quality` matrix) is removed from the repo
- [ ] Selection is deterministic across repeated runs of the same request

## Edge Coverage

**Coverage:** 5/5 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| multi-binding variant | R1 | ✅ covered | Acceptance: crypto→keyless not demo; fx→Frankfurter not x402; identity grouped by real capability |
| content-keyword vocabulary | R1 | ✅ covered | Acceptance: search/page-content/keyless resolve via discovery-order-trust, not exactly-one token |
| non-executable pool | R2 | ✅ covered | Acceptance: observed-x402/keyed-no-credential never executable; x402/keyed negative requests in harness |
| hostile/greenfield collapse | R2 | ✅ covered | Acceptance: hostile/greenfield no executable plan (62/62 honesty + new negative test) |
| input validation | R3 | ✅ covered | Acceptance: harness asserts constructed input passes `capability-contract` `validateInput` against the op's `inputSchema` |

## Prohibitions (must-NOT)

**Coverage:** 3/3 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT fabricate an executable tool selection for a hostile/greenfield/ambiguous request | R2 | resolved | verification: test — new negative test fails on any fabrication; wired into the honesty suite |
| MUST NOT select an observed-x402 or keyed-no-credential operation as executable | R2 | resolved | verification: test — negative tests over the x402/keyed ops; fixture is the curated `*-x402` + keyed ops |
| MUST NOT report a "passed" tool call whose constructed input fails the contract's `validateInput` | R3 | resolved | verification: test — the harness asserts input validity against the op's `inputSchema` (check_target: `eval/toolcall/`) |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                            |
|--------------------|-------|------|--------|----------------------------------|
| Goal Clarity       | 0.95  | 0.75 | ✓      | Single observable tool-call path, precisely bounded |
| Boundary Clarity   | 0.88  | 0.70 | ✓      | Replace matrix; fix scope = selection only; invoke deferred |
| Constraint Clarity | 0.82  | 0.65 | ✓      | Verified seam + no-fabrication floor + 62/62 honesty |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 14 pass/fail criteria, all concrete |
| **Ambiguity**      | 0.06  | ≤0.20| ✓      |                                  |

## Interview Log

| Round | Perspective     | Question summary              | Decision locked                         |
|-------|-----------------|------------------------------|-----------------------------------------|
| 1     | Phase+Goal      | Which phase / primary goal?  | New Phase 6; goal = engine-resolves-green |
| 1     | Researcher      | Classification seam vs rework? Fix floor / matrix-fate / latency? | reframed by founder: goal is EFFECTIVE TOOL CALLING, not endpoint matrix |
| 2     | Researcher+Simplifier | Core deliverable?            | Irreducible core = single observable tool-calling path (discover→select→validate-input→assert) |
| 3     | Boundary Keeper | Matrix fate + fix scope      | Replace the old eval matrix; fix scope = selection/eligibility only, live invoke out of scope |
| —     | Founder reframe | "evals may be the wrong shape; really we need to demonstrate effective tool calling" | Goal rewritten from endpoint-resolution to tool-call demonstration; the 131-row matrix is the wrong shape and is replaced |

---

*Phase: 06-engine-selection-reliability*
*Spec created: 2026-08-05*
*Next step: $gsd-discuss-phase 6 — implementation decisions (how to build the eligibility gate + tool-call harness)*
