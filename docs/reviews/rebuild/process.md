# Engineering process

**Date:** 29 September 2026
**Checkout:** `d104a8009921`
**Lens:** engineering process and the repo. Docs, protocols, registers, ratchets, gates, pinned tests, review files, gitignored docs, `AGENTS.md`, `package.json` scripts, and `tools/` scripts.
**Answer:** The process is a fragility. It can reject a correct change, it does not reliably run the checks that protect money, and the decisions it calls binding are not on the branch a fresh clone builds from.

This is one founder and concurrent agents, in alpha, on a product that moves real money. That justifies a short charter and a few fences around authority, settlement, and deploy identity. It does not justify a second product made of protocols, registers, and line-count gates. Early Linear and a Shape Up team ship with the first set. This repo has built the second set, and then failed to commit it.

## Inventory

Counted on this checkout, excluding `node_modules`, `.deepsec`, and vendored skill trees. Wire protocols (MCP, OAuth, x402) are product code and are not in the protocol count.

| Artefact | Count | Where it sits |
|---|---:|---|
| `docs/` directories | 21 | `adr`, `design`, `designs`, `licenses`, `operations`, `reviews` (plus `alpha`, `maturity`, `2026-09-24-codebase-health`, `rebuild`), `strategy`, `workflow` |
| `docs/` markdown | 103 files, ~10,600 lines | Reviews are 70 of those files, 5,112 lines, 1.2 MB |
| Tracked docs | 60 | Health review, ADRs, operations, some designs, strategy, licenses |
| Untracked docs | 62 | 56 under `docs/reviews/alpha` and `docs/reviews/maturity`; 4 designs; papercut register; CI gate profile |
| Gitignored project documents | 18 files, 3,478 lines | `CLAUDE.md`, `RULES.MD`, `.planning/codebase/*`, `.planning/reviews/*` including a 1,260-line coverage register. `PAPERCUTS.md` is named in `.gitignore` and is absent. `/.planning/` is ignored, except a tracked README |
| Process protocols | 4 named, plus 1 method dossier | See below |
| Registers | 3 present, 1 missing pointer | Papercut register, hostility register, coverage register. The deployment skill also points at `docs/operations/deployment-registry.yaml`, `aws-foundation.md`, and `deployment-maturity.md`; none of those files exist |
| Executable ratchets | 7 | Dependency cycles, bare `catch`, file size, module-boundary counts, Convex façade size, Convex string references, design-system class counts |
| Quality-gate fixtures | 8 | `tests/fixtures/quality-gates/` |
| Executable gates | 2 npm scripts, 6 CI jobs, 1 advisory workflow | `check`, `gate`; Kernel jobs below; React Doctor |
| Pinned test paths | 100 entries, 87 unique, across 8 scripts | Hand-listed inside `package.json` |
| Review files | 70 markdown | 12 tracked (the 24 September health review). The other 58 are untracked |
| `AGENTS.md` | 206 lines, 11,123 bytes, 1,465 words | Revised 2026-09-10. Tracked. A reasonable agent brief on its own |
| `package.json` scripts | 59 | One of them, `test:conformance`, is a 2,507-character file list |
| `tools/` scripts | 113 TypeScript files | 46 are the product CLI (`tools/ae`). 47 are `tools/dev` (including 20 fixtures). 20 are `tools/release` |
| `scripts/` | 3 | CLI build, CLI package test, action-surface audit |
| Cursor rules | 11 files, 2,204 lines | Tracked under `.cursor/rules/` |

Root instruction files sitting beside `AGENTS.md`: `PRODUCT.md` (724 lines), `CONTEXT.md` (317), `DESIGN.md` (246), `IMPLEMENTATION_ROADMAP.md` (1,374), `START_LINE.md` (246), `TODOS.md` (77), `README.md` (248), the whitepaper (~41 KB), plus gitignored `RULES.MD` (153) and `CLAUDE.md` (14). Behavioural tests are a different mass: 778 test files and about 210,000 lines, against about 205,000 lines under `src/`. Tests can fail a build. Review markdown cannot.

### Protocols

