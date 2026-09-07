## Completed cold-review source repair — 2026-09-08

The authoritative current acceptance and release-readiness receipt is at the top
of `docs/workflow/work/WF-20260905-vocabulary.md`. C01–C19, all thirteen discovery
gaps and the final test-consumer/Provider-label supplements are independently
accepted. Source/current documentation/package checkpoint: `5f313129775c91de88e6cef819800bd116e31168`.
The separate governance commit records this map and retained audit evidence.

Final evidence includes 4,200 unit, 1,109 integration (four existing skips),
402 conformance, 55 chat-conformance, 28 public browser (two viewport skips) and
14 accessibility passes; focused final deltas, typecheck, lint, codegen,
isolated generated-source equality, installed CLI Node 20/22 help/package
integrity and final build checks pass. TypeScript standards still fails on its
unchanged 26-finding baseline. Final changed-source Doctor finds no new issues;
the advisory commit hook reports 30 warnings. No aggregate-green claim.

All 47 unrelated dirty paths and 36 original audit files remain preserved.
Recovery, dataset rebuilding, deployment, operational G02 policy/ingestion,
Package 6/7 and full hosted/live commercial acceptance remain parked and open.
The earlier queue and evidence below are dated history, not current pending work.

## Current source closeout — 2026-09-07

All ten module groups, their material corrections, current documentation and
historical-header preservation passed independent review. The owned source
checkpoint is `3770b43bac9bf3ea11478664ee8249ec4ddf505e`. It includes the formatter
cleanup explicitly approved by Joel and leaves unrelated cleanup outside the
commit; two mixed files retain only their unrelated helper changes unstaged.

Final verification on Node 22.22.0 / npm 11.5.1:

| Check | Result |
| --- | --- |
| TypeScript and existing Convex codegen dry-run | Pass |
| Full unit suite, sequential, unchanged time limits | 463 files / 4,093 tests pass |
| Integration | 113 files / 1,091 tests pass; one file / four tests skipped |
| Type tests / imports / SEO / UI contracts | 4 / 49 / 28 / 2 tests pass |
| Lint / production build and generated integrity | Pass |
| Earlier unchanged-input conformance / release architecture / anatomy | 391 / 21 tests and anatomy pass retained |
| TypeScript standards | Fails on the exact original 26 findings; zero additions/removals |
| Default parallel test:all | Fails on seven five-second CLI timeouts; the five files pass 44/44 sequentially and the full sequential unit suite passes |
| Commit-hook React Doctor advisory | 74/100; 116 warnings; commit exits zero |
| Installed CLI Node 20/22 matrix | Pending Joel's explicit runtime exception decision |

The source evidence is accepted with these limitations. No green aggregate,
clean standards/React Doctor result, installed-package compatibility, hosted
deployment, data cutover, Package 6/7 promotion, legal approval or production
proof is claimed. Existing source issues are resolved at their reviewed source
boundary; package verification, hosted/runtime and overall closeout remain open.

Exact final receipts: `/tmp/ae-final-unit-sequential-20260907.log`,
`/tmp/ae-final-integration-20260907.log`,
`/tmp/ae-final-downstream-checks-20260907.json`,
`/tmp/ae-final-ts-standards-baseline-comparison-20260907.json`,
`/tmp/ae-final-test-all-20260907.log` and
`/tmp/ae-final-release-integrity-20260907.log`.
Earlier sections below are dated checkpoints and do not supersede this status.

## All ten module reviews accepted; final runtime checks — 2026-09-07

Independent oversight accepted the complete current documentation boundary
(21 paths: 17 changed, four preserved), the four historical headers and their
unchanged original bodies. All ten module groups now retain whole-module source
acceptance. The documentation/discovery check passes 46/46 tests and the coherent
compiler reports zero errors.

Public, Catalogue, Connection, Provider and Call runtime corrections are also
accepted. Call's one-file correction passes 30/30 tests and preserves attribution,
refusal and unexpected-error assertions. Money's two-file correction passes
12/12 focused tests and is completing handoff; Policy's one-file return follows.
Final integrated verification and owned local commits remain open.

The standards scan retains the exact recorded 26-finding baseline; this is not
a standards pass. The built CLI archive passes artifact integrity checks, while
its unchanged Node 20/22 compatibility test awaits Joel's explicit runtime
exception decision. Hosted deployment, data cutover, Package 6/7 promotion and
production proof remain separate and unperformed.

