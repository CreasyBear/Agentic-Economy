# Follow-ups and administration

[PRODUCT.md](PRODUCT.md) owns direction; [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md)
owns delivery. This queue preserves existing IDs and points to the current owner.
Archived findings are not automatically current bugs or approval to expand scope.

## Remaining work

| Existing ID / area | Status and next action | Current owner / evidence |
| --- | --- | --- |
| WF-20260905-workflow-04 — desktop skill exposure | Needs a fresh desktop-task observation. Compare the supplied skill catalogue with configured exposure before changing settings; a stale catalogue is not proof of a persistent platform defect. | Desktop/harness follow-up; original local receipts remain at `~/.codex/skill-cleanup/20260905T041516Z/`. |
| WF-20260905-workflow-05 — responsibility hotspots | Not housekeeping. Revalidate source/caller evidence before proposing any split; preserve behavior and substantive authority/concurrency boundaries. | [Dated concern map](docs/archive/README.md#planning-snapshots), [module ownership](src/modules/module-boundaries.ts). |
| Phase 01.1 — ten-concern hardening | Earlier authorized planning context is archived, not implemented or cancelled. Reprioritize against current source before resuming its ten-item batch. | Supplemental archive: `files/.planning/phases/01.1-close-ten-low-hanging-codebase-concerns-with-bounded-hardeni/`. |
| Impeccable C01–C06 | Paused design campaign remains paused; no visual pass inferred from cleanup. Restore its register/evidence before any approved resumption. | Supplemental archive: `files/.planning/gauntlet/IMPECCABLE-TASTE-MARKET-REGISTER.md`; first closeout preserves the linked visual outputs. |
| Well 0 — hosted cutover | Dev cutover complete; hosted deploy pending (Joel's call, production deploy from unpushed local main). Follow the runbook, including the one-time `capabilitySupplyProjection:rebuildAllBusinessSupplyProjections` sweep so hosted business search matches CLI/describe results immediately. | [Well 0 closeout, Hosted cutover runbook](docs/workflow/well-0-standalone-closeout.md#hosted-cutover-runbook), [Well 3 closeout, Hosted cutover runbook](docs/workflow/well-3-environment-startup-closeout.md#hosted-cutover-runbook). |
| Well 4 input — reviewed vs listed tier | Surface AE's existing declared/derived/AE-observed provenance vocabulary as a reviewed-vs-listed tier distinction; market scan shows this is the familiar pattern (Locus, AgentMuxer). No new concept. | [Well 0 closeout](docs/workflow/well-0-standalone-closeout.md#follow-ons-and-well-45-inputs), `research/2026-09-09-agent-marketplace-scan.md`. |
| Well 4 input — one catalogue contract | Fold `marketExternalRegistry:search` and `/api/v1/registry` onto x402DirectoryIndex browse/overview. Public-contract change; reshapes a versioned API. | [Well 0 closeout](docs/workflow/well-0-standalone-closeout.md#follow-ons-and-well-45-inputs). |
| Well 4 input — directory naming | Rename "External Registry" tables/modules to directory naming. Needs a real migration, not a rename-in-place. | [Well 0 closeout](docs/workflow/well-0-standalone-closeout.md#follow-ons-and-well-45-inputs). |
| Well 2 input — funding and fee disclosure | Buyer funding step still Stripe-checkout-only with no in-product guidance at the wall; 10% platform rake and AUD pricing/terms undocumented outside `--technical` manifest. Swarm found this the sharpest edge across three personas. | [Well 3 swarm triage](docs/workflow/well-3-swarm-triage.md). |
| Well 4 input — catalogue/API consistency | Protected MCP tools invisible in anonymous `tools/list` (401 shape inconsistent with other failures); two catalogues/pagination idioms (`/api/v1/registry` vs `/api/v1/market-tools/*`); five overlapping status vocabularies for "is it listed"; duplicated stop-word lists; dual price stores; the maintenance sweep as a scheduled workload; schema-version families incl. `registry-tools:v1` lineage. | [Well 3 swarm triage](docs/workflow/well-3-swarm-triage.md). |
| Well 6 input — operator/provider surfaces and onboarding | `/api/ready` reports blanket "ready" with no commercial-capability scope; `/status` and `/owner/supply` are client-hydrated skeletons over curl; providers get aggregate-only Quote/Call visibility; no glossary for Tool/Quote/Call/x402 before first use. | [Well 3 swarm triage](docs/workflow/well-3-swarm-triage.md). |
| Well 5 input — module rationalisation | Widens Well 5 (authority and agent-access host files, structural) from host-file extraction to module shape. Baseline measured 2026-09-09: 27 modules, 186 declared entry surfaces, 65 test white-box exceptions (42 into capability-supply), capability-supply 163 files (142 internal), `@/modules/common` imported 391 times, no import cycles, 0 routes importing module internals, src 155,620 lines / tests 150,983 / convex 65,528 lines, duplicated concepts: 2 directory read paths in market, 3 quote paths, 3 ledgers. Exit targets: entry surfaces < 60, white-box exceptions 0, one directory/quote/ledger path each; collapse duplicates before splitting capability-supply; do not reorganise before Wells 3, 1, 2. | [Well 0 closeout](docs/workflow/well-0-standalone-closeout.md#follow-ons-and-well-45-inputs). |

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

[Recovery location and retained limits](docs/archive/README.md#wayfinder-and-closeout)
cover the supplemental archive and paused work above. The active marketing
workflow belongs to the separate website task and remains untouched.