| File | Lines | In git? | What it demands before code moves |
|---|---:|---|---|
| `docs/designs/2026-09-27-maturity-subagent-protocol.md` | 87 | No | Per register group: census, a 3–5 product reference study, questions to Joel, a design file, then implementation. A value gate (safer, faster, more ergonomic, more intuitive, or more maintainable) |
| `docs/designs/2026-09-28-fragility-elimination-protocol.md` | 63 | No | Six steps and six workstreams over eight journeys. Says the worksheet is the only tracker, then cites four dossiers, three maps, and five sweeps |
| `docs/operations/convex-root-protocol.md` | 86 | Yes | Convex roots are registration-only, ≤200 lines, pins only decrease |
| `docs/operations/design-system-maturity-protocol.md` | 289 | Yes | Campaign `DS-01`–`DS-39`. Closed ID ranges must not be reopened. Evals and skills are required artefacts |
| `docs/reviews/alpha/research-method.md` | 50 | No | Same six-step solo-founder loop, with NIST/AWS/Google citations. Says “no extra architecture document” |

`docs/reviews/maturity/` is the protocol’s output: 27 files, eight groups, each with a census, a reference study, and a design, plus three decision files. `00-decisions.md` is what the fragility protocol calls binding. It is untracked.

### Registers

- `docs/reviews/2026-09-26-papercut-register.md` (174 lines, untracked) is the unit the maturity protocol organises work around.
- `docs/designs/2026-09-23-platform-hostility-register.md` (87 lines, tracked) scores screens against Airbnb, Google Maps, Vercel, Clerk, Linear, Stripe, and GitHub.
- `.planning/reviews/coverage-register.json` (1,260 lines, gitignored) plus six wave JSON files and `COVERAGE.md`.
- `docs/operations/convex-root-ledger.md` records a finished split of oversized Convex roots. That one is a closeout log of work that already happened.

### Ratchets

`deps:check` and `test:imports` both run inside `npm run check` and `npm run gate`. The dependency ratchet is `deps:check`. The next five rows are files inside `test:imports`. The design-system ratchet is enforced by `tests/eval/ds-grammar.test.ts` via `npm run test:eval`, which neither `check` nor `gate` runs.

| Ratchet | Ceiling | What a change must do |
|---|---|---|
| `tools/dev/deps-ratchet.ts` | `no-circular`, `no-circular-via-barrel`, `no-circular-capability-supply-internal` all at 0 | Keep the import graph acyclic. This is a gate that still wears the ratchet name |
| `tests/imports/bare-catch-ratchet.test.ts` | `BARE_CATCH_CEILING = 19` and `UNBOUND_PROMISE_CATCH_CEILING = 61`. The comment’s 10 is the 2026-09-12 historical count, later re-pinned from 17 to 19 on 2026-09-21 | Do not add a bare `catch` or an unbound `.catch(() => …)`. The comment says that historical 10 was deliberate (7 telemetry guards, 3 reviewed skips) and that the ceiling is not expected to reach 0 |
| `tests/imports/file-size-ratchet.test.ts` | `over300: 206`, `over500: 63`, `over1000: 0`, margin 0, pinned 2026-09-21 | Do not add another file in those buckets. The existing 206 are frozen in place |
| `tests/imports/module-boundaries-ratchet.test.ts` | ≤29 modules, ≤229 entry surfaces, ≤3 white-box exceptions, ≤2 edges into capability-supply | Do not add a module or a declared entry surface |
| `tests/imports/convex-facade-size.test.ts` | 200 lines; one exception, `convex/capabilityProviderConnections.ts` at 274 | Do not grow a Convex root. The exception pin may only fall |
| `tests/imports/convex-string-reference-ratchet.test.ts` | Zero drift from the generated API surface | Do not leave a string Convex reference pointing at a missing function |
| `tools/dev/eval-ds-grammar.ts` `DS_RATCHET` | Seven visual counts, all 0 (`font-bold` titles, `SiteMarker` eyebrows, generic `shadow-md`, centered heroes, and three more) | Do not use those classes outside the frozen Discover files. Not on the merge command |

`tests/imports/` overall is 33 files. The boundary tests in that folder are doing product work. The size, count, copy, and status scans are doing shape work, and they sit on the same command.

### Gates

`npm run check` is lint, `deps:check`, incremental `typecheck`, `test:imports`, `test:ts-standards`, and `test:ui-contract`.