## Documentation in review; final runtime consumers remain — 2026-09-07

The current documentation owner returned all 21 allowed paths: 17 changed and
four preserved. Root applied the owner's exact one-word deployment-guide handoff.
The complete candidate is `/tmp/ae-current-docs-review-candidate-20260907/manifest.json`.
Only ABOUT changed within brand-copy. Four historical headers are separately
captured in `/tmp/ae-history-header-candidate-20260907/manifest.json`; their original
bodies and 32 other historical files remain byte-for-byte preserved. Independent
whole-documentation and header review is underway; no documentation acceptance yet.

The final documentation/discovery test run passes all 46 cases in seven files,
and the coherent compiler reports zero errors. Public's two SEO fixture corrections
are independently accepted, retaining its prior complete source, seven-helper
and nine-runtime-consumer reviews. Catalogue, Connection and Provider runtime
returns are also accepted. Call, Money and generic Action execution still own
four failing runtime-consumer files from the full-suite run; they return serially.

The standards scan has returned to its exact recorded 26-finding baseline after
three existing filename predicates were updated. This remains an expected failure,
not a standards pass. Final full-suite acceptance is open. The unchanged built CLI
archive passes package-integrity checks, but its Node 20/22 compatibility matrix
awaits Joel's response to the explicit test-only runtime exception question.
No deployment, data cutover, Package 6/7 status promotion or local source commit
has been performed as part of this closeout yet.

## Earlier-owner returns accepted; conformance passes — 2026-09-07

Policy, Connection, Catalogue, Provider, Call and Money integrated returns are
all independently accepted. Each retains its prior whole-module review.
Call's exact test-only import entry passes all 11 module-boundary checks.
The broader existing conformance command now passes: 42 files, 391 tests,
exit 0 (`/tmp/ae-integrated-conformance-20260907.log`). Its inputs are independent
of the remaining Public release-helper correction.

Public is the sole active source writer, completing the same three reviewed
contract corrections and their direct tests. Coherent compiler, final imports,
build/artifact acceptance and documentation remain open. The completed targeted
and conformance checks do not imply final release readiness.

## Integrated Catalogue return accepted; Provider return active — 2026-09-07

Independent oversight accepted the two-file Catalogue fixture correction in
`/tmp/ae-integrated-catalogue-review-20260907/manifest.json`. Current Tool
references and the public reference creator now match their producers. Protected
identity inputs and assertions remain unchanged. Two existing suites passed all
11 tests; scoped lint and diff checks passed. Prior whole-module acceptance is
retained, as are the accepted Policy and Connection integrated returns.

The same Provider owner now holds the eight recorded consumer paths and two
conformance failures. Public's independent release-helper correction continues.
Call and Money returns follow serially. No full source, artifact or release
acceptance is implied; the next coherent compiler check follows writer handoff.

## Public review requires three contract corrections — 2026-09-07

Independent review of the complete Public candidate requires correction before
acceptance. Report: `/tmp/ae-public-independent-review-20260907.txt`.
The same Public owner is addressing one consolidated batch:

- Acquire a Quote and preserve its reference and command identity across HTTP/MCP Call replay.
- Consume the actual public search v3 and describe v2 projections, including withdrawn readback.
- Unwrap hosted MCP structured results and handle MCP errors explicitly.

The correction includes tests against the actual contracts. The earlier candidate
and review remain the baseline; only the material corrective delta returns for
review. No public API widening or hosted execution is authorized by this return.
Public and final artifact acceptance remain open.

## Integrated consumer returns remain open — 2026-09-07

Public's coherent root checkpoint is86TypeScriptdiagnostics29files. Existing
module attribution is recorded in issue32: Public19/13 currently returning to
its sameowner; Provider42/8,Call18/3,Catalogue4/2,Policy2/2,Money1/1 require
returns through their existing ownership. The eight earlier bounded acceptance
receipts remain evidence; they do not establish complete integrated consumer
coverage. No second queue or root fallback writer is created. Public/artifacts,
current docs, integrated returns and owned local commits remain unfinished.

# One familiar vocabulary across Agentic Economy

## Storage SOURCE ACCEPTED — 2026-09-07, eight of ten groups

