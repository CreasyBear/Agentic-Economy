# L8 Libraries Audit — Upgrade & Stability Risk

**Scope:** TanStack Start stack, Convex, Clerk, Nitro, Playwright, provider integrations (Resend, Novu, Stripe, Autumn, Clerk backend API)  
**Evidence base:** `package.json`, `package-lock.json`, `src/start.ts`, `vite.config.ts`, `.planning/codebase/CONCERNS.md` (Additional Tech Debt, `test:all` Omissions, E2E bypass), `src/lib/server/notification-provider.ts`  
**Audit date:** 2026-06-30  
**Verdict:** Core runtime sits on a fast-moving TanStack + Vite 8 + Nitro nightly stack with good pin discipline on most deps; the largest stability holes are Nitro nightly drift, TanStack sub-package skew, and fetch-only provider clients with no semver guardrails or deploy-smoke CI gate.

## Dependency inventory

| Library | Declared | Lock / resolved | Role | Pin style |
|---|---|---|---|---|
| `@tanstack/react-start` | `1.168.26` | `1.168.26` | SSR app shell, middleware (`createStart`, CSRF) | Exact |
| `@tanstack/react-router` | `1.170.16` | `1.170.16` | Routes, server handlers, file routes | Exact |
| `@clerk/tanstack-react-start` | `1.4.9` | `1.4.9` | Auth middleware + `ClerkProvider` | Exact |
| `@clerk/testing` | `^2.2.0` | `2.2.0` | Playwright auth helpers (dev) | Caret |
| `convex` | `1.42.0` | `1.42.0` | DB, auth JWT, all domain persistence | Exact |
| `nitro` (alias) | `npm:nitro-nightly@^3.0.1-20260628-090458-3df69609` | `nitro-nightly@3.0.1-20260628-090458-3df69609` | TanStack Start server build via `nitro()` in Vite | Nightly + caret |
| `@playwright/test` | `1.61.1` | `1.61.1` | E2E, a11y, deploy/provider smokes | Exact |
| `vite` | `8.1.0` | `8.1.0` | Dev/build orchestration | Exact |
| `react` / `react-dom` | `19.2.7` | `19.2.7` | UI runtime | Exact |
| Provider SDKs | — | — | **Not installed**; HTTP clients in source | N/A |

**TanStack sub-package skew (lockfile):** `@tanstack/react-router` `1.170.16` vs `@tanstack/react-start` `1.168.26`; nested `@tanstack/start-server-core` `1.169.15`, `@tanstack/react-start-server` `1.167.20`, `@tanstack/router-core` `1.171.13`. Router is two patch trains ahead of Start — typical for TanStack’s split releases but increases breakage surface on bump.

**Provider integrations (no npm SDK):**

| Provider | Client location | Base URL | Notes |
|---|---|---|---|
| Resend | `src/lib/server/notification-provider.ts` | `https://api.resend.com` | Send + Svix webhook verify |
| Novu | same | `https://api.novu.co` | Trigger + transaction readback |
| Clerk backend | same | `https://api.clerk.com/v1` | Owner email lookup at send time |
| Stripe | `src/modules/business-action/internal/stripe-checkout.ts`, `stripe-webhook-source.ts` | `https://api.stripe.com` | Checkout fetch + manual webhook HMAC |
| Autumn | `src/modules/billing/internal/provider-readback.ts` | `https://api.useautumn.com` | Attach/portal/reconcile fetch |

**Wiring (`src/start.ts`):** Request middleware chain is `[csrfMiddleware, sourceWriteAdmissionMiddleware, ...clerkRequestMiddleware]`. Clerk middleware is omitted when `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'` — command-scoped for local Playwright per CONCERNS, but no production hard-stop.

## Findings