`npm run gate` is `test:release:source`: deployment-manifest verify, env-example check, anonymous Convex codegen, release-integrity (which builds), then a serial tail of lint, deps, clean `tsc`, all unit tests, serial integration, type tests, the imports list, TS standards, SEO, UI contract, Playwright, Playwright accessibility again, and the CLI package test. `AGENTS.md` says to run this before every merge to `main`. The 28 September CI profile, measuring earlier full Kernel runs, put the median at about 43 billable runner-minutes, with one source-proof step at about 34 minutes and an example unit suite at about 14 minutes. That profile is untracked. It also records duplicated work: conformance lists overlap the full suites, accessibility runs twice, and the CLI is rebuilt more than once.

`.github/workflows/kernel-release-gate.yml` (509 lines) is no longer that pull-request shape:

| Job | When it runs |
|---|---|
| `check` | Pull requests. Runs `npm run check` only. 15-minute timeout |
| `source-proof` | Version tags and manual dispatch. Runs `npm run gate`. 45-minute timeout |
| `fresh-checkout-proof` | Tags and manual dispatch |
| `chat-staging-proof` | Manual dispatch on `main`, with an explicit confirm |
| `authenticated-platform-proof` | Manual dispatch |
| `live-gateway-proof` | Manual dispatch on `main`, with a typed run id and a confirm that external movement stays within AUD 6 |

React Doctor is a separate pull-request workflow. `cli-release.yml` publishes the CLI on a tag. The CI profile says both push workflows were disabled until billing returned; this review did not re-query GitHub, so the yaml is the source of what the file will do when it is enabled. `AGENTS.md` has not caught up: it still treats the full gate as the merge check, while the workflow treats `check` as the pull-request check.

### Pinned tests

These are paths written out inside npm scripts, not discovered by directory:

| Script | Paths |
|---|---:|
| `test:conformance` | 42 |
| `test:chat:conformance` | 11 |
| `test:imports` | 30 |
| `test:imports:fixtures` | 12, all of them already in `test:imports` |
| `test:release:architecture` | 2 |
| `test:release:package5` | 1 |
| `test:ts-standards` and its fixtures twin | 1 each |

87 unique paths. A new money test protects a release only if someone also edits the string in `package.json`. The full `gate` runs unit and integration by directory, so the conformance list is a second manifest of a subset, which the CI profile already found overlapping the suites it sits beside.

### Gitignore versus the tree the protocols assume

`.gitignore` ignores `/docs/*`, then re-includes a whitelist one level deep: `docs/reviews/*.md`, `docs/designs/*.md`, `docs/adr/*.md`, `docs/operations/**`, `docs/strategy/*.md`, and a few others. Nested review trees are not matched by that ignore. They are simply untracked. A clone gets the 24 September health review and does not get `docs/reviews/maturity/00-decisions.md`, the papercut register, either September protocol, or the alpha fragility maps.

`AGENTS.md` says dated research, execution gates, and generated maps do not override `PRODUCT.md`. The untracked fragility protocol says `00-decisions.md` binds every design. Both instructions are “the process.” They disagree, and only one of them is in git.

## What protects the product

These fail closed on something a buyer, a Provider, or an auditor can be hurt by.

- **The commercial distinctions**, when an agent actually reads them. Funding is not authority. Authority is not a purchase. Settlement is not delivery. Buyer consideration is not the Provider obligation. `AGENTS.md` and `CONTEXT.md` are the right place for that. Four ADRs (794 lines) record the principal-reseller topology and the bounded packages. That is a short memory for an irreversible market structure.
- **Import and runtime fences in `tests/imports/`.** Capability-supply and capability-contract boundaries, deployment-manifest boundaries, Clerk security exports, node-only modules kept out of the default runtime, development-evidence kept off the product claim, tool-surface conformance, chat-sharing boundaries, private imports. These stop an agent from wiring around the money and authority seams.
- **The string Convex reference ratchet and the API-kind snapshot.** A renamed internal function that still has a string caller is a production break.
- **Dependency cycles at zero.** Especially `no-circular-capability-supply-internal`. A cycle through supply admission is how a later edit bypasses a check without meaning to.
- **`npm run check` as the per-change command.** Lint, types, and the fences above are the right cost for a local edit. The Convex façade cap (200 lines, one named exception) earns its place: the ledger shows roots that had grown to 600–985 lines, and findability of an RPC is a real operating property.
- **Release identity, used at release time.** Anonymous Convex codegen must not mutate the checkout. The deployment manifest and env example are checked. Release integrity wraps a build. The live gateway job refuses to move money unless a person types a run id and confirms a cap of AUD 6. That is a human gate on spend, which is the gate this product needs.
- **`tools/dev/guard-destructive-git.ts`.** Concurrent agents share this checkout. Blocking stash, `reset --hard`, and force-push protects the work in progress. It does not protect customers. It is still justified by the way this repo is actually edited.
- **The paid-path tests themselves** (Call admission, recovery, Quote ceilings, monthly spend, Stripe and x402 refusal). They live in `tests/`. They protect the product when they run. `check` does not run them.

