# UI composition and visual hierarchy

**Date:** 29 September 2026
**Lens:** what each screen is for, whether that job is visually primary, and whether the screen uses a repeated layout or a one-off.
**Specimen:** local app at `http://127.0.0.1:3024`, signed in as the R10 Smoke owner workspace (Perth Environmental Consulting on the provider side). Desktop is 1440×900. Narrow is 390×844.
**Contract:** `DESIGN.md` (revised 2026-09-21). There is no `BRAND.md` in this checkout. The chalk, charcoal, forest, and gold rules in that file are the brand law used here. Lived market grammar is `/market?view=discover`. UI kit is `src/components/ui` (button, card, empty, table, badge, input group, tabs).
**Shots:** `docs/reviews/rebuild/screenshots/` — one desktop and one 390px viewport capture per screen, listed at the end.

## What the system already requires

Two dialects, one token set. Public discover may use one ExtraLight display, a tracked uppercase eyebrow, collection rails, and hairline listing cards. Operator pages use the same tokens at workbench scale: medium titles, muted decks, hairlines. Display type does not enter forms, tables, or status. Interface type is Manrope at 400 or 500. `font-semibold` is legal on listing-card titles. `font-bold` page titles are defects. Prices, amounts, and identifiers are mono. Charcoal fills actions. Forest is for links, focus, and information, not buttons. Semantic colour is for literal state and always travels with text. Group with whitespace, then a border, then elevation. Do not nest bordered cards to fake hierarchy. Do not add a pattern without a second real use.

Measured tokens that the screens should share: canvas `rgb(232, 228, 218)`, body Manrope 16px, gutter 16px (26px from the `md` rail), section gap 32px, control radius `--radius-md` (8px), card radius 14px.

## The five layouts to standardise on

The twelve screens currently invent local hierarchies on top of one shell. They should collapse onto these five. Anything that is not one of these is a one-off.

1. **Discover rail.** One eyebrow, one ExtraLight display, one deck, one ask field, then collection rails of hairline listing cards. This is `/market?view=discover` and it is frozen. No other screen gets a second display hero.
2. **Decision record.** One object. Facts in a fixed order: identity, who provides it, buyer price in mono, provenance, the single next consequence. Comparison is this record repeated as a row-aligned table, not as drifting cards. Tool detail, compare, and the call receipt are this pattern.
3. **Workbench frame.** The signed-in shell already is the page title: 24px medium, one muted deck, at most one charcoal action. The body does not paint a second title. Settings is the screen that refuses this frame today.
4. **Record list.** Filters as pills, then one table on desktop that becomes stacked rows at 390px. The empty state sits inside the list, uses `src/components/ui/empty.tsx`, and does not repeat its own heading as a second sentence. Activity, agents, provider tools, and admin queues are this pattern.
5. **Task column.** One column of fields, a stepper only when the task has steps, a summary only once it has numbers, and one primary button that names the consequence. Credit, Add Tool, settings sections, and the chat composer column are this pattern. The chat history rail is an accessory of the column, not a new page type.

## Cross-screen findings

These show up on more than one screen, so they belong to the system rather than to a single page.

