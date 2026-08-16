# Answer Engine Architecture — Contract-Driven Capability Interpretation

Date: 2026-08-12 (rev 2, post two-persona validation)
Status: Design proposal
Prior rev: 2026-08-12 rev 1 (four-seam plan). This rev folds in **ArchReviewer** (reuse-vs-handroll) and **ProdEngineOp** (implementation-feasibility) critiques and the self-serving principle.

## 0. The guiding principle: self-serving, not hard-coded

The answer engine must derive **all** per-capability behavior from what a provider
declares at onboarding — never from answer-layer hard-coded tables. The capability
**contract already declares** the full input surface; the engine reads it
generically:

| What the engine needs | Where it comes from (onboarding, supply-owned) | Status today |
|---|---|---|
| Input field names, required, patterns, human input name | contract `inputSchema` + `x-ae-input-name` (Frankfurter `quotes`→`quote`) | reused by dynamic tools |
| Human slot labels + prompt role per input | contract `customerAnnotations` (`base→"Base currency"`, `city→"City name"`) | EXISTS, **under-used by the answer layer** |
| Example values / constellations | contract `inputExamples` (carried with publication) | reused, **mis-framed** |
| Whether inputs are sufficient / what's missing | contract `CapabilityDecisionModel.assessInput` → `needs_information` | EXISTS, **under-used** |
| Canonical validation before execution | contract `validateInput` + strict-schema harness | reused |

Therefore **there is no `capability-input-spec` module and no per-capability
semantics table** (rev-1 §2 proposed these; both validators rejected them as
hand-rolled per-op policy). The engine is a generic interpreter over the declared
contract. Adding an op = onboarding declares its schema + customerAnnotations +
examples; **zero answer-layer code change**.

Verified on-disk: `customerAnnotations` per-input labels exist for Frankfurter
(`base→"Base currency"`, `quote→"Quote currency"`), OpenWeatherMap (`city→"City
name"`, `lat→"Latitude"`, `lon→"Longitude"`); `assessInput`/`needs_information`
live in `src/modules/capability-contract/public.ts` (decision model 258-274) with
tests at `tests/unit/capability-contract/decision-model.test.ts:163-215`.

## 1. Problem (validated)

Adversarial QA (5 goblins + live transcript): the engine is a capability planner,
not an answer product. 2/15 natural-worded requests complete cleanly. Structural
causes: single-slot resolve; ungrounded input construction (model free-hands raw
schema, mistakes `inputExamples` for the live pair, leaks field names,
false-positives FX); stateless follow-ups (`answer_turn_persist_failed`); no
composition; flaky/`maxRetries:0`; no idempotency; no self-description.

## 2. Revised architecture — four seams (mapped to existing code, no new framework)

### Seam A — Capability intent = deterministic enumeration + explicit-op precedence

`resolveKeylessDataAsk` produces an **ordered candidate set** (dedup, ≤4) instead
of silently forcing one winner. Two additions over today:

1. **Explicit-op precedence**: a generic rule — if the query carries an explicit
   operation reference or a strong op-specific token (e.g. "wikipedia",
   "weather", "exchange rate"), that op suppresses generic matches. This is a
   **generic precedence policy**, not per-op code, and it kills the
   "Summarize Paris via Wikipedia" → weather misroute (finding 3). It must only
   admit **routeable execution refs**; the public-vs-executable merge
   (`turn-orchestrator.ts:275-350`) must never let a non-routeable discovery ref
   execute (finding 3).
2. **`needs_clarification` stops being a terminal agent dead-end**: it becomes a
   signalled `CapabilityIntentItem.pendingSlots`, consumed by Seam B.

Deterministic authority is preserved and **tightened**: the model does not choose
the operation set; the ordered intent does. The model only (a) binds slots within
the declared surface and (b) is shown the intent as context. Rev-1's "model
selects among intent candidates" is removed — it would recreate misrouting.

### Seam B — Slot binding = contract-driven, no new module

Delete rev-1's `capability-input-spec` + semantics table. Instead:

1. **Fill from the declared surface**: a deterministic pre-parse fills slots whose
   values are unambiguous in the query ("usd to eur" → base/quote from
   currency tokens) using only contract metadata (customerAnnotation labels +
   inputSchema patterns + `x-ae-input-name`). Remaining slots go to a structured
   fill (AI-SDK `Output.object`) whose schema is the **canonical contract
   inputSchema**, validated by `validateInput` before execution (never
   model-trust).
