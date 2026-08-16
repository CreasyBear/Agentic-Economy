# AE Conceptual Map — the vision authority

**Status:** confirmed by founder (2026-08-08) as the fundamental vision. Companion to `PROJECT.md`
(product charter) and `BRAND.md` (voice, locked). This file names AE's category and the destination
each module grows toward; product agents must not turn the destination into an unshipped claim.

## The core sentence

**Canonical category sentence:** “Agentic Economy is the market and controlled transaction layer where authorized agents discover, buy and invoke admitted third-party Market Operations, and suppliers are paid after contract-valid delivery.”

**Principal and delegated agent:** A human or organization is the **Principal**: it owns authority and budget. The agent is the Principal’s delegated shopper and distribution interface: it discovers, compares, buys and invokes within that authority. A **Supplier** hosts the implementation; AE admits its callable `Operation`, projects it as a `Market Operation`, and owns the invocation identity, policy boundary, evidence, Qualified Use, metering and reconciliation. AE does not host supplier runtimes.

**Destination meaning:** Developers build and host agent capabilities wherever they choose. AE admits each callable `Operation`, projects it as a `Market Operation`, distributes it to agents, and meters verified usage and payment through AE’s invocation/evidence boundary. A `Supplier`/business is the portfolio rollup; a `Provider` remains the registered Business that can fulfil an `Operation`.

**Category shorthand:** OpenRouter for agent services: one agent-facing market and invocation interface over many supplier-hosted Operations. AE provides a Vercel-style self-serve publishing and operating experience without owning the runtime. The consuming agent is the app store: it discovers, compares, buys and invokes services at runtime rather than sending a human through a storefront and installation flow.

**Category guardrail:** Trades, Australian small businesses, BAS and human-service coordination may be future suppliers/use cases; they are not the category, ICP, wedge or default product frame.

This sentence names the destination; the implementation map below is not proof that production settlement, independent supply or customer value is already established.

Provider-side destination loop:
`Capability` implementation hosted by the supplier → admitted typed `Operation` →
discoverable `Market Operation` → verified metered usage → payment/settlement.

AE hosts the market and transaction boundary, not provider code. Skills, SDKs and repositories
remain acquisition, lineage and distribution inputs; they become market supply only through an
admitted callable `Operation` with an evidence path.

## Creator/UGC supplier-economy operating model (destination)

Mature Instagram/YouTube-style creator/UGC platforms are the operating-model analogy for AE's supply, discovery, distribution and monetization—not a category rename. Eligible businesses and developers publish supplier-generated Operations with supplier-hosted implementations, including bespoke datasets behind them; at the destination, AE admits and indexes them as immutable, versioned Market Operations and recommends/distributes them into normal agent workflows for low-commitment, one-use consumption. Supply is consumed by agents, not hosted as AE content.

| Creator/UGC pattern | AE canonical mapping |
| --- | --- |
| creator | Supplier/Provider |
| post/asset | immutable, versioned Market Operation |
| feed/search/recommendation | agent discovery and distribution |
| passive view/impression/exposure | distribution observation, not invocation |
| active use | invocation |
| qualifying engagement/conversion | non-owner, contract-valid production invocation with required evidence and exclusions = Qualified Use |
| creator earnings | supplier accrual/settlement only after Qualified Use plus separately authoritative reconciled economic settlement |
| insights/trends | privacy-safe aggregated demand gaps and operation-level evidence |

The operating loop is **publish → admit → distribute → invoke → validate → settle → learn → revise/withdraw**. Three gates stay distinct:

- **Admission/publication/eligibility:** the exact contract, provenance, authorization/ownership, license/derivation rights and immutable lineage determine which callable supplier Operation enters the market; readiness is a later independent routeability gate, and Principal/execution authority is a later independent invocation gate.
- **Recommendation/distribution:** ordering is contextual and evidence-class-labelled, using contract fit, price, freshness, readiness, non-owner Qualified Use, reliability/latency and bounded exploration for new supply—never gross calls, owner traffic, popularity alone or one opaque score.
- **Qualified Use and monetization/settlement:** Qualified Use is only a non-owner, contract-valid production invocation with required evidence and exclusions; passive views, impressions and exposure are distribution observations, active use is invocation, and Qualified Use is independent of payment settlement. Supplier accrual/settlement requires Qualified Use plus separately authoritative reconciled economic settlement. Owner traffic, invalid/refused/failed/unknown calls, stars, likes and popularity are not Qualified Use.

