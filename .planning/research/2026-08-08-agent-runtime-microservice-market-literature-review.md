# Agent-runtime microservice market — literature review

**Date:** 2026-08-08  
**Companion design:** [2026-08-08-agent-runtime-microservice-market-architecture.md](2026-08-08-agent-runtime-microservice-market-architecture.md).

## Executive conclusion

### OBSERVED FACT

The reviewed sources cover static instructions, open-source runtimes, hosted infrastructure, API directories, payment protocols, and ranking/reputation systems. They do not establish one combined market or a causal “leaderboard flywheel.” No reviewed source proves that a public leaderboard causes innovation, revenue, quality, or supplier retention; no source supports a universal quality score. The academic evidence documents cross-side coordination, feedback and identity limits, popularity feedback, exploration requirements, metric gaming, Sybil resistance, and ranking-transparency obligations.

### DESIGN DECISION

Supply is a remotely callable, typed, admitted **Agent Runtime Microservice** operation keyed by content-derived `operationRef`; a business or **Supplier** is a portfolio rollup. Static skills, repositories, installs, stars, and local wrappers remain acquisition, lineage, and developer-adoption signals, but are not metered supply. V1 is measurement/discovery, not managed allocation. **Qualified Use** is one logical production invocation with validated terminal success; retries, tests, owner/self, refused/failed, and unknown are excluded. **Settled Use** is separate and requires authoritative reconciled settlement evidence. Flow A keyless answer tools, Flow B Customer Request x402 transport, and development-only dynamic-published money remain separate rails.

## Methods and scope (OBSERVED FACT)

The corpus used original peer-reviewed papers/author manuscripts/institutional PDFs; first-party platform docs, live APIs, terms, and pricing; first-party GitHub READMEs/skill files; and current AE TypeScript/Convex source. Existing source outranks old notes. Source shape proves code boundaries/local intent, not hosted execution, provider quality, customer value, payment, or settlement (`.planning/codebase/PROMPT-DATA-FLOW.md:13-41,269-274`). Skills/GitHub counts are dated adoption signals, not causal estimates.

## Shared vocabulary and boundary