- **The shell title is Regular, not Medium.** Operator `h1` elements measure 24px / weight 400 (`text-title` in `AeAppHeader.tsx`, with no `font-medium`). `AeRecordHeader` and `AePageHeader` workspace titles are `font-medium`. The contract asks for medium titles. The chrome title is the one most screens use, and it is the lighter one.
- **Settings is a second title language.** `SettingsShell.tsx` paints `text-3xl font-bold` (30px / 700) on desktop and `text-2xl font-semibold` on the 390px index. That is the only `font-bold` page title in this set. The contract calls bold page titles defects.
- **Card titles pull Semibold into workbench pages.** `CardTitle` in `src/components/ui/card.tsx` is `font-semibold`. “Start” on tool detail, “Call outcome” on the receipt, and other card headings inherit a weight the contract reserves for listing cards.
- **Ask and Send are a different radius from every other action.** Buttons use `rounded-md` (measured 8px). The input-group slot forces `rounded-[calc(var(--radius)-5px)]`, which measures 5px on Market’s Ask and Chat’s Send. Two action shapes for the same charcoal button.
- **390px bottom navigation covers the job.** Market, Ask, Activity, and Settings sit in a fixed bar. On Credit, Activity, Add Tool, Provider tools, and the receipt, that bar clips the lower card or the date row. The primary button is often the thing under the bar.
- **Shell titles truncate the object.** The header title is `truncate`. On the receipt at 390px the tool name, which is the page, reads “AECon sandbo…”. The full name is the `title` attribute, not the page.
- **Empty states are local.** Activity uses a large dashed panel whose heading and body say the same sentence. Settings desktop is one grey line in an empty column and does not use `empty.tsx`. Provider tools shows a populated draft table and, below it, “No public Tools yet.” Credit shows an empty summary card before an amount exists. The kit has one empty pattern. These screens draw others.
- **Two asks.** Header “Find Tools”, the hero “Ask about any tool or service”, and the bottom-nav “Ask” are three doors to related jobs. On Market at 390px the bottom-nav Ask sits under the hero Ask.

## Screen critiques

### 1. Market — `/market?view=discover`

**The one job:** choose a Tool, by asking or by browsing a collection.

**Is it primary?** On desktop, partly. The ExtraLight headline “Tools for what’s next.” (72px / 200 / −3.96px tracking) and the charcoal Ask field are the right first move, and they match the frozen discover grammar: eyebrow “THE TOOL MARKET” at 12px / 500 / tracked uppercase, chalk field, charcoal action, forest only as the active Market link. The dark lunar card (“From possibility to something real.”, 36px / 300) has more contrast than Ask, and it carries its own “Explore creative Tools” action. Header Find Tools is a third search. Listing cards, which are the actual choice, start below a 900px fold. At 390px the display drops to 44px / 200 and still stacks eyebrow, headline, deck, Ask, disclaimer, topic links, the promo card, and two rows of tabs before any card. The bottom nav adds another Ask. The page is an introduction, not a catalogue, until you scroll.

**Density and rhythm.** Editorial, low density, consistent outer rail. Collection headings are 30px / 500. Card titles are 16px / 500. That scale is the one the rest of the app should quote, not imitate with new display sizes.

**Patterns.** This is layout 1, and it is the reference. The tools index (`/market?view=tools`, visible behind compare) already grows a second hero, “Find your next capability.” at 30px / 300. That hero should be a rail heading, not another display.

**Empty.** Saved and a zero-result query were not the specimen. The discover page is full (20,603 Tools). No empty component on this view.

**System.** Closest of the twelve. Sentence case slips on “Explore creative Tools.” Prices on cards show the buyer estimate and the provider USDC figure together. Gold is absent.

### 2. Tool detail — `/tools/blockrun.ai/api-v1-images-generations`

Specimen is the directory listing reached from a discover card (AI image generation API). A canonical `/tools/$toolRef` redirect for another listing (`api.exa.ai/search`) landed on “This exact Tool is unknown.” This critique is the listing buyers actually open, not an admitted callable Tool.

**The one job:** decide whether this listing is the Tool, and what is true about price, host, and whether AE can call it.

**Is it primary?** The title is (30px / 500, `text-title-lg font-medium` in `ToolDetailFacts.tsx`). The decision is not. Price “A$0.06 per Call” is a plain fact, then “Readiness unknown” and “External payment”, then small provenance lines, then “Directory or catalogue listing, not callable through AE.” The largest object after that is a near-empty bordered card headed “Start” whose only button is “Browse Market.” Start implies a call. The button leaves. A second price, “0.041000 USDC per Call,” sits below the warning. Desktop leaves a wide empty right column, so the weak card looks more important than it is. At 390px the same stack fits without horizontal overflow, and the not-callable line is on the first screen, but it is the same weight as the provenance lines. The Start card still reads as the action.

**Density.** Too low for a decision. Section gap is the system 32px, then a card that contains one button.

