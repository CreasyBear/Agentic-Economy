# Project research record: Market forms for an agentic economy — what can be marketized, and which mechanism fits which good

**Owner:** Founder
**Status:** Active
**Maturity:** External field (primary-source literature review) + Hypothesis (AE application)
**Question:** In a real agentic economy AE could host markets for anything — services, data, spatial rights, time/slots, capabilities, physical capacity, compute, analysis/answers, attention — monetary or not. What does mechanism-design literature and 2024–2026 practice say about which market form fits which good, and what does that imply for AE's primitives?
**Decision affected:** None yet (informs any future decision record on marketizing Requests; companion to `.planning/research/2026-07-17-demand-side-tender-market-exploration.md`)
**Evidence cutoff:** 2026-07-17
**Review by:** 2026-08-17
**Supersedes:** None
**Superseded by:** None

Four independent primary-source literature passes: mechanism-design foundations; data/information markets; time/spatial/physical/compute resource markets; agent-to-agent and capability markets 2024–26. Every claim below is OBSERVED (cited) in the underlying reviews or INFERRED (marked).

## 1. The headline synthesis (INFERRED, grounded throughout)

**A "market for anything" layer is not one mechanism — it is a mechanism SELECTOR keyed on the good's economic properties.** The literature converges on a small property set that determines the fitting market form: *rival / non-rival; verifiable / unverifiable (pre-trade and post-trade); perishable / durable; divisible; complementary; contractible; counterfactual*. AE's registered capability contract is the natural place to declare these flags; the market layer then routes to the right clearing mode.

**The verifiability ladder** (the single most predictive property):

| Verifiability of the good | Fitting form | Canonical evidence |
|---|---|---|
| Unverifiable pre- and post-trade (capability calls, raw data quality) | **Free listing + reputation ranking; no posted price** | MCP Registry (deliberately priceless), Smithery; Akerlof lemons; Arrow's paradox |
| Verifiable post-trade only (answers, deliverables, negawatts) | **Bounty/tournament on verified delivery; baseline attestation** | Kaggle rank-order tournaments; Algora/Replit escrowed bounties; AEMO WDRM baselines |
| Verifiable + durable (standardized services, known-value goods) | **Posted price** | eBay's shift from auctions (Einav et al., JPE 2018); Snowflake/AWS data listings |
| Verifiable + perishable + finely metered (compute, electricity, attention) | **Auction / clock, repeating settlement** | AEMO NEM 5-min dispatch; OpenRTB (~billions of machine auctions/day); SF Compute double auction |
| Complementary bundles with exclusivity (spectrum, spatial rights) | **Combinatorial / core-selecting clock** | FCC Incentive Auction (Milgrom-Segal) |
| Money repugnant or impractical | **Two-sided matching (deferred acceptance), quota/reservation** | Roth-Shapley kidney exchange/school choice; FAA/NASA UTM 4D reservation |
| Counterfactual quantity (demand response, "work avoided") | **Metered baseline + attestation; price is secondary** | AEMO WDRM baseline-gaming reforms |
| Information/probability itself | **Subsidized market maker (LMSR) / CLOB** | Hanson LMSR; Polymarket/Kalshi 2024-26 |

## 2. Cross-cutting design rules (the 12 scouts' rules, deduplicated to 6)

1. **Properties select the mechanism, never a default.** EC2 *retreated* from auctions to smoothed posted prices (2017); eBay retreated from auctions to buy-it-now; auctions earn their overhead only for scarce, high-value, finely-metered perishables. Default any new AE market to posted-price + availability gates; graduate to auction/clock only when liquidity and unit value justify it. (OBSERVED: AWS spot redesign; Einav et al.)
2. **Rank and admit by attributable settled evidence, never claims.** x402 Bazaar's entire catalog is settlement-gated (an endpoint lists only after ≥1 real settled transaction) and ranked by objective post-facto signals (distinct-buyer reach, volume, recency decay). This is AE's receipt stream applied as market admission — the structural anti-slop/anti-pay-to-rank defense. (OBSERVED: Coinbase Bazaar docs.)
3. **Sell answers/computations over data, not the data.** Arrow's paradox + non-rivalry make raw-data spot markets structurally leaky; practice converged on clean rooms, compute-to-data, arbitrage-free query pricing, and per-use metered access (Cloudflare Pay-Per-Crawl, x402, TollBit). For AE: a data-holding business exposes a *priced bounded answer* action, never a corpus transfer. (OBSERVED: Ocean C2D, IAB clean rooms, Koutris JACM 2015, Data Shapley.)
4. **Where the good is unverifiable or counterfactual, market integrity lives entirely in the attestation layer.** Negawatt baselines, GPU attestation, carrier double-brokering — every such market bolted on the evidence layer after the fact. AE has it first (attributable evidence/receipts, capability contracts): this is the moat, not a feature. (OBSERVED: AEMO WDRM reform; Akash GPU-visibility upgrades.)
5. **Engineer thickness and fight congestion before optimizing price** (Roth 2008): markets die of thinness/timing first. AE mapping: durable Request aggregates demand (thickness); comparison engine curates tractable candidate sets (congestion); strategy-proof mechanisms + per-action authority make truthful participation safe (safety). Non-monetary forms must be first-class or the market never gets thick enough to price anything.
6. **Agents are today unreliable market principals — human authority gates are a market feature, not a limitation.** Project Vend's Claude lost money (below-cost selling, discount-cajoling, hallucinated payee); Upwork's own index shows agents fail solo (+70% with humans); Fish et al. show LLM pricing agents *tacitly collude* from prompt wording alone. Implications: (a) AE's per-action authority binding with price/time caps is exactly the AP2-mandate-shaped guardrail the evidence demands; (b) agent-set prices in thin markets are an antitrust surface — log pricing policies/prompts as collusion-relevant evidence; prefer strategy-proof mechanisms so agents needn't meta-strategize. (OBSERVED: Anthropic Project Vend; arXiv:2404.00806; Upwork HAPI; DeepMind arXiv:2509.10147 prescribes *designed* — not emergent — agent markets with auction allocation.)

