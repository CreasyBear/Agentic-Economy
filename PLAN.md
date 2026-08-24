# Operation-Market Prune Execution Ledger

## Contract

- Product: Operation catalogue plus a thin chat adapter.
- Chat tools: exactly search, detail, compare, inspect plan, and safe keyless execute.
- Durable content/stream/tool persistence belongs to `@convex-dev/agent@0.7.1`.
- Anonymous chat is bounded, browser-ephemeral, text-only on input, and server-storage-free.
- API, MCP, CLI, invocation, money, recovery, supplier, agent-access, parity, and gateway smoke remain independent.
- Old answer, answer-thread, harness, artifacts, run viewer, checkpoints, replay, model catalogue, answer eval, and external-run are deleted only after staged writer retirement and extraction.
- Production deployment, export, and table deletion are human release checkpoints and never inferred from repository authority.

## Depth tree

1. Operation-market prune
   1. Foundations and backend
      - Wave 1: Packets A-C
      - Wave 2: Packets D-G
   2. Product cutover
      - Packet H: thin UI and continuity corrections
      - Packet I: route/discovery cutover
      - Packet J: release, codegen, browser/staging gates
      - Wave 3 integration review
   3. Writer retirement and extraction
      - Packet K1: drain-only route commit
      - Packet K2: Release A writer freeze and exact legacy schema
      - Packet L: retained cross-boundary extraction
      - Wave 4 integration review
   4. Deletion and consolidation
      - Packet M: audited runtime/test/eval prune
      - Packet N: dependency/environment cleanup
      - Packet O: architecture and rollback documentation
      - Wave 5 integration review
   5. Completion
      - Full source/build/generated/CLI/parity gates
      - Net line-count gate
      - Staging and production human checkpoints

## Ownership

The master owns contracts, ordering, gates, conflict resolution, reviews, generated output verification, and release checkpoints. One mutating worker at a time owns an exact path set. Reviewers never edit.

## Status log

- Wave 1 accepted: commits `65959ec48` through `5207cbe7e`, dual review passed.
- Wave 2 accepted: commits `c742476ac` through `79291d274`, dual review passed.
- Wave 3 accepted after correction and re-review: thin chat cutover, browser/release proof, and retained payment isolation are green through `68d2cbc7a`.
- Wave 4 accepted after correction and dual review: the repository drain candidate, Release A writer freeze, exact eleven-table compatibility schema, and retained-boundary extraction are green through `71b688a09`. Production drain/deploy evidence remains an explicit human checkpoint.
