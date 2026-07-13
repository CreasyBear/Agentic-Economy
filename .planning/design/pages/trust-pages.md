# Trust pages: shared editorial pattern

This document covers `/about`, `/help`, `/privacy`, and `/terms`. Each route uses one editorial skeleton and differs only where the page job requires it. Customer-facing text uses the customer vocabulary in `PRODUCT.md`; internal mechanics appear only as implementation references.

## Shared editorial skeleton

All four routes use the IA-6 trust skeleton: `AePublicShell` → `AePageHeader` → one `<main>` section rail. The rail is `mx-auto w-full max-w-5xl px-4 pb-20 md:px-6`, with `gap-12` between editorial sections, `gap-6` between page blocks, and `gap-4` inside bounded content. Body prose is capped at `max-w-[72ch]`. Sections are separated by whitespace or a 1px semantic border, not by repeated cards. Tailwind owns layout; Astryx owns behavior.

The color strategy is restrained: warm canvas and white surface establish the page, ink and slate carry hierarchy, and eucalyptus appears only on the current selection or primary action. No route-local palette is introduced.

### Shared desktop wireframe, 1440px viewport

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ AePublicShell: logo             Ask  Businesses  Claim your business page    │ <!-- stupid-shit: S3 -->
├──────────────────────────────────────────────────────────────────────────────┤
│                         max-w-6xl AePageHeader                               │
│  24px gutter   EYEBROW                                                       │
│                Page title                                                    │
│                Description, max 72ch                           [action?]      │
├──────────────────────────────────────────────────────────────────────────────┤
│                 max-w-5xl editorial rail, 24px gutter                        │
│  Primary decision layer                                                      │
│  ──────────────────────────────────────────────────────────────────────────  │
│  Supporting narrative / task links                                           │
│  ──────────────────────────────────────────────────────────────────────────  │
│  Deeper inspection layer, often Astryx Collapsible                           │
│  ──────────────────────────────────────────────────────────────────────────  │
│  One contextual exit row                                      [next action]  │
├──────────────────────────────────────────────────────────────────────────────┤
│ AePublicShell footer, route-registry links                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Shared mobile wireframe, 375px viewport

```text
┌───────────────────────────────┐
│ AePublicShell header      [≡] │
├───────────────────────────────┤
│ 16px gutter                   │
│ EYEBROW                       │
│ Page title                    │
│ Description                   │
├───────────────────────────────┤
│ Primary decision layer        │
│                               │
│ ───────────────────────────── │
│ Supporting section            │
│                               │
│ ───────────────────────────── │
│ [Disclosure             ▾]    │
│                               │
│ [Primary action, full width]  │
│ [Secondary link, full width]  │
├───────────────────────────────┤
│ Footer                        │
└───────────────────────────────┘
```

### Shared state, interaction, and accessibility contract

- **Loading:** static editorial copy renders server-first. If route-loader content is later introduced, the settled heading and section geometry render as Astryx `Skeleton` blocks; navigation and footer remain usable. No centered spinner.
- **Empty:** editorial content has no normal empty state. A missing loader-backed section is `temporarily unavailable` under DS-13 and is omitted only when it is supplementary; if it owns the page job, show `AeEmptyState` in the rail with a task-specific alternate path.
- **Error:** preserve `AePublicShell`, page title, and known static guidance. Use Astryx `Banner` for a recoverable section failure, with `Try again` only when retry exists. Never print raw errors.
- **Streaming:** none. These pages do not simulate activity.
- **Zero JS / SEO:** headings, prose, links, and legal text are server-rendered and usable without JavaScript. Only disclosures lose expand/collapse enhancement; their content remains available in semantic HTML or an open server fallback. `/about` and `/help` are canonical and indexable. `/privacy` and `/terms` emit `robots: noindex` per their route delta.
- **Interaction states:** every `Button`, `Link`, `TabList`, or `Collapsible` uses Astryx default, hover, focus-visible, active, disabled, and loading behavior as applicable. No route-local interactive wrapper.
- **Keyboard and focus:** DOM order follows reading order. Skip link lands on `<main>`. Route transition focuses the `h1`. Collapsible triggers are buttons with `aria-expanded` and `aria-controls`; focus never moves merely because a disclosure opens.
- **Responsive:** no horizontal rail. Two-column editorial splits become one column below `md`. Actions stack at ≤375px with 44px minimum targets. Body text stays within 65–75ch. No horizontal overflow at 320px or 200% zoom.
- **Announcements:** static navigation relies on route-title focus, not a live region. Disclosure state is conveyed by its control. A loader retry success may announce one concise polite update; errors use one `role="alert"`. Avoid duplicate live regions.
- **Reduced motion:** these editorial pages need no entrance animation. If an existing Astryx disclosure animates, it uses the Astryx tier and reaches the final state immediately under reduced motion.

