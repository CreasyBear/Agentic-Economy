# / - Ask Agentic Economy

## Register & scene

**Register:** Brand above the fold, product inside the composer. The transition happens at the field boundary: the page makes the promise, while the control explains the actual task and its limits.

**Physical scene:** A person at a kitchen table in clear morning light has a half-formed local need and wants to state it before learning how the service works, so the page uses the warm canvas, white surface, ink, slate, and one purposeful eucalyptus action rather than a dark tool aesthetic.

**Brand voice:** Direct, calm, useful. The aesthetic lane is a confident service index: strong left-aligned type, a large working composer, fine rules, and irregular editorial rails rather than a centered SaaS hero or decorative marketplace shell.

## Job & IA position

**One job:** Let a visitor state a need and begin a durable decision thread without first passing through explanation, sign-in, contact details, consent, or notification prompts.

**Route class:** Public discovery (`IA-1`), canonical and indexed (`IA-5`). This is the only front door for requests (`D1`, `LAW-1`, `IA-3`).

**Entry points:**

- Direct navigation to `/`.
- Public navigation action `Ask`.
- Legacy `/q/:answerId` entries, normalized by the server contract below; older safe `?q=` links use the separate draft-consumption contract.
- Links from registry and business pages that carry a non-sensitive need in `?q=`.
- Search-engine landing on the canonical `/` document.
- Returning visitor opening `/` with locally available recent-thread metadata.

**Exits:**

- Successful ask: create the durable thread, then navigate immediately to `/t/:threadId` (`LAW-2`).
- `Browse businesses`: `/registry`, preserving no unsubmitted draft in the URL.
- Registry rail item: public business page.
- Returning-user thread row: its stable `/t/:threadId` URL.
<!-- journey-system: §8 -->
- Below-fold narrative exit: the labelled `For agents` gateway only. Section 7 contains the complete how-it-works narrative; `/how-it-works` MUST NOT be linked or treated as a route.

**Normative blueprint:** `PRINCIPLES.md` §10 `/`: composer first, actionable example asks, registry browse below, immediate thread navigation, marketing below the fold. `JOURNEY.md` §1 and Stage 1 define the zero-preamble ask and published-business-page boundary.

## Layout

**Skeleton:** A task-first variant of the `AePublicShell` standard public skeleton. Use `max-w-6xl` for the composer and browse rails, `max-w-5xl` for the lower editorial narrative, and `px-4 md:px-6` gutters (`IA-6`, `IA-7`). Above-fold rhythm is intentionally asymmetric: compact brand promise, dominant composer, then examples. Section spacing uses 12 between major sections, 6 between blocks, and 4 inside bounded surfaces.

The composer begins inside the first viewport at every supported size. On desktop, its top edge appears before the midpoint of a typical 768px-high viewport. On mobile, the label, textarea, submit control, and at least two example chips remain reachable without horizontal movement; the primary submit button is not pushed below a marketing block.

### Desktop wireframe (approximately 1440px)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ AePublicShell: logo       Ask  Businesses  Claim your business page         │ 64 <!-- stupid-shit: S3 -->
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  max-w-6xl / px-6                                                         72 │
│  Agentic Economy                                                             │
│  YOUR AGENT KNOWS WHO TO CALL.                 quiet brand promise           │
│  Say what you need. We will help you review real business options.           │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ What do you need?                                                     │  │
│  │                                                                        │  │
│  │ Describe the outcome, place, timing, and limits you already know...   │  │ 176
│  │                                                                        │  │
│  │ AE searches published business pages. You review before anything is   │  │
│  │ sent to a business.                                [Find businesses]  │  │ <!-- stupid-shit: S4 -->
│  └────────────────────────────────────────────────────────────────────────┘  │
│  Try an example: [Find a printer for 200 cards by Friday]                     │
│                  [Compare local bookkeepers for a small business]             │
│                  [Find a dog groomer with weekend times]                      │
│                                                                              │
│                                      Browse instead: [Browse businesses]      │
├──────────────────────────────────── first fold ends around here ──────────────┤
│  CONTINUE YOUR WORK (returning visitor only, max 3 quiet rows)                │
│  Need / status / updated time                                      [Open]     │
├──────────────────────────────────────────────────────────────────────────────┤
│  BROWSE PUBLISHED BUSINESS PAGES                                              │
│  Categories: horizontally wrapping links, not equal feature cards             │
│  [Business row with category, place, listed help, supported next action]      │
│  ──────────────────────────────────────────────────────────────────────────   │
│  [Business row]                                      [Browse all businesses]  │
├──────────────────────────────────────────────────────────────────────────────┤
│  max-w-5xl editorial rail                                                    │
│  YOUR AGENT KNOWS WHO TO CALL                                                 │
│  Ask → review options → choose what happens next                              │
│  concise complete narrative and boundary, with [For agents]                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Mobile wireframe (375px)

