# Package 4 Formance release evidence

Captured on 2026-09-03 for closure PR 8 and updated during closure PR 9B.

## Disposition

**PACKAGE 4 NOT CLOSED.** The dedicated AWS, Cloudflare, Formance, Vercel,
Convex, Clerk, and Stripe sandbox environment is live. A real authenticated
owner completed Stripe-hosted Checkout with sandbox 3DS; the verified webhook
and Formance readback credited exactly `AUD 5.000000` from an `AUD 5.280000`
processor total.

The original closeout still requires official Stripe event replay and refund,
managed-x402 success/refusal/recovery, Calls/Usage/Spend documents and signed
close, black-box protocol parity, current-environment restart/restore, and the
remote Base Sepolia canary. Missing evidence remains a failure, not a skip.

Production funding and mainnet effects remain disabled.

## Dedicated release topology

The reusable `package4-release` deployment definition is implemented and
passes the pinned OpenTofu 1.12.6 formatter and validator. It defines the
private Sydney VPC, private ARM64 k3s host, Multi-AZ PostgreSQL 16 with PITR,
nightly encrypted Melbourne backup copy, the pinned Formance Community
Gateway/Ledger components, and Cloudflare Tunnel/Access boundary required by
the final closeout plan.

The two product-hosting shells have also been isolated:

| Resource | State | Evidence |
| --- | --- | --- |
| Vercel release project | DEPLOYED, VERIFIED | `agentic-economy-package4-release`, deployment `dpl_HusZd4YE3huJEwzyeKaAypS4unjL`, canonical alias `https://agentic-economy-package4-release.vercel.app`, source revision `79a24a309fe8e0a3ce02905caa9674cbd35db375`; health, readiness and release readback return HTTP 200. |
| Convex release project | DEPLOYED, VERIFIED | `agentic-economy-package4-release`, development deployment `fastidious-barracuda-66`. It owns the synthetic release product state and completed the authenticated funding command. |
| Clerk test instance | DEPLOYED, VERIFIED | Application `app_3Io6c0wmApyND4IBtoeomurojqj`, instance `ins_3Io6c2NfCPqxUqJI3Vx3Jvc37V9`; authenticated owner session completed the live hosted-funding journey. |
| Stripe sandbox | DEPLOYED, PARTIALLY VERIFIED | Account `acct_1Tlni770N4UjLqHt`, enabled webhook `we_1UBYM070N4UjLqHtknl4R8Ep`, hosted Checkout and required sandbox 3DS passed. Event resend and refund/reversal remain. |
| AWS/Cloudflare/Formance | DEPLOYED, PARTIALLY VERIFIED | AWS account `197716152388`, private k3s `i-063c00d935d85d74f`, private Multi-AZ RDS `package4-release-formance`, protected `formance-release.aecon.ai`, and live Formance funding/balance readback. Routine non-root deployment access, alerts, current backup jobs, and remote restore remain unproved. |

The complete identities, linkage, credential custody, and current gaps are
recorded in `docs/operations/deployment-registry.yaml` and
`docs/operations/deployment-maturity.md`. The environment is deployed but PR 9B
is not fully closed until non-root operations, alert delivery, backup/restore,
and token lifecycle evidence pass.

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

### Remaining authenticated commercial journey

Clerk sign-in and real Stripe-hosted funding now work in the isolated release
environment. The automated black-box journey still needs official webhook
redelivery, full refund/reversal, managed x402, documents and signed-close
coverage before it becomes complete release evidence.

### Infrastructure operations

The intended MFA-backed `package4-release-deployer` role path is not working,
while a local bootstrap profile resolves to AWS root credentials. The alert SNS
topic has no subscribers, the new RDS alarms are in missing-data `ALARM`, no
completed regional backup copy was yet visible, and the current release
database has not completed an isolated restore rehearsal. These are explicit
release blockers.

The current Cloudflare Tunnel token was exposed during local operator evidence
capture. The user accepted continued use only for the synthetic release. It
must be rotated and old connections force-disconnected before production.

### External Base Sepolia canary

The opt-in canary refused with `x402_testnet_prerequisite_missing` because
`AE_X402_CANARY_PROVIDER_URL` and `AE_X402_PAYMENT_PRIVATE_KEY` are absent.
The local deterministic x402 and Formance proofs do not substitute for this
external evidence.

## Release completion procedure

1. Repair and prove the MFA-backed AWS deployment role, alert delivery, first
   backup copy, and isolated restore.
2. Complete Stripe resend/refund and the remaining authenticated commercial
   journey with `npm run test:e2e:authenticated:required`.
3. Supply the remote HTTPS Base Sepolia Provider and bounded test payment key;
   run the opt-in testnet canary once and retain its redacted durable reference.
4. Re-run lint, typecheck, codegen dry run, imports, UI contract, focused
   Package 4 suites, real Formance integration and production build at the
   release commit.
5. Confirm Australian approval families and managed-PostgreSQL/PITR controls
   remain inactive for production until separately evidenced.

The missing live evidence and operational findings are release-state blockers,
not implementation fallbacks. Production remains disabled.
