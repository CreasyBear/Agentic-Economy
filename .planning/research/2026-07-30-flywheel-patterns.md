# Flywheel patterns — cold start, provider supply, payment flow, and liquidity

Date: 2026-07-30. Source: FlywheelPatternScout (verified findings relayed in `local://flywheel-findings.md`).

## 1. Andrew Chen — The Cold Start Problem

Source: official excerpt PDF https://andrewchen.com/wp-content/uploads/2022/01/ColdStartProb_9780062969743_AS0928_cc20_Final.pdf (pp. 68-73, 81-84, 145-161).

- **Atomic network:** the smallest stable network from which others can be built; density and the right people matter more than size (Zoom = 2 people, Airbnb = hundreds); solve one network, then copy to adjacent networks.
- **Hard side:** the minority that creates disproportionate value, does more work, is harder to acquire/retain; in marketplaces usually sellers/providers (job marketplaces invert: hiring companies). Cross-side effects make the hard side critical.
- **"Come for the tool, stay for the network":** a single-player tool supplies utility before the network exists; the network later creates long-term value/defensibility (Instagram filters → feed; Google Docs authoring → collaboration; Yelp directory → reviews). Chen explicitly notes marketplaces are generally networks, not tools, from the start; Tinder/WhatsApp/Slack had no single-player mode.
- **Bootstrapping tactics:** once the atomic network is proven — invite-only, paying/subsidizing the hard side, referrals, local density, manual "Flintstoning"; Uber driver hourly guarantees/referrals; supply-first then demand; incentives reduced at scale.

## 2. Gurley / a16z marketplace canon

- Bill Gurley, "All Markets Are Not Created Equal" https://abovethecrowd.com/2012/11/13/all-markets-are-not-created-equal-10-factors-to-consider-when-evaluating-digital-marketplaces/ — a true marketplace needs natural pull on BOTH consumer and supplier; aggregating suppliers is necessary but insufficient — demand must aggregate organically; liquid marketplaces tip into a clearinghouse where neither side favors an alternative. His 10 factors include: new-vs-status-quo experience, economic advantage, technology value, fragmentation of both sides, supplier signup friction (but demand aggregation is harder/more critical), market size/expansion, frequency, payment flow (being IN the payment flow makes reasonable economics easier; billing the supplier later looks like a tax), and network effects (customer n+1000 gets a better experience as participants are added). AE adaptation: the prepaid credit call ledger IS the payment-flow position.
- Bill Gurley, "A Rake Too Far" https://abovethecrowd.com/2013/04/18/a-rake-too-far-optimal-platformpricing-strategy/ — rake = marketplace % of GMS; a high rake adds landed-price friction, drives suppliers elsewhere, and prevents becoming the definitive clearinghouse. Examples: eBay ~10%; Booking.com's 10% agency model vs >30% merchant model won broad hotel supply; oDesk cut the 30% industry commission to 10% and surpassed its competitor. High volume + modest rake = sustainable. Optional opt-in paid exposure can raise average rake without taxing all suppliers.
- a16z, "13 Metrics for Marketplace Companies" https://a16z.com/13-metrics-for-marketplace-companies/ (Jeff Jordan, Li Jin, D'Arcy Coolican, Andrew Chen) — match/fill rate (track zeros and diagnose the constrained side); market depth (enough relevant supply); time to match / inventory turnover / days-to-turn.

## 3. Apify creator flywheel

Sources: https://help.apify.com/en/articles/8684010-make-money-publishing-your-actors-on-apify-store; https://docs.apify.com/actors/publishing; https://docs.apify.com/actors/publishing/monetize/ — build Actor, publish, set price; users run it, creator gets paid; monthly payouts; infrastructure costs deducted; Apify takes 20% commission. Publish pipeline = development → publication+monetization → testing → promotion. Publishing grants a dedicated landing page, README docs, organic Store traffic, automatic scaling, and automated billing/transactions ("launch SaaS faster"). Public Actors require maintenance/testing/support; quality improves monetization chances. Mechanism: publish → discoverability → usage → earnings → more creators/supply, with an explicit supply quality/reliability loop.

## 4. OpenRouter provider flywheel

Sources: https://openrouter.ai/docs/faq.md; https://openrouter.ai/providers/apply — credits are USD deposits; request costs deducted; no inference markup (fees at credit purchase). Providers join via one OpenAI-compatible API reaching 10M+ devs; routing rewards latency/throughput/uptime/price; high performers receive proportionally more traffic; TTFT/throughput/uptime are public; automated monthly invoicing; providers set per-token prices. Mechanism: prepaid credits → more usage; public performance signals → providers join/compete → more coverage/reliability → more developers buy credits.

