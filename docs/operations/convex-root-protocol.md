# Convex root protocol v2 (Quote standard)

Status: active from 2026-09-24. The orchestrator owns scope and commits; the designated closeout owner owns wave-wide verification.

## Purpose

**Maintainability** is the cost of the next correct change. **Dev ergonomics** is the time from "I need to change X" to "X is changed and verified". Both come first. Every rule below serves them. Tidiness for its own sake is not a goal.

| Property | Target | How it is checked |
|---|---|---|
| Locality | Changing one concern touches one lib file plus its colocated test, and the root only when a signature changes. | Review of the diff |
| Findability | From the RPC name to the handler body is at most 2 hops. The file name names the concern. There are no barrels. | Review |
| One home | Each type, validator, digest and helper is defined once. | grep |
| Direction | `src/` never imports `convex/*.ts`. `convex/lib` may import `src/modules`. `src/modules` may import `convex/lib` only for ctx-bound helpers (the call-worker case). | grep and `test:imports` |
| Fast verify | Every concern has a colocated test that runs alone in under 60s. | `npx vitest run <path>` |
| Honest gates | Ratchets only go down. Every root over 200 lines is visible to the gate. | `test:imports` |

## The standard

The reference is `convex/capabilityQuotes.ts`: registrations in the root, depth in `convex/lib/`, one concern per file. HTTP and chat share `quoteAction`.

