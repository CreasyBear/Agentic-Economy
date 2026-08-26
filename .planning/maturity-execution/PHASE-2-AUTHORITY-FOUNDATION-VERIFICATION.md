---
verified: 2026-08-26T10:14:01Z
scope: node-P2-authority-foundation
mode: initial_goal_backward_verification
verdict: FAIL
score: 2/6 node gates verified
branch: codex/ae-maturity-phase-2
candidate_head: 85486e84fb46c775c64b177f9ddd85d76146bc11
implementation_authorization: WITHHELD
blockers:
  - protected capability contracts are bypassable through ctx destructuring
  - registrar-category enforcement is bypassable through aggregate-object selection
  - the load-bearing ESLint rule and runner do not meet literal G7 100-percent changed-path coverage
---

# Phase 2 Authority Foundation Verification

## Verdict

**FAIL — 2/6 node gates verified.** This is a read-only, goal-backward verification of foundation node 1.1 after inventory commit `85486e84fb46c775c64b177f9ddd85d76146bc11`. The deterministic classified inventory and the Start built-dispatcher repair pass. The registrar/capability foundation does not yet close the accepted syntax grammar, and its load-bearing verification paths do not meet the literal 100% changed-path coverage gate. Runtime migration remains withheld.

This report does not claim Phase 2 acceptance and does not authorize any later migration leaf.

## Node gates

| Gate | Result | Goal-backward evidence |
| --- | --- | --- |
| G1 — inventory/classification/provenance | **PASS** | Fresh classified registration check passed 14/14 with 298 registrations across 52 files: 119 public, 172 internal, 7 HTTP, 208 ordinary, 90 Generic, 298 classified, 0 unresolved, 0 duplicate. Semantic-input reconciliation changed only the two intended design/migration digests and dependent contract digests; counts and surfaces remained stable. |
| G2 — registrar/capability foundation leaf independently accepted | **FAIL** | The mechanical leaf checker passes, but independent counterexamples evade the accepted fail-closed grammar, and literal leaf G7 coverage is not met. A checked ledger is not behavioral proof. |
| G3 — Start built-dispatcher source repair | **PASS** | A fresh Vite build and real `.vc-config` dispatcher passed. The exact request reaches unchanged Clerk middleware in the documented order; missing/invalid credentials and caller-shaped authority headers fail closed. The retained original artifact reproduces the unresolved-symbol defect. Positive Clerk-issued identity execution remains correctly open under hosted gate P9-01. |
| G4 — no raw/test-only authority bypass and identical runtime seam | **FAIL** | Actual-reference tests use the same `convex-helpers` registrars and runtime references without a production test branch or dependency injection. However, protected capability enforcement can still be bypassed through destructuring, and category selection can evade the registrar rule through aggregate-object dispatch. |
| G5 — integration/compatibility/coverage gate | **FAIL** | Root typecheck, imports, TypeScript standards, codegen dry-run, SSRF, bundle and diff checks pass, but the child gate's literal 100% changed-path coverage requirement is false for the load-bearing ESLint rule and runner. |
| G6 — hostile counterexample closure | **FAIL** | Twenty-four checked unsafe fixtures produce 26 exact diagnostics, but two bounded, direct counterexamples produce no diagnostic. The phase cannot infer closure from the fixture corpus alone. |

## Blocking findings

### 1. Protected `ctx` destructuring bypasses capability enforcement

The accepted design explicitly classifies destructuring as unsupported syntax that must receive one rejection diagnostic. A protected registrar using an inline handler can nevertheless destructure `db` and perform a write without any diagnostic:

```ts
import { protectedInteractiveMutation } from "../convex/lib/authorityRegistrars";

const selector = { args: {}, resolve: async () => ({
  principalRef: "p",
  accountRef: "a",
  authorityGeneration: 1,
  authorityExpiresAt: 2,
}) };

export const x = protectedInteractiveMutation(selector)({
  args: {},
  handler: async (ctx) => {
    const { db } = ctx;
    return await db.insert("owners", {
      clerkUserId: "bypass",
      createdAt: 0,
      updatedAt: 0,
    });
  },
});
```

Independent ESLint 10 execution with the project `@typescript-eslint` parser returned `[]`. This is a direct failure of the frozen protected-registrar capability contract, not a request for interprocedural inference.

### 2. Aggregate-object registrar selection bypasses category enforcement

The accepted design requires literal, distinct registrar categories and forbids dynamically selectable registrar identities. Aggregating the named registrars into an object evades the current binding check:

```ts
import {
  protectedInteractiveMutation,
  narrowSystemMutation,
} from "../convex/lib/authorityRegistrars";

const modes = { protectedInteractiveMutation, narrowSystemMutation };
const selected: any = modes[
  process.env.AE_MODE ?? "protectedInteractiveMutation"
];
export const x = selected(selector)({ args: {}, handler: async () => null });
```

Independent ESLint execution again returned `[]`. The current bounded rule recognizes direct identifiers and selected conditional/logical shapes, but not authority bindings nested in an aggregate object. This permits runtime category selection without the required `dynamicRegistrarSelection` rejection.

### 3. Literal G7 changed-path coverage is not satisfied

The production registrar source itself has true 100% line, branch, function and statement coverage. The load-bearing verification rule and runner do not. Because leaf G7 literally requires a 100% changed-path coverage pass, and the Phase 2 contract requires 100% for critical changed paths, the checked G7 claim is false.

| File | Lines | Branches | Functions | Statements |
| --- | ---: | ---: | ---: | ---: |
| `convex/lib/authorityRegistrars.ts` | 62/62 — 100% | 2/2 — 100% | 28/28 — 100% | 62/62 — 100% |
| `tools/eslint-rules/phase-2-authority-entry.mjs` | 170/193 — 88.08% | 204/274 — 74.45% | 25/25 — 100% | 180/214 — 84.11% |
| `tools/eslint-rules/run-phase-2-authority-entry.mjs` | 34/45 — 75.55% | 20/36 — 55.55% | 9/12 — 75% | 34/46 — 73.91% |

