# Glossary

**Revised:** 2026-10-07

Plain-language definitions for the terms used most often across the product,
source and tests. `CONTEXT.md` is the canonical source for product vocabulary;
this glossary restates its definitions in shorter form and points at the file
that implements each one. Where a term is not in `CONTEXT.md`, the definition
comes from the source file named below — do not invent a different meaning.

## Market vocabulary

**Tool**: The exact, versioned, callable unit of supply a Provider makes
available — inputs, outputs, price, terms and readiness all attach to one
Tool version. A Service, Offering, Publication, Listing or Source describes a
related catalogue fact but is not itself a callable Tool. See `CONTEXT.md`
("Tool").

**Quote**: An expiring, customer-bound price-and-terms decision returned
before a paid Call. It binds the Provider, exact or maximum AUD price, terms,
data use and retry rule for one Tool version and input. A price estimate alone
is not a Quote. See `CONTEXT.md` ("Quote").

**ExactAmount**: The only machine-readable shape for a price or money amount:
`ExactAmount { currency, units, exponent }`. `currency` is the asset code,
`units` is a non-negative integer string and `exponent` is its decimal scale.
See `src/modules/money/public.ts`.

**Call**: One accepted use of a Tool version under a Quote. Its attempts,
Provider observations, output, Charge, delivery and recovery are all views of
the same Call, never a second execution record. See `CONTEXT.md` ("Call").

**Provider**: The party offering and performing the Tool. An endpoint alone
does not establish who the Provider is. See `CONTEXT.md` ("Provider").

**Buyer**: The customer's side of a purchase — the party the Seller charges
and to whom "Buyer consideration" (the amount owed for the sale) applies,
distinct from the Provider's obligation and from Funding. See `CONTEXT.md`
("Buyer consideration").

**Principal**: The generic IAM identity underneath the product roles.
Customer and Agent are product roles; `Principal`, `Account`, `Business`,
`User` and `Credential` remain distinct generic concepts that a Customer or
Agent is bound to, not replacements for them. See `CONTEXT.md` ("Compatibility
with current source and APIs").

## Authority and access

**Agent access key**: The bearer secret an Agent sends as
`Authorization: Bearer <Agent access key>` on protected HTTP requests. It is
issued by Agentic Economy and bound to one Agent and account. Reading the
Agent never returns the secret; rotating the key does not reset spending
history. See `src/modules/agent-access/account.actions.ts`.

**grant**: The versioned, scoped, budgeted and expiring authorization
(`DelegationGrant`) that lets one principal act for another — the record
behind a Spending policy or Request authorization. A grant has a generation,
a budget limit/used pair and an expiry, and is revocable without touching the
identity it was issued to. See
`src/modules/authority/delegation/contracts.ts`.

**x402**: The upstream HTTP payment protocol AE's first supply channel is
built on — an x402 endpoint is itself a Tool that can be discovered before AE
imports or publishes it. Payment support and request validation for that
endpoint are execution facts, not import facts. See `CONTEXT.md` ("Tool") and
`README.md`.

**Bazaar/directory**: The external x402 facilitator directory AE crawls to
discover possible supply at metadata authority only. An imported directory
record is not a Tool and cannot be called until AE admits and publishes it.
See `README.md` ("Current source entrances") and
`src/modules/capability-supply/internal/publication-importer-x402-bazaar.ts`.

## Catalogue facts

**readiness (observed/valid-until)**: The catalogue's evidence of whether a
Tool is currently callable — `observedAt` is when that evidence was last
taken, `validUntil` is when it expires. Once `validUntil` has passed, the
Tool is treated as unproven again even if nothing else changed. See
`src/modules/capability-supply/internal/tool-projection-types.ts`
(`PublicToolReadiness`).

**availability posture (`routeable | setup_required | unavailable`)**: The
one derived state a Tool's readiness and integration facts resolve to for
display — `routeable` (callable now), `setup_required` (integrated but not
currently proven or expired), or `unavailable` (not integrated, or blocked for
a stated reason). See
`src/modules/capability-supply/internal/availability.ts`.

**listingTier (`reviewed | listed`)**: The catalogue tier a Tool surfaces
under, derived from its publication authority mode — first-party direct and
AE-curated third-party Tools are `reviewed`; gateway-mediated or merely
observed third-party Tools are `listed`. Never stored, always derived. See
`src/modules/capability-supply/internal/publication/provenance.ts`
(`listingTier`).

**freshness (`x402_directory` vs `supply_projection`)**: Two independent
freshness readbacks that share one shape (`state`, `completedAt`,
`staleAfterMs`) but describe different sources — `x402_directory` is how
current the external Bazaar crawl is (`src/modules/market/x402-directory-index.server.ts`),
`supply_projection` is how current the internal catalogue projection cron is
(`src/modules/registry/tool-choice-contracts.ts`,
`supplyProjectionFreshnessSchema`). Do not conflate the two sources.

## Operations

**local Provider environment (doctor)**: An informational check of local
configuration. Its tier does not prove a purchase or Provider delivery.
`ae doctor` reports discovery, quoting and purchase readiness groups separately;
skipped checks remain unproven. It reads readiness and does not connect, fund or
buy. See `tools/ae/commands/doctor.ts`.

**Credit funding**: Adding prepaid Credit is separate from a Quote or Call.
The current funding Quote is authoritative for the amount and tax treatment;
the glossary does not publish a fee or payout figure. See
`src/modules/money/internal/commercial-policy.ts` and
`src/modules/money/internal/aud-funding.ts`.
