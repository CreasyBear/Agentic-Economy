# Routing conformance provider

This separately deployable HTTPS provider implements `ae-capability:v1` for the `shipping.label.book:v1` tracer contract. It exercises quote, committed, failed, and unknown outcomes without claiming a carrier booking or physical-world effect.

It is not imported by the Agentic Economy kernel. Production routing reaches it only through a registered capability binding and a server-held `AE_PROVIDER_TOKEN`.

The same deployment also exposes separate Shippo and EasyPost gateway handlers. Their credentials, carrier account IDs, signing material, observability key, and tracer shipment remain server-side environment values.

Run `npm run provider:readiness` from the repository root before deployment. It exits nonzero unless both provider configurations are syntactically complete. Use `node examples/routing-provider/run-provider-readiness.mjs --inventory-only` for a redacted inventory that never prints configured values.

`configured` means local configuration validation only. It does not prove credential validity, account reachability, overlapping quotes, label purchase, carrier acceptance, or physical fulfilment. Those require live execution and provider readback.
