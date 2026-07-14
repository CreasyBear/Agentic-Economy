# React Doctor architecture workbook

Status: active remediation workbook
Baseline: React Doctor 0.7.7, full scan, 897/897 files, 470 diagnostics
Scope: working-tree changes only; preserve parallel inquiry and planning work

## Classification

| Bucket | Count | Disposition |
| --- | ---: | --- |
| Render-purity bugs | 5 | Fix first through the existing Answer Thread interface. |
| Purported impure state updaters | 14 | Candidate false positives: ordinary event handlers or controlled/uncontrolled setters, not functional updater side effects. Do not distort interfaces to silence them. |
| Zod 4 deprecated forms | 214 | Mechanical, domain-local migration after correctness and architecture work. Contract schemas remain interfaces; do not hide them behind shallow factories. |
| Async sequencing | 69 | Review one occurrence at a time. Preserve ordered writes, read-your-writes, rate limits, and authority transitions. |
| Retired routing-kernel | 61 | Retirement hygiene, not optimization. Keep historical/readback obligations; move obsolete implementations out of the active audit surface without permanent deletion. |
| File/export/dead-code heuristics | 65 | Validate framework entrypoints, scripts, and manifests before acting. Never split cohesive route-local rendering merely to satisfy a rule. |
| Remaining performance/maintainability | 56 | Act only where the deletion test proves a module earns a seam. |

## Deepening opportunities

### 1. Answer Thread session orchestration — Strong

Files: `AeChat.tsx`, `AeThreadTurnStreamSection.tsx`, `turn-stream-session.ts`, `answer-turn-state.ts`.

Problem: route promotion, optimistic projection merge, generation control, settlement, navigation, telemetry, and callback freshness span several modules. Concurrency knowledge leaks into render-time ref writes, reducing locality.

Direction: preserve and deepen the existing stream-session seam. Keep one transport adapter; a second adapter seam would be hypothetical. First establish a render-pure characterization baseline, then concentrate lifecycle transitions behind the existing interface.

Benefits: more leverage for route promotion, retry, stop, replay, and stale-generation handling; the interface becomes the test surface.

### 2. Business Claim seam — Strong

Files: `src/modules/business/internal/claim.ts`, `src/modules/business/public.ts`.

Problem: the internal claim implementation imports its public module while the public module re-exports the claim implementation, creating a circular dependency and leaking public assembly knowledge inward.

Direction: place claim-owned types and phone validation in the claim implementation, then let the public module assemble the external interface.

Benefits: restores one-way locality and removes order-dependent initialization without introducing another adapter.

### 3. Operator workspace chrome — Strong, broad

Files: `AeOperatorShell.tsx`, operator route shell/state modules, protected operator routes.

Problem: nested shells register chrome imperatively through layout effects and dependency-key workarounds. Understanding one route requires bouncing through parent registration and leaf modules.

Direction: deepen the Operator workspace shell so chrome replacement, cleanup, pending/error projection, and navigation live behind one interface.

Benefits: high leverage across protected routes, but a broad caller surface means this follows narrower correctness slices and requires characterization tests.

### 4. Public-check disclosure — Worth exploring

Files: `AeCollapsible.tsx`, `chain-of-thought.tsx`, `reasoning.tsx`, public-check callers.

Problem: three controlled/uncontrolled disclosure modules repeat interaction state while Astryx already owns a Collapsible module. Public checks must not imply hidden chain-of-thought.

Direction: converge on one deeper public-check disclosure module backed by Astryx primitives, preserving streaming, manual override, reduced motion, and accessibility.

Benefits: greater locality and a single truthful interface; avoid deepening orphaned or generic demo modules.

### 5. Canonical Customer Request and Capability Supply — Worth exploring

Problem: active compiler/evaluation paths repeat indexed semantic lookups, while Capability Supply coordinates contract, offering, binding, eligibility, publication, and readiness invariants across a large Convex implementation.

Direction: keep existing external interfaces, concentrate request-revision-local indexes and admission transitions internally, and test through those interfaces. Do not resurrect the retired routing kernel.

## Execution order

