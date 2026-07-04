# Agentic Economy Platform Anatomy — 2026-07-04

## 0. Operating thesis

1. This is an internal ownership artifact for the AE rebuild vision.
2. It does not change public product copy, source code, schemas, or current capability claims.
3. Current AE is bounded: business-supplied pages, assistant-readable discovery, and qualified inquiry for owner review.
4. AE does not yet book work, take payment, dispatch providers, auto-fulfil jobs, run a live marketplace, or execute broad autonomous actions.
5. The rebuild thesis reframes AE as supply-side infrastructure for agent-native businesses.
6. The product entry is not a consumer destination.
7. The product entry is the place a business becomes legible, bounded, contactable, and later auditable to agents.
8. The long vision remains a domestic router, registry, and directory across services, goods, software, and tech.
9. The operating path enters through supply-side agent readiness rather than consumer search.
10. The near-term wedge stays AU local services in one metro and urgent verticals first.
11. The core schema posture stays wedge-agnostic so later goods, software, and tech do not inherit plumbing-only fields.
12. Evidence basis: current repo orientation says AE's public contract is read/compare/summarize/route/qualified inquiry only (`local://ae-orientation.md:3-15`).
13. Evidence basis: bones audit says the strongest owned assets are boundary-honest copy, central action contracts, catalog APIs, assistant discovery, source-backed readbacks, answer/harness evidence, qualified inquiry, and agent-experience audit (`local://bones-audit.md:78-94`).
14. Evidence basis: landscape research says payment, consumer-agent, and bot-access layers are crowded, while a cross-sector business discovery/capability/trust layer remains fragmented (`local://research-landscape.md:16-23`).
15. Evidence basis: demand research says AI-assisted discovery and comparison are plausible, while autonomous local hiring and supplier maintenance remain unproven (`local://research-demand.md:5-12`, `local://research-demand.md:35-39`, `local://research-demand.md:63-68`).
16. Evidence basis: technical roast says the only assistant-exposed write is listed but still dark at `/api/agent/tools` because the route invokes the harness with `allowWrites:false` (`local://roast-technical.md:95-110`, `local://roast-technical.md:330-346`).
17. Evidence basis: marketplace roast says a router is an outcome of volume, not a bootstrap method (`local://roast-marketplace.md:191-230`).
18. Evidence basis: investor roast says the honest product is too small unless the first narrow loop proves supply pull, distribution, and monetization staging (`local://roast-investor.md:65-80`, `local://roast-investor.md:377-388`).
19. Therefore the anatomy below treats the platform as an organism that must first survive as a narrow, measurable supply-side product.
20. Anything beyond today's qualified inquiry and read-only discovery is explicitly future, speculative, or not implemented.

---

## 1. BONES — what we keep

21. Bones are the load-bearing assets that survive the reframe.
22. These are not vanity artifacts; they become the skeleton of supply-side infrastructure.
23. The rebuild should cut non-load-bearing cartilage around them rather than rewrite them.

### Bone 1 — Boundary-honest trust contract plus scans

24. Keep the contract that AE publishes business-supplied facts, names source/freshness/boundary, and refuses unsupported verbs.
25. In the new organism this bone becomes the identity discipline for an agent-ready storefront.
26. It tells owners what AE can represent, and it tells agents what AE cannot do.
27. It prevents AE from becoming a fake marketplace with agentic vocabulary.
28. It also makes the brand distinctive: AE's truth is not that it can do everything; it is that it will not pretend.
29. Repo evidence: `PRODUCT.md:7-14`, `PRODUCT.md:28-40`, `PRODUCT.md:42-58`, `AGENTS.md:7-28` are cited as REAL with reuse value 5 in the bones audit (`local://bones-audit.md:21-23`, `local://bones-audit.md:78-80`).
30. Roast pressure: the same honesty makes the public story less exciting, which PM-05 already recognizes (`local://roast-investor.md:203-212`).
31. Platform role: every storefront, action descriptor, inquiry, receipt, and future compatibility surface inherits the boundary statement.
32. Owner promise: “make your business readable and safely contactable by agents without overclaiming what has been checked.”
33. Agent promise: “use these facts and actions only inside the declared boundary.”
34. TENSION: honesty is a trust asset and a marketing tax; the platform must prove owners value fewer, clearer inquiries enough to accept that tax.

### Bone 2 — Actions as the single machine-operation source

35. Keep `defineAction` and the central action registry as the only source for machine operations.
36. In the new organism this bone is the joint system: every hand movement attaches here.
37. Current actions are `inquiry.submit`, `registry.list`, `registry.search`, and `registry.detail` (`local://ae-orientation.md:44-52`).
38. The action contract already carries schema, surfaces, summaries, boundaries, and runners (`local://bones-audit.md:25-31`).
39. That is the right seam for MCP descriptors, `/api/agent/tools`, HTTP routes, owner UI affordances, harness tools, and later compatibility adapters.
40. The rebuild should add no route-local agent operations.
41. The future action ladder should be represented as new actions only when each rung has admission policy, owner checkpoint, evidence, idempotency, and receipt projection.
42. Repo evidence: `src/modules/common/action.ts:27-128` and `src/modules/actions/index.ts:1-37` are cited as REAL with reuse value 5 (`local://bones-audit.md:25-28`).
43. Technical pressure: the current write action is listed but blocked at the quiet door, so the action seam is only credible after the dark path is fixed (`local://roast-technical.md:95-110`).
44. Platform role: action contracts become the canonical capability declaration inside the storefront.
45. TENSION: an action registry is only valuable if agents can discover, trust, and successfully execute the admitted action; a schema alone is not a moat.

### Bone 3 — Public catalog/search/detail read model and DTO discipline

