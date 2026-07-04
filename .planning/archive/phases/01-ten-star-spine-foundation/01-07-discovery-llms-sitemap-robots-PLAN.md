---
phase: 01
plan: 07
slug: discovery-llms-sitemap-robots
status: ready-for-execution
wave: 7
depends_on: [01-01-substrate-and-guardrails, 01-02-contracts-schema-idempotency-admin-foundation, 01-03-business-claim-publish-suppress, 01-04-admin-dispute-operator-recovery, 01-05-public-owner-ui-routes, 01-06-registry-search-api-repair]
requirements: [R7, R10]
created: 2026-06-27
---

# 01-07 — Discovery, llms, Sitemap, Robots Plan

## Objective

Generate honest AE-hosted discovery outputs from eligible source-owned public catalog state: `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, and `/robots.txt`, with route-tested URLs, headers/cache policy, stale/readback state, suppression safety, prompt-injection protection, and explicit unsupported capabilities.

## Authority Inputs

- `01-SPEC.md` R7 and prohibitions.
- `PHASE.md` PR07.
- `01-PATTERNS.md` clusters 7, 11, 15, 16.
- `.planning/AI-SPEC.md`, `.planning/SEO-AEO-SPEC.md`, `.planning/AGENTIC-MARKET-STUDY.md`.
- Source-mining ledger rows for UCP and discovery route analogs.
- Skills: `tanstack-start-best-practices`, `tanstack-router-best-practices`, `convex`, `accessibility` for rendered route links where applicable.

## Scope

### In

- `buildCatalogDiscoveryManifest`, `regenerateDiscoveryManifest`, `buildLlmsTxt`, `buildSitemapXml`, `buildRobotsTxt` through discovery/SEO modules.
- Routes: `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`.
- Discovery manifest attempt/readback state, source hash/version/body hash/URL hash, route-tested URL omission.
- Prompt-injection fixtures and owner-text escaping for manifest/API/JSON-LD; `/llms.txt` excludes owner-authored free text except canonical links and source-owned status fields.

### Out

- No merchant-origin `/.well-known/ucp` claim, no MCP/OpenAPI/API-key docs, no callable tools, no payment handlers, no provider webhooks, no protected actions, no agent runtime.

## Implementation Steps

| ID | Change | Files | Acceptance |
|----|--------|-------|------------|
| 01-07-A | Implement discovery manifest builder from catalog DTO. | `src/modules/discovery/internal/ucp-manifest.ts`, tests | Valid/degraded/suppressed fixtures pass; manifest carries AE-hosted fallback/path kind and unsupported capability state; `callable:false` and `paymentRequired:false` appear only as explicit negative capability flags in approved public DTO/manifest schemas. |
| 01-07-B | Implement discovery attempt/readback/invalidation. | `src/modules/discovery/public.ts`, `convex/discovery.ts` | Publish/edit/suppress/version bump regenerates or invalidates; stale/degraded state is visible. |
| 01-07-C | Implement UCP route and headers. | `apps/web` route for `/{slug}/ucp` | Content-type/cache/CORS/no-store/nosniff behavior tested; no dead advertised URLs. |
| 01-07-D | Implement llms/sitemap/robots generators and routes. | discovery/seo modules and routes | Only eligible public canonical routes appear; private/admin/claim-continuation/suppressed URLs absent; crawler posture matches SEO-AEO spec. |
| 01-07-E | Add prompt-injection and overclaim tests. | `tests/seo/*`, `tests/copy/*`, `tests/integration/discovery*.test.ts` | Owner text cannot mark listing verified/callable/payable; banned protocol/payment/action fields absent; `llms.txt` omits owner-authored summaries, notes, disclosures, Markdown, HTML, and Unicode-bidi payloads. |
| 01-07-F | Add route parity/dead-link tests. | route/API tests | Every URL in llms/sitemap/manifest resolves or is omitted; API examples match schema. |

## Product Design Pass

- **Primary user/job/object/outcome:** search/agent consumer reads machine-facing facts; object is AE-hosted discovery projection; outcome is current public facts with unsupported capabilities explicit and no instruction injection.
- **States:** valid, degraded, stale, suppressed/absent, unavailable capability, no public contact, route omitted due to failed readback.
- **Copy:** say "AE-hosted discovery fallback" and "not callable/payable" where machine-readable; never say standard merchant-origin UCP.
- **Trust:** discovery availability means current route readback succeeded for the source hash; it does not mean verified, callable, payable, or demand-backed.

## Verification

```text
npm run typecheck
npm run check:convex-codegen
npm run test:unit
npm run test:integration
npm run test:seo
npm run test:copy
npm run test:source-mining
npm run test:e2e
npm run build
```

## Stop Conditions

- Any discovery output advertises a URL that is not route-tested.
- Any output contains MCP/OpenAPI/API-key/payment/callable/protected-action fields or merchant-origin `.well-known` claims.
- Suppression leaves stale listing in page/search/API/sitemap/llms/UCP.
- Owner-authored text is emitted unescaped into JSON, HTML, Markdown, JSON-LD, or instruction-like prose.
