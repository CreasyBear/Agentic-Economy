# WF-20260905-vocabulary: one familiar vocabulary across Agentic Economy

Status: active
Owner: Joel / current vocabulary-rationalisation task
Started / last reconciled: 2026-09-05

## Current execution summary — 2026-09-05

- Status is **active**. Joel accepted the complete mature-vocabulary refactor
  plan in the current task, including implementation, issue pickup and closure
  through the existing Wayfinder records.
- The selected plan is
  [Mature vocabulary refactor — implementation plan](../../../docs/designs/vocabulary-rationalisation.md).
  It is the single current plan for the fixed mappings, protected boundaries,
  issue sequencing, verification and closeout. Its target language is the
  execution contract; the terminology decision ticket still records rationale
  and exceptions, not a license to invent competing names. Baseline SHA-256:
  `6456e2325ae9333d3e79efd937e01382142fa4e1ebdc4c84bd0440fae61e2cea`.
- Phase 0 is in progress: the execution branch and private source baseline are
  established, issue 08 is resolved with recovery evidence, implementation
  issues are being prepared/assigned, and separate engineering and developer-
  experience reviews are running. Canonical-language issue 09 is assigned and
  underway; no application-source rename has been delivered yet.
- The [read-only operational preflight](../../operations/vocabulary-cutover-preflight.md)
  records current hosted test bindings and 20 pending funding commands, 18
  carrying external/provider references. Hosted reset remains blocked on
  reconciliation, fresh Convex backup/restore proof and callback isolation.
  These do not block independent source work. Unrelated alert/cost gaps are
  operational follow-up, not additional refactor acceptance criteria.
- The rejected standalone tracking-register proposal is superseded by the
  existing Wayfinder map and child issues. No parallel tracking system is
  introduced. Separately, the product retains one purchase chain and its
  existing records.
- Production/mainnet rollout, destructive database reset, Convex/financial
  backup proof and hosted cutover remain unperformed and require their own
  recorded evidence.

### Coordinator checkpoint — 2026-09-05 08:53 UTC

- Issues 10–16 and 19–22 have concrete source-informed assignments; 23–26 are
  being prepared. Remaining queue preparation and independent review corrections
  are still open. No application source rename or generated-file update has
  begun; canonical-document issue 09 is the completed implementation slice.
- The coordinator corrected issue 22's dependency cycle: a generator checkpoint
  can run after its owning source patch but before that source issue closes.
  Required generated types precede the accepting type/test checkpoint. Final
  artifact closure still requires the complete producer/consumer receipts.
- Additional protected-material crossings are assigned to their source owners:
  agent-policy Tool selection (13), nested per-Call budget fields (16), request
  authorization and authority labels (12), and HTTP command digests affected by
  those fields (12–16). Existing encoding boundaries must emit the original
  canonical keys and bytes, proved by literal baseline vectors. No generic
  compatibility mapper or parallel public API is authorised.
- The existing Convex codegen implementation explicitly states it does not
  change deployed code, but starts a stopped selected local backend. A supported
  explicit hosted-test analysis target is an alternative for operational review;
  it has not been selected or run. No codegen, deployment, backend restart,
  database reset or financial mutation is implied by this investigation.

### Earlier coordinator checkpoint — 2026-09-05 08:22 UTC

- Engineering first-pass [report](../../../.scratch/vocabulary-rationalisation/reports/29-engineering-review.md)
  returned concrete corrections; issue 29 remains open for their assignment
  and the complete queue check. DX review is still running. No review gate
  has been waived.
- Coordinator accepts the qualified `AgentAccessPrincipal` /
  `agentAccessPrincipals` IAM access-binding exception: it is not the canonical
  Agent identity and is not to become another Agent or Credential record.
  Role-specific fields outside protected material still require issue 10's
  exact mapping. Hash keys such as `agentPrincipalRef` stay byte-stable.
- Generic execution references and purchased Call references need separate
  mappings; MCP action classification must move with the new public IDs.
  Distinct external registry/portfolio objects remain distinct, but this does
  not exempt their links to renamed Tools/Quotes/Calls from propagation.
- `npm run test:types` passed: 1 file / 4 tests. This is additional pre-refactor
  baseline proof, not renamed-source acceptance.
- Compared all 2,096 source-baseline checksums again. Exactly 13 existing
  paths differed, all the authorised canonical documents, vocabulary issues,
  map and work record. No archived application-source path differed. New
  review/preflight files are separate task outputs, not part of that census.