## What is ceremony

These add work before a behaviour change, or fail a change for its shape, and they do not decide whether a Quote, a Call, or a refund is true.

- **The maturity group cycle.** Eight groups times census, reference study, and design is 24 files, plus decision briefs, before implementation. A papercut becomes a benchmark exercise against other companies’ docs. The protocol says a papercut is not a unit of deployment, then makes the register the unit of planning. That is a backlog with extra steps.
- **The fragility stack.** A method dossier, a protocol, sweeps, goblin personas (4 files), a health scorecard (11 files), and a worksheet, after the dossier said not to add another architecture document. The useful residue would be one journey table and the injection test that failed. The residue on disk is a literature review.
- **The file-size ratchet.** Two hundred and six files may stay over 300 lines, and the two hundred and seventh fails the check. Nothing about money gets safer. The pin is from 21 September and the margin is zero, so an honest split that still leaves a file over the line, or a new file that crosses it, stops the change until someone edits the ceiling. The module-count pin (29 modules, 229 entry surfaces) does the same to an extraction.
- **The design-system operating manual and the class ratchets.** Two hundred and eighty-nine lines for a campaign whose own text says large ID ranges are closed. `font-bold` and eyebrow markers at ceiling zero will fail a layout fix that a customer would not notice and that a reviewer would accept. Discover files are declared frozen. Closed campaigns must not be reopened, which freezes defects the campaign shipped. The class ratchet is not even on `check` or `gate`.
- **Copy-vocabulary and status-vocabulary scans.** One real bug (calling unknown spending authority “Active”) is a product bug and belongs in a behaviour test. A banned-phrase list fails adjacent wording on the way to that fix.
- **The bare-catch ceiling, now that the burn-down is done.** The comment records a drop from 647 to 10 on 2026-09-12. That 10 is a historical count, not the pin. The enforced ceilings are `BARE_CATCH_CEILING = 19` and `UNBOUND_PROMISE_CATCH_CEILING = 61`. The file says the remainder is deliberate and the ceiling is not expected to reach zero. Further decreases are not the goal the comment itself states. The ratchet now guards a comment.
- **Pinned conformance lists.** Forty-two hand-picked paths, then the full unit suite on the gate, then a chat list, then an imports list that the fixtures script repeats. A path that exists only in the list drifts the moment a file is renamed. A path that the gate already runs by directory does not add protection.
- **Parallel instruction surfaces.** `AGENTS.md` exists so there is one brief. Beside it: a 1,374-line roadmap, `START_LINE.md`, `TODOS.md`, gitignored `RULES.MD`, a 1,500-line `.planning/codebase/` journal (architecture, conventions, testing, concerns), and 2,204 lines of Cursor rules (Meyer contracts, CQS, temporal coupling, type-driven design). An agent that reads the journal and an agent that reads the charter will follow different products. The deployment skill’s required reading list points at three operations files that are not in the tree.
- **Lab notebooks under `tools/dev`.** Evidence packets for local money semantics are useful when they feed a regression. `full-yolo-process-worker.ts`, `try-jev-aecon.ts`, `experiment-chained-jev-router.ts`, and the Jev eval harnesses are experiments checked in as tooling. They enlarge the script surface every release script has to live next to.
- **Strategy and the pitch deck under `docs/strategy/`** (18 tracked files). Commercial material. It is not an engineering control, and it shares a docs root with the files agents are told to treat as operating procedure.

