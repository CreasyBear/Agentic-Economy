# Gates: Packet M runtime prune

Scope: Delete only the audited answer, answer-thread, legacy harness/chat, artifacts, run viewer, external-run, answer eval, old routes/functions, and implementation-specific tests.

- [ ] G1: Legacy runtime/routes/evals are absent while false-positive retained harness fixtures remain.
  CHECK: ! rg -n "modules/(answer|answer-thread)|components/ae/chat|externalRuns|harnessSessions" src convex eval tests --glob '!tests/**/capability-*harness*' --glob '!tests/**/operation-*harness*' && echo RUNTIME_PRUNE_OK
  EXPECT: RUNTIME_PRUNE_OK
  EVIDENCE: pending

- [ ] G2: `/api/answer/*` and `/admin/runs` are absent from source and generated route tree.
  CHECK: ! rg -n "/api/answer|/admin/runs|api\.answer|admin\.runs" src/routes src/routeTree.gen.ts && echo ROUTES_PRUNED_OK
  EXPECT: ROUTES_PRUNED_OK
  EVIDENCE: pending

- [ ] G3: Convex API/schema no longer declares or exports the eleven legacy tables/functions.
  CHECK: ! rg -n "answerThreads|answerTurns|answerTurnReservations|answerToolCalls|answerThreadShares|harnessSessions|harnessSessionEntries|externalRunManifests|externalRunStarts|externalRunEvidence|externalRunGateDecisions" convex/schema.ts convex/_generated && echo CONVEX_PRUNE_OK
  EXPECT: CONVEX_PRUNE_OK
  EVIDENCE: pending
