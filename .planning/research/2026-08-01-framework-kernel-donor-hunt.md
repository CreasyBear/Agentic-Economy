# Donor hunt — what the framework kernel is most similar to, and what we can drop in (2026-08-01)

Map: `.planning/wayfinder/MAP-framework.md`. Predecessor pass: `T31` (OSS adoption pass) and
`.planning/research/2026-08-01-oss-inspiration-litreview.md`.
Method: five parallel source-verified librarians reading actual repository source, npm tarballs,
`LICENSE` files and generated `.d.ts` — not READMEs.
Transcripts: `history://PmEngineAnalogue`, `history://SchedulingMathDonor`, `history://McdmRfxDonor`,
`history://PersonSurfaceDonor`, `history://TreeMutationContract`.

Purpose: satisfy the founder's **adopt-first rule** for T26/T28/T29/T30 — function and feature come
from adopted OSS; hand-rolling is a defect unless the adoption search failed **and the failure is
recorded here**. This document is that record.

Gate applied to every candidate: license read from the actual `LICENSE` file (npm metadata alone
fails the gate); >18 months since last commit = AVOID; Python/Ruby/Java/Rust = pattern donor only.

## The one-line answer

**AE's tree engine is most similar to Task Master AI (`eyaltoledano/claude-task-master`)** — the only
found system combining model-generated hierarchical elaboration, dependency-aware "what's next"
frontier selection, cycle validation, and complexity-guided expansion. It is MIT, ~28k stars, active.
What it does not have is exactly AE's differentiator: no first-class **fog**, no **study**, no
**propose_decision**, no five-dimension rollups, and it is a file-backed CLI for *software* tasks.

Second-closest by shape: a **classical CPM/Gantt scheduling engine** (GanttProject, ProjectLibre) for
the timing dimension, and **Linear** for the person surface. Nothing in OSS is the whole thing.

## Verdicts

### 1. Tree engine / gardener verbs (T26, T28)

| Candidate | License / maturity | Score* | Verdict |
| --- | --- | --- | --- |
| `eyaltoledano/claude-task-master` v0.43.1 | MIT (actual), ~28k★, commit 2026-07-30 | 4/5 | **VENDOR** named modules |
| `MrLesk/Backlog.md` v1.48.0 | MIT (actual), ~6.3k★, commit 2026-07-30 | 3/5 | **VENDOR** types + validators |
| `TotallyGatsby/GamePlanHTN` (npm `htn-ai` 1.2.1) | MIT (actual), 6★, ~2025-11 | 3/5 | **VENDOR** small source (too low-adoption to depend on) |
| `BloopAI/vibe-kanban` v0.1.44 | Apache-2.0, ~3.2k★, active | 3/5 | **BORROW** (Rust backend; wrong seam) |
| `feodal01/task-tracker-mcp` | Apache-2.0, 4★, 2025-05 | 2/5 | **PORT** tiny tree shape only |
| LangGraph.js v1.0.47 | MIT, active | 1/5 | **AVOID** as a decomposition engine (generic graph runtime; we already have Convex workflow + XState) |
| LangChain Deep Agents v0.7.1 | MIT, Python only, beta | 1/5 | **BORROW**; `TodoListMiddleware` is a flat list and is no longer default since v0.7.0 |
| OpenProject / Redmine / Taiga | GPLv3 / GPLv2 / MPL-2.0 | 2/5 | **BORROW** WBS rollup semantics only |

\* hierarchy / directional dependencies / explicit ready frontier / fog / agent-driven mutation+validation.

**Lift list (Task Master, replace file I/O with Convex transactions):**
- `scripts/modules/task-manager/expand-task.js` → `expandTask(...)` — complexity-guided elaboration
  (reads `complexityScore`, `recommendedSubtasks`, `expansionPrompt`, validates the generated array
  before appending). This is `elaborate`.
- `scripts/modules/task-manager/find-next-task.js` → `findNextTask(tasks, complexityReport)` —
  frontier selection: eligible = dependencies all completed, sorted by priority then dependency count.
  This is the frontier query. Caveat: their frontier is top-level + one subtask level only.
