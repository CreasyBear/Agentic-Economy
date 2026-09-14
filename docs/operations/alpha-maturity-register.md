# Alpha maturity register

Baseline: 14 September 2026. **32 release items. Alpha is not ready.**

This is the execution and completion register. The
[release design](alpha-release-design.md) defines behavior and responsibilities;
the [validation plan](alpha-validation-plan.md) defines the cold-audit protocol.
Neither creates an additional backlog outside this register.

## Marking rules

**Current sequence: complete source first.** Deployment repair, environment
changes and hosted acceptance are deferred. Complete all applicable source
obligations and agreed UX P0/P1 repairs, then give Joel the source-complete
handoff; do not automatically enter deployment afterward.

### Record-by-record execution

Joel requires systematic closure of these release records. A record's complete
behavioral contract is the unit of work; a discovered issue, component, skill
invocation or passing test total is not a replacement work queue.

For each assigned record:

1. Read its Given/When/Then and failure/recovery conditions in full. Execute the
   matching skills and state the semantic preconditions, guarantees, invariants
   and failure behavior for the whole affected journey before implementation.
2. Map every source condition to existing implementation and attributable
   evidence first. Reuse valid evidence, including evidence already produced
   under another record. Identify the finite missing conditions; do not assume
   that an open verification label requires new code or another broad audit.
3. Implement and verify only those missing conditions, in dependency order.
   Keep newly discovered in-scope defects within that record's acceptance list.
   Put unrelated findings under their existing parent for later consideration;
   do not switch the active work to them or expand alpha scope silently.
4. Check the resulting source against the stated contracts. Close SOURCE VERIFIED
   only when all source conditions are supported. Otherwise name the exact
   unmet condition, dependency and next action. Hosted-only proof stays separate.
5. The manager integrates and accepts the record's source outcome, then advances
   to the next assigned record. Do not start a new roast, polish pass, general
   audit or cleanup loop between records. Missing paperwork does not invalidate
   correct work; establish the missing substantive evidence without restarting it.

**Current controlled assignments:** AM-20, AM-02 and AM-04 are SOURCE VERIFIED
after manager acceptance. Backend next owns AM-05, then the explicit order below.
UX completed its authorized workspace source closeout and is archived; do not
wake it for backend dependencies or deferred browser proof. AM-27's outstanding
source dependencies remain with their owning records. Workers remain isolated;
the manager resolves cross-record dependencies.

**UX phase boundary:** address every existing finding at source first. During
this phase use the selected skills/contracts and narrow relevant source checks;
do not run Playwright, browser setup, visual/keyboard sweeps or repeated full
reviews. Record a finding as fixed in source when its source contract is met,
with browser/runtime evidence explicitly deferred. A real missing source
dependency remains blocked; deferred browser proof alone is not a source defect.
After all required source findings are complete, the manager commissions one
consolidated review of the integrated result. Repair defects found in that review
and recheck the affected behavior, without restarting open-ended audit cycles.
This final review does not authorize deployment or hosted configuration repair.

**Next source closeout order:** AM-05, AM-06, AM-07, AM-09, AM-10,
AM-11, AM-12, AM-14, AM-15, AM-16, AM-17, AM-18, AM-21, AM-22, AM-23, AM-24,
AM-26, AM-29. AM-27 retains its explicit source dependencies. Already
source-verified rows are not reopened without relevant contrary evidence;
AM-01/25/28/30/31/32 remain the hosted-only queue. A concrete dependency can change
this order through the manager, with the reason recorded; incidental discoveries
cannot. Reports identify the active record, conditions satisfied/remaining and
the next record, not merely files changed or tests run.

### Source and hosted status

The compact source column is independent of acceptance status. Its initial
classification is **3 SOURCE VERIFIED, 23 SOURCE GAP, 6 HOSTED ONLY**.
`SOURCE GAP (verification)` means the complete source contract still needs
attributable coverage mapping or a focused check; it is not an assertion that
an implementation defect exists. `HOSTED ONLY` means available evidence
indicates operational proof, with no new source change currently justified.
Move a gap to SOURCE VERIFIED only with evidence for the entire row's source
obligations. Never manufacture implementation work to make an operational row
look active, and never change its hosted acceptance standard.

- **VERIFIED:** the stated pass condition has attributable evidence against the
  intended hosted environment. Relevant failure checks are included where stated.
- **PARTIAL:** configuration, source tests or part of the journey is proved;
  the entire pass condition is not.
- **FAILING:** an observed failure or established missing behavior contradicts
  the pass condition.
- **NOT VERIFIED:** sufficient acceptance evidence has not been collected.

Each change, audit and defect must name an item below. Root owns integration and
closure; a worker owns only its assigned files and check. Code completion and
passing unit tests do not automatically change a row to VERIFIED. Record the
revision, environment, date, exact references and observed result before marking.
Evidence is invalidated only by relevant changes; do not repeat unrelated work.

The baseline stays at 32 items. New findings become child defects under the
appropriate item, not new milestones. A genuine change in alpha scope requires
an explicit product decision. No silent exclusions or changing acceptance to
match the implementation. A blocker identifies a concrete dependency and next
action; it is not a substitute for testing.

## Behavioral acceptance contract

The acceptance question is: **under these conditions, can the Customer and
Agent complete the promised job and recover it without guessing or manual data
repair?** Provider and operator rows establish the supporting promises; they do
not stand in for a buyer purchase. These are acceptance conditions, not new
commercial terms or claims that the behavior is already implemented.

Read each row as **Given / When → Then**, followed by its failure or recovery
check. Both columns must pass. Preconditions describe legitimate starting state;
the application must check them, not assume the user obeyed them. Invalid input,
stale authority and interruption are test conditions, not excuses for undefined
behavior. Cross-references reuse another row's proof without merging its status.

The following meanings apply throughout:

- **Usable result:** literal output for the accepted input that satisfies the
  quoted Tool output contract and is retrievable by the caller. A successful
  payment, HTTP response or background job alone is insufficient.