Independent oversight confirmed closure of the sole recorded storage return dependency. Prior indexed-link/predicate review,22/22schema/import checks, scoped checks and native dry-run/generation plus4/4type tests were already satisfied. Accepted Tool/Quote/Call/Money producers and exact five-suite29/29PASS (`/tmp/ae-money-storage-return-20260907.log`) resolve the seven remaining Workpool/managed-booking failures. No earlier storage review item remains. Formal source acceptance8/10; Group9 Public implementation and Group10 current docs/integrated acceptance remain. This is bounded storage source acceptance, not data rebuild, runtime cutover or release permission. No repeat accepted checks required.

## Money SOURCE ACCEPTED — 2026-09-07

Independent oversight accepted the corrected immutable Money candidate after reviewing the complete42path boundary and exact2file readBooking correction. Current accepted baseline `/tmp/ae-money-review-corrected-candidate-20260907/manifest.json`. No remaining Money finding; protected v1 digest/claims and historical receipt mapping accepted. Seven of ten source groups formally accepted. Mandatory storage return29/29PASS is retained; Group9 shared discovery/callhelper defects remain separately owned. Public implementation now advances from completed inventory. No global/compiler or225/29 repeats required solely for the two-field correction. Integrated checks, artifacts/docs, localcommits and parked runtime work remain open.

Label: wayfinder:map

## Destination

Implement the accepted familiar vocabulary across AE's code, tests,
documentation, interfaces and stored data through bounded issues, with
observable verification and no loss of records or behaviour.

## Notes

- **Latest execution override — complete module ownership (2026-09-06):** retain
  this map, accepted vocabulary/protected exceptions and module dependency queue.
  The unit of progress is module contract complete, behavior verified, review
  resolved. Before editing each module, inventory definitions, schemas,
  serializers, exports, callers, fixtures, tests, generated surfaces and explicit
  cross-module dependencies. One owner carries the complete boundary through
  implementation and corrective work; coherent subcomponents may be delegated.
  Newly found in-module callers stay with that owner. Context continuations
  preserve the inventory, completed work, remaining work and verification; they
  do not restart investigation or create new projects. Review the complete module,
  then only material corrective changes. Run global compiler/integration once
  coherent, attribute residuals to module owners and advance. TypeScript verifies
  the cutover; it does not select work. Use one actual working checkout, with
  comparison baseline read-only. The prior micro-slice/finite-error dispatch
  controls below are superseded where inconsistent with this override.

- **Latest execution override — 2026-09-06:** stop reactive batches. Use the
  single dependency-ordered repair queue below, grouping complete module/root
  causes across definitions, exports, callers and tests. One group is active;
  finish and verify it before advancing, except for an explicitly recorded
  dependency. Refresh the integrated failure count after every group and close
  satisfied existing issues. Recovery and deployment remain parked. Earlier
  bulk-pass instructions do not authorise further unrelated parallel dispatch.

