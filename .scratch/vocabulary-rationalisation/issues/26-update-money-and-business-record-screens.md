# Update money and business-record screens

## Money SOURCE ACCEPTED — 2026-09-07

Independent oversight accepted the corrected immutable Money candidate after reviewing the complete42path boundary and exact2file readBooking correction. Current accepted baseline `/tmp/ae-money-review-corrected-candidate-20260907/manifest.json`. No remaining Money finding; protected v1 digest/claims and historical receipt mapping accepted. Seven of ten source groups formally accepted. Mandatory storage return29/29PASS is retained; Group9 shared discovery/callhelper defects remain separately owned. Public implementation now advances from completed inventory. No global/compiler or225/29 repeats required solely for the two-field correction. Integrated checks, artifacts/docs, localcommits and parked runtime work remain open.

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee:
Assigned role: Luna Max / Account credit, Call charges, Provider earnings, payout and document presentation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 25, 29, 30

## Outcome

Update the existing Account credit/funding, Call charge, Provider earnings,
payout-readiness and durable business-record screens after issues 10-22 have
established their core contracts and issue 25 has completed the Provider
workspace presentation pass. Change only person-facing terminology,
accessible names, error/retry copy and record explanations. Preserve the
existing funding, reserve, charge, refund, earnings, payout, document,
reconciliation and recovery workflows; do not add a financial product or
change a payment boundary.

Funding is not authority. An Account balance is not an Agent Spending policy,
a Charge is not a Provider obligation, a payable amount is not a Payout, and
delivery/payment/purchase resolution and Outcome records remain separate
facts. Preserve the current customer, Provider, Seller and payment-recipient
identity distinctions in every money or business-record surface.

## Fixed mappings and protected boundaries

| Current AE-owned term or field | Required presentation | Protection |
| --- | --- | --- |
| Purchased operation invocation | Call | Consume issue 16's Call consumer fields and status names; do not rename generic Action execution. |
| `operationRef` / `commitmentRef` / `invocationRef` | `toolRef` / `quoteRef` / `callRef` | Consume issue 13/15/16 paths and fields; preserve opaque IDs, snapshot/version bytes and canonical hashes. |
| `maximumSpendPerInvocation` | `maximumSpendPerCall` | Preserve policy digest material, amount/exponent and authority meaning. |
| `maximumConcurrentInvocations` | `maximumConcurrentCalls` | Preserve concurrency and refusal semantics. |
| Account funding / credit | Account balance or credit, as the existing screen context requires | Funding/payment completion must not be presented as authority or as a settled Call. |
| Charge | Charge | Keep Charge separate from Provider obligation, payable amount and Payout. |
| Provider earnings / payout readiness | Provider earnings / payout readiness | Seller and payment recipient remain separate records; do not imply successful delivery or purchase resolution from payout state. |
| business document / reconciliation record | business document / reconciliation record | Preserve immutable record, tax/evidence, source and external financial namespace meanings. |

Keep exact currency amounts, exponents, rounding, quote validity, payment
status, delivery status, purchase status, refund/recovery state, document
references, Stripe/x402 protocol fields and external financial identifiers.
Do not recursively substitute old-looking keys inside opaque Tool or Provider
input.

## Finite implementation allowlist

Every path is literal. Issues 15-18 own source/storage/codec/event/field
propagation first. Issue 19 owns public HTTP/MCP producers and issue 20/21
own installed-client/discovery/plugin producers. This ticket owns only the
presentation pass and focused screen assertions after those handoffs.

### Account credit, funding and earnings components

- `src/components/ae/console/AeCreditTopUpPanel.tsx`
- `src/components/ae/console/AeOwnerCredit.tsx`
- `src/components/ae/supply/AeSupplyEarningsCard.tsx`
- `src/components/ae/services/money.ts`
- `src/components/ae/offerings/AeProviderWorkspace.tsx` — issue 26 owns
  only the `earnings`/payout-readiness and money/business-record summary
  section after issue 25's Provider lifecycle section is handed off. Do not
  edit Provider setup, connections, publication, availability or offboarding
  copy in this shared file.

