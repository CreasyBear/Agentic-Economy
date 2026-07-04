---
phase: scope-01-production-landing
plan: "01-01"
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/server/canonical-url.ts
  - src/routes/$slug.tsx
  - src/routes/llms[.]txt.ts
  - src/routes/sitemap[.]xml.ts
  - src/routes/robots[.]txt.ts
  - src/routes/$slug.ucp.ts
  - src/routes/api.discovery.schema.ts
  - src/modules/discovery/internal/discovery-files.ts
  - .env.example
  - tests/seo/canonical-base-url.test.ts
autonomous: true
requirements: [D4]
user_setup:
  - "Set AE_CANONICAL_BASE_URL and AE_CANONICAL_HOST_ALLOWLIST on the Vercel deployment (names only; no values recorded here). Executed as part of 01-04 provisioning."
execution_scope: source_local
production_executable: true
must_haves:
  truths:
    - id: s1-canonical-single-source
      statement: "One server helper resolves the canonical base URL for every public artifact; per-route origin derivation is deleted, not duplicated."
    - id: s1-no-ae-example-in-prod
      statement: "No public route emits https://ae.example when a configured canonical or allowlisted host is present; the $slug.tsx hardcode is removed."
    - id: s1-host-allowlisted-fallback
      statement: "request.url origin is used only as a fallback when its host is in the allowlist; an unlisted forwarded host never becomes the canonical."
  artifacts:
    - path: src/lib/server/canonical-url.ts
      provides: "resolveCanonicalBaseUrl(request) with env-var config + host allowlist + validated request-origin fallback, returning a discriminated result."
    - path: tests/seo/canonical-base-url.test.ts
      provides: "Forwarded-host, explicit-canonical, and no-ae.example coverage across llms/sitemap/robots/ucp/schema/$slug output."
  key_links:
    - from: public discovery/SEO routes
      to: resolveCanonicalBaseUrl
      via: "Every canonical/sitemap/robots/UCP/schema/$slug link is built from the helper, not new URL(request.url).origin."
    - from: AE_CANONICAL_HOST_ALLOWLIST
      to: canonical output
      via: "Unlisted forwarded host is rejected as canonical and falls back to the configured base URL."
---

<objective>
Replace the six duplicated `requestOrigin(request)` derivations and the `$slug.tsx` hardcoded `https://ae.example` canonical with one source-owned server helper `resolveCanonicalBaseUrl(request)` backed by an env var and a host allowlist (ADR-001 D4). Fixes a live production SEO/discovery defect (rel=canonical pointing at the placeholder domain) and makes every advertised URL deterministic under proxy forwarding.

Purpose: canonical public URLs become consistent and host-safe across SEO metadata, sitemap, robots, UCP, discovery schema, and llms.txt.
Output: new helper + env-var names, seven migrated call sites, forwarded-host/explicit-canonical route tests.
</objective>

<how_to_execute>
Fresh session: read the scope INDEX (`SCOPE-01-INDEX.md`), then execute this plan's tasks in order; TDD where marked (write/adjust `tests/seo/canonical-base-url.test.ts` before the helper and before migrating sites); run each task's `<verify>` after the task; on completion write the SUMMARY.md named in `<output>`.
</how_to_execute>

<context>
@.planning/adr/ADR-001-scope1-production-landing.md
@.planning/ENGINEERING-STANDARDS.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/CONCERNS.md
@AGENTS.md
@src/routes/$slug.tsx
@src/routes/llms[.]txt.ts
@src/routes/sitemap[.]xml.ts
@src/routes/robots[.]txt.ts
@src/routes/$slug.ucp.ts
@src/routes/api.discovery.schema.ts
@src/modules/discovery/internal/discovery-files.ts
@src/lib/server/convex-source.ts
@tests/seo/discovery-files.test.ts
</context>

