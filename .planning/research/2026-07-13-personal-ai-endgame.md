<!-- Persisted from session agent artifact `agent://PersonalAiEndgame` on 2026-07-13.
     Evidence labels OBSERVED/INFERRED/UNKNOWN preserved from source.
     Owner: Founder. Next review: 2026-08-13. Superseded-by: (none). -->

# Personal and business AI, 2028–2031: what remains for AE

**As-of:** 13 July 2026. **Method:** primary-source review. Labels: **OBSERVED** = shipped/announced by the source; **INFERRED** = reasoned forecast; **UNKNOWN** = evidence does not establish it.

## Executive verdict

**INFERRED — most-supported end-state:** heterogeneous-multipolar, with powerful aggregation at the *user-interface* layer but plurality beneath it. ChatGPT, Gemini, Siri, Alexa and Meta can each become a default personal context-holder; Claude can dominate selected enterprise work; vertical SaaS and messaging platforms can become the business-side agent; open/local agents preserve a sovereignty segment. Yet the same firms are adopting MCP, UCP, AP2/A2A, ACP and Web Bot Auth precisely because no assistant can assume one native counterparty or commerce stack.

**Implication for AE:** do not compete to be the personal assistant, merchant checkout, payment credential vault, universal catalog, or SMB operating agent. The defensible position is the cross-platform **governed-action and evidence plane**: verify principals and delegation; bind exact scope/terms to mandates; prevent replay; separate submission/receipt/outcome; preserve redaction-safe evidence; and make disputes replayable across assistant, business-agent and human boundaries. That position is **niche today, potentially structural by 2028–2031, but not yet proven as a standalone network.**

## 1. Platform trajectories