## Verified foundation properties

- All four literal registrar categories exist: protected, public-exempt, narrow-system and dev-only. The protected family covers ordinary and Generic public/internal query, mutation and action registrars.
- Actual registered references are exercised through `convex-test`, `makeFunctionReference`, and the same `convex-helpers` registrar/runtime handler used by production. No test-only production export, production dependency injection, generated/app bypass, or matrix-specific runtime branch was found.
- Selector arguments consume `accountRef`, and the canonical checked context is re-added without dropping the wire. Authorized byte/result behavior and seven authority labels are covered by the focused foundation suite.
- The bounded ESLint rule is a project adaptation at the established registration seam; it does not implement a general CFG or interprocedural analyzer. Raw builders are only confined at the foundation fixture boundary, and no migration-complete claim is accepted here.
- Exact diagnostics were independently observed for protected direct `db_write`, `runQuery`, `runMutation`, `runAction`, scheduler and fetch capabilities; non-inline handlers; direct context/capability escape; capability aliases; global/aliased network calls; direct conditional/cast registrar selection; dynamic allowed-capability targets; and an allowed capability with an unlisted static target. The allowed static-target control remains clean.
- The root typecheck excludes the deliberate TS2307 fixture, while its dedicated `tsconfig.compiler-diagnostic.json` includes it. The named diagnostic test passed, so root isolation does not weaken that regression proof.

## Start source/hosted boundary

The amended Start leaf G3 visibly preserves the original requirement that a public server function return successfully and records why credential-free source verification cannot establish that positive response through official Clerk middleware. Source acceptance therefore proves the strongest supported credential-free invariants: the built dispatcher loads, the exact server-function call reaches unchanged and ordered Clerk middleware, invalid or missing credentials fail closed, caller-shaped principal/account/authority input cannot establish canonical context, and authority scenarios below Clerk verification are locally exercised.

The positive owner/member/workload chain using a Clerk-issued session/token remains open under hosted evidence gate P9-01 with development-instance setup, candidate/deployed revision binding and freshness requirements. It was not simulated with locally signed fake Clerk tokens and was not falsely marked source-green.

Fresh bundle evidence used Vite 8.2.2 and Rolldown 1.2.5. The repair did not modify `src/start.ts`, generated application logic, Clerk/TanStack middleware, or Vite configuration. The retained pre-fix artifact at `/private/tmp/ae-p2-tanstack-probe.9fsKdm` reproduced the original missing-symbol failure; it remains an evidence dependency until the driver performs final housekeeping.

## Independent commands and measured results

All Node commands used `/Users/joelchan/.nvm/versions/node/v22.22.0/bin` (Node v22.22.0).

| Check | Result |
| --- | --- |
| `npm run test:phase2:authority-entry -- --foundation` | **PASS** — 2 files, 9 tests; safe=6, unsafe=24, diagnostics=26 |
| `npm run test:phase2:registrations -- --require-classified` | **PASS** — 14/14; 298/52/119/172/7/208/90; classified=298, unresolved=0, duplicate=0 |
| `npm run test:phase2:start-built-dispatcher` | **PASS** — fresh build, `START_BUILT_DISPATCHER_PASS`, 1/1 |
| retained artifact with `--expect-regression` | **PASS reproducer** — `START_BUILT_DISPATCHER_REGRESSION_REPRODUCED` |
| retained artifact with `--expect-source-fixed` | **Expected FAIL** — `start_built_dispatcher_not_fixed` |
| named TS2307 collection-diagnostic test | **PASS** — 1/1, 13 skipped |
| `npm run typecheck` | **PASS** |
| `npm run test:imports` | **PASS** — 11 files, 29 tests |
| TypeScript standards focused test | **PASS** — 1/1 |
| `npm run check:convex-codegen` | **PASS** — dry-run generated output consistent |
| SSRF focused test | **PASS** — 1/1 |
| `git diff --check` | **PASS** |
| focused Istanbul coverage command | **FAIL G7** — exact per-file results above |
| independent `ctx` destructuring probe | **FAIL** — no diagnostic |
| independent aggregate-registrar probe | **FAIL** — no diagnostic |

## Blast radius and integration risks

- Package/config delta includes the phase scripts, ESLint 10 and `@typescript-eslint` parser dependencies, Vite 8.1.0 to 8.2.2, their lockfile graph, and root TypeScript fixture isolation. Current combined lockfile churn is 521 insertions and 146 deletions; `package.json` is 5 additions and 1 deletion; `tsconfig.json` is 9 additions and 2 deletions.
- The shared worktree already contains preserved production and generated edits. This verifier did not alter or reconcile them. Fresh type/import/codegen checks passed, but their presence remains driver-owned composition state.
- No new TODO/FIXME/XXX markers, skipped/focused tests, generated/app/Clerk/TanStack bypass, unbound dispatcher call, or source-vs-hosted evidence collapse was found in the foundation artifacts.
- The meaningful remaining risks are structural rule escape and untested load-bearing branches, not a request to build a general analyzer. Any repair must remain within the accepted finite syntax grammar and existing framework seams.

## Explicit stop

Verification stops at foundation node 1.1. G1 and G3 are independently verified; G2, G4, G5 and G6 fail. The registrar/capability leaf must not be accepted from its mechanical 8/8 ledger state, no runtime migration leaf should be dispatched, and no Phase 2 internal-completion or final-acceptance claim is warranted.

_Verifier: gsd-verifier (`/root/p2_authority_foundation_verifier`)_
