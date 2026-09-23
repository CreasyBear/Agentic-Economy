# Platform job map

**Status:** wave 1 register  
**Date:** 2026-09-21  
**Authority:** [PRODUCT.md](../../PRODUCT.md) purpose and Core market journeys 1–6; [CONTEXT.md](../../CONTEXT.md) roles and canonical terms. Grades follow [`platform-design-package.md`](./platform-design-package.md).

Jobs describe progress people need under a circumstance. They are not screens, routes, or feature lists. Dest names are derived elsewhere; this register does not name navigation destinations.

**Job statement format (required):**

When [circumstance], I want to [make progress], so I can [achieve an outcome], without [major anxiety or burden].

---

## Charter anchor

**Purpose** ([PRODUCT.md](../../PRODUCT.md) § Purpose and category): one Account for agents to find and use paid Tools with AUD credit, spending controls, clear usage records, and help when a purchase goes wrong.

**Core market journeys** ([PRODUCT.md](../../PRODUCT.md) § Core market journeys):

| # | Journey |
| --- | --- |
| 1 | Describe a need naturally and find the right capability despite vocabulary differences. |
| 2 | Compare suitable services and reach a useful choice without inspecting a large catalogue. |
| 3 | Choose, buy and continue working with minimal integration burden. |
| 4 | Expose a capability and reach relevant buyers without becoming a distribution expert. |
| 5 | Find no suitable supply today and connect with relevant supply when it becomes available. |
| 6 | Use the market repeatedly and benefit from progressively better matches. |

**Roles** ([CONTEXT.md](../../CONTEXT.md) § Customers, agents and accounts; § market roles): Customer, Agent, Account, Spending policy, Provider, Seller, payment recipient. Support / recovery operator acts on behalf of the platform or account to restore explainable purchase state; they are not a separate product role in CONTEXT.md but are named here as an operational actor.

---

## Customer (buyer human)

### J-B01 — Find capability despite vocabulary gap

| Field | Content |
| --- | --- |
| **Actor** | Customer |
| **Job statement** | When my Agent lacks a capability and I can describe the outcome but not the Provider’s catalogue vocabulary, I want to turn that need into relevant Tool candidates with constraints retained, so I can move toward a bounded purchase decision, without guessing which registry keyword or API name is “correct.” |
| **PRODUCT.md journey(s)** | 1 |
| **Observable success** | A bounded need yields a shortlist of viable Tools or an explicit clarification path; imported directory metadata is not treated as executable truth; unknown assessment is not presented as certainty. |
| **Grade** | **PARTIAL** — HTTP discovery: `src/routes/api.v1.registry.ts`; operator Market browse: `src/routes/_operator/owner.market.tsx`; thin chat wraps `registry.tools.search` in `convex/chatTools.ts`. Semantic matching and honest no-fit copy remain uneven in live chat (see `docs/operations/jev-platform-integration-register.md`). |
| **Anxiety / trust requirement** | Distinguish “no supported fit in what was assessed” from “nothing exists anywhere”; preserve hard constraints; do not invent availability or price. |
| **NOT a job** | **Browse an endless directory** — scrolling a raw catalogue without a bounded need is inventory inspection, not finding despite vocabulary differences. |

### J-B02 — Compare without catalogue exhaustion

| Field | Content |
| --- | --- |
| **Actor** | Customer |
| **Job statement** | When several Tools might satisfy my need, I want to see supported differences among a small viable set, so I can choose one Tool version with reasons I can defend, without reading every listing or re-running open-ended search. |
| **PRODUCT.md journey(s)** | 2 |
| **Observable success** | A **service comparison** records considered Tool versions, exclusions, and caller-specific reasons ([CONTEXT.md](../../CONTEXT.md) § Service comparison); the customer or Agent reaches a single inspectable choice or an explicit none/uncertain outcome before Quote. |
| **Grade** | **PARTIAL** — `registry.tools.compare` via `convex/chatTools.ts` → `api.capabilityToolCatalog.compare`; public Market comparison UX in `src/routes/market.tsx` and `src/routes/_operator/owner.market.tsx`. Full principal-reseller terms on the comparison surface remain incomplete per [PRODUCT.md](../../PRODUCT.md) § Current implementation boundary. |
| **Anxiety / trust requirement** | Provenance of facts visible; no universal quality score; payment and delivery risks stay separate facts. |
| **NOT a job** | **Pick the top search hit** — ranking without recorded exclusions and reasons is not comparison. |