**Patterns.** Should be layout 2. The Start card is a one-off: a bordered card used as a slot for a single exit, which the contract forbids when a button in the fact stack would do. `CardTitle` makes “Start” semibold. Example code blocks are wider than 390px but scroll inside the page (`scrollWidth` stayed 368).

**Empty.** Not an empty page. The unresolved readiness and absent canonical Tool are the state, and they are written as muted sentences instead of the first fact.

**System.** The contract’s order is identity, provider, seller and price, inputs and effects, evidence, then the next valid action. Host is an inline “Directory Host” link, not a provider block. Two currencies are both visible and neither is marked as the buyer total versus the provider estimate. Charcoal “Browse Market” is the system button (8px radius) and it names the wrong consequence.

### 3. Compare — tools index, two listings, Compare Tools

**The one job:** see the difference that would change which Tool you inspect.

**Is it primary?** On desktop, yes, once the dialog is open. “Compare Tools” sits on a dimmed market. The content is two cards, not a table. Titles wrap to different heights, so price, call count, and Inspect Tool do not share a row. Prices (A$0.03 and A$0.01) are left-aligned inside each card. The contract says comparison stays tabular so numbers align. At 390px the dialog fits the width and the cards stack, which keeps comparison as the job but makes it a long scroll: the second tool’s price is not on screen with the first. Document `scrollWidth` was 648px against a 390px viewport because a nowrap badge (the kit badge is `whitespace-nowrap`) carrying a long listing title measured 615px. The dialog’s own copy wraps. The page underneath can still scroll sideways.

**Density.** Dense inside the cards, loose between mismatched rows. Hairlines are doing the grouping, which is right. The structure is wrong.

**Patterns.** Layout 2, as a table: one row per fact, mono prices in a column, one Inspect action per column footer. The card pair is a one-off of the listing card.

**Empty.** Not shown. The tray correctly disables Compare Tools until two listings are selected (“2 of 4 selected”).

**System.** Sentence case and charcoal actions are fine. The dialog is the right elevation (a popup, not a new page). Row alignment is the miss.

### 4. Chat — `/t/new`

**The one job:** ask for a Tool, with purchase still ahead of you.

**Is it primary?** The composer is the action, and on both widths it is the strongest control. The visual title is not the shell. The shell `h1` is “Ask” at 14px / 500. The centred greeting “What can I find for you?” is an `h2` at 30px / 600 on desktop and about 24px / 600 at 390px (`ChatGreeting.tsx`, `font-semibold text-2xl md:text-3xl`). That is display-scale type on an operator surface, and semibold outside listing cards. Desktop history is a dense, heavily truncated rail (a useful accessory). At 390px history is behind a 32px icon, under the 44px touch floor that `button` variants otherwise enforce with `max-sm:min-h-touch`. Suggestion chips run off the right edge. The user menu in the shell is 28px.

**Density.** Rail dense, column sparse, with a large gap between the greeting and the composer. The greeting does not need that much air. The composer does.

**Patterns.** Layout 5. The history rail stays. The greeting should be a medium deck, not a second display. Send should match other charcoal buttons at 8px, not the 5px input-group radius.

**Empty.** The new-chat greeting is the empty thread, and it works: one line of promise (“Search, compare and buy AI tools. You approve every purchase.”) and four suggestions. It should not also be the largest type on the screen.

**System.** “Find Tools” in the header still competes with the composer placeholder “Ask about any tool…”. Same job, two labels.

### 5. Credit — `/owner/credit`

**The one job:** add a specific amount of AUD credit, after seeing the fee.

**Is it primary?** The balance is. “AVAILABLE CREDIT / A$15.00” is the largest figure and the first card. Fund is the selected tab, and the amount pills (+A$5.00, +A$10.00, +A$25.00) are the right task, but “Choose an amount to continue” stays a quiet disabled button until a choice is made. The summary card is an empty bordered region (“Enter or choose an amount to see credit, fee, GST, and total.”). Desktop is a wide, left-weighted form with that void beside it. At 390px the pills fit on one line and the stack is clean, but the bottom nav covers the summary. The continue button is not on the first screen.

**Density.** Low. Two full-width cards for a balance and a not-yet-quote. That is more box than the information needs.