- `scripts/modules/dependency-manager.js` → `isCircularDependency`, `validateTaskDependencies`,
  `addDependency`, `removeDependency`.
- `scripts/modules/task-manager/add-subtask.js` → `addSubtask(...)` — rejects missing parent,
  self-parenting, circular hierarchy.
- `src/schemas/analyze-complexity.js` → `ComplexityAnalysisItemSchema` as the elaboration-budget shape.
- Backlog.md `src/types/index.ts` (`parentTaskId`, `subtasks[]`, `dependencies[]`) and
  `src/utils/task-builders.ts` `validateDependencies` — but do **not** copy its existence-only
  validation; it has no cycle check.

**Recorded adoption-search failure:** no donor implements `study` or `propose_decision`, first-class
fog/unelaborated state, or the five-dimension node algebra. Those remain AE integration code. The
tree CRUD, cycle validation and frontier selection do **not** qualify — vendor them.

### 2. Scheduling + rollup math (T26)

| Candidate | License / maturity | Verdict |
| --- | --- | --- |
| `@pyraxi/cpm-engine@1.2.4` | MIT (actual `LICENSE.md`), 0★, 2026-07-29 | **PORT** `packages/engine/src/schedule.ts` + `working-time.ts` (too new to depend on) |
| `@bluemillstudio/gantt@0.11.1` | MIT (actual), 1★, 2026-04-28 | **PORT** `src/store/scheduling.ts` + `src/store/calendar.ts` |
| GanttProject | GPLv3 | **PORT** algorithm: `CriticalPathAlgorithmImpl.java` + `WeekendCalendarImpl.java` — best small CPM+calendar reference |
| ProjectLibre | CPAL-1.0 (attribution/logo burden) | **BORROW** only |
| `graphology` 0.26 + `graphology-dag` 0.4.1 | MIT (actual) | **ADOPT** — `hasCycle`, `willCreateCycle`, `topologicalSort`, `topologicalGenerations` |
| `@flatten-js/interval-tree@2.0.3` | MIT (actual), 55★, 2025-11-07 | **ADOPT** for resource-conflict indexing — `insert`/`search`/`intersect_any`. Closed-interval semantics: normalize AE bookings to half-open |
| `date-fns@4.1.0` | MIT | **ADOPTED** — `addBusinessDays`, `differenceInBusinessDays`, `areIntervalsOverlapping`, `eachDayOfInterval`, `isWeekend`. No holiday/custom-workweek support |
| `@date-fns/tz@1.5.0` | MIT (actual) | **ADOPT** only if calendars must be IANA/DST-aware |
| `@dagrejs/dagre` | MIT | **BORROW** — its `longestPath`/`slack` are layout ranks, not ES/EF/LS/LF |
| `toposort`, `critical-path`, `cpm`, `pert`, `frappe-gantt`, `jsgantt-improved` | mixed | **AVOID** — stale, empty, or no backward pass. `jsgantt-improved`'s `criticalPath()` picks the longest *child*, ignores dependency edges, and returns nothing |
| `@outbuild-company/schedule-core@1.6.3` | no actual LICENSE anywhere | **AVOID** (license gate) — despite the best declared model |
| `node-interval-tree`, `intervaltree`, ProtonMail/interval-tree, `date-fns-holiday-us` | stale or no LICENSE file | **AVOID** |

**T31 partially overturned.** Base CPM (forward/backward pass, ES/EF/LS/LF, slack, critical flag),
working-calendar arithmetic, and interval-overlap detection are donor-backed and must not be
invented. Donor-backed = 2 of 5 dimensions (timing, resources). **Recorded failure:** no package
computes AE's five-dimension rollup — timing uncertainty/fog envelopes, cost sum + committed/estimate
envelope, resource over-allocation policy, effort attention-budget, scope-coverage denominator with
fog. That aggregation contract stays AE-domain.

### 3. Study engine — MCDM + RFx (T29)