### J-B03 — Buy and continue the wider task

| Field | Content |
| --- | --- |
| **Actor** | Customer |
| **Job statement** | When a Tool fits my need and my Agent is authorised, I want the purchase to complete as one bounded Call with a usable result, so I can return work to my existing harness and objective, without AE owning my project plan or forcing a new integration stack. |
| **PRODUCT.md journey(s)** | 3 |
| **Observable success** | Chain preserved: need → comparison → Quote → Call → result or uncertainty → remedy if required → resolved purchase → outcome records → agent continues ([PRODUCT.md](../../PRODUCT.md) § The decision and purchase chain). Customer-visible Call history joins Logs, Usage, and Spend by `callRef` ([PRODUCT.md](../../PRODUCT.md) § Product surfaces). |
| **Grade** | **PARTIAL** — Quote/Call actions and recovery contracts in source ([PRODUCT.md](../../PRODUCT.md) § Agent operating model; `src/routes/api.v1.calls.$callRef.ts`). Complete managed x402 principal-reseller record (Seller identity, tax documents, purchase resolution as one production record) remains **CHARTER** ([PRODUCT.md](../../PRODUCT.md) § Current implementation boundary). |
| **Anxiety / trust requirement** | Honour the Quote; drift fails before money or Provider effect; Agent never supplies `accountRef` on Call ([PRODUCT.md](../../PRODUCT.md) § Operating principles). |
| **NOT a job** | **Run a procurement workflow** — AE is not a tender board or human approval chain for every purchase ([PRODUCT.md](../../PRODUCT.md) § Non-goals). |

### J-B04 — Record no-fit and stay eligible for future supply

| Field | Content |
| --- | --- |
| **Actor** | Customer |
| **Job statement** | When nothing in today’s assessed set fits my bounded need, I want to record that gap honestly and keep matching eligibility within policy, so I can connect with relevant supply when it appears, without turning the gap into project memory, a tender, or an automatic purchase. |
| **PRODUCT.md journey(s)** | 5 |
| **Observable success** | One bounded failed-search phrase retained as private market-gap signal; active matching window and withdrawal behaviour match [PRODUCT.md](../../PRODUCT.md) § service request / matching eligibility (30 days; no auto-buy on match). |
| **Grade** | **PARTIAL** — `src/modules/market-demand/market-demand.actions.ts`, `convex/marketDemandSignals.ts`, `src/routes/api.v1.market-requests.withdraw.ts`. Provider-side response to demand and buyer UX for recording gaps: **OPEN** for interview-backed ergonomics (no transcripts). |
| **Anxiety / trust requirement** | No-fit means no supported fit in the assessed set, never “no supply exists”; credential revocation stops matching immediately ([PRODUCT.md](../../PRODUCT.md)). |
| **NOT a job** | **Post a public RFP** — market demand memory is not a message board to Providers ([PRODUCT.md](../../PRODUCT.md) § Product surfaces). |

### J-B05 — Grant Agent authority separately from money

| Field | Content |
| --- | --- |
| **Actor** | Customer |
| **Job statement** | When I am ready for an Agent to buy through my Account, I want to set or approve a Spending policy with explicit limits and permitted Tools, so I can delegate bounded purchasing, without funding alone implying permission or a one-off click replacing durable rules. |
| **PRODUCT.md journey(s)** | 3 (authority before Call); supports journeys 1–2 (Agent acts within granted bounds) |
| **Observable success** | Versioned Spending policy recorded; per-Call and aggregate limits survive credential rotation ([CONTEXT.md](../../CONTEXT.md) § Spending policy). Consent/approve flow completes with auditable grant evidence (`src/routes/_operator/agent-access.authorize.tsx`, `src/modules/agent-access/spending-policy-update.ts`). |
| **Grade** | **PARTIAL** — Connect-agent and spending limits UI (`src/components/ae/console/connect-agent-wizard/`, `src/components/ae/console/spending-limits-form/`). Request authorization path exists in CONTEXT.md; not every acquisition path requires a standing policy ([CONTEXT.md](../../CONTEXT.md) § Request authorization). |
| **Anxiety / trust requirement** | Funding ≠ authority ≠ purchase ([PRODUCT.md](../../PRODUCT.md) § Operating principles). Credential is access evidence, not budget owner ([PRODUCT.md](../../PRODUCT.md) § Agent operating model). |
| **NOT a job** | **Share my login** — human session sharing is not Agent delegation. |

