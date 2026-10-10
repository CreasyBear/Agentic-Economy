# aecon UI rulebook, 2026-10-10

This is a draft from the rules research: six haiku sweeps, ten deep reads and an opus synthesis. It will be revised against the discovery persona research before it is adopted.

## Verdict
Write one aecon rulebook of numbered, checkable rules and apply it route by route instead of patching papercuts. Linear publishes none of the numbers behind the five decisions, so they stand as your own decisions, backed by Carbon (32px rows, 70ms and 150ms motion) and Arc (-0.01em tracking, 4px grid, shadows only on overlays). The other rules come from Carbon, Arc, Vercel, GOV.UK, NN/g, the MCP spec, Anthropic and clig.dev, and they are enforced by tokens, the existing oxlint gate and one project skill, all using primitives the repo already has.

## Sources to adopt
| Source | What we take | Licence | How we use it |
|---|---|---|---|
| Arc composition, checklist | Page plan, six states, 4px spacing, shadows only on overlays | Commercial; skills free | Installed; audit base |
| Carbon data table, motion | 24/32/40/48px rows, toolbar ≤5, batch bar, sort; 70/150ms | Apache-2.0 | Values into tokens |
| vercel-labs/web-interface-guidelines | Hit targets, loading delay, `⌘ K` format, URL state, inline errors | MIT | Vendor a pinned `command.md` (the skill fetches it live); Arc's sentence case overrides its Title Case |
| Impeccable | 59 deterministic checks (bounce easing, purple gradients, small targets) | Apache-2.0 | `npx impeccable detect --json src/`; skip `install`, which writes hooks |
| emilkowalski/skills | Motion gated by how often an action runs; break-ui worst cases | MIT | Installed; run as sub-passes |
| GOV.UK, NN/g, Polaris, Primer | One thing per page, error copy, task list, recognition over recall | OGL v3, MIT; rest cited | Rules linked to source |
| MCP spec, Anthropic tools post, clig.dev | Text plus JSON, errors that steer, names over IDs, CLI output | Cited; clig CC BY-SA 4.0 | Rules 25 to 29 |

Not adopted:
- baseline-ui contradicts the tracking and shadow rules.
- The Refactoring UI paraphrases have unclear licences.
- The installed `design-taste-frontend` excludes dashboards and tables, so remove it.

## The aecon rulebook
W = workspace only; A = all surfaces; P = public adaptation.

**Density and type**
1. W: 13px text (new `--ae-text-ui`), -0.01em tracking (Arc `--tracking-body`), weights 400/500; two sizes per screen (13px, `--ae-text-title`). P: 16px body.
2. W: 32px rows and controls (Carbon sm, ReUI dense `h-8`); 44px on coarse pointers. P: 40px comparison rows.
3. W: at 1440×900, title, filters and 20+ rows fit without page scroll.

**Surface and colour**
4. A: depth comes from DESIGN.md's three surfaces; no blur (ReUI sticky header included).
5. A: no in-flow shadows; edges are an 8% foreground hairline (8% white in dark); overlays keep one shadow (Arc).
6. A: hover changes the surface value, not the elevation (amends the DESIGN.md card lift).
7. A: Forest only on the selected row, keyboard focus and inline links. The primary button is Charcoal (brand kit p.15), one per screen. Everything else is grey.

**Status and money**
8. A: status is a 16px icon (semantic colour allowed) plus a grey label; no pills.
9. A: money goes only through `formatCurrencyAmount`. Change its output from "AUD 0.012" and an em dash (exact-amount.ts:183) to "A$0.012" and `--`. Mono, tabular figures. USDC and atomic units appear only in receipts and JSON.
10. A: one price per view; money buttons state the total ("Pay A$5.55") under the line items (Stripe Checkout).
11. A: time only through `format-time.ts`, in the account timezone. Show names, not refs (refs sit behind copy buttons).