### OpenAI: strongest evidence for an assistant super-app
- **OBSERVED:** ChatGPT agent navigates sites, uses connectors such as Gmail/GitHub, maintains task context across browser/terminal/API tools, asks permission before consequential actions, and can schedule recurring work ([OpenAI, July 2025](https://openai.com/index/introducing-chatgpt-agent/)).
- **OBSERVED:** memory can use saved memories and past chats; Pulse performs proactive asynchronous research based on chats, memory and feedback ([memory](https://openai.com/index/memory-and-new-controls-for-chatgpt/); [Pulse](https://openai.com/index/introducing-chatgpt-pulse/)).
- **OBSERVED:** apps including Booking.com, Expedia and Zillow run inside ChatGPT; the Apps SDK is built on MCP, and apps can use conversational context ([OpenAI Apps](https://openai.com/index/introducing-apps-in-chatgpt/)).
- **OBSERVED:** Instant Checkout/ACP lets users pay inside chat; existing subscribers may use a card on file, while the merchant remains merchant of record and handles payment, fulfilment and support. OpenAI reported **700 million weekly users** in September 2025 ([OpenAI/Stripe ACP](https://openai.com/index/buy-it-in-chatgpt/)).
- **INFERRED:** by 2028–2031 ChatGPT can plausibly be a high-frequency personal intent broker spanning discovery, apps and checkout. **UNKNOWN:** whether users will entrust it with broad, standing authority beyond per-action confirmations, or whether ACP survives UCP/platform competition.

### Anthropic: enterprise work agent and interoperability layer, not yet a consumer wallet
- **OBSERVED:** Claude computer use can operate desktop interfaces; Anthropic explicitly describes it as experimental and error-prone ([computer use](https://www.anthropic.com/news/3-5-models-and-computer-use)). Claude Enterprise provides organization knowledge, larger context, SSO/SCIM and audit logs ([Claude Enterprise](https://www.anthropic.com/news/claude-for-enterprise)).
- **OBSERVED:** Anthropic created MCP as an open, two-way connection standard for assistants and data/tools; early adopters included Block and Apollo, with Google Drive, Slack, GitHub, Postgres and browser connectors ([Anthropic MCP](https://www.anthropic.com/news/model-context-protocol)). OpenAI subsequently based its Apps SDK on MCP, evidence that the interface can outlive its originator.
- **INFERRED:** Claude/Cowork-class products are likely to hold deep *enterprise* context and execute knowledge-work across sanctioned systems by 2028–2031.
- **UNKNOWN:** primary evidence does **not** show Claude becoming a mass-market payment-credential holder or consumer commerce aggregator. Its more credible ceiling is trusted enterprise operator plus protocol client.

### Google: deepest context-and-commerce bundle
- **OBSERVED:** Gemini Personal Intelligence can connect Gmail, Photos, YouTube and Search, reason across them, and act for the user; it is opt-in and Google says it does not directly train on Gmail/Photos contents ([Google, January 2026](https://blog.google/innovation-and-ai/products/gemini-app/personal-intelligence/)). Workspace supplies mail, calendar, documents and enterprise identity.
- **OBSERVED:** Google introduced AP2 for cryptographically verifiable payment mandates and later donated it to the FIDO Alliance, signalling a standards strategy rather than a Google-only rail ([Google/FIDO AP2](https://blog.google/products-and-platforms/platforms/google-pay/agent-payments-protocol-fido-alliance/)).
- **OBSERVED:** Google and Shopify co-developed UCP; Gemini and AI Mode support embedded merchant journeys, while UCP can compose with MCP, AP2 and A2A ([Shopify UCP](https://www.shopify.com/news/ai-commerce-at-scale); [Google UCP docs](https://developers.google.com/merchant/ucp)).
- **INFERRED:** Google has the best structural path to combine personal context, Workspace, Android, Search/Shopping graph, identity and payments. Its weakness is regulatory exposure and merchant/user distrust of excessive integration.

### Apple, Amazon and Meta: distribution moats create several defaults, not one
- **OBSERVED:** Apple’s 2026 Siri AI uses messages, email, photos, onscreen context, conversation history and systemwide app actions; Apple emphasizes on-device models/Private Cloud Compute. It can invoke Apple Cash for a bill-splitting action, but Apple has not announced a general merchant-agent protocol ([Apple Siri AI](https://www.apple.com/newsroom/2026/06/apple-introduces-siri-ai-a-profoundly-more-capable-and-personal-assistant/)).
- **OBSERVED:** Alexa+ stores user-supplied documents/messages, learns household preferences, monitors deals and can automatically purchase at a user-set price using the default Amazon address/payment method. Amazon says **tens of millions** use Alexa+ and that device purchases occur **three times more** often; these are vendor-reported figures ([Amazon, February 2026](https://www.aboutamazon.com/news/devices/new-alexa-plus-amazon-devices)).
- **OBSERVED:** Meta AI spans WhatsApp/Instagram/Facebook and a standalone app with memory/personalization ([Meta AI app](https://about.fb.com/news/2025/04/introducing-meta-ai-app-new-way-access-ai-assistant/)). Meta’s stronger commerce evidence is on the *business* side: its Business Agent answers, recommends, books, qualifies and closes sales in messaging ([Meta Business Agent](https://about.fb.com/news/2026/06/meta-business-agent/)).
- **INFERRED:** device, retail and messaging incumbents prevent a clean ChatGPT/Gemini duopoly. **UNKNOWN:** Apple and Meta have not shown a cross-merchant delegated-payment credential model comparable to Amazon account checkout or ChatGPT card-on-file.

### Open/local agents: a durable sovereignty segment
- **OBSERVED:** Hermes Agent is open source, self-hostable, model/provider-flexible, extensible through tools/MCP, and designed to retain user-specific skills/memory ([Nous Research repository](https://github.com/NousResearch/hermes-agent); [official site](https://hermes-agent.nousresearch.com/)). Meta’s Llama model family and comparable open-weight models lower the cost of private deployment.
- **INFERRED:** local agents are unlikely to win the median consumer on convenience, but remain structurally important for regulated firms, governments, developers, privacy-sensitive users and jurisdictions demanding data residency. Their existence alone makes “trust OpenAI/Google’s internal log” an inadequate universal clearing model.
- **UNKNOWN:** no primary evidence establishes mass consumer adoption, reliable autonomous purchasing, or a common credential/recourse scheme for Hermes-class agents.

## 2. Aggregation: super-apps versus a neutral layer

### Evidence for 2–3 aggregators
- **OBSERVED:** OpenAI combines audience, memory, agent execution, an app directory, product discovery and card-on-file checkout. Google combines Android/Search/Workspace/Shopping/Pay. Amazon combines Prime identity, retail catalog, fulfilment and stored payment. These are browser/app-store-style distribution advantages.
- **OBSERVED:** Walmart partnered with OpenAI for AI-first shopping; Shopify exposes merchants to ChatGPT, Gemini/Google AI Mode and Copilot from one admin ([Walmart](https://corporate.walmart.com/news/2025/10/14/walmart-partners-with-openai-to-create-ai-first-shopping-experiences); [Shopify](https://www.shopify.com/news/ai-commerce-at-scale)).
- **INFERRED:** consumer discovery and conversion may concentrate sharply even if protocols remain open. Platform ranking, embedded checkout and memory create a demand-side choke point; the rail beneath can become interchangeable plumbing.

### Stronger evidence for persistent heterogeneity
- **OBSERVED:** Shopify’s strategy is explicitly “set up once, surface everywhere,” including ChatGPT, Copilot, Gemini and Google AI Mode; it backs UCP rather than betting on one assistant. UCP had **20+ retailer/platform endorsements** when Shopify announced it ([Shopify](https://www.shopify.com/news/ai-commerce-at-scale)).
- **OBSERVED:** OpenAI’s Apps SDK adopts Anthropic-originated MCP; UCP composes with MCP, AP2 and A2A; Google moved AP2 to FIDO. Protocol convergence is occurring by *layer*, not around one vertically integrated owner.
- **OBSERVED:** Cloudflare introduced Web Bot Auth/signed agents so sites can cryptographically distinguish ChatGPT agent, Block’s open-source Goose, Browserbase and others, then allow or block classes separately. Cloudflare says customers requested granular control, not blanket access ([Cloudflare signed agents](https://blog.cloudflare.com/signed-agents/)). Shopify likewise asks bots/agents to identify through Web Bot Auth ([Shopify developer changelog](https://shopify.dev/changelog/bots-and-agents-should-identify-themselves-via-web-bot-auth)).
- **OBSERVED:** Cloudflare simultaneously offers blocking, differentiated access and pay-per-crawl—direct evidence that businesses are both courting valuable agents and resisting extraction ([AI controls](https://blog.cloudflare.com/content-independence-day-ai-options/); [pay per crawl](https://blog.cloudflare.com/introducing-pay-per-crawl/)).
- **INFERRED:** “agent visibility optimization” will exist, but its lasting form is likely structured catalogs/manifests, authenticated access, reputation and measurable outcomes—not merely a new SEO copy industry.

### Regulation favours interface openness, not automatically AE
- **OBSERVED:** the European Commission’s 2026 Android DMA proceeding proposes free interoperability for third-party AI services across wake-word invocation, on-device context, app actions and models/resources ([European Commission](https://digital-markets-act.ec.europa.eu/dma100220-consultation-proposed-measures-interoperability-google-android-article-67-dma_en)).
- **INFERRED:** EU rules make a single OS-native agent less able to exclude rivals and increase the value of portable authority/evidence. **UNKNOWN:** neither the DMA nor AI Act mandates an independent clearing ledger, and regulated institutions may build/buy their own rather than use AE.

## 3. The SMB side and agent-to-agent timeline

- **OBSERVED:** Meta says **more than one million businesses** already use its Business Agent and reports **more than one billion active business-message threads daily** across WhatsApp, Messenger and Instagram; its agent answers questions, recommends products, books appointments, qualifies leads and closes sales ([Meta, June 2026](https://about.fb.com/news/2026/06/meta-business-agent/)). These are Meta-reported counts.
- **OBSERVED:** Square’s Managerbot, in 2026 open beta, monitors sales/labour/inventory, drafts schedules and campaigns, and requires seller approval before execution; Square says **thousands** had used it ([Square](https://squareup.com/us/en/press/managerbot-open-beta)).
- **OBSERVED:** ServiceTitan’s vertical AI Virtual Agent uses customer/history/capacity data to answer and book trades jobs in real time; quoted booking-rate claims of **80–85%** are customer testimonials, not independent measurements ([ServiceTitan](https://www.servicetitan.com/features/pro/virtual-agent)). RingCentral sells an AI receptionist, and Vodafone/Google Cloud launched AI services for SMBs ([RingCentral](https://www.ringcentral.com/ai-receptionist.html); [Vodafone](https://www.vodafone.com/news/newsroom/technology/vodafone-business-launches-new-ai-and-cybersecurity-solutions-in-partnership-with-google-cloud)).
- **INFERRED:** SMB agents arrive mainly through systems already holding operational truth—vertical SaaS, POS/payments, CRM/field-service, messaging and telco—rather than an independent general model. Their moat is live availability, pricebook, customer history, policy and scheduling authority.
- **INFERRED timeline:** **2026–2027:** consumer agent talks to human-facing business bot/API for FAQ, lead qualification and booking, usually with confirmation. **2028–2029:** bounded agent↔agent negotiation becomes normal for structured quotes, slots, substitutions and terms, using MCP/A2A/UCP-like envelopes plus mandates. **2030–2031:** unattended negotiation is plausible for repeat, low-risk purchases inside standing limits; bespoke/high-liability work retains human checkpoints. These dates are forecasts, not observed commitments.
- **UNKNOWN:** reliable autonomous negotiation over ambiguous local-service scope, outcome quality, warranties and disputes. Protocol transport does not solve truth, authority or recourse.

## 4. Three scenarios and AE’s position

| Scenario | Evidence-weight, mid-2026 | AE position | What must be true |
|---|---:|---|---|
| **Platform-aggregated:** 2–3 assistants own context, ranking, credential and checkout; merchants accept their terms. | **Material but not dominant — INFERRED 30%** | **Mostly dead as a universal rail; niche** for regulated/high-liability actions, local jurisdictions and cross-platform disputes. ACP/AP2/UCP and platform logs commoditize ordinary retail admission. | AE must avoid generic checkout/catalog competition and sell verifiable cross-platform recourse where platforms cannot self-attest credibly. |
| **Heterogeneous-multipolar:** consumer, enterprise, vertical and local agents interoperate across many merchant systems. | **Most evidenced — INFERRED 50%** | **Structural opportunity.** AE can be the neutral mandate/evidence/replay layer while MCP/A2A/UCP/ACP remain transport, tool and commerce adapters. | Prove interoperability with several agent families and business systems; win an operational wedge where shared evidence reduces real loss, not merely improves architecture. |
| **Regulated-neutral:** law/procurement requires portability, non-discrimination, auditability or independent evidence. | **Emerging — INFERRED 20%** | **Potential structural winner or certified utility**, especially in government, finance, health, employment and cross-border commerce. | Standards recognition, governance independence, privacy/redaction, jurisdictional clocks, liability allocation and institutional distribution; regulation alone does not select AE. |

*Scenario percentages are subjective evidence weights, not measured probabilities; they total 100%.*

## Bottom line for AE

1. **Build below assistants, above transports/payments.** Accept ChatGPT, Gemini, Claude, Siri, Alexa, Meta and local agents as interchangeable principals’ interfaces; treat MCP/A2A/UCP/ACP/AP2 and browser automation as adapters, not competitors to reimplement.
2. **Own the facts no platform can honestly collapse:** who delegated; exact permitted action/terms; what was signed; nonce/use; what was sent and received; what later happened; which clock applied; and how a third party can replay the dispute. Receipt must never become outcome.
3. **Use the local-services wedge as proof, not identity.** R1’s governed send is valuable only if it demonstrates fewer unauthorized, duplicate, mis-scoped or irreconcilable actions between heterogeneous parties.
4. **Do not claim “SWIFT/TLS for agents” yet.** **UNKNOWN:** whether counterparties will accept an independent ledger, who funds it, whether large platforms federate evidence, and whether AE can establish governance neutrality. The near-term test is repeat cross-platform usage plus a dispute/insurance/compliance outcome that neither endpoint can produce alone.