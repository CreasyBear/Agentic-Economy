# Rationalised Module and Package Architecture

**Review date:** 2026-08-25  
**Checkout:** detached `8c38b57b2`  
**Depth:** tree 4, orchestrated review  
**Task boundary:** architecture and migration plan only. No production refactor is implemented by this review.

## Authority and evidence policy

The current checkout, current tests, recent Git history, `PRODUCT.md`, and `research/WHOP-AE-MATURITY.md` are authoritative. The private gstack design file found during preflight is excluded because the founder explicitly requested a fresh reconstruction from current source. Git history is evidence of migration pressure, not permission to restore old product concepts.

Historical capability-request systems, Orders, Customer Requests, WorkTrees, a general Agent Engine, answer/harness ownership, and entity-consolidation plans are not inputs. Existing identifiers with those names are migration residue unless current behavior proves otherwise.

The source evidence is recorded in:

- `research/architecture/current-module-boundaries.md`
- `research/architecture/package-distribution.md`
- `research/architecture/test-performance.md`
- `research/architecture/outside-voice.md`

## Engineering verdict

Keep Agentic Economy as one deployable modular monolith. Make its internal seams enforceable before moving files. Package only the CLI because it is the sole current artifact with an independent external consumer and release lifecycle.

The refactor is justified before launch because three defects raise customer-support risk now:

1. sixteen of twenty-two source modules participate in one import cycle, so folder names do not provide real change isolation;
2. discovery and call admission reconstruct different representations of the same current Operation, creating truth and performance risk;
3. a clean checkout can pass `npm pack packages/cli` while producing a tarball with no executable.

This is a debt-repayment cycle, not a product expansion. The product remains the Operation market and controlled Call journey.

## Step 0: Scope challenge

The complete repository-wide move would touch hundreds of files and mix behavioral search changes with structural import changes. That is too risky as one launch branch.

The accepted scope is:

- define and enforce the target dependency graph;
- add the missing golden-journey, projection-parity, package, and performance baselines first;
- move one ownership edge at a time while preserving routes, action IDs, wire schemas, stable references, refusal codes, receipts, and payment semantics;
- introduce one materialized current-Operation read model behind shadow digest comparison and a read-path rollback switch;
- make the CLI package build, test, pack, and publish from the same clean artifact;
- quarantine compatibility names and adapters without deleting live wire behavior.

The rejected scope is a big-bang rename, package-per-domain conversion, or full Convex file-tree move.

## Current source diagnosis

### Verified findings

The fresh inventory traversed every TypeScript source under `src/modules`: twenty-two top-level modules and 357 files. Sixteen modules form one strongly connected component. The largest module, `capability-supply`, owns 122 files and mixes supplier publication, exact Operation projection, search, readiness, transport, provider connection, qualification, and evidence.

The current import guard has a useful but narrow rule:

```ts
// src/lib/ui/contract-scans.ts:87-94
message:
  "Routes and sibling modules must use module public seams, not internal files.",
pattern:
  /from\s+['"][^'"]*(?:@\/|~\/|src\/)?modules\/[^'"]+\/internal\/[^'"]+['"]/,
```

It blocks literal `/internal/` imports, but top-level implementation imports still bypass intended public seams. For example:

```ts
// src/modules/capability-execution/operation-invoke.ts:14-22
import type { ActionInvocationView, InvocationActor }
  from '@/modules/action-invocation/contracts'
import type { DynamicPublishedInvocationResult }
  from '@/modules/action-invocation/dynamic-published-contract'
import { createInvocationApplication }
  from '@/modules/action-invocation/application-service'
```

The current Operation search path reads every current publication up to its cap, reconstructs records, and silently drops invalid records:

```ts
// convex/capabilitySupplyOperationQueries.ts:343-352
const publications = networkId === undefined
  ? await ctx.db.query('capabilityPublications')
    .withIndex('by_disposition_and_readinessValidUntil', (query) => query.eq('disposition', 'current'))
    .take(limit)
  : await ctx.db.query('capabilityPublications')
    .withIndex('by_networkId_and_disposition', (query) => query.eq('networkId', networkId).eq('disposition', 'current'))
    .take(limit)
const records = await Promise.all(publications.map((publication) => operationRecord(ctx, publication, now)))
return { operations: records.flatMap((record) => record === undefined ? [] : [record]), ... }
```

`operationRecord` returns `undefined` for identity drift, missing joins, invalid transport, malformed price breakdown, or unpublished supply (`convex/capabilitySupplyOperationShared.ts:51-117`). Those cases are indistinguishable from a legitimate empty market to the caller.

Call admission separately loads and parses a pinned snapshot:

```ts
// convex/capabilityOperationInvokeActions.ts:185-208
const readCurrentOperation = async (): Promise<CurrentOperationState> => {
  if (currentOperationState !== undefined) return currentOperationState
  snapshot = await ctx.runQuery(
    internal.capabilitySupplyOperations.readCurrentPublishedOperationSnapshot,
    { operationRef: args.operationRef },
  )
  ...
  const operation = parsePublishedOperationSnapshot(snapshot.operationJson)
  materializeRuntimePublishedOperation(operation)
  currentOperationState = { kind: 'valid', operation, operationJson: snapshot.operationJson }
  return currentOperationState
}
```

The transaction kernel is stronger than these outer seams. The focused golden-journey review passed 53 of 53 tests across seven files. Current tests already cover action-surface parity, Operation ranking and wire safety, keyless publication and execution, durable Workpool behavior, receipt projection, and scoped recovery.

### Common-sense pressure test

- Folder size alone is not a package boundary. No domain module has an independent release lifecycle or in-process external consumer.
- A new abstract Operation Engine, Agent Engine, or generic marketplace framework would not solve the verified defects.
- Renaming all files would increase blast radius while leaving imports and ownership ambiguous.
- The search read model is the one justified behavioral refactor because current query fan-out and silent omission are concrete launch risks.
- Convex function paths can be public API identifiers. Keep their exported paths stable and extract logic behind them rather than moving every top-level file.
- Exact current terms must still be revalidated at commitment. A faster search projection must never become call authority.

## Golden journey ownership

| Golden-journey step | Accountable owner | Supporting modules | Boundary rule |
|---|---|---|---|
| Search, detail, compare, inspect-plan | `registry` public market read service | `capability-supply` current Operation read model, `market` external metadata only | Registry owns wire/API projection. Supply owns canonical current facts. External registry entries never become executable truth without admission. |
| Supplier publication and readiness | `capability-supply` | `business`, `catalog`, `capability-contract`, `network-guard`, `security` | Supply writes current Operation facts and readiness. It does not import execution routes or call lifecycle code. |
| Controlled call admission and orchestration | `capability-execution` | `agent-access`, `money`, `capability-supply`, `action-invocation` | Execution owns the customer-visible Call application service. It reads one exact current Operation snapshot and coordinates lower kernels. |
| Claim, fence, attempt, result identity, reconcile | `action-invocation` | `common`, `money` value contracts | This remains a narrow durable lifecycle kernel. It is not a product spine and does not own market, supplier, or harness behavior. |
| Identity, delegated scope, budget policy | `agent-access` | `capability-contract`, `money` value contracts | Access evaluates explicit neutral inputs. It does not reach into supply implementations. |
| Ledger, charge, settlement, refund, payout | `money` | `common`, `security` | Money owns economic state. Joined supplier/earnings views belong in adapters so money never imports supply UI or server DTOs. |
| Result, receipt, status, cancellation, recovery | `capability-execution` | `action-invocation`, `money` | Stable invocation identity and recovery semantics remain unchanged. |
| Allocation and operating evidence | `observability` plus `market` evidence adapters | market reads, invocation outcomes, money settlement | Evidence uses current Operation nouns and distinct demand/allocation identity. Idempotent replay is never counted as repeat demand. |
| Web, chat, HTTP, MCP, CLI, Convex | adapter layer | `actions` as machine-surface registry | Adapters compose domains and may join read models. Domain modules do not import adapters. |

