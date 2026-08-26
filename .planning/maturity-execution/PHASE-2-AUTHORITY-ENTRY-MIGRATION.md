# Phase 2 authority-entry migration repair node

Depth: tree 4   Mode: orchestrated

Status: `PLANNED — IMPLEMENTATION WITHHELD UNTIL PREFLIGHT NODE IS MET`

Accepted design:
`PHASE-2-RUNTIME-DOMINANCE-DESIGN.md` SHA-256
`a221d14315f1ec7446ae8d97002c61f2e69ba425df3dac3efde1094e89a30934`.
The independent verifier passed the substantive design at `8a31262a…`; the final
hash adds only review metadata and the terminal engineering-review report.

## Contract

- Canonical authority remains the existing Principal + Account + resource/workload
  + current generation/revocation/server-time contract. No leaf may add a policy
  evaluator, generic auth helper, caller-selected mode, fake Clerk token, test-only
  authority path or alternate runtime handler.
- CodeQL is ineligible and must not be downloaded or run. Local proof uses
  established Convex custom functions, TanStack middleware, the existing MCP/CLI
  composition, bounded ESLint/inventory checks and actual registered handlers.
- The parser-confirmed lower bound is 298 direct Convex registrations across 52
  files: 119 public, 172 internal and seven HTTP. The inventory leaf must resolve
  aliases/factories and classify every row before any domain migration starts.
- Runtime namespaces remain separate: 242 candidate rows (207 protected, 35
  exemptions), plus frozen 39 HTTP, 14 MCP and 12 CLI edge contracts. Counts may
  change only through a reviewed semantic delta; no silent omission or forced
  baseline is allowed.
- Each row records its exact selector/customArgs wire parity, canonical mode,
  structural capability closure, runtime row(s), exemption basis, actual-handler
  cases, owner leaf and rollback commit. Generic capabilities may not cross an
  uninspected boundary.
- Every protected surface receives owner/member/workload/missing-workload/
  stranger/wrong-Account/stale-generation cases through the actual registration.
  Every exemption is structurally restricted and hostile-tested.
- Authority denial permits no protected business effect. Only explicitly bounded
  operational telemetry/rate-limit/audit effects may precede authority. Authorized
  partial/unknown outcomes must retain current authority, idempotency, attribution
  and recovery truth for every effect.
- Delayed/background/external work revalidates current durable authority at its
  exact registered target or immediate consequence boundary. There is no internal
  superuser.
- Existing valid commercial, chat, market, x402 and money outcomes, public names,
  arguments, validators, return shapes, transactions and no-custody posture remain
  unchanged.
- The generated Start `setErrorThrowerOptions` pre-dispatch 500 is a source/build
  defect owned by a separate serial leaf. Genuine positive Clerk issuance is later
  hosted P9-01 evidence; credential-free source invariants remain mandatory.
- Every worker is not alone in the worktree, preserves all existing edits, owns
  only the files below, stops on overlap and performs four Unlazy passes before an
  explicit stop. The driver independently reruns every leaf checker and one raw
  CHECK.

## Exclusive ownership

The integration driver alone edits `convex/http.ts`, `convex/crons.ts`,
`convex/_generated/**`, `src/start.ts`, `package.json`, `package-lock.json`,
`eslint.config.mjs`, `tools/eslint-rules/**`, CI/workflows, public cross-context
barrels, legacy adapters, production-evidence consumers/contracts, root scripts or
config, and real shared HTTP/MCP/CLI/callback/job/cron/reconciliation wiring.
Workers submit required deltas; they never edit these shared files.

- Convex A: `actionInvocationControl`, `agentAccess*`, `authorityBoundary`,
  `capabilityContractDocuments`, `capabilityOperation*`, `capabilityProvider*`.
- Convex B: `capabilitySupply*`, `catalog`, `chat*`, `discovery`, `facilitator*`,
  `interactive*` except driver-owned `chatAnonymous` HTTP registration.