| Candidate | License / maturity | Verdict |
| --- | --- | --- |
| `kotbaton/pymcdm@1.4.0` `pymcdm/methods/topsis.py` | MIT (actual), active | **PORT** — the complete normalize → weight → PIS/NIS → distances → closeness pipeline with every intermediate named |
| `quatrope/scikit-criteria` `skcriteria/agg/topsis.py` | BSD-3-Clause | **PORT/BORROW** — alternative reference; assumes pre-normalization |
| npm `topsis@1.3.2` | MIT, last publish 2019 | **AVOID — and now proven broken.** `index.js:~199` computes `performanceScore = listaIdeal / (listIdeal + listaIdeal)`, using the anti-ideal distance on both sides. Issue #12 (2020-02-28) unanswered |
| `topsis2@1.2.3` | MIT, 10★, 2023-04-08 | **AVOID** — no per-criterion output, `NaN` on zero columns, no weight validation |
| `mcdajs@0.0.2` | MIT in tarball, **source repo 404** | **AVOID** — no provenance |
| `ahp-calc`, `airicyu/ahp`, `electre-js`, `promethee`, `weighted-sum`, `@coinspect-rating/ahp-core` | stale (2016–2025) or missing LICENSE | **AVOID** |
| `assafelovic/gpt-researcher` | Apache-2.0 (actual), ~28k★ | **BORROW** schema — `{learnings:[{insight, sourceUrl}], followUpQuestions, citations, visited_urls}` |
| `langchain-ai/open_deep_research` | MIT (actual) | **BORROW** the numbered-inline-citation + `### Sources` prompt convention only |

**T31 confirmed, with a correction to the method.** The npm TOPSIS rejection is now evidence-backed,
not assumed. But "hand-roll" was the wrong word: **port pymcdm's `topsis.py`**, retaining every
intermediate. Persist per alternative × criterion: `raw`, `normalized`, `weight`, `weighted`,
PIS/NIS deltas and squared distance contributions. Never persist only the winner.

Study artifact shape (donor-derived): `Study { id, query, createdAt, engineVersion, criteria[],
alternatives[], scoring{method, weights, types, normalization, intermediates}, claims[], sections[],
evidence[], recommendation, validity }` with `Evidence { id, title, urlOrPath, publisherOrOwner,
sourceType, qualityScore, quoteOrLocator, observedAt }` and `validity { observedAt, expiresAt,
revision }`. GPT Researcher gives claim→source linkage but URL-only locators; AE adds the locator,
freshness and revision fields.

**Recorded failure:** no OSS XState/TS procurement machine exists. The RFx lifecycle
(`enquiry → tender → qualification → award`) is a borrowed OpenProcurement pattern expressed in our
already-adopted XState v5.

### 4. Person surfaces (T30)

| Candidate | License / maturity | Verdict |
| --- | --- | --- |
| `@novu/react@3.18.1` `<Inbox />` | ISC package / MIT repo, active | **AVOID as our inbox** — `Notifications.list()` fetches Novu-hosted notifications; the render props receive Novu `Notification` objects, with no seam for AE Convex records. Adopt only if we adopt Novu's backend |
| `ln-dev7/circle` | MIT (actual), 2026-04-18 | **BORROW** exact files: `components/common/inbox/inbox.tsx`, `issue-line.tsx`, `issue-preview.tsx`, `store/notifications-store.ts`, `components/issues/status-selector.tsx` |
| `@react-email/components@1.0.12` + `@react-email/render@2.0.6` | MIT, React 19 peers | **ADOPT (already)** — Convex-safe: Render 1.2.3 shipped "use edge exports in convex runtime"; call `await render(<Digest/>)` inside a Convex action |
| `shadcn-labs/emailcn` | MIT, 117★, 2026-07-30 | **VENDOR** `registry/bases/react-email/blocks/notification-*.tsx` as the digest/alert layout donor |
| `shellscape/jsx-email@3.2.1` | MIT, 1.2k★ | **AVOID inside Convex** — its `render()` loads config from the filesystem (`node:path`, `lilconfig`) |
| `react-arborist@3.16.0` | MIT, 3.7k★, commit 2026-07-25 | **ADOPT (already)** — not stale; peers `react >=16.14`, so React 19 is fine |
| `@headless-tree/react@1.7.0` | MIT, ~880★, 2026-05-17 | **ADOPT** if we want headless + shadcn composition for fog/dimension metadata in rows |
| `@svar-ui/react-gantt@2.7.1` | MIT (actual `license.txt`), 2026-06-29, React 19 peers | **ADOPT** for the behind-disclosure plan view — supports `criticalPath`, `calendar`, links, segments. Audit transitive `@svar` packages first |
| `react-calendar-timeline@0.30.0-beta.19` | MIT, React 19 peers, 2026-07-24 | **ADOPT** as fallback (beta; adds dayjs + interactjs) |
| `gantt-task-react` | MIT but React 18 peer, frozen 2022 | **AVOID** |
| Polis / DemocracyOS / ConsiderIt / Loomio | AGPL / GPLv3 / GPLv3 / Ruby | **AVOID** as dependency |
| `@snapshot-labs/snapshot.js@0.14.26` | MIT (actual), active | **BORROW** proposal schema + voting strategies only; Ethereum-specific, no UI |

