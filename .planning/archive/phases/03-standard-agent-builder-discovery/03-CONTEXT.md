# Phase 3: Standard Agent/Builder Discovery - Context

**Gathered:** 2026-06-27
**Status:** Ready for production planning

<domain>
## Phase Boundary

Phase 3 ships a production read-only discovery layer for builders, crawlers, and agents over the live public catalog: docs, schema, examples, fixtures, OpenAPI-or-equivalent read projection when useful, developer/agent readback, cache/freshness telemetry, route health, and honest unsupported/degraded capability states.

This is not developer-platform theatre. Every published discovery artifact must be generated from route-tested source state, deployed, cacheable, observable, and safe for public consumption. Anything not real is hidden or explicitly unavailable in readback, not advertised.

Phase 3 does not ship invocation, mutation, protected actions, booking, payment, request-market behavior, hosted agents, or SDK/CLI/plugin ecosystem.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**8 requirements are locked.** See `03-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `03-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Support matrix/decision register for read-only discovery surfaces.
- Developer/agent docs, schemas, examples, fixtures, and route/readback health for public catalog APIs.
- Read-only cache/freshness/schema/readback telemetry for docs and discovery outputs.
- AE-hosted fallback hardening and business-origin UCP honesty posture.
- Optional OpenAPI/MCP read projections only if route-tested and non-authoritative.
- Optional read-only API keys only behind real public quota or private readback need.
- Parity/eval tests proving docs, schemas, and live public APIs match.

**Out of scope (from SPEC.md):**
- Invocation, tool calls, protected actions, provider attempts, booking, inquiry mutation, payment, or settlement.
- SDK/CLI/plugin/gallery/devrel launch unless demand proves it and the support matrix accepts it.
- Hosted MCP/BYO proxy or streamable transport runtime.
- Business-origin standard UCP claims unless merchant origin readback exists.
- API keys as a default theatre feature.
- Payment handlers, x402, Connect, Stripe, wallet, credits, price fields, or paymentRequired descriptors.
- Duplicating the public catalog model in an Agent Router or second registry model.

</spec_lock>

<decisions>
## Implementation Decisions

### Production posture
- **D-01:** Completed Phase 3 means a deployed, route-tested, schema-parity-checked discovery surface, not docs that drift from runtime routes.
- **D-02:** Every advertised URL/path/schema/example must resolve in local/integration/deploy smoke or be omitted.
- **D-03:** Public agents/builders must be able to determine current public facts, freshness, unsupported capability, and next action without a private conversation with the team.

### Support matrix
- **D-04:** Phase 3 begins with a source-owned support matrix for business-origin UCP, OpenAPI, MCP, API keys, SDK, CLI, and plugin surfaces.
- **D-05:** The matrix is not a placeholder. Each entry is `shipped`, `unavailable`, `degraded`, or `deferred` with evidence, owner, route/readback status, blocker, and next action.
- **D-06:** OpenAPI read projection should ship if it materially helps builders verify list/search/detail behavior and can pass route parity. MCP should not ship unless it adds real read-only agent value beyond OpenAPI/llms.
- **D-07:** API keys ship only if production quotas, abuse posture, or private developer readbacks require authenticated reads. If public unauthenticated docs/routes suffice, no-key is the mature answer.

### Schema source and parity
- **D-08:** The public catalog DTO or documented derived subsets remain the single schema source for docs, examples, fixtures, llms/UCP references, optional projections, and live API responses.
- **D-09:** No Agent Router, second registry, or readiness model may duplicate/fork catalog fields or status variants.
- **D-10:** Docs/projections are withheld when route/schema parity fails. There is no fallback hand-authored truth.

### Optional surfaces
- **D-11:** Business-origin `/.well-known/ucp` remains unavailable unless merchant-origin route/readback proves the business origin serves it; AE-hosted fallback remains honestly labeled.
- **D-12:** Any OpenAPI/MCP artifact is read-only list/search/detail with non-authority metadata and no mutation/payment/action descriptors.
- **D-13:** SDK, CLI, plugin, hosted MCP/BYO proxy, streamable transport, developer gallery, and devrel launch remain future products until measured demand and route-tested capability justify them.