### J-B06 — Fund the Account without wallet confusion

| Field | Content |
| --- | --- |
| **Actor** | Customer |
| **Job statement** | When prepaid AUD credit is required for Calls, I want to add funds and see available versus reserved balances clearly, so I can keep Agents working within limits, without treating a balance as spending permission or mistaking corporate treasury for my property. |
| **PRODUCT.md journey(s)** | 3 (enables repeated use); implicit in purpose (AUD credit) |
| **Observable success** | Top-up increases available credit; Quote/Call reserve required capacity before dispatch ([PRODUCT.md](../../PRODUCT.md) § Commercial model). Customer money surfaces show funding and recovery without a crypto wallet ([PRODUCT.md](../../PRODUCT.md) § Product surfaces). |
| **Grade** | **PARTIAL** — `src/routes/_operator/owner.credit.tsx`, `src/components/ae/console/AeOwnerCredit.tsx`, `src/routes/fund.$fundingSessionId.tsx`. Production money disabled until legal gates ([PRODUCT.md](../../PRODUCT.md) § Current implementation boundary). |
| **Anxiety / trust requirement** | Top-up service fee disclosed separately; pooled USDC is corporate treasury, not customer balance ([PRODUCT.md](../../PRODUCT.md) § Commercial model). |
| **NOT a job** | **Create a customer crypto wallet** — non-goal ([PRODUCT.md](../../PRODUCT.md) § Non-goals). |

### J-B07 — Explain a purchase to the business

| Field | Content |
| --- | --- |
| **Actor** | Customer |
| **Job statement** | When finance or leadership asks what an Agent bought and why, I want one Call-linked record that separates authority, Charge, delivery, and remedy, so I can explain the event in ordinary business terms, without reconstructing wallet transfers and application logs. |
| **PRODUCT.md journey(s)** | 3 (terminal records); Evidence required themes in [PRODUCT.md](../../PRODUCT.md) § Business records and accountability |
| **Observable success** | Buyer can trace Tool, Agent, Quote terms, Call identity, usage/spend views, and open uncertainty until reconciled ([PRODUCT.md](../../PRODUCT.md) § Evidence required). |
| **Grade** | **PARTIAL** — `src/routes/_operator/calls.$callRef.tsx`, `src/components/ae/call-receipt/`, `src/routes/_operator/activity.tsx`. Invoice-ready principal-reseller documents and full purchase resolution record: **CHARTER** ([PRODUCT.md](../../PRODUCT.md) § Current implementation boundary). |
| **Anxiety / trust requirement** | Delivery status, payment status, and purchase resolution stay distinguishable ([CONTEXT.md](../../CONTEXT.md) § Purchase resolution). |
| **NOT a job** | **Export to the general ledger as AE’s job** — AE proposes evidence; accounting classification stays with the buyer ([PRODUCT.md](../../PRODUCT.md) § Ownership boundary). |

### J-B08 — Recover when a Call does not finish cleanly

