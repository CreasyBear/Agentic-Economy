# Exercise the application and installed clients

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee:
Assigned role: Luna Max / live application and installed-client QA owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33

## Outcome

Exercise the implemented application and supported installed clients through
the accepted maturity journeys. Prove the visible Tool → Quote → Call flow,
authority boundaries, Provider lifecycle, recovery and money records with
real inputs and outputs, not only unit tests. Record limitations as open
evidence; return refactor-caused papercuts to their owning implementation or
surface issue.

## Target and vocabulary contract

Use the exact local or hosted target card supplied by issue 31 and the matching
generated/client revision from issues 22 and 35. Do not infer that a healthy
page or old hosted revision contains the refactor. The accepted user-facing
chain is:

`Tool discovery → caller-specific Quote → one useful x402 testnet Call → result,
usage and status/recovery`

Use `describe` for anonymous Tool detail and the retained CLI `call` flow for
caller-specific Quote then Call. Preserve separate Customer, Agent, Provider,
Seller, authority, charge, delivery, payment, purchase-resolution and Outcome
facts. A timeout or uncertain payment/delivery is never success and recovery
must retain the same `callRef` without a duplicate charge.

## Finite run and evidence allowlist

Use only these installed artifacts, existing application test entrypoints,
maintained acceptance references and test configuration files. Do not add or
edit a test harness, client, provider or evaluation service:

- `packages/cli/dist/ae.js`
- `public/downloads/agentic-economy-cli-0.1.0.tgz`
- `playwright.authenticated.config.ts`
- `playwright.config.ts`
- `tests/e2e/authenticated/global.setup.ts`
- `tests/e2e/authenticated/multi-agent-lifecycle.spec.ts`
- `tests/e2e/authenticated/package3-account-security.spec.ts`
- `tests/e2e/authenticated/package4-account-commerce.spec.ts`
- `tests/e2e/application-recovery.spec.ts`
- `tests/e2e/developer-discovery.spec.ts`
- `tests/e2e/a11y/developer-discovery-a11y.spec.ts`
- `tests/e2e/a11y/engine-product-a11y.spec.ts`
- `tests/e2e/a11y/operator-shell-a11y.spec.ts`
- `tests/unit/market-terminal/account.test.ts`
- `tests/unit/market-terminal/cold-loop.test.ts`
- `tests/unit/market-terminal/history.test.ts`
- `tests/unit/market-terminal/invoke.test.ts`
- `tests/unit/market-terminal/manifest-oauth.test.ts`
- `tests/unit/market-terminal/policy.test.ts`
- `tests/unit/market-terminal/recovery.test.ts`
- `tests/unit/market-terminal/supply.test.ts`
- `tests/unit/market-terminal/wait.test.ts`
- `tests/unit/routes/agent-access-authorize.test.tsx`
- `tests/unit/routes/agent-access-caller-continuation.test.tsx`
- `tests/unit/routes/owner-provider-connection-handoff-route.test.tsx`
- `tests/unit/ui/agent-access-owner-console.test.tsx`
- `tests/unit/ui/owner-operations-workspace.test.tsx`
- `tests/unit/ui/owner-provider-connections.test.tsx`
- `tests/unit/server/agent-access-auth.test.ts`
- `tests/unit/server/agent-access-oauth-api.test.ts`
- `tests/integration/provider-connection-owner-x402-onboarding.test.ts`
- `tests/integration/provider-connection-attempts.test.ts`
- `tests/unit/release/operation-gateway-production-smoke-discovery.test.ts`
- `tests/unit/release/operation-gateway-production-smoke-earnings.test.ts`
- `tests/unit/release/operation-gateway-production-smoke-receipt.test.ts`
- `tests/unit/release/operation-gateway-production-smoke-status.test.ts`
- `docs/operations/deployment-maturity.md`
- `docs/guides/package-4-release-evidence.md`
- `docs/guides/package-5-release-evidence.md`
- `docs/guides/package-6-plugin-release.md`

The only write/output path is this issue's redacted QA receipt. Client
artifacts, application source, tests, external providers, databases and
Package 6/7 records are run-only or read-only. Never record credentials,
private input, payment payloads or secret values.

## Required journeys