- **Safe continuation:** the offered action works for that actor and current
  state, carries the durable references and resumes the existing work. After
  possible dispatch, it cannot create a fresh purchase. A non-terminal machine
  response has at most one executable continuation and one optional owner
  handoff, as defined in [START_LINE.md](../../START_LINE.md#proof-contract).
- **Once:** one business effect per accepted command across retries, refreshes,
  duplicate events and concurrent attempts. This does not promise that an
  external event or network request is delivered only once.
- **Truthful status:** distinguish available/reserved/captured credit, upstream
  settlement, delivery and purchase resolution. Pending evidence remains
  pending; a timeout is not proof of failure or success. The response explains
  what is known and the permitted next step.
- **Bounded authority:** funding does not grant spending permission; a new
  credential does not reset Agent limits. Account, Agent and current policy
  remain attributable through purchase, recovery and records.

No row introduces an instant-completion guarantee, automatic refund for every
failure, live-money capability or a new support SLA. Existing supported remedies
and operating targets apply. Public discovery may show unsupported external
Tools; browsing does not confer execution support. Sandbox restrictions apply
at Quote/Call admission and before paid effects.

## Account and access

| ID | Given / When → Then | Failure, recovery or linked check | Status | Source status / next owner action | Evidence or outstanding proof |
| --- | --- | --- | --- | --- | --- |
| AM-01 | Given the named alpha candidate, a Customer uses the app and connected Agent against the same Account, balance and Tool state; web, backend and integrations resolve to the recorded targets | Health/readiness and release identities match the recorded candidate; sandbox fences refuse live funding/mainnet execution even through direct requests. An unavailable dependency cannot produce false success | PARTIAL | HOSTED ONLY — Release owner: target/revision alignment and effective sandbox-fence proof deferred; no additional source change indicated. | Targets and health recorded in [registry](deployment-registry.yaml#hostedalphareadback); current web and backend have different source revisions. Coherent candidate and effective restrictions need verification |
| AM-02 | Given a fresh invited business user, signing up or signing in reaches the intended app page; signing out removes access and signing back in restores the correct Account context | Invalid or expired authentication and an interrupted return offer a working sign-in/recovery path; no redirect loop, lost destination or accidental second Account | PARTIAL | SOURCE VERIFIED — Shared URL-parser validation rejects external/control-character and normalized authentication self-returns; documented Clerk reciprocal fallback settings preserve the intended destination through flow switching. Current-session guard and canonical first provisioning/restoration enforce one stable Account without rewriting durable identity on sign-out. | `eaa0d7256` integrated as `4997f7072`; [AM02 contract and source evidence](alpha-release-design.md#am02-interactive-authentication-and-account-recovery). Nine-file source matrix 125/125 on candidate and main; candidate combined typecheck and integrated changed-file lint pass. Real invitation/Google challenge, cookie/session termination and hosted concurrency remain unverified. AM-04 owns broader Account isolation. |
| AM-03 | Given a bound Account, a genuine signed Clerk security event appears in that Account’s security history with its original event identity | Replaying the same event preserves one history record. Session enforcement and cross-Account isolation are separately required by AM-02/04; an event record alone does not prove them | VERIFIED | SOURCE VERIFIED — Signed/redacted webhook tests and retained event/replay evidence; preserve AM-02/04 separation. | Recorded event and duplicate-delivery readback `audit:clerk:1f0b1f8774643c66dedb9f68361d2a0963dac1a3886fe9a55cb6cc513ce11b3a`; signed delivery and persistence in registry |
| AM-04 | Given two isolated Accounts with owner, Agent and administrator test roles, each actor can access only the Tools, Calls, money, credentials and documents its role permits | Changing identifiers or calling a route directly cannot read or mutate another Account’s private resources or bypass role restrictions; publicly discoverable Tool information remains public | NOT VERIFIED | SOURCE VERIFIED — Existing canonical owner, delegated Agent, administrator and source-admission boundaries pass named-resource positive/negative checks. Private reads/mutations refuse foreign locators or role substitution; legitimate owners/Agents retain access and public discovery stays public. No new permission layer required. | `2e6929721` integrated as `349f69d0f`; missing existing private-Provider preparation prerequisite `40e5a9859` integrated as `f7499e12d`. [Full source contract and evidence](alpha-release-design.md#am04-account-and-role-isolation). All 22 changed-file cases pass on candidate and main; existing selected source-boundary16 and public-discovery1 cases pass on candidate; both combined typechecks pass. Hosted role/direct-route/storage proof remains unverified. |
| AM-05 | Given an owner with a spending policy, connecting and approving a buyer Agent lets it resume in the actual installed CLI or harness and request a Quote for the correct Account | An unapproved or expired connection offers the supported approval/reconnection path; no copied Account identifier, wallet setup or mandatory diagnostic sequence is needed to purchase | PARTIAL | SOURCE GAP — Access + UX: preserve buyer approval/return context and prove installed-client reconnection without operator diagnostics. | Provider CLI approval was proved; the complete buyer activation journey is outstanding |
| AM-06 | Given an existing Agent and history, the owner rotates its credential; the replacement acts for the same Agent with the same current limits and history. Revocation blocks new Calls through the old credential | Old and new credentials used concurrently cannot multiply capacity. Revocation preserves accepted Call history; any further effect or recovery still checks current authority | NOT VERIFIED | SOURCE GAP (verification) — Access owner: bind rotation, revocation and concurrent credentials to one Agent capacity in source tests. | Hosted rotation/revocation and concurrent-credential checks outstanding |

## Funding and customer records

| ID | Given / When → Then | Failure, recovery or linked check | Status | Source status / next owner action | Evidence or outstanding proof |
| --- | --- | --- | --- | --- | --- |
| AM-07 | Given a requested AUD credit amount, the Customer sees credit, separate service fee and total before authorizing Checkout; Checkout charges the accepted total without reducing the promised credit | Invalid or expired quotes are refused with a working correction/requote path before a changed obligation is accepted; no silent price or credit substitution | PARTIAL | SOURCE GAP (verification) — Funding + UX: finish fee/credit/total hierarchy and trace quote expiry/refusal to executable recovery. | Observed A$10 credit and A$10.55 total; quote expiry/invalid-input acceptance outstanding |
| AM-08 | Given one successful sandbox Checkout, the Customer returns to the same Account and sees the exact requested credit, supported by matching Stripe settlement and Formance posting | Refreshing the return page preserves that balance and the same document references. Browser return alone cannot authorize credit; forced delivery/reordering checks are AM-10 | VERIFIED | SOURCE VERIFIED — Exact booking/finalization tests plus the retained successful payment/return receipt cover this narrow row. | A$10.55 payment → A$10 credit; event `evt_1UF9SZ70N4UjLqHtsVtI98CB`, PaymentIntent `pi_3UF9SY70N4UjLqHt0Pfx80wX`; return refresh retained the balance and documents |
| AM-09 | Given Checkout that is cancelled, fails or expires, the Customer returns to an understandable funding state and can begin the permitted retry without repairing the Account | No confirmed settlement means no credit. If a payment did settle despite a failed browser return, show its durable status instead of inviting an unnecessary second payment | NOT VERIFIED | SOURCE GAP — Funding + UX: funding-return repair is integrated; resolve executable Checkout/Agent return context and negative-path coverage. | Hosted negative funding journeys outstanding |
| AM-10 | Given an accepted funding payment, duplicate or reordered Stripe events converge on the same Account credit, fee and document identities | Replay or interrupt processing before and after posting; no duplicate or missing effect, false completion or second Checkout required to repair the first | PARTIAL | SOURCE GAP (verification) — Funding owner: map event reordering and interruption around posting to once-only convergence tests. | Refresh replay verified; forced event duplicate/reordering proof outstanding |
| AM-11 | Given funding, captured Calls and adjustments, the authorized Customer can open funding receipts, fee documents and period documents and reconcile each line to its source record | Refresh and period aggregation include each item once; exact sub-cent values sum before document rounding. Unauthorized document links disclose nothing; unavailable documents have a truthful recovery path | PARTIAL | SOURCE GAP — Records + UX: finish chronological document/history presentation, access and exact aggregation checks. | Funding document records exist; rendering, period aggregation and access proof outstanding |
| AM-12 | Given a funding payment eligible for a supported refund/reversal, the Customer can follow its status to a single matching Stripe, Formance, balance and document adjustment | Interrupted or rejected processing retains the original payment and recoverable status; retry does not duplicate the adjustment or claim completion before evidence | NOT VERIFIED | SOURCE GAP (verification) — Funding owner: trace supported refund/reversal status and interrupted retry through API/UI and ledger tests. | Hosted sandbox refund/reversal and retry proof outstanding |

## Provider supply

| ID | Given / When → Then | Failure, recovery or linked check | Status | Source status / next owner action | Evidence or outstanding proof |
| --- | --- | --- | --- | --- | --- |
| AM-13 | Given the controlled sandbox source, the Provider can preview it and establish an approved connection with payee-control evidence; returning through owner UI/CLI finds the saved connection and draft | Setup completion does not claim that the Tool is published or buyer-ready; publication is AM-14 and stale or invalid authority is AM-16 | VERIFIED | SOURCE VERIFIED — Owner connection onboarding/proof/refresh tests and retained UI/CLI connection evidence cover this narrow row. | Approved `Agentic Economy Sandbox Tools` business and persisted x402 connection/payee claim in cutover evidence; retained draft exists |
| AM-14 | Given an approved current draft and connection, the owner or delegated Agent submits through the supported entry point; one bounded platform-funded validation returns contract-valid output and makes that version available for supported sandbox Quotes and Calls | Submission shows progress on the same Tool; setup or validation failure explains the blocker and safe next action. No buyer balance funds Provider validation; interruption/continuation is AM-15 | PARTIAL | SOURCE GAP (verification) — Provider owner: complete the registered validation-to-publication source journey across both actors and failure continuations. | Source components and focused tests exist; no hosted paid validation/publication proof |
| AM-15 | Given submitted validation, the Provider closes the client or work is interrupted, pending or timed out; returning shows the same validation case and platform-funded Call with a working safe continuation | Recheck/recovery follows current authority and resumes that validation Call without buyer reservation or Charge. Possible submission remains uncertain; no second payment, permanent polling dead end or manual database repair | FAILING | SOURCE GAP (verification) — Provider owner: complete paid-worker recovery of the retained Call; coordinator/resume and uncertainty invariants are source-tested. | Source tests prove pending status and authorized private-provider coordinator resumption; recovery of retained paid Calls and hosted journey proof remain outstanding |
| AM-16 | Given pending validation or publication, claims expire, source/connection changes, ownership changes or offboarding begins; the Provider sees the current blocker and permitted correction | Those changes block new effects and promotion. A late callback cannot republish withdrawn supply or overwrite authoritative state; retained accepted Calls and their evidence remain recoverable | PARTIAL | SOURCE GAP — Provider owner: finish AM-16.2 withdrawal/freeze/current-authority and late-callback checks; repair any failed precedence. | Several exact-identity checks exist; competing admission writers and full expiry/withdrawal/callback acceptance remain open |
| AM-17 | Given a draft or published Tool, the Provider repeats submission/recheck, revises, withdraws and republishes through supported actions; the displayed version and discoverable/callable state match the accepted action | Replay after promotion or interruption preserves identity and evidence. Withdrawal blocks new purchases without erasing accepted Calls; republishing cannot reuse stale approval for changed material | PARTIAL | SOURCE GAP (verification) — Provider owner: promotion/replay is source-tested; finish revise/withdraw/republish material-change coverage. | Staging replay tests pass; complete hosted management lifecycle and post-promotion replay outstanding |

## Buyer purchase and recovery

| ID | Given / When → Then | Failure, recovery or linked check | Status | Source status / next owner action | Evidence or outstanding proof |
| --- | --- | --- | --- | --- | --- |
| AM-18 | Given an authorized Agent seeking a service, search spends nothing; a supported sandbox Tool yields an exact expiring Quote binding version, input, authority, price, terms, effects, parties and evidence | Unsupported asset/network/recipient/amount or material drift is refused before reservation, signing or paid Provider effects, with a safe next action. External discovery is not a promise of execution support | PARTIAL | SOURCE GAP (verification) — Purchase owner: map the full Quote binding and hostile sandbox inputs to source admission tests. | Source contracts exist; hosted admitted sandbox discovery and Quote proof outstanding |
| AM-19 | Given a funded authorized buyer and valid Quote, accepting it yields literal contract-valid output and one matching AUD reservation/capture, with separate upstream settlement and delivery evidence for that Call | The same accepted command survives refresh/replay without another purchase. Provider validation cannot satisfy this row; unknown outcomes follow AM-21 rather than being labelled delivered | NOT VERIFIED | SOURCE VERIFIED — `19caa3a64`: registered buyer Quote/Call and real local Formance/Workpool prove literal output, one AUD1.20 reservation/capture and same-command replay without a second Call, signature or Provider effect. External payment/Provider responses are fixtures; hosted acceptance remains open. | No hosted buyer paid Call. Provider validation cannot satisfy this row |
| AM-20 | Given insufficient funds, treasury capacity or policy allowance, the Agent is refused with a bounded reason and safe continuation; concurrent Calls/credentials cannot spend the same capacity | Funds/policy refusal admits no purchase. Treasury refusal leaves customer credit available and releases any Agent budget/exposure reservation exactly once, with no signature or paid effect. Possible submission instead follows AM-21; the buyer never operates AE’s treasury | PARTIAL | SOURCE VERIFIED — Manager accepted the full local source contract: distinct stable Agent daily/monthly UTC limits and rollover, native atomic treasury/legal/period scarcity, maintained rate/concurrency limits, credential rotation, owner policy updates with retained usage and stale-Quote refusal, accepted worker execution through fresh authority checks, and exact pre-submission refund recovery after expiry/revocation. | [Spending design and condition-level evidence](../designs/alpha-spending-periods.md#source-evidence-and-exact-remaining-conditions); commits `b37e93fb3`, `ebb98d590`, `dabf14fe1`, `b481cbd8c`, `a3cd08a25` plus integration fixes. Manager source acceptance below. Hosted Stripe Checkout, production Convex scheduling and deployment remain unverified; possible submission and captured remedies retain AM-21/22 ownership. |
| AM-21 | Given an accepted Call interrupted before or after possible submission, the buyer resumes it by durable reference: proven pre-submission failure releases safely; uncertainty retains the reservation and status | Status/cancel/reconcile are offered only when permitted and work from a fresh process. A timeout cannot authorize a fresh Call, duplicate payment, false delivery or an unsupported release | PARTIAL | SOURCE PARTIAL — `80f646ba7`: installed CLI child processes against registered HTTP routes and real local Convex/Workpool/Formance prove fresh-process resume/status/cancel after lost acknowledgement. Distinct-key pre-claim cancellation returns the exact hold without a signature or paid effect; possible submission and unverified recovery retain the original Call, uncertainty and hold and block a fresh purchase. Canonical generic/x402 evidence parsing replaces the narrower CLI parser. Trusted later settlement/remedy and broader continuation parity remain open; this is not whole-row or hosted acceptance. | Signing/settlement recovery source tests pass, including expiry-material retention; hosted recovery proof outstanding |
| AM-22 | Given a failed or disputed delivery eligible for a supported remedy, the buyer follows the original Call to an attributable refund/adjustment and resolved purchase status | Interrupted or refused remedy retains a reason and safe next step. Retry applies the remedy once; original delivery, payment and adjustment records remain linked and visible | PARTIAL | SOURCE GAP — Purchase + UX: complete the supported remedy/status journey and once-only adjustment continuation. | Remedy primitives exist; complete buyer remedy journey outstanding |
| AM-23 | Given the same sandbox purchase and remedy, the Customer reads Calls, Logs, Usage, Spend and documents while the Provider reads its permitted earnings/obligation records; identities, amounts and states reconcile | Refresh/replay cannot duplicate lines or conflate AUD buyer consideration with upstream settlement. Provider, Seller and recipient remain distinct; pending/adjusted purchases are shown truthfully | PARTIAL | SOURCE GAP — Records + UX: finish cross-surface identities/states/amounts and independent Balance loading. | Projections exist; readback of one real sandbox purchase and remedy across these surfaces outstanding |
| AM-24 | Given equivalent authority and the same purchase state, HTTP, installed CLI, MCP and supported chat agree on Tool/Quote/Call identities, amounts, result/status and permitted continuation | After interruption, the supported client can resume from durable references without conversation history; no surface offers a fresh purchase where another requires reconciliation | PARTIAL | SOURCE GAP — Client owner + UX: resolve durable approval/funding/purchase return context; verify HTTP/CLI/MCP/chat continuations agree. | Source parity and earlier CLI archive checks exist; frozen-candidate machine journey comparison outstanding |

## Connections, usability and operations

| ID | Given / When → Then | Failure, recovery or linked check | Status | Source status / next owner action | Evidence or outstanding proof |
| --- | --- | --- | --- | --- | --- |
| AM-25 | Given the deployed app identity and an authorized connection, the operator verifies hosted secret create/use/rotate/revoke/delete in the intended Infisical scope; the supported app action can consume the stored credential | Exact provider readback establishes each lifecycle result. Missing trust or denied access yields a truthful setup/recovery state, without an operator copying secret values between services to complete the test | NOT VERIFIED | HOSTED ONLY — Secrets owner: configured Infisical lifecycle requires real scope/delivery proof; no additional source change indicated. | Projects, OIDC trust and nine bindings configured; hosted lifecycle unproved |
| AM-26 | Given scoped connections and credential generations, only the owning authorized actor can use or change them; revocation/cleanup reports the actual external result | Cross-Account access and stale-generation cleanup cannot affect another owner or replacement credential. Failed cleanup remains resumable; no secret exposure or premature deletion claim | PARTIAL | SOURCE GAP (verification) — Secrets owner: trace isolation, stale generation and resumable cleanup to exact source tests. | Scoped pointer/cleanup boundaries exist; hosted isolation, stale-generation and failed-cleanup proof outstanding |
| AM-27 | Given each supported UI journey, a user can complete it on desktop, compact layout and keyboard; focus, loading, empty, validation, error and success states explain progress and next action | Invalid input or failed requests preserve recoverable work; no dead controls, inaccessible action or internal jargon. Test interaction and transitions, not screenshots alone | NOT VERIFIED | SOURCE GAP (dependencies) — UX source closeout: 36/42 detailed findings fixed; no further independently actionable UI source repair identified. Remaining source dependencies: Account chronology/reversal attribution/source links (AM-11/23), trusted external Agent task return (AM-05/24), requested stage-event vocabulary versus AM-28 HOSTED ONLY classification, and whether notifications require an actual buyer consumer. Manager resolves these through their owning records; do not invent client sorting, deep links, generic events or a notification inbox. The same-identity journey source depends on the relevant access/purchase/recovery records; Playwright/browser proof is deferred to the single final review and alone does not prevent source completion. | Requires frozen surface inventory and cold interaction evidence; no screenshot-only closure |
| AM-28 | Given a deliberate application failure, the user gets a usable correlation reference and the operator receives the matching event at the intended error/alert destination; configured analytics receives a non-sensitive test event | Failure details support diagnosis without secret exposure; a missing delivery is a failed check, not proof from an enabled integration toggle | NOT VERIFIED | HOSTED ONLY — Observability owner: destination identity and actual event/alert delivery deferred; no additional source change indicated. | Actual Sentry/PostHog project destinations and delivery remain unverified; resolve and record them before running the AM-28 acceptance scenario below |
| AM-29 | Given an uncertain Call, the user can reach the supported help path with that Call’s reference; supported account/security/offboarding actions explain what completes and what remains outstanding | Offboarding cannot silently erase history, unresolved purchases or obligations; blocked actions give a reason and supported next step without promising cancellation of an already submitted effect | NOT VERIFIED | SOURCE GAP — Account + UX: finish reference-bearing help, security and offboarding continuations without erasing accepted work. | Hosted support and isolated test-account offboarding journeys outstanding |
| AM-30 | Given a runtime interruption, the operator restores service from the declared recovery/backup procedure and demonstrates the recorded alpha recovery target using authoritative data, including recovery-point loss of at most 300 seconds | Exercise restart, recovery and actual alert delivery; retained accepted work and financial records remain reconcilable. Missing target evidence or an exceeded target keeps the row open | PARTIAL | HOSTED ONLY — Operations owner: current restore/restart/alert/RPO proof deferred; no additional source change indicated. | Infrastructure and retained backups established. The 308s result is from the retired environment’s 4 September restore, not current-alpha acceptance; the 300s target remains. Current restore and SNS delivery unverified |
| AM-31 | Given the frozen supported UI and machine inventory, cold Luna/max auditors attempt the assigned user jobs and record observed outcomes, easy/difficult steps, likes/dislikes, papercuts and tasks over three turns | Every surface has evidence or an explicit failed/untested result. Stop each assignment at six decision turns or twelve minutes; unfinished work stays unverified and findings receive disposition, not silent scope cuts | NOT VERIFIED | HOSTED ONLY — Audit owner: final cold user audit is deferred; source-level UX repairs remain AM-27, with original acceptance intact. | Audit follows the existing six-turn/twelve-minute lifecycle. More than three turns is a friction flag, not automatic failure |
| AM-32 | Given one named candidate, the release owner can trace every preceding row to accepted evidence, passing relevant regression/release checks and no open critical child defect before inviting the waitlist | A relevant candidate change reopens affected proof. Green health or source tests cannot substitute for hosted behavior; an unmet contract prevents the alpha-ready claim | NOT VERIFIED | HOSTED ONLY — Release owner: final candidate/acceptance rollup deferred; source-complete handoff to Joel is required first. | Final release audit; no readiness claim from source tests or a green health endpoint alone |

## Current defect queue

These are children of release items, not additional release scope. Status:
OPEN / ASSIGNED / FIXED IN SOURCE / VERIFIED. A fixed-in-source defect does not
close its parent until the parent's acceptance is met.

| Defect | Parent | Required correction | Status |
| --- | --- | --- | --- |
| AM-15.1 | AM-15 | Treat elapsed polling as pending work with an owned continuation, not completed business failure | FIXED IN SOURCE |
| AM-15.2 | AM-15 | Resume/recheck the original case and Call; replace the permanent workflow-ID no-resume guard | OPEN |
| AM-16.1 | AM-16 | Apply consistent evidence precedence across readiness, promotion and workflow completion; retained admission markers must not demote admitted supply | FIXED IN SOURCE |
| AM-16.2 | AM-16 | Prove withdrawal/freeze/current-authority refusal at final promotion and safe handling of late completion | ASSIGNED |
| AM-17.1 | AM-17 | Prove replay after promotion and after interruption between promotion and coordinator completion | FIXED IN SOURCE |

## Execution order and boundaries

The **Record-by-record execution** assignment and numeric queue above supersede
the earlier Provider/buyer milestone ordering. AM-20, AM-02 and AM-04 are now source-accepted;
AM-05 is next. Historical contributor notes below remain evidence, not an active
alternative queue. Run affected source checks at coherent integration boundaries;
full browser/release review follows source completion. No deployment is authorized.

Latest assignments: AM-16.1 and AM-15.1 have source fixes. The registered private
Provider recheck now resumes the same admission through current owner/delegated
authority; interruption/status/replay checks pass. AM-15.2 now has integrated
source proof of owner recheck and safe rearming with a retained Call, plus bounded
recovery selection. It remains open for the complete paid recovery journey and
hosted proof. AM-16.2 retains withdrawal/status-precedence and hosted checks;
AM-17.1 now has registered promotion/replay/cancellation proof with a controlled
completion fixture, while the parent still requires hosted acceptance.
Do not mark a parent VERIFIED from this.

Source-first follow-up: a cold three-file AM-16.2 audit confirms existing
freeze, exact target/claim and obsolete-workflow guards. It found no actual
withdrawal exercise in the retained-Call integration fixture. A one-file worker
assignment now extends that fixture through the supported withdrawal action,
late callbacks and unchanged accepted Call evidence. Callback bookkeeping may
truthfully become action-required; tests must protect withdrawal-owned state
and prevent republishing, not prohibit all bookkeeping updates. A missing test
is not a confirmed production defect. Hosted withdrawal proof remains deferred.

### UX contributor and finding mapping

The [14 September UX audit](../improvements/2026-09-14/audit.md) is supporting
design/evidence within this register. It is not another release backlog. This
task owns the register, backend contracts, integration, deployment and acceptance;
the UX task owns explicitly assigned interface files and supplies change receipts.
Main-checkout application edits predate this coordination and remain preserved.

| Existing items | Supporting P0/P1 findings and boundary |
| --- | --- |
| AM-05, AM-24 | Resumable Agent setup, self-contained approval facts and Tool handoff; preserve originating context and use supported client continuations. |
| AM-07–10 | Balance/fee/total hierarchy and exact-session funding return/retry. First assignment owns only the funding-return route and its focused test. |
| AM-11, AM-23 | Chronological Account-history presentation of existing funding, Calls, refunds and adjustments; no new ledger, postings or accounting semantics. Balance availability must not depend on Agent-directory success. |
| AM-21–23 | Attention-first Calls, one permitted remedy, stable receipt context, consistent buyer-facing status and recoverable pagination. Backend remains the owner of permitted actions and distinct money/delivery facts. |
| AM-27 | Neutral owner home, coherent desktop/mobile navigation, role-appropriate supply disclosure, guided Market entry, responsive layout and progressive disclosure of technical evidence. |
| AM-28 | Privacy-safe funnel events only after the intended destination and event schema are verified. |
| AM-31–32 | Cold task evidence against the integrated candidate; contributor component checks cannot close hosted journey acceptance. |

The payer-safe funding return currently exposes no Checkout or Agent deep-link.
The bounded UI fix must remove false “Return to Stripe” affordances and recheck
the same session. A missing executable return to lost Checkout/Agent context
remains a dependency of AM-05/09/24, not a silently reduced acceptance condition.

## Contract sanity check and test handoff

### Skill selection for each assignment

Use the full available skill catalog to select the relevant expertise for each
item. Read and apply the selected skills to the actual boundary; do not run the
whole library on every item. Detailed UX and specialist audit queues remain
intact, with findings, status and evidence mapped to these 32 release items.
They can proceed independently within agreed file ownership. The following
are starting points, not a restriction to one subset of the catalog:

| Work boundary | Skills to select when applicable |
| --- | --- |
| Scope and technical design | `sluice`, `iceinvein-design-review`, `simplicity-razor`, `complexity-accountant`; the relevant boundary/coupling audit for structural changes |
| Account, Agent and authorization | `clerk`, `clerk-testing`, `contract-enforcer`, `type-driven-designer`, `convex:convex-reviewer` |
| Funding, purchases, ledger and remedies | `stripe-best-practices`, `contract-enforcer`, `idempotency-guardian`, `error-strategist`, `integration-pattern-auditor` |
| Provider submission, validation and maintenance | `contract-enforcer`, `idempotency-guardian`, `error-strategist`, `integration-pattern-auditor`, `convex:convex-expert`; current Convex docs when API behavior needs verification |
| Deployment, secrets, observability and recovery | `deployment-operations`, `tf-best-practices`, `module-secret-auditor`, `integration-pattern-auditor`; provider-specific skills and official tools for the actual service |
| User journeys and release evidence | `cognitive-load-auditor`, `unidirectional-flow-enforcer`, `gestalt-reviewer`, `rams-design-audit`, `qa-only`, `devex-review`, `react-doctor`; relevant release/review skills at delivery |

Each assignment records its selected skills and the practical decision or check
they inform. Reuse official SDKs, maintained components and established product
patterns. A skill's generic example does not authorize a new service, framework,
queue, abstraction or recovery promise. Preserve the existing scope, financial
invariants and authorization when adapting its guidance. If a reference behavior
is needed, establish it from the existing maturity evidence or current official
documentation before implementation.

### Sanity check

Before assigning a change, root checks the contract against PRODUCT.md,
START_LINE.md and the existing supported action. The check asks:

1. Can the named actor reach the starting state and perform the action through
   a supported surface? A private operator shortcut is not buyer/Provider proof.
2. Can another tester judge the result from stated output, visible state and
   attributable records? Replace “works”, “ready” or “usable” without an oracle.
3. Does failure state what happened to work, money and authority, and offer a
   permitted continuation? Never turn missing evidence into claimed success.
4. Do retries, concurrent actors, stale authority and late callbacks preserve
   the original effect identity? Test the boundary that could violate it.
5. Does the implementation reuse the owning service and existing contracts?
   The Stripe heuristic is predictable behavior, not a claim about Stripe’s
   internals or permission to build another subsystem.

Each bounded assignment carries **one parent ID, the exact scenario, expected
observable result, invariant, affected boundary, 1–3 owned files where practical,
and relevant check**. Review the whole affected journey after integration.
Auditors report findings without editing code. Do not reopen a proven unrelated
journey or add a new milestone for each defect.

For each stated failure/recovery case, record an individual result; one happy
path cannot stand in for the whole row. Cover each supported remedy/action in
the frozen inventory. An inventory omission or exposed but unsupported promise
must be dispositioned under the existing parent before closure. Operators may
inject controlled faults to test a journey; the user’s recovery must still work
through the supported product path. Fault injection is not permission to use
manual repair as acceptance evidence.

### Acceptance examples for the next two milestones

| Parent | Starting condition and action | Observable pass | Must remain true |
| --- | --- | --- | --- |
| AM-15 | Provider validation has a retained Call; interrupt after possible dispatch, then reopen status and follow the offered continuation | Same Tool, case and Call; truthful pending/known outcome; continuation works for the Provider | No fresh purchase or second payment; evidence and current-authority checks retained |
| AM-16 | Withdraw supply while validation completion is outstanding, then deliver the late completion | Tool stays unavailable for new purchases; accepted work has an accurate status | Callback cannot promote withdrawn supply or erase an accepted Call |
| AM-19 | Buyer accepts an exact Quote for the controlled sandbox input | Literal output matches the Tool contract; buyer sees the quoted AUD capture and same Call history | Separate upstream settlement and delivery proof; validation funds cannot substitute for buyer funds |
| AM-21 | Buyer Call has possible submission and no conclusive result; restart the client and follow the returned continuation | Original Call remains resumable and uncertainty is visible until evidence resolves it | Reserved funds are not blindly released; no fresh Call or duplicate payment |

These examples make the existing conditions executable; they do not replace the
other cases in their parent rows. No implementation or hosted outcome is implied.

### Concrete test boundaries

- **AM-14/18:** the initial controlled source is
  `POST https://agentic-economy-sandbox-tools.vercel.app/x402/execute`, on Base
  Sepolia (`84532`) only. Bind each scenario to its current approved Tool version,
  contract input/output and Quote; the endpoint URL alone is not execution
  authority. Other external Tools may be discoverable without being supported
  for a paid Call. This names the initial proof fixture, not a permanent catalog
  restriction or permission to skip other supported inventory.
- **AM-28:** before injection, read and record the intended existing Sentry
  project and PostHog project identifiers, environment and destination, or keep
  the row unverified if they are absent. Use an isolated test failure and a
  non-sensitive analytics test event with a unique run marker. Record the exact
  event name/schema, timestamp, release and correlation reference; include the
  Call reference when the failure concerns a Call. Pass only when the operator
  can find matching event IDs in those destinations and match the user-facing
  error reference. A local log, SDK acknowledgement or chosen ad hoc destination
  does not establish delivery to the app’s intended project.
- **AM-30:** record the fault/cutoff time and newest authoritative data recovered;
  their difference establishes recovery-point loss. Record service restoration
  time separately and assess it against the declared operating target. Do not
  use the retired environment’s restore measurement as proof of the current
  candidate. A current measured miss is FAILING; missing current proof stays open.

## Closure evidence format

For each checked scenario, retain a compact receipt in the existing evidence
record: `parent ID / scenario | actor and starting state | action or injected
fault | expected → observed | surface + source/deployment + date | durable
references | recovery/replay result | reviewer`. Include visible/machine results
and authoritative readback for financial/security effects; omit secret material.
Backend records alone cannot establish that the buyer can find and use an action.

Append one short entry when a row changes:

`ID | old → new | date | source/deployment | test or exact external reference |
observed result | remaining child defects | reviewer`

Preserve failures and previous evidence rather than overwriting them. A baseline
VERIFIED row links earlier hosted evidence; revalidate it if a relevant change
invalidates that proof. Never place secrets in this register.

Scope follows Joel’s sandbox-only funding and Tools decision: live Stripe
payments, mainnet Tool payments and live payouts remain disabled. These are not
hidden failures or waived rows; AM-01 must prove the sandbox restrictions remain
effective.

## Evidence log — 14 September 2026

- AM-16.1 | OPEN → FIXED IN SOURCE | commit `9eaad08e7` | existing registered
  readiness integration covers ordinary, required-only, canonically admitted
  and malformed admission evidence; market presence and admission state agree.
- AM-15.1 | remains OPEN; timeout behavior fixed, continuation pending | uncommitted coordinator in the working
  checkout | registered completion mutation retains `under_review` / `pending`
  without `completedAt` after the polling window; it retains its workflow journal.
- AM-16.2 / AM-17.1 | remain OPEN | registered tests reject a different workflow's
  callback and a claimed successful callback after ownership changes; the
  workflow test skips readiness replacement for retained validation. Full
  withdrawal/freeze and actual post-promotion replay remain outstanding.
- Combined verification: 14 tests in three suites passed (owner readiness,
  private staging and workflow coordination); application typecheck, targeted
  Oxlint, dependency ratchet and whitespace checks passed. React Doctor's commit
  hook reported no errors and one advisory warning on an existing sequential
  database-write loop; no unrelated concurrency change was made.
- No hosted deployment or payment was made. Parent register counts remain
  3 VERIFIED, 17 PARTIAL, 1 FAILING and 11 NOT VERIFIED.

## Behavioral contract review — 14 September 2026

- All 32 IDs now specify actor/start/action/result and a failure, recovery or
  explicitly linked check. Scope and existing defects are retained. The detailed
  start-line purchase proof remains binding; these rows do not replace it.
- Buyer purchase, Provider qualification and operating evidence stay separate.
  Public Tool discovery is distinguished from permission to buy. Success means
  contract-valid output, not payment or background completion.
- Existing VERIFIED rows stay deliberately narrow: AM-03 proves the recorded
  security event and replay, AM-08 the completed funding return/refresh, and
  AM-13 approved Provider setup/readback. They do not close session enforcement,
  payment failure/reordering or publication. Evidence for these observations
  was reread in the deployment registry and cutover record.
- No status was upgraded and no new runtime proof was collected. Counts remain
  3 VERIFIED, 17 PARTIAL, 1 FAILING and 11 NOT VERIFIED. Additional clarified
  scenarios on open rows require their own receipts before closure.

- Cold independent `gpt-5.6-luna` / `max` review completed against the register,
  PRODUCT.md and START_LINE.md. Five findings were dispositioned: clarify
  discovery versus execution and the sandbox fixture; retain the existing
  platform-funded validation Call with explicit exclusion of buyer financial
  effects; require explicit treasury-refusal release; identify the recovery
  measurement as historical; and specify observability destination/event proof.
  Validation was not remodeled as an administrative Action execution: its
  retained Call is the purchased Tool invocation, while coordination remains
  administrative. This preserves the established design and source boundary.
  No findings establish hosted correctness; AM-28 destinations and AM-30 current
  recovery proof remain outstanding.

## Provider continuation evidence — 14 September 2026

- AM-15.1 | OPEN → FIXED IN SOURCE | current uncommitted candidate | owner and
  delegated Agent recheck use current authority and the exact retained admission.
  A replay of the same maintenance request does not start another workflow.
  Canceling through the installed Workflow component produces a real terminal
  coordinator state; owner status exposes recheck, and a new maintenance request
  starts a new coordinator with the same admission case and original command.
  A late callback from the old coordinator cannot overwrite it. No purchase was
  created in this scheduling fixture; this is not retained-payment recovery proof.
- AM-16.2 | remains OPEN | validation admission and final promotion reuse the
  existing Provider freeze predicate. Regression first reproduced the missing
  gate; registered tests now refuse preparation/request/promotion while frozen,
  reject a claimed successful late completion and preserve supply/Call records.
  These tests cover the freeze boundary, not full withdrawal or offboarding.
- AM-15.2 / AM-17.1 | remain OPEN | original-Call recovery/rearming and actual
  replay after paid validation/promotion still need integrated and hosted proof.
- Verification: 61 tests passed across staging, ordinary publication ownership,
  Provider offboarding, promotion, status and workflow coordination. The enhanced
  five-test staging suite then passed again with real component cancellation and
  owner status readback. Test clocks isolate scheduled external work; these
  assertions do not claim the paid worker or full workflow ran to delivery.
  Final typecheck, targeted Oxlint and whitespace checks passed; dependency
  checks passed with ratchets unchanged (0/34/258). Register IDs, counts and
  local document links were checked.
- Cold Luna/max review found no concrete authority bypass or unsafe promotion
  in the bounded freeze/resume surface. It identified a remaining conservative
  status after publication commits immediately before a freeze; that remains
  under AM-16.2. The recheck worker stopped at its finite lifecycle, and root
  completed integration and fixed the scheduled-work test isolation failure.
- Skills applied: `sluice`, `contract-enforcer`, `idempotency-guardian`,
  `error-strategist` and `integration-pattern-auditor`, with the repository's
  Convex guidelines. Recheck admission is transactional; external payment
  uncertainty retains its original identity/evidence. Existing Workflow journals
  retain failed coordination and carry callbacks; no new queue, recovery service
  or global ownership exception was introduced. The next recovery assignment
  must reuse the existing Call recovery boundary, not create a second retry path.
- No hosted deployment or payment occurred. Parent counts remain 3 VERIFIED,
  17 PARTIAL, 1 FAILING and 11 NOT VERIFIED; alpha remains unready.

### AM-15.2 recovery design

Two separate omissions explain the stalled continuation: validation request
replay bypasses the existing safe rearm functions, and coordination stops at
reconciliation without invoking Call recovery. Workflow restart alone cannot
resolve either. The design review uses the already accepted behavioral contract;
the interactive interview is skipped under the standing execution authorization.

| State owner | Bounded change | Required observable proof |
| --- | --- | --- |
| Call recovery | Select the existing pre-submission or managed-signing recovery from retained payment facts. Keep their evidence checks and current workload authority. | Never-signed and expired-signing cases become retryable on the same Call; submitted, signed, foreign or incomplete evidence cannot trigger a new payment. |
| Call dispatch | Reuse existing known-unpaid and safe-before-release checks before refreshing validation readiness or rearming retained work. | Duplicate rechecks enqueue at most one worker; canonical uncertainty retains its sealed evidence. |
| Provider validation | Invoke recovery through the existing internal Call API; resume the original admission and command only after recovery permits retry. | Supported owner/Agent recheck retains the Call reference, creates no buyer financial effects, and cannot promote without verified delivery. |

No new queue, recovery service or buyer API is introduced. `contract-enforcer`,
`idempotency-guardian` and `error-strategist` preserve effect identity and evidence;
`type-driven-designer` and `bounded-context-auditor` keep coordination, payment,
delivery and publication states distinct. `complexity-accountant` limits the
change to existing owners and real continuation callers. Source checks precede
hosted acceptance, and neither substitutes for the other. Submitted-payment
uncertainty still requires the existing verified reconciliation evidence; its
unresolved dependency must remain visible in this item.

### AM-15.2 source evidence — 14 September 2026

- Existing Call recovery now selects its never-signed or expired-managed-signing
  proof from retained facts. Current workload authority remains mandatory;
  interactive owner/Agent callers cannot invoke this internal mode. Submitted,
  signed and incomplete evidence stays uncertain. Each coordinator run attempts
  recovery at most once and observes the original Call throughout.
- Dispatch's existing known-unpaid, safe-before-release and recovered-workless
  conditions now govern readiness refresh and rearming. A registered integration
  test creates a real Call, injects only a pre-claim worker refusal, cancels the
  actual Workflow, invokes owner recheck, refreshes readiness and resumes that
  Call. It proves one Call, one replacement worker, unchanged original command,
  duplicate suppression and no usage/Provider consequence records. A subsequent
  uncertain state preserves the full retained row. Scheduled external work is
  isolated: this fixture does not claim a paid worker ran or funds moved.
- Cold Luna/max review raised a possible identity fork during readiness refresh.
  Further tracing established that the existing stable identity intentionally
  excludes readiness and reservation replay checks principal/idempotency identity.
  The refreshed-readiness integration test passes with the same Call and a new
  commitment digest; no redundant identity mechanism was added. Review did not
  establish a second-purchase defect.
- Verification: 79 tests passed across six suites; typecheck, targeted Oxlint,
  dependency checks (unchanged ratchets 0/34/258) and whitespace checks passed.
  Fixture digests were corrected to meet the real commitment contract, rather
  than weakening production validation.
- Remaining dependencies stay within AM-15: actual paid recovery through the
  complete workflow and hosted recheck; verified evidence for submitted-payment
  uncertainty; and the existing snapshot restriction that rejects an already
  public Provider (`convex/lib/capabilitySupply/currentTool.ts`) even though
  staging admits its new Tool. The latter has source evidence only and needs a
  bounded contract decision/test before correction. AM-16/17 final promotion,
  withdrawal and post-promotion replay proof remain outstanding.
- No hosted deployment or payment occurred. Counts remain 3 VERIFIED, 17 PARTIAL,
  1 FAILING and 11 NOT VERIFIED. The release is not yet alpha-ready.

### Provider admission and promotion integration — 14 September 2026

- A cold Luna/max worker reproduced the public-Provider rejection, then corrected
  the existing snapshot boundary. Public and private Providers now use the same
  exact Tool admission requirement; unrelated qualification blockers remain
  binding. Existing business evidence is preserved without adding a duplicate.
- Extending the registered integration test through promotion reproduced
  `seller_promotion_post_publish_operation_drift` for both Provider states.
  Contract, binding and price matched; only the evidence-derived material digest
  changed after admission. Cold review rejected normalizing the whole evidence
  digest: it could conceal unrelated qualification drift. Promotion now predicts
  only its exact admission record and Provider publication through the existing
  graph qualification and Tool materialization rules, then compares the complete
  material identity after writing. Readiness times and the current Provider
  claim are checked again. No evidence field is exempted from comparison.
  The cold reviewer rechecked the correction and found no remaining blocking
  bypass in the scoped source. Registered internal validators expose no new
  argument; the projection option is only used inside the promotion transaction.
- AM-17.1 is FIXED IN SOURCE: the same retained Call survives actual registered
  promotion, repeat promotion/request, and a canceled coordinator's completion
  callback after publication commits. Public Tool readback succeeds. Completion
  and settlement enter through a controlled test fixture; these checks do not
  establish hosted payment or full external-worker execution.
- The relevant six-suite milestone check passed 44 tests, including ordinary
  publication ownership, offboarding and current-Tool snapshot stability. Final
  typecheck, targeted Oxlint, dependency ratchets and whitespace checks passed.
- Skills used: `sluice`, `contract-enforcer`, `bounded-context-auditor` and
  `iceinvein-design-review` for state ownership; existing canonical digest and
  receipt builders preserve `idempotency-guardian` and `complexity-accountant`
  constraints. `deployment-operations` scoped the fresh read-only preflight.
  The incorporated UX audit maps to existing AM IDs and preserves the same
  behavioral acceptance; funding-return interface work has separate file ownership.
- No parent status changed and no hosted mutation occurred. AM-14–17 still
  require the complete deployed Provider journey, paid recovery evidence and
  remaining withdrawal/authority checks before release acceptance.

### Funding return integration — 14 September 2026

- Integrated UX assignment `61b7b0866` as `41b101430`: the funding return
  preserves the same session and last confirmed pending state across transient
  failures; invalid, expired and failed links remain distinct. Ready directs the
  user back to the named Agent, with Balance used for verification.
- The payer-safe API has no Checkout or Agent return URL. The interface therefore
  cannot reopen either destination. That executable continuation remains an
  AM-05/09/24 dependency; AM-09/10 remain open for complete hosted proof.
- The detailed UX audit queue remains active independently, mapped to the AM
  rollup. The Market discovery correction has separate ownership of its route,
  directory component and existing search test; no backend overlap is assigned.

### Integrated source candidate — 14 September 2026

- Candidate code `c4132d1ce498eb396c9858977fa74c06a526a4ed` includes Provider
  promotion, same-session funding recovery and Market default discovery
  (`bf9a71be7`, from UX `c7a9546e0`). Following Joel's source-first sequencing,
  Market refinement `8d885b887` is integrated as `ac82e9a73`, with its detailed
  repair queue `b74de25cf` integrated as `0efd42ef5`. Its 44 focused tests pass;
  integration also narrowed a test helper's required catalogue argument to
  preserve exact optional types. The full UX P0/P1 queue remains active.
- `npm run gate` initially stopped at module-boundary checks after 4,755 unit
  tests and 1,344 integration tests passed (five integration tests skipped,
  three todo). The source fixes use declared module interfaces; four private
  recovery test imports have exact test-only ownership entries. No runtime
  exception or new public worker API was added. All 50 import tests then passed.
- The next standards check identified two non-null assertions and an inexact
  worker result declaration. Explicit missing-state guards and generated query
  result types replaced them; standards, typecheck and 134 affected tests pass.
  The `module-secret-auditor` decision preserves private worker implementation;
  `contract-enforcer` preserves explicit authority and missing-state behavior.
- Remaining release checks were resumed: lint, dependency checks, SEO (28), UI
  contracts (2), accessibility (10), packaged CLI and production build passed.
  This is a resumed check receipt, not a claim that one complete `npm run gate`
  invocation passed on the final revision. CI remains required before merging.
- Initial browser run: 23 passed, eight authenticated checks skipped, one
  `/api/businesses` request exceeded 10 seconds. The unchanged wide-screen
  suite passed with one worker (12 passed, four skipped). Retain the first
  timeout as a reliability observation; do not inflate the timeout or count
  skipped authenticated journeys as proof. Local browser checks use the
  development backend, not the hosted alpha buyer account.
- Official Convex dry run targeted `cautious-zebra-473`, reported no index
  deletions and did not deploy. The live alpha still requires coherent source
  deployment, Provider validation/publication and a separate buyer purchase.
  All parent statuses remain unchanged; alpha release acceptance is still open.


### AM-20 manager source acceptance — 14 September 2026

Accepted against candidate `a3cd08a25`, following worker correction `b481cbd8c`.
The iceinvein design, complexity, simplicity, temporal and semantic-contract
reviews found two concrete integration defects: a superseded access-grant read
blocked actual accepted worker execution after a monetary update, and cron
attribution confused access/canonical generations and required live buyer
authority to complete a proved pre-submission refund. Both are fixed through
existing canonical reconciliation and existing exact-Call refund proof.
No grant is revived, no accepted booking rewritten and no new paid authority is
created by refund bookkeeping. Formance remains the sole spend/balance authority.

Condition-level evidence is in the spending design. Final affected registered
buyer/native-ledger file passed **16/16**, including monetary updates before
dispatch and after claim/before payment, current-grant revocation with no second
paid effect, lost refund acknowledgement and exact scheduled return after expiry.
Worker/authority focused checks passed **100/100**; manager workload boundary
checks passed **32/32**, including cross-Call refusal, independent generations,
wildcard scope, expiry/revocation and refusal once execution evidence exists.

Manager `npm run typecheck` and `npm run lint` passed. Official Convex codegen
completed; the existing module-derived binding inventory needed no further diff.
`npm run test:conformance` passed **507**, with **14 explicitly skipped** in the
ordinary source run; the separately enabled real-ledger run above covered its
conditional buyer cases. Architecture checks previously passed **21/21**; no
relevant architecture change invalidates that evidence. The full `npm run gate`
contains browser and full build checks and was not run in this source phase.
`npm run deps:check` also passed with all existing ceilings unchanged.
Hosted/runtime acceptance stays PARTIAL. This source closure leaves **5 SOURCE
VERIFIED, 21 source-unclosed and 6 HOSTED ONLY** release records out of 32.


Main integration completed through `7b1f892b0`. Exact AM-20 source and required
existing environment/payment prerequisites were integrated without changing
hosted configuration or disturbing unrelated main edits. Main's enabled native
buyer file passed **16/16** in 29.95s; affected Quote/worker/refund checks passed
**59/59**, and payment/authorization checks **122/122**. Final main typecheck and
lint passed. Older Provider candidate/main differences remain for their owning
source records; this is not a claim of complete repository parity or alpha
readiness. Backend is assigned AM-02, with AM-04 next after manager acceptance.


### AM-02 manager source acceptance — 14 September 2026

Source accepted at `eaa0d7256`, integrated as `4997f7072`. The complete sign-in,
return, sign-out and same-Account restoration contract is mapped in the release
design. Two source defects were reproduced before correction: control-character
return targets could resolve externally, and auth-flow switching omitted Clerk's
opposite-flow destination setting. Fixes reuse the platform URL parser and
maintained Clerk API; no handrolled session/OAuth/retry machinery was added.

The nine-file focused source command recorded in the worker outcome passed
**125/125** on both candidate and integrated main. Actual canonical source tests
cover unique first provisioning, anonymous refusal with unchanged durable facts,
and same-identity restoration. Server guard tests use mocked Clerk/source
boundaries, preserve destination and exercise missing/unavailable authority and
retry. Candidate `npm run typecheck`, integrated changed-file `oxlint` and
`git diff --check` pass. Changed source and its authority guards match across
checkouts, so no unrelated full suite was repeated.

Hosted invitation/OAuth, actual browser session termination and production
transaction scheduling remain explicitly unverified. SOURCE VERIFIED does not
change hosted status from PARTIAL. The source totals are now **6 verified,
20 unclosed, 6 hosted-only** out of 32. Backend next owns AM-04; AM-05 follows only
after manager acceptance of the whole AM-04 source contract.


### AM-04 manager source acceptance — 14 September 2026

Source accepted at `2e6929721`, integrated to main as `349f69d0f`. The existing
release design maps the whole named-resource isolation contract to enforcing
source and positive/negative evidence. The bounded design/contract review found
no need for a new IAM layer. No new production implementation was required in
the candidate; the five test files close finite proof gaps.

Main integration reproduced two legitimate private-Provider preparation failures
because its earlier `40e5a9859` source prerequisite had not been integrated.
Applied that existing two-file correction as `f7499e12d`, retaining all newer
isolation tests and unrelated main edits. The four other files' 15 tests passed
before that correction; the affected private-provider file then passed 7/7.
Thus all **22/22** changed-file cases pass in main as well as candidate. Existing
selected role/secret/funding/source checks passed **16/16**, and the selected
public discovery scenario passed **1/1**, with unrelated cases deliberately
excluded. Combined `npm run typecheck` passes in both checkouts; relevant explicit
`oxlint` and `git diff --check` pass.

Evidence limits remain explicit: Call snapshots cover protected Call rows, not
all audit/ledger state; ledger scoping is tested at the SDK boundary; document
checks establish URL issuance isolation, not revocation of an issued bearer URL.
Actual hosted Clerk/Agent/admin sessions, direct-route and storage probes remain
unverified. AM-04 hosted status stays NOT VERIFIED. Source totals are now
**7 verified, 19 unclosed, 6 hosted-only** out of 32. Backend next owns AM-05;
AM-06 follows only after manager acceptance of the whole AM-05 source outcome.
