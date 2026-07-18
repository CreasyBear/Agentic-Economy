# Waves 38–42 — Residual deepen plan

**Status:** CLOSED (Waves 38–42 complete at `21964dc1`)  
**Baseline:** map `0f7d185c` · code `3463c1d4` · Waves 23–37 **CLOSED**  
**Stamped:** 2026-07-18  
**Thermo:** PASS WITH RESERVATIONS — do not reopen closed hosts as line-count chops

## Goal

Finish the **optional leftovers** called out after Waves 33–37 without regressing locked deepen practices. Primary track: route-execution dispatch lifecycle + support-export read. Secondary track: first V2 write family. Park size-only residuals.

## Locked constraints (non-negotiable)

Carry forward from CONCERNS + ADR-011 + ADR-012:

1. Provide-facts ports pattern (module ports + pure orchestration → thin `convex/*Ports.ts` → host validators forever).
2. No `WritePlan` / `writePlan` / `intendedPatches` under `journal/` or `machines/`.
3. No Convex sibling chops (`…Start/Lease/Outcome/Cancel/Problem.ts`, or `…Dispatch.ts` / `…Recover.ts` pass-throughs).
4. Do **not** grow `JournalPorts` (979), `CancelPorts` (392), or `ProblemPorts` (259) to absorb recover/mark — dedicated family required.
5. Adapter ceiling ~**1000** lines per ports file.
6. Call sites unchanged: transport worker / Application keep calling `internal.customerRequestRouteExecution.*` (and existing V2 / outbox paths).
7. ADR-002 governed-send stays inquiry-owned.
8. Do **not** reopen Waves 23–37 closed deepens.

### Process (each implement wave)

Real `Task(engineering-*)` chain: architect → onboarding → backend → minimal-change → code-reviewer → thermo. **Commit only after thermo PASS** (or PASS WITH RESERVATIONS when residual is explicitly parked). Do not commit `outputs/*`.

---

## Wave map

| Wave | Kind | Deliverable | Approx. host delta |
|------|------|-------------|--------------------|
| **38** | Design | **ADR-013** dispatch lifecycle ports | docs only |
| **39** | Implement | recover / mark machines + `DispatchLifecyclePorts` | RouteExecution −~270 orchestration |
| **40** | Implement | `exportProblemForSupport` (+ optional `readProblemForBusiness`) load assembly | RouteExecution −~90–120 |
| **41** | Design | **ADR-014** V2 write-family ports | docs only |
| **42** | Implement | V2 `commitAggregate` + route-plan refresh/retry behind ports | V2 host −~390 write glue |

**Deferred (not in 38–42):** outbox webhook/retry (Wave 43+), inquiry dual-path parity harness, registry/discovery size, Application validators forever.

---

## Wave 38 — ADR-013 design unlock

**Goal:** Accept the seam for recover/mark before moving code.

### Decision record (must include)

- **Ports type:** `DispatchLifecyclePorts` (name locked in ADR; synonyms rejected in rejected-alternatives).
- **Adapter file:** `convex/customerRequestRouteExecutionDispatchPorts.ts` (or `…LifecyclePorts.ts` — pick one in ADR and stick).
- **Machines:** under `src/modules/customer-request/route-execution/machines/` (e.g. `recover.ts`, `mark.ts`, shared leased-invocation open).
- **Exports in scope:**
  - `recoverExpiredDispatch`
  - `markDispatched`
  - `recordNotReleased`
  - `markAccepted`
  - `openLeasedDispatch`
  - shared `currentLeasedInvocation` (moves behind ports / machine helper — not a new Convex sibling).
- **Reuse:** pure predicates already in `journal/decisions.ts` (`recoverDispatchLeaseStillCurrent`, `recoverDispatchAttemptAligned`, `recoverExpiredDispatchKind`, …).
- **Atomicity:** one mutation/query registration; scheduler side effects after durable rows consistent (same rule as ADR-011 lease → recover schedule).
- **Hard bans:** no Journal/Cancel/Problem growth; no WritePlan; no `customerRequestRouteExecutionRecover.ts` sibling.
- **Out of scope for 38–39:** problem support export (Wave 40), V2 (41–42), outbox.

### Exit criteria

- ADR-013 Accepted under `.planning/adr/`.
- CONCERNS pointer: Waves 38–39 gated on ADR-013.
- **No** machine/port implementation in the ADR commit.

---

## Wave 39 — Dispatch lifecycle machines

**Depends on:** Wave 38 Accepted.

### Work

1. Module ports interface + machine orchestration for the five exports.
2. Thin Convex adapter `*DispatchPorts.ts` / `*LifecyclePorts.ts`.
3. Host handlers become validator + `machine(args, ports(ctx))` shells.
4. Thinness lock: extend `machines-thinness.test.ts` and/or add `dispatch-lifecycle-thinness.test.ts`:
   - host must not contain multi-table patch trees for these exports;
   - forbid WritePlan tokens under machines;
   - adapter `<= 1000` lines;
   - assert Journal/Cancel/Problem ports files did not absorb this family.
5. Keep green: integration recover/mark paths in `tests/integration/customer-request-v2-multi-capability-route.test.ts` + journal recover cases.

### Exit criteria

- Thermo PASS (or reservations only for Wave 40+ leftovers).
- RouteExecution host shrinks by the recovered write trees; call paths unchanged.
- Commit message style: `refactor(route-execution): deepen dispatch lifecycle behind ADR-013 ports`.

### Stop conditions

