> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../README.md) for its successor and remaining limits.

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

## Campaign closeout — 2026-09-25

- Opening audit scores above are historical. Nine waves reduced oversized depth-one non-test Convex roots from 77 to **one**: registration-only `capabilityProviderConnections.ts` (29 RPCs; 274 scanner lines, pinned exactly). See the [queue](quote-standard/queue.md) and [ledger](https://github.com/CreasyBear/Agentic-Economy/blob/41c6e392f7b309860cd80469ab8e01fd26d5b79c/docs/operations/convex-root-ledger.md).
- Behavioral re-audit AB-01..AB-07 closed: restored internal approval and dispute operator mutations, repaired partial Connect readiness, documented dev-only off-Vercel header trust, corrected Clerk webhook refs, internalized 12 test-only RPCs, and removed stale catalog ledger text. Coverage and concern splits are recorded in the ledger.
- Gates: typecheck 0 errors; lint 0 warnings; dependency cycles 0; imports 30 files/89 tests; unit 644 passing files/6,479 tests (one skipped); integration 185 passing files/1,994 tests (31 skipped, three todo); build passes. API snapshot changed by exactly 12 public→internal flips and five additions (three internal twins, two restored internal operator RPCs); no other drift.
- Live local proof: Convex functions ready; HTTP pages and public API return 200, MCP lists tools, CLI finds Timezone Converter, and browser chat renders a Tool card and assistant answer. Connect's distinct authority/refusal envelopes and live Clerk webhook entry points remain intentional.