**Patterns.** Layout 5. Balance can be the deck’s meta (mono, in the frame), not a hero card. The summary appears when the numbers exist. One primary: the amount and the fee, then the pay action.

**Empty.** The pre-amount summary is an empty state pretending to be a card. Ledger was not opened.

**System.** Mono on the dollar figure is right. The eyebrow “AVAILABLE CREDIT” is legal. The page title in the shell is the 24px / 400 workbench title, then the balance outranks it. Links to payment methods, spending defaults, and receipts are a second job at the bottom of a funding flow.

### 6. Activity — `/activity`

**The one job:** review Calls that need a decision, then open a receipt.

**Is it primary?** The deck says so, and “Needs attention” is the first section. The specimen has zero calls that need attention and one completed call. Filters and “Exporting 1 record / CSV / JSON” sit above the queue, so the utilities outrank the one row that exists. The recent-calls table (Call, Caller Agent, Tool, time, amount, status, purchase status, when, view receipt) is the right record, and it starts below the fold on desktop. At 390px the status pills wrap (“Needs attention 0” on a second line), CSV and JSON split, and the dashed empty panel is cut off by the bottom nav. The table is not on the first screen at all.

**Density.** Airy, then a wide table. The empty panel is the tallest object on a page whose useful content is one row.

**Patterns.** Layout 4. Attention is a filter on the same list, not a second page section with its own empty monument. Export belongs with the list, not above the empty state.

**Empty.** “No Calls need attention” and, under it, “No Calls need attention.” Same sentence twice, inside a dashed panel that resembles `empty.tsx` but does not earn a page of its own when a completed call is on the same screen.

**System.** Pills and hairlines match the kit. “VIEW RECEIPT” reads as a mono label, which fits an action column. Eight sortable columns will not become a readable table at 390px. This list should become stacked rows there, as provider tools already do.

### 7. Receipt — the completed sandbox call

**The one job:** see how this Call ended, what was charged, and what is still unresolved.

**Is it primary?** Yes, more than the other operator screens. “Call outcome” leads, with “Complete” in a green pill that includes the word, then Delivery Delivered and Payment Settled as separate labels, then Charged A$0.01 and Exact amount AUD 0.001424. That split of delivery, payment, and money matches the contract: a green payment must not stand in for delivery, and here they are both written. “Get help” and “Back to Calls” are above the card. “View Tool” is secondary, with the honest line “No verified Provider or directory Host link is recorded for this Call.” At 390px the outcome still leads and the money rows stack. The shell title truncates the Tool name. The call reference wraps to three lines and makes the card tall. The date row falls into the bottom nav.

**Density.** Moderate. Key/value rows, not a dashboard. The outcome card, a Request disclosure, and an Output card are three surfaces. They are siblings, not a card inside a card.

**Patterns.** Layout 2, closure variant. This is the best operator composition in the set. The shell should show the outcome or the amount when the title truncates, not a clipped tool name.

**Empty.** Not empty. Unresolved provider is stated, not hidden.

**System.** “Call outcome” picks up semibold from `CardTitle`. Money is mono. Semantic green is used with text.

### 8. Agents — `/agent-access`

**The one job:** see each Agent’s authority and connection, and connect another.

**Is it primary?** The table is the job, and “Connect an Agent” is a clear secondary action (44px tall at 390px). The shell says “Agents” and the first section says “Agents” again. Desktop columns run Agent, Connection, Authority, Monthly spend, Last used, Status, and an actions column. At 390px it stays a table. The header row measures 832px wide while the page `scrollWidth` stays 368, so the extra columns are clipped inside the scroller rather than restacked. The visible row shows an agent initial (“G…”), Sandbox, Direct key, and “Work within limits.” Spend, last used, and status are off the first screen, and no scrollbar is obvious. “Manage Agent keys” is a text link, easy to miss next to the button.

**Density.** The table is the right density. The duplicated heading is not.

**Patterns.** Layout 4. Under 390px this list should use the same stacked rows as provider tools. A clipped desktop table is not a narrow layout.

