# Treasury readiness reliability

**Status:** stages 1 and 2 restored on 14 October 2026 into
`codex/treasury-recovery-20261014`, integrated onto current main `9a80df0d4`.
The original implementation was `53d198418`; native recovery snapshot `661f39cbb`
also preserves its historical deployment-document edit. The release candidate
excludes that historical document overlay. Retained proofs remain deferred.
Fresh check/gate results belong to the exact release candidate and its review;
production changes require Joel's approval. Source checks do not establish
production recovery or sustained availability.

## 14 October resumption and remaining correction

Native read-only production inspection confirms both web and backend source
`9a80df0d48db0768bae411a458a24227bc1eb157`, Sydney backend
`upbeat-cricket-954`, and current web deployment `dpl_FNzHh9BtpNxfQ399kcfgfWXzvNub`.
The initial sample returned readiness 200, matched cash/funding/reservation/
settlement checks, 28 audited settlements and no in-flight Calls. Recent resolved
reconciliation-unavailable/stale alert episodes establish recurring interruption;
they do not identify a provider or prove that the current green sample is stable.

The new independent review found a classification gap in the archived code:
receipt read-cap or deadline exhaustion after a known provider contradiction
could replace `treasury_payment_receipt_conflict` with generic incomplete evidence.
The corrected priority retains attributed mismatches first, then an observed
receipt contradiction, then budget exhaustion. This preserves the existing
critical integrity alert without fabricating a monetary difference. Independent
raw cash facts remain distinct from unavailable attribution.

The existing 127-candidate fixture now covers its unchanged missing-receipt
control, a contradiction on read 250, and deadline exhaustion after an earlier
observed contradiction. Exact failure classification and bounded reads are
asserted. The cash-audit and alert-store suites passed 66 tests; the second
opinion accepted the correction. The full candidate still requires its own
release gate before merge/deployment.

No historical settlement proof reuse, 250-read scaling change, provider quota
upgrade, confirmation/quorum change, financial replay or authority expansion is
included. The new schema contains only one bounded coordination table and its
environment index; existing financial records need no migration or backfill.

## Implemented scope and contracts

Receipt reads return sanitized typed failures for transport/deadline, rate limit,
authentication/configuration, malformed responses, missing/immature receipts and
contradictions. DNS, both required providers, HTTP bodies and retry delays share
an absolute deadline. Only transient reads retry; required providers share the
longest Retry-After. Terminal failures return promptly and cancel sibling reads,
so a hanging peer cannot hide an observed contradiction. Owned confirmation
polling removes Viem's second retry layer. Settlement still requires twelve
confirmations and production still requires both configured providers.

A receipt contradiction blocks purchases and creates a critical settlement
integrity alert without inventing a monetary difference. A later read outage
cannot resolve that episode; a complete matched audit can. Web/backend transport
failures have distinct internal telemetry; public refusal remains
`payments_unavailable`.

Matched treasury publication requests fresh readiness through existing workload
admission. A separate `moneyPaymentReadinessWork` row per environment tracks
requested, claimed and completed demand, exact tokens and 90-second leases.
Requests never renew leases or reset attempts. Recovery reserves at most two
attempts in a five-minute window; only the periodic watchdog renews that budget.
Queued/running crashes expire, stale workers refuse, and pending demand survives
exhaustion. Provider reads remain read-only; readiness publication and completion
or follow-up scheduling commit together. Current authority, custody, configuration
and treasury health are checked again before publication. Source probes share
45 seconds, leaving publication headroom within the existing 60-second evidence
age; timed-out sources produce named failed evidence and late completions cannot
publish again.

Requires: explicit environment, exact custody, current workload admission,
current matched treasury evidence for event-triggered recovery and original probe
clocks. Ensures: fresh complete sealed evidence or a named refusal, bounded work
and preserved unsatisfied demand. Invariants: no signing, charge, Call creation,
settlement replay, quorum reduction or observation-clock renewal. On violation:
refuse publication/claim; the existing watchdog can reclaim expired work.

Failure safety: external read failures have a basic resource guarantee and typed
results; configuration/authentication/contradictions do not retry. Coordination
mutations have the strong transaction guarantee: scheduling failure rolls back
both evidence and work state. Authority/transaction/programming exceptions retain
their identity rather than being mislabeled as probe deadlines.

