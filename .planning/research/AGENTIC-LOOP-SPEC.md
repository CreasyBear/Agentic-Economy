# Agentic Loop SPEC

**Status:** decisions locked via Wayfinder [#37](https://github.com/CreasyBear/Agentic-Economy/issues/37) (2026-07-09)  
**Method:** inversion premortem → tickets #38–#48  
**Identity:** AE is agentic infrastructure for domestic businesses — not a lead marketplace, not a payable-HTTP API catalog.

## 1. Unit of done

**Agentic loop (fail-closed):**

Someone opens **Claude Cowork**, finds **Agentic Economy**, hits the **router**, is directed to an AE **endpoint** whose target is a real **business**, completes an **admitted act**, and holds a **receipt** plus a **delivery/recovery log** on a **deployed** surface.

| Required | Forbidden as “done” |
| --- | --- |
| Cold start (no founder-pasted tool URLs) | Local-only green |
| Router + registry hop | `/llms.txt` alone as the product |
| AE endpoint → concrete business | Off-AE redirect as completion |
| Signed + admitted write (today: `inquiry.submit`) | Listed-but-refused write |
| Receipt + delivery/recovery log | Owner reply rate as DoD |
| Deployed outside-in proof | Seed-catalog theater |

**Journeys**

- **A — Agent:** Cowork → router/registry → endpoint → business → admitted act → receipt + log  
- **B — Business:** real published listing; agent-origin/admission on record; deployed delivery + recovery loops; inbox is support not hero  
- **C — Household:** assistant returns next state (business, what was sent, receipt/id, honest boundary); no AE consumer-site requirement  

Glossary: [`CONTEXT.md`](../../CONTEXT.md)

## 2. Anti-lead-gen freeze

Canonical: [`.planning/research/anti-lead-gen-freeze.md`](./anti-lead-gen-freeze.md)

- North star metrics: Cowork→loop rate; admitted-act+receipt; delivery/recovery; outside-in audit  
- Telemetry only: owner reply, upset-if-gone, CPL/leads  
- Ban lead-channel copy; keep “qualified inquiry”; “no lead fees” only as anti-incumbent contrast  
- No phase exit that is “owners reply more” or “marketplace launch” before deployed loops  

## 3. Rails posture (ride vs own)

Canonical: [`.planning/research/agentic-rails.md`](./agentic-rails.md)

| | |
| --- | --- |
| **First future adapter** | Stripe MPP (ride-only; merchant Stripe balance; money-rail decision before live) |
| **Ride-later** | Cloudflare Monetization Gateway (edge x402) |
| **Watch** | Standalone `@x402` runtime — import ban stays |
| **Never-own** | Wallet/custody/settlement/Connect; bot-payment edge; consumer front door; AM payable-HTTP inventory |

No public MPP/x402/CF claims without adapter + decision + outside-in pay→resource→receipt proof.

## 4. Progressive hands

| Rung | Checkpoint | Machine pay |
| --- | --- | --- |
| 1 Inquiry | Owner reviews message | No (not a paid lead) |
| 2 Quote | Owner confirms | Optional later; never pay-to-see-contact |
| 3 Booking handoff | Business/system confirms | Business’s rail; AE records handoff |
| 4 Delegated txn | User + business acceptance | Ride Stripe MPP when admitted |

Do not widen hands while Cowork→inquiry loop is red. Erasing checkpoints on rungs 1–3 = STOP.

## 5. Receipt + log

**Receipt:** receiptId, actId, businessId/slug, profileVersion/source hash, boundary snapshot, admission refs, inputHash, occurredAt; optional rail payment binding later.

**Delivery/recovery log:** enqueue → attempt → provider ref or held/failed → retry/no-repair.

Pre-volume: call this **proof**, not moat. Privacy: hash/tombstone raw bodies.

## 6. Business value (agent-native)

Owner gets: agent-ready storefront; registry presence; agent-origin events; receipt/log; progressive hands without lead fees; embeddable agent fragments.  
Does not get: lead auction, pay-per-lead, fake AE booking/payment.

## 7. Discovery parity (shape steal)

Have: list/search/detail JSON, human pages, llms crumb, sitemap/robots, quiet tool door, UCP.  
Build next: public **SKILL** (or Cowork-equivalent), llms hop recipe, write-wall recovery teaching.  
Reject: payable endpoint catalog, price/network fields as inventory.

Canonical: [`.planning/research/discovery-parity-agentic-market.md`](./discovery-parity-agentic-market.md)

## 8. Module depth

Extract **Quiet Agent Door** (`src/modules/harness/agent-door.ts` preferred); thin `api.agent.tools` route; unify write-scope single source; compose delivery/recovery into loop falsifier.

Canonical: [`.planning/research/agent-door-module-depth.md`](./agent-door-module-depth.md)

## 9. Engineering order (boil the lake)

1. Quiet Agent Door extract + write-scope unify — **PARTIAL**: `harness/agent-door.ts` + `agent-tool-write-scope.ts` + thin route exist; `invokeQuietAgentTool` has **no** unit seam tests; clearance imports harness (dependency direction open).
2. Public `/SKILL.md` + llms hop clarity — **SHIPPED locally** (copy/seo green). Still kill-rule 8 risk until deployed loop is green.
3. Loop falsifier: receipt + delivery/recovery — **LOCAL FAIL-CLOSED DONE (path C)**: `evaluateAgenticLoopProof` requires act receipt + authority stamp + `dispatch_readback` (`NotificationDispatchStatus` via `readNotificationDispatchReadback`). Audit cannot pass on stamp alone; `InquiryNotificationStatus` is not delivery proof. Tickets #50–#53 closed. **Deployed DoD still red** (#5 / #36).
4. Deployed env + outside-in (#5 / #36) — DoD stays red until this  
5. Then: richer router / hosted agents / A2A / MPP spike behind flags  

## 10. Kill-rules (premortem)

1. Lead-gen north star → STOP  
2. Door without completable admitted act + receipt + log on deployed → STOP  
3. Rail cosplay (claim without adapter/decision/proof) → STOP  
4. Own settlement / bot edge / consumer front door → STOP  
5. Clone AM HTTP inventory → STOP  
6. Trust theater (verified/book/charge without proof) → STOP  
7. Receipt moat marketing pre-volume → STOP  
8. Distribution chrome before completable loop → STOP  
9. Erase human checkpoint on rungs 1–3 → STOP  
10. Rung/action sprawl while Cowork loop unproven → STOP  

## 11. Fog (trajectory — not this SPEC’s exit)

Named router beyond quiet door; hosted agents; A2A; first paid SKU; MCP catalog packaging; receipt-moat volume threshold.

## 12. Repo contract

- `CONTEXT.md` — glossary  
- `CLAUDE.md` — Agentic loop contract  
- This SPEC + research dossiers under `.planning/research/`  
- Map index: GitHub #37  

Public copy still obeys `ae-public-copy-guardrails` (banned internal vocab on public surfaces).