```text
┌───────────────────────────────┐
│ AE                       Menu │ 56
├───────────────────────────────┤
│ px-4                          │
│ Agentic Economy               │
│ Your agent knows who to call. │
│ Say what you need.            │
│                               │
│ ┌───────────────────────────┐ │
│ │ What do you need?         │ │
│ │                           │ │
│ │ Describe the outcome,     │ │
│ │ place, timing, and limits │ │ 148
│ │ you already know...       │ │
│ │                           │ │
│ │ AE searches published     │ │
│ │ business pages.           │ │
│ │                           │ │
│ │ [Find businesses]          │ │ 48 <!-- stupid-shit: S4 -->
│ └───────────────────────────┘ │
│ Try an example                │
│ [Printer, 200 cards, Friday]  │ 44
│ [Local bookkeeper]            │ 44
│ [Weekend dog groomer]         │ 44
│ [Browse businesses]           │ 44
├──── first fold varies ────────┤
│ Continue your work            │
│ ─ Need summary                │
│   Your shortlist is ready [Open] │ <!-- stupid-shit: S4 -->
├───────────────────────────────┤
│ Browse business pages         │
│ [Category] [Category] →       │
│ Business name                 │
│ Listed help · Place           │
│ Supported next action         │
│ ───────────────────────────── │
│ Business name                 │
│ [Browse all businesses]       │
├───────────────────────────────┤
│ Your agent knows who to call. │
│ Ask → review → choose         │
│ [For agents]                  │
└───────────────────────────────┘
```

## Section anatomy

### 1. Public shell and route identity

- **Content:** Product mark and the shared public navigation `Ask`, `Businesses`, and `Claim your business page`, derived from the shared route registry. `Ask` is current. `For agents` is footer-only, and Activity remains the returning-user rail on this page rather than a navigation item. No sign-in CTA interrupts the task. <!-- stupid-shit: S3 -->
- **Data source:** Shared route/action registry; route loader supplies returning-user capability without exposing thread data to crawlers.
- **Astryx components:** `AePublicShell`; Astryx `Button` or link behavior through the existing router-link composition; `Text` for compact identity.

### 2. Promise and primary composer

- **Content:** Eyebrow `Agentic Economy`; H1 `Your agent knows who to call.`; one short support line; persistent label `What do you need?`; multiline input; source-scope hint; primary action `Find businesses`. <!-- stupid-shit: S4 -->
- **Data source:** Route search parser supplies a sanitized, length-bounded `q`; client draft recovery supplies only an unsent local draft when `q` is absent; submit action creates the thread and initial `user_text` item.
- **Item projection:** On submit, the text becomes a `user_text` item with `asked` provenance and `submitted` lifecycle. The home page never renders conversation mechanics vocabulary.
- **Astryx components:** Existing `AeAnswerPromptInput` composition, converged onto Astryx `FormLayout`, `Field`, `TextArea`, and `Button` contracts; `Heading`; `Text`; server-failure `Banner`. Reuse the current composer rather than creating a second textarea API.
<!-- sim: G5 -->
**Urgent-intent branch:** The submit contract MUST classify explicit `today`, `emergency`, or `now` intent without claiming clinical or emergency-service judgement. After the durable thread is created, this branch MUST request an early source-backed shortlist rather than the full ordinary streaming ceremony. Its first named work phase MUST state: `This request may not be answered in time. Showing published call options and reply history first.` The first useful result MUST prioritize businesses with published phone numbers and render peer call affordances plus the same response-posture vocabulary used by registry/listing: attributable observed window with source/sample/recency, business-published commitment clearly labelled, or `No reply history yet`. It MUST NOT imply live availability, emergency suitability, or that AE observed an external call.

