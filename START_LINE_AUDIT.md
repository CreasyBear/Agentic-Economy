# Start-line gap audit — 2026-08-25

**Decision basis:** [`START_LINE.md`](START_LINE.md)  
**Source revision inspected:** `868c2fc67` plus the existing dirty planning tree  
**Hosted origin inspected:** `https://agentic-economy-phi.vercel.app`  
**Evidence boundary:** source inspection, focused local tests, anonymous hosted
reads, npm registry lookup, and the existing pinned Treg parity maps. No account
was created, no credential was issued, and no money or external state was
changed.

## Verdict

Agentic Economy has most of the hard transaction machinery in source, but it has
not reached the product start line.

The shortest summary is:

- **Source/local:** discovery, typed invocation, x402 signing and settlement
  verification, durable receipts, idempotency and recovery are implemented and
  focused tests pass.
- **Agent adoption:** incomplete. The CLI package builds locally but is not
  published to npm, and AE serves no Treg/Whop-equivalent installer or plugin
  family.
- **Hosted market:** broad metadata exists, but no admitted live Operation was
  found through the canonical Operation search during this audit.
- **Hosted commerce:** unavailable. Readiness fails, the deployed source revision
  is unconfigured, and x402 custody is not configured on the hosted origin.
- **End-to-end proof:** absent. There is no exact-revision receipt showing an
  unfamiliar supported harness discovering, paying for, and receiving a useful
  result from an independently supplied x402 Operation.

## Start-line checklist

| Requirement | Source/local | Hosted/live | Gap |
|---|---|---|---|
| Agent discovers AE without repository knowledge | PARTIAL | PARTIAL | `/llms.txt`, `/SKILL.md`, UCP and MCP are live, but there is no one-command installer/plugin and the CLI package is not published. |
| Search by task/capability | IMPLEMENTED | PARTIAL | The metadata registry reports 27,116 entries, but canonical Operation searches for `company enrichment`, `weather forecast`, and `timezone` returned `no_candidates`. |
| Inspect an exact callable Operation | IMPLEMENTED | NOT PROVED | Detail/compare/inspect-plan contracts and tests exist; the hosted search exposed no admitted candidate to inspect. |
| One bounded buyer credential and spending authority | IMPLEMENTED | NOT READY | Device/OAuth connection, grants and spend controls exist; hosted readiness reports invalid Clerk configuration and no usable paid journey was attempted. |
| Real independently supplied x402 call | IMPLEMENTED AND TESTED WITH FIXTURES | MISSING | Signing, request binding, transport and settlement verification pass locally; hosted x402 custody configuration is missing and no live receipt exists. |
| Structured result, cost and settlement readback | IMPLEMENTED | NOT PROVED | Durable result/evidence/usage contracts exist; there is no hosted paid result to read back. |
| Safe retry, poll and recovery | IMPLEMENTED | NOT PROVED | Idempotency, status, cancel and reconciliation tests pass; no hosted uncertain/failure journey has been exercised. |
| Activity and remaining spend in the agent environment | PARTIAL | NOT PROVED | Invocation status exposes usage, and browser/operator views exist; the root CLI has no Treg-style `balance`, `usage`, `activity` or `calls` command family. |

## Direct observations

### Hosted surface

- `GET /api/health` returned `200`.
- `GET /api/ready` returned `503 deployment_manifest_invalid`; the Convex probe
  was skipped.
- `GET /api/v1/release` returned `503 source_revision_unconfigured`.
- `/llms.txt`, `/SKILL.md`, `/.well-known/ucp`, MCP initialization and anonymous
  `tools/list` returned successfully.
- The hosted metadata registry reported 27,116 entries and returned both x402
  and Treg-origin metadata. Those entries explicitly remain
  `registry_metadata_only`; they are not admitted executable Operations.
- Hosted readiness reported missing source-write families, x402 custody and
  Stripe money configuration, plus incomplete model/chat configuration. Not all
  of those systems belong on the narrow start line, but the current readiness
  contract requires them and therefore prevents the deployment from being
  declared ready.

### Distribution

- `npm run test:cli-package` passed.
- `npm view @agentic-economy/cli` returned npm `E404`; an unfamiliar agent cannot
  run the documented package from the public registry.
- The CLI can generate an MCP connection through `connect --mcp`, but AE does not
  serve an installer comparable to Treg's `install.sh` or Whop's agent-oriented
  CLI/MCP/skill setup.

### Local verification

- Ten focused files covering agent skill, external registry adapters, x402
  import/readiness/transport/signing/settlement, paid-provider selection,
  reconciliation and the operation gateway passed: **122 tests**.
- The synthetic paid-operation browser suite passed: **7 tests**.
- These results prove implementation behavior only. The paid-operation browser
  suite is explicitly a development surface and does not prove real settlement
  or independent provider fulfilment.

## Shortest path to the start line

1. **Choose one proof supplier.** Select one cheap, deterministic, independently
   operated x402 endpoint whose returned value can be checked immediately.
2. **Graduate it into one admitted Operation.** Pin its contract, price,
   PaymentRequired challenge, readiness evidence and hosted revision so canonical
   Operation search returns it.
3. **Make the narrow hosted boundary ready.** Configure and verify exact release
   revision, source authority, buyer identity/grant, CDP x402 custody and RPC
   settlement. Either satisfy or deliberately narrow readiness requirements that
   belong to deferred chat, model and general billing work.
4. **Publish the agent entry.** Ship a public install/connect path that starts
   from a supported harness and produces a working MCP/skill/CLI connection
   without repository access. Publish the CLI if it remains the primary path.
5. **Close agent readback parity.** Add the smallest agent-visible balance,
   activity/calls and cost readback needed to understand what happened and what
   can be spent next.
6. **Record the proof.** Run discovery → inspect → connect → pay → result → status
   from Codex or Claude, then preserve the exact deployed revision, supplier,
   payment/settlement evidence, result digest, cost, and recovery behavior.

## Scope correction

The active [full-maturity program](.planning/maturity-execution/PLAN.md) is much larger than this start line. Its
principal/account redesign, general commercial kernel, Infisical migration,
enterprise operations, scale, disputes and GA work may be valuable later, but
most of it is not required to prove the Treg-clone foundation.

Near-term work should be selected by whether it removes one of the six gaps
above. Completing the full L3 program before the first real agent transaction
would invert the founder decision in [`START_LINE.md`](START_LINE.md).