**Recorded failure:** no MIT React proposal → positions → outcome component exists. The decision
inbox composes shadcn primitives over our Convex mutation contract, using circle's files as the
visual pattern.

### 5. Proposal application + fencing (T28)

| Candidate | Verdict |
| --- | --- |
| `ai@7.0.44` + `zod@4.4.3` (installed) | **ADOPT (already)** — `z.discriminatedUnion('kind', [...])` + `generateText({ output: Output.object({ schema }) })`. `Output.object.parseCompleteOutput` does `safeParseJSON` → `safeValidateTypes` → `NoObjectGeneratedError`. `generateObject` is deprecated in the installed declarations. `src/modules/plan-proposal/internal/model-transport.ts` already does exactly this |
| `@convex-dev/workflow@0.4.4` (installed) | **ADOPT (already)** — the durable human-decision wait: `awaitEvent` transitions `created→waiting` / `sent→consumed`; internal `generationNumber` fence with `getWorkflow(ctx, id, expectedGenerationNumber)` throwing on mismatch; restart increments generation, stale completions rejected |
| Convex OCC | **ADOPT** — serializable mutations with read-set validation and deterministic retry. It does **not** semantically fence a stale *model proposal*: the expected-generation/digest comparison must happen inside the same mutation. Integration code, no donor |
| `immer@11.1.15` | **ADOPT (optional)** — `enablePatches()`, `produceWithPatches`, `applyPatches`; copy-on-write, rejects unresolved paths and `__proto__`/`constructor`/`prototype`. Only if we want mechanical patch application under typed verbs |
| `fast-json-patch@3.1.1` | **AVOID** — MIT and safe, but frozen since 2022-03-24 |
| `rfc6902@5.3.0` | **AVOID** — no actual LICENSE file; `applyPatch` mutates in place and can partially apply |
| LangGraph `interrupt()` / Mastra `suspend`/`resume` | **BORROW** persisted-wait shape only; our adopted spine already covers it |
| Automerge / Yjs | **AVOID for fencing** — CRDTs merge concurrent edits; we need to *reject* stale semantic proposals. Revisit only if offline multiplayer editing becomes a requirement |

**Answer to T28's adopt-first question: no new dependency is required.** Constrained output,
fencing, durable waits and journaling are all covered by libraries already installed. Pipeline:
Zod/`Output.object` validation → Convex `v` args + Zod reparse → tree validation (verb allowlist,
target/parent/cycle/depth/op-count caps, status transitions) → single mutation comparing
`expectedGeneration`/`expectedRevision` + proposal digest → apply → journal + receipt atomically.

**Recorded failure:** no OSS hostile/replayed/cyclic *agent-proposal* verifier exists. Nearest test
donors are `rfc6902/test/json-patch-tests.ts`, fast-json-patch's prototype-pollution cases and
Immer's `tests/patch.js`. The T15 adversarial suite lineage remains ours.

