# Define migration proof and the return to package delivery

Type: grilling
Label: wayfinder:grilling
Status: resolved
Parent: ../map.md
Blocked by: 06

## Question

What observable evidence proves the new vocabulary works across all migrated
surfaces without changing behaviour, and permits Package 6/7 work to resume?
Bind checks to actual artifacts, data and environments. Include generated/client
contract consistency, preserved IDs and financial totals, credential rotation,
retry/recovery of existing calls, provider lifecycle and the affected installed
client and x402 sandbox/testnet journeys. Scope exact journeys from current
acceptance records rather than inventing or weakening their requirements.

Separate baseline failures from rename regressions; local tests, restore proof,
deployed behaviour and historical evidence are different facts. Define allowed
old-name exceptions and a focused existing-check approach, not a new test system.
Final direction approval applies to a specific complete plan revision; unavailable
live proof remains open, and planning completion is not delivery completion.

## Answer — accepted 2026-09-05

Joel approved the [implementation plan](../../../docs/designs/vocabulary-rationalisation.md),
including Phases 4/5 and its Done condition. Acceptance is fixed, not waived:

- One vocabulary across implemented source, physical database names, HTTP,
  MCP, installed CLI, generated/plugin instructions, UI and current docs.
- Existing permission, money, identity, concurrency and recovery behaviour is
  preserved. Protected identifier/hash/signature vectors stay byte-stable;
  exact remaining old-name exceptions have reasons.
- Run the plan's focused and integrated existing checks. Record baseline
  failures separately; no weakened assertions or advisory-pass substitution.
- Prove clean local data and existing seed behaviour after supported backup
  and restore; never replay historical external effects.
- Actually exercise sign-in/account/agent credentials and permissions;
  Tool discovery → Quote → useful x402 testnet Call → result/usage;
  blocked/expired/uncertain/recovery cases without duplicate charging;
  Provider publish/withdraw lifecycle; and credit/charges/refunds/earnings.
- Record build, environment, actions, observed results and limitations.
  Local source, local runtime, deployed candidate and live acceptance are
  separate evidence. Missing deployed proof remains open.
- Hosted test cutover requires exact targets, maintenance-window accounting,
  callback/job isolation and matched rollback. New external financial effects
  must be reconciled before rollback.
- Commit only owned refactor work, retain deliberate recovery records and
  history, and hand the coherent contracts/evidence to Package 6/7 owners.
  Resume their work without changing their outstanding acceptance criteria.

This ticket closes the acceptance decision only. Implementation, verification,
live QA and release issues remain unresolved until their evidence passes.
