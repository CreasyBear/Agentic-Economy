# Phase 3: Standard Agent/Builder Discovery — Specification

**Created:** 2026-06-27
**Ambiguity score:** 0.14 (gate: ≤ 0.20)
**Requirements:** 8 locked

## Goal

Builders and agents can discover current public business facts, schema shape, freshness, and unsupported capabilities through read-only docs/schemas/readbacks without gaining invocation, payment, or protected-action authority.

## Background

Current repo state is planning-only and Phase 3 does not yet have a GSD phase directory. ROADMAP.md defines Phase 3 as read-only public business API/discovery expansion after Phase 1 truth exists, with business-origin UCP, API keys, MCP, and OpenAPI only as gated candidates. AI-SPEC.md requires protocol output to follow server-enforced capability, never the other way around. The discovery scout found useful backup patterns for generated UCP/readiness projection, docs parity, OpenAPI readiness metadata, API-key hygiene, and developer readback UI; it also found Agent Router, hosted MCP, BYO proxy, SDK/CLI/plugin, request-market, and action/payment descriptors that are bloat for Phase 3.

## Requirements

1. **Discovery support matrix**: Phase 3 starts only from shipped Phase 1 public catalog/API/discovery truth and maintains a support-matrix decision record for business-origin UCP, OpenAPI, MCP, API keys, SDK, CLI, and plugin surfaces.
   - Current: Roadmap lists Phase 3 ship candidates, not fixed implementation scope; no decision record or phase directory exists.
   - Target: A source-owned support matrix states shipped, unavailable, degraded, blocked, and deferred surfaces with evidence, owner, and route/readback status.
   - Acceptance: The support matrix names every candidate surface and a verifier can confirm each live claim has route-tested behavior or an explicit unavailable/deferred reason.

2. **Read-only API docs and schemas**: Read-only public API documentation, schemas, examples, and fixtures are generated from the same catalog DTO or documented subsets as /api/businesses, /api/businesses/search, and /api/businesses/{slug}.
   - Current: Phase 1 specifies public JSON catalog routes but no developer docs/schema package exists.
   - Target: Developer-facing docs, examples, fixtures, and schema tests are generated from or type-checked against the canonical public catalog DTO/subsets.
   - Acceptance: Schema parity tests prove docs examples, fixtures, OpenAPI-if-present, llms guidance, and live API responses agree on fields, status variants, nullability, pagination, and unsupported capabilities.

3. **Developer discovery readback**: A developer/agent discovery readback surface shows public route health, schema version, cache status, freshness, unsupported capabilities, blockers, examples, and operational readbacks without creating mutation authority.
   - Current: Phase 1 owner/admin health exists only in spec; no developer/readback route exists.
   - Target: A read-only developer or agent docs surface exposes current route/support health and blockers derived from source-owned readbacks.
   - Acceptance: Rendered/docs tests prove public route health, freshness, cache, examples, and unsupported-action states are visible; no buttons/forms/API flows can mutate business, inquiry, action, or payment state.

4. **Business-origin UCP honesty**: Business-origin UCP or .well-known strategy remains unavailable unless the merchant origin can serve and be read back; when unavailable, AE-hosted fallback stays labeled as fallback and standard-origin claims fail scans.
   - Current: Phase 1 explicitly supports AE-hosted fallback, not standard merchant-origin UCP.
   - Target: Phase 3 either ships a readback-proven business-origin strategy or records it as unavailable while preserving AE-hosted fallback copy.
   - Acceptance: Copy/output scans fail on .well-known or standard-origin claims unless a route/readback fixture proves the merchant origin serves the file; AE-hosted fallback remains labeled and valid.

5. **Optional MCP/OpenAPI read projections**: Any OpenAPI or MCP read projection is limited to route-tested read-only catalog/list/search/detail behavior, carries non-authority metadata, omits mutation/payment/action descriptors, and is withheld when parity or route tests fail.
   - Current: Phase 1 bans MCP/OpenAPI live capability; backup has broad runtime surfaces that are not acceptable.
   - Target: If a read projection ships, it documents only read operations over public catalog routes with nonAuthority/unsupported metadata and no mutation transport.
   - Acceptance: Parity tests pass for every advertised read path; mutation, invoke, protected-action, request-market, payment, and provider-operation descriptors are absent; failing route/schema parity withholds the artifact.

