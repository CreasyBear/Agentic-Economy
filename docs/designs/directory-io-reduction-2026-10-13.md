# Directory database I/O reduction

Joel authorized verifying and removing unused directory indexes and reducing
aggregate churn locally, with independent review and production approval before
deployment. Treasury and retained proofs remain outside this change.

## Evidence and scope

Base: `6fce9ae10b9e93297531fa1d0d03d1268c1d4cbb`. On 13 October the native
`joel-chan/agentic-economy` usage panel showed 83.66 GB database I/O: 51.50 GB
directory ingestion/aggregate maintenance and 12.38 GB selected treasury readers.
Storage was 12.83 GB, including 11.52 GB billed indexes; directory search and
external-entry tables accounted for 94.2%. These are dated aggregates, not a
promise of savings. The project usage view includes multiple deployment types;
this production proposal cannot claim to eliminate all of those bytes. Directory
refresh is already weekly.

Independent verification covered the tracked tree and an AST scan of 4,074
TS/JS-family files and 2,339 index-selection calls. All selections were literal;
none of these eight indexes has a supported caller:

| Table | Index to remove | Retained consumer path |
| --- | --- | --- |
| `marketDirectorySearchEntries` | `by_generation_and_network_and_payersOrder` | Eligible and Provider adoption indexes in `browse.ts`; pre-admission in `lookup.ts`. |
| Same | `by_generation_and_network_and_priceOrder` | Eligible price index in `browse.ts`. |
| Same | `by_generation_and_network_and_category_and_priceOrder` | Eligible category price index in `browse.ts`. |
| Same | `by_generation_and_network_and_popularOrder` | Eligible and Provider popular indexes in `browse.ts`. |
| Same | `by_generation_and_network_and_category_and_popularOrder` | Eligible category popular index in `browse.ts`. |
| `marketExternalRegistryEntries` | `by_generation_source_and_documentId` | Retained document-identity lookup plus explicit source check in ingestion/Provider projection. |
| Same | `by_generation_access_and_documentId` | Retained document/resource indexes; access resolved from the current publication. |
| Same | `search_searchText_by_generation_source` | Both keyword paths use the search-entry full-text index. |

These are unused query modes, not interchangeable field-prefix indexes. Preserve
category concentration, momentum, eligible, Provider, resource, slug, route and
base-pay-to indexes. External clients call registered functions; the public
filters accept no database-index name. Privileged ad-hoc queries and separately
deployed code outside this repository remain an execution-time verification
boundary. Source observations and all table documents remain intact.

## Aggregate contract and design

**Requires:** an admitted projected entry, exact generation/resource identity,
previous entry when present, and the existing Convex mutation transaction.
**Ensures:** current analytics memberships exist once; obsolete known memberships
and stale recency bands are absent; missing current memberships and tag/bundle
labels repair; healthy unchanged memberships cause no aggregate mutations.
**Invariant:** other resources/namespaces, live catalogue availability, Provider
precedence and full-scan-only removal remain unchanged. No financial side effect.
**On violation:** component/query/write failures propagate and abort the page;
do not catch and continue or advance a partially applied checkpoint.

Reconcile the union of previous/current keys and the four recency bands using
one `countBatch` query with inclusive exact **key and resource ID** bounds.
Delete only present undesired memberships and insert only missing desired ones.
Keep the existing tag/bundle label repair. Normal source projection caps tags
and bundles at 20 each; the refresh sub-batch remains five resources. Work is
proportional to this item's memberships, never the catalogue's retained rows.

**Complexity:** one local key union and a batched presence read replace repeated
delete/insert operations. No service, dependency, schema field, projection version
or persistent repair queue is added. Pure differences without a presence read
would abandon missing-member repair; reject that shortcut. In aggregate 0.2.2,
`insertIfDoesNotExist` uses `replaceOrInsert`, which still deletes and reinserts;
it cannot establish the zero-write guarantee.

**Retry/failure:** natural identity is namespace + typed key + resource ID.
The presence read and component changes remain in the same parent mutation;
Convex transaction retries reread presence rather than replay stale decisions.
Backfill with an empty namespace must repopulate even when previous equals next.
Legacy extra recency memberships must converge to one current band. A failed
component call is operationally retryable at the existing page boundary, with
the strong rollback guarantee; no local retry or swallowed error is added.
Checking all recency bands makes the stored-band override redundant; remove that
argument and its caller-side parser.

