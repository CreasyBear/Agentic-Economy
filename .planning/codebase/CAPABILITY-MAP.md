# Capability Map — what you actually built

**Mapped:** 2026-08-16  
**Bound to revision:** `baseline/pre-atomic-market-reset` (`main` @ `9d7aaef6`)  
**Evidence class:** source + product-frontier manifest + founder category authority  
**Companions:** `PROJECT.md`, `VISION-conceptual-map.md`, `product-frontier-baseline/`, existing `ARCHITECTURE.md` / `STRUCTURE.md`  
**Successor plan:** [`../reset/OPERATING-MODEL.md`](../reset/OPERATING-MODEL.md) — this map is the input; the reset acts on it. Layer 0 stays, Layer 3 orchestration is quarantined.

Use this when the tree feels larger than the product. It separates **category core** from **adapters**, **proving ground**, and **parked/historical**.

---

## One sentence

AE is a **market and controlled transaction layer** for admitted third-party Market Operations. Most of the repo is either that kernel, a **distribution adapter** into it (HTTP / MCP / CLI), a **first-party demand proving ground** (Answer, Customer Request, WorkTree/Study), or **owner tooling** (claim, supply console).

```text
Supplier hosts Operation
        ↓ admit / publish / ready
Market Operation (discoverable contract)
        ↓ search · detail · compare · inspect-plan
Consuming Agent (CLI · MCP · Answer · third-party runtime)
        ↓ execute (keyless read)  OR  invoke (auth + money + evidence)
Evidence · recovery · (Qualified Use → settle → payout)   ← last mile PARTIAL
```

---

## Layer 0 — Category core (load-bearing)

If these break, you do not have a market.

| Capability | Module(s) | What it is | Status |
| --- | --- | --- | --- |
| Capability contract | `capability-contract` | Typed schemas, effects, evidence rules | **CORE** |
| Supply admission | `capability-supply` | Import → publish → bind → eligibility → readiness | **CORE** |
| Operation projection | `capability-supply` + `registry` | Search / detail / compare / inspect-plan | **CORE** |
| Durable invoke | `capability-execution` + `action-invocation` | `operation.invoke` + status / cancel / reconcile | **CORE** |
| Money ledger | `money` | Exact charges, budgets, external x402 spend | **CORE** (payout spine **PARTIAL**) |
| Agent access | `agent-access` | Bearer keys, scopes, OAuth device flow | **BUILT** |
| Network guard | `network-guard` | SSRF-safe outbound | **CORE** |
| Action registry | `actions` + `common/action` | One action plane for HTTP/MCP/CLI/Answer | **CORE** |
| Harness + model gateway | `harness`, `model-gateway` | Bounded tool loops; OpenRouter seam | **CORE** (platform plumbing) |

### Canonical machine contracts

| Kind | Action | Surface |
| --- | --- | --- |
| Discover | `registry.operations.search` | `POST /api/v1/market-operations/search` |
| Detail | `registry.operations.detail` | `POST /api/v1/market-operations/detail` |
| Compare | `registry.operations.compare` | `POST /api/v1/market-operations/compare` |
| Plan | `registry.operations.inspectPlan` | `POST /api/v1/market-operations/inspect-plan` |
| Keyless read | `operation.execute` | **MCP + Answer only** (no HTTP route) |
| Paid/auth invoke | `operation.invoke` | `POST /api/v1/operations/call` |
| Lifecycle | `operation.status` / `cancel` / `reconcile` | `/api/v1/operations/:invocationRef…` |

**Trap:** `/api/v1/operations/execute` is a 410 tombstone for the old **`operation.invoke`** path, not keyless `operation.execute`. Use `/call`.

### Core gaps (real, not “more features”)

1. **Qualified Use receipt** — specified in ADR-034; no table/writer yet  
2. **Daily supplier settlement / payout runner** — policy decided; source open  
3. **Live-money + hosted x402 certification** — fail-closed until proven  
4. **Business ↔ capability wiring** — listings often lack `origin.catalog_offering`

---

## Layer 1 — Distribution adapters (how agents find you)

These are not the product category; they are how Consuming Agents reach the core.

| Surface | Path | Job |
| --- | --- | --- |
| Market CLI | `tools/ae/` (`search`, `inspect`, `compare`, `invoke`…) | Cold-path agent terminal |
| MCP host | `src/lib/server/mcp-api.ts`, `/mcp` | Tool surface over the same actions |
| For-agents | `src/routes/for-agents.tsx` | Install / OAuth / invoke docs |
| Discovery files | `/.well-known/ucp`, `/llms.txt`, `/SKILL.md`, `/sitemap.xml` | Agent/crawler handshake |
| Operation page | `/operations/$operationRef` | Human-readable contract page |
| Catalog HTTP | `/api/businesses/*`, `/api/v1/services/*` | Legacy business/service projection |
| Shared threads | `/s/$shareToken` | Read-only Answer share |

