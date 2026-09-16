# AM source-only IceInVein closeout

Date: 16 September 2026.
Status: design for sign-off. No implementation until Joel signs this.
Authority: PRODUCT.md, START_LINE.md, sandbox-only decision,
[alpha-release-design.md](../operations/alpha-release-design.md),
[alpha-maturity-register.md](../operations/alpha-maturity-register.md).

This is not a second backlog. It is the IceInVein chain applied to each of the
32 register rows, **source obligations only**. Hosted proof stays on those rows
and is not recut here. Deployment, AWS, Infisical, Sentry, Clerk production
challenges and live paid Calls are out of this well.

## Thesis

An invited business can give its Agent bounded access to useful paid Tools, and
can understand and recover every resulting purchase.

Every section below is scored against that sentence. A source change that does
not serve it is a cut.

## Ground rules

- Source first. Do not deploy, mutate hosted env, or resume AWS/Formance.
- One parent ID per assignment. Findings become children, not new milestones.
- Do not reopen SOURCE VERIFIED rows without contrary current-source evidence.
- HOSTED ONLY rows get a source fence check, then skip. No invented source work
  to make an operational row look active.
- Reuse existing Convex, Stripe, Clerk, Formance, x402 and Workflow owners.
  No new service, ledger, saga, navigation redesign or deep-link registry.
- START_LINE's fourteen steps remain the buyer purchase contract. Missing
  Seller/Provider/recipient/document facts cannot be replaced with labels.
- Internal Operation/Commitment/Mandate copy is a source defect where it is
  operator- or buyer-facing. Opaque prefixes stay.
- Exactly one Flips task when this becomes a plan: the first source-gap row
  whose behaviour a buyer or Provider can observe. Inert characterisation
  precedes it.
- Vocabulary: Customer, Agent, Account, Tool, Quote, Call.

## IceInVein chain (applied per row)

For each row: design-review thesis fit → contract-enforcer CONTRACT →
type-driven illegal states → temporal order → error classification →
idempotency if the row mutates → simplicity cuts → complexity budget.

Interview skipped: Joel directed autonomous source closeout against accepted
product contracts.

## Execution cut — bottom-up, not register order

Register numeric order and gravity-well urgency are both whack-a-mole. Close
from facts other rows read, then the journeys that consume those facts.

```text
Layer 0  already source-closed — do not reopen
         AM-02 03 04 05 06 07 08 13 19 20
         skip hosted-only: AM-01 25 28 30 31 32

Layer 1  money fact floor
         AM-10  duplicate/reordered Stripe events converge once
         Everything that shows, refunds or returns funding reads this.

Layer 2  money consequences of that fact
         AM-09  cancel/fail/expire/lost-begin return (reads AM-10 status)
         AM-12  supported funding refund/reversal (mutates the same command)

Layer 3  money explanation
         AM-11  receipts, fee docs, period aggregation (reads AM-10/12)

Layer 4  supply object
         AM-14  submit → platform-funded validation → publish

Layer 5  supply recovery and authority
         AM-15  recover the retained validation Call  (FAILING)
         AM-16  withdraw/freeze while that work is outstanding
         AM-17  revise / withdraw / republish

Layer 6  purchase facts
         AM-18  Quote binds version, input, price, parties, evidence
                (parties gap is source, not hosted)

Layer 7  purchase recovery
         AM-21  resume the same Call after interruption
         AM-22  supported remedy once

Layer 8  surfaces agree
         AM-23  Logs/Usage/Spend/docs/earnings  (needs 11 + 18 + 22)
         AM-24  HTTP/CLI/MCP/chat continuation  (needs 09 + 21)
         AM-26  connection isolation and resumable cleanup
         AM-29  help with Call ref; honest offboarding preview

Layer 9  UI recheck only
         AM-27  no independent source; re-check copy when a parent lands
```

One well, one layer. Do not start AM-15 or AM-09 because they are loud. Do not
put AM-18 parties in the money well. Do not plan Layers 4–9 until Layer 1 has
a source receipt.

