# Platform Behaviour Audit — Transitions, Motion, Navigation, Scroll & IA

**Date:** 2026-07-05 · **Method:** source-grounded, read-only (5 parallel auditors across
nav/routing, chat, conversion, operator, and cross-cutting motion/IA) · **Benchmarks:**
Airbnb, YouTube, Linear, Perplexity, Instagram.

## Thesis

In isolation most AE components/views look **OK**. The product feels sub-world-class in the
**seams**: the moment you navigate page→page, cross from one view/state to another, or take an
action. Almost every high-leverage gap is a *systemic* one — a single adapter, a missing layout
route, an un-adopted token scale — not a per-component defect. Fixing the seams is cheap relative
to the felt improvement.

**AE anchors honoured:** `DESIGN.md` (Astryx era: light, *clarifying* motion; warm elevation;
one Eucalyptus accent) — but it has **no motion spec**. `PRODUCT.md` master promise is
"**Ask once. It gets sorted.**" with a *kinetic, momentum* voice — transitions should carry that
momentum, not stall it. WCAG AA + reduced-motion + 44px targets are required and mostly met.

---

## Cross-cutting root causes (ranked by leverage)

These recur across every cluster. Ordered so each fix unlocks the next.

### R1 — Navigation is mostly full-page reloads (the #1 felt problem) · P0
`src/components/astryx/RouterLink.tsx:11-12` — the Astryx `LinkProvider` adapter renders a raw
`<a href>`. So **every** Astryx `Link`/`Button[href]` — TopNav, footer, brand logo, home category
chips, "List it free", claim CTAs, sidebar "New question" — triggers a hard document navigation:
white flash, full re-download, re-hydrate. It also makes `defaultPreload:'intent'` and
`scrollRestoration` (`src/router.tsx:8,10`) **inert** for those links. The core conversion links
are raw `<a>` too: registry card "View details" (`AeProviderCard.tsx:166`), answer→storefront
(`AeGenerativeAnswer.tsx:633`). Meanwhile a minority (chat thread rows `AeThreadSidebar.tsx:106`,
follow-up chips `AeGenerativeAnswer.tsx:685`, turn-stream links) use real TanStack `<Link>` and are
instant — so adjacent clicks behave differently. **This two-tier model is the primary reason
"page-to-page transitions fall apart."**
- **Fix:** make `RouterLink` route internal same-origin hrefs through TanStack `<Link>`/`router.navigate`
  (preventDefault on plain left-click), fall back to `<a>` only for external/hash/mailto. Replace
  the raw-`<a>` conversion links with `<Link>`. One adapter change restores SPA nav + intent
  preload across the whole surface.

### R2 — Shells remount on every navigation (no layout routes) · P0
`AePublicShell`, `AeChat`, and `AeOperatorShell` are each mounted **inside their leaf route**, not
in a shared pathless layout. Navigating tears down and rebuilds the entire AppShell + TopNav/SideNav
+ breadcrumbs instead of persisting the frame and swapping only the content region.
- Operator: each leaf renders its own shell (`owner.status.tsx:70`, `admin.claims.tsx:31`,
  `owner.inquiries.$threadId.tsx:281`) — no `owner.tsx`/`admin.tsx` layout. Sidebar re-animates,
  collapse state resets, internal scroll drops on **every** operator→operator nav.
- **Fix:** hoist each register's shell into a pathless/layout route (`_public`, `_operator`) rendering
  `<Outlet/>`. Unlocks sidenav-collapse persistence, kills the double-remount on pending→settle
  (`AeOperatorRouteStates.tsx:20` renders a *second* full shell), and enables real cross-view
  transition.

