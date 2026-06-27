# SEO + AEO Spec — Phase 1

**Purpose:** make discoverability source-owned, crawlable, and honest.

## Public business service catalog SEO contract

Implement module-owned contracts, not per-route ad hoc metadata:

```ts
buildPublicBusinessSeo(publicBusinessCatalog): PublicBusinessSeoResult
buildPublicServiceSchema(publicService): PublicServiceSchemaResult
```

Required for published public business catalog pages:

- unique `<title>` from source business/service state,
- unique meta description from source business/service state,
- one H1 from source state,
- service/suburb phrases generated only from source-owned service rows,
- self-canonical URL,
- `LocalBusiness` JSON-LD only when public source fields support it,
- `Service` JSON-LD only from source-owned `businessServices` rows and never with price/payment/review fields,
- `BreadcrumbList` JSON-LD for registry -> business navigation,
- escaped JSON-LD values,
- no private/internal fields.

Public JSON catalog routes must be crawlable/debuggable even though they are not SEO landing pages:

- `GET /api/businesses` lists eligible published businesses with service summaries,
- `GET /api/businesses/search?q=` returns the same DTO shape filtered by business/service/category/suburb text,
- `GET /api/businesses/{slug}` returns the public business catalog detail,
- all three routes share one schema, stable IDs/slugs, pagination, explicit status fields, and no private owner/contact fields.

Required noindex:

- unpublished business,
- suppressed business,
- unavailable/deleted business,
- `/claim/success`,
- admin/operator routes,
- dispute/removal evidence routes,
- duplicate claim continuations.

Schema avoid-list unless source-owned facts exist:

```text
Review
AggregateRating
Offer
Product
FAQPage
HowTo
openingHours
priceRange
paymentAccepted
```

`Service` schema is allowed only for published source-owned service rows. No review/rating/offer/payment schema in Phase 1.

## Discovery-file contract

### `/sitemap.xml`

Include only:

- canonical public static URLs,
- published, non-suppressed `/{slug}` pages.

Exclude:

- claim continuations,
- `/claim/success`,
- admin/operator/dashboard routes,
- dispute evidence,
- removal evidence,
- unpublished/suppressed/disputed businesses,
- localhost/preview/private URLs,
- stale UCP paths unless valid and public.

### `/robots.txt`

Must:

- declare sitemap,
- disallow private/admin/operator/claim-continuation/dispute evidence routes,
- intentionally allow citation/search crawlers unless a future business decision changes it.

Default allowed crawlers:

```text
Googlebot
Bingbot
GPTBot
ChatGPT-User
PerplexityBot
ClaudeBot
anthropic-ai
```

### `/llms.txt`

Must:

- enumerate only current public surfaces,
- state unsupported capabilities clearly,
- link per-business AE-hosted UCP fallback without standard-origin claims,
- avoid payment/callable/verified/partner/demand overclaims,
- link canonical privacy/removal route.

## Canonical removal route

Canonical path:

```text
/privacy/remove-business
```

If `/remove-business` exists, redirect it. Only canonical URL appears in sitemap, llms, footer, and public pages.

## AEO and AI citation posture

Phase 1 optimizes for crawlability and extractability, not fake AI claims.

Required:

- semantic HTML,
- clear status text from source state,
- concise definition blocks on public pages,
- machine-readable status via generated discovery outputs,
- no JS-only critical content,
- no blocked citation crawlers by default,
- no separate AI-bait content that differs from public truth.

Agent-readable `llms.txt`/skill-style guidance must describe the registry API exactly: route list, query semantics, response fields, unsupported actions, and examples. It must not describe payment, booking, MCP, OpenAPI, or agent-callable actions until those are implemented.

## Measurement gates

Before public launch:

- rendered route smoke for `/`, `/registry`, one published `/{slug}`, `/api/businesses`, `/api/businesses/search?q=`, `/api/businesses/{slug}`, `/sitemap.xml`, `/robots.txt`, `/llms.txt`, and sample `/{slug}/ucp`,
- schema validation for one published business service catalog page,
- list/search/detail API schema compatibility check,
- Search Console sitemap submission/readback when domain exists,
- Bing Webmaster sitemap submission/readback when domain exists,
- URL inspection/fetch for representative public URLs when tools exist,
- AI visibility baseline for 20 queries across Google AI results, Perplexity, ChatGPT search, Claude search, and Bing/Copilot where accessible.

Launch fails on:

- non-200 public fetch for expected public routes,
- published page has `noindex`,
- private URL in sitemap,
- invalid JSON-LD,
- robots accidentally blocks allowed crawlers,
- stale or overclaiming `llms.txt`/UCP content.
- documented public API route returns 404 or schema-incompatible JSON,

## Query baseline

Initial query set should include:

- `[service category] [suburb] emergency`,
- `find [service category] near me`,
- `can AI book a [service category]`,
- `[business name] [suburb]`,
- `[service name] [suburb] quote`,
- `agent readable local business service catalog`,
- `AI discoverable [service category] business`.

The goal is not to rank immediately. The goal is to prove the public spine is crawlable, indexable, non-overclaiming, and measurable.