Complexity decision: keep one shared deadline helper and one coordination table.
They replace independently timed waits and isolate mutable leases from sealed
evidence replacement and public projection. Cost is one bounded row per
environment and a native scheduled action; no new queue service or dependency.
Embedding leases in sealed evidence was rejected because it couples coordination
to evidence integrity and cannot bootstrap missing readiness. Proof storage,
backfill, scaling beyond the 250-read bound and confirmation policy are deferred.

Independent implementation review accepted this scope after corrections to
nested confirmation retries, required-provider Retry-After, timeout publication
and the outer-audit contradiction race. Regression evidence covers real
corroboration-to-audit disagreement (including a stalled peer), genuine
missing-to-immature-to-twelve-confirmation waiting, no late HTTP, sanitized
web/backend diagnostics, failed source publication, lease takeover, concurrent
bootstrap, duplicate coalescing, newer red, configuration/custody rotation,
authority revocation, atomic scheduler failure and critical-alert resolution.


## Purpose and historical evidence (13 October 2026)

Keep new purchases safe without making previously verified payment history an
ever-growing dependency on live receipt RPCs. Failures must identify their cause,
recover through current evidence and become reproducible regression cases.

Production web source is `6fce9ae10b9e93297531fa1d0d03d1268c1d4cbb`; backend is
Sydney `upbeat-cricket-954`. Read-only backend evidence showed receipt/attribution
failures at 10:29, 10:34 and 10:39 Perth, followed by matched audits at 10:44,
10:49 and 10:54. The 10:54 audit checked 28 payment attempts, reported zero
differences across cash, settlements, funding and reservations, and zero in-flight
Calls or signing liability. At 11:05 Perth, backend payment readiness was ready.
These are dated observations, not sustained-availability acceptance.

Baseline before these stages:

- [Cash audit](../../convex/lib/money/treasury/cashAudit.ts) rereads candidate
  receipts sequentially, including settled attempts. Missing evidence gets one
  retry after 250 ms. The total budget is 250 receipt-reader invocations and two
  minutes; a persistent miss makes settlement and cash attribution unavailable.
- [Receipt reader](../../src/modules/capability-supply/internal/x402-evm-receipt-reader.ts)
  normally performs four logical JSON-RPC reads per provider: receipt,
  transaction, latest block and nonce authorization state.
- [Production corroboration](../../src/modules/capability-execution/call-worker/x402Settlement.ts)
  requires two distinct configured RPC URLs and agreement from both. This is
  corroboration; it supplies no availability failover when one provider is down.
- With 28 receipts, the nominal receipt component alone is 224 RPC requests per
  cycle, approximately 64,512 per day at five-minute cadence. This is a source-
  derived estimate excluding retries and other RPC work, not measured usage.
- [Fresh treasury checks](../../convex/lib/money/treasury/health.ts) inspect the
  latest report and current exposure. A newer red report invalidates readiness
  immediately; [readiness publication](../../convex/lib/money/readiness/store.ts)
  requires fresh evidence and rejects late older workers.
- Treasury observation, reconciliation and readiness run on separate five-minute
  schedules. There is no guarantee they finish in dependency order.
- The public readiness route also maps failed signed backend reads, including its
  bounded query timeout, to `payments_unavailable`. Historical treasury failures
  are established; the particular RPC provider/method/transport cause is not.

## Independent second opinion and root decisions

On 13 October a fresh-context reviewer applied contract, error, idempotency,
complexity and design-review skills. The design interview was skipped for this
noninteractive review. The root checked its material findings against source.

Confirmation clarification: the generic receipt reader defaults to one
confirmation for a direct fetch, without waiting for more blocks. Settlement
acceptance still requires twelve in the verifier, treasury audit, signed paid Call
and cancellation/recovery paths. Official production readback identified backend
revision `85824a995a017ea06823de573c4bf1339bc1d658`, which has those same rules;
web remains `6fce9ae10b9e93297531fa1d0d03d1268c1d4cbb`. A one-confirmation
settlement policy has not been established by the reader's default.

