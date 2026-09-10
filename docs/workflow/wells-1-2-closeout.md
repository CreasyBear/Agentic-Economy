# Wells 1+2 — Call continuity and money/commercial readiness closeout

Date: 2026-09-10. Branch `stabilisation/wells-0-3` (PR #221). Plan: `~/.claude/plans/wells-1-2-call-continuity-and-money.md` (reviewed, 13 findings folded, no unresolved decisions).

Scope: a Call must survive the buyer's process dying and the buyer's credential rotating; every commercial refusal must carry a typed reason and a next action; the sandbox must fund and pay through real rails in test mode; nothing fabricates state. Acceptance is real use by an agent swarm on a credentialed stack, not fixtures (Joel: "the dev stack can block. i'll send a swarm of credentialed agents later").

## Outcome

- Source stable: `npm run gate` exit 0 (source suites 4,652 tests, import guards 57, release chain including `.env.example` drift and reproducible CLI pack).
- Live on this machine: `connect:local` binds authority; doctor reports tier 0 with the exact missing Stripe and CDP env names; the seeded Tools are present in the catalogue but not routeable on loopback by design (readiness guard untouched, D9 A).
- Not proven here: a paid Call end to end. That needs Stripe test keys plus the CDP sandbox bundle (tier 1) and is the swarm's job.

## What changed

### Call continuity (Well 1)
- Idempotency is keyed to the Principal, not the credential: index `by_principalId_and_idempotencyKey`, four-field identity match (principal, owner, application, environment). A replay after credential rotation finds the same Call; a different owner/application/environment is refused.
- Dispatch continues under a successor credential when the authorising grant is still active for that Principal and the successor is live. The Call keeps its admitted credential as effect identity; `dispatchedCredentialId` records the dispatcher.
- CLI recovery journal uses `proper-lockfile` (directory lock, 30 s stale) instead of unlocked writes. The esbuild bundle gained a `createRequire` banner so CommonJS deps load in the ESM CLI.

### Money and commercial readiness (Well 2)
- `COMMERCIAL_POLICY_REFUSAL_REASONS`: ten typed reasons (incl. `legal_customer_required`); every Quote refusal carries a reason and a continuation (`funding.handoff.config` added). The former single collapsed `commercial_policy_unavailable` is gone.
- Fee model confirmed and dead code deleted: the platform fee applies at loading (5% service fee + GST), not per Call. `computeProviderFeeBreakdown`, `DEFAULT_RAKE_BPS`, `realPricingConfigPort`, `resolveSupplyPricing` and their test removed.
- Treasury sensor: scheduled workload `observe x402 treasury` (15 min) reads the CDP USDC balance and records `moneyTreasury.recordObservation`. Skips cleanly without custody keys.
- Doctor `funding` check: Stripe test mode and CDP sandbox bundle presence, `tier: {level, missing[]}`, doc pointer `docs/operations/local-stripe-test-mode.md`.
- Stripe webhook destinations as code: `npm run stripe:webhooks` (dry-run default, `--apply`, `--confirm-live`).
- Stripe SDK quarantined to `src/lib/server/stripe-money-client.ts`; the config parser is type-only on `stripe`, so the CLI bundle no longer loads the SDK.
- `X402_CUSTODY_ENV_NAMES` exported once from the custody configuration module; the doctor and its test no longer mirror the list by hand.

### Sandbox (D8 A: real counterparty, no fabricated state)
- Second sandbox Tool `sandbox.aecon-testnet-reference` on Base Sepolia (managed x402 pricing), seeded only when `AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN` and `AE_PACKAGE5_FIXTURE_X402_PAY_TO` are set.
- Reference Tool endpoint is a real route: `POST /api/v1/sandbox-reference` at `${AE_SITE_URL}`. Seeding skips it when `AE_SITE_URL` is unset.
- The seed never writes readiness observations. Readiness comes from the hourly probe only; tests simulate the probe explicitly.
- Seed reaches the x402 schema through the reviewed adapter (`validateX402PaymentRequired` via the module's convex surface), not `@x402/core` directly.

## Gate

`npm run gate` exit 0 on 2026-09-10 after three fixes found by the gate itself (below).

## Root causes found while landing

1. **Stripe SDK writes an ad hint to stderr.** `stripe@22.5.0` prints `<claude-code-hint .../>` on import whenever `CLAUDECODE` is set. It reached the CLI because the doctor imported the Stripe env-name list from a module that also constructed the client. Split the module; the CLI is SDK-free again. Any agent running `ae` inside Claude Code would otherwise see noise on stderr from every command.
2. **Seed imported the x402 protocol SDK directly.** The handshake-import guard caught it. Routed through the reviewed adapter.
3. **Two hand-mirrored env-name lists** (doctor and its test) drifted-prone by construction. Replaced with one exported constant.

## Smells register

| # | Smell | Where | Disposition |
| --- | --- | --- | --- |
| 1 | Stress review claimed the CLI had no recovery journal; it did, but unlocked | `docs/reviews/catalogue-infrastructure-stress.md` row 4 | Locked with `proper-lockfile`; review row is stale, correct it in Well 6 docs pass |
| 2 | Two dead fee constants and a fee-breakdown path nobody called | `pricing-config.ts`, `pricing-port.ts` | Deleted |
| 3 | Ten distinct refusal causes collapsed into one code | `commercial-policy.ts` | Typed enum with continuations |
| 4 | Local Stripe webhook flow undocumented; destinations created by hand | operations docs | `docs/operations/local-stripe-test-mode.md` + `stripe:webhooks` tool |
| 5 | No treasury sensor; USDC balance only visible in the CDP console | money | Scheduled observation workload |
| 6 | `moneyTreasuryObservation:observe` cannot be run bare with `npx convex run` (needs a `workload` snapshot arg) | convex | Documented; acceptable since crons always pass it |
| 7 | `canonicalCallRef` mixes credential generation with grant generation | `convex/lib/callLifecycle/contracts.ts` | Left as is; Well 5 authority rationalisation input |
| 8 | Seed fabricated "healthy" readiness for an unreachable endpoint | `convex/devSeed.ts` | Removed; real route + probe-only readiness |
| 9 | Stripe SDK loaded by the CLI via a config import | `stripe-money-provider-config.ts` | Split into config vs client modules |
| 10 | Env-name lists mirrored by hand in two places | doctor + test | Single exported constant |
| 11 | A subagent ran `git stash` on a shared checkout despite the brief; concurrent edits vanished transiently | process | Restored; rule is now absolute in every brief |
| 12 | Loopback stack cannot prove Quote/Call (readiness guard rejects loopback endpoints) | design | Accepted (D9 A): tier 0 local, tier 1 hosted with credentials |

## Follow-ons by well

- **Well 4**: catalogue truth (protected MCP tools invisible anonymously, two catalogues, dual price stores, stop-word dedupe, projection sweep as workload).
- **Well 5**: `canonicalCallRef` generation split; white-box exceptions now 67 (two added here: `runPreparation.ts`, `x402-custody-configuration.ts`); target remains 0.
- **Well 6**: stale stress-review row; `/api/ready` commercial scope; glossary.
- **Swarm (tier 1, credentialed)**: `dev:local` → `connect:local` → `fund:local` → `ae call` on the testnet reference Tool → kill → `ae recover`; rotate credential and replay; verify one ledger charge. Test plan: `~/.gstack/projects/CreasyBear-Agentic-Economy/joelchan-main-eng-review-test-plan-20260910-wells-1-2.md`.

## Hosted runbook additions

See `docs/operations/hosted-cutover-runbook.md` for the consolidated steps (Well 0, Well 3, Wells 1+2, Well 4) in execution order.
