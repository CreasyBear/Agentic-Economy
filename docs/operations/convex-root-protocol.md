# Convex root protocol (Quote standard)

Status: active from 2026-09-24. The owner is the orchestrator session. This file holds the backlog and the ledger (see the bottom).

## 1. What we optimise for

**Maintainability** is the cost of the next correct change. **Dev ergonomics** is the time from "I need to change X" to "X is changed and verified". Both come first. Every rule below serves them. Tidiness for its own sake is not a goal.

| Property | Target | How it is checked |
|---|---|---|
| Locality | Changing one concern touches one lib file plus its colocated test, and the root only when a signature changes. | Review of the diff |
| Findability | From the RPC name to the handler body is at most 2 hops. The file name names the concern. There are no barrels. | Review |
| One home | Each type, validator, digest and helper is defined once. | grep |
| Direction | `src/` never imports `convex/*.ts`. `convex/lib` may import `src/modules`. `src/modules` may import `convex/lib` only for ctx-bound helpers (the call-worker case). | grep and `test:imports` |
| Fast verify | Every concern has a colocated test that runs alone in under 60s. | `npx vitest run <path>` |
| Honest gates | Ratchets only go down. Every root over 200 lines is visible to the gate. | `test:imports` |

## 2. The standard

The reference is `convex/capabilityQuotes.ts`. It is about 75 lines of registrations only. Its depth lives in `convex/lib/capabilityQuotes/`, one concern per file. HTTP and chat share `quoteAction`, and tests sit next to the lib files.

A root passes when all four checks hold:
1. **Registration only.** The root contains imports plus `query`/`mutation`/`action`/`http` exports and nothing else: no handler bodies, no validator unions, no DB logic. The cap is 200 lines.
2. **Depth sits in `convex/lib/<domain>/`, one concern per file.** Files are grouped by concern (issue, admit, valuation, refusal), not by "everything the feature touches". A root that is really the lib fails.
3. **`src/` does not import the root.**
4. **One core, many callers.** HTTP, MCP and chat call the same core. None of them carries its own copy of admission, command building or parsing.

## 3. Judgement rules

- **Delete before you move.** Dead exports and RPCs with zero references are deleted first, so we never relocate code nobody calls.
- **Commits are move-only.** A root pass changes structure, not behaviour. If a clean split needs a behaviour change, stop, record it, finish the move, and ship the behaviour change as its own commit.
- **A concern is not a function.** Keep closely related helpers in one file. Do not create a lib file under ~30 lines unless it is a genuine standalone concern. A file under ~150 lines with a single concern stays as it is.
- **Validators live with their concern.** They go into a shared `contracts.ts` only when two or more concerns in the same domain use them. No global validator dump.
- **Type unification means one home, proven by the compiler.** When two copies of a shape have drifted, the Convex-authoritative shape wins, but only if every consumer compiles unchanged in meaning. If the drift is semantic, stop and record it.
- **RPC paths never change.** `api.<root>.<fn>` and `internal.<root>.<fn>` stay byte-identical, so no client, test or cron edits are needed.
- **Tests move only when they exclusively test a moved concern.** Do not rewrite tests to follow the code, and do not add tests to prove a move. The compiler and the existing tests are the proof.
- **Pure code goes to the domain, ctx-bound code goes to lib.** Logic with no `ctx` or `db` that `src/` needs goes into `src/modules/<domain>/`. Code that needs `ctx` goes into `convex/lib/<domain>/`.
- **Pins only go down.** Never raise a `FACADE_SIZE_EXCEPTIONS` ceiling. A root that has grown over its pin is the top priority, not a gate to relax.
- **Dev and seed roots** (`devSeed*`) are held to one rule only: fixture data is separate from registration. They are not gold-plated.

## 4. Triage classes

| Class | Examples | Treatment |
|---|---|---|
| Spine (money, authority, Call, Quote, supply admission) | moneyConnect, moneyDocuments, capabilityCallProjection | Full four checks |
| Projection or read model | capabilitySupplyProjection, x402DirectoryIndexStore | Checks 1 to 3; check 4 is usually not applicable |
| HTTP roots | providerConsequenceHttp, secretLifecycleHttp | Routes only; handlers move to lib |
| Small overshoot (200 to 300 lines, mostly inline validators) | varies | Mechanical: move the validators and handlers, then drop the pin |
| Dev and seed | devSeed, devSeedFixtures | Split data from registration |
| Dead | orphan RPCs | Delete |

