# Implementation roadmap

**Status:** maintained capability roadmap · **Reconciled:** 5 October 2026

[PRODUCT.md](PRODUCT.md) owns product direction; [CONTEXT.md](CONTEXT.md) owns
language; source and tests establish implementation. [TODOS.md](TODOS.md) owns
current work. This document owns capability sequence and completion criteria.

## Current position

The production app and backend support the recorded managed-x402 foundation.
The authenticated CLI completed 20 mainnet purchases with exact reconciliation,
replay and scoped recovery evidence. Hosted guest and signed-in discovery,
detail and comparison, current and legacy MCP clients, and the downloadable CLI
were verified in the 5 October release. See [deployment provenance](docs/operations/deployments.md)
and [readiness evidence and limits](docs/production-readiness-plan.md).

That evidence does not complete the full Australian commercial record, prove a
paid chat journey or authorize alpha invitations. Seller identity, separate
Provider obligation, attributed tax facts, business-document evidence and
purchase resolution must be explicit together. Funding, authority, delivery,
settlement and purchase status remain separate facts.

## Capability sequence

Package numbers are stable. A shipped part does not complete the whole package.
The [retained requirement inventory](docs/archive/2026-10-05/root/IMPLEMENTATION_ROADMAP.md)
contains the original subpackages, failure cases and acceptance checks. Archiving
its dated progress reports does not cancel unfinished requirements.

| Package | Durable scope | Position and completion requirement |
| --- | --- | --- |
| 1 — Application shell | Failure containment; navigation; loading, empty, pending, refused and unknown states | Foundation implemented. Keep deep links, interrupted actions, back/forward, focus and retry safe on supported journeys. |
| 2 — Human workspace | Calls and purchasing; Agent access and credit; Provider workspace; Account/security | Foundation implemented. Verify complete buyer, Provider and operator journeys, including recovery and offboarding. |
| 3 — Identity and authority | Account/Principal boundaries; Agent spending policy; replaceable credentials; Provider connections; consequential-action proof | Foundation implemented. Rotation must not reset aggregate spend; concurrent credentials share the same authority limits. Hosted MFA/revocation evidence is scoped in readiness. |
| 4 — Managed Calls and financial operations | AUD credit and fee; caller-specific Quote; managed x402; corporate USDC treasury; documents, adjustments, reconciliation and separate Provider obligations | Mainnet acceptance is recorded. Complete the explicit commercial record and the remaining funding, document, recovery and operating proofs; see [START_LINE.md](START_LINE.md). |
| 5 — Provider operations | Preview, admission, publication, pricing, lifecycle, health and durable offboarding | Implemented foundations require complete deployed Provider-to-buyer acceptance for the supported scope, including suspension and recovery of existing purchases. |
| 6 — Onboarding and language | Agent/Provider setup, examples, canonical terms and contextual help | Continue journey acceptance. No required standalone identity/balance inspection before a viable Quote. |
| 7 — Trust, legal and data governance | Privacy, terms, trust centre, Account/data lifecycle and attributable approval evidence | Approved alpha policy has explicit limits. Open-beta and full commercial qualification remain separate; a configured provider or passing test is not adviser approval. |
| 8 — Support and operations | Support, incidents, notifications, monitoring and operator recovery | Existing readiness, treasury and alert routes remain authoritative. Sustained availability, workload activation and proposed Datadog coverage need their own evidence. |
| 9 — Developer and integration surfaces | Discovery, APIs, MCP, CLI, integration documentation and diagnostics | Hosted current/legacy MCP and downloadable CLI 0.2.1 are verified. Public npm distribution has a separate release record; preserve recovery and authority parity. |
| 10 — Experience quality | Responsive behavior, accessibility, performance and visual consistency | Continuous requirement across packages. Browser/a11y gates support the proof; they do not establish paid delivery or service-level performance. |

## Delivery rules

- Preserve one Tool → Quote → Call → delivery/uncertainty → remedy → purchase
  resolution → Outcome chain. The customer's harness owns the larger objective.
- Use familiar supported behavior and maintained components. Locus, Nevermined
  and Whop are [dated comparison inputs](research/README.md), not automatic scope.
