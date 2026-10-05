# Production commercial surfaces

**Status:** maintained contract · **Consolidated:** 5 October 2026

The [original implementation plan](../archive/2026-10-05/designs/2026-10-03-production-commercial-surfaces.md)
preserves assignments, review and dated checkpoints. Current release and runtime
acceptance belong in the [deployment map](../operations/deployments.md).

## Purpose and constraints

The Customer and operator can understand, authorise and explain Account
purchases from the same recorded commercial facts.

The design review uses the non-interactive path because Joel asked for
implementation with defaults. Its integrity is strong when each surface answers
one of three questions: what was bought, who approved it, or how usage and spend
are changing. Reuse the existing document worker/storage, admin command and audit
records, Account authority, usage queries and maintained table components.
Preserve Tool, Quote, Call, delivery, settlement and Purchase-status distinctions.

No new analytics service, document service, approval store or table framework is
needed. Do not infer token use, successful delivery, tax treatment or a completed
approval from absent facts. Monetary totals retain exact integer units and a
currency. Production custody limits and the existing signing hold stay intact.

The highest risks are incorrect or mutable invoices, incomplete totals presented
as complete, cross-Account disclosure, and a policy declaration appearing to
prove an operational control. Those receive the verification budget. Additional
chart types and generic report builders are outside this implementation.

## Contracts

### Invoices and retained documents

**Requires:** authenticated Account access, an eligible recorded financial event,
approved issuance policy and validated seller/customer/tax facts sufficient for
the document. Supplier identity and GST registration are distinct from customer
registration. Joel has confirmed supplier GST registration; this is not a
substitute for the supplier's actual legal name and ABN.

**Ensures:** one stable document identity and immutable financial snapshot, with
readable seller/buyer/item/date/amount/tax content and Account-scoped access.
Retries use the original facts and cannot issue conflicting documents. Existing
financial entries remain append-only; corrections identify original evidence.

**Invariant:** a receipt is not silently relabelled a tax invoice; customer GST
registration is not a universal prerequisite to receiving an invoice; an unknown
attachment acknowledgement never deletes potentially canonical files.

**On violation:** show the specific missing prerequisite and preserve source
records. Never invent legal identity or recompute historic tax from today's
policy. Test duplicate/concurrent issuance, later profile/policy changes,
permission denial, original financial totals and recovery.

### Approval records and defaults

**Requires:** existing admin/owner authority and protected command admission for
mutations. Queries return only the authorised environment and scope.

**Ensures:** the operator can see all six families, lifecycle, revision, validity,
recorded approver, evidence references and pending decisions in one table.
Changing a family reviews its exact submitted values through the existing flow.

**Invariant:** proposed defaults are editable drafts. Attestations start
unchecked; active, pending, expired, missing and conflicting records remain
distinct. A stored evidence reference does not prove that its control was tested.

**On violation:** refuse the existing command without altering its prior result;
display the actionable reason. Test owner separation, expiry, stale proposals,
unauthorised reads, defaults and faithful review of the actual submitted values.

### Usage aggregation and agent metrics

**Requires:** Account-scoped authority and a validated time window/filter/cursor.

**Ensures:** totals match their labelled population and period, pagination does
not change the reported whole-period totals, and every agent row is attributable
to recorded activity. Keep attempted, completed, failed and unresolved Calls
distinct; display charges, refunds and net amounts with explicit meanings.

**Invariant:** no sample or truncated page masquerades as a complete aggregate;
no floating-point accumulation of money; no foreign Account activity; no payment
success used as proof of delivery. Missing telemetry remains unavailable.

**On violation:** return an explicit incomplete/unavailable result rather than a
fabricated zero. Test boundary dates, retries/duplicates, refunds, mixed terminal
states, multiple pages and cross-Account access.

## Product defaults and table behaviour

Start reporting at the last 30 days with a visible period and time-zone label.
Retain the existing 50-row history page, newest activity first, clear sorting
and direct drill-down; make the page size visible rather than add client-only
pagination over a different backend page.
Retain filters while moving between a summary and its rows. Offer CSV only from
the same authorised, fully defined population; do not imply an export contains
more than it does. Tables distinguish loading, no activity, no filter matches,
unavailable data and permission failures. Amounts align and retain currency;
status includes text rather than colour alone.

