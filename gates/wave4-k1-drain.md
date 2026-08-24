# Gates: Packet K1 drain commit

Scope: Produce a deployable drain-only commit that stops new answer turns without touching legacy Convex writers.

- [ ] G1: POST answer admission returns one deterministic no-store retirement problem before parsing, admission, session, model, or writer work.
  CHECK: npm exec -- vitest run tests/unit/server/answer-api-retirement.test.ts --reporter=dot && echo DRAIN_ROUTE_OK
  EXPECT: DRAIN_ROUTE_OK
  EVIDENCE: pending

- [ ] G2: K1 changes no legacy Convex writer file.
  CHECK: test -z "$(git show --name-only --format= HEAD | rg '^convex/(answerThreads|harnessSessions|externalRuns|schema)\.ts$')" && echo DRAIN_ISOLATED_OK
  EXPECT: DRAIN_ISOLATED_OK
  EVIDENCE: pending

- [ ] G3: K1 commit hash is recorded as the production drain candidate.
  EVIDENCE: pending
