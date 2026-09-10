# Well 5 — Agent-access host files and module structure closeout

Date: 2026-09-10. Branch `well-5/structure` (stacked on `well-4/catalogue-truth`). Plan: `~/.claude/plans/composed-wondering-puzzle.md` (Well 5 section, decision D3: structural stabilisation with a ratchet, no reshaping; independent outside voice reviewed the section before execution).

## Outcome

- `npm run gate` exit 0 on the final tree, now including `deps:check`.
- Both agent-access host files hold registrations only; logic lives in `convex/lib/agentAccess/{oauth,principals}/*` with one-directional imports. Unchanged test suites pass.
- White-box test exceptions: 66 → 0. No test deleted.
- Import cycles: genuine peer cycles 0 (eight broken by extracting shared leaves); barrel round-trips 318 → 258 and capability-supply internal cycles 48 → 34, both pinned by ceilings that can only fall.
- A regression test proves no default-runtime Convex file reaches a Node-only module.
- 49 CLI tests run in-process; the rest keep spawning the built bundle.

## Measured before and after

| Metric | Before | After |
| --- | --- | --- |
| `convex/agentAccessOAuth.ts` lines | 1,951 | 168 |
| `convex/agentAccessPrincipals.ts` lines | 1,882 | 134 |
| White-box exceptions | 66 (42 into capability-supply) | 0 |
| Declared entry surfaces | 186 (docs) / 189 (source) | 190 (ratchet ceiling) |
| Genuine import cycles (peer files) | unknown; closeout claimed 0 | 0, enforced |
| Barrel round-trip cycles | 318 | 258 (ceiling) |
| capability-supply internal cycles | 48 (masked) | 34 (ceiling) |
| Ad hoc `--test-timeout` flags | 2 | 0 |
| CLI tests spawning a process | ~102 | ~53 |

## Root causes found while landing

1. The Well 0 closeout's "no import cycles" rested on a unit test of the checker, not on a repository scan. dependency-cruiser found 365 cycles on first run.
2. Retiring a white-box exception by re-exporting the CDP signer through `public.ts` put a Node-only module on every default-runtime Convex function's import path; Convex's bundler rejected it. Type-only exports and a guard test fix it at the cause.
3. Bypassing barrels exposed four genuine cycles among capability-supply internals that the barrel had masked; broken by extracting `transport-terms-schema.ts`, `route-transport-invocation.ts`, `x402-challenge.ts`.
4. The new CLI entry-point guard compared a realpath against a symlinked argv path; on macOS the bundle silently exited with empty stdout. Fixed with realpath on both sides.
5. `canonicalCallRef` was documented in the wrong file by the plan; the agent stopped and asked rather than editing outside scope.

## Smells register

| # | Smell | Disposition |
| --- | --- | --- |
| 1 | 258 barrel round-trips and 34 internal cycles remain in capability-supply | Ceilings ratchet down; burn-down is Well 6 follow-on or later |
| 2 | Public Tool descriptor shape declared in five places | Carried from Well 4; follow-on |
| 3 | `runCli` captures `process.stdout.write` for the call's duration | Acceptable per vitest worker isolation; document in the harness |
| 4 | Two agents stalled mid-edit; one created a temporary git worktree | Worktree removed; briefs now say "no worktrees" |
| 5 | A subagent ran `git stash` twice despite the brief before the hook existed | Hook in place since Well 4 |

## Follow-ons

- Lower the two cycle ceilings as internals are untangled; the strict rule stays at 0.
- Descriptor single source (Well 6 or later).
- Swarm acceptance for Wells 4 and 5 on the credentialed stack.
