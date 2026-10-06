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
| F3 | Bounded immutable procurement graph, mapping, atomic authority/price ceilings and useful parallel execution; requires commercial direction. |
| F4 | Partial/selected/artifact results, history/rerun and separate charge/refund readback. |
| F5 | Entitled heterogeneous supply, actual clients, operational proof and four-persona/whole-task acceptance. |
| Literal | Supported MPP/Tempo/SPT, MACH/Coinflow, incentives, direct wallet and embedded surfaces. Plan separately after owner decisions; retain every gap. |

Use Wayfinder and `/plan-eng-review` on each substantive implementation goal,
reusing its existing approved direction. Prefer official SDKs, standards and
current components. No parallel delivery stream, clone or research branch.
Datadog stays with [#284][DD] / ADR 0005; invitations [#288][I288] and paid chat
[#279][I279] retain their own gates. Historical #196/#185/#187 and ADR 0004 retain
relevant intent; retired #202/#204 do not become current graph implementation.

Open decisions before consequential work: caller-composed graph versus Provider
package responsibility; aggregate purchase/obligation/refund allocation; dynamic
price ceilings and result retention; actual supplier distribution entitlement;
literal rails/incentive/client implementation; pinned docs-framework build.
This register records criteria and recommendations, not approval of those choices.

## Numbered index

All items below are initially **open**. The coverage column prevents already
implemented foundations from being mistaken for missing source, while retaining
the exact remaining acceptance.

| Item | Behaviour | Current coverage | Wave | Priority |
| --- | --- | --- | --- | --- |
| [MM-001](#mm-001) | Actor and Account ownership | Supported in source; scoped runtime recorded | F1 | P1 |
| [MM-002](#mm-002) | Organisation membership and administrator controls | Supported in source; full admin journey unproved | F1/F5 | P2 |
| [MM-003](#mm-003) | Stable Agent identity and credential replacement | Supported in source; rotation tests passed | F1/F5 | P1 |
| [MM-004](#mm-004) | Delegated scope, budget, expiry and current authority | Supported single Calls; aggregate graph authority missing | F1/F3 | P1 |
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
| [MM-016](#mm-016) | Bounded immutable procurement plan | Missing caller-composed plan; ADR 0004 packages proposed | F3 | P1 |
| [MM-017](#mm-017) | Dependency output references and bounded mapping | Missing public graph reference contract | F3 | P1 |
| [MM-018](#mm-018) | Quote-to-plan binding and dependent price ceilings | Partial single-Tool binding; aggregate contract missing | F3 | P1 |
| [MM-019](#mm-019) | Exact Provider choice and fallback boundaries | Partial discovery routing; graph release absent | F3/F5 | P1 |
| [MM-020](#mm-020) | Ready-node scheduling and aggregate concurrency | Partial: native components present; public DAG missing | F3 | P1 |
| [MM-021](#mm-021) | Durable asynchronous admission and recovery | Supported single Calls; aggregate job missing | F2/F3 | P1 |
| [MM-022](#mm-022) | Conventional provider start/status/result completion | Partial; queued HTTP 202 success fixture reproduced | F2 | P1 |
| [MM-023](#mm-023) | Idempotent submission and conflicting replay | Supported single Call; plan/node keys absent | F2/F3 | P1 |
| [MM-024](#mm-024) | Safe retries, uncertain effects and reconciliation | Supported single Call model; adapter/graph proof partial | F2/F3 | P1 |
| [MM-025](#mm-025) | Status, errors and one useful next action | Supported single-Call actions; graph status absent | F1/F2/F3 | P1 |
| [MM-026](#mm-026) | Cancellation and irreversible-effect truth | Supported where existing adapter allows; graph stop absent | F2/F3 | P1 |
| [MM-027](#mm-027) | History, cached recovery and retention | Supported single Call history; graph retention missing | F4 | P1 |
| [MM-028](#mm-028) | Explicit rerun and failed-node resubmission | Partial single new Call; graph replay plan missing | F4 | P1 |
| [MM-029](#mm-029) | Partial success and dependent skips | Missing aggregate node result contract | F3/F4 | P1 |
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
| [MM-052](#mm-052) | Public CLI distribution and integration lifecycle | CLI source/local/mainnet supported; public npm publication pending | F1/F5 | P1 |
| [MM-053](#mm-053) | Separate local-wallet/direct REST mode | Unknown/missing Mercator-compatible direct payer mode | Literal | P1 |
| [MM-054](#mm-054) | Embedded MCP App and WebMCP discovery | Missing/unknown equivalent embedded surfaces | Literal | P1 |
| [MM-055](#mm-055) | Four-persona docs and generated API reference | Partial existing guides; coherent generated docs tree missing | F1/F5 | P2 |
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

- **State:** open · Supported in source; full admin journey unproved. **Priority/wave:** P2 · F1/F5.
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

- **State:** open · Supported single Calls; aggregate graph authority missing. **Priority/wave:** P1 · F1/F3.
- **Owner / dependencies:** Authority / finance; [MM-001](#mm-001), [MM-003](#mm-003).
- **Required behaviour:** A credential identifies an actor; a current grant authorises bounded work. Account funding never expands scope or budget.
- **Success criteria:** Wrong resource/scope/environment, expired or revoked grant and concurrent spending beyond a ceiling refuse; each unreleased node rechecks current authority.
- **End condition:** Grant negatives, atomic concurrent-budget proof and revoked-after-quote graph proof pass. Accepted work and historical access follow an explicit current policy.
- **Supported implementation:** Extend existing DelegationGrant and Call admission for aggregate reservation; retain per-node effect authority.
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

- **State:** open · Missing caller-composed plan; ADR 0004 packages proposed. **Priority/wave:** P1 · F3.
- **Owner / dependencies:** Contracts / execution / product; [MM-013](#mm-013), [MM-015](#mm-015).
- **Required behaviour:** An Agent can inspect and submit a frozen 1–10 node procurement DAG over exact published Tools, without moving its larger planning/runtime into Aecon.
- **Success criteria:** Empty/11-node plans, cycles, duplicate IDs and invalid dependencies refuse; valid independent and dependent nodes survive serialization and restart unchanged.
- **End condition:** Approved public schema, positive two-Tool execution and adversarial graph tests pass in the target environment. A validator or fixed Provider package alone cannot close this item.
- **Supported implementation:** Use existing child Calls and installed Convex Workflow; keep caller composition distinct from Provider package responsibility.
- **References:** [Combined work][M-COMB]; [Plan schema][M-O]; [AE single-Call input][AE-CALL]; [ADR 0004][PKG].

<a id="mm-017"></a>

### MM-017 — Dependency output references and bounded mapping

- **State:** open · Missing public graph reference contract. **Priority/wave:** P1 · F3.
- **Owner / dependencies:** Contracts / execution; [MM-016](#mm-016).
- **Required behaviour:** A node can use a declared dependency’s actual output, JSON Pointer field or bounded array projection as schema-valid input.
- **Success criteria:** Real first-node output reaches the second node; forward/undeclared references, missing paths, invalid maps, incompatible resolved input and depth/size overflow refuse predictably.
- **End condition:** Positive reference/pointer/map execution and failure/limit tests pass with real outputs. Free Mercator graph quoting alone is not execution proof.
- **Supported implementation:** Maintain RFC 6901 parsing utilities and a small declared mapping grammar; no arbitrary code or expression engine.
- **References:** [Plan examples][M-COMB]; [Quote contract][M-Q]; [Graph design][B].

<a id="mm-018"></a>

### MM-018 — Quote-to-plan binding and dependent price ceilings

- **State:** open · Partial single-Tool binding; aggregate contract missing. **Priority/wave:** P1 · F3.
- **Owner / dependencies:** Contracts / authority / finance; [MM-004](#mm-004), [MM-015](#mm-015), [MM-016](#mm-016), [MM-017](#mm-017).
- **Required behaviour:** The plan, Tool versions, recipients, effects and ceilings approved at Quote are the work released; dynamic dependent pricing cannot expand authority.
- **Success criteria:** Plan/input/terms drift conflicts; expired quotes reprice; unbounded or above-ceiling dependent cost refuses/requotes before release; material expansion requires a new approval.
- **End condition:** Atomic exact-plan binding, generation drift and price-change races pass; finance/product approve aggregate consideration versus separate purchase/remedy semantics before paid use.
- **Supported implementation:** Bind canonical immutable plan material to current Quote and grant generation; preserve authoritative per-node max or explicit repricing handoff.
- **References:** [Create constraints][M-CREATE]; [Quote][M-Q]; [AE Call admission][AE-ADMIT]; [commercial design][B].

<a id="mm-019"></a>

### MM-019 — Exact Provider choice and fallback boundaries

- **State:** open · Partial discovery routing; graph release absent. **Priority/wave:** P1 · F3/F5.
- **Owner / dependencies:** Market / execution / product; [MM-010](#mm-010), [MM-013](#mm-013), [MM-018](#mm-018).
- **Required behaviour:** The selected Provider/Tool is the one executed. Alternatives can be offered without silently changing recipients, costs or irreversible effects.
- **Success criteria:** Required/preferred choices survive quote and execution; stale/unavailable exact supply yields a clear new comparison/quote step; fallback cannot bypass ceilings or approval.
- **End condition:** Recorded choice-to-effect provenance and unavailable/fallback negatives pass through actual clients.
- **Supported implementation:** Use current selection, exact Tool refs and Quote; no automatic irreversible Provider substitution.
- **References:** [Search choice][M-S]; [Create plan][M-CREATE]; [AE routing direction][AE-ROUTE].

<a id="mm-020"></a>

### MM-020 — Ready-node scheduling and aggregate concurrency

- **State:** open · Partial: native components present; public DAG missing. **Priority/wave:** P1 · F3.
- **Owner / dependencies:** Execution / authority; [MM-004](#mm-004), [MM-016](#mm-016), [MM-017](#mm-017), [MM-018](#mm-018), [MM-021](#mm-021).
- **Required behaviour:** Independent ready nodes can run concurrently; dependencies wait; service/account budgets and fairness bound work.
- **Success criteria:** Fan-out obeys the evidenced Mercator limit of at most three per service or an explicitly disclosed AE compatible cap; no overspend under concurrent release; failed dependencies do not start.
- **End condition:** Ten-node fan-out/dependency, restart and concurrent-budget tests plus hosted mapped graph demonstrate useful parallelism and bounded load.
- **Supported implementation:** Use installed Workflow/Workpool concurrency and AE atomic reservations; avoid unbounded Promise.all or a new scheduler.
- **References:** [Parallel graph contract][M-COMB]; [Workflow][S-WF]; [Workpool][S-WP]; [AE design][B].

<a id="mm-021"></a>

### MM-021 — Durable asynchronous admission and recovery

- **State:** open · Supported single Calls; aggregate job missing. **Priority/wave:** P1 · F2/F3.
- **Owner / dependencies:** Execution; [MM-004](#mm-004), [MM-015](#mm-015).
- **Required behaviour:** Accepted work has a durable reference; client disconnect or worker restart does not lose it or create another purchase.
- **Success criteria:** Pending/running/terminal state survives restart; status resumes the same accepted work; disconnect has no implicit cancellation; uncertain effects remain reconcilable.
- **End condition:** Local durable execution/recovery suite and a hosted restart/disconnect journey pass for single async Tool and subsequently a graph.
- **Supported implementation:** Retain current Call/workId/authority binding, dispatch Workpool and completion hook. Use Workflow only for genuine multi-step waiting/composition; no second job table or generic TaskManager. See the reuse-fit matrix in ADR 0006.
- **References:** [Job lifecycle][M-J]; [AE Call authority][AE-C]; [recorded runtime][AE-DEP].

<a id="mm-022"></a>

### MM-022 — Conventional provider start/status/result completion

- **State:** open · Partial; queued HTTP 202 success fixture reproduced. **Priority/wave:** P1 · F2.
- **Owner / dependencies:** Supply adapters / execution; [MM-014](#mm-014), [MM-021](#mm-021).
- **Required behaviour:** A conventional provider job handle means accepted work, and Aecon observes it until a validated final result or truthful failure.
- **Success criteria:** Persist original handle; queued 202 is not final output; use the Provider SDK’s supported read/result or verified webhook path. Bounded observation handles success/failure/expiry, bad schema, auth expiry, unsafe URLs, lost response and restart without a second start. Do not copy an hour-long polling example into one Convex action.
- **End condition:** One admitted async fixture and one separately authorised real Provider complete start → restart → observe → final output. Existing fixture finding is corrected; no production exploit claim is required.
- **Supported implementation:** Qualify the actual Provider’s maintained SDK first (Parallel taskRun or fal queue where applicable). Persist its handle on the existing Call/effect; schedule bounded observation through existing Workpool, or Workflow events for a genuine callback wait. SDK final output must pass the published Tool schema; no new generic service-job lifecycle.
- **References:** [Job delivery contract][M-J]; [normaliser][AE-HTTP]; [adapter config][AE-ADAPTER]; [Parallel tasks][S-PAR]; [fal queue][S-FAL].

<a id="mm-023"></a>

### MM-023 — Idempotent submission and conflicting replay

- **State:** open · Supported single Call; plan/node keys absent. **Priority/wave:** P1 · F2/F3.
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

- **State:** open · Supported single-Call actions; graph status absent. **Priority/wave:** P1 · F1/F2/F3.
- **Owner / dependencies:** Execution / protocol / DX; [MM-021](#mm-021), [MM-022](#mm-022).
- **Required behaviour:** Clients can distinguish active, succeeded, partially successful, failed and uncertain work, with sanitised reasons and clear next action.
- **Success criteria:** REST/MCP/CLI represent the same facts; active work uses bounded backoff, terminal execution stops polling, pending settlement continues separately; errors do not leak secrets or raw payloads.
- **End condition:** Generated schema/envelope tests and actual clients correctly resume, surface successful outputs first, explain failure and stop at the right terminal states.
- **Supported implementation:** Derive response/error docs from current actions; add graph/node envelopes at their owning contracts, retaining AE state truth.
- **References:** [Job statuses][M-J]; [AE public actions][AE-E]; [generated OpenAPI][AE-O].

<a id="mm-026"></a>

### MM-026 — Cancellation and irreversible-effect truth

- **State:** open · Supported where existing adapter allows; graph stop absent. **Priority/wave:** P1 · F2/F3.
- **Owner / dependencies:** Execution / supply; [MM-007](#mm-007), [MM-022](#mm-022), [MM-024](#mm-024).
- **Required behaviour:** Explicit cancellation can stop unreleased work and request supported upstream cancellation without promising rollback or refund.
- **Success criteria:** Cancellation races with dispatch/completion safely; unsupported/unknown cancellation is truthful; credential revocation or disconnect cannot masquerade as a cancelled job.
- **End condition:** Cancel-before/after-release, race and unsupported cases pass for async Tool and graph. Mercator public cancellation API remains unestablished; this is AE’s required lifecycle boundary.
- **Supported implementation:** Reuse current cancellation fence and provider capability declaration; stop future graph nodes while retaining possible effects.
- **References:** [Disconnect semantics][M-J]; [AE Call entry][AE-E]; [fal queue cancellation][S-FAL].

<a id="mm-027"></a>

### MM-027 — History, cached recovery and retention

- **State:** open · Supported single Call history; graph retention missing. **Priority/wave:** P1 · F4.
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

- **State:** open · Missing aggregate node result contract. **Priority/wave:** P1 · F3/F4.
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

- **State:** open · CLI source/local/mainnet supported; public npm publication pending. **Priority/wave:** P1 · F1/F5.
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

- **State:** open · Partial existing guides; coherent generated docs tree missing. **Priority/wave:** P2 · F1/F5.
- **Owner / dependencies:** Docs / DX / product; [MM-005](#mm-005), [MM-050](#mm-050), [MM-052](#mm-052).
- **Required behaviour:** Ordinary users, organisation admins, Agent integrators and Providers can learn and finish their own supported journeys using truthful customer/developer docs.
- **Success criteria:** Persona entry points explain actors, setup, use, results/recovery, spending/receipts, data/support and lifecycle; API/MCP/CLI references derive from real schemas/releases; proposed work is labelled.
- **End condition:** Four guide-led journeys pass; schema-valid examples, links, generation drift and pinned docs SSR/build checks pass. A new docs deployment is not part of this register-building request.
- **Supported implementation:** Use current Markdown/foundations and action schemas; trial supported Fumadocs/TanStack/OpenAPI generation before adoption.
- **References:** [Mercator docs][M-D]; [AE guide][G]; [docs architecture][B]; [Fumadocs TanStack][S-DOC]; [OpenAPI generation][S-OAPI].

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