### R3 — No route-transition affordance · P0/P1
`src/router.tsx:6-11` has no `defaultPendingComponent`, no top progress bar (YouTube-style), and no
`defaultViewTransition` (grep for `startViewTransition` is clean). Per-route pending exists only on
`registry` and the operator cluster; the **busiest public transitions have none**:
`/$slug` (`$slug.tsx:24-63`), `/$slug/inquiry`, `/t/$threadId`, `/claim`, `/claim/success` →
blank flash / dead time. Once R1 makes these real SPA transitions, the previous page will freeze
then hard-swap unless pending UI exists.
- **Fix:** add `defaultPendingComponent` (thin top progress bar + tuned `defaultPendingMs`) and
  `defaultViewTransition: true` (auto-honours reduced-motion) for a calm cross-fade; add a
  `pendingComponent`/`errorComponent` to `/$slug` mirroring `registry`'s pattern.

### R4 — Motion is un-tokenized (a scale exists but is unused) · P1
AE **already has** a motion token scale (`--ae-duration-*`, `--ae-ease-*`, `--ae-public-*`) in
`src/styles/tokens.css:191-222`, but ~no component uses it. Motion is ad-hoc Tailwind: **5 durations**
(150/200/300/500/700ms), **3 easings**, **2 slide distances**, **4 delays**, **2 hover-lift
magnitudes** (`-translate-y-0.5` vs `-1`), and essentially **no press feedback** (one
`active:scale` in the whole app, `AeGenerativeAnswer.tsx:686`). The home hero settles in ~1s
(700ms + 300 delay) — far slower than Linear/Perplexity's ≤250ms. `DESIGN.md` has a "feel"
paragraph but no motion section. Note `tokens.css` is a **legacy shim being retired** — the
destination is an Astryx-aligned motion contract in `globals.css @layer astryx-theme` (where the
radius `--radius-inner/element/container/page` and `--shadow-low` scales already live), not the
`--ae-*` tokens.
- **Fix:** define **3 durations + 2 easings + 1 lift + 1 press** in the Astryx theme layer, expose
  via `@theme` so components write `duration-base ease-brand`, retire 500/700ms, one reveal
  distance, one hover lift, add `motion-safe:active:scale-[0.98]` to interactive primitives. Add a
  **Motion section to `DESIGN.md`** so this is authoritative.

### R5 — Chat settle-boundary jank · P0/P1
The streaming reveal is now calm (prior work), but the **settle** moment stacks several
simultaneous height changes against a fixed-timeout scroll settler:
- Landing→thread is a **triple hard remount**: `index.tsx:55` swaps HomeLanding→AeChat (accent hero
  + receipt vanish, composer jumps centre→bottom), then `AeChat.tsx:241-249` route-swaps `/`→`/t/:id`
  remounting the whole subtree from the loader projection.
- On settle, `clearLiveTurnIfSettled` runs sync but `refreshProjection` is async
  (`AeChat.tsx:253-259`) → the just-streamed turn **unmounts then re-mounts** (`live-…`→`turnId`
  keys, `AeThreadTranscript.tsx:44-52,78-80`) and every `REVEAL_ENTER` re-fires.
- The research trace collapses in **one frame** (`AeCollapsible` returns null when closed,
  `AeCollapsible.tsx:90-97`) while the proof spine fades in, racing the rAF+180ms settler
  (`AeThreadScroller.tsx:96-124`).
- Submitting a follow-up **instantly collapses the answer you're reading**
  (`AeThreadTranscript.tsx:44`).
- **Fix:** optimistically fold the settled live turn into transcript state (identity/position
  stable; treat `refreshProjection` as reconciliation); keep the previous turn expanded while the
  next streams; animate collapsible max-height or sequence collapse→measure→anchor→reveal in a
  layout effect.

### R6 — CLS / scroll hygiene · P1
- **No `scrollbar-gutter` anywhere** (grep: 0 matches) → every centred `max-w-*` page shifts when
  the scrollbar appears/disappears on route change. Fix: `scrollbar-gutter: stable both-edges` on
  `html` (`base.css:~10`).
- Pending skeletons don't match loaded layout: `RegistryLoading` is 6× single-column `h-40`
  (`registry.tsx:407`) vs a multi-column image-card grid → visible reflow on resolve. Fix: skeleton
  mirrors real chrome (header + search card + responsive aspect-video card grid).