46. Keep the strict public catalog DTOs, published-only filtering, suppression discipline, and no-private-field contract.
47. In the new organism this is the spine of the registry.
48. It is the part that lets a business be found without leaking owner notes, private evidence refs, raw contacts, or source hashes.
49. Current `registry.search` and `registry.detail` are read-only and quiet-agent callable (`local://bones-audit.md:27-33`).
50. This maps directly to the supply-side storefront: agent-readable identity, service/capability summary, boundary, source links, and allowed next action.
51. Demand research says consumers and AI-assisted users still double-check sources and reviews, which makes source-backed catalog facts useful (`local://research-demand.md:23-28`, `local://research-demand.md:107-115`).
52. Landscape research says no surveyed source owns a cross-sector registry that answers identity, safe actions, evidence, and boundaries (`local://research-landscape.md:152-170`).
53. Platform role: the catalog read model becomes the canonical projection from owner-supplied/source-observed state into public and agent-readable storefront surfaces.
54. TENSION: public listing facts are commodity until AE has proprietary interaction receipts, correction histories, or response data (`local://roast-marketplace.md:260-282`).

### Bone 4 — Assistant discovery door: `/llms.txt`, `/api/agent/tools`, UCP fallback, robots, sitemap parity

55. Keep the assistant discovery door, but stop treating legibility as distribution.
56. In the new organism this bone is the mouth: agents can find the platform's declared surfaces.
57. `/llms.txt` is already the canonical assistant-readable index (`local://ae-orientation.md:48-52`).
58. `/api/agent/tools` already lists the narrow action-derived descriptors (`local://bones-audit.md:30-36`).
59. UCP fallback, sitemap, robots, and discovery schema outputs already preserve negative posture such as non-callable/non-payment stance (`local://bones-audit.md:35-36`).
60. Landscape research says `llms.txt` helps readability but does not authenticate businesses, declare enforceable actions, or produce receipts (`https://llmstxt.org/`, `https://caseyrb.com/blog/state-of-llms-txt-adoption/`, summarized in `local://research-landscape.md:80-86`).
61. Demand research says `llms.txt` adoption is real but early, with 5.61% of top 10k and 5.07% of top 1M sites valid in one June 2026 analysis, and much adoption pushed by platforms such as Shopify (`local://research-demand.md:45-53`).
62. Platform role: AE publishes storefront fragments that assistants can mount, crawl, or use through MCP-compatible adapters.
63. TENSION: the door is not the channel; distribution requires MCP catalog placement, assistant integration, targeted sessions, or owners embedding AE storefront links on their own web presence (`local://roast-marketplace.md:312-324`).

### Bone 5 — Source-owned Convex/module seam and readback model

64. Keep module-owned schema fragments, source-state reconstruction, source-write admission, and readback/repair ideas.
65. In the new organism this is the skeleton marrow: it produces new trusted state and regenerates projections.
66. AE needs source-owned rows for storefront profiles, inquiry events, evidence receipts, freshness checks, and owner corrections.
67. Repo evidence: module-owned Convex schema composition and business/owner/catalog loops are REAL or reusable (`local://bones-audit.md:38-40`).
68. The source-state machinery can support operator repair and audit reconstruction (`local://bones-audit.md:40`).
69. The rebuild should shrink tables that are ahead of product proof, not abandon the source/readback pattern.
70. Technical roast warns the current schema surface is large and future-loaded before deployed proof (`local://roast-technical.md:196-210`, `local://roast-technical.md:322-339`).
71. Platform role: every public storefront field should be explainable from source state and every future action should leave a reconstructable trail.
72. TENSION: source-owned rigor is useful only if the operating corpus is smaller than the founder can maintain.

### Bone 6 — Answer thread plus harness evidence spine

73. Keep the thread-first answer surface, tool-call persistence, public projection redaction, harness run summaries, and eval gates.
74. In the new organism this is the sensory cortex for agent-assisted discovery.
75. It should no longer be framed as the primary consumer destination.
76. It becomes a reusable interaction layer for answering, triaging, and routing over the registry with cited evidence.
77. Current answer/thread assets are REAL: `AeChat`, answer orchestrator, thread persistence, tool-call evidence, harness kernel, and eval harness (`local://bones-audit.md:48-53`).
78. The answer surface can repurpose its retrieval, evidence freezing, and thread projections for owner console, agent audit, and inquiry handoff.
79. The rebuild should not dump raw search results or make the answer loop call writes automatically.
80. Repo evidence: orientation says facts must come from explicit read tools and inquiry is not called by the public answer loop in v1 (`local://ae-orientation.md:54-56`).
81. Platform role: the brain can explain why a business was matched, which facts were known, and why a boundary stopped an action.
82. TENSION: answer UX is valuable only after supply and distribution exist; otherwise it becomes a polished demo over generated rows.

### Bone 7 — Qualified inquiry domain loop

83. Keep qualified inquiry as the canonical first action.
84. In the new organism this is the first hand movement: ask a business for human-reviewed contact without claiming booking or dispatch.
85. Pure domain reducers already cover submit, inbox, mark-read, reply, close, privacy tombstones, audit, and funnel redaction (`local://bones-audit.md:42-46`).
86. Demand research says Oneflare quoting/contact credits and hipages connections show the inquiry/connection unit is monetizable in AU local services (`local://research-demand.md:85-92`).
87. The current limitation is not the domain shape; it is proof and door execution.
88. Technical roast says targeted tests currently confirm signed `inquiry.submit` refusal through `/api/agent/tools`, not success (`local://roast-technical.md:52-63`, `local://roast-technical.md:95-110`).
89. Platform role: inquiry becomes the first receipt-backed event in the trust profile.
90. TENSION: inquiry is safer than booking, but weaker than a transaction and vulnerable to leakage (`local://roast-marketplace.md:234-257`, `local://roast-marketplace.md:376-393`).

### Bone 8 — Outside-in agent-experience audit harness