- Convex C: `market*`, `money*`, `qualifiedUse`, `rateLimit`,
  `recoveryBreakGlass`, `registry`, `secretLifecycleOperations`, `security`,
  `sourceWriteAdmission`, `workloadCron`, and explicitly classified `devSeed`.
- HTTP: handler modules `chatAnonymous`, `providerConsequenceHttp` and
  `secretLifecycleHttp`; the driver alone edits `convex/http.ts`.
- Start: protected server-function/route declaration files and the new fixed
  middleware module; the driver alone edits `src/start.ts` and build config.
- Edge/background: focused tests/manifests and leaf-owned target modules only;
  shared MCP/CLI/cron wiring remains driver-owned.

## Type, import, bundle, codegen and release contract

Each source wave runs focused tests, typecheck, owned lint, import/bundle scanners,
Convex codegen dry-run and wire compatibility before integration. The driver
reviews generated diffs and performs actual codegen. No raw/wrapped dual
registration or bypass feature flag is permitted. Each wave is an atomic commit;
rollback is a targeted `git revert` of that wave followed by restoring its generated
and manifest versions. The unchanged `npm run test:release:source` runs from a
clean worktree at the exact candidate commit before internal handoff.

## Tree

- 1 Phase 2 authority-entry migration ........ `gates/repair-P2-authority-entry.md`
  - 1.1 Foundation ........ `gates/node-P2-authority-foundation.md`
    - 1.1.1 inventory/classification ........ `gates/repair-P2-authority-entry-inventory.md`
    - 1.1.2 registrar/capability foundation .. `gates/repair-P2-authority-entry-foundation.md`
    - 1.1.3 Start bundle repair .............. `gates/repair-P2-authority-entry-start-bundle.md`
  - 1.2 Runtime migration .... `gates/node-P2-authority-runtime.md`
    - 1.2.1 Convex group A ................... `gates/repair-P2-authority-entry-convex-a.md`
    - 1.2.2 Convex group B ................... `gates/repair-P2-authority-entry-convex-b.md`
    - 1.2.3 Convex group C ................... `gates/repair-P2-authority-entry-convex-c.md`
    - 1.2.4 Convex HTTP ....................... `gates/repair-P2-authority-entry-http.md`
    - 1.2.5 Start authority ................... `gates/repair-P2-authority-entry-start.md`
    - 1.2.6 MCP/CLI composition ............... `gates/repair-P2-authority-entry-edge.md`
    - 1.2.7 background/external ............... `gates/repair-P2-authority-entry-background.md`
  - 1.3 Close ................. `gates/node-P2-authority-close.md`
    - 1.3.1 evidence integration .............. `gates/repair-P2-authority-entry-evidence.md`
    - 1.3.2 release/handoff .................... `gates/repair-P2-authority-entry-release.md`

## Dispatch rule

Only 1.1.1 may start after this plan commit. No production registration or handler
edit may start until 1.1.1 freezes the complete symbol-resolved migration manifest,
exemptions, seams, exact owner files, compatibility/rollback metadata and tests.
The driver then dispatches 1.1.2 and 1.1.3. Runtime leaves start only after node 1.1
is independently met.

## Status log

- 2026-08-26: skill-driven design accepted by independent verifier and final
  plan-engineering review; final hash differs only by removal of trailing
  whitespace after review; implementation/source gates remain red.
- 2026-08-26: repair node written; production work remains withheld pending the
  inventory/classification leaf and driver verification.
- 2026-08-26: the integration driver explicitly amended Start-bundle G3 after
  the credential-free built dispatcher reached unchanged production Clerk and
  correctly failed closed without development credentials. The original gate
  required a successful public serverFn response; official positive Clerk
  issuance requires hosted development-instance state and remains P9-01 evidence
  bound to candidate/deployed revision and freshness. The source replacement is
  exact handler load, no unbound Clerk call, unchanged middleware reachability,
  caller-context exclusion and missing/invalid-credential fail-closure; no fake
  token, bypass or success claim was introduced.