## Per-page delta summary

| Route | One job | Primary layer | Deeper layer | Primary exit | Indexing |
|---|---|---|---|---|---|
| `/about` | Explain the customer promise without exposing routing machinery as the product | Need → recommendation/options → contact | Clear limits and who confirms what | `Start with a need` | index |
| `/help` | Route a person to the right next task and answer boundary questions plainly | Task list | Task-oriented questions | Contextual per-task action | index |
| `/privacy` | Explain what data is used, shared, retained, and how to request correction or removal | Moment-by-moment data summary | Plain-language details and retention boundaries | `Request a correction or removal` | noindex |
| `/terms` | State the usable agreement and product boundaries in plain language | Short plain-language summary | Full sections in Astryx `Collapsible` | `Start with a need` | noindex |

# /about — About Agentic Economy

## Register & scene

**Register:** brand, because the page explains the public promise rather than completing a transaction. **Scene:** an Australian customer reads the page on a phone in ordinary daylight after an assistant suggested a business, looking for a quick reason to trust the next step; this requires the light warm-canvas scene and restrained eucalyptus action emphasis.

## Job & IA position

**One job:** explain the useful customer consequence, “Your agent knows who to call,” while keeping the routing engine backstage as required by `PRODUCT.md` rule 1. **Route class:** public discovery (IA-1). **Entry points:** public footer, direct URL, and contextual “About” link. **Exits:** `/` to start with a need, `/registry` to browse businesses, and `/for-agents` from the clearly labelled `For agents` secondary link; public surfaces never link directly to `/developers/discovery`. **Blueprint:** IA-6 editorial/trust skeleton; IA-7 `5xl` rail; LAW-7 two disclosure levels; IA-8 thin route.

## Layout

Use the shared editorial skeleton exactly. Desktop primary narrative is an asymmetric `0.8fr / 1.2fr` split: a concise promise statement beside a linear “Ask, choose, follow” narrative, not a card grid. Mobile follows the shared 375px wireframe with the promise first, then the three steps as numbered sections.

```text
DESKTOP MAIN, max-w-5xl
┌──────────────────────┬──────────────────────────────────────────┐
│ Your agent knows     │ 1 Ask in your own words                  │
│ who to call.         │ 2 Review recommendation and options      │
│ short promise        │ 3 Confirm exact next step, then follow   │
└──────────────────────┴──────────────────────────────────────────┘
──────────────
What AE helps with, linear prose + business-page example labelled Preview
──────────────
What stays with the business [Collapsible details]
──────────────
Start with a need                                      [Primary]
```

```text
MOBILE, 375px
┌───────────────────────────────┐
│ Your agent knows who to call. │
│ Promise paragraph             │
│ 1 Ask                         │
│ 2 Choose                      │
│ 3 Follow                      │
│ ───────────────────────────── │
│ What AE helps with            │
│ [Example preview]             │
│ [What stays with business ▾]  │
│ [Start with a need]           │
│ [Browse businesses]           │
└───────────────────────────────┘
```

## Section anatomy

