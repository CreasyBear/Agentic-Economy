# Gates: Wave 3 thin UI corrections

Scope: Close continuity, accessibility, ordering, busy-state, and share-link findings without widening the thin UI.

- [x] G1: Anonymous sign-in and route remount preserve only an allowlisted in-memory transcript; only the next prompt is durable.
  CHECK: npm exec -- vitest run tests/unit/operation-chat-ui/operation-chat.test.tsx --reporter=dot && echo UI_CONTINUITY_OK
  EXPECT: UI_CONTINUITY_OK
  EVIDENCE: Commit `e1dbff81a`; focused UI suite passed 13/13 and emitted `UI_CONTINUITY_OK`.

- [x] G2: Transcript live semantics, stale-busy recovery, absolute share copy, and chronological public share ordering are tested.
  CHECK: npm exec -- vitest run tests/unit/operation-chat-ui/operation-chat.test.tsx tests/integration/chat-durable-messaging-share.test.ts --reporter=dot && echo UI_CONTRACT_OK
  EXPECT: UI_CONTRACT_OK
  EVIDENCE: Commits `e1dbff81a` and `29bd2d87a`; focused UI 14/14 plus durable share suite passed, including absolute visible/copy parity and clipboard-failure guidance.

- [x] G3: UI type, lint, accessibility contract, and forbidden legacy imports are clean.
  CHECK: npm run test:ts-standards && npm run test:ui-contract && npm run typecheck && ! rg -n "answer-thread|modules/answer|AeChat|artifact|run-viewer" src/components/ae/operation-chat && echo UI_BOUNDARY_OK
  EXPECT: UI_BOUNDARY_OK
  EVIDENCE: > tsc --noEmit | UI_BOUNDARY_OK
