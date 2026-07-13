# IA & Behavioral Foundations

**Created:** 2026-07-13 · **Status:** research synthesis → candidate authority for design-system work
**Grounding:** 4 parallel codebase audits (Astryx primitives/tokens, chat/multi-turn surfaces, routes/layout, interaction contracts). Every rule below is derived from current source, cited by file. Aspirational items are marked.
**Supersedes:** `.planning/archive/FRONTEND-DESIGN-FRAMEWORK.md` (archived 2026-07-13) §Foundation choices where it names shadcn/ui — the runtime is `@astryxdesign/core` + `theme-neutral`; zero live shadcn imports exist (only the scanner's quarantine path in `src/lib/ui/contract-scans.ts:706`).

---

## 1. Benchmark framing — how Uber / Airbnb / Stripe would build this

Adopt the **qualities**, not the brands:

| Benchmark | Quality to steal | AE application |
|---|---|---|
| **Uber** | Live/terminal status clarity — you always know if the car is coming, arrived, or cancelled, and what to do next | Every turn/inquiry/request has a durable semantic state with one primary recovery action. No "streaming" as a catch-all state. |
| **Airbnb** | Progressive clarification & comparison — narrow the request through structured questions, then compare bounded options | Customer Request's `needs_information → ready_to_compare → options_ready` projection is the right skeleton; make it the shared multi-turn grammar. |
| **Stripe** | Object identity, idempotent action boundaries, explicit authorization scope, receipts, reconstructable history | Every consequential action = proposal → readback → explicit confirm → pending lock → receipt with correlation ID. The `$slug/inquiry` receipt is the current gold standard. |

---

## 2. The current system in one paragraph

Astryx Core (StyleX, React 19) owns behavior/accessibility; `neutralTheme` owns tokens; a Tailwind 4 bridge projects the same tokens into layout utilities; AE overrides neutral with a eucalyptus palette + its own motion vocabulary in `globals.css`; `tokens.css` is a retiring legacy shim still consumed by `base.css`. Two shells (`AePublicShell`, `AeOperatorShell`) over one 64-file TanStack route tree. Three separate conversational architectures exist: SSE answer chat (`AeChat`), Customer Request workspace (`/engine`), and inquiry threads. Enforcement = 8-regex `test:ui-contract` + strong copy-claim scanners; `tests/ui` is empty.

---

## 3. IA rules (locked candidates)

**IA-1. Four route classes, exactly one per human route:** public discovery · private-link record (`/i/:threadId?k=`) · owner activation (`/claim`) · authenticated operator (`/_operator/*`). Never call all shell-rendered pages "public."

**IA-2. One route map drives everything.** Top nav, command palette, footer, sitemap, breadcrumbs, operator nav must derive from a single source. Current violations: public nav links `/developers/discovery` + `/admin/runs` as if public (`AePublicShell.tsx:104-120`); operator nav advertises 7 nonexistent routes (`navigation.ts:41-98`); command palette isn't mounted and disagrees with visible nav.

**IA-3. One front door for requests.** `/engine` is primary; all "Ask" links, follow-up suggestions, and the legacy `/q/:answerId → /?q=` redirect must resolve to a route that actually consumes the query. Today `/` ignores `q` (`index.tsx`).

**IA-4. Machine discovery is a sibling IA**, not footer clutter: `SKILL.md`, `llms.txt`, UCP, WBA, catalog APIs get a labelled "For agents" gateway whose access expectations match the destination.

**IA-5. Sitemap = product-state decision.** Index only canonical, public, loadable pages. Today it indexes auth-gated `/claim` and omits `/engine` (`discovery-files.ts:96-113`).

**IA-6. Pick a skeleton by task, not aesthetics:**
- editorial/trust → `AePublicShell + AePageHeader + max-w-5xl` section rail (about/help/privacy/terms already conform)
- focused form / private record → header + 3xl–6xl single column
- catalog → Astryx `Layout` + auto-fit grid (registry)
- listing/detail → 7xl main + sticky action rail at `lg` (`AeProviderListingPage`)
- conversation → immersive shell (`h-dvh`, pinned footer)
- operator → `AeOperatorShell`, chrome shell-owned, content page-owned

**IA-7. Width ladder (named, deliberate):** 3xl focused/error · 5xl editorial · 6xl standard public · 7xl data/detail · 1280 catalog. Gutters `px-4 md:px-6`. Rhythm: 12 between editorial sections, 6 between page blocks, 4 inside cards.

**IA-8. Routes stay thin.** Route owns loader/auth/search-params/SEO; deep component owns composition. `/engine`, `/t/:threadId`, `/:slug` are the models.

**IA-9. Action rails contain decisions, not duplicate content.** Main column = facts/evidence; rail = next action, assistant affordance, correction path.

---

## 4. Conversational & multi-turn behavioral rules

**CH-1. One canonical turn lifecycle** (today "streaming" carries all semantics):
`draft → submitted → understanding → needs_input | working → proposal | answer_ready → awaiting_confirmation → executing → settled | failed | stopped`
Every rendered state maps to a durable domain state. Persisted `pending`/`error` turns must render (today the transcript filters to `complete` only — failed turns vanish, `AeThreadTranscript.tsx:39-42`).

**CH-2. Three layers in every assistant turn**, never blended:
1. **Answer/proposal** — the conclusion or next decision
2. **Public work record** — sanitized checks, sources, assumptions, limits ("How AE checked this")
3. **Private run evidence** — raw tools/timing, admin-only (`/admin/runs`)
The data boundaries already exist; the IA must name and enforce them.

**CH-3. No private-reasoning theatre.** Show plan, checks, sources, assumptions, uncertainty — never fake chain-of-thought. Keep the "public checks and listed facts, not private reasoning" boundary (`AeResearchProcess.tsx:38-41`).

**CH-4. Render plans only when they help a decision.** Simple lookup → start immediately, compact progress. Ambiguous/expensive/consequential → short editable plan (interpreted need, missing facts, intended checks, action boundary). Today the `plan` SSE event is invisible to users — budgets silently trim artifacts.

**CH-5. Carried context is inspectable and correctable.** Show the smallest current-context summary before follow-ups; let users correct one fact without restarting. Distinguish provenance classes: `asked / understood / assumed / found / authorized` — never one generic chip.

**CH-6. Persist failures as turns** with a stable recovery: Try again · Edit request · Choose another path. Retry must say whether it restarts, resumes, or forks.

**CH-7. One status narrative per scope.** Turn trace while active → compact settled record → session journey only when it adds cross-turn orientation. Never three overlapping "how AE works" components (current risk: work-log trace + settled journey + inquiry-path + saved-context).

**CH-8. Quiet history:** latest turn expanded, older collapsed, last-turn anchor, user-controlled scroll yield, "still streaming below" indicator. (Already implemented — codify, don't regress.)

**CH-9. Every terminal state gets one primary recovery:** rate-limit → retry-after · network → reconnect · invalid input → field correction · no options → edit criteria · permission failure → review scope. Ban generic "unavailable" when the failed operation is known.

**CH-10. Implement or delete `reconnecting`.** The renderer has the state; transport has no producer (`AeGenerativeAnswer.tsx:117-121`). Decorative states are API lies.

**CH-11. Converge the three conversation systems on one projection.** Customer Request duplicates transcript shape, state machine, bubbles, and error handling. Target: one AE conversation-item primitive rendering user text / clarification / work record / proposal / permission request / receipt / error / status, with domain-specific content per surface.

---

## 5. Proposal → confirmation → execution grammar (the Stripe layer)

**AX-1. Proposal card contract:** What AE proposes · Why · Evidence/limits · What will happen · What will NOT happen · Data/recipient scope · explicit actions. Projects identically across chat, Customer Request, inquiry.

**AX-2. Confirmation depth follows consequence, not component type:**
- browsing → link-out review
- bounded data sharing → inline confirmation (Customer Request `/authorization` is the model)
- destructive/irreversible → modal confirm (owner close is the model)
- externally observable send → pending lock + receipt (public inquiry is the model)

**AX-3. Confirmation copy names object + consequence.** "Send this inquiry to X," "Allow AE to share these fields with up to N businesses" — never bare Continue/Confirm.

**AX-4. Refusal is first-class.** Permission requests get symmetric Allow / Don't allow, plus visible scope, status, and revocation where supported. (Backend authorization model is stronger than its UI today.)

**AX-5. Every consequential action pairs with readback.** Before: exact scope. During: pending state preventing duplicates (`aria-busy`, disabled). After: receipt + correlation + recovery path.

**AX-6. Never collapse proposal and execution.** Selecting a provider = context selection; opening the form = review; sending = execution; business response = external confirmation. Keep each boundary explicit.

**AX-7. Boundary copy lives beside the action** ("business confirms timing, quote, availability" next to the submit button and in the receipt), not only in general chrome.

---

## 6. Design-system rules of thumb

**DS-1. Astryx first, composition second, bespoke primitive last** — and document the missing capability when bespoke. Converge `AeCollapsible` with Astryx `Collapsible` (currently two APIs for one interaction).

**DS-2. Tailwind for layout, Astryx for behavior.** flex/grid/gap/responsive = Tailwind; focus/disabled/loading/keyboard/overlay/dialog = Astryx.

**DS-3. Semantic tokens only.** `text-primary`, `bg-surface`, `border-border`, `rounded-md`, `shadow-sm`. Never new `--ae-*` aliases (migration-only shim). Semantic variants for state; categorical colors only for stable categories.

**DS-4. Every interactive wrapper preserves the Astryx state contract:** label, `isDisabled`, `isLoading`/`aria-busy`, keyboard, `:focus-visible`. `AeActionButton` is the positive model. Props must have observable semantics (`AeKicker.marker` is a no-op — delete or implement).

**DS-5. One motion vocabulary.** AE's 120/200/300ms + standard/emphasized easing vs Astryx's fast/medium/slow are competing names for the same tiers — pick one, expose via theme bridge, ban literal durations in components (`AeCollapsible` has hardcoded 180/200ms).

**DS-6. Reduced motion = semantic immediacy.** `motion-safe:` for decorative transforms; JS/Motion/RAF/timer-driven behavior needs an explicit `useReducedMotion` branch reaching final state instantly. `AeCorrectionWidget`'s 520ms redirect timer is the current violation.

**DS-7. Status = text + shape/position + optional color, never color alone.** Centralize in `status-presentation.ts` (label, compact, tone, audience, publicness, recovery, disabled reason). `AeStatusBadge` is the model. Fix: `AeToaster` flattens success/warning/info to one severity.

**DS-8. One timestamp component:** `<time dateTime={iso}>` + `format-time.ts` + `data-numeric` tabular mono. Ban route-local `Intl.DateTimeFormat` (violation: `i.$threadId.tsx:175`).

**DS-9. Monotonic radius ladder** `inner < element < container < page < full`; fix the `rounded-2xl/3xl/4xl → 4px` legacy remap.

**DS-10. Name the theme honestly.** Effective theme = "AE eucalyptus overrides on Astryx neutral," silently applied under `[data-astryx-theme="neutral"]`. Promote to a defined AE theme extending neutral.

**DS-11. Dark mode is not supported until root `Theme` mode switches.** The legacy `data-ae-surface='register'` variable block is not Astryx dark mode.

**DS-12. Forms:** `FormLayout`, field-local errors + `aria-invalid`/`aria-describedby`, focus-first-invalid (shared helper), disabled+loading submit, summary Banner for server failure. Claim/inquiry/correction are the current patterns.

**DS-13. Six empty-state meanings, distinct copy+actions:** no source data · no filter match · resource not found · access denied · temporarily unavailable · unmet demand. Empty states teach the next valid action.

**DS-14. Loading preserves geometry.** Route skeletons mirror the settled layout (registry/listing are gold standard); errors keep shell + give retry or safe alternate; never print raw `error.message` publicly (violation: `registry.tsx:621-632`).

**DS-15. Touch targets ≥ 44px, mono/tabular for IDs+stamps, `motion-safe` entrances only, illustrative UI says "example/preview" in the component itself.**

---

## 7. Enforcement gaps to close (executable, prioritized)

1. **`tests/ui` is empty** — no public design-system suite exists. Rebuild as a real gate.
2. **`scanUiContract` fixture is orphaned** — the negative fixture never runs, so the 8 regexes are unproven.
3. **`scanPublicLanguage` doesn't clean-scan production** — runs on fixtures + SEO only; promote to a whole-tree gate over enumerated public surfaces.
4. **shadcn quarantine is non-enforcing** — scanner *excludes* `src/components/ui` instead of failing on its existence.
5. **A11y E2E covers 2 routes** — extend to landing, engine, registry, detail, one long form, one operator table, one dialog, one async flow; add axe, reduced-motion emulation, focus-return, 200% zoom.
6. **No route-transition focus contract, no dirty-form navigation blocker** — decide policy explicitly (claim's sessionStorage autosave is recovery, not a guard).

---

## 8. Locked decisions (2026-07-13)

| # | Decision | Call | Consequence |
|---|---|---|---|
| D1 | Front door | **`/` consumes queries** | Home becomes the ask surface; `/engine` workspace folds into `/`. Legacy `?q=` links become correct again. Largest IA rework of the set — home redesign must lead with the composer, marketing narrative moves below/behind it. |
| D2 | Conversation convergence | **One conversation-item primitive** | Build a shared AE conversation item (user text / clarification / work record / proposal / permission request / receipt / error / status); chat, Customer Request, and inquiry become projections of it. |
| D3 | Theme honesty | **Mint `aeTheme` extending neutral** | Promote eucalyptus/radius/shadow/motion overrides from `globals.css` into a defined theme object; unblocks honest dark mode. |
| D4 | Motion vocabulary | **Astryx fast/medium/slow** | Delete AE's parallel `--motion-duration-base/slow` names; components consume library tiers; ban literal ms in components. |
| D5 | Dirty forms | **Autosave short, block consequential** | Keep claim's sessionStorage recovery for short forms; add `useBlocker` + named-loss confirmation for long/consequential forms (authorization, claim). |
| D6 | Framework doc | **Archive; this doc is authority** | `FRONTEND-DESIGN-FRAMEWORK.md` → `.planning/archive/`; its ambition doctrine (system-before-screen, state-is-the-brand, no generic SaaS) carries forward — see §9. |

## 9. Carried-forward ambition doctrine

Retained from the archived framework (still valid, component-base claims corrected to Astryx):

- **System before screen** — routes arrange content, never invent visual language.
- **State is the brand** — the distinctive AE look comes from truthful status/readback, not ornament.
- **Every flourish has a job** — motion/color/layout variation must clarify hierarchy, state, trust, or next action.
- **No generic SaaS** — no three equal cards everywhere, no AI-purple glow, no hero metrics, no fake dashboard art.
- **No future-surface cosplay** — no payments/wallet/hosted-agent/MCP UI before the phase gate.
