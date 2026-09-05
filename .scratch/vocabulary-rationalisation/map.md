# One familiar vocabulary across Agentic Economy

Label: wayfinder:map

## Destination

Implement the accepted familiar vocabulary across AE's code, tests,
documentation, interfaces and stored data through bounded issues, with
observable verification and no loss of records or behaviour.

## Notes

- Charting was initially planning-only. Under the accepted execution override below, this map now carries bounded implementation, repeated issue pickup/closure and the evidence handoffs; use `wayfinder`, `grilling`, `domain-modeling` and `wayfinder-delivery`, with `research` for external facts. Resolve at most one non-research ticket per session.
- [Work record](../../docs/workflow/work/WF-20260905-vocabulary.md) owns overall approval, execution and acceptance status. This map indexes decisions; child tickets own answers. Use the existing local-Markdown tracker, not a new external service.
- [Selected implementation plan](../../docs/designs/vocabulary-rationalisation.md) is the single accepted plan for the complete refactor. Implementation issue bodies own exact slices, mappings, exclusions and closure evidence; this map does not become a second status record.
- The rejected standalone tracking-register proposal is superseded by this Wayfinder map and its child issues; do not introduce a parallel tracker. Separately, purchase resolution/status remains derived from the existing linked records, not a new purchase object.
- Read [PRODUCT](../../PRODUCT.md) first. [CONTEXT](../../CONTEXT.md) owns canonical definitions; issue 09 applies the accepted language and retires [the glossary proposal](../../UBIQUITOUS_LANGUAGE.md) as an active authority. Do not maintain two live glossaries.
- Historical charting scope: Joel initially accepted whole-platform coverage and offered to take a backup. His later accepted implementation plan fixes Tool and all other mappings in issues 02/05; those choices are no longer tentative. Backup completion is still evidence-dependent.
- **Execution override — 2026-09-05:** Joel's accepted task request authorises carrying implementation through the existing Wayfinder issues, including repeated issue pickup, fixes, verification and closure. This supersedes the charting-only status for this refactor, while preserving the requirement for explicit issue ownership, reviewable sequencing and acceptance evidence. It does not claim application implementation, Convex/financial backup proof, destructive reset or deployment before those steps are actually evidenced.
- Joel's Convex/financial backup is still not captured or restore-tested evidence. The Phase 0 source archive is a separate private rollback artifact; determine retained-data coverage and recoverability before changing data. Never put secrets, raw production records or backups in this tracker.
- Mature Australian Locus/Nevermined experience first, Whop for supporting patterns. No differentiation requirement, proprietary terminology or hand-built substitute for maintained platform behaviour. Do not copy a reference's term when it means a different thing.
- Preserve financial, authority, delivery and recovery distinctions. Do not infer that every old name is one-to-one renameable. Coordinate AE-owned client changes; identify any independently used contracts before choosing compatibility exceptions.
- Package 6 closeout and Package 7 implementation are held. Their [release handoff](../../docs/guides/package-6-plugin-release.md#closeout-pause-handoff) and [planning record](../../docs/workflow/work/WF-20260905-package-7.md) retain their own outstanding requirements. Rename work does not close them.
- The shared dirty main checkout is not a clean release candidate. Research branches are evidence-only and do not inherit its uncommitted implementation. Source inventories must explicitly inspect the main checkout, not assume a clean branch has current truth.

## Decisions so far

- [Establish familiar reference terms and their meanings](issues/01-reference-language.md) — Tool is defensible, but several similar names mean different things; whole-platform glossary gaps and evidence limits are recorded for the terminology decision.
- [Establish the implementation execution baseline](issues/08-execution-baseline.md) — The preserved dirty checkout is recoverable from the private source archive and checksum manifest; the selected implementation plan and execution-carrying issue queue are now the handoff boundary.
- [Accepted vocabulary](issues/02-agree-language.md) and [coordinated cutover](issues/05-contract-cutover.md) — resolved by Joel's accepted plan, including protected byte formats and no legacy-client aliases.

## Execution entry points

- [Canonical language](issues/09-consolidate-canonical-language.md).
- [Implementation issue preparation](issues/37-prepare-implementation-issues.md) — remaining source/surface/verification issues are still being prepared; this is not a complete dispatch queue yet.
- [Engineering review](issues/29-engineering-review.md) and [developer-experience review](issues/30-developer-experience-review.md).
- [Test cutover preflight](issues/31-hosted-cutover-preflight.md) — [current read-only findings](../../docs/operations/vocabulary-cutover-preflight.md); source backup does not satisfy database recovery proof.

## Not yet specified

- Additional concept boundaries may emerge when generic action execution and callable supply are traced; create precise decisions then rather than inventing replacement objects now.
- Supported clean-dataset and restore procedures still need exact execution evidence; the accepted strategy is a fresh test-data rebuild, not a custom migration engine.

## Out of scope

- New commercial modes, payment rails, agent orchestration, feature expansion or wholesale product redesign.
- Completing or waiving unrelated Package 6/7 defects as part of a rename.
- Rewriting historical findings as current verification, silently editing third-party protocol vocabulary or discarding retained records.
- Hosted deployment, destructive reset, Convex/financial backup execution and test cutover remain out of scope for this Phase 0 baseline until the deployment-operations issue records exact targets and restoration evidence. Later approved delivery issues define their boundaries; source implementation proceeds only through the selected plan and owned issue bodies.