## What already exists

- `capability-contract` and `capability-contract-registry` already provide a neutral, exact, versioned contract kernel. Reuse them.
- `actions/index.ts` already provides one explicit registry for machine-facing actions and surface parity. Keep it as the composition authority.
- `capability-supply` already distinguishes canonical Operations from external-registry metadata and has publication, readiness, and admission semantics. Split ownership inside the module; do not rebuild the domain.
- `capability-execution` and `action-invocation` already have idempotency, worker leases, fail-closed unknown states, receipt identity, cancellation, and reconciliation. Narrow their seam; do not replace the lifecycle.
- `money` already has exact amounts, journal semantics, settlement, refund, dispute, and payout logic. Remove upward joins; do not redesign the ledger.
- Convex already uses many `internalQuery`, `internalMutation`, and `internalAction` functions. Continue that direction and audit the remaining public exports.
- The import/conformance suite already tests private imports, machine-surface parity, invocation host rules, and product independence. Replace scattered path regexes with one explicit module-surface manifest while keeping focused behavioral tests.
- The CLI already has an external binary manifest and installed-package smoke. Make its package lifecycle truthful; do not create a second client product.
- The hosted gateway smoke and exact-revision validator already exist. Make their receipt a release requirement rather than writing new smoke machinery.

## Target module architecture

### Ownership contract

Keep the current top-level modules. Change their authority and permitted seams:

| Module | Owns | Must not own | Supported entry surfaces after migration |
|---|---|---|---|
| `common` | dependency-free IDs, canonical digest, stable hash, JSON/text helpers | action services, access principals, supply services, execution services | named primitive files only; no product-module imports |
| `actions` | action contract, concrete service composition, action registry, route/MCP descriptors | domain state or persistence | `index.ts`, `contract.ts`, `strict-schema.ts` |
| `business` and `catalog` | supplier identity, offering state, compatibility domain projection | public wire DTO projection, SEO, discovery, registry orchestration | `public.ts`, `convex.ts`, narrow owner/server functions |
| `registry` | Operation market read application service, public wire DTOs, action IDs, stable paths, compatibility response projection | supplier write state, call lifecycle, external metadata authority | `public.ts`, `operation-entry.ts`, registered action/function seams |
| `market` | external-registry metadata, graduation probe, market/home/evidence views | canonical executable Operation truth | `public.ts`, `server.ts`, explicit external-registry and evidence seams |
| `capability-supply` | publication, qualification, readiness, exact current Operation facts, provider capability | execution navigation, call status, money UI joins | concern-specific public, server, Convex, action, and function seams declared in the boundary manifest |
| `capability-execution` | call/execute admission, application orchestration, worker dispatch, result/receipt/recovery | supplier publication, low-level durable primitives, general agent orchestration | one public application seam plus server/Convex/action/function adapters |
| `action-invocation` | durable claim/fence/attempt/result/reconcile kernel | development hosts in runtime exports, market/supplier behavior, Customer Request semantics | one small runtime lifecycle seam; development and compatibility exports isolated |
| `agent-access` | principal, key/OAuth grant, scopes, delegated budget/rate policy | supplier or execution implementations | `public.ts`, narrow server/function seams |
| `money` | amounts, journal, charge, settlement, refund, payout, reconciliation | supplier readbacks and UI composition | `public.ts` for values/read contracts, `server.ts` for provider work |
| `observability` | current Operation-market events, redaction, bounded evidence facts | retired shortlist/business-action funnel as current authority | `public.ts`, evidence read/write adapters |
| `security` and `network-guard` | admission/security policy and guarded network I/O | business/registry projection joins | `public.ts`, `server.ts`, explicit source-write seam |
| `discovery`, `seo`, `storefront`, `chat`, `model-gateway`, `dev` | adapter or support concerns named by each module | lower-layer domain authority | narrow public/support seams; no reverse imports from core domains |

### Allowed dependency direction

```text
Web / HTTP / MCP / Chat / CLI / Convex exported functions
                         |
                         v
              actions + adapter composition
                 /        |          \
                v         v           v
            registry   execution   supply commands
               |        /  |  \         |
               v       v   v   v        v
        current Operation  access money lifecycle kernel
          read model       |      |      |
               \___________|______|______/
                           v
         capability-contract + business + security
                           |
                           v
            dependency-free common + network guard

External registry metadata: market -> supply admission only
Evidence: application layers -> observability/evidence sink only
No arrow points from a lower layer back to an adapter or application layer.
```

Concrete cycle breaks:

1. Make the action contract dependency-neutral and let `actions` compose concrete access, supply, and execution services.
2. Remove `catalog -> registry`; registry owns wire projection over catalog domain output.
3. Remove `capability-supply -> capability-execution`; registry/actions inject call navigation while execution reads the supply seam.
4. Replace execution deep imports from action-invocation with one runtime lifecycle facade.
5. Remove `money -> capability-supply`; adapters join earnings and supplier facts.
6. Remove catalog imports of discovery/SEO projection and other presentation concerns; adapters compose them outward.
7. Convert agent-access and security calls that reach into higher domains into explicit input DTOs or adapter composition.

### Source surface contract

Create one machine-readable module-boundary manifest consumed by the import test. Each module lists:

- allowed entry files such as `public.ts`, `server.ts`, `convex.ts`, and named action/function seams;
- allowed lower-layer module dependencies;
- temporary exceptions with an owner and removal task;
- test-only white-box exceptions separately from runtime imports.

Use the TypeScript compiler API already installed to resolve imports. Fail on undeclared cross-module entry files, forbidden edges, and cycles in the target graph. Do not add a new architecture framework solely for this rule.

