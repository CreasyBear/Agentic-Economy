---
phase: 03
slug: standard-agent-builder-discovery
status: approved-for-planning
created: 2026-06-27
mode: shape-harden
primary_sources:
  - .planning/phases/03-standard-agent-builder-discovery/03-SPEC.md
  - .planning/phases/03-standard-agent-builder-discovery/03-CONTEXT.md
  - .planning/phases/03-standard-agent-builder-discovery/03-01-standard-agent-builder-discovery-production-PLAN.md
  - .planning/phases/02-05-PRODUCTION-MATURITY-CONTEXT.md
  - .planning/phases/02-05-PRODUCTION-MATURITY-PLAN.md
design_authorities:
  - DESIGN.md
  - .planning/FRONTEND-DESIGN-FRAMEWORK.md
  - .planning/phases/01-ten-star-spine-foundation/01-UI-SPEC.md
---

# Phase 03 — UI Design Contract

Design appendix for the Phase 3 standard agent/builder discovery production slice. It narrows the shared AE frontend framework to truthful read-only docs, schema, examples, fixtures, support matrix, and route freshness/health readbacks over the public catalog. The UI must help builders and agents understand current public facts without granting mutation, payment, protected-action, API-key platform, SDK/CLI, or MCP mutation authority.

## Design authorities

- `03-SPEC.md`, `03-CONTEXT.md`, and `03-01-standard-agent-builder-discovery-production-PLAN.md` own the product boundary: read-only public catalog discovery, support matrix, parity/readback, route freshness, optional projection decisions, and no platform theatre.
- `02-05-PRODUCTION-MATURITY-CONTEXT.md` and `02-05-PRODUCTION-MATURITY-PLAN.md` own the cross-phase evidence standard: source-owned routes, generated artifacts from route-tested truth, private payload exclusion, and no overclaim copy.
- `DESIGN.md` owns AE visual tokens: command-ink/cool-field/signal-cobalt palette, Geist typography, 8/12/16px radii, status text, and restrained operational hierarchy.
- `.planning/FRONTEND-DESIGN-FRAMEWORK.md` owns shells, AE component seams, route class policy, accessibility gates, and future-surface prohibitions.
- `01-UI-SPEC.md` is the structure precedent. Phase 3 inherits its token/component discipline while adding only read-only discovery/docs surfaces.

---

## Scope and mode

| Field | Value |
|---|---|
| Mode | Shape + Harden for future implementation |
| Primary product job | A builder, crawler, or agent operator can inspect current public catalog facts, schemas, examples, fixtures, freshness, health, and unsupported capabilities without receiving hidden authority. |
| Primary users | Builder, agent operator, crawler/answer-engine consumer, internal operator reading discovery health. |
| Core objects | Public catalog DTO/subsets, support matrix row, schema version, example fixture, route health, cache/freshness readback, optional read projection status. |
| In scope | Read-only docs/readback route, support matrix, schema/examples/fixtures sections or downloads, route health/freshness panel, AE-hosted fallback explanation, degraded/unavailable states. |
| Non-goals | No invocation, mutation, inquiry mutation, payment, protected actions, booking, request market, hosted agents, SDK, CLI, plugin, developer gallery, default API-key platform, or MCP mutation UI. |

---

## Information architecture and route map

Prefer one focused docs/readback route with anchors before adding multiple docs pages. Add download/file endpoints only when generated from route-tested source truth.

