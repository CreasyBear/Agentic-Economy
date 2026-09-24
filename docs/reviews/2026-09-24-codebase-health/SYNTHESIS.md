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

- The opening audit's 0/72 check-1 score is historical. Through wave 4, 22 live roots were processed across 14 ledger entries; wave 5 extracted four more registration roots (`qualifiedUse`, `capabilityCallWorker`, `capabilityProviderConnectionCleanup`, `capabilityContractDocuments`) and deleted two zero/relocated-RPC helper roots. This is **not** a blanket four-check pass: Connect envelopes still differ semantically.
- Depth-one roots over 200 scanner lines fell from 51 after wave 4 to **43** at `d2baca6cd`; the [current queue](quote-standard/queue.md) ranks each by protocol §5. `chatAnonymous` is the sole over-pin root (290/213). `capabilityCalls` remains deferred at 347.
- Wave 5 itself removed a net **3,740 lines** (3,417 additions, 7,157 deletions), including 11 dead test-only RPCs, 15 unwired skeletons and the publication-admit pair. Earlier deletion passes removed 10 orphan `src/` files (−737 lines) and 13 RPCs/seven empty roots (roughly −2,400 Convex lines). The wider campaign's raw diff includes docs and generated files; it is not all root savings.
- Docs were pruned from 276 to 58 files (24.7 MB→1.3 MB); strategy alone went 64→18. These are archive reductions, not runtime code savings.
- Fixed bugs: unfinished-purchase replay (`68d692b38`), caller-rotatable rate-limit identity (`3d4ba6672`, tightened to only `x-vercel-forwarded-for` on Vercel in `7524cb6c8`), eligible-port catalog origin business-ID enforcement (`34ccfe8f7`), and fabricated Connect HTTP payout binding (`483a2d613`). The command result validator now has one capability-supply owner (`fd96e01dc`).
- One-time suites at `d2baca6cd`: `npm run typecheck` failed with 12 chat/search-owned diagnostics in six files; `npm run test:imports` failed three chat-owned gates (`chatAnonymous` size, `chatTools` registry boundary, status vocabulary 20/17). `npm run test:unit` had 635 passing files, one skipped file, 11 failing files (34 failed tests plus four import-time failures). Attribution by changed import graph since `3d4ba6672^`: **33 CHAT-SESSION** (command panel, CLI compare/doctor/request memory, Package 5; all reach the changed registry search contracts), **4 WAVE-caused by the defined touched-file rule** (three `createIsomorphicFn` mock-load failures whose graphs reach modified money/supply/account files, plus SSRF drift scanning wave-touched `convex/marketFlowRefresh.ts`), **1 PRE-EXISTING** (`privacy-removal-outcome` mock-load, whose graph has no changed file). This is dependency attribution, not proof each change introduced the underlying defect; no source failure was suppressed.
- Open: integration-fixture RPCs need a test-fixture pass; five Clerk webhook string-ref RPCs remain live. Connect authority/refusal envelopes must stay distinct pending a semantic decision. `admissionReserve.ts` (598), `x402PaymentAttempt/identity.ts` (412), and the inline `moneyX402PaymentAttempts.ts` reconcile handler remain. Chat owns `chatAnonymous`'s 290/213 pin, `chatTools` registry entry, status-vocabulary 20/17, and 12 typecheck errors. See protocol §8 for retained operator RPCs and the exact deletion ledger.
