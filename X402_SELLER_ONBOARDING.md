# Publish an x402 Operation

This is the public path for turning a live x402 endpoint into a callable Agentic Economy Operation. A listing or a successful unpaid probe is not a callable Operation.

## Before you start

Your endpoint must:

- be public HTTPS and return an x402 v2 `PAYMENT-REQUIRED` challenge;
- use exact USDC payment on a payment network supported by Agentic Economy;
- publish a Bazaar input and output contract that matches the route;
- declare the `payment-identifier` extension so uncertain outcomes can be reconciled;
- return bounded JSON that matches the published output contract; and
- use a payee wallet whose key can sign the Agentic Economy seller claim.

Keep the resource URL, HTTP method, payee address, input example, and current source material handy. Do not paste wallet private keys or buyer credentials into Agentic Economy.

## Onboard in the app

1. Open `/for-providers` and sign in as the business owner.
2. Choose **Add Operation** and enter the public x402 resource URL and method.
3. Review the unpaid protocol inspection. Agentic Economy shows the exact network, asset, amount, payee, and contract it observed.
4. Sign the displayed seller claim with the payee wallet. The claim binds the resource, observation, expiry, and business; it is not a payment authorization.
5. Complete the explicitly disclosed testnet verification. It does not charge a buyer or create supplier earnings.
6. Wait for settlement and output validation, then publish the sealed revision.
7. Open the returned Operation reference and confirm its readiness is **Ready now** before giving it to buyers.

If verification has an uncertain outcome, use the supplied status or reconciliation action. Do not submit a second payment. If the source, price, payee, schema, or revision changed, inspect and admit the new material instead of reusing old evidence.

## Agent and CLI access

Supplier commands require a separately approved credential with `market_supply:manage`:

```sh
ae connect --supplier --base-url "$AE_ORIGIN"
ae supply status <businessId> --base-url "$AE_ORIGIN" --json
```

The status result provides the exact next command, including revision, generation, and digest preconditions when they are required. Execute that command unchanged. Use `ae doctor --base-url "$AE_ORIGIN" --json` before consequential work.

For the admission model and evidence boundary, see [x402 Operation onboarding: evidence model and admission contract](./research/architecture/x402-operation-onboarding.md).
