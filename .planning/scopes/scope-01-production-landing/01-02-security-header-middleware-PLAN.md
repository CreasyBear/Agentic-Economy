---
phase: scope-01-production-landing
plan: "01-02"
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/http/security-headers.ts
  - src/start.ts
  - tests/unit/http/security-headers.test.ts
  - tests/deploy-smoke/phase1-deploy-smoke.spec.ts
  - .env.example
autonomous: true
requirements: [D3]
user_setup:
  - "Deploy the report-only CSP first and observe violations against a real deployment before enabling enforce mode (executed during 01-04's deployed run). No secret values recorded."
execution_scope: source_local
production_executable: true
must_haves:
  truths:
    - id: s1-headers-source-owned
      statement: "Browser security headers are set by a source-owned TanStack Start response middleware in src/start.ts, not by deployment-only config."
    - id: s1-header-set-complete
      statement: "HTML and JSON routes carry CSP (frame-ancestors 'none'), Referrer-Policy, Permissions-Policy, X-Content-Type-Options: nosniff, and X-Frame-Options: DENY."
    - id: s1-csp-report-only-first
      statement: "The CSP ships report-only first; enforcement is only tightened after deployed violation observation (proof handed to 01-04)."
  artifacts:
    - path: src/lib/http/security-headers.ts
      provides: "Pure, unit-testable builder of the header set + CSP directive set (report-only and enforce variants)."
    - path: tests/deploy-smoke/phase1-deploy-smoke.spec.ts
      provides: "Extended RouteExpectation with a per-route securityHeaders check in the publicRoutes loop."
  key_links:
    - from: CSP prototype resolution (#2)
      to: security-headers builder
      via: "The concrete script-src/connect-src/frame-ancestors/img-src directive set (Clerk/PostHog/Sentry/maps + ld+json) is encoded in the builder and its unit test."
    - from: security-headers middleware
      to: phase1 deploy smoke
      via: "Every public RouteExpectation asserts the header set once deployed (01-04)."
---

<objective>
Add a source-owned browser-security-header response middleware in `src/start.ts`, backed by a pure builder, so page-level protections are in-repo and testable rather than relying on unchecked deployment config (ADR-001 D3; CONCERNS.md §Security "App-wide browser security headers are not codified"). Resolve the entry ticket — a CSP that survives TanStack Start SSR (#2) — report-only first, then enforce.

Purpose: consistent CSP / frame / referrer / permissions / nosniff hardening on HTML and JSON routes.
Output: pure header builder, response middleware, unit test, extended phase1 deploy smoke, report-only env flag name.
</objective>

<how_to_execute>
Fresh session: read the scope INDEX (`SCOPE-01-INDEX.md`), then execute this plan's tasks in order; Task 1 resolves ticket #2 (its output — the concrete directive set — feeds Task 2). TDD where marked; run each task's `<verify>` after the task; write the SUMMARY.md named in `<output>` on completion.
</how_to_execute>

<context>
@.planning/adr/ADR-001-scope1-production-landing.md
@.planning/ENGINEERING-STANDARDS.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/CONCERNS.md
@.planning/codebase/ARCHITECTURE.md
@AGENTS.md
@src/start.ts
@src/lib/http/discovery-response.ts
@src/routes/api.discovery.schema.ts
@tests/deploy-smoke/phase1-deploy-smoke.spec.ts
@tests/deploy-smoke/vercel-bypass.ts
</context>

<standards>
- **Admin/security standard + SECURITY-SPEC (cso lens):** headers are a source-owned, testable control; CSRF/same-site posture unchanged (`createCsrfMiddleware` already in `src/start.ts`); do not weaken existing provider-endpoint `no-store`.
- **Route/server-function boundary:** the header set is a pure builder in `src/lib/http/security-headers.ts` (like `src/lib/http/discovery-response.ts`); `src/start.ts` composes it as response middleware alongside the existing observability/CSRF/admission/clerk middleware — routes are not touched.
- **TypeScript hard spec:** header/directive maps use `satisfies Record<Union, ...>`; no broad `string`; no `any`/`as`/non-null; CSP mode is a const-tuple union (`'report-only' | 'enforce'`), not an enum.
- **Side-effect standard:** middleware must not swallow response cleanup or block flush (mirror the existing PostHog-flush comment discipline in `src/start.ts`).
- **/ponytail full:** one builder, one middleware; no per-route header duplication, no deployment-only shadow config re-adding the same headers.
- **No bespoke UI / Astryx-first:** no presentation changes.
</standards>

<antipatterns>
- CSP so strict it silently breaks Clerk/PostHog/Sentry/maps + ld+json at runtime without failing any test → report-only phase first + the builder unit test pins the exact `script-src`/`connect-src`/`img-src`/`frame-ancestors` allowances; deployed violation observation gates the enforce switch (01-04).
- Headers added only in `vercel.json`/Nitro `routeRules` (rejected alternative) → the phase1 deploy smoke asserts headers on the served response, catching config-only drift.
- A second header-setting site beside the middleware → `src/start.ts` is the single source; the smoke asserts once per public route.
- Broad `string` CSP mode / directive map or `as` casts → `npm run test:ts-standards`.
- New internal/protocol vocabulary in any header value or comment leaking to a public surface → `npm run test:copy`.
</antipatterns>

<skill_usage>
- **security-best-practices (cso lens):** derive the minimal header set + CSP directives; threat-model frame-ancestors / referrer / permissions (maps to the standards-table "Security" mode).
- **tanstack-start-best-practices:** implement response middleware correctly in `src/start.ts`; confirm whether TanStack Start emits inline hydration/ld+json scripts needing a nonce/hash and whether a nonce can be threaded through SSR (ticket #2 core question).
- **playwright:** extend the phase1 deploy smoke `RouteExpectation` (the deployed assertion runs in 01-04).
- **tdd:** write the builder unit test first (report-only + enforce directive sets).
- **ponytail (full):** one builder + one middleware, no duplication.
- **code-review:** final Standards + Spec pass.
</skill_usage>

<preflight_gates>
- **Ticket #2 — Prototype a CSP that survives TanStack Start SSR (entry ticket):** resolved in Task 1 before Task 2 enforces; the report-only policy ships first.
- Enforced-CSP tightening + deployed header proof are BLOCKED until 01-04's deployed run (report-only violations observed against a real deployment first). This plan delivers source-owned middleware + report-only default + smoke-assertion code (all source-provable); the deployed enforce/proof is 01-04's.
- Public header values carry no booking/payment/dispatch/autonomous claims and no banned public vocabulary.
</preflight_gates>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Resolve ticket #2 (CSP that survives TanStack Start SSR) and pin the directive set</name>
  <files>src/lib/http/security-headers.ts, tests/unit/http/security-headers.test.ts, .env.example</files>
  <read_first>src/start.ts, src/routes/__root.tsx, tests/deploy-smoke/phase1-deploy-smoke.spec.ts, resolution inputs: local://tickets-scope-1.json (#2 body)</read_first>
  <action>Investigate whether TanStack Start emits inline hydration / ld+json / Clerk / PostHog / Sentry scripts that need a nonce or hash, and whether a nonce can be threaded through the SSR render. Encode the concrete directive set in a pure builder `src/lib/http/security-headers.ts` exposing report-only and enforce variants with `script-src`/`connect-src`/`frame-ancestors`/`img-src` values that keep Clerk + PostHog + Sentry + (optional) maps working, plus Referrer-Policy, Permissions-Policy (deny geolocation/camera/microphone), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`. Add an `AE_CSP_REPORT_ONLY`-style env NAME to `.env.example` (name only) so report-only can ship first. Write the builder unit test capturing the exact directive sets. Then post the resolution comment on issue #2, close it, and append one line to map issue #1 "Decisions so far".</action>
  <verify>npx vitest run tests/unit/http/security-headers.test.ts && npm run typecheck</verify>
  <acceptance_criteria>
    - The concrete report-only + enforce CSP directive sets are encoded and unit-tested.
    - Third-party script origins (Clerk/PostHog/Sentry/maps) and ld+json handling are documented in the resolution.
    - Issue #2 closed with a resolution comment; map issue #1 updated.
  </acceptance_criteria>
  <done>The CSP body is decided and testable, report-only first.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Add the security-header response middleware to src/start.ts</name>
  <files>src/start.ts, tests/unit/http/security-headers.test.ts</files>
  <read_first>src/start.ts, src/lib/http/security-headers.ts, resolution of #2</read_first>
  <action>Compose a response middleware in `src/start.ts` (alongside observability / CSRF / source-write-admission / clerk) that applies the builder's header set to HTML and JSON route responses, defaulting to report-only CSP driven by the env flag. Do not block response cleanup or flush. Extend the builder unit test to assert the middleware-applied header set for an HTML-shaped and a JSON-shaped response.</action>
  <verify>npm run typecheck && npx vitest run tests/unit/http/security-headers.test.ts</verify>
  <acceptance_criteria>
    - Middleware applies the full header set on HTML and JSON responses.
    - Report-only CSP is the default; enforce is env/flag-gated.
    - No `any`/`as`/non-null; existing middleware behavior preserved.
  </acceptance_criteria>
  <done>Headers are set in-process from one source-owned middleware.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Extend the phase1 deploy smoke with a per-route securityHeaders check</name>
  <files>tests/deploy-smoke/phase1-deploy-smoke.spec.ts</files>
  <read_first>tests/deploy-smoke/phase1-deploy-smoke.spec.ts, src/lib/http/security-headers.ts</read_first>
  <action>Add an optional `securityHeaders` field to the `RouteExpectation` type and assert it in the `publicRoutes` loop: CSP present (frame-ancestors 'none'), Referrer-Policy, Permissions-Policy, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`. Keep the smoke fail-loud on missing config. The assertion executes against the deployed origin in 01-04; this task lands only the source-side spec change (validate via typecheck).</action>
  <verify>npm run typecheck</verify>
  <acceptance_criteria>
    - RouteExpectation carries an optional securityHeaders check exercised in publicRoutes.
    - Smoke remains fail-loud and localhost-rejecting; no secrets embedded.
  </acceptance_criteria>
  <done>The deployed header assertion exists, ready for 01-04's run.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/unit/http/security-headers.test.ts
- [ ] npm run typecheck
- [ ] npm run test:ts-standards
- [ ] npm run test:copy
- [ ] (deployed, 01-04) npm run test:deploy-smoke  # asserts securityHeaders on the served response
</verification>

<success_criteria>
- Source-owned header middleware + pure builder; report-only CSP first with a documented, tested directive set.
- phase1 deploy smoke extended with securityHeaders (deployed proof handed to 01-04).
- Ticket #2 closed with resolution; ts-standards + copy scans green; no header duplication.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-01-production-landing/01-02-SUMMARY.md` stating source/local proof only; enforced-CSP tightening and the deployed header smoke are proven in 01-04 (production header proof NOT claimed here).
</output>