91. Keep the agent-experience audit as a continuous release gate.
92. In the new organism this is the reflex test: can an unbriefed agent find AE, use the door, and respect the boundary?
93. The harness exists and scores setup friction, speed, efficiency, error recovery, doc quality, and AE boundary-overreach (`local://bones-audit.md:58-59`).
94. ADR-006 exists because producer-side copy and route tests do not prove cold assistant behavior (`local://roast-technical.md:113-126`, `local://roast-technical.md:231-243`).
95. It should graduate from one-off local proof to a release gate over deployed surfaces once deployment inputs exist.
96. Platform role: each storefront and action rung should ship only when outside-in agents can discover it and stop at the declared edge.
97. TENSION: the latest green report in the roast was localhost, not deployed; local alias compensation must not be mistaken for market proof (`local://roast-technical.md:113-126`, `local://roast-technical.md:144-159`).

---

## 2. MEAT — real supply and the agent-ready storefront

98. Meat is the supply body: the thing a business receives even if AE has zero traffic.
99. The product is an agent-ready storefront.
100. It is hosted by AE and importable in minutes.
101. It is not a consumer homepage strategy.
102. It is an owner-controlled profile that agents can read, cite, and safely route to.
103. It contains identity, source-backed facts, services/capabilities, boundaries, accepted action rungs, freshness, and receipt history.
104. It produces a business-specific `/llms.txt` fragment or equivalent markdown block.
105. It produces structured data that the business can embed or link.
106. It produces an MCP-reachable capability declaration only when that adapter is implemented; until then, MCP remains a future/distribution posture.
107. It produces a plain boundary statement: AE does not yet book, charge, dispatch, or autonomously fulfil.
108. It exposes the current allowed action: qualified inquiry for owner review, after the dark write path is fixed.
109. Import path: website scrape, ABN lookup where available, Google Business Profile import where owner-authorized, and owner confirmation.
110. Owner confirmation is mandatory before strong profile claims.
111. Unconfirmed facts remain labeled as business-supplied, source-observed, or needs owner confirmation.
112. The storefront should remain useful without AE demand because the owner can paste/link it from their website, GBP posts, email signature, and assistant-facing materials.
113. The single-player value is “make my business intelligible to agents and safer for customers' assistants to summarize.”
114. Demand research warns SMBs are unlikely to maintain schemas without a proved channel, so maintenance must be near-zero and tied to visible inquiries or source drift (`local://research-demand.md:63-68`, `local://research-demand.md:149-166`).
115. AU SME research says 65% of non-adopters cite distrust/preference for human control, 54% cite lack of relevance, and 19% do not know how to use AI in business (`local://research-demand.md:55-62`).
116. Therefore the storefront pitch should not ask a plumber to “join agentic commerce.”
117. It should ask them to “claim the page your customers' assistants can read, correct, and use to send a qualified message.”
118. The wedge content model should include business name, service categories, service area, source URLs, response preference, owner-approved contact boundary, and current inquiry mode.
119. The core model must not hard-code urgency, suburb, trade license, or local-service-only fields into the platform schema.
120. Those belong in capability-specific evidence fields or category extensions.
121. Wedge example: emergency plumbing in one metro can use category extensions for service area and urgent availability.
122. Later goods/software/tech can use the same primitives for SKU feed, support policy, API capabilities, security posture, or SLA evidence.
123. TENSION: a storefront is single-player value, but if major assistants ignore embedded profiles or `/llms.txt`, the value may collapse to a prettier listing; the 14-day test must prove at least owner update behavior.
124. TENSION: automated import is convenient but can import stale or wrong facts; owner confirmation and source labels are not optional.

---

## 3. FASCIA — adapters and integrations

125. Fascia connects bones and meat without pretending to be the body.
126. AE should ride standards rather than rebuild their domains.
127. MCP is a distribution adapter, not the business model.
128. `/llms.txt` and feeds are legibility adapters, not demand.
129. Structured data is search/assistant context, not trust.
130. Google Business Profile import is owner-authorized source capture, not canonical identity ownership.
131. ABN lookup can support source-backed identity context in Australia, but it is not a blanket quality badge.
132. Web Bot Auth is agent identity input, not user authorization or action clearance.
133. ACP/AP2/UCP/x402 are compatibility surfaces or future rails, not AE-owned payment infrastructure.
134. Landscape evidence: OpenAI/Stripe ACP, Google AP2, Visa, Mastercard, PayPal, Coinbase x402, and Cloudflare are credible payment/access actors (`local://research-landscape.md:16-23`, `local://research-landscape.md:56-78`, `local://research-landscape.md:180-198`).
135. Kill-zone rule: AE should never build a generic payments rail against Stripe, Visa, Mastercard, AP2, ACP, or x402.
136. Kill-zone rule: AE should never build generic bot infrastructure against Cloudflare.
137. Kill-zone rule: AE should never position as a consumer front door against Google, ChatGPT, Gemini, Perplexity, Yelp, or Maps.
138. Instead, AE should publish compatible capability declarations that those systems or independent assistants can consume.
139. MCP server: future distribution mechanism where an assistant can mount AE's registry search/detail/inquiry tools.
140. Feed exports: business-level and category-level feeds for agents and partner crawlers.
141. `/llms.txt` fragments: per-business text blocks owners can host or link.
142. Structured data: schema.org LocalBusiness/Service/Action-shaped semantics where accurate, with no false offer/payment/booking claims.
143. GBP import: owner-authenticated read/import flow if APIs and policies allow; otherwise owner-uploaded or manually confirmed facts.
144. Web Bot Auth: accept signed agent identity for request provenance; do not conflate identity with permission.
145. ACP/AP2 posture: future delegated transaction rungs can bind to those rails if the product reaches them; AE would record evidence and authorization, not custody money.
146. UCP posture: future merchant capability compatibility can be watched and mapped, especially for goods/commerce; AE should not claim standard merchant-origin UCP is implemented unless it is.
147. x402 posture: future paid machine access could ride existing x402/Cloudflare rails; AE should not own settlement.
148. TENSION: compatibility adds surface area before traction; each adapter must earn its place by supporting the 14-day wedge or a clear distribution partner.