<standards>
Rules that bind this plan's files (ENGINEERING-STANDARDS.md + CONVENTIONS.md):
- **TypeScript hard spec:** no `any`/`as any`/`as unknown as`/non-null; `resolveCanonicalBaseUrl` returns a discriminated result (`{ kind: 'configured' | 'allowlisted-origin' | 'fallback', baseUrl }`), no broad `string` for host source; `exactOptionalPropertyTypes` — optional env read via conditional spread, never `= undefined`.
- **Route/server-function boundary:** the helper lives in `src/lib/server/` (server source layer); routes import it, they do not re-implement origin logic or import module `internal/`. Routes stay thin (CONVENTIONS §Routes).
- **Naming:** `resolveCanonicalBaseUrl`, `read*`/`validate*` prefixes; `Values`/`Schema` suffixes if a union is introduced (CONVENTIONS §Naming).
- **SEO/AEO standard:** public pages need a correct canonical; sitemap includes only eligible canonical URLs; `llms.txt` is a truth file (ENGINEERING-STANDARDS §SEO/AEO; follow SEO-AEO-SPEC via seo-audit).
- **/ponytail full:** one helper; delete the per-route `requestOrigin` duplication and the discovery-files default placeholder — clean cutover, no shim keeping `ae.example` alive.
- **No bespoke UI / Astryx-first:** this plan touches no presentation; add no `Ae*`/CSS.
</standards>

<antipatterns>
Relapses this plan could cause and the scan/test that catches each (AGENTS.md trust contract + ROADMAP bloat-relapse detector):
- Emitting `https://ae.example` in production output → `tests/seo/canonical-base-url.test.ts` asserts the placeholder never appears under a configured/allowlisted host; grep in the test confirms no route retains the literal fallback.
- A *second* canonical-resolution path left beside the helper (partial migration) → the seo test exercises all seven sites; `npm run test:seo` fails if any still derives origin locally.
- Trusting an arbitrary forwarded `Host` as canonical (host-spoof / cache-poisoning) → allowlist test: unlisted host falls back to the configured base URL.
- Broad `string` host/kind or `as` casts to satisfy the union → `npm run test:ts-standards`.
- Leaking internal vocabulary into any newly written public string → `npm run test:copy` (banned public vocabulary).
</antipatterns>

<skill_usage>
- **ponytail (full):** enforce delete-first — collapse six `requestOrigin` copies + the `$slug.tsx` hardcode + the `discovery-files.ts` default into one helper; no new abstraction beyond the helper.
- **tanstack-start-best-practices:** correct server-side request/forwarded-host handling and a canonical-URL helper as a server utility (maps to the standards-table "TanStack routes/server functions" mode).
- **tanstack-router-best-practices:** keep route files thin adapters that consume the helper.
- **seo-audit + ai-seo + schema:** validate canonical/sitemap/robots/UCP/JSON-LD correctness after migration (maps to "SEO/AEO" mode).
- **tdd:** write `tests/seo/canonical-base-url.test.ts` cases first (forwarded-host, explicit-canonical, no-ae.example).
- **code-review:** final Standards + Spec pass.
</skill_usage>