---

## Layer 2 — First-party demand proving ground

Charter: subordinate to the market. Proves trust, UX, and that the kernel works under a Principal’s agent. **Do not confuse with the category.**

| Surface | Module(s) | Job | Maturity |
| --- | --- | --- | --- |
| **Answer** | `answer`, `answer-thread`, `/api/answer/turn`, AeChat | NL → search → optional keyless/invoke → cited turn | Strong locally; hosted Tier C blocked |
| **Customer Request** | `customer-request`, `/api/v1/requests/*` | Outcome → plan → mandate → execute → evidence | Spine **kept**; UI/env-gated smokes |
| **WorkTree + Study** | `work-tree`, `study` | Durable project tree + structured compare/recommend | Protected frontier primitives |
| **Inquiry / Customer Record** | `inquiries` | Listing → governed send → reply proof | Discovery rail, not paid invoke |
| `ae demand ask` | CLI | Answer over the same turn API | Local-green |

### Do not confuse

| This | Is not |
| --- | --- |
| Customer Request | The platform category (third-party agents skip this UI) |
| Customer Record | Customer Request (comms proof vs execution mandate) |
| Study | Answer thread (structured RFX vs open ask) |
| WorkTree weekly memo | notification-outbox (memo is parked; outbox is core) |
| BAS / trades / “local services” strings | Category or ICP (historical / smoke labels) |

---

## Layer 3 — Owner / supplier tooling

| Surface | Path | Job |
| --- | --- | --- |
| Claim | `/claim*` | Import / enrich / claim a business |
| Owner supply | `/owner/supply*` | Publish offerings, connections, earnings |
| Agent-access console | `/agent-access` | Issue keys, credits, approvals |
| Invocation recovery UI | `/operations/invocations/$ref` | Human status / cancel / reconcile |
| Storefront enrich/import | `storefront` + CLI | Onboarding drafts |
| Admin runs | `/admin/runs*` | Harness / turn inspection |

---

## Layer 4 — Parked / historical / retired

| Item | Disposition | Why |
| --- | --- | --- |
| WorkTree weekly memo | **Park** | No production scheduler |
| `project-spine` | **Park** → soft-retire | Successor = WorkTree |
| `routing-kernel` v1 history | **Retire later** | Deferred until hosted proof + export |
| `provider-integrations/shipping` | **Retired** 2026-08-15 | Use generic supply + invoke |
| Qualified Use / payout runner | **Specified, not built** | ADR-034 |
| BAS/trades as default frame | **Superseded** | Category is agent services market |

---

## Module directory cheat-sheet (`src/modules/`)

### Touch these for market work
`capability-contract`, `capability-supply`, `capability-execution`, `action-invocation`, `money`, `agent-access`, `registry`, `network-guard`, `actions`, `common`, `harness`, `model-gateway`

### Touch these for demand proving ground
`answer`, `answer-thread`, `customer-request`, `work-tree`, `study`, `inquiries`, `demand`

### Touch these for distribution / SEO
`discovery`, `seo`, `catalog`, `business`

### Touch these for owner / ops
`storefront`, `settings`, `observability`, `notification-outbox`, `governed-action`, `security`

### Treat as special / bounded
`dev`, `sandbox-supply`, `external-run`, `imported-commitment`, `business-tools`, `capability-contract-registry`, `project-spine`, `routing-kernel`

---

## What “done enough” looks like right now

**You have built (source-proven):**

- Admit and project Market Operations  
- Anonymous discover (search/detail/compare/plan)  
- Keyless read execute (MCP/Answer)  
- Authenticated durable invoke + recovery  
- Money ledger primitives and fail-closed live-money gate  
- Agent-facing adapters: CLI, MCP, discovery handshake  
- First-party Answer loop that uses the same operation reads/execute  
- Owner claim/supply consoles and inquiry rail  

**You have not closed (category incomplete without these):**

- Independent supplier Qualified Use → settlement → payout  
- Hosted certification of paid/x402 operations  
- Proof that third-party agents (not just Answer/CLI) buy repeatedly  

---

## How to navigate day-to-day

1. **“Is this the market?”** → Layer 0 + Layer 1  
2. **“Is this us dogfooding as a Principal?”** → Layer 2  
3. **“Is this supplier onboarding?”** → Layer 3  
4. **“Can I delete / ignore this?”** → Layer 4 + `product-frontier-manifest.json` (do not delete protected frontier without a receipt)

Golden journeys and protected action IDs live in  
`.planning/evidence/product-frontier-baseline/`.

---

## Refresh

Re-run this map after any milestone that adds a module under `src/modules/`, retires a frontier action, or closes Qualified Use / settlement. Prefer updating **this file** over scattering “what is core” into chat history.
