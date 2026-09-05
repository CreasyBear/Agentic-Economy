# Prepare and sequence the bounded implementation issue queue

Type: task
Label: wayfinder:task
Mode: AFK
Status: claimed
Assignee: Luna Max / Phase 0 issue-preparation subagent
Parent: ../map.md
Blocked by: 03, 05, 06, 07, 08

## Outcome

Materialize one local-Markdown implementation, review, verification, cutover
and closeout issue per concrete task in the accepted vocabulary-rationalisation
plan. Every ticket must give its worker one outcome, finite source-informed
allowlist, exact mappings and protected exceptions, dependencies, commands,
acceptance and closure evidence. Serialize shared writers and keep Package 6/7
held until their dependencies are satisfied.

## Scope and issue order

The queue prepared by this ticket is:

1. `09-consolidate-canonical-language.md` — current product/contributor
   authorities (open/unassigned; coordinator assigns separately).
2. `10-rationalise-customer-agent-terminology.md` — Customer/Agent boundaries.
3. `11-rename-generic-action-execution.md` — ActionInvocation -> ActionExecution
   family, without turning generic execution into paid Calls.
4. `12-rename-spending-policies-authorizations.md` — standing policy and
   request authorization families, separately.
5. `13-rename-callable-catalogue-to-tools.md` — Tool catalogue supply while
   retaining Offering/Publication/Listing/Source/portfolio Service.
6. `14-rename-provider-supply-terminology.md` — AE-owned Supplier -> Provider.
7. `15-rename-commitments-to-quotes.md` — Quote contracts/storage/codecs.
8. `16-rename-purchased-invocations-to-calls.md` — Call lifecycle and recovery.
9. `17-rationalise-next-actions-and-purchase-outcomes.md` — continuation,
   purchase status/resolution and outcome records.
10. `18-propagate-money-and-durable-record-names.md` — links, indexes, codecs,
    events, audit and queued arguments.
11. `19-cut-over-http-and-mcp-contracts.md` — public routes and action IDs.
12. `20-update-cli-consumers-and-distribution.md` — CLI client and package.
13. `21-update-discovery-and-plugin-instructions.md` — catalogues/manifests/
    machine instructions/plugin surfaces.
14. `22-regenerate-shared-artifacts.md` — Convex/router/CLI/public generators.
15. `23-update-customer-and-agent-screens.md` — identity/onboarding/permissions.
16. `24-update-catalogue-and-call-screens.md` — search/quotes/Calls/recovery.
17. `25-update-provider-screens.md` — Provider setup/publication/offboarding.
18. `26-update-money-and-business-record-screens.md` — credit/charges/
    earnings/payouts/documents.
19. `27-reconcile-current-documentation.md` — current README/guides/runbooks/
    roadmap terminology.
20. `28-preserve-and-cross-reference-history.md` — dated research/release
    evidence and Package 6/7 references.
21. `29-engineering-review.md` — independent concept/contract/data/deployment
    execution-plan review.
22. `30-developer-experience-review.md` — independent installed-client/docs/
    workflow review.
23. `31-hosted-cutover-preflight.md` — target, backup/restore, callback and
    rollback preparation by deployment operations.
24. `32-verify-source-and-contract-completeness.md` — independent integrated
    source/contract/generated/protected-vector verification.
25. `33-rebuild-local-test-data.md` — supported clean Convex data and seed proof.
26. `34-exercise-application-and-installed-clients.md` — live QA journeys.
27. `35-perform-hosted-test-cutover.md` — coordinated maintenance-window test
    deployment and acceptance.
28. `36-close-refactor-and-resume-packages.md` — final evidence, commit scope,
    handoff and Package 6/7 resumption.

The core implementation issues 10–28 are serialized where contracts/storage or
shared callers overlap. Review issues 29 and 30 must close before core workers
start (and core also depends on baseline issue 08); 31 is a Phase 0 preflight
and may run once its inventory inputs are available. 32–36 follow implementation
and review gates as stated in their tickets. Numeric order is a readable queue,
not permission to bypass a blocking edge.

## Finite files owned by this preparation ticket

- `.scratch/vocabulary-rationalisation/issues/09-consolidate-canonical-language.md`
- `.scratch/vocabulary-rationalisation/issues/10-rationalise-customer-agent-terminology.md` through
  `.scratch/vocabulary-rationalisation/issues/36-close-refactor-and-resume-packages.md`
- `.scratch/vocabulary-rationalisation/issues/37-prepare-implementation-issues.md`

Do not edit `01-reference-language.md`, `map.md`, `docs/workflow/work/WF-20260905-vocabulary.md`,
`docs/designs/vocabulary-rationalisation.md`, issue 08, application source,
tests, generated output, deployment state or Git index. The coordinator owns
map/work-record/plan integration and assignment; issue 09 remains unassigned.

## Mapping and protection policy