### Telemetry and privacy
- **D-14:** Discovery telemetry may record route, status, schema/cache version, freshness, error code, bot class, and public business/service IDs only.
- **D-15:** Private owner/contact/inquiry/admin/provider evidence must never enter docs, examples, fixtures, logs, telemetry, UCP, llms, OpenAPI, MCP, or support-matrix examples.

### the agent's Discretion
- The planner may choose exact docs/readback UI composition, cache headers, schema versioning, OpenAPI file shape, and example format if they preserve source-owned parity, route-tested output, and privacy-safe telemetry.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Production spine
- `.planning/phases/02-05-PRODUCTION-MATURITY-CONTEXT.md` — cross-phase production posture, module seams, and evidence standard.

### Phase requirements
- `.planning/phases/03-standard-agent-builder-discovery/03-SPEC.md` — locked Phase 3 requirements, boundaries, acceptance, prohibitions.
- `.planning/ROADMAP.md` — Phase 3 objective and bloat relapse detector.
- `.planning/STATE.md` — current Phase 1 execution state.

### Discovery authority
- `.planning/AI-SPEC.md` — AI/agent-facing output contract; protocol output follows server-enforced capability.
- `.planning/SEO-AEO-SPEC.md` — public catalog SEO/AEO/schema/crawl honesty.
- `.planning/AGENTIC-MARKET-STUDY.md` — external analogue; copy boring registry/list/search/docs shape, not x402/payment/platform surfaces.
- `.planning/PROJECT.md` — public catalog DTO/source-owned projection authority.
- `.planning/SECURITY-SPEC.md` — privacy, SSRF/provider URL quarantine, prompt-injection/data-only rules.
- `.planning/ENGINEERING-STANDARDS.md` — TypeScript/Convex/test standards.
- `.planning/SOURCE-MINING.md` and `.planning/source-mining/phase-1-ledger.md` — source-mining discipline and banned backup imports/symbols.

### Upstream phases
- `.planning/phases/01-ten-star-spine-foundation/01-SPEC.md` — Phase 1 public catalog/API/discovery substrate.
- `.planning/phases/01-ten-star-spine-foundation/01-CONTEXT.md` — Phase 1 discovery decisions.
- `.planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md` — inquiry availability may be read as public status only; private messages/replies stay private.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- TanStack Start/Router shell and generated route tree exist; Phase 3 routes must compose with shipped Phase 1 public routes.
- Current runtime has no P1 catalog/domain modules yet; P3 must not plan against imaginary implemented DTOs.
- Existing tests include guardrail-fixture directories for bad source-mining/import/copy/UI patterns.

### Established Patterns
- Generated protocol/docs output is projection, not authority.
- Public discovery follows source-owned route behavior and parity tests.
- Explicit negative capability state is preferred when omission invites over-inference.

### Integration Points
- Builds on `/api/businesses`, `/api/businesses/search`, `/api/businesses/{slug}`, `/{slug}/ucp`, `/llms.txt`, sitemap/robots, and registry/search after Phase 1 ships.
- May read public inquiry availability from Phase 2 only as allowed public status, never private content.

</code_context>

<specifics>
## Specific Ideas

P3 should feel like a truthful integration surface: boring docs, exact schemas, working examples, cache/readback status, and no fake platform posture.

</specifics>

<deferred>
## Deferred Ideas

- Invocation/tool calls, protected actions, payment descriptors, SDK/CLI/plugin, hosted MCP/BYO proxy, streamable runtime, developer gallery, and Agent Router remain future products.
- Business-origin UCP is allowed only when merchant-origin readback proves it; otherwise AE-hosted fallback remains the honest surface.

</deferred>

---

*Phase: 03-standard-agent-builder-discovery*
*Context gathered: 2026-06-27*