| Field | Content |
| --- | --- |
| **Actor** | Customer |
| **Job statement** | When a Call returns uncertainty or failure after possible dispatch, I want safe status, cancel, or reconcile actions with stable identity, so I can reach adjustment or refund without double spend or a fresh Call masquerading as retry. |
| **PRODUCT.md journey(s)** | 3 (remedy in chain) |
| **Observable success** | Recovery uses `call.status`, `call.cancel`, `call.reconcile` only when no terminal result ([PRODUCT.md](../../PRODUCT.md) § Agent operating model); Suggested next action never offers a fresh Call after possible dispatch ([CONTEXT.md](../../CONTEXT.md) § Suggested next action). |
| **Grade** | **IMPLEMENTED** (source acceptance) — `src/routes/api.v1.calls.$callRef.cancel.ts`, `src/routes/api.v1.calls.$callRef.reconcile.ts`, `src/modules/capability-execution/call-recovery.actions.ts`, `src/components/ae/call-receipt/CallRecoveryPanel.tsx`; tests in `tests/unit/capability-execution/call-recovery-actions.test.ts`. Hosted production proof remains outside source acceptance ([PRODUCT.md](../../PRODUCT.md) § Product language and compatibility). |
| **Anxiety / trust requirement** | Resumability from stable references; idempotent uncertain paths ([PRODUCT.md](../../PRODUCT.md) § Operating principles). |
| **NOT a job** | **Repeat the same Call blindly** — retry without reconcile is unsafe ([CONTEXT.md](../../CONTEXT.md) § Suggested next action). |

---

## Agent (acts through Account + Spending policy)

### J-A01 — Operate within delegated authority

| Field | Content |
| --- | --- |
| **Actor** | Agent |
| **Job statement** | When my harness hits a capability gap during work, I want to authenticate once and use the managed Tool path with policy checks applied, so I can quote and call without coordinating AE subsystems or choosing treasury pools, without exceeding the Customer’s Spending policy or inventing account context. |
| **PRODUCT.md journey(s)** | 1–3 |
| **Observable success** | Target path: `registry.tools.search` → `tool.quote` → `tool.call` → result; recovery actions only when needed ([PRODUCT.md](../../PRODUCT.md) § Agent operating model). |
| **Grade** | **PARTIAL** — `convex/chatTools.ts`, package/CLI action descriptors; `agentAccess.whoami` / balance reads documented in [PRODUCT.md](../../PRODUCT.md). Full installed-client and hosted deployment acceptance: **CHARTER** hold. |
| **Anxiety / trust requirement** | Caller never supplies `accountRef`; Quote revalidates before effect ([PRODUCT.md](../../PRODUCT.md)). |
| **NOT a job** | **Become the Customer** — Agent is durable technical identity, not economic owner ([CONTEXT.md](../../CONTEXT.md) § Agent). |

### J-A02 — Return a usable contribution to the harness

| Field | Content |
| --- | --- |
| **Actor** | Agent |
| **Job statement** | When a Call completes or reaches a terminal recovery state, I want a bounded output and explicit next action metadata, so I can continue the Customer’s objective in the original app, without absorbing prompts, plans, or chain-of-thought into AE. |
| **PRODUCT.md journey(s)** | 3 |
| **Observable success** | Non-terminal responses expose at most one Suggested next action; terminal Call yields outcome suitable for harness consumption ([CONTEXT.md](../../CONTEXT.md) § Outcome records). |
| **Grade** | **PARTIAL** — Call worker and receipt projections (`convex/capabilityCallWorker.ts`, `src/modules/capability-execution/call-receipt-view.ts`). Buyer-reported use and allocation aggregates: **CHARTER** ([PRODUCT.md](../../PRODUCT.md) § Agent operating model). |
| **Anxiety / trust requirement** | Bounded evidence only; no universal quality score ([PRODUCT.md](../../PRODUCT.md) § Operating principles). |
| **NOT a job** | **Store project memory in AE** — non-goal ([PRODUCT.md](../../PRODUCT.md) § Non-goals). |

---

## Provider

### J-P01 — Publish a callable Tool

| Field | Content |
| --- | --- |
| **Actor** | Provider |
| **Job statement** | When I offer a versioned callable capability, I want to admit, publish, and maintain a Tool with price and terms on the canonical market, so I can receive Calls through AE’s controlled path, without buyers treating imported registry metadata as executable supply. |
| **PRODUCT.md journey(s)** | 4 |
| **Observable success** | Tool is the only callable unit; publication distinct from portfolio Service, Listing, Source ([CONTEXT.md](../../CONTEXT.md) § Tool; § Offering/Publication). Provider workspace shows inventory and publication state. |
| **Grade** | **PARTIAL** — supply funnel `src/modules/capability-supply/internal/publication/`, operator routes `src/routes/_operator/owner.operations.tsx`, `src/routes/_operator/owner.operations.new.tsx`, `src/components/ae/offerings/provider-workspace/AeProviderWorkspace.tsx`. End-to-end signed-in publication proof noted as gap in `docs/operations/jev-platform-integration-register.md`. |
| **Anxiety / trust requirement** | Admission and withdrawal under AE control where AE is Seller; upstream performance remains Provider obligation ([CONTEXT.md](../../CONTEXT.md) § Provider). |
| **NOT a job** | **List metadata only** — external registry discovery without admission is not a published Tool ([PRODUCT.md](../../PRODUCT.md) § Active product). |

