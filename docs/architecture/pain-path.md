# Pain path: finding aecon, then using it

Owner's question (2026-09-12): "what is the user's pain path to finding
aecon and then using it, vs what services we have available, starting with
what's on x402."

This traces four arrival paths against what actually exists today: the
x402 supply upstream, the production catalogue, and the funnel from
`visitor_attributed` to `receipt_viewed`. No code changed.

## P1. Cold agent (x402 directory, llms.txt, ucp)

| Step | Surface today (path) | Pain (fact) | Fix candidate |
| --- | --- | --- | --- |
| Discover aecon exists | Coinbase Bazaar `/v2/x402/discovery/search`, PayAI `/discovery/resources` | Live check today: Coinbase search for "aecon" returned 0 results; a 94-item PayAI facilitator page had no resource URL containing "aecon" | none upstream; aecon must register itself as an x402 resource, or rely on `/llms.txt`/`/.well-known/ucp` being crawled directly |
| Land on aecon anyway | `/llms.txt`, `/SKILL.md`, `/.well-known/ucp`, `/.well-known/api-catalog`, `/mcp` anonymous tools | These only work if the agent already has the aecon.ai hostname; nothing upstream hands it out | Fix E: `ae_registry_tools_describe`-shaped detail page proves the surface is real once found, but does not solve findability |
| Search aecon's own catalogue | `POST /api/v1/market-tools/list` | Returned 503 "catalogue temporarily unavailable" today | hosted cutover (see Blockers) |
| Evaluate a Tool | `registry.tools.describe` / MCP `ae_registry_tools_describe` | Works once inside; the gap is entirely upstream of this step | n/a |

## P2. Developer running an agent (Claude Code/Cursor) installing the MCP

| Step | Surface today (path) | Pain (fact) | Fix candidate |
| --- | --- | --- | --- |
| Find aecon | `/for-agents`, `/llms.txt`, README-style install docs | Same upstream absence as P1; a developer must already know the aecon name (referral, blog, this repo) | Lane D: promote `/t/new` ("describe the job, we'll find the Tool") as the entry so a name-search still resolves once landed |
| Install MCP | `/mcp` anonymous tools: `ae_registry_tools_list/search/describe/compare` | Anonymous agents get discovery only, no calling | none needed, by design |
| Get an account | Clerk sign-up | First hard identity step | n/a, out of scope here |
| Get an agent access key | dashboard | Standard | n/a |
| Fund AUD credit | Stripe Checkout | Prior swarm finding: "the funding wall is where every persona stopped" | Blocker, not a redesign question |
| Make the first Call | `tool.quote` -> `tool.call`, CLI `ae call` | Works once funded; SKILL.md path (find -> describe -> quote -> call -> manage authority) is coherent | Fix E replay ("watch an agent do it") sells the still-unfunded developer on why to push through the funding wall |

## P3. Australian service-business owner (thesis persona), no agent yet

| Step | Surface today (path) | Pain (fact) | Fix candidate |
| --- | --- | --- | --- |
| Arrive via search/referral | aecon.ai homepage, hero copy | "The marketplace built for agents." / "Search first. Inspect the price and access terms. Connect only when the selected call needs it." reads as a tool for agents, not a business decision | Lane D front door: "describe the job, we'll find the Tool," reframed for a human owner rather than an agent operator |
| Browse what's on offer | `/market` grid, ~50 reviewed Tools | Most of the indexed catalogue traces back to crypto-native supply (ERC20 balances, ENS, perps, smart-money signals from api.onesource.io, ottoai, kronossignals); see Supply honesty below | Curated shelves (concept B, "for accountants" / "for property managers"), not a flat grid, so the crypto-native majority never has to be scrolled past |
| Recognise something relevant | Business-relevant slice: pyfile-agent (KYB counterparty due diligence, LEI lookup, OFAC sanctions, FDA adverse events, NHTSA recalls, domain enrichment), stableenrich.dev (people/corporate enrichment), api.paysponge.com AgentMail (free inbox API) | This slice is real but thin against ~50 Tools total; a P3 owner has to hunt for it | Fix E: one Tool, shown "as an agent reads it," makes the thin slice feel substantial by depth rather than breadth |
| Decide to act | No agent yet | The owner cannot "connect only when the selected call needs it" without first standing up an agent; the site assumes the agent already exists | Recipes (concept C) or a copy-paste MCP config/SKILL.md link give the owner something concrete to hand to whatever agent they do have |

## P4. Provider wanting to list a Tool

