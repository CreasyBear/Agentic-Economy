# Platform navigation & route map

**Status:** wave 1 register — destinations derived from jobs/journeys, not path names  
**Date:** 2026-09-21  
**Authority:** [`PRODUCT.md`](../../PRODUCT.md) core market journeys 1–6; [`CONTEXT.md`](../../CONTEXT.md); [`buyer-page-register.md`](./buyer-page-register.md); live evidence in [`buyer-ia-coverage.md`](./buyer-ia-coverage.md)  
**Companion:** [`platform-design-package.md`](./platform-design-package.md) part 4. Job IDs (`J-B…`) land in [`platform-job-map.md`](./platform-job-map.md) (not written yet); this file uses **journey stage** until then.

The withdrawn Search / Keys / Trips dest law is **not** used. Do not infer Airbnb Trips / Messages / Wishlists / Switch to hosting until a signed-in walk (`buyer-ia-coverage.md` §9).

---

## Rules (enforce in implementation)

| Rule | Meaning |
| --- | --- |
| **Path = dest or resource** | Stable routes identify a destination or a durable object (`/tools/…`, `/calls/…`, `/t/…`). |
| **Query = shareable view** | Filters, tabs, compare sets, and scoped lists live in search params (e.g. `/market?…`, `/activity?agent=…`). Do not mint a path per tab. |
| **`/owner` = organisation scope** | Prefix marks Clerk organisation workspace routes, not “permission to buy” vs “permission to sell”. Same person may buy and supply; **context switch must be explicit** (see below). |
| **Page vs dialog** | **Page** when the user must resume, deep-link, or share URL (Tool listing, Call receipt, chat thread, grant review). **Dialog** for short, local decisions on the current dest (compare tray, quick filter, one-step confirm) if closing returns to the same dest without losing task context. |
| **One buyer shell** | Signed-in buyer work should share one header chrome (`design-system-maturity-register.md` DS-37). Biggest ROI: stop treating operator rail items as a second product. |
| **No dest per tab** | Market tabs (Tools / Collections / Providers / Saved) are query or in-page state on **Market**, not sibling header dests. |

### Context switch (buyer ↔ Provider)