### J-P02 — Reach demand without owning distribution

| Field | Content |
| --- | --- |
| **Actor** | Provider |
| **Job statement** | When buyers search with different vocabulary, I want my Tool to be discoverable and quotable on the same market Agents already use, so I can receive incremental Calls, without building bespoke agent integrations per harness. |
| **PRODUCT.md journey(s)** | 4; reinforced by journeys 1–2 on buyer side |
| **Observable success** | Published Tool appears in canonical catalogue/search and accepts Quote/Call through AE interfaces ([PRODUCT.md](../../PRODUCT.md) § Product surfaces). |
| **Grade** | **PARTIAL** — public catalogue and HTTP/MCP/CLI surfaces ([PRODUCT.md](../../PRODUCT.md) § Product surfaces; `src/routes/for-providers.tsx`). Measurable Provider activation and repeat demand: **OPEN** (requires operational metrics interviews). |
| **Anxiety / trust requirement** | Provider earnings and obligations recorded separately from buyer Charge ([CONTEXT.md](../../CONTEXT.md) § Charge / Provider obligation). |
| **NOT a job** | **Operate a separate agent marketplace** — AE is one commercial boundary, not a harness ([PRODUCT.md](../../PRODUCT.md) § Ownership boundary). |

---

## Returning Customer

### J-R01 — Repeat purchase with less friction

| Field | Content |
| --- | --- |
| **Actor** | Returning Customer |
| **Job statement** | When a comparable need arises again, I want the market to use prior bounded outcome records without retaining my wider task, so I can reach a good Tool and Quote faster, without re-proving authority or re-learning catalogue mechanics each time. |
| **PRODUCT.md journey(s)** | 6 |
| **Observable success** | Second comparable purchase passes through AE; matching/allocation improves from observed price, latency, delivery, failure, recovery evidence ([PRODUCT.md](../../PRODUCT.md) § Later differentiation — compounding loop). |
| **Grade** | **CHARTER** — Package 4 observations described in [PRODUCT.md](../../PRODUCT.md) § Agent operating model; selection consumer for repeat allocation not established. Automatic outcome retention in source is **PARTIAL** at Call level only (`src/routes/_operator/activity.tsx`). |
| **Anxiety / trust requirement** | Buyer permits use of records; provenance preserved ([PRODUCT.md](../../PRODUCT.md) § Strategic advantage). |
| **NOT a job** | **Personalised homepage** — progressive matching is operational recall, not a dashboard destination. |

### J-R02 — Re-authorise and re-fund with confidence

| Field | Content |
| --- | --- |
| **Actor** | Returning Customer |
| **Job statement** | When Agents, credentials, or credit change between purchases, I want to see current policies and balances before the next Call, so I can keep recurring use safe, without silent limit drift or confusing a rotated credential with a new Agent. |
| **PRODUCT.md journey(s)** | 6 (sustained use); 3 |
| **Observable success** | Spending policy version and limits visible; credential rotation does not reset aggregate history ([CONTEXT.md](../../CONTEXT.md) § Agent, § Spending policy). |
| **Grade** | **PARTIAL** — `src/components/ae/console/agent-operator-console/`, `src/routes/_operator/agent-access.tsx`, credit surfaces in J-B06. |
| **Anxiety / trust requirement** | Stable Agent identity across credential changes ([PRODUCT.md](../../PRODUCT.md) § Operating principles). |
| **NOT a job** | **Re-onboard from scratch every month** — returning use should reuse Account and policies. |

---

## Support / recovery operator

### J-S01 — Reconcile an uncertain Call on behalf of the account