| Route / surface | Primary user | Job | Surface contract |
|---|---|---|---|
| `/developers/discovery` | Builder/agent operator | Understand what read-only discovery exists now. | Landing/readback page with current public routes, schemas, examples, freshness, support matrix summary, unsupported capabilities, and next steps. No developer-launch hype. |
| `/developers/discovery#support-matrix` | Builder/operator | See shipped, degraded, unavailable, and deferred base discovery surfaces. | Matrix includes business-origin UCP, AE-hosted fallback, public JSON routes, llms, generated schema/examples, and route-health rows by default. OpenAPI/MCP read projections appear only after source-owned route evidence accepts them. API keys, SDK, CLI, plugin, hosted MCP/BYO proxy, Agent Router, payment descriptors, and protected-action descriptors stay out of the matrix except as non-goals, gated exclusions, or negative-scan evidence until their owning phase accepts source-owned route evidence. |
| `/developers/discovery#schema-examples` | Builder/agent | Inspect schema shape and examples. | Generated schema, examples, fixtures, and copy/download controls tied to schema/cache versions. Withhold or mark stale on parity failure. |
| `/developers/discovery#route-health` | Builder/operator | Read current route/cache/freshness state. | Health cards for `/api/businesses`, `/api/businesses/search`, `/api/businesses/{slug}`, `/{slug}/ucp`, `/llms.txt`, sitemap, robots, and any accepted read-only projection. |
| Machine/download endpoints | Builder/agent | Fetch schema/examples/fixtures. | Files are source-generated, cacheable, and include non-authority metadata. Human UI links only to artifacts that route/parity checks prove current. |

Navigation: no global `Developers`, `API Keys`, `MCP`, `SDK`, `CLI`, `Payments`, or `Actions` nav item until a later decision and route evidence warrants it. Discovery docs can be linked from existing discovery/API debug surfaces or footer only after implementation proves the route.

---

## Key flows

### Flow A — Builder reads the discovery contract

1. Builder opens `/developers/discovery` and sees a plain-language summary: read-only public catalog facts, current freshness, and unsupported capabilities.
2. Support matrix shows each candidate surface with state (`shipped`, `degraded`, `unavailable`, `deferred`), evidence, blocker/reason, and next action.
3. Builder can copy or download only current schema/examples/fixtures generated from the public catalog DTO or documented subset.
4. Copy makes clear that docs/projections describe public facts and do not grant invocation, payment, protected-action, or mutation authority.

### Flow B — Schema/example inspection

1. Builder chooses schema/examples/fixtures section.
2. UI shows schema version, cache version, generated timestamp/freshness, source route, and parity state.
3. Large examples remain readable in scrollable code regions with copy/download controls and accessible labels.
4. If parity fails or route health is stale, UI withholds the artifact or marks it degraded with exact reason and no stale optimistic copy.

### Flow C — Route health and freshness readback

1. Builder/operator views route health panel for public list/search/detail/UCP/llms/sitemap/robots outputs.
2. Each row names route, status, schema version, cache state, freshness, error code if any, last checked time, and safe public IDs where applicable.
3. Missing slug, route outage, schema mismatch, stale cache, and 404 states are visible without exposing private P2 content or admin/provider evidence.

### Flow D — Unsupported or deferred capability clarity

1. Builder checks OpenAPI/MCP/API keys/SDK/CLI/plugin/payment/action rows in the support matrix.
2. UI labels absent capabilities as unavailable/deferred with rationale instead of advertising roadmaps.
3. API-key platform and MCP mutation controls do not appear. Any future read-only key or projection UI requires an accepted support-matrix decision and this UI-SPEC or a successor addendum.

---

## Reachable UI states

| Surface | Required states |
|---|---|
| Discovery landing | current, degraded, all artifacts unavailable, public route outage, no generated examples, long route names, narrow 375px layout. |
| Support matrix | shipped, degraded, unavailable, deferred, blocked, evidence missing, blocker present, long surface names, sorted stable order. |
| Schema/examples/fixtures | current, withheld by parity failure, stale schema, cache stale, schema mismatch, empty examples, large payload, copy success/failure, download unavailable. |
| Route health/freshness | healthy, degraded, stale, 404, missing slug, cache hit, cache miss, cache error, schema version mismatch, last check unavailable. |
| AE-hosted fallback / business-origin UCP | AE-hosted fallback available, business-origin UCP unavailable, merchant-origin readback absent, origin readback degraded if later accepted. |
| Optional projections | OpenAPI read projection unavailable/deferred/current if accepted, MCP read projection unavailable/deferred/current if accepted; never mutation/payment/action descriptors. |
| API keys | unavailable/deferred by default. No create/reveal/revoke UI in this spec; if a later decision accepts keys, add a narrow read-only key UI contract first. |