6. **Read-only API key gate**: Read-only API keys ship only if a Phase 3 decision record proves public quotas or private readbacks require them; if shipped, keys are reveal-once, hashed at rest, scoped to read-only operations, revocable, rate-limited, and audited.
   - Current: No API key runtime exists and roadmap cuts API keys unless demand proves need.
   - Target: API keys are either explicitly unavailable with rationale or implemented as read-only scoped credentials with source-owned audit/readback.
   - Acceptance: If keys are absent, docs and outputs state unavailable; if present, tests prove reveal-once, hash-at-rest, revocation, last-used/readback, read-only scope denial for mutations, rate limits, and audit events.

7. **Fetch telemetry and cache readback**: Discovery fetch telemetry and cache/readback state capture route, status, schema version, cache version, freshness, error code, bot class, and public business/service IDs without raw private payloads.
   - Current: Phase 1 GTM requires public fetch telemetry but no runtime exists.
   - Target: P3 adds readback/telemetry for docs/schema/discovery fetches with public-safe dimensions and operator-visible failure states.
   - Acceptance: Tests prove successful, cached, stale, invalid, 404, and schema-version mismatch fetches produce privacy-safe readbacks and do not log private owner/contact/inquiry data.

8. **Phase 3 closeout proof**: Phase 3 closeout proves a builder or agent can discover current public facts and unsupported/degraded capabilities through valid cached docs/schemas/readbacks, with no invocation, protected action, payment, SDK/CLI/plugin, hosted-agent, or marketplace surface.
   - Current: No P3 runtime or directory exists.
   - Target: A cold clone can run docs/schema/parity/readback checks showing source-owned, cache-valid, non-authoritative discovery beyond Phase 1 public routes.
   - Acceptance: Closeout evidence includes support matrix, schema parity, route/cache/freshness readback, business-origin UCP decision, optional projection/key decision outcomes, no-overclaim copy scan, and excluded-surface scans.

## Boundaries

**In scope:**
- Support matrix/decision register for read-only discovery surfaces.
- Developer/agent docs, schemas, examples, fixtures, and route/readback health for public catalog APIs.
- Read-only cache/freshness/schema/readback telemetry for docs and discovery outputs.
- AE-hosted fallback hardening and business-origin UCP honesty gate.
- Optional OpenAPI/MCP read projections only if route-tested and non-authoritative.
- Optional read-only API keys only behind a demand/quotas/private-readback decision record.
- Parity/eval tests proving docs, schemas, and live public APIs match.

**Out of scope:**
- Invocation, tool calls, protected actions, provider attempts, booking, inquiry mutation, payment, or settlement — later phases.
- SDK/CLI/plugin/gallery/devrel launch unless demand proves it and the support matrix accepts it.
- Hosted MCP/BYO proxy or streamable transport runtime — too broad before protected-action authority.
- Business-origin standard UCP claims unless merchant origin readback exists.
- API keys as a default developer-platform feature — absent unless quotas/private readbacks require them.
- Payment handlers, x402, Connect, Stripe, wallet, credits, price fields, or paymentRequired descriptors — Phase 5 only.
- Duplicating the public catalog model in an Agent Router or second registry model.

## Constraints

- Generated protocol/docs output follows server-enforced read capability and route tests.
- The public catalog DTO or documented derived subsets remain the sole schema source.
- Every advertised URL/path/schema/example must pass route/parity tests or be omitted.
- Discovery status and cache freshness are source-owned readbacks, not marketing claims.
- Private owner/contact/inquiry/admin fields never enter docs/examples/fixtures/logs.
- MCP/OpenAPI/API-key decisions must be record-backed; absence is valid when demand is unproven.
- P3 may read Phase 2 inquiry availability status but never private messages or owner replies.

