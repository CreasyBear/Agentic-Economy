# Verdict: SPEC §9 “implementation complete” session

Date: 2026-07-09  
Method: inverse premortem + verify-this + code-review (Standards + Spec axes)

## Inverse premortem

**Premise:** Three months later, Claude Cowork still cannot complete the agentic loop on deployed AE. This session’s “§9 done” work is in the causal chain. Why?

| Death | How this session caused it |
| --- | --- |
| Kill-rule 2 (door without receipt+log on deployed) | Marked loop falsifier done while it **passes** without delivery/recovery proof |
| Kill-rule 8 (distribution before completable loop) | Shipped `/SKILL.md` + llms hop chrome while Loop DoD still red |
| Trust theater | Treated `x-ae-authority-*` (kernel non-claim boundary) as SPEC §5 **act receipt** |
| Shallow module | Relocated route glue into `agent-door.ts` without unit-testing `invokeQuietAgentTool` |
| Process break | Skipped Matt loop: no TDD seams, no pre-agreed interface design, no code-review before claiming done; Wayfinder “plan don’t do” ignored once map said “implement” |

## Claim verification

### C1 — Door extract is deep / invoke covered without HTTP
**NOT VERIFIED**  
Evidence: `rg invokeQuietAgentTool tests/unit` → no matches. Unit file only lists tools + write-scope alignment.

### C2 — Write-scope single-sourced
**VERIFIED** (with seam smell)  
Evidence: `AGENT_TOOL_WRITE_SCOPES` in harness; clearance calls `declaredAgentToolWriteScope`.  
Caveat: clearance → harness import inverts preferred ownership (judgement call / Standards).

### C3 — SKILL + llms hop, no banned vocab
**VERIFIED** (local surface only)  
Evidence: skill/llms contain hop + SKILL pointer; banned pattern false.  
Not verified: cold Cowork session discovers and follows them on **deployed** origin.

### C4 — Falsifier proves receipt + delivery/recovery
**NOT VERIFIED**  
Evidence: scenario **pass**es when header present; evidence line `delivery_recovery_log=operator_outbox_not_on_quiet_door`.  
Receipt keys are authority-boundary fields, not SPEC §5 (`receiptId`, `actId`, `businessId/slug`, …).

### C5 — §9.1–3 honestly done; only #5/#36 remain
**NOT VERIFIED**  
Evidence: SPEC strikethroughs were premature (now corrected to PARTIAL / SHIPPED locally / NOT DONE).

### C6 — Full Matt engineering loop followed
**NOT VERIFIED**  
Evidence: no TDD red→green at agreed seams; no design-an-interface; code-review only after user challenge; batch-implemented three §9 items in one go.

## Axis summaries (sub-agents)

- **Standards:** worst = falsifier greens without delivery/recovery; invoke untested; hand-patched route tree.
- **Spec:** worst = `agentic_loop_receipt` WRONG vs §1/§5/kill-rule 2; authority receipt ≠ act receipt.

## What was real (keep)

- Thin HTTP adapter + door module file (relocate is real, depth incomplete)
- Write-scope table collapse (C2)
- `/SKILL.md` + llms hop teaching (C3 local)
- Honest comment on #37 that DoD waits on deploy — undercut by striking §9.3 done

## Required next (if continuing Matt loop)

1. **Grill** the open decisions below (HITL) — do not keep coding past them.
2. TDD at seam `invokeQuietAgentTool` (identity→admission→allowWrites→run) without HTTP.
3. Falsifier must **fail** (or skip) until outbox enqueue→attempt→ref/held is observed; never pass on header alone.
4. Separate or rename authority-boundary receipt vs SPEC §5 act receipt — no silent synonym.
5. Only then touch deployed #5/#36.