## 3. What this means for AE's primitives (INFERRED)

The 2025-26 stack split cleanly into **rails** (x402, ACP, AP2 — authorization + settlement + evidence) and **markets** (only x402 Bazaar really ships one). AE's primitive set — durable Request, registered capability contract, per-action authority mandate, attributable receipts, comparison engine — **is rails + admission + comparison, i.e. the scarce part**. Mechanisms (posted price, clock, matching, tournament) are thin, well-understood modules on top:

| AE primitive | Market-infrastructure role (per the literature) |
|---|---|
| Durable Request | Demand aggregation → thickness (Roth); the tender/order object (load board, reverse auction) |
| Capability contract | Good-property declaration (rival/verifiable/perishable/complementary flags) → mechanism selection |
| Per-action authority binding | AP2-mandate analog: signed, scoped, expiring, price/time-capped trade authority; the anti-Vend guardrail |
| Attributable evidence/receipts | Settlement-gated admission + objective ranking (Bazaar); baseline attestation for counterfactual goods (WDRM) |
| Comparison engine | Congestion relief (Roth); multi-attribute scoring that keeps reverse auctions from quality-shaded price wars (procurement lit) |
| Neutral engine / no domain nouns | The mechanism selector must stay good-agnostic — exactly ADR-009 gate 11 |

**Strategically important (INFERRED): several market forms move no money and are viable before P5 money authority** — two-sided matching (deferred acceptance over Requests × capabilities), reservation/quota clearing (UTM-style 4D slots for time/space goods), rank-order tournaments with deferred monetary award, reputation-ranked listing (Bazaar-style, receipts as currency), and information aggregation. A "markets for anything" program does not have to wait for money rails; it has to wait for *supplied-candidate machinery* (Phase 3) and *attestation admission* (already designed).

## 4. Failure modes an agent-run market must design against (OBSERVED across reviews)

Spam/sybil bids (free production ⇒ free spam; answer = costly signals + settlement-gated admission); winner's curse + quality shading in price-only procurement (answer = scoring rules over attested quality); tacit LLM collusion (answer = strategy-proof mechanisms, reserve prices, logged pricing policies); baseline gaming for counterfactual goods; leakage/arbitrage in data markets (answer = bounded answers, arbitrage-free query pricing); exposure problem in complementary bundles (answer = combinatorial clearing); unraveling/congestion (answer = timing rules, curated sets); repugnance limits (answer = matching, not prices).

## 5. UNKNOWNS / next questions

- Which two market forms should AE prototype first? (Leading candidates per this review: **work-sample tender** = reverse auction + scoring over attested artifacts (companion record, H-1..H-3); **matching without money** over Requests × registered capabilities — pre-P5-safe and exercises the neutral engine.)
- Where does mechanism choice live in source? (INFERRED: as declared flags on the capability contract + a market-mode field on the Request — needs a design pass under ADR-009 gate 11 naming discipline.)
- AU-specific regulatory posture for any priced market form (NEM/WDRM precedents are AU-native and instructive; gambling/CFTC-style limits for information markets).

## 6. Source anchors (primary; full URLs in the four underlying reviews)

Mechanism design: Vickrey 1961; Milgrom-Segal FCC incentive auction (PNAS 2017); Einav-Farronato-Levin-Sundaresan JPE 2018; Roth Hahn Lecture 2008; Roth-Shapley Nobel 2012; Hanson LMSR. Data: Jones-Tonetti; Arrow; Acemoglu "Too Much Data"; Ghorbani-Zou Data Shapley (ICML 2019); Koutris et al. JACM 2015; Ocean C2D; IAB clean rooms; Cloudflare Pay-Per-Crawl; Reddit-Google licensing. Resources: AWS EC2 Spot redesign; Akash bid engine; SF Compute order book; Littlewood/Belobaba EMSR; FCC incentive auction; SFpark; FAA UTM ConOps v2; DAT load boards; AEMO NEM 5-min dispatch + WDRM. Agents: MCP Registry; Smithery; OpenAI Apps SDK monetization; x402 + Bazaar; Stripe/OpenAI ACP; Google AP2; DeepMind "Virtual Agent Economies" (arXiv:2509.10147); Fish et al. LLM collusion (arXiv:2404.00806); Anthropic Project Vend; OpenRTB/ARTF; Algora/Replit bounties; Upwork HAPI.

---
*Companion to the tender-market exploration record. Research, not a decision; ROADMAP's request-market cut stands until a decision record says otherwise.*