> **Correction (2026-08-01, verified against `package.json` and `node_modules`).** Four libraries
> this document and T31 describe as "adopted already" — `date-fns`, `react-email`, `react-arborist`
> and XState v5 — **are not installed**. T31 recommended them; nothing installed them, and the map's
> decision line reads as though the adoption happened. Caught by `history://AuditModules`, which
> refused to cite `date-fns` because the manifest disagreed with its brief. Treat every "ADOPTED
> already" claim below as a recommendation unless it appears in `package.json`. Actually installed
> and load-bearing today: `ai`, `zod`, `convex`, `@convex-dev/workflow`, `@convex-dev/workpool`,
> `graphology`(+`-dag`,`-traversal`), `fastest-levenshtein`, `clsx`, `tailwind-merge`,
> `class-variance-authority`, `ajv`, `@cfworker/json-schema`, `@noble/hashes`, `@noble/curves`,
> `eventsource-parser`, TanStack and Radix packages.

## Net effect on the adopt-first ledger

New adoptions to install: `graphology` + `graphology-dag`, `@flatten-js/interval-tree`,
`@svar-ui/react-gantt` (or `react-calendar-timeline`), optionally `@headless-tree/react`,
`@date-fns/tz`, `immer`.
New vendors (MIT, copy source + license): Task Master's five modules, Backlog.md's types/validators,
emailcn's notification blocks, circle's inbox files.
New ports (algorithm from a named reference file): pymcdm `topsis.py`; CPM from
`@pyraxi/cpm-engine/schedule.ts` or GanttProject's `CriticalPathAlgorithmImpl.java`;
working calendars from bms-gantt `calendar.ts`.

Genuinely donor-less, and therefore legitimate AE integration code — this is the complete list:
1. `study` and `propose_decision` verb semantics.
2. Fog / rolling-wave elaboration lifecycle.
3. The five-dimension rollup contract (aggregation policy, not the base math).
4. Cost envelope with committed/estimate split, authority/mandates, evidence refs, quote freshness.
5. Semantic generation/digest fencing of model proposals inside a Convex mutation.
6. The adversarial proposal suite.

## Cutover status

### Tranche 1 — landed 2026-08-01

Installed: `graphology@0.26.0`, `graphology-dag@0.4.1`, `graphology-traversal@0.3.1`.

| Was hand-rolled | Now | File |
| --- | --- | --- |
| Iterative colour-marking DFS over parent/dependsOn/unlocks edges | `new DirectedGraph()` + `hasCycle` | `src/modules/decision-map/internal/kernel.ts:120-127` |
| O(n²) fixed-point `while (changed)` ripple closure | `bfsFromNode` over a ripple graph | `src/modules/decision-map/internal/kernel.ts:236-251` |
| Recursive `cyclic()` over plan steps | `DirectedGraph` + `hasCycle` | `src/modules/plan-proposal/public.ts:264-269` |
| Recursive `visit()` over composition refs | `DirectedGraph` + `hasCycle` | `src/modules/customer-request/application/reference-composition.ts:331-338` |

Evidence: 680 focused tests green except the one failure that already fails at committed HEAD;
`tsc --noEmit` clean outside the deleted `examples/`; `npm run lint` clean; `convex codegen` bundles
the CJS graphology packages into the Convex runtime. The four extra integration failures present on
this working tree were each isolated to pre-existing uncommitted work by reverting the change and
re-running the same test.

### Tranche 2 — audit of the rest of live source

Additional live hand-rolls found while cutting tranche 1. None are on the framework kernel path.

- **LANDED** `src/modules/answer/internal/provider-location-filter.ts` — the 18-line
  `levenshteinDistance` is deleted; the file now imports `distance` from `fastest-levenshtein@1.0.16`
  (MIT, the implementation ESLint uses). Zero net supply-chain cost: it was already in the tree via
  `promptfoo` and now dedupes. Evidence: `tests/unit/answer` 169 tests green, typecheck and lint
  clean. Note it fails the 18-month freshness gate (last publish 2022-08-02); accepted because it is
  a frozen standard algorithm already resident in the dependency tree.