**Anonymous visitor:** The empty labelled composer receives initial task focus only when arrival has no fragment, no `q`, and no user-initiated navigation target. No account, contact field, cookie choice, notification permission, external-send permission, or business-contact consent is requested. Submitting creates an access-appropriate durable thread and navigates to it.

**Returning visitor:** The composer remains first and empty unless an explicit `q`, a user-restored unsent draft, or a user-selected example supplies text. A quiet `Continue your work` rail appears below the primary ask when recent-thread metadata is legitimately available. It shows at most three rows, status and update time, never preloads private transcript content, and never displaces or prefills the new ask. `Start a new ask` is unnecessary because the composer is already visible.

**Legacy `?q=` consumption:**

1. Parse `q` once in the route loader/search schema. Decode safely, trim surrounding whitespace, normalize line endings, enforce the composer character limit, and reject control-only or empty values.
2. If valid, place it in the composer as an editable draft. Do not auto-submit. The person must activate `Find businesses` because arriving through a URL is not intent to start processing. <!-- stupid-shit: S4 -->
3. Once the client has adopted the value, replace the address with canonical `/` without adding history. The draft remains in component state. This prevents query text from persisting in copied URLs, analytics, canonical metadata, or referrers.
4. If invalid or over limit, preserve the page and explain the correction beside the field. Never print the raw invalid value in a server banner.
5. An explicit valid `q` outranks local draft recovery. A valid unsubmitted local draft outranks an empty composer only when no `q` exists.
<!-- journey-system: A7 -->
**Legacy `/q/:answerId` normalization contract:**

1. The server MUST treat `answerId` as an opaque lookup key and enforce the route parameter's declared maximum length before lookup; over-length input MUST NOT reach storage.
2. The server MUST resolve the answer object and perform its access check before deriving any draft. Browser-supplied answer text or metadata is NEVER lookup authority.
3. A missing, stale, expired, or inaccessible answer MUST redirect/replace to clean `/` with a generic notice that the saved answer could not be opened. The notice MUST NOT echo the key, answer text, or access result, and these cases MUST NOT preserve a `q` value.
4. Private answer text MUST NEVER enter a public URL, including path, query, fragment, redirect target, analytics, canonical metadata, or referrer. After successful authorized lookup, the server MAY derive a separately sanitized, non-sensitive need draft bounded by the composer limit; if it cannot prove the draft safe for public exposure, it MUST drop the text and continue at clean `/`.
5. A successfully derived safe need enters only as an editable draft under the `?q=` consumption rules: it MUST NOT auto-submit, and the visible address MUST be replaced with canonical `/` after adoption.

### 3. Actionable example asks

- **Content:** Label `Try an example` and three realistic, capability-bounded asks. Suggested copy:
  - `Find a printer for 200 cards by Friday`
  - `Compare local bookkeepers for a small business`
  - `Find a dog groomer with weekend times`
- **Data source:** Route-owned, reviewed static copy. Examples do not imply live supply, current price, availability, ranking, or completion.
- **Interaction:** Each Astryx `Button` with secondary/chip treatment writes the full example into the composer, moves focus to the field, and announces `Example added. Edit it or find businesses.` It does not submit. Chips are actions, not decorative badges. <!-- stupid-shit: S4 -->
- **Astryx components:** `Button`, `Text`; Tailwind flex-wrap only.

### 4. Low-commitment browse exit

- **Content:** `Not ready to ask? Browse published business pages.` with `Browse businesses`.
- **Data source:** Shared route registry.
- **Astryx components:** `Button` with link behavior; `Text`.

This is the Airbnb-style duality: task composition remains dominant, while a visitor can browse concrete supply without committing to an ask. It is not a second search box and does not compete with the composer.

### 5. Continue your work, returning visitors only

- **Content:** Up to three recent durable threads: need summary, friendly authoritative status projection, updated time, and `Open` link. Terminal R0 state reads exactly `Your shortlist is ready`. <!-- stupid-shit: S4 -->
- **Data source:** Route loader returns access-safe recent-thread summaries for the current browser/session context. If reliable summaries are unavailable, omit the entire section rather than showing fake activity.
- **Astryx components:** semantic list, `Heading`, `Text`, centralized `AeStatusBadge`, shared `AeTimestamp`, `Button` link. Rows use dividers rather than a uniform card grid.

