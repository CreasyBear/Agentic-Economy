---
title: Niche-Marketplace Rebaseline ("mirror agentic.market, substitute niche")
analysis_date: 2026-08-05
status: decision-support / diagnostic
scope: Classify every `src/modules/*` + `convex/*` seam into PORT / KEEP / CUT, plus the delta to become a Bazaar-compatible niche marketplace.
---

# Agentic-Economy: Niche-Marketplace Rebaseline

## Thesis (supported by this map)

The instinct "mirror and clone agentic.market, then build smarts on top" is the correct
**reprioritization**, once the word "clone" is corrected:

- **agentic.market (Coinbase) is not literal-cloneable** — no public marketplace repo. What is portable
  is the **open stack under it**: `coinbase/x402` (MIT, already installed as `@x402/*` 2.18.0), the
  **CDP Bazaar** discovery index, and open marketplace reference implementations (`x402-bazaar`,
  `opsspawn/a2a-x402-gateway` + `@anthropic/x402-server`).
- **agentic.market's buyer is an AGENT** via `SKILL.md` + x402 client. It has **no NL→selection engine**;
  that is delegated to the buyer's own agent framework. → The engine is exactly the layer with **no
  reference to clone**. You cannot mirror a layer the reference does not have.
- Therefore: **"clone" = PORT the standard supply/protocol rail**; **"smarts on top" = the engine +
  niche buyer workflow you already built and keep**. This flips the current priority inversion (bespoke
  admission + bespoke engine gate got the most effort; the standard rail underneath was hand-rolled).

## Legend

- **PORT** — replace hand-rolled seam with the open x402/Bazaar standard + reference implementation, or expose through it. This is the "clone."
- **KEEP** — differentiator / the "smarts on top" / cross-cutting substrate AE must own. Keep, possibly simplify inside.
- **CUT** — general-everything-marketplace weight made obsolete by the agent-buyer model or by re-scoping to a niche. Remove or reduce to a thin shim.
- **\[niche\]** — classification flips on the chosen niche. Working assumption here: **C&I BESS / solar + energy-vendor procurement** (per project BESS/vendor skills). Verify before cutting.

---

## Timeline of ownership problem (what went wrong)

The architecture is **not** wrong in shape — bounded contexts + Convex-as-truth + deterministic kernel is sound.
What went wrong is **effort allocation and scope**:

1. **Reinvented the supply rail** — hand-rolled admission normalizer (`internal/admit-provider-schema.ts`),
   bespoke x402 payment signer, bespoke `moneyLedger` candidate — where the open standard exists.
2. **Over-invested in a bespoke engine heuristic** for a *general* catalog (exact-one-identity discriminator
   gate, hand-rolled endpoint-resolution) — instead of the AI-SDK `activeTools`/tool-calling pattern, scoped to a niche op set.
3. **Drifted to a general everything-marketplace** (generic web catalog, storefront enrichment, SEO pages,
   general web-search answer threads) — the category agentic.market already owns and AE cannot out-build.

---

## Bucket map

### 1. PORT — the standard supply/protocol rail (this is the real "clone")