| Evidence | Pattern |
| --- | --- |
| **SEEN** | Airbnb logged-out hamburger: **Become a host** — not a peer browse tab ([`buyer-ia-coverage.md`](./buyer-ia-coverage.md) §2, https://www.airbnb.com.au/) |
| **SEEN** | Nevermined catalog header: **List your service** beside Log in — not a fourth buyer tab (§4, https://nevermined.app/catalog/) |
| **BLOCKED** | Airbnb signed-in **Switch to hosting / traveling** — not observed; mark **OPEN** until signed-in walk (§9) |
| **SOURCE** | AE today puts **My tools** (`/owner/operations`) as a signed-in **header** peer (`src/routes/_operator/owner.operations.tsx`, `AeOwnerMobileNavigation.tsx`) |

**Verdict (provisional):** Provider working is a **mode or menu entry**, not a fourth peer dest beside Market / Agents / Calls — aligned with SEEN references; AE header placement is **OPEN** pending signed-in AE walk (`buyer-page-register.md` open decision 5).

---

## Framework contexts

Maps AE objects ([`CONTEXT.md`](../../CONTEXT.md)) to chrome bands. A destination belongs to exactly one primary context; resources and handoffs may cross contexts without becoming header dests.

| Context | User mode | Typical objects | Chrome |
| --- | --- | --- | --- |
| **Public discovery** | Guest or signed-in visitor | Tool catalog, marketing doors, public business (`/$slug`) | Site header: Market + marketing links |
| **Buyer working** | Customer org admin acting for agents | Tool, Quote, Call, Spending policy, Prepaid credit, comparison | Signed-in header: find → authorize → explain |
| **Provider working** | Same org publishing supply | Publication, Listing, Source, Provider connection, earnings | Mode switch or supply section — not buyer peer tabs (provisional) |
| **Shared account** | Org + person settings | Account, Team, Workspace (Clerk org), tax profile | Account menu / org switcher — **label-only** routes today |
| **Operations** | Developer or platform admin | Discovery API surface, catalog health, audit readback | Separate rail; not buyer header |

---

## Buyer job → journey stages (until `J-B…` exists)

From [`buyer-page-register.md`](./buyer-page-register.md): find a suitable **Tool**, let the **Agent** buy within granted **Spending policy**, leave a **Call** record that can be explained and remedied. Journeys **1, 2, 3, 5, 6** first; **4** is publish (Provider), not the organising buyer dest.

| Stage | PRODUCT.md journey | Decision the user makes |
| --- | --- | --- |
| **S1 — Need & discover** | 1 | What capability do I need? Where do I browse or describe it? |
| **S2 — Compare & choose** | 2, 3 | Which Tool version fits? What price/terms? Proceed to Quote/Call? |
| **S3 — Authorize agents** | 3 (governance) | Which agents may spend? On which tools? Under what limits? |
| **S4 — Fund** | 3 (precondition) | Is there prepaid **credit** to reserve for Calls? (Funding ≠ authority.) |
| **S5 — Record & remedy** | 3, 6 | What happened on this **Call**? Purchase resolution / recovery? |
| **S6 — No fit / later** | 5 | Nothing suitable now — signal or wait (not a chrome dest until implemented) |
| **S7 — Publish supply** | 4 | Admit/publish Tools, connections, pricing (Provider context) |

---

## Proposed destinations

**Verdict key:** **KEEP dest** — earns stable chrome or primary return point. **FOLD** — merge into another dest (same job, duplicate URL). **DEMOTE off dest** — keep route, remove from header/mobile primary. **PAGE not dest** — deep link resource or flow, not primary nav. **OPEN** — needs signed-in product walk or product call.

### Public discovery

| Dest ID | Serves (stage) | Decision | Current AE path(s) | Verdict | Evidence | Page vs dialog | Query vs path |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DEST-PUBLIC-MARKET` | S1, S2, S6 | Where do I discover and describe need? | `/market` (`/` → redirect) | **KEEP dest** | **SEEN** http://127.0.0.1:3024/market (ask, tabs Tools/Collections/Providers/Saved); **SOURCE** `src/routes/market.tsx`; **CHARTER** journeys 1–2 | Page (home + resume browse) | Path `/market`; tabs/filters/compare in **query** (`validateMarketSearch`) |
| `DEST-PUBLIC-FOR-AGENTS` | S3 (door) | How do agents connect? | `/for-agents` | **PAGE not dest** (marketing) | **SOURCE** `src/routes/for-agents.tsx`; not a logged-in working dest | Page | Path only |
| `DEST-PUBLIC-FOR-PROVIDERS` | S7 (door) | How do I supply? | `/for-providers` | **PAGE not dest** (marketing); candidate **menu** anchor for supply switch | **SOURCE** `src/routes/for-providers.tsx`; **SEEN** parallel: Nevermined “List your service”, Airbnb “Become a host” | Page | Path only |

### Buyer working (signed-in)

| Dest ID | Serves (stage) | Decision | Current AE path(s) | Verdict | Evidence | Page vs dialog | Query vs path |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DEST-BUYER-MARKET` | S1, S2 | Same as public Market, signed-in shell | `/market` (header); duplicate **`/owner/market`** (rail only) | **KEEP dest** on `/market`; **`/owner/market` → FOLD** | **SOURCE** `owner.market.tsx` + `market.tsx` same loader pattern; **SEEN** refs use one catalog (Locus `/tools`, Nevermined `/catalog/`); signed-in AE header **not walked** | Page | One path **`/market`**; retire rail-only duplicate when one shell lands (`design-system-maturity-register.md` DS-37: do not use `/owner/market`) |
| `DEST-BUYER-AGENTS` | S3 | Who is connected and what may they spend? | `/agent-access` | **KEEP dest**; header slot **OPEN** | **SOURCE** `agent-access.tsx`; **CHARTER** Spending policy + Agent; no logged-out peer on reference homes (`buyer-ia-coverage.md` §8) | Page; `/agent-access/authorize` grant review | Path dest; `caller`, `resumeTool` in **query** |
| `DEST-BUYER-CALLS` | S5, S6 | What Calls happened; explain/remedy? | `/activity` | **KEEP dest**; label maps to **Call** not “Trips” | **SOURCE** `activity.tsx`; **CHARTER** Call + purchase resolution; Airbnb trip-like dest **BLOCKED** | Page | Path `/activity`; agent filter **`?agent=`** |
| `DEST-BUYER-CREDIT` | S4 | Prepaid balance / top-up? | `/owner/credit` | **KEEP dest** (rail); **DEMOTE off dest** if ever in mobile primary | **SOURCE** `owner.credit.tsx`; **CHARTER** Prepaid ≠ Spending policy; Nevermined listing **Top up** **SEEN** on listing not as peer tab | Page | Path; funding return `/fund/…` handoff **PAGE not dest** |

### Provider working

| Dest ID | Serves (stage) | Decision | Current AE path(s) | Verdict | Evidence | Page vs dialog | Query vs path |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DEST-PROVIDER-SUPPLY` | S7 | Manage published Tools, sources, connections | `/owner/operations` (+ `/new`, `/$toolRef`, supply/oauth) | **DEMOTE off dest** (header/mobile peer); **KEEP** route | **SOURCE** header order 3 `owner.operations.tsx`; **SEEN** hosting/list patterns in menu/header not as 4th buyer tab; **CHARTER** journey 4 not buyer organising dest | Page (workspace + tool detail) | Path for workspace; list **cursor** in query |

### Shared account (organisation + person)

| Dest ID | Serves (stage) | Decision | Current AE path(s) | Verdict | Evidence | Page vs dialog | Query vs path |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DEST-SHARED-OVERVIEW` | — (dashboard habit) | “How am I doing?” snapshot | `/owner/` | **FOLD** into Market or account home when one shell ships | **SOURCE** `owner.index.tsx` rail **Overview**; duplicates Market + Calls + Agents summaries; not **SEEN** on reference logged-out homes | Page today | Path |
| `DEST-SHARED-TEAM` | Org membership | Who is in the workspace? | `/owner/team` | **PAGE not dest** | **SOURCE** `nav.label` only, no rail (`buyer-ia-coverage.md` §7) | Page | Path |
| `DEST-SHARED-WORKSPACE` | Org profile / tax | Workspace legal & tax facts | `/owner/workspace` | **PAGE not dest** | **SOURCE** `owner.workspace.tsx` | Page | Path |
| `DEST-SHARED-ACCOUNT` | Person security | Sessions, recovery, security history | `/owner/settings` | **PAGE not dest** | **SOURCE** `owner.settings.tsx` | Page | Path |

### Resources & flows (not header dests)

| Dest ID | Serves (stage) | Decision | Current AE path(s) | Verdict | Evidence | Page vs dialog | Query vs path |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RES-TOOL` | S2 | Inspect Tool version, price, terms; act (Quote path) | `/tools/$toolRef`, `/tools/$providerHost/$slug` | **PAGE not dest** | **SOURCE** census §7; listing **not walked** on AE this session | Page (shareable listing) | Path identifies Tool |
| `RES-CALL` | S5 | Inspect one Call / receipt / recovery | `/calls/$callRef` | **PAGE not dest** | **SOURCE** `CallReceiptWorkspace`; register: “trip-like” not chrome | Page | Path identifies Call |
| `RES-ASK-THREAD` | S1, S2 | Continue natural-language need / comparison | `/t/new`, `/t/$threadId`, `/s/$shareToken` | **PAGE not dest** | **SEEN** Perplexity: ask is product, **Sessions** dest for history (`/library`) — AE thread is page; **CHARTER** AE does not own user project | Page (resume/link) | Path thread id |
| `FLOW-ONBOARDING` | First org | First workspace setup | `/onboarding` | **PAGE not dest** | **SOURCE** census | Page | Path |
| `FLOW-FUNDING` | S4 | Return from payment provider | `/fund/$fundingSessionId`, `/fund/cancelled` | **PAGE not dest** | **SOURCE** census | Page | Path |
| `RES-PUBLIC-BUSINESS` | S1 | Provider shop front | `/$slug` | **PAGE not dest** | **SOURCE** `AePublicBusiness` | Page | Path |
| `FLOW-AUTH` | — | Sign in / up | `/sign-in/*`, `/sign-up/*` | **PAGE not dest** | **SOURCE** | Page | Path |

### Operations

| Dest ID | Serves (stage) | Decision | Current AE path(s) | Verdict | Evidence | Page vs dialog | Query vs path |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DEST-OPS-DISCOVERY` | Developer | Public discovery API / integration | `/developers/discovery` | **KEEP dest** (developer rail) | **SOURCE** `developers.discovery.tsx` | Page | Path |
| `DEST-OPS-CATALOG-HEALTH` | Admin | Index health | `/admin/index-health` | **KEEP dest** (admin rail) | **SOURCE** census | Page | Path |
| `DEST-OPS-AUDIT` | Admin | Audit readback | `/admin/audit-events` | **KEEP dest** (admin rail) | **SOURCE** census | Page | Path |

### Context switch (explicit)

| Dest ID | Serves | Decision | Current AE path(s) | Verdict | Evidence |
| --- | --- | --- | --- | --- | --- |
| `CTX-BUYER-PROVIDER` | S1 ↔ S7 | Am I buying or supplying? | Implicit via `/owner/operations` header | **OPEN** (label + placement); target **menu/mode** not peer tab | **SEEN** Airbnb / Nevermined; **BLOCKED** Airbnb signed-in switch |

---

## Current header dests vs proposed (signed-in + public)

Source: [`buyer-ia-coverage.md`](./buyer-ia-coverage.md) §7, route `staticData.nav.header`.

| Label | Path | Audience today | Proposed dest ID | Proposed verdict |
| --- | --- | --- | --- | --- |
| Market | `/market` | always | `DEST-PUBLIC-MARKET` / `DEST-BUYER-MARKET` (same URL) | **KEEP** — one URL for guest + signed-in |
| For agents | `/for-agents` | public | `DEST-PUBLIC-FOR-AGENTS` | **PAGE not dest** (stay in header as marketing if needed) |
| For providers | `/for-providers` | public | `DEST-PUBLIC-FOR-PROVIDERS` | **PAGE not dest**; also **supply switch** anchor |
| Agents | `/agent-access` | signed-in | `DEST-BUYER-AGENTS` | **KEEP**; chrome slot strength **OPEN** |
| Calls | `/activity` | signed-in | `DEST-BUYER-CALLS` | **KEEP** |
| My tools | `/owner/operations` | signed-in | `DEST-PROVIDER-SUPPLY` | **DEMOTE off dest** (keep route) |

**Proposed signed-in primary chrome (target):** **Market · Agents · Calls** + explicit **Supply / List tools** entry (menu or mode), **not** four equal tabs including My tools — pending signed-in AE + Airbnb walks.

**Operator rail today (not header):** Overview, Calls, Agents, Credit, Market (`/owner/market`), My tools, Discovery, Catalog health, Audit — [`buyer-ia-coverage.md`](./buyer-ia-coverage.md) §7. Target one buyer shell: rail **Buy** group collapses to header dests; **FOLD** Overview and **`/owner/market`** per SOURCE above; Credit stays account/buy adjunct (rail or account menu), not mobile primary (`design-system-maturity-register.md` DS-37).

---

## Extra current dests that serve no buyer journey stage (as peers)

These appear in AE chrome or rail but are weak or duplicate vs PRODUCT buyer job and **SEEN** reference homes.

| Current label | Path | Why extra | Verdict |
| --- | --- | --- | --- |
| **My tools** (header + mobile primary) | `/owner/operations` | Journey **4** supply; references put host/list in **menu**, not peer buyer tab | **DEMOTE off dest** |
| **Market** (owner rail) | `/owner/market` | Same job as `/market`; second search surface | **FOLD** into `/market` when one shell |
| **Overview** (owner rail) | `/owner/` | Dashboard habit, not a journey decision in charter | **FOLD** (OPEN: what replaces landing?) |
| **For agents** / **For providers** (header, public) | `/for-agents`, `/for-providers` | Marketing doors, not S1–S6 working loops | Not buyer **working** dests; OK as public chrome |

None of the logged-out reference products put **Agents**, **Calls**, or **My tools** as peer tabs on the catalog home (`buyer-ia-coverage.md` §8). AE’s signed-in trio is **SOURCE-only** until walk item 4 in §10 completes.

---

## Reference products (dest evidence only — no AE rename law)

Use for **decisions**, not object names. Full URLs in [`buyer-ia-coverage.md`](./buyer-ia-coverage.md).

| Product | SEEN dest pattern relevant to AE | Maps to proposed dest |
| --- | --- | --- |
| Nevermined catalog | Outcomes · Services · List your service | Market + supply menu (`DEST-PUBLIC-MARKET`, `CTX-BUYER-PROVIDER`) |
| Locus | Marketing `/tools` catalog; account behind login | Public Market; buyer account **BLOCKED** |
| Airbnb (logged out) | Browse + search; Become a host in menu | Market; supply **OPEN** when signed-in seen |
| Perplexity | Ask on `/`; Sessions `/library` for history | Ask as page/thread; history ≈ Calls/threads **OPEN** |
| AE `/market` logged out | Ask + tabs + cards | `DEST-PUBLIC-MARKET` |

**DOCS quarantine:** Trips, Messages, Wishlists, Locus Pro Tools/Credits/Connections, Nevermined App Agents/Plans — [`buyer-ia-coverage.md`](./buyer-ia-coverage.md) §11. Do not implement dest law from those names.

---

## Open before chrome changes

1. Signed-in **Airbnb** bottom/nav + hosting switch — **BLOCKED**  
2. Signed-in **AE** header (Market / Agents / Calls / My tools) — not walked  
3. AE **Tool listing** primary action (Reserve vs top-up vs Quote) — not walked  
4. Whether **Agents** and **Calls** earn header slots like future signed-in Airbnb dests — **OPEN**  
5. **`platform-job-map.md`** — replace journey stage column with `J-B…` IDs when written  

Until 1–2 update [`buyer-ia-coverage.md`](./buyer-ia-coverage.md), treat **FOLD** and **DEMOTE** rows as design direction backed by **SOURCE + SEEN references**, not shipped renames.

---

## Route census pointer

Human-readable page inventory (42 routes + redirect): [`buyer-ia-coverage.md`](./buyer-ia-coverage.md) §7. This map does not duplicate the table; it assigns **why** each path exists in navigation terms.