### 6. Registry browse rails

- **Content:** Heading `Browse published business pages`; a compact category rail followed by two to four source-backed business rows. Each row shows business name, published category, place or service boundary, a factual `Listed help` summary, evidence posture if available, and the actually supported next action. Final link: `Browse all businesses`.
- **Data source:** Route loader calls the same bounded public registry projection used by `/registry`. No invented businesses, reviews, prices, availability, distance, or ranking. If the loader has only a bounded source window, copy does not imply exhaustive local search.
- **Astryx components:** `Heading`, `Text`, `Badge` for stable categories only, `Button` links, `Card` only if an individual row is genuinely a bounded record. Prefer a divided semantic list and one irregular featured row over identical tiles. Tailwind supplies responsive rail/grid layout.

### 7. Demoted marketing narrative

<!-- journey-system: §8 -->
- **Content:** The brand promise returns as the section heading, followed by the complete how-it-works narrative: `Ask in your own words`, `Review the options and unknowns`, `Choose what happens next`. Supporting copy: `People already ask AI for advice. Agentic Economy helps that advice reach real business pages when the answer needs to become action.` The only exit is `For agents`; this section MUST NOT render a `How it works` link or depend on `/how-it-works`.
- **Data source:** Static, PRODUCT.md-authorized copy and shared route registry.
- **Astryx components:** `Heading`, `Text`, `Button` links, `Collapsible` only for optional deeper boundaries. Use an ordered editorial rail with rules, not three identical cards.

## States

### Loading

- The shell, H1, composer, examples, and browse exit render from static/server data immediately. They are never replaced by a full-page spinner.
- Returning-thread and registry loader regions reserve their settled height with geometry-preserving skeleton rows matching exact text, timestamp, and action positions (`DS-14`). Use Astryx `Skeleton`; mark the region `aria-busy="true"`; skeletons are hidden from assistive technology.
- Composer submission keeps its geometry. The primary button becomes disabled and loading with label `Starting your thread`; duplicate Enter/click submissions are ignored by the same operation key.

### Empty

Apply exactly one `DS-13` meaning per region:

- **Composer empty:** Not a DS-13 dataset empty; it is the intended initial form state. Persistent label and examples teach the next valid action.
- **No recent threads:** `no source data`. Omit `Continue your work`; do not announce an empty account state or suggest sign-in.
- **No registry rows available from the source:** `no source data`. Copy: `No published business pages are available in this view yet.` Action: `Browse all businesses` only if `/registry` can show a broader real source; otherwise `Try an ask` focuses the composer.
- **Valid ask later yields no matches:** Not handled on `/`; the durable thread owns `no filter match` or `unmet demand`, names the mismatch, and offers individual relax actions (`LAW-8`).

### Error

- **Invalid `q` or client validation:** Field-local message with `aria-invalid` and `aria-describedby`: `Use a shorter description before continuing.` Preserve editable safe text where possible and focus the field.
- **Thread creation failure:** Keep the exact draft and shell. Astryx `Banner`: `We could not start your thread. Your ask is still here.` Primary recovery: `Try again`. Secondary safe path: `Browse businesses`. Never navigate to a non-durable placeholder thread.
- **Returning-thread loader failure:** Keep the composer fully usable; omit the section and show no global error because it is ancillary.
- **Registry rail failure:** Preserve its heading and context. Copy: `Business pages are temporarily unavailable here.` Action: `Try again`. This is `temporarily unavailable`, not `no source data`.
- Public errors never expose raw exception messages, internal IDs, or machine vocabulary.

### Streaming and navigation <!-- sim: G5 -->

