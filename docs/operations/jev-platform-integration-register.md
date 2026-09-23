# Jev platform integration — engineering work register

**Created:** 21 September 2026
**Status:** IN PROGRESS — JI-01 substantive source check complete; JI-02a implementation and focused validation active. No hosted acceptance claimed.
**Inspected source:** `main` at `e86184cd22828fce58f64bd641fcc47de83945c6`; Jev integration landed in `de8bd68ab`. Concurrent quality work continues; rebase measurements before claiming a task.
**Product authority:** [PRODUCT.md](../../PRODUCT.md), especially Core market journeys; [CONTEXT.md](../../CONTEXT.md).
**Design input:** [proposed ADR 0003](../adr/0003-jev-market-journey-intelligence.md), [experiment programme](../../research/jev-experiment-programme.md). Their presence in this working tree is not proof they are committed or approved.
**Delivery authority:** [alpha maturity register](alpha-maturity-register.md), including LP-3/LP-4 and AM-24/25.
**Related structural owner:** [Campaign 3](code-quality-campaign-3-register.md). It owns funding/payment decomposition, not Jev product behaviour.
**Machine-readable task index:** [jev-platform-integration-tasks.jsonl](jev-platform-integration-tasks.jsonl). This Markdown is authoritative; refresh the derived index when recording task changes. A stale index never blocks authorized implementation or invalidates verified output.

## Start here — current working set

**Next action:** propagate request cancellation and register the discovery rollback switch (JI-02a.2). Protected-main landing waits on Joel opening a `well-11/unified-baseline` (or equivalent) PR from `176948beb`/`498fa8f43`; #226/#227 are not that vehicle. Local source work continues.
**State:** JI-01 substantive dependency satisfied against `176948bebc8e3f8e0371b3c8ff2afc99fda47372`; local documentary reconciliation complete; documentation landing remains open. JI-02a is owned by Codex in `/Users/joelchan/.codex/worktrees/jev-sdk-lifecycle/Agentic-Economy`, branch `codex/jev-sdk-lifecycle`. Shared-root dirty source/research is preserved.
**Current interval:** 45–75 minutes for lifecycle implementation and focused checks, excluding the full release gate and CI; revise if target changes.
**Visible queue:** JI-02a lifecycle → available caller cancellation → JI-02b honest usage. Full backlog retained below.
**Blocker:** no source implementation blocker established. JI-07b inherits the alpha register's unaccepted LP-3 target/ledger/custody and LP-4 approval/access prerequisites. No paid inference or transaction has been authorized by this implementation record.

## 1. Outcome and scope decision

**Thesis:** help an agent acquire a suitable contribution and continue its work, while helping a Provider reach that demand across different buyer vocabularies.

This register integrates the existing implementation into the platform. It does not introduce a second market, purchase engine, model gateway or general agent runtime. Jev supplies typed semantic judgments. Existing modules own retrieval, canonical supply, commercial facts, publishing, authorization, Quote, Call, recovery and purchase status.

| Milestone | Required work | End condition |
| --- | --- | --- |
| M1 — usable platform integration | JI-01 through JI-07b | Buyer discovery/comparison and Provider discoverability work through deployed entry points; purchase continuation and delivery handling satisfy their contracts; frozen evaluation and hosted acceptance pass. |
| M2 — later supply matching | JI-08a/b | A consented retained request can find new eligible supply through owner-scoped status; duplicate jobs do not duplicate matches or authorize purchases. |
| M3 — repeat-use improvement | JI-09a/b | Reusable outcome evidence and a held-out evaluation establish whether a proposed ranking policy improves repeat matching. A negative result is recorded; the baseline remains active. |

M1 completion is not whole-programme completion. M2/M3 remain visible and are not additional entry-release gates unless the product owner changes release scope. A model proposal may be rejected by evidence without deleting the customer journey from the programme.

**Not in scope:** new vector database/search service; a new orchestration framework; a model call before every purchase; automatic publication of invented Provider claims; global inference caching; replacing the existing ledger, custody or payment controls; full CQ-25 redesign; general React Doctor cleanup. Each is either unsupported by current evidence or owned elsewhere. Native Convex vector search is an available alternative if a bounded recall study justifies it, not a dependency of this plan [R06].

## 2. Engineering review: scope challenge and existing capability

The overall programme crosses more than eight files. It is deliberately split into sixteen bounded assignments; it is not one refactor or one PR. Initial implementation introduces no new service or class. A task exceeding eight hand-written files must first split along an observable acceptance boundary and record the reason; do not scatter one change into wrappers to meet a count.

| Existing capability / actual source | Reuse and remaining gap |
| --- | --- |
| `src/modules/decision-engine/{jev-client,contracts,decision-gateway,public}.ts` | Reuse installed TypeSafe SDK. Discovery needs one explicit request budget and cancellation policy, accurate usage, and typed operational failures. Do not change other gateway callers' fallback behaviour accidentally. |
| `src/modules/registry/tool-reranker.ts` | Reuse canonical Tool ranking. It currently requires a Choice winner and writes score zero for unassessed tail candidates. Assessments need truthful coverage and no forced suitability claim. |
| `src/modules/registry/tools.actions.ts`; `convex/{capabilityToolCatalog,chatTools}.ts` | Reuse action descriptors and Node bridge. Trace each caller so each retrieved set receives at most one ranking pass. Shared policy does not require moving SDK code into the default Convex runtime. |
| `src/modules/market/x402-directory-reranker.ts`; directory server/index adapters | Reuse bounded external-directory ranking, no-retry fallback and metadata projection. External entries remain distinct from admitted Tools. |
| `src/modules/registry/{tool-choice-contracts,opaque-cursor}.ts` | Reuse strict public schemas, freshness and cursor ownership. Any added assessment metadata requires a reviewed compatibility change across projections. |
| `src/modules/capability-supply/source-preview.ts`; `internal/supply-funnel/source-first-owner.ts` | Reuse source digest/revision, draft, review and publication workflow. Add source-backed semantic suggestions rather than a second ingestion pipeline. |
| `src/modules/capability-execution/{procure-engine,quote.actions,call.actions}.ts` | Preserve current registered `tool.procure` and Quote/Call delegation. Its durability work remains AM-24/25-owned. This programme neither removes it nor certifies its recovery by inference. |
| `src/modules/capability-execution/call-worker/output-adjudication.ts` | Existing semantic judgment can invalidate delivery before settlement. Needs a separate contract, raw-output disclosure review and failure tests; discovery success cannot certify it. |
| `src/modules/market-demand/market-demand.actions.ts` | Existing owner-scoped record/list/status flows are the foundation for later matching. Do not build a separate demand CRM. |
| `tools/dev/eval-jev-{bazaar,journeys,agent-loop,market-coverage}.ts` | Reuse frozen cases, input/revision identity, paired controls and retained failures. Preserve existing identifiers where they select the actual input; do not generate administrative hashes or use them as correctness credit. Several files are currently untracked; claim and land deliberately before treating them as reproducible clean-checkout evidence. |
| Existing Vitest, convex-test, Playwright, deployment manifests and production smoke tools | Reuse test and deployment infrastructure. No new evaluation service or standalone dashboard. |

`TODOS.md` contains hosted-cutover, source-versus-deployed and release dependencies. Those remain with their existing owners. This register adds no duplicate payment, infrastructure or recovery backlog.

**Verified installed stack:** Node 22.22.0; npm 11.5.1; TypeSafe SDK 0.6.0 (`package.json` range `^0.6.0`); Convex 1.45.0; AI SDK range `^7.0.44`; Zod 4.4.3; Vitest 4.1.9; Playwright 1.61.1. Keep lockfile versions; no upgrade is required by this plan.

## 3. External research and reuse decisions

Official sources were consulted on 21 September 2026. These establish API behaviour and patterns, not AE product performance. Failed `.md` requests were retried against normal documentation pages; the TypeSafe index was unavailable through the browser tool. SDK declarations and implementation were also inspected locally.

