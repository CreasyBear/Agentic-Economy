# Agent marketplace scan — 2026-09-09

Web scan of five products AE is compared against, taken while planning Well 0 (standalone on x402 / CDP / Bazaar). Facts as published on the pages fetched that day; "unknown" where a page did not say. Framing from Joel: a familiar, stable product first; value-add after launch.

| Product | Buyer rail | Supply source | Dev surface | Standalone / aggregator |
|---|---|---|---|---|
| Treg (treg.to) | per-call prepaid USD, fractions of a cent (e.g. $0.006 Semrush, $0.012 Moz), 0% markup, $1 free, bring-your-own-key | 47 providers / 2,630 endpoints, own onboarding | REST, Claude Code integration, llms.txt | own providers only |
| Executor (executor.sh) | freemium SaaS: Free (3 members, 100k executions) / Team $15 per member per month / Enterprise | third-party integrations (GitHub, Stripe, Jira, Sentry, Linear, Gmail, Notion, Slack) normalised to one schema | MCP, CLI (npm), desktop app, REST | own integrations only |
| AgentMuxer (agentmuxer.com, formerly AgentMux) | per-call credits by card, $0.001–$0.15 per call observed, binding price at resolution, charge only on successful provider response, $10 new-account credit; beta, no SLA | 2,012 publishers / 8,520 listings; "Verified" trust tier; marketplace does not guarantee review or continued availability | MCP (buyer MCP), account dashboard | own publishers only |
| Locus (paywithlocus.com) | prepaid balance, 1 credit = $0.001 USD, card or USDC; enterprise per-endpoint markups | 57 reviewed providers / 3,906 catalog services / 15,977 endpoints | MCP (HTTP), CLI, server SDK, REST; status footer "System nominal" | own providers only |
| Nevermined (nevermined.ai) | cards (Visa virtual) or prepaid credits, fiat via Stripe/Braintree and crypto, per-call micropayments | curated merchant services on merchants' own PSPs | REST, SDKs (TypeScript, Python), MCP, x402 | own merchants only |

## What this says for AE

- None of the five ingests another marketplace's catalogue. Well 0 (retiring the Agentic Market and Treg ingest paths) makes AE match the norm.
- Reviewed vs listed tiers are the familiar pattern (Locus: 57 reviewed vs 3,906 catalog; AgentMuxer: "Verified"). AE's Bazaar entries are all declared. Path D bespoke Providers and Tools AE has paid to Call form the reviewed tier. Well 4 requirement: surface the tier explicitly with the existing declared / derived / AE-observed provenance vocabulary.
- Binding price and charge-on-success (AgentMuxer) is what AE's Quote → Call already does, in AUD with a disclosed fee. Check the fee is visible before Quote acceptance (Well 2).
- One call shape (Locus "one call shape for 15,977 endpoints"; Executor "one name, one input schema, one output schema") supports consolidating AE's two search contracts (Well 4) and the api-registry v2 bump now.
- A status signal is table stakes (Locus). AE adds catalogue freshness to /status in Well 0.
- None publishes an SLA. Measurable SLIs and recovery are a positioning lane for AE after launch, not just hygiene.
- None is an AUD Seller of record for Australian businesses. That remains AE's differentiator and lives in Well 2.

## Sources

- https://treg.to/ · https://treg.to/pricing · https://treg.to/docs
- https://executor.sh/ · https://executor.sh/docs · https://github.com/UsefulSoftwareCo/executor
- https://app.agentmuxer.com/ · https://app.agentmuxer.com/terms · https://www.ycombinator.com/companies/amorphic-labs
- https://paywithlocus.com/ · https://docs.paywithlocus.com/ · https://www.ycombinator.com/launches/Oj6-locus-payment-infrastructure-for-ai-agents
- https://nevermined.ai/ · https://nevermined.ai/blog/best-platforms-agent-payments · https://nevermined.ai/blog/make-money-with-ai-agents-2026
