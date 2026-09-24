# Codebase health, 2026-09-24

The scores and priority table below are the opening audit, retained for comparison. The campaign closeout at the bottom supersedes its status claims; detail remains in the files beside this one.

| Area | Score | Report |
|---|---|---|
| Correctness (src/modules, src/lib, tools) | 5/10, 2 HIGH, 6 MED | ThermoSrc.md |
| Dead and orphaned code | 6/10 | Orphans.md |
| Over-engineering and handrolling, server | 7.5/10 | PonytailServer.md |
| Over-engineering and handrolling, UI | 7.5/10 | PonytailUI.md |
| Quote standard (Convex roots) | 0 of 72 roots pass check 1 | quote-standard/*.md |
| React Doctor | 49, 4 errors and 500 warnings (user's run) | pasted in session |

## Quote standard: the four priority files

| File | 1. Registration only | 2. Lib has one concern per file | 3. No src/ importers | 4. One shared core |
|---|---|---|---|---|
| capabilityCallProjection.ts (873) | FAIL | FAIL | FAIL, 19 src importers | pass (createCallService / canonicalAgentCallCore) |
| moneyConnect.ts (935) + moneyLedger.ts (367) | FAIL | FAIL | pass | FAIL, Connect types duplicated in payout-connect-http.ts:48-150 |
| moneyDocuments.ts (848) | FAIL | FAIL | pass | FAIL, document insert and enqueue repeated in lib/money/fundingStripeEventPipeline.ts |
| capabilityProviderConsequenceJournal.ts (985) | FAIL | FAIL | pass | FAIL, ticket-claims digest duplicated in call-worker/jitProviderConsequence.ts:624-642 |

- **Sweep of 72 roots:** check 1 passes 0/72, check 2 passes 1/72, check 3 fails only in tools/dev/magical-core-flow.ts:29, and check 4 is proven for 3 roots and unclear for 69.
- **Ratchet holes:** 9 roots over 200 lines are not pinned. Six pinned roots are over their own ceilings.
- **Duplicated types:** CallDispatchProjectionShape is defined twice, at callLifecycle/dispatch.ts:47 and purchaseResolutionMaterialize.ts:19.

## Opening-audit priority (historical)
1. Verify, then fix, the two HIGH findings: procure-engine.ts:177-180,290-299 (replay of an unfinished purchase cannot progress) and rate-limit.ts:127-154 (the caller can rotate its own rate-limit bucket).
2. Bring Call projection up to the Quote standard (fails checks 1 and 3).
3. Delete the dead code: 26 files (1,748 LOC), the 774-LOC publication-admit pair, charge-contract (306), and 20 Convex RPCs that nothing references.
4. Make the gates honest again: bare catches are 20 against a ceiling of 19, plus the façade ratchet holes and overshoots.

## Campaign closeout — 2026-09-24

- Opening audit scores above are historical. Wave 8 finished the chat/registry roots: `chatTools.ts` (529) was a zero-RPC shell and deleted; `chatAnonymous.ts` 290→4, `chatGenerate.ts` 217→11, `chatShares.ts` 402→41, `registry.ts` 442→33. The prior 12 typecheck, 3 import and 33 unit failures are fixed.
- Depth-one non-test Convex roots over 200 scanner lines: **1**, down from the opening 77. `capabilityProviderConnections.ts` is a 277-line registration-only, 29-RPC exception; no pin is overrun. See the [current queue](quote-standard/queue.md) and [ledger](../../operations/convex-root-ledger.md).
- Closeout gates: typecheck 0 errors; imports 30 files/89 tests passing; unit 645 files/6,492 tests passing (one file/test skipped); integration 180 files/1,985 tests passing (one file, 31 tests skipped; three todo); build passes. API snapshot: 2 tests pass, zero RPC triple drift. Lint fails on 14 out-of-campaign diagnostics after six campaign-touched warnings were fixed. Dependency check fails: 13 circular edges versus 6 at `3d4ba6672^`, seven newly introduced; neither gate was weakened.
- The earlier Connect authority/refusal envelope distinction and live Clerk webhook string references remain intentional; registration-only size is not a blanket verdict on every semantic check.
