---
# ADR-027: A published price a machine can compare
Status: Accepted
Date: 2026-07-26
Supersedes: None

## Context

AE's product claim is that it compares real options. Until now the only price
an Offering could publish was `pricingSummary`, a free sentence. The
`2026-07-26` user journey audit recorded the consequence plainly: *"Compare on
price — no prices exist"* (F9). Nothing downstream could sort by cost, respect
a spend ceiling, or answer "under $400" without an LLM re-reading prose.

The asymmetry was internal. A Customer Request already reasons in minor units
(`maximumSpendMinor` on the routing input). Supply was the only side still
speaking prose to itself.

agentic.market carries `pricing: {amount, currency, scheme, minAmount,
maxAmount}` on every endpoint and a `priceSummary` rollup per service. That
comparability, not its payment rail, is why an agent can shop there.

## Decision

An Offering revision may publish a structured `price` **beside**
`pricingSummary`, never instead of it.

```
kind:           fixed | from | range | quote_only
currency:       ISO 4217
amountMinor:    absent only for quote_only; lower bound for range
maximumAmountMinor: range only
unit:           job | hour | visit | item | day | week | month
taxTreatment:   inclusive | exclusive | unstated
```

Four rules make it safe:

1. **Independent facts.** `price` is never parsed, inferred, rounded, or
   converted from `pricingSummary`, and `pricingSummary` is never generated
   from `price`. A business publishes each one deliberately. The answer LLM
   continues to quote `pricingSummary` verbatim and is not given `price`.
2. **All or nothing.** `normalizeOfferingPrice` returns a price only when it is
   internally consistent. A half-filled price is dropped, because sorting and
   filtering against a number the business never agreed to is worse than
   showing no number.
3. **`quote_only` has no ceiling.** It is therefore never removed by a
   maximum-price filter. Most real local supply is quoted on request; hiding it
   behind a budget filter would make the filter actively misleading.
4. **Additive and forward-only.** The field is optional on the table, the
   record, the projection, and the public DTO. An Offering without a price
   behaves exactly as before. The v1 legacy service row has no price column at
   all, so `price` is a native-only fact excluded from cutover comparison for
   the same reason `pricingSummary` already is.

The public catalog schema version stays `public-business-catalog-api:v2`. The
field is optional and additive; bumping the version would force every consumer
to re-pin for something it may ignore.

## Consequences

`registry.search` gains `maxPriceMinor` and `hasPrice`. The owner editor gains
a structured price group, and — separately but in the same pass — finally
captures the external-operation fields the schema has always defined
(`name`, `method`, `documentationUrl`, `interfaceDescription`,
`authenticationSummary`, `pricingSummary`), which the editor previously
discarded while hardcoding the descriptor name.

This does not make AE's listings callable. It makes them comparable. The typed
operation contract — inline request parameters on an external operation, so an
agent can invoke a listed endpoint without reading documentation — remains open
and is the next expensive-to-reverse decision in this area.

## Boundaries

A published price is a supply fact, not a quote, not an offer, and not a
commitment. It does not price a Customer Request, does not survive into a
mandate, and never implies that the work can be booked, charged, or dispatched.
Confirmation and start remain separate decisions under the existing authority
contract.