- `/` does not stream search results. Successful submission first receives a real `threadId`; then navigation to `/t/:threadId` occurs immediately (`LAW-2`).
- For ordinary asks, the thread route renders the final conversation-item anatomy and streams its named work phases.
<!-- de-hedge --> - For explicit `today`, `emergency`, or `now` asks, the thread's first work phase MUST state `Timing is urgent. Showing published call options and reply history first.` It MUST produce an early shortlist with published call affordances and attributed posture labels before deeper match explanation. It MUST NOT run the full ordinary streaming ceremony before exposing those paths.
- If thread creation returns but navigation is delayed, the composer remains locked with `Starting your thread`; a polite status announces once. A safe same-origin link to the created thread may appear only after the ID is authoritative.
- Stop is a thread action after navigation. The front door does not pretend to stop work that has not yet acquired a durable object.

### Zero-JS and SEO posture

- Server-render the shell, H1, support copy, labelled composer, examples, browse link, source-backed registry rail, and below-fold narrative as meaningful HTML.
- Provide a real HTML form fallback: `GET /?q=<value>` returns the same server-rendered editable composer with the value. It does not auto-submit or create work without JavaScript. A visible message explains that starting a durable thread requires activating the same primary action in the supported client; browsing remains fully available.
- Canonical URL is always `/`. `q` is never included in canonical, Open Graph URL, structured data, sitemap entries, page title, or description. Robots may index `/`; query variants resolve to canonical `/` and should not become separate indexed documents.
- Title: `Agentic Economy | Your agent knows who to call`.
- Description: `Say what you need. Agentic Economy helps your agent review real business options and choose a clear next step.`
- One H1 only. Registry rows use links with names, not click handlers on generic containers. Any structured data describes the organization/site and source-backed listed businesses only; example asks are not offers or reviews.

## Interactions

### Primary action: Find businesses <!-- stupid-shit: S4 -->

| State | Contract |
|---|---|
| Resting | Enabled only when normalized text is non-empty and within limit. Persistent visible label; Enter submits, Shift+Enter adds a line. |
| Hover | Astryx primary hover using eucalyptus active treatment; no movement required. |
| Focus | Astryx visible focus ring; focus is never color-only and remains visible against white surface and warm canvas. |
| Active | Astryx pressed state; no scale effect that shifts layout. |
| Disabled | Disabled when empty, invalid, or already submitting; visible helper text explains empty/invalid cause. |
| Loading | Label `Starting your thread`; `isDisabled` plus `aria-busy="true"`; preserve button width and textarea contents; one operation key prevents duplicate creation. |
| Success | Receive authoritative `threadId`, then immediately navigate to `/t/:threadId`. Route focus moves to the thread H1/status region through `AeRouteFocusManager`; browser back returns to an empty or explicitly recovered draft, never silently resubmits. |
| Error | Keep draft, render summary `Banner` plus field error if applicable, focus first invalid field or Banner, and expose exactly one primary `Try again` recovery. |

**Confirmation depth (`AX-2`):** None beyond ordinary form submission. This starts AE processing and creates an R0 thread; it does not share data with a business, spend money, send a request, or authorize external action. Do not add a consent checkbox, confirmation modal, identity gate, contact field, or notification prompt. Source-scope copy adjacent to the button is explanation, not consent: `AE searches published business pages. You decide before anything is sent to a business.`

**Keyboard:** Tab order follows visible order: composer, submit, example chips, browse exit, returning rows, registry links, narrative links. Enter submits from the textarea, Shift+Enter inserts a newline. Example chips use native buttons and return focus to the textarea. Escape has no destructive behavior. No action is keyboard-only.

**Focus:** Initial focus follows user intent and does not steal focus after browser restoration. `q` adoption places the cursor at the end only after the person focuses the field. Validation focuses the field; server error focuses the Banner; successful navigation focuses the new route heading/status. Returning and registry loader completion never moves focus.

## Copy voice

### Primary copy

- Eyebrow: `Agentic Economy`
- H1: `Your agent knows who to call.`
- Support: `Say what you need. Review real business options and choose what happens next.`
- Field label: `What do you need?`
- Placeholder: `Describe the outcome, place, timing, and limits you already know...`
- Source boundary beside the primary action: `AE searches published business pages. You decide before anything is sent to a business.`
- Primary action: `Find businesses` <!-- stupid-shit: S4 -->
- Examples label: `Try an example`
- Browse exit: `Browse businesses`
- Returning rail: `Continue your work`
- Registry rail: `Browse published business pages`

### Boundary placement