The 24 September health synthesis already recorded the gates lying: bare catches at 20 against a ceiling of 19, façade pins that did not cover every oversized root. A gate that is already false teaches the next agent to negotiate the pin. That is worse than no gate.

## How a small mature team runs

**Shape Up (37signals).** A senior person shapes one bet: problem, appetite, a solution sketch, the rabbit holes, and the no-gos. A few pages. A betting table takes the bet or leaves it. A team of one designer and one or two programmers then has six uninterrupted weeks. Time is fixed, scope is hammered down, and there is no backlog to groom. Cooldown is for bugs and the next shaping. They do not produce a census, a five-product reference study, and a design file per cluster of papercuts. They do not keep a hostility register as the work queue. The pitch is disposable once the cycle ships. Their warning is the failure mode in this repo: the process becomes the work.

**Linear’s early team.** Three founders, then a small group, building the tool they used every day. The Linear method rejects sprint planning, story points, and backlog theatre. A cycle is a short rhythm, an issue is a few clear sentences with an owner, and quality is in the product and in review by people who will use the result. Their public method is one essay. They did not maintain eleven review frameworks, a line-count ceiling for source files, or a closed-campaign manual that forbids reopening last month’s visual law. Keyboard feel and speed were enforced by taste and by using the product, not by a ratchet on `font-bold`.

Both teams assume the builders hold the product in their heads and throw process away when it stops paying rent. This repo is trying to replace that memory with documents, because agents do not keep it. Some of that substitution is rational: the commercial distinctions and the import fences are the memory, written down where a check can fail. The rest is a programme office. Shape Up would accept one shaped slice for the next cycle (a Quote shows exact AUD authority, or it refuses). Linear would write that as an issue, ship it, and delete the register row. Neither would require eight reference studies first, and neither would block the patch because a file crossed 300 lines.

The solo-founder constraint cuts toward less process. There is no second person to maintain the registers. Every protocol that demands a census before a fix consumes the only person who can answer the hard question. The fragility protocol already reaches that conclusion in prose (“one worksheet,” “no extra architecture document,” deletion preferred) and the tree does the opposite.

## Why this process is itself a fragility

1. **Binding state is local-only.** The last two weeks of product decisions, both operating protocols, and the papercut register are untracked. Concurrent agents and any other machine follow `AGENTS.md` and `PRODUCT.md`, which tell them those dated files do not govern. The process’s own control plane is not in version control. That is the same class of defect as an uncommitted migration.

2. **Two gates, and the expensive one is the one the instructions still demand.** `check` misses the Call, Quote, and spend tests. `gate` is a half-hour serial run with duplicated browser and build work, reserved in CI for tags and manual dispatch. `AGENTS.md` still says to run `gate` before merging to `main`. Day to day, either money tests do not run, or every merge pays a ceremony the CI profile already called waste. A fence that is too expensive to close is not a fence.

3. **Shape pins sit on the hot path.** File size, module count, façade exceptions, copy bans, and status-vocabulary scans fail the same `check` as the capability-supply boundary. A correct extraction or a truthful empty state can be red while a wrong price that did not grow a file stays green. Agents learn to satisfy the ratchet. The easy green build is the one that avoids structural change.

4. **The process generates the next process.** The health review produced a protocol, which produced 27 maturity files, which produced a fragility protocol, which requires a worksheet that must not be a second architecture document, beside the architecture documents. None of these files fail when a Provider is paid twice. They do consume the change budget of a one-person team.

5. **Instructions contradict each other.** Charter versus untracked decisions. Merge-time `gate` versus pull-request `check`. Design-system protocol versus a later maturity protocol that says to delete behaviour a mature product would not ship, including work the design-system manual has closed. The deployment skill versus three operations files that are not in the tree. An agent that follows all of them cannot move. An agent that follows one of them can ship against the others. Split authority is the fragility.

Keep one charter (`PRODUCT.md` plus the distinctions already in `AGENTS.md`), the import and money fences, `npm run check` on each change, and the full gate only when cutting a revision that claims to take money. Delete the group cycle, the file-size and vocabulary ratchets, the closed-campaign manual, the extra instruction files, and the uncommitted register pile — or commit a single page of decisions and throw the pile away. Until then the process is on the outage path: it slows the fix, hides the last decision, and leaves the paid-path tests off the command that actually runs.
