# Gates: Packet M runtime prune

Scope: Delete only the audited answer, answer-thread, legacy harness/chat, artifacts, run viewer, external-run, answer eval, old routes/functions, and implementation-specific tests.

- [x] G1: Legacy runtime/routes/evals are absent while false-positive retained harness fixtures remain.
  CHECK: ! rg -n "modules/(answer|answer-thread)|components/ae/chat|externalRuns|harnessSessions" src convex eval tests --glob '!tests/**/capability-*harness*' --glob '!tests/**/operation-*harness*' && echo RUNTIME_PRUNE_OK
  EXPECT: RUNTIME_PRUNE_OK
  EVIDENCE: `aa1485afc` deleted the audited 341-file legacy cohort and modified only 20 prescribed seams, removing 71,841 lines. The forbidden scan passes and all 21 audited retained harness fixtures remain.

- [x] G2: `/api/answer/*` and `/admin/runs` are absent from source and generated route tree.
  CHECK: ! rg -n "/api/answer|/admin/runs|api\.answer|admin\.runs" src/routes src/routeTree.gen.ts && echo ROUTES_PRUNED_OK
  EXPECT: ROUTES_PRUNED_OK
  EVIDENCE: The route scan passes after normal route-tree generation; browser 20/20, accessibility 10/10, and retained paid-operation 7/7 tests pass.

- [x] G3: Convex API/schema no longer declares or exports the eleven legacy tables/functions.
  CHECK: ! rg -n "answerThreads|answerTurns|answerTurnReservations|answerToolCalls|answerThreadShares|harnessSessions|harnessSessionEntries|externalRunManifests|externalRunStarts|externalRunEvidence|externalRunGateDecisions" convex/schema.ts convex/_generated && echo CONVEX_PRUNE_OK
  EXPECT: CONVEX_PRUNE_OK
  EVIDENCE: The exact eleven-name scan passes after normal Convex generation and dry-run verification. Unit 2,466/2,466, integration 570/570, chat 85/85, retained conformance 420/420, and focused prune 19/19 pass. Production deployment and physical table deletion remain explicit human operations.