A root passes when all applicable checks hold:
1. **Registration only.** Imports plus `query`/`mutation`/`action`/`http` exports; no handler bodies, validator unions or DB logic. Cap: 200 lines.
2. **Depth in `convex/lib/<domain>/`, one concern per file.** Group by concern (issue, admit, valuation, refusal), not by everything a feature touches. A root that is really the lib fails.
3. **`src/` does not import the root.** Use the domain module or a lib helper.
4. **One core, many callers.** HTTP, MCP and chat use the same core; no copies of admission, command building or parsing. For a single-caller read model this is not applicable.
5. **Execution boundary.** Call helpers directly inside a query/mutation to preserve one transaction; `ctx.runQuery`, `ctx.runMutation`, `ctx.runAction` and scheduler calls target internal functions only. Every registration declares `returns`, and handlers calling `ctx.run*` declare explicit return types (to preserve generated API inference). Follow [Convex best practices](https://docs.convex.dev/understanding/best-practices/).

## Judgement rules

- **Delete before you move.** Dead exports and RPCs with zero live references are deleted first, so we never relocate code nobody calls. Operator and break-glass entries are not dead merely because repository callers are absent.
- **Commits are move-only.** A root pass changes structure, not behaviour. If a clean split needs a behaviour change, stop, record it, finish the move, and ship the behaviour change as its own commit.
- **A concern is not a function.** Keep closely related helpers in one file. Do not create a lib file under ~30 lines unless it is a genuine standalone concern. A file under ~150 lines with a single concern stays as it is.
- **Validators live with their concern.** They go into a shared `contracts.ts` only when two or more concerns in the same feature use them. No global validator dump.
- **Type unification means one home, proven by the compiler.** When two copies of a shape have drifted, the Convex-authoritative shape wins, but only if every consumer compiles unchanged in meaning. If the drift is semantic, stop and record it.
- **SURVIVING RPC paths never change.** `api.<root>.<fn>` and `internal.<root>.<fn>` stay byte-identical, proven by `tests/imports/convex-api-kind-snapshot.test.ts`. Deliberate dead RPC deletion changes the snapshot only after reference proof.
- **Keep live operator RPCs.** Even with no repository callers, keep the sole entry to a live flow and operator/break-glass paths; inspect external/string references and operational usage before classifying an RPC as dead.
- **Tests move only when they exclusively test a moved concern.** Do not rewrite tests to follow the code, and do not add tests to prove a move. The compiler and existing tests are the proof.
- **Pure code goes to the domain, ctx-bound code goes to lib.** Logic with no `ctx` or `db` that `src/` needs goes into `src/modules/<domain>/`. Code that needs `ctx` goes into `convex/lib/<domain>/`.
- **Pins only go down.** Never raise a `FACADE_SIZE_EXCEPTIONS` ceiling. A root that has grown over its pin is the top priority, not a gate to relax.
- **Dev and seed roots** (`devSeed*`) are held to one rule only: fixture data is separate from registration. They are not gold-plated.

## Layout

Moving code is fine only if every moved line lands where the next reader would look for it first.

- **Domain = the module that owns the feature's primary aggregate.** The primary aggregate is the table the feature's RPCs command or read. Table ownership is set in module schema files composed by `convex/schema.ts`. A workflow that also writes another module's tables stays whole in its primary domain; never scatter one workflow across folders by table. Where a foreign domain has a lib helper, use it rather than a raw cross-domain `ctx.db` call. Folder names match module names in camelCase (`money`, `capabilitySupply`, `capabilityExecution`, `catalog`, `agentAccess`, `authority`, `principalAccount`, `market`, etc.).
- **Feature is a subfolder.** Path: `convex/lib/<domain>/<feature>/`. Remove the domain prefix from the root name: `moneyConnect` becomes `money/connect`. Go at most two levels deep.
- **Inside a feature**, `contracts.ts` holds validators and `Infer` types shared by two or more files; never `validators.ts`, `types.ts`, `*Validators.ts` or `*Contracts.ts`. Other files name one concern (`issue.ts`, `reads.ts`, `reserve.ts`, `stripeEvent.ts`); colocate `<concern>.test.ts` when the concern warrants a test.
- **RPC symbols follow Quote:** `<rpcName>Args`, `<rpcName>Result`, `<rpcName>Handler`; `export const x = mutation({ args: xArgs, returns: xResult, handler: xHandler })`.
- **camelCase is a hard rule.** No hyphenated paths: Convex rejects them, silently stopping dev pushes. `tests/imports/convex-module-paths.test.ts` guards every Convex `.ts` path. No `index.ts` barrels; import concern files directly.
- **No loose files under `convex/lib/`.** Genuinely cross-domain infrastructure goes in `convex/lib/platform/`, where a single-file concern may sit directly in `platform/`.
- **Exception:** `adminConsole/` remains a top-level folder: the operator console spans domains and another level would exceed the depth limit.
- **No touched lib file over 400 lines.** Split by concern rather than moving an oversized file intact. Pure code needed by `src/` goes to `src/modules/<domain>/`.

## Priority

`score = criticality (spine 3, projection or HTTP 2, dev or admin 1) + checks failed + 2 if src/ imports the root + churn tier (0 to 2, from the 60-day commit count) + 3 if the root is over its pin`

Work the highest score first. Churn decides ties, because the ergonomics payoff is largest where people work most. `capabilityCalls.ts` is deferred: it is already a façade, and its next step is splitting `convex/lib/capabilityExecution/callLifecycle/` by role. Projection/read-model roots need checks 1–3 and 5; check 4 is usually not applicable. HTTP roots keep routes only; dev/seed roots separate fixture data.

## The root pass

One root per commit, except explicitly coupled roots. Move-only and deletion are separate decisions.

0. **Card and deletion gate.** Record checks, root line count/pin, every importer, and every `api.`/`internal.` caller. List every export/RPC with a live path:line reference (including string refs, crons, scripts and operational entry points) or a justified deletion. Search `src`, `convex`, `tools`, tests, crons, `http.ts`, package scripts and `convex run` lines in docs. Report delete count; check anything a deletion makes unreachable, not just the deleted symbol.
1. **Delete proved-dead exports/RPCs.** The closeout owner executes deletions after the reference and orphan checks; preserve operator paths even without an in-repo caller. A move wave does not casually create or delete roots.
2. **Extract.** Move handlers by concern into `convex/lib/<domain>/<feature>/`; put validators with the concern or in shared `contracts.ts`. Keep registrations and their `returns` in the root.
3. **Deduplicate and rewire.** Leave one home per shape/helper, rewire `src/` importers to the domain module or lib, and move tests only if they exclusively cover the moved concern.
4. **Evidence for check 4.** Give path:line of the shared core for each applicable HTTP, MCP, chat and cron caller; otherwise name the duplication. A bare "pass" is not evidence.
5. **Prove the cutover.** Run typecheck, `test:imports` and existing domain tests at closeout. Confirm surviving RPC module/method/kind triples in the API snapshot; update it only for proved deletion. Lower/remove the façade pin, never raise it.
6. **Net lines.** Report `git diff --shortstat`. Import overhead is acceptable; explain growth beyond ~10% of moved lines. Root registration ≤200 lines, touched lib files ≤400, zero dead exports and no behaviour change are the finish criteria.

## Wave operations

- **Baseline first.** Before dispatch, record normalized `npx tsc --noEmit --pretty false` diagnostics and `npm run test:imports` at HEAD. Fact-check any "someone else broke it" claim against this baseline before acting; attribute new failures rather than guessing.
- **Disjoint ownership.** At most ~9 domain-disjoint pass agents. Give one agent each shared domain entry file (e.g. `src/modules/capability-execution/convex.ts`); peers send it their needed lines. Agents own only the named root, lib folder and importers, and stop when premises fail. They message Main only for decisions or STOPs. Respect user-owned dirty files.
- **Designate a CLOSEOUT OWNER from the start.** Only this owner runs codegen (only when API changes), edits `tests/imports` pins and the API snapshot, executes deletions, and runs whole-repo tsc, imports and `npm run test:unit` once after all agents settle. The owner compares failures against the baseline and checks deletion orphans. After codegen verify `.env.local` still has `CONVEX_DEPLOYMENT=anonymous:anonymous-agent`; no agent edits `convex/_generated` by hand.
- **Mid-wave proof is narrow.** Pass agents use esbuild parse, `vitest related` and tsc diagnostics filtered to their own paths; no whole-repo validation while siblings are editing.
- **Commits are orchestrated.** No `git mv` (it pre-stages a rename); Main commits each root with explicit pathspecs, serially. Pass agents never add, commit, stash, reset or check out files. Do not create/delete roots during move-only waves; the closeout owner handles approved deletions.
- **Recover instead of duplicating.** A failed or aborted agent is revived, not respawned.

The historical ledger, dated decisions, unresolved items and wave-4 layout decisions are in [Convex root ledger](convex-root-ledger.md).