The fixed contract is authoritative: Customer, Agent, Tool, Tool version,
Provider, Spending policy, Request authorization/Approval, Quote, Call, Action
execution, Suggested next action, Purchase resolution/status and Outcome
records. Generic IAM `Principal`, Account, Business, User, Credential and
DelegationGrant remain distinct. Offering, Publication, Listing, Source,
portfolio Service, `SuppliedQuote`, Provider/Seller/payment recipient and
Charge/Provider obligation/payable/Payout/delivery/payment distinctions remain
distinct. External `operationId`, MCP methods, OAuth fields, x402 fields,
opaque prefixes, hash/signature material and external financial namespaces are
protected. Authority mode/scope values are AE-owned and must change exactly as
specified by the accepted plan; they are not compatibility exceptions.

## Verification commands and expected results

- `find .scratch/vocabulary-rationalisation/issues -maxdepth 1 -type f -name '*.md' | sort` — exactly issues 01–37, with one file for each path listed here and no combined tracker file.
- A small Node 22/npm 11.5.1 read-only check over the issue headers and `Blocked by:` references — every 09–36 ticket has `Type`, `Label`, `Status`, `Parent`, `Blocked by`, outcome, allowlist, exclusions, dependencies, verification, acceptance, assigned role and closure-evidence sections; every dependency resolves to an existing issue.
- Dependency graph topological check (read-only) — no cycles; every core issue 10–28 has blockers 08, 29 and 30 plus its explicit preceding contract/data dependencies; 31–36 have only the intended prerequisites recorded in their own bodies.
- `git diff --check -- .scratch/vocabulary-rationalisation/issues` — no whitespace errors in ticket files.
- A path-overlap audit over each ticket's finite allowlist — shared files are either owned by one ticket or appear only in an explicitly serialized producer/consumer edge; no independent green halves are promised.

## Acceptance

- [ ] Issue 09 is ready, open and unassigned; this claimed ticket is the only
      active preparation ownership.
- [ ] Every concrete Phase 0–5 implementation/review/verification/cutover/
      closeout task in the accepted plan has exactly one child issue with a
      finite literal allowlist and no whole-directory wildcard assignment.
- [ ] Known callers, tests, scripts, plugin manifests, generated-output
      producers and module-boundary declarations are included in the relevant
      issue; workers are not asked to discover propagation after definition
      renames.
- [ ] Fixed public mappings, table mappings, authority modes/scope values and
      protected exceptions are recorded without inventing aliases or new terms.
- [ ] Shared source, schema, public contract, generated and Git writers are
      sequenced; dependency links are acyclic and Package 6/7 remain held.
- [ ] Review, backup/cutover, local data, live QA, hosted cutover and closeout
      acceptance are represented as separate issues with named roles.
- [ ] No implementation, migration, deployment, test-data reset, dependency
      addition, custom tracker/checker or Git commit is performed here.

## Closure evidence

Return the ordered issue list, changed-path list, header/required-section
check, dependency-cycle result and allowlist-overlap audit. Report any source
location that could not be assigned without a semantic decision to the
coordinator; do not select a new vocabulary or migration strategy while
preparing tickets.

## Comments

- 2026-09-05 — Claimed for Phase 0 issue preparation after the coordinator
  directed canonical issue 09 to remain open/unassigned. Root baseline records
  26 pre-existing `test:ts-standards` findings; they are not acceptance for
  this ticket or downstream rename work.
- 2026-09-05 — Preparation receipt: issue 09 is resolved on disk after its
  canonical-definition correction; the stale queue annotation above is retained
  as history and is superseded by the coordinator's current dispatch state.
  Issues 10, 11 and 12 are now materialized as bounded tickets with literal
  allowlists, known callers/tests, protected exceptions, commands, acceptance
  and closure evidence. Their source-writer order is `10 -> 11 -> 12`; issue 10
  owns the Customer/Agent boundary with the qualified
  `AgentAccessPrincipal`/`agentAccessPrincipals` IAM exception, issue 11 owns
  generic `Action execution` and `actionExecution*` controls/attempts/history,
  and issue 12 owns the separate Spending policy/Request authorization families
  and exact authority mode/scope cutover. Paid Quote/Call families remain with
  issues 15–18. Generated output remains owned by issue 22, with an early
  generation checkpoint coordinated there. Issues 29 and 30 remain review
  blockers; no implementation, generated edit, data mutation, deployment or
  commit was performed during this preparation.
- 2026-09-05 — Final preparation correction: issue 12 now includes the direct
  mode/scope callers and capability-contract fixtures found in the baseline,
  the literal v1/v2 policy and grant digest vectors, and the approved
  mode/discriminator canonical-material projection. Issue 13 owns the
  Tool-selection fields and the existing policy digest adapter; issue 12 does
  not duplicate it. The HTTP inspection `input` remains opaque Provider/Tool
  data and is preserved verbatim, with no invented request-authorization
  remapping. Issues 10–12 remain implementation-open and review-gated; no
  source, generated artifact, test data, deployment or Git state was changed.
- 2026-09-05 — Canonical-language receipt: `CONTEXT.md` now describes Request
  authorization as bound to one specific request, with existing retry, expiry
  and recovery conditions preserved and no standing permission for unrelated
  requests. The prior "non-reusable" wording was corrected as a documentation
  clarification only; no implementation behavior or historical evidence was
  changed.