1. **Promise narrative:** customer promise, ordinary-language progression, and no internal architecture nouns. Data source: route-authored static copy governed by `PRODUCT.md`. Components: `AePageHeader`, Astryx `Heading`, `Text`, semantic ordered list.
2. **Useful consequence:** recommendation, alternatives, price/timing boundaries, and record continuity described as outcomes, not protocols. Any illustrative answer must be visibly labelled `Preview` and must not imply live availability (DS-15). Data source: static editorial model. Components: semantic `<section>`, `Badge` for Preview, existing AE preview composition only if its copy passes current authority.
3. **What AE does and does not prove:** direct prose stating AE helps a person find and compare published business information and prepare contact; the business confirms price, timing, availability, and whether it can help. Data source: static authority copy. Components: Astryx `Collapsible`, `Text`; no red danger card for ordinary boundaries.
4. **Exit row:** “Start with what you need” plus browse alternative. Data source: route registry. Components: Astryx `Button`, AE router link.

## States

Apply the shared state contract. The page has no data-empty state. If the optional preview cannot load, DS-13 meaning is `temporarily unavailable`; retain the promise narrative and replace only the preview with “The example is unavailable. You can still start with your need.” plus `Start with a need`. No streaming.

## Interactions

Primary action: **Start with a need**, a link-out review depth under AX-2 because it only navigates to `/`. State contract: default/hover/focus/active from Astryx; no pending or confirmation. The browse alternative is secondary. The “What stays with the business” disclosure is closed by default after the first paragraph but its boundary sentence remains visible outside it. Keyboard and focus follow the shared contract.

## Copy voice

- Headline: **Your agent knows who to call.**
- Supporting line: **Describe what you need. Review a recommendation, clear options, price and timing where known, then choose the next step.**
- Boundary copy beside the exit: **A business confirms its price, timing, availability, and whether it can help.**
- Key labels: `Ask in your own words`, `Review your options`, `Keep the record`, `Start with a need`, `Browse businesses`.
- Never lead with route graph, binding, provider infrastructure, protocol, marketplace, lead, inquiry workflow, autonomous action, booking, payment, or guaranteed outcome.

## Responsive

Use the shared breakpoint contract. The narrative split collapses at `md`; numbered steps remain a single reading sequence rather than equal cards. At ≤375px the primary and secondary exits are full-width, with the primary last in visual and DOM order only when that preserves natural reading after the boundary statement.

## Accessibility

`<main id="main-content">` contains one `h1`; each narrative section has an `h2`. The ordered progression is an `<ol>`. The preview is labelled in text, not color. Decorative icons are hidden. No live region. Collapsible behavior, route focus, reduced motion, zoom, and target sizes follow the shared contract.

## Rule compliance

| Rule | Satisfaction |
|---|---|
| LAW-4 | No availability, price, or outcome certainty is borrowed from a later business decision. |
| LAW-7 | Promise and steps are primary; exact limits are one labelled disclosure deeper. |
| IA-1 | Classified public discovery. |
| IA-2 | Navigation and exits resolve through the shared route registry. |
| IA-6, IA-7 | Shared `AePublicShell` + `AePageHeader` + `max-w-5xl`, named gutters/rhythm. |
| IA-8 | Route supplies SEO/static model only; composition stays reusable. |
| AX-2 | Link-out navigation uses no unnecessary confirmation. |
| AX-7 | Business-confirmation boundary is beside the primary exit. |
| DS-1, DS-2 | Astryx behavior; Tailwind layout only. |
| DS-3, DS-10, DS-11 | Semantic aeTheme tokens; no route palette or unsupported dark-mode claim. |
| DS-6, DS-14, DS-15 | Reduced motion, geometry-preserving optional-preview fallback, truthful preview label. |

## Anti-slop check

No side-stripe, gradient text, glass, hero-metric template, identical card grid, or modal-first pattern. The design uses linear editorial rhythm rather than the category reflex of a centered startup manifesto with capability cards. The routing engine stays backstage; no protocol theatre or marketing sprawl.

# /help — Help

## Register & scene

**Register:** product. **Scene:** a customer or business representative opens Help on a phone during a task, in normal office or outdoor light, wanting the next valid action in under a minute; the light restrained scene keeps task labels dominant and decoration absent.

## Job & IA position