| Seam | Current source | Action | Rationale |
|---|---|---|---|
| Capability admission / manifest | `capability-supply/internal/admit-provider-schema.ts`, `publication-importers.ts` | Adopt x402/Bazaar **manifest** normalization as the canonical listing shape; keep AE normalizer only for AE-specific bits (credential strip, output-evidence) on top | Bazaar manifests are the standard; hand-rolled `$ref`/combinator walker reinvents dereference |
| Route transport (HTTP/x402/MCP) | `capability-supply/route-transport-runtime.ts` (±2k lines), `x402-payment-signer.ts` | Port `@anthropic/x402-server` / `a2a-x402-gateway` seam for paid endpoints; `npx x402-bazaar init` MCP | Payment-becomes-credential is the protocol; AE keeps release/output-validation/evidence on top |
| Money / payment / ledger | `modules/money/*`, `convex/moneyLedger.ts` (44KB candidate) | Replace bespoke ledger candidate with **facilitator settlement readback** + AE bring-your-own-wallet for the niche; x402 payment is the credential (no accounts/keys/subscriptions) | Per-request USDC settlement is agentic.market's model |
| Discovery index | `convex/discovery.ts`, `modules/discovery/*` (UCP/llms.txt/SKILL.md/sitemap), `seo/*` | **Bazaar is the discovery index.** Keep `SKILL.md` + `llms.txt` generator (agent entry point); register ops in Bazaar; drop/denoise sitemap/SEO docs | Agents discover via the machine catalog, not web pages |
| External supply ingestion | `imported-commitment/*`, Cluster C observed listings in `curated-cluster-c-publications.ts` | Replace hand-collected observed listings with **live Bazaar pull** (`GET /v2/x402/discovery/resources`) | No hand-maintained listing blobs |
| Curated listings (host side) | `curated-cluster-{a,b,c}-publications.ts`, `curated-provider-publications.ts`, `curatedProviders.ts` | Keep as **AE-niche supply**, but publish each as an x402 manifest in the Bazaar (minor-unit USD prices) | Niche catalog becomes a Bazaar-visible host |
| Contract / manifest shape | `capability-contract/public.ts`, `capability-contract-registry/*` | Adopt x402/Bazaar manifest representation; **retain** AE strict zod validation + digest as a layer | Manifest = standard wire; validation = AE |

### 2. KEEP — the smarts on top (differentiator + substrate)

| Seam | Current source | Action | Rationale |
|---|---|---|---|
| NL → capability selection engine | `customer-request/application/interpret-compile/*` (discover, interpreter, deterministic-interpreter, capability-domain, preview, compile) | **Keep + simplify**: collapse onto AI-SDK `activeTools`/tool-calling surface; make `inputExamples` actually reach the model; drop the bespoke discriminator gate; keep honesty floor | This is the differentiator with no reference — the "smarts." Founder reframe: demonstrate effective tool calling |
| Compiler / route planning / projections | `customer-request/compiler.ts`, `semantic-interpreter.ts`, `route-plan-customer-projection.ts`, `customer-projection.ts` | Keep (simplify) | `proposal_only` compile + customer-safe projection is the product |
| Durable execution substrate | `convex/customerRequestV2*.ts`, `customerRequestRouteExecution*.ts`, `customerRequestRouteMandate*.ts`, `route-execution/machines/*` | Keep | Lets a buyer actually receive a paid capability run with recovery/evidence |
| Operation registry + search | `registry/*` + `operations.actions.ts`, `convex/registry.ts`, `capabilitySupplyOperations.ts`, `operation-projection.ts` | Keep; narrow to niche op surface; wrap Bazaar reads | Feeds the engine discovery surface (`registry.operations.search`) |
| [niche] Project/Procurement loop | `work-tree/*` (project loop, inbox, approval, repeat) | **Keep if niche is procurement/project-buying** (e.g. BESS project loop); else CUT | Differentiator for a project-driven niche buyer, not generic-chat weight |
| [niche] RFx / study | `study/*` (RFx, TOPSIS pipeline), `external-run/*` | **Keep if niche does vendor RFQ scoring**; else CUT | Deterministic RFx scoring is a procurement niche differentiator |
| [niche] Inquiry / vendor comms | `inquiries/*`, `notification-outbox/*` | Keep if niche needs structured vendor inquiry + signed notices; else CUT | Bounded inquiry is niche-relevant, not general-marketplace weight |
| Governance substrate | `common/*`, `actions/index.ts`, `security/*`, `network-guard/*`, `authz.ts`, `observability/*` severity/auth, `model-gateway/*` | Keep | Cross-cutting authority/guard/login — keep, never trim |
| Durable invocation/evidence | `action-invocation/durable.ts`, `harness/run-loop.ts` (invocation/evidence part only) | Keep for paid-run evidence; the **answer-harness wrapper is CUT** (below) | Evidence/replay for executed routes is needed; the chat answer harness is not |

### 3. CUT — general-marketplace weight (agentic.market's buyer-side job, or scope drift)