AM-19 and AM-20 stay source-accepted. AM-13 stays VERIFIED. AM-03/08 stay
VERIFIED. AM-27 has no independently actionable UI source left.

---

## AM-01 Named candidate and sandbox fences

**Register:** PARTIAL / HOSTED ONLY.

**Thesis:** the invited business uses one recorded candidate; live money cannot
leak through a direct request.

```
CONTRACT: sandboxFence(quoteOrCall)
  Requires: AE_SERVICE_MODE and commercial policy are current source facts
  Ensures: hosted_alpha / sandbox refuse live funding and mainnet execution
           before reservation, signature or Provider effect
  Invariant: health/ready success is not purchase success; unavailable
             Formance cannot mint a funded Call
  On violation: refuse with bounded reason; no false completion
```

**TYPE:** deploymentClass `sandbox` vs `real_money` must not be a boolean flag
pair. Keep the existing commercial-policy union.
**ERROR:** live-money attempt is recoverable refusal, not a bug crash.
Unavailable ledger that still returns HTTP 200 is a false-success class: source
must not treat ready as sellable.
**SIMPLICITY:** do not add a second fence module. Existing Quote/Call admission
and `hosted_alpha` already own this.
**Source remaining:** none indicated. Confirm fences still live in source when
this well starts; do not recut.
**Hosted:** target/revision alignment and effective restriction proof deferred.
**Work:** skip.

## AM-02 Sign-in, return, one Account

**Register:** PARTIAL / SOURCE VERIFIED.

**Thesis:** the Customer reaches the app as one Account and can get back in.

Release-design contract stands. Source matrix already closed.
**TEMPORAL:** sign-out must not rewrite durable Account. Enforced by canonical
materialization.
**Source remaining:** none without contrary evidence.
**Hosted:** invitation, Google challenge, cookie termination deferred.
**Work:** skip.

## AM-03 Clerk security event history

**Register:** VERIFIED / SOURCE VERIFIED.

**Thesis:** security history is attributable and replay-safe.
**IDEMPOTENCY:** same signed event identity → one history record. Already proved.
**Work:** skip.

## AM-04 Account and role isolation

**Register:** NOT VERIFIED / SOURCE VERIFIED.

**Thesis:** knowing a locator is not authority.
Release-design contract stands. Do not add a permission middleware.
**Source remaining:** none. Hosted role/direct-route proof deferred.
**Work:** skip.

## AM-05 Connect Agent, approve, first Quote

**Register:** PARTIAL / SOURCE VERIFIED.

**Thesis:** AE owns authorization and the Tool boundary. The client keeps its
task.

**SIMPLICITY cut (binding):** do not invent a URL into an arbitrary third-party
conversation. That is not in OAuth or current source. Missing funding/task
return remains AM-09/24.
**Source remaining:** none for this parent.
**Work:** skip.

## AM-06 Credential replacement and retained capacity

**Register:** NOT VERIFIED / SOURCE VERIFIED.

**Thesis:** access rotates; the Agent and its limits do not.
**TYPE:** credential generation ≠ spending-policy generation. Already separated.
**Work:** skip.

## AM-07 Funding quote agrees with Checkout

**Register:** PARTIAL / SOURCE VERIFIED.

**Thesis:** the Customer sees credit, fee and total, then pays that total.

**TYPE:** public `binding: false` estimate is not an accepted Quote token.
**IDEMPOTENCY:** replay preserves Account, principal and terms.
**Source remaining:** none. Checkout expiry and negative return are AM-09.
**Work:** skip.

## AM-08 Successful sandbox Checkout credits once

**Register:** VERIFIED / SOURCE VERIFIED.

Narrow row: one successful payment → exact credit, refresh-stable.
**Work:** skip. Do not expand it to cancel/fail.

## AM-09 Cancelled, failed or expired Checkout return