1. Genuine correctness errors.
2. Security and accessibility findings.
3. Business Claim circular seam.
4. Retired routing and historical Request classification.
5. Active Customer Request and Capability Supply depth.
6. Safe concurrency and Zod migrations by domain.
7. UI maintainability only where state seams are real.
8. Full rescan, false-positive/deferred ledger, and verification.

## Retirement classification

Routing Kernel v1 is not active production authority. The live production
imports retain only its explicit retirement response, historical readback, and
historical schema. React Doctor therefore excludes the nine dormant v1
implementation files that generated findings, while continuing to scan the
retirement and historical evidence files. This is audit-baseline hygiene, not
a claim that the historical code has been modernized.

## Capability Supply concurrency classification

React Doctor's independent-await and await-in-loop findings in
`convex/capabilitySupply.ts` require authority-aware review. They occur across
queries, mutations, replay verification, audit creation, and eligibility
transitions. They must not be bulk-converted to `Promise.all`: mutation order,
read-your-writes behavior, deterministic audit ordering, and Convex transaction
semantics are part of the contract. Pure read projections may be parallelized
later behind a characterized supply-loading interface; authority writes remain
sequential unless their commutativity is proven.

## Residual baseline after this pass

The full local rescan (897 files, supply-chain network scoring disabled) reports
407 diagnostics across 114 files: 14 errors and 393 warnings. That is down from
470 diagnostics in the initial full report. The five genuine ref-in-render
errors are gone; the remaining 14 errors are `no-impure-state-updater` false
positives on ordinary event/effect callbacks, including one file owned by the
parallel inquiry work.

Largest remaining groups:

- 182 Zod v4 migration warnings: mechanical, but migrate by active owning
  domain with contract tests rather than a repository-wide blind rewrite.
- 49 await-in-loop and 20 independent-await warnings: review against authority,
  rate-limit, ordering, and Convex transaction semantics before parallelizing.
- 31 multi-component and 28 combined-iteration warnings: act only where the
  proposed module boundary increases locality; do not split cohesive files to
  satisfy a counter.
- 20 unused-file and 13 only-export warnings: verify route generation, tests,
  examples, and retired authority before moving anything to Trash.
- Two `accessKey` warnings are typed customer-record access-key properties in
  parallel inquiry work, not DOM accessibility attributes.
- The pnpm-hardening findings do not apply to this npm-owned repository.

This residual is the next-pass queue, not a literal backlog. The active-domain
order is Zod contracts, characterized read-only concurrency, Operator shell,
then public-check disclosure. Retired and generated code remain classified,
not opportunistically modernized.

## Pass two — active Zod contract migration

Migrated 85 Zod v4 diagnostics across seven active, collision-free modules:

- Capability Contract public validation: nine strict-object migrations.
- Customer Request agent contract: 63 overlapping strict-object diagnostics
  removed from the external wire-validation interface.
- Demand and Settings action/input contracts: seven strict-object migrations.
- Answer search context: one ISO date-format migration.

The full rescan now reports 322 diagnostics across 108 files: 14 errors and 308
warnings, down from 407 after pass one. Zod findings fell from 182 to 98. The
remaining Zod queue is deliberately split:

- Historical Request v1: 35 findings in `legacy-v1.ts` and
  `legacy-compiler-v1.ts`; classify with retirement rather than modernize.
- Active but currently colliding: Capability Supply (19), Inquiry (6), and
  shipping provider integration (4).
- Active clean follow-ons: hosted-agent journey/release readback and semantic
  interpreter (18), release tooling (11), sandbox provider (3), and Prepared
  Action v2 (2).

No generic Zod helper or new adapter seam was added. Schema declarations remain
local to their owning domain modules, preserving a deep contract interface and
keeping unknown-key rejection explicit.

## Pass three — journey, readback, and release contracts

Migrated 34 additional Zod v4 diagnostics across seven clean modules:

- Hosted Customer Request journey proof, release readback, semantic
  interpreter, and Prepared Action v2 schemas.
- Production credential and deployment-source release tooling.
- Sandbox capability-provider request schemas.

Strict objects remain strict. Schemas that intentionally accept upstream Clerk
or Vercel response fields now use `z.looseObject`, preserving passthrough
semantics rather than tightening an external integration accidentally.

The full rescan now reports 288 diagnostics across 102 files: 14 errors and 274
warnings. Zod findings fell from 98 to 64. The remaining Zod findings are
entirely in retired Request v1 (35) or currently colliding Capability Supply,
Inquiry, and shipping-provider work (29).

