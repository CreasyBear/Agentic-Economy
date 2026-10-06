# Arc elevation: handover (2026-10-07)

## Where things are

- **Branch:** `well-33/arc-elevation`, in worktree `../aecon-arc-elevation`. It is fully fast-forwarded into **local `main`**.
- **Remote:** local `main` is ahead of `origin/main` and has not been pushed. It already contains `origin/main` up to `a8e3c959f` (#362 Plans, #363, #364 PostHog feedback).
- **Pushing deploys.** Pushing `main` creates Production deployments of both Vercel projects. Convex is not affected; it deploys separately.
- **Main checkout:** clean apart from Joel's uncommitted strategy drafts (`AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md`, `docs/strategy/investment-thesis.md`). Leave those alone.
- **Other branches:**
  - `well-32/plan-quotes` and `codex/agent-feedback` are superseded by the squash merges #362 and #364. Nothing to merge.
  - `codex/chat-recommendations-no-pagination-2026-10-05` (worktree `~/Documents/Codex/2026-10-05/task-2/aecon-consolidation`) holds two unmerged Mercator docs commits plus uncommitted work. It belongs to a live Codex session and was not touched.

## What changed

Goal: stop hand-rolling UI, keep vendored Arc (uiarc.dev) pristine, and apply AE schema, props and hooks at the edge. The full record is [arc-elevation-plan-2026-10-06.md §1a](arc-elevation-plan-2026-10-06.md#1a-amendments-after-e1e2-measurement-2026-10-07). The component usage guide is [arc-vendor-manifest.md → "Which component to use"](arc-vendor-manifest.md#which-component-to-use).

1. **Vendored Arc is pristine.** `src/components/arc/**` holds Free items only. Each is byte-identical to the registry or carries a small `// arc-patch:` accessibility fix; the 16 patches are listed in [arc-vendor-patches.md](arc-vendor-patches.md). `tsconfig.arc.json` typechecks Arc at upstream strictness as a referenced project, and `npm run typecheck` builds it first. Five unused Arc items were removed.
2. **Base UI stays.** Checkbox, drawer, select and tabs are AE-owned Base UI ports in `src/components/ae/shared/base-ui/`. The `@radix-ui/react-{checkbox,dialog,dropdown-menu,select,tabs}` packages were removed (`package.json` changed).
3. **Pro blocks are AE-owned.** Pristine Pro blocks render built-in demo data and export none of the slots AE uses. AE's versions moved from `src/components/arc/{blocks/<pro>,chat,market,funnel-chart,orbit-logos}` to `src/components/ae/shared/arc-pro/<id>/`.
4. **Edge adapters.** Adapters sit flat in `src/components/ae/shared/<name>`:
   - `alert` (`AeAlert`) and `empty-state` (`AeEmptyState`)
   - `action-link` (`AeActionLink`, `actionLinkClassName`)
   - `status-stepper`, `usage-meter`, `sortable-data-table`, `comparison-table`
   - `record-page-header`, `router-link-boundary`, `router-tabs`, `copy-value`
5. **shadcn → Arc migrations:**
   - All 105 `ui/alert` sites now use `AeAlert`. Non-danger alerts keep an explicit `role="alert"` so each screen's announcement is unchanged.
   - All 45 `ui/badge` sites use Arc `Badge` tones, and `aeStatusToneVariants` is deleted because `AeTone` equals Arc `BadgeTone`.
   - `ui/button` sites use Arc `Button`, and `ui/empty` sites use `AeEmptyState`.
   - The `ui/alert`, `ui/badge` and `ui/empty` files are deleted.
6. **Private Arc CSS removed.** 83 files imported `arc/button/button.module.css` to make links look like buttons; they now use `actionLinkClassName(variant, size)`. Link-buttons are at least 44px tall at every size.
7. **Dead CSS removed.** 310 lines of composition CSS targeted shadcn `[data-slot="alert-*"|"badge"]` selectors that no longer exist.
8. **Screen-level changes:**
   - **Call receipt:** Result and Request moved into tabs, shown only when both panels have content. Order: summary → recovery → tabs → report/feedback → reuse → technical record.
   - **Market:** an unreachable second search form was deleted.
   - **Treasury:** the exposure meter uses `density="detailed"`.
   - **Admin:** the readiness badge is keyed on status so the live region never holds both labels.
   - **Plans (merged from #362):** they now use `AeStatusStepper` and `AeActionLink`.
9. **Audit fixes:** the consent-outcome focus target is restored. The secret-reveal alert, spend-threshold alert and compromise checklist now use warning tone.

## Validation done (source level)

- `npx tsc -p tsconfig.json` and `tsc -b tsconfig.arc.json`: 0 errors.
- oxlint clean on changed files. Import, module-boundary and UI-contract guard tests pass.
- **Unit suite.** The last full run had 9 failures. Two were from this branch: the admin readiness badge, since fixed. The other 7 also fail on main or need a backend:
  - `useAgentKeysSettings` issuance retry
  - 2 × `security-settings`
  - 2 × chat-turn production start
  - `validate-boot-env` Clerk webhook
  - `capability-call-workpool` integration
- **Tests touched by later fixes.** Commits after that run were checked only on the test files they touch.
- **Read-only Arc Pro audits.** Four reviewer lanes covered public buyer, chat/Calls/Plans, owner/supply and admin/ops, using the accessibility, motion, responsive and refactor-to-Arc checklists. Owner/supply found three issues, all fixed; the other lanes found none.

## Validation still needed (Codex)

1. Run `npm install` in the main checkout. Then run `npm run typecheck` and `npm run test:unit` and compare against the 7 known failures above.
2. **Local stack.** `npm run dev:local` requires `AE_E2E_OWNER_EMAIL` (plus the Clerk dev keys) in `.env.local`, and the worktree is missing it.
3. **Browser, signed in, at 390px and 1440px, light and dark, plus reduced motion and keyboard only:**
   - **Alerts in context**: tone, icon, no duplicated title text, announcement. Covers credit/funding, agent keys reveal, spending limits and pause, consent outcome (focus moves to the outcome after approve or deny), route error recovery, supply onboarding and admin action sheets.
   - **Badges**: status page, activity queue, admin object pages, owner offerings, Agent directory and call history. Check the tone mapping reads right, especially "secondary" mapped to success or neutral.
   - **Call receipt** `/calls/$callRef`: completed with input shows tabs; pending, unknown or no input shows no tabs.
   - **Plans**: confirmation approve/decline buttons (wrapping labels) and the run stepper.
   - **Link-buttons**: 44px minimum height everywhere, including `sm`, with no layout regressions in headers and empty states.
   - **Base UI**: drawer, select, tabs and checkbox flows (market filters, settings, top-up radio cards).
   - **Treasury and admin overview**: exposure meter badge; readiness flip.
4. Confirm visible focus rings: a 2px outline from `src/styles/arc-market.css`.

## Known follow-ups (not done)

- **Plain `<select>` controls.** Six remain where the guide calls for the Base UI select: `AdminMembershipActions`, `CallContentReview`, `CommercialPolicyActions`, `CallFeedbackControl`, `WorkspaceTransferPanel`, `AeProviderConnectionForm`. Their tests need rewriting too.
- **Size limits.** Route files over 80 lines: `__root`, `_operator/agent-access`, `_operator/activity`, `owner.settings.agent-keys`. Files over 500 lines: `useChatSession.ts`, `AeX402Directory.tsx`, `useAeAgentAccessHome.ts`, `arc-pro/orbit-logos.tsx`.
- **Unused shadcn files.** `ui/input-group`, `ui/message` and `ui/table` were already unused on main.
- **Motion lint.** React Doctor flags `height` animation in `arc-pro/agent-run` and `arc-pro/market/ProductDetail` (advisory).
- **Pro token.** `ARC_PRO_TOKEN` was pasted in chat and should be revoked.