**Motion and input**
12. A: hover 80ms, colour only; transitions ≤150ms, exits faster, transform and opacity only, reduced-motion branch. No bounce (set Arc's `snappy`/`morph` to 0; retire the 260ms ink wash). Palette, shortcuts and row focus don't animate (Emil).
13. W: every action is a ⌘K item (shadcn `Command`, cmdk) showing its shortcut, repeated in tooltips: C create, ⌘K palette, / search, ? help. react-hotkeys-hook 5 replaces the hand-rolled handlers.

**Alignment and grid**
14. A: 4px grid (`--space-*`): 16px within groups, 24px between regions (Arc); 16px icons centred on text.
15. A: labels and identifiers left, numbers and their headers right (Carbon); nothing centred.

**Copy and states**
16. A: sentence case; no em dashes, eyebrows or mono uppercase (Arc, overriding DESIGN.md).
17. A: one vocabulary table (`src/content/reason-copy.ts`) for web, CLI and MCP. Ban raw enums and the words "admitted", "assessed", "Routeable", "readback" and "AE".
18. A: one primary action per screen and no duplicate intents. Buttons are a verb plus an object that names the outcome ("Decline", not "Not now").
19. A: errors sit at the cause and state the fix; no "sorry" or "invalid" (GOV.UK).
20. A: every region has a skeleton, an empty state (why, plus one next step), an inline error with retry, and success shown in place. Errors never look empty, async work polls, and titles never contradict bodies.

**Tables**
21. A: one table, `AeRecordTable` (ReUI DataGrid, TanStack Table), compact by default. Remove Arc `sortable-data-table` (52px rows, spring checkbox) from the six admin tables.
22. W: header, toolbar, batch bar and pagination match row height; toolbar ≤5 actions (Carbon).
23. A: sort icon only on the sorted column; 3+ row actions go to overflow; selection swaps the toolbar for a batch bar.
24. A: filters run server-side and live in the URL, never showing a false "none". The empty state sits outside the table; unknown cells show `--`.

**Agent output**
25. MCP success text is one line (outcome, A$ price, excerpt, receipt) plus the serialized structuredContent, which the MCP spec says SHOULD be included. Today it is `${name}: ${kind}.` (mcp-api.ts:230).
26. Errors return `isError`, `title: detail`, the failing field, the fix, a request id and the next valid call. Today they return only the title (contract.ts:292).
27. Names in the text, refs in the JSON, concise by default (Anthropic). At most one `next`. MCP instructions ≤6 lines, with absolute URLs.
28. Money is the exact `{units, exponent, currency}` plus rule 9's string, never "50 × 10^-2 USD" (call.ts:401).
29. The CLI follows clig.dev: readable by default, `--json`, suggests the next command, infers idempotency keys. `ae call --quote <ref>` pays the quoted price.

## Page archetypes
| View | Job | Decision | Primary | Hidden by default | Reference |
|---|---|---|---|---|---|
| Browse `/market` | Find a Tool for my job | Which Tool | Search | Assessment counts, provenance | https://www.airbnb.com |
| Listing `/tools/$toolRef` | Judge fit and cost per call | Use it or not | Use this Tool (prefilled snippet) | Schema, provenance, versions | https://docs.stripe.com/api |
| List/queue `/activity` | Find rows needing me | Which row | Act on focused row; C creates | Finance, exports | https://carbondesignsystem.com/components/data-table/usage/ |
| Record `/calls/$callRef` | Know what happened | Done or next | The single `next` | Refs, evidence | https://primer.style/react/PageLayout/ |
| Money `/owner/credit`, chat approval | Pay knowing the total | Pay or not | Pay A$X | Legal text, treasury, FX | https://docs.stripe.com/payments/checkout |
| Settings `/owner/settings/*` | Change one thing, trust it saved | Per row | Inline save | Advanced; destructive last | https://uiarc.dev/r/skills/arc/composition.md |
| Onboarding `/owner`, `/agent-access` | Agent's first paid call, with receipt | Next step | Next unchecked step | Optional tour; collapses after first receipt | https://design-system.service.gov.uk/components/task-list/ |
| Admin inbox `/admin` | Clear what needs attention | Resolve, assign, snooze | Resolve focused item | Metrics, launcher | https://linear.app/docs/inbox |
| Chat `/t/$threadId` | Result, spend approved in context | Approve this call | Approve inside the asking message | Receipts inside outcome card | https://ai-sdk.dev/elements |

## Mental-load rules per view
- **Plan first.** Put `job` and `primaryAction` in each route's `staticData` (src/router.tsx:71), following Arc's page plan. Two jobs means two pages.
- **Prefill what the system knows:** amount, A$5/day budget, the key in snippets, and the object type read from the ref prefix. This is recognition over recall (NN/g).
- **Do the arithmetic:** totals, earnings, remaining budget.
- **Lists open on what needs the user.** If nothing does, say so and link to the full list.
- **Every outcome ends in one next action.**
- **Onboarding is three steps with progress:**
  1. Connect the agent.
  2. Accept the budget.
  3. Make a first paid call and get a receipt.

  Give value before payment (sandbox credit, a free keyless call). Offer the upgrade right after the first receipt. Keep the tour optional.
- **Over 20 flat items:** split into 3 to 5 groups.
- **Agents:** summary first, one `next`, and errors that name the field (rules 25 to 29).

## How the rules kill the audit themes
| Theme | Rules |
|---|---|
| Internal jargon as copy | 11, 16, 17, 27 |
| Money shown 3 to 4 ways | 9, 10, 11, 28 |
| Pages doing three jobs | Page plan, 18, Hidden column |
| Duplicated CTAs | 7, 18 |
| States that lie or dead-end | 20, 24 |
| Product makes users do its job | Prefill, arithmetic, 24, 29 |
| Tables breaking simple rules | 2, 15, 21 to 24 |
| Hostile agent output | 25 to 29 |

## Enforcement
1. **Tokens (`globals.css`).** Add the 13px, 32px, hairline and 80/120/150ms tokens. Set `--shadow-*: initial`, then declare only the overlay shadow. Remove Arc's resting and raised shadows and its springs, so the 46 files that use Arc motion comply without edits.
2. **Lint, on the existing `npm run lint`.**
   - oxlint 1.80 `no-restricted-properties` bans `Intl.NumberFormat`, `Intl.DateTimeFormat` and `toLocaleString` outside the two formatters.
   - `jsPlugins` loads eslint-plugin-better-tailwindcss 4.9 (MIT) to ban unregistered classes, `shadow-*`, `transition-all`, arbitrary values and `uppercase`. Confirm the plugin loads before relying on it.
   - No new test suites (CLAUDE.md rule 10).
3. **One project skill, `.claude/skills/aecon-rulebook/`,** holding the rule IDs, grep sweeps and the pinned Vercel file.
   - `/aecon-audit <route>` reports findings by rule ID and file:line.
   - `/aecon-restyle <route>` fixes one route per pass, proven by real use.
   - Sub-passes: better-writing, cognitive-load-auditor, number-formatting, review-animations, break-ui, Impeccable.
4. **Skip ux-engine** (pravinbanjade/ux-engine, MIT, 0 stars, last pushed 2026-09-26).
   - Its README says `/ux-restyle` only swaps literals for existing tokens of equal value, so it cannot apply the five decisions.
   - It ships `.mjs` files, which CLAUDE.md rule 9 forbids.
   - Nothing links it to designmotionhq's `/restyle`.
   - Its UX-001 to UX-123 failure modes are still worth borrowing as a checklist.
5. **Amend DESIGN.md** for rules 5, 6, 12 and 16, then restyle in the audit's wave order, money first.

## Open questions for the founder
1. Should the primary button be Charcoal (brand kit p.15, assumed here) or Forest (the Linear decision)?
2. Does "twice on one screen" mean density (rule 3) or two type sizes (rule 1)? Both are adopted for now.
3. Should overlays keep one shadow (Arc) or have none?
4. Should DESIGN.md's legal eyebrow and mono uppercase actions be retired (rule 16)?

## Defaults applied while Joel is away (change any of these)
1. **Primary button colour.** Use Forest, not Charcoal. Saved brand decision: "Forest green primary per brand kit PDF", which also matches Linear's single accent. Forest therefore appears on the primary button, the selected row, keyboard focus and inline links, and nowhere else.
2. **"Twice on one screen".** Take it as two type sizes per screen (rule 1) and keep the no-scroll density target (rule 3).
3. **Overlays.** Keep one overlay shadow (Arc). No other shadows.
4. **Legal eyebrow and mono uppercase actions.** Retire both (Arc rules over DESIGN.md).