## Acceptance Criteria

- [ ] Support matrix exists and names business-origin UCP, OpenAPI, MCP, API keys, SDK, CLI, and plugin surfaces with shipped/unavailable/degraded/deferred state and evidence.
- [ ] Docs, schemas, examples, fixtures, live API responses, UCP/llms references, and optional projections share the same public catalog DTO or documented subsets.
- [ ] Developer/agent readback surface displays route health, schema version, cache freshness, blockers, unsupported capabilities, examples, and operational readbacks.
- [ ] Business-origin .well-known/standard UCP claims are absent unless merchant-origin readback proves them; AE-hosted fallback remains honest.
- [ ] Any OpenAPI/MCP artifact, if shipped, contains only read-only list/search/detail behavior and non-authority metadata; mutation/payment/action descriptors fail tests.
- [ ] API keys are explicitly unavailable or prove reveal-once, hash-at-rest, revocation, read-only scope, rate limiting, audit, and mutation denial.
- [ ] Discovery fetch telemetry is privacy-safe and captures route/status/schema/cache/freshness/error/bot/public IDs without private payloads.
- [ ] No invocation, protected action, payment, SDK/CLI/plugin, hosted-agent, marketplace, or request-market surface ships by accident.
- [ ] Builder/agent smoke can fetch docs/schema/examples and determine current public facts plus unsupported/degraded capabilities.

## Product Design Pass

**Mode:** Shape/Harden for future implementation. The surface is developer/agent-facing, but it is still user-facing product: builders must understand capability without receiving hidden authority.

**Primary user/job/object/outcome:**
- User: builder, agent operator, crawler/answer engine consumer, and internal operator reading route health.
- Job: discover current public facts, schema shape, freshness, and unsupported/degraded capabilities.
- Object: public catalog DTO, docs/schema/examples, support matrix, cache/freshness/readback, and optional read-only projection/key.
- Outcome: a builder can integrate against the truthful read-only surface and know exactly what is unavailable without guessing or invoking mutation paths.

**User-visible surfaces to design:** developer/agent docs page or equivalent readback, support matrix, schema/examples/fixtures, route health and freshness panel, AE-hosted fallback explanation, optional API key reveal/readback UI, optional OpenAPI/MCP read projection download, and unavailable/degraded notices.

**Product decisions locked:**
- Read-only discovery is the product; absent/unavailable is acceptable and must be explained.
- Generated docs/projections follow route-tested server capability; they never create authority.
- AE-hosted fallback must remain visibly distinct from standard merchant-origin UCP.
- Optional keys/projections ship only behind a support-matrix decision with user value, not platform theatre.

**Reachable states that implementation must render:** no docs/projection available, shipped/degraded/unavailable/deferred surface, schema version current/stale/mismatch, cache hit/stale/error, 404/missing slug, empty examples, large example payload, optional API key absent/reveal-once/revoked/rate-limited/last-used, business-origin UCP unavailable, AE-hosted fallback, public route outage, mobile/narrow docs, keyboard/focus path, and long field/status names.

**Product-design acceptance:** Closeout must include rendered or extracted docs/readback evidence that a builder can identify current public facts, freshness, examples, unsupported capabilities, and next steps; compact/wide layout, keyboard navigation, long examples, copy scans, and no-mutation/no-payment descriptor scans must pass.

## Edge Coverage

**Coverage:** 14/14 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| concurrency | R1 | ✅ covered | Acceptance requires one support matrix authority for concurrently evolving candidate surfaces and evidence states. |
| empty, encoding, concurrency | R2 | ✅ covered | Acceptance covers empty example sets, encoded schema fields/examples, and parity under live docs/API drift. |
| unclassified | R3 | ⛔ dismissed | Readback cockpit requirement is verified by explicit UI/docs acceptance; no additional edge class is needed beyond empty/error/freshness checks in acceptance. |
| unclassified | R4 | ⛔ dismissed | Business-origin UCP honesty is a decision/claim gate; acceptance directly tests available vs unavailable origin states and copy scans. |
| adjacency, empty, ordering | R5 | ✅ covered | Acceptance covers adjacent read vs mutation paths, absent/withheld projections, and stable operation ordering in generated artifacts. |
| boundary, precision, concurrency | R6 | ✅ covered | Acceptance covers key-scope boundaries, exact credential precision, revocation/rate-limit races, and absent-key state. |
| concurrency | R7 | ✅ covered | Acceptance covers stale/cache/schema mismatch races and concurrent fetch readbacks. |
| unclassified | R8 | ⛔ dismissed | Closeout is a verification bundle; excluded surface checks live in acceptance and prohibitions. |

