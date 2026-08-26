# Agentic Economy start line

**Status:** founder direction  
**Decided:** 2026-08-25  
**Purpose:** govern the next product milestone before differentiated value-add
services are built

## Decision

Agentic Economy will first clone Treg's working product foundation: a catalogue
of agent-callable capabilities, one buyer access boundary, clear price and
operational evidence before a call, structured invocation, and durable usage and
cost readback.

This is a deliberate foundation strategy, not the final differentiation.
Agentic Economy should make the familiar market loop work end to end before it
adds automatic provider selection, outcome learning, composition, or broader
allocation services.

Whop is the quality reference for the agent-facing entry experience: the product
should be self-describing, installable into the agent environment already in use,
structured in and out, and auditable without requiring a browser journey.

x402 is the first live transaction substrate. Existing x402 supply establishes
that paid machine-callable services exist; Agentic Economy still has to prove
that its own agent surface can discover an eligible Operation, disclose the
price, authorize and settle a real payment, return a useful provider result, and
preserve an intelligible receipt and recovery path.

## Start-line contract

The foundation has reached the start line when one unfamiliar agent can, through
a documented one-command installation or connection:

1. discover Agentic Economy's machine surface without repository knowledge;
2. search the live catalogue by task or capability;
3. inspect one exact callable Operation, including inputs, price, access and
   operational evidence;
4. use one bounded buyer credential and spending authority;
5. execute one independently supplied x402 Operation with real funds;
6. receive a useful structured result plus invocation, cost and settlement
   readback;
7. safely retry, poll or recover without causing a duplicate effect or charge;
8. inspect activity and remaining spend from the same agent environment.

The proof must run from a real supported harness such as Codex or Claude against
an exact hosted revision. Local mocks, synthetic suppliers, indexed external
payments, and source-green tests do not satisfy the live transaction requirement.

## In scope now

- Treg product-parity work needed by the start-line journey.
- Whop-quality CLI, MCP, skill and machine-documentation entry.
- First-party catalogue, inspection, credential, invocation, activity and cost
  contracts.
- One real x402 discovery-to-result transaction and its failure/recovery cases.
- The smallest hosted and operational boundary needed to repeat that journey.

## Deferred until after the start line

- Automatic provider routing and fallback.
- Outcome-aware ranking and persistent allocation intelligence.
- Multi-Operation planning or a general workflow engine.
- Broad protocol expansion that is not required by the proof journey.
- Full organization, enterprise, scale, support, dispute and general-availability
  maturity beyond what the proof journey requires.
- Catalogue or supplier breadth pursued without improving the agent transaction
  loop.

## Relationship to existing decisions

This note narrows the next milestone under
[`PROJECT.md`](.planning/PROJECT.md) and
[`ADR-036`](.planning/adr/ADR-036-agent-tool-market-foundation.md). It does not replace the
Operation contract, evidence boundaries, supplier-hosting model, or shared
invocation authority established there.

The first proposed compounding layer after this proof is documented in
[`AGENT_COMMERCE_FLYWHEEL.md`](AGENT_COMMERCE_FLYWHEEL.md): connect Qualified
Use to the agent's next inference or Operation, reward productive continuation,
and fund those rewards from supplier demand and verified execution savings.

The detailed Treg comparison remains in
[`AE-TREG-PARITY.md`](.planning/reference/treg/AE-TREG-PARITY.md). That map
describes total parity; this note identifies the smaller subset required to
reach the next start line.
