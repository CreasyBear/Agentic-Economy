# aecon pitch kit — September 2026 (v3, considered draft)

## 0. Method and principles

Researched: earliest pitch material of Stripe, Plaid, Coinbase, Brex, Ramp, Twilio, OpenRouter; Sequoia and YC deck guidance; current a16z, YC, Stripe, Google, Coinbase, Visa and Mastercard writing on agentic commerce; the whitepaper's own keystone and scenarios.

Principles the draft must satisfy:
1. **One quantified simplification.** Stripe: 7 lines vs 300. Twilio: 5 verbs. aecon needs one such contrast.
2. **Pain first, told as a specific scene**, not a category. Brex opened with rejection letters.
3. **Land inside the frame the audience already holds, then extend one step.** Investors already say "agentic commerce" and already list authorisation, identity and liability as unsolved. Use their words.
4. **Depth shows as precision, not volume.** One domain insight, stated cleanly, is the "secret sauce" slide. Mechanisms and regulation stay for conversation.
5. **Present tense, working product.** Show one purchase happening.

## 1. Purpose statement (Sequoia slide 1)

aecon lets a business's AI agents buy services from providers the business has never dealt with, without the business giving up responsibility for the purchase.

## 2. Thesis (v5, agreed altitude 2026-09-09)

**Software has agency.** An agent working a task now decides for itself which tools it uses. Not the developer who built it, not the business that runs it. It looks at what it lacks, finds something that fits, and uses it.

**Software can pay.** x402 and channels like it let software meet a price and settle it on the spot, per request, no account, no human. In its first year x402 carried over a hundred million such payments. Software went from being able to choose to being able to buy.

**So everyone becomes a seller.** When there is a buyer that never sleeps, is never satisfied, and pays per use, every business and every person with a capability has a reason to expose it. A surveyor's field data. A law firm's precedent search. A logistics firm's live rates. A hobbyist's weather model. Not as apps for people, as services for agents. Successful products will expose agent-composable capabilities and services will become software-delivered outcomes. The supply side of a new economy switches on one capability at a time, mostly from people who never thought of themselves as software vendors.

**A new economy needs a market.** Where supply can be found by the software that needs it. Where price is binding before the call. Where delivery is evidenced and failure has a remedy. Where a stranger's capability can be bought once, safely, by a machine acting for someone else. The rails move money. The gateways make calls easier. Nobody is building the market.

**aecon is the market for the agentic economy.** Built in Australia first because a national economy is the right size to prove that a whole market of agents buying from a whole market of suppliers runs as ordinary commerce. Businesses with budgets are the first buyers. Their accountants are why the records are clean. Both are consequences. The reason to exist is the market.

**One line:** The agent is now the app store. aecon is the economy behind it.

## 2b. Horizontals, parallels, diagonals (explored 2026-09-09)

