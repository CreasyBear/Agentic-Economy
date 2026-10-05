> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../README.md) for its successor and remaining limits.

# Provider supply: the catalogue is already full

**Date:** 29 September 2026
**Checkout:** `d104a8009`
**Lens:** source types (x402, OpenAPI, MCP, Agent Plugin), admission, attestation, drafts, validation, publication, connections, earnings. Why so many paths for alpha, when the Bazaar already supplies ~15k listings? What would the simplest "list your x402 endpoint" flow look like, next to the x402 Bazaar, RapidAPI Add API, and Smithery publish?

**Answer:** Alpha does not have a supply shortage. It has a publisher-platform surplus. Buyer search already reads the Coinbase Bazaar. A Provider listing is a different job — attach an Australian business and a payee to one endpoint Agentic Economy can resell — and the owner form makes that job carry four source types, a terms essay, an inactive publication, and a canary machine the screen does not show.

This is a source reading of the current checkout, plus the 20 September 2026 coverage snapshot and the 28 September Provider sweep. Public listing docs were fetched the same day. It is not a new browser run.

## The 15k listings are already the market

On 20 September 2026 the coverage snapshot stored **14,949** Bazaar resources and reported **14,950** for every need (`output/jev-market-coverage-2026-09-20/snapshot.json`, `capturedAt` `2026-09-20T14:44:35.065Z`). Each row is a resource URL, a host, a title, a description, and declared input and output schemas. Coinbase's seller guide, fetched 29 September 2026, says the Bazaar now lists more than 23,000 x402 resources ([Get discovered](https://docs.cdp.coinbase.com/x402/seller/get-discovered)).

`PRODUCT.md` already treats that catalogue as the entry inventory. The 8 September clarification says an x402 endpoint is a Tool, and discovery must expose the upstream directory without AE publication, Provider onboarding, or a stored readiness result (`PRODUCT.md:243-250`). The 21 September market-formation note says existing x402 supply is how the first use case is filled, so Agentic Economy does not recruit a Provider for every first buyer (`PRODUCT.md:43-51`).

The live reader matches the clarification. `readX402DirectoryRawPage` calls Coinbase `searchX402Resources` and `listX402DiscoveryResources`. The module states that native directory pages are observations and that admission never controls their visibility (`src/modules/market/x402-directory.server.ts:21-48`).

The Provider FAQ says the other half out loud: a Bazaar listing does not publish the Tool on Agentic Economy. Connecting and publishing is a separate Provider process (`src/content/provider-copy.ts:10-12`).

Both sentences are right, and together they explain the surplus. The directory is how buyers find the 15k. Publication is how a Provider becomes the upstream party on a principal-reseller Call. Alpha built the second system as if it were also how inventory arrives.

A directory row is not an Australian business, not proof the caller controls `payTo`, and not an AUD price with a buyer remedy. Those gaps are real. They do not require OpenAPI, MCP, Agent Plugin, a category form, or a paid canary before the first Provider can attach their name to one endpoint.

## What a Provider is asked to do

The public page offers four steps and three source shapes: public OpenAPI or MCP, a credentialed source, or a public x402 endpoint (`src/components/ae/supply/AeSupplyLanding.tsx:22-50`). The form then marks x402 "Recommended for alpha" and keeps the other three one disclosure away (`src/components/ae/supply/supply-source-type/components/SourceTypeChooser.tsx:14-46`).

The source contract is those four kinds. There is no manual source. MCP is two locators (HTTPS URL or registry name) plus an optional remote-server pick. Agent Plugin is `plugin.json` plus `mcp.json` (`src/modules/capability-supply/source-preview.ts:35-60`). A fifth import, `ae_envelope`, is on the normalizer and not on the form (`src/modules/capability-supply/internal/publication-importers.ts:34-48`).

### Identity

The owner wizard asks for a business name, an HTTPS website, and an ABN before Add Tool (`src/components/ae/supply/supplier-onboarding-wizard/useSupplierOnboardingWizard.ts:59-69`). The 28 September sweep found a step marked completed that still refused continuation because website and ABN were blank on re-entry, while Add Tool itself still worked (`docs/reviews/alpha/sweep-provider.md`, row 5). The business identity belongs on the seller record. A blank re-entry does not.

### x402 preview is a Bazaar parse

Pasting a URL does not invent a contract. `previewX402Source` fetches the live endpoint, requires HTTP 402, and keeps the candidate only when one AE payment alternative is selected and Bazaar discovery admission succeeded (`src/modules/capability-supply/source-preview.ts:584-653`).