**One job:** route the reader to the correct next task and answer boundary questions plainly. **Route class:** public discovery (IA-1). **Entry points:** shell/footer Help link, error recovery links, direct URL. **Exits:** `/`, `/registry`, `/claim`, `/privacy/remove-business`, `/privacy`, and `/terms`, each tied to a named task. **Blueprint:** IA-6 editorial/trust; LAW-7 task list plus deeper answers; LAW-8/DS-13 for unavailable destinations; IA-8 thin route.

## Layout

Use the shared skeleton. The first section is a vertical task index, not a promotional card grid. On desktop, task name and one-sentence description occupy the left two-thirds and the named action sits right. On mobile each row stacks description then action.

```text
DESKTOP MAIN
┌──────────────────────────────────────────────────────────────────────┐
│ I need to…                                                          │
│ Find a business          Describe a need or browse       [Start]    │
│ Claim a business page    Publish verified details        [Claim]    │
│ Correct/remove a page    Send the page and reason         [Open]     │
│ Understand my details    See use and sharing              [Privacy]  │
└──────────────────────────────────────────────────────────────────────┘
Boundary questions
[What does AE confirm? ▾] [What is shared? ▾] [No reply? ▾]
```

```text
MOBILE, 375px
┌───────────────────────────────┐
│ What do you need to do?       │
│ Find a business               │
│ one-line explanation          │
│ [Start with a need]           │
│ ───────────────────────────── │
│ Claim a business page         │
│ [Claim your business page]    │
│ …                             │
│ Boundary questions            │
│ [What does AE confirm? ▾]     │
└───────────────────────────────┘
```

## Section anatomy

1. **Task index:** find, claim, correct/remove, privacy. Data source: route/action registry, not a duplicated hard-coded navigation taxonomy. Components: semantic list, Astryx `Button`/`Link`, `Heading`, `Text`; full-row links only if accessible names remain unambiguous.
2. **Boundary questions:** “Does sending mean the business confirmed?”, “Who confirms price, timing, and availability?”, “What details are shared?”, “What if a business does not reply?”, “How do I correct or remove a page?” Answers start with the direct answer. Data source: static authority copy, privacy route links. Components: Astryx `Collapsible`.
3. **Contextual start:** one primary link back to `/`, with browse as secondary. No example-query chip cloud that competes with the task index. Data source: route registry. Components: Astryx `Button`.

## States

Apply shared loading/error/zero-JS posture. If a task destination is known but temporarily unavailable, DS-13 meaning is `temporarily unavailable`; keep the task row, state “This path is unavailable right now,” and offer the nearest truthful alternate path. A nonexistent correction target is `resource not found`, handled on its destination route rather than disguised here. No streaming.

## Interactions

Primary action varies by selected task and names the destination: `Start with a need`, `Browse businesses`, `Claim your business page`, `Request a correction or removal`, `Read privacy details`. All are AX-2 link-out review depth. Boundary answers use Astryx `Collapsible`; multiple disclosures may remain open because comparison is useful and there is no need for accordion exclusivity. Focus remains on the trigger after toggle.

## Copy voice

- Headline: **What do you need to do?**
- Task labels: `Find a business`, `Claim your business page`, `Correct or remove a page`, `Understand how your details are used`.
- Canonical answer: **No. Sent means AE recorded the handoff. The business confirms price, timing, availability, and whether it can help.**
- No `owner` badge as universal identity, no credit-card icon for contact, no “qualified lead,” “booking,” “instant quote,” or internal mechanics vocabulary.

## Responsive

Use shared behavior. Task rows retain one action each and never become two-column identical cards. At ≤375px, actions are full-width and separated from the next row by 24px. Disclosure trigger labels wrap to two lines without clipping; chevrons remain aligned and 44px targets remain intact.

## Accessibility

Task index is a `<nav aria-labelledby="help-tasks-title">` containing a list. Link text is unique without surrounding context. Disclosures meet shared keyboard semantics. No automatic selection or tab widget is needed. Known destination failure uses one alert on the destination, not an announcement on link focus.

## Rule compliance

