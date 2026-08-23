# Treg full-registry source and admission contract

Observed 2026-08-23 at approximately 16:29 AWST. This report covers public,
read-only discovery only. No authentication, provider invocation, payment, or
external mutation was performed.

## Primary sources

The live authority is Treg's own public service:

- [`GET /meta`](https://treg.to/meta) identified the deployment as Treg
  `0.12.0` with `public_url=https://treg.to` and an application build value of
  `15bc84bcaff3` at observation time.
- [`GET /openapi.json`](https://treg.to/openapi.json) is the live route/parameter
  specification. Its response schemas are deliberately open objects, so the
  observed JSON and pinned implementation are needed for the field contract.
- [`GET /catalog/platforms`](https://treg.to/catalog/platforms),
  [`GET /catalog/platforms/{slug}?include_hidden=1`](https://treg.to/catalog/platforms/douyin?include_hidden=1),
  [`GET /catalog/search`](https://treg.to/catalog/search?q=backlinks), and
  [`GET /catalog/endpoints/{endpoint_id}`](https://treg.to/catalog/endpoints/tikhub.x.douyin-app-v3-fetch-brand-hot-search-list)
  are the first-party catalogue index, shelf, search, and exact-detail surfaces.
- [`GET /providers.json`](https://treg.to/providers.json) is a separate public
  credential-detection registry. It is not the endpoint catalogue and does not
  provide a reliable foreign key to every endpoint provider.
- [`/docs`](https://treg.to/docs), [`/robots.txt`](https://treg.to/robots.txt),
  [`/terms`](https://treg.to/terms), and the repository
  [`LICENSE`](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/LICENSE)
  are the first-party documentation, crawler-policy, service-terms, and source-
  reuse authorities.

The static implementation authority used to disambiguate the loose OpenAPI
schemas is the public repository at
[`superdesigndev/treg@603540f`](https://github.com/superdesigndev/treg/tree/603540f653994080d4f507a9a3564e1017c28eef),
especially
[`src/treg/api.py`](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/src/treg/api.py#L445-L690)
and
[`src/treg/catalog_store.py`](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/src/treg/catalog_store.py#L68-L188).
The repo-local maps
[`ARCHITECTURE.md`](../reference/treg/ARCHITECTURE.md),
[`ENGINEERING.md`](../reference/treg/ENGINEERING.md),
[`INTERACTIONS.md`](../reference/treg/INTERACTIONS.md), and
[`SURFACES.md`](../reference/treg/SURFACES.md) were used as route maps, then
claims material to this contract were checked against the live service or pinned
first-party source.

## Enumeration

There is **no single public all-endpoints endpoint or downloadable export**.
The canonical complete live traversal is:

1. Fetch `GET https://treg.to/catalog/platforms` once.
2. For every returned `platforms[].slug`, fetch exactly one
   `GET https://treg.to/catalog/platforms/{slug}?include_hidden=1`.
3. From each shelf, take endpoint records from the primary axes
   `capabilities[].endpoints[]` and `extended[]`.
4. Do not ingest `domains[].rows[].endpoints[]` as additional records. It is a
   second presentation of the same shelf endpoints, grouped for the web UI.
5. Deduplicate and integrity-check on endpoint `id`.

This follows the source route: the index is explicitly open; the shelf loads all
records for one platform; `include_hidden=1` retains account and utility records;
every endpoint with a capability goes under `capabilities`, while records
without a capability go under `extended` ([route implementation](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/src/treg/api.py#L491-L551)).

`GET /catalog/search` is not an export mechanism. A blank query returns zero
rows with a hint to supply `q`; nonblank searches are relevance-admitted,
ranked, and clamped to at most 100 returned rows. The response's `total` is the
number matching that query, not the catalogue size
([search implementation](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/src/treg/api.py#L567-L622)).
The sitemap is likewise not an endpoint export: it enumerates crawlable HTML
pages, including platform shelves, not all endpoint IDs
([live sitemap](https://treg.to/sitemap.xml)).

## Pagination

The platform index and shelf routes have no cursor, offset, page number, `next`,
or per-page limit. One shelf response is one complete page. Therefore the
current full traversal is **82 HTTP GETs: one index plus 81 shelf pages**. The
search route has a `limit` parameter, defaults to 25, and is clamped to
`1..100`; it has no cursor/offset, so it cannot page through the tail of a broad
query.

No public catalogue request-rate or response-size limit was found in the live
OpenAPI, public docs, response headers, terms, or pinned catalogue handlers. The
sampled catalogue responses exposed no `RateLimit`, `X-RateLimit-*`,
`Retry-After`, `ETag`, or `Last-Modified` header and no catalogue JSON
`Cache-Control`. That absence is **not** evidence of unlimited use. Treg's terms
forbid attacking or overloading the service and circumventing rate limits or
anti-abuse measures ([Terms §7](https://treg.to/terms#s7)). A collector should
therefore run sequentially or at very low concurrency, back off on `429`/`503`,
honour `Retry-After` if it appears, and avoid frequent full refreshes.

Provider `limits` values returned inside shelf `providers` objects concern the
upstream provider's execution API. They are source metadata, not Treg catalogue-
enumeration limits and not AE limits.

## Stable identity

The canonical source identity is the exact string `endpoint.id`. The pinned
loader enforces first-wins uniqueness in `by_id`; the validator contract expects
unique IDs. A retired ID remains addressable through exact detail so Treg can
return `status`, `status_note`, and `superseded_by`, while retired records are
removed from discovery surfaces
([loader](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/src/treg/catalog_store.py#L207-L260),
[normalization](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/src/treg/catalog_store.py#L391-L443)).

AE should use a namespaced source key such as `treg:endpoint:<id>` and retain the
raw Treg ID separately. Do not derive identity from provider, method, path,
capability, or display name: those are mutable attributes. Treat
`capability` and `platform` as join/classification keys, not identity.

The live API exposes no catalogue revision, ETag, or updated timestamp. Snapshot
provenance must therefore include `retrievedAt`, `/meta.treg_version`,
`/meta.app_version`, the index URL, all shelf URLs, and a deterministic content
hash over the sorted source records. The pinned Git commit is provenance for the
contract interpretation, not proof that the live catalogue bytes equal that
commit.

## Fields

The full shelf endpoint field union observed live was:

`id`, `provider`, `provider_display`, `name`, `summary`, `method`, `path`,
`scope`, `tier`, `kind`, `domain`, `call_template`, `cost`,
`platform_eligible`, `platform_blocked`, `miss`, `status`, `status_note`,
`superseded_by`, `verified`, `docs_url`, `has_example`, `input`, and
`test_request`.

Capability wrappers add `id` and `description`. The platform envelope adds
`platform.{slug,label,category}`, `hidden_count`, `domains`, and provider objects.
Provider objects have `service`, `display_name`, and, when present, `limits`,
`pricing_url`, and `docs`. Exact endpoint detail additionally joins
`capability`, `capability_description`, `platform`, `platform_label`, historical
`observed` call statistics, sibling alternatives, and an inline captured example
response ([public shaping code](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/src/treg/catalog_store.py#L465-L525),
[detail route](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/src/treg/api.py#L625-L684)).

Price metadata is a source assertion, not an AE quote. Its observed field union
was `type`, `value`, `currency`, `per`, `unit`, `source`, `source_url`,
`checked`, `confidence`, `note`, `usd`, and `trial_calls_per_team_day`.
The native value/currency/unit/provenance must be retained. `usd` is a Treg-
derived normalized unit price and can be null; null means unknown, not free
([cost conversion](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/src/treg/catalog_store.py#L110-L145)).

Transport-shaped metadata comprises `method`, relative `path`, `input`
(`pathParams`, `queryParams`, `headers`, `body`, `bodyType`,
`queryArrayEncoding`, and notes), and the historical `test_request`. The shelf
does not expose a canonical provider base URL or per-endpoint credential scheme.
The separate [`/providers.json`](https://treg.to/providers.json) registry reports
102 credential-detection entries with `provider`, `tokens`, `skills`,
`base_url`, `auth`, and optional `cli`, `oauth`, and `probe`; its `auth` fields
include `shape`, `header`, `param`, and `format`. These records use display names
and optional aliases, lack the endpoint catalogue's `provider` service key, and
do not cover every catalogue provider. They must not be automatically joined as
authoritative per-endpoint authentication.

`platform_eligible` means only that Treg's source-side eligibility predicate
accepts the row's status/scope/kind and computable, sufficiently provenanced
price. It does not prove a platform credential is configured or that a caller is
authorized. The actual credential-ladder dry run is
`GET /catalog/endpoints/{id}/access`; it requires an authenticated member and
was therefore not called in this research
([access route](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/src/treg/api.py#L10417-L10469)).

## Current count

A sequential public traversal at the observation time produced:

| Measure | Result | Meaning |
|---|---:|---|
| Platform index pages | 81 | Every slug returned by `/catalog/platforms` |
| Shelf responses | 81/81 HTTP 200 | One complete `include_hidden=1` page per slug |
| Transferred JSON body bytes | 9,683,234 | Uncompressed shelf bodies; largest shelf was Google at 900,282 bytes |
| Unique full-surface endpoint IDs | **2,757** | `capabilities[].endpoints[] + extended[]`, deduplicated by `id` |
| Source-reported browse endpoints | **2,523** | Sum of index `platforms[].endpoints`; excludes hidden kinds |
| Hidden endpoints | **234** | Sum of shelf `hidden_count`; 110 `account` + 124 `utility` |
| Browse-kind reconciliation | 2,523 | 2,371 `data` + 152 `action` |
| Full-count reconciliation | 2,757 | 2,523 browse + 234 hidden |
| Catalogue endpoint providers | 57 | Unique shelf provider service keys |

There were 2,757 primary-axis occurrences and 2,757 unique IDs: no duplicate ID
was found across shelves or between `capabilities` and `extended`.

Treg's official prose counts are not an integrity source. The live docs currently
hard-code **2,630** catalogue endpoints ([`/docs`](https://treg.to/docs)), while
the landing copy says approximately **2,600**. Both disagree with the current
machine-readable counts. The live index plus `hidden_count` reconciliation is
the defensible current count; consumers should expect drift on every refresh.

## Terms and constraints

Crawler policy is affirmative for discovery: Treg says the catalogue and its
per-platform shelves are open to every crawler, uses `Allow: /`, and separately
disallows authenticated, OAuth, metered `/call/`, MCP, and admin surfaces
([`robots.txt`](https://treg.to/robots.txt),
[pinned file](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/src/treg/web/robots.txt#L1-L33)).
Robots permission to crawl is not a copyright/data licence and does not grant a
right to republish a complete mirror.

The hosted-service terms prohibit attacking, overloading, or probing the service,
circumventing rate limits/anti-abuse controls, and reselling or repackaging the
hosted service ([Terms §7](https://treg.to/terms#s7)). They also state that source
reuse is governed by the repository licence and that Treg may not be offered to
third parties as a hosted, managed, or embedded service without prior written
authorization ([Terms §11](https://treg.to/terms#s11)).

The repository licence grants use, modification, and redistribution—including
commercial use inside one's own organization—but its Additional Term 1 forbids
using the original or modified software to provide a hosted, managed, or embedded
third-party service without the licensor's explicit prior written authorization
([LICENSE lines 5–20](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/LICENSE#L5-L20)).
Redistribution of the Work also carries Apache conditions: provide the licence,
mark modified files, and retain applicable notices
([LICENSE lines 122–154](https://github.com/superdesigndev/treg/blob/603540f653994080d4f507a9a3564e1017c28eef/LICENSE#L122-L154)).

**Full-mirroring conclusion:** an internal, non-third-party source snapshot may
be made under the source licence subject to its conditions. A complete catalogue
mirror exposed through AE to third parties is **not presently admitted**: it may
be an embedded/hosted use of the licensed Work, the hosted terms do not grant a
catalogue-data republication licence, and many descriptions, docs facts, and
prices originate with upstream providers whose rights Treg cannot enlarge.
Public API access and robots permission do not cure those gaps. Obtain Treg's
explicit written authorization (and retain provenance/attribution), or obtain a
specific legal determination that the intended fact-only use is outside the
restriction, before persisting and serving the full mirror. This is a contract
boundary for implementation, not legal advice.

## Admission boundary

Treg source metadata must remain distinct from AE decisions and evidence:

| Treg field/evidence | What it supports | What AE must not infer |
|---|---|---|
| `id`, provider, capability, platform, name, summary | Source discovery and classification | AE admission, endorsement, or identity beyond the Treg namespace |
| `cost` and provider `limits` | Treg's sourced/derived price and upstream-limit metadata as of `checked` | An AE quote, billing authority, current provider price, or AE execution limit |
| `method`, `path`, `input`, `test_request`, `call_template` | A source-described request shape | A safe or authorized executable binding; base URL and complete auth are missing |
| `platform_eligible` / `platform_blocked` | Treg's static platform-offer predicate | Current configured credential, caller access, AE policy admission, or executability |
| `verified`, `has_example`, exact-detail `observed` | Historical Treg verification/example/served-call evidence | AE verification, present availability, successful delivery, or output correctness |
| `kind=data/action/account/utility` and `scope` | Source consequence hints | AE consequence classification, consent sufficiency, reversibility, or delivery semantics |
| `docs_url`, `source_url`, `checked`, `confidence` | Provenance pointers supplied by Treg | Independent AE verification of the linked claim |

Accordingly:

- **AE admission** requires its own policy review, licence gate, stable source
  identity, provider/binding qualification, consequence classification, data-use
  review, and current evidence. Ingested does not mean admitted.
- **AE execution** requires an independently qualified binding with canonical
  base URL, method, authentication, credential ownership, input validation,
  pricing authority, spend controls, and caller authorization. Treg catalogue
  metadata alone is insufficient.
- **AE delivery** begins only after AE performs an authorized operation and
  records the actual response/effect. A Treg example, test request, or call
  template is not delivery.
- **AE verification** must attach AE-observed evidence and time. Treg's
  `verified` date, source confidence, example, and observed aggregates may be
  retained as attributed source evidence but never rewritten as AE verification.

Until mirroring permission is resolved, the admissible production posture is
`reference_only`: retain minimal source references needed for evaluation (Treg
ID, exact-detail URL, source provenance, retrieval time/hash) or fetch on demand;
do not publish a locally persisted full Treg catalogue as AE inventory.

## Implementation contract

1. **Precondition:** `tregFullMirrorAuthorization` must be recorded before a
   persistent full mirror is exposed to AE users. Without it, run only an
   internal evaluation or reference-only/read-through path.
2. **Snapshot:** fetch `/meta`, then `/catalog/platforms`, then all returned
   shelves with `include_hidden=1`, sequentially or at low concurrency. Set a
   descriptive user agent, stop/back off on `429`/`503`, honour `Retry-After`,
   and never touch `/call/`, `/mcp`, auth, OAuth, access, payment, or write routes.
3. **Extract:** for each shelf, concatenate only
   `capabilities[].endpoints[]` and `extended[]`. Add the wrapper's capability
   ID/description and platform slug/label/category to the normalized record.
   Treat `domains` as a presentation index and provider objects as shelf-level
   metadata.
4. **Validate:** require every index slug to return one successful JSON object;
   require each endpoint ID to be nonempty and globally unique; require each
   record's platform to match its shelf context; and require
   `unique_full_count == sum(index.endpoints) + sum(shelf.hidden_count)`.
   Reject the snapshot atomically on missing pages, duplicates, or reconciliation
   failure—never silently publish a partial registry.
5. **Identity/provenance:** key records as `treg:endpoint:<id>` and store the raw
   source ID, exact detail URL, shelf URL, retrieval time, `/meta` versions, and
   deterministic snapshot/record hashes. Never synthesize a source revision from
   the pinned Git commit.
6. **Preserve:** keep nullable/unknown values distinct from zero/free; preserve
   native price units and every cost provenance field; retain source strings
   verbatim or clearly mark transformations; do not coerce Treg confidence or
   verification into AE fields.
7. **Separate:** store Treg metadata in a source namespace/envelope. AE admission,
   execution binding, delivery evidence, and verification status must be separate
   records with their own authorities and timestamps.
8. **Refresh/change:** compare by ID and record hash. Addition, mutation,
   disappearance, or a newly returned exact-detail retirement is a source change,
   not automatic AE admission or deletion. Tombstone missing IDs and re-review
   material changes to price, scope, kind, method/path, eligibility, or provenance.
9. **Enrich carefully:** exact detail may be fetched for admitted candidates to
   obtain capability/platform context, siblings, provider metadata, historical
   observations, and examples. Do not fetch all example bodies by default. Do not
   join `/providers.json` authentication automatically; require a curated,
   reviewed provider mapping and independent binding verification.
10. **Publish gate:** before any third-party catalogue exposure, record written
    authorization/licence basis, required attribution/notices, permitted fields,
    refresh frequency, and takedown path. If that gate is absent or revoked,
    suppress mirrored records while retaining only internal audit provenance.

The measured 2026-08-23 values—81 shelves, 2,523 browse records, 234 hidden
records, and 2,757 unique full-surface IDs—are test fixtures for drift detection,
not hard-coded production invariants.