The payment profile is one lane. Sandbox is Base Sepolia USDC, scheme `exact`, transfer `eip3009`. Production is Base mainnet USDC on the same scheme (`src/modules/capability-supply/internal/x402-payment-profile.ts:12-28`). Discovery admission wants HTTP GET or POST, a bounded input schema, and an output schema (`src/modules/capability-supply/internal/publication-importer-x402-bazaar.ts:19-40`, `admitBazaarDiscoveryInfo`). Missing or malformed Bazaar metadata leaves the candidate unsupported.

The alpha x402 form can therefore list only an endpoint the Bazaar can already describe, on the one network Agentic Economy can pay. The form then asks the Provider to restate that description.

### Connection is payee control, and x402 always requires it

Every x402 candidate is authenticated as `x402_wallet`, never `public` (`source-preview.ts:627`). Publication refuses unless that candidate has an active connection (`src/modules/capability-supply/supply-publication-v2.ts:209-212`). `connectOwnerX402` inspects again, binds the selected `payTo`, and checks an EIP-191 signature over a short-lived claim (`src/modules/capability-supply/internal/supply-funnel/connections.ts:181-231`). The landing copy is the right instruction: prove the payout address, and do not paste a private key. The signature is the one fact the 402 cannot prove.

OpenAPI and MCP connections are a different product on the same owner surface: stored credentials and an OAuth handoff (`/owner/supply/connections/new`, `/owner/supply/connections/oauth/callback`), plus revoke, reconnect, and cleanup. A public x402 endpoint does not use that handoff.

### Drafts

Selecting a candidate saves an integration draft (source descriptor, digest, selector, optional terms). A second draft, on the connection attempt, tracks `pending`, `connected`, `consumed`, `expired`, and `cancelled` (`src/modules/capability-supply/internal/supply-funnel/source-first-owner.ts:136-155`). Publish writes the draft again, reserves a catalog offering, then calls `publishPreparedCapability` (`source-first-owner.ts:583-697`).

The detail page says "Continue setup when you are ready to submit" (`src/components/ae/supply/AeProviderToolDetail.tsx:271`). The 28 September sweep found no continue control. Add Tool starts a new source form. A draft that cannot be resumed is a second path.

### Attestation, validation, publication

After selection the Provider types name, description, and category, may add service area and availability, picks `free`, `fixed_aud`, or `source_x402`, and declares external effect, data release, financial exposure, and data classification. Free and fixed AUD are rejected when the candidate already carries an x402 price (`supply-publication-v2.ts:529-551`). On this path the only legal price is the challenge, later quoted in AUD. The price field is not a Provider decision.

Three statements follow: authorised to publish, information is accurate, and publish after validation succeeds (`supply-publication-v2.ts:84-88`, `src/components/ae/supply/SupplyPublicationFlow.tsx:352-367`). The authority box is required only after a connection or a verified registry exists. Otherwise the review copy says publication stays under review and validation does not need that claim.

The button says "Submit for validation." The command re-fetches the source, prepares a draft, saves it, reserves the offering, and publishes. The owner state comes back `Submitted`: "Agentic Economy accepted this Tool and is preparing validation" (`AeProviderToolDetail.tsx:273`).

The lifecycle does not start active. Initial reasons are `admission_unproven`, `conformance_unproven`, `credential_readiness_unobserved`, and `health_unobserved` (`src/modules/capability-supply/internal/publication/lifecycle.ts:57-64`). A current row stays inactive while source authority is unverified, eligibility fails, the binding is not admitted, conformance is unproven, credentials are missing, or health is unobserved, unhealthy, or stale (`lifecycle.ts:83-133`). The detail page shows Connection, Validation, Publication, and Freshness as separate facts (`AeProviderToolDetail.tsx:111-118`). "Published" means the Tool is current and available for buyer inspection (`AeProviderToolDetail.tsx:275`). The button does not mean that.

`validateCapabilityPublication` is a side-effect-free preflight that mirrors CDP `POST /v2/x402/validate` (`src/modules/capability-supply/internal/publication/validate.ts:18-28`). The owner button does not stop at that preflight. It writes a publication that is still inactive.

### The seller machine the form does not show

A second x402 lifecycle remains in source:

`draft → claim_pending → claimed → claim_failed → admitted → canary_pending → canary_failed → reconciliation_required → published → stale → withdrawn`

(`src/modules/capability-supply/internal/x402-seller-onboarding/types.ts:1-13`). Promotion can refuse because the canary payment did not settle, the output was unusable, the claim went stale, or the identity drifted (`src/modules/capability-supply/internal/supply-funnel/types.ts:204-229`). The detail copy for "Under review" says no separate promotion step is required (`AeProviderToolDetail.tsx:274`). The canary is not on Add Tool. It appears on a call receipt when `commercialModel` is `seller_canary_x402`. Alpha keeps a paid-canary gate and tells the Provider there isn't one.

