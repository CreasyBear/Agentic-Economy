# Preserve and cross-reference historical evidence

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee:
Assigned role: Luna Max / dated research, package evidence and Package 6/7 cross-reference owner
Parent: ../map.md
Blocked by: 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 29, 30

## Outcome

Preserve the whitepaper, dated research, package plans, release/cutover
results and held Package 6/7 records as historical evidence. After the source
and current-documentation receipts exist, add only a short, clearly dated
current-mapping header or cross-reference where a reader could otherwise
mistake a historical term or status for the current contract. The historical
body, result, date, authorship, source/reference list, limitations, test
counts, acceptance and release status remain intact.

This is evidence preservation, not a vocabulary rewrite or scorecard update.
Keep the familiar commercial steer, original package scope and acceptance
unchanged. Preserve the Package 6 local/prepared but not submitted/published
state and the Package 7 blocked/held state. A cross-reference does not reopen,
close, promote or waive any package gate; the final evidence is handed to issue
36 for refactor closure and package resumption decisions.

## Fixed mappings for a current cross-reference

If a bounded header is needed, use this exact mapping and label it with the
date and source receipts. Never apply the mapping to the historical body.

| Historical AE-owned term or action | Current cross-reference | Protection |
| --- | --- | --- |
| Operation as the admitted callable supply unit | Tool; Tool version remains distinct | Do not collapse Offering, Publication, Listing, Source or portfolio Service into Tool. |
| Commitment / buyer consideration | Quote | Quote validity and consideration are not funding, payment, settlement or delivery. |
| Purchased operation invocation | Call | Preserve `toolRef`, `quoteRef`, `callRef`, snapshots, opaque IDs and canonical hash bytes. |
| `registry.operations.*` | `registry.tools.*` | Catalogue/registry namespace only. |
| `registry.operations.describe` / `ae describe` | `registry.tools.describe` / `ae describe` | Anonymous Tool detail, not caller `tool.quote`; do not rewrite it as a Quote. |
| Authenticated `operation.inspect` | `tool.quote` | Only the caller-specific quote flow; retain the existing `ae call` obtain-Quote-then-Call behavior. |
| `operation.invoke` | `tool.call` | Preserve canonical `operationKeyFor` `operation.invoke` bytes and upstream `operationId` meaning. |
| `operation.list` history | `call.list` | Do not confuse history with the registry Tool catalogue. |
| `operation.status`, `operation.cancel`, `operation.reconcile` | `call.status`, `call.cancel`, `call.reconcile` | Delivery, payment and purchase resolution/status remain separate facts. |
| `/api/v1/market-operations/*` | `/api/v1/market-tools/*` | Use only the issue 19 receipt; do not invent routes. |
| `/api/v1/operations/inspect`, `/api/v1/operations/call` | `/api/v1/tools/quote`, `/api/v1/tools/call` | Preserve auth, idempotency, error, recovery and request-reference behavior. |
| `maximumSpendPerInvocation` / `maximumConcurrentInvocations` | `maximumSpendPerCall` / `maximumConcurrentCalls` | Funding is not authority; preserve policy digest, amount/exponent, approval and concurrency semantics. |
| `inspect_only`, `approve_each`, `bounded_mandate`, `full_yolo`, `mandate_eligible` | `read_only`, `approval_required`, `spending_policy`, `unrestricted_test_only`, `policy_eligible` | Keep permission and test-only safety boundaries explicit. |
| `market_operations:invoke` | `market_tools:call` | Preserve scope/auth meaning and opaque inputs. |
| `supplier_operations:v1` | `provider_tools:v1` | Preserve upstream seller claim, x402, OAuth, MCP and external financial namespaces. |
| CLI `--supplier` | `--provider` | Familiar verbs, including `describe` and `call`, remain; no aliases. |