**Register:** NOT VERIFIED / SOURCE GAP.

**Thesis:** a broken funding attempt must not trap or double-charge the Customer.

```
CONTRACT: fundingReturn(session)
  Requires: canonical owner, retained command/session identity
  Ensures: no confirmed settlement → no credit; settled-despite-failed-browser
           → show durable status, do not invite a second payment
  Invariant: one logical top-up keeps one idempotency key until terminal
  On violation: refuse a new Checkout while outcome is unknown; offer status
                refresh of the same attempt
```

**TEMPORAL:** browser return is not authorization. Stripe event + SDK readback
is. Encode: return page reads durable status; it cannot `begin` a second
command for the same attempt.
**ERROR:** cancel/fail/expire are recoverable. Unknown settlement is pending,
not failure. Timeout is not proof.
**IDEMPOTENCY:** Checkout retry after genuine terminal failure may start a new
command; retry of unknown must reuse the key.
**SIMPLICITY:** no Agent deep-link. Honest close-and-resume copy only.
**COMPLEXITY:** do not add a payment-orchestration service. Existing funding
command, Stripe adapter and return route own this.
**Source remaining:**
1. Negative-path source coverage for cancel, fail, expire and lost `begin`.
2. Executable Checkout context where Stripe actually offers one; otherwise
   honest non-action.
3. Settled-despite-failed-return shows the existing credit, not a retry CTA.
**Hosted:** hosted negative journeys deferred.
**Work:** first source-gap. Characterise existing return/handoff tests, then
close only the missing conditions.

## AM-10 Duplicate or reordered Stripe events

**Register:** PARTIAL / SOURCE GAP (verification).

**Thesis:** money converges once, regardless of webhook order.

```
CONTRACT: stripeFundingConvergence(event)
  Requires: verified Stripe event, existing funding command
  Ensures: duplicate/reorder/interrupt around posting → one credit, fee,
           document identity
  Invariant: browser return cannot authorize; posting is Formance-authoritative
  On violation: retain pending; no second Checkout to repair the first
```

**IDEMPOTENCY:** this row is the guardian. Event id + command id.
**Source remaining:** map existing refresh-replay vs forced duplicate/reorder
tests. Add only the missing once-only interruption cases around posting.
**Work:** verification closeout after AM-09 shares the funding command.

## AM-11 Funding receipts and period documents

**Register:** PARTIAL / SOURCE GAP.

**Thesis:** the Customer can explain the money without reconstructing it.

```
CONTRACT: ownerDocumentRead(docRef)
  Requires: current owner authority for the Account
  Ensures: funding receipts, fee documents and period documents each reconcile
           to source records; sub-cent sums before rounding
  Invariant: unauthorized links disclose nothing; unavailable docs have a
             truthful recovery, never a zero
  On violation: concealed-not-found or explicit unavailable; no empty success
```

**TYPE:** funding receipt ≠ fee/GST document ≠ period statement ≠ tax invoice.
Do not collapse kinds. `tax_invoice` issuance stays policy-gated
(`disabled_pending_approval`); this row does not enable production invoices.
**Source remaining:** chronological presentation of booked transactions;
reversal attribution; source links; exact aggregation tests; access refusals.
UX finding 7 is this row, not a UI-only polish.
**Work:** source gap. No new ledger.

## AM-12 Supported refund/reversal of funding

**Register:** NOT VERIFIED / SOURCE GAP (verification).

**Thesis:** a reversed top-up is one adjustment, visible once.

**IDEMPOTENCY:** retry of interrupted refund does not duplicate the adjustment
or claim completion before evidence.
**ERROR:** rejected processing retains original payment and recoverable status.
**Source remaining:** trace supported refund/reversal through API/UI and ledger
tests. Do not invent a second refund pipeline beside existing
`prepareFundingRefundEvent`.
**Work:** verification closeout after AM-10.

## AM-13 Provider connection and draft

**Register:** VERIFIED / SOURCE VERIFIED.