| Field | Content |
| --- | --- |
| **Actor** | Support / recovery operator |
| **Job statement** | When a Customer reports a stuck or ambiguous Call, I want to inspect the same Call receipt and apply supported recovery transitions, so I can restore a explainable purchase state, without creating a duplicate Charge or advising illegal retry of a possibly dispatched Call. |
| **PRODUCT.md journey(s)** | 3 (remedy); purpose (“help when a purchase goes wrong”) |
| **Observable success** | Operator or Customer reaches terminal purchase resolution or explicit open uncertainty with linked remedy evidence ([PRODUCT.md](../../PRODUCT.md) § Purchase resolution). |
| **Grade** | **PARTIAL** — recovery API and UI cited in J-B08; operator audit surfaces `src/routes/_operator/admin.audit-events.tsx`. Role-specific support console scope: **OPEN** (no interview-backed support playbook). |
| **Anxiety / trust requirement** | Separate AE-observed vs Provider-claimed vs buyer-reported facts ([PRODUCT.md](../../PRODUCT.md) § Operating principles). |
| **NOT a job** | **Manually edit ledger rows** — recovery follows Call contracts, not ad hoc SQL. |

### J-S02 — Explain failure and next step to the Customer

| Field | Content |
| --- | --- |
| **Actor** | Support / recovery operator |
| **Job statement** | When a purchase failed or is pending reconciliation, I want plain-language status tied to `callRef` and the promised adjustment path, so I can reduce anxiety and prevent harmful retries, without pretending delivery, payment, and purchase resolution are the same fact. |
| **PRODUCT.md journey(s)** | 3; Evidence required ([PRODUCT.md](../../PRODUCT.md)) |
| **Observable success** | Customer hears what is known, unknown, and the one supported next action; failed purchase yields adjustment or refund per charter ([PRODUCT.md](../../PRODUCT.md) § Business records and accountability). |
| **Grade** | **PARTIAL** — copy and structure in `src/components/ae/call-receipt/CallReceiptPrimitives.tsx`, `src/components/ae/status/system-status/system-status.contracts.ts`. Whop/Locus-grade support ergonomics: **OPEN**. |
| **Anxiety / trust requirement** | Do not claim compliance or accounting outcomes AE does not know ([PRODUCT.md](../../PRODUCT.md) § Australia as the first institutional implementation). |
| **NOT a job** | **Send a generic “check your dashboard” reply** — explanation must anchor on Call identity and recovery rules. |

---

## Cross-job invariants (do not collapse)

From [PRODUCT.md](../../PRODUCT.md) § Operating principles and [CONTEXT.md](../../CONTEXT.md):

| Invariant | Jobs affected |
| --- | --- |
| Funding ≠ authority | J-B05, J-B06, J-A01 |
| Authority ≠ purchase | J-B05, J-B03 |
| Settlement ≠ purchase resolution | J-B07, J-S02 |
| Delivery ≠ payment status | J-B07, J-B08, J-S01 |
| Quote ≠ Call | J-B02, J-B03, J-A01 |
| Directory import ≠ Tool | J-B01, J-P01 |

---

## Coverage index (minimum set)

| Required theme | Job ID |
| --- | --- |
| Find despite vocabulary | J-B01 |
| Compare without huge catalogue | J-B02 |
| Buy and continue | J-B03, J-A02 |
| No-fit | J-B04 |
| Repeat match | J-R01 |
| Publish a Tool | J-P01 |
| Grant agent authority | J-B05 |
| Fund without confusing funding with authority | J-B06 |
| Recover a Call | J-B08, J-S01 |
| Explain a purchase | J-B07, J-S02 |

---

## Sources

- [PRODUCT.md](../../PRODUCT.md) — purpose, journeys 1–6, chain, boundaries, agent path  
- [CONTEXT.md](../../CONTEXT.md) — Customer, Agent, Account, Spending policy, Tool, Quote, Call, roles  
- Implementation evidence — routes under `src/routes/`, modules under `src/modules/`, `convex/chatTools.ts`, `convex/marketDemandSignals.ts`  
- Programme status — [jev-platform-integration-register.md](./jev-platform-integration-register.md) (buyer chat comparison/no-fit gaps)