Private P2 inquiry bodies, owner replies, claimant contact, notification payloads, provider IDs/readbacks, owner notes, and admin evidence are never reachable Phase 3 UI states.

---

## Copy table

| Element | Copy |
|---|---|
| Page H1 | Public catalog discovery |
| Page subcopy | Read current public business facts, schema shape, examples, and freshness. These docs are read-only and do not create mutation, payment, or action authority. |
| Primary status label | Read-only public facts |
| Support matrix heading | Discovery support matrix |
| Support matrix help | Each row shows what is shipped, degraded, unavailable, or deferred based on route readback. |
| Schema section heading | Schemas and examples |
| Schema current | Generated from current public catalog routes. |
| Schema withheld | Withheld because schema parity or route health failed. |
| Route health heading | Route health and freshness |
| Cache stale | Cache is stale. Public facts may be delayed until the next successful readback. |
| Business-origin UCP unavailable | Business-origin UCP is unavailable until the merchant origin can serve it and AE can read it back. |
| AE-hosted fallback | AE-hosted fallback discovery is available for public catalog facts. |
| API keys unavailable | API keys are not available because public read-only routes are sufficient for this phase. |
| SDK/CLI unavailable | No SDK or CLI ships in this phase. Use the documented public routes and generated examples. |
| MCP mutation unavailable | MCP mutation is not available. Phase 3 does not expose tool calls or protected actions. |
| Payment/action descriptors absent | Payment and protected-action descriptors are absent until later phases prove those capabilities. |
| Copy button | Copy example |
| Download link | Download fixture |

Copy rules:
- Say `read-only`, `public catalog`, `schema version`, `cache freshness`, `route health`, `unsupported`, `unavailable`, and `deferred`.
- Do not say `agent-ready`, `callable`, `invoke`, `execute`, `pay`, `paymentRequired`, `protected action`, `marketplace`, `SDK launch`, `CLI`, `API-key platform`, `hosted agent`, `MCP mutation`, or `standard UCP` unless a support-matrix row and readback prove the exact limited claim.
- OpenAPI/MCP words may appear only as support-matrix candidates or accepted read-only projections; never as mutation/control surfaces.

---

## Component contract

Compose from AE shells and shared primitives. Documentation UI is still product UI; do not paste a separate docs theme.

| Pattern | Required component / behavior |
|---|---|
| Page shell | `AePublicShell` or a narrow `AeDocsShell` built from AE shell primitives; same skip link, tokens, and responsive container rules. |
| Page header | `AePageHeader` with read-only scope, freshness summary, and no marketing hero metrics. |
| Support matrix | `Table` or `AeQueueList`-style rows with status badge + reason + evidence + next action; no color-only states. |
| Route health cards | `AeStatusCard`/status row pattern showing route, status, schema/cache version, freshness, and safe error code. |
| Schema/example display | Tokenized code block/pre pattern with accessible copy/download controls, horizontal overflow inside the code region only, and line wrapping where safe. |
| Tabs/anchors | Native anchors or accessible tabs only when content volume requires it; keyboard order follows visual order. |
| Empty/degraded/withheld states | Shared `AeAlert`, `AeEmptyState`, and `AeErrorState`; state copy names the blocker and recovery/next action. |
| Downloads/copy controls | Buttons/links with stable labels, busy/success/error feedback, and no hidden query-string key examples. |

Promote a docs component only when reused or needed for safety (matrix rows, route-health rows, schema/example block). Do not create an SDK/API-key/MCP component library in Phase 3.

---

## Accessibility and responsive contract