| Seam | Current source | Why cut |
|---|---|---|
| General web-search answer thread | `answer/*` (answer-tool-use-agent, prompts, gates, UI stream), `answer-thread/*` (turn-orchestrator, retrieval-first, follow-up chips) | AE being a general Q&A agent = the buyer's own agent's job in the Bazaar model. Not needed for a niche marketplace with agent (or direct-request) buyers |
| Answer harness wrapper | `harness/run-loop.ts` answer phases, `harnessSessions.ts` | Only the durable invocation/evidence piece is needed; the answer-phase journal machinery is weight |
| Storefront / enrichment | `storefront/*` (business-enrichment, discovery), `storefront.actions.ts` | Generic web-looking business catalog pages — the everything-marketplace category. Cut unless a niche human-facing catalog is required |
| Generic web catalog / SEO | `catalog/*` web projection, `seo/*`, `discovery` sitemap/well-known pages | Agents consume the machine catalog (Bazaar + `SKILL.md`), not SEO pages |
| Speculative demand layer | `demand/*` | No demonstrated niche buyer; weight |
| [niche] General answer/chat | chat components (`src/components/ae/chat/*`) | If buyer is an agent, the human chat UI is weight (keep only a minimal human-request shim if the niche has direct web buyers) |

---

## Delta — "become a Bazaar-compatible niche marketplace" (concrete, against current code)

1. **Freeze the niche** (the load-bearing input — every `[niche]` row resolves from this).
2. **Manifest rail:** emit an x402/HTTP-402 manifest per curated + admitted op (OpenAPI → manifest),
   prices in USD minor units; keep AE strict zod validation as a layer.
3. **Paid-endpoint seam:** replace hand-rolled x402/`route-transport-runtime` with the ported reference
   (`@anthropic/x402-server` / `a2a-x402-gateway`); AE keeps authority, release, output validation, evidence.
4. **Bazaar host:** register AE ops with the CDP facilitator (`/v2/x402/discovery/resources`).
5. **Bazaar reader:** pull Bazaar listings live via `imported-commitment`/`observe-current`; retire
   hand-maintained Cluster C blobs.
6. **Agent entry:** ship `SKILL.md` (agentic.market pattern) so any agent consumes the niche catalog +
   x402 — the replacement for AE's answer-thread.
7. **Money:** x402 payment = the credential; swap bespoke `moneyLedger` candidate for facilitator
   settlement readback + niche wallet.
8. **Engine (smarts):** simplify `interpret-compile` to the AI-SDK tool-calling surface, scope to the
   niche op set, and make `inputExamples` reach the model. Keep the 62/62 honesty floor.
9. **Niche-substitute catalog:** cut generic storefront/SEO/web-catalog weight; keep work-tree/study/inquiry
   only where the niche buyer is a project/RFQ-driven human.

---

## Open decisions / risks

- **Niche is the deciding variable.** Assuming C&I BESS / solar + energy-vendor procurement. If the real
  niche differs, re-bucket `work-tree`, `study`, `inquiries`, `answer-thread`.
- **Rewrite trap:** "PORT" is a seatbelt-swap on the supply/protocol seam, **not** a ground-up rebuild.
  Keep the bounded-context monolith and the engine. Do not tear down working code for the port (lean #3).
- **Keyed ops conflict with the no-accounts model:** curated Cluster B uses `env:*` shared keys
  (OpenWeather/Tavily/SerpAPI/CoinGecko-demo). Under x402, keyed ops should move behind the payment
  credential or a managed-credential bridge — explicit decision, not accidental.
- **The engine is the real risk, not the port.** The port is well-trodden (open standard, reference impls).
  The engine has no reference and is the current pain; budget accordingly.

## Recommended sequencing

1. **Phase 0 — freeze the niche.**
2. **Phase 1 — PORT:** manifest rail, paid-endpoint seam, money→settlement, Bazaar register+read, `SKILL.md`. (Low risk, well-trodden.)
3. **Phase 2 — niche-substitute catalog:** cut generic storefront/SEO/web-catalog; keep `[niche]` workflow modules. (Medium risk, deletes code.)
4. **Phase 3 — engine smarts on top, narrow:** AI-SDK tool-calling surface, `inputExamples` reach the model, scope to niche ops. (Highest risk — the current pain; do architecture→review→engineer.)
5. **Phase 4 — answer-thread/harness cut decision** once the niche buyer model is fixed.

---

*Decision-support artifact. 2026-08-05. Authority remains live source + AGENTS.md; this map is a business/architecture rebaseline hypothesis, not a change in code.*