`src/components/ae/services/money.ts` is a presentation/formatting boundary
only. Do not change its amount arithmetic, currency rules or external money
provider behavior.

### Money and business-record routes

- `src/routes/_operator/owner.credit.tsx`
- `src/routes/_operator/owner.settings.payouts.tsx`
- `src/routes/fund.$fundingSessionId.tsx`
- `src/routes/fund.cancelled.tsx`

`src/routes/privacy.remove-business.tsx` remains issue 25's Provider/business
identity lifecycle surface. `src/routes/_operator/owner.settings.tsx` and
`src/components/ae/settings/OwnerSettingsSections.tsx` remain issue 23's
account/security/navigation surfaces; only consume their links and labels.

### Focused existing behaviour tests

- `tests/unit/ui/supply-funnel-earnings.test.tsx`
- `tests/unit/routes/funding-contract.test.ts`
- `tests/unit/money/public-format.test.ts`
- `tests/unit/money/account-funding-http.test.ts`
- `tests/unit/money/owner-payout-transfer-http.test.ts`
- `tests/unit/money/payout-policy.test.ts`
- `tests/unit/convex/money-account-funding.test.ts`
- `tests/unit/convex/money-documents.test.ts`
- `tests/unit/convex/money-managed-call.test.ts`
- `tests/unit/schema/money-schema.test.ts`

`tests/unit/ui/demand-console.test.tsx` is shared with issue 23: issue 26
owns only the Credit-panel assertions after the Agent/assistant section is
handed off. `tests/unit/ui/provider-workspace.test.tsx` is shared with
issue 25: issue 26 owns only its earnings/payout assertions after issue 25's
Provider assertions are complete. No two workers may edit either shared test
at the same time.

## Post-core handoff and sequencing

The worker must receive literal completion receipts from the preceding owners:

- Issue 13 supplies Tool projection/reference paths, including
  `src/modules/common/tool-ref.ts`, with opaque `operation:v1:` bytes intact.
- Issue 15 supplies Quote paths and `quoteRef`; a Quote is consideration and
  validity, not a payment or settlement record.
- Issue 16 supplies Call paths/fields, including `callRef`, `quoteRef`,
  `toolRef`, Call status/recovery and
  `maximumSpendPerCall`/`maximumConcurrentCalls`. Preserve the existing
  Call/charge/reserve sequencing and no-double-charge behavior.
- Issue 17/18 supply purchase resolution/status, Outcome records, durable
  money links, indexes, codecs, events and business-document facts. This
  ticket renders their existing outputs; it does not rename storage, invent a
  tax model or alter reconciliation.
- Issue 19 supplies the actual `tool.quote`, `tool.call`, `call.status`,
  `call.cancel`, `call.reconcile` and `call.list` HTTP/MCP contracts. Issue 20
  /21 supply exact CLI/discovery/plugin producer names. Do not add a second
  money action map or change CLI verbs.
- Issue 22 supplies generated output at its checkpoints. Do not hand-edit
  generated router, Convex, client or public bundle artifacts.
- Issue 25 supplies the Provider-screen handoff for the shared workspace;
  only then may this issue edit its earnings/payout subsection.

## Explicit exclusions and sequencing

- Do not edit `PRODUCT.md`, `AGENTS.md`, `CONTEXT.md`, the accepted design,
  Wayfinder map, work record, any other issue file, generated artifacts, core
  money/Call/storage modules, public HTTP/MCP producers, CLI/distribution,
  llms/SKILL/plugin machine copy, deployment state or documentation owned by
  issues 27/28.
- Do not change amount arithmetic, currency/exponent/rounding rules, payment
  provider, x402 fields, Stripe protocol fields, webhook behavior, refunds,
  reservation, concurrency, charge/refund/recovery sequencing, durable
  document schema or reconciliation algorithms.