Narrow: approved sandbox connection and persisted draft. Does not publish.
**Work:** skip.

## AM-14 Submit, validate, publish for sandbox Quotes

**Register:** PARTIAL / SOURCE GAP (verification).

**Thesis:** one bounded platform-funded validation makes a version callable.

**ERROR:** setup/validation failure explains the blocker. No buyer balance
funds this Call.
**TEMPORAL:** submission shows progress on the same Tool. Interruption is AM-15.
**Source remaining:** complete registered validation-to-publication journey for
owner and delegated Agent, including failure continuations. Fixture remains
`POST https://agentic-economy-sandbox-tools.vercel.app/x402/execute` on Base
Sepolia only.
**Work:** verification. Do not add a public validation object.

## AM-15 Interrupted Provider validation recovery

**Register:** FAILING / SOURCE GAP (verification).

**Thesis:** polling ending is not business failure; the same Call remains the
purchase identity.

This is the only FAILING parent. Design already chose: reuse Call recovery, do
not add a second retry path.

```
CONTRACT: providerValidationRecheck(case, call)
  Requires: current owner or delegated Agent authority, retained admission,
            retained Call
  Ensures: same Tool, case and Call; truthful pending or known outcome;
           continuation works
  Invariant: no buyer reservation or Charge; no fresh purchase or second
             payment; possible submission stays uncertain
  On violation: refuse late overwrite; keep original evidence
```

**TEMPORAL:** recheck is not proof of non-submission. Recovery must prove
never-signed vs expired-signing vs submitted-uncertain before rearming.
**ERROR:** timeout = recoverable pending. Workflow terminal ≠ Tool published.
**COMPLEXITY:** AM-15.2 already selected existing pre-submission / managed-signing
recovery. Finish paid-worker recovery of the retained Call. No new queue.
**Source remaining:**
1. Paid recovery through the complete workflow (parent still FAILING).
2. Verified evidence for submitted-payment uncertainty.
3. Hosted recheck deferred.
**Work:** close FAILING source. Highest gravity well in this design.

## AM-16 Expiry, withdrawal, late callback

**Register:** PARTIAL / SOURCE GAP.

**Thesis:** changed authority blocks new effects; accepted Calls survive.

AM-16.1 FIXED IN SOURCE. AM-16.2 still assigned: withdrawal/freeze at final
promotion and late completion.
**IDEMPOTENCY:** late callback cannot republish withdrawn supply.
**Work:** finish AM-16.2 source tests through supported withdrawal action.
Do not prohibit truthful action-required bookkeeping.

## AM-17 Revise, withdraw, republish

**Register:** PARTIAL / SOURCE GAP (verification).

**Thesis:** displayed version matches the accepted action.

AM-17.1 promotion/replay FIXED IN SOURCE. Parent still needs
revise/withdraw/republish material-change coverage.
**Work:** verification after AM-16.2. Replay after promotion must not require
the Provider to become private again.

## AM-18 Search spends nothing; Quote binds the purchase

**Register:** PARTIAL / SOURCE GAP (verification).

**Thesis:** browsing is free; Quote is the only caller-specific viability read.

```
CONTRACT: tool.quote(...)
  Requires: admitted sandbox Tool, current authority, literal input
  Ensures: expiring Quote binds version, input, authority, all-in AUD price,
           terms, effects, parties, evidence
  Invariant: unsupported asset/network/recipient/amount or drift refuses
             before reservation, signing or paid effect
  On violation: bounded reason and one safe continuation; no treasury leak
```

**TYPE:** parties means Provider, buyer-facing Seller, payment recipient as
distinct facts. CONCERNS still finds Quote DTO without Seller/Provider fields.
That is contrary source evidence against START_LINE step 5 and this row.
**SIMPLICITY:** do not treat x402 protocol `seller` as AE Seller.
**Source remaining:**
1. Map hostile sandbox inputs to admission tests (verification).
2. Quote projection of distinct parties — finite source gap, not hosted.
**Work:** verification plus the parties gap. Do not add ranking or catalogue
breadth.

