# Agentic Economy implementation roadmap

**Status:** active delivery roadmap
**Revised:** 2026-09-05 (maturity-first direction and product terminology;
Packages 0–5 evidence reconciliation retained)
**Destination:** a mature Australian equivalent of the familiar Locus and
Nevermined experience; differentiation is not a current delivery objective
**Authority:** subordinate to [`PRODUCT.md`](./PRODUCT.md), current source and
tests
**Package 4 research:**
[`Operation evidence, reconstruction and analytics`](./research/PACKAGE-4-OPERATIONS-RECONSTRUCTION-RESEARCH.md)

## Purpose

This roadmap describes the platform capabilities Agentic Economy must complete.
It is not a go-to-market funnel and it is not replaced by the progression from
Observe to Control, Broker and Resell.

Packages 1–3 established the application, workspace and authority foundation.
Package 4 must now achieve two things:

1. ship the starting-line product by completing and explaining one real managed
   x402 Call; and
2. complete the original financial-operations requirements so the platform's
   existing credit, recovery and payout machinery is not stranded.

It must achieve both through one agent-operable system. The calling agent is
not the coordinator for identity, authority, balance, treasury, x402, ledger,
evidence or recovery.

Packages 5–10 then continue the original path to a mature platform.

```text
Packages 1–3                Package 4                       Packages 5–10
foundation built     ->     starting-line release     ->    mature platform
                            + financial completion
```

The starting-line product is the first externally useful release gate inside
the platform roadmap. It is not a replacement destination.

## Current-stage direction: familiar maturity, not differentiation

Use Locus and Nevermined as the default product-design references, with Whop
supporting familiar business administration. Build working Australian capability
using established behaviour and maintained components; do not design unique
interaction patterns, vocabulary or infrastructure without a concrete need.

Review the whole supported platform, not only the paid Call: account and team
access, agent connections and spending policies, service discovery and publishing,
pricing, funding, usage and billing, documents, earnings and payouts, events,
support, APIs and SDKs, and offboarding. Use the existing package boundaries.
A gap in public documentation or client access is not automatically missing
backend capability, and reference breadth is not automatic next-package scope.

For each in-scope journey, use the existing scavenger item to identify the
reference behaviour, AE's current implementation, the remaining gap and the
evidence that proves the gap is closed. Include setup, normal use, changes,
interruptions, failure, recovery and exit. Add a new reference entry only when
the existing records do not cover the behaviour; do not create another ledger.

Deviations need an Australian requirement, a correctness or safety constraint,
or a demonstrated reference weakness and a clear customer benefit. "AE is
different" is not a reason. SDKs and ordinary platform features need not prove
novelty; reuse supported libraries and generate shared contracts where suitable.

References:
[Locus scavenger](./.planning/locus-docs/LOCUS-SCAVENGE-PAPERCUTS.md),
[Nevermined scavenger](./.planning/nevermined-docs/NEVERMINED-SCAVENGE-PAPERCUTS.md),
[Whop scavenger](./.planning/whop-docs/WHOP-SCAVENGE-PAPERCUTS.md).

### Terminology and preserved evidence

Product prose uses customer, agent, spending policy, service, Tool, Quote and
Call, as defined in [CONTEXT.md](./CONTEXT.md). The checked-in source currently
uses `registry.tools.*`, `tool.quote`, `tool.call`, `call.list`, `call.status`,
`call.cancel` and `call.reconcile`, with `toolRef`, `quoteRef` and `callRef` as
the current references. This source acceptance does not establish installed-
package compatibility, hosted deployment or production release. Historical
identifiers remain only where they are protected protocol, evidence or
document names; no parallel records, storage migration or new API is authorised
by this wording change.

Dated progress assessments, linked research and the historical engineering
review below retain their original terminology and evidence status. They are
not fresh verification. Package numbers, operational acceptance checks and
financial, concurrency, recovery and production gates remain in force.
Differentiation and later market-learning hypotheses are not current closeout
requirements.

## How to read the roadmap

The **packages** describe durable platform capabilities:

```text
application -> workspace -> authority -> records and money -> Providers
            -> onboarding -> trust -> operations -> integrations -> quality
```

The **commercial modes** describe how much responsibility Agentic Economy takes
for a particular acquisition:

```text
Observe -> Control -> Broker -> Resell
```

Those modes exercise capabilities from several packages. They do not replace or
renumber the packages.

## Roadmap rules

1. **Mature platform first.** The destination includes complete buyer, Agent,
   Provider, operator and integration journeys, not only the starting-line
   wedge.
2. **Prove value before broadening inputs.** Package 4 begins with one
   deterministic managed x402 path rather than a catalogue of evidence or
   payment connectors. External reconstruction follows the stable native Call.
3. **Reuse the platform already built.** Externally observed acquisitions and
   Agentic Economy-controlled Calls share evidence and projection
   machinery without sharing provenance they did not earn.
4. **Standards at the edges.** Use OpenTelemetry, W3C Trace Context,
   CloudEvents, FOCUS, official x402 packages and UBL/PINT rather than creating
   Agentic Economy equivalents.
5. **Global core, local adapters.** The record and reconstruction model remains
   jurisdiction-neutral. Australia is the first complete configuration through
   identity, currency, tax-document and accounting adapters.
6. **Explicit truth.** Source-reported, Agentic Economy-observed, derived,
   buyer-supplied, stale and unresolved facts remain distinguishable.
7. **No package completes on a feature list alone.** Every package has an
   observable buyer, Provider, integrator or operator outcome.
8. **Quality is continuous.** Failure containment, recovery, accessibility,
   responsive behaviour, performance and operational references apply to every
   package even where Package 10 owns the platform-wide audit.
9. **Breadth follows the supported scope.** Streamed-delivery machinery and new
   payment-rail adapters enter only when an admitted service requires them.
   Benchmark breadth is not automatic scope.
10. **Deep interface, separate owners.** The buyer-facing Call interface remains
    small while market, authority, execution, money, protocol, evidence and
    recovery retain separate internal state ownership.
11. **Budgets belong to agents, not credentials.** Credentials are replaceable
    access and audit evidence. Rotation cannot reset aggregate spend or detach
    prior Calls.

## Current position

Progress reconciled on 2026-09-05 against `main` at
`987cdec5085c207eb6b9024b66ef4a20de8a3da0`, current source and the dated evidence
linked below. The working tree also contains uncommitted application and
infrastructure changes; neither their presence nor this documentation update
proves that they are deployed. No runtime suites or cloud checks were rerun for
this reconciliation.