2. **Fix the inputExamples framing bug** (`capability-tool-examples.ts:15-40`):
   the model currently sees "EXAMPLE n — Call with: {input}" and treats
   constellations as the live pair ("Convert 500 USD to EUR" → "conflicting
   published examples such as {base:EUR,quote:USD}"). Reframe examples as
   **illustrative, non-binding** (one example, clearly marked sample) and do not
   present multiple conflicting constellations as options to pick.
3. **Human clarification from `customerAnnotations` + `assessInput`**: emit
   missing-slot labels from the contract (`base→"Base currency"`) instead of raw
   field names; use `assessInput`'s `needs_information` as the canonical
   determination (finding 2). Current leaks live at
   `answer-tool-use-agent.ts:2189-2246` (uses examples as evidence) and
   `:2249-2261` (raw names) — these are fixed to consume the decision model.
4. **Generic false-positive guard**: an op is selected only if the pre-parse
   found a positive phrase token from its declared surface (aliases/searchTerms).
   "5 miles to km" has no FX token → rejected (finding 2). This is generic.
5. **Amount / unit arithmetic is NOT an op input** (finding 2 correction):
   Frankfurter's request accepts only `base`+`quote` (verified:
   `curated-provider-publications.ts:482-498`, strict `additionalProperties:false`);
   its response is a **rate**. "500 USD to EUR" must pass `{base,quote}` to the
   op and apply `500` in a **generic synthesis arithmetic seam** ("rate ×
   amount"), not as an op field. Weather `tomorrow` similarly is interpreted in
   synthesis (`daily` is a comma-separated variable selector; there is no date
   slot) — not invented as an op input.

### Seam C — Composition: deferred or a real (non-additive) change

Rev-1 wrongly claimed the result buffer is additive. Verified: single
`operationOutcome`/`operationSelection` are embedded across
`AnswerTurnOperationArtifacts`, `AnswerSnapshot`, the event validator, the
checkpoint, and finalization/proofs; the tool loop is serialized
(`toolQueue.then`), forced to one selected capability tool, and caps at
`maxToolCalls=1` (`answer-tool-use-agent.ts:723-818, 1319-1345, 2563-2568`).

Therefore multi-op composition is **its own non-additive workstream** (coordinate
schema/digest/gate/checkpoint/finalization, or derive a bounded result set from
the already-canonical `AnswerToolCallRecords` rather than persisting a duplicate
JSON buffer). Concurrency would need the AI-SDK parallel-call path plus an
executor-level semaphore with strict caps, because provider concurrency/idempotency
is NOT guaranteed by the keyless-eligibility guard. **Recommendation: cut P3 from
this campaign.** Deliver deterministic same-op multi-subject only if cheap, else
defer comparison entirely; it is the largest lift and arguably out-of-charter for
the MVP answer product.

### Seam D — Turn continuity: fix the real lease/persist bug, reuse existing evidence

Rev-1's "add a frame field" is wrong on two counts (findings surfaced by both
validators):
- `AnswerTurnFrame` **already means `{seq,event}`** in the SSE stream
  (`answer-ui-stream.ts:41-45`); naming a new persisted field `frame` would create
  a second state authority.
- Persisted evidence already exists: `AnswerTurnRecord.evidenceJson`, checkpoint
  `priorProviders`/`priorAllowedSlugs`, `FrozenTurnEvidence.toolCalls`
  (`answer-thread.schema.ts:421-435`), and a prior-candidate resume path
  (`turn-orchestrator.ts:1062-1099`) — the "what about london" continuation is
  partly representable today.

So Seam D = **repair what already exists**, not add a field:
1. Fix `answer_turn_persist_failed` at its real sites: orchestrator lease/checkpoint
   conflict paths (`turn-orchestrator.ts:680-695, 730-795, 868-887`) and the
   finalizer's reservation-generation fences (`convex/harnessSessions.ts:426-555`).
   This is a lease/reservation bug, not "add a frame column."
2. Make same-thread follow-up resumption actually consume the prior turn's frozen
   evidence + pending clarification (the resume path exists; wire it to the intent
   seam so "yes" resolves a pending slot instead of re-searching from scratch).

## 3. Non-negotiable invariants

- **Self-serving**: zero per-op answer-layer code; all behavior derived from the
  onboarding contract. Any addition that requires editing `src/modules/answer/*`
  per capability is a design failure.
- **Deterministic routing authority**: model never chooses the op set; explicit-op
  precedence + ordered intent decide. Only routeable execution refs execute.
- **Contract ownership**: validation (decisive) via contract `validateInput`;
  clarification via contract `assessInput`; human labels via `customerAnnotations`.
- **Honesty**: never pass op-invalid input (amount is synthesis, not schema); never
  execute discovery-only refs; state unavailability honestly.
- **Reuse before build** (RULES #6): the contract decision model already owns
  semantic admission (`defineCapabilityContract`, `assessInput`); the answer layer
  consumes it.

## 4. Revised phased plan (each phase live-verified)

| Phase | Scope | Verifies |
|---|---|---|
| **P1 Turn continuity** | Fix lease/reservation persist conflict (real `answer_turn_persist_failed` sites); make follow-up resume consume prior frozen evidence + pending clarification | same-thread follow-up persists and resumes; "what about london" reuses the op; "yes" resolves pending slot |
| **P2 Contract-driven input** | Fix example framing; route clarification through `customerAnnotations` + `assessInput`; generic false-positive guard; explicit-op precedence in intent; synthesis arithmetic seam (amount ≠ op input) | "500 USD to EUR" → correct rate, not docs-example confusion; "5 miles to km" rejected; "Summarize Paris via Wikipedia" → honest unavailable; human clarification, no field names |
| **P3 Self-description** | "what can you do"/"help" answered from routeable surface + customerAnnotations | intro queries explain capabilities |
| **(deferred) P4 Composition** | real (non-additive) multi-op result path + bounded parallel execution | "paris vs london" side-by-side |

## 5. Also in scope but separate fixes (not the design's seams)

Validators flagged these as unaddressed by the 4 seams; they are their own
small fixes, tracked with the campaign:
- **Idempotency** (finding 7): reservation key + retry-after-thread-scope currently
  creates duplicate threads/turns; dedup/replace semantics needed
  (`convex/answerThreads.ts:241-251`).
- **Reliability** (finding 6): executor emits `retryable: fetch_failed` but no
  retry path; all model calls `maxRetries:0`. Add bounded retries for retryable
  fetch failures; don't make outcomes non-deterministic (varied
  success/"no admitted capability").

## 6. Key decisions needed

1. **Cut P3 composition from this campaign?** (Recommended: yes — it is the only
   non-additive, high-risk change; deliver P1+P2+P3(self-description) first.)
2. **Follow-up resume trigger**: resume only on explicit continuation tokens +
   pending clarification, never blind. (Recommended: yes.)
3. **Amount/unit**: accept only the generic synthesis arithmetic seam (rate ×
   amount), never invent non-contract op fields. (Recommended: yes.)