## AM-19 Accept Quote, literal output, one capture

**Register:** NOT VERIFIED / SOURCE VERIFIED.

Local Formance/Workpool proved literal output, AUD reservation/capture,
same-command replay. Provider validation cannot satisfy this row.
**Work:** skip source. Hosted buyer paid Call deferred.

## AM-20 Scarcity refusal and concurrent capacity

**Register:** PARTIAL / SOURCE VERIFIED.

Spending-periods design is manager-accepted. Treasury, daily/monthly UTC,
credential rotation and pre-claim refund are source-closed.
**Work:** skip source. Hosted Stripe Checkout and production scheduling deferred.

## AM-21 Interrupted buyer Call resume

**Register:** PARTIAL / SOURCE PARTIAL.

**Thesis:** a lost acknowledgement is still the same purchase.

Buyer-recovery design: fresh CLI process resumes retained identity; distinct
cancellation key before claim; after possible submission, uncertainty holds.
**ERROR:** timeout cannot authorize a fresh Call or release blindly.
**Source remaining:** trusted later settlement/remedy and broader continuation
parity (HTTP/MCP/chat). Do not widen claimed/possibly-released recovery.
**Work:** finish source continuation parity that AM-24 does not already own.
Keep AM-22 as remedy.

## AM-22 Failed or disputed delivery, supported remedy

**Register:** PARTIAL / SOURCE GAP.

**Thesis:** remedy is once, attributable, and does not erase the original Call.

```
CONTRACT: applySupportedRemedy(callRef)
  Requires: original Call, eligible failed/disputed delivery, current authority
  Ensures: one refund/adjustment and resolved purchase status
  Invariant: delivery, payment and adjustment remain distinct linked records
  On violation: interrupted/refused remedy keeps a reason and next step
```

**TYPE:** purchase status is still a projection (`projectFoundCallPurchaseStatus`),
not a purchase table. Do not add a purchase state machine in this well unless
the row cannot be met without one. Prefer completing the supported remedy
journey on existing Charge/adjustment records.
**IDEMPOTENCY:** retry applies the remedy once.
**Source remaining:** complete buyer remedy journey and once-only adjustment
continuation. Primitives exist.
**Work:** source gap after AM-21.

## AM-23 Cross-surface identities and amounts

**Register:** PARTIAL / SOURCE GAP.

**Thesis:** Logs, Usage, Spend, documents and Provider earnings tell one story.

**TYPE:** AUD buyer consideration ≠ upstream USDC settlement. Provider ≠ Seller
≠ recipient. Pending stays pending.
**Source remaining:** readback of one sandbox purchase and remedy across
surfaces; independent Balance loading (mostly UX-fixed); START_LINE step 12–13
invoice-ready period detail using existing document kinds, not a new tax
issuer.
**Work:** source gap with AM-11. Shared facts, separate owners.

## AM-24 HTTP, CLI, MCP, chat agree on continuation

**Register:** PARTIAL / SOURCE GAP.

**Thesis:** a fresh process can resume without conversation history.

**SIMPLICITY:** no custom URI scheme, task store or callback registry. Use
registered OAuth callbacks and durable Call/Quote refs.
**TEMPORAL:** after interruption, no surface offers a fresh purchase where
another requires reconciliation.
**Source remaining:** durable approval/funding/purchase return context;
machine-journey comparison across HTTP/CLI/MCP/chat. Executable Agent deep-link
stays blocked unless a supported client contract already defines it.
**Work:** source gap after AM-09 and AM-21.

## AM-25 Infisical hosted secret lifecycle

**Register:** NOT VERIFIED / HOSTED ONLY.

**Thesis:** the app consumes stored credentials without operators copying
secrets.
**Source remaining:** none indicated.
**Work:** skip.

## AM-26 Connection isolation and resumable cleanup