- Hydration gates flash: inquiry fields `isDisabled` until hydrated; `/claim` replaces the whole
  form with "Preparing claim form." (`claim.tsx:~285`) — full-height swap. Fix: progressive
  enhancement / reserve height.
- Internal-viewport scroll isn't restored on back/forward (chat scroller + immersive home are not
  the window scroller; `AePublicShell.tsx:88` `h-dvh overflow-hidden`). Fix: persist/restore
  `viewport.scrollTop` per threadId.

### R7 — IA / wayfinding gaps · P1
- **Thread `/t/:id` is a nav dead-end** — no TopNav, no brand/home link, no breadcrumb; only escape
  is the thread sidebar (hidden on mobile) or the empty-state button (`AeThreadHeader.tsx`,
  `AeChat.tsx:299-383`). Land on a shared thread → cannot reach registry/home.
- **Breadcrumbs vanish on operator detail pages** — detail routes pass the *list* path as
  `currentPath` (`owner.inquiries.$threadId.tsx:281`, etc.) so `resolveOperatorListCrumb` returns
  undefined → `breadcrumbs=[]`. Owner detail (compact, no sidebar) then has **zero** wayfinding.
  `owner.billing.receipts.$receiptId.tsx:39` passes the real path and works — proof the others are
  simply wrong.
- **No mobile navigation** in chat (`AeThreadSidebar` + toggle both `hidden lg:*`) or operator
  (`hidden md:*`, no `AppShell mobileNav`). Recent questions, model selector, "New question",
  and the whole admin sidenav are unreachable on phones.
- **Three nav paradigms** (public top-nav / operator side-nav / chat none) with no shared
  brand/home affordance → wayfinding resets between registers.
- **Fix:** shared brand/home affordance on every shell (esp. `AeThreadHeader`); pass real
  `currentPath` on operator detail; add mobile drawers; one focus-visible ring
  (kill `suggestion.tsx:88` override; retune `--ae-focus-ring` from amber → Eucalyptus,
  `tokens.css:48`).

---

## Prioritized fix waves

**Wave 1 — restore SPA feel (highest leverage, small surface):**
1. R1 `RouterLink` → router-aware + convert the raw-`<a>` conversion links (`AeProviderCard.tsx:166`,
   `AeGenerativeAnswer.tsx:633`, sidebar "New question" `AeThreadSidebar.tsx:38`).
2. R3 add `/$slug` pending/error + a root `defaultPendingComponent` (progress bar).

**Wave 2 — kill the flashes/jank:**
3. R2 hoist `_public` + `_operator` layout routes (persistent shells).
4. R5 optimistic settle fold + keep-prev-expanded in chat.
5. R6 `scrollbar-gutter: stable` + skeleton parity (`RegistryLoading`).

**Wave 3 — cohesion & wayfinding:**
6. R4 motion-token contract + `DESIGN.md` Motion section; retire 500/700ms; one lift; add press.
7. R7 thread home escape; operator detail `currentPath`; mobile drawers; unify focus ring.
8. R3 `defaultViewTransition: true` (once shells persist, cross-fade lands cleanly).

---

## Appendix — per-cluster findings (path:line · severity · fix)

### A. Navigation & routing
| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| P0 | LinkProvider adapter is raw `<a>` → global full reloads | `RouterLink.tsx:11-12`, `__root.tsx:57` | route internal hrefs via `<Link>`; `<a>` only for external |
| P0 | Core discovery→storefront links raw `<a>` | `AeProviderCard.tsx:166`, `AeGenerativeAnswer.tsx:633` | use `<Link to="/$slug" …>` (mirror chip `:685`) |
| P0 | `/$slug` has no pending/error | `$slug.tsx:24-63` | add pending (skeleton) + error (shell + EmptyState) |
| P1 | No root pending/progress/view-transition | `router.tsx:6-11` | `defaultPendingComponent` + `defaultViewTransition` |
| P1 | Async public routes blank-flash | `t.$threadId.tsx:26`, `$slug.inquiry.tsx:54`, `claim.tsx:186`, `claim.success.tsx:19` | per-route pending or lean on default |
| P1 | Shell remounts between registers | shells mounted in leaves | layout routes |
| P1 | Sidebar "New question" hard-reloads amid SPA rows | `AeThreadSidebar.tsx:38` vs `:106` | `<Link to="/">` |
| ✓ | Operator in-shell pending/error; `/registry` pending; clean redirects (`q.$answerId`, sign-in sanitised); `AeNotFound` wired | `route-options.ts`, `sign-in.$.tsx:12-21` | do not regress |