The current mapping header must say that generic IAM `Principal`, `Account`,
`Business`, `User`, `Credential` and `DelegationGrant`; Customer, Agent,
Provider, AE Seller and payment recipient; Charge, Provider obligation, payable
amount and Payout; and upstream OpenAPI/MCP/OAuth/x402 fields are protected
meanings, not historical synonyms. Preserve opaque identifier prefixes,
hashes/signatures and external financial namespaces byte-for-byte.

## Finite evidence allowlist

The following paths are the complete evidence set for this ticket. Every path
not named here, including other `research/`, `.planning/`, historical design,
external reference and tracker files, is excluded from edits.

### Institutional thesis and dated research

Read and preserve exactly:

- `AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md`
- `research/README.md`
- `research/VOCABULARY-REFERENCE-20260905.md`
- `research/AE-PLATFORM-MATURITY-PRIORITIES.md`
- `research/LOCUS-AE-MATURITY.md`
- `research/NEVERMINED-AE-OPPORTUNITY-AND-STRUCTURE.md`
- `research/WHOP-AE-MATURITY.md`
- `research/PACKAGE-2-HUMAN-WORKSPACE-IA.md`
- `research/PACKAGE-3-AUTHORITY-SECURITY-REFERENCES.md`
- `research/PACKAGE-3-AUTHORITY-SECURITY-SYSTEM.md`
- `research/PACKAGE-3-GAUNTLET-PROGRESS.md`
- `research/PACKAGE-4-AUSTRALIAN-PREPAID-LEDGER-REGULATORY-PERIMETER.md`
- `research/PACKAGE-4-OPERATIONS-RECONSTRUCTION-RESEARCH.md`
- `research/PACKAGE-5-MATURE-SCAVENGE-COMPARISON.md`
- `research/PACKAGE-5-SUPPLIER-OPERATIONS-PRIMITIVES-RESEARCH.md`
- `research/PACKAGE-6-INVERSE-PREMORTEM.md`
- `research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md`
- `research/architecture/current-module-boundaries.md`
- `research/architecture/external-registry-promotion-audit.md`
- `research/architecture/operation-onboarding-patterns.md`
- `research/architecture/package-distribution.md`
- `research/architecture/test-performance.md`
- `research/architecture/x402-operation-onboarding.md`

The default operation for this section is no edit. A short dated mapping
header/cross-reference may be added only to `research/README.md` and
`research/VOCABULARY-REFERENCE-20260905.md` if required to direct readers to
current `PRODUCT.md`, `CONTEXT.md`, the issue 19–22 receipts and issue 27. Do
not alter the dated recommendation, maturity score, comparison, citation,
reference URL, observation or conclusion beneath that header.

### Package plans, reviews and release/cutover results

Preserve dates, statuses, test results, closeout/acceptance and limitations in:

- `PACKAGE-4-ATOMIC-FEATURE-BUILD-PLAN.md`
- `PACKAGE-5-ATOMIC-FEATURE-BUILD-PLAN.md`
- `PACKAGE-6-ATOMIC-FEATURE-BUILD-PLAN.md`
- `PACKAGE-6-REVIEW.md`
- `PACKAGE-6-REVIEW-REQUIREMENTS.md`
- `PACKAGE-6-REVIEW-IMPLEMENTATION.md`
- `PACKAGE-6-REVIEW-NATIVE-CHALLENGE.md`
- `docs/guides/package-4-cutover-evidence.md`
- `docs/guides/package-4-release-evidence.md`
- `docs/guides/package-5-release-evidence.md`

No body edit, term replacement or status change is permitted in this section.
If a current reader needs orientation, a short dated cross-reference may be
added only at the top of the three `docs/guides/*-evidence.md` files, and only
after issue 27 confirms the corresponding current contract. The addition must
identify the historical document as evidence and link back to the current
authority; it must not restate or rescore its evidence.

### Current Package 6/7 and operational anchors

These anchors are read-only. They establish the current hold/status to retain;
they are not a second writable documentation allowlist:

- `docs/guides/package-6-plugin-release.md` — issue 27 owns current procedure
  wording; issue 28 must not edit it.
