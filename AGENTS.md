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

Agentic Economy is a cross-harness Tool market and commercial boundary for
just-in-time service procurement. Preserve one chain:

```text
capability gap -> service request/comparison -> Quote -> Call
    -> delivery or uncertainty -> remedy if required -> Purchase resolution/status
    -> Outcome records -> agent continues
```

A Tool is the canonical callable unit of supply. Purchase resolution/status is
the terminal state of its purchase, not a second market object. Portfolio
Service records, Offerings, Publications, Listings, Sources and Provider
connections remain distinct concepts and are not collapsed into Tools.

The Customer owns the larger objective and delegates authority. The Agent acts
through an Account and Spending policy or another supported Request
authorization. The Provider performs the Tool. For supported principal-reseller
purchases, Agentic Economy is the fixed buyer-facing Seller. The payment
recipient is recorded separately.

Never collapse these distinctions:

- Funding is not authority.
- Authority is not a purchase.
- Buyer consideration is not the Provider obligation.
- Settlement is not delivery.
- Delivery is not purchase resolution/status.
- A wallet, credential or endpoint does not establish a commercial role.

Agentic Economy does not own the user's project, planning, memory,
orchestration, final accounting classification or general agent runtime.

Do not confuse the external registry with the canonical market. Imported
metadata becomes a callable Tool only after admission and publication.

## Implementation truth

The product charter is forward-looking. Do not represent the complete Australian
principal-reseller record as implemented until source and tests establish it.
The current foundation includes brokered Calls, prepaid credit, Charges,
Provider earnings, refunds and recovery. Seller identity, separate Provider
obligation, attributed tax facts, business-document evidence and purchase
resolution remain explicit implementation work.

When AE-owned source identifiers still use old terms such as `supplier`,
preserve them as current compatibility names until their owning cutover issue
lands. The upstream protocol name `seller` is a protected external vocabulary
and remains unchanged after the AE cutover. New product language must use the
definitions in `CONTEXT.md`.

Generic IAM `Principal`, `Account`, `Business`, `User`, `Credential` and
`DelegationGrant` remain distinct from the Customer and Agent product roles.
Likewise, Provider, Seller and payment recipient; Charge, Provider obligation,
payable amount and Payout; and delivery status, payment status and Purchase
status remain separate facts. Generic Action execution and each Suggested next
action remain distinct from a purchased Call. Upstream OpenAPI `operationId`,
MCP methods, OAuth fields, x402 payment fields, opaque identifier prefixes,
canonical hash material, signatures and external financial namespaces retain
their exact protocol or evidence meaning.

## Node and command startup

Use Node 22 and npm 11.5.1 for all project commands, including Convex and child
processes. `.nvmrc` and `package.json` are the local runtime pins; `convex.json`
pins Node actions to the same major. Do not work around failures with Node 24/25
or a temporary downloaded runtime.

Check `node --version` and `npm --version` when starting an agent session.
Fresh login shells on Joel's machine select the project `.nvmrc`. Existing
Codex tasks can restore an older shell snapshot, including its PATH. For those
tasks or shells that do not load NVM, run commands from this checkout through
NVM's supplied runner, for example:

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run check:convex-codegen
```

This preserves the selected Node in child processes without hard-coded
installation paths. Runtime selection does not authorise deploying or changing
the selected Convex environment.

## Convex

This project uses Convex as its backend. Before changing Convex code, read
`convex/_generated/ai/guidelines.md`. Its project-specific API rules take
precedence over general guidance.

Convex agent skills for common tasks can be installed with
`npx convex ai-files install`.