### B. Chat transitions & motion
| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| P0 | Landing→thread triple remount, no continuity | `index.tsx:55`, `AeChat.tsx:241-249`, `t.$threadId.tsx:58` | single AeChat across `/`↔`/t/:id` (state-driven) or View Transition |
| P0 | Settle drops+re-fades whole turn | `AeChat.tsx:253-259`, `AeThreadTranscript.tsx:44-52,78-80` | optimistic fold into transcript state |
| P1 | Follow-up submit collapses the answer being read | `AeThreadTranscript.tsx:44` | keep prev turn expanded during next stream |
| P1 | Settle CLS: instant trace collapse + spine insert race settler | `AeCollapsible.tsx:90-97`, `AeThreadScroller.tsx:96-124` | animate max-height / sequence in layout effect |
| P1 | Mobile: sidebar + model selector + New question unreachable | `AeThreadSidebar.tsx:25`, `AeChat.tsx:288` | mobile drawer behind visible toggle |
| P1 | Dead welcome-crossfade machinery + duplicate `id=ae-home-heading` | `AeChat.tsx:108,160-175,368-388`, `AeChatWelcome.tsx:11` | delete unreachable overlay; drop dup id |
| P2 | Collapsed-turn expand instant, no scroll compensation | `AeThreadTurnCollapsed.tsx:20,66-70` | animate + re-anchor |
| P2 | Motion tokens inconsistent (200/300/500/700; CSS 200 vs JS 220) | see R4 | align to token scale |

### C. Discovery → conversion flow
| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| P0 | `/registry` renders `RegistryLibraryCard`, not the polished `AeProviderCardRegistry` (hover-lift/whole-card link) — the good card is dead code | `registry.tsx:298,314` vs `AeProviderCard.tsx:117-172` | delete the dup, render `AeProviderCard variant="registry"` |
| P1 | Client filter/sort disagrees with server pagination + total count | `registry.tsx:96-115,196,398` | push category/sort into search params + server query |
| P1 | "Back to results" hard-codes empty query | `AeProviderListingPage.tsx:363` | carry `q`(+cursor) through card link + back href |
| P1 | `RegistryLoading` skeleton ≠ loaded layout (CLS) | `registry.tsx:407` | skeleton mirrors grid |
| P1 | Inquiry success swaps form→receipt, no scrollIntoView | `$slug.inquiry.tsx:~210,248` | rAF `receiptRef.scrollIntoView` |
| P1 | Listing primary CTA buried last on mobile | `AeProviderListingPage.tsx:107` | `lg:hidden` sticky bottom inquiry bar |
| P1 | `/registry` search is native GET full-nav | `registry.tsx:236` vs `AeRegistrySearchPanel.tsx:26` | `useNavigate`/search params |
| P2 | 3 divergent card hovers; 2 equal CTAs per card; imgs lack width/height | `AeProviderCard.tsx:42,128`, `registry.tsx:344-347,326` | one hover token; demote agent-JSON to text link; add width/height |

