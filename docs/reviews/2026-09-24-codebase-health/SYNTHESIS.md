# Codebase health, 2026-09-24

Every finding here is observation only; nothing in source has been changed. The detail for each area is in the files beside this one.

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

## Highest-value queue
1. Verify, then fix, the two HIGH findings: procure-engine.ts:177-180,290-299 (replay of an unfinished purchase cannot progress) and rate-limit.ts:127-154 (the caller can rotate its own rate-limit bucket).
2. Bring Call projection up to the Quote standard (fails checks 1 and 3).
3. Delete the dead code: 26 files (1,748 LOC), the 774-LOC publication-admit pair, charge-contract (306), and 20 Convex RPCs that nothing references.
4. Make the gates honest again: bare catches are 20 against a ceiling of 19, plus the façade ratchet holes and overshoots.

## Status 2026-09-24 (end of day)

The tables and original queue above are the opening audit, not the current state.
- Both HIGH bugs are fixed: caller-rotatable rate-limit buckets (`3d4ba6672`) and stalled unfinished-purchase replay (`68d692b38`).
- Quote-standard §8 records 22 live roots processed across 14 ledger entries (including the partial Connect type-unification pass); this is not a claim that all four checks pass for every root. See the [current queue](quote-standard/queue.md) for remaining oversized roots.
- Dead code removed: `3509f0ed9` deleted 10 orphaned `src/` files (−737 lines); `ee831d3a3` deleted 13 RPCs and seven empty Convex roots.
- Typecheck went from 92 errors to 12 remaining chat-owned errors (protocol §8); no non-chat green claim is implied.

Open decisions and follow-ups from protocol §8:
- Connect's fabricated payout binding and differing authority/refusal envelopes require a behaviour decision before type unification.
- Decide whether `catalogOriginIsCurrent` on the eligible-ports path must check businessId as the graph path does; reconcile the readonly `OwnerSupplyCommandResult` with the mutable Convex-validator shape.
- Seven operator RPCs remain pending operator decisions; investigate 40 test-only RPC references (especially Clerk webhook string references) before deletion.
- Keep principal missing-identity refusal codes and Managed-Call remedy/finalize transitions distinct unless their semantics are deliberately changed.
- Move pure `callLifecycle/terminalProjection.ts` into the domain in an API-changing wave; relocate the provider-row test beside its concern.
- Layout follow-ups: loose `catalog/sellerCanary.ts`, the publication-admit pair and 17 unwired skeletons (product decision). Hyphenated Connect modules were already fixed in `ee831d3a3`.