### Horizontals: markets that formed when a new buyer or seller appeared
eBay, App Store, Taobao, Upwork, Uber, Airbnb, AdWords, Stripe Connect, Shopify, NYSE. Every one had to provide the same five things before supply switched on:
1. Trusted settlement (escrow, processor, clearing house).
2. Reputation that travels with the seller (feedback, ratings, quality score).
3. Discovery with a binding price (search plus a price the market coordinates on).
4. Dispute resolution (refund, resolution centre, arbitration).
5. Near-zero onboarding friction for sellers (Taobao free listings beat eBay's paid ones).

Supply ramps were fast once all five existed: App Store 500 apps day one, 3,000 in three months; Airbnb 2,500 listings in seven months; eBay 200,000 auctions in fourteen months.

The agentic economy in 2026 has settlement (x402) and low onboarding friction (any HTTP endpoint). It lacks binding price discovery across providers, seller reputation, and any dispute mechanism. That is the exact list of what "building the market" means, and it is what the comparators in section 7 do not do.

### Parallels: economies that reorganised around a new actor
Joint-stock company, telegraph and futures exchange, credit cards and merchant networks, the shipping container, web publishing and Google, smartphones and app stores, APIs as products, programmatic advertising.

Closest parallel: **programmatic advertising**. Real-time bidding is already software buying from software, per impression, in milliseconds. Every publisher became a seller through a supply-side platform. Every advertiser became a buyer through a demand-side platform. The exchanges and platforms in the middle take a fifth to a half of spend. US programmatic is around US$57bn a year, and it took about five years to scale from 2007.

Recurring lesson across all eight: **the party that operates the exchange connecting the new buyer to the new sellers captures the value**, typically 10 to 50 percent of transaction value, because it supplies the four things neither side can supply alone: liquidity, trust and settlement, standards, and price discovery. Not the first buyer, not the first seller. The exchange.

Second lesson: the institution lags the capability by years. Container 1956, ISO standard 1968. Telegraph 1844, standardised futures 1864. x402 2025; the market is not yet built.

### Diagonals: what changes across the economy
- **Pricing** moves to per-request and per-outcome. Vendors bet their P&L on delivery. Finance teams lose predictability and gain attribution.
- **Distribution** moves from SEO and store ranking to capability matching. Whoever ranks providers for agents holds the new front page.
- **Trust** moves from brand to machine-readable delivery records. An IETF draft (ATEP) already proposes a portable agent trust credential. Evidence per call becomes the reputation asset.
- **Identity and authority** get protocolised: Visa's Trusted Agent Protocol, Google's AP2 mandate chains. Liability for a manipulated agent is unsettled and card networks are starting to distinguish it from fraud.
- **Labour** gains a long tail: individuals selling capabilities to agents as income. Around 40 percent of Upwork tasks already involve agent assistance.
- **Regulation and tax** trigger per request. Consumer law and AML assume a human buyer. Centralised platforms will embed compliance; open endpoints will defer it and risk exclusion.
- **Data** moves to strangers per request. Over-permissioned agents are the norm today. Per-task scoped access and residency rules become part of the purchase.
- **Market structure** is the contested question. Network effects push toward one global hub. Open protocols (MCP, x402, A2A) push against it. History says protocols reduce friction but do not stop platforms winning. National and vertical markets are a plausible end-state.

Most likely within three years: per-request pricing becomes default, discovery becomes agent-ranked, and authorisation and liability get regulatory shape. Most contested: whether there is one market or many.

Source quality note: the horizontal and parallel figures are from Wikipedia and primary sources. Several diagonal figures come from secondary blogs (Zylos, aiagentrank, CallSphere) and should be re-sourced before appearing on a slide.

### What this does to the thesis
1. **"Nobody is building the market" becomes precise.** The market is three missing things: binding price across providers, seller reputation, dispute resolution. aecon's Quote, evidence facts and remedy rules are those three things.
2. **The winner is the exchange, not the rails.** Every parallel says so. The rails (Coinbase, Stripe, Visa) are the telegraph. aecon is positioned as the Board of Trade.
3. **Programmatic advertising is the story to tell a judge.** Machines already buy from machines at scale; the exchanges took the value; it took five years. This is that, for capabilities instead of impressions.
4. **"Australia first" is a structural bet, not a compliance note.** If the end-state is national or vertical markets, someone builds each one. A national economy is the right size to prove the whole loop.
5. **Evidence per call is the moat.** Reputation is moving to machine-readable records. The exchange that sees every transaction holds the best map. This is the flywheel and the signals data-house proposal in one line.

## 2a. Thesis (v4, superseded)

Reader: a program judge or early investor who follows AI closely, has heard "agentic commerce," uses agents in their own work, and has never run a payments or procurement function.

### The agent is now the app store

For fifteen years software reached a business through a store. A person browsed, compared, paid, installed. The capability then sat on a shelf waiting to be used. Every commercial process a business runs, from vendor approval to the monthly invoice, assumes that a person chose in advance.

Agents remove the person and the shelf. An agent working a task discovers the capability it lacks, buys it for that one use, and moves on. The seller and the exact thing bought are unknown until the work is already under way. This is just-in-time commerce, and it is becoming ordinary. Coinbase's x402 protocol has carried over a hundred million per-request payments in its first year. Composio, Executor, Treg, Locus, AgentMuxer and Nevermined all now sell some version of "one key, thousands of tools, pay per call." The flow is intent, then agent, then marketplace, then provider. The agent is the shopper, and it is relentless.

Better models make this larger, not smaller. A model can absorb public knowledge. It cannot absorb another company's private data, its permissions, or a licensed professional's sign-off. Those stay outside the model and have to be bought. The more capable the agent, the more of them it reaches for mid-task.

Where it goes next follows from who is paying. Every one of those products sells to the developer or to the agent. The bill lands on a company card and the company finds out later. That works while agent spend is small and experimental. It stops working the moment agents are doing real work for real businesses, because a business cannot run on purchases nobody authorised, from sellers nobody vetted, with no one to call when the result is wrong. The AITAI talk asks investors to test exactly this: what responsibility is the product taking on, what authority must be delegated to it, whose budget pays.

aecon is built for the business that is paying. A business opens one account, loads AUD credit, and gives each agent a budget with rules. Its agents shop the open market of pay-per-request providers, the same market the developer tools expose. The difference is that aecon is the seller on every purchase. It holds the authority the business delegated, checks each purchase against it, pays the provider, records what was bought and whether it arrived, and refunds the business if it did not. The business gets one supplier, one invoice and a record it can show its accountant. Providers get every Australian business as a customer without onboarding a single one.

Every purchase leaves a record of which provider delivered, how fast, and at what price. That record makes the next agent's choice better, which brings more businesses, which brings more providers. The intermediary that sees every transaction ends up holding the best map of the market, and can sell that too.

The app store won because it made buying safe for both sides. Developers never needed a billing relationship with each user. Users never needed to trust each developer. One party stood in the middle and took the responsibility. aecon takes that position for agent purchases, in Australia first because a single national tax and company regime lets the accountable path be built once, and because Australian institutions are being asked to buy Australian AI now.

What aecon is not: a payment rail, a tool integration layer, or a registry. Those exist and are getting good. aecon is the customer-of-record layer that turns them into commerce a business can run on.

**One line, two candidates, tested against the reader:**
- "Agentic commerce for Australian businesses." Names the category and the customer. Says nothing about what you get. Safe for a form field, weak as a hook.
- "The agent is now the app store." Says where the puck is going in six words and makes the listener want the second sentence. Needs that second sentence: "aecon is the account behind it."

Recommended pair: **The agent is now the app store. aecon is the account behind it.**

Cold-reader note: the pair works once the listener already pictures agents as runtime shoppers. Spoken aloud, lead with one sentence of the shift first. On a form field, use the category line.

### v3 thesis (kept for comparison)

Agents now choose suppliers mid-task. An agent researching an asset finds it needs a A$3 ownership check from a provider nobody in the company has heard of. That check is worth buying. It is impossible to buy: the company's process for approving a new vendor takes days and costs more than the service. So the agent stops, or someone hands it a company card and hopes.

With aecon the same purchase takes as long as the agent takes to ask. The business has approved one supplier, once. Every provider behind it is already covered.

Here is how it works. A business loads AUD credit and gives each agent a budget with rules: what kinds of service, how much per task, where its data may go. Agents find and buy from an open market of pay-per-request providers. aecon is the seller on every purchase. It checks the rules, pays the provider, records what was bought and whether it arrived, and if it did not, refunds the business and takes it up with the provider. The business gets one supplier, one invoice, one record. Providers get every Australian business as a customer without signing up any of them.

Every serious player in agentic commerce, from a16z to Visa, names the same three unsolved problems: how a business grants an agent authority to buy, how a seller knows who it is dealing with, and who is liable when it goes wrong. Coinbase, Stripe, Google, Visa and Mastercard are building the rails that move the money. None of them wants to be the seller of record for an Australian company's A$3 purchase. That is the job aecon takes.

Why now: machine payments are real. Coinbase's x402, a protocol that lets any web service charge per request, has handled over a hundred million payments since May 2025 and its public directory of services is growing. Supply and rails exist. The account a business needs to use them safely does not.

Why here: Australia is one market with one tax and company-records regime, so the compliant path is built once and sells nationally. Australian institutions have active mandates to buy Australian AI, and no local company is doing this.

One line: **Your agents buy what they need. You stay in control.**

## 3. Teaser deck (6 slides)

1. **aecon.** Your agents buy what they need. You stay in control.
2. **The A$3 problem.** An agent finds a A$3 check it needs from a provider you have never heard of. Approving a new vendor takes your company days. The agent stops.
3. **Days versus seconds.** New vendor today: days, forms, a card. Through aecon: one supplier approved once, any provider in seconds, inside the rules you set.
4. **How.** Load credit. Set each agent's budget and rules. Agents buy from an open market. aecon is the seller on every purchase: it pays, records, and refunds you if it fails. One invoice, one record.
5. **Built, and the market is real.** Screenshot of one purchase from found to recorded. Live directory of paying services indexed today. Industry names authorisation, identity and liability as the open problems; this is the answer for business buyers.
6. **Ask.** Program-specific.

## 4. Full deck (Sequoia order, 11 slides)

1. **Purpose.** The statement in section 1.
2. **Problem.** The A$3 scene. Then the general form: the fixed cost of a vendor relationship is now larger than the purchases agents want to make.
3. **Solution.** One account, mandate per agent, open market, aecon as seller of record. Diagram: business, agent, aecon, providers.
4. **Why now.** Agents select suppliers at runtime for the first time. Rails exist and are measured in the hundreds of millions of transactions. Industry names authorisation, identity and liability as the open problems.
5. **Market.** Three numbers only, sourced:
   - Australian businesses spent A$13bn on SaaS in 2025 (Gartner, May 2025). That is the spend agents will start making per request.
   - 67% of surveyed Australian businesses are piloting AI agents (SAP and Oxford Economics, July 2026).
   - Agentic commerce forecast at US$41bn in 2026 rising to US$1.1tn by 2030, APAC about a third (Presenc AI, June 2026). Label as forecast.
   Backdrop if asked: 2.73m active Australian businesses, 97% with under 20 staff (ABS, Aug 2025). Full source table at the end of this file.
6. **Competition, and why the rails will not do this.** Rails: Coinbase x402, Stripe ACP, Google AP2, Visa, Mastercard. Developer wallets: Locus, Nevermined, Skyfire. Aggregators: OpenRouter, RapidAPI. None is the seller of record to the business. The rails are global and horizontal; being the accountable local seller for small-business purchases in one country is exactly what they avoid. They are distribution for aecon, not rivals.
7. **Product.** Find a service, buy inside the rules, see what came back and what it cost. Live demo of one purchase. State plainly what runs today and what switches on at compliance sign-off.
8. **Business model.** Margin on each purchase. Paid controls for larger teams. Provider distribution later.
9. **Secret sauce.** Moving money is solved. Deciding whether the purchase was allowed, and owning it when it fails, is not. aecon sets the rules before the agent chooses and is the seller after. A card or an aggregator can do neither.
10. **Team.** Founder. Advisors. Why this founder.
11. **Vision.** Every Australian business buys for its agents the way it already buys for itself: on account, within limits, with a receipt.

Traction slide inserted after Product when there is a paying pilot.

## 5. Program approaches

**Stone & Chalk, Buy Australian AI (EOI closes 24 Sep).** Members are banks, insurers and super funds whose staff are deploying agents now. Lead with slide 2 and slide 3: their compliance teams already know the authorisation and liability questions. Offer a capped pilot. State stage plainly. First submission.

**Colosseum World's Fair (14 Sep to 12 Oct).** Investors judge shipped product. Ship one complete purchase through aecon on the Base or Solana track and film it. The film is slide 5 for every other application.

**AITAI Innovators Showcase (open).** WA story: the A$3 scene, the product, the outcome. Submit with the film.

**Queue.** Base Batches 004 closes 9 Sep, today, if the form is open. Antler Australia 30 Sep, east coast only. YC W27 2 Nov and Startmate 8 Nov with the hackathon result. Cloud credits rolling: Google, Microsoft, AWS.

**Sequence.** Base tonight. Stone & Chalk by 24 Sep. Colosseum build through 12 Oct. AITAI with film. YC and Startmate in November.

## 6. Gaps

Founder bio. The two-minute film. One prospective customer sentence.

## 7. Comparators (their own words, Sept 2026)

| Company | One-liner | Sells to | Position | Pricing |
|---|---|---|---|---|
| Locus, paywithlocus.com | "Every tool your agent needs. One account." | agents, embedded enterprise | prepaid catalog, 57 providers | $20–200/mo + per call |
| Treg, treg.to | "OpenRouter for agent tools" | agents, developers | prepaid balance, zero markup, 47 providers | provider rate, charged on success |
| Nevermined, nevermined.ai | "Agents pay. Agents get paid. Autonomously." | agents, merchants | payment layer, delegated Visa cards | 1–2% of volume + tiers |
| AgentMuxer, agentmuxer.com | "Trusted capabilities for agents" | agents, publishers | marketplace/registry, 100+ publishers | per-call credits, beta |
| Executor, executor.sh | "The gateway to connect your agent to everything" | developers, teams | MCP gateway | $15/member/mo |
| Composio, composio.dev | "Everything your agents need to take action" | developers, teams | integration layer, 1,500+ apps | $29/mo + overage |

None sells to the business as customer of record. None states what happens when a paid call fails. All assume the agent owner and the provider sort it out between themselves.

## 8. Market sources

| Figure | Value | Source | URL |
|---|---|---|---|
| AU public cloud spend 2025 | A$26.6bn | Gartner, May 2025 | https://www.gartner.com/en/newsroom/press-releases/2025-05-14-gartner-forecasts-australian-public-cloud-end-user-spending-to-reach-over-26-billion-in-2025 |
| AU SaaS spend 2025 | A$13bn | Gartner, May 2025 | same |
| AU businesses piloting AI agents | 67% of 200 surveyed | SAP & Oxford Economics, "The Value of AI: Australia", Jul 2026 | https://news.sap.com/australia/files/2026/07/30/SAP-Value-of-AI-2026-Australia.pdf |
| AU tasks automated by AI | 29% now, 48% in two years | same | same |
| Active AU businesses, Jun 2025 | 2,729,648 | ABS Counts of Australian Businesses, Aug 2025 | https://www.abs.gov.au/statistics/economy/business-indicators/counts-australian-businesses-including-entries-and-exits/jul2021-jun2025 |
| AU businesses under 20 staff | 2,656,469 (97.3%) | same | same |
| Global agentic commerce 2026 / 2030 | US$41bn / US$1.1tn (forecast) | Presenc AI, Jun 2026 | https://presenc.ai/research/agentic-commerce-gmv-forecast-2026-2030 |
| APAC agentic commerce 2030 | US$360bn (forecast) | same | same |
| x402 volume since May 2025 | 109.6m transactions | Visa–Artemis report, Jul 2026 | via Visa thought-leadership page |
| AI contribution to AU economy by 2030 | A$45bn to A$115bn/yr | Microsoft & Tech Council of Australia, Jul 2023 | https://news.microsoft.com/en-au/features/generative-ai-could-contribute-115-billion-annually-to-australias-economy-by-2030/ |