An older funnel is still named beside it: `describe`, `admission`, `readiness`, `test` (`supply-funnel/types.ts:30`).

Publication authority is four modes: `provider_owned`, `ae_curated_external`, `third_party_gateway`, `observed_external` (`src/modules/capability-supply/internal/publication/provenance.ts:7-14`). An owner may publish only `provider_owned`. Only the system may admit `observed_external`. Curated and gateway modes are admin or system (`provenance.ts:49-63`). `listingTier` maps owner and curated to `reviewed`, and gateway and observed to `listed` (`provenance.ts:24-34`), which is the split the 9 September marketplace scan took from Locus. The self-serve form needs `provider_owned`. The directory is already the observed catalogue.

### Earnings

Earnings are not a setup step. The readback is USDC obligations in `accrued`, `held`, `payable`, `settled`, `reversed`, or `disputed`, plus a separate transfer list that can sit in KYC hold, threshold hold, or an unknown payout outcome (`src/modules/capability-supply/internal/supply-funnel/earnings-readback.ts:1-25`). The card says a settled Call is not a Stripe transfer or a bank payout. Empty copy is "No Provider obligations have been recorded." The 28 September sweep saw that empty state because nothing had been published and nothing had settled. That screen belongs on the Tool after a Call, not in the listing flow.

### What the sweep could finish

A public OpenAPI sandbox reached review and then failed with a generic refusal. The Tool stayed Draft, validation not started, not published. A live Bazaar GET was parsed and still shown as a disabled candidate. Disabled operations shared one non-actionable sentence. There was no published Tool to withdraw, republish, or earn against (`docs/reviews/alpha/sweep-provider.md`, rows 1-4 and "Not reachable").

The supply tree around this funnel is **67,839** lines of production TypeScript, counted 29 September 2026: 38,520 in `src/modules/capability-supply` (190 files), 20,554 in `convex/lib/capabilitySupply` (136 files), 8,765 in `src/components/ae/supply` (74 files). A large share is probes, transport, and payment, which the buyer lane needs. The publisher surface is what alpha multiplied.

## Why these paths exist

| Path | What it decides | Who it is for | Alpha |
| --- | --- | --- | --- |
| CDP directory read | Show a Bazaar resource in search | Buyers | Keep. This is the 15k. |
| Facilitator discovery admission | Re-parse Bazaar `PaymentRequired` into an internal draft | System ingest | Duplicate of the directory read. A Provider should not pass through it. |
| x402 owner publish | Bind a business and a payee to one endpoint | A Provider who wants AE to resell | Keep, shortened. |
| OpenAPI import | Turn one operation into a Tool, with or without a stored credential | API vendors without x402 | Later. The buyer Call route is x402. |
| MCP URL, MCP registry, Agent Plugin | Turn an MCP tool into a Tool, sometimes via OAuth | MCP hosts | Later. Same reason. |
| `ae_envelope` | Direct internal import | Operators | Not a Provider form. |
| Payee claim | Prove control of `payTo` | x402 Provider | Keep. One signature. |
| Credential connection and MCP OAuth | Hold a secret or finish OAuth | Non-x402 sources | Later, with those sources. |
| Terms, effects, attestation | Restate price, data use, and authority | Every source type | For x402, take price and schema from the 402. Keep one authority statement. |
| Validation submission plus inactive lifecycle | Record a publication that is not yet callable | Every source type | The 402 probe is the check. Say whether the Tool is callable. |
| Seller canary and promotion | Pay the endpoint once before it is trusted | x402 seller machine | Not a Provider step while the detail page says there is no promotion step. |
| Earnings | Show USDC obligations and later transfers | After a settled Call | Read-only. Leave it off the listing. |

The charter already picked the order. Managed x402 purchasing is the entry (`START_LINE.md`, `PRODUCT.md:40-42`). Journey 4 — expose a capability and reach buyers without becoming a distribution expert — is real, and the current form makes the Provider into one. Nevermined is the publishing reference for the mature platform (`PRODUCT.md:124-125`). It is not a reason to ship four importers before one owner can attach a business to one Base USDC endpoint.

The four source types share one preview, one publication draft, and one lifecycle (`publication-importers.ts:34-48`). That sharing is why a Bazaar endpoint inherits category, service area, data classification, and an attestation block shaped for a credentialed HTTP API. "Recommended for alpha" hides the other tabs. It does not stop their rules from shaping the x402 path.

The reviewed-versus-listed split is the other reason the code kept a second inventory. The directory can be the listed tier without a Provider. The reviewed tier, for alpha, is one owner-claimed x402 endpoint Agentic Economy will resell. It is not a second copy of the Bazaar run through admission.

## The simplest "list your x402 endpoint" flow

Three public flows, fetched or indexed 29 September 2026:

