# Package 4 Formance release evidence

Captured on 2026-09-03 for closure PR 8.

## Disposition

**PACKAGE 4 NOT CLOSED.** The deterministic implementation and local OSS
Formance gates pass. Two required release inputs are unavailable in this
environment and were treated as failures, not skips:

1. the authenticated Clerk/Convex browser environment;
2. the opt-in remote Base Sepolia x402 provider and payment key.

Production funding and mainnet effects remain disabled.

## Passing evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| Package 4 focused suites | PASS | 24 files, 215 tests, including the real Formance suite. |
| Real Formance integration | PASS | 4 tests: schema/health, exact funding, named workflows, 100-way atomic contention, exact-reference recovery, cursor-backed statement totals and idempotent buyer adjustment. |
| Surface parity | PASS | 7 files, 59 tests across HTTP, MCP, CLI and chat. |
| Secret/diagnostic protections | PASS | 7 files, 127 tests covering Formance, CDP/x402, audit redaction and secret lifecycle. |
| Lint | PASS | `oxlint` completed with warnings denied. |
| TypeScript | PASS | `tsc --noEmit`. |
| Convex generated contract | PASS | dry-run code generation against the configured deployment. |
| Import boundaries | PASS | 11 files, 47 tests. |
| UI contract | PASS | 2 tests. |
| Production build | PASS | Vite/Nitro Node 22 build completed. |
| Service restart | PASS | Gateway, Ledger API, worker and PostgreSQL restarted independently and returned healthy; the real Formance suite passed afterward. |
| Backup/restore and upgrade | PASS (carried) | The promoted PR 0 evidence records official `pg_dump`/`pg_restore`, fresh-stack verification and Ledger 2.4.11 to 2.4.12 migration with 10,000 bookings. |

The live contention proof allowed exactly 10 of 100 managed-Call reservations.
No failed bulk left a partial reservation. Statement reads traversed Formance's
official cursor rather than a Convex monetary projection.

## Blocked release inputs

### Authenticated browser journey

The required Playwright command refused to start because the following
server/test values are absent:

- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `AE_E2E_OWNER_EMAIL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `CLERK_JWT_ISSUER_DOMAIN`
- `CONVEX_URL`
- `VITE_CONVEX_URL`
- `AE_CONVEX_SERVER_FUNCTION_TOKEN`

The required-mode refusal is the intended fail-closed behavior. Package 4 may
close only after `tests/e2e/authenticated/package4-account-commerce.spec.ts`
runs in a complete isolated test environment.

### External Base Sepolia canary

The opt-in canary refused with `x402_testnet_prerequisite_missing` because
`AE_X402_CANARY_PROVIDER_URL` and `AE_X402_PAYMENT_PRIVATE_KEY` are absent.
The local deterministic x402 and Formance proofs do not substitute for this
external evidence.

## Release completion procedure

1. Supply the isolated authenticated E2E environment and run
   `npm run test:e2e:authenticated:required`.
2. Supply the remote HTTPS Base Sepolia Provider and bounded test payment key;
   run the opt-in testnet canary once and retain its redacted durable reference.
3. Re-run lint, typecheck, codegen dry run, imports, UI contract, focused
   Package 4 suites, real Formance integration and production build at the
   release commit.
4. Confirm Australian approval families and managed-PostgreSQL/PITR controls
   remain inactive for production until separately evidenced.

No deterministic failure is outstanding. The missing external evidence is a
release-state blocker, not an implementation fallback or TODO inside the
financial authority.