| Rule | Satisfaction |
|---|---|
| LAW-4 | Direct answer separates sent from business confirmation. |
| LAW-7 | Task index is primary; boundary answers are the deeper level. |
| LAW-8 | Unavailable task paths name the mismatch and alternate path. |
| IA-1, IA-2 | Public discovery; task links derive from the shared route map. |
| IA-6, IA-7, IA-8 | Shared editorial skeleton, named rail/rhythm, thin route. |
| CH-9 | Each known problem answer gives one cause-specific next action. |
| AX-2, AX-7 | Navigation uses link-out depth; boundary truth sits with contact guidance. |
| DS-1, DS-2, DS-4 | Astryx links/disclosures and complete interaction states. |
| DS-13, DS-14 | Typed unavailable meanings; shell and context survive errors. |
| DS-15 | 44px targets and semantic, text-first task labels. |

## Anti-slop check

No absolute-ban pattern appears. In particular, help topics are not an identical icon-card grid, and no chat widget or modal substitutes for task routing. The category-reflex check rejects a generic knowledge-base search box because the current bounded task set is clearer and more trustworthy.

# /privacy — Privacy

## Register & scene

**Register:** product. **Scene:** a person reviews what happens to their contact details on a phone before sending anything, in ordinary light and with cautious attention; the restrained light scene favors plain text, explicit recipients, and direct control paths.

## Job & IA position

**One job:** explain, by customer moment, what data AE uses or shares and provide a direct correction/removal path. **Route class:** public discovery, with `noindex` metadata because it is a trust/control route rather than an acquisition surface. **Entry points:** footer, help answers, data-sharing readbacks, direct URL. **Exits:** `/privacy/remove-business`, `/terms`, `/`, and the relevant private record when reached contextually. **Blueprint:** IA-6 trust; LAW-7 summary plus policy details; AX-7 boundary placement; DS-13 typed failures.

## Layout

Use the shared skeleton. The primary layer is a plain table-like sequence of customer moments, not three equal cards or tabs that hide content without JavaScript. Desktop uses `minmax(12rem,.7fr) / 1.3fr`; mobile stacks the moment heading above its facts.

```text
DESKTOP MAIN
┌───────────────────┬────────────────────────────────────────────────┐
│ When you ask      │ Need text + session data; purpose; retention   │
│ When you compare  │ Published business facts; source boundaries    │
│ When you contact  │ Exact fields → one named business              │
│ Public pages      │ What is public; what is never public           │
└───────────────────┴────────────────────────────────────────────────┘
Data controls and retention [Collapsible]
──────────────────────────────────────────────────────────────────────
Need a business page corrected or removed?                  [Request]
```

```text
MOBILE, 375px
┌───────────────────────────────┐
│ Your details, plainly.        │
│ When you ask                  │
│ Used: …                       │
│ Shared with: …                │
│ Kept for: …                   │
│ ───────────────────────────── │
│ When you contact              │
│ Exact recipient and fields    │
│ [Retention and controls ▾]    │
│ [Request correction/removal]  │
└───────────────────────────────┘
```

## Section anatomy

1. **At-a-glance moments:** ask, compare, contact, public business pages. Each names data, purpose, recipient, and whether it is public. Data source: route-authored privacy projection aligned to actual runtime behavior. Components: semantic `<dl>` or table-like CSS grid, Astryx `Heading`, `Text`.
2. **Contact boundary:** exact reminder that only reviewed contact fields go to the selected business; no claim that a sent request is accepted. Data source: item/permission projection when contextual, otherwise static policy. Components: Astryx `Banner` only if context-specific; otherwise ordinary prose.
3. **Retention and controls:** browser-session marker, saved record, deletion/retention posture, private-link caution, and how to exercise access/correction rights. Do not promise a deletion mechanism not implemented. Data source: privacy policy model; components: Astryx `Collapsible`, `Link`.
4. **Correction/removal path:** prominent text and `Request a correction or removal` link to `/privacy/remove-business`. This is not buried in the footer. Data source: route registry. Components: Astryx `Button` secondary or primary if this route was entered from a correction intent.

## States

Static policy remains server-rendered. If contextual privacy data is absent, that is not an error; show the general policy. If a requested private record cannot be opened, DS-13 meaning is `access denied` or `resource not found` without revealing which object exists, and offer the safe private-link recovery. If policy-backed dynamic detail is unavailable, use `temporarily unavailable`, retain general copy, and link to the correction/removal path. No streaming.

