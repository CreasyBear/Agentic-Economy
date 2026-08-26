# Gates: Phase 2 authority registrar and capability foundation

Scope: Prove finite Convex registration adapters, selector/wire parity and structural handler capability closure before mass migration.

- [x] G1: Installed convex-helpers custom functions wrap representative ordinary/Generic public/internal query, mutation and action registrations through existing canonical modes before handlers.
  EVIDENCE: `convex/lib/authorityRegistrars.ts` uses the pinned `convex-helpers/server/customFunctions` seam for 12 protected interactive ordinary/Generic public/internal query/mutation/action registrations. `tests/fixtures/phase-2-authority-entry-foundation/registered.ts` exercises their actual FunctionReferences; the canonical Principal + Account admission runs in custom `input` before every handler.

- [x] G2: Per-entry customization.args selectors are consumed/re-added without changing public args, validators, FunctionReferences, return types or transaction behavior.
  CHECK: cd ../.. && PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run typecheck
  EXPECT: /tsc --noEmit/
  EVIDENCE: `npm run typecheck` passes on Node 22.22.0. Actual-reference tests pass the consumed `accountRef` selector plus unchanged handler `value` argument through all 12 builder variants and receive the unchanged string result; ordinary and Generic registrations share the same typed `CheckedSelectorSpec`/`customCtxAndArgs` composition.

- [ ] G3: Protected handlers cannot ignore derived authority or use unlisted raw db/run/scheduler/fetch capabilities, caller-shaped proofs or dynamic targets; generic capabilities never cross uninspected boundaries.
  BLOCKER: final independent verification found that `const { db } = ctx; await db.insert(...)` inside a protected inline handler emits no diagnostic. The direct-alias, context-escape, network and target fixtures pass, but the declared fail-closed grammar is not complete and no further checker expansion is authorized at this checkpoint.

- [ ] G4: Protected, public-exempt, narrow-system and dev-only registrars are distinct literal imports; raw builder imports are confined to reviewed registrar/HTTP modules.
  CHECK: cd ../.. && PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run test:phase2:authority-entry -- --foundation
  EXPECT: /passed/
  BLOCKER: Node 22.22.0 `npm run test:phase2:authority-entry -- --foundation` passes two files and 9/9 tests and emits `safe=6 unsafe=24 diagnostics=26`, but a named-import aggregation (`const modes = { protectedInteractiveMutation, narrowSystemMutation }; const selected = modes[key]`) emits no diagnostic. Literal category selection is therefore not yet fail-closed.

- [ ] G5: Hostile fixtures cover early return, branch, catch/finally, typed/Generic/alias registrar, pre-boundary write/schedule/fetch, escaped handler, unchecked args, dynamic target and safe all-path wrappers.
  BLOCKER: the preserved 30-file corpus asserts exact diagnostic identity/capability/target for six safe and 24 unsafe fixtures, but it lacks the verifier's context-destructuring and registrar-aggregation bypasses required by the documented supported-syntax grammar. The original raw escaped-handler regression remains intact.

- [x] G6: Focused actual-reference tests prove valid results and all denial shapes for each representative registrar without a test-only production export or handler substitution.
  EVIDENCE: Convex-test loads the registered fixture module and invokes actual FunctionReferences. Seven literal cases exercise owner and member success plus workload, missing-workload/identity, stranger, wrong-Account and stale-generation denial through the same protected handler; public/narrow-system/dev-only compatibility also runs through actual references. No production test export, handler replacement or dependency-injection branch exists.

- [ ] G7: Type/import/bundle/codegen dry-run and 100% changed-path coverage pass; public wire/API diffs are empty or explicitly justified as authority-provenance necessities.
  BLOCKER: production registrar coverage is 100% statements/branches/functions/lines (`62/62`, `2/2`, `28/28`, `62/62`), and type/import/TS-standard/codegen/build checks pass. The load-bearing ESLint rule measures only 83.64% statements, 74.08% branches, 100% functions and 87.56% lines under focused Istanbul coverage, below the literal changed-path requirement.

- [ ] G8: Four Unlazy passes complete with no further improvement; worker explicitly stops on overlap and leaves all shared driver files untouched.
  BLOCKER: four worker passes completed and overlap was preserved, but fresh independent verification found the two unsupported-form bypasses and rule-coverage gap above. The root stop-line now forbids further implementation in this task; the unresolved improvements are preserved for fresh assessment/rebaseline.