The hosted journey's submit/replay awaits remain sequential by contract. The
second request proves idempotent replay after the first request has created the
operation; racing them would test concurrent admission instead. React Doctor's
independent-await finding there is therefore a semantic false positive.

## Pass four — characterized Convex read concurrency

Parallelized three groups of independent, bounded reads inside Customer Request
v2 transaction modules:

- Prepared Action candidate opening now reads offering, binding, and business
  from the same transaction snapshot concurrently.
- Provider outcome recording now opens replay state and exact release material
  concurrently.
- Provider reconciliation now opens replay state and exact provider outcome
  material concurrently.

These are read-only operations with no dependency on one another and no
intervening write. Their interfaces and integrity checks are unchanged. The
full rescan reports 285 diagnostics across 99 files: 14 errors and 271 warnings.

Ordered findings intentionally retained include Capability Contract
registration after operation-key insertion, Catalog readback after publication
writes, hosted submit before replay, audit-event verification loops, and
authority/event emission loops. They are not performance bugs unless ordering,
commutativity, and failure semantics are first changed at the owning interface.

## Pass five — error baseline and active authority collections

Source review confirmed all 14 remaining error-severity findings came from
`no-impure-state-updater` misclassifying ordinary event, effect, promise, and
orchestration callbacks as functional state updater bodies. The canonical rule
prompt is unavailable, `react-doctor why` repeats the incorrect interpretation,
and genuine functional updater bodies in the same modules are pure. The broken
rule is disabled centrally in `doctor.config.ts`; the other render/ref purity
rules remain enabled and previously found five genuine issues.

Optimized four clean Customer Request authority modules without adding a seam:

- Action Attempt execution data scope now projects in one pass.
- Action Preparation recipient and exposure limits now use local one-pass Sets.
- Provider Reconciliation reuses its exact evidence requirement set.
- Preparation Authority uses a Set for repeated permitted-field membership.

The full rescan now reports zero errors and 267 warnings across 89 files. The
four touched authority modules have no residual findings. Parallel tree changes
introduced new warning occurrences during the run, so pass-to-pass totals are
treated as live snapshots rather than a claim that every count delta belongs to
this slice.

UI Explore classified the Claim draft-hydration seam as the strongest clean
architecture candidate, but it needs focused route characterization tests before
refactoring. Multi-module and only-export findings remain non-actionable where
splitting cohesive route-local modules would create shallow interfaces.

## Pass six — Claim draft state seam

Deepened Claim draft hydration behind one reducer interface in
`src/modules/catalog/claim-draft.ts`. The module now owns hydration phase,
current form value, confirmation state, dirty-field precedence, imported-draft
merging, and persistence snapshots. The route retains the single browser
storage adapter and its Astryx markup is unchanged.

Characterization tests prove that hydration is atomic, owner edits win over
stored/imported values, imports require reconfirmation, and persistence cannot
run before hydration. The route no longer coordinates two state setters, a
mutable dirty-field ref, and a render-only readiness boolean.

The first full rescan reported 264 warnings and zero errors, removing the three
state diagnostics. A scoped follow-up also removed the stored-field membership
warning. Four `no-multi-comp` findings remain in the Claim route by design:
the render modules are cohesive route-local implementation, and extracting them
would add shallow interfaces without improving reuse, testing, or locality.

## Pass seven — preparation-egress projections

Converted three bounded Customer Request preparation-egress projections to
single-pass collections: deduplicated disclosure exposure units, principal
status projection, and unresolved-operation projection. Integrity validation,
the 64-operation bound, state selection, and deterministic ordering are
unchanged.

The full rescan now reports zero errors and 260 warnings across 89 files. The
two remaining await-in-loop findings in preparation egress are authority-state
writes whose ordering and partial-failure semantics require separate review;
they were not parallelized as part of a projection-only change.

## Pass eight — bounded cleanup concurrency and ordered-loop evidence

Parallelized two bounded batches of independent deletes inside atomic Convex
mutations:

- expired source-write nonces, capped at 500;
- expired abuse-rate-limit buckets within each state batch, capped at 250.