- **BLOCKED, founder decision** `src/modules/catalog/internal/publish.ts:401` and
  `src/modules/storefront/internal/import-draft.ts:487` — **two different `slugify` implementations**
  in one codebase. The divergence is the real defect. Slugs are persisted and public, so adopting
  `@sindresorhus/slugify` (MIT) changes URLs for existing rows: that is a migration decision, not a
  swap. Left untouched deliberately.
- **BLOCKED, toolchain** `convex/registry.ts:1124` `groupByStringField` — `Object.groupBy` /
  `Map.groupBy` would replace it, but `tsconfig.json` targets `lib: ["DOM","DOM.Iterable","ES2022"]`
  and those are ES2024. Raising the lib is a separate, wider change.
- **DEFERRED** `src/modules/customer-request/legacy-v1.ts:451` cycle DFS — legacy path; cut it over
  when that file is retired rather than touching a frozen baseline.

### Tranche 3 — whole-repo hand-rolling audit (2026-08-01)

Four parallel read-only scouts ran the `stdlib:`/`native:`/`dep:`/`dup:` slice of `ponytail-audit`
across `src/modules`, `src/lib`+`src/routes`+`src/components/ae`, `convex`+`tools`+`eval`+`scripts`,
and the dependency ledger. Transcripts: `history://AuditModules`, `history://AuditLibComponents`,
`history://AuditConvexTools`, `history://AuditDepsUnused`. Vendored `src/components/ui/**` and
`src/components/ai-elements/**` were excluded by charter — they are registry source, not hand-rolls.

#### Landed in this session

| Change | Sites | Evidence |
| --- | --- | --- |
| `graphology` + `graphology-dag` replace hand-rolled cycle/topology | `decision-map/internal/kernel.ts` (cycle + ripple), `plan-proposal/public.ts`, `customer-request/application/reference-composition.ts`, `customer-request/compiler.ts` (wave-Kahn → `topologicalGenerations`), `customer-request/route-plan-generation.ts` | unit+ui-contract suites unchanged; **20,000-case differential fuzz** proved `composeRequestActions` ordering is byte-identical (it feeds `canonicalDigest`), **30,000-case** fuzz for `routePlanGraphIsValid` |
| `fastest-levenshtein` replaces the hand-written distance | `answer/internal/provider-location-filter.ts` | `tests/unit/answer` 169 green |
| **14 unused dependencies removed** | 10 individual `@radix-ui/*` packages superseded by the `radix-ui` umbrella, plus `http-message-sig`, `next-themes`, `tokenlens`, `web-bot-auth` | zero import sites verified by grep incl. config files; `tsc`, `lint`, `build`, unit+ui-contract all green |
| `tsconfig` `lib` ES2022 → **ES2023**, then `findLast`/`toSorted` replace reverse-copy scans | `chat/session-provider-context.ts` (×2), `chat/AeThreadTranscript.tsx`, `customer-request/panels/request-result.tsx`, `owner.offerings.new.tsx` | typecheck clean after the bump; suites unchanged |
| `Response.json` replaces `JSON.stringify` + `new Response` | `api.answer.eval-status.ts`, `api.observability.funnel.ts`, `api.answer.follow-up-chips.ts` (×2), `api.answer.turn.ts` | `Content-Type: application/json` is what the platform emits and what these sites set by hand; integration counts unchanged (43/203, identical to pre-session) |

#### Ranked backlog — do these on a green, committed baseline (see T41)

Not applied because the tree already carries 127 uncommitted files and a red main; a 40-file
mechanical dedupe on top of that is a merge-conflict machine, not a cleanup.

1. `dep:` route lease/claim/release + retry/recovery scheduling is hand-rolled next to the adopted
   spine — `convex/customerRequestRouteTransportWorker.ts:17`,
   `customerRequestRouteExecutionJournalPorts.ts:245`, `customerRequestRouteExecutionDispatchPorts.ts:35`
   → `@convex-dev/workpool` + `@convex-dev/workflow` (~80 lines). BEHAVIOUR-RISK: changes durable job
   identity, retry timing and lease expiry. Needs a migration plan, not a swap.