- Charting was initially planning-only. Joel's execution approval makes this map carry bounded implementation and repeated issue pickup/closure through `wayfinder` and `wayfinder-delivery`. Reuse accepted decisions; do not reopen product planning. The latest sequential-group rule replaces the old one-ticket-per-session limit and all earlier batch-dispatch instructions.
- [Work record](../../docs/workflow/work/WF-20260905-vocabulary.md) owns overall approval, execution and acceptance status. This map indexes decisions; child tickets own answers. Use the existing local-Markdown tracker, not a new external service.
- [Selected implementation plan](../../docs/designs/vocabulary-rationalisation.md) is the single accepted plan for the complete refactor. Implementation issue bodies own exact slices, mappings, exclusions and closure evidence; this map does not become a second status record.
- The rejected standalone tracking-register proposal is superseded by this Wayfinder map and its child issues; do not introduce a parallel tracker. Separately, purchase resolution/status remains derived from the existing linked records, not a new purchase object.
- Read [PRODUCT](../../PRODUCT.md) first. [CONTEXT](../../CONTEXT.md) owns canonical definitions; issue 09 applies the accepted language and retires [the glossary proposal](../../UBIQUITOUS_LANGUAGE.md) as an active authority. Do not maintain two live glossaries.
- Historical charting scope: Joel initially accepted whole-platform coverage and offered to take a backup. His later accepted implementation plan fixes Tool and all other mappings in issues 02/05; those choices are no longer tentative. Backup completion is still evidence-dependent.
- **Execution override — 2026-09-05:** Joel's accepted task request authorises carrying implementation through the existing Wayfinder issues, including repeated issue pickup, fixes, verification and closure. This supersedes the charting-only status for this refactor, while preserving the requirement for explicit issue ownership, reviewable sequencing and acceptance evidence. It does not claim application implementation, Convex/financial backup proof, destructive reset or deployment before those steps are actually evidenced.
- A fresh native Convex export passed archive-integrity and isolated data-only restoration checks on 2026-09-05; issue 31 records private locations, matched content digests and limitations. Functional recovery, financial reconciliation and hosted cutover remain unproved. The Phase 0 source archive is separate rollback evidence. Never put secrets, raw production records or backups in this tracker.
- Mature Australian Locus/Nevermined experience first, Whop for supporting patterns. No differentiation requirement, proprietary terminology or hand-built substitute for maintained platform behaviour. Do not copy a reference's term when it means a different thing.
- Preserve financial, authority, delivery and recovery distinctions. Do not infer that every old name is one-to-one renameable. Coordinate AE-owned client changes; identify any independently used contracts before choosing compatibility exceptions.
- Package 6 closeout and Package 7 implementation are held. Their [release handoff](../../docs/guides/package-6-plugin-release.md#closeout-pause-handoff) and [planning record](../../docs/workflow/work/WF-20260905-package-7.md) retain their own outstanding requirements. Rename work does not close them.
- The earlier dirty main checkout was preserved, with Joel's “commit all dirty” approval, in local checkpoints `971660119` and `645a34842` on `codex/vocabulary-rationalisation`. Root verified a clean worktree at the latter checkpoint before resuming workers. This is the reproducible pre-source-refactor boundary, not a release candidate or deployment. The earlier archive and inventories remain dated evidence; research branches must not be assumed to contain this implementation.

## Source-delivery waves — 2026-09-06

The native goal covers coherent, reviewed, locally verified source and release
readiness. Full-plan live acceptance remains open. These labels index the same
queue below, not a second dispatch order: Wave 0 = verified pickup/storage
checkpoint; Wave 1 = row 2 policy/authorization (accepted); Wave 2 = row 3
connection/consent (accepted); Wave 3A/3B = rows 4/5 Tool catalogue (accepted)/Provider supply (accepted);
Wave 4A/4B = rows 6/7 Quotes (SOURCE ACCEPTED)/Calls (SOURCE ACCEPTED); Wave 5 = row 8 money/durable attribution (implementation active)
and mandatory storage return; Wave 6 = row 9 public/installed consumers;
Wave 7 = row 10 integrated checks, review, current docs and owned commits;
Wave 8 = source release-readiness handoff. Recovery/data/deployment remain
parked. Child issues retain exact assignments and acceptance; issue 32 owns
integrated counts and the work record owns current status.

## Dependency-ordered repair queue — 2026-09-06

This is the only dispatch order. Child issues own the implementation details;
the [source verification checkpoint](issues/32-verify-source-and-contract-completeness.md#integrated-repair-checkpoint--2026-09-06)
owns the integrated counts and frozen diagnostic inventory. Historical claims
below and in issue comments are not active worker assignments.

| Order | Complete repair boundary and existing owners | Dependency / bounded execution |
| --- | --- | --- |
| 1 | **Storage names and indexed reads** — [Call storage](issues/16-rename-purchased-invocations-to-calls.md), [durable records](issues/18-propagate-money-and-durable-record-names.md), [native artifacts](issues/22-regenerate-shared-artifacts.md) | First: repair mismatched field/index definitions, affected indexed readers and schema/lookup tests together. Correct accidental Tool naming of administrative secret-lifecycle identity. Then serialize native Convex generation. No data operations. |
| 2 | **Spending policy and authorization contracts** — [Spending policies and request authorizations](issues/12-rename-spending-policies-authorizations.md) | Depends on storage. Complete module: canonical/stored-grant normalization, budgets and authority consumers in Call/approval paths, including exports, direct consumers, development policy fixtures and tests. Preserve canonical digest keys and production refusal of unrestricted test access. |
| 3 | **Agent connection and consent** — [access contracts](issues/12-rename-spending-policies-authorizations.md), [Customer and Agent screens](issues/23-update-customer-and-agent-screens.md) | Depends on policy. Complete lifecycle: OAuth/principal persistence and server consumers through consent/console screens and route tests. Carry Tool selection, approval fields, credential ownership and revocation together; standard OAuth fields remain unchanged. |
| 4 | **Tool catalogue and comparison** — [callable catalogue](issues/13-rename-callable-catalogue-to-tools.md), [catalogue screens](issues/24-update-catalogue-and-call-screens.md) | Depends on storage/policy. Complete boundary: published Tool mappings and read/search projections; market evidence/comparison exports through route/UI consumers. Each owns its fixture producers, unit/integration tests and direct callers. Keep external registry metadata and portfolio Services distinct. |
| 5 | **Provider publication and connections** — [Provider supply](issues/14-rename-provider-supply-terminology.md), [Provider screens](issues/25-update-provider-screens.md) | Depends on catalogue/access. Complete boundary: publication/admission and owner funnel; connection/offboarding; canary/development fixtures and their callers. Include Provider workspace and Package 5 script/test consumers of each contract. Do not execute live canaries or scripts. |
| 6 | **Quote contract and eligibility** — [Quotes](issues/15-rename-commitments-to-quotes.md) | Depends on catalogue/policy/Provider contracts. Own Quote validators, RPC adapters, current-Tool lookup and immediate callers/tests together. Verify caller/input/price/expiry/authority drift, including original digest vectors. Preserve qualified SuppliedQuote. |
| 7 | **Call lifecycle and receipts** — [Calls](issues/16-rename-purchased-invocations-to-calls.md), [next actions and purchase outcomes](issues/17-rationalise-next-actions-and-purchase-outcomes.md), [Call screens](issues/24-update-catalogue-and-call-screens.md) | Depends on Quote/access/Provider contracts. Complete boundary: admission and authority; dispatch/work completion; recovery/status/receipt view through its route and tests. Existing Workpool harnesses belong to their consuming slice. Include signed evidence projections; no new Call on uncertain recovery. |
| 8 | **Money and durable attribution** — [money/durable names](issues/18-propagate-money-and-durable-record-names.md), [money screens](issues/26-update-money-and-business-record-screens.md) | Depends on Call contracts. Complete boundary: managed booking/authorization; qualified-use/provider consequence; usage/credit/business-record consumers. Each owns its codecs, tests and release-script consumers. Preserve financial namespaces, amounts, external x402 fields and delivery/payment distinctions. |
| 9 | **Public and installed consumers** — [HTTP/MCP](issues/19-cut-over-http-and-mcp-contracts.md), [CLI](issues/20-update-cli-consumers-and-distribution.md), [discovery/plugin instructions](issues/21-update-discovery-and-plugin-instructions.md), [artifacts](issues/22-regenerate-shared-artifacts.md) | Depends on the producing contracts above. Complete boundary: shared action/router adapters and MCP tests; CLI commands/terminal tests; discovery/plugin/chat/command-panel consumers and release harness tests; native route/CLI/package outputs and parity. No standalone test-renaming sweep. Route generation may run earlier only as a documented prerequisite for an earlier group's typed route consumers. |
| 10 | **Current documentation and integrated acceptance** — [current docs](issues/27-reconcile-current-documentation.md), [history](issues/28-preserve-and-cross-reference-history.md), [source completeness](issues/32-verify-source-and-contract-completeness.md) | Depends on implemented contracts. Correct current examples and links; preserve historical evidence. Run the accepted integrated checks and resolve failures in their owning group. This does not release the parked runtime/cutover issues. |

Execution controls:

- **Identified storage return dependency:** schema/import checks pass, but the
  complete selected Call/money suites remain blocked by the old publication
  fixture result (`publication.operationRef`), old Quote/Call inserted shapes
  and RPC arguments. The storage issue records seven failing tests and the
  exact rerun. Keep storage open; its return path runs through the existing
  Tool/Quote/Call/money contract groups (and their policy prerequisites). This
  is the only recorded reason to leave the storage group after its native
  checkpoint, not permission to pick arbitrary easier errors.

- **Resolved policy identity prerequisite:** the shared published Tool identity
  projection and original Call authority vector passed their owner tests and
  independent review. Qualification projections and direct fixtures are also
  accepted in issue12's consolidated policy record. These remain protected
  dependencies of the catalogue module; do not restart their review.

- One owner holds the complete inventoried module boundary through implementation,
  verification and material corrective work. Record definitions, schemas,
  serializers, exports, callers, fixtures, tests, generated surfaces and
  cross-module dependencies before editing. Newly discovered in-module callers
  remain with that owner. Delegate coherent subcomponents only when useful.
- Review the completed module, then only material corrective changes. Preserve
  completed inventory, implementation and verification in continuations rather
  than restarting investigation. Root retains integration, shared generated
  outputs and index ownership.
- Finish and verify a group before advancing. A dependency switch must name
  the failing check, exact missing upstream contract, owning issue and return
  point. Resolve cycles through explicit producer/consumer dependencies within
  the owning modules without declaring unfinished boundaries complete.
- After each group, refresh the same integrated compiler count, record focused
  tests separately and review full acceptance of its owner issues. Close all
  satisfied issues; leave explicit remaining criteria on broader issues.
  Zero diagnostics is not runtime proof. A downstream test importing a changed
  contract stays with that contract's module, even if stored in another directory.
- **Parked:** backup/restore expansion, local dataset rebuilding, hosted
  cutover and deployed acceptance. Their issues remain open, not waived.

## Decisions so far

- [Establish familiar reference terms and their meanings](issues/01-reference-language.md) — Tool is defensible, but several similar names mean different things; whole-platform glossary gaps and evidence limits are recorded for the terminology decision.
- [Establish the implementation execution baseline](issues/08-execution-baseline.md) — The preserved dirty checkout is recoverable from the private source archive and checksum manifest; the selected implementation plan and execution-carrying issue queue are now the handoff boundary.
- [Accepted vocabulary](issues/02-agree-language.md) and [coordinated cutover](issues/05-contract-cutover.md) — resolved by Joel's accepted plan, including protected byte formats and no legacy-client aliases.

## Historical preparation and completed source boundaries

- [Canonical language](issues/09-consolidate-canonical-language.md).
- [Implementation issue preparation](issues/37-prepare-implementation-issues.md) — resolved: all 37 issues exist with finite mappings, sequenced ownership and staged generator checkpoints.
- [Engineering review](issues/29-engineering-review.md) and [developer-experience review](issues/30-developer-experience-review.md) — planning gates resolved; their implementation/live acceptance remains with the assigned owners.
- [Customer/Agent source implementation](issues/10-rationalise-customer-agent-terminology.md) — resolved with local checks and scoped commit `d5e9c46a4`; live acceptance remains separate.
- [Generic Action execution](issues/11-rename-generic-action-execution.md) — resolved locally in `df44826b7`; focused source checks and independent caller review passed. Protected evidence bytes and paid Call boundaries remain unchanged; integrated/live acceptance is separate.
- [Shared authority hash material](issues/38-preserve-shared-authority-hash-material.md) — resolved locally in `fe09a6463`; three existing hash sites share one helper through the approved runtime entry. No new module, framework or behavior. Subsequent policy work follows the repair queue, not an independent dispatch entry point.
- [Test cutover preflight](issues/31-hosted-cutover-preflight.md) — [current read-only findings](../../docs/operations/vocabulary-cutover-preflight.md); source backup does not satisfy database recovery proof.

## Not yet specified

- Additional concept boundaries may emerge when generic action execution and callable supply are traced; create precise decisions then rather than inventing replacement objects now.
- Supported clean-dataset and restore procedures still need exact execution evidence; the accepted strategy is a fresh test-data rebuild, not a custom migration engine.

## Out of scope

- New commercial modes, payment rails, agent orchestration, feature expansion or wholesale product redesign.
- Completing or waiving unrelated Package 6/7 defects as part of a rename.
- Rewriting historical findings as current verification, silently editing third-party protocol vocabulary or discarding retained records.
- Hosted deployment, destructive reset, Convex/financial backup execution and test cutover remain out of scope for this Phase 0 baseline until the deployment-operations issue records exact targets and restoration evidence. Later approved delivery issues define their boundaries; source implementation proceeds only through the selected plan and owned issue bodies.