The abuse cleanup's outer state loop remains sequential so the global deletion
cap and continuation decision observe prior batches. Tests prove cutoff,
bounded deletion, preservation of live rows, and continuation scheduling.

Added direct Answer stream characterization proving plan → one-line → sources
→ selected provider → next step → ordered summary deltas → completion. The
three pause awaits in that async generator are intentional event pacing.

Other reviewed await loops remain sequential with concrete reasons:

- Answer eval cases mutate process-global env, ports, and guards.
- Answer Turn finalization is a fail-stop append journal.
- Harness session entries form a parent/sequence chain before the active-leaf
  pointer advances.
- Dev seed and seed-store flows create dependent owner, business, claim,
  contract, offering, binding, admission, publication, and probe state.
- Authz migration is a bounded one-off transaction where 500 concurrent
  promises do not reduce transaction work.
- Source State persistence performs ordered read-before-write aggregate updates
  and currently collides with parallel work.

The full rescan now reports zero errors and 258 warnings across 87 files;
await-in-loop findings fell from 51 to 49. Reviewed intentional loops remain
visible and individually documented rather than disabling the rule globally.

## Pass nine — Harness status membership

Converted Harness run-status membership to a Set because recorded statuses grow
with tool, event, model, and gate evidence. The collector's ordering interface
and canonical `HarnessToolStatusValues` projection are unchanged.

Three similarly reported Harness viewer occurrences are false positives: they
call `String.prototype.includes` to scan serialized public/private projections
for forbidden substrings. Replacing those with Sets would change semantics, so
they remain visible and classified rather than mechanically edited.

The current full snapshot reports zero errors and 257 warnings across 86 files.
Repository-wide TypeScript checking is green at this snapshot, alongside the
scoped tests, lint, Convex codegen, and diff checks recorded above.

## Pass ten — read-only Capability Supply snapshots

Parallelized three groups of independent, bounded reads in Capability Supply:

- publication projection reads its offering and transport binding together;
- probe-target projection reads offering, binding, published business, and
  exact active contract together;
- exact eligible-supply lookup reads its offering and binding together.

Each group runs after the publication or request key is known, performs no
write, and reads from one Convex snapshot. Authorization, integrity checks,
publication lifecycle, probe evidence, and refusal behavior are unchanged.
Mutation-side reads remain deferred until their write and failure semantics are
characterized separately.

The full rescan reports zero errors and 253 warnings across 86 files. The
`server-sequential-independent-await` count fell from 16 to 12. Four focused
Capability Supply and Customer Request integration files passed (24 tests),
the touched module is oxlint-clean, Convex codegen passed, and its diff check is
clean.

The repository-wide TypeScript gate is currently blocked by parallel shipping
integration work: `CustomerRequest` is no longer exported from the Customer
Request public barrel at two import sites, and two shipping quote projections
pass explicit `undefined` values through exact optional properties. These
errors do not involve `convex/capabilitySupply.ts`; they are recorded rather
than absorbed into this slice.

## Pass eleven — mutation-side Capability Supply snapshots

Parallelized four additional bounded read groups after separately reviewing
their surrounding mutation semantics:

- readiness observation reads offering and binding after the publication patch;
- probe-result admission reads binding, offering, published business, and the
  active exact contract before any write;
- withdrawal reads offering and binding after owner/revision authorization and
  before eligibility revocation;
- refresh reads current offering and binding before eligibility revocation,
  supersession, and next-revision construction.

The reads share a Convex transaction snapshot and do not cross an authorization,
write, replay, or evidence-order boundary. Transaction rollback still prevents
partial readiness updates when supply integrity fails. Sixteen focused tests
passed across publication, probe routing, and import-boundary coverage; oxlint,
Convex codegen, and diff checks passed.

The full rescan reports zero errors and 248 warnings across 86 files.
`server-sequential-independent-await` fell from 12 to 7.

## Pass twelve — characterized dev-seed supply lookup

Parallelized the three independent indexed reads used to find the sandbox
business, offering, and binding for a test capability publication. The two
offering/binding recovery reads also run together, but only after registration
and admission complete in their existing causal order.

Added direct characterization proving the test publication replays against the
seeded exact supply, preserves the publication identity, returns the expected
credential reference, and does not duplicate the publication. Fifteen sandbox
registration tests passed across the two integration suites; oxlint and diff
checks passed.

