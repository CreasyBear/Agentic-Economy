# Follow-ups and administration

[PRODUCT.md](PRODUCT.md) owns direction; [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)
owns delivery. This queue preserves existing IDs and points to the current owner.
Archived findings are not automatically current bugs or approval to expand scope.

## Repository consolidation — 5 October 2026

One integration branch feeds `main`: `codex/aecon-consolidation-2026-10-05`.
The coordinator freezes each candidate and base, runs `check` and the full gate,
records a rollback checkpoint, verifies backend/frontend provenance and live
behavior, then retires released leftovers. Heavy gates run serially. Dirty,
unique, ignored credential/runtime material and active owners remain protected;
owner handoff is required before incorporating their unfinished work.

| Remaining branch / checkout | Disposition and dependency | Owner |
| --- | --- | --- |
| `codex/aecon-consolidation-2026-10-05` | Repair/admin, released signup recovery and the treasury cutoff race fix at `590c6d1e0` are integrated on #350. Run the final combined gate and reviews, qualify the existing CLI login against the exact production backend, then verify release provenance and repeated reconciliation cycles. | Consolidation coordinator |
| `codex/first-user-readiness-2026-10-05` (independent clone) | Released signup and treasury work through `590c6d1e0` is incorporated. Preserve the clean clone until the combined release is verified. | First-user remediation; owner released |
| `codex/usage-metering` (independent clone) | Released at `c5f2b7356`; integrate foundations and completion after the minimal release, then run combined regression. Backfill and financial effects require separate review. | Consolidation coordinator; metering owner released |
| `codex/admin-console-authority-config` | PR #239 adapted into candidate; retire only after verified landing and PR disposition. | Consolidation coordinator |
| `codex/integration-repairs`, `codex/aecon-consolidation-2026-10-02` | Incorporated into candidate; recoverable checkout retirement follows verified landing and runtime/file census. | Consolidation coordinator |
| `codex/alpha-convex-hookup` | PR #226 has divergent local/remote tips and duplicate history; extract unique product intent after the metering batch, then decide obsolete remainder explicitly. | Consolidation coordinator; former owner unverified |
| `codex/arc-source-after-349` | PR #350 merged at `c1d8f86f` and included through main; protect remaining dirty/runtime material until owner release. | Explore the Arc MCP |
| `codex/founder-console` | Protected dirty PR #290 checkout and running backend; await owner identification and handoff. | Active owner unverified |
| `wip/openui-compose` | Preserve unique unwired scaffolding; assess integration after active feature handoffs or obtain explicit obsolete decision. | Consolidation coordinator |
| `well-13/readiness-diagnostics` | PR #242 logging is superseded by #328; old npm override conflicts with the retained hosted exception. Obtain explicit obsolete disposition. | Consolidation coordinator / Joel |
| `codex/alpha-operations-proof`, `codex/document-attachment-recovery`, `codex/production-commercial-surfaces`, `codex/treasury-observation` | Exact local tips already ancestral to main; normal deletion refused because upstream differs. Preserve refs/recovery bundle pending ordinary recoverable retirement. | Consolidation coordinator |
| `codex/disable-pr-actions`, `codex/production-readiness-followup`, `codex/x402-resource-attribution` | Patch-equivalent work already integrated; preserve unique commit history in recovery before normal retirement. | Consolidation coordinator |
| `codex/closed-empty-tool-input` | PR #341 patch integrated; production-money checkout remains protected pending Ark release and ignored/untracked-file census. | Ark production work |
| `main` primary checkout | Protected dirty and stale local checkout; reconcile user work without resetting main or overwriting files. | Joel / active checkout users |
| `well-16/discovery-truth` | Integrated; protected shell, local credentials and runtime state require owner release before checkout retirement. | Active owner unverified |
| `well-31/identity-slim-release-b` | Integrated; protected running Node processes and local state require owner release. | Active owner unverified |
| Alpha-learning detached checkout | Integrated commit; protected open-file Node/esbuild/VM users and ignored material require owner release. | Active owner unverified |
| `backup/main-2026-09-21` (remote) | Already ancestral; retain intentional backup until an explicit retention decision. | Joel |

The following 25 remote branches are verified integrated by ancestry or exact
patch comparison. Their exact deletion approval is pending; none are deleted.
Recheck each head, active ownership and recoverability immediately before retirement.