---

## 4. NERVOUS SYSTEM — receipts, evidence, and telemetry spine

149. The nervous system is the moat-clock bet.
150. Listings are commodity.
151. Schemas are commodity.
152. `/llms.txt` is commodity once platforms copy it.
153. Receipts might become non-commodity if AE accumulates enough interaction volume.
154. A receipt is a signed, replayable event that says what an agent or human asked, what source data was used, what boundary applied, what the business received, what the owner did, and what outcome signal later appeared.
155. Current bones already include answer thread tool-call evidence, harness summaries, inquiry audit/funnel redaction, and source-state reconstruction (`local://bones-audit.md:48-53`, `local://bones-audit.md:88-94`).
156. Future receipts should bind request, actor identity when available, business profile version, action id, input hash, boundary decision, owner checkpoint, response status, and replay projection.
157. They should be privacy-redacted by default.
158. They should be replayable enough for audits without exposing raw private messages publicly.
159. They should feed trust profiles honestly: response time, stale listing corrections, boundary compliance, refusal behavior, and fulfilment-adjacent signals where available.
160. They should not claim job completion, payment success, dispatch, or satisfaction unless the evidence source exists.
161. Landscape white space: payment networks emphasize payment authorization and settlement, while service interactions need pre-payment evidence such as who was contacted and what was requested (`local://research-landscape.md:160-165`).
162. Marketplace roast warns receipts only become defensible after AE owns enough event flow (`local://roast-marketplace.md:260-282`, `local://roast-marketplace.md:499-503`).
163. Therefore the receipt moat is a bet with a threshold.
164. Threshold candidate: at least one metro/category where AE has enough inquiry/response/correction events that ranking improves visibly and owners maintain profiles without hand-holding.
165. Before that threshold, receipts are a useful audit trail, not a moat.
166. TENSION: naming receipts as the moat is honest only if the document also says the moat does not exist pre-volume.

---

## 5. VASCULAR SYSTEM — money flow, staged and future-labeled

167. The vascular system moves money, but AE should not become the bank, PSP, escrow rail, wallet, card network, or settlement protocol.
168. Current AE does not take payment, charge for inquiries, hold deposits, split payouts, or settle transactions.
169. Monetization is future/speculative and admission-gated.
170. Stage 0: free agent-ready storefront.
171. Stage 0 value: owner gets an agent-legible profile, source labels, boundary statement, and embeddable fragments.
172. Stage 1: future paid qualified-inquiry routing, only after the 14-day gate proves qualified inquiry volume and owner update behavior.
173. Stage 1 should avoid hated incumbent lead-fee mechanics unless AE proves quality and response loops are measurably better.
174. Stage 2: future subscription agent-storefront tools, such as freshness monitoring, source drift alerts, profile embeds, response analytics, and owner inbox upgrades.
175. Stage 3 horizon: future per-action fees on receipted actions, never custody; PSPs and protocol rails ride underneath.
176. Payment custody rule: AE should integrate PSPs, AP2/ACP-style authorization, x402-style access, or existing merchant checkout where appropriate; AE does not become the money rail.
177. Demand evidence: hipages FY25 revenue was A$83.1m with 2.8m tradie-homeowner connections, showing AU tradies pay for access to demand (`local://research-demand.md:73-79`, `https://announcements.asx.com.au/asxpdf/20250822/pdf/06n5s3y9lqpx9j.pdf`).
178. Demand evidence: Airtasker FY25 GMV was A$208.7m with 21.6% monetisation rate, showing local-service marketplace value capture exists when the platform owns more of the transaction (`local://research-demand.md:79-83`, `https://announcements.asx.com.au/asxpdf/20250828/pdf/06nhm6dp7f5rfz.pdf`).
179. Pain evidence: review-site summaries point to lead quality, fees, transparency, vetting, and support complaints in incumbent marketplaces; treat these as user-review evidence, not legal findings (`local://research-demand.md:95-103`).
180. Investor roast warns AE currently avoids the hated lead-fee/revenue mechanism and has no proven monetization (`local://roast-investor.md:130-145`, `local://roast-investor.md:377-388`).
181. TENSION: the exploit is incumbent lead-fee resentment, but the revenue pool comes from charging providers for demand; AE must prove quality before charging or it repeats the incumbent pain.

---

## 6. PROPRIOCEPTION — self-sensing and release gates

182. Proprioception tells the organism where it is and whether it is overreaching.
183. AE needs self-sensing beyond copy scans.
184. Continuous agent-experience audits should become release gates for every assistant-facing surface.
185. A gate should ask an unbriefed agent to discover AE, find a business, understand boundaries, submit only allowed actions, and recover from refusals.
186. The gate should run against deployed surfaces for launch proof.
187. Local runs are useful for iteration only.
188. Listing freshness decay should be tracked per source field and profile.
189. A profile with stale source evidence should lose trust weight or show a maintenance prompt.
190. Boundary-overreach detection should inspect answer outputs, agent traces, action descriptors, public pages, and owner-console copy.
191. It should catch verbs such as booking, payment, dispatch, autonomous fulfilment, broad marketplace, wallet, and unsupported protocol readiness when not implemented.
192. The scan suite remains useful for producer-side language safety.
193. But ADR-006 exists because copy scans cannot observe a real assistant using the product cold (`local://roast-technical.md:231-243`).
194. Agent-experience harness should be generalized from one probe into repeated release profiles: local dev, staging/deployed, specific wedge category, and future adapter-specific scenarios.
195. The harness should also measure whether agents respect a `403` or boundary refusal and whether the response tells them how to proceed safely.
196. TENSION: more gates can become process drag; keep only gates that stop overclaim, broken agent workflows, or unsafe writes.

---

## 7. SKIN — human surfaces and brand membrane

