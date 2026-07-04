# Domain Audit — Owner/Operator/Admin + Billing/Inquiry/Protected-Action

**Domain-OwnerOps.** READ-ONLY. Grounded in `local://audits/rd-findings.json` + direct file reads at current tree (commit `1d4ce46`).
Scope prefixes: `src/modules/{billing,inquiries,protected-action,business-action,observability}/**`, `src/routes/{owner,admin}/**`.

Format: `[Pn] · REAL|NOISE|FP · category · path:line · evidence · fix-direction · blast-radius`

---

## SCOPE TOTALS & COVERAGE

react-doctor flagged **159 diagnostics** in this domain (33 error / 126 warning). By rule: unused-export 45 · aria-role 33 · only-export-components 30 · no-multi-comp 29 · circular-dependency 5 · unused-file 3 · js-combine-iterations 3 · tanstack-start-no-anchor-element 3 · no-initialize-state/rendering-hydration-no-flicker 2+2 · no-render-in-render 1 · no-array-index-as-key 1 · prefer-useReducer 1 · insecure-crypto-risk 1.

**Coverage caveat (verified):** ~64 source files in scope; react-doctor emitted findings in ~45. **`src/modules/business-action/business-action.functions.ts` was NOT scanned** — it exports 22 symbols (19 `*Server`/`*ThroughSource` pairs, identical to the 14-finding `billing.functions.ts`) yet has ZERO findings. If scanned it would mirror billing's unused-export noise. Treat any "clean" `*.functions.ts` as unverified, not validated. `public.ts` facades and `route-readbacks.ts` show zero findings (re-export only — plausibly truly clean).

---

## SYSTEMIC FINDING — aria-role ×33 (all 33 errors)

**[P2] · REAL (quality, NOT a11y) · naming-collision · src/components/ae/layout/AeOperatorShell.tsx:21,33 + 33 call sites · evidence · fix-direction · blast-radius**
- Evidence: Every error is `<AeOperatorShell role="admin">` or `role="owner">`. `AeOperatorShell` declares a **typed domain prop** `role: OperatorRole` (`'owner'|'admin'|'developer'`, `src/lib/operator/navigation.ts:15`). The prop is consumed ONLY as a lookup key — `roleHomeHref[role]`, `roleLabel[role]`, `navGroupsForRole(role)`, `listOperatorCommandDestinations(role)` (verified in `AeOperatorShell.tsx:59,70`, `AeOperatorSidebar.tsx:36-51`, `AeOperatorCommandMenu.tsx:26-28`). **It is NEVER spread to or rendered as a DOM `role` attribute.** No invalid ARIA role reaches the DOM; no screen reader ever sees `role="admin"`.
- **Classification: FALSE-POSITIVE at the a11y level** (react-doctor pattern-matches the JSX literal `role="admin"` without resolving the component). The 33 sites span: admin.{audit-events,business-actions.$requestId×2,business-actions,claims,index-health,inquiries,monetization×3,protected-actions×3} and owner.{actions×4,billing×5,business-actions×4,inquiries×3,status}.
- **But REAL as a code-quality problem:** the prop name `role` collides with the JSX global `role` attribute, trips every a11y linter (jsx-a11y, react-doctor), and obscures intent ("operator scope" vs "ARIA role"). Per the scan caveat, react-doctor's deslop rules are ~50% FP on this repo; this is the single largest FP cluster and it will recur on every new operator route.
- Fix-direction: rename the prop to `operatorRole` (or `scope`). Update `AeOperatorShellProps.role`, `AeOperatorSidebarProps.role`, `AeOperatorCommandMenuProps.role`, and the 33 call sites. `OperatorRole` type and the `roleHomeHref`/`roleLabel`/`navGroupsForRole` functions take the *value* (not the prop), so they need no rename — only the JSX prop + the three component prop lists. Mechanical, codemod-friendly.
- Blast-radius: **medium** — 33 route files + 3 layout components + 1 type. No behavior change; lint noise drops to zero. No runtime/a11y risk either way.

---

## P1 — architectural (cross-references; do NOT re-derive)

**[P1] · REAL (cite) · seam-coverage · src/modules/actions/index.ts:14-36 ·** Per **soc-arch.md §1 P1**: billing / business-action / protected-action / catalog / observability owner+admin ops are **bare server fns, not actions** — no boundaries/summary/schema/registration. The owner-only inquiry actions (`readOwnerInbox`, `reply`, `markRead`, `close`, surfaces `['ui','http']`) set the precedent that owner/admin ops ARE actions, yet `billing.functions.ts`, `business-action.business-action.functions.ts`, `protected-action/contact-follow-up.functions.ts`, `observability/funnel.functions.ts`, `observability/internal/operator-controls.ts` all expose server fns outside the registry. **Decision pending: promote-to-action vs document-as-intentional.** This is the root reason the 45 `unused-export` + `no-multi-comp` noise is so dense here (see NOISE section). Blast: large (architectural decision; tracked in soc-arch).