Against the approved non-production target and with the exact client/build
revision recorded, perform each journey and retain request/result identifiers:

1. Sign in, select the intended Account, connect an Agent, grant the required
   permission, replace a Credential, revoke it and prove the old Credential
   fails closed.
2. Discover a Tool, inspect anonymous detail, obtain a caller-specific Quote,
   complete one useful x402 testnet Call, and inspect its result, usage and
   status. Use an existing maintained useful fixture/Provider; do not invent a
   weather proxy, free-tier claim or new endpoint.
3. Exercise blocked spending, expired or changed Quote terms, timeout,
   uncertain payment/delivery and the supported status/recovery path. Confirm
   the same `callRef` is retained and no duplicate Provider effect, charge or
   purchase object is created.
4. Connect a Provider, publish a Tool, inspect availability, withdraw it and
   confirm new Calls stop with the existing refusal/availability semantics.
5. Inspect credit/top-ups, usage, charges, supported refund/reversal,
   Provider earnings and business documents. Confirm balances, authority,
   delivery and payment facts are not conflated.

Use the existing maturity references and Package 6 acceptance cases for client
coverage, including native MCP setup and the supported CLI; do not claim
public-plugin publication or production readiness from this issue.

## Verification commands and expected results

Use Node 22 and npm 11.5.1 through the existing runner:

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" node packages/cli/dist/ae.js --help --json
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" node packages/cli/dist/ae.js manifest --technical --json
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:e2e:authenticated:required
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:e2e:a11y
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm exec vitest run \
  tests/unit/market-terminal/account.test.ts \
  tests/unit/market-terminal/cold-loop.test.ts \
  tests/unit/market-terminal/history.test.ts \
  tests/unit/market-terminal/invoke.test.ts \
  tests/unit/market-terminal/manifest-oauth.test.ts \
  tests/unit/market-terminal/policy.test.ts \
  tests/unit/market-terminal/recovery.test.ts \
  tests/unit/market-terminal/supply.test.ts \
  tests/unit/market-terminal/wait.test.ts \
  tests/integration/provider-connection-owner-x402-onboarding.test.ts \
  tests/integration/provider-connection-attempts.test.ts
```

Expected: the installed bundle and archive expose the current generated
contract; sign-in/account/Agent credential operations, Tool discovery, Quote,
useful testnet Call, blocked/expired/uncertain/recovery cases, Provider
publish/withdraw and money/business records produce the established results.
Accessibility checks retain keyboard and compact-screen access. Any missing
hosted credential, provider endpoint or testnet proof is recorded as an
unverified limitation and keeps this issue open; it is not replaced by a
local fixture pass.

## Exclusions and safety rules

- Do not use production/mainnet, promote `package4-release`, mutate a hosted
  dataset, replay historical payments/webhooks, or create a new Vercel project.
- Do not edit application/source/tests/client artifacts to make the journey
  pass. A vocabulary regression returns to its owner; an unrelated product gap
  keeps its existing issue or receives a bounded backlog entry.
- Do not broaden client support, add aliases, redesign screens, add analytics,
  or claim Package 6/7 requirements complete by association.
- Keep all external protocol fields, OAuth/x402 values, opaque IDs, hashes,
  signatures and financial references exactly as the implementation defines.

## Acceptance

- [ ] All five journeys have redacted action, environment, build and result
      records, including negative and uncertain outcomes where required.
- [ ] The useful x402 testnet Call is real and its result/usage/status evidence
      is distinguishable from fixture-only or free-tier mechanics.
- [ ] Credential replacement/revocation, same-Call recovery and no-duplicate-
      charge proof pass; Provider withdrawal stops new Calls as before.
- [ ] Installed CLI/MCP and application screens use the target vocabulary and
      retain accessible errors, empty states and next actions.
- [ ] Missing hosted/client/provider evidence remains explicitly open; no
      production, external-history, source or unrelated worktree mutation was
      made.

## Closure evidence

Attach the exact target card, deployed/source revision, client artifact digest,
journey inputs and redacted outputs, Call/Quote/status references, credential
revocation result, Provider transition result, money/business record evidence,
focused test output and limitations. Mark the issue unresolved if any required
journey is unavailable or only simulated.