| Package | Implemented progress | Verification and remaining boundary |
| --- | --- | --- |
| Foundation before Package 1 | Existing Tool, Call, money and recovery foundations underpin the numbered packages. | This roadmap has no numbered Package 0; the foundation is a baseline, not a newly declared completed package. |
| 1 — Application shell | Failure containment, shared states and navigation safety are built. | The dated [Whop side-surface re-audit](./.planning/whop-docs/WHOP-SCAVENGE-PAPERCUTS.md#side-surface-recovery-re-audit--2026-08-31) records the verified scope at `9d95b4030`; it is not proof of every later route or external journey. |
| 2 — Human workspace | Workspace restructuring, Provider workspace consolidation and navigation cleanup are built. | The [Package 2 design](./research/PACKAGE-2-HUMAN-WORKSPACE-IA.md) is reflected in the [owner Operations workspace](./src/components/ae/offerings/AeOwnerOperationsWorkspace.tsx) and its [existing tests](./tests/unit/ui/owner-operations-workspace.test.tsx); no fresh full-workspace acceptance run is claimed here. |
| 3 — Identity, access and authority | Account/Principal boundaries, selected-Tool access, consequential-action proof and durable credential lifecycle are built. | [Package 3 gauntlet evidence](./research/PACKAGE-3-GAUNTLET-PROGRESS.md) records scoped tests and live Clerk proof. Broader installed-client and concurrent spending proof remains bounded by the relevant release records. |
| 4 — Managed Calls and financial operations | Formance-backed funding/reservations, caller-specific Quote, Quote-based `tool.call`, recovery, Calls and document/obligation machinery are substantially implemented. | [Package 4 release evidence](./docs/guides/package-4-release-evidence.md) records local checks and real hosted sandbox funding. Managed-x402 success/refusal/recovery, refund/replay, documents/close, parity, strict recovery and external canary proof remain open; production remains gated. |
| 5 — Provider operations | Source-native preview, admission, the shared Tool lifecycle, health and durable offboarding have landed on `main`. | [Package 5 implementation and test record](./PACKAGE-5-ATOMIC-FEATURE-BUILD-PLAN.md) records the local baseline. Complete deployed Provider-to-buyer journeys, credential lifecycle, active-case restore and supported-client proof remain open. Later handoff corrections in the dirty tree are not release evidence. |

Package 4 should connect and complete those capabilities, not replace them with
a parallel record system.

The [deployment maturity record](./docs/operations/deployment-maturity.md)
separately identifies synthetic resources, partially deployed changes and
operational blockers. A deployed test environment is not production readiness.
Requirements, package priorities and completion gates below are unchanged;
Packages 6–10 are outside this progress reconciliation.



## 1. Application shell — built

### Package 1A — Failure containment

- Replace route crashes with recoverable states.
- Handle unavailable backends and missing credentials.
- Standardise retry and escalation behaviour.
- Prevent client-only notification code from running server-side.

### Package 1B — Navigation safety

- Browser back and forward behaviour.
- Deep links and refresh recovery.
- Unsaved-change protection.
- Double-submission prevention.
- Interrupted-action resumption.
- Dialog focus restoration.

### Package 1C — Shared state system

Define shared behaviour and language for:

- loading;
- empty;
- draft;
- saving and saved;
- pending;
- succeeded;
- refused;
- stale;
- unavailable; and
- outcome unknown.

## 2. Human workspace and information architecture — built

### Package 2A — Workspace restructuring

Organise the human product around:

- calls and purchasing;
- Agents, access and credit;
- supplying services; and
- Account and security.

Remove duplicated projections of credit, keys, services and settings.

### Package 2B — Provider workspace consolidation

- Merge services and Publish.
- Present one service lifecycle.
- Surface blockers and next actions.
- Consolidate connection, publication and payout readiness.

### Package 2C — Navigation cleanup

- Rename or remove ambiguous Activity.
- Hide unfinished Members functionality.
- Clarify Account versus workspace.
- Separate buyer and Provider navigation.
- Simplify mobile navigation.

## 3. Identity, access and authority — built

### Package 3A — Agent access management

- Create and name access.
- Show scope and spending limits.
- Show last-used information.
- Rotate and revoke access.
- Handle expiration and compromise.
- Preserve an audit history.

### Package 3B — Provider connections

- Connect and test supported upstream Providers.
- Show connection health.
- Explain required permissions.
- Rotate credentials safely.
- Recover disconnected or expired connections.
- Prevent secrets from appearing in diagnostics.

### Package 3C — Consequential-action controls

For funding, payouts, publication and authority changes:

- identify the actor and target;
- show scope and consequence;
- require appropriate human confirmation;
- reauthenticate when authority increases;
- explain reversal and recovery options.

### Package 3D — Account security

- Session and device management.
- Account recovery.
- Sensitive-action reauthentication.
- Redirect and request protection.
- Rate limiting.
- Security event history.

### Post-Package 3 benchmark verification

The Locus and Whop maturity audits predate some final Package 3 work. Verify the
current source and tests before reopening implementation. The re-audit must
establish whether the built foundation already provides:

- exact-service or bounded-capability execution scopes rather than only broad
  admitted-supply access;
- owner-bound headless Agent activation and recovery;
- bounded credential overlap during rotation and immediate revocation;
- distinct read and execute OAuth scopes with refresh-token-family rotation and
  replay rejection;
- fresh human proof for payout, Funding and authority enlargement; and
- one principal-wide committed-exposure limit across concurrent credentials and
  supported payment routes.

An unmet item returns to Package 3 as a specific acceptance gap. A passing item
is recorded as verified and does not justify a refactor.

**Progress reconciliation — 2026-09-05:** the verification questions above
remain unchanged. The dated 2026-09-03 connection re-audits and current source
establish selected-Tool enforcement, owner-bound activation/recovery,
refresh-family rotation and revocation. Owner-selected timed overlap for
arbitrary keys remains absent. Fresh per-command Clerk proof exists for
consequential actions, but `funding.top_up` currently selects no fresh-proof
requirement; that does not satisfy the broader Funding question above. Managed
Calls now reserve Formance Agent-budget and legal-customer exposure capacity;
the existing concurrency proof does not cover two credentials and two routes.
OAuth resource/audience binding also remains an acceptance gap despite the
earlier local connection smoke. The [current Locus assessment](./.planning/locus-docs/LOCUS-SCAVENGE-PAPERCUTS.md#packages-05-progress-reconciliation--2026-09-05)
records these bounded findings without reopening implemented mechanisms.



## 4. Managed Calls and financial operations — substantially implemented, release gated

### Package 4 authority and outcome

Package 4 is implemented from these checked-in references:

1. [`PRODUCT.md`](./PRODUCT.md) defines the product and commercial boundary.
2. [`START_LINE.md`](./START_LINE.md) defines the first managed x402 Call that
   must work end to end.
3. [`Package 4: Australian prepaid balance and settlement perimeter`](./research/PACKAGE-4-AUSTRALIAN-PREPAID-LEDGER-REGULATORY-PERIMETER.md)
   defines the legal, accounting and launch gates for the selected fact pattern.
4. [`Package 4: operation evidence, reconstruction and analytics`](./research/PACKAGE-4-OPERATIONS-RECONSTRUCTION-RESEARCH.md)
   defines later evidence adapters and analytical projections. It does not set
   the Package 4 start line.
5. [`Agent operating contract`](./docs/designs/agent-operating-contract.md)
   defines the machine-facing control loop, response semantics and accretive
   evidence boundary.
6. [`Agentic Economy as a context-efficient source`](./docs/research/agentic-economy-context-efficient-source.md)
   defines progressive discovery and Quote without loading the whole
   market into agent context.

Where they differ, `PRODUCT.md` remains authoritative. Package 4 produces one
coherent product: an Australian business funds an AUD Prepaid balance, its agent
calls an admitted x402 service through Agentic Economy, Agentic Economy pays
the upstream obligation from its corporate USDC treasury, and the business can
see and substantiate the resulting Call without operating crypto infrastructure.

```text
AUD customer leg                         corporate USDC leg

fund -> available -> reserved            treasury -> committed -> settled
                         \                           /
                              quote + Call
                                  |
                                  v
                     one customer-facing Call
                    Logs | Usage | Spend | evidence
```

The two legs share the quote and Call identity. They never share a
balance, posting, after-the-fact currency conversion or claim of ownership.
Package 4 is delivered atomically and sequentially. Each subpackage leaves the
system internally complete; none introduces a second implementation alongside
the first.

The agent sees one short Call path, not these subsystems:

```text
registry.tools.search
  -> tool.quote -> Quote
  -> tool.call -> result

only when required:
  call.status | call.cancel | call.reconcile

optional reads:
  public detail | compare | agentAccess.whoami | agentAccess.balance

inside the managed-Call module only:
market | authority | AUD ledger | treasury | x402 | Provider obligation
```

The public interface is deliberately shallower than the implementation.
`tool.quote` accepts the chosen Tool, literal input and bounded constraints,
merges the caller-specific material detail and returns a Quote. `tool.call`
accepts that Quote and idempotency identity.
The Call returns an action-specific tagged result with authoritative state,
exact money, material unknowns and at most one executable machine continuation
plus an optional owner handoff. It never asks the agent to supply an Account,
choose custody, calculate FX, sequence reservations, interpret chain finality or
build an accounting record.

### Package 4 atomic delivery sequence

Implementation uses stacked, sequential PRs from a clean Package 3 mainline.
Each PR owns one vertical state boundary, deletes the displaced path in the same
change and must pass its deployment gate before the next begins.

| PR | Atomic result | Exit gate |
| --- | --- | --- |
| Preflight | Export supported Convex backups, prove no user financial rows, record the current action-schema and payload baseline, and rerun the Package 3/money/x402 suites. | Stop if user data or production financial traffic exists; this plan contains no compatibility migration. |
| 1 — commercial gate | Versioned commercial policy, Australian production gates, strict authority for policy changes, closed audit events and fixed rate-limit policies. | Missing or expired approval refuses before external production I/O. |
| 2 — AUD ledger and Funding | Balanced single-asset postings, rebuildable projections, Account-level AUD Funding, agent budget windows and ported payout economics; delete legacy credit/ledger/budget paths. | Stripe replay, journal balance, Account pooling and concurrent Agent-budget proofs pass. |
| 3 — treasury and pricing evidence | Corporate USDC positions, commitments, buffers, maintained CDP observation and bounded sandbox FX evidence. | Stale evidence or insufficient buffered capacity fails closed; no custody material reaches buyer surfaces. |
| 4 — Quote | Pricing v3, one-to-three compact search, caller-specific `tool.quote`, Quote consumption and cross-surface Quote/Call parity; delete pricing v2. | Successful, blocked and drift journeys meet the payload and caller-input budgets. |
| 5 — managed x402 Call | One atomic Account/budget/treasury/Provider-obligation reservation before signing, payment release fence, paid retry, settlement/release/reconciliation and sandbox activation. | Mutation-before-sign, duplicate, crash and unknown-outcome journeys pass; possible dispatch exposes no `tool.call` continuation. |
| 6 — Calls, Usage and Spend | Indexed Call projections, Agent/Account pagination, version-aware status and automatically observed operational evidence; replace activity fan-out. | Unchanged status is bounded, cross-Account reads return no rows and browser/CLI/MCP recovery needs no dashboard. |
| 7 — documents and reconciliation | Versioned Funding/period/adjustment documents, exact rounding, append-only corrections and external reconciliation. | Documents rebuild from journal facts and no tax document exists without active policy. |
| 8 — Provider obligations | Immediate x402 settlement and later payable/payout states remain distinct and attributable. | Settled x402 obligations cannot be paid twice through the payout lane. |
| 9 — release | Secret scan, telemetry, runbooks, four agent journeys, deterministic CI and bounded external canary. | All Package 4 gates pass; production remains disabled until every Australian and operational approval is current. |

PRs 1–4 deploy with managed paid Calls disabled. PR 5 may enable only the
sandbox policy after its authenticated journey passes. Once a new journal
transaction exists, rollback means disabling new financial admission and fixing
forward; prior postings are never discarded or rewritten.

### Package 4A — Commercial contract and production gate

- Encode one commercial mode: Agentic Economy is the buyer-facing Seller and
  sole payee for admitted managed x402 services.
- Record versioned, effective-dated pricing, top-up fee, tax, balance-limit,
  refund, treasury and evidence policies. Historical Calls retain the exact
  policy versions used.
- Keep the Prepaid balance closed-loop: it pays only Agentic Economy, cannot be
  transferred, assigned, withdrawn, redeemed for crypto, or used postpaid, and
  does not grant authority.
- Keep all USDC beneficially owned and controlled by Agentic Economy. A customer
  never receives a wallet, token quantity, address, key, or redemption right.
- Permit complete sandbox and testnet engineering. Disable real customer
  funding and production USDC settlement until the legal, AML/CTF, tax,
  accounting, client-money and privacy gates in the regulatory reference have
  named written sign-off.
- Freeze one bounded tagged result per Package 4 action. Do not create a
  universal envelope, selectable detail levels or arbitrary field groups.
  Consequential results carry only their material state, exact decimal-string
  money, expiry, at most one bound machine continuation and an optional owner
  handoff. Keep reusable consequence and retry descriptions in the existing
  action descriptors and generated agent manifest.
- Resolve customer, Account, agent, credential and active
  spending policy from authentication. A Call request cannot select or override its
  Account.

**Gate:** the contracts, UI language, configuration and storage all express the
same fact pattern; production money paths fail closed while a required approval
is absent or expired; and `tool.quote` resolves the material caller context
without mandatory self or balance round trips.

### Package 4B — AUD product ledger

Replace the existing money internals in place. There is no migration or legacy
compatibility path because the product has no users or deployed financial data.
Keep the existing `money` module boundary, but split its implementation by
responsibility:

```text
src/modules/money/internal/ledger/
  accounts/          account classes and ownership
  journal/           atomic transaction and posting writer
  funding/           top-up lifecycle and evidence
  reservations/      reserve, capture, release and unknown
  adjustments/       reversals, refunds and corrections
  treasury/          corporate USDC positions and commitments
  reconciliation/    external-to-ledger comparisons and cases
  invariants/        shared assertions at write boundaries
  projections/       balances, Calls, statements and exports
```

The journal is a low-level writer, not a generic financial framework. Convex
commands remain thin entry points. Domain services own state transitions and
write all postings in the same Convex transaction. No file owns funding,
reservations, treasury, invoicing and reconciliation together.

Implement:

- immutable ledger transactions with balanced debit and credit postings;
- separate account classes for customer AUD available, customer AUD reserved,
  processor/bank clearing, sale and tax facts, Provider obligations, corporate
  USDC, upstream settlement, network costs, refunds and adjustments;
- authoritative postings plus rebuildable balance and reporting projections;
- integer storage using `bigint`, with six decimal places for internal AUD
  amounts and native atomic units for USDC;
- `decimal.js` only at FX, percentage and rounding boundaries; no JavaScript
  floating-point money arithmetic;
- idempotent external commands, linked reversals instead of mutation, stable
  legal-customer aggregation, and optimistic-concurrency retries that cannot
  create a duplicate economic effect; and
- immutable evidence references and effective/recorded timestamps on every
  transaction; and
- authority reservations and aggregate spend keyed to the durable agent, with credential identity retained as attributable evidence, plus
  a separate principal-wide committed-exposure control across concurrent agents and credentials.

No transaction balances AUD against USDC. For each currency or asset:

```text
sum(debits) = sum(credits)
available >= 0
available + reserved + other accessible value = customer liability control
```

**Gate:** a full replay from postings rebuilds every projected balance exactly;
concurrent reservations cannot overspend; a reversal restores the intended
economic position without changing the original transaction; credential
rotation cannot reset an agent budget or strand a reservation.

### Package 4C — Funding and top-up service fee

A top-up has three independently visible amounts:

```text
credit principal = requested AUD credit
service fee      = versioned fee policy applied and rounded to cents
total payable    = credit principal + service fee
```

The service fee is additional to the credit principal. It is disclosed before
authorisation, stored separately, invoiced or receipted under the approved tax
policy, and never deducted from the Prepaid balance. Call it a `top-up service
fee`; do not relabel a prohibited payment-method surcharge.

The first fee policy supports a percentage and optional minimum without fixing
either commercial value in source:

```text
raw fee       = credit principal * configured rate
service fee   = max(configured minimum, round_to_cents(raw fee))
total payable = credit principal + service fee
```

Funding is credited only after authoritative processor settlement. Pending,
failed, duplicated, reversed and disputed funding remain explicit. A settled
processor event posts the credit principal once; its fee and any processor cost
remain separate economic facts. Regulatory balance limits aggregate across the
stable legal customer before the credit is accepted.

**Gate:** the quoted total, processor charge, ledger postings, customer credit,
fee document and reconciliation agree for ordinary, minimum-fee, retry,
duplicate, reversal and threshold-boundary cases.

### Package 4D — Managed x402 Call

Use the existing Call record as the durable Call identity. Customer views
project that same record. Do not introduce an acquisition record, finance-ready
purchase or universal receipt object.

Expose one deep managed-Call module through the existing Tool, Quote and Call
actions. Its recommended public flow is:

```text
registry.tools.search
  -> tool.quote -> Quote
  -> tool.call -> result

only when required:
  call.status | call.cancel | call.reconcile
```

Search returns one to three compact candidates with no full schemas, repeated
navigation or caller-specific money state. Public detail, comparison, whoami and
balance remain optional reads. Authenticated `tool.quote` accepts the
Tool reference, literal input and bounded caller constraints, then combines
the selected Tool's material detail with current caller viability, effects,
data use, Seller and Provider, exact or maximum all-in AUD price, expiry, agent budget and permitted shared-balance impact, evidence provenance,
material unknowns and the quote bound to the normalised input digest. It
uses bounded readiness evidence and performs no search-time Provider fan-out.
Stale evidence blocks a Quote and returns one bound re-quote or status
continuation with a recommended next observation time. Call accepts the
Quote and caller idempotency key. It does not
accept an `accountRef`, wallet, treasury pool, exchange rate, ledger instruction
or x402 payment payload from the customer.

The controlled path is:

```text
quote exact Tool and normalized input
  -> receive and validate x402 challenge
  -> calculate one expiring all-in AUD Call price
  -> bind the quote
  -> accept that Quote and revalidate material facts
  -> atomically reserve agent budget, customer-wide exposure and AUD
  -> create/sign upstream payment from corporate USDC
  -> retry the exact paid request once under the Call
  -> verify response and settlement evidence
  -> capture, release, or retain an explicit unknown reservation
  -> project the Call
```

Use maintained x402 protocol packages for challenge and payment semantics. The
product owns validation, pricing, idempotency, accounting and recovery around
the protocol; it does not reimplement x402.

One locked price is calculated before reservation:

```text
upstream AUD basis = upstream USDC amount * executable AUD/USDC rate
all-in AUD price   = round_to_micro_AUD(versioned pricing policy(upstream basis))
```

The quote stores the source amount and units, network and asset, executable FX
rate, source, timestamp, expiry, pricing-policy version, rounding mode and final
AUD amount. A customer never receives an FX adjustment after the Call. A stale
or materially changed challenge requires a fresh bound quote, including its
price, inputs, terms and spending checks.

Reservation is a ledger transfer from available to reserved. On verified
success it is captured into the buyer sale; any unused amount is released. A
definitive pre-payment or delivery failure releases it. An ambiguous dispatch or
settlement retains an explicit unknown reservation until reconciliation proves
capture or release. Retry never creates a second upstream payment or Charge.

Every action has one compact result shape authoritative for its observation
time. `tool.call` returns literal output when available; otherwise it returns
the durable `callRef`, current public state, recommended next observation time
and at most one exact continuation. `reconciliation_required` never offers
`tool.call`. Status accepts `afterVersion`; an unchanged read returns only
`callRef`, version and retry timing, while a changed read returns the
current bounded delta rather than full history.

**Gate:** one deterministic end-to-end sandbox path proves funding, quote,
reservation, x402 payment, usable result, capture and Call projection; the same
Call also proves duplicate replay, challenge drift, Provider failure,
process loss and unknown-outcome recovery. A fresh agent process completes and
recovers the Call using only the generated action contract and durable
references, without inspecting a human dashboard or coordinating internal
money/protocol steps.

### Package 4E — Corporate USDC treasury

Maintain one pooled treasury position for each custody wallet, network and
asset. The projection separates confirmed units, committed units, pending
outflows, network buffer and spendable capacity:

```text
spendable = confirmed - committed - pending outflows - network buffer
coverage  = spendable / admitted near-term upstream exposure
```

- Replenishment is operator-approved and manual in the first production design.
- Monitoring, custody ingestion, matching, reconciliation, low-coverage alerts,
  Call admission and incident evidence are automated.
- A Call is not admitted unless both the customer's AUD reservation and the
  correct network treasury capacity succeed.
- Customer liability and treasury adequacy are monitored separately. AUD credit
  is not described as USDC-backed and treasury units are never allocated to a
  customer.
- Record acquisition basis, custody location, beneficial ownership, transaction
  hash, facilitator/payment reference, network fee and settlement finality for
  each treasury movement.

The single-pool design is load-tested before launch. The operational playbook
for the later multi-pool path must define the measured trigger, new-pool
provisioning, deterministic allocation, rebalancing, draining and rollback.
Sharding is implemented only when measured Convex contention, confirmation
latency, network separation or replenishment operations justify it.

**Gate:** reconciliation detects missing, duplicate, delayed and unexpected
custody movements; insufficient or stale capacity blocks new paid Calls without
corrupting customer balances; one external x402 testnet canary proves the real
protocol and settlement boundary.

### Package 4F — Calls, Usage and Spend

Build a dedicated, rebuildable Call read model from the existing execution record, service,
usage, buyer-price, settlement and automatically observed delivery/recovery
facts. The main table follows the
familiar OpenRouter shape: time, service, Provider, Account/application,
usage, cost, status and latency. Detail views add quote, attempt,
settlement, evidence, recovery and business-allocation references without
putting prompts, secrets or full results into the financial ledger.

Provide three projections over the same Calls:

- **Logs:** individual Calls, timing, routing, outcome, attempts and latency.
- **Usage:** consumed quantity and unit by service, Provider, Account,
  application and time.
- **Spend:** captured AUD price, adjustments, effective unit cost, service-fee
  totals, Provider concentration and reconciliation state.

Provide two permissioned scopes over those projections:

- the agent can read its own Calls, current allowance, remaining
  aggregate budget and permitted shared-balance facts across credential
  rotation; and
- the customer can read the full Account and attribute spend,
  concurrency, failures and recovery to each agent and credential.

Build Account-scoped, rebuildable operational evidence from facts Package 4
already observes: delivery and paid-non-delivery counts, latency, realised AUD
charge, payment state and recovery incidence. Keep facts provenance-labelled;
do not collapse them into a quality score or use them for automatic allocation
in Package 4. Outcome reporting and outcome-derived allocation aggregates
remain deferred until a demonstrated repeat-selection or evaluation consumer
justifies the additional action and retention.

Technical completion, upstream settlement, purchase resolution and usefulness
remain separate. Metrics are recalculable; they are not additional ledger
entries or a second source of truth.

**Gate:** every displayed value traces to retained source facts and projection
rebuilds are deterministic, replay-safe and paginated for large histories;
another Account's activity cannot leak, and no unproved usefulness claim enters
Quote or ranking.

### Package 4G — Documents, adjustments and reconciliation

- Produce immutable funding receipts and top-up service-fee documents under the
  effective tax policy.
- Produce a period statement and, where approved, an aggregate tax invoice for
  captured Calls. Sum six-decimal Call amounts first, then round the document
  total once to cents and record any explicit rounding adjustment.
- Keep tax timing configurable until Australian advice determines ordinary
  prepayment, Division 100 or another precise treatment. Never invoice GST twice
  merely because both funding and Calls are visible.
- Model refunds and corrections as linked adjustment/reversal transactions and
  immutable adjustment documents.
- Reconcile processor, bank, customer-liability control, corporate USDC custody,
  x402 settlements, issued documents and accounting exports. Differences become
  owned cases; no repair directly edits a balance.
- Export versioned proposed general-ledger mappings. Agentic Economy remains a
  product subledger, not the general ledger or the customer's final accounting
  authority.

For a document period:

```text
exact net Calls     = sum(captured Calls) - sum(linked adjustments)
document total      = approved_round_to_cents(exact net Calls)
rounding adjustment = document total - exact net Calls
```

**Gate:** funding, Calls, adjustments, statements, tax documents and every
external money source reconcile to immutable ledger transactions for the same
period, including sub-cent volume and late adjustment cases.

### Package 4H — Provider obligation and later evidence adapters

Record the Provider obligation separately from the buyer Charge and from its
USDC settlement. Preserve accrued, held, payable, settled, reversed and disputed
states so Package 5 can operate Provider readiness and later payout workflows
without rewriting the buyer ledger.

After the managed Call is complete, add external-observation adapters only when
a real source requires them. Follow the reconstruction research for OTLP,
CloudEvents, FOCUS, UBL and PINT A-NZ boundaries. Imported evidence retains its
native identity and provenance; it does not become a controlled Call or
canonical service by correlation alone.

**Gate:** the managed x402 lane needs no external reconstruction adapter to
close, and the first later adapter can join evidence without changing the Call,
Call, ledger or service identities.

### Exact-money premortem

| Failure | Detection | Required control and proof |
| --- | --- | --- |
| Floating-point contamination | Property tests find non-integral or drifting units | `bigint` at rest and in domain operations; `decimal.js` only at named conversion boundaries; search guard for money arithmetic. |
| FX rate inverted, stale or mismatched | Quote recomputation and bounds checks fail | Typed base/quote units, executable-rate source, timestamp, expiry and sanity bounds; golden vectors for both rate directions. |
| Wrong token decimals or network | Challenge validation differs from admitted service | Official x402 parsing plus allowlisted network/asset/decimals; reject before reservation or signing. |
| Challenge changes between Quote and Call | Material digest or amount differs | Bind the accepted challenge and all-in price to the Quote; require a fresh decision. |
| Minimum-fee threshold rounds incorrectly | Boundary vectors disagree by one cent | Central fee policy using decimal arithmetic; test below, at and above the crossover and half-cent boundaries. |
| Service fee reduces credit | Funding reconciliation differs from requested principal | Separate principal, fee and total fields and postings; invariant that settled credit equals principal exactly. |
| Per-Call rounding loses or creates money | Document total differs from ledger sum | Store six-decimal AUD Calls, sum exactly, round only at approved document/payment boundaries, post explicit residual. |
| Duplicate processor, x402 or webhook event | Same external identity appears twice | Unique idempotency scope and atomic existing-result return; replay and collision tests. |
| Concurrent Calls overspend AUD or USDC | Available or spendable projection becomes negative | Reserve both resources through serialized/OCC-safe commands; high-contention tests with one expected winner set. |
| USDC settles but AUD remains reserved | Reconciliation sees settled payment without terminal capture | Durable unknown state and recovery command keyed by Call/payment identity; no blind retry. |
| AUD captures without upstream settlement | Sale exists without verified settlement/delivery basis | State-transition preconditions and reconciliation alert; adviser-approved remedy path. |
| Custody data is delayed or reorged | Confirmed position disagrees with chain/custodian | Finality policy, pending state, confirmations and capacity buffer; never infer finality from request success. |
| Depeg, FX movement or network fee removes margin | Realised unit economics breaches policy | All-in quote with versioned margin/buffer, exposure and loss metrics, treasury stop-loss/escalation policy. |
| Refund exceeds original sale or repeats | Linked net adjustment is outside original captured amount | Remaining-refundable projection, atomic decrement and idempotent adjustment identity. |
| GST is recognised twice | Funding and Call documents claim the same taxable amount | One effective-dated adviser-approved tax policy and cross-document reconciliation invariant. |
| Cross-currency netting hides imbalance | A transaction contains AUD and USDC balancing lines | Balance per currency/asset; conversions are linked same-identity transactions, never mixed postings. |
| Unbounded numeric input causes resource exhaustion | Parser receives excessive digits/exponents | Strict amount grammar, maximum digits/scale and policy bounds before `bigint` or decimal construction. |

### Agent-operability premortem

| Failure | Consequence | Required control and proof |
| --- | --- | --- |
| Agent must join identity, balance, budget and Call state itself | More context, more round trips and inconsistent decisions | Auth resolves the Account; `tool.quote` returns the material caller snapshot. Self and balance remain optional diagnostics. |
| Credential rotation resets spend | An agent evades limits and loses continuity | Budget and history aggregate by agent; credential remains evidence only; rotation test preserves exposure and Calls. |
| Quote is stale at effect time | Agent acts on a price, Tool or spending policy that no longer applies | Quote digest and expiry plus consequence-time revalidation; drift refuses before effect and returns a fresh-Quote continuation. |
| Response says what failed but not what is safe next | Agent guesses, retries blindly or needs a human | Closed reason codes plus at most one bound machine continuation and one optional owner handoff. Manifest-owned consequence metadata is not repeated. |
| Status polling repeatedly returns full history | Context and bandwidth grow with Call age | `afterVersion`, a bounded unchanged response, current-state delta and recommended next observation time. |
| Treasury detail leaks into buyer decisions | Agent becomes coupled to custody and protocol implementation | Expose `ready`, `not_ready` or `stale` plus remediation; keep wallet, pool and signing detail operator-only. |
| Payment or delivery is treated as usefulness | Future service comparison learns the wrong lesson | Keep settlement and conforming delivery as separate observed facts; defer usefulness reporting and allocation until a real consumer exists. |
| One opaque rank hides alternatives | Agent cannot trade price, latency and risk for its actual gap | Apply hard constraints first; expose scoped facts, unknowns and exclusions; make policy version inspectable. |
| Future feedback captures project context | Accretion becomes surveillance and increases liability | Do not ship buyer outcome collection in Package 4; any later contract must remain bounded and reject prompt, plan, file or chain-of-thought fields. |
| Agent must open a human dashboard to recover | Headless operation stops at the first exception | Every handoff has a durable status ref; machine status continues while the customer completes any required owner action. |

### What already exists

Retain and port the proven behaviours, not the present data model:

- the current `money` module boundary and Convex authentication/authorisation
  entry patterns;
- exact integer-string parsing and official x402 conversion utilities in
  `src/modules/money/internal/exact-amount.ts`;
- reservation, finalisation, release, unknown-outcome, recovery, idempotency and
  concurrency test scenarios across the existing `convex/money*.ts` suite;
- current Call, quote, service and authority identities;
- existing action descriptors, continuation IDs, agent self-inspection,
  generated agent skill/site manifest and status/recovery actions;
- Convex transactions, optimistic concurrency and File Storage for immutable
  document/evidence artifacts; and
- existing route, table, pagination and query patterns where they satisfy the
  new Call projection.

Replace the present unbalanced top-up, same-currency brokered-charge assumption,
money schema and derived activity view. Remove the replaced path in the same
slice. Do not preserve compatibility tables, dual-write, fallback reads or old
API shapes.

The source change map is:

| Current source | Package 4 treatment |
| --- | --- |
| `src/modules/money/internal/convex-schema.ts` | Replace the existing money table set with immutable transactions/postings, policy records, customer balance projections, funding commands, reservations, treasury positions, settlement evidence, reconciliation cases and Call projections. This is a clean schema cutover. |
| `src/modules/money/internal/ledger.ts` and `ledger/*` | Gut and port proven exactness and transition behaviour into the separated `ledger/` responsibilities above. Delete the displaced implementation. |
| `convex/moneyLedger.ts` | Retain as a thin public/internal Convex entry surface; move business transitions into the money module. Do not let it become the new god file. |
| `convex/moneyCreditTopup*` | Replace credit-only application with principal, service-fee, settlement, reversal and reconciliation transactions. Port replay and unknown-outcome behaviour. |
| `convex/moneyExternalSpend*` and `convex/moneyChargeBrokered.ts` | Replace the external-spend/same-currency model with the managed x402 reservation and capture state machine. Port its concurrency and recovery tests. |
| `convex/moneyX402Payment*` | Retain protocol-attempt identity and evidence concepts; adapt them to corporate treasury commitment and the official x402 paid-retry path. |
| `src/modules/money/internal/exact-amount.ts` | Retain exact integer amount primitives, add six-decimal AUD and bounded conversion/rounding operations, and cover all public arithmetic with vectors and properties. |
| `src/modules/money/{public,server,money.functions}.ts` | Publish the new funding, balance, Call and recovery contracts only. Breaking replacement is intentional; no compatibility export remains. |
| `src/modules/agent-access/account.actions.ts` | Replace USD credit/activity shapes with authenticated operating context: resolved Account, durable agent, spending policy generation, caller-visible AUD balance, own remaining limits and funding handoff. Never accept an Account override. |
| `src/modules/money/internal/credential-budget.ts` and authority admission | Move aggregate reservation identity from credential to durable agent and add principal-wide exposure; retain credential and spending policy generation as evidence. |
| `src/modules/capability-execution/{call-entry.ts,quote.actions.ts,call.actions.ts,call-recovery.actions.ts}` | Current source implements `tool.quote`, `tool.call` and Call status/cancel/reconcile descriptors with one compact result, bound continuation, optional owner handoff and version-aware status. Package 4 release gates still cover the managed financial and recovery journeys; outcome reporting remains deferred. |
| `src/modules/discovery/internal/{agent-skill,page-markdown,site-manifest}.ts` | Generate the accepted Tool/Quote/Call action sequence, response versions, retry rules and human-handoff semantics from canonical descriptors rather than maintaining separate prose. Served discovery is source evidence, not hosted deployment proof. |
| `src/modules/capability-execution/managed-call/` | Add the deep application module that coordinates existing market, authority, Call, money, treasury, x402 and evidence interfaces. Keep each state machine in its owning module; this coordinator contains ordering, not duplicated truth. |
| `src/routes/{api.v1.tools.quote.ts,api.v1.tools.call.ts,api.v1.calls.ts,api.v1.calls.$callRef.ts,api.v1.calls.$callRef.cancel.ts,api.v1.calls.$callRef.reconcile.ts}` | Current source provides thin authenticated Quote, Call and Call-recovery HTTP entries into the managed-Call module; these routes own no policy, money arithmetic, protocol semantics or lifecycle transitions. |
| `src/routes/_operator/activity.tsx` and `src/routes/api.v1.account.activity.ts` | Replace the derived activity feed with paginated Logs, Usage and Spend queries over the dedicated Call read model. |
| Existing money, x402 and route tests | Preserve acceptance intent; rewrite fixtures and expectations around the new schema and add exact-money, dual-reservation, fresh-process continuation, credential-rotation, context-bounded response, reconstruction and document proofs. |

### Verification and test coverage

```text
                         PACKAGE 4 PROOF
                                |
          +---------------------+----------------------+
          |                     |                      |
      exact money          state machines         external edges
          |                     |                      |
  vectors/properties    model + concurrency    processor sandbox
  balance invariants    replay + recovery      x402 testnet canary
          |                     |                      |
          +---------------------+----------------------+
                                |
                    deterministic managed Call E2E
                                |
                  funding -> quote -> reserve -> pay
                    -> result -> capture -> Call
                    -> statement -> reconciliation
```

The durable test plan is
[`joelchan-main-eng-review-test-plan-20260901-230934.md`](/Users/joelchan/.gstack/projects/CreasyBear-Agentic-Economy/joelchan-main-eng-review-test-plan-20260901-230934.md).
Execute the narrowest tests per slice, then the full money invariant,
concurrency and end-to-end suite. Keep the external testnet canary separate from
deterministic CI; it proves integration health and must never be the only proof
of accounting correctness.

The agent interface is a first-class test surface. Contract tests must prove the
four journeys: cheapest successful Call, insufficient balance or authority,
material terms drift before effect and unknown payment/delivery after
submission. For each journey record round trips, serialized bytes,
caller-supplied fields and stale-state windows. A fresh process must resume from
`callRef`, and every refusal must expose no more than one valid machine
continuation plus an optional owner handoff. Do not couple interface tests to
internal ledger or x402 record layout.

The contract budgets, excluding literal service output and the generated
manifest, are: search with three candidates at most 3 KB JSON; Quote at most
4 KB; unchanged status at most 512 bytes; refusal or uncertain result at
most 1 KB. Generated tool schemas may grow by no more than 20% over the measured
pre-Package 4 baseline; exceeding that budget requires deleting optional fields
or choices before adding another response mode.

### Performance and operability

- Index journal and Call reads by Account plus stable sequence/time, and by
  external idempotency, Call, quote and settlement identities.
- Page Call histories and stream/export large statements; never load an entire
  account history to calculate a balance.
- Keep writes narrow enough for Convex optimistic concurrency. Measure conflict
  retries, reservation latency and treasury-pool contention under burst load.
- Build balance and analytics projections incrementally, with a deterministic
  rebuild and checksum path.
- Instrument funding lag, quote expiry, reserve latency, paid retry latency,
  unknown age, reconciliation age, treasury coverage, rejected admission,
  margin leakage and document-close duration.
- Provide runbooks for unknown payment, balance mismatch, stale custody data,
  low treasury, processor reversal, compromised treasury credential and
  reconciliation difference.

### Parallelisation

Packages 4A through 4E are sequential because they share the commercial and
money authority. Once 4E freezes the ledger and Call contracts, 4F read models
and 4G document projections may proceed in parallel with distinct file
ownership. Only one owner may change the schema, journal writer or invariants in
a slice. Package 4H follows the stable core. Parallel work must not introduce
competing balance calculations or duplicate state machines.

### NOT in Package 4

- Customer crypto wallets, token balances, exchange, transfer, cash-out, yield,
  general payments or customer-directed addresses.
- Postpaid credit, negative balances, loans or Calls admitted before both AUD
  and treasury capacity are reserved.
- Automated USDC acquisition or speculative treasury trading. Package 4 writes
  the operator-approved replenishment playbook and evidence boundary only.
- Multiple treasury shards before the documented measured trigger occurs.
- A new tracing SDK, Collector, universal event envelope, receipt protocol,
  general ledger, tax engine, workflow framework or generic ledger product.
- External acquisition reconstruction as a release dependency.
- Production customer funding or mainnet settlement before Australian launch
  gates are signed.

### Package 4 completion gate

Package 4 completes when the managed x402 start line passes as one system:

1. a sandbox customer funds an AUD Prepaid balance and pays a separately stated
   top-up service fee without reducing the credited principal;
2. `tool.quote` produces a caller-bound Quote with an expiring
   all-in AUD Call price, and Call reserves agent budget,
   principal-wide exposure, AUD and corporate USDC capacity before dispatch;
3. one controlled Call completes an x402 paid retry and returns a usable
   result without a customer wallet;
4. success, definitive failure and unknown outcome produce correct balanced,
   replay-safe and recoverable entries;
5. Logs, Usage and Spend show the same Call from a rebuildable read model;
6. customer statement, funding document, aggregate Call invoice or approved
   equivalent, treasury evidence and accounting export reconcile;
7. deterministic CI and the external x402 testnet canary pass;
8. burst tests prove no AUD or USDC overspend and establish the single-pool
   operating envelope; and
9. credential rotation preserves agent budget and history, while
   concurrent credentials cannot bypass agent or principal exposure limits;
10. a fresh agent process can operate and recover the complete Call from stable
    contracts and references without a dashboard, wallet, `accountRef`, treasury
    choice or blind retry;
11. search, Quote, Call and recovery remain within the recorded
    round-trip, payload and caller-input budgets without requiring self, balance,
    public detail or comparison on the successful path; and
12. every production money path remains disabled until its Australian legal,
   tax, accounting and operational approval is current.

## 5. Provider operations — implemented locally, release gated

Package 5's source implementation is complete on `main`: source-native preview for OpenAPI, MCP, Agent Plugins 1.0 and x402; durable Provider connections; one admission-controlled publication path; one eight-state Tool lifecycle projection; current health/delivery/Qualified Use evidence; and paged, routeability-first Provider offboarding. The former Offering-first editor, manual source JSON, separate readiness/test/promotion ceremonies and 100-Offering fleet ceiling have been removed from the golden path.

This describes the landed Package 5 core baseline, not a claim that every
connection-return branch is correct. Subsequent review found handoff and resume
defects; their current working-tree corrections are uncommitted, with focused
local verification recorded in the [transition review addendum](./PACKAGE-6-REVIEW.md#provider-handoff-and-recovery-transitions-source-and-focused-tests-verified).
That later local evidence is not a deployed or native-client release result.
The recorded 2026-09-04 changed-cone run was 505 passed and 3 failed across 61
files, with the failures attributed in the Package 5 plan to concurrent work.
It is historical local evidence, not a fresh green repository or staging run.

Release credit remains gated on one staging revision proving all four source families through normal Provider admission and buyer `registry.tools.search → tool.quote → tool.call`, deployed Infisical-backed credential rotation/revocation, active-case backup restoration, packaged CLI and actual supported clients. Production paid supply also remains gated by Package 4.



### Package 5A — Provider onboarding

- Eligibility and fit check.
- Supported source types.
- Required connection setup.
- Admission expectations.
- One clear starting action.

<a id="package-5b--operation-lifecycle-management"></a>

### Package 5B — Service lifecycle management

- Draft.
- Needs setup.
- Submitted.
- Under review.
- Published.
- Paused.
- Action required.
- Retired.

### Package 5C — Operational health

- Connection failures.
- Validation failures.
- Publication blockers.
- Stale service data.
- Corrective actions.
- Provider-facing incident information.
- Verified paid non-delivery and useful-outcome records with sample size,
  recency and provenance.
- Removal from routeability when current contract, authority, readiness or
  evidence expires, fails, is withdrawn or materially drifts.

### Package 5D — Provider offboarding

- Unpublish services.
- Revoke connections.
- Resolve outstanding calls.
- Complete payout obligations.
- Explain retained records.

Package 5 consumes Package 4 evidence for health, delivery, earnings and payout
visibility. Observed external demand may guide which Provider lanes are
prioritised, but it does not replace self-serve Provider operations.

If an admitted service streams, its lifecycle must distinguish upstream
acceptance, Charge capture, bytes or units delivered, completion, disconnect and
remedy. Payment or stream acceptance cannot imply useful delivery. No general
streaming platform is required before such a service exists.

## 6. Onboarding, content and language — planned

### Package 6A — Agent onboarding

- Value proposition first.
- One recommended installation path.
- First successful connection.
- Progressive disclosure for alternatives.
- Troubleshooting and verification.

### Package 6B — Provider onboarding content

- Simplify the public Provider page.
- Move protocol details into documentation.
- Explain time, requirements and outcomes.
- Continue onboarding after sign-in.

### Package 6C — Product language system

Apply the familiar canonical terms in [CONTEXT.md](./CONTEXT.md):

- customer, agent and account;
- spending policy, permissions and limits;
- service or Tool as appropriate to the context;
- quote, price and terms;
- Call, result and purchase status;
- Provider, Seller and payment recipient where responsibility matters; and
- credit, charges, refunds, earnings and payouts.

Use direct actions such as connect, add credit, publish, pause and check status.
Do not require users to learn commercial closure or protected protocol terms.
Preserve the underlying distinctions and existing technical identifiers;
language work is not permission to weaken controls or introduce a second API.

### Package 6D — Contextual guidance

- Empty-state guidance.
- Inline explanations.
- Clear corrective actions.
- Advanced diagnostics behind disclosure.
- Consistent success and failure wording.
- Durable, resumable next actions where human authority or evidence is required;
  the product must not return an instruction that disappears with the current
  session.

## 7. Trust, legal and data governance — planned

### Package 7A — Privacy maturity

- Data categories and purposes.
- Analytics and subprocessors.
- Retention periods.
- User rights.
- International transfers.
- Contact and controller information.
- Deletion and export behaviour.

### Package 7B — Terms maturity

- Agent-authorised spending.
- Provider responsibilities.
- External execution boundaries.
- Payments, refunds and disputes.
- Platform responsibility.
- Suspension and termination.
- Liability and acceptable use.

### Package 7C — Trust centre

- Security practices.
- Data handling.
- Subprocessor list.
- Payment model.
- Provider verification.
- Incident contact.
- Vulnerability reporting.

### Package 7D — Account and data lifecycle

- Data export.
- Account deletion.
- Credential revocation.
- Remaining credit.
- Unresolved calls.
- Retained financial and audit records.

The commercial mode determines which responsibilities apply to an acquisition;
it does not remove the need for one coherent platform governance system.

## 8. Support and operational visibility — planned

### Package 8A — Support system

- One visible support entry point.
- Copyable request references.
- Issue categorisation.
- Expected response times.
- Safe diagnostic submission.

### Package 8B — Status and incidents

- System-status surface.
- Component-level health.
- Incident communication.
- Degraded-service wording.
- service comparison and history.

### Package 8C — Notifications

- Low credit.
- Access compromise.
- Connection failure.
- Publication blocked.
- Payout problem.
- Unknown Call outcome.
- Channel and frequency controls.

### Package 8D — Internal observability

Trace important events across:

- Account;
- human actor;
- Agent access;
- service;
- Call;
- payment;
- Provider connection; and
- external execution.

Provide one joined operational view over the complete journey:

- demand with no viable candidates;
- candidates blocked by readiness, connection or authority;
- stuck or uncertain Calls;
- settlement discrepancies, refunds and payout failures;
- outbound event delivery attempts; and
- intervention, recovery and eventual user outcome.

Asynchronous continuation uses stable event identity and sequence, signatures,
verified endpoints, retained attempt history, bounded secret overlap and manual
replay. At-least-once and unordered delivery must not duplicate the underlying
Call or financial effect.

Package 8 uses the Package 4 evidence identity and reconstruction trail so
support and operators can diagnose one problem without rebuilding its history.

## 9. Developer and integration surfaces — planned

### Package 9A — Discovery surface repair

- Productise the canonical developer-discovery experience proved in Package 4;
  do not redesign its lifecycle or response semantics.
- Restore missing or outdated content.
- Keep downloads and schemas synchronised.
- Repair drift between implementation and tests.
- Project caller-specific viability as `executable_now`, `setup_required` or
  `unavailable`, with the bounded reason and next valid action.
- Keep canonical market facts common while considering current Account,
  authority, balance, service scope and required Provider connection.
- Co-locate the machine-readable descriptor and next action on the exact human
  service page.

### Package 9B — Integration documentation

- Recommended setup.
- Authentication.
- Discovery.
- Calling.
- Errors and refusal.
- Idempotency.
- Receipts.
- Versioning.
- Supported evidence ingestion and export profiles.
- The exact Quote-to-Call contract, including drift and expiry refusal.
- Explicit sandbox limitations and the production evidence required for claims
  about payment, delivery, payout and recovery.
- Generated API, MCP and CLI examples from the same action descriptors and
  bound continuations, including version-aware fresh-process recovery and owner
  handoff.

### Package 9C — Integration diagnostics

- Connection verification.
- Credential validation.
- Read-path status.
- Actionable error messages.
- Safe request references.
- Evidence-source and adapter status.
- Diagnostics that identify which inspected fact drifted when Call is
  refused before dispatch.
- Cross-surface conformance proving that HTTP, MCP and CLI return the same
  canonical facts, reason codes, retry classes and durable references.

Package 9 broadens and documents the standards-based boundaries and agent
operating contract proved by Package 4. It does not introduce a proprietary
tracing, billing or invoice contract or a transport-specific lifecycle.

## 10. Experience quality — planned

### Package 10A — Responsive behaviour

- Fix current mobile market overflow.
- Audit tables and filters.
- Audit inspectors and dialogs.
- Audit settings and Provider management.
- Reduce excessive public-page length.

### Package 10B — Accessibility

- Keyboard navigation.
- Focus management.
- Status announcements.
- Error summaries.
- Zoom and reflow.
- Reduced motion.
- Contrast.
- Accessible tables and dialogs.

### Package 10C — Performance

Establish budgets for:

- public first load;
- authenticated navigation;
- market search;
- large Call and record histories;
- Provider workspace; and
- slow-network behaviour.

### Package 10D — Visual consistency

- Hierarchy and density.
- Empty and degraded states.
- Mobile information order.
- Footer compression.
- Consistent action prominence.

Avoid a broad visual redesign until the information-architecture packages are
complete. Package 10 provides the platform-wide proof, while each earlier
package remains responsible for the quality of the surfaces it ships.

## Commercial responsibility overlay

The modes help check capability coverage without changing the roadmap:

| Mode | Primary package coverage |
| --- | --- |
| Observe | Authority and attribution from Package 3; records and analytics from Package 4; onboarding, data handling, support, integrations and quality from Packages 6–10. |
| Control | Package 3 authority; Package 4 records and money; Package 8 recovery; Package 9 integration contracts; Package 10 quality. |
| Broker | Packages 3–5 for authority, records, money and Providers; Packages 8–10 for recovery, integration and experience. |
| Resell | Packages 3–5 and 7–10, including separate buyer and Provider financial legs, documents, remedies, payouts and governance. |

A capability can support more than one mode. An observed acquisition does not
become an Agentic Economy-controlled Call or canonical service merely
because the same platform can display both.

## Mature-platform completion standard

The roadmap reaches its destination when:

1. a buyer can connect an Agent, observe or acquire outside services, understand
   the resulting activity and recover from supported failures;
2. a fresh agent process can discover, obtain a Quote, Call, monitor and recover from
   stable machine contracts while minimising context, external calls and spend;
3. a Provider can connect, publish, maintain and withdraw Tools, resolve
   delivery issues and receive attributable payouts;
4. an external integrator can discover and use supported contracts without
   founder guidance;
5. finance can follow applicable service use through cost, documents, payment
   and accounting handoff without rebuilding the evidence chain;
6. support can diagnose and resolve declared stuck states without raw database
   mutation or blind retry;
7. authority, service identity, commercial roles, delivery, money and remedy
   remain independently attributable;
8. privacy, data lifecycle, platform terms, accessibility, responsive behaviour,
   performance and reliability are operated capabilities; and
9. the supported journeys meet the familiar reference behaviour, including
   changes, failures, recovery and offboarding, without founder guidance or
   unnecessary AE-specific concepts.

Current acceptance still needs an immediately useful service result, an operable
Provider delivery and payout path, and workable net economics for the supported
lane. Deferring differentiation does not defer those practical proofs or any
package's live release evidence.

### Later market learning — not a maturity closeout gate

After the familiar platform works, evaluate one narrow category against the
following longer-term hypotheses. These do not require a differentiated market
mechanism, Provider switching or a unique data advantage before current-stage
closeout:

- an unfamiliar capability gap reaches Agentic Economy from more than one
  harness;
- at least two independent, currently routeable services are genuinely
  comparable on their declared unit and outcome;
- the selected service returns an immediately useful contribution rather
  than merely a completed response;
- a later comparable need returns through Agentic Economy as a justified repeat
  selection or Provider switch;
- bypass after first discovery is measured rather than assumed absent;
- at least one Provider receives incremental demand and can operate the resulting
  delivery and payout; and
- the complete lane shows workable net economics.

The starting-line gate proves that the first useful record can exist. The full
roadmap proves that Agentic Economy is a mature platform.

## GSTACK REVIEW REPORT

Historical engineering review retained verbatim below. Its implementation names
and plan-level verdict are not a new status assessment. The maturity-first
product direction and terminology above govern current product work.

**Verdict:** Package 4 is implementation-ready as a sequential product slice.
It now starts with the managed x402 Call that creates the product, while retaining
the accounting, treasury, evidence and supplier-obligation foundations required
for a mature platform. The prior observability-first plan is preserved as a
later adapter path rather than discarded.

**Architecture:** Pass with explicit production gates. The stable spine is
Operation -> Commitment -> Invocation -> Call. Customer AUD and corporate USDC
are separate balanced legs joined only by commercial identity. Convex remains
the transactional system of record; projections are rebuildable. The current
money implementation is replaced cleanly behind its existing module boundary,
with no compatibility layer and no god file. The agent sees one deep managed-
Call interface; the internal planes remain separately owned and joined by
stable references.

**Engineering quality:** Pass. The plan reuses official x402 semantics, Convex
transactions/OCC, File Storage and existing tested state-machine behaviour. It
adds only one approved arithmetic dependency, `decimal.js`, at conversion and
rounding boundaries. It reuses existing action descriptors, generated machine
discovery and safe continuations. New abstractions are limited to the real
managed-Call coordinator and its interface tests.

**Tests and performance:** Pass at plan level. The coverage diagram, durable test
plan, exact-money premortem, deterministic end-to-end proof, external testnet
canary and single-pool burst test cover the material correctness and operating
risks. Implementation must report measured contention, latency and pool capacity
before production; passing unit tests alone is insufficient.

**Outside review:** Architecture review identified balance/payment conflation,
unbalanced top-ups, same-currency assumptions and the derived activity view as
the principal debt to remove. Australian regulatory review identified the
single-Seller fact pattern, PPF/NCP classification, post-1 July 2026 AML/CTF
stored-value rules, GST timing, client-money treatment and the 2027 digital-asset
regime as launch gates rather than software assumptions. Those findings are now
expressed as product controls and signed production gates.

**Decisions locked:** managed x402 first; AUD Prepaid balance; separate top-up
service fee; six-decimal AUD internals; one all-in locked AUD Call price; pooled
corporate USDC; manual replenishment with automated monitoring; BigInt plus
`decimal.js`; Invocation internally and Call in the product; clean gut-and-port;
deterministic CI plus one x402 testnet canary; single treasury pool until measured
sharding triggers; production money disabled pending Australian sign-off.

**Open commercial inputs, not architecture blockers:** top-up fee percentage and
minimum, Call pricing/margin policy, processor, executable FX source, custodian,
supported x402 network/asset and adviser-approved tax treatment remain
effective-dated configuration or vendor selections. None may be hard-coded to
complete Package 4.

**NOT in scope:** customer crypto, transfers or cash-out; postpaid credit;
automated USDC acquisition; speculative treasury management; premature treasury
sharding; a custom x402 implementation; a general ledger, tax engine, tracing
stack or generic workflow framework; external reconstruction as a release
dependency; or any production financial activity before the Australian gates
are approved.