## Prohibitions (must-NOT)

**Coverage:** 6/6 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT create invocation, protected-action, payment, booking, provider, request-market, or mutation authority through a docs, OpenAPI, MCP, API-key, or schema artifact. | R2, R3, R5, R6, R8 | resolved | test: schema/projection scans, route tests, and mutation denial tests. |
| MUST NOT claim business-origin .well-known or standard UCP unless the merchant origin serves it and readback verifies it. | R4 | resolved | test: copy/output scan plus origin readback fixture when supported. |
| MUST NOT fork the public catalog into a second Agent Router/readiness model with divergent fields or statuses. | R2, R3, R7 | resolved | test + judgment: schema parity tests and codebase-design review. |
| MUST NOT ship API keys as platform theatre when public unauthenticated docs/routes suffice. | R1, R6 | resolved | judgment: decision record must prove quotas/private readbacks; tests required if keys ship. |
| MUST NOT leak private owner/contact/inquiry/admin/provider evidence in docs, examples, fixtures, telemetry, or discovery logs. | R2, R3, R7 | resolved | test: redaction and fixture scans. |
| MUST NOT launch SDK, CLI, plugin, hosted-agent, developer gallery, or marketplace surfaces before measured demand and route-tested capability exist. | R1, R8 | resolved | test + judgment: support matrix and source-mining scans. |

Canon security/compliance items such as CSRF, injection, SSRF, generic OWASP controls, cookie/session handling, provider-secret hygiene, and privacy law baselines remain owned by SECURITY-SPEC.md, secure-phase/code review, and implementation tests. This section records only phase-specific product and architecture prohibitions.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes |
|--------------------|-------|------|--------|-------|
| Goal Clarity       | 0.88  | 0.75 | ✓      | Read-only builder/agent discovery outcome is specific. |
| Boundary Clarity   | 0.88  | 0.70 | ✓      | Candidate surfaces and hard cuts are explicit. |
| Constraint Clarity | 0.80  | 0.65 | ✓      | Optional keys/MCP/OpenAPI are gated by decision records and route tests. |
| Acceptance Criteria| 0.84  | 0.70 | ✓      | Parity/readback/no-overclaim criteria cover shipped and unavailable states. |
| **Ambiguity**      | 0.14  | ≤0.20| ✓      | Gate passed from roadmap, Phase 1 context, and phase-specific source-mining scouts. |

Status: ✓ = met minimum, ⚠ = below minimum.

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 0 | Researcher | Current state scout | Only Phase 1 has runtime planning; P3 is roadmap-only and must wait for P1 public truth. |
| 1 | Simplifier | What is the smallest useful P3? | Read-only docs/schema/readback over the public catalog, not Agent Router or developer platform. |
| 1 | Boundary Keeper | Which candidates stay gated? | Business-origin UCP, MCP/OpenAPI, API keys, SDK/CLI/plugin all require explicit support-matrix evidence. |
| 2 | Edge Probe | Resolve 14 applicable edge probes | Schema, cache, key, projection, and origin edge cases are specified; non-data gate rows are dismissed with reasons. |
| 3 | Prohibition Probe | Resolve Phase 3 must-NOTs | Six discovery-specific prohibitions are resolved into tests or judgment review. |

---

*Phase: 03-standard-agent-builder-discovery*
*Spec created: 2026-06-27*
*Next step: /gsd:discuss-phase 3 — implementation decisions (how to build what is specified above)*