**Supplier insight loop:** operation-level evidence and Qualified Use return privacy-safe aggregated demand gaps to suppliers; raw supplier data is never exposed merely to improve discovery. Aggregated demand gaps may induce bespoke datasets/Operations, but never leak Principal prompts or data. **Originality/provenance rule:** authorized licensed or materially derived supply is allowed and distinguished from unauthorized copy/republication; anti-copy/unauthorized-republication controls do not ban authorized source use; provenance/validity never proves semantic truth.

**Analogy boundaries:** Agent runtimes consume and distribute supply but do not become Principals. This is one-to-many publishing/distribution and low-commitment one-use consumption—not influencer or brand-campaign procurement, creator hiring, briefs, applications, collaborations or a bilateral supplier relationship. AE does not host content or supplier runtimes; OpenRouter remains the structural analogy, and no analogy replaces Principal, Consuming Agent, Supplier/Provider, Operation, Market Operation or Qualified Use.

This is a destination model, not proof of independent supply, production settlement, recommendation quality or a functioning flywheel. Primary analogy references: [Roblox recommendations and ranking](https://en.help.roblox.com/hc/en-us/articles/21416941036564-Recommendations-and-Ranking-on-Roblox), [Instagram recommendations and originality](https://creators.instagram.com/recommendations-and-originality), [mod.io Marketplace](https://support.mod.io/hc/en-us/articles/9860328171151-How-does-mod-io-Marketplace-work), and [YouTube Partner Programme](https://support.google.com/youtube/answer/1311392).


## World if it works

This is a conditional economic picture, not a present-tense proof claim:

- **Distribution:** Creator/UGC is the distribution analogy. A supplier can publish one narrow capability and let agent runtimes carry it into many workflows; hosted supply is paid, not free.
- **Structure:** OpenRouter is the structural analogy: one agent-facing interface over heterogeneous supplier-hosted operations. Neither analogy is an identity claim.
- **Competition:** The competitive unit is the versioned Market Operation, judged by contract, price, evidence and Qualified Use—not a broad supplier directory profile.
- **Product marketing:** The product is machine-facing first: runtimes need exact operation contracts, prices, invocation semantics and delivery evidence; humans and organizations remain the Principals who set authority and budget.
- **Economic possibility:** One developer with one exceptional narrow capability can become a business when runtime distribution creates repeat independent purchase and Qualified Use. That is a possibility to test, not evidence that the market already works.

## First-party demand application (subordinate proving ground)

The first-party person-facing execution application is a demand-side proving ground for the category, not the category itself. A Principal can hand an outcome to an authorized agent; the agent narrows decisions, selects admitted Market Operations and invokes them within granted authority. The application tests trust, evidence, recovery and usability around the market boundary.

The old local-service, quote-collection and person-first decomposition framing is historical provenance only. It is superseded as the category, ICP, wedge and default product frame. The process used to build AE itself remains internal craft: grill → locked decisions → map → studies → comparisons → commitments → receipts.

## First-party demand application: projects are durable, not conversational

An ask is not a chat. It becomes a **real project: a long-running decision tree that people come in
and out of.** Sessions are visits. The person leaves mid-plan and returns days later to find studies
completed, supplier results recorded, contract-valid evidence collected, and only decisions waiting
for them. Durability, resumability, and asynchronous progress are structural requirements, not
features.


## First-party demand application primitives: what a PM does at the engineering level (the eleven primitives)

| # | Primitive | Mechanics |
|---|---|---|
| 1 | Elicit | Interview: outcome, hard constraints (date/budget/non-negotiables), wants vs needs, prior decisions. Separate goal from solution-guesses. |
| 2 | Frame | Measurable outcome + scope fence + assumptions register. |
| 3 | Decompose | Outcome → facets → work packages → dependencies. |
| 4 | Rank decisions | Load-bearing decisions first: irreversibility × constraint-power × lead time. |
| 5 | Study (operation choice) | Discover admitted Market Operations → inspect contract, price and evidence → compare → recommendation. |
| 6 | Budget | Ranges, contingency, cash-flow against the envelope. |
| 7 | Schedule | Backward-plan from the end date; lead times, buffers, milestones. |
| 8 | De-risk | Plan B per commitment; fallbacks warm; uncertainty holds. |
| 9 | Govern authority | Who decides/approves/is informed; nothing consequential unsigned. |
| 10 | Drive | Commit, invoke, verify against acceptance, collect receipts, re-plan on divergence. |
| 11 | Account | Progress, burn, blockers at a glance; closeout = evidence trail. |

## First-party demand application module map (conceptual packages)

```
THE GRILL (intake)          THE MAP (decision architecture)
  intake/    Elicitation      decompose/  Facets→decisions→tasks; domain playbooks
  charter/   Goal predicate,  decision-graph/ Nodes ranked by irreversibility ×
             constraints,                    constraint-power × lead time;
             wants/needs,                    visible narrowing is the progress bar
             envelope, date

THE ECONOMY (where it runs) THE SPINE (trust & time)
  study/     Operation selection:       authority/  observe → propose → approve-each →
             discover → inspect →        mandate-within-bounds (trust ratchet)
             compare → recommend         wayfinder/  Backward-plan from the date; frontier;
  market/    Registry, priced            chases; re-plans (change control)
             capabilities,                evidence/   Receipts, attempts, burn — the
             web discovery as             project's story
             Imported Claims              recovery/   Plan-B branches, uncertainty holds,
  commerce/  Authorize→reserve→invoke→   honest cancellation
             validate→settle (x402)       memory/     Standing preferences across projects
```

Product surfaces: person UI (dialog + plan card + timeline), agent API (`/llms.txt`, `/SKILL.md`, MCP),
supplier console (publish once, earn from agent demand).

## First-party demand application journey: “Where do we even start?” — eight acts, trust ratchets one notch per act

1. **The wall** — they type the big thing. No form, no category picker.
2. **The grill** — one question at a time, each with a recommended answer they can just accept.
   Competence signal: "it asked what I didn't know to ask." They only answer.
3. **The map** — facets appear; load-bearing decisions highlighted in the order they matter.
   "Three decisions unlock everything else." They only look.
4. **Studies fan out** — the market runs: admitted Operations first, contract and evidence facts in; weighted comparisons scored against the Principal’s constraints, with a recommendation. They only read.
5. **Decide** — they tap; the tree visibly collapses; frontier unlocks. Entropy reduction is the
   dopamine loop.
6. **Commit** — approvals bound to exact actions; deposits within a granted envelope; receipts accrue.
   One approval at a time, then earned mandates ("handle everything under $X like this").
7. **Wayfind to the date** — chases, follow-ups, re-plans happen without them; they see only new
   decisions and movement. A vendor falls through → recovery branch, one clean question, no crisis.
8. **Done** — the receipt trail is the story. Closeout feeds preference memory; the next big thing
   starts smarter.

## Why the first-party demand application is defensible

A chat assistant can do acts 2–3 as prose. Acts 4–8 require the economy: admitted priced Market
Operations, an authority seam, invocation, settlement and evidence. Doors 2 and 3 are not side
features — they are why the decided path ends in receipts instead of a to-do list. Domain playbooks
(which facets, which decisions matter, per project type) compound as proprietary knowledge with every
project run.

## Continuity of the first-party demand application with the current repo (embryo → destination)

| Today | Grows toward |
|---|---|
| Customer Request | Charter |
| Plan contracts (`enginePlans`) | Decision Graph (long-running, re-enterable) |
| Registered actions + sandbox Market Operations | Operation-selection supply |
| `web.discover` / Imported Claims | Market scan where supply is thin |
| Approval Grant / RouteMandate | Authority ratchet (approve-each → mandates) |
| `enginePlanEvents` | Evidence Ledger |
| T24 executable recovery | Wayfinder runtime's first obligation |
| T25 x402 tool spend | Commerce settlement leg |
