# Package 4 cutover evidence

> Historical product cutover evidence only. It does not establish the current
> AWS baseline or production readiness; use
> `../operations/aws-foundation.md`, `../operations/deployment-registry.yaml`
> and `../operations/deployment-maturity.md` for live operational status.

Captured on 2026-09-02 before Package 4 release closure. Counts were read with
the maintained Convex CLI; no row contents or secret values were copied into
this record.

## Deployment census

The production deployment contained zero rows in every value-bearing or
externally submitted path checked:

| Family | Tables | Count |
| --- | --- | ---: |
| Identity | `accounts`, `principals`, `externalIdentityBindings` | 0 |
| Old and new balances | `moneyAccounts`, `moneyBalanceProjections` | 0 |
| Funding | `moneyFundingCommands`, `moneyTopupCommands` | 0 |
| Payout | `moneyPayoutAccounts`, `moneyPayouts` | 0 |
| Provider obligations | `moneyProviderObligations` | 0 |
| Managed Call reservation | `moneyCallReservations`, `moneyExternalSpendReservations` | 0 |
| x402 effects | `moneyX402PaymentAttempts`, `capabilityOperationInvocations` | 0 |
| Production activation | `moneyCommercialPolicies`, `moneyTreasuryObservations`, `moneyTreasuryProjections` | 0 |

Therefore AE has no production balance, funding-command/PaymentIntent
reference, payable obligation, payout, managed reservation, or unsettled x402
attempt to transfer. The empty production policy and treasury families keep
funding, Commitment issuance, and mainnet settlement fail-closed.

The development deployment contains local identity material (10 Accounts, 36
Principals, and 42 external identity bindings) but zero rows in every money,
payout, obligation, managed reservation, x402 attempt, and Invocation table
listed above. Identity rows were not deleted because the clean cutover requires
removing value-bearing prototype state, not destroying unrelated local access
fixtures.

## Disposable backup

Immediately before the census, Convex created development snapshot export
`1788295840323299000` and downloaded a disposable copy outside the repository.
No production clear or schema-destructive operation was needed because the
production census was empty.

## Contract baseline

The pre-cutover MCP manifest recorded in the executable official-client test is:

| Measurement | Bytes |
| --- | ---: |
| Complete tool manifest | 221,955 |
| Output schemas | 186,908 |
| Input schemas | 15,221 |

The Package 4 test rejects any value above 120% of the corresponding baseline.
Separate contract tests enforce search, inspection, unchanged-status, refusal,
and uncertain-outcome response budgets.

## Deterministic fixture hashes

| Fixture | SHA-256 |
| --- | --- |
| `development-evidence-fixture.ts` | `c9f02d52ca6e3fec4cd6457db84fbf4946deb950c912e27fc2d1e4127956214d` |
| `development-published-operation-evidence.ts` | `4a3e636232ac934bc3d4ca71f974da47258251d7ec1548d7f76f9f79b1f7dcd6` |
| `development-alternate-published-operation-evidence.ts` | `2a757b533dc35e72c184ee3a663b0d42035d516a26ed215d43711adfb8deca08` |

If any production count above becomes non-zero before deployment, stop the
clean cutover and replace this evidence with an approved value-preserving
migration plan.

## Closure Deployment A verification

Deployment A was applied to the local deployment
`local-joel_chan-agentic_economy_ea30d-5` after the Package 4 checkpoint
`03b91be001f2481b49194c4490113392ba87e190`. The deployed compatibility schema
fingerprint was
`22dad1323827dbe1ca998959950fa923c008e533a2572cba1f8a9564a6c4c00a`.

The immediate pre-cleanup census found 10 local `accounts` and zero
`businesses`. Every inspected value-bearing table was empty:

- old and replacement balance, transaction, posting and funding tables;
- payout and Provider-obligation tables;
- managed Call and external-spend reservations;
- x402 payment attempts and Operation Invocations;
- commercial-policy, treasury-observation, projection and reservation tables.

The 10 identity fixtures are outside the approved cleanup allowlist and remain
untouched. Because every retired table is already empty, Deployment A requires
no deletion batches. Deployment B may remove only the retired schema and
runtime paths; it must not remove or rewrite identity fixtures.
