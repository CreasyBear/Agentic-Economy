# Daily and monthly spending limits

Status: period implementation and focused local evidence established; remaining
AM-20 source conditions are tracked below. The release manager accepted the
nonnegative mechanism. Hosted cutover remains a separate release operation.

## Buyer contract and reproduced defect

One Agent's accepted purchases must fit both its current daily and monthly limits,
including held or uncertain amounts. Credentials identify access; they do not own
or replenish the allowance. Funding is separate. This follows PRODUCT.md's hard
aggregate limits, rotation survival and execution-time revalidation contract.

The registered buyer/real local Ledger regression
`enforces a distinct daily limit while monthly capacity remains available` uses
AUD10 prepaid credit, AUD1.20 per Call/day and AUD5 per month. Two same-day AUD1.20
Calls returned `pending` before this change; the available buyer balance became AUD7.60.
The correct result is refusal of the second purchase and AUD8.80 available.
The original regression failed on that exact assertion after cancelling both Calls,
restoring AUD10 and proving zero signatures or paid Provider requests.

Original root cause: `prepareFinancialSubjectsHandler` in `convex/capabilityQuotes.ts`
selects only `maximumMonthlySpend`; Quote and managed booking carry one
`agentBudgetGeneration`. The corresponding ledger accounts are keyed by principal
and generation, with no daily/monthly period. This is not a missing UI check.

## Accepted semantics

Use UTC calendar days and calendar months for alpha, and disclose UTC wherever
these limits are described. The release manager accepted this convention and
identified existing `currentUtcMonthBounds` in
`src/modules/agent-access/agent-access-console.ts`; extract/reuse that convention
for the money-domain helper rather than inventing a second clock.

- Attribute spending to the period of accepted Call admission. Bind period starts
  and ends in the Quote and cap Quote expiry at the next day boundary. An unconsumed
  Quote crossing that boundary is refused with a fresh-Quote continuation. Replayed
  accepted Calls retain their original period identities, including after midnight.
- Period identity is stable Agent principal + period kind + UTC start. It excludes
  credential, grant and policy generations. Limits come from current authenticated
  authority, never from caller-supplied amounts.
- Reserved and uncertain amounts consume capacity immediately. Capture moves held
  capacity to spent without restoring capacity. Proven pre-submission cancellation
  or an authorized refund returns capacity only to the original periods, once.
- At rollover, new purchases use new period accounts. Old pending/uncertain Calls
  remain held in their original periods and retain their buyer-funds, concurrency
  and legal-exposure constraints. Old refunds cannot credit the new period.
- A changed authorized limit applies to subsequent admissions against the same
  period's existing usage. Lowering below used/held amounts refuses new purchases;
  it neither erases usage nor retroactively cancels accepted purchases. A changed
  policy makes unconsumed Quotes stale under the existing authority contract.

## Native ledger enforcement

Use the existing non-overdrawing capacity-account pattern for two stable period
accounts. Initialize each period's available capacity once, and reserve daily and
monthly capacity within the existing atomic AUD transaction, alongside buyer
funds and legal exposure. Treasury and Provider obligation remain the other two
transactions in the existing atomic bulk. Keep the three-reference reservation
identity by adding postings inside the AUD transaction.

A period account has available, held and spent balances. Purchase sources never
allow overdraft. Capture transfers held to spent; attributable cancellation/refund
returns capacity to the original period available account. Credential or policy
revision never changes these account identities or mints a whole new allowance.

An authorized limit change posts only `newLimit - previousAppliedLimit`, once per
authoritative revision. An increase credits that delta. A decrease retires the
exact delta; this **control adjustment only** permits the available account to go
negative when existing held/spent usage already exceeds the new ceiling. New
purchase transfers still cannot overdraw. A later release offsets that deficit
before capacity becomes available. This uses the native ledger as the only spend
counter; an application read-then-write available-balance calculation is forbidden.