- Existing `test:cli-package` runs an installed-client compatibility matrix
  using downloaded Node 20/22 runtimes. This conflicts with the project-wide
  Node 22 rule; Joel has been asked whether the existing CLI-only matrix is an
  exception. It has not been run or weakened. `test:imports` builds CLI output
  and therefore needs a serialized generated-artifact checkpoint.

## Direction and approval

- Request: use ubiquitous-language first, then wayfinder and wayfinder-delivery to rationalise vocabulary across code, tests, documentation, tables and databases.
- Accepted product direction: mature Australian equivalent of the familiar Locus and Nevermined experience; no current requirement to invent differentiation.
- Product anchors: [PRODUCT](../../../PRODUCT.md), [CONTEXT](../../../CONTEXT.md), [roadmap](../../../IMPLEMENTATION_ROADMAP.md).
- Language proposal: [UBIQUITOUS_LANGUAGE.md](../../../UBIQUITOUS_LANGUAGE.md), proposed revision 1; not a second accepted glossary.
- Wayfinder destination: an agreed vocabulary and safe, sequenced migration plan covering all affected consumers and retained data, ready for bounded implementation and real-environment verification. [Decision map](../../../.scratch/vocabulary-rationalisation/map.md).
- Historical charting approval (superseded by the current execution summary): Joel authorised glossary and migration planning in this task; at chart time no selected implementation revision, database cutover, destructive reset or deployment had been approved.
- Selected plan: [Mature vocabulary refactor — implementation plan](../../../docs/designs/vocabulary-rationalisation.md), saved as the single accepted plan for issue preparation, bounded implementation, verification and closeout. It preserves the fixed language, protected boundaries, package holds and no-handrolling rules supplied in Joel's task request.
- Execution override — 2026-09-05: Joel's accepted task request authorises carrying implementation and repeated issue pickup, fixes, verification and closure through the existing Wayfinder issues. This supersedes the earlier planning-only status for this refactor, but does not claim application implementation, Convex/financial backup proof, destructive reset or deployment without the corresponding evidence.
- Scope answer on 2026-09-05: "yeah i think we need to do the whole thing. i'll take a full backup at the same time" in response to coordinated updates of AE-owned clients while protecting independently used integrations. Whole-platform coverage is accepted; the exact cutover remains to be designed. Historical note: Joel's Convex/financial backup was planned at chart time and is still not evidenced or restore-tested; the Phase 0 source archive below is separate rollback evidence.
- Scope boundaries: names and the necessary compatibility, data-preservation and behavioural proof; no incidental commercial redesign, new payment rail, feature programme or wholesale history rewrite.

## Acceptance and evidence

| ID | Observable result | Required environment | Evidence | Result / remaining proof |
| --- | --- | --- | --- | --- |
| Language | Familiar terms distinguish users, customers, agents, callable supply, permission, quotes, Calls and money without inventing new records. | Documents and live discussion with Joel | Accepted plan mappings, glossary decision record and protected-boundary evidence | Target mappings are fixed by the accepted implementation plan; decision issue 02 retains rationale, examples and any explicit exceptions. |
| Map | Decisions cover internal names, public consumers, persisted data, immutable identities, generators, tests and release sequencing. | Repository and selected tracker | Linked decision map and child issues | Vocabulary/cutover decisions 02/05 and baseline 08 resolved; preparation 37 remains incomplete. |
| Plan | One selected migration plan identifies owned slices, compatibility strategy, data handling and observable acceptance in each target environment. | Source plus verified deployment/data inventory | Accepted implementation plan and issues 29–31 | Approved by Joel; execution reviews and detailed dispatch queue still pending. |
| Delivery | The approved migration preserves behaviour, money, history and recovery, repairs consumers and has a verified scoped local commit. | Environments selected in the accepted plan | Baseline checks and operational preflight only | Canonical-document work underway; no source rename, commit, data reset or refactor deployment proved yet. |

## Execution and handoffs