Package `exports` provide real encapsulation for npm consumers, while TypeScript project references can enforce project-level structure when multiple independently built projects exist. Node warns that introducing `exports` can be breaking if current entry points are omitted, so the CLI package must first document its one supported binary surface. See [Node package entry points](https://nodejs.org/api/packages.html) and [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references).

## Package policy

### Package extraction rule

Create a package only when at least one of these is true:

1. code is consumed outside the application checkout;
2. the artifact has an independent build, release, version, or compatibility lifecycle;
3. two real deployables require a hard build boundary that source-module checks cannot provide.

Size, team aspiration, or a domain noun is not enough. Do not create packages for Operation, supply, market, invocation, money, access, evidence, registry, or Convex today.

The root remains `private: true`. Add npm workspaces for `packages/cli` so the lockfile and lifecycle scripts know the package exists. npm workspaces are sufficient; do not add Turborepo, Nx, or a second package manager. npm documents that workspaces link nested packages and run package-scoped scripts from the root: [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/).

Do not create a shared protocol package yet. The current CLI is a binary consumer, not an in-process library consumer. Its bundled wire contracts remain application source until a real external JavaScript consumer accepts a separate compatibility lifecycle.

### CLI distribution

Current verified defects:

- `npm run test:imports` on a clean archive fails 28 of 29 because `packages/cli/dist/ae.js` is ignored and absent;
- after `npm run build:cli`, the same suite passes 29 of 29;
- direct clean `npm pack ./packages/cli --json --dry-run` exits successfully but includes only `README.md` and `package.json`, so the advertised `ae` binary is absent;
- the root `prepack` script does not belong to the nested CLI package.

Target lifecycle:

```text
npm ci
  -> source/conformance/codegen checks
  -> CLI package-owned prepack/build
  -> import and package contract tests
  -> pack one exact tarball
  -> install and test that same tarball in a clean temporary project
  -> build the web application
  -> publish that tested tarball only on a CLI release tag
```

Requirements:

- root `workspaces` lists `packages/cli` and the lockfile records it;
- `packages/cli/package.json` owns `build`, `prepack`, `test`, `files`, `bin`, engine, version, and publish access;
- the supported npm interface is binary-only. No library export is promised;
- `test:imports` either builds first or scans source only, while `test:cli-package` owns built-artifact assertions. No test may depend on an ignored artifact by accident;
- `npm pack` output must contain exactly the manifest, README, and executable bundle;
- the installed tarball test checks executable permission, shebang, `ae --help --json`, Node 20 and Node 22, blocked deep/library imports, and manifest/bin/version agreement;
- publish the tested tarball, not a newly packed directory;
- CLI SemVer and tags are independent from web deployment versions, even if both start at `0.1.0`.

## Auto-decisions

The user explicitly requested automode. These reversible decisions take the opinionated recommendation:

| Decision | Accepted direction | Rejected alternative |
|---|---|---|
| D1 | Keep one deployable modular monolith | Microservices or package-per-domain |
| D2 | Enforce a declared import DAG before moving files | Cosmetic folder moves first |
| D3 | Keep current product modules and narrow their ownership | Invent a replacement domain model |
| D4 | Materialize one current Operation read model with shadow digest comparison | Continue repeated joins or switch search authority without a shadow |
| D5 | `capability-execution` owns the Call application service; `action-invocation` is a narrow lifecycle kernel | Two public invocation authorities or a general invocation product spine |
| D6 | Registry owns public wire projection; catalog owns supplier/offering domain state | Catalog and registry projecting each other |
| D7 | Adapters own cross-domain joined views | Money, security, or common importing higher product modules |
| D8 | Make the CLI the only npm package and test the exact tarball | Add a speculative SDK/protocol package |
| D9 | Quarantine compatibility names and migrate observability to current nouns | Delete live compatibility blindly or let retired names regain authority |

## Architecture review

1. `[P1] (confidence: 10/10) src/modules/common/action.ts:3-8` - sixteen modules form one strongly connected component. `common/action.ts` imports security, execution, supply, access, and contract types, so a supposed lower layer is actually an integration layer. Decision D2/D7 breaks the graph incrementally.

2. `[P1] (confidence: 10/10) convex/capabilitySupplyOperationQueries.ts:337-370` - discovery rebuilds each current Operation across multiple joins and drops malformed records, while `convex/capabilityOperationInvokeActions.ts:185-208` independently parses the call snapshot. Decision D4 creates one digest-linked read model but preserves fresh commitment revalidation.

3. `[P1] (confidence: 9/10) src/modules/capability-execution/operation-invoke.ts:14-22` - execution reaches into several action-invocation implementation files because there is no narrow runtime facade. Decision D5 creates that facade without reviving the retired invocation architecture.

4. `[P1] (confidence: 10/10) packages/cli/package.json:6-11` - the published manifest promises `dist/ae.js`, but clean packing can omit it while succeeding. Decision D8 makes build and publication self-proving.

## Code quality review

5. `[P1] (confidence: 10/10) src/modules/common/action.ts:3-8` - high-level service aliases in `common` invert the architecture and hide composition. Make the contract structurally generic or move concrete composition to `actions`.

6. `[P1] (confidence: 9/10) src/lib/ui/contract-scans.ts:87-94` - the private-import rule detects only literal `/internal/` paths. Replace convention with the explicit surface/dependency manifest and retain focused behavioral boundary tests.

7. `[P2] (confidence: 9/10) src/modules/action-invocation/index.ts:44-56` - the broad runtime barrel still exports `CustomerRequestCanonicalClaimMaterial`. Compatibility aliases and development helpers must not appear on the new runtime lifecycle seam.

No existing task-specific ASCII diagram comments need updating because this review changes no production code. During implementation, put a small dependency diagram beside the boundary manifest and a read-model/call-authority diagram beside the shadow projection coordinator. Do not scatter diagrams across simple files.

## Test review

### Test framework and commands

Vitest 4.1.9 covers unit, Convex, integration, import, type, and contract tests. Playwright covers browser and paid-operation development flows. `convex-test` supplies the in-memory durable backend. The source release gate combines conformance, chat, codegen, lint, typecheck, unit, integration, import, browser, package, and build checks.

Parent verification reran the focused suite and passed 53 of 53 tests in seven files on 2026-08-25.

### Test coverage diagram

```text
CODE PATHS                                            USER FLOWS
[+] Machine surface contracts                        [+] Discover and acquire
  ├── [★★★ TESTED] action/path/schema parity            ├── [★★ TESTED] CLI cold loop, fetch-mocked
  ├── [GAP] explicit module surface DAG                 ├── [★★★ TESTED] real Convex keyless call
  └── [★★ TESTED] pure search/detail coherence          └── [GAP] real backend search -> paid call -> receipt

[+] Current Operation truth                          [+] Commitment and recovery
  ├── [GAP] shadowed current read model                 ├── [GAP] terms change after inspect -> refusal
  ├── [GAP] projection-drop diagnostics                 ├── [★★★ TESTED] scoped cancel/reconcile/status
  └── [★★★ TESTED] keyless current snapshot             └── [GAP] distinct later gap and allocation

[+] Call and receipt                                 [+] Distribution
  ├── [★★★ TESTED] idempotent reservation/replay        ├── [GAP] clean exact CLI tarball install
  ├── [★★★ TESTED] strict result/receipt projection     └── [GAP] exact-revision hosted receipt
  └── [GAP] search query/performance baseline

COVERAGE: 8/17 behavior paths have direct current evidence
QUALITY: ★★★ 6 | ★★ 2 | GAPS 9
```

Legend: ★★★ behavior plus edge/error coverage | ★★ useful but mocked or pure-only evidence | `[GAP]` required before the affected cutover.

### Migration test requirements

1. Boundary manifest fixture proves allowed public/server/Convex/action seams and rejects undeclared deep imports, reverse edges, and cycles.
2. Seed two current suppliers in Convex and assert search, detail, compare, inspect-plan, and the pinned invocation snapshot share Operation ref, revision, price digest, readiness window, effects, and call path.
3. Corrupt each required current Operation join/config and assert an explicit bounded diagnostic plus fail-closed omission.
4. Mutate price/readiness/effects between inspect-plan and call. Assert refusal or reinspection, never execution on stale terms.
5. Keep reservation replay, crash/restart, worker lease, duplicate-effect, charge, receipt, refund, and reconciliation tests mandatory for every execution/lifecycle seam move.
6. Run the packaged CLI or MCP client against a served application and real test backend through search, compare/detail, inspect-plan, call, status/result/receipt, and same-call replay.
7. Exercise a second distinct gap/search/allocation identity separately from idempotent replay. This proves evidence plumbing, not market demand, and is a product-evidence track rather than a blocker for the module-boundary or read-model cutover.
8. Require the validated hosted receipt for the deployed revision after source release passes.

## Performance review

8. `[P1] (confidence: 10/10) convex/capabilitySupplyOperationQueries.ts:343-352` - search performs bounded N+1-style fan-out across up to 256 current publications, then reconstructs and scores full descriptors before returning at most twenty. Qualification repeats several joins. Growth currently ends in `source_capacity_exceeded` rather than a scalable indexed read.

Accepted response:

- baseline database reads, source rows, serialized bytes, heap high-water, and wall time at one, twenty, and 256 current Operations;
- materialize immutable contract/commercial/transport facts on publication revision and update readiness fields on probe changes;
- pre-tokenize the search projection and hydrate full descriptors only for the selected page/detail;
- shadow old and new projections, compare canonical digests and typed outcomes, and expose bounded mismatch/drop counters;
- switch reads behind a rollback flag only after unexplained mismatches are zero on representative data;
- keep compare/inspect exact-current and make call revalidate authority, readiness, price, effects, and the pinned digest;
- never dual-execute provider effects during the shadow period.

Convex recommends short public functions that call model helpers, and internal functions for server-only paths. Keep public function identifiers stable while extracting logic. See [Convex best practices](https://docs.convex.dev/understanding/best-practices) and [Convex internal functions](https://docs.convex.dev/functions/internal-functions).

Measure durable invocation row size and growth before choosing retention. Receipts, disputes, uncertain outcomes, and recovery evidence must not be deleted to solve an unmeasured storage concern.

## Failure modes

| Failure | Test | Handling | User-visible result | Cutover status |
|---|---|---|---|---|
| A viable current Operation is dropped by a malformed join/config | corrupt each cause in Convex integration fixtures | bounded diagnostic, fail closed | explicit unavailable/no-candidates plus operator evidence, never silent corruption | critical gap |
| Search/inspect and call disagree on price, effects, readiness, or revision | digest parity and mutation-between-inspect-and-call integration tests | refuse and request reinspection | clear stale-terms refusal | critical gap |
| Module move changes route, action ID, schema, or stable reference | surface conformance plus real consumer end-to-end | preserve adapter and compatibility facade | no observable change | covered once new end-to-end lands |
| Lifecycle seam loses idempotency or worker fencing | replay, crash/restart, duplicate-effect and charge tests | retain reservation and lease identity | same receipt/result, no duplicate effect | existing strong coverage, mandatory regression gate |
| Worker completes but public status loses result/receipt | durable terminal/refund/reconcile fixtures through public status | fail closed as incomplete or reconciliation-required | usable output or clear recovery state | critical integration gap |
| Clean CLI pack omits the binary | exact tarball allowlist and clean installed-package smoke | block publication | no broken package reaches npm | critical gap |
| Search passes locally but degrades at catalogue scale | one/twenty/256 benchmark plus 256/257 capacity cases | rollback read path and alert on capacity/drop counters | typed capacity refusal, not empty success | critical gap |
| Local suite passes but hosted money/receipt joins differ | exact-revision hosted gateway smoke and validator | roll back deployment, retain recovery | durable receipt or explicit uncertain state | release blocker |
| Compatibility alias is removed while a live client still uses it | route/schema fixtures and usage inventory | keep adapter or version removal | stable legacy response until deliberate version change | migration-gated |
| Same-call replay is counted as repeat demand | evidence integration test with distinct allocation identity | keep replay and demand facts separate | no user error; prevents false market claims | product-evidence gate |

## Migration sequence

### Wave 0: Baseline before structure

- Add the explicit module-surface/dependency manifest in audit-only mode and record current exceptions.
- Add projection-drop diagnostics, two-supplier real Convex discovery/inspect parity, public receipt/status fixtures, 256/257 capacity cases, and the real-backend external-consumer journey.
- Capture the one/twenty/256 performance and query-count baseline.
- Register `packages/cli` as the sole npm workspace, give it package-owned build and prepack scripts, make import checks artifact-independent, and add an exact-tarball installation test. Leave registry publication mechanics for Wave 5.

Exit: new tests expose current gaps without changing product behavior; from an artifact-free checkout the CLI builds before inspection and the exact packed tarball contains and runs its advertised binary.

### Wave 1: Dependency-neutral foundations

- Remove concrete product imports from `common/action.ts`.
- Make the action contract generic and let `actions` own concrete service composition.
- Move catalog-to-registry wire projection composition into registry adapters.
- Move joined money/supplier readbacks into route/server adapters.
- Remove presentation/discovery/SEO dependencies from catalog and other lower domains.

Exit: `common`, catalog, and money have no upward product imports; manifest exceptions shrink.

### Wave 2: One current Operation read model

- Define the schema and indexes for the canonical digest-linked current Operation projection inside `capability-supply`.
- Add an idempotent backfill and rebuild path for every current publication, plus stale/missing-row diagnostics that never masquerade as an empty market.
- Dual-write immutable facts on publication revision and readiness facts on probe updates while old reads remain authoritative.
- Make registry search/detail/compare/inspect consume this read model.
- Add old/new shadow reads, typed mismatch/drop evidence, per-row rebuild evidence, and a rollback switch that can ignore all projection rows without deleting them.
- Preserve action IDs, routes, wire schema versions, Operation refs, cursor invalidation, and no-store freshness.

Cutover evidence is explicit:

- compare all current staging rows plus fixtures covering keyless/authenticated/paid Operations, zero/fixed/quoted prices, every readiness state, corrupt joins, and controlled sets of one, twenty, and 256 Operations;
- observe at least one complete scheduled readiness refresh/probe cycle and a twenty-four-hour staging soak;
- permit zero unexplained digest or typed-outcome mismatches; any explained mismatch needs a named owner, documented compatibility reason, expiry, and regression fixture;
- bound search to an indexed projection read plus selected-result hydration; at twenty and 256 Operations, wall-time p95 may not regress by more than ten percent from Wave 0 and database query count must decrease;
- require one named release owner to record the cutover decision and evidence location.

Exit: the complete cutover dataset meets the mismatch, complexity, and performance thresholds; backfill, rebuild, and rollback have each been exercised.

### Wave 3: Call ownership seam

- Remove supply imports of execution route/navigation constants. Registry/actions inject navigation.
- Expose one small action-invocation runtime lifecycle facade for claim, fence, attempt, result identity, and reconcile.
- Make capability-execution the only public Call application owner.
- Keep keyless literal execution and authenticated durable invocation as explicit paths sharing the same current Operation identity.
- Isolate development helpers and compatibility aliases from runtime exports.

Exit: no supply-to-execution edge, no execution deep import into action-invocation implementation, and all invocation conformance tests pass.

### Wave 4: Remaining graph and compatibility cleanup

- Break remaining agent-access, security, discovery, observability, registry, catalog, and SEO reverse edges with explicit DTOs or adapter composition.
- Quarantine retained business/services and old project URL behavior behind compatibility adapters.
- Remove retired runtime exports only after usage and persistence migration evidence proves they are unused.
- Replace observability event names that imply retired product authority while preserving stored-event read compatibility where required.

Exit: the declared runtime module graph is acyclic and has no unexplained exceptions.

### Wave 5: CLI publication

- Preserve the Wave 0 tarball digest after the complete source release gate.
- Publish only that tested tarball on a CLI-specific tag with provenance.
- Run a post-publication install and `ae --help --json` smoke from the registry without repository access.

Exit: the registry artifact has the tested digest and the installed external consumer passes without access to repository internals.

### Wave 6: Integration and launch proof

- Run focused module suites after each wave and the full `npm run test:release:source` at integration.
- Deploy with the old Operation read path available as rollback.
- Run and validate the exact-revision hosted gateway receipt.
- Observe projection mismatches, search latency/capacity/drop outcomes, duplicate effects, receipt/status parity, and reconciliation-required rate.

Exit: source gate, package gate, shadow parity, controlled benchmark, real-backend consumer journey, and hosted exact-revision receipt all pass.

### Rollback and compatibility

- Structural import moves are one commit per edge and revert independently.
- The new Operation read model has a read-only shadow phase and a read-path feature switch. Never shadow provider execution.
- Keep old Convex exported function paths as thin adapters until all callers are migrated. Moving model helpers must not rename deployed API identifiers.
- Keep old adapters callable for one release where practical and run per-surface route/action parity canaries after every seam deployment.
- Make Convex schema changes additive and forward-compatible during the migration. Do not use a destructive down migration; a read-model rollback ignores or rebuilds projection rows.
- For every wave, record whether recovery is a flag flip, code redeploy, or data repair, and name the observable threshold that triggers it.
- Preserve database tables, stable refs, idempotency keys, wire schema versions, action IDs, refusal codes, receipts, and reconciliation state through the refactor.
- Keep compatibility DTOs and old URL parameters until a versioned removal is deliberately approved.
- Roll back on unexplained digest mismatch, elevated no-candidate/drop/capacity outcomes, search latency regression, receipt/status mismatch, duplicate effect, or unexplained reconciliation growth.

## Worktree parallelization strategy

| Step | Modules touched | Depends on |
|---|---|---|
| Baseline and boundary manifest | `tests/imports`, test helpers, release scripts | none |
| Neutral foundations | `common`, `actions`, `catalog`, `registry`, `money`, server adapters | baseline |
| Current Operation read model | `capability-supply`, `registry`, Convex Operation queries | neutral foundations |
| Call ownership seam | `capability-execution`, `action-invocation`, `agent-access`, `money`, Convex invocation hosts | neutral foundations and Operation identity contract |
| CLI workspace | `packages/cli`, `tools/ae`, root package/release scripts | baseline and stable external contracts |
| Compatibility/evidence cleanup | `observability`, `market`, `discovery`, `seo`, compatibility adapters | Operation and Call seams |
| Integration and hosted proof | release/e2e configuration and evidence | all lanes |

Parallel lanes after Wave 1 fixes the shared contracts:

- Lane A: current Operation read model, then registry cutover.
- Lane B: Call ownership seam, then lifecycle facade cleanup.
- Lane C: CLI workspace and exact tarball tests.

Lane A and Lane B both touch capability-supply interfaces, so fix the Operation identity/read contract before launching them and assign one integration owner to shared public seams. Lane C may proceed independently after external wire contracts are frozen. Compatibility/evidence cleanup waits for A and B. Final release integration is sequential.

## NOT in scope

- Product expansion beyond the current Operation market and Call journey. Architecture cleanup cannot prove a market wedge.
- Orders, capability requests, Customer Requests, WorkTrees, a general Agent Engine, workflow ownership, or project orchestration.
- Human, physical, negotiated, or asynchronous service machinery without current product evidence.
- Package-per-domain, microservices, Turborepo/Nx, a new package manager, or a public SDK/protocol package.
- Renaming every module or moving all Convex exported functions. Stable API paths matter more than tree symmetry.
- Replacing the mature capability-contract, invocation, money, receipt, reconciliation, or security kernels.
- New ranking or allocation algorithms. The read-model change preserves current ranking before product experiments.
- Time-only caching of price, readiness, effects, or authority.
- Deleting compatibility fields, stored events, receipts, uncertain outcomes, or audit evidence without usage and migration proof.
- Claiming repeat demand, useful outcomes, supplier density, or market success from technical replay and source tests.

## Implementation Tasks

Synthesized from this review's findings. Each task is build-actionable and ordered by dependency.

- [x] **T1 (P1, human: ~2 days / Codex: ~2h)** - Verification foundation - Land pre-refactor behavior and performance gates
  - Surfaced by: Test and performance review - real-backend consumer, projection-drop, parity, capacity, receipt, and query-count gaps.
  - Files: `tests/imports/`, `tests/integration/`, `tests/e2e/`, `convex/capabilitySupplyOperation*.ts`, release test helpers.
  - Verify: focused new fixtures pass, then `npm run test:imports && npm run test:integration`.

- [x] **T2 (P1, human: ~1 day / Codex: ~1h)** - CLI distribution - Make clean package build and publication self-proving
  - Surfaced by: Architecture finding 4 - clean pack succeeds without `dist/ae.js`; import tests depend on an ignored bundle.
  - Files: `package.json`, `package-lock.json`, `packages/cli/package.json`, `scripts/build-cli.mjs`, `scripts/test-cli-package.mjs`, CLI package tests.
  - Verify: clean archive `npm ci`, package-owned build, exact `npm pack`, temporary install, Node 20/22 help smoke, and `CLI_PACKAGE_PASS`.

- [x] **T3 (P1, human: ~2 days / Codex: ~2h)** - Module enforcement - Declare and enforce the runtime dependency DAG
  - Surfaced by: Architecture finding 1 and code quality findings 5-6 - sixteen-module cycle and path-name-only privacy.
  - Files: `src/lib/ui/contract-scans.ts`, `tests/imports/`, module boundary manifest, `src/modules/common/action.ts`, `src/modules/actions/`.
  - Verify: manifest test rejects undeclared entry files, reverse edges, and cycles; `npm run test:imports && npm run typecheck`.

- [ ] **T4 (P1, human: ~3 days / Codex: ~4h)** - Operation market - Materialize one canonical current Operation read model
  - Surfaced by: Architecture finding 2 and performance finding 8 - repeated joins, divergent discovery/call representations, silent omission.
  - Files: `src/modules/capability-supply/`, `src/modules/registry/`, `convex/capabilitySupplyOperation*.ts`, Operation market integration tests.
  - Verify: schema/index review, idempotent backfill and rebuild, stale/missing-row diagnostics, the complete cutover dataset and soak, zero unexplained digest/outcome mismatches, one/twenty/256 benchmark thresholds, 256/257 cases, and two-supplier search/detail/compare/inspect parity.

- [x] **T5 (P1, human: ~3 days / Codex: ~3h)** - Call lifecycle - Establish one public execution seam over a narrow lifecycle kernel
  - Surfaced by: Architecture finding 3 and code quality finding 7 - execution deep-imports lifecycle implementation and compatibility exports.
  - Files: `src/modules/capability-execution/`, `src/modules/action-invocation/`, `src/modules/capability-supply/`, `src/modules/actions/`, Convex invocation hosts.
  - Verify: no supply-to-execution edge, no execution deep imports, and `npm run test:conformance` plus recovery/receipt suites pass.

- [x] **T6 (P2, human: ~2 days / Codex: ~2h)** - Remaining module graph - Move projection and joined-read ownership to adapters
  - Surfaced by: Architecture finding 1 - catalog/registry, money/supply, access/supply, security/registry, discovery/catalog and presentation cycles.
  - Files: `src/modules/catalog/`, `registry/`, `money/`, `agent-access/`, `security/`, `discovery/`, `seo/`, route/server adapters.
  - Verify: target dependency graph is acyclic with no unexplained runtime exception; affected unit and route tests pass.

- [x] **T7 (P2, human: ~1 day / Codex: ~1h)** - Compatibility and evidence - Quarantine retired names and align events to current product truth
  - Surfaced by: Code quality finding 7 and product authority - compatibility identifiers must not recreate authority; repeat evidence must differ from replay.
  - Files: `src/modules/action-invocation/`, `observability/`, `market/`, compatibility adapters and migration tests.
  - Verify: operation-product legacy independence, stored compatibility read tests, and distinct demand/allocation evidence tests pass.

- [ ] **T8 (P1, human: ~1 day plus observation / Codex: ~1h plus observation)** - Integration and launch proof - Cut over with rollback and retain exact evidence
  - Surfaced by: Failure-mode review - local source proof is insufficient for hosted truth.
  - Files: release configuration, smoke receipt output, read-path switch, monitoring definitions.
  - Verify: `npm run test:release:source`, exact CLI tarball smoke, zero unexplained shadow mismatches, controlled benchmark, real-backend consumer journey, per-surface route/action parity canaries, exercised flag/redeploy/data-repair runbook, and validated `npm run test:release:live-gateway` receipt.

## Outside voice

The first requested local-model review could not run because that model was unavailable. A fresh read-only GPT-5.5 review then challenged the complete plan from current source and authority only.

### Adopted

- Move workspace registration, package-owned build/prepack, import-test ordering, and exact-tarball testing into Wave 0. Verified against the reproduced clean-pack defect. Wave 5 now contains publication mechanics only.
- Specify the read model's schema/index work, idempotent backfill and rebuild, dual-write triggers, stale/missing diagnostics, and non-destructive fallback. Verified as necessary to make D4 implementable.
- Replace “representative data” with a bounded dataset, full scheduled refresh cycle, twenty-four-hour soak, zero-unexplained-mismatch rule, objective query/latency thresholds, and a named cutover owner.
- Add operational rollback per surface: parity canaries, one-release adapters where practical, additive Convex schema changes, and explicit flag/redeploy/data-repair paths.
- Keep the second distinct gap/allocation test, but classify it as product evidence rather than an architecture-cutover dependency.

### Rejected

- Rejected package-per-domain, microservices, a general Operation/Agent Engine, Orders, Customer Requests, WorkTrees, and other retired product spines. None solves the verified module, projection, or CLI defects.
- Rejected dropping the second-gap evidence test entirely. It is cheap proof that analytics do not confuse idempotent replay with fresh demand; it simply does not block structural cutover.

## TODO disposition

Zero deferred TODO items were created. Every necessary architecture action is represented by T1-T8. A public SDK/protocol package remains explicitly out of scope until a real external in-process consumer creates an independent compatibility lifecycle; it is not hidden backlog debt.

## Status log

- 2026-08-24: fresh authority boundary fixed; stale private design memory excluded.
- 2026-08-24: task gates and leaf contracts written before evidence fan-out.
- 2026-08-25: module, package, and test/performance evidence leaves independently completed and parent checks rerun.
- 2026-08-25: target dependency contract, package policy, migration waves, test diagram, failure modes, and implementation tasks integrated.
- 2026-08-25: independent challenge contract fixed before fresh outside review.
- 2026-08-25: independent sequencing, read-model migration, cutover, and rollback corrections adopted; speculative product and package expansion rejected.
- 2026-08-25 implementation preflight: `npm run typecheck` fails on the unmodified `8c38b57b2` source at `src/routes/api.v1.registry.ts:46`; `/api/v1/registry` is absent from the generated route-tree type. T1/T2 do not own this file, so the master must resolve and reproduce the typecheck gate before T3 can exit.
- 2026-08-25 T2 integrated: `6370d9f81` and `124b4a808`; master reproduced the exact three-file tarball, Node 20.20.2/22.23.2 JSON-help contracts, blocked library/deep imports, `CLI_PACKAGE_PASS`, 29/29 import tests, and SHA-256 `109e14b023e883c72586825d8ba58d49766882dedd27d00dcb1a90158285c450`. Publication was not performed.
- 2026-08-25 T1 integration issue: a completed Workpool invocation reaches `api.capabilityOperationInvocations.readInvocationStatus`, but `convex/capabilityOperationInvokeActions.ts:398-403` forwards `invocationRef` through `...args` to `internal.capabilityOperationInvocations.admit`, whose validator at `convex/capabilityOperationInvocations.ts:542-548,591-595` does not accept that field. The master authorized a bounded T1 exception to pass only the existing admission fields in status/cancel/reconcile handlers and add the required regression fixture; public recovery contracts and validators remain unchanged.
- 2026-08-25 T1 recovery adapter issue: `src/lib/server/operation-invoke-api.ts:95-175` signs recovery admission commands containing `invocationRef` and reconciliation evidence, while the stable internal admission command excludes those recovery-only fields. The master authorized a bounded adapter/test exception to sign the exact existing neutral admission material; invocation identity remains bound through the unchanged operation key, idempotency key, principal, and public request.
- 2026-08-25 T1 integrated: `852df326c`, `e498dcc6e`, `730b6ccf0`, `0b81030d4`, `1c448e05b`, and `360d5d4e7`; master reproduced 17/17 Wave 0 fixtures, 2/2 durable Workpool/installed-CLI journeys, 5/5 recovery adapter tests, 29/29 imports, and 588/588 integration tests. The installed CLI crossed served search/detail/compare/inspect/call/status/receipt/replay routes into one Convex test backend with one provider effect. Controlled capacity accepted 256 and returned typed `source_capacity_exceeded` at 257. Master baselines for 1/20/256 rows were respectively 14/261/3329 database queries, 14/280/3584 documents, 15,765/317,080/4,076,780 bytes read, and p95 23.625/18.167/195.926 ms over ten samples; corresponding heap high-water marks were 129,090,920/141,131,888/196,529,712 bytes.
- 2026-08-25 integration typecheck: `2948adf76` regenerated the omitted `/api/v1/registry` route entry and closed the original preflight error. The resulting full typecheck then exposed five T1 test-only errors in `tests/integration/capability-operation-workpool.test.ts:286,665,806-809` (exact optional method/attempt fields and Convex transport generics). A bounded T1 integration-fix child owns only those compile errors before T3 begins.
- 2026-08-25 T1 integration typecheck closed: `035260773` fixed the fixture types without runtime or assertion changes; master reproduced `npm run typecheck`, the 2/2 served Workpool/CLI tests, and 588/588 integration tests.
- 2026-08-25 T3 integrated: `d8f39a867` and `912231b6e`; the installed TypeScript compiler API now enforces 22 declared modules, 98 acyclic target edges, named entry surfaces, 75 exact owned runtime exceptions assigned to T4-T7, 492 adapter/Convex consumer imports, and 62 test-only groups covering 142 exact importer/entry scopes. `common/action.ts` has no product-module imports; `actions` owns concrete context composition. The master reproduced 39/39 import tests, 49/49 focused boundary/action/surface tests, full typecheck, and the TypeScript standards gate. No external action was performed.
- 2026-08-25 shared Operation contract integrated: `0b6d53d81` freezes one capability-supply-owned, secret-free `current_operation_commitment:v1` and canonical pinned digest before the T4/T5 lanes. The neutral material builder covers zero/fixed/range/on-request prices and typed unavailable readiness; the strict PublishedOperation adapter preserves fixed-price Call authority and exact publication, contract, offering/binding, transport, provider-generation, price, effects, and readiness revalidation. The master reproduced 25/25 contract tests plus 17/17 Wave 0 tests, 39/39 imports, full typecheck, and the TypeScript standards gate. No Convex schema, public wire, route, action, deployment, or publication changed.
- 2026-08-25 T4 local implementation integrated: `5ac69490a`, `285653913`, `3fe62febb`, `972ad2a2c`, `52acd6924`, `a8cbc21ef`, `11089a79b`, `3a3179d3f`, and `b5225466d` add the additive current-Operation schema/index inventory, idempotent rebuild/backfill, publication/readiness dual writes, stale/missing diagnostics, paginated shadow parity, typed mismatch/drop evidence, and the non-destructive read rollback switch. The controlled one/twenty/256 sets used 3/22/22 database queries with p95 0.419/2.5305/9.9639 ms, accepted 256 and typed-refused 257, and produced zero unexplained local mismatches. Master reproduced the combined 76/76 focused tests, 39/39 import checks, 613/613 integration tests, typecheck, and lint after T5 integration. T4 remains open: all-current-staging-row comparison, a scheduled staging readiness cycle, the twenty-four-hour staging soak, and a named release-owner cutover record require the safely authorized T8 staging workflow.
- 2026-08-25 T5 integrated: `0d41bfe20`, `a402c12db`, `5082ec2d1`, and `d9543090c` make capability-execution the public Call owner and reduce action-invocation to the durable claim/fence/attempt/result/reconcile runtime. Shared adapter commits `8fa622997`, `42a5f1bc5`, and `5fe82b44d` inject supplied-quote preparation and Operation navigation, remove every T4/T5 supply/runtime cross-edge exception, preserve the literal keyless and authenticated durable paths, and fail closed on invalid stored Operation refs. Master reproduced 423/423 invocation conformance tests, 613/613 integration tests, 76/76 combined T4/T5 focused tests, 39/39 import checks, typecheck, and lint. The module manifest reports no supply-to-execution edge and no execution deep import into action-invocation implementation; the three remaining Convex schema composition exceptions are assigned to T6's adapter-surface cleanup. No external action was performed.
- 2026-08-25 T6 integrated: `6efc9c1e6`, `04459ac08`, `671accfcd`, `822cc595d`, `249db298c`, `ebb2363e6`, `1bcbf6e8f`, `c223813a7`, `39a7c3667`, `280cd0001`, `f8382c189`, `9f1ac748e`, `667d52502`, and `a699aa323` move joined reads and projections to server adapters, inject Operation identity and landing ports, centralize the bounded JSON guard, expose twelve deliberate schema-composition surfaces, and remove all 35 temporary runtime exceptions. The declared module graph is acyclic with zero undeclared entry surfaces and zero unexplained runtime exceptions. Master reproduced 39/39 import/architecture tests, 343 files and 2,507/2,507 unit tests, 94 files and 613/613 integration tests, the focused route/schema/UI suite, full typecheck, and zero-warning lint. Routes, action IDs, wire versions, Operation refs, refusal/payment/receipt/idempotency/recovery semantics, and stable Convex paths were unchanged; no external action was performed.
- 2026-08-25 T7 integrated: `ecb181930`, `8505efe96`, `df9445a54`, `1ea2c1db8`, `5f3ce603d`, `ad45ee354`, and `431bc6680` quarantine the retired canonical-claim alias, separate current observability writes from stored journey/business-action/audit compatibility, and isolate the old `project` query as an ignored shared-URL adapter. Bounded allocation evidence now validates a branded current Operation ref and requires the same pseudonymous evidence subject plus distinct gap/search/allocation/Call identities: replay or any reused identity yields one fact and zero repeat demand, a second fully distinct tuple yields two facts and one repeat-demand evidence count, unrelated subjects yield zero repeat demand, and malformed refs fail closed. Master reproduced 27/27 focused compatibility/evidence tests, 40/40 import/architecture tests, 613/613 integration tests, full typecheck, and zero-warning lint. Stored `request_owned`, `customer_request_mandate_use`, audit/private-evidence values, and old project URL reads remain compatible; no external action was performed.
- 2026-08-25 T7 release-integration correction: the full source chain exposed two `unknown-double-cast` violations in the new observability literal filtering. `eef32aab9` replaces them with a private typed non-empty guard without changing current/stored values, tuple exports, or compatibility behavior. Master reproduced the TypeScript standards gate at 1/1 and the focused observability/type suite at 11/11; the disjoint child worktree remained clean.
- 2026-08-25 T8 local rollback and release proof integrated: `1fbfc94cc` adds per-wave flag/redeploy/data-repair recovery mappings, observable rollback triggers, route/action/Convex-path parity canaries, and an exercised old → shadow → new → old current-Operation control that preserves projection rows and idempotently repairs them without provider dual execution. `0c8ea6caf` and `8b4901b40` add an anonymous, temporary-copy Convex source-generation proof with explicit no-cloud mode, isolated non-secret auth configuration, byte-for-byte generated-file comparison, and process/path cleanup postconditions. Master reproduced 44/44 architecture/release tests, 613/613 integration tests, 40/40 import checks with zero runtime exceptions, typecheck, and zero-warning lint. Fresh controlled projection evidence remained far below the frozen thresholds: twenty rows used 22 queries at 2.542208 ms p95 and 256 rows used 22 queries at 9.369417 ms p95; the 256/257 capacity and zero-unexplained-mismatch assertions passed. No hosted action was performed.
- 2026-08-25 T8 source-generation corrections integrated: `973529b35` narrows two Convex isolate entry dependency chains to existing runtime-neutral contract surfaces, and `46ba43781` refreshes the generated declarations for the already-existing current-Operation projection module. The anonymous proof regenerated and matched all seven controlled Convex source files, left no backend, environment file, temporary tree, or process behind, and master reproduced 56/56 focused tests, 40/40 import checks, 613/613 integration tests, typecheck, and zero-warning lint. Stable public paths, action IDs, wire contracts, Operation refs, and execution/payment/receipt semantics were unchanged.
- 2026-08-25 T8 full local source gate: `npm run test:release:source` exited zero from the integrated master revision after the final release-tool correction. The chain passed the deployment manifest, 423/423 invocation conformance tests, 85/85 chat conformance tests, anonymous Convex generation for seven files, 44/44 architecture/release tests, lint, typecheck, 2,515/2,515 unit tests, 613/613 integration tests, 4/4 type tests, 40/40 import tests, 1/1 TypeScript standards test, 32/32 SEO tests, 1/1 UI-contract test, twenty browser-journey tests, ten accessibility tests, seven paid-operation surface tests, the current-workspace CLI package proof on Node 20.20.2 and 22.23.2, and the production build. The current source pack remains deterministic at SHA-256 `9618cd0f4e1f2ba5893ebab1f2f96cc88779156db1a7986657a3f4051bd97364`; it is diagnostic only and is not the publication artifact.
- 2026-08-25 T8 exact CLI artifact gate recovered and closed locally: the frozen Wave 0 tarball was recovered intact from npm's content-addressed cache at the recorded SHA-256 `109e14b023e883c72586825d8ba58d49766882dedd27d00dcb1a90158285c450` and SHA-512 integrity `sha512-GA6JdEnJnvVvb+4/57P8UNC6dy6yHvHAHrlknc44ILSNLG5aTYs6TvYBq04MmJKaiIkOdvhstY3l64tiK/FV9w==`. Cache index records bind that byte sequence to the earlier `ae-cli-package` and served-CLI consumer installations. `71620c73d` adds an opt-in prepacked mode to the maintained verifier: it requires a pinned lowercase SHA-256, checks it before installation, never builds/repacks in that mode, verifies the installed three-file allowlist, executable/shebang/help/bin/version/engine/access contracts, blocked root/deep imports, and Node 20/22 help, and fails closed on missing, malformed, non-file, or mismatched input. Master reran the full source gate, then independently installed and tested the preserved artifact with `CLI_PACKAGE_MODE=prepacked` and `CLI_PACKAGE_PASS`; its mode `0600`, size 554,221 bytes, mtime, and digest were unchanged. The exact artifact is archived outside the worktree under the dated task evidence folder. The baseline was not rewritten and no artifact was repacked.
- 2026-08-25 T8 external boundaries remain outstanding. Publishing the recovered exact tarball, its post-publication registry install smoke, the authorized all-current-staging comparison, the twenty-four-hour staging soak, a named release-owner cutover record, and the separately authorized exact-revision hosted gateway receipt still require exact target/action approval. No staging/production deployment, hosted data operation, paid smoke, npm publication, credential change, or billing/security-policy action occurred; this checkout has no configured current-Operation staging target or credentials, and the available hosted workflow is explicitly opt-in on `main`.
- 2026-08-25 T8 scheduled-readiness evidence contradiction: the one-minute cron calls `scheduleDueCapabilityProbes`, which repeatedly takes at most the first twenty due current publications from the readiness-expiry index and schedules one-shot actions without a cursor, lease, cycle identity, attempt identity, or durable scheduled timestamp. The same action is also invoked by publish and owner flows. Target-unavailable exits write no terminal attempt or publication observation, and fixture observations can update the same readiness timestamps without a probe. Consequently the persisted readiness fields cannot attribute an observation to the scheduler or prove a complete all-current cycle; permanently unavailable early rows can also remain due and starve later rows. Existing shadow diagnostics compare only the active search projection, not the detail/commitment projection, and become truncated above the frozen bounded dataset. This contradicts the signed-off claim that the existing seams can establish the Wave 2/T4 “one complete scheduled readiness refresh/probe cycle” exit evidence. The T8 staging-observer slice is frozen: inferring cron provenance from `readinessObservedAt`, or adding new cycle/attempt schema and scheduler traversal without an amended authority decision, would weaken the gate or improvise unplanned architecture. T4 and T8 remain unchecked pending an explicit plan amendment or other authority-backed proof design.
- 2026-08-25 T8 scheduled-readiness evidence contradiction resolved locally: an anonymous Convex 1.45 reproduction established that cron completions identify caller `Cron`, child completions identify caller `Scheduler`, and `ctx.meta.getRequestMetadata().scheduledFunctionId` on each child equals the `_scheduled_functions` ID returned by the parent scheduler call. This supports a narrower, plan-consistent interpretation: the required cycle is one bounded cron dispatch of one through twenty due publications with every scheduled child joined to an observed, unavailable, refused, or platform-error terminal; all-current Operation parity is proved separately by the bounded projection snapshot and shadow diagnostic. `cb2f78fd6`, `a5a8d4d2b`, and `cbcb03b2f` add privacy-safe scheduler/terminal events, complete search/detail/commitment parity diagnostics, fail-closed 258-row truncation, and an active-first detail index. Master reproduced 37/37 focused integration tests, 8/8 focused boundary tests, 41/41 import tests, typecheck, and zero-warning lint. Controlled 1/20/256 sets remained at 3/22/22 database queries with child-measured p95 1.012/2.293/8.809 ms; 256 remains accepted and 257 typed-refused. The hosted cron-cycle observation and twenty-four-hour staging soak remain unchecked until an exact staging target is authorized.
- 2026-08-25 T8 staging observer integrated locally: `71fede724`, `14df9dd8e`, `fd212fe37`, `f9ee2c9dd`, `d51c9f41a`, `0cf20b401`, `469e34094`, and `a50106215` add the internal exact-revision staging snapshot, strict array-spawned Convex observer, bounded cron/child lineage parser, exclusive digest-verified 0600 receipts, start/complete/rollback state machine, and opt-in `main`/`staging` workflow. The tool accepts only an exact dedicated `dev:<deployment>|<secret>` key, the five named current-Operation internal functions, and privacy-safe JSONL logs; every post-mutation start/complete failure, including receipt persistence failure, best-effort verifies rollback to `old`. Source-set identity excludes readiness-driven `updatedAt` while the separate readiness digest changes. Master reproduced 77/77 focused tests, 53/53 architecture tests, 41/41 import tests, typecheck, zero-warning lint, and anonymous Node 22 Convex generation for seven files. The full Node 22 source chain then passed 423/423 invocation conformance tests, 85/85 chat conformance tests, 2,554/2,554 unit tests, 626/626 integration/Convex tests, 4/4 type tests, 41/41 import tests, TypeScript/SEO/UI contracts, twenty browser journeys, ten accessibility journeys, seven paid-operation surface tests, Node 20/22 CLI package proof, and the production build. Fresh 20/256 projections used 22 database queries at 2.580875/10.1385 ms p95, within the frozen limits and with decreased query count. No hosted workflow, deployment, data operation, provider effect, payment, package publication, or production action ran; T4/T8 remain open for the authorized start receipt, full twenty-four-hour soak, explicit named-owner completion or rollback, exact tarball publication/install smoke, and exact-revision hosted gateway receipt.
- 2026-08-25 T8 hosted-preflight and Linux portability correction: read-only GitHub inspection found remote `main` at `521be78fa48e8f1b5307d58fd0d2db4f68a04c11`, with this architecture revision still local, and found no `staging` GitHub environment, no `AE_T8_STAGING_CONVEX_DEPLOYMENT` environment variable, and no dedicated `AE_T8_STAGING_CONVEX_DEPLOY_KEY` environment secret. No external mutation was attempted. Existing hosted kernel-release run `32215245130` instead exposed a source-gate portability defect: `tests/unit/capability-supply/provider-conformance-evidence.test.ts` assumed macOS `~/.Trash`, which does not exist in the Linux runner's `/home/runner`. `252e8540f` removes that platform assumption only, deletes exclusively test-created temporary directories and its unique disposable marker, and preserves all eleven semantic assertions. Master reproduced 11/11 normally and with an otherwise empty temporary `HOME`, verified that no `.Trash` was created, then reran the complete Node 22 source release gate: 423/423 invocation conformance, 85/85 chat conformance, 53/53 architecture, 2,554/2,554 unit, 626/626 integration/Convex, 4/4 type, 41/41 import, TypeScript/SEO/UI contracts, twenty browser journeys, ten accessibility journeys, seven paid-operation surfaces, Node 20/22 CLI package proof, and production build all passed. Fresh 20/256 projection evidence remained at 22 queries and 2.576666/10.071792 ms p95. The child worktree and merged task branch were removed after independent verification; no hosted workflow, deployment, data operation, publication, provider effect, payment, or credential change ran. T4/T8 remain open because the exact staging target/configuration and explicit external authorizations are still absent.

## Review completion

- Step 0 scope challenge: scope reduced to incremental enforcement, one justified read-model change, and the existing CLI package lifecycle.
- Architecture review: 4 issues found.
- Code quality review: 3 issues found.
- Test review: coverage diagram produced; 9 gaps identified.
- Performance review: 1 issue found.
- What already exists and NOT in scope: written.
- TODO updates: 0 deferred items; all necessary work is in T1-T8.
- Failure modes: 6 launch/cutover blockers converted into explicit tasks and gates; 0 unplanned critical gaps remain in the plan.
- Outside voice: fresh Codex review ran; 5 findings were classified and folded.
- Parallelization: 3 implementation lanes after the shared baseline; final release integration is sequential.
- Lake score: 9/9 reversible architecture decisions chose the complete evidence-backed option.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|---|---|---|---:|---|---|
| CEO Review | /plan-ceo-review | Scope and strategy | 0 | NOT RUN | Product scope was fixed by current authority; this review made no product expansion. |
| Outside Voice | codex-plan-review | Independent second opinion | 1 | CLEAR | 5 findings; 5/5 folded or explicitly rejected. |
| Eng Review | /plan-eng-review | Architecture and tests | 1 | CLEAR (PLAN) | 17 issues mapped to T1-T8; 0 unplanned critical gaps. |
| Design Review | /plan-design-review | UI/UX gaps | 0 | NOT RUN | No UI scope. |
| DX Review | /plan-devex-review | Developer experience gaps | 0 | NOT RUN | No separate DX review; CLI distribution was reviewed here. |

**CODEX:** Moved CLI truthfulness to Wave 0 and made read-model migration, cutover evidence, and operational rollback executable.

**VERDICT:** ENG + OUTSIDE VOICE CLEARED — ready to implement.

NO UNRESOLVED DECISIONS
