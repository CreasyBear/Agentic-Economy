# Update Customer and Agent screens

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee: Luna Max / Customer and Agent screen owner
Assigned role: Luna Max / Customer identity, Agent access and onboarding presentation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 29, 30

## Outcome

Update the existing Customer, Agent access, agent setup, sign-in/sign-up and
account/security screens after issues 10-22 have established the source and
public contracts. The screen pass changes only person-facing terminology,
accessible names, error/recovery copy and copyable setup guidance. It preserves
the current authorization, approval, credential, connection, account and
security workflows; it does not add a new onboarding path or permission mode.

The Customer owns the larger objective. An Agent acts through an Account and
the selected Spending policy or Request authorization. Keep those roles and
the generic IAM Principal, User, Credential and DelegationGrant concepts
distinct in every screen.

## Fixed mappings and protected boundaries

| Current person-facing concept | Required presentation | Protection |
| --- | --- | --- |
| AE callable `Operation` / operation catalogue item | `Tool` / Tool catalogue item | Apply only to AE-owned callable supply. An upstream OpenAPI `operationId`, MCP method, or external registry record is not renamed. |
| Purchased operation invocation | `Call` | Use the post-16 `callRef`, `quoteRef`, `toolRef` and Tool snapshot fields once handed over; do not rename generic Action execution or its `executionRef`. |
| `maximumSpendPerInvocation` | `maximumSpendPerCall` | Consume issue 16's field; preserve policy digest material and display amount semantics. |
| `maximumConcurrentInvocations` | `maximumConcurrentCalls` | Consume issue 16's field; preserve the concurrency limit and refusal behaviour. |
| `inspect_only` | `read_only` | Issue 12 owns the authority value; render the exact accepted value and explanation. |
| `approve_each` | `approval_required` | Keep approval per Call separate from standing Spending policy. |
| `bounded_mandate` | `spending_policy` | Do not describe funding or a wallet as authority. |
| `full_yolo` | `unrestricted_test_only` | Keep the existing test-only warning and do not expose it as normal production authority. |
| `mandate_eligible` | `policy_eligible` | Preserve eligibility versus granted authority. |

Preserve `offline_access`, OAuth field names, MCP protocol names, x402 payment
fields, opaque identifier bytes/prefixes, origin checks, credential history,
and exact correlation/reference values. “Credit”, funding, approval and
security history are not interchangeable. A Call, delivery status, payment
status and purchase resolution/status remain separate facts.

## Finite implementation allowlist

Every path is literal. Issue 13/16 may first update imports, types and fields
in the shared consumer files; this ticket owns the later presentation pass in
those same files only. Do not move a core module from this ticket.

### Customer, Agent access and account screens

- `src/routes/_operator/agent-access.tsx`
- `src/routes/_operator/agent-access.authorize.tsx`
- `src/routes/_operator/owner.settings.tsx`
- `src/routes/_operator/owner.settings.developers.tsx`
- `src/routes/for-agents.tsx`
- `src/routes/sign-in.$.tsx`
- `src/routes/sign-up.$.tsx`
- `src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx`
- `src/components/ae/agent-access/AeAgentSecurityHistory.tsx`
- `src/components/ae/agents/AeAgentDoorPage.tsx`
- `src/components/ae/console/AeAgentOperatorConsole.tsx`
- `src/components/ae/console/AeAgentQuickstart.tsx`
- `src/components/ae/console/AeAssistantInstallFunnel.tsx`
- `src/components/ae/settings/AeAccountSecurityHistory.tsx`
- `src/components/ae/settings/AeCompromiseRecoveryChecklist.tsx`
- `src/components/ae/settings/AeSecurityHistoryTable.tsx`
- `src/components/ae/settings/OwnerSettingsSections.tsx`
- `src/components/ae/settings/OwnerSettingsShell.tsx`
- `src/components/ae/website/AeAgentInstructionCard.tsx`
- `src/lib/operator/settings-navigation.ts`

### Shared brand copy, section-owned here

- `src/content/brand-copy.ts` — own only the `AGENT_INSTRUCTION`, `AGENT_DOOR`
  and `AGENT_PAGE` exports. Leave `HOME` to issue 24, `BUSINESS_DOOR` to issue
  25, and `ABOUT` to issue 27; do not rewrite the whole module as a second
  vocabulary pass.

### Focused existing behaviour tests

The worker may update these tests only where an assertion is a presentation
contract or an import/path changed by the preceding core owner:

- `tests/unit/ui/agent-access-owner-console.test.tsx`
- `tests/unit/ui/agent-door-page.test.tsx`
- `tests/unit/routes/agent-access-authorize.test.tsx`
- `tests/unit/routes/agent-access-caller-continuation.test.tsx`
- `tests/unit/routes/agent-access-console.test.ts`
- `tests/unit/routes/sign-in-single-account-exit.test.tsx`
- `tests/unit/routes/sign-in-stage.test.tsx`
- `tests/unit/routes/sign-up-neutral-account-entry.test.tsx`
- `tests/unit/settings/account-security-history.test.tsx`
- `tests/unit/agent-access-functions.test.ts`
- `tests/unit/agent-access.test.ts`

