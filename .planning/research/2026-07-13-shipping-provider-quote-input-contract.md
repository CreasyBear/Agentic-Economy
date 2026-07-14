# Shipping provider quote input contract

Checked: 2026-07-13
Scope: the minimum production adapter contract for creating a non-commitment parcel quote through Shippo and EasyPost. Only first-party provider documentation is used, plus NIST for exact unit conversion factors.

## Decision

AE should own one provider-neutral, unit-explicit input and map it separately into each provider's native request. It must not share a provider-shaped parcel object between adapters.

Recommended normalized input:

```ts
type ParcelQuoteInput = {
  from: {
    street1: string
    street2?: string
    city: string
    region: string
    postalCode: string
    countryCode: string // ISO 3166-1 alpha-2
    residential?: boolean
    name?: string
    company?: string
    phone?: string
    email?: string
  }
  to: ParcelQuoteInput['from']
  parcel: {
    lengthMm: number
    widthMm: number
    heightMm: number
    weightGrams: number
  }
  providerAccountId: string
  serviceCode?: string
}
```

For comparable, action-compatible quotes, AE should require street, city, region, postal code, and country even where a provider permits a less complete quote address. Contact fields can remain optional until a selected carrier or later purchase contract requires them. Shippo explicitly says country is always required, while city and postal code improve quote accuracy; state is required for purchase in AU, CA, and the US. [Shippo Address API](https://docs.goshippo.com/api-reference/addresses/create-a-new-address) EasyPost exposes the corresponding address fields and ISO country code. [EasyPost Address API](https://docs.easypost.com/docs/addresses)

Use millimetres and grams as AE's canonical stored quantities. The EasyPost adapter must convert dimensions to inches and weight to avoirdupois ounces using `inches = millimetres / 25.4` and `ounces = grams / 28.349523125`; apply an explicit, tested rounding policy at EasyPost's documented one-decimal precision. NIST defines the inch as exactly 25.4 mm and gives 1 oz as 28.349523125 g. [NIST length definition](https://www.nist.gov/pml/owm/si-units-length) [NIST SP 1020 conversion table](https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.1020.pdf)

## Provider mappings

### Shippo

Create a quote-bearing Shipment with:

```json
{
  "address_from": {
    "street1": "...",
    "street2": "...",
    "city": "...",
    "state": "...",
    "zip": "...",
    "country": "AU",
    "name": "...",
    "company": "...",
    "phone": "...",
    "email": "...",
    "is_residential": false
  },
  "address_to": { "...": "same mapping" },
  "parcels": [{
    "length": "100",
    "width": "80",
    "height": "40",
    "distance_unit": "mm",
    "weight": "1500",
    "mass_unit": "g"
  }],
  "carrier_accounts": ["<Shippo carrier account object_id>"],
  "async": false
}
```

`POST https://api.goshippo.com/shipments/` creates a Shipment and automatically retrieves rates; it does not buy a label. The minimum provider payload is `address_from`, `address_to`, and `parcels`. `carrier_accounts` is an array of carrier-account `object_id`s; omitting it rates all active accounts. [Shippo Create Shipment](https://docs.goshippo.com/api-reference/shipments/create-a-new-shipment) Shippo parcels explicitly accept decimal-string dimensions and weight plus `distance_unit` (`cm`, `in`, `ft`, `m`, `mm`, `yd`) and `mass_unit` (`g`, `kg`, `lb`, `oz`). [Shippo Create Parcel](https://docs.goshippo.com/api-reference/parcels/create-a-new-parcel)

Select returned rates by both configured `carrier_account` and optional `servicelevel.token`. Preserve:

- Shipment ID: `Shipment.object_id`
- Rate ID: `Rate.object_id`
- Account: `Rate.carrier_account`
- Service: `Rate.servicelevel.token`, plus its customer-facing name and terms
- Price: decimal string `Rate.amount` with ISO currency `Rate.currency`
- Observation time: `Rate.object_created`
- Delivery evidence: `estimated_days`, `duration_terms`, `arrives_by`, messages, and `test`

The current Rate reference does not document `expires_at` or `expiration_datetime`. Shippo documents only that a purchased rate must be less than seven days old. Therefore AE may enforce a much shorter freshness window, but it must label that timestamp as an **AE policy expiry derived from the provider observation time**, not a provider-supplied expiry. Recreate/re-rate rather than claiming provider validity. [Shippo Retrieve Shipment Rates](https://docs.goshippo.com/api-reference/rates/retrieve-shipment-rates) [Shippo Create Transaction](https://docs.goshippo.com/shippoapi/public-api/transactions/createtransaction)

### EasyPost

Create a quote-bearing Shipment with:

```json
{
  "shipment": {
    "from_address": {
      "street1": "...",
      "street2": "...",
      "city": "...",
      "state": "...",
      "zip": "...",
      "country": "AU",
      "name": "...",
      "company": "...",
      "phone": "...",
      "email": "...",
      "residential": false
    },
    "to_address": { "...": "same mapping" },
    "parcel": {
      "length": 3.9,
      "width": 3.1,
      "height": 1.6,
      "weight": 52.9
    },
    "carrier_accounts": ["<EasyPost ca_... ID>"]
  }
}
```

`POST https://api.easypost.com/v2/shipments` with valid addresses and parcel automatically populates `rates`; purchase is a separate `/shipments/:id/buy` call. [EasyPost Shipment API](https://docs.easypost.com/docs/shipments) The `carrier_accounts` array contains `ca_...` IDs and constrains rating to those accounts. [EasyPost Rate API](https://docs.easypost.com/docs/shipments/rates)

EasyPost parcel units are implicit and fixed: numeric dimensions are inches and numeric weight is ounces, documented to one decimal place. `weight` is always required; dimensions are either omitted together, supplied together, or replaced by `predefined_package`. **`distance_unit` and `mass_unit` are not EasyPost v2 Parcel fields.** [EasyPost Parcel API](https://docs.easypost.com/docs/parcels)

Select returned rates by both configured `carrier_account_id` and optional `service`. Preserve:

- Shipment ID: `Shipment.id` (`shp_...`)
- Rate ID: `Rate.id` (`rate_...`)
- Account: `Rate.carrier_account_id`
- Service and carrier: `Rate.service`, `Rate.carrier`
- Purchase price: decimal string `Rate.rate` with `Rate.currency`
- Comparison context: `list_rate/list_currency`, `retail_rate/retail_currency`, and `billing_type`
- Observation time: `Rate.created_at` and `updated_at`
- Delivery evidence: `delivery_days`, `delivery_date`, and `delivery_date_guaranteed`
- Environment evidence: `Rate.mode`

EasyPost documents no `expires_at` or fixed validity duration. It tells clients to call `POST /shipments/:id/rerate` for up-to-date rates when a Shipment is not bought the same day. AE must preserve `created_at`, apply its own explicit freshness policy, and rerate before later commitment. [EasyPost Rate API](https://docs.easypost.com/docs/shipments/rates)

EasyPost's beta `POST /beta/rates` can accept a `service` filter and avoids creating a Shipment, but it is explicitly beta and returned rates have no IDs. It therefore cannot supply the exact rate reference needed for AE's later PreparedAction/purchase path. The stable Shipment path plus local rate filtering is the correct initial adapter. [EasyPost Rate API](https://docs.easypost.com/docs/shipments/rates)

Do not use EasyPost's documented One-Call Buy shape (`service` plus `carrier_accounts` during the buy workflow) as a quote filter: it creates and purchases a label. Quote and commitment must remain separate. [EasyPost Shipment API](https://docs.easypost.com/docs/shipments)

## Sandbox and non-commitment semantics

Creating either provider's Shipment is a rating operation; no commitment occurs unless AE later invokes Shippo's Transaction endpoint or EasyPost's Shipment buy endpoint.

Provider test environments prove request compatibility, not real supply or customer price:

- Shippo test tokens isolate test data and create sample labels without charge, but Shippo warns test rates can differ from live rates. Its partner testing guide says accurate rate-card testing requires a live token with no label purchase. [Shippo Authentication](https://docs.goshippo.com/docs/Guides_general/authentication) [Shippo Testing](https://docs.goshippo.com/docs/Guides_general/testing) [Shippo Sandbox Testing](https://docs.goshippo.com/docs/Partner_Integration/sandbox_testing)
- EasyPost API keys determine `test` or `production` mode. Test labels are not shippable, and test rates generally omit negotiated discounts except for USPS Wallet. [EasyPost Authentication](https://docs.easypost.com/docs/authentication) [EasyPost Test Environment](https://support.easypost.com/hc/en-us/articles/360044353331-Test-Environment)

Consequently, real-supply qualification should use production/live credentials to create rates and must stop before `/transactions` or `/buy`.

## Corrections required before these examples become product adapters

The existing files under `examples/routing-provider` are useful probes, but the following assumptions are not production-safe:

1. `provider-configuration.mjs` applies one Shippo-shaped `tracerParcel` to both providers. For EasyPost this emits undocumented `distance_unit` and `mass_unit`, sends values in the wrong units when the source is metric, and serializes numeric measurements as strings. EasyPost needs adapter-owned conversion to numeric inches and ounces.
2. `shippo-gateway.mjs` reads undocumented `rate.expires_at` / `rate.expiration_datetime`. Replace this with provider observation time plus an explicit AE freshness policy; seven days is only Shippo's maximum purchase-age rule, not an accuracy guarantee.
3. Both gateways invent a five-minute expiry without retaining provider `created_at` / `object_created`. A conservative AE TTL is valid, but the evidence model must distinguish `observedAt`, `aeRefreshAfter`, and any actual provider expiry.
4. Both gateways parse only AUD through `audMinor` and reject every other currency. That is acceptable only as an explicitly registered AU capability constraint, not as provider-adapter behavior. The adapter should parse provider decimal money against the returned ISO currency; the capability contract may then require AUD or reject a currency mismatch without doing hidden FX conversion.
5. The current address validator hard-codes AU and requires the same fields for both providers. AU scope belongs in the registered capability/binding. Provider adapters should map a neutral ISO-country address and expose provider/carrier-specific missing-field errors.
6. The response projection drops service, carrier, delivery, billing/rate-class, test/production, raw observation time, and provider messages. Those facts are required to compare options honestly and diagnose partial or stale supply.
7. A provider account is not itself independent supply. Preserve the downstream carrier and service identity so AE can deduplicate the same carrier/service returned through Shippo and EasyPost.

## Implementation constraints

- One immutable normalized input; two separate provider mappers.
- Exact unit conversion and explicit rounding tests at the adapter boundary.
- Stable quote-bearing Shipment endpoints, because later action preparation needs provider rate IDs.
- Carrier-account filters in the provider request; service filters applied locally unless a stable quote-only endpoint supports them without commitment.
- Preserve provider shipment ID, rate ID, account ID, downstream carrier/service, decimal price and currency, observation time, environment mode, delivery evidence, and provider messages.
- Never synthesize provider expiry. Store AE freshness policy separately and rerate before commitment.
- Live/production rating without calling purchase is the proof for real price; test mode remains sandbox evidence only.
- No provider-specific field, unit, carrier rule, or AU restriction may enter the neutral routing kernel.