**[P1] · REAL (cite) · boundary-leak + duplicate-routes · src/routes/owner.billing.{tsx,activate.tsx,cancel.$operationId.tsx,redirecting.tsx,return.$operationId.tsx} ↔ src/future-phases/05-paid-activation-money-rails/** · Per **dead-code.md P1**: the 5 active `/owner/billing*` routes import `OwnerBillingStatePanel` + `summarizeOwnerBillingRoute` + `readOwnerBillingRouteReadback` directly from `@/future-phases/05-...`, and `owner.billing.redirecting.tsx:5-6` (read this audit) confirms the leak. The contract scanner (`src/lib/ui/contract-scans.ts:170-256`) special-cases-allow it. Already tracked in `.planning/codebase/CONCERNS.md:19-23`. **Fix: graduate the 05-* money-rail code into `src/modules/billing/` (or a non-"future" location) and delete the parked duplicate.** Blast: medium (5 routes + 2 imported modules + scanner allowlist).

---

## P2 — REAL defects

**[P2] · REAL · security/defense-in-depth · src/modules/business-action/internal/business-action.ts:986 (also 977-989) · timing-unsafe hash compare in receipt tamper-verification · fix · blast**
- Evidence: `verifyReceiptStatus()` compares receipt integrity hashes with plain `!==`: `receipt.signatureRefHash !== expectedSignatureRefHash` (L986), plus `cardHash`, `mandateHash`, `requestHash`, `checkpointHash`, `payloadHash`, `resultArtifactHash`, etc. (L977-989). react-doctor's `insecure-crypto-risk` flags `!==`/`==` on `*Hash`/`*Sign` vars in a "security-shaped context."
- The repo **already has the fix pattern**: `safeEqualHex` (`src/modules/security/source-write-admission.ts:181`) and `constantTimeEqual` (`src/lib/server/billing-provider.ts:210`, `notification-provider.ts:591`, both wrapping `node:crypto.timingSafeEqual`). The high-stakes verifications (source-write signatures, Svix webhook signatures) already use them; this receipt-integrity path does not.
- Practical exploitability is LOW (receipts are source-owned/stored; attacker would need to control a forged receipt AND observe server-side verification timing externally), but receipt integrity is a stated AE invariant ("ActionReceipt, verifier, reconstruction/audit trail") and the fix is a cheap consistency win.
- Fix-direction: route the hash-string comparisons through `safeEqualHex` (or lift it to `@/modules/common`). Note `sameStringSet(...)` (L988-989) is already a set-equality helper — extend that pattern to the scalar compares.
- Blast: small — `verifyReceiptStatus` + its `expected*Hash` derivation only.

**[P2] · REAL · maintainability/architecture · src/modules/observability/internal/operator-controls.ts:0 (5 cycles) · observability ↔ security bidirectional cycle · fix · blast**
- Evidence (all 5 react-doctor cycles share one root): `operator-controls.ts` imports `@/modules/security/public` (`requireAdminAuthority`, `assertCsrf`, L3) AND `@/modules/observability/public` (`validateAuditEvent`, L4). Meanwhile `security/internal/admin-authority.ts:3-4` and `security/internal/disputes.ts:2-3` import `validateAuditEvent`/`AuditEventContract` from `@/modules/observability/public`, and `observability/public.ts:22` imports `AdminMembership`/`CsrfCheckInput` from `security/public`. Net: `observability ↔ security` is bidirectional, plus an `internal → public` (same-module facade) cycle.
- This is a layering inversion: both modules audit each other. Partial-initialization risk is low (these are mostly type imports + pure `validateAuditEvent`), but it forecloses clean layering and will bite when either module grows.
- Fix-direction: dependency inversion — extract an `AuditEventSink`/`AuditEventContract` interface into a shared low-level module (e.g. `@/modules/common/audit`) that BOTH observability and security depend on downward; security emits audit events via the interface rather than importing `observability/public` directly. The 4 cross-module cycle edges collapse to one direction.
- Blast: medium — touches `observability/public.ts`, `observability/internal/operator-controls.ts`, `security/internal/{admin-authority,admin-readbacks,disputes}.ts`. No public/route API change; internal refactor. (security side is outside my prefixes — coordinate with DomainShared if it owns security.)

**[P2] · REAL · perf/DX · src/routes/{owner.billing.redirecting.tsx:36, admin.monetization.$operationId.tsx:156, owner.inquiries.$threadId.tsx:244} · plain `<a>` for internal nav · fix · blast**
- Evidence: `<Button asChild><a href="/owner/billing">…</a></Button>` (redirecting:36), `<a href="/admin/monetization">` (monetization.$operationId:156), `<a href="/owner/inquiries">Back to inbox</a>` (inquiries.$threadId:244, in the `not_found` branch). Plain `<a>` triggers a full document reload, losing TanStack Router client state, preloading, and pending mutations (operator routes frequently hold `pendingAction`/form state).
- Fix-direction: swap to TanStack `<Link to="/owner/billing">` (works with `Button asChild`). The `not_found` "Back to inbox" is safe to Link too.
- Blast: small — 3 lines across 3 routes. Low risk; verify the redirecting route (post-payment-provider return) doesn't *intentionally* reload to refresh loader state — if it does, keep `<a>` there and Link the other two.

**[P2] · REAL · quality · src/routes/{owner.actions.$proposalId.tsx:60,66,75 / owner.inquiries.$threadId.tsx:121,127} · "hydrated" gate + useState sprawl · fix · blast**
- Evidence: both routes use `const [hydrated,setHydrated]=useState(false); useEffect(()=>setHydrated(true),[])` (actions:66/75, inquiries:121/127) → react-doctor's `no-initialize-state` + `rendering-hydration-no-flicker` (the "flash" = submit buttons going disabled→enabled after mount). `hydrated` gates the mutation submit buttons only (`actions:270,292` `disabled={!hydrated||…}`; `inquiries:263-265` `canClose/canMarkRead/canReply = hydrated && …`). owner.actions.$proposalId additionally has **7 useState** (`prefer-useReducer`): readback, hydrated, consequenceAccepted, rejectReason, pendingAction, actionMessage, actionError.
- This is an **intentional defensive pattern** (prevent native form POST before client hydration wires the `useServerFn` handlers), not broken UX — so the flicker rule is technically REAL but low-value. The 7-useState cluster is a genuine split opportunity: `(pendingAction, actionMessage, actionError)` is a request-status machine → `useReducer`.
- Fix-direction: collapse the status triple into a `useReducer` keyed by action lifecycle (`idle|approving|rejecting|done|error`); the `hydrated` guard can stay OR be removed if buttons are `type="button"` with `onClick` (onClick can't fire pre-hydration, making the guard redundant) — verify button types before removing.
- Blast: small-medium — 2 route components, no contract/API change.

---

## P3 — REAL (minor)

**[P3] · REAL · a11y/data-correctness · src/routes/admin.inquiries.tsx:252 · `key={`${title}:${index}`}`** in `RefSection<T>` uses array index. `renderRef` produces stable natural keys (e.g. messageRefLabel → `sender·messageId·…`, L263). Fix: add a `keyOf?: (ref:T)=>string` prop to `RefSection` and key on it; falls back to index. Low risk (immutable audit refs rarely reorder), but a stable key is trivial. Blast: 1 component, 2 call sites.

**[P3] · FP · maintainability · src/routes/admin.inquiries.tsx:253 · no-render-in-render** flags inline `renderRef(ref)`. **FP** — `renderRef` returns a `string`, not JSX/component; React does not remount. Ignore.

**[P3] · REAL (nit) · perf · src/routes/admin.business-actions.tsx:188,202,221 · `.filter().map()` double-pass** in `buildOwnerBusinessActionRouteReconstruction`. Lists are per-request audit rows (handful). Combining into a single `for…of`/`.reduce` is purely cosmetic; line 221 adds a 3rd pass (`.filter().length`) on the same `privateEvidenceRefs`. Real but negligible. Blast: 1 fn.

**[P3] · REAL (cite) · dead-orphan · src/modules/protected-action/internal/{attempt-readback.ts, policy.ts, reconstruction.ts} ·** react-doctor `unused-file` ×3. **dead-code.md ORPHANS #4 already confirmed these orphan** — `protected-action/public.ts` re-exports only from `./internal/contact-follow-up` (a self-contained 1798-line file); these three have zero `src/`/`convex/`/`tests/` importers (appear only in Phase-4 PLAN docs). Cite dead-code.md; do NOT re-derive. Blast: none (delete or wire to Phase-4 intent).

---

## NOISE / FALSE-POSITIVE (bulk) — explain, don't fix react-doctor's blind spot

**[NOISE] · FP · unused-export ×45 (modules) ·** All `*Server` exports are `createServerFn(...)` consumed via the TanStack `useServerFn(fnId)` macro (compiler-rewritten; invisible to react-doctor's static import graph), and every `*ThroughSource` is the body paired with its `*Server` wrapper in-file (e.g. `readCurrentOwnerBillingServer`→`readCurrentOwnerBillingThroughSource`, billing.functions.ts:274/320). Neither `useServerFn` nor route `loader:`/`component:` field assignments are traced. dead-code.md (authoritative) did NOT flag any of these as dead. **Verified exceptions (genuinely dead, react-doctor right by accident):**
  - `recordPublicFunnelEventServer` (funnel.functions.ts:75) — `/** @deprecated Use recordOwnerActivationEventServer. */` alias.
  - `readAdminFunnelSummaryThroughSource` (funnel.functions.ts:78) — `/** @deprecated Funnel counts now live in PostHog. */`
  Recommend dead-code agent confirm + delete these two; the other 43 are FP.

**[NOISE] · FP · only-export-components ×30 + no-multi-comp ×29 ·** 100% `.tsx` route files. TanStack Start route files canonically co-locate `Route` const + route component + small presentational helpers (`OperationCard`, `TimelineRow`, `RefSection`, `ReconciliationCard`) + `createServerFn` loaders. This is the documented ~50% FP rate. **No action** — splitting would fragment cohesive route modules. (If a route file exceeds ~400 lines, *then* extract; admin.inquiries/admin.monetization at 6 comps each are the only candidates worth a future look, and only for readability.)

---

## WHAT REACT-DOCTOR MISSED (real issues in this domain it didn't catch)

1. **`business-action.functions.ts` entirely unscanned** (22 exports, 19 `*Server`/`*ThroughSource` — identical to the 14-finding `billing.functions.ts`). Coverage gap; the unused-export FP/stale-export picture for business-action is unknown. Re-scan or hand-verify.
2. **The observability↔security cycle is architectural, not just "circular-dependency" noise** — react-doctor reported 5 cycle *instances* but not the single root cause (bidirectional module coupling + a missing audit-sink abstraction). The real fix is dependency inversion, not reordering imports. (Captured as P2 above.)
3. **The aria-role ×33 is a prop-naming design flaw, not 33 independent bugs** — react-doctor emits one error per call site and cannot name the systemic fix (rename `role`→`operatorRole`). (Captured as P2 above.)
4. **Receipt-integrity hash compares (`!==`)** were caught as a single `insecure-crypto-risk` at business-action.ts:986, but react-doctor flags only the `signatureRefHash` line — the *same* `!==` pattern spans L977-989 (`cardHash`, `mandateHash`, `requestHash`, `checkpointHash`, `payloadHash`, `resultArtifactHash`, `reconstructionStatus`). The full comparison block needs the timing-safe helper, not just L986.
5. **`useServerFn` consumers of the `*Server` exports are invisible** — so any genuinely-orphaned `*Server` fn (one with no route `loader`/`useServerFn` wiring) is undetectable by react-doctor. dead-code.md is the only reliable signal; cross-check the two `@deprecated` funnel fns.
6. **`owner.billing.*` boundary leak into `future-phases/05-*`** (dead-code.md P1) is invisible to react-doctor entirely — it's a parking-discipline issue, not a lint rule. Already tracked; cited above.

---

## DIGEST (top actions)

1. **aria-role ×33 = FP at DOM level** (`role` is a typed domain prop, never rendered to DOM) — but REAL P2 prop-naming collision; rename `role`→`operatorRole` across 33 sites + 3 components to kill the recurring lint cluster. No a11y risk today.
2. **P2 timing-unsafe hash compares** in `verifyReceiptStatus` (business-action.ts:977-989) — repo already has `safeEqualHex`/`constantTimeEqual`; route receipt-integrity compares through it. Low exploitability, cheap fix, stated AE invariant.
3. **P2 observability↔security bidirectional cycle** (5 react-doctor instances, 1 root cause) — extract a shared audit-sink abstraction; internal refactor, no API change.
4. **P2 ×3 plain `<a>` internal nav** (owner.billing.redirecting, admin.monetization.$operationId, owner.inquiries.$threadId) — swap to TanStack `<Link>`; full reloads lose operator form state.
5. **P1 (cite soc-arch)** ops modules are bare server fns not actions; **P1 (cite dead-code)** `/owner/billing*` leaks into `future-phases/05-*`. Both pre-tracked; don't re-derive.
6. **45 unused-export = ~95% FP** (TanStack `useServerFn` macro + paired Server↔ThroughSource wrappers; dead-code.md cleared them) — EXCEPT 2 `@deprecated` funnel fns worth deleting. **3 unused-file in protected-action/internal = REAL orphans** (cite dead-code.md).
7. **Coverage gap:** `business-action.functions.ts` (19 Server-fn exports) was NOT scanned — its export-health is unknown.