## Interactions

Primary action: **Request a correction or removal**, AX-2 link-out depth. It navigates to the focused correction form and does not itself delete anything. Privacy detail disclosures are nonexclusive. Any contextual field list is read-only and must remain adjacent to the action that would share it on the originating transaction page; this route does not become a substitute for AX-7 transactional readback.

## Copy voice

- Headline: **Your details, plainly.**
- Labels: `Used for`, `Shared with`, `Public`, `Kept for`, `Your controls`.
- Contact boundary: **AE shares only the details you review with the business you choose. The business confirms price, timing, availability, and whether it can help.**
- Correction copy: **Need a business page corrected or removed? Send the page address and what should change.**
- Avoid “data marketplace,” “lead,” “tracking ecosystem,” “anonymous” unless technically proven, and vague promises such as “we never share your data.”

## Responsive

Use shared behavior. The two-column moment grid stacks below `md`; labels precede values in DOM order. Long URLs and IDs wrap safely. The correction action is full-width at ≤375px. No hidden tab panels are required for core policy content.

## Accessibility

Use one `h1`, moment `h2`s, and real `<dl>` semantics for label/value facts. Do not use icons as privacy meanings. Links name their destination and action. `noindex` does not alter accessibility. Contextual errors use one alert; static content has no live region. Private-link keys never appear in title, canonical metadata, analytics, or visible examples.

## Rule compliance

| Rule | Satisfaction |
|---|---|
| LAW-4 | Sharing and delivery language does not imply business acceptance. |
| LAW-5 | Privacy route explains scope, but transaction pages still repeat exact fields beside commit. |
| LAW-7 | Moment summary is primary; retention/control detail is one level deeper. |
| IA-1 | Public discovery route with explicit `noindex` posture. |
| IA-5 | Noindex route is excluded from sitemap despite being publicly loadable. |
| IA-6, IA-7, IA-8 | Shared editorial skeleton, `5xl` rail, thin SEO/content route. |
| AX-2, AX-7 | Removal link is navigation only; transactional boundary remains action-adjacent. |
| DS-1, DS-2, DS-3 | Astryx behavior, Tailwind layout, semantic tokens. |
| DS-13, DS-14 | Access/not-found/unavailable meanings are distinct and context remains. |
| DS-15 | Plain text meanings, 44px controls, private-link illustrative truth. |

## Anti-slop check

No absolute ban appears. Privacy is not rendered as a shield-icon card grid, compliance badge wall, or decorative “trust center.” The category-reflex check rejects blue security theater; trust comes from exact recipient, purpose, retention, and control language.

# /terms — Terms

## Register & scene

**Register:** product. **Scene:** a person checks the agreement on a laptop before using AE or a phone after a help link, in ordinary daylight and with limited patience; the light editorial scene uses a readable rail, plain summaries, and expandable legal detail.

## Job & IA position

**One job:** state the agreement and product boundaries in plain language while keeping full terms reachable. **Route class:** public discovery with `noindex`. **Entry points:** footer, help, privacy, and consequence-specific links. **Exits:** `/`, `/privacy`, `/help`, and `/privacy/remove-business`. **Blueprint:** IA-6 trust; LAW-7 summary plus full details; AX-2 link-out; DS-1 Astryx disclosure.

## Layout

Use the shared skeleton. A concise “In short” section stays open. Full terms follow as a vertical disclosure list, not cards. One disclosure may be open by default on first visit, but a hash deep link opens and focuses its section.

```text
DESKTOP MAIN
┌──────────────────────────────────────────────────────────────────────┐
│ In short: what AE helps with, what you choose, what business decides │
└──────────────────────────────────────────────────────────────────────┘
Full terms
[Using AE                                      ▾]
[Business information and recommendations     ▾]
[Contacting a business                         ▾]
[Your responsibilities                         ▾]
[Corrections, removal, and records              ▾]
[Limits and changes                             ▾]
──────────────────────────────────────────────────────────────────────
Questions? [Help]                                  [Start with a need]
```

