---
phase: 01-ten-star-spine-foundation
plan: 07
subsystem: discovery-seo
tags: [tanstack-start, tanstack-router, convex, discovery, ucp, llms, sitemap, robots, seo, prompt-injection]
requires:
  - phase: 01-06-registry-search-api-repair
    provides: strict public catalog registry/API DTOs, projection attempts, route-boundary patterns
provides:
  - AE-hosted UCP fallback manifest builder from source-owned public catalog DTOs
  - durable discovery manifest attempt/readback/invalidation state with repair status
  - /{slug}/ucp, /llms.txt, /sitemap.xml, and /robots.txt routes with no-store/nosniff/CORS headers
  - prompt-injection and overclaim coverage for manifest and discovery text outputs
  - URL parity tests across manifest, llms, sitemap, robots, public page, and public API routes
affects: [phase-01-closeout, phase-02, phase-03-discovery, seo-aeo, public-api]
tech-stack:
  added: []
  patterns:
    - source-owned discovery generation from PublicCatalogContract only
    - escaped-dot TanStack Start route files for machine-readable root routes
    - generated discovery URL parity through route handlers
key-files:
  created:
    - src/modules/discovery/internal/ucp-manifest.ts
    - src/modules/discovery/internal/manifest-attempts.ts
    - src/modules/discovery/internal/discovery-files.ts
    - src/modules/discovery/internal/source-state.ts
    - src/lib/http/discovery-response.ts
    - src/routes/$slug.ucp.ts
    - src/routes/llms[.]txt.ts
    - src/routes/sitemap[.]xml.ts
    - src/routes/robots[.]txt.ts
    - tests/unit/discovery/ucp-manifest.test.ts
    - tests/unit/discovery/manifest-attempts.test.ts
    - tests/integration/discovery-routes.test.ts
    - tests/integration/discovery-prompt-injection.test.ts
    - tests/integration/discovery-route-parity.test.ts
    - tests/seo/discovery-files.test.ts
    - tests/copy/discovery-overclaim.test.ts
  modified:
    - src/modules/discovery/public.ts
    - src/modules/discovery/internal/schema.ts
    - src/modules/catalog/internal/publish.ts
    - convex/discovery.ts
    - src/routeTree.gen.ts
key-decisions:
  - "Discovery manifests are AE-hosted fallback documents only; no merchant-origin well-known claim is emitted."
  - "llms.txt lists canonical links and source-owned status fields only, not owner-authored names, summaries, notes, disclosures, Markdown, HTML, or bidi payloads."
  - "Discovery route availability is proven by in-process route-handler parity tests rather than hand-authored static files."
patterns-established:
  - "Discovery routes use src/lib/http/discovery-response.ts for no-store, CORS, nosniff, and escaped JSON/text responses."
  - "Manifest generation sanitizes owner-authored fields before serialization and keeps capability state in structured negative flags."
requirements-completed: [R7, R10]
coverage:
  - id: D1
    description: "AE-hosted UCP fallback manifest from PublicCatalogContract with source hash/version, body hash, URL hash, route-tested URLs, and explicit negative capability flags."
    requirement: R7
    verification:
      - kind: unit
        ref: "tests/unit/discovery/ucp-manifest.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Discovery manifest attempt/readback/invalidation state with repair visibility and suppression invalidation."
    requirement: R7
    verification:
      - kind: unit
        ref: "tests/unit/discovery/manifest-attempts.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "/{slug}/ucp route with public-only manifest body, 404 shape, no-store, CORS, and nosniff headers."
    requirement: R7
    verification:
      - kind: integration
        ref: "tests/integration/discovery-routes.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "/llms.txt, /sitemap.xml, and /robots.txt generated from eligible public catalog state with suppressed catalogs omitted."
    requirement: R7
    verification:
      - kind: other
        ref: "npm run test:seo"
        status: pass
    human_judgment: false
  - id: D5
    description: "Prompt-injection and overclaim guards keep owner text inert and unsupported protocol/action/payment claims absent."
    requirement: R10
    verification:
      - kind: integration
        ref: "tests/integration/discovery-prompt-injection.test.ts"
        status: pass
      - kind: other
        ref: "npm run test:copy"
        status: pass
      - kind: other
        ref: "npm run test:source-mining"
        status: pass
    human_judgment: false
  - id: D6
    description: "Every URL emitted by UCP manifests, llms, sitemap, and robots resolves through route tests or is omitted."
    requirement: R7
    verification:
      - kind: integration
        ref: "tests/integration/discovery-route-parity.test.ts"
        status: pass
    human_judgment: false