| Step | Surface today (path) | Pain (fact) | Fix candidate |
| --- | --- | --- | --- |
| Learn aecon takes listings | `/for-providers` (assumed), business `$slug` pages | Not audited here; out of the owner's question scope | n/a |
| Onboard | hosted onboarding flow | Scoreboard: "Onboard through the hosted flow, done" (`docs/workflow/simple-user-expectations.md`) | n/a |
| See it listed and earning | Provider dashboard: listing state, Calls, earnings | "done (Well 6)"; payout maturity live-unproven | n/a |
| Be found by a cold agent | x402 directory registration | Not addressed by this repo; aecon itself is not currently indexed by either public x402 directory, so the same gap likely applies to a provider's own resource unless separately registered upstream | flag for the owner, not a Well-7 fix |

## Supply honesty

A P3 visitor arriving today would find one thin, real slice relevant to a
service business: pyfile-agent's KYB and due-diligence lookups (counterparty
checks, LEI, OFAC sanctions, FDA adverse events, NHTSA recalls, domain
enrichment), stableenrich.dev's people/corporate enrichment, and
api.paysponge.com's free AgentMail inbox API. That is roughly three
provider families out of an indexed catalogue of about 50 reviewed Tools,
itself drawn from an upstream supply of 14,558 (Coinbase) plus 28,529
(PayAI) resources that are overwhelmingly crypto data: ERC20 balances, ENS
lookups, perps and smart-money signal feeds from api.onesource.io, ottoai,
kronossignals. A P3 owner would not find those relevant at all, and they
outnumber the business-relevant slice by a wide margin even after AE's own
review filter.

Implication for the front door: a flat grid or category accordion forces
the business owner to wade through crypto-native supply to find three
provider names that matter to them. The front door has to curate and
capture demand (concepts B and D, and the "requested by businesses" signal
in concept C) rather than present a browsable inventory. A grid is honest
about what exists; it is not honest about what is worth a service
business's time.

## Blockers before any redesign matters

1. **Production catalogue 503.** `POST https://aecon.ai/api/v1/market-tools/list`
   returned "catalogue temporarily unavailable" today. Every path above
   (P1-P4) terminates here in production regardless of front-door design.
   Memory: this cutover (deploy, `x402DirectoryIndexRefresh:start` if the
   catalogue is absent) was deliberately left for the owner.
2. **aecon is not discoverable from the x402 world.** Live check today:
   Coinbase Bazaar search for "aecon" returned 0 results; a 94-item sample
   of the PayAI facilitator resource list contained no resource URL with
   "aecon" in it. A cold agent arriving purely from x402 discovery cannot
   find aecon at all today; every path in must currently come from a
   direct hostname reference (referral, docs, this repo), not from the
   x402 supply graph itself.
3. **The funding wall.** Prior swarm finding: "the funding wall is where
   every persona stopped." Both P1 and P2 reach a live, callable Tool only
   after Clerk sign-up, an agent access key, and a Stripe Checkout funding
   step. No front-door redesign changes this; it is downstream of every
   path in this document.

## Recommended sequence

Fix the catalogue 503 first; nothing else is reachable while it is down.
Then build concept E ("the agent's-eye view") before concept D, per
`docs/architecture/market-concepts.md`'s own comparison: E mostly
assembles data and components that already exist (`PublicToolDescriptor`,
`capabilityQuotes`/`capabilityCalls`, `AeAgentInstructionCard`), needs no
new aggregation or classification job, and sidesteps the k-anonymity
question entirely by scoping the replay to sandbox Calls. E is also the
most direct answer to the P3 pain above: a business owner with no agent
yet needs proof this is real before a search box (D) or a shelf (B) is
worth anything. Once E exists, promote concept D (`/t/new` as the market's
primary hero, per `market-design-direction.md`'s wireframe) so P3 visitors
land on "describe the job" rather than a grid; D is already fully wired
server-side (`registry.tools.search`, `marketDemand.record`) so this is a
front-end promotion, not new plumbing. Do not invest in concept A's
aggregation pipeline or concept C's recipe table until D and E are live;
both need traffic and demand signal that do not exist while the front door
is a grid and the catalogue is down.

## Decisions for the owner

1. Confirm the hosted cutover (production deploy plus
   `x402DirectoryIndexRefresh:start` if the catalogue is absent) is the
   next action before any front-door work starts. Yes/No.
2. Confirm concept E ships before concept D, per the sequencing above,
   rather than starting with D because it is "already fully wired
   server-side." Yes/No.
3. Decide whether to pursue getting aecon.ai itself listed as an x402
   resource in the Coinbase Bazaar or PayAI directories, since neither
   currently indexes it and cold-agent discovery from the x402 world is
   otherwise structurally impossible. Yes/No.