**Limits:** a batched RPC still performs one tree-range traversal per candidate
key. First insertion and extensive metadata changes add presence reads, so lower
mutation counts alone do not prove lower billed I/O. The five-resource test uses
20 tags, 20 bundles and 8,192-character IDs, but the test harness does not enforce
production read, execution or argument limits. Current [Convex limits](https://docs.convex.dev/production/state/limits)
allow 16 MiB function arguments and 16 MiB transaction reads. Runtime headroom and
billed savings require native observation after an approved deployment.

Repair covers the previous/current union and all recency bands. Arbitrary orphaned
non-recency memberships absent from both observations are not discovered. This
includes possible legacy per-network price memberships; their presence has not
been established. No generation rebuild or orphan purge is included.

## Verification and production approval

The regression fixture reproduced nine aggregate component mutations for a
healthy unchanged entry before the fix and zero after it. Tests use the real
registered aggregate components. They verify exact persisted memberships, changed
keys, missing-member repair, resource/namespace isolation, numeric/string key
distinction, recency transitions, replay, empty-namespace backfill and transaction
rollback after an actual component write. A maximum-label replacement performs
400 necessary membership changes across five resources and retains exactly 255
current memberships. The browse matrix covers nine paginated sort/filter paths
and concurrent duplicate-page replay. These are behavior and work-count proofs,
not a wall-time benchmark or a native billing measurement.

Independent source review verified the eight unused index names and the pinned
aggregate bounds implementation. Claude Opus 5.5 found no code blockers. Its
redundant-argument finding was accepted; its orphan-repair and runtime-limit
qualifications are recorded above. It correctly rejected the initial failed
gate preflight as release evidence. Fresh-worktree manifest inputs and test
fixture types were corrected without weakening the checks. Final check and gate
results are recorded below before this proposal is presented for approval.

- `npm run check` passed with Node 22.22 and npm 11.5.1.
- Seven targeted test files passed 69 tests, including directory analytics,
  retained browse paths, Provider projection, choices, category statistics and
  resolution.
- `npm run docs:build` passed after installing the docs package's existing locked
  dependencies. It verified 231 published pages and 86 owner examples, including
  emitted HTML/resources. No dependency version or lockfile changed. The
  CI source-proof job in the reviewed branch installs that lockfile and declares
  development/sandbox for the gate; README documents the same prerequisite.
  Claude's scoped review found no blocker. Local execution and YAML validation
  passed; the GitHub runner itself has not been exercised.
- Full `npm run gate` passed end to end at 22:17 AWST on 13 October, with 10,081
  unit tests, 3,313 integration tests, 20 browser journeys and 20 accessibility
  cases passed, plus CLI-package, type, import, SEO and docs checks. One unit test
  and 77 integration tests were skipped; three integration cases remain todo.
  These existing gaps do not become runtime acceptance evidence.
- The five changed code/test files matched their recorded fingerprints at both
  the start and end of the successful gate. The earlier failed docs build is
  retained as the reason for the prerequisite correction, not as a green gate.

## Release boundary

Read-only checks on 13 October found web `/api/v1/release` declaring base
`6fce9ae10b9e93297531fa1d0d03d1268c1d4cbb`, while the production backend's
`AE_RELEASE_SOURCE_REVISION` declared `85824a995a017ea06823de573c4bf1339bc1d658`.
These declarations establish metadata drift, not the exact contents of deployed
modules. The native index preview cannot establish function-body identity.

The complete source range between those revisions contains six registry runtime
files, eight test files and one CLI command. It contains no dependency, lockfile,
Convex registration, schema, cron or component changes. Shared registry contracts
reach Convex chat, so this candidate can also align its Describe contract wording,
version and external-result/continuation validators with the already merged web
release. Existing Convex chat already handles directory references separately;
this does not introduce new purchase or payment authority. The newer web/MCP
Describe implementation is not imported by Convex.

The native Functions dashboard exposed 834 root function/HTTP route names. The
candidate source produces the identical name set and SHA-256
`6cee0fe016e4806f73a7ba9d6578229136dfd1f3379ab2a452130d0391f1f0a6`.
The existing API-kind fixture covers 803 direct registrations; comparison also
accounted for 21 admin/workflow/migration wrappers and ten HTTP routes. No live
name was unexpected or missing. This verifies the surface, not function bodies
or argument validators. The CLI's full `function-spec` query timed out at the
provider's one-second execution limit on its initial attempt and one bounded
retry; the authenticated native dashboard supplied the successful read-only
fallback. No function was executed from that page.

Independent source review and Claude Opus 5.5 recommend the tested main-based
candidate with this carryover disclosed. Rebuilding from the declared older
revision would create a different, untested combination and preserve divergent
contracts. Commit the candidate before requesting deployment approval; retain its
exact revision and gated code fingerprints. Compare the native live function
surface and index preview before execution. After deployment, read back the
recorded revision and exercise directory and chat description paths.

Joel approved both production operations from
`d0a26e63f98fae756a82fcbfbeb1f46b7106c63f`. Native Convex deployed that reviewed
backend source to `joel-chan/agentic-economy/upbeat-cricket-954` at 22:39 AWST on
13 October, removing exactly these eight indexes and updating analytics
reconciliation, including the shared-contract carryover above. The nonsecret
`AE_RELEASE_SOURCE_REVISION` binding was then set to that exact commit and read
back; the production declaration was preserved. Both approved operations are
complete. The web release remains at the recorded base. Documents, generation, backfill,
cadence, payment authority, treasury and other environment bindings are outside
this change. Native Convex 1.45.0 dry run verified the exact production target and
listed these eight removals with no component installation/removal. Convex's large-index
deletion guard also applies to previews, so the successful preview explicitly
acknowledged it while retaining `--dry-run`. The approved actual deployment used
`--allow-deleting-large-indexes` after a fresh target/source check. A post-deploy
native dry run found no remaining index differences or component mount changes.
The final preview reported 108,365 documents in each affected search-table index
and 39,476 documents in each affected external-entry index. Those are live index
document counts, not a measurement of reclaimed storage.

Acceptance: ten native keyword, price, popular, adoption, category and Provider
queries returned identical ordered samples and generations before and after
deployment. Public health and registry reads returned 200. Native Aecon MCP
search and directory-reference Describe passed without a Quote or Call. Readiness
first returned 503, then 200 at 22:47 AWST without a recovery mutation; its cause
is unconfirmed. At 22:47 quoting reported unavailable and sellable false; at the
final 23:03 read, health/readiness were 200 and quoting was ready again, while
sellable remained false. The pre-deployment commercial state was not retained,
so causality is unverified. No live
chat-model or paid-purchase acceptance is claimed. The [deployment record](../operations/deployments.md)
retains the deployed source and observed limits.

Inspect the next normal refresh's outcome logs and component I/O. Source tests
establish mutation bounds and repair behavior; only native metering can establish
billed savings. Do not
force a full refresh just to obtain a performance number without a separately
bounded approval.

Rollback/fix-forward: base `6fce9ae10b9e93297531fa1d0d03d1268c1d4cbb` restores
the prior directory code and index definitions while retaining the merged registry
contracts. Rebuilding indexes consumes I/O and may take time. Do not use a database
restore or delete retained source evidence. Stop on unexpected schema changes,
missing source identity, failed candidate checks or observed catalogue regression.

## Operating defaults for database cost

Rank database work by native bytes and index/table footprint, separately from
function-call counts. Require a real caller before adding an index; review
retained query paths before removing one. Derived-data synchronization needs a
healthy replay that performs no unnecessary writes, plus bounded repair and
rollback tests. Prefer skipping unnecessary work before changing cadence or
adding infrastructure. Review production and non-production usage separately.
Measure the next normal run before attributing savings; treat backups, exports
and reconciliation as distinct cost sources. Financial history remains protected.
Use the normal Convex preview output. In pinned CLI 1.45.0, deploy `--verbose`
prints the start-push response, including environment variable values; it is
unsuitable for production evidence capture. Read only named nonsecret bindings.
Inventory comparisons must include framework-defined registrations and HTTP
routes. A direct-registration snapshot alone is not the complete live surface.
