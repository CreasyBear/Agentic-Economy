# T0 — Services IA and callable source of truth

Labels: `wayfinder:grilling`. Status: closed 2026-07-29 (resolved by founder directive + charting session).

## Question

agentic.market's unit is "service with callable endpoints"; AE's is "business with offerings". Does parity require re-modelling supply, or a projection? And what makes an endpoint truthfully "callable"?

## Resolution

- Projection, not re-modelling. `/api/v1/services` and `/api/v1/services/search` flatten the existing V2 business catalog (`public-business-catalog-api:v2`) to one entry per published offering, with `endpoints[]` derived from `external_operation` access paths. Schema version `public-services-api:v1`. No new tables. Human pages and agent JSON keep projecting the same supply object (founder constraint: no two disparate systems).
- An endpoint is `access:'open'` only when AE's sandbox provider actually serves it (`/api/sandbox/<slug>/checkup-quote`); callability is declared by the offering's own access path + fixed price, never by a hardcoded map.
- Pricing stays business-published ISO-4217; USDC display is out of scope (see map).
