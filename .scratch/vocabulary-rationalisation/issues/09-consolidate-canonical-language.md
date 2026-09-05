# Consolidate canonical language in current product authorities

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee: Luna Max / refactor_baseline canonical-language subagent
Parent: ../map.md
Blocked by: 02, 05

## Outcome

Make the accepted mature vocabulary the single current product language in the
selected plan and contributor-facing authorities, while retaining the dated
proposal as history and preserving the commercial direction. This ticket owns
only canonical-language documents; implementation mappings and delivery status
remain in the selected plan and child tickets.

## Exact mappings

Use the accepted task contract consistently in current prose and definitions:

- Business Principal -> Customer (the purchasing person or organisation only).
- Agent Principal -> Agent (authorised software actor, not its credential).
- Callable Operation -> Tool; Operation revision -> Tool version.
- Supplier -> Provider for AE-owned performing-party language.
- Standing Mandate -> Spending policy.
- Request-specific mandate -> Request authorization; use Approval for a
  person's recorded authorization where the product context requires it.
- Commitment -> Quote; Purchased Invocation -> Call.
- Generic Action Invocation -> Action execution.
- Suggested continuation -> Suggested next action.
- Commercial closure -> Purchase resolution / purchase status.
- Outcome evidence -> Outcome records.

Authority modes and AE-owned scope values are part of this language cutover:

- `inspect_only` -> `read_only`
- `approve_each` -> `approval_required`
- `bounded_mandate` -> `spending_policy`
- `full_yolo` -> `unrestricted_test_only`
- `mandate_eligible` -> `policy_eligible`
- `market_operations:invoke` -> `market_tools:call`, with corresponding
  `customer_requests:` mode suffixes.

## Finite file allowlist

Definitions and current authorities (the exact edit boundary for this ticket):

- `CONTEXT.md`
- `PRODUCT.md`
- `AGENTS.md`
- `UBIQUITOUS_LANGUAGE.md` (retire as an active authority; retain as dated
  proposal with a pointer to the accepted glossary)

`README.md`, current guides/runbooks, active design documents and deployment
skill instructions are deliberately owned by issue 27. Dated package plans,
reviews, workflow records and release evidence are deliberately owned by issue
28 or their existing package owners. Issue 09 may link to those boundaries but
must not edit them or rename technical examples before source contracts change.
Where these four authorities mention a technical contract that has not yet
cut over, describe the new words as the approved target, not as a claim that
the current API already accepts them; issue 27 synchronises live examples after
the owning source/contract issues land.

## Protected occurrences and exclusions

Retain generic IAM `Principal`, Account, Business, User, Credential and
DelegationGrant concepts; they are not blanket Customer replacements. Retain
Offering, Publication, Listing, Source and Provider connection distinctions,
portfolio Service records/APIs, qualified `SuppliedQuote`, Provider/Seller/
payment-recipient roles, Charge/Provider obligation/payable/Payout/delivery/
payment distinctions, external protocol names (`operationId`, MCP methods,
OAuth fields and x402 fields), opaque ID prefixes, canonical hash material,
signatures and external financial namespaces. Do not alter historical research,
dated release evidence, package acceptance evidence, or the map/work record,
and do not invent a second glossary or product object.

## Dependencies and sequencing

- Depends on the accepted vocabulary decision and source/inventory decisions in
  tickets 02–05.
- Must land before implementation issue 10 and before any public-surface or
  generated-artifact issue consumes the terms.
- Package 6 and Package 7 remain held; this ticket only records their handoff.

## Answer

Resolved after the accepted vocabulary decisions in issues 02 and 05. The
current product and contributor authorities now use the mature target language:
Customer, Agent, Tool, Tool version, Provider, Spending policy, request
authorization/Approval, Quote, Call, Action execution, Suggested next action,
Purchase resolution/status and Outcome records. The documents preserve the
existing Locus/Nevermined/Whop-informed commercial direction and do not claim
that the target APIs or storage have already been cut over.

The authority-mode and AE-owned scope mappings are recorded exactly here and in
the selected plan: `inspect_only` → `read_only`, `approve_each` →
`approval_required`, `bounded_mandate` → `spending_policy`, `full_yolo` →
`unrestricted_test_only`, `mandate_eligible` → `policy_eligible`, and
`market_operations:invoke` → `market_tools:call` with the corresponding
`customer_requests:` mode suffixes. Calls are described using existing
supported authorization paths; a standing Spending policy is not a universal
prerequisite where request authorization/Approval applies.

The dated proposal is retired as an authority: `UBIQUITOUS_LANGUAGE.md` now
points to `CONTEXT.md` as the accepted glossary and to the selected plan for
mappings and proof, while retaining its historical discussion and unresolved
alternatives intact.

Protected boundaries remain explicit: generic IAM `Principal`, Account,
Business, User, Credential and DelegationGrant; Offering, Publication, Listing,
Source, Provider connection and portfolio Service; qualified SuppliedQuote;
Provider/Seller/payment-recipient roles; Charge, Provider obligation, payable
amount, Payout, delivery/payment/purchase status; upstream OpenAPI `operationId`,
MCP, OAuth and x402 values; and opaque identifiers, canonical hash material,
signatures and external financial namespaces.

### Changed paths and old-name exceptions

Only these paths changed for issue 09:

- `PRODUCT.md` — current product language, Tool/Quote/Call definitions,
  Action execution, Suggested next action, purchase-resolution wording and
  clearly labelled current-not-yet-cut-over API examples.
- `CONTEXT.md` — accepted glossary, Tool/Tool version versus portfolio Service,
  authorization and outcome distinctions, and explicitly labelled current
  compatibility examples.