- `docs/designs/package-7-trust-and-lifecycle.md` — reconciled candidate,
  implementation start held; do not rewrite tentative language into a result.
- `docs/workflow/work/WF-20260905-package-7.md` — blocked Package 7 work
  record; do not edit a work record or change its owner/status/hold.
- `docs/operations/vocabulary-cutover-preflight.md` — issue 31's read-only
  preflight evidence; do not edit or reinterpret it.

## Handoff and sequencing

1. Consume issue 08/09 baseline and canonical-language receipts, then issues
   10–18's source/core mapping receipts. Historical files must not be changed
   merely because a source identifier is scheduled to move.
2. Consume issue 19's exact HTTP/MCP mapping and issue 20/21/22 CLI,
   discovery/plugin/generated/public receipts before writing any current
   mapping header. Preserve the original protocol names in historical bodies.
3. Wait for issue 27's current-documentation mapping and Package 6/7 hold
   comparison. Resolve the one serialized Package 6 guide boundary through
   issue 27; issue 28 remains read-only there.
4. Add only the permitted compact headers/cross-references, inspect the diff
   for evidence-body changes, and hand the preservation receipt to issue 36.
   Do not make Package 6/7 implementation start or completion a consequence of
   this ticket.

## Explicit exclusions

- No wholesale dated-research rewrite, maturity rescore, comparison rewrite,
  citation/reference URL change, date/author change, release-result rewrite,
  status promotion, acceptance change, or deletion of original reference
  papers.
- No renaming of historical `Operation`, `Commitment`, `Invocation`, seller,
  protocol, upstream OpenAPI `operationId`, MCP method, OAuth/x402 field,
  opaque ID/hash/signature or external financial namespace inside historical
  evidence. A current mapping belongs in a clearly dated header only.
- No edits to current Product/Context/AGENTS/source/routes/schema/generated
  artifacts/CLI/discovery/plugins/screens, Wayfinder map, work records,
  JSONL tracker, deployment registry/preflight, external systems or any path
  outside this ticket's allowlist.
- No new research, task/tracker format, SDK, alias, codemod, dependency,
  infrastructure, route, financial/legal claim, free-tier/onboarding feature
  or commercial object.
- No conflation of funding/authority/purchase, Charge/Provider obligation/
  payable/Payout, delivery/payment/purchase resolution, or Customer/Agent/
  Provider/Seller/payment-recipient identity.

## Verification commands and expected results

This is a Markdown/evidence-preservation task. Use the project-pinned runtime
for the required startup receipt, but do not run generators, deployment or the
downloaded Node 20/22 CLI compatibility matrix here.

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" node --version
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm --version
git diff --check -- \
  AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md research/README.md \
  research/VOCABULARY-REFERENCE-20260905.md \
  research/AE-PLATFORM-MATURITY-PRIORITIES.md research/LOCUS-AE-MATURITY.md \
  research/NEVERMINED-AE-OPPORTUNITY-AND-STRUCTURE.md research/WHOP-AE-MATURITY.md \
  research/PACKAGE-2-HUMAN-WORKSPACE-IA.md \
  research/PACKAGE-3-AUTHORITY-SECURITY-REFERENCES.md \
  research/PACKAGE-3-AUTHORITY-SECURITY-SYSTEM.md \
  research/PACKAGE-3-GAUNTLET-PROGRESS.md \
  research/PACKAGE-4-AUSTRALIAN-PREPAID-LEDGER-REGULATORY-PERIMETER.md \
  research/PACKAGE-4-OPERATIONS-RECONSTRUCTION-RESEARCH.md \
  research/PACKAGE-5-MATURE-SCAVENGE-COMPARISON.md \
  research/PACKAGE-5-SUPPLIER-OPERATIONS-PRIMITIVES-RESEARCH.md \
  research/PACKAGE-6-INVERSE-PREMORTEM.md \
  research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md \
  research/architecture/current-module-boundaries.md \
  research/architecture/external-registry-promotion-audit.md \
  research/architecture/operation-onboarding-patterns.md \
  research/architecture/package-distribution.md \
  research/architecture/test-performance.md \
  research/architecture/x402-operation-onboarding.md \
  PACKAGE-4-ATOMIC-FEATURE-BUILD-PLAN.md PACKAGE-5-ATOMIC-FEATURE-BUILD-PLAN.md \
  PACKAGE-6-ATOMIC-FEATURE-BUILD-PLAN.md PACKAGE-6-REVIEW.md \
  PACKAGE-6-REVIEW-REQUIREMENTS.md PACKAGE-6-REVIEW-IMPLEMENTATION.md \
  PACKAGE-6-REVIEW-NATIVE-CHALLENGE.md \
  docs/guides/package-4-cutover-evidence.md \
  docs/guides/package-4-release-evidence.md docs/guides/package-5-release-evidence.md