| Ref | Primary source | Engineering consequence |
| --- | --- | --- |
| R01 | [TypeSafe JavaScript SDK](https://docs.typesafe.ai/sdk/javascript), [v0.6.0 client](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/client.ts), [v0.6.0 types](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/types.ts) | Use `TypeSafeClient.systemOne(request, options)`, official question/answer types and SDK errors. `RequestOptions` supports `signal`, per-attempt `timeout`, and retry overrides. The timeout is not a total retry budget. The installed SDK already buffers response delivery under its timeout. No custom HTTP retry loop or Promise.race transport. |
| R02 | [TypeSafe reranking cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe) | Retrieve a bounded shortlist, assess a defined request/candidate relation, then order in code. Evaluate retrieval coverage separately; reranking cannot recover an omitted candidate. Reuse Convex retrieval instead of importing the cookbook's Python BM25 stack. |
| R03 | [Noul](https://docs.typesafe.ai/primitives/noul), [Confidence](https://docs.typesafe.ai/confidence) | Noul is the probability of the stated proposition; it has no separate confidence field. Choice/Score confidence describes their answer distribution. No universal threshold and no inference that a high number grants commercial authority. |
| R04 | [Parallel questions](https://docs.typesafe.ai/cookbooks/parallel_questions), [Composite scoring](https://docs.typesafe.ai/patterns/composite-scoring) | Batch useful judgments over shared evidence; keep weighting in code. Use independent dimensions only where a consumer needs them. Hard incompatibilities must not be averaged away by soft preferences. |
| R05 | [Pre-parsed value extraction](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook), [Skill suggestion](https://docs.typesafe.ai/cookbooks/skill_suggestion) | Select supplied source spans/known values and copy them through validation. Keep a no-match path. A second shortlist pass is an experimental alternative, not automatic extra inference. Vendor benchmark gains are not AE acceptance evidence. |
| R06 | [Convex full-text search](https://docs.convex.dev/search/text-search), [vector search](https://docs.convex.dev/search/vector-search) | Use existing search indexes, indexed filters and pagination. Keep page-local semantic order distinct from catalogue-wide relevance. Prefer native capability over new infrastructure if recall evidence warrants a later change. |
| R07 | [Convex actions](https://docs.convex.dev/functions/actions), [scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions) | External inference runs in actions/server code, not queries or mutations. Scheduled actions are not automatically retried; scheduled authentication is not propagated. Background completion must re-read owner eligibility and source revision before an atomic write. |
| R08 | [AI SDK settings](https://ai-sdk.dev/docs/ai-sdk-core/settings) | Existing general-model experiments can use the SDK's abort/retry controls. Discovery does not gain an extra general-model fallback merely because this API exists. |

**Local SDK evidence:** `node_modules/@typesafe-ai/sdk/dist/index.d.mts` defines `RequestOptions` and `Usage`; `index.mjs` implements caller abort, timeout and retry cleanup. `Usage` declares input/output tokens, not a provider charge in AUD. If extended transport metadata supplies cost, preserve its documented currency and provenance; otherwise cost is unknown or an explicitly versioned estimate, never a fabricated measured charge.

**Correction to the earlier conversational scope:** Jev does not write free-form Provider descriptions. Initial Provider enrichment selects existing source spans/declared terms or approved classifications; deterministic code renders reviewed suggestions. A text-generation feature would be a separately justified use of the installed AI SDK, not hidden inside this assignment.

## 4. Architecture and semantic contracts

```text
HTTP / MCP / installed CLI ----> registered search action ---+
Convex chat ------------------> Node action bridge ---------+--> registry relevance policy
                                                           |      |
Existing canonical retrieval -> bounded Tool candidates ----+      v
                                                          TypeSafe SDK
External Bazaar/index -> bounded directory entries -> market policy |
                                                           |       |
                                     validated assessment <+-------+
                                              |
                              comparison / clarification / selection
                                              |
                                  existing Quote -> Call -> outcome

Provider source -> preview (digest/revision) -> source-backed suggestions
  -> Provider review -> existing draft save -> admission/publication -> retrieval

Consented need -> existing market-request status -> current supply assessment
  -> owner-visible suggestion; never an automatic purchase
```

**Module secrets:** decision-engine hides inference transport and operational policy; registry hides relevance of canonical Tool evidence; market hides external-directory projection; capability-supply hides source-to-publication admission; capability-execution hides authorized execution/recovery; market-demand hides retained need lifecycle. An SDK transport change must not require editing five product adapters. A ranking criterion change must not change payment handlers. A Provider metadata revision must not change buyer authority.

| Contract | Requires | Ensures | Invariant | On violation |
| --- | --- | --- | --- | --- |
| C1 — inference attempt | Valid bounded state/questions; positive remaining deadline; server-owned configuration | Validated SDK response or classified operational failure | No credentials/payload leakage; retries bounded; caller cancellation propagates | Invalid programmer configuration surfaces as a defect; missing key/timeout/rate limit/service failure is explicit fallback, not a fabricated answer |
| C2 — ranking | Valid request; retrieved identities and source revision; complete permitted evidence | Permutation of original candidates and honest assessment coverage | No added/removed identities, changed prices, authority, admission, cursor or freshness | Invalid/incomplete assessment preserves original order; unassessed is not poor-fit; invalid user request uses existing input errors |
| C3 — comparison/preparation | Current facts, selected Tool, supplied literals/declared options | Supported differences and schema-validated inputs or named missing facts | No invented literal, hidden choice, invented price or new grant | Clarify the missing fact; retain existing Quote/Call refusal semantics |
| C4 — Provider enrichment | Authorized owner, source digest/revision, bounded source-backed options | Reviewable suggestions tied to the exact source | No silent publication; no implied certification; no new endpoint or commercial term | Stale evidence causes conflict/recompute; inference failure leaves draft unchanged |
| C5 — adjudication | Declared output contract, permitted evidence and a recorded decision policy | Evidence with explicit consequence under existing delivery/recovery rules | Semantic suspicion cannot silently become an unexplained financial fact; retries cannot re-settle | Preserve deterministic evidence; uncertain/unavailable cases take an explicitly reviewed existing recovery path, not a blanket accept/reject default |
| C6 — later matching | Consented owner-scoped request; still-eligible request and publication | Current potential matches visible to that owner | No demand disclosure, automatic purchase or duplicate durable match | Expired/deleted/withdrawn inputs reject completion; unavailable matching is distinct from no current match |

Internal assessment state should distinguish `assessed`, `skipped(reason)` and `unavailable(reason)`. Assessed items identify which propositions were evaluated and against which source version. Do not force these names into public DTOs without the JI-03a compatibility decision. Public scores are not calibrated quality or delivery guarantees.

### Request budgets and error policy

- Interactive discovery: one SDK attempt, `retry.maxRetries = 0`, at most 1,500 ms for inference within the caller's remaining deadline. Propagate the inbound signal where available; set an explicit remaining-time signal at the Node bridge otherwise. A remote RPC transport may outlive a disconnected browser: bound its own attempt and test that limit rather than promising distributed cancellation.
- Preserve current candidate limits initially: canonical top 20; directory at most 24; directory state cap 32,000 characters. Bound canonical state too in JI-02a; do not silently truncate away explicit buyer constraints. Skipping inference must preserve the full retrieved page.
- No general-model or deterministic rerank escalation on discovery failure. Existing order remains usable. Other decision-gateway consumers retain their current policy until their own contract is reviewed.
- SDK operational errors are classified once at the external boundary. Do not catch sort/projection/programmer errors and disguise them as a service outage. No infinite retry or homemade circuit-breaker service.
- Read-only discovery creates no durable request row by default. If caching is later justified, include source/model/question versions and account-specific constraints; public cross-account caching is prohibited for private request evidence.

### Complexity and cohesion decisions

| Boundary | Cost added | Burden removed | Decision |
| --- | --- | --- | --- |
| Existing decision-engine, explicit per-call policy | A small result/policy contract and tests | Callers no longer reproduce timeouts, retry/error interpretation and usage guesses | Keep; modify existing adapter before creating another layer |
| Registry and directory domain adapters | Two evidence projections | Prevents conflating an imported listing with an admitted Tool | Keep separate; share mechanics, not domain identity |
| Source-backed Provider assessment | One draft suggestion boundary plus revision validation | Provider need not manually translate every source description into buyer language | Keep; no new publisher or model-generated prose pipeline |
| Richer shortlist pass | Additional latency/cost and decision state | Benefit unproved by AE's small-candidate trial | Do not put on default path; bounded experiment only if JI-03b exposes a specific information gap |
| New generic intelligence service / universal scorer | New dependency direction, APIs and lifecycle | No current caller need beyond existing modules | Reject |

Current ranking code has communicational cohesion around candidate data; transport, relevance policy and presentation must have separate reasons to change. Keep pure sort/projection local when extraction buys nothing. Avoid new `utils`, `manager` or one-line forwarding modules. Use existing naming conventions, props-only TSX, pure leaves, thin RPC façades and dependency ratchets; no arbitrary directory reorganisation.

## 5. Work queue and dependency graph

State meanings: **READY** means ready for bounded implementation planning/claim, not approved schema mutation; **WAITING** names dependencies; **SPEC_REQUIRED** needs a concrete compatibility/state spec before code; **DATA_REQUIRED** needs observed evidence. Execution: `READY -> CLAIMED -> IN_REVIEW -> SOURCE_ACCEPTED -> HOSTED_ACCEPTED`. A source-only task closes at SOURCE_ACCEPTED; hosted rows require HOSTED_ACCEPTED. An observed failed guarantee reopens only the affected assignment and its dependent behavior. Missing status or receipt metadata does not reopen valid work; IN_REVIEW is not a mandatory extra review round after the required checks pass. No task is currently claimed.

| ID | Priority | Assignment / ownership | Dependencies | Initial state |
| --- | --- | --- | --- | --- |
| JI-01 | P1 | Reconcile programme authority, source and interface map — integration owner | — | READY |
| JI-02a | P1 | SDK request lifecycle and bounded discovery — decision-engine owner | JI-01 | CLAIMED |
| JI-02b | P2 | Honest inference usage and operational diagnostics — decision-engine owner | JI-02a | WAITING |
| JI-03a | P1 | Assessment coverage and public compatibility — registry owner | JI-01 | SPEC_REQUIRED |
| JI-03b | P2 | Retrieval recall and candidate-evidence experiment — discovery owner | JI-01 | WAITING |
| JI-04a | P1 | Search/chat/HTTP/MCP/CLI policy parity — integration owner | JI-02a, JI-03a | WAITING |
| JI-04b | P2 | Comparison, no-fit and clarification experience — buyer-experience owner | JI-04a, JI-03b | WAITING |
| JI-05a | P2 | Source-backed Provider suggestions — supply owner | JI-02a, JI-03a | SPEC_REQUIRED |
| JI-05b | P2 | Provider review, publication and discoverability proof — supply owner | JI-05a, JI-03b | WAITING |
| JI-06 | P1 | Delivery-adjudication contract and evidence boundary — execution owner | JI-01 | SPEC_REQUIRED |
| JI-07a | P1 | Frozen end-to-end evaluation and promotion decision — evaluation owner | JI-02b, JI-04b, JI-05b, JI-06 | WAITING |
| JI-07b | P1 | Deployed platform/real-client acceptance and rollback — release owner | JI-07a; applicable LP-3/LP-4, AM-24/25 gates | WAITING |
| JI-08a | P2 | Owner-scoped on-demand later matching — market-demand owner | M1 | WAITING |
| JI-08b | P2 | Durable new-supply matching where required — market-demand owner | JI-08a | SPEC_REQUIRED |
| JI-09a | P2 | Minimal usable repeat-outcome evidence — evaluation owner | M1 | SPEC_REQUIRED |
| JI-09b | P2 | Repeat-allocation experiment and disposition — evaluation owner | JI-09a; sufficient outcome evidence | DATA_REQUIRED |

```text
JI-01 -> JI-02a -> JI-02b ------------------------------+
  |         +-> JI-04a -> JI-04b -----------------------+-> JI-07a -> JI-07b [M1]
  +-> JI-03a --^       ^                                |                    |
  +-> JI-03b ----------+--------------+                 |                    +-> JI-08a -> 08b [M2]
  |         +-> JI-05a -> JI-05b <----+-----------------+                    +-> JI-09a -> 09b [M3]
  +-> JI-06 -------------------------------------------+
```

Role owners are responsibilities, not fictitious assigned agents. Before editing, establish the actual engineer, branch/worktree, input revision, owned files and next verification. Record these briefly in the existing assignment; completing a form is not a prerequisite when the facts are already known. Max two active implementation tasks, only when their owned modules do not overlap. This register does not start workers or automations.

## 6. Implementation assignments

Each record specifies the bounded result. Paths below are existing unless labelled **new**. Tests are part of the assignment, not follow-up work. Sizes S/M/L describe scope. At task start give a concrete duration range with its assumptions, then revise from observed work; do not present it as a guarantee. Large tasks require child slices before execution.

### JI-01 — authority and interface map (S)

**21 September execution — substantive and local documentary checks complete; documentation landing pending.** Codex inspected shared `main` at `176948beb`, Node 22.22.0/npm 11.5.1. Canonical `registryToolsSearchAction` retrieves then calls `rerankToolSearchResult`; chat retrieves and calls the Node `capabilityToolCatalog.rerank` action once; external directory server/index adapters call `rerankX402DirectoryPage`. HTTP/MCP/CLI remain descriptor-driven. `tool.procure` remains registered; its effect owner is capability-execution/AM-24, not decision-engine. Provider source/admission remains capability-supply; retained demand remains market-demand. CQ3 commits after the register's inspected revision changed supply façades, not this SDK boundary. Existing untracked evaluation/research and historical-doc edits were identified and preserved, not claimed as independently reproduced evidence. Deployment identity remains unverified. Local documentary edits now link alpha/ADR/history to this register and explicitly supersede the historical `tool.procure` deletion statement. Existing concurrent content was preserved. `git diff --check` passed; documentation has not been staged or landed.

- **Finding:** unified main contains Jev and `tool.procure`; retired System One documents still contain contradictory historical instructions; proposed design/evaluation files are partly untracked.
- **Files:** this register; `docs/adr/0003-jev-market-journey-intelligence.md`; `docs/operations/alpha-maturity-register.md`; `docs/operations/system-one-maturity-register.md`; `docs/operations/system-one-maturity-protocol.md`.
- **Change:** first establish the actual checkout/revision, current entry points and effect ownership so implementation targets the correct code. That substantive check satisfies the JI-01 dependency for otherwise-ready authorized work; documentary reconciliation below may finish alongside it. Link this queue from alpha; label history and preserve current registered actions. Record which pending design choices remain proposed. Land only deliberately owned documentation; never sweep in concurrent changes.
- **Acceptance:** the actual source target, affected entry points and effect ownership are established; source identity is distinct from any unverified deployment. Reconcile the requested document links/history without making their completion a gate for unrelated implementation. Existing launch prerequisites and CQ3 assignments remain with their owners and are not waived.
- **Verify:** source/route inventory, relative-link check, `git diff --check`; no application tests needed for this documentary slice.

### JI-02a — SDK lifecycle and discovery budget (M)

**JI-02a.1 delivery:** [draft PR #228](https://github.com/CreasyBear/Agentic-Economy/pull/228), head `57c687acc` (lifecycle commit `66319df77`). Focused tests: **64 passed, two opt-in live cases skipped**. Lint, full typecheck and dependency checks passed. First `npm run gate` exposed both rerankers importing TanStack through the web `degrade` helper. An esbuild dependency trace established `convex/capabilityToolCatalog -> registry/tool-reranker -> degrade -> capture-route-exception` and `convex/x402Directory -> market/x402-directory.server -> directory-reranker -> degrade`; both now reuse `degradeBackend`, without a new abstraction. Anonymous Convex bundling then passed and revealed generated API declarations missing already-committed CQ3 helpers. The existing anonymous codegen workflow regenerated `api.d.ts`; no manual generated edits, schema changes or new functions. The final gate has now passed codegen, build integrity and architecture checks and is proceeding through the remaining checks; CI remains pending. This is not SOURCE_ACCEPTED or hosted acceptance. JI-02a.2 remains necessary for inbound request propagation/configuration registration.

**Delivery baseline correction (21 September).** GitHub `main` is `8a58a0252` (Wells 7+8, #225). The programme freeze is `origin/codex/jev-source-base` = `176948beb` (205 commits / 1,368 files ahead of GitHub `main`). Local `main` has since advanced four C3 commits to `498fa8f43`; those are not required for #228. PR #228 stays based on `codex/jev-source-base`. **Neither open integration PR is the missing prerequisite:** #226 (`codex/alpha-convex-hookup`) is a 62-commit hosted-alpha sibling that is **not** an ancestor of the unified tree (CI red since 14 Sep); #227 (`well-9/ocr-findings` at `694ddf1cc`) **is** an ancestor but stops at IceInVein/well-9 and is missing the next 63 commits (well-9 merge, W-01–W-44, Campaigns 1–3, well-10 merge; CI red since 17 Sep). **Owner:** Joel, as protected-`main` manager — not Jev, C3, or AM-25. **Vehicle:** a new well PR (suggested `well-11/unified-baseline`) from `176948beb` or `498fa8f43` onto `origin/main`. Close or supersede #227 when that PR opens; do not rebase Jev onto #226. Do not merge the 1,368-file history through this programme. Continue local slices against unified source and retarget #228 only after that prerequisite lands.

**Remaining gate evidence.** TS standards, typecheck, SEO (28), UI contract (2), accessibility (18), reproducible packaged CLI and production build passed. The browser suite produced 30 passes, eight auth skips and two failures: source-only Vite has no backend admission credential, so `/api/discovery/schema` correctly returns 503 while an old test expects 200. JI-01-G now owns a six-hand-written-file prerequisite in `codex/jev-release-prerequisite`: the navigation annotation, two backend-safe logger imports, Playwright source-only environment, developer-discovery spec and existing fresh-checkout CI job, plus official regenerated API declarations. Source-only tests assert fail-closed 503; the positive artifact assertions also run in the existing real local-backend job, not a mock or removed gate. Both modes now pass (four checks per mode, two explicitly inapplicable checks skipped in each). The configured run used the existing anonymous local stack and development Clerk configuration, with no paid inference or transaction. Navigation waits for DOM readiness and then the original visible-content assertions, avoiding unrelated external-resource load delays. Requires correct server mode; Ensures both refusal and admitted artifact behavior are tested; Invariant runtime admission remains unchanged; On failure block landing. Local build and a11y pass do not establish hosted acceptance. Vercel preview metadata access returned HTTP 403 with the existing CLI credential; no preview cause or hosted acceptance is inferred.

**JI-01-G — existing release-contract repair (one-file child slice).** The final gate reached and passed 6,021 unit tests, 1,819 integration tests (29 skipped, three todo), type tests and import checks, then found a pre-existing `Promise<unknown>` navigation prop in `AeOwnerSupplySourceStartPage.tsx:40` (introduced by `fea40841a`). Codex owns only that return annotation in the isolated checkout. The installed TanStack `NavigateFn` returns `Promise<void>`; narrow the prop to that exact type, without changing UI behavior. This independent acceptance boundary is recorded separately from JI-02a's eight-file lifecycle slice; it is a minimal necessary release prerequisite, not a Provider feature or broader refactor. Verify with the existing TS standards guard and full typecheck. Continue the unfinished gate suffix rather than replaying the unchanged six-thousand-test prefix for bookkeeping.


**21 September execution — CLAIMED; local behavior verified, landing pending.** Codex owns decision-engine `contracts.ts`, `jev-client.ts`, `decision-gateway.ts`; registry and market rerankers; new SDK boundary tests and both reranker suites in the isolated branch above. C1 is enforced with typed sanitized operational errors, SDK RequestOptions, cancellation, one discovery attempt, a total 1,500 ms/caller deadline, and a 32,000-character canonical state ceiling without query truncation. Configuration/programming errors propagate; only operational inference failure preserves the retrieved page. Existing non-discovery fallback policy remains. Cost: three optional timing/purpose inputs and one error class in the existing boundary; benefit: both adapters share SDK lifecycle/error interpretation. Keep the existing modules; no transport layer or dependency added.

Slice boundary: JI-02a.1 owns these eight implementation/test files and proves SDK plus adapter behavior; JI-02a.2 owns request-context/Node integration and configuration declaration/readback where required. Split because adding the transport consumers would exceed eight hand-written files, not to create wrappers. Both must finish before parent acceptance.

Focused evidence against `176948beb` plus this branch's working changes: `npm exec -- vitest run tests/unit/decision-engine/jev-client.test.ts tests/unit/decision-engine/decision-gateway.test.ts tests/unit/registry/tool-reranker.test.ts tests/unit/market/x402-directory-reranker.test.ts tests/unit/registry/registry-tools-search-rerank.test.ts tests/integration/registry-tools-search-rerank.test.ts --no-file-parallelism` initially produced 60 passes, two explicitly opt-in live tests skipped. Expected/observed: one attempt on 429/5xx; abort on slow headers/body and pre-cancellation; original candidate page on outage/oversize; non-discovery fallback retained. Additional deadline tests are being validated. Initial full `npm run typecheck` passed before caller edits. `npm run lint` found the required cause field on a sanitized request defect; fixed with status-only cause metadata, recheck pending. No live/hosted/purchase evidence, full gate or CI claim. The discovery-only rollback control is `AE_JEV_DISCOVERY_ENABLED=false`; hosted configuration registration/readback remains in JI-02a.2/JI-07b.

- **Files:** `src/modules/decision-engine/{contracts,jev-client,decision-gateway}.ts`; `tests/unit/decision-engine/decision-gateway.test.ts`; **new** `tests/unit/decision-engine/jev-client.test.ts` if existing tests cannot directly express the SDK boundary.
- **Change:** use official SDK RequestOptions/error classes; propagate cancellation; explicit zero-retry discovery policy; separate operational failure from programmer failure. Keep the OpenRouter endpoint adaptation narrow and regression-tested; no alternative HTTP client. Respect existing non-discovery gateway callers.
- **Acceptance:** at most one outbound attempt; slow headers AND slow body abort; pre-aborted signal makes no request; malformed/partial response is unavailable; optional inference outage does not break retrieval; caller deadline includes SDK work.
- **Verify:** SDK-boundary fake fetch with call count, signal observation, body-stream timeout and 429/5xx/auth-error cases; no live key. Full typecheck and affected caller tests.

**JI-02a.2 CLAIMED — caller/rollback boundary.** Codex now owns `registry/tools.actions.ts`, `convex/capabilityToolCatalog.ts`, `convex/convex.config.ts`, `src/lib/deployment/manifest.ts`, `.env.example`, registry action tests, one Node-bridge test and deployment-manifest tests (eight handwritten files maximum; official generated declarations excluded). Checkout `/Users/joelchan/.codex/worktrees/jev-request-lifecycle/Agentic-Economy`, branch `codex/jev-request-lifecycle`, starts from current local main `498fa8f43` and incorporates the locally verified predecessor. The main advance does not change these boundaries. Requires validated search and server-owned settings; Ensures inbound cancellation reaches inference and the Node bridge owns an explicit 1,500 ms deadline; Invariant no public DTO/storage change, single optional attempt and original results on rollback; On operational failure preserve retrieval, on invalid configuration fail deployment validation. Validate pre/mid abort through the action, bridge request count/deadline/disabled behavior, and flag validation. Draft landing still depends on the unpublished baseline and both required CI jobs; no hosted configuration mutation is authorized by this row.

**Prerequisite delivery:** [draft PR #229](https://github.com/CreasyBear/Agentic-Economy/pull/229), `1d70d17b2`, isolates six handwritten files and generated declarations. Lint and 29 focused reranker/discovery tests passed; real local-backend admission and offline refusal each passed four browser checks. [PR #228](https://github.com/CreasyBear/Agentic-Economy/pull/228) is now based on #229 and contains exactly eight files at `163cef5a5`; merge conflicts retained the already-tested narrow operational catches, and both reranker files are unchanged from their prior source result. Neither PR has landed.

### JI-02b — usage and diagnostics (S)

- **Files:** `src/modules/decision-engine/{contracts,jev-client,secondary-llm-adapter}.ts`; their existing/assigned unit tests; existing observability projection only if required by an actual consumer.
- **Change:** remove invented default token counts from evidence; distinguish observed usage from unknown; remove unqualified hard-coded AUD cost. Record purpose, actual model, attempted path, timeout/fallback reason and total duration through existing logging. Do not log keys, raw private needs or arbitrary provider outputs.
- **Acceptance:** missing usage remains unknown; actual zeros remain zero; estimated money states currency, rate/model provenance and estimation status; aggregate accounting does not silently drop failures. No new telemetry backend or schema without a concrete need.
- **Verify:** absent/zero/partial usage, transport failure, cancellation and redaction tests. Check no changed public API is accidentally exposed through internal types.

### JI-03a — assessment coverage and compatibility (M)

**D01 proposal sent to Joel, 21 September:** source inspection confirms strict `toolChoiceSearchOutputSchema` contains no assessment/ranking fields, and old readers reject additive fields. Recommend optional `assessment: "jev-v1"` request mode: absent preserves today's exact response; present returns a versioned assessment with assessed/unassessed/unavailable distinction. Alternative: coordinated breaking client version upgrade. Exact DTO/state spec and tests follow the decision; no public-contract implementation is authorized by this proposal alone. Existing JI-02a work continues independently.

- **Files:** `src/modules/registry/{tool-reranker,tool-choice-contracts}.ts`; `src/modules/market/{x402-directory-reranker,x402-directory}.ts`; `tests/unit/{registry/tool-reranker,market/x402-directory-reranker}.test.ts`; exact projection consumers frozen after the spec.
- **Change:** preserve unassessed/unknown separately from a low relevance judgment; define no-fit meaning as no supported fit in the assessed set, never no supply anywhere. Remove forced-winner dependency where Noul ordering suffices. Any Choice includes none/uncertain when selection is needed. Retain useful scores without arbitrary best-match bonuses.
- **Spec:** exact internal union, public schema version/additive-field treatment, adapter compatibility, and old-client behaviour. Existing strict readers mean an optional field is not automatically backward compatible.
- **Acceptance:** identities/facts/page metadata unchanged; stable ties; invalid/missing answers restore original order; tail items are unassessed, not falsely scored zero. Only observed explicit constraints become deterministic filters.
- **Verify:** extend both existing suites, including all-zero, all-uncertain, partial response, duplicate identity rejection, >20 tail and versioned DTO consumer cases. Public-schema changes stay SPEC_REQUIRED until reviewed.

### JI-03b — retrieve suitable evidence before ranking (M, experiment first)

- **Files:** `tools/dev/eval-jev-market-coverage.ts`; `tests/eval/jev-market-coverage.test.ts`; `research/jev-experiment-programme.md`. Runtime candidates, only after an evidenced choice: `src/modules/registry/internal/{search,search-documents}.ts` and the existing source-projection owner.
- **Change:** separate missing-candidate recall from ranking mistakes. Compare existing retrieval, source-backed indexed text enrichment and a bounded native alternative on frozen supply/needs. Do not handroll BM25 or introduce a vector service. Reuse native Convex facilities [R06].
- **Acceptance:** label whether a suitable published Tool exists, whether it was retrieved, and whether it was ranked usefully. Selected remedy improves held-out candidate recall without admission/filter/freshness regressions. If baseline is sufficient, record KEEP and no runtime change.
- **Verify:** rare vocabulary, explicit negative constraints, insufficient metadata, unpublished/withdrawn supply and cursor continuity. Compound needs may identify bounded contributions; the buyer's harness still owns the larger plan.

### JI-04a — entry-point parity (M)

- **Files:** `src/modules/registry/tools.actions.ts`; `convex/{capabilityToolCatalog,chatTools}.ts`; `tests/unit/registry/registry-tools-search-rerank.test.ts`; `tests/unit/chat/chat-agent-tools.test.ts`; `tests/integration/registry-tools-search-rerank.test.ts`.
- **Change:** apply the same canonical Tool relevance policy from existing adapters; keep inference server-side and Node dependencies behind the existing bridge. Instrument call count per request/candidate set. Preserve descriptor-driven HTTP/MCP/CLI projection.
- **Acceptance:** identical frozen candidates/questions/answers produce equivalent canonical results across surfaces; each search invokes inference at most once; list/browse does not incur inference; pagination and strict filters are unchanged; unavailable inference returns retriever order.
- **Verify:** HTTP integration, chat bridge, MCP descriptor/action and installed-CLI execution. Reuse existing surface-conformance tests; add only uncovered assertions. No hand-edited Convex generated API.

### JI-04b — comparison and preparation ergonomics (M)

- **Files to freeze:** `src/components/ae/market/{DirectoryComparison,DirectoryIndexDiscovery,AeMarketPage}.tsx`; existing `src/modules/market/tool-view-model.ts`; canonical choice projection; colocated tests for changed compounds (new where missing).
- **Change:** show supported differences and missing facts, retain request/constraints, make no-fit and fallback intelligible, and preserve stable inspection order. Reuse canonical money formatting. Carry selections/literal inputs into the existing Quote/Call path without a compulsory extra Jev hint.
- **Acceptance:** user can compare without remembering facts from another page; missing required input produces one specific clarification; model scores are not presented as trust badges. No automatic submission/purchase. Revalidate Tool availability at Quote, including after a stale page.
- **Verify:** component tests plus Playwright: keyboard selection, slow inference, navigation away, no result, poor fit, missing input, stale Tool and repeated click. UI leaf components perform no inference or business math.

### JI-05a — source-backed Provider suggestions (M)

- **Files:** `src/modules/capability-supply/{source-preview,integration-draft}.ts`; `internal/supply-funnel/source-first-owner.ts`; `tests/unit/capability-supply/{supply-source-preview,source-first-owner}.test.ts`; at most one domain-owned assessment file if needed.
- **Change:** select source spans, declared capability terms and input/output descriptors using SDK primitives [R05]; render deterministic review suggestions. Existing source digest/revision travels with the assessment. No free-form Jev generation and no inferred commercial claim.
- **Spec:** exact suggestion shape and draft placement; prefer current draft facilities. Any durable field/table change requires its concrete migration/compatibility contract, not blanket approval from this register.
- **Acceptance:** unsupported claims never enter a draft; missing/inconsistent evidence is explicit; changed source rejects application of stale suggestions; inference failure leaves the draft usable; no automatic admission/publication.
- **Verify:** source injection, ambiguous capability, omitted source option, source refresh mid-inference, wrong owner and draft edit races.

### JI-05b — Provider review to buyer discovery (M)

- **Files to freeze:** `src/components/ae/supply/AeOwnerSupplySourceStartPage.tsx`; existing source-start presentation/flow; existing draft save/publication handler; `tests/unit/ui/supply-source-native-start.test.tsx`; supply-funnel integration suite; colocated review tests.
- **Change:** show suggestion and evidence together; apply through authorized draft save; Provider reviews published meaning. Preview independent buyer phrasings against the intended source version. Keep preview separate from live published eligibility.
- **Acceptance:** accept/edit/reject all work; double-submit does not duplicate publication; only accepted current material is discoverable after normal admission; withdrawal removes eligibility; original endpoints/contracts/prices remain authoritative.
- **Verify:** owner A/B isolation, source update between preview/save, rejected suggestion, duplicate request, publication failure/retry, and Provider-to-buyer discovery E2E.

### JI-06 — consequential delivery adjudication (M; P1 release gate)

- **Files:** `src/modules/capability-execution/call-worker/{output-adjudication,runRelease,brokeredX402}.ts`; `tests/unit/core-flow/native-platform-procure.test.ts`; `tests/unit/call-worker/adjudicate-stealth-failure.test.ts`; **new** `tests/unit/call-worker/output-adjudication.test.ts`; existing worker integration suite. No CQ-25 structural redesign.
- **Finding:** suspicious-token gate plus semantic answers can mark output invalid; raw parsed payload is submitted; prompt treats empty datasets as possible failure. Two tests named for a separate `adjudicateStealthFailureAndReleaseHold` helper are not sufficient coverage of `adjudicatePayloadOutput`.
- **Spec:** distinguish contractual failure, semantic suspicion and unknown; define exactly which evidence changes delivery and which existing recovery transition follows. Select minimal permitted model evidence by Tool contract. Do not pick new thresholds from vendor examples or silently change financial outcome semantics.
- **Acceptance:** valid empty result and error-related successful content remain valid under their declared contract; real contract failure remains protected; unavailable model behaviour is explicit; uncertainty is not manufactured as proof of success/failure; retries cannot produce duplicate settlement/remedy.
- **Verify:** direct function cases plus worker/ledger integration for both brokered and standard paths; record observed balances/status, not only a mocked helper return. Include malformed answers, contradictory classification, prompt injection, sensitive payload and concurrent recovery. Use existing mocks at external boundaries.

### JI-07a — evaluation and promotion (M)

- **Files:** existing `tools/dev/eval-jev-{bazaar,journeys,agent-loop,market-coverage}.ts`; existing `tests/eval/jev-*.test.ts`; `research/jev-experiment-programme.md`. Slice by runner; do not rewrite all four together.
- **Change:** freeze versioned candidates, labels, model/questions, code SHA and budgets; preserve every attempt/failure; compare baseline and treatment on the same evidence. Validate metrics before live runs. Land untracked runners deliberately before declaring reproducibility.
- **Acceptance:** G1–G4 below; new holdout is distinct from prompt development cases; label reviewer is identified; no held-out result drives retuning and remains called holdout. Publish KEEP/REVISE/REJECT per integration shape, not a global Jev score.
- **Verify:** offline metric/fixture tests; then bounded authorized live inference. No purchase occurs in an inference-only evaluation. Unknown cost/latency or skipped cases cannot become zeros or passes.

### JI-07b — hosted release acceptance (L, split by entry point)

- **Files:** `docs/operations/alpha-validation-plan.md`; existing deployment manifest; `tools/release/tool-gateway-production-smoke-{discovery,call,receipt}.ts`; validator; targeted Playwright/authenticated acceptance suites. Reuse current release commands and receipts.
- **Change:** deploy the accepted source under existing LP-3/LP-4 controls; exercise real UI/chat, HTTP/MCP and installed CLI. Verify selected model/configuration without exposing credentials. Exercise baseline switch/rollback and outage recovery.
- **Acceptance:** exact commit and deployment identities; actual caller auth; Provider publishes and buyer finds/compares; real Quote/Call on Base Sepolia and controlled Base using the existing x402/USDC validation programme; visible delivery/recovery and accurate receipts. No fixture or local mock substitutes for hosted proof.
- **Verify:** existing deployment-manifest verification and hosted gateway smoke with the selected launch runbook's exact arguments; authenticated browser suite; installed CLI calls; validate the generated smoke receipt. Record command, target and transaction references without secrets.
- **Dependencies:** alpha ledger/custody/network/access/legal and live-exposure requirements remain in the launch package; this register does not authorize new transactions or replace them. AM-24/25 durability remains its own owner. Missing prerequisites block only this hosted row, not useful local work.

### JI-08a — later supply matching on demand (M)

- **Files:** `src/modules/market-demand/market-demand.actions.ts`; current status projection; `tests/unit/market-demand/market-demand-actions.test.ts`; `tests/unit/server/market-demand-api.test.ts`; `tests/unit/convex/market-demand-signals.test.ts`.
- **Change:** reuse explicitly retained need and status flow to assess current eligible supply. Preserve consent, owner scope and the original need; no public demand feed.
- **Acceptance:** source freshness visible; no-match differs from unavailable; wrong owner cannot read; expired/deleted request cannot produce a new actionable match; match requires a new authorized purchase.
- **Verify:** owner isolation, withdrawal/republication, malformed retained input, provider outage and current-publication recheck.

### JI-08b — background new-supply matching (M; only after on-demand contract)

- **Files to freeze:** existing market-demand backend, existing scheduling/Workpool integration, demand status projection and its integration tests. Do not add a queue service.
- **Change:** bounded jobs on relevant supply changes using existing Convex machinery [R07]. Freeze proposed result identity `(requestRef, publication revision, matching-policy version)`; atomically recheck owner/request/publication eligibility when persisting. A scheduled action's completion is not exactly-once external inference.
- **Acceptance:** duplicate job/late completion/withdrawal race produces no duplicate actionable result; failed jobs have bounded retry and visible state; no implicit scheduled auth; no unsolicited email/notification integration.
- **Verify:** concurrent completion, crash after inference/before write, deletion/revocation, stale revision and retry exhaustion. Schema/index changes stay SPEC_REQUIRED until exact contract is reviewed.

### JI-09a — repeat-outcome evidence (M)

- **Files to freeze:** existing observability/outcome readers, evaluation runner and tests. Prefer projections of existing Call/Outcome records over a new event store.
- **Change:** define usable matching outcome: selection, correction, valid Quote, delivery and later switch are distinct observations. Capture exposure and new-Provider slices where permitted; do not equate nonselection with failure. Minimize retained private text.
- **Acceptance:** join identities/revisions are explicit; missing labels remain unknown; deleted data is not silently republished in evaluation; no cross-account preference leak. Any retention/storage addition requires a specific reviewed contract.
- **Verify:** missing outcomes, repeated events, refunds/remedies, stale versions and account isolation.

### JI-09b — repeat-allocation experiment (M, data-dependent)

- **Files:** existing evaluation programme/runner and metric tests; registry ranking policy only if promotion evidence supports a concrete change.
- **Change:** evaluate reusable semantic dimensions and observed outcomes against the current baseline using time-separated holdout and Provider slices. Reuse SDK judgments and deterministic policy; no automatic training service.
- **Acceptance:** predeclared minimum detectable benefit/sample requirement, no leakage, new-Provider slice and exposure-bias analysis, measured total cost/latency. Insufficient data leaves DATA_REQUIRED; a negative test closes the experiment as REJECTED and retains baseline.
- **Verify:** offline metric tests and reproducible held-out report. M3 closes only with a recorded disposition and implementation/rollback evidence if a policy is promoted.

## 7. Test plan, failure modes and acceptance gates

Existing tests below were read, not freshly run for this planning-only task. A test title is not a hosted-proof receipt. No new implementation test pass is claimed.

```text
request validation [existing strict schemas]
  -> browse/disabled/0-1 item -> preserve result [existing ranking tests]
  -> retrieval unavailable -> source unavailable [existing ranking tests]
  -> bounded evidence -> SDK
       -> key absent / timeout / offline -> source order [existing tests]
       -> caller cancel / slow body / 429 -> source order [JI-02a GAP]
       -> partial/invalid answer -> source order [existing, extend JI-03a]
       -> valid -> assessed + unassessed tail [JI-03a GAP]
  -> HTTP / chat / MCP / installed CLI parity [JI-04a integration/E2E GAP]
  -> compare / no-fit / clarify / stale Quote [JI-04b E2E GAP]
  -> Call -> contract output -> adjudication -> recovery/settlement [JI-06 GAP]

Provider source -> versioned suggestions [JI-05a unit GAP]
  -> review/edit/reject -> save -> publish -> buyer discovery [JI-05b E2E GAP]
  -> source changed / owner revoked / duplicate save [JI-05b integration GAP]

retained need -> eligible supply -> match [JI-08a GAP]
  -> delayed duplicate completion -> atomic dedup/recheck [JI-08b GAP]
outcomes -> held-out repeat policy -> keep/reject/promote [JI-09 EVAL GAP]
```

| Failure / condition | Existing evidence and gap | Required observable behaviour / owner |
| --- | --- | --- |
| Slow headers/body, retry amplification, caller disconnect | Directory suite covers abort/no-retry; canonical lifecycle still needs direct SDK cases | Attempt cancelled/bounded; no cascade; original page survives — JI-02a |
| Missing/wrong-type/NaN/out-of-range answers | Both ranking suites have invalid/incomplete cases | Complete validation before ordering; no partial false confidence — JI-03a |
| Suitable Tool missing from page | Ranking-only metrics cannot detect it | Separate recall label and remedy experiment — JI-03b |
| All candidates unsuitable / tail unassessed | Directory all-zero test; canonical tail test currently expects score zero | Explicit scoped no-fit/unknown semantics; no false certainty — JI-03a/04b |
| Model output varies across surfaces or is called twice | HTTP tests mock retrieval/model; no complete real-client parity proof | Frozen-model parity + call count, then hosted proof — JI-04a/07b |
| Stale draft, wrong owner, duplicate publish | Existing supply tests reusable; semantic suggestion path absent | Conflict or idempotent result with no unauthorized publication — JI-05 |
| Empty valid output or benign “error” text becomes failed delivery | Direct adjudication tests cover only narrow cases | Contract-grounded classification and correct financial outcome — JI-06; critical release gap |
| Sensitive output enters inference | Current adjudicator passes parsed payload | Explicit evidence projection/disclosure rules, redaction tests — JI-06; critical release gap |
| Delayed matching after withdrawal/deletion | New background integration not implemented | Atomic freshness/owner recheck and dedup — JI-08b |
| Missing usage reported as known cost | Adapter contains fallback counts and fixed AUD estimate | Unknown distinct from observed; versioned estimate if needed — JI-02b |

### Commands and test levels

Use Node 22/npm 11.5.1. Run the narrow relevant behavior tests and checks for the changed dependency cone. Use `npm run lint` and `npm run typecheck` for affected code, and `npm run deps:check` for import/module changes or the required landing gate. Documentation-only changes need link/index/diff checks, not application tests. Run heavy checks sequentially; do not repeat a passing unchanged check to regenerate a receipt. Example discovery set:

```sh
npm exec vitest run tests/unit/registry/tool-reranker.test.ts tests/unit/market/x402-directory-reranker.test.ts tests/unit/decision-engine/decision-gateway.test.ts tests/unit/registry/registry-tools-search-rerank.test.ts tests/integration/registry-tools-search-rerank.test.ts
```

For contract/RPC changes include module-boundary, surface-conformance, Convex API-kind/string-reference checks and normal codegen validation. Do not loosen snapshots/ratchets merely to pass. For UI use the existing Playwright and a11y setup, including authenticated paths where relevant. Use `npm run gate` and CI before landing release work; targeted tests are not the release gate. Existing Vitest global setup builds the CLI, so ordinary test execution may create ignored build output; track and clean only owned artifacts.

| Gate | Required evidence | Pass rule |
| --- | --- | --- |
| G0 — contract and structure | Types, lint, dependency/RPC checks and file-boundary review | No new cycle, API-kind drift, undeclared surface, type hole or size-rule escape; side effects retain their transactions |
| G1 — deterministic correctness | Unit/integration matrix above | Every specified invariant/failure path passes; zero invented candidate/authority/purchase; no unhandled critical gap |
| G2 — matching evaluation | Frozen independently reviewed labels; original retrieval control; source/model/code versions | Recall and ranking measured separately; predefined paired improvement criterion; no concealed regression on hard constraints/no-fit; no holdout retuning |
| G3 — journey usefulness | Paired complete buyer/Provider scenarios; errors, turns, successful preparation and outcomes | Demonstrated benefit in the target journey, not just model accuracy; additive hints remain off unless independently justified |
| G4 — operational budget | All attempts incl. failures; request latency, call count, usage/cost provenance | One interactive attempt; inference bounded by 1,500 ms and caller deadline; no fabricated cost; agreed total journey budget met |
| G5 — hosted alpha acceptance | Exact deployed identities, real clients, transactions and rollback receipts | Existing LP/AM requirements and JI-07b scenarios pass; deployed source matches evidence; rollback demonstrated |

**Evaluation design:** use the existing eight-query ranking trial and paired agent-loop trial as regression evidence, not unseen validation. Start a new labelled corpus with 120 buyer cases across six slices (vocabulary mismatch, hard constraints, ambiguity, no suitable supply, misleading descriptions, sparse evidence) and 40 Provider cases. These are planning sizes, not statistical power claims. Freeze the primary metric, minimum worthwhile effect and paired uncertainty calculation before inference in D03; increase sample size if the result is inconclusive. Batch through the existing runner's limits rather than silently widening its schema. Count repeated runs as repeats, not independent users.

**Existing evidence:** the [Bazaar report](../../output/jev-bazaar-eval-2026-09-20/REPORT.md) improved first-fit on two of eight queries, with assistant-authored labels and no purchase. The [agent-loop report](../../output/jev-agent-loop-2026-09-20/REPORT.md) did not demonstrate benefit from an added hint and increased cost. These local output links may not exist in a clean clone; JI-01/07a must establish a durable permitted evidence reference before relying on them for acceptance. Never stage `output/`.

## 8. Execution, ownership and uncertainty control

**Working protocol:** apply [i-have-adhd](/Users/joelchan/.codex/skills/i-have-adhd/SKILL.md) and [forward-implementation-first](/Users/joelchan/.codex/skills/forward-implementation-first/SKILL.md) throughout execution and reporting. The ADHD communication rules persist until Joel says “stop adhd mode” or “normal mode”. Use this register; do not add a dashboard, lock service or second task system.

### Forward execution loop

1. **Select one concrete result.** Classify the next action as semantic implementation, focused validation or administrative bookkeeping. Prefer implementation/validation. Skip bookkeeping unless requested or part of the product; this requested register update is such an exception, not a standing license for paperwork. Establish the correct input/revision and file ownership before editing.
2. **Build the producer and consumer.** State Requires / Ensures / Invariant / On violation for the affected consequential boundary. Implement the smallest usable path using existing modules and SDKs. A spec resolves a real contract ambiguity; its filename or approval marker is not the dependency.
3. **Validate the changed behavior.** Run the smallest affected dependency cone and inspect expected versus actual output. Where relevant check schema, exact accepted/rejected/unknown counts, candidate identity conservation, first/middle/last samples, joins, flag meaning, nontruncation, latency and peak memory. Exercising a path without checking its consequence is insufficient.
4. **Advance on substantive evidence.** Once focused validation and required repository/release checks pass, deliver through the authorized branch/PR or deployment path. Do not invent another review cycle. Preserve financial authority, security, transaction integrity, protected-main CI and deployment controls. Only one heavy process runs at a time; the execution owner owns heavy checks, publication, acceptance and conclusions.
5. **Leave one next action.** Record the behavior now working, evidence and literal blocker, if any, in the existing assignment. Refresh requested progress metadata briefly after the result; do not let it delay independent work. Continue the next authorized dependency without waiting for unrelated lanes or asking Joel to repeat authorization.

### What can and cannot stop progress

- **Substantive dependencies:** correct target/input revision, unresolved contract meaning, actual producer output, owner/file conflict, failed invariant, required access/authority or insufficient evaluation evidence can block the affected action. JI-01's source/ownership check is substantive; completing its documentary cross-links is not a prerequisite for JI-02a/03a/03b/06. A WAITING label with satisfied real dependencies is stale metadata, not a blocker.
- **No administrative gates:** never create/wait on filesystem locks; never generate, repair, compare or propagate administrative hashes. Missing/stale receipts, certification markers, dashboard rows, task-index rows or file-presence records do not invalidate valid output, move the cursor backward or grant correctness credit. Product signatures/checksums and input/revision identity remain substantive where their contracts require them.
- **Replay only for a real change:** input meaning or the relevant target/pinned revision changed; output is malformed, truncated, inconsistent, nonconserving or consumer-incompatible; a run disproves the result; or a changed producer affects its dependency cone. A concurrent unrelated commit warrants relevance inspection, not a whole-programme restart. Fix the demonstrated defect before rerunning that cone.
- **Manual execution:** if an orchestrator blocks solely on administrative metadata, run the exact authorized stage manually, validate its output, publish it atomically where appropriate, continue forward and remove/downgrade the administrative-only dependency within authorized scope. This does not bypass real authorization, integrity checks, release gates or shared-file ownership.
- **Evidence versus receipt:** retain command, input/revision, expected result, observed result and material limitations with the existing assignment or durable evidence source. Missing evidence blocks only the claim it would support, not unrelated valid work. An absent report path is not a reason to rerun an unchanged experiment when its substantive result is available elsewhere.

### Communication and working-set discipline

Lead each update with the next action or working result. Restate the current assignment and source-versus-hosted state each turn. Number multi-step instructions; expose at most five items per group while retaining the full backlog. Give concrete duration ranges and assumptions for the executor, revise when evidence changes, and never substitute elapsed time for acceptance. State errors as cause, failed guarantee and next diagnostic action. Suppress tangents and avoid preambles/recaps. End unfinished work with one action Joel can take in under two minutes only when his input is actually needed; otherwise name the agent's next action and continue authorized work.

Use this compact shape when reporting progress, without creating a new artifact:

```text
Now: <assignment — next concrete action; estimated duration and assumption>
Works: <observable behavior and the check that establishes it>
State: <source / hosted / unverified, plus the one active root task>
Blocked: <literal cause and affected action, or none established>
Next: <one bounded action; name the owner>
```

**Next bounded assignment:** JI-01's source/ownership check, then JI-02a when its substantive prerequisites are met. JI-03b can perform read-only fixture planning independently. Code work waits for actual required inputs/decisions and ownership, not for documentary completion.

**Lane A:** JI-02a -> 02b -> 04a, with JI-03a serialized where shared contract files overlap. **Lane B:** JI-03b, then JI-05a -> 05b after common contracts settle. **Lane C:** JI-06, coordinated with existing call-worker/AM-24/25 work. Integration/evaluation/release follow all required lanes. This is an execution recommendation, not authorization to start agents in this side conversation. Here the work is serial and no subagents are allowed. Elsewhere, only an explicitly authorized pool may run up to its allowed size, capped at two active implementation tasks under this register; refill independent light lanes without waiting for a wave. Do not manufacture work or launch concurrent heavy processes. Consume each completed result with local verification when its dependency is reached.

Start any implementation checkout from current unified main with the accepted predecessor commits. One branch/PR per bounded slice, following repository branch rules; no direct push to main. Never copy another checkout's manifest wholesale. Shared registries, SDK contracts, generated Convex API and snapshots have one integration owner. Claim files before editing; preserve unrelated dirty work. If CQ3 or AM work moves a path, rebase and update this record rather than recreating the old module.

Keep substantive evidence in the existing task: `ID; engineer/owned files; actual branch and relevant input revision; boundary contract; command/input/expected/actual result; violated guarantee if any; source versus hosted limits; rollback when applicable; next action`. Do not require an exact receipt format, hash or completed template to execute. Source acceptance and hosted acceptance remain separate claims; neither advances on a test count or artifact presence alone.

| Decision / uncertainty | Recommended direction | Decisive evidence / owner | Blocks |
| --- | --- | --- | --- |
| D01 — public assessment metadata | Internal result first; smallest compatible public projection with unassessed/unknown semantics | Exact versioned DTO and strict-reader compatibility review — registry owner | JI-03a implementation of public changes |
| D02 — adjudication consequences | Contract-defined failure versus semantic suspicion; explicit existing recovery policy; no arbitrary new threshold | Contract examples, failure-cost assessment and worker/ledger tests — execution/product owner | JI-06 consequence changes and M1 release |
| D03 — benefit and cost acceptance | Predeclare paired improvement and allowable latency/cost; do not infer universal thresholds from tiny trials | Label set, baseline, minimum useful effect, experiment spend ceiling — evaluation/product owner | Paid holdout evaluation/promotion |
| D04 — Provider suggestion persistence | Reuse current draft schema if sufficient; otherwise a bounded additive migration with revision checks | Concrete field/retention/migration proposal — supply owner | JI-05a persistence changes |
| D05 — exact hosted targets and spend | Reuse LP-3/LP-4 manifest/exposure controls, not a new budget here | Existing release package and authenticated preflight — release owner | JI-07b only |
| D06 — repeat-learning evidence | Read existing outcomes first; persist only missing, justified facts | Data sufficiency, consent/retention and exposure-bias review — outcome owner | JI-09 persistence/promotion |

Routine code decisions within frozen scope belong to the engineer. These six decisions are not blanket reasons to stop other work. Resolve them in their owning assignments with a concrete proposal; do not silently mark them approved. After two unsuccessful targeted repair cycles on the same boundary, record the failing invariant and revisit the design seam. Do not cycle through unrelated patches or move a failing goalpost.

## 9. Release, rollback and completion

- Keep retrieval usable when optional inference is disabled. Define the actual purpose-specific deployment control in JI-02a/07b using existing configuration; do not invent a flag service. Verify its readback and rollback. Discovery and adjudication controls must not be conflated.
- Start with bounded hosted acceptance on exact targets. Preserve baseline/treatment identity and source/model/question versions. Record model aliases' resolved versions when available; changes require relevant evaluation before broad promotion.
- Roll back a ranking policy/configuration to retriever order without rolling back published facts or payment state. Provider suggestion rollback disables future suggestions; it does not silently undo reviewed publications. Never roll back money by replaying model decisions.
- Do not delete pre-merge backups, unrelated untracked research, credentials, environment files or other agents' artifacts. Remove only task-owned temporary outputs; preserve deliberate rollback records with owner/expiry.
- **M1 complete:** JI-01–07b accepted at required levels, D01–D05 resolved in evidence, actual buyer and Provider journeys pass, critical gaps closed, compatible installed clients verified, rollback demonstrated. Reflect the result in this requested register; a missing status update does not invalidate independently established acceptance.
- **Programme complete:** M1–M3 have final evidence-backed dispositions, no required assignment silently deferred, and every remaining operational dependency has an explicit owner/status. A live model response, clean tree or green unit suite alone is not completion.

## GSTACK REVIEW REPORT

| Review | Runs | Status | Findings / disposition |
| --- | ---: | --- | --- |
| plan-eng-review — scope and architecture | 1 document review | Issues recorded | Reuse map and dependency graph; sixteen bounded assignments instead of one multi-module patch; public schema, revision, execution and delivery boundaries identified |
| plan-eng-review — code quality | 1 document review | Changes specified | SDK lifecycle reuse, domain-owned adapters, truthful assessment/usage, pure UI leaves, no new infrastructure; CQ3 ownership preserved |
| plan-eng-review — tests | 1 source review | Gaps assigned | Code/user-flow diagram and ten failure classes mapped to tests; direct adjudication versus helper coverage distinguished; no fresh runtime pass claimed |
| plan-eng-review — performance | 1 document review | Budget specified; D03 open | One interactive inference attempt, cancellation and body timeout, bounded state/candidates, no N+1 model calls, honest usage and no unproven cache |
| iceinvein design-review | 1 document review | Coherent scope; risks explicit | Thesis serves buyer and Provider journeys; major risks are missing retrieval evidence, inconsistent entry-point policy and uncertain delivery consequences; speculative services/additive hint cut |
| complexity-accountant / module-secret-auditor / contract-enforcer / simplicity-razor | 1 applied analysis | Recorded above | Concrete boundary costs/benefits, keep/remove decisions, module secrets and C1–C6 contracts |
| typesafe-ai | 1 source-grounded pass | Research applied | Official primitives/SDK/cookbooks checked against installed 0.6.0; no custom model transport, generator or search stack |
| i-have-adhd / forward-implementation-first | 1 protocol amendment | Applied to plan and execution rules | Small visible working set, concrete next action/estimates, semantic JI-01 dependency, focused validation, no administrative rewind/gates, serial heavy execution; no implementation acceptance claimed |
| Independent outside voice | 0 | Not run | Side-conversation restrictions prohibit subagents; no independent-review approval is claimed |

**Method and limits:** this is the requested local register/design artifact, not a completed interactive gstack approval ceremony. The plan-eng architecture, code-quality, test, performance and scope analyses were performed on the concrete proposal. Its global telemetry/brain writes, extra task systems, repeated approval interview and outside-agent steps were not run; changes stay local to the requested register and task index. The skill references a missing `sections/review-sections.md`; the installed SKILL.md contains the four review sections and those were read directly. No production code, deployment, model call or financial transaction was executed for this artifact.

**VERDICT:** Work is scoped and reviewable. This does not certify implementation or release. READY assignments can be claimed within existing authorization; concrete API/schema/consequence changes retain the decisions below.

**UNRESOLVED DECISIONS:**
- D01: exact public assessment compatibility.
- D02: adjudication consequence policy and evidence boundary.
- D03: frozen benefit/non-regression thresholds and live experiment spend ceiling.
- D04: exact Provider suggestion persistence, if required.
- D05: current hosted targets/access/exposure evidence from the existing launch package.
- D06: sufficient, permitted repeat-outcome evidence and any required retention change.