## 5. Priority

`score = criticality (spine 3, projection or HTTP 2, dev or admin 1) + checks failed + 2 if src/ imports the root + churn tier (0 to 2, from the 60-day commit count) + 3 if the root is over its pin`

Work the highest score first. Churn decides ties, because the ergonomics payoff is largest where people work most. `capabilityCalls.ts` is deferred: it is already a façade, and its next step is splitting `convex/lib/callLifecycle/` by role.

## 6. The root pass: one root per commit

0. **Card.** Record the four-row card (Quote vs this file), the line count and pin, every importer, and every `api.`/`internal.` caller.
1. **Delete** the dead exports and RPCs in this root. Check for zero references across src, convex, tools, tests, crons, `http.ts`, package.json scripts, and `convex run` lines in docs.
2. **Extract.** Handlers move by concern to `convex/lib/<domain>/<concern>.ts`, and validators move to their concern (or to `contracts.ts` when shared). The root keeps only registrations that point at the imported handlers.
3. **Deduplicate** every shape or helper that has a second copy elsewhere, leaving one home.
4. **Rewire** `src/` importers to the domain module or lib (check 3).
5. **Move tests** that exclusively cover a moved concern so they sit beside it.
6. **Verify.** Run `npm run typecheck`, `npm run test:imports`, and the domain's existing tests. The `api.*` paths must be unchanged.
7. **Ratchet and commit.** The orchestrator lowers or removes the pin and commits the root with explicit paths.

**Definition of done.** The card shows all four checks passing (or explicitly not applicable). The pin is removed or lowered to the actual line count. The gates are green. No behaviour has changed. Touched files contain zero dead exports.

## 7. Roles in a wave

- **Orchestrator:** chooses the roots, owns `tests/imports/convex-facade-size.test.ts` and every commit, and lowers the pins.
- **Pass agent:** owns its root, its lib folder, and the importers named in its brief. It messages the owner over hub before touching any other file. It stops and reports when a premise does not match the source. It never stashes, resets, checks out, adds or commits.
- **Out of bounds for everyone:** the user's uncommitted files, as listed in the wave brief.

## 8. Ledger

| Date | Root | Before (lines, checks passed) | After | Commit |
|---|---|---|---|---|
| 2026-09-24 | capabilityProviderConsequenceJournal.ts | 985 lines, checks 3 | 44 lines, checks 1-4 pass | 314a0a544 |
| 2026-09-24 | capabilityCallProjection.ts | 873 lines, checks 4 only | 8 lines, checks 1-4 pass | 70f34603c |
| 2026-09-24 | moneyConnect.ts + moneyLedger.ts | 935 + 367 lines, check 3 only | 2-line shell + 131 lines; checks 1-3 pass, check 4 partial (Connect type drift is semantic) | 3945f4283 |
| 2026-09-24 | moneyDocuments.ts | 848 lines, check 3 only | 100 lines, checks 1-4 pass | faafb3aed |

### Follow-ups recorded
- **Connect type drift:** `payout-connect-http.ts` `accountFromPayout` fabricates a binding that lacks `requirementsDigest`, `createdAt` and `updatedAt`, and its refusal and authority envelopes differ. This needs a behaviour decision before the shapes can be unified.
- **Empty shell:** `moneyConnect.ts` is a 2-line shell with zero RPCs. Delete it in the next wave that is allowed to change the generated API.
- **Pure file in lib:** `convex/lib/callLifecycle/terminalProjection.ts` is pure but lives in lib. Move it to the domain in an API-changing wave.
- **Typecheck baseline is red:** the tree had 92 diagnostics before this wave (the `api` type collapses to `any`), and the wave added 0 and removed 3. See the TypeFix result for the commit that introduced the collapse.

## 9. Wave rules learned (binding from wave 2)
- **Baseline first.** Record `npx tsc --noEmit --pretty false` and `npm run test:imports` at HEAD before dispatching the wave. Attribute errors by diffing against that baseline, not by guessing.
- **Shared entry files get one owner.** Each domain's declared Convex consumer entry (e.g. `src/modules/capability-execution/convex.ts`) is owned by exactly one agent per wave. Other agents send it their lines.
- **No root files are created or deleted in move waves**, and nobody edits `convex/_generated`.
- **Commits run serially, with explicit pathspecs.** Another session may be committing in the same checkout, and parallel `git commit` calls collide on `index.lock`.