- Do not treat Account credit/funding as Customer or Agent authority; do not
  expose credentials, payment secrets, wallet material or opaque internal
  records. Preserve the existing approval and Spending policy path.
- Do not collapse Charge, Provider obligation, payable amount, Payout, Seller,
  payment recipient, delivery, payment, purchase resolution/status or Outcome
  records. Do not claim that a payout proves delivery or purchase resolution.
- Do not turn Provider earnings into a new supply object, change Offering /
  Publication / Listing / Source semantics, or take ownership of Provider
  identity removal (`privacy.remove-business.tsx`).
- Do not add dashboards, exports, documents, free-tier behavior, SDKs, aliases,
  new recovery actions, infrastructure or UI redesign. Existing screens and
  workflows are the scope.

## Verification commands and expected results

Run from the project checkout with Node 22 and npm 11.5.1 selected:

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" node --version
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm --version
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run --no-file-parallelism \
  tests/unit/ui/supply-funnel-earnings.test.tsx \
  tests/unit/routes/funding-contract.test.ts \
  tests/unit/money/public-format.test.ts \
  tests/unit/money/account-funding-http.test.ts \
  tests/unit/money/owner-payout-transfer-http.test.ts \
  tests/unit/money/payout-policy.test.ts \
  tests/unit/convex/money-account-funding.test.ts \
  tests/unit/convex/money-documents.test.ts \
  tests/unit/convex/money-managed-call.test.ts \
  tests/unit/schema/money-schema.test.ts
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck
```

Expected results are Node 22.x, npm 11.5.1, all focused money/screen tests
green and typecheck green after issues 10-22 and the issue 25 workspace
handoff. Run the two shared UI tests at their serialized checkpoints and
record both halves. Existing baseline failures are recorded rather than
silenced; no protected money or authority assertion may be weakened.

## Acceptance

- Account credit/funding screens clearly distinguish funding-session pending,
  succeeded, cancelled, failed and unknown states; a cancelled/failed
  payment cannot be presented as new Account credit or changed authority, and
  retry/readback behavior prevents double payment claims.
- Customer Call records display Tool, Quote and Call references with the
  correct `toolRef`, `quoteRef`, `callRef` labels after core handoff, and show
  quote validity, charge, reservation, delivery/payment status, purchase
  resolution/status and Outcome records as separate facts.
- Agent budget and approval copy uses
  `maximumSpendPerCall`/`maximumConcurrentCalls` without changing policy
  authority, concurrency or amount semantics. Account balance and funding
  copy never implies authorization.
- Provider earnings and payout-readiness screens distinguish Provider
  obligation, payable amount, Payout, Seller and payment recipient; payout
  setup/retry/recovery and document/reconciliation states remain actionable,
  accessible and free of payment/credential secret leakage.
- Existing business-document and money-formatting surfaces preserve exact
  amounts, currency/exponents, immutable record references and external
  financial namespaces. No new record type, export or financial workflow is
  introduced.
- Three concrete error paths are covered: funding/payment failure or
  cancellation, Call charge/receipt/recovery uncertainty, and Provider payout
  or document/reconciliation failure. Each has stable accessible status and
  next action while preserving the underlying state machine.
- Focused tests, shared UI checkpoints and typecheck show no new regression;
  no Provider lifecycle, identity, API/MCP, CLI, generated or deployment
  surface was edited.

## Closure evidence

Attach focused test and typecheck output, the final literal changed-path list,
and a short state/evidence note for funding cancellation/readback,
Call charge/uncertainty/recovery, and Provider payout/document failure. Include
the serialized shared workspace and demand-console handoffs, with proof that
their Provider/Agent sections remain intact. Confirm no arithmetic, money
schema, public producer, generated artifact or Provider identity-removal path
was changed.

## Comments

This is a downstream presentation task, not implementation proof for the
money or Call rename. Pre-cutover `invocation`/`operation` fields may remain
until issues 13-18 land; the worker must follow their receipts and preserve
protected financial/evidence meanings rather than applying a broad textual
replacement.
