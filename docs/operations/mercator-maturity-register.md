---
status: active-register
date: 2026-10-05
title: "Mercator maturity register"
owner: "Joel Chan; delivery owners assigned per item"
---

# Mercator maturity register

This is the canonical numbered capability register for Aecon to reach at least
the **evidenced public behaviour of Mercator**. Joel authorised building it on
5 October 2026 (Australia/Perth). It sits under [Wayfinder #256][WF] and
[TODOS.md](../../TODOS.md); those remain the delivery queue. [ADR 0006][B]
owns the dated investigation and proposed architecture, not a competing item
status list. [PRODUCT.md][AE-PRODUCT] and current source retain product authority.

The register is complete as a review artifact; capability parity is **open**.
No runtime direction, payment, permission, credential, publication or deployment
change follows from creating it. Source reviewed: `6bd8d7697` / docs baseline
`d606a92b6`; PRs 357–359 were already merged. The prior safe probes and local
tests are described in ADR 0006. Mercator OpenAPI/docs were refreshed on
5 October 2026 at 22:26 AWST; both hashes match that baseline.

## Integration note — 6 October 2026

This register preserves the 5 October baseline and its open acceptance requirements.
The later accepted buyer-side Plan decision in [ADR 0006][B] and
[Plan Quotes RFC](../designs/2026-10-05-plan-quotes-rfc.md) take precedence over
baseline statements that composition direction is pending or F2 is a prerequisite.
Plans retain frozen per-Node Ceilings and use the existing Call lifecycle; conventional
asynchronous Provider completion remains a separate workstream. PR #362 and the
current release records supply newer implementation evidence, without by themselves
closing this register’s full client, supply and parity acceptance.

## Source reconciliation — 7 October 2026

The [MM-055 implementation record](#7-october-implementation-and-evidence-boundary)
reconciles current source at `3da6013d` plus its working candidate with the dated
baseline. Plan, public CLI and HTTP 202 statements below now reflect inspected
implementation and recorded release evidence. Every full acceptance condition
remains open; this update neither replaces historical receipts nor asserts a
new hosted release.

## How items close

IDs `MM-001`–`MM-060` are permanent. Keep an ID when wording, owner or status
changes; a duplicate points to its retained ID. Number order groups concerns;
dependencies and waves, rather than numbers alone, determine execution order.

Each numbered item has required behaviour, success criteria, an end condition,
current coverage, a responsible area, dependencies, recommended implementation
and direct references. Owners are areas, not invented assignments to people.
Priorities block a parity claim; they do not assert a new production emergency.

- **Coverage:** supported = source implements the stated bounded behaviour;
  partial = only some of it is established; missing = no equivalent inspected
  contract/implementation; unknown = evidence is insufficient. Hosted proof is
  stated separately. Supported source is not a closed customer journey.
- **Disposition:** `open`, `in-progress`, `blocked`, `source-resolved`, `verified`,
  `duplicate` or `rejected`. Initial disposition is **open for all 60 items**;
  existing subcriteria retain their source/local/recorded proof. A blocked item
  names the exact missing decision/access/dependency, not an assumed impossibility.
- **Evidence:** mark marketing, public contract, inspected source, local
  reproduction and recorded/hosted runtime separately. Mercator private internals,
  negotiated Provider agreements, team roles and actual paid reliability are
  unknown unless separately evidenced.
- **Closure:** `verified` requires every success criterion and end condition,
  affected checks and current docs, plus linked exact revision/environment/time
  receipts for the required deployed/client journey. Source-only fixes become
  `source-resolved`; a passing fixture cannot replace a real Provider/client.
- **Whole-goal end:** all baseline/foundation items MM-001–MM-056 are verified, no unresolved acceptance
  failure or material unknown is hidden, and MM-056’s comparable journey/repeat-use
  proof passes. Rails, rewards and embedded surfaces remain required/open for an
  **unqualified literal parity** claim. Only Joel’s explicit recorded equivalent
  or scope decision can alter that target; a deferral is not parity.

Stronger AE actor isolation and commercial correctness are retained. The actor,
organisation and cancellation rows include necessary AE invariants where Mercator
private equivalents are unknown; they are not claims that Mercator lacks them.
The Customer’s harness retains the larger objective, planning and memory.

MM-001–MM-056 cover the Mercator baseline and explicit AE foundation invariants.
MM-057–MM-060 are Joel’s subsequently requested **reuse-first integration**
criteria, not evidence that Mercator exposes A2A, MCP Events or MCP Tasks. Their
integration readiness is recorded separately; a currently unsupported draft
must not force a custom implementation or silently expand a parity claim.
The [ADR reuse-fit matrix][R-FIT] explains supported alternatives and limits.

Closure evidence must record: item ID; approved target revision; named owner;
commit + actual backend/web/client versions; environment and timestamp; procedure
and sanitised result; positive and relevant failure cases; remaining concerns;
docs/check links; reviewer and disposition. Put runtime receipts in the existing
deployment/journey/readiness home and link them here. Never paste secrets or raw
customer/provider payloads into the register. Reopen only the affected item when
contract/release/evidence expiry invalidates its proof; retain earlier receipts.

## Ordered delivery and decision boundaries

| Wave | Outcome / dependency |
| --- | --- |
| F1 | Actors, contracts and usable docs; retain existing authority and protocol work. Initial factual guide already prepared. |
| F2 | Qualify maintained Provider/protocol SDK fit, then connect one conventional async Tool to existing durable Calls/Workpool. Separately qualify Events/Tasks only for their actual supported clients. |
| F3 | Accepted bounded Plan direction is implemented; qualify mapping, authority/price ceilings and useful parallel execution against each open criterion. |
| F4 | Partial/selected/artifact results, history/rerun and separate charge/refund readback. |
| F5 | Entitled heterogeneous supply, actual clients, operational proof and four-persona/whole-task acceptance. |
| Literal | Supported MPP/Tempo/SPT, MACH/Coinflow, incentives, direct wallet and embedded surfaces. Plan separately after owner decisions; retain every gap. |

Use Wayfinder and `/plan-eng-review` on each substantive implementation goal,
reusing its existing approved direction. Prefer official SDKs, standards and
current components. No parallel delivery stream, clone or research branch.
Datadog stays with [#284][DD] / ADR 0005; invitations [#288][I288] and paid chat
[#279][I279] retain their own gates. Historical #196/#185/#187 and ADR 0004 retain
relevant intent; retired #202/#204 do not become current graph implementation.

The accepted Plan RFC settles caller composition, frozen per-Node Ceilings and
existing Call ownership. Remaining decisions concern qualified conventional
Provider SDKs/entitlement, retention and full commercial/remedy requirements,
literal rails/incentives/clients and renderer adoption. Follow the existing
item owners; do not reopen the accepted Plan direction as an unmade decision.

## Numbered index

All items below are initially **open**. The coverage column prevents already
implemented foundations from being mistaken for missing source, while retaining
the exact remaining acceptance.

| Item | Behaviour | Current coverage | Wave | Priority |
| --- | --- | --- | --- | --- |
| [MM-001](#mm-001) | Actor and Account ownership | Supported in source; scoped runtime recorded | F1 | P1 |
| [MM-002](#mm-002) | Organisation membership and administrator controls | Roster/invitation source supported; role change/removal and full journey remain open | F1/F5 | P2 |
| [MM-003](#mm-003) | Stable Agent identity and credential replacement | Supported in source; rotation tests passed | F1/F5 | P1 |
| [MM-004](#mm-004) | Delegated scope, budget, expiry and current authority | Call and bounded Plan authority implemented; full aggregate qualification open | F1/F3 | P1 |
| [MM-005](#mm-005) | Per-client OAuth and bearer authentication | Supported in source and public metadata; client matrix partial | F1/F5 | P1 |
| [MM-006](#mm-006) | Connection and payment readiness | Supported diagnostics; sustained live capacity unproved | F1/F5 | P1 |
| [MM-007](#mm-007) | Revocation, isolation and offboarding lifecycle | Supported in source; combined persona recovery partial | F1/F5 | P1 |
| [MM-008](#mm-008) | Provider identity and upstream credential isolation | Supported in source; heterogeneous hosted proof partial | F1/F5 | P1 |
| [MM-009](#mm-009) | Provider entitlement, terms and commercial roles | Partial; actual provider agreements unknown | F1/F5 | P1 |
| [MM-010](#mm-010) | Task-level discovery | Partial; safe public search reproduced | F5 | P1 |
| [MM-011](#mm-011) | Search constraints, freshness and availability | Partial; unverified/setup-required public results observed | F5 | P1 |
| [MM-012](#mm-012) | Routing quality and comparable task performance | Partial; Mercator benchmarks marketing-only | F5 | P1 |
| [MM-013](#mm-013) | Exact service and endpoint schemas | Supported in source; live Mercator input schema reproduced | F1/F5 | P1 |
| [MM-014](#mm-014) | Provider admission, publication and withdrawal | Supported source funnel; broad hosted activation partial | F5 | P1 |
| [MM-015](#mm-015) | Authoritative Quote and price disclosure | Supported single Tool; free Mercator quotes reproduced | F1/F3 | P1 |
| [MM-016](#mm-016) | Bounded immutable procurement plan | Frozen 1–10 Node Plan implemented; recorded two-Node acceptance, wider proof open | F3 | P1 |
| [MM-017](#mm-017) | Dependency output references and bounded mapping | Plan references/pointers/bounded mapping implemented; hosted mapped proof open | F3 | P1 |
| [MM-018](#mm-018) | Quote-to-plan binding and dependent price ceilings | Plan digest/exact total/per-Node Ceilings implemented; wider qualification open | F3 | P1 |
| [MM-019](#mm-019) | Exact Provider choice and fallback boundaries | Exact frozen Tool release implemented; actual-client fallback proof open | F3/F5 | P1 |
| [MM-020](#mm-020) | Ready-node scheduling and aggregate concurrency | Bounded Plan Workflow scheduling implemented; hosted ten-Node proof open | F3 | P1 |
| [MM-021](#mm-021) | Durable asynchronous admission and recovery | Durable Calls and Plans implemented; conventional async qualification open | F2/F3 | P1 |
| [MM-022](#mm-022) | Conventional provider start/status/result completion | 202 false delivery corrected in source; conventional async completion open | F2 | P1 |
| [MM-023](#mm-023) | Idempotent submission and conflicting replay | Call and Plan run/Node identity implemented; hosted loss/rotation proof open | F2/F3 | P1 |
| [MM-024](#mm-024) | Safe retries, uncertain effects and reconciliation | Supported single Call model; adapter/graph proof partial | F2/F3 | P1 |
| [MM-025](#mm-025) | Status, errors and one useful next action | Call/Plan status implemented; explicit next actions locally qualified | F1/F2/F3 | P1 |
| [MM-026](#mm-026) | Cancellation and irreversible-effect truth | Call cancellation and future-Node Plan stop implemented; hosted races open | F2/F3 | P1 |
| [MM-027](#mm-027) | History, cached recovery and retention | Call history and Plan readback implemented; retention/expiry parity open | F4 | P1 |
| [MM-028](#mm-028) | Explicit rerun and failed-node resubmission | Partial single new Call; graph replay plan missing | F4 | P1 |
| [MM-029](#mm-029) | Partial success and dependent skips | Plan partial outputs/skips implemented; hosted partial-failure proof open | F3/F4 | P1 |
| [MM-030](#mm-030) | Summary, node and JSON Pointer result reads | Partial single result; missing selected aggregate reads | F4 | P1 |
| [MM-031](#mm-031) | Binary outputs and large artifacts | Partial/unknown; equivalent artifact contract not located | F4 | P1 |
| [MM-032](#mm-032) | Funding handoff and authority separation | Supported economic foundation; customer funding journey limited | F1/F5 | P1 |
| [MM-033](#mm-033) | Charge, Provider obligation and receipt allocation | Supported single Call foundation; full commercial/aggregate record partial | F3/F4 | P1 |
| [MM-034](#mm-034) | Refund/remedy lifecycle independent of execution | Supported scoped single Call; aggregate allocation missing | F4 | P1 |
| [MM-035](#mm-035) | MACH funding, Coinflow checkout and Apple Pay | Missing literal parity; AUD capacity is an economic equivalent only | Literal | P1 |
| [MM-036](#mm-036) | Native MPP Tempo customer payment | Missing literal MPP/Tempo parity | Literal | P1 |
| [MM-037](#mm-037) | Stripe shared payment token customer mode | Missing literal Stripe SPT parity | Literal | P1 |
| [MM-038](#mm-038) | Upstream MPP Tempo and x402 Base purchasing | Base x402 supported scoped runtime; upstream MPP missing | F5/Literal | P1 |
| [MM-039](#mm-039) | Public accounting receipt and social card | Partial private receipts; equivalent public card absent | F4/Literal | P1 |
| [MM-040](#mm-040) | Quotas, budgets and service/account fairness | Supported rate limits; composed-work fairness partial | F3/F5 | P1 |
| [MM-041](#mm-041) | Health, correlation and operational observability | Supported/partial; sustained alert proof remains open | F5 | P1 |
| [MM-042](#mm-042) | Recovery, availability and retained evidence operations | Scoped recorded runtime; sustained/joint restore unknown | F5 | P1 |
| [MM-043](#mm-043) | Data recipients, privacy, retention and deletion | Current approved alpha contract; full lifecycle proof partial | F1/F4/F5 | P1 |
| [MM-044](#mm-044) | Payer-proven immutable job and Tool reviews | Partial existing ratings; workflow/node review parity missing | F5/Literal | P1 |
| [MM-045](#mm-045) | Review eligibility, reward and independent settlement | Missing rewarded workflow-review equivalence | Literal | P1 |
| [MM-046](#mm-046) | Browser-bound GitHub/X credit campaigns | Missing social-grant behaviour | Literal | P1 |
| [MM-047](#mm-047) | Curated quick-start suggestions | Partial existing suggestions | F1/F5 | P2 |
| [MM-048](#mm-048) | Product feedback, bug reporting and support | Partial existing support; exact tool handoff unproved | F1/F5 | P2 |
| [MM-049](#mm-049) | Bounded CLI setup telemetry and coarse defaults | Partial/unknown equivalent public telemetry contract | F1/F5 | P2 |
| [MM-050](#mm-050) | HTTP contract and complete machine discovery | Supported generated API; literal metadata paths differ | F1/F5 | P1 |
| [MM-051](#mm-051) | MCP transport, tool envelopes and actual clients | Official MCP source supported; broad installed proof partial | F1/F5 | P1 |
| [MM-052](#mm-052) | Public CLI distribution and integration lifecycle | Recorded public CLI 0.3.1 acceptance; 0.3.2 source/prepared, clean-client proof open | F1/F5 | P1 |
| [MM-053](#mm-053) | Separate local-wallet/direct REST mode | Unknown/missing Mercator-compatible direct payer mode | Literal | P1 |
| [MM-054](#mm-054) | Embedded MCP App and WebMCP discovery | Missing/unknown equivalent embedded surfaces | Literal | P1 |
| [MM-055](#mm-055) | Four-persona docs and generated API reference | Four persona guides and contract repairs in source; renderer/client acceptance open | F1/F5 | P2 |
| [MM-056](#mm-056) | Complete task and repeat-use parity acceptance | Unknown beyond scoped existing payments; full parity not proved | F5 | P1 |
| [MM-057](#mm-057) | Reuse qualification for remote tools and contracted Agents | Partial: maintained SDK candidates identified; exact Provider/client fit unproved | F2/F5 | P1 |
| [MM-058](#mm-058) | ChatGPT MCP Events subscription and signed callback delivery | Missing application surface; official client subset documented | F2/F5 | P1 |
| [MM-059](#mm-059) | Core MCP subscription streams and notification publication | SDK supported; AE tools listChanged false and per-request handler; domain event use unproved | F2/F5 | P1 |
| [MM-060](#mm-060) | MCP Tasks extension qualification and durable Call projection | Draft extension documented; complete maintained adapter/client interoperability unproved | F2/F5 | P2 |

## Item requirements

<a id="mm-001"></a>

### MM-001 — Actor and Account ownership

- **State:** open · Supported in source; scoped runtime recorded. **Priority/wave:** P1 · F1.
- **Owner / dependencies:** Authority / product; none.
- **Required behaviour:** Every action and purchase belongs to one current actor and Account; Customer, Agent, Provider, Seller and payment recipient remain distinct.
- **Success criteria:** Human and organisation contexts resolve uniquely; wrong Account, ambiguous binding and suspended actor refuse before releasing input or value.
- **End condition:** Current source tests plus two-Account hosted read/write negatives and a documented actor model are linked. Mercator org internals remain unknown rather than invented.
- **Supported implementation:** Retain Principal/Account resolution and current Clerk integration; no new identity service.
- **References:** [Mercator auth][M-A]; [AE principal schema][AE-P]; [Account schema][AE-AC]; [foundation model][B].

<a id="mm-002"></a>

### MM-002 — Organisation membership and administrator controls

- **State:** open · Roster/invitation source supported; role change/removal and full journey remain open. **Priority/wave:** P2 · F1/F5.
- **Owner / dependencies:** Authority / owner experience; [MM-001](#mm-001).
- **Required behaviour:** An organisation admin can manage membership and Agent access without confusing organisation ownership with private access to another Account.
- **Success criteria:** Invite/join or the actually supported membership flow, role change, removal and offboarding behave consistently; removed members cannot create new effects.
- **End condition:** One guide-led admin journey and membership-revocation/isolation negatives pass in the supported environment. This is an AE foundation requirement; Mercator team roles are not publicly established.
- **Supported implementation:** Use current Clerk/org membership and owner controls; document only implemented roles and invitations.
- **References:** [Public-contract claim ceiling][B]; [Account membership][AE-AC]; [current guide][G].

<a id="mm-003"></a>

### MM-003 — Stable Agent identity and credential replacement

- **State:** open · Supported in source; rotation tests passed. **Priority/wave:** P1 · F1/F5.
- **Owner / dependencies:** Agent access / authority; [MM-001](#mm-001).
- **Required behaviour:** An Agent keeps its identity, history and budget when its access credential is replaced.
- **Success criteria:** Replacement retains canonical Principal attribution; revoked old credential cannot release another effect; history does not fragment into a new Agent.
- **End condition:** Rotation and dispatch tests plus an actual supported client replacement/recovery journey are linked. Mercator independent Agent-principal semantics remain unknown.
- **Supported implementation:** Reuse issued/replacement Agent binding and current generation checks.
- **References:** [Mercator connection contract][M-D]; [issued Agent binding][AE-B]; [canonical authority][AE-A].

<a id="mm-004"></a>

### MM-004 — Delegated scope, budget, expiry and current authority

- **State:** open · Call and bounded Plan authority implemented; full aggregate qualification open. **Priority/wave:** P1 · F1/F3.
- **Owner / dependencies:** Authority / finance; [MM-001](#mm-001), [MM-003](#mm-003).
- **Required behaviour:** A credential identifies an actor; a current grant authorises bounded work. Account funding never expands scope or budget.
- **Success criteria:** Wrong resource/scope/environment, expired or revoked grant and concurrent spending beyond a ceiling refuse; each unreleased node rechecks current authority.
- **End condition:** Grant negatives, atomic concurrent-budget proof and revoked-after-quote graph proof pass. Accepted work and historical access follow an explicit current policy.
- **Supported implementation:** Retain implemented Plan reservation and current per-Node effect authority in the existing DelegationGrant/Call owners; qualify the remaining negatives.
- **References:** [Spending limits][M-P]; [delegation contracts][AE-D]; [Call authority][AE-C].

<a id="mm-005"></a>

### MM-005 — Per-client OAuth and bearer authentication

- **State:** open · Supported in source and public metadata; client matrix partial. **Priority/wave:** P1 · F1/F5.
- **Owner / dependencies:** Protocol / Agent access; [MM-001](#mm-001), [MM-003](#mm-003), [MM-004](#mm-004).
- **Required behaviour:** Each supported client can authorise the correct resource, refresh access and use the exact permitted actions without sharing another client’s connection.
- **Success criteria:** Registration/PKCE/resource discovery, consent, refresh and expiry work; missing/wrong bearer, audience and scope refuse with a recoverable challenge.
- **End condition:** REST and two named installed clients complete login/use/refresh/reconnect negatives on the same supported release. No claim that login alone grants spending.
- **Supported implementation:** Use current Clerk OAuth/MCP SDK and advertised metadata; do not build a token issuer.
- **References:** [Auth guide][M-A]; [MCP card][M-M]; [AE auth][AE-AUTH]; [AE machine discovery][AE-M].

<a id="mm-006"></a>

### MM-006 — Connection and payment readiness

- **State:** open · Supported diagnostics; sustained live capacity unproved. **Priority/wave:** P1 · F1/F5.
- **Owner / dependencies:** Agent access / money / DX; [MM-004](#mm-004), [MM-005](#mm-005).
- **Required behaviour:** A client can distinguish identity, wallet/Account binding, authority, funding and actual paid readiness, with one useful next action.
- **Success criteria:** Insufficient funds/limits, expired access and unavailable chain/ledger data remain distinct; unavailable data is not reported as zero; a free check reserves no capacity.
- **End condition:** Ready, funding-needed, scope-needed and unavailable cases are exercised through real client/UI readback without secret exposure or paid side effects.
- **Supported implementation:** Reuse readiness/diagnostic actions and owner handoffs; preserve fail-closed checks.
- **References:** [Connection contract][M-CON]; [AE deployment limits][AE-DEP]; [operating contract][AE-OP].

<a id="mm-007"></a>

### MM-007 — Revocation, isolation and offboarding lifecycle

- **State:** open · Supported in source; combined persona recovery partial. **Priority/wave:** P1 · F1/F5.
- **Owner / dependencies:** Authority / lifecycle / data; [MM-002](#mm-002), [MM-003](#mm-003), [MM-005](#mm-005).
- **Required behaviour:** Revoking a connection, removing membership, suspending an Account and cancelling work are separate, truthful actions; private reads remain Account-bound.
- **Success criteria:** Old access cannot create effects or read another Account; retained authorised history survives credential replacement; disconnect does not silently cancel or refund jobs.
- **End condition:** Two-Account negative reads and guide-led revoke/offboard/recover journey pass, with explicit data/history and remaining-job policy.
- **Supported implementation:** Keep authenticated principal-bound reads; do not copy Mercator’s private-ID capability access. Use existing lifecycle controls.
- **References:** [Mercator revocation][M-A]; [Job access][M-J]; [AE authority][AE-A]; [privacy design][AE-PRIV].

<a id="mm-008"></a>

### MM-008 — Provider identity and upstream credential isolation

- **State:** open · Supported in source; heterogeneous hosted proof partial. **Priority/wave:** P1 · F1/F5.
- **Owner / dependencies:** Supply / security; [MM-001](#mm-001), [MM-007](#mm-007).
- **Required behaviour:** Provider credentials authorise upstream supply and never become the buyer Agent’s identity or spending permission.
- **Success criteria:** Publish/test/call use the authorised Provider Connection; another Provider/Account cannot read or reuse the secret; rotation and withdrawal fail safely.
- **End condition:** Two independent Provider onboarding/rotation/withdrawal journeys and credential-isolation negatives are recorded without manual database repair.
- **Supported implementation:** Reuse Provider Connection, official credential stores and existing admission funnel.
- **References:** [Service owners][M-OWN]; [Provider Connection][AE-PC]; [foundation ownership][B].

<a id="mm-009"></a>

### MM-009 — Provider entitlement, terms and commercial roles

- **State:** open · Partial; actual provider agreements unknown. **Priority/wave:** P1 · F1/F5.
- **Owner / dependencies:** Supply / product / commercial owner; [MM-008](#mm-008).
- **Required behaviour:** Supply is admitted only with evidenced rights to distribute the service and its data, and an explicit buyer/Provider/Seller/payment relationship.
- **Success criteria:** Applicable agreement, contracting entity, resale permission, input/output rights, retention, remedy and obligations are attached to admitted supply; directory presence is insufficient.
- **End condition:** Commercial owner accepts the actual agreements and per-supply responsibility record before live resale. Unknown negotiated terms stay open; no legal clearance inferred from Mercator.
- **Supported implementation:** Use the current contract/admission evidence; complete PRODUCT.md’s commercial record without replacing the ledger.
- **References:** [Exa terms][T-EXA]; [Parallel terms][T-PAR]; [fal terms][T-FAL]; [PRODUCT][AE-PRODUCT]; [ADR 0004][PKG].

<a id="mm-010"></a>

### MM-010 — Task-level discovery

- **State:** open · Partial; safe public search reproduced. **Priority/wave:** P1 · F5.
- **Owner / dependencies:** Market / discovery; [MM-013](#mm-013), [MM-014](#mm-014).
- **Required behaviour:** A user or Agent describes the contribution needed and receives suitable exact capabilities with required inputs and a next inspection step.
- **Success criteria:** Search does not buy or execute upstream work; a representative corpus finds useful candidates and handles missing inputs, no match and stale entries.
- **End condition:** Corpus, expected relevance, real callable-supply coverage and hosted discovery results are recorded. Setup-required listings cannot count as completed procurement.
- **Supported implementation:** Reuse canonical search/compare and existing Jev or deterministic ranking; distinguish listing and Tool.
- **References:** [Search semantics][M-S]; [AE action/OpenAPI source][AE-O]; [public probe baseline][B].

<a id="mm-011"></a>

### MM-011 — Search constraints, freshness and availability

- **State:** open · Partial; unverified/setup-required public results observed. **Priority/wave:** P1 · F5.
- **Owner / dependencies:** Market / supply; [MM-010](#mm-010).
- **Required behaviour:** Mandatory providers, preferences, excluded capabilities, price/effect limits and static versus live evidence retain their actual meaning.
- **Success criteria:** Hard constraints never relax silently; static search is fast; live probes are bounded; indeterminate availability and missing freshness remain visible; broadening requires permission when material.
- **End condition:** Constraint and empty-result tests plus hosted ready/unavailable/unknown cases pass, with visible evidence timestamp and accurate page coverage.
- **Supported implementation:** Reuse current filters, freshness and measured latency; supported bounded probes, no fabricated SLA.
- **References:** [Search constraints][M-S]; [Quote/discovery distinction][M-Q]; [AE routing strategy][AE-ROUTE].

<a id="mm-012"></a>

### MM-012 — Routing quality and comparable task performance

- **State:** open · Partial; Mercator benchmarks marketing-only. **Priority/wave:** P1 · F5.
- **Owner / dependencies:** Market / eval / product; [MM-011](#mm-011), [MM-022](#mm-022).
- **Required behaviour:** Chosen supply contributes to real tasks with competitive success, time to usable result, turns, cost and repeat-use quality.
- **Success criteria:** Preregister a fixed comparable task corpus; compare current selection with a supported baseline; report failures, sample sizes and unavailable evidence.
- **End condition:** The agreed corpus and repeat-use window meet owner-approved thresholds. No claimed Jev lift, percentile or SLA without receipts; unauthorised paid Mercator comparisons remain blocked.
- **Supported implementation:** Use existing eval harness and instrumentation; prefer measured simpler selection when intelligence gains are unproved.
- **References:** [Tempo marketing][M-T]; [PRODUCT benchmark][AE-PRODUCT]; [baseline claim limits][B].

<a id="mm-013"></a>

### MM-013 — Exact service and endpoint schemas

- **State:** open · Supported in source; live Mercator input schema reproduced. **Priority/wave:** P1 · F1/F5.
- **Owner / dependencies:** Contracts / supply / protocol; [MM-008](#mm-008).
- **Required behaviour:** Discovery leads to the exact immutable published Tool and authoritative input, available output, pricing, effect and recipient contract.
- **Success criteria:** Exact endpoint inspection and schema-valid input work; stale/ambiguous endpoint, malformed input and invalid output refuse; missing output schemas remain uncertainty rather than invented safety.
- **End condition:** Imported/published synchronous and async Tools have schema examples, version drift tests and real request/result agreement. Mercator descriptors’ missing outputSchema/execution details are recorded.
- **Supported implementation:** Reuse capability contracts, maintained OpenAPI/MCP importers and action-owned schemas.
- **References:** [Describe contract][M-DESC]; [Mercator OpenAPI][M-O]; [AE capability contracts][AE-CC].

<a id="mm-014"></a>

### MM-014 — Provider admission, publication and withdrawal

- **State:** open · Supported source funnel; broad hosted activation partial. **Priority/wave:** P1 · F5.
- **Owner / dependencies:** Supply / Provider experience; [MM-008](#mm-008), [MM-009](#mm-009), [MM-013](#mm-013).
- **Required behaviour:** A Provider can expose entitled supply, test readiness, publish/version it, withdraw/recheck/republish and inspect Calls/earnings/offboarding.
- **Success criteria:** Imported metadata cannot be purchased before admission/publication; publication binds tested contracts and credentials; withdrawal stops new purchases without erasing accepted obligations.
- **End condition:** A guide-led Provider completes the supported lifecycle with positive delivery and failure/recovery proof. Mercator private admission internals are not a target implementation to copy.
- **Supported implementation:** Use existing supply.* owner funnel and current Workpool scheduling; no bespoke registry or credential system.
- **References:** [Mercator owner entry][M-OWN]; [AE Provider Connection][AE-PC]; [current Provider guide][G].

<a id="mm-015"></a>

### MM-015 — Authoritative Quote and price disclosure

- **State:** open · Supported single Tool; free Mercator quotes reproduced. **Priority/wave:** P1 · F1/F3.
- **Owner / dependencies:** Execution / pricing / finance; [MM-004](#mm-004), [MM-013](#mm-013).
- **Required behaviour:** A free Quote supplies current exact terms, authoritative price, expiry and funding/authority next action before a purchase.
- **Success criteria:** Discovery estimates never become charges; quote refresh handles expiry, price drift, missing input and current authority; no quote executes paid work.
- **End condition:** Schema, price/expiry/authority negatives and a hosted single-Tool quote-to-receipt positive are linked to the actual released contract.
- **Supported implementation:** Reuse PricingConfig, Quote and money formatting; extend aggregate quote rather than duplicate price truth.
- **References:** [Quote contract][M-Q]; [Pricing][M-P]; [AE Quote][AE-Q].

<a id="mm-016"></a>

### MM-016 — Bounded immutable procurement plan

- **State:** open · Frozen 1–10 Node Plan implemented; recorded two-Node acceptance, wider proof open. **Priority/wave:** P1 · F3.
- **Owner / dependencies:** Contracts / execution / product; [MM-013](#mm-013), [MM-015](#mm-015).
- **Required behaviour:** An Agent can inspect and submit a frozen 1–10 node procurement DAG over exact published Tools, without moving its larger planning/runtime into Aecon.
- **Success criteria:** Empty/11-node plans, cycles, duplicate IDs and invalid dependencies refuse; valid independent and dependent nodes survive serialization and restart unchanged.
- **End condition:** Approved public schema, positive two-Tool execution and adversarial graph tests pass in the target environment. A validator or fixed Provider package alone cannot close this item.
- **Supported implementation:** Use existing child Calls and installed Convex Workflow; keep caller composition distinct from Provider package responsibility.
- **References:** [Combined work][M-COMB]; [Plan schema][M-O]; [AE single-Call input][AE-CALL]; [ADR 0004][PKG].

<a id="mm-017"></a>

### MM-017 — Dependency output references and bounded mapping

- **State:** open · Plan references/pointers/bounded mapping implemented; hosted mapped proof open. **Priority/wave:** P1 · F3.
- **Owner / dependencies:** Contracts / execution; [MM-016](#mm-016).
- **Required behaviour:** A node can use a declared dependency’s actual output, JSON Pointer field or bounded array projection as schema-valid input.
- **Success criteria:** Real first-node output reaches the second node; forward/undeclared references, missing paths, invalid maps, incompatible resolved input and depth/size overflow refuse predictably.
- **End condition:** Positive reference/pointer/map execution and failure/limit tests pass with real outputs. Free Mercator graph quoting alone is not execution proof.
- **Supported implementation:** Maintain RFC 6901 parsing utilities and a small declared mapping grammar; no arbitrary code or expression engine.
- **References:** [Plan examples][M-COMB]; [Quote contract][M-Q]; [Graph design][B].

<a id="mm-018"></a>

### MM-018 — Quote-to-plan binding and dependent price ceilings

- **State:** open · Plan digest/exact total/per-Node Ceilings implemented; wider qualification open. **Priority/wave:** P1 · F3.
- **Owner / dependencies:** Contracts / authority / finance; [MM-004](#mm-004), [MM-015](#mm-015), [MM-016](#mm-016), [MM-017](#mm-017).
- **Required behaviour:** The plan, Tool versions, recipients, effects and ceilings approved at Quote are the work released; dynamic dependent pricing cannot expand authority.
- **Success criteria:** Plan/input/terms drift conflicts; expired quotes reprice; unbounded or above-ceiling dependent cost refuses/requotes before release; material expansion requires a new approval.
- **End condition:** Atomic exact-plan binding, generation drift and price-change races pass; finance/product approve aggregate consideration versus separate purchase/remedy semantics before paid use.
- **Supported implementation:** Bind canonical immutable plan material to current Quote and grant generation; preserve authoritative per-node max or explicit repricing handoff.
- **References:** [Create constraints][M-CREATE]; [Quote][M-Q]; [AE Call admission][AE-ADMIT]; [commercial design][B].

<a id="mm-019"></a>

### MM-019 — Exact Provider choice and fallback boundaries

- **State:** open · Exact frozen Tool release implemented; actual-client fallback proof open. **Priority/wave:** P1 · F3/F5.
- **Owner / dependencies:** Market / execution / product; [MM-010](#mm-010), [MM-013](#mm-013), [MM-018](#mm-018).
- **Required behaviour:** The selected Provider/Tool is the one executed. Alternatives can be offered without silently changing recipients, costs or irreversible effects.
- **Success criteria:** Required/preferred choices survive quote and execution; stale/unavailable exact supply yields a clear new comparison/quote step; fallback cannot bypass ceilings or approval.
- **End condition:** Recorded choice-to-effect provenance and unavailable/fallback negatives pass through actual clients.
- **Supported implementation:** Use current selection, exact Tool refs and Quote; no automatic irreversible Provider substitution.
- **References:** [Search choice][M-S]; [Create plan][M-CREATE]; [AE routing direction][AE-ROUTE].

<a id="mm-020"></a>

### MM-020 — Ready-node scheduling and aggregate concurrency

- **State:** open · Bounded Plan Workflow scheduling implemented; hosted ten-Node proof open. **Priority/wave:** P1 · F3.
- **Owner / dependencies:** Execution / authority; [MM-004](#mm-004), [MM-016](#mm-016), [MM-017](#mm-017), [MM-018](#mm-018), [MM-021](#mm-021).
- **Required behaviour:** Independent ready nodes can run concurrently; dependencies wait; service/account budgets and fairness bound work.
- **Success criteria:** Fan-out obeys the evidenced Mercator limit of at most three per service or an explicitly disclosed AE compatible cap; no overspend under concurrent release; failed dependencies do not start.
- **End condition:** Ten-node fan-out/dependency, restart and concurrent-budget tests plus hosted mapped graph demonstrate useful parallelism and bounded load.
- **Supported implementation:** Use installed Workflow/Workpool concurrency and AE atomic reservations; avoid unbounded Promise.all or a new scheduler.
- **References:** [Parallel graph contract][M-COMB]; [Workflow][S-WF]; [Workpool][S-WP]; [AE design][B].

<a id="mm-021"></a>

### MM-021 — Durable asynchronous admission and recovery

- **State:** open · Durable Calls and Plans implemented; conventional async qualification open. **Priority/wave:** P1 · F2/F3.
- **Owner / dependencies:** Execution; [MM-004](#mm-004), [MM-015](#mm-015).
- **Required behaviour:** Accepted work has a durable reference; client disconnect or worker restart does not lose it or create another purchase.
- **Success criteria:** Pending/running/terminal state survives restart; status resumes the same accepted work; disconnect has no implicit cancellation; uncertain effects remain reconcilable.
- **End condition:** Local durable execution/recovery suite and a hosted restart/disconnect journey pass for single async Tool and subsequently a graph.
- **Supported implementation:** Retain current Call/workId/authority binding, dispatch Workpool and completion hook. Use Workflow only for genuine multi-step waiting/composition; no second job table or generic TaskManager. See the reuse-fit matrix in ADR 0006.
- **References:** [Job lifecycle][M-J]; [AE Call authority][AE-C]; [recorded runtime][AE-DEP].

<a id="mm-022"></a>

### MM-022 — Conventional provider start/status/result completion

- **State:** open · 202 false delivery corrected in source; conventional async completion open. **Priority/wave:** P1 · F2.
- **Owner / dependencies:** Supply adapters / execution; [MM-014](#mm-014), [MM-021](#mm-021).
- **Required behaviour:** A conventional provider job handle means accepted work, and Aecon observes it until a validated final result or truthful failure.
- **Success criteria:** Persist original handle; queued 202 is not final output; use the Provider SDK’s supported read/result or verified webhook path. Bounded observation handles success/failure/expiry, bad schema, auth expiry, unsafe URLs, lost response and restart without a second start. Do not copy an hour-long polling example into one Convex action.
- **End condition:** One admitted async fixture and one separately authorised real Provider complete start → restart → observe → final output. Existing fixture finding is corrected; no production exploit claim is required.
- **Supported implementation:** Qualify the actual Provider’s maintained SDK first (Parallel taskRun or fal queue where applicable). Persist its handle on the existing Call/effect; schedule bounded observation through existing Workpool, or Workflow events for a genuine callback wait. SDK final output must pass the published Tool schema; no new generic service-job lifecycle.
- **References:** [Job delivery contract][M-J]; [normaliser][AE-HTTP]; [adapter config][AE-ADAPTER]; [Parallel tasks][S-PAR]; [fal queue][S-FAL].

<a id="mm-023"></a>

### MM-023 — Idempotent submission and conflicting replay

- **State:** open · Call and Plan run/Node identity implemented; hosted loss/rotation proof open. **Priority/wave:** P1 · F2/F3.
- **Owner / dependencies:** Execution / authority; [MM-021](#mm-021).
- **Required behaviour:** One retained key identifies one logical authorised purchase; identical replay resumes it, while changed material conflicts.
- **Success criteria:** Response loss and credential rotation replay without another charge/effect; another Account/Principal cannot collide with the key; graph and node namespaces are stable.
- **End condition:** Concurrent duplicate, changed-plan/input, rotation and cross-Account tests plus a hosted lost-response recovery prove one intended effect/charge within retention.
- **Supported implementation:** Extend current principal-keyed Call admission and durable effect identity; persist keys before request.
- **References:** [Idempotency contract][M-CREATE]; [AE admission][AE-ADMIT]; [Agent binding][AE-B].

<a id="mm-024"></a>

### MM-024 — Safe retries, uncertain effects and reconciliation

- **State:** open · Supported single Call model; adapter/graph proof partial. **Priority/wave:** P1 · F2/F3.
- **Owner / dependencies:** Execution / supply; [MM-022](#mm-022), [MM-023](#mm-023).
- **Required behaviour:** Transient free work can retry within limits; possible paid/irreversible dispatch is observed or reconciled rather than blindly repeated.
- **Success criteria:** Bound attempts, jitter and Retry-After; Mercator documents up to three free transient retries and at most one paid provider attempt after durable claim. Preserve AE’s stricter supported uncertainty boundary.
- **End condition:** Lost start/response, provider rate-limit/unavailable, timeout-after-effect and worker-crash tests prove no unintended duplicate paid release and useful recovery.
- **Supported implementation:** Reuse Call authority/idempotency and effect reconciliation plus existing Workpool retry controls. Provider SDK/network retries must be disabled or bounded for uncertain consequential starts; observation retries never become another purchase.
- **References:** [Retry contract][M-J]; [Workflow semantics][S-WF]; [AE recovery entry][AE-E].

<a id="mm-025"></a>

### MM-025 — Status, errors and one useful next action

- **State:** open · Call/Plan status implemented; explicit next actions locally qualified. **Priority/wave:** P1 · F1/F2/F3.
- **Owner / dependencies:** Execution / protocol / DX; [MM-021](#mm-021), [MM-022](#mm-022).
- **Required behaviour:** Clients can distinguish active, succeeded, partially successful, failed and uncertain work, with sanitised reasons and clear next action.
- **Success criteria:** REST/MCP/CLI represent the same facts; active work uses bounded backoff, terminal execution stops polling, pending settlement continues separately; errors do not leak secrets or raw payloads.
- **End condition:** Generated schema/envelope tests and actual clients correctly resume, surface successful outputs first, explain failure and stop at the right terminal states.
- **Supported implementation:** Derive response/error docs and permitted Plan continuation from current action/lifecycle owners, retaining AE state truth and coordinated pre-stability compatibility.
- **References:** [Job statuses][M-J]; [AE public actions][AE-E]; [generated OpenAPI][AE-O].

<a id="mm-026"></a>

### MM-026 — Cancellation and irreversible-effect truth

- **State:** open · Call cancellation and future-Node Plan stop implemented; hosted races open. **Priority/wave:** P1 · F2/F3.
- **Owner / dependencies:** Execution / supply; [MM-007](#mm-007), [MM-022](#mm-022), [MM-024](#mm-024).
- **Required behaviour:** Explicit cancellation can stop unreleased work and request supported upstream cancellation without promising rollback or refund.
- **Success criteria:** Cancellation races with dispatch/completion safely; unsupported/unknown cancellation is truthful; credential revocation or disconnect cannot masquerade as a cancelled job.
- **End condition:** Cancel-before/after-release, race and unsupported cases pass for async Tool and graph. Mercator public cancellation API remains unestablished; this is AE’s required lifecycle boundary.
- **Supported implementation:** Reuse current cancellation fence and provider capability declaration; stop future graph nodes while retaining possible effects.
- **References:** [Disconnect semantics][M-J]; [AE Call entry][AE-E]; [fal queue cancellation][S-FAL].

<a id="mm-027"></a>

### MM-027 — History, cached recovery and retention

- **State:** open · Call history and Plan readback implemented; retention/expiry parity open. **Priority/wave:** P1 · F4.
- **Owner / dependencies:** Execution / data / owner experience; [MM-007](#mm-007), [MM-021](#mm-021).
- **Required behaviour:** Original authorised users can list retained work, recover its successful outputs for free and distinguish expiry from failed delivery.
- **Success criteria:** Cursor/status filtering and expired cursor recovery work; read never executes suppliers; history excludes raw payloads; published content retention covers Mercator’s documented 30-day recovery behaviour.
- **End condition:** History/cached-read/expiry and two-Account negatives pass in hosted release; financial/audit retention remains separate; review retention has its own item.
- **Supported implementation:** Extend current Call reads and authenticated content refs; explicit retention/purge policy, no job-ID-only access shortcut.
- **References:** [History contract][M-HIST]; [Cached results][M-J]; [AE Call entry][AE-E]; [privacy][AE-PRIV].

<a id="mm-028"></a>

### MM-028 — Explicit rerun and failed-node resubmission

- **State:** open · Partial single new Call; graph replay plan missing. **Priority/wave:** P1 · F4.
- **Owner / dependencies:** Execution / market / DX; [MM-018](#mm-018), [MM-023](#mm-023), [MM-027](#mm-027).
- **Required behaviour:** Reading prior work is free; rerunning or submitting only failed work is a new quoted, authorised purchase with a new key.
- **Success criteria:** Retained plan retrieval is explicit; changes revalidate input/terms/price; successful nodes are not silently rebought when resuming or handling partial failure.
- **End condition:** Client read/resume versus new-execution journeys show distinct keys, receipts and charges; failed-only plan reproduces only requested work.
- **Supported implementation:** Expose immutable replay material and re-enter Quote/Call; no hidden retry purchase or mutable accepted plan.
- **References:** [Explicit reruns][M-J]; [Partial failure][M-J]; [AE admission][AE-ADMIT].

<a id="mm-029"></a>

### MM-029 — Partial success and dependent skips

- **State:** open · Plan partial outputs/skips implemented; hosted partial-failure proof open. **Priority/wave:** P1 · F3/F4.
- **Owner / dependencies:** Execution / finance; [MM-020](#mm-020), [MM-025](#mm-025).
- **Required behaviour:** One failed node does not discard useful completed siblings; blocked dependents skip and completed supplier purchases remain billable.
- **Success criteria:** Completed/failed/skipped counts and reasons agree with actual effects; independent siblings complete; only eligible unused capacity enters refund handling.
- **End condition:** Hosted multi-node partial-failure proof preserves successful output and receipt, never dispatches blocked nodes, and does not conflate terminal execution with refund settlement.
- **Supported implementation:** Store per-node state/result refs and compose aggregate views over existing child effect/economic facts.
- **References:** [Partial status][M-J]; [Refund contract][M-REF]; [AE design][B].

<a id="mm-030"></a>

### MM-030 — Summary, node and JSON Pointer result reads

- **State:** open · Partial single result; missing selected aggregate reads. **Priority/wave:** P1 · F4.
- **Owner / dependencies:** Execution reads / contracts; [MM-029](#mm-029).
- **Required behaviour:** Clients fetch a compact summary then a successful node or specific field without rerunning suppliers.
- **Success criteria:** Summary/result IDs agree; whole-node and valid pointer reads succeed; not-ready/missing-node/missing-path/invalid-query are distinct; cross-Account reads refuse.
- **End condition:** Real large graph read through REST and MCP proves bounded response size, pointer accuracy, free cached access and zero additional provider effects.
- **Supported implementation:** Add authenticated selected-result actions over stored content; maintained pointer utilities and bounded materialisation.
- **References:** [Selected node contract][M-NODE]; [Job summary][M-J]; [AE Call reads][AE-E].

<a id="mm-031"></a>

### MM-031 — Binary outputs and large artifacts

- **State:** open · Partial/unknown; equivalent artifact contract not located. **Priority/wave:** P1 · F4.
- **Owner / dependencies:** Execution / content / security; [MM-030](#mm-030), [MM-043](#mm-043).
- **Required behaviour:** Useful binary/large results can be retrieved with correct content metadata and authorised artifact links/resource links.
- **Success criteria:** Inline base64 and large leaf artifact modes work within caps; dependency/polling output compatibility is explicit; expired/wrong-Account links refuse; workers carry refs rather than repeated blobs.
- **End condition:** Hosted download, client resource-link, worker-restart and expiry/size/isolation tests pass without reexecution or payload leakage.
- **Supported implementation:** Use supported authenticated storage/download primitives and content refs; explicit byte/depth/array limits and retention.
- **References:** [Artifact behaviour][M-J]; [Artifact API][M-O]; [AE privacy][AE-PRIV]; [Workflow refs][S-WF].

<a id="mm-032"></a>

### MM-032 — Funding handoff and authority separation

- **State:** open · Supported economic foundation; customer funding journey limited. **Priority/wave:** P1 · F1/F5.
- **Owner / dependencies:** Money / owner experience / DX; [MM-004](#mm-004), [MM-006](#mm-006).
- **Required behaviour:** An Agent can explain missing capacity and offer an Account funding handoff; the user explicitly chooses amount/method and retains their spending limit.
- **Success criteria:** Free funding/status handoff creates no transfer; wrong Account, insufficient authority and unavailable balance remain distinct; adding funds does not widen a grant.
- **End condition:** Guide-led authorised funding/readiness journey and no-side-effect diagnostics pass, with exact balance/limit receipt. Admin promotional credit does not prove public onboarding.
- **Supported implementation:** Reuse current AUD funding and owner controls; literal MACH/Coinflow is separately tracked.
- **References:** [Funding handoff][M-FUND]; [Pricing/readiness][M-P]; [AE deployment gates][AE-DEP].

<a id="mm-033"></a>

### MM-033 — Charge, Provider obligation and receipt allocation

- **State:** open · Supported single Call foundation; full commercial/aggregate record partial. **Priority/wave:** P1 · F3/F4.
- **Owner / dependencies:** Finance / execution / commercial owner; [MM-009](#mm-009), [MM-015](#mm-015), [MM-018](#mm-018), [MM-032](#mm-032).
- **Required behaviour:** User-facing totals, buyer consideration, provider payments, seller/recipient facts and retained spend are clear without treating settlement as delivery.
- **Success criteria:** Plan/node totals reconcile to authoritative ledger facts; no double debit on replay; independent purchases versus package promise remain explicit; fees and dynamic ceilings are disclosed.
- **End condition:** Approved aggregate allocation and complete required AE commercial evidence plus hosted exact-total receipts/reconciliation pass. A wallet transfer alone cannot close it.
- **Supported implementation:** Keep Formance/Numscript as monetary truth and current Call/economic ports; join facts rather than build another ledger.
- **References:** [Pricing/accounting][M-P]; [Job receipt][M-J]; [AE PRODUCT][AE-PRODUCT]; [commercial proposal][B].

<a id="mm-034"></a>

### MM-034 — Refund/remedy lifecycle independent of execution

- **State:** open · Supported scoped single Call; aggregate allocation missing. **Priority/wave:** P1 · F4.
- **Owner / dependencies:** Finance / recovery / execution; [MM-029](#mm-029), [MM-033](#mm-033).
- **Required behaviour:** Unused failed capacity can resolve under the applicable payment contract while successful nodes remain billable; refund status is separately observable.
- **Success criteria:** Pending/settled/failed refund is independent of job terminal state; duplicate recovery cannot refund twice; Tempo MACH and Stripe support-only policy remain rail-specific.
- **End condition:** Approved allocation plus failure/partial/refund/reconciliation receipts demonstrate exact retained and refunded amounts; client polls settlement only when needed.
- **Supported implementation:** Reuse current refund/remedy and obligation facts; no automatic refund inferred from cancellation or scheduler failure.
- **References:** [Failed-job refunds][M-REF]; [Job settlement][M-J]; [AE recorded recovery][AE-DEP].

<a id="mm-035"></a>

### MM-035 — MACH funding, Coinflow checkout and Apple Pay

- **State:** open · Missing literal parity; AUD capacity is an economic equivalent only. **Priority/wave:** P1 · Literal.
- **Owner / dependencies:** Payments / commercial / owner experience; [MM-009](#mm-009), [MM-032](#mm-032).
- **Required behaviour:** For unqualified literal parity, support the evidenced MACH funding/merchant restrictions and authoritative account-bound Coinflow checkout, including Apple Pay validation.
- **Success criteria:** Order/create/read/confirm and domain-validation bind the authenticated payer; no client price or merchant credential; rate/transfer/redemption/expiry terms match the supported contract.
- **End condition:** Supported commercial agreement, approved rail design and authorised positive/negative checkout/settlement proof are complete. AUD credit alone cannot close literal MACH/Coinflow parity.
- **Supported implementation:** Use official funding provider APIs and supported wallet/credit adapters; do not mint a substitute token or custom checkout in this review.
- **References:** [MACH terms][M-MACH]; [Funding operations][M-O]; [Coinflow terms][T-COIN].

<a id="mm-036"></a>

### MM-036 — Native MPP Tempo customer payment

- **State:** open · Missing literal MPP/Tempo parity. **Priority/wave:** P1 · Literal.
- **Owner / dependencies:** Payments / protocol; [MM-009](#mm-009), [MM-018](#mm-018), [MM-033](#mm-033).
- **Required behaviour:** A supported native MPP client can approve/pay the exact quote in the documented Tempo currencies/credits, including supported pathUSD swap semantics.
- **Success criteria:** Validate challenge chain/currency/recipient/realm/expiry and budget; preserve attribution and original challenge; price change needs approval; settlement recipient is recorded.
- **End condition:** Official-protocol conformance and separately authorised exact-payment/replay/failure/refund journeys pass with compatible clients; shipping another chain is insufficient.
- **Supported implementation:** Adopt official maintained MPP/Tempo SDKs behind existing economic boundaries after reviewed rail approval.
- **References:** [Payment contract][M-P]; [Auth/payment modes][M-REST]; [MPP][S-MPP].

<a id="mm-037"></a>

### MM-037 — Stripe shared payment token customer mode

- **State:** open · Missing literal Stripe SPT parity. **Priority/wave:** P1 · Literal.
- **Owner / dependencies:** Payments / protocol / support; [MM-009](#mm-009), [MM-018](#mm-018), [MM-033](#mm-033).
- **Required behaviour:** A compatible client can submit an SPT-backed USD purchase with the documented whole-cent and strictly-over-$0.50 restrictions.
- **Success criteria:** Validate token/amount/expiry and reject unsupported totals; no secrets in tool input/logs; interrupted payment routes to the published support/refund policy.
- **End condition:** Approved Stripe integration, current token protocol conformance and authorised success/replay/invalid-total/interruption proof pass; no automatic refund is advertised.
- **Supported implementation:** Use official Stripe/MPP supported token path, existing payment ports and rail-specific support.
- **References:** [Stripe constraints][M-P]; [Stripe refund policy][M-REF]; [MPP][S-MPP].

<a id="mm-038"></a>

### MM-038 — Upstream MPP Tempo and x402 Base purchasing

- **State:** open · Base x402 supported scoped runtime; upstream MPP missing. **Priority/wave:** P1 · F5/Literal.
- **Owner / dependencies:** Supply transport / payments; [MM-009](#mm-009), [MM-014](#mm-014), [MM-024](#mm-024).
- **Required behaviour:** Admitted providers can be paid through their supported MPP Tempo or Base x402 challenge without requiring individual customer Provider keys.
- **Success criteria:** Authoritative live challenge supplies realm/recipient; supported chain/currency/address/expiry/limits validate; altered challenge and unsafe recipient refuse; downstream realm is retained.
- **End condition:** One entitled provider per required protocol completes authorised purchase and lost-response recovery; payment boundaries/fees are recorded. Base upstream is not claimed as Mercator customer rail.
- **Supported implementation:** Reuse current x402 adapter and official protocol SDKs; add MPP behind supply/payment ports, no challenge rewriting.
- **References:** [Downstream settlement][M-P]; [Service owner protocol][M-OWN]; [AE adapter registry][AE-ADAPTER].

<a id="mm-039"></a>

### MM-039 — Public accounting receipt and social card

- **State:** open · Partial private receipts; equivalent public card absent. **Priority/wave:** P1 · F4/Literal.
- **Owner / dependencies:** Finance views / product / privacy; [MM-033](#mm-033), [MM-043](#mm-043).
- **Required behaviour:** A user can explicitly share a public accounting receipt/card containing disclosed service/payment facts, without sharing private job IDs or results.
- **Success criteria:** HTML receipt and image agree with ledger/accounting; raw input/output, credentials and private IDs are excluded; generated task title disclosure requires an explicit policy.
- **End condition:** Consent/privacy decision, hosted receipt/card render and sensitive-field absence tests pass; private chat sharing alone cannot close it.
- **Supported implementation:** Use current receipt facts and supported renderer; separate public share ID from authenticated result references.
- **References:** [Share card contract][M-J]; [Shared receipt/image API][M-O]; [AE privacy][AE-PRIV].

<a id="mm-040"></a>

### MM-040 — Quotas, budgets and service/account fairness

- **State:** open · Supported rate limits; composed-work fairness partial. **Priority/wave:** P1 · F3/F5.
- **Owner / dependencies:** Execution / platform / authority; [MM-004](#mm-004), [MM-020](#mm-020), [MM-024](#mm-024).
- **Required behaviour:** Customer limits and provider capacity bound work across calls/graphs; one noisy Account or service cannot cause unbounded retries or hide exhaustion.
- **Success criteria:** Rate-limit/backoff, queue caps and aggregate reservations behave under ten-node fan-out and concurrent Accounts; budgets cannot race; unavailable capacity yields a useful reason.
- **End condition:** Load/fairness, budget-race and retry-limit receipts meet explicit approved thresholds. Mercator global quota internals are unknown; no numeric claim is borrowed.
- **Supported implementation:** Use existing HTTP/Convex rate limiter and Workpool/Workflow limits; measure actual supplier capacity.
- **References:** [Service concurrency/retries][M-J]; [Workpool][S-WP]; [AE authority design][B].

<a id="mm-041"></a>

### MM-041 — Health, correlation and operational observability

- **State:** open · Supported/partial; sustained alert proof remains open. **Priority/wave:** P1 · F5.
- **Owner / dependencies:** Operations / execution; Datadog owner separately; [MM-025](#mm-025), [MM-043](#mm-043).
- **Required behaviour:** Operators can distinguish platform/supplier/payment/recovery failures and correlate safe Account/Call/plan/node evidence across supported surfaces.
- **Success criteria:** Health/readiness are truthful; request IDs reach support; metrics separate discovery, quote, queue, supplier, recovery and settlement; logs exclude secret/raw customer payloads.
- **End condition:** Five-case authorised operational evidence and alert/runbook proof are linked through existing #284/ADR 0005 ownership; no duplicate Datadog configuration or trace store.
- **Supported implementation:** Reuse current Sentry/PostHog/metering/correlation and separately owned supported monitoring plan.
- **References:** [Health API][M-O]; [AE deployment/readiness][AE-DEP]; [Datadog owner][DD].

<a id="mm-042"></a>

### MM-042 — Recovery, availability and retained evidence operations

- **State:** open · Scoped recorded runtime; sustained/joint restore unknown. **Priority/wave:** P1 · F5.
- **Owner / dependencies:** Operations / execution / finance; [MM-021](#mm-021), [MM-027](#mm-027), [MM-033](#mm-033), [MM-041](#mm-041).
- **Required behaviour:** Accepted work and economic evidence remain recoverable through worker outages, stale evidence and the supported backup/restore window.
- **Success criteria:** Fail closed on stale readiness/cash evidence; restore preserves accepted effect identity, result accessibility and ledger reconciliation; recovery does not buy work again.
- **End condition:** Approved joint restore/failure and evidence-expiry observations pass with exact environment/revision/time/RPO/RTO receipts. Historical 20 payments do not prove indefinite availability.
- **Supported implementation:** Use existing operational records and supported provider/database backup mechanisms; no new backup subsystem.
- **References:** [Durable job contract][M-J]; [AE deployment proof limits][AE-DEP]; [operational owner][DD].

<a id="mm-043"></a>

### MM-043 — Data recipients, privacy, retention and deletion

- **State:** open · Current approved alpha contract; full lifecycle proof partial. **Priority/wave:** P1 · F1/F4/F5.
- **Owner / dependencies:** Data / security / product; [MM-001](#mm-001), [MM-009](#mm-009).
- **Required behaviour:** At discovery and purchase, users know which fields reach platform/models/Provider/payment systems and what is retained, shared or deletable.
- **Success criteria:** Data releases match current terms; no private results in public receipts/telemetry; content purge and financial/audit preservation differ; blockchain erasure and Australian-only processing are not falsely promised.
- **End condition:** Recipient disclosures, two-Account read isolation, expiry/purge/offboarding and sensitive-field absence pass across all personas and supported rails.
- **Supported implementation:** Keep canonical privacy contract and authenticated content storage; respect actual Provider/funding terms and approved alpha retention.
- **References:** [Mercator privacy][M-PRIV]; [Tempo privacy][T-TEMPO]; [AE privacy contract][AE-PRIV].

<a id="mm-044"></a>

### MM-044 — Payer-proven immutable job and Tool reviews

- **State:** open · Partial existing ratings; workflow/node review parity missing. **Priority/wave:** P1 · F5/Literal.
- **Owner / dependencies:** Feedback / market / authority; [MM-027](#mm-027), [MM-029](#mm-029).
- **Required behaviour:** The original authorised purchaser can review a terminal job and its selected Tool nodes for free, without fabricating a purchase or transferring value.
- **Success criteria:** Terminal/payer proof binds the review; identical body replays safely, changed review conflicts; rating/tags/node ownership validate; documented review retention covers 90 days.
- **End condition:** Hosted original-payer review, replay/conflict/wrong-payer/nonterminal/retention tests pass and later selection uses only authorised relevant feedback.
- **Supported implementation:** Extend existing review/rating actions and canonical purchase provenance; use supported proof/auth primitives rather than copying a wallet-key access model.
- **References:** [Review contract][M-REVIEW]; [AE feedback baseline][B]; [Agent operating contract][AE-OP].

<a id="mm-045"></a>

### MM-045 — Review eligibility, reward and independent settlement

- **State:** open · Missing rewarded workflow-review equivalence. **Priority/wave:** P1 · Literal.
- **Owner / dependencies:** Feedback / finance / abuse controls; [MM-033](#mm-033), [MM-034](#mm-034), [MM-044](#mm-044).
- **Required behaviour:** Eligible timely reviews can receive the documented incentive, with queued/submitting/paid/failed/ineligible reward truth separate from job/refund state.
- **Success criteria:** Preserve five-minute window, retained spend strictly above 0.01 and 0.01 MACH reward for literal parity; safe replay prevents duplicate reward; status can resume payout and is not falsely advertised as effect-free.
- **End condition:** Approved incentive economics/abuse policy and authorised eligibility/boundary/retry/settlement proof pass. Ratings without rewards do not close this literal item.
- **Supported implementation:** Reuse ledger/economic workflow and immutable review record; official credit/payment adapter after scope approval.
- **References:** [Review/reward rules][M-REVIEW]; [Reward status][M-REWARD]; [AE finance boundary][B].

<a id="mm-046"></a>

### MM-046 — Browser-bound GitHub/X credit campaigns

- **State:** open · Missing social-grant behaviour. **Priority/wave:** P1 · Literal.
- **Owner / dependencies:** Growth / authority / finance; [MM-007](#mm-007), [MM-035](#mm-035).
- **Required behaviour:** A user can inspect campaign availability and explicitly claim the evidenced credit grant through a secure browser OAuth handoff.
- **Success criteria:** One grant per wallet/Account per campaign across providers; browser/callback binding, replay, eligibility and unavailable-config cases refuse safely; Agent handoff alone makes no claim.
- **End condition:** Approved campaign/entitlement/abuse rules plus authorised claim callback/status/grant proof pass, with duplicate/cross-session negatives. Do not count promotional Admin credit as this capability.
- **Supported implementation:** Use official GitHub/X OAuth and existing economic grants; no guessed user identity or automatic social posting.
- **References:** [Claim handoff][M-CLAIM]; [Campaign API][M-O]; [MACH grants][M-MACH].

<a id="mm-047"></a>

### MM-047 — Curated quick-start suggestions

- **State:** open · Partial existing suggestions. **Priority/wave:** P2 · F1/F5.
- **Owner / dependencies:** Market / content / DX; [MM-010](#mm-010).
- **Required behaviour:** Users and Agents can find useful bounded starter requests that connect to real supported supply without copying example input as their own data.
- **Success criteria:** Free suggested-query list is bounded, understandable and distinguishes title/task/provider hints; examples map to live schemas and handle unavailable supply.
- **End condition:** At least one supported successful starter per agreed representative capability category passes guide-led discovery → result; source/schema drift check is in place.
- **Supported implementation:** Reuse current suggestions and editorial examples derived from exact admitted Tool schemas.
- **References:** [Suggested queries][M-SUG]; [Routing examples][M-EX]; [AE guide][G].

<a id="mm-048"></a>

### MM-048 — Product feedback, bug reporting and support

- **State:** open · Partial existing support; exact tool handoff unproved. **Priority/wave:** P2 · F1/F5.
- **Owner / dependencies:** Support / DX; [MM-025](#mm-025), [MM-043](#mm-043).
- **Required behaviour:** A user can get help or authorise one sanitised feedback report with expected/actual behaviour, reproduction and safe correlation reference.
- **Success criteria:** User authorisation precedes sending; secrets/raw payloads absent; unknown job ID omitted; uncertain non-idempotent delivery is not blindly retried; support channel and rail remedy are documented.
- **End condition:** Guide-led support discovery and authorised report/uncertain-delivery/privacy cases pass without sending an unsolicited report during this review.
- **Supported implementation:** Use existing support/reporting component and current issue/correlation facts; no new messaging pipeline.
- **References:** [Product feedback][M-BUG]; [Contact][M-CONTACT]; [AE operating guide][AE-OP].

<a id="mm-049"></a>

### MM-049 — Bounded CLI setup telemetry and coarse defaults

- **State:** open · Partial/unknown equivalent public telemetry contract. **Priority/wave:** P2 · F1/F5.
- **Owner / dependencies:** DX / privacy; [MM-043](#mm-043), [MM-052](#mm-052).
- **Required behaviour:** Setup diagnostics can report bounded anonymous events and use coarse country defaults with explicit current policy, without exposing credentials or purchase payloads.
- **Success criteria:** Telemetry schema caps, sensitive-field absence, opt-out/current choice and nonblocking failures pass; coarse location never invents tax/residency or authority.
- **End condition:** Released client policy and privacy tests match actual collection; GET country and POST telemetry purposes are covered. These ancillary behaviours cannot silently vanish from literal coverage.
- **Supported implementation:** Reuse supported analytics/current diagnostics; separate anonymous setup events from Account billing/audit evidence.
- **References:** [Telemetry/country API][M-O]; [Mercator privacy][M-PRIV]; [AE privacy][AE-PRIV].

<a id="mm-050"></a>

### MM-050 — HTTP contract and complete machine discovery

- **State:** open · Supported generated API; literal metadata paths differ. **Priority/wave:** P1 · F1/F5.
- **Owner / dependencies:** Protocol / docs / DX; [MM-010](#mm-010), [MM-013](#mm-013), [MM-025](#mm-025).
- **Required behaviour:** Integrators can discover the current API/actions/skills and exact request/response schemas from maintained machine-readable sources.
- **Success criteria:** OpenAPI, catalog/resource links, MCP card, skill index/skill/examples and semantic Markdown resolve consistently; current paths, scopes and errors match runtime; legacy compatibility is labelled.
- **End condition:** Generated-contract tests, link/drift checks and actual discovery/client consumption cover all 45 Mercator public operations in the inventory below or a documented compatible AE mapping.
- **Supported implementation:** Generate from action-owned Zod/OpenAPI/manifest and maintained protocol standards; keep editorial semantic docs separate from schema truth.
- **References:** [OpenAPI][M-O]; [MCP card][M-M]; [Agent skill][M-SK]; [Examples][M-EX]; [AE generator][AE-O]; [AE manifest][AE-M].

<a id="mm-051"></a>

### MM-051 — MCP transport, tool envelopes and actual clients

- **State:** open · Official MCP source supported; broad installed proof partial. **Priority/wave:** P1 · F1/F5.
- **Owner / dependencies:** Protocol / DX; [MM-005](#mm-005), [MM-050](#mm-050).
- **Required behaviour:** Supported MCP clients list authoritative tools, authorise, search/quote/execute/recover and consume results/resources across the declared protocol versions.
- **Success criteria:** Streamable HTTP, current negotiation/auth/challenges, input/result/error envelopes, notifications and resource links agree with REST; server-card advertisement alone is insufficient.
- **End condition:** Two named installed clients complete positive and recovery/negative journeys on an exact release. PR358 is retained; do not duplicate its delivered protocol work.
- **Supported implementation:** Reuse installed official MCP SDK/current action registry. Core subscription streams, ChatGPT Events and draft Tasks are separate surfaces; qualify them under MM-057–MM-060 rather than adding wire parsing or a new runtime.
- **References:** [Mercator MCP card][M-M]; [REST/MCP mapping][M-REST]; [AE PR358][PR358]; [AE manifest][AE-M].

<a id="mm-052"></a>

### MM-052 — Public CLI distribution and integration lifecycle

- **State:** open · Recorded public CLI 0.3.1 acceptance; 0.3.2 source/prepared, clean-client proof open. **Priority/wave:** P1 · F1/F5.
- **Owner / dependencies:** DX / release; [MM-005](#mm-005), [MM-051](#mm-051).
- **Required behaviour:** An ordinary integrator can install a supported released client, authorise, list/call tools, inspect status, update/refresh, diagnose and uninstall managed integrations.
- **Success criteria:** Supported OS/architecture artifact download, clean install, saved setup choices, no detected client/manual fallback, login/logout, tools/call, status/doctor, refresh/update/uninstall behave truthfully.
- **End condition:** Public artifact/package availability and two clean-machine/client lifecycle journeys pass with exact versions and checksums. Local source or unverified npx installation is insufficient.
- **Supported implementation:** Extend current CLI/release pipeline using supported package/host integration mechanisms; no unapproved installer execution now.
- **References:** [Installation][M-INSTALL]; [CLI reference][M-CLI]; [Downloads API][M-O]; [AE distribution limit][AE-DEP].

<a id="mm-053"></a>

### MM-053 — Separate local-wallet/direct REST mode

- **State:** open · Unknown/missing Mercator-compatible direct payer mode. **Priority/wave:** P1 · Literal.
- **Owner / dependencies:** Protocol / payments / DX; [MM-023](#mm-023), [MM-036](#mm-036), [MM-052](#mm-052).
- **Required behaviour:** Literal client parity includes a documented separate direct/local payment mode whose payer and authority are not confused with a hosted OAuth connection.
- **Success criteria:** Client signs through supported wallet tooling, retains budget/key/job refs and handles approvals/price changes; hosted login does not silently create a local wallet; secrets never enter tool prompts.
- **End condition:** Supported compatible direct-client purchase/recovery/history/review journey and wrong-payer tests pass after approved rail work. Stronger AE result authentication may remain.
- **Supported implementation:** Use official client wallet/payment tooling behind existing authority/payment ports; avoid a custom wallet and do not copy private-job-ID security.
- **References:** [Local CLI/auth modes][M-CLI]; [REST auth][M-REST]; [Review local payer][M-REVIEW].

<a id="mm-054"></a>

### MM-054 — Embedded MCP App and WebMCP discovery

- **State:** open · Missing/unknown equivalent embedded surfaces. **Priority/wave:** P1 · Literal.
- **Owner / dependencies:** Client/UI / protocol / DX; [MM-006](#mm-006), [MM-051](#mm-051).
- **Required behaviour:** A supported host user can open an embedded account/job view; a browser agent can use public search/describe through the evidenced WebMCP surface.
- **Success criteria:** User-only app launcher, balance/readiness, recent jobs/details and funding/receipt links respect current auth and no implicit payment; public WebMCP methods release only disclosed fields.
- **End condition:** Actual compatible host and browser demonstrations plus auth/privacy/no-side-effect negatives pass. Ordinary app/chat presence cannot close embedded-client parity.
- **Supported implementation:** Use maintained MCP Apps/WebMCP standards and the same actions/UI; no parallel purchase flow.
- **References:** [MCP App contract][M-CON]; [Mercator OpenAPI][M-O]; [Mercator docs][M-D]; [AE current surfaces][AE-M].

<a id="mm-055"></a>

### MM-055 — Four-persona docs and generated API reference

- **State:** open · Four persona guides and contract repairs in source; renderer/client acceptance open. **Priority/wave:** P2 · F1/F5.
- **Owner / dependencies:** Docs / DX / product; [MM-005](#mm-005), [MM-050](#mm-050), [MM-052](#mm-052).
- **Required behaviour:** Ordinary users, organisation admins, Agent integrators and Providers can learn and finish their own supported journeys using truthful customer/developer docs.
- **Success criteria:** Persona entry points explain actors, setup, use, results/recovery, spending/receipts, data/support and lifecycle; API/MCP/CLI references derive from real schemas/releases; proposed work is labelled.
- **End condition:** Four guide-led journeys pass; schema-valid examples, links, generation drift and pinned docs SSR/build checks pass. A new docs deployment is not part of this register-building request.
- **Supported implementation:** Use current Markdown/foundations and action schemas; trial supported Fumadocs/TanStack/OpenAPI generation before adoption.
- **References:** [Mercator docs][M-D]; [AE guide][G]; [docs architecture][B]; [Fumadocs TanStack][S-DOC]; [OpenAPI generation][S-OAPI].


#### 7 October implementation and evidence boundary

**Disposition: in-progress; MM-055 remains open.** Source baseline
`3da6013d2865b20c5dc629b8cd59930678a19790` plus the uncommitted candidate in the
canonical checkout. Root coordinated Sol evidence/patch/review assignments and
applied bounded changes as the sole canonical writer; unrelated whitepaper and
strategy edits were preserved. No new branch, operation registry, lifecycle,
docs app, repository, public push or deployment was created.

The public-contract inventory is derived from [registered actions](../../src/modules/actions/index.ts),
[HTTP generation](../../src/modules/discovery/internal/openapi-agent-routes.ts),
[MCP admission](../../src/lib/server/mcp-api.ts) and [CLI contracts](../../tools/ae/lib).
At this source there are **51 registered actions** (10 public, 41 protected),
**68 generated OpenAPI operations on 62 paths**, **44 role-admitted MCP Tools**
(3 anonymous, 29 buyer, 20 Provider with overlap), and **25 CLI command roots**.
These counts are a dated coverage check, not a second operation registry.

| Existing owner group | Inventory coverage and contract boundary |
| --- | --- |
| Registry (6 business/portfolio, 4 Tool actions) | Public listing/search/describe/compare and external discovery; exact Tool refs, callable/readiness distinction, source-bound cursors and hard filters. Private saved needs are not purchases. |
| Agent access (3), funding (3), feedback (1) | Server-resolved Principal/Account; scope, environment, current grant and funding remain separate. Feedback acceptance is ingestion and has no safe automatic retry. |
| Market requests (4), saved Tools (3) | Authenticated owner-bound lifecycle; saved selections do not bypass fresh Quote/current authority. |
| Execution (3 Quote/procure/Call), Plans (4), Call history/recovery (4), journey status (1) | Owner schemas define input/defaults/limits and tagged outcomes. Quote may disclose input before purchase; same purchase identity survives interruption. Plan/procure persistence is manual, Call CLI journal automatic. Cancellation, delivery, settlement and purchase resolution remain distinct. |
| Supply (15) | Provider scope, Business entitlement, Connection and publication revision/source identity. Three connect variants are represented; programmatic preview/publication remains x402-only. Agent earnings is unavailable. |
| HTTP beyond registered actions | Two funding preflight, six utility, one payer-funding, three chat and five HEAD operations complete generated coverage. Route owners separately cover OAuth registration/authorize/device/token/revoke, protected-resource/auth metadata, MCP protocol, directory and chat boundaries. |
| Browser/operations and machine publication | Owner session/member/invitation/Agent/Plan controls, personal export, admin metrics, signed webhooks/internal service routes and health/readiness are not public Agent operations. Sandbox reference routes remain development-only. Manifests/OpenAPI/SKILL/glossary/llms/sitemap/robots and negotiated Markdown retain their actual public projections; `/for-providers` and arbitrary docs do not acquire Markdown routes. |

For identity/authority, input/effects, outcome/continuation, recovery and
compatibility, the [cross-transport policy](../designs/agent-operating-contract.md#cross-transport-contract-policy)
is the review contract; owner schemas and handlers remain implementation truth.
Generated JSON Schema expresses structural constraints; custom semantic predicates
and cross-field relationships still require owner validation.
Unknown runtime, retention, installed-client and unsupported membership/Provider
capabilities retain their existing MM acceptance gates. Inventory completeness
is not qualification of every operation on every transport.

| Significant finding / owner | Classification and severity; consequence | Current mitigation / smallest correction in this candidate | Compatibility cost and evidence boundary |
| --- | --- | --- | --- |
| [OpenAPI request projection](../../src/modules/discovery/internal/openapi-operations.ts), [MCP outputs](../../src/lib/server/mcp-api.ts) · Protocol/DX | Contract defect, P1: omitted root constraints and generic outputs let clients form or accept invalid values. | Preserve owner root schemas; represent identity branding without losing string constraints; derive exact outputs and fail on unsupported schema conversion. | Wire values unchanged; exact metadata grows. Cached descriptors and 40 KB pages bound each response, not total context (~347 KB for all 44 Tools). Named installed clients remain unqualified. |
| [Search continuation](../../src/modules/registry/tool-choice-contracts.ts), [CLI](../../tools/ae/commands/search.ts) · Registry/DX | Contract defect, P2: retry/page/broaden could lose filters, source, limit or original cursor. | Preserve returned scope and same cursor for retry; broaden retains hard filters and clears cursor; legacy CLI fallback uses original arguments. | Coordinated pre-stability canonical output; no external consumers require a legacy profile. Opaque cursor unchanged. Local owner/route/CLI assertions cover it. |
| [Hard search constraints](../../src/modules/registry/tool-choice-contracts.ts), [price ceiling](../../src/modules/capability-supply/internal/tool-search.ts) · Registry/supply | Contract/implementation defect, P1: unknown directory facts or a price range's minimum could satisfy an asserted hard constraint and reach ranking. | Filter before ranking and projection; require evidence, use range maximum, and explain scoped insufficiency. Owner metadata spells out any-match effects/data-use facets rather than implying a permission allowlist. | Intentionally excludes previously overbroad results. No purchase/authority changes; unsupported geography remains explicit. |
| [Search disclosure](../../src/modules/registry/tool-action-contracts.ts) · Registry/protocol | Contract metadata defect, P1: semantic ranking sends query/candidate summaries while the descriptor claimed no recipient. | Declare disclosure and the configured Jev recipient with the existing concrete recipient projection. | More truthful metadata; scope, approval and spending authority do not expand. |
| [Provider next action and pagination](../../src/modules/capability-supply/provider-tool-status.ts), [CLI](../../tools/ae/commands/supply.ts) · Supply/DX | Contract/DX defect, P2: action-only continuations required guessed identity; CLI could not traverse the Provider inventory. | Return validated args plus missing caller input; surface absent identity and allow limit/cursor continuation. | Coordinated pre-stability output correction; caller still creates and retains write keys, historical refs unchanged. |
| [Provider Connection schema](../../src/modules/capability-supply/supply-action-schemas.ts) · Supply | Contract defect, P1: intersected shapes could not describe supported variants. | Strict discriminated variants match the existing validators; no new adapter is implied. | Corrects published schema without broadening authority or preview/publish support. |
| [Maintenance projection](../../src/modules/capability-supply/provider-tool-status.ts), [republish](../../convex/lib/capabilitySupply/ownerFunnel/republish.ts) · Supply | Contract plus implementation defect, P1: callers lacked complete maintenance identity; republish left status attached to the old Tool. | Return coherent authenticated maintenance tuple and update the Provider Tool identity in the existing republish transaction. Wrong-tenant/stale identity remains withheld. | Canonical authenticated metadata; historical refs preserved. Existing publish/withdraw/republish fixture uses returned identity and verifies new status. Legacy stale records may still need owner repair. |
| [Quote](../../src/modules/capability-execution/quote.actions.ts), [Plan Quote](../../src/modules/capability-execution/plan/quote.actions.ts) · Execution | Disclosure/design defect, P1: read-only metadata obscured permitted live inspection and input release. | Mark disclosure/communication consequences truthfully; guides explain no purchase is not no outbound request. | More cautious MCP annotations; actual scope, pricing and authorization unchanged. |
| [HTTP normalization](../../src/modules/capability-supply/internal/route-transport-http-json.ts), [import](../../src/modules/capability-supply/internal/openapi-import/operation.ts) · Supply/execution | Implementation defect, P1: HTTP 202 could look delivered while only accepted. | Preserve existing continuation; without one classify unknown/no output. Sole-202 synchronous imports refuse. | Intentionally removes false success; payment truth remains independent. Local fixtures pass; full async completion stays MM-057 → MM-022. |
| [Earnings](../../src/modules/capability-supply/supply-management-service.ts) · Money/supply | Contract defect, P2: permanent absence looked like transient source failure. | Explicit nonretryable unsupported capability and owner earnings handoff. | HTTP, MCP and CLI receive the same owner discriminator. No new earnings facility or balance claim. |
| [Plan projection](../../src/modules/capability-execution/plan/runtime.schemas.ts) · Execution/DX | Design/docs gap, P2: attention states lacked a permitted next action and manual recovery limits were hidden. | Derive status/owner handoff/cancellation scope from existing lifecycle; preserve accepted per-Node Calls. Document retained Plan/procure identity. | Canonical continuation metadata; no second journal/engine, automatic retry or new authority. Local lifecycle evidence does not replace hosted restart proof. |
| [Canonical HTTP outputs](../../src/lib/server/plan-api.ts), [contract revision](../../src/modules/discovery/internal/openapi-document-builder.ts) · Protocol/release | Pre-stability design correction, P2: an unshipped profile split imposed two contracts without external consumers. | Removed profile helper, headers, cache variation and CLI injection; return validated owner outputs. OpenAPI contract revision is independent of app version. | Coordinated internal-client rebuild; no historical-data migration. Preserve accepted request/purchase identity. [Compatibility policy](deployments.md#public-contract-compatibility) governs external adoption. |
| [Guides](../foundations.md), [renderer trial](../designs/agent-operating-contract.md#documentation-architecture-and-publication-boundary) · Docs/DX | Docs gap plus unverified runtime, P2: stale Plan/release claims and presumed renderer support misled users. | Correct four persona handoffs, supported limits and release provenance; one canonical human/Markdown source and explicit public allowlist. | Earlier Fumadocs OpenAPI limits are retained below; the later Scalar Markdown pipeline qualifies the complete Call reference. Public sandbox and hosted four-persona journeys remain open. |

**Earlier local validation — 7 October 2026, before the pre-stability execution below.** `npm run check` passed lint, dependency,
web/Convex types, 75 import/boundary checks and the standards check. The final
26 affected existing suites passed **372 tests**; the separately selected rebuilt
workspace CLI journey passed **1 test** (25 other cases were not selected).
`git diff --check` and 443 local inline links across the eight changed guides and
records passed; the canonical skill remains 7,895 bytes. Independent Sol source
review found no additional evidence-backed blocker. This is source/fixture proof.

The owner OpenAPI generator at `https://ae.test/` produced 68 operations on 62
paths, 493,754 bytes of compact JSON, SHA-256
`31cd23a0d6326149f4ae168164a0808724a12110a9fe6ec3d9b9641f8a334d39`.
The digest identifies this local candidate artifact, not a hosted release.

**Next gates.** The installed workspace CLI fixture now starts at
anonymous search and uses the returned Tool through describe/compare, Call,
receipt and same-key replay. It still seeds supply/authority and mocks the
Provider: it is not a fresh public customer or newly downloaded released-client
acceptance. Existing local Plan lifecycle, isolation and Provider connection
fixtures are reused. Native Formance cases were not run because the local
Docker daemon/Formance service is unavailable; no daemon or production purchase
was started. The full merge/release gate and hosted tuple are still required.

The isolated pinned Fumadocs trial built and served one allowlisted guide plus a
constrained request reference, full machine-schema closure and private-page 404.
Default recursive response rendering and runnable generated examples failed
qualification. That earlier renderer was not adopted; the subsequent Scalar alternative below
provides the complete bounded human reference. References and exact versions are in the operating contract.

| Responsible area / remaining dependency | Next acceptance evidence |
| --- | --- |
| Docs/DX + authority/execution | Qualified safe discovery-to-useful-output environment without founder-only grants; then fresh-reader tutorial and all four persona journeys. Record guessed fields, manual handoffs, corrective attempts, unnecessary requests and elapsed time. No competitor execution is claimed. |
| Protocol/DX + release | Rebuilt/installed client and actual MCP harness qualification across complete paginated metadata, the canonical contract, schema digest and release tuple; retain previously accepted purchase recovery. |
| Execution/authority/money | Native sandbox response-loss/restart, approval/partial/reconciliation and authority-change consequences; reuse recorded two-Node Plan proof without implying fresh hosted acceptance. |
| Supply/protocol | MM-057 maintained SDK qualification before MM-022 real async acceptance-to-final-output; entitlement, publication, restart, maintenance and cleanup evidence. |
| Docs/release | Extend the qualified Call reference only after schema/example fidelity review. Keep the same-repository independent docs build allowlisted and qualify its release tuple before public deployment. |

### 7 October pre-stability execution

**Ownership and baseline.** The orchestrator is the only canonical writer on
`codex/chat-runtime-repair-2026-10-06`, HEAD `3da6013d`. Existing dirty work was
preserved; Sol implementers supplied isolated patches and independent readers
reviewed them. No branch, worktree, repository, deployment or new planning system
was created. This is a dirty source candidate, not that commit's released tree.
Wayfinder reused #256; pstack grounded sequencing, iceinvein challenged scope,
and technical-writing/unslop guided prose. Independent Sol reviews did not supply
formal `/plan-eng-review` clearance: its installed skill lacked the referenced
`sections/review-sections.md` resource. Source, fixture, browser and reader proof
remain separate evidence levels.

**Initial implementation milestone; superseded by the bounded closeout below where stated.**

| Package / owner | Result and evidence | Remaining gate |
| --- | --- | --- |
| Registry / supply | Hard filters run before semantic ranking and at projection; unknown facts fail closed with explicit scoped evidence. Range price uses its maximum for a hard ceiling. Query/candidate disclosure is declared. Source-owned network/provider/price-band filtering remains. | More supply facts require owner evidence, not relaxed filters or inferred location. |
| Supply / CLI | Typed continuation args preserve maintenance identity and name caller-required keys; unavailable identity/source preview is explicit in machine, UI and CLI output. Provider inventory accepts/prints limit and opaque cursor continuation. | Legacy records missing maintenance identity retain owner repair; no invented revision/key. |
| Protocol / execution | Removed the unshipped response-profile split and rebuilt internal CLI. Canonical outputs retain Plan continuation, command material, authority and cursor assertions. Contract revision is `1.0.0-alpha.1`; no body/hash/signature/purchase migration. | Actual released client/protocol and hosted tuple qualification before external onboarding. |
| Docs / DX | Official private Fumadocs app, isolated npm lock, Scalar linked Markdown, canonical skill and raw OpenAPI. Fifteen approved pages include four persona sections, CLI, glossary, compatibility and Call plus seven models. Publication code is limited to the three existing `tools/docs` files. | Only Call human reference is renderer-qualified; other operations remain available in the full owner OpenAPI. No public deployment performed. |
| Independent reader | Guide-only Sol review confirmed readable Call outcomes, keyboard search and 390×844 mobile navigation. Fixed missing jq prerequisite, customer-to-CLI/reference links and searchable Customer title. | No qualified candidate install tuple or public safe sandbox. Outcome examples lack individual upstream anchors; all branches remain visible under the response heading. Broader exact-schema/recovery handoffs still need expanded reference coverage and direct links. |

**Local verification.** `npm run check` passed after separating docs-tool types
from the application's type graph; no heap increase or omitted typecheck. The
focused API suites passed 213 tests; the subsequent owner/UI/CLI/MCP suites passed
88. OpenAPI, authority/isolation and Provider maintenance fixtures passed 21;
six native Plan cases were skipped, not qualified. These runs overlap and are not
a cumulative unique-test count. Two selected existing Call lifecycle/installed-CLI
fixtures passed, including discovery through returned references, receipt, same-key
replay and revoked-grant consequences; 24 unselected/native cases were not run.
The CLI fixture still seeds authority/supply and mocks Provider delivery.

`npm run docs:build` qualifies source examples, publication inputs, actual HTML
routes/anchors, assets and raw artifacts. All 24 rendered examples match valid
owner annotations; eleven negative pipeline probes reject private links, images,
MDX/imports, remote refs, an expanded schema closure, missing examples, untracked
source drift, symlinks, extra pages and changed guides. The local browser verified
visible authentication/errors and pending/expired/uncertain outcomes, Markdown
copy, theme change, search, LLM routes, unchanged OpenAPI/SKILL and private-route
404s, with no hydration errors or external resource requests. These are local
readbacks, not production proof or a complete competitor benchmark.

The raw spec still derives 68 operations on 62 paths. Observed pre-editorial-fix
sizes were 15,298 bytes for the Call Markdown, 68,817 for `llms-full.txt`, and
2,312,859 bytes of browser JavaScript before compression; later text changes may
adjust bytes. The source-snapshot/contract/lock digests in generated provenance
identify each exact build. The per-page route avoids requiring the full agent
index or OpenAPI for every question.

#### 7 October docs and contract closeout

**Source result.** The same private Fumadocs app now builds 224 approved pages:
eleven maintained guide/concept selections, one API index, 59 Scalar operation
pages, nine explicit raw-OpenAPI fallbacks and 144 reachable schema pages. All 68
advertised HTTP operations are accounted for; the owner document retains 170
schema components. Eight fallback operations contain positional tuples Scalar
1.5.2 omits; Plan Quote also needs its material `propertyNames` constraint. These
are honest reference limits, not missing operations or qualified human renderings.
The original Call/seven-schema/24-example proof remains; the expanded publication
contains 81 rendered owner examples, including reuse. No invented examples are
published. The narrow generated-example sanitation and bounded fidelity checks
are recorded in the [design owner](../designs/agent-operating-contract.md#current-implementation-fumadocs-with-scalar-markdown).

Start here now leads through the four personas, authority, purchase entry choices
and same-Call recovery. Existing authored sections remain their sole owners.
Official Fumadocs page-tree metadata, search, layouts, Markdown routes and components
supply the presentation. The build allowlist covers metadata, JSON, search,
Markdown, browser assets and emitted HTML; no internal document follows a public
link into publication. Fallback pages derive method/path/authentication from the
same owner document and explain JSON Pointer and `$ref` navigation. Their links
use the upstream native-link option for the same build's JSON artifact.

| Finding / owner | Consequence and severity | Correction, mitigation and compatibility |
| --- | --- | --- |
| Schema projection / Protocol | P1 contract defect: OpenAPI 3.1 included 17 draft-07 array-valued `items`; native Zod conversion also omitted runtime-enforced tuple lengths. Clients could generate invalid requests or misread outcomes. | Native 2020-12 OpenAPI plus shared tuple-arity correction for OpenAPI, MCP and draft-07 Agent/CLI descriptors; retain `$ref` siblings. Runtime Zod remains authoritative. Normalized comparisons preserve all 51 action descriptors apart from 16 corrected tuple bounds. Raw provider schemas retain their existing diagnostics path. Regenerate pre-stability clients; no accepted-payload, purchase, hash or historical-data migration. |
| MCP list envelope / Protocol | P2 implementation defect: the SDK added 116 bytes absent from page admission, allowing a 40,062-byte result under a 40,000-byte promise. | Reserve the actual SDK result type and server metadata before adding descriptors. Keep the 40 KB limit and complete schemas; callers follow the existing opaque cursor. No protocol change. |
| Exact-reference browser handoff / Docs | P1 docs defect: client routing intercepted the nine raw OpenAPI links and displayed 404, although native fetch returned JSON. | Fumadocs native-link option; ordinary browser clicks and fresh direct navigation verified. All 18 operation/index handoffs pass. No added route or renderer. |
| Current Tool facts / Chat | P2 implementation defects: unavailable supply invited input review, earlier search facts displaced later detail, and external lookup hints disappeared on follow-up. | Existing owner projections suppress unavailable/external review narration, select later facts per returned reference and retain external lookup hints. Hints do not enter canonical callable references or confer authority; fresh detail/Quote guards remain. Preserve legacy saved-row interpretation. No stored transcript migration. |

**Verification and arbitration.** `npm run docs:build` passed all 224 pages,
81 rendered owner examples and emitted-output checks. Six focused negative probes
reject mismatched constraint values, ambiguous examples, omitted tuple/property-name
constraints and unapproved operation pointers. Repeated identical constraints on
different nested fields are not independently tied to their source paths by the
Markdown verifier; raw OpenAPI stays authoritative. No claim of complete semantic
renderer equivalence or competitor runtime parity is made.

A fresh Sol reader used only the built guides and browser. Keyboard search,
390×844 mobile navigation, 31 distinct anchors, sampled Markdown copy parity,
authentication/recovery handoffs and all nine fallback pages passed after fixing
the findings above. Zero off-origin requests or normal-page console errors were
observed. Cold home loaded 17 responses / 1,662,063 decoded bytes in the initial
sample; these are local browser measurements, not compressed transfer or task
completion times. Reference-document comparison remains distinct from executing
Supermemory or another competitor.

The first full gate passed environment preflight, isolated anonymous backend
codegen and the public application build, then stopped on 15 unit failures
(9,266 passed). Review identified three candidate regressions, six stale contract
assertions, four unchanged chat behavior defects and two asynchronous assertion
races. The owning mechanics were corrected; assertions now follow all MCP pages,
retain truthful quote-disclosure semantics and wait for the actual alert/callback.
The 11 affected integrated suites pass 156 tests. Five chat suites pass 81 tests
against the exact two-file scratch candidate; final integrated gate evidence is
recorded below. Counts overlap earlier runs and must not be added together.

**Final staged qualification.** `npm run check` passes. The second full gate
passes the clean build/backend checks and all 9,281 unit tests (one skipped), then
reports 3,070 integration passes, 77 skips and three TODOs, with one stale public-
skill prose assertion failing. Only its two expected phrases were aligned with
the maintained skill; the unchanged HTTP/MCP/CLI retry and outage semantics then
pass in the focused integration rerun. The remaining exact gate stages pass:
type assertions, import/security boundaries, standards, SEO, source browser
(18 passed, 18 skipped), accessibility (18 passed), CLI package and final docs
build. The CLI package proof reports a reproducible workspace tarball and help
under its existing Node 20/22 compatibility checks; it does not qualify a published
client or connected harness. No disabled native-service test is counted as proof.

This is a staged result, **not a successful uninterrupted `npm run gate`**. Run
that command against the final merge/release candidate before merging; the current
work does not merge or release. No application source changed after the second
full gate began; the sole later test edit corrected the skill-copy assertions.
The source, fixture, local browser and hosted evidence levels remain separate.

Final generated provenance identifies dirty HEAD `3da6013d`, contract revision
`1.0.0-alpha.1`, source snapshot
`42d67efedd7cdd7894569089e7ec4fb6c259866ed31ac285abc16541042d7e63`
and contract digest
`6fd6356091453f8b6059bfa67e969ab65c8d58f16e4098a67d76a420231ead84`.
Both dependency locks remain unchanged in this closeout. The protected whitepaper,
strategy and pre-existing financial/supply edits match the starting snapshot.
The orchestrator integrated 33 changed paths; Sol patches/reviews used scratch
space. The local docs preview was stopped after readback. No publishing,
production write, paid Call, staging, commit or branch operation occurred.

**Still open:** MM-055 public sandbox, real installed-client/harness and all four
persona end conditions; native Formance approval/partial/restart evidence; uninterrupted final
merge/release gate on the frozen candidate; MM-057 → MM-022 real asynchronous
Provider completion. MM-056 broader parity is unchanged. The stable baseline is
not declared, and no paid production call or production write was performed.

<a id="mm-056"></a>

### MM-056 — Complete task and repeat-use parity acceptance

- **State:** open · Unknown beyond scoped existing payments; full parity not proved. **Priority/wave:** P1 · F5.
- **Owner / dependencies:** Product / supply / DX / execution / finance; [MM-012](#mm-012), [MM-014](#mm-014), [MM-029](#mm-029), [MM-031](#mm-031), [MM-034](#mm-034), [MM-055](#mm-055).
- **Required behaviour:** A customer’s existing Agent finds, chooses, buys, receives useful multi-Tool contributions within budget, recovers failures and returns without founder repair.
- **Success criteria:** Use at least two independently owned entitled providers, synchronous and asynchronous work, mapped graph, partial failure, receipts and recovery; REST and two installed clients agree; all four personas complete their guide.
- **End condition:** Comparable task corpus and owner-approved success/time/turns/cost/reliability/repeat-use thresholds pass in exact deployed releases. Close the whole goal only under the all-items rule below; literal gaps remain visible.
- **Supported implementation:** Run the reviewed supported sequence over existing components; collect sanitised receipts in existing deployment/journey records, linked by stable MM IDs.
- **References:** [Tempo benchmark claims][M-T]; [AE product outcomes][AE-PRODUCT]; [baseline/runtime ceiling][B]; [existing runtime records][AE-DEP].

<a id="mm-057"></a>

### MM-057 — Reuse qualification for remote tools and contracted Agents

- **State:** open · Partial: maintained SDK candidates identified; exact Provider/client fit unproved. **Priority/wave:** P1 · F2/F5.
- **Owner / dependencies:** Supply adapters / protocol / execution; [MM-013](#mm-013), [MM-014](#mm-014), [MM-021](#mm-021), [MM-051](#mm-051).
- **Required behaviour:** Choose the maintained protocol/Provider SDK that the actual remote counterparty supports, while Aecon retains purchase, authority and recovery ownership. This is a requested integration criterion, not an inferred Mercator feature.
- **Success criteria:** Compare conventional HTTP/official Provider SDK, MCP tools and an A2A client for an actual A2A Agent. Record package version, capability/auth evidence, idempotency, callback/cancel/result limits and mapping onto existing Calls; do not require one protocol everywhere.
- **End condition:** A pinned fit record and one supported fixture for the selected remote Provider demonstrate acceptance/result/restart/cancel boundaries. A separately authorised real Provider journey is still required by MM-022. Unsupported A2A or Tasks interoperability remains open.
- **Supported implementation:** Use parallel-web or @fal-ai/client when admitted supply supports them, and the maintained @a2a-js/sdk client only for a verified A2A Provider. No Aecon AgentExecutor, custom server runtime or extra TaskStore is introduced by default.
- **References:** [Reuse-fit design][R-FIT]; [Parallel TypeScript example][S-PAR-TS]; [fal queue][S-FAL]; [official A2A SDK][S-A2A]; [A2A push sample limits][S-A2A-PUSH].

<a id="mm-058"></a>

### MM-058 — ChatGPT MCP Events subscription and signed callback delivery

- **State:** open · Missing application surface; official client subset documented. **Priority/wave:** P1 · F2/F5.
- **Owner / dependencies:** Protocol / notification delivery / authority; [MM-004](#mm-004), [MM-007](#mm-007), [MM-021](#mm-021), [MM-051](#mm-051), [MM-057](#mm-057).
- **Required behaviour:** A supported ChatGPT Work cloud client can discover allowed domain events, subscribe, verify its HTTPS callback, renew and unsubscribe under the connected Account. Requested integration scope; no public Mercator Events claim is evidenced.
- **Success criteria:** Persist authorised subscription/filter/expiry/cursor state; same principal/callback/event/canonical arguments subscribe idempotently. Verify a fresh signed single-use challenge before delivery. Use connection-time guarded DNS/TLS, no redirects, signed bounded envelopes, stable event IDs, fresh retry signatures, duplicate/order handling, 410/413 stop, revocation rechecks and truthful replay-gap behaviour.
- **End condition:** Exact ChatGPT Work web/desktop-cloud client tests cover discover/list/subscribe, signed verification, restart/renew, positive authorised event, secret rotation, duplicate/burst/expiry/revocation and unsubscribe. 2xx proves receipt only, not downstream Agent completion. Local Codex/general clients are not claimed supported without proof.
- **Supported implementation:** Use the installed MCP SDK extension seam with the official OpenAI three-handler example, StandardWebhooks signing and existing Convex Workpool/notification patterns. Only event catalogue, Account-bound durable subscription metadata, authorised event projection and queue wiring are Aecon-specific; no custom signature, queue or retry engine.
- **References:** [Official OpenAI Events contract/example][S-EVENTS]; [Events draft][S-EVENTS-DRAFT]; [StandardWebhooks JavaScript][S-WEBHOOK]; [AE notification worker][AE-NOTIFY]; [reuse-fit design][R-FIT].

<a id="mm-059"></a>

### MM-059 — Core MCP subscription streams and notification publication

- **State:** open · SDK supported; AE tools listChanged false and per-request handler; domain event use unproved. **Priority/wave:** P1 · F2/F5.
- **Owner / dependencies:** Protocol / DX; [MM-051](#mm-051).
- **Required behaviour:** When the chosen client needs core tools/resources notifications, use negotiated subscriptions/listen streams and declared SDK event types. This stream is distinct from ChatGPT’s HTTPS domain-event webhook API.
- **Success criteria:** SDK owns acknowledgement/filtering/subscription IDs/SSE cleanup; publish only supported event types after authoritative changes. Test notification receipt/refetch, disconnect/reconnect and account isolation. Explicitly qualify shared-bus lifetime or distributed bus needs; an in-memory default is not durable replay.
- **End condition:** One pinned client/server integration proves the needed notification type and reconnection on the actual deployment, plus two-Account negatives. No domain-event webhook, persistent delivery or task support is inferred from core stream availability.
- **Supported implementation:** Reuse @modelcontextprotocol/server 2.3.0 createMcpHandler, handler.notify/bus and official client.listen examples. Reuse an appropriate supported pub/sub adapter only if deployment evidence requires it. Preserve per-request Server/principal isolation; share only an authorised publisher/bus, never mutable request authority. No hand-written SSE parser or default custom event broker.
- **References:** [Core subscription specification][S-SUB]; [official SDK guide][S-SUB-SDK]; [official server sample][S-SUB-SERVER]; [official client sample][S-SUB-CLIENT]; [AE MCP server][AE-MCP]; [reuse-fit design][R-FIT].

<a id="mm-060"></a>

### MM-060 — MCP Tasks extension qualification and durable Call projection

- **State:** open · Draft extension documented; complete maintained adapter/client interoperability unproved. **Priority/wave:** P2 · F2/F5.
- **Owner / dependencies:** Protocol / execution / DX; [MM-021](#mm-021), [MM-025](#mm-025), [MM-026](#mm-026), [MM-051](#mm-051), [MM-057](#mm-057).
- **Required behaviour:** Use asynchronous MCP Tasks only when the exact maintained adapter and consuming client implement the same negotiated extension. Existing durable Call/status/result remains the supported fallback; no custom Task engine is authorised.
- **Success criteria:** Record io.modelcontextprotocol/tasks support in both peers; durable-before-handle, tasks/get/update/cancel, input-required and terminal result/error semantics project existing Call authority. Do not send legacy 2025 tasks/result/list shapes on the 2026 extension. Every read/cancel rechecks current Account authority.
- **End condition:** A maintained version-pinned extension adapter and named real client pass create/resume/get/input/cancel/restart/negative tests. If no supported implementation/client exists, retain the REST/Call path and mark this optional integration criterion blocked; a draft schema or old SDK types cannot close it.
- **Supported implementation:** Prefer the official maintained Tasks extension integration when available and verified, over existing Call state. Installed SDK extension seams are not proof of a turnkey 2026 Tasks implementation. Do not build a protocol runtime, TaskManager or second task store from the draft.
- **References:** [Tasks extension][S-TASK]; [current draft specification][S-TASK-SPEC]; [Tasks migration SEP][S-TASK-SEP]; [client support matrix][S-CLIENTS]; [AE Call API][AE-E]; [reuse-fit design][R-FIT].

## Public contract inventory

The refreshed [Mercator OpenAPI][M-O] contains **43 paths / 45 operations**.
Every operation maps below. Coverage means registered, not implemented or
runtime-verified. Exact AE route spelling need not copy Mercator; the compatible
behaviour, schemas, auth and error mapping must be explicit. Auth server paths,
CLI commands, MPP/x402 challenge semantics and MCP-only tools also appear in their
item references rather than being silently omitted from this HTTP inventory.

| Mercator operation | Register items |
| --- | --- |
| `GET /openapi.json` | [MM-050](#mm-050) |
| `GET /health` | [MM-041](#mm-041) |
| `GET /index.md` | [MM-050](#mm-050), [MM-055](#mm-055) |
| `GET /about.md` | [MM-009](#mm-009), [MM-050](#mm-050), [MM-055](#mm-055) |
| `GET /contact.md` | [MM-048](#mm-048), [MM-050](#mm-050), [MM-055](#mm-055) |
| `GET /docs.md` | [MM-050](#mm-050), [MM-055](#mm-055) |
| `GET /privacy.md` | [MM-043](#mm-043), [MM-050](#mm-050), [MM-055](#mm-055) |
| `GET /auth.md` | [MM-005](#mm-005), [MM-050](#mm-050), [MM-055](#mm-055) |
| `GET /.well-known/api-catalog` | [MM-050](#mm-050) |
| `GET /.well-known/ard.json` | [MM-050](#mm-050) |
| `GET /.well-known/ai-catalog.json` | [MM-050](#mm-050) |
| `GET /.well-known/mcp/server-card.json` | [MM-050](#mm-050), [MM-051](#mm-051) |
| `GET /.well-known/agent-skills/index.json` | [MM-050](#mm-050), [MM-055](#mm-055) |
| `GET /.well-known/agent-skills/mercator/SKILL.md` | [MM-050](#mm-050), [MM-055](#mm-055) |
| `GET /.well-known/agent-skills/mercator/references/examples.md` | [MM-047](#mm-047), [MM-050](#mm-050), [MM-055](#mm-055) |
| `GET /.well-known/oauth-protected-resource` | [MM-005](#mm-005), [MM-050](#mm-050) |
| `GET /downloads/{version}/{artifact}` | [MM-052](#mm-052) |
| `POST /mcp` | [MM-036](#mm-036), [MM-037](#mm-037), [MM-051](#mm-051) |
| `POST /mcp/auth` | [MM-005](#mm-005), [MM-051](#mm-051) |
| `GET /v1/suggested-queries` | [MM-047](#mm-047) |
| `GET /v1/connection/status` | [MM-006](#mm-006) |
| `GET /v1/client-country` | [MM-049](#mm-049) |
| `GET /v1/services/search` | [MM-010](#mm-010), [MM-011](#mm-011), [MM-012](#mm-012), [MM-019](#mm-019) |
| `GET /v1/services/{serviceId}` | [MM-013](#mm-013) |
| `POST /v1/quote` | [MM-015](#mm-015), [MM-016](#mm-016), [MM-017](#mm-017), [MM-018](#mm-018) |
| `POST /v1/product-feedback` | [MM-048](#mm-048) |
| `POST /v1/telemetry/cli` | [MM-049](#mm-049) |
| `GET /v1/claims/config` | [MM-046](#mm-046) |
| `POST /v1/claims` | [MM-046](#mm-046) |
| `GET /v1/claims/{provider}/callback` | [MM-046](#mm-046) |
| `GET /v1/claims/{claimId}` | [MM-046](#mm-046) |
| `GET /account/api/overview` | [MM-006](#mm-006), [MM-032](#mm-032), [MM-035](#mm-035) |
| `POST /account/api/funding/orders` | [MM-035](#mm-035) |
| `GET /account/api/funding/orders/{orderId}` | [MM-035](#mm-035) |
| `POST /account/api/funding/orders/{orderId}/confirm` | [MM-035](#mm-035) |
| `POST /account/api/funding/checkout/apple-pay/validate` | [MM-035](#mm-035) |
| `POST /v1/jobs` | [MM-016](#mm-016), [MM-018](#mm-018), [MM-020](#mm-020), [MM-021](#mm-021), [MM-022](#mm-022), [MM-023](#mm-023), [MM-024](#mm-024), [MM-033](#mm-033), [MM-036](#mm-036), [MM-037](#mm-037) |
| `GET /v1/jobs` | [MM-027](#mm-027) |
| `GET /jobs/shared/{shareId}` | [MM-039](#mm-039) |
| `GET /jobs/shared/{shareId}/card.png` | [MM-039](#mm-039) |
| `GET /v1/jobs/{jobId}` | [MM-021](#mm-021), [MM-025](#mm-025), [MM-027](#mm-027), [MM-028](#mm-028), [MM-029](#mm-029), [MM-033](#mm-033), [MM-034](#mm-034) |
| `GET /v1/jobs/{jobId}/results/{nodeId}` | [MM-030](#mm-030) |
| `GET /v1/jobs/{jobId}/artifacts/{nodeId}` | [MM-031](#mm-031) |
| `POST /v1/jobs/{jobId}/feedback` | [MM-044](#mm-044), [MM-045](#mm-045) |
| `GET /v1/jobs/{jobId}/feedback` | [MM-045](#mm-045) |

Additional documented surfaces: `fund_wallet` → MM-032/MM-035;
`claim_wallet` → MM-046; `open_mercator` and `ui://mercator/app-v8` → MM-054;
WebMCP public search/describe → MM-054; OAuth registration/authorise/token/refresh/
revocation → MM-005/MM-007; CLI login/logout/tools/call/setup/status/account/
refresh/doctor/uninstall/local → MM-052/MM-053. Describe/search selector mismatch
and empty execution descriptors observed in the baseline remain claim limits,
not evidence of hidden provider adapters. No public cancel operation was found.

## Four-persona completion proof

MM-055 and MM-056 require these distinct journeys; a founder command cannot stand
in for a customer or Provider experience.

| Audience | Learn and accomplish | Receipt required |
| --- | --- | --- |
| Ordinary user | Find/compare useful supply, understand recipient/price/setup, obtain result, recover failure, see receipt and return. | Guide-led find → choose → use → useful result → recover/return, with exact spend and no founder repair. |
| Organisation admin | Understand ownership, membership, Agent identity/grants, funding, rotation/revoke, history and offboarding. | Two-Account negatives and real admin create/manage/revoke/recover journey under the supported roles. |
| Agent integrator | Install released client, authorise correct resource, use exact schemas/Quote/Call, retain refs/keys and recover async/partial work. | REST and two installed clients, versions recorded, including refresh, wrong scope, response loss, restart and selected artifact/result. |
| Provider | Establish entitlement/Connection, import/test/publish exact contract, deliver/recover, withdraw and understand earnings/remedy/offboarding. | Two independent Provider journeys with synchronous and asynchronous delivery plus failure/earnings/offboarding proof. |

## Register engineering review

The prior full ADR 0006 review is retained. This follow-up applies installed
Wayfinder and `/plan-eng-review` to the register as the authorised target. It
introduces no runtime architecture. Recommended non-destructive documentation
choices are selected under the delegated-session rule; runtime approval is not
inferred. The installed skill’s missing external review-section file remains
noted in ADR 0006; complete inline sections supply the workflow.

| Section | Finding and settled register choice | Proof / remaining work |
| --- | --- | --- |
| Scope / architecture | R1: a second status ledger would diverge from #256/TODOS/ADR. Use this one stable MM-ID register; ADR retains dated evidence/design and links current status here. No general Agent runtime. | Four owned docs paths; Datadog preserved. Runtime architecture remains proposed in ADR 0006. |
| Code quality / contracts | R2: 27 broad baseline rows could hide distinct rails, incentives or endpoint behaviours. Retain 56 baseline acceptance items plus four requested reuse-integration criteria; map every public operation; required literal gaps stay open. | Structural validation checks IDs, fields, dependency cycles, operation inventory and references. |
| Tests / acceptance | R3: source support, fixture proof and end-to-end maturity are different. All items start open with existing bounded sub-proof retained; verify only after their named end condition. | Existing 145 foundation / 656 conformance passing tests are dated proof, not rerun or summed; 24 skips remain unproved. Required `npm run check` passed for this docs revision (lint, dependency/type/boundary checks and 76 import/standards tests). |
| Performance / maintenance | R4: a giant feature score hides critical dependencies. Use an index, stable anchors, short item records and wave/dependency ordering; benchmark task outcomes separately. | No fake aggregate maturity percentage or borrowed Mercator throughput. References/schema snapshots detect drift; future load tests belong to MM-020/MM-040. |

Review status: **DONE_WITH_CONCERNS** for register preparation. R1–R4 are addressed
in the artifact. Runtime end conditions, commercial/rail decisions and actual
client/provider access remain open; none is closed by this documentation change.
Outside voice/subagents: skipped. Reuse review added the core subscription-stream versus ChatGPT Events distinction,
2026 Tasks incompatibility with legacy shapes, and the requirement to project
existing Calls rather than create a job engine. Exact remote-client/provider
qualification remains open. See ADR 0006 for issue-by-issue alternatives.

## Sources and baseline receipts

Primary URLs below are exact. Semantic Markdown and OpenAPI refreshes match the
5 October baseline: docs SHA-256 `887e21da650cbd2634242d638271863cafd364c21493905d9e7d33a3524ddbc0`;
OpenAPI `615fdabc3dd11309185f31573537c4b93e6e7704778e34da408122d5ddcebcca`.
The delegated task keeps sanitised refresh/inventory/validation receipts;
ADR 0006 identifies original probe and test receipts. Retain those artifacts
with the handoff; raw customer payloads are not committed.

[WF]: https://github.com/CreasyBear/Agentic-Economy/issues/256
[B]: ../adr/0006-mercator-capability-foundations.md
[G]: ../foundations.md
[PKG]: ../adr/0004-bounded-service-packages.md
[DD]: https://github.com/CreasyBear/Agentic-Economy/issues/284
[I288]: https://github.com/CreasyBear/Agentic-Economy/issues/288
[I279]: https://github.com/CreasyBear/Agentic-Economy/issues/279
[PR358]: https://github.com/CreasyBear/Agentic-Economy/pull/358
[M-D]: https://mercator.sh/docs.md
[M-O]: https://mercator.sh/openapi.json
[M-A]: https://mercator.sh/auth.md
[M-M]: https://mercator.sh/.well-known/mcp/server-card.json
[M-SK]: https://mercator.sh/.well-known/agent-skills/mercator/SKILL.md
[M-EX]: https://mercator.sh/.well-known/agent-skills/mercator/references/examples.md
[M-T]: https://tempo.xyz/developers/blog/introducing-mercator
[M-PRIV]: https://mercator.sh/privacy.md
[M-CONTACT]: https://mercator.sh/contact.md
[M-P]: https://mercator.sh/docs#pricing-and-spending-limits
[M-MACH]: https://mercator.sh/docs#mach
[M-REF]: https://mercator.sh/docs#failed-job-refunds
[M-CLI]: https://mercator.sh/docs#cli-reference
[M-INSTALL]: https://mercator.sh/docs#installation
[M-OWN]: https://mercator.sh/docs#mercator-for-service-owners
[M-REST]: https://mercator.sh/docs#choose-rest-or-mcp
[M-COMB]: https://mercator.sh/docs#combine-services-in-one-job
[M-S]: https://mercator.sh/docs#search-services
[M-DESC]: https://mercator.sh/docs#describe-a-service
[M-SUG]: https://mercator.sh/docs#suggested-queries
[M-Q]: https://mercator.sh/docs#quote-a-plan
[M-CREATE]: https://mercator.sh/docs#create-a-job
[M-J]: https://mercator.sh/docs#get-a-job
[M-NODE]: https://mercator.sh/docs#get-node-results
[M-HIST]: https://mercator.sh/docs#list-and-recover-jobs
[M-CON]: https://mercator.sh/docs#check-connection
[M-FUND]: https://mercator.sh/docs#fund-wallet
[M-CLAIM]: https://mercator.sh/docs#claim-credits
[M-REVIEW]: https://mercator.sh/docs#review-a-job
[M-REWARD]: https://mercator.sh/docs#get-review-status
[M-BUG]: https://mercator.sh/docs#report-a-bug
[T-EXA]: https://exa.ai/terms-of-service
[T-PAR]: https://parallel.ai/terms-of-service
[T-FAL]: https://fal.ai/legal/terms-of-service
[T-COIN]: https://coinflow.cash/legal/terms-of-service
[T-TEMPO]: https://wallet.tempo.xyz/support/privacy-policy
[S-WF]: https://github.com/get-convex/workflow
[S-WP]: https://www.convex.dev/components/workpool
[S-PAR]: https://docs.parallel.ai/task-api/task-quickstart
[S-FAL]: https://fal.ai/docs/documentation/model-apis/inference/queue
[S-MPP]: https://mpp.dev/
[S-DOC]: https://www.fumadocs.dev/docs/manual-installation/tanstack-start
[S-OAPI]: https://www.fumadocs.dev/docs/integrations/openapi
[AE-PRODUCT]: ../../PRODUCT.md
[AE-P]: ../../src/modules/principal-account/principal/convex-schema.ts
[AE-AC]: ../../src/modules/principal-account/account/convex-schema.ts
[AE-B]: ../../src/modules/agent-access/issued-agent-binding.ts
[AE-A]: ../../convex/lib/authority/canonicalAgent/authority.ts
[AE-D]: ../../src/modules/authority/delegation/contracts.ts
[AE-C]: ../../src/modules/capability-execution/call-authority.ts
[AE-AUTH]: ../../src/lib/server/agent-access-auth.ts
[AE-PC]: ../../src/modules/capability-supply/provider-connection.ts
[AE-CC]: ../../src/modules/capability-contract/public.ts
[AE-Q]: ../../src/modules/capability-execution/quote.ts
[AE-CALL]: ../../src/modules/capability-execution/call-contracts.ts
[AE-ADMIT]: ../../src/modules/capability-execution/call-admit.ts
[AE-E]: ../../src/modules/capability-execution/call-entry.ts
[AE-HTTP]: ../../src/modules/capability-supply/internal/route-transport-http-json.ts
[AE-ADAPTER]: ../../src/modules/capability-supply/internal/transport-adapters.ts
[AE-O]: ../../src/modules/discovery/internal/openapi-agent-routes.ts
[AE-M]: ../../src/modules/discovery/internal/site-manifest.ts
[AE-OP]: ../designs/agent-operating-contract.md
[AE-ROUTE]: ../../PRODUCT.md
[AE-PRIV]: ../designs/platform-data-privacy.md
[AE-DEP]: ../operations/deployments.md
[R-FIT]: ../adr/0006-mercator-capability-foundations.md#reuse-first-integration-fit
[S-PAR-TS]: https://docs.parallel.ai/task-api/examples/task-enrichment
[S-A2A]: https://github.com/a2aproject/a2a-js
[S-A2A-PUSH]: https://github.com/a2aproject/a2a-js/tree/main/src/samples/agents/push-notification-agent
[S-EVENTS]: https://developers.openai.com/plugins/build/mcp-events
[S-EVENTS-DRAFT]: https://github.com/modelcontextprotocol/experimental-ext-triggers-events/blob/main/docs/design-sketch-proposal.md
[S-WEBHOOK]: https://github.com/standard-webhooks/standard-webhooks/tree/main/libraries/javascript
[S-SUB]: https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/subscriptions
[S-SUB-SDK]: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/clients/subscriptions.md
[S-SUB-SERVER]: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/subscriptions/server.ts
[S-SUB-CLIENT]: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/examples/subscriptions/client.ts
[S-TASK]: https://modelcontextprotocol.io/extensions/tasks/overview
[S-TASK-SPEC]: https://tasks.extensions.modelcontextprotocol.io/specification/2026-07-28/tasks
[S-TASK-SEP]: https://modelcontextprotocol.io/seps/2663-tasks-extension
[S-CLIENTS]: https://modelcontextprotocol.io/extensions/client-matrix
[AE-MCP]: ../../src/lib/server/mcp-api.ts
[AE-NOTIFY]: ../../convex/notificationWorkpool.ts


#### 7 October platform source-consistency uprev

**Scope and ownership.** Joel requested the comprehensive source uprev after the
docs closeout, explicitly prioritising source consistency. The orchestrator is
the sole canonical writer. Sol agents supply bounded scratch patches and
independent challenge; no branch/worktree, production write or release is part
of this pass. Starting source is dirty `3da6013d`; protected financial, supply,
whitepaper and strategy work remains owned by its existing authors. The earlier
closeout evidence above is historical, not acceptance of these new changes.

The source checklist is finite and separate from hosted maturity. Inventory is
derived from descriptors/routes: 51 registered actions, 44 MCP exposures, 42 CLI
exposures, 68 HTTP operations on 62 paths and 34 manifest endpoints. Exposure
differences remain explicit; these counts do not claim each CLI command maps
one-to-one to an HTTP operation. No parallel operation registry is added.

| Source acceptance item | Owner / dependency | Status / decisive evidence |
| --- | --- | --- |
| Advertised operation coverage and exact authentication, methods, errors, bounds and filters | Protocol/Registry; existing descriptor and route owners | Done — 51 actions expose both schemas; 68 HTTP operations/62 paths and all 82 advertised paths resolve, with zero missing/extra methods. Existing owner admission and source checks pass. |
| Canonical continuation grammar across Registry, Quote, Call, Plan, MCP, CLI and chat | Execution/Registry/DX; flat owner-specific action + args decision | Done — registered action + retained args, one primary operation, explicit human handoffs. Native Call refs are validated; historical malformed refs remain readable without invented runnable actions. Stored cursor and purchase identities remain intact. |
| Durable CLI recovery for Call, Plan run and exact procurement | CLI/Execution; existing journal and principal authority | Done — pre-submission persistence, original origin/Account/Agent fences, response-loss/restart and concurrent-process demonstrations. Version-1 readers/indexes remain; version-2 records extend the same locked store. |
| Truthful unresolved procurement and Call outcomes | Execution; existing effect and identity evidence | Done — no second inspection after an unresolved Quote checkpoint, no false financial completion, exact recorded money and explicit historical display limits. Same-Call observation and truthful MCP telemetry are qualified locally. |
| Funding and owner/payer handoffs | Money/Supply/Auth; no new authority | Done — exact session/status arguments, actor-specific browser handoffs, authenticated maintenance identity and proxy-safe canonical destinations. Funding still grants no purchase authority. |
| Purposeful response fields and measured representative budgets | Contract owners; independent Sol challenge | Done — input echoes removed from public Quote output only; owner-specific schemas preserve facts. Existing response and MCP descriptor budgets pass without relaxed caps; measurements below. |
| Maintained guides, public contract revision and generated reference agree | Docs/DX; all source packages | Done — alpha.2 guides/plugin/reference regenerated from owner sources; 228 approved pages, 68 operations, 61 rendered operations, seven raw fallbacks, 148 rendered schemas and 84 validated owner examples. Local browser and Markdown readbacks pass. |
| Focused mechanics, full source gate and independent final review | Orchestrator; integrated candidate | Done — npm run check and uninterrupted npm run gate both exit 0. Independent Sol review, exact schema-reference checks and final protected-file/hash checks pass. Runtime-dependent skips remain unqualified. |

**Design arbitration.** Wayfinder reuses the existing frontier and register;
pstack compared flat owner-specific continuations with a nested request union,
then selected the smaller flat grammar. The journal extends the existing locked,
durable store rather than creating a second purchase lifecycle. iceinvein runs
in its non-interactive mode under Joel's instruction to continue; no interview
or unavailable formal review is claimed. Supermemory v5 supplies the reference
for explicit namespaces, consistent names, changed defaults and bounded
representations; Stripe supplies same-key/material replay; HTTP/RFC 9457 keeps
acceptance, refusal and unresolved effects distinct. Reference documentation is
not evidence that Aecon executed a competitor or matches its runtime quality.

**Findings and coordinated corrections.** Severity describes the demonstrated
source defect, not a claim that it occurred in production. No external consumers
depend on this candidate; the alpha.2 migration table records the wire changes.

| Finding / classification / severity | Caller consequence and existing mitigation | Smallest owning correction / compatibility cost |
| --- | --- | --- |
| Discovery constraints could be ignored or admit unknown prices — implementation, high | A caller could mistake an unsuitable candidate for one within its hard ceiling. Quote and purchase spend admission still fence actual spending. | [Registry filter owner](../../src/lib/http/search-query.ts) refuses malformed supplied constraints; [price owner](../../src/modules/registry/internal/search-input.ts) and search projections retain exact meaning. Valid fixed/range upper bounds are compared in the same currency. Invalid/unknown cases now refuse or exclude: coordinated alpha change. |
| Plan/exact procurement lacked ordinary Call's durable CLI recovery — design, high | A restart could lose request material and encourage a second purchase. Backend idempotency protected only callers retaining the original identity. | [Existing journal](../../tools/ae/lib/call-recovery-journal.ts) gains version-2 records and [shared recovery](../../tools/ae/lib/purchase-recovery.ts), with owner/origin fences, locking and pre-submission persistence. Version-1 Call readers/indexes remain; no server data migration. |
| Procurement derived tax/net/refund facts from display amounts — implementation, high | Rounded display text could masquerade as accounting evidence. The original Quote and Call usage/receipt were the reliable mitigation. | [Procurement owner](../../src/modules/capability-execution/procure.ts) returns tagged exact evidence; [frozen storage reader](../../src/modules/capability-execution/procure-storage.ts) labels older caches `historical_display_only`. Alpha.2 output change; stored JSON, refs and hashes remain unchanged. |
| Lost Quote preparation checkpoint could trigger another inspection — implementation, high | Retrying a retained purchase could repeat external disclosure without proof of the first outcome. The durable identity fenced purchase submission but could not prove inspection completion. | [Procure adapter](../../src/lib/server/procure-api.ts) preserves identity and reports unresolved preparation; no automatic re-Quote. Persistent uncertainty requires support investigation. This explicit recovery limit replaces unsafe retry, not a new lifecycle. |
| Continuation aliases, dropped arguments and UI actions mixed with operations — contract/design, medium | Agents guessed transport routes, relaxed search scope or tried browser handoffs as API calls. Owner schemas and retained purchase IDs provided partial mitigation. | [Owner-composed continuation contract](../../src/modules/actions/contract.ts), Registry/Call/Plan/funding owners and maintained consumers use registered `action` plus `args`; missing caller input and human handoffs are explicit. Historical cursor/record readers are preserved; live alpha outputs and clients change together. |
| Terminal work or delivered output could imply resolved payment — contract/implementation, high | A caller could stop recovery with missing output or an unknown charge. Call usage/receipt and same-Call status remained authoritative. | [Call recovery projection](../../src/modules/capability-execution/call-recovery.actions.ts), [Journey status](../../src/modules/actions/status.actions.ts) and CLI journal retain uncertainty and observation. New `outcome-unknown` presentation and canonical next actions are coordinated alpha changes; no new paid retry is offered. |
| Schema/auth metadata disagreed with admission; OAuth bodies were not bounded at the frontdoor — contract/implementation, medium | Clients could request the wrong method/scope or accept inaccurate limits/errors; large authorization bodies consumed unbounded parsing work. Owner admission and signed raw material remained intact. | Discovery owners now derive exact method/scope/errors/defaults; [OAuth protocol](../../src/lib/server/agent-access-oauth/protocol.ts) bounds 16 KiB before store access and reuses the original body. Valid protocol vocabulary and signature material stay unchanged. |
| Provider cleanup return validator omitted existing x402/health fields — implementation, medium | Cleanup stored state, then failed its registered return validation; callback degradation hid the fault from a database-only assertion. Existing generation/digest authority checks still fenced effects. | [Internal return contract](../../convex/lib/capabilitySupply/providerConnections/contracts.ts) admits the exact existing optional fields; the existing lifecycle test checks registered replay output. Additive internal validator repair, no storage or public-authority change. |
| Redundant response material and repeated descriptor structure — design, medium | Quote input echoes and oversized MCP discovery consumed agent context without adding authority evidence. Pagination bounded individual pages, not total discovery cost. | Remove the public normalized-input echo while retaining its stored digest/material; compose per-action continuation schemas and compact only equivalent generated schema structure. Existing byte caps remain. Live output changes are in alpha.2; opaque identities stay fixed. |
| Guide/reference claims lagged implementation — documentation, medium | Readers were told to retain Plan/procure state manually or follow obsolete continuation aliases. Canonical schemas remained available but required source knowledge. | Existing guides, plugin skill and Markdown owners are updated once; official Fumadocs/Scalar regeneration retains the original OpenAPI and explicit rendering fallbacks. No second authored reference or operation registry. |

**Final source evidence.** The final uninterrupted source-gate run exited 0 on
7 October 2026 after correcting a stale native Call-reference fixture and
compressing the canonical agent guide within its unchanged 8 KiB budget while
retaining the established catalogue-outage wording. It
includes the public build, anonymous codegen check, lint/cycles, clean web/backend
types, **9,339 unit checks**, **3,079 integration checks**, architecture/type/SEO proofs,
browser journeys/accessibility, the built CLI package and the full docs build.
The unit suite retains one skipped case; integration retains 77 skipped cases
and three todos. Environment-dependent and paid checks were not enabled. Logs are
`/tmp/aecon-api-uprev-integrated-check.log` and `/tmp/aecon-api-uprev-gate.log`;
existing machine receipts remain under `output/release/`. No paid production
calls, production writes, publish, deploy, branch, worktree or commit occurred.

Final local descriptor measurements: buyer **253,814 / 260,000 bytes**, Provider
**139,947 / 140,000**, feedback **3,420 / 3,500**, largest descriptor **18,156 /
40,000**. Provider discovery has only 53 bytes of headroom; future descriptor
changes must requalify the existing cap. All 44 output descriptors contain 487
closed schema references, with zero dangling targets; literal examples/defaults
remain data. Legacy and current official MCP clients compile the descriptors.
Representative owner fixtures measure three search results with disclosure at
2,763 bytes, committed Quote at 986, unchanged status with next at 363, uncertainty
at 564, and refusals at 366–582. These are reproducible local fixture measurements,
not universal response caps or a competitor execution benchmark.

The final built docs browser readback verifies human/Markdown recovery commands,
Call authentication and 413/415 errors, alpha.2 raw OpenAPI, upstream search and
a 390-pixel mobile page without horizontal overflow or client errors. The original
OpenAPI remains unchanged by rendering; fallback fragments resolve against this
same build. Public provenance records dirty source `3da6013d` with source digest
`0520fbee5431dd09a979bdd52cf8ecf3f37ffdba7f2054a8dab4c058335c2d25`. This is a local candidate,
not an accepted hosted release. All five protected files match the starting dirty
snapshot, including the separately owned supply and earnings work.

The comparison remains specific: [Supermemory v5](https://supermemory.ai/docs/migration/api-v5.md)
for namespaces, consistent filters and explicit outcome/migration meaning;
[Stripe](https://docs.stripe.com/api/idempotent_requests) for retained request
identity; [HTTP 202](https://www.rfc-editor.org/rfc/rfc9110.html#name-202-accepted)
and [Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html) for honest
acceptance/errors. Aecon retains its separate authority, Hold, delivery, charge
and purchase-resolution owners. Supermemory migration success remains
author-reported; no comparative runtime equivalence is claimed.

Completion of this checklist qualifies source only. MM-055 public sandbox,
installed clients/harnesses and persona end conditions, MM-057 → MM-022 real
Provider completion and MM-056 wider product parity remain independently open.

## 7 October platform UI upgrade

**Disposition: source integration; final repository qualification pending.** Joel
authorized all 16 platform audit findings and the selected REUI compositions,
including Table 9.2.6. Baseline is `84abbda0bd892b7f9688e53d84001e970ba32ab1`
plus the pre-existing Chat 3 candidate; unrelated whitepaper and strategy drafts
remain outside this change. One canonical integrator writes this checkout. Sol
owners prepared bounded patches and independently reviewed recovery and journeys.
This record extends [Wayfinder #256][WF], not the numbered maturity requirements.

Joel explicitly deferred authenticated/production journey qualification until
later. Local component fixtures and public loopback browsers are source evidence;
they do not close that deferred gate, MM-055 or MM-056. No paid Calls, production
writes, backfills, publishing, deployments or new worktrees were performed.

| Finding | Owner and source correction | Evidence / acceptance boundary |
| --- | --- | --- |
| F01 footer visibility | UI shell: only `.arc-site-footer` is hidden; action footers remain visible. | Shell and decision-card fixtures; public mobile/desktop review. |
| F02 unsupported ABN claims | Supply identity: remove ABN collection/checksum verification claims; retain real Provider identity owner. | Existing onboarding and validation fixtures. |
| F03 purchase disclosure | Execution/DX: chat and Agent approval share recorded accepted-Quote facts; historical unknowns remain unknown. | Approval/decision fixtures; no current Tool fallback for missing purchase facts. |
| F04 security impact | Identity/UI: unassessed financial impact is explicit, never an invented A$0. | Existing security-history fixtures. |
| F05 uncertain admin command | Admin: actor-scoped durable nonsecret operation identity and authenticated read-only receipt observation; local query-error retry boundary. | Unknown→reload, authority loss and MFA-cancel recheck fixtures; fresh command/edit blocked while original remains unknown. |
| F06 transient Plan reads | Execution/DX: retain confirmed same-scope Plan facts, continue safe observation after transient rejection, clear on refusal or scope loss. | Actual read union is available/refused; thrown transient reads were the gap. Plan owner-status fixtures cover this corrected diagnosis. |
| F07 discovery/comparison | Registry/UI: explain and enforce filter applicability, preserve exact admitted/external comparison identities, label failed reads as unavailable. | Market filter, comparison and real memory-router regression; public unavailable-state browser review. |
| F08 task continuation | DX: validated bounded intent through sign-in, setup, funding, receipt/Plan and admin investigation. | Route/context fixtures; navigation does not grant authority or repeat a purchase. |
| F09 Activity structure | UI/Execution: attention and recent outcomes lead; latest-50 Plan scope is separate from Call filters. | Activity/Plan scope fixtures and responsive composition review. |
| F10 inventory/earnings | Supply: owner-filtered name/text/date queries before opaque 50-row pagination; pending index readiness, retained maintenance context, fresh/retry earnings. | Owner-query/backfill and cursor fixtures; actual deployed index/backfill remains a release prerequisite. |
| F11 Account transitions | Identity/UI: current identity/session/organization evidence fences privileged destinations; committed route readiness replaces timer; active recovery guard also covers deliberate Account selection. | Workspace/shell and guard fixtures; external identity loss still removes stale protected content immediately. |
| F12 reconciliation evidence | Execution/UI: show required evidence and permitted reconciliation before submission. | Existing receipt/reconciliation review fixtures. |
| F13 completion/offboarding | Identity/Supply: authorized blocker handoffs, stable public completion after closure, original-operation observation, state-specific trial next action. | Workspace terminal-receipt, Provider offboarding race and trial fixtures. |
| F14 lifecycle completion | Registry/Identity/Supply: saved-need refs/status/withdrawal; bounded Team invitation/member pagination and mutations; interrupted Provider setup resumes with fresh attestation. | Existing owner fixtures; full backend-driven human journeys deferred by Joel. |
| F15 interaction consistency | UI: Base UI/REUI controls, touch sizing, invalid-state ARIA, route/step/record focus, narrow overlay owners. | Table keyboard/selection/focus and shell fixtures; public mobile/desktop browser review. |
| F16 composition/ownership | UI/DX: shared workspace navigation, compact work footer, upstream composition/provenance, dead caller-verified shell removal, deliberate docs/help return. | Updated DESIGN, exact upstream manifest, import/security checks and emitted docs boundary. |

The table migration replaces both existing v8 consumers and the independent
sortable-table implementation. `AeRecordTable` is the shared REUI integration;
the small legacy column descriptor adapter feeds that same engine. Exact bigint
ordering, missing-last treatment, stable IDs, guarded range selection and
return-focus survive. Layout controls work without authentication; persisted
preferences are allowlisted by user/Account/table/schema and contain no records,
queries, selections or authority. Numbered pages/totals appear only where owned
by the source; Provider inventory stays fixed at up to 50 with opaque cursors.

References: [REUI Data Grid](https://reui.io/docs/components/base/data-grid),
[TanStack 9.2.6](https://github.com/TanStack/table/releases/tag/@tanstack%2Freact-table@9.2.6),
and the selected official block links in [DESIGN](../../DESIGN.md#workspace-and-operational-presentation).
Root retained Base Nova, Aecon theme and shared primitive adaptations. The exact
upstream source manifest names the only two size exceptions; strict TypeScript
and security/import boundaries still apply. The full frontend check exceeded
4 GB; the frontend no-emit compiler budget is now 8 GB. Arc/Convex checks retain
their 4 GB budgets. This changes compiler capacity, not strictness.

REUI registry API validation and post-install checklist were completed. The
installed engineering-review, design and cognitive-load instructions informed
manual bounded reviews; formal gstack bootstrap/telemetry was not run and no
tool-generated clearance is claimed. The requested pstack skill was unavailable.
Wayfinder remains the existing frontier; no duplicate issue/register was created.

**Qualification:** final combined `check`, `gate` and source-fixture results will
be recorded here after completion. Independent public browser review covered
desktop/mobile app, Help/reference continuations and Fumadocs. It found no page
errors or page-wide overflow in reviewed views; unavailable/auth-loading states
do not prove populated authenticated behavior. Compare wording was corrected
when browser review exposed an unsupported removal implication.

**Market recut.** The opening now uses Arc HeroContent and approved Aecon assets.
Tool results keep readable summaries, exact identities and comparison controls.
The explicit Agent handoff carries the latest need and discovery constraints.
The Host page and picker query the full Host index instead of overview's twelve
suggestions or a grouping of loaded Tool pages. Whole-Host listing counts remain
separate from example Tool facts. Prefix and split cursors retain query and
generation scope. Existing constrained links retain their original Tool filters.

Independent Sol review reproduced a prefix `endCursor` decoding failure and a
combobox query-reset mismatch. Both corrections have focused behavioral evidence.
The eight affected market route, filtering, navigation, card/index, real Arc picker
and in-memory directory suites pass 172 tests. `npm run check` passes. The picker
journey covers lookup beyond twelve suggestions, obsolete responses and query
resets. The actual integrated browser composition passes category selection,
last-chip keyboard focus, form semantics and Agent handoff checks at 390, 768
and 1440 pixels. Desktop/mobile light/dark captures have no page errors or
horizontal document overflow. Actual loopback routes have no full site footer.
Populated screenshots use synthetic owner data and blocked external traffic;
they do not establish hosted catalogue availability. The final mobile choice
keeps native form/panel semantics and the existing Arc filter focus owner.
Repository `gate` remains required before merging this larger UI candidate.

Joel invoked pstack/Poteto Mode during this slice. The installed resources were
found in the Codex plugin cache at version 0.15.15 after the earlier skill lookup
missed them. Experience First, Subtract Before You Add, Model the Domain and
Prove It Works guided the final composition and verification. Technical writing
and unslop guided this record. Sol reviewers substitute for unavailable Cursor
model/agent roles; no formal unavailable-tool clearance is claimed.

**Provider recut.** UI owns the public composition; Supply retains all setup,
authority and publication mechanics. The selected reference is licensed
[REUI Hero 14](https://reui.io/preview/base/hero-14), retrieved through the configured
registry and inspected with the shadcn dry run. Only its split header and wide
media composition were integrated; shared primitives and theme were preserved.
`ProviderHero.tsx` records the upstream source hash and narrow adaptation, following
the existing Chat 3 convention without adding a vendor exception. The
forest/chalk/gold artwork was generated with image_gen and exported as responsive
local WebP assets. It carries no fabricated metric or product-state claim.

The opening now says “Put your API on the market” and identifies public x402 v2
on Base USDC. The installed REUI Stepper is an informational list, not completed
setup. The existing Arc FAQ explains admission, recipient control, check costs
and publication limits. The Add Tool target remains `/owner/operations/new`;
the signed-in funnel retains its authority owner. Domain review verified the
recipient signature proves control and does not authorise a payment.

The old `publishedTools` gallery was sourced from a bounded external-directory
projection. Its naming could imply actual first-party publication. The gallery,
unused loader/server export and obsolete loader-only test were removed after
caller inspection. The static page links to the real directory and no longer
requires backend availability for marketing content. No public supply contract
or purchase mechanic changed.

Independent Sol source and rendered reviews passed. Final `npm run check` and
the two affected test files pass (five tests). Tests caught missing word spacing
in split headings and button roles on navigation links; the source was corrected.
Browser evidence covers 320–1440px, desktop/mobile light and dark, no horizontal
overflow or page errors. Keyboard checks at 390/768/1440 verify the setup anchor,
FAQ, directory navigation and return, and the actual API-reference destination.
The Add Tool href is verified; authenticated setup is not executed. Local evidence
lives in the task workspace under `proposals/provider-page/`; this is source and
public loopback qualification, not hosted Provider acceptance.

`npm run gate` was attempted with production access disabled. It stops at the
development deployment-manifest preflight: missing `AE_FORMANCE_ENVIRONMENT`.
No subsequent gate stages ran. The release owner must provide the actual
development environment and rerun the gate. No deployment, paid Call or production
write was made. This recut does not close MM-014, MM-055 or the deferred journeys.

**Remaining acceptance:** release owner stages/backfills inventory and confirms
indexes before new indexed reads; Identity/Supply/Admin owners qualify real
Account switching, membership, publication/maintenance and uncertain-command
recovery in the later environment authorized by Joel. Record the actual
web/backend/contract/docs/client tuple in [deployments](deployments.md#platform-ui-candidate--7-october).
Source acceptance never silently checks off that deferred runtime work.


**8 October settings and Team recut.** UI owns composition; Identity retains all
access and invitation authority. Joel approved licensed
[REUI Profile 2](https://reui.io/preview/base/profile-2) and
[Solution Users 4](https://reui.io/preview/base/solution-users-4) after source and
rendered comparison. Five horizontal groups replace the second settings rail;
the active group exposes two or three native routes from the existing catalogue.
Profile 2 supplies section/card/field geometry. Existing page saves, deep links,
Clerk security ownership and leave guards are preserved.

Team now has one recorded member grid, a pending invitation queue and a stable
invite dialog. Existing owner handlers retain revision checks, MFA, pagination,
confirmation and uncertain-send readback. Member controls require matching durable
membership and recorded role; the Account key resets protected component state.
The block's demo totals, extra roles, history and bulk mutations are excluded.
Source hashes and adaptations live beside the imported compositions; shared
primitives and dependencies were not overwritten. The unused Arc member block
and stylesheet were removed after caller inspection.

Independent Sol source review found the initial-read dialog remount risk, fixed
by keeping its trigger/dialog in a stable header. Existing focused suites cover
that deferred read, duplicate submission, unknown outcome observation, all twelve
route mappings and save/leave behaviour. The expanded settings suites also caught
duplicate field labelling and missing post-save heading focus; both were corrected
in the shared layout. `npm run check` and 168 affected existing tests pass.

Read-only browser fixtures cover Business profile, Team and the invite dialog at
320, 390 and 1440px, including dark appearance. Browser inspection caught and
corrected grid-induced document overflow; tables now scroll within their cards.
Keyboard checks verify native route navigation and heading focus, member search,
reaching offscreen table actions and the last settings group, and dialog focus
entry/restoration. The fixture uses sample records and blocks all writes. Local
evidence is in the task workspace under `proposals/settings-solutions/`.
Authenticated invitation/access changes remain deferred by Joel; no hosted or
production journey is claimed. The existing release-gate environment blocker
and broader UI acceptance remain open. No deployment or production write occurred.


**8 October settings/account completion review.** Owner: canonical UI integrator;
Identity retains authorization and mutation ownership. Two independent Sol reviews
covered source mechanics and rendered composition against Profile 2, Solution
Users 4 and [REUI Auth 18](https://reui.io/preview/base/auth-18). The selected fixes
address demonstrated failures:

- Team request generations prevent late initial reads replacing explicit refresh.
  Mutations/readback are serialized. A lost access-command response closes the
  confirmation dialog, disables new writes and restores focus to Refresh.
- Invitation and workspace-name writes carry their expected Account to the
  existing authority owner; mixed directory/invitation reads cannot enable Team
  controls. Known pre-dispatch invitation refusal stays distinct from uncertainty.
- Provider/workspace name drafts survive unrelated live updates. Their existing
  navigation guard covers unsaved, pending and unknown outcomes. Unknown renames
  retain exact request material; a matching readback cannot leave Provider retry
  permanently disabled. Invalidation failure cannot replace a confirmed Provider
  mutation result. Public profile links and an actual profile-refresh action
  complete the existing settings handoff.
- Receipt numbers and headers remain unbroken on desktop. Notifications reuse
  Profile 2 fields/cards without duplicate labels, keep consent visible, disclose
  evaluation detail progressively and protect drafts across navigation/unrelated
  preference revisions. Unconfirmed preference writes do not claim old values
  are unchanged.
- Auth 18 supplies the split presentation and licensed grid. Clerk continues to
  own authentication, verification, contextual redirects and forms; demo login
  mechanics/endorsements were not introduced. Aecon tokens and reduced motion are
  retained; mobile starts with the form and the promotional footer is removed.

The two newly reproduced Team regressions failed before the correction and pass
after it. The affected existing suites pass **234 tests in 27 files**. Browser
fixtures verify Business profile/Team plus seven additional settings destinations
at desktop/mobile widths, light/dark auth wrappers, alert-draft departure, Team
unknown-response recovery, and delayed Clerk fallback recovery. The actual
sign-in/sign-up page wrappers include contextual copy, retained Agent redirect
and signup legal footer. No horizontal document overflow or browser errors were
observed in those fixtures. Source checks and final diff whitespace checks are
recorded in `proposals/settings-solutions/completion-check.log` and related local
evidence; rendered review is in `expanded-review/REVIEW.md` under the task workspace.

This completes the reviewed source/fixture slice, not all platform qualification.
Actual Clerk controls, Agent-key wizard/controller, populated Provider connections,
Admin bootstrap, real access changes and backend/webhook readback remain unverified.
The release gate still requires the genuine development configuration, and Joel's
authenticated journey deferral remains open. Required coordinated Account-fence
rollout is recorded in [deployments](deployments.md#platform-ui-candidate--7-october).
No production writes, paid Calls, deployment or merge occurred.
