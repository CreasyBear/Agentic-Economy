# 01-02 Security header middleware — SUMMARY

## Source changes

- Added `src/lib/http/security-headers.ts` as the single pure builder/application seam for the Phase 1 browser header set.
- Added one TanStack Start request middleware in `src/start.ts` that wraps downstream responses and applies the header set to HTML and JSON responses.
- Added `AE_CSP_REPORT_ONLY=` to `.env.example` as a name-only rollout flag, preserving `AE_CANONICAL_BASE_URL=` and `AE_CANONICAL_HOST_ALLOWLIST=`.
- Added `tests/unit/http/security-headers.test.ts` for report-only/enforce builder behavior, CSP directive coverage, env mode resolution, and HTML/JSON response application.
- Extended `tests/deploy-smoke/phase1-deploy-smoke.spec.ts` with optional `securityHeaders` expectations on HTML and JSON public routes.

## CSP resolution for ticket #2

- Default mode is report-only: unset/true `AE_CSP_REPORT_ONLY` emits `Content-Security-Policy-Report-Only`.
- Enforcement is opt-in only after deployed observation: `AE_CSP_REPORT_ONLY=false` or `0` emits `Content-Security-Policy`.
- The directive set pins `frame-ancestors 'none'` and keeps the current production integrations available through explicit Clerk, PostHog, Sentry, Google Maps, and Convex allowances.
- Current TanStack Start SSR uses `<Scripts />` in `src/routes/__root.tsx`; this phase does not thread a nonce through SSR. The policy therefore keeps `script-src 'unsafe-inline'` for hydration and future inline JSON-LD compatibility, while avoiding `unsafe-eval`. A stricter nonce/hash policy is a later tightening after 01-04 report-only deployment evidence.
- GitHub issue #2 was commented with the resolution and closed as completed. Map issue #1 received a decision update comment.

## Local/source verification

- `npx vitest run tests/unit/http/security-headers.test.ts` — passed: 1 test file, 8 tests.
- `npm run typecheck` — passed: `tsc --noEmit` completed with exit code 0.
- `npm run test:ts-standards` — passed after the wave fixed the pre-existing broad `SessionJourney.status` UI text field by renaming it to `statusText` and removed the `/about` non-null assertion with a non-empty `offerSteps` tuple.
- `npm run test:copy` — passed: 5 test files, 46 tests.

## Deferred proof

- Enforced CSP rollout proof is not claimed here. It remains gated to 01-04 after report-only violations are observed against a real deployment.
- Deployed header proof is not claimed here. The source-side deploy-smoke assertions are in place; 01-04 owns running `npm run test:deploy-smoke` against the provisioned deployed environment.
