# Product-Frontier Cleanup — strength receipt (2026-08-15)

## Doctrine check

- Destination remains publish → admit → distribute → invoke → validate → settle → learn
- Study + external-run protected
- Memo parked (notification-outbox owner), not deleted
- No handrolled replacement of mature libraries
- Single invoke/transport/money spines preserved
- Tier C hosted not claimed

## Batches

| Batch | Outcome |
| --- | --- |
| 0 Frontier baseline | Manifest + verifier + golden journeys + dirty-tree baseline + Goblin relocate |
| 1 Dead deps/orphans | streamdown family removed; self-description deleted; doctor ignores cleaned; uniqueSorted consolidated |
| 2 Low-risk trim | shipping module + dedicated tests deleted; memo park decision recorded |
| 3 Dev boundary | Import quarantine without moving development-* LOC |
| 4 Market loop | Study characterization tests; smokes env-blocked (recorded) |
| 5 Parked decisions | Memo → notification-outbox; project-spine → WorkTree successor (parked) |
| 6 Post-proof | Explicit deferral; HTTP 410 retained; no table drops |

## Gates run this revision

### Passing

- Node 22 Convex codegen dry run
- lint, typecheck, kernel-retirement, product-frontier, conformance (395 tests)
- types, SEO, UI-contract, Answer eval coverage/report, production build
- quality gate (131 L1 runnable cases)
- cleanup-specific frontier/import/Study/architecture tests (14 tests)
- action-invocation development evidence packet generated and verified
- unit suite: 3,997/4,000 tests passed
- integration suite: 579/580 tests passed

### Fingerprinted outside cleanup scope

- Unit/integration schema inventory does not list the separately-added
  `moneyExternalSpendReservations` table.
- Development-host parity rejects the separately-modified x402 released-refusal
  snapshot semantics.
- Existing gateway/settlement changes violate import boundaries and TS
  standards in `capabilityOperationInvocationWorker.ts`, `moneyLedger.ts`,
  development evidence modules, and x402 settlement verification.
- Paid-operation E2E: 6/7 pass; the separately-modified UI no longer renders
  exact `A$2.50` copy expected by the comprehension test.
- `git diff --check` reports whitespace in unrelated dirty paths.

### Environment / evidence blocks

- Full E2E: 12 pass, 82 fail, 14 do not run because the web server cannot
  reach local Convex at `127.0.0.1:3210`.
- WorkTree smoke: `convex_dev_server_unavailable`.
- Customer Request smoke: missing `AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY`.
- Dev seed reaches Convex but refuses an existing Exa provider transition:
  `curated_provider_connection_refused:connection:exa:invalid_transition`.
- Provider-operation, bounded-mandate, and full-yolo official packets refuse
  the intentionally dirty checkout (`evidence_checkout_dirty`).
- Tier C hosted was not attempted and is not promoted.

The cleanup-specific positive floor is green. The repository-wide source and
capability gates are not represented as fully green; deeper destructive cleanup
remains halted.

## Authority refreshed

- `.planning/STATE.md`
- `.planning/codebase/ARCHITECTURE.md`
- `.planning/codebase/STRUCTURE.md`
- `.planning/codebase/INTEGRATIONS.md`
- `.planning/codebase/PROMPT-DATA-FLOW.md`
- `.planning/codebase/DATA-FLOW-DELTA-2026-08-15.md`
- `.planning/evidence/product-frontier-baseline/*`