- Historical charting branch/HEAD: `main`, `91a4fff6f68fecd63ac39bbbd4509de0bc0d5b0d`.
- Phase 0 execution branch/HEAD: `codex/vocabulary-rationalisation`, `91a4fff6f68fecd63ac39bbbd4509de0bc0d5b0d`; established after read-only branch collision checks and without discarding the shared dirty worktree.
- Starting index: no staged paths. The shared worktree already contains extensive Package 4–7, infrastructure, workflow and product-document edits; none becomes owned by this goal merely by being present.
- Historical charting ownership snapshot (superseded): this session owned the new glossary, this work record, one workflow-index link and removal of the exact glossary ignore rule. Existing product-document and application changes remained outside that charting session's edit scope.
- Current Phase 0 ownership: this baseline subtask owns the selected plan, this work record, the existing map and issue 08 evidence only. Implementation issues 09 onward, reviews and deployment-operations records have separate owners; shared application/schema/generated/client paths remain outside this subtask.
- Skill sequence: ubiquitous-language proposal; Wayfinder destination/frontier discussion using grilling and domain-modeling; later delivery plan reviews and one direction approval before implementation. No office-hours or plan-review completion is claimed; the product problem and maturity-first direction are reused from the preceding discussion.
- Tracker: use the existing local-Markdown convention at `.scratch/vocabulary-rationalisation/map.md` with one file per child decision. This effort's exact paths must remain visible to Git. The map owns decision links, not a competing delivery-status record.
- Current CONTEXT remains authoritative until proposed terms are resolved. Domain-modeling should update accepted definitions as decisions land; the migration mapping must not become a second product vocabulary.
- Historical charting next action (superseded): claim and work through Agree the vocabulary without merging different concepts with Joel, using the completed reference report. Charting itself resolved no human decision ticket.
- Current next action: finish implementation issue creation and assignment from the accepted plan, complete independent engineering and developer-experience reviews plus the deployment-operations target/recovery inventory, then dispatch the sequenced implementation queue. Preserve Package 6/7 holds and carry every open acceptance item forward.

### Historical charting resumption and package coordination — 2026-09-05