- Reuse existing evidence, financial and recovery machinery. Do not create a
  parallel ledger or shift subsystem coordination onto the calling agent.
- Keep source-reported, observed, derived, supplied, stale and unresolved facts
  distinguishable. External reconstruction does not inherit native provenance.
- Preserve exact money, concurrency, idempotency and uncertain-effect recovery.
  One small machine interface may join separately owned internal domains.
- Use established protocols at the edges. Add connectors, streaming or treasury
  sharding only for an admitted requirement or measured constraint.
- Global record semantics and jurisdiction-specific policy remain separate.
  Australian qualification is the first complete configuration.

## Commercial responsibility overlay

Observe → Control → Broker → Resell describes responsibility for an acquisition.
It does not replace or renumber the capability packages. Supported resale keeps
AE as buyer-facing Seller and records the payment recipient independently. Later
Provider-as-Seller fiat research does not change that existing lane.

## Mature-platform completion standard

For each supported buyer, Agent, Provider, integrator and operator journey,
prove setup, normal use, change, interruption, failure, recovery and exit. Retain
source revision, environment, inputs, observable results and known limits.
A feature list, screenshot, mock receipt or source test alone is insufficient.

External acquisition reconstruction and broader market learning remain later
work. Repeated useful purchases, Provider activation and independent buyer
harnesses matter; novelty and differentiation are not release prerequisites.

## Provider-created service supply and fiat purchasing — prospective extension

**Added 1 October 2026.** This extension translates Joel's accepted direction
into bounded research/implementation packages. It does not change the managed-x402
starting-line gate, mark future capability implemented, or replace the
maturity-first charter. The [updated whitepaper](AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md)
explains the institutional case; the [single maintained specification](research/managed-task-agents-spec.md)
contains architecture, permissions, payment comparison, economics and acceptance.
Its [evidence register](research/managed-task-agents-evidence.json) holds
114 sources; the [calculator](research/managed-task-agents-costs.py)
includes the selected `--operating` AUD model and retains the superseded `--marketplace` comparison. No paid service or new runtime is
provisioned by this documentation.

The prospective product helps a business **create, qualify, publish, sell and
operate** a bounded service. Publish the service as a Tool; the agent is its
delivery mechanism. A Provider can publish several Tools, bring existing clients,
sell through a link/website/API and opt into market distribution. Its own endpoint
is supported in the design; optional hosting is supply enablement, not AE ownership
of a general agent runtime. Portfolio Service, Offering, Publication, Listing,
Provider connection and callable Tool remain distinct.

| Extension | Existing package boundary | Deliverable and observable acceptance |
| --- | --- | --- |
| E1 — Product-shaped service | 5B, 6B, 7B, 10 | One versioned offer per Provider: sufficient inputs, refusal rules, outputs/use rights, review mode, deadline, capacity, price, data recipients and remedies. Selected first profile: source-cited tender compliance/evidence review by an existing specialist firm. Count work from the raw service through examples, qualification, training and first delivery. First Provider is learning; second Provider targets ≤90m configuration/qualification and ≤60m total AE help without bespoke code/schema. Thresholds are provisional. |
| E2 — Optional managed delivery | 3, 5C, 7A, 8, 9 | Keep AE market/authority facts canonical in existing Convex; isolate Provider execution through a narrow authenticated Call/result adapter. Trusted handler first, fresh restricted Cloudflare JS candidate next; this document profile needs no buyer SaaS connections or memory standby. Linux sandbox conditional on a later actual native/OCR/browser requirement. Validate per-Call isolation, revocation after standby, budget contention, malicious input, uncertain effects, late callbacks and cleanup. No parallel DO money/authority ledger. |
| E3 — Separate Provider-as-Seller fiat lane | 4A, 4F–H, 7B, 8, 9 | Processor-approved AU direct charges candidate using Stripe Connect Accounts v2 with Provider merchant configuration/full Dashboard, explicit fee/loss responsibility and active capabilities. Identify Seller/payee independently. Demonstrate checkout/authentication handoff, capture expiry, account-scoped replay/reconciliation, partial/full fee refund, pending/failed refund, suspended merchant and dispute handling in sandbox; The public reviewed profile uses disclosed advance payment/refund terms; separately bind accepted purchase mandates versus reusable spending policy. Exercise named fault/remedy ownership and actual refund funding/delegation before paid pilot; actual contracts and production qualification precede launch. |
| E4 — Provider service operation and direct distribution | 5A–D, 6, 8, 9, 10 | Private client availability before optional public admission; branded link/embed/API use the same Tool/Quote/Call. Provider review queue, capacity pause, exceptions, earnings, customer remedies, version requalification and export/offboarding operate without founder database edits. Retain supported recovery for existing purchases after suspension. |
| E5 — Paid repeat delivery and market expansion | Later market learning | First Provider/five recurring buyer businesses: require ≥3/5 useful repeats within predeclared natural cadence (up to 8 weeks), positive incremental monthly Provider benefit against equal-scope baseline after plan/setup/labor, and full-price operating renewal. Then second Provider reuses profile, and an independent buyer harness buys/uses output. Only afterward qualify new-to-Provider buyers comparing ≥2 viable offers without founder matching; measure acquisition cost, repeats and fee leakage. |