The full rescan reports zero errors and 247 warnings across 86 files. Six
sequential-await diagnostics remain and are classified:

- Capability Contract operation reservation must precede immutable registration
  effects and terminal audit attachment.
- Catalog publication readback must follow its business, claim, and service
  writes.
- Dev seed owner persistence must precede sandbox business claims that consume
  that canonical owner authority.
- Hosted-agent replay must follow the initial submit; concurrent requests test
  a different admission property.
- Two receipt-envelope crypto stages are technically parallelizable but belong
  to colliding untracked Inquiry work and lack direct failure/zeroization tests;
  they remain deferred to that owning slice.

Repository-wide TypeScript checking remains blocked by the same unrelated
shipping integration errors recorded in pass ten. No error names a file touched
by passes eleven or twelve.

## Pass thirteen — deterministic shortlist export collections

Replaced three chained shortlist-export collection passes with local one-pass
accumulation. Provider order, the three-field order within each provider,
selected-field order, duplicate selection behavior, sanitization, exact
clipboard bytes, and all public proof-boundary copy are unchanged. The React
component markup and Astryx surface are untouched.

Added multi-provider characterization proving deterministic business and field
ordering. Eight focused export tests and the UI contract gate passed; both
source files and the new characterization are oxlint-clean and diff-clean.

The full rescan reports zero errors and 244 warnings across 84 files.
`js-combine-iterations` fell from 21 to 18. Collection review also classified
two visible findings that should not be mechanically changed: the copy-phase
intersection uses singleton/bounded enums and is #143-owned, while per-field
purpose membership performs one lookup over a schema-bounded list. A Set would
add allocation without improving either operation.

The next clean collection slice is `customer-request/kernel-router.ts`: ten
local projections have been source-reviewed as order-preserving one-pass/Set
rewrites, with dedicated routing and recovery tests and no current worktree
collision.

## Pass fourteen — kernel-router contract projections

Converted ten Customer Request kernel-router findings into local one-pass
contract projections and constant-time protected-field membership. Preparation,
protected, required, execution, and registered-output fields retain their exact
predicates. Existing alphabetical sorts remain at the kernel boundary, while
release-field filtering still preserves provider-supplied order and duplicates.
No helper seam or public interface was added.

Twenty focused routing, recovery, source-completeness, and retired-authority
tests passed. The touched module is oxlint-clean and diff-clean. The full rescan
reports zero errors and 234 warnings across 83 files: `js-combine-iterations`
fell from 18 to 10 and `js-set-map-lookups` fell from 16 to 14.

Repository-wide TypeScript checking reports no error in the kernel-router
slice. In addition to the previously recorded shipping work, active Inquiry
work now has incomplete `governedSendIntegrityKeyring` propagation and one
stale keyring shape at its signing call. Those colliding files and tests remain
outside this pass.

## Pass fifteen — Capability Contract collection locality

Replaced six chained Capability Contract projections with local one-pass
accumulators: input annotation pointers, overlapping preparation inputs,
applicable data-use declarations, ambiguity-check pointers, combinator required
pointer sets, and canonically resolved schema branches. All registrant-provided
ordering, overlap predicates, required-pointer union/intersection behavior, and
fail-closed branch agreement are unchanged. No helper or public interface was
added.

Forty-two Capability Contract definition, decision-model, preparation, local
reference, and combinator tests passed. The module is oxlint-clean and
diff-clean. The full rescan reports zero errors and 228 warnings across 83
files; `js-combine-iterations` fell from 10 to 4.

## Pass sixteen — compiler fallback and evidence projections

Converted the remaining two Customer Request compiler chains into local
one-pass projections. Fallback alternatives retain ranked route order, exact
route-id exclusion, provider-disjoint eligibility, and duplicate behavior.
Evidence producers retain action/evidence order and the exact `length !== 1`
fail-closed rule for ambiguous producers.

All 18 V2 request-semantics tests passed; the compiler is oxlint-clean and
diff-clean. The full rescan reports zero errors and 226 warnings across 82
files, leaving two combined-iteration findings. The AeChat finding is a safe
but dirty-file reconciliation projection that needs ownership confirmation;
the Inquiry finding is deferred because it sits inside active governed-send,
privacy-erasure, and integrity-keyring work.