197. Skin is what humans touch: owner console, public business pages, registry pages, status surfaces, and the visual system.
198. The skin should say less and prove more.
199. Owner console: claim/import profile, confirm facts, set contact boundary, view inquiries, view receipts, fix stale fields, and see agent-readiness status.
200. Public pages: business-supplied/source-labeled storefronts, comparison-safe details, and qualified inquiry where available.
201. Public pages should not imply booking, payment, dispatch, live marketplace liquidity, availability, or provider quality certification.
202. Astryx is the current design authority; no new bespoke CSS or parallel component systems should be introduced.
203. The skin should be calm, boundary-honest, and utility-first rather than protocol-theatre-heavy.
204. Humans need the plain sentence: “AE helps assistants read and contact this business safely; it does not yet complete the job for you.”
205. Agent-facing copy can be more structured, but public labels should avoid machine/admin epistemic tokens as human badges.
206. Orientation flags Astryx + Tailwind 4 and the rule that legacy bespoke CSS should shrink (`local://ae-orientation.md:18-23`, `local://ae-orientation.md:191-198`).
207. Bones audit calls the retired bespoke presentation system a liability while Astryx-era direction is only a scaffold until fully landed (`local://bones-audit.md:65-66`).
208. TENSION: the grand “domestic router” story must not leak into public skin until the 14-day test and deployed gates justify widening the promise.

---

## 8. EYES — market sensing

209. Eyes watch the landscape so AE integrates instead of colliding.
210. Protocol watch: ACP, AP2, UCP, MCP, x402, Web Bot Auth, schema.org, and `llms.txt` adoption.
211. Competitive registry watch: checkout.directory, UCP merchant manifests, OpenAI merchant feeds, Shopify agentic commerce, Google Business Profile/Gemini, Yelp/Thumbtack/Angi/hipages AI moves.
212. Agent-readiness crawling: measure which businesses publish `llms.txt`, structured data, MCP endpoints, capability manifests, or clear assistant policies.
213. Demand watch: AI referral traffic, local recommendation use, owner willingness to update, inquiry conversion, and provider response behavior.
214. Landscape research names the crowded layers: payments, consumer agents, platform-owned local/search, and bot access (`local://research-landscape.md:16-23`, `local://research-landscape.md:180-204`).
215. Landscape research names the white space: boundary-honest agent-readable trust registry, service/action receipts outside payments, wedge-agnostic profiles, and non-Google/non-marketplace agent discovery (`local://research-landscape.md:152-176`).
216. Demand research names the strongest signal: AI-assisted local discovery plus verification behavior, not autonomous checkout (`local://research-demand.md:143-151`).
217. Eyes should produce kill signals, not just dashboards.
218. Kill signal: assistants do not use AE after targeted distribution.
219. Kill signal: owners do not correct/update profiles after receiving sample inquiries.
220. Kill signal: qualified inquiry conversion is below threshold.
221. Kill signal: a platform standard absorbs AE's unique wedge faster than AE gets proprietary receipt volume.
222. TENSION: watching protocols can become procrastination; market sensing must feed the 14-day test and next adapter decisions.

---

## 9. BRAIN — routing intelligence

223. Brain maps intent to businesses using registry evidence.
224. It should not begin as a consumer destination brain.
225. It should begin as the routing intelligence that powers storefront agent responses, owner console explanations, and external assistant tools.
226. Inputs: user or agent intent, geography, service/capability constraints, business boundaries, source freshness, response history, and receipt-backed signals.
227. Outputs: ranked candidates, cited reasons, known limits, allowed next action, and refusal when no safe route exists.
228. The answer/thread surface bones are repurposed here.
229. `AeChat`, thread-first `/t/$threadId`, frozen evidence per turn, tool calls, and evals become a controlled route-explanation surface.
230. The answer orchestrator should continue using explicit read tools before prose (`local://ae-orientation.md:54-56`).
231. Brain must not auto-call `inquiry.submit` from public answer just because a user expresses intent.
232. Brain can propose a handoff and explain what the inquiry will and will not do.
233. Future routing intelligence can incorporate receipt-derived response rates and boundary compliance once enough volume exists.
234. Pre-volume routing must be humble: source-backed, deterministic enough to audit, and clear about uncertainty.
235. Marketplace roast warns that aggregators own demand and may reduce AE to a feed if AE lacks unique inventory or data (`local://roast-marketplace.md:136-164`, `local://roast-marketplace.md:475-479`).
236. Therefore brain's defensibility depends on the nervous system, not on ranking cleverness alone.
237. TENSION: if AE remains a feed, the brain may be less valuable than the profile/export layer; do not overbuild ranking before the 14-day gate.

---

## 10. HANDS — progressive action ladder

238. Hands do things, one rung at a time.
239. Rung 1 is today's intended action: qualified inquiry for owner review.
240. Literal first action item: fix the `allowWrites:false` dark path so a signed, admitted `inquiry.submit` can succeed through `/api/agent/tools` while refusal tests remain intact.
241. The fix must preserve boundary text: no booking, payment, dispatch, auto-fulfilment, or unapproved broad write.
242. Rung 1 receipt: inquiry request accepted, owner notified/queued, replay-safe idempotency, response status later attached.
243. Rung 2 future: quote request.
244. Rung 2 should remain owner-reviewed and not imply price lock, schedule lock, or payment unless evidence exists.
245. Rung 3 future: booking handoff.
246. Rung 3 should hand off to the business or provider system; AE should not claim it books unless a later implementation and proof exists.
247. Rung 4 horizon/speculative: scoped delegated transactions via ACP/AP2-style rails.
248. Rung 4 would require signed agent identity, explicit user authorization, owner/business acceptance, PSP rail, receipt binding, dispute posture, privacy review, and regulatory analysis.
249. Every rung admission-gated: distribution proof, owner pull, deployed proof, safety scan, outside-in agent audit, and receipt replay.
250. Every rung action-backed: no ad hoc route verbs.
251. Every rung receipt-backed: no invisible side effects.
252. Every rung should have a no-go rule if it risks becoming a fake marketplace.
253. Technical roast's severity-ranked P0 is the write path (`local://roast-technical.md:330-346`).
254. Demand research's trust counter-evidence says only 24% trust AI agents to complete purchases and 97% local-AI users sometimes double-check recommendations (`local://research-demand.md:107-118`).
255. Therefore the ladder starts with inquiry, not autonomous transaction.
256. TENSION: urgent trades may need faster response than owner-reviewed inquiry; if the wedge requires instant dispatch, AE should fail the wedge rather than quietly overclaim.

