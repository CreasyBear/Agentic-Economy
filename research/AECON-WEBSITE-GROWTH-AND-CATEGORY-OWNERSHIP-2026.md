# AECON website growth and category ownership

**Research date:** 3 September 2026
**Scope:** website distribution, measurement, machine discovery, trust, and category strategy
**Source standard:** primary and official sources only

## Executive verdict

Do not try to win the undifferentiated phrase **“agentic economy infrastructure.”** Circle now calls Agent Stack “the full-stack platform for the agentic economy” and bundles wallets, a machine-readable marketplace, service discovery and payments. Nevermined calls itself the financial rails for AI and sells delegated spending, metering and settlement. Stripe and Tempo position MPP as an open, internet-native way for agents to pay. Those are capital-intensive payments/platform categories, and their language is already converging. ([Circle Agent Stack](https://www.circle.com/agent-stack), [Nevermined product](https://nevermined.ai/product/), [Stripe MPP announcement](https://stripe.com/blog/machine-payments-protocol))

AECON's defensible category is one level above payment:

> **The commercial closure layer for agent-selected services.**

Supporting line:

> Agents search, commit to and invoke bounded Operations. Businesses retain authority, evidence, remedy and an invoice-ready commercial record.

This is not cosmetic positioning. The website should make the missing layer legible: payment proves value moved; AECON proves what was authorized, what the Provider owed, what was delivered, what remedy occurred, and when the purchase commercially closed. Every page, metric and demo should reinforce that distinction.

## What to do first

### 1. Make the proof path work before buying traffic

The public proof should complete, without a sales call:

`search -> inspect -> bounded authority -> invoke -> delivery evidence -> remedy if needed -> commercial closure`

The homepage CTA should launch a deterministic, low-value example and show the resulting record. Do not spend on ads or broad content production while the catalog, authentication, purchase path, sitemap, machine manifests or readiness checks are failing. Search and agent discovery amplify operational truth; they do not repair it.

### 2. Use a three-layer measurement stack

| Layer | System of record | Purpose |
|---|---|---|
| Search demand | Google Search Console | Queries, impressions, clicks, pages and indexing |
| Public website | GA4 **or** Vercel Web Analytics | Acquisition, landing pages, docs engagement and lead conversion |
| Product/commercial facts | AECON's own event store | Authority, commitments, Invocations, delivery, remedy and closure |

Google explicitly says Search Console is the source of truth for Search performance and Google Analytics is the source of truth for on-site behavior. Link the GA4 property to the Search Console domain property if GA4 is used. ([Google: Search Console and Analytics](https://developers.google.com/search/docs/monitor-debug/google-analytics-search-console), [GA4/Search Console link](https://support.google.com/analytics/answer/10737381))

Recommended default:

- Enable **Vercel Web Analytics** immediately for anonymous public-site traffic and **Speed Insights** for field Core Web Vitals. Vercel says Web Analytics is cookie-free and aggregated, but private routes and sensitive URL values must still be removed with `beforeSend`. ([Vercel Web Analytics](https://vercel.com/docs/analytics), [privacy and redaction](https://vercel.com/docs/analytics/privacy-policy), [Speed Insights](https://vercel.com/docs/speed-insights))
- Add **GA4** when AECON needs Google Ads attribution, Search Console integration, audience analysis or a durable acquisition dataset. Use Consent Mode and a real consent policy; Consent Mode communicates the user's choice but is not itself a banner. ([Google Consent Mode](https://support.google.com/analytics/answer/10000067), [consent types](https://support.google.com/analytics/answer/12334711))
- Keep commercial and operational truth server-side in AECON. GA4 is an acquisition tool, not an accounting, audit or settlement ledger.
- Do not enable session replay on authenticated purchase, funding, mandate, receipt or remedy screens until every field is classified and masked.

### 3. Define one event contract

Use GA4's recommended events where their semantics fit, because Google gives those events built-in reporting. Use custom events only for AECON-specific states. Google prohibits sending PII such as email addresses and warns that URLs, search terms, custom dimensions and campaign parameters can leak it. ([GA4 recommended events](https://support.google.com/analytics/answer/9267735), [GA4 PII policy](https://support.google.com/analytics/answer/6366371))

| Event | Fires when | Important non-sensitive properties |
|---|---|---|
| `search` | An Operation search is submitted | entry surface, harness, intent class |
| `view_item_list` | Qualified Operations are returned | result count, freshness band, coverage outcome |
| `view_item` | An Operation revision is inspected | Operation ref/revision, price band, Provider class |
| `begin_checkout` | A commitment flow starts | authority mode, funding mode, protocol |
| `purchase` | The commercial commitment/charge is accepted | transaction ID, AUD value, Operation ref; semantics must be documented |
| `operation_invoked` | Invocation is accepted | protocol, synchronous/asynchronous, price band |
| `delivery_terminal` | Delivery reaches a terminal state | outcome, latency band, evidence class |
| `remedy_opened` | Recovery/refund/reconciliation starts | reason class; never free text |
| `refund` | Consideration is refunded | transaction ID, AUD value, reason class |
| `commercially_closed` | The purchase reaches commercial closure | closure path, elapsed time, outcome class |
| `provider_published` | A Provider publishes an admitted Operation | interface, protocol, validation outcome |

Never send raw prompts, request bodies, outputs, emails, wallet addresses, payment tokens, invoice data or secrets to client analytics. Use opaque, rotating references only where genuinely needed.

### 4. Measure the market, not page views

Primary north-star metric:

> **Successfully commercially closed Operations per active Business Principal.**

Supporting scorecard:

- Activation: time from signup to first successful `inspect -> invoke`.
- Buyer success: percentage of qualified searches that return at least one invocable Operation.
- Execution quality: terminal delivery rate, p50/p95 time to result, false-success rate.
- Commercial quality: closure rate, time to closure, remedy/refund/reconciliation rate.
- Repeat value: principals with a second closed Operation within 7/30 days.
- Market quality: active Operations, active Providers, stale listing rate, price/latency coverage by intent.
- Unit economics: buyer consideration, AECON revenue, Provider obligation and payment recipient recorded as separate facts.

## SEO that compounds into category ownership

### Technical baseline

- Verify the Search Console **domain property**, submit the root sitemap, and monitor Page Indexing plus URL Inspection. A root sitemap should contain absolute canonical URLs only; Google treats sitemap URLs as canonical hints. ([Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap))
- Keep one canonical host and permanent redirects from every old host and URL. Google describes canonicalization as choosing the representative URL among duplicates. ([Google canonicalization](https://developers.google.com/search/docs/crawling-indexing/canonicalization))
- Measure real-user Core Web Vitals and target LCP <= 2.5 s, INP < 200 ms and CLS < 0.1. ([Google Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals))
- Give every indexable page a unique title, H1, description, canonical, useful internal links and a real 404. Do not index authenticated, thin, filtered or duplicate catalog views.

### The content moat

Publish a small number of evidence-heavy pages, not an AI-generated blog farm. Google prioritizes original, people-first work, visible authorship and first-hand evidence, and warns against scaled pages that add little value. ([Google helpful content guidance](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [generative content guidance](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content))

Recommended owned pages:

1. **What is commercial closure for AI agents?** Define the category and distinguish authority, payment, delivery and closure.
2. **AI agent procurement infrastructure.** The complete buyer journey from capability gap to outcome evidence.
3. **x402 service marketplace, beyond payment.** Show how AECON adds admission, bounded authority, obligation, evidence and remedy.
4. **Paid MCP tools for business agents.** A working integration and discoverable Operations.
5. **Agent spend controls and mandates.** Explain Business Principal, Agent Principal, Account and Mandate.
6. **Protocol interoperability.** A factual matrix for MCP, A2A, x402, MPP, AP2, ACP and UCP.
7. **Live Operation pages.** Stable URLs with version, inputs, outputs, price, readiness, observed latency, Provider, Seller, data handling, remedy and invocation method.
8. **AECON Agentic Economy Index.** Original observed data on price, latency, delivery, remedy and closure—not raw transaction-count theatre.

The index and case studies are the category-winning assets because competitors can copy prose but not accumulated outcome evidence.

### Structured data

- Put `Organization` JSON-LD on the homepage or About page with truthful identity, URL, logo and relevant profiles. Google recommends one organization page rather than repeating it everywhere. ([Google Organization markup](https://developers.google.com/search/docs/appearance/structured-data/organization))
- Use `BreadcrumbList` on deep documentation and Operation pages.
- Use `SoftwareApplication`/`WebApplication` only on the AECON product page and only with the required visible fields, including a truthful Offer price. ([Google SoftwareApplication markup](https://developers.google.com/search/docs/appearance/structured-data/software-app))
- Use `Product`/`Offer` on an Operation page only when the visible page genuinely represents a directly purchasable service and satisfies Google's policies. Otherwise use schema.org `Service` for machine meaning without claiming a Google rich-result benefit.
- Validate in Rich Results Test and Search Console. Google does not guarantee a rich result even when markup is valid. ([Google structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies))

## Machine and agent discovery

Treat these as distribution adapters with explicit maturity labels.

| Surface | Status in September 2026 | AECON action |
|---|---|---|
| OpenAPI/JSON catalog | Established interface pattern | Make this the canonical machine contract: stable IDs, revision, schemas, price, readiness, evidence and remedy semantics. |
| MCP | Governed open protocol; official Registry exists but is still preview | Expose search/inspect/invoke/reconcile tools. Publish only a production-quality remote server; Registry versions are immutable and unpublishing is not currently supported. ([MCP Registry quickstart](https://modelcontextprotocol.io/registry/quickstart), [Registry FAQ](https://modelcontextprotocol.io/registry/faq)) |
| x402 v2 + Bazaar | Official x402 specification and discovery extension; facilitator indexes are implementation-specific | Emit valid discovery metadata for eligible paid endpoints and verify actual listing after a real settlement. Do not treat settlement as proof of delivery or closure. ([x402 v2 specification](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md)) |
| MPP | New open payment-authentication family co-authored by Stripe and Tempo; active implementations, still evolving | Add a rail adapter after the canonical Operation/commitment model is stable. Do not fork product semantics around one payment protocol. ([MPP](https://mpp.dev/), [specifications](https://paymentauth.org/)) |
| A2A | Linux Foundation-hosted open agent-to-agent protocol | Publish an Agent Card and expose AECON as a remote market/procurement agent when the end-to-end path is reliable. ([A2A specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md)) |
| AP2 v0.2 | Emerging Google-led protocol for secure agent-performed payments using mandates and receipts | Map AECON Mandates, commitment evidence and receipts; pursue compatibility, not dependency. AP2 itself notes future interoperability work. ([AP2 specification](https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md)) |
| UCP | New open retail-commerce protocol co-developed by Google and Shopify; `/.well-known/ucp` discovery | Bridge only for retail checkout/fulfillment use cases. It is adjacent to bounded service procurement, not AECON's core ontology. ([Shopify UCP](https://www.shopify.com/ucp), [Google UCP architecture](https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/)) |
| ACP | OpenAI/Stripe checkout protocol; discovery mechanisms are still being developed | Bridge when a Provider sells goods, subscriptions or digital products through agent checkout. Do not present ACP as a mature universal registry. ([ACP official site](https://www.agenticcommerce.dev/)) |
| `/llms.txt` | Community proposal, not an IETF/W3C standard or Google ranking input | Keep it concise and current because developer tools use it, but do not call it “AI SEO.” Google says it neither helps nor harms Search visibility. ([llms.txt proposal](https://llmstxt.org/), [Google AI Search guidance](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)) |

Also publish a one-command skill/install path and deterministic examples for major harnesses, but treat `SKILL.md` as packaging rather than a universal web standard.

## Trust pages that support conversion

This product touches delegated authority and money. Trust is part of the sales surface:

- Public status page with current availability, incident history and component-level status.
- Security overview: identity, authorization boundaries, key handling, replay protection, audit evidence, data retention and recovery.
- Coordinated vulnerability disclosure policy and `/.well-known/security.txt`. RFC 9116 defines the file, requires HTTPS and specifies `Contact` plus `Expires`; Australian Cyber Security Centre guidance strongly encourages it. ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116.html), [Cyber.gov.au guidance](https://www.cyber.gov.au/business-government/detecting-responding-to-threats/vulnerability-planning/vulnerability-disclosure-programs-explained))
- Plain-English privacy policy, subprocessors, data-use matrix and analytics controls.
- Legal identity, Seller role, Provider role, payment recipient, refunds/remedies and tax/invoice treatment stated without claiming capabilities not yet implemented.
- Public changelog and versioned API/deprecation policy.
- At least one real, reproducible case study showing authority -> invocation -> evidence -> closure.

## Competitive positioning

| Player | What it claims | Do not fight it on | AECON's counter-position |
|---|---|---|---|
| Circle Agent Stack | Full-stack platform for the agentic economy: wallet, marketplace, discovery, USDC payments | Wallets and global stablecoin rails | A payment is one fact inside an accountable purchase lifecycle. |
| Nevermined | Financial rails for AI: delegated spending, metering, access, settlement | Agent payment acceptance and monetization SDK breadth | Business-principal authority, seller/provider separation, outcome evidence, remedy and closure. |
| Stripe/Tempo MPP | Internet-native machine payments across payment methods | Payment protocol and merchant acceptance | Protocol-neutral procurement and commercial record above the rail. |
| Stripe/OpenAI ACP and Google/Shopify UCP | Agent-ready retail discovery and checkout | Consumer retail catalog/checkout | Bounded B2B Operations and just-in-time service procurement. |
| Visa Trusted Agent Protocol | Agent recognition, authorization and trusted payment interaction | Scheme identity and merchant trust network | Use trusted identity as input; preserve the whole obligation/delivery/closure chain. ([Visa specification](https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications/)) |

The homepage should therefore avoid “marketplace for AI agents” as the primary claim. A sharper hierarchy is:

1. **Commercial infrastructure for agents to buy bounded services.**
2. **Cross-harness search, authority, invocation, evidence, remedy and closure.**
3. **Works across x402, MPP, MCP and A2A; business funding and records in AUD.**

## 30-day execution order

### Days 1–3: operational truth

- Make the public proof flow, readiness endpoint, sitemap and machine manifests return reliably.
- Verify Search Console domain ownership and submit the sitemap.
- Enable Vercel Web Analytics and Speed Insights; add GA4 only with defined consent and acquisition requirements.
- Freeze the event contract and privacy deny-list before instrumentation spreads.

### Week 1: category and conversion

- Rewrite title, H1, description and above-fold proof around commercial closure.
- Publish the category definition, procurement page, protocol matrix and one reproducible demo.
- Add Organization/Breadcrumb structured data and validate it.

### Week 2: machine distribution and trust

- Stabilize OpenAPI/catalog, MCP tools and `llms.txt`.
- Publish status, security, privacy, terms, vulnerability disclosure and `security.txt`.
- Register MCP/x402 surfaces only after production verification.

### Weeks 3–4: evidence moat

- Publish the first real end-to-end buyer case study.
- Launch a narrow AECON Agentic Economy Index based on observed delivery and closure quality.
- Produce integration pages and runnable examples for the harnesses that generated actual invocations.
- Start partner outreach around the missing commercial-closure layer, not a competing payment rail.

## Decision rule

Every website initiative should pass one test:

> Does this make AECON easier to discover, trust or successfully invoke—and does it create credible evidence that an agent-mediated purchase commercially closed?

If not, it is probably premature marketing activity.