**Register:** PARTIAL / SOURCE GAP (verification).

**Thesis:** one owner's revoke cannot touch another; failed cleanup is resumable.

**IDEMPOTENCY:** cleanup reports actual external result; no premature deletion
claim.
**Source remaining:** trace isolation, stale generation and resumable cleanup
to exact source tests. Pointers already exist.
**Work:** verification. No raw-secret browser access.

## AM-27 Supported UI journeys, keyboard, honest states

**Register:** NOT VERIFIED / SOURCE GAP (dependencies).

**Thesis:** each supported operation states what was accepted, what is happening,
one safe next action, and what changed.

36/42 detailed findings fixed in source. Independently actionable UI source
repair is exhausted. Remaining dependencies: AM-11/23 chronology, AM-09/24
return, AM-28 events, notifications-without-a-consumer.
**SIMPLICITY:** do not invent client sorting, deep links, generic events or a
notification inbox to close this row.
**Work:** skip independent UI. Re-check only when a parent lands a new
continuation the UI currently misstates.

## AM-28 Failure correlation and intended destinations

**Register:** NOT VERIFIED / HOSTED ONLY.

Sentry/PostHog project identity is operational. Funnel events stay blocked
until destinations exist.
**Work:** skip. Do not emit unreviewed customer context.

## AM-29 Help with Call reference; offboarding honesty

**Register:** NOT VERIFIED / SOURCE GAP.

**Thesis:** uncertain work can reach help; leave cannot silently erase it.

```
CONTRACT: ownerOffboardingPreview(account)
  Requires: current owner
  Ensures: explains what completes and what remains outstanding
  Invariant: offboarding cannot erase history, unresolved purchases or
             obligations; blocked actions give a reason
  On violation: refuse with supported next step; never promise cancel of an
                already submitted effect
```

**ERROR:** submitted effect is not cancellable by offboarding. That is basic
safety, not a new workflow engine.
**Source remaining:** reference-bearing help path; security/offboarding
continuations without erasing accepted work. Package 7 full export/deletion
is not this row — do not expand into it.
**Work:** source gap. Keep it a preview/continuation, not a new lifecycle
product.

## AM-30 Restore within 300 seconds

**Register:** PARTIAL / HOSTED ONLY.

Historical 308s restore is not current-alpha evidence.
**Work:** skip.

## AM-31 Cold Luna/max audit of frozen inventory

**Register:** NOT VERIFIED / HOSTED ONLY.

Audit follows six-turn/twelve-minute lifecycle after source completion.
**Work:** skip this well.

## AM-32 Named candidate rollup

**Register:** NOT VERIFIED / HOSTED ONLY.

No readiness claim from source tests or a green health endpoint.
**Work:** skip. This design's handoff is source-complete remaining gaps, not
AM-32.

---

## Integrity

**Thesis:** invited business, bounded Agent access, recoverable purchases.
**Integrity:** strong at design level if we refuse side wells and hosted
invention. Mixed if AM-18 parties and AM-11 documents are deferred as "after
invite" — the register and START_LINE do not allow that.
**Top risks:**
1. AM-15 paid recovery growing a second retry path.
2. AM-09/24 inventing Agent deep links.
3. AM-18/23 labelling parties instead of projecting them.
**Cuts:** OCR-style hardening, Package 7, events rail, API reference, navigation
redesign, purchase table unless AM-22 cannot close without it, tax-invoice
issuance enablement.
**Constraints to exploit:** existing funding command, Call recovery, Workflow
component, booked Account transactions, `hosted_alpha` fences, opaque refs.
**Next:** sign this design. Plan covers only the source-gap sequence, inert
characterisation first, one Flip on the first observable AM-09 behaviour.

## Recommended first implementation item

Layer 1 / AM-10: characterise existing funding-event tests, then add the missing
forced duplicate/reorder/interrupt cases around posting. AM-09 waits until that
status is once-only. AM-01 through AM-08 are not this well's code.