## Pass seventeen — membership semantics and false-positive closure

Converted two repeated Answer timing-name scans to one local Set and converted
Preparation Authority's repeated protected-field membership checks to a local
Set. Timing inclusion/exclusion remains presence-based and order-independent;
release validation retains exact field membership, empty-field refusal, and
purpose/recipient checks.

Seventeen focused preparation, kernel-router, and recovery tests passed. The
touched files are oxlint-clean and diff-clean. The broader Answer pipeline suite
has 16 passing tests and two unrelated catalog/fixture failures for the Geelong
locksmith case: the expected slug is absent, and its expected summary/boundary
copy is missing. No failure mentions timing inclusion or exclusion.

The full rescan reports zero errors and 223 warnings across 81 files;
`js-set-map-lookups` fell from 14 to 11. Every remaining occurrence is now
source-classified as non-actionable:

- two evaluator findings are `String.prototype.includes` substring assertions;
- two executable historical provider examples use ephemeral 5–10 item
  allowlists where a Set adds allocation without leverage;
- copy-phase intersection checks singleton allowed phases against at most five
  phases and remains #143-owned;
- two true repeated lookups live in retired Request v1 compiler paths;
- Preparation purpose lookup probes a different schema-bounded purposes array
  for each field, so constructing Sets inside the loop would add work;
- three Harness findings search serialized JSON for forbidden substrings and
  cannot use exact-membership Sets without changing privacy semantics.

These findings remain visible rather than disabling the rule globally.

## Pass eighteen — stable render identity and schema clone authority

Replaced the Capability Contract interpreter's JSON serialization clone with
`structuredClone` followed by the existing `JsonValue` parse authority. The
clone remains isolated and mutable for recursive format stripping, while the
declared JSON seam continues to reject unsupported values. Forty-two Capability
Contract tests passed.

Replaced three UI index-derived keys with source-owned identity: Answer parts
use their unique part kind, and operator breadcrumbs use destination plus label.
This preserves streamed part nodes across content updates and breadcrumb nodes
across route reordering without changing Astryx structure or public copy.
Thirteen focused UI/navigation tests and the UI contract gate passed. All
touched files are oxlint-clean and diff-clean.

The full rescan reports zero errors and 205 warnings across 77 files. Four
diagnostics belong to this pass: three array-index keys and the JSON clone.
Concurrent shared-tree work also removed thirteen await-in-loop findings and the
Inquiry index-map finding during the scan; those fourteen diagnostics are live
baseline drift and are not attributed to this slice.

The remaining dev-seed index-map finding is bounded, #143-owned test setup where
`Array.find` has first-match semantics; a naive Map would change duplicate
behavior. The two remaining Workspace index keys are append/reset-only turns
without a source-owned turn identity and no stateful children, so synthetic
UUIDs or content keys would be less correct than the current lifecycle key.

## Pass nineteen — optimistic-turn locality and eval surface cleanup

Converted AeChat's optimistic-turn reconciliation from filter/map chaining to
one local projection. Streaming-thread scope, omitted-turn exclusion, input
order, and duplicate behavior are unchanged. All 13 route-promotion and
optimistic reconciliation tests passed.

Removed the obsolete `createAnswerEvalRegistrySourceState` function, its public
type, and now-unused imports after repository-wide static, dynamic, package,
and documentation searches found no consumer. The broad eval fixture exports
remain unchanged. The eval coverage audit passes with all 12 cases, 100 broad
seed businesses, and every required tag. Both touched files are oxlint-clean
and diff-clean.

The full rescan reports zero errors and 218 warnings across 77 files. This pass
removed one combined-iteration and one unused-export diagnostic. Concurrent
shared-tree changes reintroduced fourteen await-in-loop occurrences and the
Inquiry index-map occurrence between snapshots, producing a higher live total;
those fifteen findings are baseline drift, not regressions from this slice.

Tooling review also established that the pnpm hardening findings are synthetic:
the project is npm-owned (`packageManager`, tracked `package-lock.json`, and CI
`npm ci`), while an untracked pnpm lockfile triggers the detector. The native
`node-addon-api` dependency is intentional Sharp source-build infrastructure.
The release workflow secret-boundary finding is genuine but deferred to an
explicit CI/security slice rather than opportunistically modifying workflow
authority during this campaign.