**Empty.** This workspace has agents, so the empty connect state was not on screen. `AeAgentAccessHome.tsx` still has a semibold “Connect an Agent” heading for that state. It should be the same empty component as Activity.

**System.** Workbench frame, hairline table, charcoal button. The second “Agents” heading and the non-stacking table are the breaks.

### 9. Settings — `/owner/settings`

**The one job:** pick a section and change it.

**Is it primary?** At 390px, yes. The index is the page: “Choose what you want to manage.”, then ACCOUNT, WORKSPACE, and BILLING groups of full-width rows with chevrons, about 48px tall. That is a real mobile index. On desktop, no. A 30px / 700 “Settings” sits above a 15rem nav, and the rest of a 1440px canvas is the sentence “Select a section from the navigation to change its settings.” Overview is selected and empty. The nav is the only control, and it does not look primary next to the bold title and the blank column.

**Density.** Desktop is the sparsest screen in the set, and the emptiness is not an empty state. It is an unused region. Mobile density is right for touch.

**Patterns.** The frame should be layout 3, with the shell title and no second h1. The 390px grouped list is a good index, but it should be the narrow behaviour of the same nav, not a second type scale (`font-semibold` 24px versus the shell’s 24px / 400, plus the hidden desktop `h1` still in the DOM at 30px / 700). Section screens, not opened here, should be layout 5.

**Empty.** The desktop overview is an empty state that does not use `empty.tsx` and offers no next section. The mobile index does not need an empty illustration. It is the navigation.

**System.** Direct break: `font-bold` page title, uppercase semibold group labels that are heavier than the contract’s medium eyebrow, and a layout that exists only here.

### 10. Provider Add Tool — `/owner/operations/new`

**The one job:** name the source you already run, then continue.

**Is it primary?** The stepper is clear: 1 Source is dark, 2 Tool, 3 Terms, 4 Review are quiet. The step heading “Source” repeats the page deck (“Connect a Tool you already run…”). x402 is the featured source, marked “Recommended for alpha,” with environment and method as two-up radio cards. There is no Next, Back, or Save on the first screen at either width. The form is the right column, and then it runs out of viewport. At 390px the four steps fit, which is good, and the bottom nav sits on the method help. The consequence button, if it exists, is below that.

**Density.** Low to moderate, consistent label / control / help rhythm, with a larger gap before Method than between the other fields. The x402 option is a filled panel without a selected mark, so “recommended” and “selected” look alike. Sandbox and POST do show selection.

**Patterns.** Layout 5, with a stepper. The stepper is justified because this task has four steps. The primary action has to stay in view, including above the 390px bar. The duplicated deck should live once, in the frame.

**Empty.** Not an empty page. A resumed draft was not in this capture.

**System.** Shell title is the workbench 24px / 400. Field labels are sentence case. “Required” is muted, which is correct. The featured source should be a selected radio, not a one-off fill.

### 11. Provider workspace — `/owner/operations`

**The one job:** see the Tools this provider can publish, and add or open one.

**Is it primary?** “Add Tool” is a charcoal button in the deck row, and the table is the body: 2 Tools, both Draft and Unavailable, with “View status.” That is the job. The shell title is “Tools” and the section title is “Tools” again (“Tools supplied by Perth Environmental Consulting.”). Below the table, “Tool availability” says connections are “0 of 0 available,” and a further empty state says “No public Tools yet” because drafts are private. Both are true. Stacked without a change of weight, the empty state can be read as “you have no tools” after the table said you have two. At 390px the table correctly becomes stacked rows, Add Tool stays visible, and the availability block runs into the bottom nav. This is the narrow list the agents table should copy.

**Density.** Two rows in a wide table, then a full-width availability card, then an empty panel. More sections than the two drafts need. Earnings is a further heading below the fold.

**Patterns.** Layout 4 for the tool list. Availability and “no public tools” are states of those rows (a status column and a filter), not extra pages under the table.

**Empty.** “No public Tools yet” is a real empty, and it is in the wrong place: after a non-empty list, with copy cut off at the desktop fold (“Finish and publish a Tool when you”).