---

## 11. BOOTSTRAP SEQUENCE — cold-start play and 14-day gate

257. Step 1 — Freeze the strategy promise.
258. AE is supply-side infrastructure for agent-ready storefronts, not a consumer search destination.
259. Step 2 — Archive-cut the planning corpus.
260. Keep load-bearing ADRs/gates/contracts; move stale or superseded planning sprawl out of the active decision path.
261. This responds to the technical roast's `.planning` footprint and one-founder process drag warning (`local://roast-technical.md:17-38`, `local://roast-technical.md:180-193`).
262. Step 3 — Fix the dark write path for `inquiry.submit`.
263. Add a positive signed/admitted quiet-door write test and keep unsigned/refused tests.
264. Step 4 — Build the agent-ready storefront import prototype.
265. Inputs: website URL, owner confirmation, optional ABN/GBP owner-authorized facts, manual correction.
266. Outputs: hosted profile, `/llms.txt` fragment, structured data, boundary statement, source labels, qualified-inquiry affordance.
267. Step 5 — Pick one metro and 2–3 urgent local-service categories.
268. Use AU local services because hipages/Airtasker/Oneflare prove inquiry/connection economics, while incumbent lead-fee resentment is exploitable (`local://research-demand.md:71-92`, `local://research-demand.md:95-103`).
269. Step 6 — Publish 30–50 source-backed profiles.
270. Each profile must identify source, freshness, boundaries, and whether the owner has confirmed facts.
271. Step 7 — Recruit 10 providers manually.
272. Offer free profile correction/listing for 30 days.
273. Ask them to correct the page before any paid promise.
274. Step 8 — Send 100 targeted sessions.
275. Sessions can come from narrow paid search, local posts, direct outreach, partner links, or assistant-oriented prompts, but they must be attributable.
276. Step 9 — Measure pass/fail.
277. Consumer pass: at least 10 qualified inquiries from 100 targeted sessions.
278. Supplier pass: at least 5 providers voluntarily correct/maintain profile data or ask to be listed after seeing the inquiry format.
279. Trust pass: zero public or assistant flow implies booking, payment, dispatch, or auto-fulfilment.
280. Optional quality pass: at least 30% of users click a source/profile before inquiry, matching the demand dossier's verification premise (`local://research-demand.md:153-166`).
281. Step 10 — Go/no-go.
282. If all pass, continue platform build on the storefront + inquiry + receipts spine.
283. If consumer fails but supplier passes, pivot toward owner-side agent-readiness tooling or distribution partnerships.
284. If supplier fails but consumer passes, investigate concierge/onboarding or whether AE is just another lead-gen channel.
285. If both fail, stop horizontal platform build and consider B2B/software/docs registry or data-enrichment layer.
286. This 14-day gate is adopted from the demand dossier and is the first falsifiable test (`local://research-demand.md:11-12`, `local://research-demand.md:153-166`).

---

## 12. RISKS WE ACCEPT — and how the reframe answers them

287. Risk 1 — Cold-start deadlock.
288. Roast: businesses, agents, and users each wait for the others (`local://roast-marketplace.md:80-111`, `local://roast-marketplace.md:461-468`).
289. Reframe answer: single-player agent-ready storefront gives supply value before AE traffic.
290. Honest mitigation: only the 14-day gate proves whether that value is enough.
291. Risk 2 — Trust-layer paradox.
292. Roast: unverified data is commodity; verified data is labor-intensive (`local://roast-marketplace.md:114-133`, `local://roast-marketplace.md:469-473`).
293. Reframe answer: narrow trust to source/freshness/boundary/inquiry receipts first, not broad quality certification.
294. Honest mitigation: AE should not use unqualified trust badges.
295. Risk 3 — Aggregation inversion.
296. Roast: AE is supplier-side infrastructure while demand aggregators own users (`local://roast-marketplace.md:136-164`).
297. Reframe answer: accept supplier-side identity and distribute through MCP/catalogs/feeds rather than pretending to own consumer intent.
298. Honest mitigation: AE may remain a feed unless receipts and owner-maintained profiles become unique.
299. Risk 4 — Google/GBP local gravity.
300. Roast: Google controls Search, Maps, reviews, local pack, Business Profile, and Maps grounding (`local://roast-marketplace.md:167-188`).
301. Reframe answer: do not compete as local search; offer portable agent-readable boundary/evidence profiles that can complement owner web/GBP presence.
302. Honest mitigation: if Google adds comparable owner-side agent-readable trust receipts, AE's wedge narrows.
303. Risk 5 — Empty-switchboard router framing.
304. Roast: routers need traffic before anyone routes through them (`local://roast-marketplace.md:191-230`).
305. Reframe answer: call router a horizon outcome, not the bootstrap method.
306. Honest mitigation: the near-term product is storefront + inquiry, not default routing.
307. Risk 6 — Disintermediation/leakage.
308. Roast: successful inquiry teaches both sides to bypass AE (`local://roast-marketplace.md:234-257`).
309. Reframe answer: return value must come from better trust profile, response evidence, freshness, and future owner tools, not hidden contact details.
310. Honest mitigation: leakage is accepted unless receipts make repeat routing better.
311. Risk 7 — Data moat fantasy.
312. Roast: listings and schemas are formats; receipts need volume (`local://roast-marketplace.md:260-282`).
313. Reframe answer: name the receipt moat as a threshold bet, not a current asset.
314. Honest mitigation: no moat claim before proprietary interaction volume.
315. Risk 8 — Adverse selection.
316. Roast: low-quality businesses may be most eager to join (`local://roast-marketplace.md:286-308`).
317. Reframe answer: source-backed profiles, owner confirmation, freshness decay, and response receipts suppress fake liquidity.
318. Honest mitigation: early supply curation must be manual and narrow.
319. Risk 9 — Agent distribution is not web distribution.
320. Roast: machine-readable endpoints do not make agents call them (`local://roast-marketplace.md:312-324`).
321. Reframe answer: MCP/tool catalogs/feeds are distribution work, but the 14-day test must measure actual assistant/referral sessions.
322. Honest mitigation: `/llms.txt` alone is not a channel.
323. Risk 10 — Cross-category heterogeneity.
324. Roast: services, goods, software, and tech have different trust primitives (`local://roast-marketplace.md:328-345`).
325. Reframe answer: keep core primitives wedge-agnostic and push category-specific facts into extensions.
326. Honest mitigation: do not expand until one category has atomic liquidity.
327. Risk 11 — One-founder operational load.
328. Roast: stack, plans, integrations, and proof gates are too heavy before traction (`local://roast-investor.md:185-199`, `local://roast-technical.md:180-210`).
329. Reframe answer: shrink governance, fix one dark path, run one 14-day test, and postpone broad adapters.
330. Honest mitigation: if the test passes, operations still become the company.
331. Risk 12 — Payment/platform kill-zone.
332. Roast: OpenAI/Stripe, Google AP2, Shopify UCP, Visa, Mastercard, PayPal, and x402 can absorb transaction rails (`local://roast-investor.md:100-127`; `local://research-landscape.md:180-198`).
333. Reframe answer: integrate rails and own boundary/evidence/receipt semantics around business interaction.
334. Honest mitigation: if rails also own portable business trust profiles, AE must move to a narrower vertical or partner posture.

