# Agentic Economy project instructions

**Revised:** 2026-09-10

## Read this first

For product behaviour and implementation changes, read `PRODUCT.md` first — it defines the active product and accepted commercial direction. For "run locally" tasks, follow README's "Run locally" section.

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
Provider earnings, refunds and recovery. The accepted source cutover also
defines Tool/Quote/Call actions and Call recovery contracts. Seller identity,
separate Provider obligation, attributed tax facts, business-document evidence
and purchase resolution remain explicit implementation work.

Earlier AE-owned terms may remain in historical evidence, protected protocol or
hash material, opaque encodings and document filenames. They are not current API
aliases after the accepted source cutover. The upstream protocol name `seller`
is protected external vocabulary and remains unchanged. New product language
must use the definitions in `CONTEXT.md`. Source acceptance does not establish
installed-package compatibility, hosted deployment, or production proof.

Generic IAM `Principal`, `Account`, `Business`, `User`, `Credential` and
`DelegationGrant` remain distinct from the Customer and Agent product roles.
Likewise, Provider, Seller and payment recipient; Charge, Provider obligation,
payable amount and Payout; and delivery status, payment status and Purchase
status remain separate facts. Generic Action execution and each Suggested next
action remain distinct from a purchased Call. Upstream OpenAPI `operationId`,
MCP methods, OAuth fields, x402 payment fields, opaque identifier prefixes,
canonical hash material, signatures and external financial namespaces retain
their exact protocol or evidence meaning.

## File naming

Use a consistent filename convention within each area, not one casing style
for the entire repository. Canonical vocabulary comes from `CONTEXT.md`;
filename casing follows these rules:

| Area | Convention | Example |
| --- | --- | --- |
| Domain modules, utilities, scripts and standalone tests | `kebab-case` | `call-authority.ts`, `call-authority.test.ts` |
| AE-owned Convex backend files, including internal helpers | `camelCase` | `capabilityCallIdentity.ts`, `authorityHandlers.ts` |
| AE-owned React component files | `PascalCase` | `ToolCard.tsx`, `AeAgentOperatorConsole.tsx` |
| Tests colocated with their source | Match the source stem | `agentAccessPolicy.test.ts` |
| Routes, framework entry points and generated files | Preserve framework/generator naming | `__root.tsx`, `_operator.tsx`, `api.v1.tools.quote.ts` |
| Maintained component-library or vendored files | Preserve upstream naming | `button-variants.ts`, `radio-group.tsx` |

Retain established role suffixes such as `.actions.ts`, `.functions.ts`,
`.test.ts` and `.spec.ts`. React helpers that are not component files follow
the utility convention. Underscores required by a framework or protocol are
not a reason to introduce `snake_case` for ordinary AE-owned source files.

Existing outliers are cleanup candidates, not additional conventions. Correct
them only through an explicit bounded assignment covering imports, tests and
any affected backend function references or generated outputs. A filename
change does not authorize changing public contracts, protected identifiers or
historical evidence. These rules do not authorize a directory reorganisation,
manual edits to generated files or an unplanned repository-wide rename.

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
