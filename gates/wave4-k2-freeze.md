# Gates: Packet K2 Release A writer freeze

Scope: Fail closed all fifteen legacy writers while retaining readers and an exact self-contained eleven-table schema.

- [x] G1: All fifteen validator-valid writer calls return the same retirement error and mutate/schedule nothing.
  CHECK: npm exec -- vitest run tests/integration/legacy-writer-freeze.test.ts --no-file-parallelism --reporter=dot && echo WRITERS_FROZEN_OK
  EXPECT: WRITERS_FROZEN_OK
  EVIDENCE: Duration  1.13s (transform 640ms, setup 192ms, import 647ms, tests 230ms, environment 0ms) | WRITERS_FROZEN_OK

- [x] G2: The temporary schema declares exactly eleven legacy tables and imports no legacy module.
  CHECK: test -f convex/legacyReleaseASchema.ts && npm exec -- vitest run tests/unit/chat/operation-chat-prune-boundary.test.ts --reporter=dot && test -z "$(rg -n "@/|from './(answer|harness|external)" convex/legacyReleaseASchema.ts)" && echo LEGACY_SCHEMA_OK
  EXPECT: LEGACY_SCHEMA_OK
  EVIDENCE: Duration  862ms (transform 430ms, setup 187ms, import 609ms, tests 4ms, environment 0ms) | LEGACY_SCHEMA_OK

- [x] G3: Normal and dry-run Convex generation pass with no generated drift.
  CHECK: npm run generate:convex && npm run check:convex-codegen && git diff --exit-code -- convex/_generated && echo FREEZE_CODEGEN_OK
  EXPECT: FREEZE_CODEGEN_OK
  EVIDENCE: Node 22.22.0; normal generation, dry-run, and generated drift check passed; only expected API registration from `5616abaf3` remains tracked.