---

## 13. HORIZON — blue sky, explicitly speculative/not implemented

335. Horizon A — Multi-vertical domestic router.
336. Speculative future: AE could become the domestic registry that lets agents discover and safely contact businesses across services, goods, software, and tech.
337. Not implemented today: AE does not yet have cross-category liquidity, multi-vertical trust systems, or default assistant distribution.
338. Admission gate: one wedge reaches atomic liquidity and receipt volume improves routing.
339. Horizon B — Cross-registry federation.
340. Speculative future: AE could federate with UCP merchants, checkout directories, GBP-like owner profiles, vertical marketplaces, and software catalogs.
341. Not implemented today: AE does not yet provide federation, merchant-origin UCP authority, or cross-registry trust normalization.
342. Admission gate: a partner or protocol needs AE's boundary/receipt profile rather than generic listing data.
343. Horizon C — Agent-to-agent commerce.
344. Speculative future: AE could let authorized agents negotiate scoped business actions with other agents or business systems.
345. Not implemented today: AE does not yet approve autonomous transactions, broad actions, payments, or dispatch.
346. Admission gate: signed agents, user mandates, owner checkpoints, PSP rails, receipts, privacy, and dispute posture all pass external review.
347. Horizon D — Receipt-backed reputation graph.
348. Speculative future: interaction receipts could become a portable trust profile that improves routing more than reviews alone.
349. Not implemented today: receipt volume is not proven and deployed action proof is incomplete.
350. Admission gate: receipts predict owner responsiveness or user outcomes better than commodity sources in a live wedge.
351. Horizon E — Paid agent-access surfaces.
352. Speculative future: some businesses could expose paid APIs, premium data, or receipted operations using x402/Cloudflare-style rails underneath.
353. Not implemented today: AE does not own payment custody, paid access, or money movement.
354. Admission gate: existing PSP/access rails can be integrated without AE becoming settlement infrastructure.
355. TENSION: horizon language is useful for architecture but dangerous for product focus; none of these should preempt the 14-day storefront/inquiry proof.

---

## 14. NEXT 5 CONCRETE MOVES

356. Move 1 — Fix the `allowWrites:false` quiet-door path for `inquiry.submit`.
357. Add a positive signed/admitted integration test that returns an inquiry-submitted or replayed result.
358. Keep refusal tests for unsigned, disallowed, malformed, and non-admitted writes.
359. Keep public answer from auto-submitting inquiries.
360. Move 2 — Create the 14-day test scaffold.
361. Add a small internal plan or issue under the active planning system with metrics: 30–50 profiles, 10 recruited providers, 100 targeted sessions, pass thresholds, and no-overclaim scan gate.
362. Do not build further platform rungs before this gate has evidence.
363. Move 3 — Prototype agent-ready storefront import.
364. One route or owner-console flow should import a website URL into a draft source-labeled profile, then require owner confirmation before publication.
365. Output should include hosted profile, agent fragment, structured data preview, and boundary statement.
366. Move 4 — Archive-cut planning corpus.
367. Keep current authority docs, ADRs, copy/trust gates, codebase maps, and phase state; archive superseded local-only strategy sprawl so active planning does not obscure shipped facts.
368. Move 5 — Generalize agent-experience audit as a release gate.
369. Add scenarios for agent-ready storefront discovery, signed inquiry submission after Move 1, boundary refusal, and profile freshness/correction.
370. Require a deployed run before any public GTM claim.

---

## 15. Section crosswalk to concrete systems

