# Publish a Provider's x402 Tool

**Status:** active Provider runbook

The checked-in Tool publication and `tool.quote`/`tool.call` source contracts
are current. This runbook does not establish installed-client compatibility,
hosted deployment or production release.

**Terminology note:** this filename and the protocol field `seller claim` are
retained for compatibility. In the Agentic Economy commercial model, the hosted
service operator is the Provider and Agentic Economy is the buyer-facing Seller
for supported principal-reseller purchases.

This is the public path for turning a live x402 endpoint into a callable Agentic Economy Tool. A listing or a successful unpaid probe is not a callable Tool.

## Before you start

Your endpoint must:

- be public HTTPS and return an x402 v2 `PAYMENT-REQUIRED` challenge;
- use exact USDC payment on a payment network supported by Agentic Economy;
- publish a Bazaar input and output contract that matches the route;
- declare the `payment-identifier` extension so uncertain outcomes can be reconciled;
- return bounded JSON that matches the published output contract; and
- use a payee wallet whose key can sign the Agentic Economy protocol ownership
  claim.

Keep the resource URL, HTTP method, payee address, input example, and current source material handy. Do not paste wallet private keys or buyer credentials into Agentic Economy.

The protocol inspection and readiness check can reach your configured endpoint.
Use an example that is safe there and assume it may consume the endpoint's
normal quota or cost. A successful check does not publish the Tool, create
Provider earnings, or prove delivery. Agentic Economy does not promise a review
or publication time: read the current status after submission.

The payee address proves control of a payment destination. It does not, by
itself, establish the Provider, buyer-facing Seller or upstream contracting
party. Agentic Economy records those roles separately.

## Onboard in the app

1. Open `/for-providers` and sign in as the business owner.
2. Choose **Add Tool** and enter the public x402 resource URL and method.
3. Review the unpaid protocol inspection. Agentic Economy shows the exact network, asset, amount, payee, and contract it observed.
4. Sign the displayed `seller claim` with the payee wallet. The compatibility
   name comes from the x402 admission flow. The claim binds the resource,
   observation, expiry and Provider business; it is neither purchase authority
   nor proof that the payee is the buyer-facing Seller.
5. Complete the explicitly disclosed testnet verification. It does not charge a buyer or create Provider earnings.
6. Submit the sealed revision, then wait for settlement and output validation.
7. Read the returned Tool status. Only a current **Published** and routeable
   revision is ready to share with agents. Submission, a successful check, or
   publication does not itself guarantee demand, delivery, earnings, or payout.

If verification has an uncertain outcome, use the supplied status or reconciliation action. Do not submit a second payment. If the source, price, payee, schema, or revision changed, inspect and admit the new material instead of reusing old evidence.

## Agent and CLI access

Provider commands require a separately approved credential with
`market_supply:manage`. The current CLI flag is `--provider`; the retained
provider-supply verb is `ae supply operations`:

```sh
ae connect --provider --base-url "$AE_ORIGIN"
ae supply operations <businessId> --base-url "$AE_ORIGIN" --json
ae supply status <businessId> --base-url "$AE_ORIGIN" --json
```

The status result provides the exact next command, including revision, generation, and digest preconditions when they are required. Execute that command unchanged. Use `ae doctor --base-url "$AE_ORIGIN" --json` before consequential work.

For the admission model and evidence boundary, see [x402 Operation onboarding: evidence model and admission contract](./research/architecture/x402-operation-onboarding.md).
