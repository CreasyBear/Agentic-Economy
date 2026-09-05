# Update CLI consumers and package-facing distribution language

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee: Luna Max / CLI consumer implementation owner
Assigned role: Installed `ae` CLI and package consumer owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 29, 30

## Outcome

Update every supported `ae` command, help projection, action adapter, local
credential/profile message and package README to consume the approved Tool,
Quote, Call, Provider, authority and outcome vocabulary. Preserve the existing
CLI verbs and the single compiled-binary package boundary. This ticket owns CLI
source and package-facing prose; issue 22 owns the generated dist/public
archive and final package-integrity run.

## Fixed behavior and important distinction

Use the exact mappings and protected values in
`docs/designs/vocabulary-rationalisation.md:35-75,261-291`. Public CLI
`--supplier` becomes `--provider` with no old flag alias. Provider-facing copy,
profiles, errors and next actions use Provider; preserve any protocol or
namespace not explicitly mapped, including `market_supply:manage` pending an
explicit coordinator decision.

The retained `describe` verb is the anonymous
`registry.operations.describe` consumer (target `registry.tools.describe`): it
returns public Tool detail and must not be promoted to caller-specific
`tool.quote`. The retained `call` verb and its existing
`tools/ae/commands/invoke.ts`/`tools/ae/commands/action-adapters.ts` path
obtain the caller-specific Quote and then perform `tool.call`. Retain `history`
as the CLI verb for the target `call.list` action. Do not add `inspect`, `quote`,
`receipt` or `reuse` command aliases or a new hierarchy.

Preserve origin-bound authentication, HTTPS/loopback rules, native OAuth
device flow, no token/private-input leakage, `--input`, stable idempotency,
`--wait`, pending/unknown/recovery behavior and the distinction between
delivery, payment, purchase resolution/status and outcome records. Use the
accepted authority mode/scope mapping from issue 19; do not make a spending
policy a universal prerequisite where request authorization/Approval is the
supported path.

## Finite implementation allowlist

Only these CLI, helper, package and maintained CLI-consumer paths are in scope.
Do not sweep `tools/ae` or `packages` by directory.

### CLI entry, help and helpers

- `tools/ae/cli.ts`
- `tools/ae/lib/args.ts`
- `tools/ae/lib/config.ts`
- `tools/ae/lib/continuation-command.ts`
- `tools/ae/lib/help.ts`
- `tools/ae/lib/operation-format.ts`
- `tools/ae/lib/operation-read-failure.ts`
- `tools/ae/lib/output.ts`
- `tools/ae/lib/policy.ts`
- `tools/ae/lib/suggested-continuation-adapter.ts`
- `src/lib/cli-distribution.ts`

### Supported command implementations and action adapters

- `tools/ae/commands/account.ts`
- `tools/ae/commands/action-adapters.ts`
- `tools/ae/commands/cancel.ts`
- `tools/ae/commands/compare.ts`
- `tools/ae/commands/config.ts`
- `tools/ae/commands/connect.ts`
- `tools/ae/commands/describe.ts`
- `tools/ae/commands/doctor.ts`
- `tools/ae/commands/fund.ts`
- `tools/ae/commands/history.ts`
- `tools/ae/commands/invoke.ts`
- `tools/ae/commands/list.ts`
- `tools/ae/commands/manifest.ts`
- `tools/ae/commands/market-operations.ts`
- `tools/ae/commands/recover.ts`
- `tools/ae/commands/request.ts`
- `tools/ae/commands/revoke.ts`
- `tools/ae/commands/search.ts`
- `tools/ae/commands/status.ts`
- `tools/ae/commands/supply.ts`
- `tools/ae/commands/wait.ts`

### Package-facing source

- `packages/cli/package.json`
- `packages/cli/README.md`

### Existing maintained consumer tests

- `tests/unit/discovery/cli-distribution.test.ts`

## Explicit exclusions and sequencing

Do not edit HTTP/MCP contract definitions or route files owned by issue 19,
discovery/plugin producers owned by issue 21, generated dist/public archives or
package harness owned by issue 22, current root README owned by issue 27,
screens, test data, deployment state, plan/map/work record or Package 6/7.
Issues 20 and 21 may run concurrently only because these allowlists are
disjoint. Both consume issue 19's declared action/route/field contract and the
core outcomes of issues 10–18; neither may invent a local mapping.