<preflight_gates>
- No blocking ticket. No deployed env required for source proof.
- `AE_CANONICAL_BASE_URL` / `AE_CANONICAL_HOST_ALLOWLIST` deployment values are user_setup (provisioned in 01-04); tests use injected/config values, never real secrets.
- Public copy stays boundary-honest; no new claim vocabulary in emitted URLs.
</preflight_gates>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add resolveCanonicalBaseUrl server helper + env-var names</name>
  <files>src/lib/server/canonical-url.ts, .env.example, tests/seo/canonical-base-url.test.ts</files>
  <read_first>src/lib/server/convex-source.ts, src/routes/llms[.]txt.ts, .planning/codebase/CONVENTIONS.md</read_first>
  <action>Create `src/lib/server/canonical-url.ts` exporting `resolveCanonicalBaseUrl(request: Request)` returning a discriminated union `{ kind: 'configured' | 'allowlisted-origin' | 'fallback', baseUrl: string }`. Read `AE_CANONICAL_BASE_URL` and `AE_CANONICAL_HOST_ALLOWLIST` (comma-separated hosts). Policy: prefer the configured canonical; else use `new URL(request.url).origin` only when its host is in the allowlist; never return `https://ae.example`. Add both env var NAMES to `.env.example` (names only, no values). Write the helper's unit cases in `tests/seo/canonical-base-url.test.ts` first (configured wins, allowlisted forwarded host accepted, unlisted host rejected → configured fallback, empty config → deterministic non-placeholder fallback).</action>
  <verify>npx vitest run tests/seo/canonical-base-url.test.ts && npm run typecheck</verify>
  <acceptance_criteria>
    - Helper returns a typed result; no `any`/`as`/non-null; optional env via conditional spread.
    - Configured canonical beats request origin; unlisted forwarded host never becomes canonical.
    - `.env.example` lists both names with no values.
  </acceptance_criteria>
  <done>One source-owned canonical-URL resolver exists with tests.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fix the $slug.tsx hardcode and migrate all seven origin sites</name>
  <files>src/routes/$slug.tsx, src/routes/llms[.]txt.ts, src/routes/sitemap[.]xml.ts, src/routes/robots[.]txt.ts, src/routes/$slug.ucp.ts, src/routes/api.discovery.schema.ts, src/modules/discovery/internal/discovery-files.ts</files>
  <read_first>src/lib/server/canonical-url.ts, src/routes/$slug.tsx, src/routes/api.discovery.schema.ts, src/modules/discovery/internal/discovery-files.ts</read_first>
  <action>Replace the hardcoded `canonicalBaseUrl: 'https://ae.example'` in `$slug.tsx` with the helper first. Then delete each private `requestOrigin(request)` (llms.txt, sitemap.xml, robots.txt, $slug.ucp, api.discovery.schema — including the developer-discovery snapshot) and route every canonical/sitemap/robots/UCP/schema link through `resolveCanonicalBaseUrl`. Replace the `https://ae.example` default in `discovery-files.ts` with a required, resolver-supplied base URL (no placeholder fallback left in source). Clean cutover — remove the dead `requestOrigin` functions.</action>
  <verify>npm run typecheck && npm run test:seo</verify>
  <acceptance_criteria>
    - No `requestOrigin` derivation and no `https://ae.example` literal remains in the seven sites.
    - All canonical/discovery links build from the helper.
  </acceptance_criteria>
  <done>Every public URL source uses the one helper.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Route-output tests for forwarded-host and explicit-canonical</name>
  <files>tests/seo/canonical-base-url.test.ts</files>
  <read_first>tests/seo/discovery-files.test.ts, src/routes/sitemap[.]xml.ts, src/routes/$slug.ucp.ts</read_first>
  <action>Extend `tests/seo/canonical-base-url.test.ts` to drive the llms.txt / sitemap.xml / robots.txt / $slug.ucp / api.discovery.schema / $slug canonical output under (a) explicit `AE_CANONICAL_BASE_URL` and (b) a forwarded/proxy host — asserting the configured canonical is emitted, an unlisted host is not, and `https://ae.example` never appears. Update any existing SEO test that asserted the old `ae.example` fallback to the new behavior.</action>
  <verify>npm run test:seo && npm run test:copy</verify>
  <acceptance_criteria>
    - Forwarded-host and explicit-canonical scenarios covered for the discovery/SEO routes.
    - No test still expects `ae.example`; copy scan stays green.
  </acceptance_criteria>
  <done>Canonical output is regression-guarded across proxy scenarios.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/seo/canonical-base-url.test.ts
- [ ] npm run test:seo
- [ ] npm run typecheck
- [ ] npm run test:ts-standards
- [ ] npm run test:copy
</verification>

<success_criteria>
- One canonical-URL helper; all seven origin sites migrated; `$slug.tsx` hardcode removed.
- No `https://ae.example` in production output; forwarded-host/explicit-canonical tests green.
- No second URL-resolution path; ts-standards + copy scans green with zero new allowances.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-01-production-landing/01-01-SUMMARY.md` stating source/local proof only (canonical env values are deployment user_setup, applied in 01-04).
</output>