### D. Operator shell
| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| P0 | Shell remounts every operator nav (no layout route) | `owner.status.tsx:70`, `admin.claims.tsx:31`, … | layout routes → `<Outlet/>` |
| P0 | owner↔admin density swap = layout CLS (sidebar appears from nothing) | `AeOperatorShell.tsx:~60,87` | persistent frame / reserve column |
| P1 | SideNav collapse never persists | `AeOperatorSidebar.tsx:30` + remount | persist / hoist |
| P1 | No mobile operator nav (drawer + Cmd-K trigger hidden) | `AeOperatorShell.tsx:88`, `AeOperatorCommandMenu.tsx:30` | `AppShell mobileNav` + icon-only trigger |
| P1 | Detail routes hardcode list path → breadcrumbs `[]` (owner detail = zero wayfinding) | `owner.inquiries.$threadId.tsx:281` vs `owner.billing.receipts…$receiptId.tsx:39` | pass real `currentPath`; always render a back affordance |
| P1 | Skip-to-content inert except developers.discovery | `AeOperatorShell.tsx:~65` | default a `mainContentId` |
| P1 | Pending→settle double-remounts shell + "Loading" flash | `AeOperatorRouteStates.tsx:20` | after hoist, pending = content skeleton only |
| P1 | `AeOperatorFilterCard` native GET → full-nav per filter | `AeOperatorFilterCard.tsx:52` | `router.navigate({to,search})` |
| P2 | owner navBadges computed but never shown; sticky `top-20` vs `h-14`; static sort icon; nested scroll cue | `owner.inquiries.tsx:83`, `AeOperatorShell.tsx:159`, `AeOperatorDataTable.tsx:139`, `AeInquiryThreadScroll.tsx:11` | surface badges; token sticky offset; direction chevron; scroll fade cue |

### E. Motion system, IA & heuristics (cross-cutting)
| Sev | Finding | Evidence | Fix |
|---|---|---|---|
| P1 | Motion token scale exists but unused; 5 durations/3 easings/2 lifts/~no press | `tokens.css:191-222`; inventory in R4 | adopt Astryx-layer contract; retire 500/700; add press |
| P1 | No `scrollbar-gutter` → CLS on scroll-surface nav | grep 0 matches; `base.css:~10` | `scrollbar-gutter: stable both-edges` on `html` |
| P1 | Thread `/t/:id` nav dead-end | `AeThreadHeader.tsx`, `AeChat.tsx:299` | brand/home escape in thread header |
| P1 | Two competing focus-visible systems | `base.css:36` vs `suggestion.tsx:88` | delete override; inherit token ring |
| P1 | No systematic press feedback | one `active:scale`, `AeGenerativeAnswer.tsx:686` | `active:scale-[0.98]` on primitives |
| P2 | Focus ring amber, not Eucalyptus (violates one-accent) | `tokens.css:48,275` | retune ring hue |
| P2 | Redundant public entry points (Hick) → 2 destinations from ~6 links | `AePublicShell.tsx:49-77,127`, `index.tsx:126` | one Find + one List |
| P2 | Hover elevation two targets (md vs lg); rounding untokenized; `rounded-full` overused | `AeProviderCard.tsx:41,128`, `DESIGN.md:128-131` | one hover step; map radii to 8/10/14/16; reserve pills |
| P2 | Home hero ~1s settle; registry count-up draws eye over grid | `index.tsx:28,92-147`, `registry.tsx:196` | cap settle ≤300ms; demote count-up |
| ✓ | Reduced-motion is a genuine strength (global kill-switch); images dimensioned | `base.css:68-74`, `registry.tsx:303` | do not regress |

---

## Bottom line

There are **no broken features** — the system is coherent, just un-tokenized and stitched at the
route boundary with hard reloads. The four highest-leverage moves, in order:
**(1) make navigation SPA (RouterLink + conversion links), (2) persist shells via layout routes,
(3) add pending + view-transition affordance, (4) adopt one motion-token contract.** Those four,
none large, convert "OK components" into an application that transitions like Airbnb/Linear.

*Source dossiers (verbatim) from the 5 auditors are preserved in the task transcripts
(`history://NavRouteTransitions`, `ChatTransitions`, `ConversionFlow`, `OperatorShell`,
`MotionIAHeuristics`); the subagent sandbox was read-only so they were synthesised here.*