- `AGENTS.md` — contributor/product boundary, protected IAM/commercial/money
  distinctions and permanent upstream `seller` exception.
- `UBIQUITOUS_LANGUAGE.md` — dated, non-authoritative proposal pointer while
  retaining history.
- This issue record.

The remaining old words are intentional and bounded. `CONTEXT.md` retains the
old-to-new compatibility table and the current-not-yet-cut-over
`operation.inspect`, `commitmentRef`, `operation.invoke`, `idempotencyKey` and
`invocationRef` example; its `OperationInvokeRecoveryPort` occurrence is
labelled as a current pre-cutover source port. `PRODUCT.md` retains its
compatibility list (`Mandate`, `Operation`, `Commitment`, `Invocation`,
`commitmentRef`, `invocationRef`) and its explicit current-not-yet-cut-over
`registry.operations`, `operation.inspect`, `operation.invoke`,
`operation.status` and `operation.reconcile` examples. `AGENTS.md` retains
`supplier` only for AE-owned source identifiers awaiting their owning cutover
and retains upstream protocol `seller` permanently. `UBIQUITOUS_LANGUAGE.md`
retains historical aliases and open discussion because it is explicitly dated
and non-authoritative.

No application, schema, database, deployment, generated-output, client or
other documentation path was changed. Package 6/7 remain held for their
refactor dependencies; no package requirement is claimed complete here.

## Verification commands and expected results

- `git diff --check -- CONTEXT.md PRODUCT.md AGENTS.md UBIQUITOUS_LANGUAGE.md` — no whitespace errors.
- `rg -n "Business Principal|Agent Principal|Standing Mandate|Commercial closure|Outcome evidence|operation-invocation|market_operations:invoke|inspect_only|approve_each|bounded_mandate|full_yolo|mandate_eligible" CONTEXT.md PRODUCT.md AGENTS.md` — zero unprotected current-authority occurrences; any retained occurrence is in an explicit compatibility/history note. Do not scan or rewrite downstream examples in this ticket.
- `rg -n "Principal|Account|Business|User|Credential|DelegationGrant|operationId|MCP|OAuth|x402|Offering|Publication|Listing|Source|Service" CONTEXT.md PRODUCT.md UBIQUITOUS_LANGUAGE.md` — protected distinctions remain documented and are not silently collapsed.

## Acceptance

- [x] Current product and contributor authorities use the accepted Customer,
      Agent, Tool, Provider, Spending policy, Quote, Call, Action execution,
      Suggested next action, Purchase resolution/status and Outcome records
      terms without changing product direction.
- [x] Authority-mode and AE-owned scope mappings are recorded exactly, with no
      blanket compatibility exception for these values.
- [x] The proposal is clearly dated/non-authoritative and points to the one
      accepted glossary; migration mappings remain in implementation tickets.
- [x] Generic IAM, commercial-role, financial, portfolio and external-protocol
      distinctions plus protected identifiers are explicitly retained.
- [x] Package 6/7 and downstream documentation boundaries are linked without
      editing their held requirements or claiming completion.
- [x] Reviewable document diff and command output are attached to the issue;
      no application, schema, database, deployment or generated output changes
      are included.

## Closure evidence

Evidence captured above and below: changed-path list, scoped baseline diff,
diff-check output, protected-occurrence review, accepted glossary pointer and
package-hold handoff. Exact retained old words and reasons are listed in the
exceptions section; closure is not based on a broad search count.

Verification on 2026-09-05 (Australia/Perth):

- `git diff --check -- CONTEXT.md PRODUCT.md AGENTS.md UBIQUITOUS_LANGUAGE.md` — PASS.
- Prescribed old-name scan — only the four explicit compatibility rows in
  `CONTEXT.md` remained; no old authority-mode/scope value appeared in the
  current authorities.
- Canonical-definition review correction — `CONTEXT.md` now has standalone
  `Request authorization`, `Approval`, `Tool`, `Tool version` and qualified
  `SuppliedQuote` definitions; portfolio `Service` remains explicitly distinct.
- Protected-occurrence scan — PASS; generic IAM, portfolio, commercial-role,
  financial and upstream protocol distinctions remain documented.
- Per-file comparison with the Phase 0 source baseline archive — only the four
  allowlisted authority documents and this issue record contain issue-09
  changes; no source/schema/generated/deployment paths were introduced or
  changed.
- No application tests were run for this documentation-only ticket; fresh
  pre-refactor baseline results remain recorded by issue 08.

## Comments

- 2026-09-05 — Prepared as the ready canonical-document handoff for downstream
  implementation dispatch. It remains open and unassigned for the owner chosen
  by the coordinator.
- 2026-09-05 — Resolved by Luna Max / refactor_baseline after issues 02 and 05
  were resolved. Current authorities, exact mappings, bounded exceptions and
  scoped verification are recorded above; downstream implementation owns the
  contract and storage cutover.
- 2026-09-05 — Reopened by the coordinator after review identified missing
  standalone `Request authorization`, `Approval`, `Tool`, `Tool version` and
  qualified `SuppliedQuote` definitions in the accepted glossary. The bounded
  correction is limited to `CONTEXT.md` and this ticket.
- 2026-09-05 — Final wording correction: `Request authorization` is bound to
  one specific request, does not grant standing permission for unrelated
  requests, and retains existing retry, expiry and recovery conditions for
  that request. This replaces the misleading "non-reusable" wording without
  changing any behavior or requiring universal Spending policy use.
- 2026-09-05 — Re-resolved after the correction and scoped checks passed. The
  accepted glossary now carries the reviewed definitions; implementation and
  contract cutover remain owned by issues 10 onward.
