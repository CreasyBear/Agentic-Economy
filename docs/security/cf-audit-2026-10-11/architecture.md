# aecon architecture summary (white-box, partial recon)

Target: detached copy of origin/main at 9b129ec99 (cfaudit). Profile: standard, full repo scope. Source-only; no network, no .env reads.

## 1. Product, principals, protected resources
aecon is a pay-per-call marketplace of paid APIs and tools for people and AI agents. Principals: anonymous visitors, Clerk humans, agents with API keys or OAuth/MCP grants, provider owners (supply side), operators (`src/routes/_operator`), internal services. Protected: account credit and Formance ledger, Stripe funding events, provider secrets (Infisical), spend authority (approvals, caps), chat threads and shares, owner data exports, operator console.

## 2. Comparable baseline
Comparable products (Stripe Checkout plus API-key marketplaces, MCP gateways, x402 facilitators) accept bearer-key authority and provider-side trust. Here the notable additions are dynamic OAuth client registration and outbound calls to arbitrary provider URLs. Use for calibration only.

## 3. Stack and deployment
TypeScript. TanStack Start on Vercel (`src/routes`, `src/lib/server`, `vercel.json`), Convex backend (`convex/`, 229 public functions across 77 files, crons from `SCHEDULED_WORKLOADS`), Clerk JWT auth (`convex/auth.config.ts`), Stripe, Formance, OpenRouter, Resend, PostHog, Sentry, GitHub Actions (`cli-release`, `kernel-release-gate`, `react-doctor`). Deployed env is unobservable from source. Offline tests exist (about 124 security-named test files) but are not proof; hunters read source.

## 4. Entry surfaces and key paths
- Convex HTTP `convex/http.ts:19-67`: `/chat/anonymous`, `/internal/provider-consequence/*`, `/internal/secret-lifecycle`, Resend webhook, unsubscribe GET/POST.
- TanStack routes: 79 `api.*` (about 60 `api.v1.*`), webhooks (Stripe, Clerk, Resend), `api.internal.*`, `api.owner.data-export`, `api.admin.metrics-export`, `api.observability.client-error`, share links `s.$shareToken`.
- MCP `src/routes/mcp.ts`; OAuth register/authorize/token/device/revoke; `.well-known` discovery.
- Paths: agent request, then `authenticateCallGateway`, then quote/call in `convex/capabilityCalls.ts`, then money ledger, then outbound x402/MCP/HTTP to provider URL. Stripe webhook, then inbox, then worker, then ledger credit. Chat tool calling, then approval card, then paid call.
- CLI `tools/ae`.

## 5. Trust boundaries and strongest visible control
- Internal RPC: shared bearer tokens (`AE_SECRET_LIFECYCLE_RPC_TOKEN` etc.), constant-time compare in `src/lib/server/constant-time.ts`; a duplicate `constantTimeEqual` in `api.internal.provider-consequence.ts:503` loops on `left.length` with no length check.
- Webhooks: Stripe `constructEvent`, Svix verify-before-parse in `convex/emailWebhook.ts`, Clerk svix.
- Outbound SSRF: `isPublicHttpTarget` and `createGuardedLookup` in `src/modules/network-guard/public.ts`; applied at `runRelease.ts`, discovery and inspectors. Unconfirmed on `route-transport-mcp.ts`, `route-transport-http-json.ts`, `route-transport-cancel.ts` (manual redirects, no seen guard).
- OAuth: customer grants capped at `approval_required`; dynamic registration still open (prior D1/M3).
- Chat actions gated by owner approvals (`src/modules/chat/tool-card-plan.ts`).
- Convex public functions: per-function auth not yet audited; highest priority `money*`, `admin*`, `agentAccessOAuth`, `interactiveAuthority`, `capabilityCalls`, `capabilityProviderConnections`, `workspace*`, `chatTurns`, `chatAnonymous`, `devSeed`.

## 6. Starting paths
See `starting_paths` per unit in `coverage-ledger.json` (47 units, one hunter each).

## 7. Prior coverage
Prior audit `docs/security/deep-audit-2026-10-11.md`: 20 confirmed (4 medium, 16 low) all marked fixed, 4 disputed (D3 pre-check-only SSRF on `capabilityToolCatalog.ts`; D1/M3 DCR; D2, D4 hardening), 3 refuted. No prior ledger or findings.json exists, so every unit is `prior_status: none`. Fixes are treated as code to re-verify, not as safe: Stripe replay (88610e5c1), MCP OAuth URL (87f6a2f1e, da0c50857), dynamic clients (8f0abf643, bda0dae77), provider text vs paid calls (b59f31ad9, 7ab7c4391), refresh reuse (9f2a438ff), ae output sanitising (0a48b3cf2, 214e1bbd1), CI pins (12ed818af, 9e93a8f4c), `::/96` block (53d7ecc55), MCP admission before Clerk (c89b825f2, e306f6d91), anonymous chat and catalog rate limits (d18ff3111, c41eaaf4a). No same-source confirmed exclusions are carried. Re-verify first: internal RPC token compare and check-before-parse, raw-body signature and timestamp tolerance, guard on every x402 path including redirects, share-token and OAuth state binding, duplicate `constantTimeEqual`. Not traced in recon: model-gateway/OpenRouter, Formance client, PostHog, Sentry scrubbing, workflows; each has a unit.

## 8. Companion selection
Selected by boundary found, per unit:
- AI-AND-LLM: MCP, chat tool calling, approvals, provider-controlled text.
- WEB-PROTOCOL-AND-AUTH: OAuth/DCR, API keys, JWT, host trust, CSRF on consent.
- CLIENT-SIDE: consent page, share page, chat rendering, client-error sink, CLI output.
- SUPPLY-CHAIN-AND-RELEASE: workflows, dependencies, ae CLI release.
- CLOUD-AND-DEPLOYMENT: internal RPC tokens, secrets, outbound metadata reachability, Vercel config, webhook event identity.
- PROTOCOLS-RPC-AND-MESSAGING: webhooks, internal RPC, journal, idempotency and replay.
- RESOURCE-EXHAUSTION-AND-AVAILABILITY: anonymous endpoints, DCR, outbound fetch, crons.
- DATA-ISOLATION-AND-LIFECYCLE: workspaces, exports, shares, secrets, analytics sinks.
Excluded for all units: MEMORY-SAFETY-AND-BINARY and DESKTOP-MOBILE-AND-LOCAL-IPC (no native or local IPC code).