**x402 Bazaar.** [Get discovered](https://docs.cdp.coinbase.com/x402/seller/get-discovered) says there is no registration form. A TypeScript server built with `createX402Server` adds `extensions.bazaar` for every `METHOD /path` route and uses the CDP Facilitator. Richer query, body, and output schemas are recommended so an agent can build a call. Optional validation is `POST https://api.cdp.coinbase.com/platform/v2/x402/validate` with the resource URL and method, and it needs no API key. Indexing follows one settled payment through that facilitator. Curation is a separate editorial tier. The Provider's work is: deploy HTTPS, describe the route, optionally validate, take one paid call.

**Smithery.** [Publish](https://smithery.ai/docs/build/publish) for a hosted server is: open `smithery.ai/new`, enter the public HTTPS URL, finish the flow. Requirements are streamable HTTP, and OAuth when the server requires auth. Smithery scans tools, prompts, and resources. If the scan cannot pass an auth wall, the server may publish a static card at `/.well-known/mcp/server-card.json`. One source type. The URL is the listing.

**RapidAPI Add API.** The documentation index (`https://docs.rapidapi.com/llms.txt`, section "Adding APIs") describes one hub listing: Getting Started, then tabs for General, Definitions, Docs, Gateway, Assets, Community, and Monetize, plus a separate payouts page and an OpenAPI upload page. It is a long console, and it is still one object — an HTTP API — with OpenAPI as the import. The getting-started article returned HTTP 429 on this pass, so this comparison uses the index, not a click-through.

Agentic Economy's x402 flow is longer than Smithery's URL publish and longer than Bazaar's "no form," and the sweep could not leave a Bazaar candidate selectable or a submission published. It is shorter than RapidAPI's tab set only on the screen. Under the screen it still runs draft, reservation, an inactive publication, and a canary machine.

### The short flow

1. **Sign in as the business.** Name and ABN stay, because the seller of record needs them. Do not block Add Tool on a website field the owner already passed.
2. **Paste the public HTTPS URL.** Probe GET, then POST. The environment is the network in the challenge: Base Sepolia or Base mainnet. Ask for the method only when both answer 402.
3. **Show the endpoint's own facts.** Title and description from Bazaar metadata when present, otherwise host and path. Input schema, output schema, amount, asset, network, `payTo`. If the challenge is missing, the lane is not Base USDC `exact` EIP-3009, or the Bazaar schemas do not parse, name that fact and stop.
4. **Prove the payee.** One EIP-191 claim over that URL, method, and `payTo`. That is the connection. No OAuth, no API key, no second integrations visit.
5. **One statement.** "I am authorised to list this endpoint for this business." Price stays `source_x402`. Ask about effects or data classification only when the schema or the Provider's description shows a write, a personal-data release, or a further payment. Do not ask the Provider to retype the USDC amount as AUD.
6. **List it.** Run the same checks `validateCapabilityPublication` already mirrors, then mark the Tool callable or name the single missing fact. "Submitted" and "preparing validation" are the same state as not listed. Earnings stay on the Tool after a Call settles.

A draft, if the owner leaves, is that URL plus an unfinished claim. The Tool page opens it. There is no second source form.

Sandbox versus production is the network in the 402, not a control that can disagree with the endpoint. Today that disagreement is `environment_mismatch` (`supply-publication-v2.ts:146`).

### Leave these out of the alpha form

- OpenAPI, MCP registry, MCP URL, and Agent Plugin. They can remain importers for a later publisher release. They do not appear on Add Tool while the buyer lane is x402 and the directory already has the inventory.
- Category, service area, and availability as required fields. Search can use the Bazaar description.
- The three-checkbox attestation. One authority statement is the commercial claim. "Publish after validation succeeds" describes the system, not a Provider promise.
- The canary as a Provider step. A health probe may run. A paid canary may remain an operator control. It should not be a twelfth state the owner never sees while the detail page denies a promotion step.
- Re-admitting the Bazaar into publication drafts so those rows can look like owner supply. The directory read is the listed tier. Owner publication starts when someone signs the payee claim.
- Earnings, payout holds, and Stripe transfer state, until an obligation exists.

### What this does not borrow from the Bazaar

Bazaar indexing does not identify an Australian business, does not prove `payTo`, does not set the buyer's AUD price, and does not make Agentic Economy the seller. Steps 1, 4, and 5 are the whole addition. Copying the facilitator crawl, RapidAPI's monetize tab, or Smithery's OAuth scan would add a third inventory.

The success test is small. An owner who already has a public Base USDC endpoint with Bazaar schemas pastes the URL, signs the payee claim, and sees one status: listed and callable, or one named correction. They never choose a source type. A buyer can already search the rest of the catalogue without that owner existing.
