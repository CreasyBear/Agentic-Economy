# Production readiness: from diagnosis to live money (30 September 2026)

## Execution contract

The active execution queue is [Wayfinder #256](https://github.com/CreasyBear/Agentic-Economy/issues/256), including each ticket's current Briefing. The orchestrator owns direction, technical decisions, sequencing, integration and acceptance. Joel owns external commitments and launch authorization. This contract applies the `forward-implementation-first` and proportional iceinvein workflows to that queue.

### Global requirements

- Deliver the promotional-credit alpha: 20 invited users, A$10 each, founder-funded production USDC, Base first. Card funding belongs to beta. Preserve the recorded product decisions; resolve contradictory older text before implementing the affected behavior.
- One explicit money environment per deployment. Missing, invalid or mismatched authority, configuration or payment evidence refuses new financial effects. Hosting mode and key prefixes cannot silently select another money world.
- Preserve the customer journey: find a suitable Tool, use it within granted limits, obtain an answer and an understandable purchase record, recover when necessary, and continue. Optional intelligence may fall back to deterministic behavior; financial controls may not fall back to permissive behavior.
- Keep funding, spending authority, buyer credit, Provider expense, settlement and delivery distinct. Enforce the selected settled-2xx rule and source-correct remedies. Duplicate requests, concurrent attempts and interrupted writes must conserve money and preserve one effect identity.
- Uncertain external effects remain attributable to the original Call and consume the appropriate reserved capacity until resolved. Pausing new spending must leave admitted work recoverable.
- Reuse existing modules, maintained SDKs/components, official protocols and proven local patterns. Establish a concrete missing capability before adding an abstraction, dependency or parallel mechanism.
- Prove source behavior, deployed operation and live-money consequences separately. Completion requires the actual result and the expectation checked against it, including the relevant failure cases.

### Atomic agent chain

1. A bounded evidence/decomposition agent identifies the implementation delta, closest reference patterns, dependencies and exact file ownership. The orchestrator chooses the packet and applicable skills.
2. Where the boundary warrants it, a requirements agent drafts the specification from the orchestrator's decisions. The orchestrator settles Requires, Ensures, Invariant and On violation before edits.
3. An implementer receives one observable outcome, exclusive editable paths, fixed interfaces, exclusions and focused acceptance checks. It reports material ambiguity rather than expanding scope.
4. A different reviewer inspects the implementation against that contract and reports concrete defects. The orchestrator adjudicates findings and issues bounded corrections.
5. An evaluator exercises unresolved behavioral or runtime claims. The orchestrator inspects the decisive code and evidence, integrates the result, and accepts it or replays only the affected dependency cone.

Combine roles for small changes when separation adds no useful evidence. Keep at most three child lanes active; parallelize only independent light work with settled interfaces. Refill available lanes from useful bounded backlog. No recursive delegation. The root alone runs heavy checks, publishes changes and accepts completion.

Each packet names its parent issue, outcome, contract, owned files, protected files, dependencies, existing reference pattern, selected skill conclusions and observable checks. Handoffs are compact; they report changed behavior, evidence and literal blockers. The existing Wayfinder queue remains the plan, with no duplicate status system.

### Pitfalls to prevent

- Do not dispatch an entire cross-cutting issue to an unconstrained worker or let several workers edit shared manifest, schema, readiness or generated files.
- Do not rebuild functioning recovery because an older plan lists it as missing. Establish the smallest actual delta from current source and tests.
- Do not replace an SDK, ledger transaction, signed proof or maintained component with a local imitation without a demonstrated gap and an explicit design decision.
- Do not patch symptoms across callers while leaving their shared cause. Identify the owning boundary and verify every affected entry point.
- Do not confuse a passing mock, a file's existence, a green dashboard or an administrative receipt with the required outcome. Preserve product signatures, financial identity, real transaction evidence and substantive revision integrity.
- Do not rerun unchanged work or block forward progress on administrative hashes, locks, markers or certification. Preserve valid output and validate only the changed dependency cone, plus required integration/release checks.
- Do not run competing compilers, full suites, builds or large scans. Use Node 22 and npm 11.5.1; root runs `npm run check` for integrated changes and the full gate before merge or release.
- Do not broaden alpha into beta, incur new service costs, alter material commercial commitments, erase shared work or exercise live-money/launch actions without applicable authorization. Prepare concrete decisions and continue independent engineering.

### First implementation boundary

Start with #266's explicit deployment declaration, then enforce it at Quote, Call and funding admission. Build #267's credential controls and #268's rail consistency against the same contract; integrate #269's supply/development-surface restrictions and #270's behavioral isolation proof. Serialize overlapping files. Investigate #289 against the latest identity implementation and reuse its existing signed consequence-proof pattern. Existing chat work remains separately owned.

Design review synthesis: the thesis is one bounded purchase that remains financially explainable through failure. The scope coheres around that thesis. The main risks are environment bypasses, duplicate or stranded financial effects, and drift between separately deployed runtimes. Token, compute and solo-operator constraints favor small dependency cones and maintained capabilities. Cut duplicate ledgers, replacement auth/signing frameworks, new orchestration infrastructure and administrative completion gates. The review uses the recorded decisions directly; a new interview is unnecessary.

### Implementation checkpoint — 30 September 2026

#266 is implemented in the isolated `codex/production-money` worktree. Its release acceptance remains open until the complete gate passes.

- **Contract:** require the exact deployment declaration before new Quote, Call, funding or supply-write work; match stored and requested payment environments; refuse missing/malformed/mismatched inputs before financial effects. Consumed Call replay and uncertain-effect recovery retain their existing order. Funding readback cannot send a stored payment to the opposite Stripe rail; terminal expired/failed handoff status remains readable.
- **Simplification:** one required declaration replaces the service-mode and synthetic-profile selectors. Development has one deterministic fixture. Historical stored synthetic control values remain readable; they cannot select a new execution path or satisfy production policy controls. No service, dependency, schema migration or buyer approval step was added.
- **Verified:** `npm run check` passes, including zero dependency cycles. Anonymous Convex generation reproduces all seven generated files; the public build passes release-integrity verification. Focused tests cover both environment directions, absent/invalid declarations, recovery and configuration overrides. The funding HTTP/recovery suite passes 24 tests. `npm run test:release:unit` passes 6,284 tests (one skipped). The full integration run passed 1,956 and failed 30; the three declaration-related failures subsequently pass in focused Workpool/invoice-history checks (three passed, 19 skipped). The 27 inherited failures across eight chat/provider integration files remain a release blocker. The full gate is not green; browser/SEO/CLI acceptance beyond its stopped stage remains unverified. These results do not establish deployed or live-money readiness.
- **Review corrections:** an independent review found the opposite-rail funding readback gap and it was fixed. The actual anonymous CLI proof exposed an unsupported local-selector combination; anonymous and named local launch paths now use their appropriate Convex CLI selection. The local launcher suite passes 60 tests.
- **Handover:** preserve the identity A-then-B deployment order in `docs/operations/identity-slim-release.md`. Provision matching declarations separately in Vercel and Convex before deployment. Continue with #267 credential isolation, #268 rail consistency and #269 public/development surface isolation before #270's integrated proof. No deployment or live-money operation has been performed.

## Honest status
We have diagnosed and designed. We have not yet built or provisioned what live money needs.
- **Real:** the money code paths exist (AUD ledger in Formance, CDP custody signing, x402 payment, 2-RPC settlement verification, receipts) and the chat journey is built in source. None of it has run with real money. No paid Call has been proven end to end, even on testnet.
- **Unsafe:** production isolation has 10 P0 findings (`docs/reviews/rebuild/2026-09-30-production-isolation-audit.md`).
- **Unprovisioned:** the last production env snapshot (`.vercel/prod-debug.env`, 4 August 2026) contains **no** Stripe, Formance, CDP, RPC or Sentry configuration. It still carries legacy integrations (Autumn billing, Meilisearch, Novu, Resend) and `AE_SANDBOX_PROVIDER_KEY`. The browser build loads Clerk **development** keys.

## Operating-model concerns still open
1. **Where Formance runs.** The manifest declares a *private Formance community stack* behind a Cloudflare Access gateway, with managed PostgreSQL (`manifest.ts:224`). In production that means a solo founder operating a financial database: uptime, upgrades, backups, point-in-time recovery. Options:
   - (a) Formance Cloud (managed).
   - (b) Self-host on a managed platform with managed Postgres and point-in-time recovery, behind Cloudflare Access.

   Decide before M2. If Formance is down, no Quote can reserve and no top-up can credit.
2. **Legacy integrations in production.** Autumn (billing), Meilisearch, Novu and Resend are present. Decide for each: keep (for example, Resend for receipt email) or remove. Autumn in particular must not coexist with the credits model.
3. **Secrets live in several places:** Vercel env, Convex env, Formance, CDP, Stripe. Adopt one secret manager as the source of truth. Infisical is already integrated in code (the secret-isolation tests), with named holders and rotation.
4. **Two deployments only.** *Development* (local plus a Convex dev deployment, sandbox money) and *production* (real money). No staging with real money, and no production data in development.
5. **Release process without CI minutes:** local `npm run gate` → deploy to a Vercel preview against the Convex dev deployment → promote to production. GitHub Actions minutes return on 1 October; re-enable the gate workflows then.
6. **One operator.** Everything in M2 needs a runbook: float low, drift, Formance down, Stripe webhook failures, CDP outage, sanctions hit.

## Infrastructure: target state
| Component | Alpha (promo credit, Joel-funded float) | Open beta (card funding) | Status | Owner |
|---|---|---|---|---|
| Web (Vercel, TanStack Start) | Production project on the domain | Same | Project exists; env stale | Joel provisions, E wires |
| Convex | Production deployment, backups on, restore drill done | Same | Deployment exists (`CONVEX_DEPLOYMENT` present); backups unverified | Joel, E |
| Clerk | **Production instance** (live keys, domain, MFA) | Same | Dev keys in use | Joel |
| Formance (AUD ledger) | Production ledger (decision 1), point-in-time recovery | Same | Not provisioned | Joel decides, E wires |
| CDP custody | Separate production project, server wallet and policies; funded by Joel | Company-funded; hot/reserve split | Not provisioned | Joel |
| Base RPC | 2 independent HTTPS providers (`AE_X402_RPC_URLS_JSON`) | Same | Not provisioned | Joel |
| FX feed | Coinbase public USDC/AUD (built; refreshes) | Same | Working | — |
| Sanctions screening | OFAC data plus a screening API key | Same | Not built | E, Joel (vendor account) |
| Stripe | Not needed | Live restricted keys, webhook, GST rate; **written pre-approval** | Not provisioned | Joel |
| Sentry | Production DSN, alerts wired | Same | Absent from the production env | Joel, E |
| Secrets | Infisical as the source of truth | Same | Partial | Joel, E |
| Email | Receipts and alerts (Resend, if kept) | Same | Present (legacy) | Joel |

## Critical path to the first real Call
Two tracks run in parallel; the join points are marked ⇄.

**Engineering track (no dependency on provisioning):**
1. **M1 isolation:**
   - `AE_DEPLOYMENT_ENVIRONMENT`: required, fail closed.
   - Delete `hosted_alpha`, `standard` and the synthetic profile.
   - Close the 10 P0 doors.
   - The isolation test goes into the gate.
2. **Money rules:**
   - Charge on a settled 2xx (paid-200); write off seller errors.
   - Release unbroadcast authorizations after `validBefore`.
3. **Alpha features:**
   - Promotional credit grant (admin action, drawn first, expiry).
   - "Report this answer" refunds with the daily limit.
4. **Payment safety:**
   - Screen `payTo` before signing.
   - aecon-side caps per Call, per rolling day and per payee.
5. **Treasury:**
   - Deposit booking from observations.
   - The reconciler.
   - `/admin/treasury` (read-only first, then pause and thresholds).
6. **Readiness:**
   - The manifest requires the production groups.
   - The readiness panel is pass/fail.
   - Boot fails closed on a mismatch.
7. **Prove the loop on the development deployment:** one full paid Call on Base Sepolia (M0 exit).

**Joel track:**
1. Formance hosting decision (concern 1).
2. Clerk production instance and domain.
3. CDP production project, wallet and policies; fund the alpha float.
4. Two Base RPC providers.
5. Sentry production DSN.
6. Secrets into Infisical.
7. Legacy integration decisions (concern 2).

⇄ **Join 1:** wire the production env, the readiness panel goes green, the restore drill (M2 exit).

⇄ **Join 2:** Joel's account makes 20 real Calls across at least 5 listings, reconciled to the cent, and the failure drills pass (M3 exit).

Then: the trust centre and credits terms page, and alpha invites (20 users, A$10 each).

**Beta-only track (starts now, blocks nothing in alpha):**
- The Stripe pre-approval request.
- Lawyer and accountant engagements with the fixed questions in `docs/operating-model.md`.

## What should make us comfortable, and what shouldn't yet
- **Comfortable:** the model is coherent (principal, OpenRouter-style credits, own float). The regulatory posture is defensible. Alpha exposure is capped at about A$200 of seller payments. Every money path already refuses when config is missing, rather than guessing.
- **Not yet:**
  - Nothing has run with real money.
  - Isolation is unsafe.
  - Formance hosting is undecided and it is the money authority.
  - Production config is absent.
  - One operator with no runbooks.
  - The first alpha user must not arrive before the Join 2 exit.