git diff --word-diff=porcelain -- \
  research/README.md research/VOCABULARY-REFERENCE-20260905.md \
  docs/guides/package-4-cutover-evidence.md \
  docs/guides/package-4-release-evidence.md docs/guides/package-5-release-evidence.md
rg -n "Status:|Date:|Reviewed:|Observed:|Evidence|Acceptance|Limitations|Current refactor mapping" \
  AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md research/README.md \
  research/VOCABULARY-REFERENCE-20260905.md PACKAGE-6-REVIEW.md \
  docs/guides/package-4-cutover-evidence.md docs/guides/package-4-release-evidence.md \
  docs/guides/package-5-release-evidence.md
```

Expected results: Node 22.x and npm 11.5.1; whitespace clean; any diff is
limited to a compact, dated header/cross-reference in the five explicitly
permitted files; historical body lines, dates, statuses, evidence counts,
limitations, citations and acceptance remain unchanged. If no orientation gap
exists, a zero-file change is the correct result. No application test,
generator, package, hosted or live result is claimed by this ticket.

## Acceptance

- The whitepaper, original reference papers, dated research conclusions,
  package plans, release/cutover evidence and review results remain available
  with their original terms, dates, sources, scores, test results, limitations,
  package acceptance and release status.
- Any added header/cross-reference is short, dated and visibly labelled as a
  current post-cutover mapping; it points to `PRODUCT.md`, `CONTEXT.md` and the
  owning issue receipts without masquerading as historical observation.
- Historical bodies retain upstream protocol names and protected identifiers;
  the anonymous `registry.tools.describe` versus caller `tool.quote` boundary,
  `call.list` versus the Tool catalogue, and the `operationKeyFor` bytes are
  not distorted by the mapping note.
- Package 6 remains local/prepared/not submitted/not published with its held
  closeout evidence; Package 7 remains blocked with implementation start held;
  no package gate, production/legal hold or familiar commercial direction is
  promoted, waived or rescored.
- The workflow work record, cutover preflight, current Package 6 guide and all
  non-allowlisted history remain untouched. The final receipt includes exact
  changed paths, before/after diff review and handoff to issue 36.

## Closure evidence

Attach the exact changed-path list (including an explicit zero-change result if
appropriate), the before/after diff proving only permitted headers were added,
and a date/status/hash/reference-preservation note for every touched evidence
file. Include issue 08/09, 10–22 and 27 receipts consumed, Package 6/7 hold
comparison, focused `git diff --check`/word-diff output and unverified
live/deployment limitations. Close only when issue 36 can consume this bounded
preservation receipt; do not treat historical cleanup as implementation proof.

## Comments

- `docs/guides/package-6-plugin-release.md` is intentionally read-only here;
  issue 27 owns its current procedure terminology. Any shared-file edit would
  require an explicit serialized handoff from issue 27.
- `docs/workflow/work/WF-20260905-package-7.md` is a work record and must not
  be edited for this cross-reference. The Package 7 hold remains a fact to
  preserve, not a status to infer away.
- The current mapping is a familiar vocabulary cross-reference only; it does
  not authorize new routes, aliases, SDKs, infrastructure, free-tier behavior
  or a redesign of the market/commercial boundary.