| Reviewed choice | Verdict and root decision |
| --- | --- |
| Treat every absent receipt as a transient outage | Unsound, high confidence. Provider disagreement and receipt/transaction contradictions also become `undefined`; the outer audit retries them. Preserve the semantic failure before retry and do not erase a contradiction with a subsequent successful read. |
| Classify and measure before tuning | Sound, high confidence. The incident establishes failed receipt attribution, not which provider, method or quota caused it. Keep this first. |
| Refresh readiness after treasury recovery | Sound, medium confidence. A saved failed readiness check needs a new publication. Trigger only needed recovery; coalescing requires new explicit transition state, not merely existing admission. |
| Retain exact archived settlement evidence | Sound as a scaling stage, medium confidence. The 250-candidate cliff is established. This is not yet a demonstrated remedy for the observed incident, and eligibility/invalidation need a complete contract before implementation. |
| Make a transport-only optional deep check nongating | Needs a policy decision, medium confidence. Provisionally retain current behavior. A future optional scrub must have a distinct diagnostic role; mandatory current failures and discovered contradictions still block. |
| Preserve twelve-confirmation acceptance and two-provider agreement | Sound, high confidence against current source. A change to either is a separate financial-policy decision. |

The nominal RPC arithmetic is confirmed, but it is not measured usage or evidence
of rate limiting. The audit's two-minute budget also is not a hard end-to-end
deadline: time is checked before each receipt reader, individual HTTP calls have
their own timers, and DNS preflight has no shared deadline. Stage one must address
deadline propagation alongside classification, before increasing retries.

The review independently ran eleven selected cases covering receipt reading,
agreement, confirmation handling and readiness recovery: eleven passed, 131 were
excluded by the test filter. The root separately ran the settlement-verifier
suite: 22 passed, including insufficient-confirmation rejection. These are existing
behavior checks, not proof of the proposed new recovery or proof-storage design.

## Recommended sequence

### 1. Diagnose the failed observation precisely

Keep bounded internal failure results for provider identity, RPC method, failure
class, latency and retry delay. Distinguish transport timeout, rate limiting,
authorization failure, malformed response, missing receipt, insufficient maturity
and contradictory evidence. Distinguish web-to-backend probe failure from a
backend treasury refusal. Extend existing redacted telemetry and Treasury views;
do not create a second status database or expose credential-bearing URLs.

Carry one bounded deadline through DNS, both providers, HTTP/body reads and retry
delays. Propagate cancellation; no in-flight read may silently outlive the audit
budget. Preserve a contradiction across attempts within the same audit rather
than allowing a later success to conceal it. The current test that does not retry
a conflicting returned receipt does not cover provider disagreement discarded
inside the reader; add that complete-path regression.

Only transient reads qualify for bounded retries. Honor provider retry delays
within the total deadline; do not repeat authorization/configuration failures or
retry a contradiction into an apparent pass. Rate-limit and recovery behavior
must be explicit, not hidden behind `undefined`.

### 2. Recover promptly through the existing workload boundary

After diagnostics quantify recovery delay, when a new matched treasury snapshot
can clear saved failed readiness, request a coalesced
payment-readiness refresh through existing admitted workload machinery. Keep the
periodic refresh as a watchdog. A single pending refresh per environment and a
bounded retry budget prevent a recovery storm. Reconcile workload authority again
before publication; do not borrow the treasury workload's identity for readiness.

Admission exists today; job coalescing does not. Specify the transaction that
records requested/processed snapshot versions, duplicate delivery and crash
recovery before implementing it. A matched snapshot arriving while a refresh is
running must leave work to process that newer version; a pending-only flag can
lose that recovery. This transition state needs its own reviewed storage contract.

This removes avoidable scheduling delay. It does not make a failed provider or
an expired observation healthy. Current red reports must still block immediately.

### 3. Retain exact settlement evidence and audit receipt history incrementally

Persist the complete normalized evidence already independently verified for an
exact payment, rather than only digests/status. Bind it to environment, custody
generation, network, asset, transaction and log identity, payer, recipient, amount,
nonce, Call/attempt/effect generation, block hash/number and verifier version.
Record the native settlement/obligation bindings and the observations establishing
canonical inclusion. A digest identifies retained evidence; it does not prove it.
Current normalized receipt logs omit event log index; obtain exact event identity
from the independently corroborated treasury transfer and join it to the retained
transaction/authorization evidence.