```text
MOBILE, 375px
┌───────────────────────────────┐
│ The terms, in plain language. │
│ In short                      │
│ concise visible summary       │
│ [Using AE                ▾]   │
│ [Business information   ▾]   │
│ [Contacting a business  ▾]   │
│ [Your responsibilities  ▾]   │
│ [Help]                        │
│ [Start with a need]           │
└───────────────────────────────┘
```

## Section anatomy

1. **In short:** AE helps with needs, options, and first contact; the person reviews what is shared; the business confirms its own price, timing, availability, terms, and whether it can help. Data source: versioned terms content. Components: `AePageHeader`, Astryx `Heading`, `Text`, semantic list.
2. **Full terms disclosures:** using AE; published business information; recommendations and unknowns; contacting one business; customer responsibilities; business responsibilities; records and communications; correction/removal; service availability; limitation/change/contact sections as legally required. Data source: versioned legal content with effective date. Components: Astryx `Collapsible`, shared `AeTimestamp`/`<time>` for effective date.
3. **Exit row:** Help and `Start with a need`. Data source: route registry. Components: Astryx `Button`, `Link`.

## States

Terms are server-rendered and never depend on JavaScript to be readable. No content-empty state is valid; missing terms is DS-13 `temporarily unavailable`, preserves shell, blocks any claim that the agreement is available, and offers Help. A malformed hash opens the page at the full-terms heading without an error. No streaming. Route emits `noindex` and is omitted from sitemap under IA-5.

## Interactions

Primary action: **Start with a need**, AX-2 link-out depth. `Collapsible` sections are nonexclusive so readers can compare clauses. Hash links update the URL to a stable section ID, open that section, and focus its heading without stealing focus during ordinary toggle. No modal acknowledgment or checkbox is introduced on this editorial page; consequence-specific acceptance, if ever required, belongs immediately before that consequence.

## Copy voice

- Headline: **The terms, in plain language.**
- Visible summary: **AE helps you understand a need, review options, and contact one business where offered. You choose what to send. The business confirms price, timing, availability, terms, and whether it can help.**
- Labels use `Using AE`, `Business information`, `Contacting a business`, `Your responsibilities`, `Corrections and removal`, `Service limits`.
- Avoid “the deal,” legalese-first headings, “booking,” “payment,” “guaranteed,” “supplier,” “vendor,” and internal route mechanics.

## Responsive

Use shared behavior. Disclosures stay a single column at every width. Trigger text can wrap; indicator and 44px target remain stable. Actions stack full-width at ≤375px. Body clauses stay under 75ch and tables, if legally unavoidable, convert to labelled definition groups rather than horizontal scrolling.

## Accessibility

One `h1`; visible “In short” is an `h2`; each disclosure trigger names an `h2` section. `aria-expanded`/`aria-controls` are Astryx-owned. Effective date uses `<time dateTime>`. Hash navigation focuses a programmatically focusable heading and preserves visible focus. Content remains available without animation and under reduced motion.

## Rule compliance

| Rule | Satisfaction |
|---|---|
| LAW-4 | Terms reserve confirmation and authoritative commercial facts for the business. |
| LAW-7 | Visible plain summary plus one deeper full-terms layer; no third summary. |
| IA-1, IA-5 | Public trust route, noindex, omitted from sitemap. |
| IA-6, IA-7, IA-8 | Shared editorial skeleton, `5xl` rail, route owns SEO/content loading only. |
| AX-2 | Editorial navigation has no unnecessary confirmation; acceptance belongs at actual consequence. |
| AX-7 | Canonical business-confirmation boundary is visible in the open summary. |
| DS-1, DS-2, DS-4 | Astryx `Collapsible`; Tailwind layout; complete focus/keyboard states. |
| DS-6 | Reduced motion reaches open/closed state immediately. |
| DS-8 | Effective date uses shared timestamp semantics. |
| DS-13, DS-14 | Missing terms is typed unavailable and retains shell/help path. |

## Anti-slop check

No side stripes, gradient text, glass, hero metric, identical card grid, or modal-first pattern. The category-reflex check rejects faux-formal navy legal styling and badge theatre. Plain typography, stable section anchors, and concise visible boundaries carry trust.
