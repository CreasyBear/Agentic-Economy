# Well 7 M1 — one app shell

Date: 2026-09-10. Branch `well-7/app-shell` (on `well-6/operator-truth` until #224 merges, then to `main`). Plan: `~/.claude/plans/well-7-simple-user-expectations.md` (eng review clear; decisions D2, Issues 3 and 5, Tension 1). Scoreboard: `docs/workflow/simple-user-expectations.md`.

## Outcome

- One persistent frame. The root route renders `AeAppShell` (header with brand, public primary nav, command panel, sign-in/publish, mobile drawer) once; market pages and the owner console share it. The header DOM node survives market → owner → market (browser spec `tests/e2e/shell-persistence.spec.ts`).
- The operator sidebar is a tonal mode, not a second shell: `_operator.tsx` renders `AeOperatorSidebar` beside `SidebarInset` under the shared frame (shadcn "sidebar with a sticky site header" pattern). It keeps the single `beforeLoad` auth gate; `tests/imports/operator-leaf-no-auth-gate.test.ts` fails if a leaf ever declares its own admission.
- View transitions are scoped: the header carries `view-transition-name: ae-app-header` and its group does not animate; the content region cross-fades on the 220 ms ladder; reduced motion disables all of it (`src/styles/globals.css`).
- Deleted outright: `AePublicShell`, `AeOperatorShell` (renamed to `AeOperatorPage`, page chrome only), `AePublicRouteStates` and `AeOperatorRouteStates` (merged into `AeRouteStates`), the `owner.status` and `owner.settings.workspace` redirect routes.
- Route pending, error and not-found states come from one family; router defaults use it.
- Mobile owner console gained a sidebar trigger (`SidebarTrigger`, `md:hidden`); a unit test expected it and nothing rendered it.

## Gate

`npm run gate`: four runs. First run failed on `tests/unit/chat/chat-provider-boundary.test.tsx`: it hand-mocks `@tanstack/react-router` and the root now renders the shell, which uses `useLocation`. Fixed by mocking the shell as a passthrough in that test (it tests provider composition, not chrome), matching its existing mocks of the progress bar and error boundary.

## Root causes found while landing

1. The guard test's first draft flagged every `beforeLoad:` in leaf routes; seven leaves use `beforeLoad` for redirects, which is legitimate. Narrowed to the admission symbols.
2. `navBadges` used to reach the sidebar through the page chrome context because the sidebar lived inside the page shell. With the sidebar hoisted to the layout, the context had to be hoisted too (`OperatorChromeProvider` in `_operator.tsx`).
3. Four test files mocked `AePublicShell` to hide the footer. With the footer rendered by `AePublicPage`, `/privacy` and `/terms` show "Legal" twice (page eyebrow and footer column), as production always did; assertions were scoped to `main` rather than weakened.
4. `tests/unit/layout/public-page.test.tsx` had no `afterEach(cleanup)`; DOM leaked between tests. Added.
5. Focus after owner navigation broke three times. First because the focus effect lived on the page component, which now remounts per route; moved to the persistent `OperatorChromeProvider`. Second because the moved effect keyed on the router location, which changes before the new page renders its content region; it now keys on the path the new page registers with its chrome, as the old shell did. Third, the route's pending placeholder registers the new path before the real page, so focus landed on a node that was then unmounted; pending pages now mark themselves and focus waits for the real page. Three existing e2e specs caught all of it (iron rule).
6. The skip link pointed at `#main-content` while operator pages used `#operator-main-content`; two ids for one concept. Unified to `main-content` (page and specs).
7. shadcn `SidebarInset` renders a `<main>`, so operator pages had two main landmarks and `getByRole('main')` focus checks failed. The operator content region is now the page's `<main>` and the layout column is a plain div.
8. The shell-persistence spec tagged the header before React hydrated, so the SSR node it tagged was replaced. The header now carries `data-hydrated` after mount; the spec probes after it and fails on any hydration console error.
9. The launcher's fixed 120 s `convex dev` allowance is shorter than the backend's 180 s startup allowance; on this machine the local backend needs two to three minutes. The stack was started by hand for the swarm; an app started without the launcher's merged env (`effectiveEnv().env`) lacks the server-side Convex credentials and every owner page degrades to "Tools did not load", which contaminated the first behaviour pass.

## Deviations from the plan

- D2 said "one pathless `_app` layout". The frame lives in `__root.tsx` instead: same outcome (one component owns the frame and never remounts) without moving 35 route files into a directory. Nothing else changed.
- Issue 5 said "one nav config". The operator sidebar and mobile nav already read one module (`src/lib/operator/navigation.ts`) and the public header and footer another (`src/lib/public/website-nav.ts`). Merging two coherent modules into one file adds no behaviour; not done. The duplicated components were deleted, which was the point.

## Smells register

| # | Smell | Disposition |
| --- | --- | --- |
| 1 | `AeOperatorPage` keeps a two-tier chrome context (root/nested detection plus a hoisted bridge for the sidebar). It works and is tested, but it is more machinery than one register-into-parent path | Candidate for the design pass (U9) or M2, where settings pages exercise nesting most |
| 2 | During the operator layout's own auth check, pending and error states render without the sidebar; the frame header persists | Accepted: the sidebar is the admitted mode's chrome |
| 3 | No direct header link from market pages to the owner console; the spec reaches `/owner/offerings` via Publish → For providers → List a service | M2 settings home and the signed-in account menu should add the direct path |
| 4 | Two nav config modules remain (public, operator) | Recorded; merge only when an item is shared |
| 5 | `npm run dev:local` gives `convex dev` a fixed 120 s (`LOCAL_STARTUP_TIMEOUT_MS`) while the backend's own startup allowance is 180 s; on this machine the local backend takes two to three minutes to open its 2 GB SQLite state, so the launcher fails three times in a row with "waiting for local backend to start" | Well 7 finding (newcomer, operator); align the launcher stage timeout with the backend allowance and print the backend's progress |
| 6 | Convex's own typecheck is disabled everywhere (`--typecheck disable` in the launcher and codegen scripts); `npx convex dev --once` reveals two errors that a real `convex deploy` would hit (`convex/workloadCron.ts:375` handler return type; `consent-read-model.ts:46` uses `DOMParser` through the agent-access public surface that `convex/schema.ts` imports) | Fixed in this PR at the cause; the hosted runbook must not rely on `--typecheck disable` |
| 8 | `ae supply earnings` is a stub returning `source_unavailable` for every provider (Formance earnings read never implemented after the 2026-09-02 cutover); Well 6's "Calls and earnings" claim holds for Calls only | W7-081, owner M5 |
| 9 | The compat spec's legacy `/owner/supply#earnings` → `/owner/offerings#earnings` redirect runs client-side (the server answers 200 because the hash is invisible to it), so under gate load it can take longer than the spec's five seconds and the run flakes; the redirect stubs disappear in M2 when the settings routes become real pages | Known flake, owner M2; not masked by a longer timeout |
| 7 | The launcher rewrites `.env.local` to the local deployment even when it then fails, so a later `npm run gate` e2e run may point at a backend that is not running | Recorded; the launcher should restore or not write until the backend is up |

## Swarm (nine goblins, 2026-09-10)

Five read-only goblins (copy and positioning, design and taste, hostility in forms and errors, transitions and route states, machine surfaces) and four behaviour goblins (buyer over the CLI, hostile agent over HTTP and MCP, a human in a browser at 375/768/1440, a provider walking publish → listed → Calls and earnings) produced 80 findings, consolidated with root-cause groups in `docs/workflow/well-7-swarm-triage.md`. Fixed in this PR from the swarm: stacked brand marks on operator pages (the rail now names the mode only); `ae supply --help` missing `calls`; provider `earnings`/`tools`/`connections` reads returning `503 source_unavailable` because three Convex validators rejected the tracing field the server passes; `/owner/offerings/new` crashing SSR under the local Clerk bypass because it called a Clerk hook unconditionally. Two decisions are Joel's (accent colour authority; sandbox-vs-production visibility in describe). The rest is filed to M2–M8 by owner module.

## Standing contract (2026-09-11)

`docs/architecture/stable-application-definition.md` is now the standing four-axis contract (Source, Behaviour, Transitions, IA) for the app; new drift gets checked against it rather than a fresh audit. M2 (settings that act) is resolved by deletion of the redirect routes, with connections and earnings living on the Operations landing rather than as separate nested pages. Triage items closed by this work: W7-001, W7-002, W7-003, W7-004, W7-005, W7-006, W7-007, W7-008, W7-010, W7-011, W7-012, W7-062 (resolved as a DESIGN.md fix, not a colour change).

## Follow-ons

- U9 `/plan-design-review` on the unified shell, then the polish tasks it names (the swarm's design groups G6 and G13 are its input).
- Launcher: align `LOCAL_STARTUP_TIMEOUT_MS` with the backend allowance; do not rewrite `.env.local` before the backend is up.
- M2 settings that act (PR 2) per the plan.
