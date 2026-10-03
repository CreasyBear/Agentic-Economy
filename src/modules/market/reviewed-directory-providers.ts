/** Selection evidence only. Exact reviewed hosts do not grant Tool admission or payment authority. */
export const REVIEWED_DIRECTORY_PROVIDERS = [
  {
    "operator": "Exa",
    "segment": "Search and web research",
    "providerHosts": [
      "api.exa.ai"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://exa.ai/integrations/coinbase"
    ],
    "reason": "Official Exa integration page documents pay-per-call search and USDC settlement; directory host is on Exa’s own domain."
  },
  {
    "operator": "Tavily",
    "segment": "Search and web research",
    "providerHosts": [
      "x402.tavily.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://www.tavily.com/blog/tavily-on-x402"
    ],
    "reason": "Official launch documents the exact x402.tavily.com/search endpoint and request offering."
  },
  {
    "operator": "Nansen",
    "segment": "Onchain intelligence",
    "providerHosts": [
      "api.nansen.ai"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://nansen.ai/post/how-nansen-enabled-pay-per-call-onchain-data-access-with-x402-and-payai"
    ],
    "reason": "Official Nansen article documents wallet, token and Smart Money data over x402; API belongs to its own domain."
  },
  {
    "operator": "Browserbase",
    "segment": "Browser automation",
    "providerHosts": [
      "x402.browserbase.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://x402.browserbase.com/"
    ],
    "reason": "Official gateway publishes browser sessions, search, fetch and payment documentation on the exact listed host."
  },
  {
    "operator": "Apify",
    "segment": "Data extraction and scraping",
    "providerHosts": [
      "agi.apify.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://agi.apify.com/"
    ],
    "reason": "Official Apify AGI gateway explains purchase of a prepaid API token; official changelog confirms x402 support."
  },
  {
    "operator": "Glassnode",
    "segment": "Onchain intelligence",
    "providerHosts": [
      "x402.glassnode.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://research.glassnode.com/agentic-payments-glassnode-data-for-your-ai-agent/"
    ],
    "reason": "Official Glassnode announcement documents its x402 data catalog and per-metric purchase flow."
  },
  {
    "operator": "You.com",
    "segment": "Search and web research",
    "providerHosts": [
      "api.you.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://you.com/docs/administration/machine-payments/x402"
    ],
    "reason": "Official docs name api.you.com, supported search/finance endpoints, methods, payment protocol and support route."
  },
  {
    "operator": "CoinMarketCap",
    "segment": "Crypto market data",
    "providerHosts": [
      "pro-api.coinmarketcap.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://coinmarketcap.com/api/documentation/ai-agent-hub/x402"
    ],
    "reason": "Official API documentation names the exact host and the supported x402 crypto quote/listing/DEX endpoints."
  },
  {
    "operator": "Bitrefill",
    "segment": "Retail and digital goods",
    "providerHosts": [
      "api.bitrefill.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://docs.bitrefill.com/docs/mcp-partner-integration-guide"
    ],
    "reason": "Official integration guide names the exact host and documents gift-card/eSIM/top-up discovery plus invoice purchase routes."
  },
  {
    "operator": "CoinGecko",
    "segment": "Crypto market data",
    "providerHosts": [
      "pro-api.coingecko.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://www.coingecko.com/learn/x402-pay-per-use-crypto-api"
    ],
    "reason": "Official tutorial names the exact base URL and documents x402 token, pool and market-data endpoints."
  },
  {
    "operator": "Telnyx",
    "segment": "Inference and audio",
    "providerHosts": [
      "x402.telnyx.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://x402.telnyx.com/"
    ],
    "reason": "Official gateway names exact chat and audio routes, models, schemes and pricing; Telnyx developer directory links pay-per-call inference."
  },
  {
    "operator": "Allium",
    "segment": "Onchain intelligence",
    "providerHosts": [
      "agents.allium.so"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://openclaw.allium.so/",
      "https://docs.allium.so/ai/machine-payments/x402"
    ],
    "reason": "Official x402 guide explicitly names agents.allium.so as its base URL and documents supported payments; AgentHub explains the maintained CLI, API and support surfaces."
  },
  {
    "operator": "Massive",
    "segment": "Equities and financial data",
    "providerHosts": [
      "agent.massive.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://www.massive.com/blog/tag/announcement"
    ],
    "reason": "Official announcement listing dated 1 September 2026 explicitly names agent.massive.com and x402 access to US stock data."
  },
  {
    "operator": "Blockscout",
    "segment": "Blockchain infrastructure",
    "providerHosts": [
      "api.blockscout.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://www.blog.blockscout.com/x402-onchain-agents/"
    ],
    "reason": "Official July 2026 walkthrough names api.blockscout.com Pro API and documents Base x402 access; established open-source explorer product."
  },
  {
    "operator": "Arkham",
    "segment": "Onchain intelligence",
    "providerHosts": [
      "api.arkm.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://info.arkm.com/announcements/x402-on-arkham",
      "https://arkm.com/llms.txt"
    ],
    "reason": "Official announcement confirms Arkham API x402 support; official machine-readable API guide explicitly names api.arkm.com and lists x402 guidance, methods, schemas and support."
  },
  {
    "operator": "Zerion",
    "segment": "Wallet and portfolio data",
    "providerHosts": [
      "api.zerion.io"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://zerion.io/blog/zerion-api-supports-x402/"
    ],
    "reason": "Official announcement names api.zerion.io, documents portfolio/transaction data and Base x402, with developer tools and support."
  },
  {
    "operator": "Messari",
    "segment": "Crypto research and data",
    "providerHosts": [
      "api.messari.io"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://api.messari.io/"
    ],
    "reason": "Exact listed host identifies Messari, advertises API-key/x402 access, and links full documentation, x402 endpoints and user guide."
  },
  {
    "operator": "BlockRun",
    "segment": "Inference and media gateway",
    "providerHosts": [
      "blockrun.ai"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://blockrun.ai/docs/x402/endpoints",
      "https://blockrun.ai/docs/resources/ecosystem"
    ],
    "reason": "Official gateway catalog names blockrun.ai, discovery/OpenAPI routes and per-call offerings; documents maintained public SDK/CLI projects."
  },
  {
    "operator": "Interzoid",
    "segment": "Data quality and enrichment",
    "providerHosts": [
      "api.interzoid.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://www.interzoid.com/x402-payments"
    ],
    "reason": "Official page names exact api.interzoid.com endpoint, x402 payment flow and name/company/email data-quality APIs, with a published code example."
  },
  {
    "operator": "Pocket Network Foundation",
    "segment": "Multi-service data gateway",
    "providerHosts": [
      "agent.pocket.network"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://docs.pocket.network/developers/ai-agents/",
      "https://docs.pocket.network/agent-services/agent-integration/"
    ],
    "reason": "Official docs identify the Foundation as operator of agent.pocket.network and explain supplier routing, documentation, payment protocols and support/status surfaces."
  },
  {
    "operator": "CoinStats",
    "segment": "Wallet and portfolio data",
    "providerHosts": [
      "x402.coinstats.app"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://coinstats.app/blog/openapi-x402/"
    ],
    "reason": "Official dated announcement names x402.coinstats.app and its read-only market, wallet, DeFi and portfolio endpoints."
  },
  {
    "operator": "CoinCap",
    "segment": "Crypto market data",
    "providerHosts": [
      "rest.coincap.io"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://rest.coincap.io/api-docs/",
      "https://splash.coincap.io/pricing"
    ],
    "reason": "Exact host publishes CoinCap API documentation and x402 support; official pricing explains request-based billing and supported subset."
  },
  {
    "operator": "Browser Use",
    "segment": "Browser automation",
    "providerHosts": [
      "x402.api.browser-use.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://docs.browser-use.com/cloud/guides/x402",
      "https://browser-use.com/changelog",
      "https://github.com/browser-use/sdk/issues/221"
    ],
    "reason": "Official current x402 documentation explicitly names x402.api.browser-use.com and /api/v3/sessions, explains credits, payment caps and failure handling; maintained changelog supports ongoing product development."
  },
  {
    "operator": "Klima Labs",
    "segment": "Carbon markets",
    "providerHosts": [
      "x402.klimalabs.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://www.klimalabs.com/x402-endpoint"
    ],
    "reason": "Official product page explicitly names the host, carbon catalog/quote/retirement offering, versioning, errors and Carbonmark collaboration."
  },
  {
    "operator": "Stock Trends",
    "segment": "Equities and financial data",
    "providerHosts": [
      "api.stocktrends.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://developer.stocktrends.com/agent-pay",
      "https://developer.stocktrends.com/"
    ],
    "reason": "Official developer portal names api.stocktrends.com and documents x402 V2 access, methodology, premium scope and live pricing."
  },
  {
    "operator": "RigoBlock / Rigo Investment Sagl",
    "segment": "DeFi transaction tools",
    "providerHosts": [
      "trader.rigoblock.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://rigoblock.com/faq",
      "https://github.com/RigoBlock/agentic-operator"
    ],
    "reason": "Official FAQ identifies the maintaining company; public repository names trader.rigoblock.com and documents the x402 API and known limitations."
  },
  {
    "operator": "Blocksize Capital GmbH",
    "segment": "Market data and analytics",
    "providerHosts": [
      "mcp.blocksize.info"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://mcp.blocksize.info/"
    ],
    "reason": "Exact host identifies Blocksize Capital GmbH and publishes market-data routes, x402 terms, documentation, public source and support/privacy links."
  },
  {
    "operator": "Baking Bad / 3Route",
    "segment": "DeFi transaction tools",
    "providerHosts": [
      "api.3route.io"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://3route.io/llms.txt",
      "https://3route.io/"
    ],
    "reason": "Official 3Route index names api.3route.io and Baking Bad as builder; official page documents pay-per-call quotes and unsigned swaps."
  },
  {
    "operator": "Merit Systems / Stable services",
    "segment": "Research, enrichment and travel gateway",
    "providerHosts": [
      "stableenrich.dev",
      "stabletravel.dev"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://stableenrich.dev/",
      "https://stabletravel.dev/",
      "https://github.com/merit-systems/agentcash-skills/blob/master/skills/data-enrichment/SKILL.md",
      "https://merit.systems/terms"
    ],
    "reason": "Official Stable sites document research/travel APIs; linked terms identify Merit Systems, Inc. and The Stables services. Merit’s public repository documents StableEnrich. Both hosts count as one operator."
  },
  {
    "operator": "Strale",
    "segment": "Business data and validation",
    "providerHosts": [
      "api.strale.io"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://strale.dev/llms.txt"
    ],
    "reason": "Official machine-readable documentation names api.strale.io, x402 catalog and routes, public SDKs, response/error shape, changelog context and support address."
  },
  {
    "operator": "Brave",
    "segment": "Search and web research",
    "providerHosts": [
      "search.agent.s.brave.app"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://api-dashboard.search.brave.com/documentation/guides/agent-payments"
    ],
    "reason": "Official Brave API documentation names the exact agent host and supported search endpoints, plus price discovery and error handling."
  },
  {
    "operator": "Run402 / Kychee, Inc.",
    "segment": "Cloud infrastructure",
    "providerHosts": [
      "api.run402.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://run402.com/humans/about.html",
      "https://run402.com/humans",
      "https://run402.com/pricing"
    ],
    "reason": "Official pages identify Kychee, Inc. as builder, name api.run402.com, and document prepaid infrastructure, public source and support."
  },
  {
    "operator": "Laso Finance",
    "segment": "Cards, gift cards and payment services",
    "providerHosts": [
      "laso.finance"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://laso.finance/",
      "https://beta.laso.finance/developers"
    ],
    "reason": "Official site identifies Laso Finance LLC and exact x402/MCP host, published API, fees, support and human identity-verification requirements."
  },
  {
    "operator": "NodeFlare",
    "segment": "Blockchain RPC infrastructure",
    "providerHosts": [
      "rpc.nodeflare.app"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://nodeflare.app/docs/x402",
      "https://nodeflare.app/"
    ],
    "reason": "Official current docs name the exact RPC host and x402 path, methods, price basis, error behavior, support and public service-status surface."
  },
  {
    "operator": "Surplus Intelligence",
    "segment": "AI inference gateway",
    "providerHosts": [
      "api.surplusintelligence.ai"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://www.surplusintelligence.ai/x402"
    ],
    "reason": "Official product page links discovery manifests on the exact API host and documents inference marketplace, support and legal links."
  },
  {
    "operator": "Barker",
    "segment": "DeFi data and transaction tools",
    "providerHosts": [
      "mcp.barker.money"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://github.com/barkermoney/barker-mcp"
    ],
    "reason": "Official repository names the exact host, tool outputs, per-call payments, public maintainers and support address."
  },
  {
    "operator": "Proofivy",
    "segment": "Publisher content access",
    "providerHosts": [
      "library.proofivy.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://proofivy.com/blog/cryptoslate_x402_pay_per_article_is_live"
    ],
    "reason": "Official Proofivy launch names exact CryptoSlate list/article routes on library.proofivy.com and describes its publisher-access service."
  },
  {
    "operator": "The Insumer Model / InsumerAPI",
    "segment": "Wallet attestations",
    "providerHosts": [
      "api.insumermodel.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://insumermodel.com/developers/",
      "https://insumermodel.com/"
    ],
    "reason": "Official developer documentation names exact API host and attest/trust routes, x402, signature verification, public source and changelog; site names founder Douglas Borthwick."
  },
  {
    "operator": "Quack AI",
    "segment": "DAO governance analysis",
    "providerHosts": [
      "q402.quackai.ai"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://q402.quackai.ai/docs",
      "https://quackai.ai/q402"
    ],
    "reason": "Official docs on exact host describe the listed x402 governance-analysis route, response semantics, cache charges, payment scheme and support."
  },
  {
    "operator": "Yield.xyz",
    "segment": "DeFi data and transaction preparation",
    "providerHosts": [
      "mcp.yield.xyz"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://docs.yield.xyz/docs/getting-started",
      "https://mcp.yield.xyz/",
      "https://mcp.yield.xyz/openapi.json"
    ],
    "reason": "Maintained Yield.xyz API docs are linked from its live MCP host. The official OpenAPI explicitly declares mcp.yield.xyz and describes yield discovery, wallet balances and unsigned transaction preparation over x402."
  },
  {
    "operator": "Twin3",
    "segment": "Humanity and agent identity verification",
    "providerHosts": [
      "human.twin3.ai"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://twin3.ai/",
      "https://github.com/twin3-ai",
      "https://github.com/twin3-ai/twin3-human-skill/blob/main/SKILL.md"
    ],
    "reason": "Twin3’s official site links its public source organization. The published human-verification skill explicitly names human.twin3.ai/v1/human and documents Base USDC fallback as well as X Layer payments."
  },
  {
    "operator": "Gloria",
    "segment": "News intelligence and research",
    "providerHosts": [
      "api.itsgloria.ai"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://docs.itsgloria.ai/gloria-data-platform/x402-integration/",
      "https://docs.itsgloria.ai/",
      "https://github.com/cryptobriefing-attic/gloria-docs"
    ],
    "reason": "Official Gloria x402 docs explicitly name api.itsgloria.ai for news, summaries and keyword search. The documentation site links its CryptoBriefing source repository, corroborating product lineage beyond catalogue claims."
  },
  {
    "operator": "AUBRAI",
    "segment": "Scientific literature and research",
    "providerHosts": [
      "x402-api.aubr.ai"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://x402.aubr.ai/api/openapi",
      "https://x402-api.aubr.ai/api/openapi",
      "https://www.vitadao.com/blog/vitadao-longevity-newsletter-feb-26",
      "https://github.com/VitaDAO/aubrai-tinfoil-config"
    ],
    "reason": "Official AUBRAI OpenAPI describes the research offering and explicitly uses x402-api.aubr.ai in polling URLs; the same spec is served by that catalogue host. VitaDAO project material and public deployment source corroborate the developer/operator lineage."
  },
  {
    "operator": "BuiltWith",
    "segment": "Company and technology intelligence",
    "providerHosts": [
      "api.builtwith.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://api.builtwith.com/x402-api"
    ],
    "reason": "Official BuiltWith API documentation explicitly names api.builtwith.com/agent/domain and explains accountless x402 technology and company lookup; the same site links its maintained API, SDK and support surfaces."
  },
  {
    "operator": "OpenWebNinja",
    "segment": "Web search and business data",
    "providerHosts": [
      "x402.openwebninja.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://www.openwebninja.com/blog/x402-agentic-payments",
      "https://www.openwebninja.com/"
    ],
    "reason": "Official July 2026 launch article by CTO Adam Ben-Ayoun explicitly names x402.openwebninja.com, discovery/docs and access to its existing search, jobs, retail and business-data APIs."
  },
  {
    "operator": "Newstex",
    "segment": "Licensed news and publishing",
    "providerHosts": [
      "mcp.newstex.com"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://www.newstex.com/why-newstex",
      "https://mcp.newstex.com/openapi.json",
      "https://static.newstex.com/llms.txt"
    ],
    "reason": "Newstex’s official business site establishes its news-licensing operation. Its OpenAPI explicitly declares mcp.newstex.com and x402 news routes; the agent guide documents metadata searches and licensed full-story retrieval."
  },
  {
    "operator": "OneSource / Blockparty",
    "segment": "Blockchain infrastructure and data",
    "providerHosts": [
      "api.onesource.io"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://onesource.io/about",
      "https://onesource.io/terms-and-conditions",
      "https://docs.onesource.io/getting-started/x402-and-mpp/x402-base"
    ],
    "reason": "Official company history identifies OneSource as powered by Blockparty and names CEO Vladislav Ginzburg; terms cover the OneSource API. Current x402 documentation explicitly names api.onesource.io and gives a Base request example."
  },
  {
    "operator": "corpusAI / Julian Traversa",
    "segment": "Cloud, GPU and inference pricing data",
    "providerHosts": [
      "cloud.trycorpus.ai"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://cloud.trycorpus.ai/docs",
      "https://cloud.trycorpus.ai/privacy",
      "https://github.com/JTraversa/corpus-cloud-pricing-mcp",
      "https://cloud.trycorpus.ai/license"
    ],
    "reason": "Versioned privacy terms identify Julian Traversa trading as corpusAI for cloud.trycorpus.ai. Substantive API documentation and a public MCP implementation name that exact host and document cloud/GPU/token pricing data over x402."
  },
  {
    "operator": "MetaLift / Endacoder Limited",
    "segment": "Web extraction and scraping",
    "providerHosts": [
      "app.metalift.ai"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://app.metalift.ai/",
      "https://app.metalift.ai/legal/terms",
      "https://app.metalift.ai/docs/x402-payments",
      "https://app.metalift.ai/docs/release-notes"
    ],
    "reason": "The exact catalogue host serves MetaLift’s product, payment documentation, dated release notes and terms naming Endacoder Limited as operator. Documentation describes USDC scraping/search; native catalogue evidence identifies app-host /v1/scrape and /v1/search routes."
  },
  {
    "operator": "Remix Project",
    "segment": "Developer tooling and contract analysis",
    "providerHosts": [
      "api.remix.live"
    ],
    "reviewedAt": "2026-10-03",
    "evidenceUrls": [
      "https://github.com/remix-project-org",
      "https://github.com/remix-project-org/x402",
      "https://github.com/remix-project-org/x402/blob/main/AGENTIC_WALLET_CLI_GUIDE.md"
    ],
    "reason": "The established Remix Project organization maintains an x402 server with source, tests and substantial commit history. Its public agent-wallet guide explicitly names api.remix.live/mcp/x402-http routes for compilation, Slither analysis and audit checklists."
  }
] as const

export const REVIEWED_DIRECTORY_PROVIDER_HOSTS: readonly string[] = REVIEWED_DIRECTORY_PROVIDERS.flatMap(provider => [...provider.providerHosts])
