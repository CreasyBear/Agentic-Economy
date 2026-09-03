# Agentic Economy project instructions

## Read this first

Before product reasoning, planning, documentation or implementation, read
`PRODUCT.md`. It defines the active product and accepted commercial direction.

Use each source for the question it can answer:

1. `PRODUCT.md` defines what Agentic Economy is and owns.
2. `AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md` explains the institutional thesis.
3. `CONTEXT.md` defines canonical domain language.
4. Current source and tests define what is implemented.
5. `README.md` is the public and operational introduction.

Dated research, comparison papers, execution gates, generated maps and Git
history are evidence or history. They do not override the product charter.

## Product boundary

Agentic Economy is a cross-harness Operation market and commercial boundary for
just-in-time service procurement. Preserve one chain:

```text
capability gap -> resolution -> commitment -> invocation
    -> delivery or uncertainty -> remedy if required -> commercial closure
    -> outcome evidence -> agent continues
```

The Operation is the only unit of supply. Commercial closure is the terminal
state of its purchase, not a second market object.

The Business Principal owns the larger objective and delegates authority. The
Agent Principal acts through an Account and Mandate. The Provider performs the
Operation. For supported principal-reseller purchases, Agentic Economy is the
fixed buyer-facing Seller. The payment recipient is recorded separately.

Never collapse these distinctions:

- Funding is not authority.
- Authority is not a purchase.
- Buyer consideration is not the Provider obligation.
- Settlement is not delivery.
- Delivery is not commercial closure.
- A wallet, credential or endpoint does not establish a commercial role.

Agentic Economy does not own the user's project, planning, memory,
orchestration, final accounting classification or general agent runtime.

Do not confuse the external registry with the canonical market. Imported
metadata becomes an Operation only after admission and publication.

## Implementation truth

The product charter is forward-looking. Do not represent the complete Australian
principal-reseller record as implemented until source and tests establish it.
The current foundation includes brokered Invocation, prepaid credit, Charges,
Provider earnings, refunds and recovery. Seller identity, separate Provider
obligation, attributed tax facts, business-document evidence and commercial
closure remain explicit implementation work.

When source identifiers still use old terms such as `supplier` or protocol
`seller`, preserve compatibility unless the task authorises a migration. New
product language must use the definitions in `CONTEXT.md`.

## Convex

This project uses Convex as its backend. Before changing Convex code, read
`convex/_generated/ai/guidelines.md`. Its project-specific API rules take
precedence over general guidance.

Convex agent skills for common tasks can be installed with
`npx convex ai-files install`.