Evidence boundary: the FAQ and /providers/apply document the *mechanics* of the loop (credits → deduction → usage history; providers competing on public latency/throughput/uptime/price; monthly invoicing) — not a historical time-series proving causal provider growth. Frame as "documented mechanics/loop", never audited causal growth. The 2025 announcement https://openrouter.ai/blog/announcements/1-million-free-byok-requests-per-month (1M free BYOK req/mo across 60+ providers) is an adoption *lever*, not provider-addition proof.

## 5. Shopify ecosystem flywheel

Sources: https://www.shopify.com/partners; https://www.shopify.com/news/billion-dollar-ecosystem — "when merchants win, you win"; Shopify paid developers >$1.3B in 2025; App Store active installs +20%; merchant-success examples (Kaching: 100k merchants, +$1.7B merchant revenue; Postscript >20k brands; Locksmith 162k installs). Mechanism: merchant success → app demand → developer earnings/innovation → more merchant success. Adapt only the positive loop, not Shopify's scale claims.

## 6. Stripe Connect platform playbook

Sources: https://docs.stripe.com/connect/marketplace; https://stripe.com/en-nl/guides/best-practices-for-launching-and-scaling-platform-payments — Connect onboards sellers, accepts payments, pays out, monetizes via transaction fees/revenue share; dashboards/reporting/risk. From 14 platform interviews: embedded payments differentiate/increase retention/create revenue; use provider infrastructure to reduce complexity; GTM message targets a specific need/subset; monitor payments volume, active users, volume/user, signups, retention, revenue.

Evidence boundary: this is a platform-*payments* operational playbook (onboarding, payment flow, payout, risk, dashboards, metrics), not evidence of a network-effect flywheel; Stripe's 14-platform findings do not prove AE marketplace causality.

## 7. RapidAPI — what made and broke the flywheel

- **Insider retrospective (Orliesaurus, ex-Mashape, 2018):** https://medium.com/the-restful-web/lessons-learned-from-building-the-best-api-marketplace-in-the-world-a4c1c1d8bb84 — Success: index first, then auth/proxy relaunch; hard side = providers; gave providers operational value FREE (caching, throttling, auth, support, analytics, docs) and hand-held launches; consumers got fast discovery/integration; >10k APIs by 2013–15. "Create value for providers, the harder demographic, and consumers will come."
- **Breaks:** the centralized proxy was the single biggest point of failure — one outage takes every dependent API down; enterprise requires trust/SLAs/resilience where centralization fails; monetizable provider services were given free; developer demographic too niche; community-wrapper maintenance burden; API-native leaders (Twilio/SendGrid) never needed the marketplace; open-source self-hosted gateways (Kong) reduced the need for a central marketplace.
- **Time-bounded demand snapshot:** TechCrunch 2020 https://techcrunch.com/2020/05/21/rapidapi-api-marketplace-funding/ (20k APIs, millions of devs, 300k new devs and 1k APIs/month at the time — not current fact).
- **Reported provider warning (attributed anecdote, unverified):** https://medium.com/geekculture/dont-list-your-api-on-rapidapi-never-66ac9f783c8b — DDoS/overage billing loss $8,872.73; treat as a warning about billing/abuse responsibility.

## Transferable shape for AE

- **Atomic network:** one narrowly defined demand job + one reliable listed API service + a first cohort of paying agent calls recurring enough that the provider stays. NOT "N APIs listed".
- **Hard side:** API businesses/providers. Single-player mode for supply: publish free, test, meter, document, observe demand/earnings before any other supply exists. Demand single-player: an agent executes one useful call via a stable API with prepaid credit — no waiting for a broad catalog.
- **Payment-flow position (Gurley factor):** AE's prepaid credit call ledger puts AE in the payment flow — economics are collected at transaction time, never billed to the supplier later as a tax.
- **Offer sentences:** supply — "List your agent-callable API free; set your price (free tier allowed); get metered calls and automatic payouts." demand — "Give your agent a prepaid credit balance; discover a reliable API for the task and pay only when a call executes."
- **Rake:** Gurley's framework says modest/low rake minimizes friction and supplier leakage; no universal number. Any AE starting % (e.g. low-single-digit to 10%-range) must be labelled an AE hypothesis requiring tests — never "Gurley says X".
- **First 3 liquidity metrics** (adapted from a16z's named metrics): (1) request → successful provider execution (fill/match rate + zero-result reasons); (2) time from agent request to usable response (time-to-match / first successful call, p50/p95); (3) per-service market depth (eligible reliable options per demand task — not raw listing count).
- **Skip list:** social invite-only/viral tactics (no social graph); "come for the tool" as the product build (Chen: marketplaces are networks from the start); crypto/token incentives (prepaid fiat credit suffices); high rake / 30% extraction (Gurley friction warning); catalog-count vanity metrics; a centralized proxy that makes every service share one outage (RapidAPI's fatal flaw); universal SLA/enterprise-compliance promises without capability; non-agent technical-only demand as the wedge.