No external-send boundary is active on `/`, so do not repeat full R1 send disclaimers. Place the R0 boundary immediately beneath the field and beside the primary action: `AE searches published business pages. You decide before anything is sent to a business.` In registry rows where timing or availability could be inferred, place: `The business confirms price, timing, and availability.` This is adjacent to any business-page/open action that exposes such facts (`AX-7`, `LAW-4`).

### Vocabulary and banned-word check

Customer copy uses need, business, options, price, timing, details, progress, record, and confirmation only when those objects are actually present. It does not lead with request, route quote, provider, capability, approval, run, incident, item, receipt, tuple, lifecycle, kernel, protocol, clearance, mandate, inquiry workflow, lead, posting, household, procurement, vendor, wallet, payment, booking, or confirmation claims. It does not promise best, exhaustive, live, nearby, booked, quoted, available, sent, or confirmed without the corresponding evidence. No em dash appears in customer copy.

## Responsive

- **Base/mobile first, 320px to 639px:** Single column; `px-4`; compact shell; H1 uses a two-step scale but does not force one-word orphan lines; composer spans available width; textarea minimum height 148px; primary button is full width and 48px high; examples stack as content-width or full-width buttons with at least 44px height. The primary action remains within the first task block. No horizontal chip scroller is required to discover examples.
- **640px to 1023px:** `px-6`; examples wrap; composer action may align to the lower right while source copy retains at least 45ch; registry rows use two columns only when row facts remain readable.
- **1024px and above:** Promise and composer may use a restrained 4/8 grid, but DOM order remains promise then composer and the composer remains visually dominant. Returning rows and browse rails use the full `max-w-6xl`; narrative narrows to `max-w-5xl`.
- No sticky rail, floating CTA, modal composer, or viewport-height lock. Browser zoom at 200% preserves a single reading column without horizontal overflow.
- Long localized labels wrap without clipping. Textarea and button do not share a row when either would fall below 44px or meaningful label width.
- Touch targets are at least 44 by 44px with at least 8px separation where practical.

## Accessibility

- Landmarks: one `header` inside `AePublicShell`, one `main`, labelled `section` regions for ask, continue, browse, and explanation, and one footer. The H1 labels the main promise; the composer has its own visible field label rather than relying on the H1 or placeholder.
- The ask form uses Astryx `FormLayout` and `Field`. Errors use `aria-invalid`, `aria-describedby`, and the shared focus-first-invalid contract (`DS-12`). Character guidance is associated but not announced on every keystroke.
- Example asks are native buttons with full accessible names. Selecting one announces once in a polite region; changing textarea characters is silent.
- Submission uses one scoped `role="status"` or `aria-live="polite"` message: `Starting your thread.` Do not combine this with a second loading announcement. Server failure uses one `role="alert"` after the response and includes the recovery label.
- Returning statuses use text plus centralized badge shape; timestamps use shared `<time dateTime>` formatting. Registry category color, if any, is supplementary.
- On client navigation, `AeRouteFocusManager` focuses the destination heading/status. Focus rings come from Astryx and remain visible on all named token surfaces.
- Reduced motion reaches each semantic state immediately. No entrance choreography is required. If section transitions are used, consume Astryx motion tiers and skip transform/opacity sequencing under reduced-motion preference.
- At 320px, 375px, and 200% zoom: no horizontal overflow; label, input, helper, and button reading order is unchanged; menu expansion returns focus; all controls remain at least 44px.

## Rule compliance