E1 shapes the first commercial offer; E2 and E3 can qualify independently against
that same accepted scope. E4 joins the complete service journey; E5 uses its real
transactions. Existing mature-platform work remains active. These future proofs
are not retroactively added to Package 4's current release gate.

**Commercial decisions to preserve:** Provider is the candidate buyer-facing
Seller for this new fiat lane. AE remains Seller for supported existing resale.
Do not silently switch Seller by distribution channel or reuse AE issuer-only
credit as a wallet paying independent Sellers. Buying, data/resource delegation,
professional standing and payment credentials are distinct. Hosted operation does
not transfer every service-quality obligation to AE or eliminate AE's own duties.
Counsel and processor qualification must cover the actual service/funds flow,
consumer remedies, tax facts, data chain, licensing and professional promises.

**Rails:** retain qualified Provider invoicing/collection for existing invited clients; do not force a new rail. Unfamiliar marketplace buyers use ordinary AUD checkout; qualify PayTo advance payment for eligible AU accounts alongside card fallback. Stripe documents direct Connect support but not manual capture; business-account coverage/verification/mandate and final-dispute behavior are concrete limitations. Saved-payment consent
and purchase policy can support repeat automation, with authentication handoff
when required. Current Stripe SPT availability omits Australia; MPP/Tempo and x402
remain optional, geography-qualified adapters. Airwallex Payments for Platforms
is a quoted alternative for collection/cross-border needs; AgentOS operates
business finance accounts and is not this payment adapter. No new dependency,
corporate account, treasury integration or funds-flow migration is authorized
by choosing a research candidate.

**Economic discipline:** `--operating` is the selected hypothesis: A$199/month plus A$5/admitted hosted review Call, ex GST; an existing endpoint may publish without buying operation and pays only on market-originated purchases. Provider-originated distribution commission is 0%; market first purchase 15%, subsequent on-platform purchase 5%, disclosed and independently attributed. Provider sets its buyer service price. Model monthly Provider benefit, full labor/setup, execution mode, buyer CAC/retained purchases, Provider churn/replacement, infrastructure make-good and net growth cash. The modeled ten-review Provider gains A$164.95/month against a zero-fee payment baseline with new buyer card costs (A$301.25 for eligible, qualified PayTo; A$292.15 expected contribution retaining qualified invoicing with 0.5% bad debt) only if equal-scope human work falls from 120 to expected 78 minutes; an absent saving fails the value case. Marketplace contribution is a separately qualified sensitivity, never free traffic credited to direct SaaS. The old A$29/A$249 and 5%/15% model remains reproducible under `--marketplace`, marked superseded. Actual workload, bills, retention, loss frequency, contract terms and pricing remain unvalidated.

**Stop or reduce scope:** repetitive bespoke onboarding; no distinctive buyer
value; missing license/embedded-use rights; unauthorized data/effects; inability
to reconcile unknown payments/writes; review backlog exceeding sold capacity;
negative Provider or platform unit contribution; or platform-fee bypass that
shows inadequate retained value. Fix the offer/price/operating model before
adding an orchestration platform or broader category support. Invoice-to-Xero
remains an engineering boundary test, not proof of external-service demand.