- If adapter approaches 1k mid-wave → split **read** leased-open helpers into a second ports file under the same ADR, do not dump into JournalPorts.
- If integrity/replay semantics drift → revert machine move; fix with predicate + ports fake tests first.

---

## Wave 40 — Problem support READ load assembly

**Depends on:** Wave 39 preferred (host quieter); may run after 38 if 39 blocked, but prefer sequential on RouteExecution.

### Work

1. Fold under **ADR-012 §2 preference** (“Prefer also thinning `exportProblemForSupport` when adapter stays under ~1k”) — **no new ADR** unless ProblemPorts would breach ceiling.
2. Mirror Wave 28 evidence-load: load/assemble behind ports; pure `projectSupportProblemExport` stays in `problem-support/`.
3. Optionally thin `readProblemForBusiness` the same way if it shares the load graph.
4. Host query shells only; Application `export-support.ts` stays thin.
5. Thinness: extend `problem-mutation-thinness` or add `problem-support-read-thinness`; keep `problem-support.test.ts`.

### Exit criteria

- ProblemPorts still **under ~1k** after adapter growth (today 259 — headroom).
- If headroom insufficient → stop and open a tiny ADR for dedicated `ProblemReadPorts` instead of stuffing.

### Stop conditions

- Do not re-thicken Application problem-route actions.
- Do not reopen Wave 34 mutation machines.

---

## Wave 41 — ADR-014 V2 write-family design unlock

**Goal:** First ports ADR for `customerRequestV2` — one family only.

### Decision record (must include)

- **Family in scope (Wave 42):** write path only —
  - `commitAggregate`
  - `refreshRoutePlanGeneration`
  - `recordRoutePlanGenerationRetry`
- **Ports:** `CustomerRequestV2WritePorts` (or tighter name) + `convex/customerRequestV2WritePorts.ts`.
- **Module home:** `src/modules/customer-request/` (prefer existing aggregate/route-plan modules; do not invent a parallel compiler).
- **Validators stay in** `convex/customerRequestV2.ts` forever.
- **Hard bans:** no `customerRequestV2Commit.ts` sibling chop; no legacy retirement in this wave; no Application validator relocation.
- **Out of scope:** read projections (`getCurrentAggregate`, …), preparation siblings (`customerRequestV2Preparation*.ts`), full 1492 collapse.

### Exit criteria

- ADR-014 Accepted.
- Explicit wave gate: implement only in Wave 42.
- Deletion-test stated: removing write orchestration must concentrate complexity in the module.

---

## Wave 42 — V2 write-family ports

**Depends on:** Wave 41 Accepted.

### Work

1. Ports + pure orchestration for the three writes.
2. Thin host handlers; preserve integrity / replay / legacy-aggregate refusal behavior.
3. Thinness suite + existing V2 multi-capability / Application integration suites stay green.
4. Do not touch preparation hosts or read-only projection blobs in this wave.

### Exit criteria

- Thermo PASS.
- V2 host reduced by write-family glue; public Convex paths unchanged.
- Commit: `refactor(customer-request): deepen V2 write family behind ADR-014 ports`.

---

## Explicitly parked (after 42)

| Residual | Why parked | Next unlock |
|----------|------------|-------------|
| Outbox webhook ingest / retry / operator | Wave 37 closed persist; next family needs small ADR/note | Wave 43+ |
| Inquiry dual-path parity harness | Extraction done; soft parity is verification, not deepen | Speculative harness wave |
| Registry / discovery ~1.5k | Catalog-from-rows done; size-only | Only with concrete search seam |
| Application 1749 | Host-done validators forever | Never as line-count project |
| V2 read / preparation families | Separate ADRs after write family proves pattern | Wave 44+ |

---

## Suggested commit cadence

| Wave | Commit shape |
|------|----------------|
| 38 | `docs(adr): accept ADR-013 dispatch lifecycle ports` |
| 39 | `refactor(route-execution): deepen dispatch lifecycle behind ADR-013 ports` |
| 40 | `refactor(route-execution): deepen problem support export load behind ports` |
| 41 | `docs(adr): accept ADR-014 customer-request V2 write ports` |
| 42 | `refactor(customer-request): deepen V2 write family behind ADR-014 ports` |
| Close | `docs(planning): close residual deepen campaign Waves 38–42` (+ CONCERNS size sync) |

Optional mid-band: update CONCERNS after 39 and after 42 so line counts stay honest.

---

## Ranking rationale

1. **Recover/mark first** — predicates already pure; ADR-011/012 deferred this set; JournalPorts must not absorb it; unlocks RouteExecution toward ~1k without reopening cancel/problem.
2. **Support export next** — small, ADR-012 already permits; ProblemPorts headroom; pairs with evidence-load locality.
3. **V2 write family** — largest undeepened host, but needs its own ADR and is a domain switch; place after route-execution leftovers so thermo residuals on RouteExecution clear first.

**Alternate order (if merge pain on V2 dominates):** 41→42 before 38→39. Do not interleave half-finished ADRs across both hosts in one commit.

---

## Acceptance for the band

Waves 38–42 CLOSED when:

- [ ] ADR-013 + ADR-014 Accepted
- [ ] Dispatch lifecycle + support-export + V2 write family behind ports
- [ ] Thinness locks green; integration suites green
- [ ] CONCERNS campaign stamp updated; Application/registry/outbox leftovers still marked optional/parked
- [ ] Thermo: PASS or PASS WITH RESERVATIONS naming only parked residuals