duration: 26min
completed: 2026-06-28
status: complete
---

# Phase 01 Plan 07: Discovery, llms, Sitemap, Robots Summary

**AE-hosted discovery outputs from public catalog DTOs with manifest readback, prompt-injection guards, and route-tested llms/sitemap/robots URLs.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-06-28T02:19:27Z
- **Completed:** 2026-06-28T02:45:38Z
- **Tasks:** 6
- **Files modified:** 21

## Accomplishments

- Built the source-owned discovery manifest contract and builder for AE-hosted `/{slug}/ucp` fallback output, including source hash/version, generated/body/URL hashes, route-tested URLs, and explicit negative capability flags.
- Added discovery manifest regeneration, readback, failure, retry, health, and invalidation state with publish queuing metadata and fail-closed Convex wrappers.
- Added `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, and `/robots.txt` route adapters with route-safe response headers and generated route-tree support.
- Added prompt-injection, overclaim, suppression, and route parity coverage across unit, integration, SEO, copy, source-mining, and import gates.

## Task Commits

1. **Task A: Discovery manifest builder** - `690247e` (feat)
2. **Task B: Discovery attempt/readback/invalidation** - `35357b4` (feat)
3. **Task C: UCP route and headers** - `2e86997` (feat)
4. **Task D: llms/sitemap/robots generators and routes** - `cfb004b` (feat)
5. **Task E: Prompt-injection and overclaim tests** - `706f0bf` (test)
6. **Task F: Route parity/dead-link tests** - `0e56f9b` (test)
7. **Generated route-tree auto-fix** - `6cc9625` (fix)

## Files Created/Modified

- `src/modules/discovery/internal/ucp-manifest.ts` - UCP fallback manifest projection and owner-text sanitizer.
- `src/modules/discovery/internal/manifest-attempts.ts` - discovery regeneration, readback, retry, health, and invalidation logic.
- `src/modules/discovery/internal/discovery-files.ts` - `llms.txt`, sitemap, and robots builders.
- `src/modules/discovery/public.ts` and `src/modules/discovery/internal/schema.ts` - public contracts and Convex schema fields.
- `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts` - route adapters.
- `src/lib/http/discovery-response.ts` - shared discovery response headers and JSON escaping.
- `tests/unit/discovery/*`, `tests/integration/discovery-*`, `tests/seo/discovery-files.test.ts`, `tests/copy/discovery-overclaim.test.ts` - behavior and guardrail coverage.

## Decisions Made

- Used escaped-dot route filenames (`llms[.]txt.ts`, `sitemap[.]xml.ts`, `robots[.]txt.ts`) after checking installed TanStack Start docs.
- Kept `/llms.txt` intentionally sparse: canonical routes plus status fields, no owner-authored free text.
- Let Vite/TanStack generate final route-tree naming/order after build and committed that generated source.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed raw-contact-shaped first-request marker from UCP manifest**
- **Found during:** Task A
- **Issue:** The initial manifest inherited `rawContactExcluded` from the catalog DTO. It was not raw contact data, but the field name is not needed in UCP output and weakens the public allowlist.
- **Fix:** Added a narrower `DiscoveryManifestFirstRequestContract` that carries public mode/channel/disclosure only.
- **Files modified:** `src/modules/discovery/public.ts`, `src/modules/discovery/internal/ucp-manifest.ts`, `tests/unit/discovery/ucp-manifest.test.ts`
- **Verification:** `npm run test:unit -- tests/unit/discovery/ucp-manifest.test.ts`, `npm run typecheck`
- **Committed in:** `690247e`

**2. [Rule 1 - Bug] Expanded owner-text sanitizer for URI and instruction payloads**
- **Found during:** Task E
- **Issue:** A prompt-injection fixture left `javascript:` text in a public disclosure string after Markdown stripping.
- **Fix:** Neutralized script-style URI text, instruction phrases, Markdown control characters, endpoint self-claims, and capability/trust upgrade words in manifest owner-authored fields.
- **Files modified:** `src/modules/discovery/internal/ucp-manifest.ts`, `tests/integration/discovery-prompt-injection.test.ts`
- **Verification:** `npm run test:integration -- tests/integration/discovery-prompt-injection.test.ts tests/integration/discovery-routes.test.ts`, `npm run test:copy`
- **Committed in:** `706f0bf`

**3. [Rule 3 - Blocking] Accepted generated route-tree naming/order after build**
- **Found during:** Final verification
- **Issue:** `vite build` regenerated `src/routeTree.gen.ts` with TanStack's escaped-dot route identifiers/order, leaving the worktree dirty after all task commits.
- **Fix:** Committed the generated route-tree alignment.
- **Files modified:** `src/routeTree.gen.ts`
- **Verification:** `npm run typecheck`, `npm run build`
- **Committed in:** `6cc9625`

**Total deviations:** 3 auto-fixed (Rule 1: 1, Rule 2: 1, Rule 3: 1)
**Impact on plan:** All fixes were required for privacy, prompt-injection safety, or generated-route correctness. No out-of-scope product surface was added.

## Verification

- `npm run typecheck` - passed
- `npm run test:unit` - passed, 22 files / 62 tests
- `npm run test:integration` - passed, 5 files / 13 tests
- `npm run test:seo` - passed, 2 files / 7 tests
- `npm run test:copy` - passed, 3 files / 21 tests
- `npm run test:source-mining` - passed, 1 file / 1 test
- `npm run test:imports` - passed, 3 files / 3 tests
- `npm run build` - passed
- `npm run check:convex-codegen` - failed without network escalation: Convex CLI attempted telemetry/network access and failed DNS lookup for `o1192621.ingest.sentry.io`. Real Clerk issuer values are still absent, so codegen remains environment/network gated.
- `npm run test:e2e` - sandboxed run failed to start Vite with `listen EPERM`; escalated local-process rerun completed with 4 passed / 12 failed. Passing: skip-link a11y in compact/wide and registry search in compact/wide. Failures are the known public-owner claim/privacy/page locator/focus issues from prior waves; the suite has no discovery-specific browser spec. Discovery-specific route behavior passed in integration and parity tests.

## Known Stubs

None. Stub scan found only harmless optional-parameter defaults and existing truthful "not available yet" current-phase copy.

## Auth Gates

- Convex codegen remains gated on external network/telemetry access and missing real Clerk issuer configuration. This was treated as an environment gate, not a product failure.

## Metadata Notes

- `roadmap.update-plan-progress` was not run because `.planning/ROADMAP.md` was explicitly listed as unrelated dirty planning state to leave untouched for this execution.
- `requirements.mark-complete R7 R10` reported `REQUIREMENTS.md not found`; requirements are recorded in this summary frontmatter but no requirements file was updated.

## Deferred Issues

- Existing Playwright public-owner failures remain outside this plan:
  - duplicate unavailable-copy locator on home
  - claim form default-value/navigation expectations
  - missing claim-success heading expectation
  - duplicate `Parramatta, NSW` locator on public page
  - privacy removal focus expectation
- No discovery-specific E2E browser assertion exists yet; route-level discovery coverage is integration/SEO/copy/source-mining based.

## User Setup Required

None for local discovery route/module operation. Real Convex codegen still requires Clerk issuer configuration plus explicit approval for networked Convex CLI access.

## Next Phase Readiness

Phase 1 closeout can now smoke `/parramatta-emergency-plumbing/ucp`, `/llms.txt`, `/sitemap.xml`, and `/robots.txt` from source-owned public catalog state. Phase 3 can build read-only discovery/developer surfaces on these honest fallback outputs without inheriting merchant-origin or callable/payment claims.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/01-ten-star-spine-foundation/01-07-discovery-llms-sitemap-robots-SUMMARY.md`.
- Task commits found: `690247e`, `35357b4`, `2e86997`, `cfb004b`, `706f0bf`, `0e56f9b`, `6cc9625`.
- No unexpected tracked file deletions were introduced by task commits.

---
*Phase: 01-ten-star-spine-foundation*
*Completed: 2026-06-28*