**System.** Add Tool is the right single action in the frame. The duplicate heading fights layout 3.

### 12. Admin overview — `/admin`

**The one job:** see whether this deployment is configured, then open the thing that is wrong.

**Is it primary?** On desktop the four configuration cards are the first facts: Formance not configured, x402 custody configured, Clerk MFA claim absent, Convex OK. They are equal cards, so “Absent” and “OK” have the same emphasis. Exact-reference search is the strongest action (charcoal Search) and it occupies the left half of the width, with empty space beside it. Exception queues and metrics first paint as plain “Loading…” lines, without the skeleton the route already has, then settle into sections. Recently viewed is a full-width hairline list. At 390px the four cards stack cleanly and the values stay readable. Search drops below the fold, so the phone screen is a status list. The header search icon is not the same control as exact-reference search.

**Density.** Low, on purpose, and a bit unfinished where a section is only a loading sentence. Card gutters are even. The search row is shorter than the cards above and the list below, so the width jumps.

**Patterns.** Layout 3 for the frame, layout 4 for queues and recently viewed. The four statuses should be one fact strip, not four peer cards that repeat the label in the value (“Formance” / “Formance: Not configured”). Literal bad states can use the semantic colours, with the words kept.

**Empty.** Not an empty overview. A loading line and a skeleton for the same wait is two patterns.

**System.** Shell title matches the other workbench pages. No bold. No gold. Status vocabulary is four phrases for one idea of health.

## What to change first

If only the hierarchy moves, in this order:

1. Put Settings on the workbench frame. Remove the bold 30px title. Let the shell say Settings. Keep the 390px grouped index as the narrow nav, not as a new type scale.
2. Make comparison a table. Align price, provider, calls, and Inspect on shared rows. At 390px, keep row labels sticky rather than stacking two essays.
3. On tool detail, delete the Start card when the listing is not callable. Make “not callable through AE” the first fact after the title, and show one price with its provenance. The button, if any, names the real next step.
4. Give record lists one narrow layout. Activity and agents should stack rows the way provider tools already do. Stop clipping eight columns inside 390px.
5. Keep the task primary above the bottom bar. Credit’s continue, Add Tool’s next step, and the receipt’s date need padding equal to that bar. Do not truncate the receipt’s only name.

Market discover stays as it is. It is the reference, not the patient. The tools-index hero and the chat greeting should step down toward it, not the other way around.

## Screenshots

| Screen | Desktop | 390px |
| --- | --- | --- |
| Market | [market-desktop.png](screenshots/market-desktop.png) | [market-390.png](screenshots/market-390.png) |
| Tool detail | [tool-desktop.png](screenshots/tool-desktop.png) | [tool-390.png](screenshots/tool-390.png) |
| Compare | [compare-desktop.png](screenshots/compare-desktop.png) | [compare-390.png](screenshots/compare-390.png) |
| Chat | [chat-desktop.png](screenshots/chat-desktop.png) | [chat-390.png](screenshots/chat-390.png) |
| Credit | [credit-desktop.png](screenshots/credit-desktop.png) | [credit-390.png](screenshots/credit-390.png) |
| Activity | [activity-desktop.png](screenshots/activity-desktop.png) | [activity-390.png](screenshots/activity-390.png) |
| Receipt | [receipt-desktop.png](screenshots/receipt-desktop.png) | [receipt-390.png](screenshots/receipt-390.png) |
| Agents | [agents-desktop.png](screenshots/agents-desktop.png) | [agents-390.png](screenshots/agents-390.png) |
| Settings | [settings-desktop.png](screenshots/settings-desktop.png) | [settings-390.png](screenshots/settings-390.png) |
| Provider Add Tool | [add-tool-desktop.png](screenshots/add-tool-desktop.png) | [add-tool-390.png](screenshots/add-tool-390.png) |
| Provider workspace | [provider-desktop.png](screenshots/provider-desktop.png) | [provider-390.png](screenshots/provider-390.png) |
| Admin overview | [admin-desktop.png](screenshots/admin-desktop.png) | [admin-390.png](screenshots/admin-390.png) |