## Verification commands and expected results

Use Node 22 and npm 11.5.1 through the project NVM runner:

- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck` — pass for CLI
  source and package metadata.
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:types` — pass without
  changing protected external protocol types.
- Run the existing `cli-distribution.test.ts` through the repository's
  configured Vitest command — command-set, package-distribution, provider-flag
  and native MCP setup projections agree. The HTTP/MCP cold-loop remains in
  issue 19's focused boundary suite; do not duplicate ownership here.
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" node packages/cli/dist/ae.js --help --json`
  and `manifest --json` — run after issue 22 regenerates the bundle; every
  advertised command is executable and target fields/action IDs are present.
- `git diff --check -- tools/ae/cli.ts tools/ae/lib/args.ts
  tools/ae/lib/config.ts tools/ae/lib/continuation-command.ts
  tools/ae/lib/help.ts tools/ae/lib/operation-format.ts
  tools/ae/lib/operation-read-failure.ts tools/ae/lib/output.ts
  tools/ae/lib/policy.ts tools/ae/lib/suggested-continuation-adapter.ts
  src/lib/cli-distribution.ts tools/ae/commands/account.ts
  tools/ae/commands/action-adapters.ts tools/ae/commands/cancel.ts
  tools/ae/commands/compare.ts tools/ae/commands/config.ts
  tools/ae/commands/connect.ts tools/ae/commands/describe.ts
  tools/ae/commands/doctor.ts tools/ae/commands/fund.ts
  tools/ae/commands/history.ts tools/ae/commands/invoke.ts
  tools/ae/commands/list.ts tools/ae/commands/manifest.ts
  tools/ae/commands/market-operations.ts tools/ae/commands/recover.ts
  tools/ae/commands/request.ts tools/ae/commands/revoke.ts
  tools/ae/commands/search.ts tools/ae/commands/status.ts
  tools/ae/commands/supply.ts tools/ae/commands/wait.ts
  packages/cli/package.json packages/cli/README.md
  tests/unit/discovery/cli-distribution.test.ts` — no whitespace errors.

Do not run the package Node20/22 downloaded-runtime matrix here; issue 22 owns
that unresolved coordinator decision. Do not start a backend, deploy or push
schema from this ticket.

## Acceptance

- [ ] All currently supported CLI verbs remain available, including `describe`,
      `call`, `history`, `status`, `wait`, `cancel` and `recover`; no new verb,
      hierarchy or old alias is introduced.
- [ ] `describe` is anonymous Tool detail (`registry.tools.describe` after
      cutover); only the retained `call` command invokes the existing
      caller-specific Quote -> Call adapter.
- [ ] Public `--supplier` is replaced by `--provider` in parser, help, doctor,
      connect, account, supply, errors and next actions; `--supplier` is not
      accepted as a compatibility alias.
- [ ] Help, JSON manifest, placeholders, route paths, inputs, outputs, errors,
      status, cancellation, reconciliation and recovery use the exact target
      fields/action names from issue 19 while preserving origin, idempotency,
      OAuth, x402, opaque-reference and no-leak protections.
- [ ] `history` remains the CLI presentation of `call.list`; pending/failed,
      refunded/delivered, payment and purchase-resolution facts remain distinct.
- [ ] Package metadata/README describe the one compiled `ae` binary and no
      programmatic imports; copyable examples do not say `ae inspect`, use a
      weather proxy, or imply target routes are already live.
- [ ] The listed CLI-distribution test passes; no unrelated source, protocol, dependency,
      generated-output or Git changes are included.

## Closure evidence

Attach the changed CLI/package path list, command/help parity receipt, exact
`describe` versus mediated `call` trace, `--provider` parser/help receipt,
auth/origin/error/recovery test results and package-boundary result. Mark dist,
public tarball and hosted/live proof pending issue 22 and later verification.

## Comments

- 2026-09-05 — Prepared as the finite CLI consumer owner following DX-01's
  correction. This ticket must preserve the CLI verbs while consuming issue
  19's target public contract; it must not turn anonymous `describe` into a
  Quote action.