`tests/unit/ui/demand-console.test.tsx` is a shared evidence test for the
Agent console, assistant setup and Credit panels. Issue 23 may run it and may
change only its Agent/assistant assertions after coordinating with issue 26;
issue 26 owns its Credit assertions. No two workers may edit this file at the
same time.

## Post-core handoff and sequencing

Before the presentation pass, consume the literal paths and public names from
the completed receipts for issues 13, 15, 16, 19, 20, 21 and 22:

- Issue 13's Tool consumer paths include
  `src/modules/common/tool-ref.ts`, `src/modules/registry/tool-paths.ts`,
  `src/modules/registry/tool-action-contracts.ts` and
  `src/modules/registry/tools.actions.ts`.
- Issue 15 supplies `quoteRef` and the Quote-facing contract paths.
- Issue 16 supplies `callRef`, `quoteRef`, `toolRef`, Call status/recovery
  paths, and the two Call budget field names above.
- Issues 19-21 supply the actual HTTP/MCP/CLI/plugin/discovery names. Copyable
  instructions in this ticket consume those names; this ticket does not change
  protocol producers or invent aliases.
- Issue 22 supplies generated output only after its producer checkpoints. Do
  not hand-edit generated files in this ticket.

The shared `brand-copy.ts` edits are serialized as 23 → 24 → 25. The issue 24
and 25 workers must receive the completed section handoff before editing their
own exports.

## Explicit exclusions

- Do not edit `PRODUCT.md`, `AGENTS.md`, `CONTEXT.md`, the accepted design,
  Wayfinder map, work record, any other issue file, or generated artifacts.
- Do not rename core modules, Convex tables, routes, public HTTP/MCP methods,
  upstream `operationId`, OAuth/x402 fields, opaque IDs, hashes or signatures.
- Do not change authority values beyond issue 12's exact mappings, add a new
  permission mode, or infer authority from Account funding, credentials or a
  wallet.
- Do not redesign onboarding, add an SDK, add aliases, change CLI verbs or
  invent a new agent harness. Existing Codex, Claude Code, Cursor and native
  client instructions remain the supported workflow.
- Generic IAM and security concepts remain distinct from Customer and Agent;
  Provider/Seller identity and payout copy belongs to issue 25/26.
- Do not make the Agent operator console an independent Call implementation;
  it remains a view of existing approval, budget and lifecycle functions.

## Verification commands and expected results

Run from the project checkout with Node 22 and npm 11.5.1 selected:

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" node --version
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm --version
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run --no-file-parallelism \
  tests/unit/ui/agent-access-owner-console.test.tsx \
  tests/unit/ui/agent-door-page.test.tsx \
  tests/unit/routes/agent-access-authorize.test.tsx \
  tests/unit/routes/agent-access-caller-continuation.test.tsx \
  tests/unit/routes/agent-access-console.test.ts \
  tests/unit/routes/sign-in-single-account-exit.test.tsx \
  tests/unit/routes/sign-in-stage.test.tsx \
  tests/unit/routes/sign-up-neutral-account-entry.test.tsx \
  tests/unit/settings/account-security-history.test.tsx \
  tests/unit/agent-access-functions.test.ts \
  tests/unit/agent-access.test.ts
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck
```

Expected results are Node 22.x, npm 11.5.1, all listed focused tests green,
and typecheck green after the upstream core handoffs. A pre-existing baseline
failure must be recorded rather than weakened; no new failure may be hidden by
loosening an assertion. The mixed demand-console test is run at the issue 26
checkpoint and must retain both its Agent and Credit coverage.

## Acceptance

- Customer/Agent labels and explanations are correct on access, onboarding,
  account, security-history, recovery and sign-in/sign-up surfaces. Customer
  is not presented as a generic IAM Principal, and Agent authority is not
  presented as funding.
- Permission/profile controls use exactly the issue 12 values and explain
  read-only, approval-required, spending-policy and test-only states without
  changing the current authorization workflow.
- Agent access load, pagination, approval load/decision, revoke/disconnect,
  credential history and compromise-recovery error states have an actionable
  accessible name, stable focus/disabled behaviour and no leaked credential or
  opaque-secret material.
- The Agent setup and copyable instructions describe the existing discovery →
  inspect/Quote → Call journey and use the actual emitted names from issues
  19-21. They do not claim that an anonymous registry description is a
  caller-specific Quote.
- Call budget labels use `maximumSpendPerCall` and
  `maximumConcurrentCalls` where the underlying issue 16 consumer is present;
  existing amount, authority and approval semantics remain unchanged.
- No Provider/Supplier supply or money/payout presentation is changed outside
  the explicit shared-copy handoff.

## Closure evidence

Attach the focused test and typecheck output, the final literal changed-path
list, and a short before/after assertion note for each of the three error
paths (directory/approval loading, lifecycle revoke/disconnect, and security
history/recovery). Include the completed `brand-copy.ts` section handoff to
issue 24. Confirm that no generated output, public protocol producer or
unlisted screen was edited.

## Comments

This is a downstream presentation task, not implementation proof for the
rename itself. Old source identifiers may still exist until issues 10-22 land;
they are not a failure of this pre-cutover ticket. The worker must not claim
live/public completion from this screen pass.