- Joel's terminology answer was "tool probably". Record Tool as a working choice, not final glossary or migration approval; CONTEXT is unchanged.
- Joel explicitly instructed Package 6 to checkpoint and hold and Package 7 to align its plan with maturity-first direction and vocabulary rationalisation. Both tasks acknowledged and recorded their handoffs.
- [Package 6 closeout handoff](../../guides/package-6-plugin-release.md#closeout-pause-handoff) preserves its unfinished source gate and deployed/client acceptance gaps. Its checks are dated evidence from that task, not tests rerun here. Do not duplicate its checklist or erase gaps during migration.
- [Package 7 work record](WF-20260905-package-7.md) owns the held implementation and naming dependencies across its six planned tasks. Its prior reviews and 47 foundation tests do not establish validation of future migrated behaviour.
- Resumption check: Node 22.22.0 / npm 11.5.1; index empty; extensive concurrent dirty work remains. The earlier resumption edited only the proposal's tentative Tool wording and this work record. Charting adds the decision map and research evidence, not source, schema or stored data changes.
- The decision map is now charted following Joel's whole-platform scope answer. No human decision ticket or implementation plan is approved by chart creation. This charting session additionally owns `.scratch/vocabulary-rationalisation/` and its reference report. Delivery resumes after the shared decisions and relevant plan reviews, followed by one explicit approval of the resulting implementation direction.

### Phase 0 execution baseline — 2026-09-05

- The branch was established at the preserved HEAD above. The index was empty;
  no paths were staged, reset, discarded or committed by this baseline task.
- At the captured boundary the shared checkout contained 131 modified tracked
  paths and 122 untracked files (2,130 tracked/untracked paths in the Git
  snapshot; porcelain collapses some untracked directories). The full status
  and path inventories are retained outside the checkout at
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/status.porcelain`,
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/unstaged.name-status`
  and
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/untracked.paths`.
  Existing source,
  package, infrastructure, research, plugin, test and documentation work is
  concurrent work and is not owned merely because it is present.
- Private source rollback archive (not Convex or financial-backup proof):
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/source-baseline.tar`, captured at
  `2026-09-05T07:39:15Z`, SHA-256
  `422b7bcfb2a8f694db0ce824bf2ebaadea7d3ff3c150c71ca7b8b367338b7fb2`.
  It includes 2,096 tracked/relevant untracked source and documentation paths;
  34 temporary or sensitive-environment paths were excluded (`.impeccable/`,
  `tmp/`, environment files and sensitive key/state patterns). Dependency,
  cache, build-dump and secret-path scans passed; no secret contents were put
  in this record.
- The tracked `.env.example` template was preserved separately because it is a
  dirty configuration input used by refactor consumers. Its private supplemental
  archive is
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/env-template-baseline.tar`,
  captured at `2026-09-05T07:46:11Z`; archive SHA-256 is
  `7222500821bcb701a7a5b739d52672db31ddcff49e329abf517b3c52e8bd0c8d`, and
  worktree/extracted SHA-256 is
  `69cddf6e54515cf358740453f9356269140795116bdb9acd2b3aae450d76cb5e` for
  both. No environment value is reproduced in this record.
- Per-file SHA-256 manifests are retained at
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/worktree.sha256`
  and
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/archive.sha256`.
  Native `tar`
  listing and extraction to
  `/tmp/ae-vocabulary-source-extract.aEzWXp` were successful, and the complete
  2,096-line checksum comparison passed. Representative dirty tracked and
  untracked/source bytes matched: `PRODUCT.md`
  (`2ecf35a926ad80e334f9d25775e47d69918777fb96dd3c40fdc23c7923028882`),
  `src/modules/actions/index.ts`
  (`43a5c5cce624fe0427a4e6dde96fe732fab71529570966e3042dbe94e3dd7c17`),
  `.scratch/vocabulary-rationalisation/issues/08-execution-baseline.md`
  (`b4e61fb9aa24503b319dc3c7ca549bd545d1b1eecb429a93d79343c69450127a`) and
  `convex/moneyStripeWebhookInbox.ts`
  (`88fae68aed95c4c55f7ef6b14771702dc7924b5c321e463ca5c9732fc44fc479`).
  The temporary extraction was removed after verification; the persistent
  backup directory is private (`0700`).
- Coordinator baseline checks were recorded separately from refactor proof:
  `npm run typecheck` passed; `npm run test:unit` passed (459 files / 4,041
  tests); `npm run test:ts-standards` failed its one test with 26 pre-refactor
  findings (1 unknown-double-cast, 1 convex-any-validator and 24 non-null
  assertions); `npm run test:integration` passed (112 files, 1 skipped; 1,083
  tests, 4 skipped). No broad test suite was run by the baseline subagent, and
  these results do not establish vocabulary implementation or database cutover.
- No Convex backup/restore, hosted target inventory, database reset, deployment,
  application source change, generated-output change or financial-history
  mutation was performed by this baseline task. The corresponding operational
  issue remains responsible for test-target and supported Convex recovery proof.

### Source evidence informing the questions

- [General action contracts](../../../src/modules/action-invocation/contracts.ts) and [control tables](../../../src/modules/action-invocation/internal/convex-schema.ts): invocation and mandate names are not limited to one simple customer-Call rename.
- [Quote contract](../../../src/modules/capability-execution/operation-commitment.ts): bound input, price, expiry, account/budget facts, continuations and typed identifiers must survive naming changes.
- [Call contract](../../../src/modules/capability-execution/operation-invoke-contracts.ts): public request fields, reference prefixes and tagged results are compatibility boundaries.
- [Supply schema](../../../src/modules/capability-supply/internal/convex-schema.ts): offering, publication, operation, binding and connection references coexist; table consolidation cannot be inferred from synonyms.
- [Agent schema](../../../src/modules/agent-access/internal/principal-convex-schema.ts): persisted authority modes include names requiring explicit data and enum migration decisions.
- [Schema assembly](../../../convex/schema.ts), generated Convex types and [module boundaries](../../../src/modules/module-boundaries.ts): generated references and architecture checks belong in the migration inventory.
- [.gitignore](../../../.gitignore): the glossary had an explicit ignore rule; this session removes only that rule so the requested proposal is durable.

### Historical charting decision ownership

The [map's child tickets](../../../.scratch/vocabulary-rationalisation/issues/)
own the open questions and their eventual answers. They are decisions and
prerequisite investigations, not approved implementation tasks. The reference
research has a bounded agent assignment; its ticket records the branch, report
and outcome. No application implementation is delegated during charting.

## Historical charting closeout (not refactor completion)

- This is a scoping handoff, not delivery completion.
- Runtime: Node 22.22.0 / npm 11.5.1 confirmed using the existing NVM runner.
- No application, schema, stored data, external issue, deployment or public contract changed.
- Main-checkout proposal, map and work record remain uncommitted; retain them for the live terminology discussion. The isolated reference report has receipt `4f191b14ede8398a3f5b6d16bff4db23b840b23d`; its linked research ticket owns findings and limitations. This is not an implementation commit.
- Chart validation: seven child tickets, no dependency cycles, 28 local links resolve and no trailing whitespace; `git diff --check` passes. Map and tickets are not ignored; main index remains empty. These are documentation checks, not application or migration proof.
- Research report matches its isolated commit byte-for-byte. Removed only the clean task-created temporary research checkout; the evidence branch/commit and main report copy remain available. No user work was removed.
- Lesson: familiar display labels alone do not establish safe one-to-one implementation renames; inspect shared execution and immutable identity boundaries first.
