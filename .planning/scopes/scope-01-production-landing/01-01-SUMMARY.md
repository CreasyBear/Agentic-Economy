# 01-01 Summary — Canonical base URL helper

## Source changes

- Added `src/lib/server/canonical-url.ts` with `resolveCanonicalBaseUrl(request: Request)` returning `{ kind: 'configured' | 'allowlisted-origin' | 'fallback', baseUrl }`.
- Added names-only env entries in `.env.example`:
  - `AE_CANONICAL_BASE_URL=`
  - `AE_CANONICAL_HOST_ALLOWLIST=`
- Migrated the seven 01-01 URL sites to the helper:
  - `src/routes/$slug.tsx`
  - `src/routes/llms[.]txt.ts`
  - `src/routes/sitemap[.]xml.ts`
  - `src/routes/robots[.]txt.ts`
  - `src/routes/$slug.ucp.ts`
  - `src/routes/api.discovery.schema.ts`
  - `src/modules/discovery/internal/discovery-files.ts`
- Removed the route-local `requestOrigin` helpers from the migrated routes.
- Removed the `https://ae.example` fallback from `discovery-files.ts` and `ucp-manifest.ts`; discovery file and UCP manifest builders now require a resolver-supplied `canonicalBaseUrl`.
- Added `tests/seo/canonical-base-url.test.ts` covering configured canonical, allowlisted origin, unlisted-host fallback, and public SEO/discovery outputs.
- Made the manifest builder/regeneration path carry required canonical base URLs through `BuildCatalogDiscoveryManifestInput`, `RegenerateDiscoveryManifestOptions`, and `ReadCatalogDiscoveryManifestInput`.
- Split route SEO into `src/modules/seo/public-route.ts` and added `src/lib/server/canonical-url.functions.ts` so `$slug.tsx` gets request-derived canonical base URLs through an explicit TanStack server function instead of importing server-only request utilities in the route/client module.

## Local proof

- `npx vitest run tests/seo/canonical-base-url.test.ts` — passed: 1 file, 6 tests.
- `npm run test:seo` — passed: 7 files, 23 tests.
- `npm run typecheck` — passed.
- `npm run test:copy` — passed: 5 files, 46 tests.
- `npx vitest run tests/unit/discovery/ucp-manifest.test.ts tests/unit/discovery/manifest-attempts.test.ts tests/unit/discovery/developer-discovery-kill-rules.test.ts tests/unit/discovery/developer-discovery-parity.test.ts tests/unit/discovery/developer-discovery-route.test.ts tests/unit/discovery/developer-discovery-support-matrix.test.ts tests/integration/developer-discovery.test.ts` — passed: 7 files, 24 tests.
- `npm run test:all` — passed after the server-boundary fix for `$slug.tsx`.
- Target/source scan: `src/routes/$slug.tsx`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/routes/robots[.]txt.ts`, `src/routes/$slug.ucp.ts`, `src/routes/api.discovery.schema.ts`, `src/modules/discovery/internal/discovery-files.ts`, `src/modules/discovery/internal/ucp-manifest.ts`, and `src/modules/discovery/internal/manifest-attempts.ts` have no `https://ae.example`, `requestOrigin(`, `request-origin`, or `new URL(request.url).origin` matches.

## Deferred production setup

- Deployment values for `AE_CANONICAL_BASE_URL` and `AE_CANONICAL_HOST_ALLOWLIST` remain 01-04 user setup. No secret or deployed value is recorded here.