## Pass twenty — Capability Supply Zod 4 authority semantics

Migrated nineteen active Capability Supply schemas to their explicit Zod 4
object APIs. Twelve registration and adapter-material schemas use
`z.strictObject`, preserving rejection of undeclared authority-bearing fields.
Four readiness response schemas use `z.looseObject`, preserving declared
extension points in provider and MCP response envelopes. Three transport
configuration schemas use `z.strictObject`, retaining fail-closed adapter
admission. Recursive arbitrary adapter JSON remains unchanged.

Added characterization proving nested registration and reconciliation extras
are rejected while MCP outer, result, and tool metadata remain accepted.
Fifty-six registration, readiness, adapter, importer, integration, and import
boundary tests passed. All touched files are oxlint-clean and diff-clean;
Convex codegen passed.

The full rescan reports zero errors and 199 warnings across 74 files. All
nineteen targeted Zod findings are gone, reducing the Zod family from 64 to 45.
Repository-wide TypeScript checking now reports only the previously recorded
untracked shipping integration errors: two stale `CustomerRequest` imports and
two exact-optional-property projections. No type error names a Capability
Supply file or test.

Await-loop review found no additional safe counter-only conversion. The clean
Discovery candidate uses unbounded `.collect()` results and lacks a direct
invalidation runtime test; parallelizing those writes before pagination/capping
would violate Convex transaction guidance. Other non-Inquiry loops remain
classified as causal, integrity-ordered, legacy, or fail-stop behavior.

## Pass twenty-one — shortlist projection seam and route export scope

Separated the deterministic shortlist presentation model from its Astryx React
component. `shortlist-projection.ts` now owns artifact settlement, slug-based
deduplication, stable urgency ordering, and published-phone dialability. The
policy already had five consumers across replay, live streaming, transcript,
chat state, and analytics; centralizing it passes the deletion test and avoids
duplicating authority. `AeShortlistTerminal.tsx` now exports only its component,
with no rendered structure or copy change.

Also narrowed two admin readback server functions to route-file scope after
repository-wide search found no external consumer. The required TanStack
`Route` exports and loader behavior remain unchanged.

Thirty-three shortlist transcript, route-promotion, loop-context, and export
tests passed, as did the UI contract gate. All touched files are oxlint-clean
and diff-clean. The full rescan reports zero errors and 195 warnings across 71
files; `only-export-components` fell from 13 to 9.

The unused-file family is now fully classified. Eleven findings are detector
misses: six Promptfoo `file://` providers/assertions, two Wrangler worker entry
modules, and three Vercel filesystem functions. The other nine are recent
standalone routing/hosted verification entrypoints with no discoverable
invocation contract; they remain concrete orphan/retirement candidates, but
none is proven safe to move to Trash without routing-owner confirmation.

Structural route review found one genuine future deepening candidate:
`registry.tsx` can retain TanStack loader/head authority while moving its large
stateful registry view behind a narrow `{ result, query, limit }` interface.
That slice is deferred because its registry integration and demand files are
currently dirty. Other clean route component findings are cohesive single-use
lifecycle/disclosure views where extraction would add shallow interfaces.

## Pass twenty-two — reactive operator chrome

Fixed a genuine stale-chrome dependency in nested `AeOperatorShell` usage.
The chrome memo now tracks the actual action node, breadcrumb list, and badge
map references instead of JSON pseudo-keys that omitted actions entirely. A
direct nested-shell lifecycle test proves one state update replaces visible
actions, breadcrumb identity, and admin badge count without registration loops.

Also narrowed `ownerInboxServerToRouteReadback` to file scope after confirming
it has no external consumer. The two deterministic owner readback projections
remain exported because Inquiry tests consume them; their eventual home is the
existing route-readbacks module, but that module and test are currently dirty.

Eleven operator-shell/navigation tests and the UI contract gate passed. The
touched files are oxlint-clean and diff-clean. The full rescan reports zero
errors and 193 warnings across 70 files; `exhaustive-deps` fell from 2 to 1 and
`only-export-components` fell from 9 to 8.