371. BONES map to `PRODUCT.md`, `AGENTS.md`, tests/copy, `src/modules/common/action.ts`, `src/modules/actions/index.ts`, registry APIs, discovery routes, Convex modules, answer/thread, harness, inquiries, and `examples/agent-experience`.
372. MEAT maps to future owner profile import, catalog/business source rows, public business pages, and profile projection builders.
373. FASCIA maps to `/llms.txt`, feeds, structured data, MCP server/adapters, owner-authorized GBP/ABN import, Web Bot Auth verification, and protocol compatibility watchers.
374. NERVOUS SYSTEM maps to harness run evidence, answer tool calls, inquiry audit/funnel rows, source-state reconstruction, action receipts, and future receipt projections.
375. VASCULAR SYSTEM maps to future pricing plans, billing/readback, PSP integrations, and clear no-custody rules.
376. PROPRIOCEPTION maps to agent-experience audits, copy/SEO scans, freshness decay, boundary-overreach detection, and deployment proof gates.
377. SKIN maps to owner console, public pages, registry pages, Astryx components, and boundary-honest UI copy.
378. EYES maps to external research updates, protocol watch, competitive watch, adoption crawling, and demand-test metrics.
379. BRAIN maps to answer/thread routing, registry matching, ranking explanations, and evidence-cited recommendations.
380. HANDS map to `inquiry.submit` first, then future quote request, booking handoff, and speculative delegated transactions only after admission gates.

---

## 16. Evidence index

381. Current-state orientation: `local://ae-orientation.md:3-15`, `local://ae-orientation.md:44-56`, `local://ae-orientation.md:167-178`.
382. Bones audit: `local://bones-audit.md:78-100`.
383. Technical roast: `local://roast-technical.md:7-10`, `local://roast-technical.md:95-110`, `local://roast-technical.md:330-350`.
384. Marketplace roast: `local://roast-marketplace.md:30-46`, `local://roast-marketplace.md:80-111`, `local://roast-marketplace.md:260-282`, `local://roast-marketplace.md:525-538`.
385. Investor roast: `local://roast-investor.md:8-15`, `local://roast-investor.md:65-80`, `local://roast-investor.md:130-145`, `local://roast-investor.md:377-388`.
386. Demand dossier: `local://research-demand.md:5-12`, `local://research-demand.md:17-34`, `local://research-demand.md:45-68`, `local://research-demand.md:71-103`, `local://research-demand.md:153-166`.
387. Landscape report: `local://research-landscape.md:16-23`, `local://research-landscape.md:26-102`, `local://research-landscape.md:152-176`, `local://research-landscape.md:180-214`.
388. OpenAI ACP / Instant Checkout: https://openai.com/index/buy-it-in-chatgpt/.
389. Stripe ACP news: https://stripe.com/newsroom/news/stripe-openai-instant-checkout.
390. Google AP2: https://cloud.google.com/blog/products/ai-machine-learning/announcing-agents-to-payments-ap2-protocol.
391. Google Search local agents: https://blog.google/products-and-platforms/products/search/search-io-2026/.
392. Cloudflare Web Bot Auth: https://blog.cloudflare.com/web-bot-auth/.
393. Cloudflare Monetization Gateway: https://blog.cloudflare.com/monetization-gateway/.
394. Coinbase x402: https://www.coinbase.com/en-au/developer-platform/discover/launches/x402.
395. MCP specification: https://modelcontextprotocol.io/specification/2025-11-25.
396. llms.txt specification: https://llmstxt.org/.
397. Casey Burridge llms.txt adoption: https://caseyrb.com/blog/state-of-llms-txt-adoption/.
398. schema.org Action: https://schema.org/Action.
399. UCP: https://ucp.dev/.
400. checkout.directory: https://github.com/nekuda-ai/checkout-directory.
401. hipages FY25 results: https://announcements.asx.com.au/asxpdf/20250822/pdf/06n5s3y9lqpx9j.pdf.
402. Airtasker FY25 report: https://announcements.asx.com.au/asxpdf/20250828/pdf/06nhm6dp7f5rfz.pdf.
403. CHOICE find-a-tradie comparison: https://www.choice.com.au/home-improvement/building-and-renovating/design-and-trades/articles/find-a-tradie-websites.
404. BrightLocal Local Consumer Review Survey: https://www.brightlocal.com/research/local-consumer-review-survey/.
405. Adobe AI shopping traffic: https://business.adobe.com/blog/generative-ai-powered-shopping-rises-with-traffic-to-retail-sites.
406. Adobe AI traffic by industry: https://business.adobe.com/blog/ai-driven-traffic-surges-across-industries.
407. Bain trust in agentic commerce: https://www.bain.com/insights/agentic-ai-commerce-hinges-on-consumer-trust/.
408. Forrester AI agent purchase trust report: https://www.forrester.com/report/many-us-consumers-believe-in-agentic-commerce-but-few-trust-it-to-make-purchases/RES188737.
409. ProductReview hipages: https://www.productreview.com.au/listings/home-improvement-pages.
410. ProductReview Airtasker: https://www.productreview.com.au/listings/airtasker.
411. ProductReview ServiceSeeking: https://www.productreview.com.au/listings/serviceseeking-com-au.

---

## 17. Ownership conclusion

412. AE should own the supply-side agent-readiness layer first.
413. It should make businesses agent-legible, boundary-explicit, safely contactable, and eventually receipt-backed.
414. It should not fight Google or ChatGPT for consumer search.
415. It should not fight Stripe, Visa, Mastercard, ACP, AP2, or x402 for payment rails.
416. It should not fight Cloudflare for bot identity/access infrastructure.
417. It should integrate those layers when useful and own the business trust profile above them.
418. The first proof is not a grand platform launch.
419. The first proof is 30–50 source-backed profiles, 10 recruited providers, 100 targeted sessions, at least 10 qualified inquiries, at least 5 voluntary provider updates/listings, and zero boundary overclaim.
420. If that fails, the platform anatomy must be revised before more organs are added.
421. If that passes, the next system to deepen is not payments or autonomous action.
422. It is the storefront → inquiry → receipt → owner response → profile freshness loop.
423. That loop is the smallest organism that can breathe.
424. Everything else is horizon until the loop breathes.