2. `native:` bespoke cursor/total pagination → Convex `paginationOptsValidator` + `.paginate()` —
   `convex/registry.ts:731,1229`, `convex/moneyLedger.ts:308,322` (~100 lines). BEHAVIOUR-RISK:
   registry cursors are public.
3. `dup:` `isRecord`/`isJsonObject` — **17 copies** (14 in `src/modules`, 3 in `convex`) (~49 lines).
4. `dup:` recursive `deepFreeze` — **10 copies** (~45 lines).
5. `dup:` Base64/Base64url codecs — 5 private copies vs the existing `base64Codec` (~44 lines).
6. `dep:` hand-written HTTP/MCP/x402 config validation → Zod —
   `capability-supply/route-transport-runtime.ts:758` (~48 lines).
7. `dup:` `RuntimeDocument` field accessors — 5 copies vs exported `inquiryRuntimeDbHelpers` (~70 lines).
8. `dep:` manual class-string concatenation → the existing `cn` (`clsx` + `tailwind-merge`) across
   ~17 `src/components/ae` files (~70 lines). BEHAVIOUR-RISK: `tailwind-merge` changes precedence.
9. `stdlib:` `structuredClone` for `JSON.parse(JSON.stringify(…))` — 6 sites in `action-invocation`
   and `capability-contract/public.ts:972` (~15 lines). BEHAVIOUR-RISK: `structuredClone` keeps
   `undefined` keys that JSON cloning drops, and these values are digested.
10. `native:` `withIndex('by_target_status')` instead of `collect()+find` full scans —
    `convex/catalog.ts:1461,1557`, `convex/discovery.ts:1176` (~12 lines).
11. `stdlib:` `node:util.parseArgs` for hand-written argv loops — `eval/answer/scripts/run-live-api-study.ts:1214`,
    `eval/engine/run-suite.ts:17`, `eval/answer/scripts/run-suite.ts:24` (~42 lines).
12. `native:` `node:fs/promises.glob` for the recursive tree walk — `scripts/audit-action-surfaces.mjs:86`;
    `console.table` for the hand-built table printer — `tools/ae/lib/output.ts:66` (~28 lines).
13. `dup:` `serviceAssertion` validator ×3, `csrfArgs` ×2, `stableUnique` ×4, local `sorted` vs
    `uniqueSorted`, local `formatTimestamp` (~40 lines).
14. `dep:` modulo-biased OAuth user-code RNG → `nanoid` `customAlphabet` —
    `customer-request/oauth-state.ts:144`. BEHAVIOUR-RISK: none to the wire format; fixes a real bias.
15. `native:` route `loader` + `pendingComponent` instead of `useEffect`/`loading`/`error` —
    `routes/_operator/agent-access.tsx:64` (~25 lines).
16. `stdlib:` `Object.groupBy`/`Map.groupBy` — `answer/internal/openrouter-models.ts:124`,
    `layout/AeRouteCommandMenu.tsx:46`, `convex/observability.ts:450`. **Still blocked**: ES2024, and
    the lib is now ES2023.
17. NEW DEP `date-fns` v4 for day-bucket and TTL arithmetic — low value, and UTC-vs-local semantics
    differ at `demand/demand.functions.ts:136`.

#### Negative results worth keeping

- `ai` is fully adopted for model transport; the only raw `fetch` to OpenRouter left is the **model
  catalogue** lookup (`answer/internal/openrouter-models.ts:17,185`), which is not model transport.
- `ajv` and `@cfworker/json-schema` are **not** redundant: `@cfworker` is the runtime validator and
  `ajv` supplies the 2020-12 meta-schemas (`capability-contract/public.ts:1-10,578-600`).
- SSE framing already uses `eventsource-parser`; tables already use `@tanstack/react-table`; dialogs,
  tooltips and the command palette already use Radix and `cmdk`. Nothing to cut there.
- `deepFreeze` has no platform equivalent — `Object.freeze` is shallow. The 10 copies are a
  duplication defect, not a hand-rolling one.