The remaining two `no-access-key` findings are semantic false positives:
`accessKey` is an Inquiry component/model prop and is not forwarded to a DOM
element. Renaming it during active untracked private-record work would add
collision risk without an accessibility change. The remaining stream effect
dependency is genuine, but requires a generation-frozen intent ref and direct
attach/detach lifecycle characterization before editing the dirty stream file.

## Pass twenty-three — generation-bound stream lifecycle

Removed the remaining stale stream-handler dependency without making callback
identity part of the request lifecycle. Intent is now frozen beside thread ID
at generation boundaries, while callback props continue through fresh refs.
Event and result handlers live inside the generation-scoped subscription
effect, so ordinary callback or thread-promotion rerenders do not detach,
reattach, or issue another request.

A direct lifecycle test proves same-generation rerenders retain one attachment,
fresh callbacks receive thread/result events, a generation change attaches once
with the promoted thread ID and aborts the old key, and late callbacks from the
prior generation are ignored. Existing transcript and route-promotion suites
also remain green (22 tests). The touched source and direct test are
oxlint-clean and diff-clean.

The full rescan reports zero errors and 192 warnings across 69 files, removing
the final `exhaustive-deps` diagnostic. Generation, replay identity, optimistic
settlement, and customer-visible stream outcomes remain deterministic.

## Pass twenty-four — Request identity lifecycle and formatter allocation

Moved the Customer Request identity from rendering state to an instance ref.
The identity is now installed synchronously before submission, reused across a
revision, and cleared only when the customer starts a separate Request. This
removes a render that had no visual consumer and strengthens rapid-submit
idempotency without changing the workspace's interface. Characterization now
proves a revision keeps the original Request identity while restart allocates a
new Request and agent identity.

Hoisted the option expiry `DateTimeFormat` allocation while preserving its
existing locale and implicit-timezone behavior. The broader time-display seam
remains deferred: option expiry and action-observation timestamps both need an
explicit product decision between browser-local and named timezone rendering
before their hydration contract can be deepened. The dynamic currency
formatter also remains intentionally local; option currency is runtime input,
and the canonical rule validation identifies that shape as a false positive
unless a real bounded cache policy exists.

The seven direct workspace tests pass, and both touched files are oxlint-clean
and diff-clean. Repository typechecking remains blocked by unrelated untracked
shipping integration errors plus typing defects in the prior pass's untracked
stream lifecycle test; neither failure names this pass's source or test.

The full rescan reports zero errors and 190 warnings across 69 files. The
targeted handler-only-state and static date-formatter findings are gone.
`prefer-useReducer` remains a count-only false positive: the controlled inputs,
lifecycle projection, append-only conversation, and revision marker have
different update cadences, and a reducer would add a shallow interface. The two
conversation keys remain valid for an append/reset-only log with repeatable
utterance text and no row-owned identity.

## Pass twenty-five — follow-up request lifecycle seam

Repaired the pass-twenty-three stream lifecycle test's TypeScript contract by
typing the mocked attachment through the production function interface and by
using source-owned `FollowUpIntent` values. All 23 focused stream, transcript,
and route-promotion tests pass, and the stream test no longer appears in the
repository TypeScript diagnostics.

Moved the generated follow-up-chip request protocol behind one answer-thread
client interface. `loadEnabledFollowUpChips` now owns the eval gate, ordered
follow-up request, provider projection, shared `AbortSignal`, response-shape
validation, and deterministic fallback. The React effect owns only turn reset,
request lifetime, and committing a successful result. The seam passes the
deletion test: removing it would force endpoint paths, sequencing, payload
shape, cancellation, and failure behavior back into the rendering module.

Interface tests prove gate-disabled short circuiting, provider projection,
successful validated results, cancellation across both requests, and fallback
for malformed or failed responses. The existing rendering suite remains green
(11 focused tests total), as do the UI contract gate and scoped oxlint. The
general import suite is currently red only for concurrent Inquiry private-seam
imports and two local retired-kernel example references; none names this pass's
files. Repository typechecking now reports only four untracked shipping-slice
errors: two missing `CustomerRequest` exports and two exact-optional-property
projections.

The full rescan reports zero errors and 189 warnings across 68 files. The sole
`no-fetch-in-effect` diagnostic is gone. The new client module is not reported,
and no new finding was introduced by this slice.