Separate provisional receipt maturity from eligibility for historical proof reuse.
The current 12-confirmation threshold alone does not establish protocol finality.
Base derives finalized L2 blocks from L1 finality; the JSON-RPC specification
distinguishes `latest`, `safe` and `finalized`:
[Base derivation](https://docs.base.org/specifications/base-protocol/consensus/derivation),
[execution API](https://ethereum.github.io/execution-apis/api/methods/eth_getBlockByNumber/).

Reuse is allowed only when a current, independently corroborated finalized chain
checkpoint covers the exact retained block and outgoing transfer, and current
native records still match its attribution. Reuse the existing checkpoint,
range-history and custody validation in
[chain observation](../../convex/lib/money/treasury/chainObservation.ts); reject
hash changes, missing ranges, regressed checkpoints or changed material.
A block height and hash alone do not establish historical inclusion or ancestry.
Require the exact transfer in its verified finalized range and complete linked
retained history to the current checkpoint; this is retained corroborated evidence
under the existing RPC trust model, not a new cryptographic inclusion proof.

Continue fresh checks of chain state, native cash, reservations, uncertain signing
liability and current policy. Never refresh an observation's timestamp merely
because an old proof was read. A source contradiction blocks new exposure even
when old evidence exists. Unsupported finality/canonicality means no proof reuse.

Ordinary receipt RPC work then covers new, unresolved or not-yet-finalized
payments. Retained proofs must not consume the external receipt-read budget, but
all source scans and completeness checks remain bounded. Existing native/ledger
history bounds still apply; this does not claim unlimited audit scalability.

This requires an explicit storage/contract decision before implementation. Backfill
historical proof only from successful current corroborated reads; never promote
an old `settled` status into proof. Compare full-read and incremental audit results
under the same controlled inputs before enabling reuse. Retain periodic deep
verification; a contradiction blocks immediately, and unavailable current chain
or cash evidence still blocks new exposure.

Deep-check policy remains unresolved. A future optional historical receipt scrub
that times out must report degraded diagnostic coverage separately from a complete
current incremental audit, or it recreates the same availability dependency. Any
discovered contradiction must durably invalidate proof eligibility and block new
exposure until explicitly resolved by current corroborated evidence. Refusing a
conflicting proof insert alone is insufficient: another worker must not reuse the
old proof and publish green. Publication must detect concurrent invalidation. Keep
the existing mandatory-current-check and newest-authoritative-red rules intact;
changing which historical checks are optional requires an explicit policy decision.

### 4. Turn incidents into permanent behavioral checks

Use the existing Vitest and Convex harnesses. Sanitized incident signatures become
fixtures. Measure receipt reads per new payment, recoveries and blocked minutes by
cause, with original evidence age and source revisions attached. Providers may be
backed off for efficiency, but ordering or health scoring cannot relax mandatory
corroboration. Track native source-page counts too: the current audit rereads full
native history, so receipt optimization alone does not remove that cost.

## Contracts and recovery boundaries

**CONTRACT: historical settlement evidence reuse**

- **Requires:** exact independently verified payment evidence, matching current
  custody/Call/native material, and a fresh corroborated canonical checkpoint
  establishing the retained transfer's finalized inclusion.
- **Ensures:** the same settlement attribution as full verification, with no
  payment, signing, release, balance adjustment or new Call.
- **Invariant:** one economic settlement per payment identity; current exposure
  and cash remain independently checked; evidence clocks and confirmed failures
  cannot be replaced by cached green status.
- **On violation:** typed missing/unavailable/conflicting evidence. Read afresh
  when safe; otherwise block new exposure and retain recovery of original Calls.

**CONTRACT: recovery publication**

- **Requires:** admitted current workload authority and complete fresh checks.
- **Ensures:** atomic monotonic publication; exact replay has the same result.
- **Invariant:** older green workers cannot overwrite newer red evidence; no
  duplicate alert, refresh storm or financial side effect.
- **On violation:** refuse publication; preserve existing facts and named cause.

| Condition | Classification and guarantee | Recovery owner |
| --- | --- | --- |
| Timeout, 429 or temporary missing receipt | Recoverable; read failures preserve balances, liability and proof | RPC boundary classifies; audit owns bounded retry |
| Invalid credentials/configuration | Operational refusal; no ineffective retry loop | Operator fixes the named binding |
| Provider disagreement, wrong transfer or changed block hash | Integrity refusal; no fallback to older green evidence | Treasury recovery, preserving contradiction |
| Outcome unknown after signing | Uncertain economic effect; retain liability and original identity | Existing Call reconciliation, never a fresh purchase retry |
| Delayed/duplicate audit or readiness worker | Exact replay or superseded refusal | Existing transactional publication |

## Mutation and complexity review

Existing readiness publication deduplicates by evidence digest and orders by probe
start. Treasury publication deduplicates by snapshot reference and orders by
snapshot time; alert episodes are transactional. Keep these controls.

Proposed proof publication needs a transactionally checked natural payment key
and exact material digest. Identical concurrent writes replay; conflicting
material for the same payment refuses. Current custody/workload authority is
checked in that transaction. A crash after persistence but before refresh may
delay recovery; the watchdog catches it without changing money. Any queued
refresh needs transactional coalescing and must remain safe if delivered twice.

| Addition | Cost and benefit | Keep/remove decision |
| --- | --- | --- |
| Internal classified RPC results | Changes reader, audit and operator diagnostics; makes retry and incident attribution meaningful | Keep first, within existing modules |
| Coalesced refresh after matched audit | One scheduling transition and pending-job guard; removes independent five-minute recovery wait | Keep if existing admitted scheduling supports it; no new queue service |
| Durable exact settlement proof | Evidence schema, backfill and invalidation rules; removes repeated historical receipt network work | Keep as a separately reviewed implementation stage |
| Third RPC provider / 2-of-3 quorum | New service, cost and financial trust policy; may tolerate one unavailable provider | Defer; current two-provider rule remains intact |
| Longer green TTL, one-provider fallback or broad automatic purchase retry | Conceals missing current evidence or risks duplicate payment | Reject |
| New orchestration/retry framework | Additional runtime and authority boundary with no demonstrated need | Reject; reuse existing machinery |

Design review: purpose is coherent, and money correctness constrains every stage.
Main risks are false finality, incomplete retained proof and recovery scheduling
escaping workload authority. Keep implementation staged; remove quorum changes
and native-history redesign from the first release. Provider-level attribution
remains an evidence gap, so do not claim which vendor caused these incidents.

## Acceptance

Existing baseline: 164 tests passed across receipt reading, cash audit, snapshot
reconciliation and payment readiness on 13 October. They establish bounded missing-
receipt retry, refusal on conflicts, freshness, replay and ordering behavior;
they do not establish the proposed retained-proof or event-triggered recovery.

Future retained-proof acceptance (items 1-7 remain deferred; implemented stages cover 8-9):

1. A retained finalized payment survives a receipt-only outage while fresh chain,
   cash, custody, liability and attribution checks still pass.
2. A receipt outage without eligible proof blocks; a total required-provider outage
   also blocks. Proof retention is not provider failover.
3. Reorg/hash changes, source mutations, missing history, wrong custody generation,
   changed verifier requirements and conflicting native attribution block.
4. Original observation expiry is enforced exactly; replay cannot extend it.
5. Duplicate proof writers and refresh jobs cause one retained proof and no money
   effect; a late green worker cannot replace newer failed evidence.
6. Interrupted proof publication/refresh scheduling recovers through the watchdog
   without a new Call or duplicated settlement.
7. With fixed current activity, receipt RPC reads do not grow with already eligible
   historical payments; bounded source scans remain complete and explicit.
8. Rate-limit/timeout/credential/conflict cases produce distinct sanitized operator
   diagnoses. No raw endpoint credentials, nonce secrets or environment dumps.
9. A matched audit triggers fresh readiness without waiting for the next periodic
   tick, and repeated failures cannot create unbounded jobs.

Run affected tests and `npm run check` during implementation, the full gate before
merge, then separately approved production readback across normal scheduled cycles
and evidence expiry. No paid fault injection or production mutation is part of
this investigation.