Control ordering must be durable: preserve the previous applied ceiling, proposed
ceiling, current authority revision, immutable command reference and pending/applied
state for each period. New admissions are blocked until exact ledger evidence
proves the current revision's delta applied. Initialization and revisions must be
serialized by the authoritative Convex mutation; retries use the stored command,
not a newly calculated delta. This control record is configuration/effect evidence,
not a parallel balance or spent counter. The bounded source review found no suitable current principal-period control row.
Add one internal `agentSpendingPeriods` control table (no spent/balance counters):
`principalRef`, `periodKind`, `periodStartAt`, `periodEndAt`, `appliedLimitUnits`,
`appliedRevision`, and an optional pending command containing `revision`,
`previousLimitUnits`, `targetLimitUnits` and `authorityDigest`. Derive the exact
command reference/idempotency key from this immutable material using the shared
reference function; store acknowledged transaction references and command digest
on this same row alongside the clean-period disposition. Index by
principal, period kind and start. One pending command may exist at a time.
A newer policy cannot overwrite an uncertain command; first recover that exact
command, then derive the next delta against the persisted applied limit. Admission
checks both rows are applied for the current authority revision in the same Convex
reservation mutation; a mismatch returns a bounded recheck/support continuation.

### Rejected mechanism and native proof

Formance documents [bounded overdraft](https://docs.formance.com/modules/numscript/reference/overdraft),
and a sequential local prototype appeared to enforce both limits. It is rejected
for admission on the pinned Ledger 2.4.12 / `machine` runtime: two simultaneous
100-unit reservations against a new daily account with bound 100 both committed.
The exact regression assertion expected one fulfilled result and received two.
Do not restore this mechanism based on sequential tests or current-version docs.

The replacement native test
`enforces daily and monthly bounds natively and releases only original period usage`
in `tests/integration/money-formance-boundary.test.ts` passes using nonnegative
capacity sources and real SDK transactions on Ledger 2.4.12:

| Native scenario | Observed result |
| --- | --- |
| Two concurrent 100-unit purchases, daily capacity 100/monthly 200 | Exactly one commits; the other is `INSUFFICIENT_FUND`; buyer=900, daily=0, monthly=100 |
| Next day in same month | Second 100-unit purchase admitted |
| Further day with month exhausted | Refused, no partial buyer reservation |
| New month | New period capacity supports a purchase |
| Month ceiling 200→50 with 100 held | Once-only delta retires 150; available becomes -50; a new purchase is refused |
| Release old month's first Call twice | Same transaction ID; old daily/monthly restored once; current month stays -50 |
| Release current month's 100-unit hold | Available becomes 50, not 200; another 100-unit purchase remains refused |
| Raise current month ceiling 50→150 and replay adjustment | Only +100 once; a 100-unit purchase succeeds and leaves 50 |

This proves native concurrency, scarcity, delta arithmetic, replay and original
period effects. It does not prove AE policy-change ordering, clock-derived
rollover, capture/refund wiring, interrupted recovery or legacy cutover. Those
remain explicit integration acceptance below.

## Concrete affected contracts

| Boundary | Bounded change |
| --- | --- |
| Period identity | One money-domain helper derives validated day/month starts/ends and stable references from server time and principal. Test month/year/leap-day boundaries. No reset scheduler. |
| Period control | Add internal `agentSpendingPeriods` configuration/effect record above to `src/modules/money/internal/convex-schema.ts`, with one canonical backend owner for prepare/readback/acknowledgement. Ledger remains sole usage/balance authority. |
| Quote storage | Add versioned daily/monthly period identities, limits and usage snapshots to `capabilityQuotes` in `src/modules/capability-execution/internal/convex-schema.ts`; bind them into Quote evidence. Keep existing authority generations as evidence. |
| Quote coordinator | `convex/capabilityQuotes.ts` reads native period available capacity, checks both limits, clamps expiry, and revalidates boundaries. Initialize each stable period once; await current policy-revision adjustment before admission. Preserve funds/treasury/legal-account checks. |
| Managed booking | Extend versioned booking values in `convex/moneyManagedCall.ts`, `convex/moneyFormance.ts` and `FormanceManagedCallBooking` with immutable periods/limits. Recovery loads original booking, never today's periods. Trace every existing copy of this validator before assigning edits. |
| Financial templates | New immutable schema/template version in `src/modules/money/formance.ts`; preserve old templates for existing accepted Calls. Add daily/monthly reserve, settle, release and supported-refund postings in the same native transactions; add a reviewed exact-delta capacity-adjustment template. Update pinned requirements/schema digest through existing generation/verification tooling. |
| Ledger reader | Existing `readFormanceAccount` rejects negative balances. A decreased ceiling can create a legitimate capacity deficit: add a narrowly typed capacity read using SDK input/output volumes with safe-integer checks, without weakening customer-money validation. Project zero spendable capacity while in deficit; native purchase scarcity remains authoritative. |
| Recovery/evidence | `formance-workflows.ts` derives both period accounts from persisted booking for every effect. No new reconciliation service, alternate compensation loop or fourth reservation reference. |
| Customer contract | Disclose UTC semantics using existing policy/readback surfaces. Reuse existing budget refusal and fresh-Quote continuation; no internal ledger names in buyer output. |

This is a real storage/template evolution. It must not be implemented as an
optional-field fallback that treats a periodless new Call as unrestricted.
New versioned bookings require both periods. Existing periodless accepted Calls
must remain recoverable through their exact original booking/template.

## Cutover and blast radius

The release manager owns schema-version selection and cutover. Propose financial
schema `v1.4.0`, preserving `v1.3.0` template material for actual legacy recovery.
Versioned booking discriminants route new period bookings versus historical
periodless bookings; new Calls cannot select the legacy variant. Existing
`managedCallCommand` stage/reference/idempotency derivation stays unchanged for
legacy records. New period booking input, schema version and period identities
are bound in command digests; retries use the persisted booking, never current
policy/calendar values. Keep historical protected encodings intact.

Choose **clean-period deferral** for the bounded alpha cutover, not automatic
historical opening-balance migration. Before first initialization for an Agent,
prove no previously accepted periodless financial Call exists in the current UTC
month. Check this from canonical Call records at the admission boundary, with an
index supporting principal plus acceptance time; ambiguous/missing acceptance
identity is not absence. If such history exists, mark the period control blocked,
retain all existing Calls/recovery, and return a truthful support action. A new
clean month can be initialized only after repeating the authoritative check.
Fresh Agents and Agents with provably clean current-month history can initialize
normally. Credential replacement does not bypass this principal-based check.

This deliberately defers an affected existing Agent's new purchases rather than
inventing unattributable opening usage. It does not delete/rewrite old history or
cancel existing Calls. If the release manager requires same-month admission for
those Agents, implement a separately reviewed exact-Call opening-usage migration
with recovery linkage; do not silently weaken this fence. Old accepted Calls
continue using their original ledger accounts and immutable templates.

Backend cutover must first reject new acceptance from legacy periodless Quotes;
otherwise a late old writer could appear after a clean-history check. Perform
that check, period-control acknowledgement and source reservation through the
same authoritative Convex boundary. No hosted mutation or actual data migration
is authorized by this design artifact.

## Executable contracts and ownership

This is one deep implementation. Completion is the eight scenarios below, not a
sequence of fresh audits. Native ledger and control/admission changes develop in
parallel; integrated buyer scenarios run after both boundaries are connected.

| Owner | Cohesive boundary | Dependency and completion evidence |
| --- | --- | --- |
| UTC worker | Existing calendar convention and shared day/month helper | Complete: UTC leap/year/day boundaries and invalid inputs, 3 tests |
| Native ledger worker | `formance.ts`, `formance-workflows.ts`, schema pin and native/workflow tests | Immutable original/new templates, exact period delta, nonnegative daily/monthly reservation, original-period capture/release; actual workflow tests |
| Backend owner | Period configuration/effect row, prepare/acknowledge/admission contracts and transactional tests | Pending command cannot be replaced or admitted through; interrupted command recovered before next delta |
| Quote/admission worker | Quote preparation/evidence/expiry, booking validators/persistence and source reservation fence | Depends on the agreed native/control interfaces; new periodless financial acceptance refused; exact replay retained |
| Backend owner | Registered-buyer integration matrix | Depends on both implementation boundaries; makes reproduced daily defect green and checks matrix |
| Release manager | Combined typecheck/codegen/gates and hosted deployment | Receives coherent source slice and exact unverified guarantees |

CONTRACT: prepareAgentSpendingPeriods(current authority, server time)
  Requires: authenticated current Agent authority, canonical nonnegative AUD/6 limits,
  daily <= monthly, finite server time; caller resolves authority in this mutation.
  Ensures: stable principal/calendar rows; either exact pending commands or applied
  period snapshots, never a newly minted allowance per credential/policy generation.
  Invariant: at most one pending command per period; previousLimitUnits comes from
  acknowledged configuration, never an observed spend balance. An accepted Call
  whose reservation is unresolved prevents starting a limit delta. Existing pending
  command is recovered unchanged even if current policy differs.
  On violation: typed refusal, no new command or purchase; history ambiguity requires
  support. No successful default or inferred zero opening usage.

CONTRACT: acknowledgeAgentSpendingPeriod(command, exact native result)
  Requires: native executor completion from a successful write or metadata-verified
  exact-reference replay, and the persisted pending command identity. The mutation
  compares the shared deterministic native reference; arbitrary valid-looking
  references cannot acknowledge another command. Zero delta requires no reference.
  Ensures: applied revision/limit advances once; duplicate acknowledgement is inert.
  Invariant: later policy cannot overwrite pending command; no spend amount is stored.
  On violation: conflict; pending state remains, new admission stays fenced.

CONTRACT: spendingPeriodsAreCurrent / reserveHandler
  Requires: current authority and unexpired Quote for the same Agent; periods match
  server UTC interval, current limits and acknowledged revisions.
  Ensures: new Call reservation only after both periods are ready; Quote consumption
  and Call insertion share this Convex transaction. Exact accepted replay returns
  before current-period checks and keeps original immutable booking.
  Invariant: control preparation reads the same indexed Call reservation set that
  admission changes; Convex serializability prevents a delta crossing an unresolved
  admitted reservation. A pending control command prevents new admissions. Ledger
  alone arbitrates simultaneous financial scarcity after source acceptance.
  On violation: truthful refusal/fresh Quote; no new Call and no financial command.

CONTRACT: native initialization/revision/reservation/recovery
  Requires: exact stored command/booking and supported immutable schema; release
  requires existing proof of absent submission; capture requires its existing
  outcome evidence. New bookings require both valid UTC periods.
  Ensures: one transaction effect per exact reference; both capacities participate
  in the same buyer reservation/capture/release transaction. Capture retains usage;
  supported release returns capacity only to original periods.
  Invariant: purchase sources never overdraw; only authorized downward configuration
  adjustment may create a deficit. Missing acknowledgement never licenses another
  command or changes a pending command's previous limit.
  On violation: existing refused/unavailable/outcome_unknown contracts; ambiguity
  retains the hold and exact retry identity, never claims successful compensation.

Idempotency and temporal analysis:

| Race / partial completion | Required outcome and enforcement |
| --- | --- |
| Two initializers for same Agent/period | Convex unique indexed row and pending revision1; identical native command twice produces one credit |
| Policy changes during pending delta | Recover old persisted command, acknowledge it, then derive next delta from its applied target |
| Ledger succeeds before source acknowledgement | Replay exact command/ref, acknowledge same result; no second initialization/delta |
| Purchase races policy revision preparation | Admission reads both period rows; revision preparation reads unresolved Call reservations. Convex ordering either admits old reservation first and defers delta, or writes pending delta first and refuses admission |
| Multiple purchases after same readback | Native nonnegative capacity resolves actual combined scarcity atomically |
| Duplicate release after rollover/rotation | Original booking periods and stable effect reference restore original capacity once |

COMPLEXITY: principal-period configuration/effect row
  Added: one internal table and its prepare/acknowledge boundary; native command and
  source acknowledgement are two observable states. A period field crosses Quote
  storage, booking validation and ledger code: that coupling is deliberate immutable
  financial evidence, with one shared validator instead of divergent copies.
  Bought: exact once-only initialization and limit delta survive crashes/concurrent
  policy edits without reading balances to derive allowance or overwriting uncertainty.
  Net: worth it for the demonstrated decrease/replay and concurrent admission failure
  cases. Existing commercial policy rows describe environment policy, not principal
  periods or pending effects; reconciliation cases describe incidents, not applied
  configuration. Neither can safely supply the previous authorized ceiling.

SIMPLICITY: native capacity plus explicit configuration-effect record
  Strands: authority policy; applied configuration; financial usage; effect recovery.
  Complected: applied configuration and its one pending native effect intentionally
  share a row because acknowledgement advances that configuration. Usage stays solely
  in Formance; credentials remain access identity; period time remains UTC data.
  Easy score: medium. Simple score: high relative to application counters and reset jobs.
  Verdict: use existing SDK/native transactions and recovery. Reject an application
  spending counter, generation-based refill, generic command framework, SDK parser,
  reset scheduler or second reconciliation system.

### Supported remedy boundary

Source trace: `convex/moneyManagedCallLifecycle.ts` invokes
`moneyFormance.releaseManagedCall` for the supported pre-submission refund/release.
`moneyDocuments.bookBuyerAdjustment` corrects document rounding; it is not a
captured Call refund. No current application caller authorizes a captured Call
buyer refund. An uncalled new refund API/template was rejected: it would add a
financial consequence without the remedy authority and resolution caller.

The original-period release scenarios below cover the existing supported remedy.
Captured Call refunds remain an explicit AM22 application gap; do not mark that
guarantee implemented because a native script can reverse postings. Capture
continues to retain daily/monthly usage. No extension of refund authority is
hidden in this spending-limit change.

## Acceptance scenarios

1. The red daily-limit regression passes; a lower monthly remainder independently
   refuses spending even with daily capacity. Exact refusal reason identifies the
   limiting policy without requesting another top-up.
2. Two concurrent Calls/credentials share both bounds; combined accepted amounts
   cannot exceed either. Credential replacement changes neither period usage.
3. A pre-boundary Quote expires at midnight; a new day's Quote sees daily capacity
   but the same monthly usage. Month/year/leap-day boundaries behave explicitly.
4. Held/uncertain prior-period Calls survive rollover. Recovery captures/releases
   their original accounts; duplicate recovery changes capacity once.
5. Authorized policy decrease/increase preserves usage; stale authority/Quote is
   refused before a new effect. Lowering below usage cannot create capacity.
6. Late original-period supported pre-submission refund/release does not fund the current period. Buyer money,
   native period balances, legal exposure, treasury and Provider obligation reconcile.
7. Ledger-success/source-interruption follows existing exact-reference recovery;
   missing or partial evidence remains uncertain. No duplicate ledger postings.
8. Legacy accepted Calls remain recoverable; new Quotes require period-aware
   booking; cutover with existing usage cannot replenish spending authority.

## Source evidence and exact remaining conditions

| Condition | Enforcing source and observable evidence | Scope / result |
| --- | --- | --- |
| Distinct daily/monthly capacity | Quote period snapshots and `SPENDING_PERIOD_*` / v1.4 Call templates; Workpool daily scarcity and independent monthly refusal | Local registered buyer plus real Ledger: correct limiting reason, no second debit |
| Calendar and immutable recovery | Shared `utc-calendar.ts`; Workpool UTC day/month rollover; workflow capture/release tests | Old Quote expires; accepted replay uses original periods; late release does not refill a new day/month; leap/year helper tests |
| Concurrent daily scarcity | Same v1.4 AUD transaction reserves both capacity accounts; Workpool simultaneous prequoted Calls | One winner, one refused, once-only cancellation restores funds/periods |
| Pending adjustment identity | `prepareAgentSpendingPeriods`, shared `spendingPeriodAdjustmentReference`, exact acknowledgement and native executor | Unrelated-reference acknowledgement conflicts; real lost-ack effect replays once before newer ceiling delta |
| Legacy preservation | v1.3 immutable schema/booking and clean-history initialization fence | Existing native recovery tests pass; ambiguous current-month history refuses rather than assuming zero usage |
| Admission versus control transaction race | Admission reads period rows and writes indexed `reservation_pending`; adjustment preparation reads the unresolved reservation index | Source fence and pre-existing unresolved-reservation test established; production Convex concurrent-transaction scheduling is not proved by convex-test |
| Legal-account exposure | Existing native legal-capacity posting and Quote `account_limit` guard | Quote account_limit refusal produces support guidance, no Quote/Call or funding action; real two-Agent/two-account native contention has one winner, all loser references absent, no partial debit, once-only release and same-booking retry |
| Native rate/concurrency | Maintained Convex rate-limiter and indexed Call admission | Rate buckets and active Call counts now use stable Agent principal; actual maintained rate-limiter component and registered credential rotation tests pass; expired grants do not release pending/uncertain concurrency |
| Same-Agent policy change after Quote | Current authority requires stored Agent/grant policy/generation agreement; replacement intentionally preserves policy | **Active implementation:** manager authorized a bounded owner-authenticated monetary-limit update and readback within AM-20. Helper-level deltas alone do not establish buyer acceptance |

The missing policy-change acceptance is specifically: obtain P1 Quote, perform an
authorized P2 update for the same Agent, refuse the unused P1 Quote before any
reservation/provider effect, then issue/enforce a P2 Quote against retained usage.
`agentAccessPolicy.registerGrantForServer` has no production wrapper caller and a
new grant alone does not update `agentAccessPrincipals`; current-authority matching
correctly rejects that mismatch. Credential replacement is not a policy editor.
The release manager authorized completing this same-Agent update within AM-20.
Use the existing owner-authenticated application caller and delegation service;
no UI/editor, new service or parallel usage counter is included.

Local checks exercise the real pinned Ledger/official SDK and convex-test source
transactions. They do not establish hosted deployment, actual Stripe Checkout,
production Convex scheduling, installed-client policy editing or captured-Call
refunds. Manager owns codegen, combined gates, source acceptance and final review.
This design does not close unrelated alpha rows.


### Same-Agent monetary-limit update contract (authorized AM-20 completion)

Requires: current authenticated Account owner, active same-Account Agent and
current canonical delegation, expected current access-policy generation, a
canonical idempotency key, valid AUD/6 per-Call/day/month limits.
Ensures: one coherent immutable current access-policy revision, owner readback
and the existing `agent.policy_updated` event. Old unused Quotes fail before
reservation; a fresh Quote applies new limits to the existing native usage.
Invariant: credential, scope/tool selection, Account, rate/concurrency policy,
accepted Call booking and native period identities remain unchanged. Duplicate
commands return their original revision, conflicting expected revisions have one
winner, and a prepared credential replacement prevents policy changes until that
separate transition resolves. Existing pending native deltas remain immutable.
On violation: typed authentication/ownership, invalid-limit, stale-revision,
idempotency or replacement-pending refusal before authority writes. Native
outage after the policy transaction leaves a truthful Quote recovery condition;
it cannot undo the owner decision or invent a successful limit adjustment.

TYPE DESIGN: input consists only of the three editable monetary limits plus
expected generation and command identity; server derives all commercial/credential
roles, policy references and generation. Existing exact-amount/policy constructors
validate currency, scale, order and SDK range. Result is a closed completed/replayed,
conflict/refused union; absence of native adjustment is not reported as purchase
capacity. No optional flag means both accepted and refused.

ERROR STRATEGY: expected owner/revision/policy conflicts are recoverable typed
results with the strong transaction guarantee: no partial authority/audit writes.
Unexpected internal invariant or storage failures abort the Convex transaction;
only the application boundary translates source unavailability. Ledger command
ambiguity remains the already implemented pending adjustment, never a blanket
success or a new initialization.

COMPLEXITY / SIMPLICITY DECISION: one owner mutation/readback and existing server
function caller, shared input/result validation, and one focused source test file.
This buys an actual supported policy transition using the existing delegation,
audit and immutable grant records. Keep credentials, policy revision, usage and
recovery separate. Reject editing through credential replacement, raw test-only
patches, a new policy framework/table, unused mutation helpers and a new UI flow.
The original period implementation is retained; this closes its actual caller
rather than replacing it or reopening the design.