| Rule | How this page satisfies it |
|---|---|
| D1, LAW-1 | `/` is the working ask surface. Composer precedes explanation; examples sit adjacent; registry browse and marketing sit below. |
| LAW-2 | Submit creates a durable thread before work streams and navigates immediately to `/t/:threadId`; no placeholder success screen. |
| LAW-4 | Copy states source limits, avoids best/live/exhaustive claims, and reserves price, timing, and availability confirmation for the business. |
| LAW-7 | Primary layer is composer plus examples; deeper explanation is the below-fold narrative. No third competing summary. |
| LAW-8 | Registry and later-thread zero results use a named DS-13 meaning and explicit valid recovery; constraints are never silently broadened. |
| LAW-10, IA-2 | Header, footer, links, and returning-thread destinations derive from the shared route/action registry. |
| IA-1 | Classified only as public discovery. Private thread details are not projected into crawler-visible home content. |
| IA-3 | All Ask and legacy `?q=` entries resolve here; `/engine` is not linked or presented as a competing front door. |
| IA-5 | Canonical public `/` is indexed; `q` variants and private/authenticated routes are excluded from canonical metadata and sitemap projection. |
| IA-6, IA-7 | Task-first public shell uses named `6xl`, `5xl`, gutter, and rhythm ladders; no arbitrary full-width sprawl. |
| IA-8 | Route owns search parsing, loading, and SEO. Composer and rails are reusable compositions; orchestration is not embedded in page markup. |
| CH-1, CH-2 | Submission produces typed `user_text`; work, evidence, and recommendations begin on the thread and remain separate. |
| CH-3, CH-4 | Home shows no thinking theatre or decorative plan. It explains only the actual source scope. |
| CH-5 | Original `q` text remains editable; URL adoption does not silently reinterpret or submit it. |
| CH-6, CH-9 | Failed creation preserves the draft and exposes one specific `Try again` recovery. |
| AX-2 | R0 ask is an ordinary submission, not a consequence confirmation. No modal, consent ask, or identity gate. |
| AX-6 | Choosing an example only edits the draft; choosing a registry row only navigates. Neither contacts a business. |
| AX-7 | The applicable R0 scope sits beside submit; business-confirmation boundaries sit beside rows where inference risk exists. |
| DS-1, DS-2 | Astryx owns fields, buttons, banners, badges, skeletons, and focus/loading behavior; Tailwind owns layout only. |
| DS-3, DS-10, DS-11 | Uses semantic ink, warm canvas, white surface, slate, and eucalyptus roles through `aeTheme`; no route palette and no unsupported dark-mode claim. |
| DS-4 | Wrappers preserve labels, disabled/loading semantics, keyboard operation, and visible focus. |
| DS-5, DS-6 | Any motion consumes Astryx tiers and reaches the final state immediately with reduced motion. |
| DS-7, DS-8 | Returning status is text-first and centralized; timestamps use shared semantic `<time>` formatting. |
| DS-12 | One form error/submission contract with field-local errors, Banner for server failure, and focus-first-invalid behavior. |
| DS-13 | No recent data, no registry data, and temporary failure remain distinct meanings with matching actions. |
| DS-14 | Ancillary loading preserves settled geometry; errors retain the shell and draft. |
| DS-15 | 44px targets, semantic IDs/times, and example labels that do not imply live supply. |
| R0 covenant | Before identity, PII, notifications, payment, or external-send consent, the thread will deliver editable understanding, evidence-bearing options or named mismatch, comparison, portable brief, and valid exits. `/` introduces no gate that can reorder that floor. |
| R1 anti-scope | No fan-out, response comparison, procurement, payment, wallet, ordering, vendor-management, future controls, or send chrome appears on the home page. |

## Anti-slop check

- **No side-stripe accents:** Sections use full-width rules, surface changes, and spacing, never colored side borders.
- **No gradient text:** Headings use solid ink or on-accent text only.
- **No glassmorphism:** Composer is an opaque white surface on warm canvas.
- **No hero-metric template:** The first fold is a promise plus working field, with no vanity numbers or supporting-stat cluster.
- **No identical card grid:** Examples are actions, returning work is a divided list, registry supply is an irregular rail, and the narrative is an ordered editorial sequence.
- **No modal as first thought:** Ask, examples, validation, recovery, and browse are inline. No modal appears on `/`.
- **No centered-everything landing page:** Type and task align to a deliberate left edge; desktop uses asymmetric grid tension while mobile follows the natural single column.
- **No fake activity or supply:** Returning rows require real accessible thread metadata; registry rows require source-backed data; absent data is omitted or truthfully empty.
- **No protocol theatre or decorative graph:** The routing engine stays backstage.
- **Category-reflex check:** The physical scene, existing warm canvas, and service-index structure drive the light restrained treatment. It is not a generic dark AI tool, neon agent interface, Airbnb clone, or teal marketplace template.
- **Brand-to-product transition is explicit:** The promise has character, but the composer is sober, labelled, and operational. Marketing never becomes a preamble.