- 375px width is a release gate for the discovery route, support matrix, schema/example blocks, and route-health panel.
- On narrow screens, matrix rows become stacked cards or a horizontally contained table with visible row labels; the page itself must not horizontally scroll.
- Code/example regions may scroll horizontally inside their container and must have visible focus, copy buttons, and accessible names.
- Keyboard-only path covers skip link, section anchors/tabs, copy/download controls, support-matrix rows, and route-health details.
- Focus is visible and not color-only; copy/download hit targets are at least 44px where practical and never below 40px.
- Statuses use text plus tone; every degraded/unavailable/deferred state includes a reason.
- Long field names, status variants, URLs, schema keys, public IDs, and error codes wrap or scroll without breaking layout.
- Reduced-motion disables non-essential transitions. Route health freshness changes must not rely on animation to communicate state.
- Private P2/admin/provider fields must not appear in accessible names, hidden descriptions, copied examples, fixture downloads, or telemetry labels.

---

## Rendered verification matrix

Required during implementation closeout for every changed surface.

| Surface | Compact proof | Wide proof | State proof | Interaction proof | Copy/prohibition proof |
|---|---|---|---|---|---|
| `/developers/discovery` landing | 375px overview with freshness summary | Desktop docs/readback layout | current, degraded, all artifacts unavailable | Skip link and section-anchor focus | Read-only public facts; no developer-platform hype |
| Support matrix | 375px stacked or contained matrix | Desktop dense matrix | shipped, degraded, unavailable, deferred, blocked | Keyboard row/link navigation | API keys/SDK/CLI/MCP mutation/payment/action rows do not overclaim |
| Schema/examples/fixtures | 375px large example block | Desktop schema + examples | current, stale, withheld, empty, large payload | Copy/download focus and feedback | Generated from public DTO; no private P2 content |
| Route health/freshness | 375px health cards | Desktop route health table/panel | healthy, stale, outage, cache error, mismatch, 404 | Details disclosure/focus path | Health is route readback, not marketing claim |
| UCP fallback explanation | 375px explanation | Desktop support row/detail | AE-hosted fallback, business-origin unavailable/degraded | Link/copy focus | No standard merchant-origin claim without readback |
| Optional projection rows | 375px unavailable/deferred rows | Desktop matrix rows | unavailable/deferred/current only if accepted | Download/copy absent unless current | No mutation/payment/protected-action descriptors |

---

## Bloat and prohibition clauses

- No invocation, tool-call, mutation, inquiry mutation, protected-action, provider-attempt, booking, payment, settlement, request-market, marketplace, or hosted-agent UI.
- No default API-key platform. API keys are unavailable/deferred unless a later support-matrix decision proves public quota/private-readback need and a narrow read-only key UI contract is written.
- No SDK, CLI, plugin, developer gallery, hosted MCP/BYO proxy, Agent Router, second catalog/readiness model, or developer-launch landing page.
- No MCP mutation or OpenAPI mutation descriptors. Any accepted projection is read-only list/search/detail over route-tested public catalog facts with non-authority metadata.
- No payment fields, `paymentRequired`, price/checkout/receipt descriptors, x402, Connect, wallet, credits, protected-action descriptors, or provider-operation descriptors.
- No private P2 content: inquiry bodies, owner replies, claimant contact, owner notes, notification IDs/payloads, provider readbacks, admin evidence, and secrets stay out of docs, examples, fixtures, accessible names, logs, telemetry, and copied/downloaded artifacts.
- No route-local docs styling, raw colors, custom badges/buttons/alerts, future nav, or disabled controls for unavailable future surfaces.

---

## Implementation handoff

Execution planners must include this UI-SPEC alongside the Phase 3 SPEC/CONTEXT/PLAN, `DESIGN.md`, and `.planning/FRONTEND-DESIGN-FRAMEWORK.md`. Build only the read-only discovery docs/readback surfaces needed for builders and agents to verify current public facts, freshness, examples, unsupported capabilities, and no-private-data boundaries; then prove them with compact/wide rendered evidence during implementation.