Source inventory found an unsupported Agent-spend query, no-match filters hiding
pagination, rolling-24-hour "Today", known empty data shown as unavailable,
formatted-text sorting and unlabelled differences between complete totals and
loaded rows. Fix these within the existing queries and views. Remove the usage
CSV's unsupported hardcoded GST column; a usage export is not a tax invoice.
The initial source-only cognitive audit counted eight filter choices, two export
choices, two queues and four summary measures. The main memory burden is their
inconsistent implicit scope. Visible Account/Agent, period and coverage labels
and preserved navigation state address that specific burden.

The cognitive-load target is three visible groups: period/filter controls,
summary measures and detailed rows. Keep the chosen Account and period visible
so users do not need to remember them across views. Put advanced evidence and
identifiers in row details; retain approver and lifecycle where decisions occur.
The final review must count actual choices and confirm rendered navigation and
keyboard behaviour, rather than treating this target as proof of usability.

Conservative, editable draft controls may reduce setup decisions. Technical
version pins come from the server. Existing approved spending/custody ceilings
remain separate from commercial funding limits. Historical fixture values are
not production approvals. Tax invoices remain blocked until required facts and
issuance approval exist, even when the generation capability is complete.

## Complexity decisions

Keep document generation in the existing worker: extending a frozen snapshot
adds necessary domain fields while avoiding a second document lifecycle. Keep
approval summaries as indexed reads of existing records: one bounded query may
replace six round trips, without a materialised duplicate approval state. Prefer
existing aggregates for reporting; add persisted aggregation only if source
inspection proves complete bounded reads cannot satisfy the requested metrics.
Any such addition needs a stated update/replay/rebuild contract before editing.

The audit found two unsupported production policy knobs: Call tax and buyer
pricing margin are recorded but not consumed by pricing. Production admission
must therefore require their supported value of zero; the editor shows that
fixed value while historical records remain readable. The treasury policy floor
must also be checked against the actual reserve derived from the configured
custody atomic limit, at activation and on subsequent policy admission. This
small coupling is intentional: it prevents a recorded floor from claiming more
protection than the existing reserve enforces. It does not raise custody limits
or create a second reserve calculation. Missing configuration or drift refuses
production admission; sandbox fixtures keep their existing boundary.

The [readiness record](../production-readiness-plan.md) distinguishes completed
mainnet and recovery evidence from the paid development journey and other open
acceptance. Screening remains explicitly deferred by the approved alpha policy.
UI completeness and a passing source gate cannot establish a runtime outcome.

## Implemented boundary review

The invoice implementation freezes the seller's verified legal name and ABN,
the customer facts available at first issuance, original six-family policy
digest, paid funding event and exact cent-aligned AUD amounts. Current issuance
approval is checked separately from the original tax rate. A confirmed full
refund creates a separately numbered adjustment linked to the original snapshot;
partial refunds remain reconciliation work. Both the receipt history and generic
owner document list wait for the original invoice before exposing an adjustment
as ready. Existing statement, ordinary adjustment and signed-close behavior stays
on its established document path.

The small shared document-read predicate has two callers: owner listing and
download admission. It prevents those surfaces disagreeing about a pending
original or invalid snapshot without adding another persisted status. An
after-commit scheduler call lets invoice issuance read the completed funding
event; the existing Workpool still owns rendering. Keep these two additions;
separate queues, document stores and callback recovery systems are unnecessary.

The approval table groups six families into five columns: policy, current and
pending status, validity, recorded decision and preparation. Selection focuses
the matching editor. Server time decides expiry, while a client refresh value
only invalidates the query cache. Production policy rejects unsupported nonzero
Call tax or margin. A treasury cap below its recorded buffer, missing cap or
configuration drift refuses admission without writing an approval.

Reporting presents nine explicit choices in two labelled groups (five periods,
four loaded-status filters), then five full-period measures, then loaded-row
exports and detail tables. The extra period choice makes the existing monthly
Agent view explicit. Status selection survives summary refresh and scope changes.
Known terminal no-charge Calls contribute zero; uncertain or unattributed payment
evidence leaves amount coverage incomplete. Account totals use ledger settlement
dates; Agent charge projections use Call creation dates, labelled separately.
The 10,000-row aggregate bound refuses excess instead of returning sampled totals;
all-time paginated history remains available.

Root source review checked these guarantees against the handlers and focused
regressions, including owner isolation, changed policy/customer facts, duplicate
issuance, failed original rendering, partial refunds, time boundaries and stale
pagination responses. Local rendered invoice fixtures exercise the actual
renderer and are explicitly simulated evidence. Production financial events,
print-to-PDF output and licensed screening still need their own runtime proof.