| Retire after exact approval | Owner / dependency |
| --- | --- |
| `codex/alpha-launch-completion`, `codex/alpha-learning-acceptance`, `codex/alpha-learning-implementation`, `codex/alpha-operations-proof` | Coordinator; approval and fresh heads |
| `codex/chat-followup-answer`, `codex/chat-runtime-env`, `codex/cli-purchase-deadline`, `well-15/chat-answer` | Coordinator; approval and fresh heads |
| `codex/document-attachment-recovery`, `codex/production-commercial-surfaces`, `codex/production-credit-recovery`, `codex/production-money` | Coordinator; approval and fresh heads |
| `codex/mainnet-acceptance-evidence`, `codex/mainnet-acceptance-record`, `codex/paid-readiness-rollout` | Coordinator; approval and fresh heads |
| `codex/production-operator-runtime`, `codex/production-owner-ingress`, `codex/production-readiness`, `codex/production-runtime-cutover`, `codex/production-signin-acceptance` | Coordinator; approval and fresh heads |
| `codex/readiness-diagnostics`, `codex/treasury-finality`, `codex/treasury-history-comparison`, `codex/treasury-observation`, `codex/x402-mainnet-recovery` | Coordinator; approval and fresh heads |

## Remaining work

| Existing ID / area | Status and next action | Current owner / evidence |
| --- | --- | --- |
| WF-20260905-workflow-04 — desktop skill exposure | Needs a fresh desktop-task observation. Compare the supplied skill catalogue with configured exposure before changing settings; a stale catalogue is not proof of a persistent platform defect. | Desktop/harness follow-up; original local receipts remain at `~/.codex/skill-cleanup/20260905T041516Z/`. |
| WF-20260905-workflow-05 — responsibility hotspots | Not housekeeping. Revalidate source/caller evidence before proposing any split; preserve behavior and substantive authority/concurrency boundaries. | [Dated concern map](docs/archive/README.md#planning-snapshots), [module ownership](src/modules/module-boundaries.ts). |
| Phase 01.1 — ten-concern hardening | Earlier authorized planning context is archived, not implemented or cancelled. Reprioritize against current source before resuming its ten-item batch. | Supplemental archive: `files/.planning/phases/01.1-close-ten-low-hanging-codebase-concerns-with-bounded-hardeni/`. |
| Impeccable C01–C06 | Paused design campaign remains paused; no visual pass inferred from cleanup. Restore its register/evidence before any approved resumption. | Supplemental archive: `files/.planning/gauntlet/IMPECCABLE-TASTE-MARKET-REGISTER.md`; first closeout preserves the linked visual outputs. |
| Well 0 — hosted cutover | Dev cutover complete; hosted deploy pending (Joel's call, production deploy from unpushed local main). Follow the runbook, including the one-time `capabilitySupplyProjection:rebuildAllBusinessSupplyProjections` sweep so hosted business search matches CLI/describe results immediately. | [Well 0 closeout, Hosted cutover runbook](docs/workflow/well-0-standalone-closeout.md#hosted-cutover-runbook), [Well 3 closeout, Hosted cutover runbook](docs/workflow/well-3-environment-startup-closeout.md#hosted-cutover-runbook). |
| Well 4 input — directory naming | Rename "External Registry" tables/modules to directory naming. Needs a real migration, not a rename-in-place. | [Well 0 closeout](docs/workflow/well-0-standalone-closeout.md#follow-ons-and-well-45-inputs). |
| Well 7 input — business suppression path | Operationalized authorized `setBusinessSuppression` mutation in Convex with `admin_operator` source-write check, `owner_admin` authority, audit logging (`business.suppressed` / `business.unsuppressed`), and immediate projection retraction. | [Well 4 closeout](docs/workflow/well-4-catalogue-truth-closeout.md). |
| Well 7 input — one descriptor shape | The public Tool descriptor mirrors are unified and single-sourced: canonical `LISTING_TIERS`, derived wire type `ToolSurfaceWireDescriptor`, Zod binding `publicToolDescriptorSchema`, and Convex validator alignment. | [Well 4 closeout](docs/workflow/well-4-catalogue-truth-closeout.md). |
| C15 — remove `presentation.price` from the validator | Directory store and projection unified on `pricingConfigJson` -> `displayPriceFromPricingConfig`; validator drop of optional `presentation.price` ready for post-hosted migration execution. | [Hosted runbook](docs/operations/hosted-cutover-runbook.md). |
| Follow-on — cycle ceilings | `npm run deps:check` lowered barrel round-trips to 32 and capability-supply internal cycles to 0; enforced in `tools/dev/deps-ratchet.ts`; strict peer cycles stay at 0. | [Well 5 closeout](docs/workflow/well-5-structure-closeout.md). |
| Well 7 — simple user expectations | Plan reviewed 2026-09-10 (`~/.claude/plans/well-7-simple-user-expectations.md`, eng review clear, outside voice folded). Eight modules, one PR each from `main`, in this order: one `_app` shell (deletes both old shells, `_operator` keeps the single auth gate), settings that act, events rail (outbox + Workpool + `standardwebhooks`), events surface (webhooks page, `@convex-dev/resend`, preferences), money visibility (Formance aggregate balances), refunds and private support intake, API reference and SDK (`zod-openapi` registry + manifest parity, Scalar, `openapi-typescript`), trust and onboarding. Package 7 owns terms, export, deletion, suspension and the hosted inbox. | Scoreboard lands as `docs/workflow/simple-user-expectations.md` in the M1 PR; acceptance by persona journeys. |
| Well 7 follow-on — Svix as the webhook delivery leg | Decided 2026-09-10 to build delivery on the installed Workpool with `standardwebhooks` signing. Swap the delivery worker for Svix only when tenant endpoints outgrow one worker and our delivery log, or a customer asks for a delivery portal. The event contract (outbox rows, Standard Webhooks signatures) is unchanged by the swap. | Trigger-based; depends on the M3 rail PR. |
| Well 7 input — funding wall guidance | Doctor now names the tier and the exact missing Stripe/CDP env names, and the loading fee (5% service fee + GST) is documented in `docs/operations/local-stripe-test-mode.md`. Still open: in-product guidance at the buyer funding wall and a plain-language fee/terms page. | [Wells 1+2 closeout](docs/workflow/wells-1-2-closeout.md), [Well 3 swarm triage](docs/workflow/well-3-swarm-triage.md). |

## Existing delivery holds

| Area | Remaining boundary | Current owner |
| --- | --- | --- |
| Vocabulary release and G02 | Source is accepted. Installed commercial execution, hosted journeys, retained-data/restore proof and operational ingestion/freshness/buffer policy remain separate. | [Vocabulary acceptance](docs/archive/README.md#vocabulary-source-acceptance), [cutover preflight](docs/operations/vocabulary-cutover-preflight.md). |
| Package 4 and AWS pause | Complete existing commercial/recovery release gates. The dated pause record requires revisiting the RDS automatic restart before 13 September; no resume is authorized by housekeeping. | [Release evidence](docs/guides/package-4-release-evidence.md), [operations](docs/operations/aws-foundation.md). |
| Package 5 | Source completion retains deployed Provider, connection, secrets and recovery proof requirements. | [Release evidence](docs/guides/package-5-release-evidence.md). |
| Package 6 | Reconcile the latest source checkpoint with the remaining real-client, deployment and authenticated journey proof; do not treat old audit observations as freshly reproduced failures. | [Current release guide](docs/guides/package-6-plugin-release.md), [archived reviews](docs/archive/README.md#package-6-reviews). |
| Package 7 | Vocabulary/source dependency accepted. Reconcile proposed contracts with current source, perform focused re-review and obtain Package 7 implementation approval. | [Current work record](docs/designs/package-7-handoff.md). |

## WF-20260905-workflow-03 — historical papercut triage

**Admin disposition:** routed by existing ID and owner; fresh product/runtime
revalidation remains with those delivery owners. No duplicate 44-item bug queue
is created and no unverified finding is marked fixed.

The dated September audit supersedes earlier score/count summaries in the
append-only ledger. Its explicit post-audit source closeouts remain valid as
recorded; newer vocabulary acceptance supplies further source evidence without
establishing live release proof. All 44 September IDs are accounted for below.

| Existing audit IDs | Disposition / next action | Owner |
| --- | --- | --- |
| AE-PC-001, 004, 005 | Catalogue/chat availability and truthful readiness are runtime-proof candidates. Reproduce against the intended deployment before classifying current source. | Package 4 / operations |
| AE-PC-002, 003, 006–010, 021–026, 041, 042, 044 | CLI, discovery and validation observations predate the accepted Tool/Quote/Call cutover. Compare current source/tests and installed-client release evidence before reopening any item. | Package 6 / vocabulary release |
| AE-PC-011, 013, 017, 030–032 | Explicitly `SOURCE_RESOLVED` in the dated audit; preserve their remaining installed-client, funding and Provider staging proof requirements. | Packages 4–6 release evidence |
| AE-PC-012, 014, 015, 018, 019, 027–029, 033–036, 043 | Account, recovery, support and navigation candidates need current-source/journey revalidation; no fresh failure or fix is asserted here. | Package 6; Package 7 for trust/lifecycle changes |
| AE-PC-016 | Legal/privacy publication requires Package 7's actual entity, policy and operating decisions. | Package 7 |
| AE-PC-020, 037–040 | Responsive, accessibility and loading observations need same-surface revalidation; the vocabulary browser/a11y passes have their recorded scope. | Package 6 / existing quality review |

Original bodies and IDs are preserved in `historical-papercut-references.tar.gz`;
the later supplemental archive also captures the pre-cleanup ledger. Older
campaign-specific IDs remain historical and must be deduplicated against these
owners when relevant, not copied wholesale into a new backlog.

## Completed housekeeping

| Existing ID | Outcome | Evidence |
| --- | --- | --- |
| WF-20260905-workflow-01 | Classified and archived superseded queues/candidates; moved root studies into existing research; repaired maintained references. | [Closeout](docs/archive/README.md#wayfinder-and-closeout). |
| WF-20260905-workflow-02 | Committed acceptance/recovery summaries and archive hashes; clean-checkout references explicitly distinguish local historical evidence. Full raw archives remain local. | [Archive inventory](docs/archive/README.md#wayfinder-and-closeout). |
| WF-20260905-workflow-06 | Exact Formance SDK 7.0.0 moved to root vendor; root/spike clean installs preserve all versions/integrities. | [Vendor provenance](vendor/README.md). |
| WF-20260905-workflow-07 | Local advisory hook distinguishes no relevant files, missing tool, successful scan, reported diagnostics and unavailable/incomplete scan. It uses the installed version and does not download a fallback. Advisory commit behavior is preserved. | Eight isolated boundary checks plus shell syntax; original hook and verification retained in the supplemental archive. This is local hook configuration, not an automatic clean-clone installation. |
| Well 0 (2026-09-09) | Dev cutover of AEcon standalone on x402/CDP/Bazaar: severed direct dependence on Agentic Market and Treg, purged retired registry rows, tightened schema; closed the 26 pre-existing ts-standards type holes. Hosted cutover still pending. | [Well 0 closeout](docs/workflow/well-0-standalone-closeout.md). |
| Well 3 (2026-09-10) | Rebuilt local start path as a staged x402-era launcher with fail-hard stages, seeded sandbox Tool and buyer/provider test authority, grouped `ae doctor` into discovery/quoting/purchase, one gate script, rendered `.env.example` with a drift test, fresh-checkout CI proof. Agent swarm (6 personas) found 49 papercuts; 26 fixed same day, 23 filed by owning well. Hosted cutover still pending. | [Well 3 closeout](docs/workflow/well-3-environment-startup-closeout.md), [Well 3 swarm triage](docs/workflow/well-3-swarm-triage.md). |
| Wells 1+2 (2026-09-10) | Call continuity: idempotency keyed to the Principal, dispatch continues across credential rotation, locked CLI recovery journal. Money: ten typed commercial refusal reasons with continuations, dead per-Call fee code deleted (fee is on loading), treasury observation workload, doctor funding tier, Stripe webhook destinations as code, Stripe SDK out of the CLI bundle. Sandbox: real reference route and a Base Sepolia testnet Tool; the seed never fabricates readiness. Paid Call proof awaits the credentialed swarm. | [Wells 1+2 closeout](docs/workflow/wells-1-2-closeout.md). |
| Well 4 (2026-09-10) | Catalogue truth: one public catalogue contract (opaque API-owned cursors, one pagination shape, one schemaVersion literal), one price source with a rehearsed migration (validator removal lands after production), one availability function shared by Quote and presentation, listingTier, same-transaction retraction, hourly reconciliation, per-source freshness, hostile-input parity on every catalogue route, MCP list pagination and structured nextAction. | [Well 4 closeout](docs/workflow/well-4-catalogue-truth-closeout.md). |
| Well 5 (2026-09-10) | Structure: agent-access host files reduced to registrations (1,951→168 and 1,882→134 lines) with logic in convex/lib; white-box test exceptions 66→0; dependency-cruiser in the gate with genuine cycles at 0 and ratcheted ceilings for barrel round-trips (258) and capability-supply internals (34); Node-only-module guard for default-runtime Convex files; 49 CLI tests in-process; canonicalCallRef split with golden vectors. | [Well 5 closeout](docs/workflow/well-5-structure-closeout.md). |
| Well 6 (2026-09-10) | Operator truth and onboarding: /api/ready reports commercial scope (catalogue, quoting, funding, sellable) without changing its HTTP contract; /status server-rendered; providers see their own Calls (`ae supply calls`, HTTP, MCP); glossary and newcomer conventions; usable CLI usage errors; documentation corrections and one hosted runbook; global definition-of-done table recorded. | [Well 6 closeout](docs/workflow/well-6-operator-truth-closeout.md). |

[Recovery location and retained limits](docs/archive/README.md#wayfinder-and-closeout)
cover the supplemental archive and paused work above. The active marketing
workflow belongs to the separate website task and remains untouched.