| ID | Library | Finding | Stability risk | Upgrade effort | Production gate? | ROI tier | Evidence | Next step |
|---|---|---|:---:|:---:|:---:|:---:|---|---|
| **L8-001** | Nitro | `nitro` aliased to **nightly** with caret range on build-time server runtime | **Critical** | M | **Yes** | **T1/S** | `package.json` L72; `vite.config.ts` L4–16; CONCERNS Additional Tech Debt | Pin exact nightly hash (drop `^`) until stable Nitro 3 ships; add `npm run build` to CI on every lockfile change |
| **L8-002** | TanStack Start | `@tanstack/react-router` (`1.170.16`) ahead of `@tanstack/react-start` (`1.168.26`); nested start/router cores span four patch levels | **High** | S | **Yes** | **T1/S** | `package.json` L47–48; `package-lock.json` nested `@tanstack/*` | Bump Start + Router together from one TanStack release note; run `build` + `test:e2e` after any TanStack bump |
| **L8-003** | Playwright + CI | `test:all` excludes all Playwright suites (E2E, a11y, deploy/provider smokes) | **High** | S | **Yes** | **T1/S** | `package.json` L40 vs L16–27; CONCERNS `test:all` Omissions | Treat green `test:all` as necessary not sufficient; add deploy-smoke job before Phase 2–6 closeout claims |
| **L8-004** | Clerk | Auth middleware bypass via `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` with no production env guard | **High** | S | **Yes** | **T1/S** | `src/start.ts` L10; CONCERNS E2E Bypass Flag | Add `isLocalE2eBypassAllowed()` startup throw when `VERCEL_ENV=production` or non-localhost host |
| **L8-005** | Provider clients | Resend, Novu, Stripe, Autumn integrated via hand-rolled `fetch` — no SDK semver, no lockfile signal on API drift | **Medium–High** | M | **Yes** (Phase 2–6) | **T2/M** | `notification-provider.ts` L171–173; `provider-readback.ts`; deploy-smoke scripts in `package.json` | Document pinned API versions; keep fail-loud smokes; add contract tests from recorded fixtures before adopting official SDKs |
| L8-006 | Convex | `convex@1.42.0` owns all persistence + JWT auth (`convex/auth.config.ts` → Clerk issuer); codegen in `test:all` but deploy coupling | Medium | M | Soft | **T2/M** | `convex/**`; `check:convex-codegen` script | Upgrade Convex CLI/pkg + deploy in one step; run `tests/unit/convex/*` after bump |
| L8-007 | Clerk package | `@clerk/tanstack-react-start@1.4.9` peer range `^1.157.0` for TanStack; `@clerk/testing` on caret | Medium | S | Soft | **T2/A** | `package-lock.json` `@clerk/tanstack-react-start` peers | Pin `@clerk/testing` exact; verify Clerk release notes when bumping TanStack |
| L8-008 | Vite 8 + React 19 | Bleeding-edge toolchain compounds TanStack/Nitro breakage on upgrade | Medium | M | Soft | **T3/C** | `package.json` vite `8.1.0`, react `19.2.7`, TS `6.0.3` | Batch toolchain upgrades; avoid isolated major bumps |
| L8-009 | Playwright | Pinned `1.61.1`; `@clerk/testing` pulls Playwright peer — version lock is healthy | Low | S | No | **T3/C** | `playwright.config.ts`; `playwright.deploy-smoke.config.ts` | Routine minor bump with `npx playwright install` in CI |

## ROI tier key

| Tier | Meaning |
|---|---|
| **T1/S** | Address before production closeout — high stability risk, small effort |
| **T2/M** | Plan in next maintenance window — medium risk or coordinated upgrade |
| **T2/A** | Important but not blocking — align on next dependency pass |
| **T3/C** | Monitor — low immediate risk or inherent tradeoff accepted |

## Top 5 by ROI (upgrade / stability)

1. **L8-001 — Nitro nightly alias** — Non-semver server runtime with caret range; silent lockfile drift can break `vite build` / deploy. Pin exact nightly hash and gate on CI build.
2. **L8-002 — TanStack Start/Router skew** — Router two patches ahead of Start with four nested core versions; highest-probability source of SSR/middleware regressions on bump. Upgrade as a locked set.
3. **L8-003 — Playwright outside `test:all`** — Library stack can pass CI while browser and deploy/provider proofs rot. Required for Phase 2–6 production gates per CONCERNS.
4. **L8-004 — Clerk bypass env flag** — Not a semver issue but a stability failure mode: production/preview with bypass disables auth middleware. Hard-stop at startup.
5. **L8-005 — Fetch-only provider clients** — No SDK upgrade signals for Resend/Novu/Stripe/Autumn; API shape changes surface only in production smokes. Keep fail-loud deploy tests; add fixture-backed contract tests before SDK adoption.

## Recommended upgrade sequence

1. **Stabilize runtime:** Exact-pin Nitro nightly → aligned TanStack Start + Router bump → `npm run build` + `test:e2e`.
2. **Harden auth:** Production guard on Clerk bypass (`src/start.ts`).
3. **Prove providers:** Run deploy/provider Playwright smokes after env is configured (CONCERNS Phase 2 blocker table).
4. **Backend bump:** Convex patch/minor with codegen + `tests/unit/convex/*`.
5. **Defer SDK adoption:** Official Resend/Novu/Stripe SDKs are optional until contract tests exist; current fetch approach is intentional for redaction control but shifts drift risk to smokes.

---

*Libraries audit: 2026-06-30 · evidence commit per CONCERNS `8075862d`*