| Term | Contract | Primary/current source |
|---|---|---|
| **Agent Runtime Microservice** | Hosted remote primitive: typed input → bounded work → typed result/evidence, optionally per-use charged. | Design decision from OSS runtime corpus below. |
| **Market Operation** | One admitted callable operation, not a repo, skill, or business. | `operation:v1:<64 hex>` is derived from operation/publication/revision/contract (`src/modules/capability-supply/public.ts:59-79`); descriptors carry schemas, price, effects, provenance, availability, evidence (`src/modules/capability-supply/operation-projection.ts:90-114`). |
| **Supplier** | Provider/business owning Market Operations; supplier views are derived rollups. | Canonical one-business flat `endpoints[]` Service (`src/modules/registry/internal/service-projection.ts:4-20,32-90`). |
| **Active Runtime** | Current admitted publication with routeable/conformant binding and valid readiness; not universal uptime. | Lifecycle gates (`src/modules/capability-supply/internal/publication/lifecycle.ts:8-16,59-128`). |
| **Invocation Fact** | Attributable attempt with operation identity, request/result digests, outcome, time, evidence refs. | Route outcome union (`src/modules/customer-request/route-execution/machines/types.ts:72-95`); executor typed result/refusal/error/evidence (`src/modules/capability-execution/operation-execute.functions.ts:56-78`). |
| **Qualified Use** | One logical production Invocation Fact with schema-validated terminal success; excludes retries/tests/owner/self/refusals/failures/unknown. | Liquidity events (`src/modules/capability-supply/internal/liquidity.ts:17-33,69-76`). |
| **Settled Use** | Qualified Use plus authoritative exact settlement evidence (amount, asset/currency, network, exponent/scheme, operation/attempt). | Transport settlement states (`src/modules/capability-supply/route-transport-runtime.ts:147-164`); paid semantics (`src/modules/action-invocation/paid-operation-semantics.ts:289-306`). |
| **Market Observation** | Rebuildable operation-first projection from source facts over a closed window. | Existing facts remain authoritative in `answerToolCalls`, route journals, and settlement evidence; see the [companion architecture §§4–6](2026-08-08-agent-runtime-microservice-market-architecture.md#4-source-of-truth-diagram). |
| **Leaderboard View** | One transparent metric/window (qualified uses, reliability, latency, growth, settled volume), display only. | Discovery is lexical, not quality/popularity (`src/modules/capability-supply/operation-projection.ts:268-288,949-964`). |
| **Allocation Decision** | Runtime choice with authority, effects, spend, outcome responsibility. | V1 does not derive it from public views; compiler/mandate/grant/transport/outcome remain authority (`.planning/codebase/PROMPT-DATA-FLOW.md:229-240`). |

## Primary-source evidence matrix (academic)

| Source | Safe observation and AE constraint | Not established |
|---|---|---|
| Rochet & Tirole, *Platform Competition in Two-Sided Markets*, [PDF](https://publications.ut-capitole.fr/1019/1/platform.pdf) | Cross-side participation affects demand and price structure matters; start narrow and expose unit/price. | No AE rake or leaderboard effect. |
| Caillaud & Jullien, *Chicken & Egg Competition*, [PDF](https://www.edegan.com/pdfs/Caillaud%20Jullien%20%282003%29%20-%20Chicken%20and%20Egg.pdf) | Intermediation has adoption coordination; measure matching/time-to-first-use, not catalog count. | No proof rank/subsidy solves cold start. |
| Weyl, *A Price Theory of Multi-Sided Platforms*, [PDF](https://sls.gmu.edu/gai/wp-content/uploads/sites/27/2017/04/A-Price-Theory-of-Multi-Sided-Platforms.pdf) | Pricing must account for cross-group externalities; keep buyer/provider economics distinct. | No AE percentage/payout. |
| Resnick et al., *Reputation Systems*, [PDF](https://presnick.people.si.umich.edu/papers/cacm00/reputations.pdf) | Reputation requires durable subjects, useful feedback, and manipulation defenses; expose denominator/evidence. | Stars/install counts are not reliability/customer value. |
| Dellarocas, *Digitization of Word-of-Mouth*, [PDF](https://ccs.mit.edu/dell/digitization%20of%20word-of-mouth.pdf) | Digital feedback aggregates experience but strategic reporting affects credibility; retain provenance. | More ratings need not be truthful/independent. |
| Miller, Resnick & Zeckhauser, *Eliciting Informative Feedback*, [DOI](https://doi.org/10.1287/mnsc.1050.0379) | Incentive-compatible feedback requires explicit assumptions/payment rules; no anonymous stars by default. | Peer prediction does not make installs ground truth. |
| Bolton, Katok & Ockenfels, *Electronic Reputation Mechanisms*, [DOI](https://doi.org/10.1287/mnsc.1040.0259) | Reputation performance depends on design/behavior; reliability needs denominator and abuse controls. | No causal leaderboard-to-revenue result. |
| Muchnik, Aral & Taylor, *Social Influence Bias*, [DOI](https://doi.org/10.1126/science.1240466) / [PDF](https://snap.stanford.edu/class/cs224w-readings/muchnik13bias.pdf) | Early ratings changed later ratings; show windows/sample sizes and separate popularity from quality. | No AE supplier/revenue result. |
| Salganik, Dodds & Watts, *Artificial Cultural Market*, [PDF](https://www.kostakos.org/courses/socialweb10F/reading_material/2/Salganik06-Inequality%26UnpredictabilityInArtificialCulturalMarket.pdf) | Popularity feedback produced inequality/path dependence/unpredictability; rank is not a neutral quality oracle. | Not microservice evidence. |
| Fleder & Hosanagar, *Recommender Systems and Diversity*, [DOI](https://doi.org/10.1287/mnsc.1080.0975) | Recommendation exposure changes concentration/diversity; keep ranking separate from Allocation Decisions. | No AE formula or concentration benefit. |
| Auer, Cesa-Bianchi & Fischer, *Finite-time Bandit Analysis*, [PDF](https://aima.cs.berkeley.edu/~russell/classes/cs294/s11/readings/Auer%2Bal%3A2002.pdf) | Bandit guarantees require reward feedback and exploration; future allocation needs candidate/context/exposure logs. | No proof static rank is optimal. |
| Li et al., *Contextual-Bandit Personalized News*, [MSR PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/02/p661.pdf) | Contextual selection requires context/action/reward logs and exploration; defer routing until randomized evaluation. | News assumptions do not transfer to paid tools. |
| Goodhart, *Problems of Monetary Management*, [primary text](https://jmde.journals.publicknowledgeproject.org/index.php/jmde_1/article/download/297/292/988) | A regularity used as a target can stop being reliable; metrics are observations, not blind targets. | No AE leaderboard prescription. |
| Campbell, *Assessing Planned Social Change*, [DOI](https://doi.org/10.1016/0149-7189(79)90048-X) | High-stakes indicators invite corruption; exclude owner/self/test/retry/unverifiable events. | No universal anti-gaming formula. |
| Manheim & Garrabrant, *Categorizing Goodhart Variants*, [arXiv](https://arxiv.org/abs/1803.04585) | Proxy optimization can diverge from objective; do not combine calls/tokens/stars/latency/reliability/revenue into opaque score. | No best AE metric. |
| Kleinberg & Raghavan, *How Do Classifiers Induce Agents to Invest?*, [arXiv](https://arxiv.org/abs/1807.05307) | Agents adapt to scoring rules; assume suppliers optimize visible metrics and use independent/owner-excluded evidence. | No AE rank algorithm. |
| Douceur, *The Sybil Attack*, [PDF](https://www.microsoft.com/en-us/research/wp-content/uploads/2002/01/IPTPS2002.pdf) | Cheap pseudonyms can capture reputation; distinct consumers require attributable principals. | No identity scheme proves honesty. |
| Yu et al., *SybilGuard*, [PDF](https://www.cs.columbia.edu/~danr/6772/papers/sybil.pdf) | Sybil resistance depends on honest-region/social-graph assumptions; generic verified badge is insufficient. | Social graph is not universal AE identity. |
| EU Regulation 2019/1150 Article 5, [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32019R1150) | Ranking parameters and relative importance should be described; disclose metric/window/denominator/exclusions/evidence/order driver. | Transparency is not causal quality or universal score. |

These 19 primary academic/policy sources support constraints, not a formula. No source proves that leaderboards cause innovation or revenue.

## 4. What people are building

### Skills.sh (OBSERVED FACT)

Live cards show static `SKILL.md` instructions plus repository lineage, installs/stars, sparklines, and audits—not remote typed calls or settlement:

| Card | Representative repo/content | Classification |
|---|---|---|
| [shadcn](https://www.skills.sh/shadcn-ui/ui/shadcn) — 6.9K installs; 120.8K repo stars | [`shadcn-ui/ui`](https://github.com/shadcn-ui/ui); component source via `npx skills add`. | Distribution, not Market Operation. |
| [Supabase](https://www.skills.sh/supabase/agent-skills/supabase) — 205.4K; 2.5K repo stars | [`supabase/agent-skills`](https://github.com/supabase/agent-skills); database/auth/storage/RLS/migrations/CLI/MCP. | Distribution; hosted API separately admitted. |
| [Remotion](https://www.skills.sh/remotion-dev/skills/remotion-best-practices) — 468.9K; 4.2K repo stars | [`remotion-dev/skills`](https://github.com/remotion-dev/skills); video/React/media/maps/captions/rendering rules. | Distribution; rendering supply separate. |
| [playwright-cli](https://www.skills.sh/microsoft/playwright-cli/playwright-cli) — 112.6K; 12.4K repo stars | [`microsoft/playwright-cli`](https://github.com/microsoft/playwright-cli); browser commands/sessions/snapshots/devtools. | Local CLI guidance, not hosted browser invocation. |
| [firecrawl](https://www.skills.sh/firecrawl/cli/firecrawl) — 96.6K; 568 repo stars | [`firecrawl/cli`](https://github.com/firecrawl/cli); search/scrape/map/crawl/browser/download. | Distribution can point to hosted product; skill itself not supply. |

**DESIGN DECISION:** preserve installs/stars/trends/audits/repository lineage as acquisition signals, while excluding them from metered supply because static skills lack an attributable remote call, typed terminal result, bounded outcome, or settlement evidence.

### GitHub (OBSERVED FACT)

The corpus clusters into distinct primitives: [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md) and [servers](https://github.com/modelcontextprotocol/servers) (typed tools/resources/prompts, HTTP/stdio); [Trigger.dev](https://github.com/triggerdotdev/trigger.dev/blob/main/README.md) (durable tasks/retries/queues/idempotency/cloud/self-host); [Pydantic AI](https://github.com/pydantic/pydantic-ai/blob/main/README.md) (typed agents/tools/outputs/evals/MCP/durable execution); [Agno](https://github.com/agno-agi/agno/blob/main/README.md) (AgentOS/API/storage/traces/auth/MCP/deploy); [Letta](https://github.com/letta-ai/letta/blob/main/README.md) and [Mem0](https://github.com/mem0ai/mem0) (stateful memory); [OpenHands](https://github.com/All-Hands-AI/OpenHands/blob/main/README.md) (agent control plane/backends/automations); [LiteLLM](https://github.com/BerriAI/litellm/blob/main/README.md) (OpenAI-compatible gateway/keys/spend/guardrails/A2A/MCP); [Langfuse](https://github.com/langfuse/langfuse/blob/main/README.md) (traces/prompts/evals/datasets/cloud/self-host); [vLLM](https://github.com/vllm-project/vllm/blob/main/README.md) (model serving); [Stagehand](https://github.com/browserbase/stagehand) (browser); [E2B](https://github.com/e2b-dev/e2b) (sandbox); and [Firecrawl](https://github.com/firecrawl/firecrawl) (web extraction). GitHub defines stars as repository bookmarks/interest, while skills.sh defines installs as deduplicated CLI installation telemetry; neither source defines production agent execution demand ([GitHub starring](https://docs.github.com/en/rest/activity/starring), [skills.sh API](https://skills.sh/docs/api)).

## 5. Observed OSS→hosted conversion

### OBSERVED FACT

- [Firecrawl repo/CLI](https://github.com/firecrawl/firecrawl) + [pricing](https://www.firecrawl.dev/pricing): open web extraction paired with hosted endpoint.
- [Browserbase Stagehand](https://github.com/browserbase/stagehand) + [pricing](https://www.browserbase.com/pricing): open browser automation paired with hosted browser infrastructure.
- [E2B](https://github.com/e2b-dev/e2b) + [pricing](https://e2b.dev/pricing): open sandbox SDK paired with hosted sandbox compute.
- [Trigger.dev README](https://github.com/triggerdotdev/trigger.dev/blob/main/README.md) + [cloud/self-host docs](https://trigger.dev/docs/self-hosting/overview): open workflow runtime with both paths.
- [Langfuse README](https://github.com/langfuse/langfuse/blob/main/README.md) + [Cloud/self-host](https://langfuse.com/docs/deployment/self-host): OSS observability/evals with managed route.
- [Agno README](https://github.com/agno-agi/agno/blob/main/README.md): AgentOS and deploy templates; [Letta README](https://github.com/letta-ai/letta/blob/main/README.md): Constellation cloud/local/self-host.

### DESIGN DECISION

The recurring boundary is: OSS packages a developer primitive; hosting adds scarce compute/network/state/observability/security/scale; hosted product exposes typed I/O, identity/auth, quotas, statuses, and price unit; OSS remains acquisition, integration, lineage, and developer adoption; AE admits only the hosted operation. This does not prove OSS popularity causes hosting revenue or that every popular repository should become supply.

## 6. Platform mechanics / adopt-reject

| Reference | Adopt | Reject/limit |
|---|---|---|
| Apify [PPE](https://docs.apify.com/actors/publishing/monetize/pay-per-event.md) | Event units, primary/custom events, max-cost guard, disclosed split. | No universal 80% AE share or causal quality claim. |
| agentic.market [SKILL](https://agentic.market/SKILL.md), [API](https://api.agentic.market/v1/services?limit=3), [x402](https://github.com/coinbase/x402) | Provider-direct endpoint discovery/payment, explicit network/asset/price, catalog/observed tiers. | Shallow catalog is not execution authority; listing/first-settle does not prove usage, reliability, revenue, settlement, or leaderboard contract. |
| skills.sh [docs](https://skills.sh/docs/api) | Install/trending/hot UX, repo lineage, audits. | Skills/stars/installs are not execution/settlement. |
| OpenRouter [FAQ](https://openrouter.ai/docs/faq.md) / [provider application](https://openrouter.ai/providers/apply) | Common API, prepaid credits, scoped keys/limits/activity. | Mechanics do not prove rank→innovation/revenue. |
| RapidAPI [plans](https://docs.rapidapi.com/v1.0/docs/api-pricing.md) / [provider plans](https://docs.rapidapi.com/v2.0.0/docs/hub-listing-monetize-tab.md) | Unit/quota/overage/rate-limit rows. | Example prices/tiers/20% fee are not AE constants. |
| Stripe [Connect](https://docs.stripe.com/connect/accounts-v2.md) / [usage](https://docs.stripe.com/billing/subscriptions/usage-based/implementation-guide.md) | Account/payout/reconciliation states. | Async meters cannot authorize immediate per-call debit. |
| MCP [SDK](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/README.md) / [spec](https://modelcontextprotocol.io/specification/latest) | Standard typed tools/resources/prompts and HTTP/stdio adapters. | `tools/list` is not execution/reliability/payer/settlement evidence. |

## 7. Mechanism constraints and rails

- **Identity/admission:** use `operationRef`; Supplier is rollup only after origin/ownership. A listing is not Active Runtime. Reuse existing admission, lifecycle, readiness, and fail-closed executor (`src/modules/capability-supply/public.ts:59-79`; `src/modules/capability-execution/operation-execute.functions.ts:7-24,80-169`; lifecycle source).
- **Evidence:** count only Qualified Use from bounded terminal success; keep settlement separate and exact. Separate qualified uses, reliability, consumers, latency, growth, and Settled Use; each view states window/denominator/exclusions/evidence/freshness/source. (`src/modules/capability-supply/internal/liquidity.ts:17-33,69-76`; transport/paid semantics; Auer/Li; popularity/Goodhart/Sybil literature.)
- **No universal score:** do not combine calls/tokens/stars/installs/latency/reliability/revenue/rank. No reviewed source supports it; proxy corruption, herding, concentration, and Sybil risks support metric-specific transparency.
- **Discovery/allocation:** keep lexical registry discovery and Leaderboard Views separate from Allocation Decisions; future managed routing needs randomized exposure, candidate/context/propensity/reward logging and evaluation (`src/modules/capability-supply/operation-projection.ts:268-288,949-964`; `.planning/codebase/PROMPT-DATA-FLOW.md:229-240`; Auer/Li/Fleder).
- **Rails:** Flow A keyless answer tools use the DB executor and AnswerToolCall evidence (`.planning/codebase/PROMPT-DATA-FLOW.md:70-95,111-118`; answer/executor sources); Flow B Customer Request x402 uses route mandate/attempt/transport/reconciliation (`.planning/codebase/PROMPT-DATA-FLOW.md:217-227`; transport source); development-only money ledger is internal and explicitly disjoint from external x402 (`convex/moneyLedger.ts:73-178`; `src/modules/action-invocation/dynamic-published-adapter.ts:361-364`). Never join by field-name similarity.

## 8. Claims the evidence does not support (OPEN QUESTION / UNSUPPORTED)

- A public leaderboard causes innovation, revenue, supplier retention, better quality, or network effects.
- One universal quality/trust/popularity score can combine calls, tokens, stars, installs, latency, reliability, revenue, and rank (`https://arxiv.org/abs/1803.04585`; Muchnik DOI; Douceur PDF).
- A star/install/trend/README/catalog/provider-dashboard signal is Qualified Use or Settled Use (`https://skills.sh/docs/api`; answer evidence source).
- A 200 response, x402 challenge, authorization/signature, provider payment response, or possibly-submitted state proves settlement (`src/modules/capability-supply/route-transport-runtime.ts:147-164,722-775`).
- A business total proves every endpoint performed equally; Service is a portfolio rollup (`src/modules/registry/internal/service-projection.ts:17-20,32-90`).
- Provider aggregate counts do not independently prove AE calls, consumers, or reliability; provider-attested evidence remains distinct from AE-observed evidence ([agentic.market live API](https://api.agentic.market/v1/services?limit=3); [companion architecture §6](2026-08-08-agent-runtime-microservice-market-architecture.md#6-source-bound-projection-schema)).
- A model/popularity/catalog selection is an Allocation Decision; authority/spend/effects/transport/outcome remain kernel-owned (`.planning/codebase/PROMPT-DATA-FLOW.md:229-240`).
- Static skills should be discarded; they remain valuable distribution/lineage, but do not qualify as metered remote supply without an admitted remotely callable operation and evidence path.

## 9. Open questions / gates

Provider-direct receipt ingestion needs immutable operationRef-bound provider/facilitator/chain receipts, signature/digest/idempotency checks, and explicit provider-attested/payment-verified tiers. Settled Use/sub-cent amounts need exact reconciled amount/currency/asset/network/exponent/scheme/payTo and operation/attempt binding with no rounding. Distinct consumers need privacy-preserving principal evidence/anti-Sybil policy. Managed allocation needs randomized exposure, counterfactual evaluation, context/propensity/reward logs. Public metric views need one metric/window/denominator, evidence/exclusions/freshness/paid placement and no universal score. Supplier economics/rake remain hypotheses until real receipts measure fill, time-to-first-qualified-use, depth, retention, cost, and net economics. Older un-attributed rows must be excluded rather than guessed.

## 10. Primary-source index

Academic sources are in §3. Key live sources: AE current paths above; [agentic.market](https://agentic.market/llms.txt), [API](https://api.agentic.market/v1/services?limit=3), [x402](https://github.com/coinbase/x402); [skills.sh](https://skills.sh/docs/api); the OSS links in §4; Apify/OpenRouter/RapidAPI/Stripe/MCP links in §6.

**Bottom line:** an Agent Runtime Microservice becomes market supply only when its hosted endpoint is a current admitted Market Operation with a typed contract and attributable Active Runtime. Skills/repositories provide distribution and lineage. They do not become metered supply until a hosted operation produces a bounded Invocation Fact; it becomes Qualified Use only after validated terminal success, and Settled Use only after authoritative reconciliation.
