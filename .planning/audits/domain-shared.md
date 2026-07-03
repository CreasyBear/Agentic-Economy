# Domain Audit — SHARED FRONTEND PRIMITIVES (Domain-Shared)

Scope: `src/components/**` (excl. `ae/chat/**`, `ae/ai-elements/**` → Domain-AnswerChat), `src/hooks/**`, `src/lib/**`, `src/styles/**`.
Repo: ~/Jcsyc_Projects/agentic-economy · READ-ONLY · grounded in current `src/` + `local://audits/rd-findings.json`.
Format: `[Pn] · REAL|NOISE|FP · category · path:line · evidence · fix-direction · blast-radius`

---

## COVERAGE & META

- react-doctor scanned **36 of ~90+** shared files (40% coverage). **`src/hooks/` entirely unscanned** (both files); `src/lib/` mostly unscanned (only `operator/navigation.ts`, `server/notification-provider.ts`); `src/styles/` unscanned (CSS is out of react-doctor's domain anyway — known CSS-token issues live in the 2026-07-01 redesign audit / memory, not here).
- Unscanned-but-spot-checked below: `use-mobile.ts`, `use-client-mounted.ts`, `lib/utils.ts` (clean; one minor nit).
- **Circular-dependency (7) — shared lib is NOT the culprit.** All 7 cycles live in `src/modules/` (catalog 2: `owner-public-flow↔publish↔public`; observability/security 5: `operator-controls↔observability/public↔security/public↔admin-authority|admin-readbacks|disputes`). Zero cycles pass through `src/components`, `src/hooks`, or `src/lib`. The assignment hint ("shared lib is a likely culprit") does not hold for this repo — these belong to the backend-module auditor (DomainOwnerOps / backend), not shared.
- **only-export-components (8) + no-multi-comp (8)**: ~80% are intentional shadcn-registry co-location (slot components + variant/helper exports in one file). See classifications below — do NOT split these.
- Severity totals in-domain: 72 findings, 0 errors, all `warning`. Real issues cluster at P2/P3; **no P0/P1 in shared**.

---

## P2 — fix-worthy (security / perf, real impact)

**[P2] · REAL · security · src/components/ae/artifacts/AeGenerativeMap.tsx:17 + :45 ·** Both `AeGenerativeMap` and `AeOfficeMap` render `<iframe src=google-maps-embed …>` with **no `sandbox`**. src is cross-origin (Google), so parent-DOM access is already blocked by SOP — the residual risk is frame-busting/top-navigation & popup abuse from embedded content. · Add `sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox"` and verify Maps Embed still renders (Maps Embed needs scripts+samesorigin); or document a trusted-origin exception. · blast: low — 2 iframes, both in this one file. Public-surface (renders in answer/listing maps).

**[P2] · REAL · perf/bundle · src/components/animate/fade-in.tsx:2 ·** `import { motion } from 'motion/react'` ships the full motion bundle (~30 KB). fade-in is a shared animation primitive consumed across landing + operator surfaces. · Migrate to `m` + a root `<LazyMotion features={domAnimation}>` provider; flip `motion.div`→`m.div`. Must be done together with shimmer (next) or the provider is wasted. · blast: medium — needs a LazyMotion provider near app root + touching every `motion.*` callsite (currently only fade-in + shimmer, so small surface).

**[P2] · REAL · perf/bundle · src/components/ai-elements/shimmer.tsx:5 ·** Same `motion` import. Already partially optimized (`motion.create(element)` cached at module level, line 21), but still pulls the full bundle. · Convert to `m.create` / `LazyMotion`. Pair with fade-in. · blast: medium (see above). shimmer is used by message/reasoning/answer preview.

**[P2] · REAL · perf · src/components/ai-elements/prompt-input.tsx:87 ·** `isComposing` is `useState` but only ever **read inside `handleKeyDown`** (line 99 `!isComposing`), never rendered. Each IME composition start/end triggers a re-render for nothing, and `isComposing` lands in the `useCallback` dep array, churning the callback. · Convert to `useRef(false)`; read `.current` in the handler; set in onCompositionStart/End. Removes spurious re-renders + stabilizes the callback. · blast: low — one component (PromptInputTextarea). Consumed by the custom answer prompt input.

---

## P3 — quality / a11y / dead-export (real but low value)

### Unused exports (over-exported or dead registry surface) — REAL, prune
- **`src/components/ai-elements/message.tsx`** — 9 unused exports: `MessageActions`(64), `MessageAction`(79), `MessageBranch`(132), `MessageBranchContent`(178), `MessageBranchSelector`(204), `MessageBranchPrevious`(221), `MessageBranchNext`(241), `MessageBranchPage`(261), `MessageToolbar`(296). Grep confirms zero external importers; AE's chat is custom and uses only `Message`/`MessageContent`/`MessageResponse` (alive, used by `AeAssistantAnswerPreview:16`). The entire message-*branch* + *toolbar* subsystem (~150 lines + internal `useMessageBranch` context) is dead registry scaffolding. · Delete the 9 exports + `MessageBranchContext`/`useMessageBranch` helper. · blast: none.
- **`src/components/ae/forms/AeCopyPublicUrlButton.tsx:49`** — `buildPublicPageUrl` exported, no importer (grep = self only). Also the only non-component export → see only-export-components below. · Delete the export (or move to a url util). blast: none.
- **`src/components/ui/message-scroller.tsx:129`** — `useMessageScrollerVisibility` re-exported from `@shadcn/react/message-scroller`, no importer (its sibling `useMessageScrollerScrollable` is used by chat). · Drop the re-export. blast: none.
- **`src/components/animate/fade-in.tsx:40`** — `FadeInStagger` exported, no importer. `FadeIn` (the non-stagger) is the live one. · Delete `FadeInStagger` + its `FadeInStaggerContext`. blast: none.
- **`src/components/ae/operator/AeOperatorDataTable.tsx:131`** — `useOperatorDataColumns` exported, no importer (used only internally? no — grep shows definition only). · Drop `export`. blast: none.
- **`src/lib/operator/navigation.ts:122,135,155`** — `billingSectionNav`, `monetizationSectionNav`, `showsAdvancedOperatorNav` are exported but consumed only **internally within the same file** (lines 270/272/167). · Drop the `export` keyword (keep them module-private). blast: none.
- **`src/lib/server/notification-provider.ts:336,542`** — `sendResendNotificationEmail`, `normalizeResendWebhookPayload` exported, consumed only internally (326/539). · Drop `export`. blast: none (server-side lib).

### only-export-components (Fast Refresh) — mostly NOISE (shadcn convention)
- **NOISE (shadcn convention, keep):** `ui/button.tsx:73` (`buttonVariants`), `ui/badge.tsx:49`, `ui/tabs.tsx:88`, `ui/marker.tsx:69`, `ui/toggle.tsx:45` (dead → FP below), `ui/field.tsx:90` (`getFieldAccessibility` tightly coupled to field slots). Exporting cva `*Variants` alongside the component is universal shadcn practice; the Fast-Refresh downside is accepted ecosystem-wide. Don't split.
- **REAL (genuine co-location smell):** `ae/forms/AeCopyPublicUrlButton.tsx:49` (buildPublicPageUrl — pure util in a component file) and `ae/layout/AePublicShell.tsx:25` (`defaultHomeSearch` const). These are AE-authored, not shadcn. · Move the util/const to a lib file. P3 (dev-experience only).

### no-multi-comp (multiple components per file) — all NOISE (intentional slot co-location)
- **NOISE:** `ui/collapsible.tsx:10,21` (Collapsible/Trigger/Content — LIVE, used by research-process/about/help/terms/reasoning/sources), `ui/marker.tsx:42,56` (MarkerGroup/Marker/Content/Icon — LIVE, used by answer-preview/owner.inquiries), `ui/input-group.tsx:44,103` (6 slot components — shadcn composite). Multi-slot-in-one-file is the shadcn composite pattern; splitting harms cohesion. Keep.
- **FP (dead files):** `ui/hover-card.tsx:14,22` — file is dead (dead-code.md ORPHANS). Slated for deletion, not splitting.

### prefer-tag-over-role — mostly FP (react-doctor suggests the wrong tag)
- **FP:** `ui/input-group.tsx:13,51` — react-doctor suggests `<address>` for `role="group"`; `<address>` is for contact info, semantically **wrong** here. `role="group"` on a presentational input composite is correct. Keep. (Could swap to `<fieldset>` only if it were a true named form group; it isn't.)
- **FP:** `ui/item.tsx:11` — suggests `<menu>` for `role="list"`; `<menu>` is for command lists. `role="list"` is valid ARIA for a generic list. Keep (or use `<ul>`, optional).
- **FP:** `ui/breadcrumb.tsx:63` — suggests `<a>` for BreadcrumbPage's `role="link"`; BreadcrumbPage is the **current/non-clickable** page (aria-disabled + aria-current="page") — an `<a>` is wrong. The `role="link"` on a disabled span is slightly noisy; cleanest is to drop `role`/`aria-disabled` and keep `aria-current="page"` on the span. P3 nit.
- **FP:** `ae/artifacts/AeGenerativeAnswer.tsx:100` (`<span role="status">Reconnecting…</span>`) and `:372` (answer live-region) and `ae/feedback/AeConfirmDialog.tsx:68` (pending status) and `ae/landing/AeAgentJsonAffordance.tsx:26` (copied status). react-doctor suggests `<output>` for all; `<output>` is for form-calculation results, **not** transient aria-live status. `role="status"` (implies aria-live=polite) is the correct choice for these announcements. Keep all four.

### Accessibility — mostly slot-FP; one minor REAL
- **FP:** `ui/empty.tsx:20` (EmptyTitle `<h2 {...props}/>` heading-has-content) — slot receives children at call sites; definition can't see them. Keep.
- **FP:** `ui/field.tsx:71` (FieldLabel `<label {...props}/>` label-has-associated-control) — slot. Verified ALL call sites pass `htmlFor` correctly (AeCheckboxField, AeInquiryComposer, AeOwnerReplyComposer, AeOperatorFilterCard, $slug.inquiry, claim, admin.monetization, owner.actions, privacy.remove — every one wires `htmlFor={id}`). Good defensive primitive. Keep.
- **REAL (minor):** `ui/input-group.tsx:50` (click-events-have-key-events) — `InputGroupAddon` div has an `onClick` that focuses the nested input (line 55) but no keyboard handler. Keyboard users reach the input via Tab directly so functional impact is nil, but an interactive `onClick` on a non-interactive `role="group"` div is a lint smell. · Either drop the click-to-focus convenience or add `tabIndex={-1}` + `onKeyDown`. P3.
- **REAL (minor, vendored):** `ui/sidebar.tsx:283` (SidebarRail `<button>` no `type`) — defaults to `type="submit"`. Sidebars aren't in forms so no live bug, but it's a latent footgun in vendored shadcn code. · Add `type="button"`. P3.
- **NOISE:** `ae/artifacts/AeGenerativeAnswer.tsx:157` (no-many-boolean-props, `AeAnswerJourney` takes 4 hasX booleans) — they drive which journey sections render; it's a layout switch, not a combinatorial state machine. Splitting adds indirection without value. Keep.
- **NOISE:** `ae/layout/AeOperatorBreadcrumbs.tsx:39` (no-array-index-as-key) — key is actually `${item.label}-${index}`; breadcrumbs are append-only and never reordered/filtered, so index-keys are safe here. (Could use `item.href||item.label` for cleanliness.) P3.

### React-state hygiene — NOISE / FP
- **NOISE:** `ae/forms/AePublicSearchBar.tsx:27`, `ae/layout/AeOperatorShell.tsx:41`, `ae/layout/AeOperatorSidebar.tsx:36` (rerender-memo-with-default-value: `=[]`/`={}` defaults). These components are **not** wrapped in `React.memo`, and their children aren't memoized either, so the rule's premise (breaks memo prop-comparison) doesn't apply. Hoisting to module constants is cheap insurance but zero current impact. P3.
- **NOISE:** `ai-elements/reasoning.tsx:60` (no-derived-useState, `useState(duration)`) — `duration` is a one-time seed for an uncontrolled *measured* value (overwritten by measurement logic via `startTimeRef`). Legitimate controlled/uncontrolled default pattern. Keep.
- **FP:** all 5 `no-react19-deprecated-apis` (useContext → `use()`) on `ai-elements/message.tsx:5`, `reasoning.tsx:5`, `animate/fade-in.tsx:1`, `ui/sidebar.tsx:47`, `ui/toggle-group.tsx:66`. **`useContext` is NOT deprecated in React 19** — it remains fully supported; `use()` only adds value for conditional/looped context reads, which none of these are. react-doctor over-reports. Keep all.

### use-lazy-motion — REAL (promoted to P2 above): fade-in:2, shimmer:5.

### Dead-file findings (6) — all FP, cross-ref dead-code.md
- `ae/layout/AeProseBlock.tsx`, `ae/operator/AdminAnalyticsPanel.tsx`, `ui/hover-card.tsx`, `ui/native-select.tsx`, `ui/toggle.tsx`, `ui/toggle-group.tsx` — react-doctor `unused-file`. **Confirmed dead in dead-code.md ORPHANS (zero importers).** Slated for deletion, not fixing. All OTHER react-doctor findings on these same dead files are likewise FP: `hover-card` no-multi-comp×2; `toggle-group` jsx-no-constructed-context-values:50 (the inline context value IS a real anti-pattern, but in dead code → delete, don't fix) + no-react19-deprecated-apis:66; `toggle` only-export-components:45. Delete the files per dead-code.md; ignore their lint findings.

---

## WHAT REACT-DOCTOR MISSED (real shared-lib issues it didn't catch)

1. **`src/hooks/use-mobile.ts:11`** (unscanned) — `onChange` reads `window.innerWidth < BREAKPOINT` instead of the cheaper/correct `mql.matches`; also the `useState<boolean|undefined>(undefined)` + `return !!isMobile` collapses the undefined sentinel to false at the return anyway, so the tri-state is pointless — simplify to `useState(false)` + `setIsMobile(mql.matches)`. P3 nit.
2. **Unscanned coverage hole**: `src/hooks/` (2 files) + ~10 `src/lib/` files (observability/*, server/*, ui/*, http/*) were never linted. Spot-check of the 2 hooks + `lib/utils.ts` found them clean, but the observability/server libs (posthog, sentry, funnel-attribution, source-write-admission, convex-source) deserve a dedicated pass — they're outside react-doctor's scan and outside this audit's depth. Flag for a lib/server follow-up.
3. **`ui/toggle-group.tsx:50` inline context value** — `jsx-no-constructed-context-values` is a genuine perf anti-pattern (every ToggleGroup render mints a new context object → all consumers re-render), but it lives in a **dead** file so react-doctor's flag is moot. The *live* shadcn context providers (e.g. `SidebarProvider`, `Collapsible`) should be checked for the same inline-value pattern — react-doctor only caught the dead one. (Spot check: sidebar.tsx uses a memoized context value — fine.)
4. **shadcn `button`/`badge`/etc. lack `type="button"` defaults on inner `<button>`s in several vendored files** — react-doctor caught only `SidebarRail`; the same latent submit-default footgun likely exists in other vendored primitives not scanned. Low priority (none are in forms).

---

## DIGEST

- **72 findings, 0 P0, 0 P1, 4 live P2 (5 findings), rest P3/NOISE/FP.**
- **Live P2 (fix):** AeGenerativeMap iframe sandbox ×2 (security, defense-in-depth — cross-origin already mitigates parent access); fade-in + shimmer `motion`→`m`/LazyMotion bundle trim (perf, do as a pair); prompt-input `isComposing` useState→useRef (perf).
- **Circular-dep hint was wrong for shared:** all 7 cycles are in `src/modules/` (catalog/observability/security), none touch shared components/hooks/lib. Hand to backend auditor.
- **only-export-components / no-multi-comp: ~80% intentional shadcn co-location — do NOT split.** Only 2 AE-authored files (AeCopyPublicUrlButton, AePublicShell) genuinely mix util/const with a component.
- **prefer-tag-over-role: ALL FP** — react-doctor suggests semantically wrong tags (`<address>` for group, `<menu>` for list, `<a>` for current-page, `<output>` for transient status). Keep the ARIA roles.
- **a11y primitives are well-designed:** FieldLabel association verified correct at every call site; EmptyTitle/heading are slot FPs. Two minor REAL nits (InputGroupAddon click-without-key, SidebarRail missing type).
- **useContext "deprecated" (×5): FP** — useContext is not deprecated in React 19.
- **6 dead files + their lint findings: FP** — delete per dead-code.md, don't fix. Cross-ref: dead-code.md ORPHANS (AeProseBlock, AdminAnalyticsPanel, hover-card, native-select, toggle, toggle-group).
- **Coverage gap:** react-doctor scanned 40% of shared; `src/hooks/` fully missed (spot-checked clean); ~10 `src/lib/` server/observability files unscanned — recommend a lib/server follow-up audit.
