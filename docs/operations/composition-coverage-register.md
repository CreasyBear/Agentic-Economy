# Composition coverage

Audit only. Each human route has **Good** (the job, blind to source) and **Seen** (skill findings). No fixes in this file.

Buyer-spine jobs are from `docs/operations/buyer-journey-baseline.md`. Later pages use `docs/operations/platform-screen-specs.md`. Source only. Machine routes are not pages.

Judgement after this audit follows [`composition-wave-protocol.md`](./composition-wave-protocol.md). Seen rows stay the record of what is there. Approach and Morph are the decision for a route, not a rewrite of Seen.

`/tools/…` is the completed per-row specimen. Every other heading owes a full wave. A cleared frame does not finish a heading.

## Platform ledger

Shared constructors. Later routes still judge their own rows. Cite this list so the same constructor is not given two morphs.

- Programmatic focus plus `focus:outline-none` is a Blocker on the focused surface. Restore a visible `focus-visible` ring. Specimen: `/tools/…` row 1, `AeToolInspector.tsx:126`. The same constructor on `AeOperatorPage` main is Platform: fix that shell once (`/agent-access` row 2).
- Swapping distinct `role="status"` nodes is a Blocker. One region; its text changes. Specimen: `/tools/…` row 2, `AeDirectoryToolCanonicalPage.tsx:57`.
- Outer `ae-rail` around `AePageHeader` is Platform. The header owns the rail. Specimen: `/tools/…` row 4.
- Caption token at 10px, or a one-off 11px price label, is Platform. Do not restyle one route. `text-pretty` on body copy is Refuse. Specimen: `/tools/…` row 7.
- Copy/Check icon remount is Refuse unless that control is the job. Specimen: `/tools/…` row 8, `AeCopyReference.tsx`.
- The shared select is `text-sm` at every width (`select.tsx:34`). Input is `text-base` until `md`. Align the select once. Specimen: `/calls/$callRef` row 5. Do not patch one page’s select.
- “Catalog”, or three names for one `/market` exit, is a Blocker. “capability”, “descriptor”, and title-case “Check Status” are Platform copy. Specimen: `/tools/…` rows 5 and 6.
- A truncating `AeRecordHeader` `h1` gets `title={title}` and keeps truncate. Specimen: `/calls/$callRef` row 5, `AeRecordHeader.tsx:49`. Do not wrap the title or add a second heading.
- `text-xs` on a focusable field that is not the job is Platform: drop the override so the shared control stays 16px. The same override on the control that does the job is a Blocker. Specimen: `/owner/operations/$toolRef` row 5, `JsonPayloadEditor.tsx:53`.
- Person-facing “AE” is Platform copy: say Agentic Economy. Do not rename internal identifiers. Specimen: `/owner/operations/new` row 5.
- The public document shell does not move focus into `#main-content` after client navigation. Operator chrome does. Fix `AePublicPage` once. Specimen: `/developers/api` row 1, `AePublicPage.tsx:71`. Do not patch one public page. Ask’s refuse of focus-to-main does not apply to a document route.
- `AeAdminReadbackPanel` names Object and Correlation both “View reference”, and announces resting “Readback available” with `role="alert"`. The shared `RefDisclosure` trigger also needs a 24px hit floor (aim 44). Fix that panel once. Specimen: `/admin/index-health` rows 1 and 2, hit area from `/admin/audit-events` row 1. Do not morph it again per page. Empty copy is supplied by the page: index health says no index failures; audit says no audit events.
- `AeSiteFaq` nests a second rail inset inside a rail. Fix that shared FAQ once. Specimen: `/for-agents` row 2, `AeSiteFaq.tsx:25`. Do not restyle one door.
- Section headings in `AeSiteUtilityDocument` are not focusable from the contents list. Add `tabindex={-1}` on those headings once. Specimen: `/privacy` row 1, `AeSiteUtilityDocument.tsx:82`. Terms cites this. Do not patch one notice.
- On `AeSiteUtilityDocument`, company destinations sit above the article below `lg` and own the leading column at large widths. The article leads. Company links trail. Fix that shell once. Specimen: `/terms` row 1, `AeSiteUtilityDocument.tsx:21`. Do not restyle one notice.
- The shared auth stage opts out of clipping, then the browser frame sets `overflow-hidden`. Rail gutter and page padding stack on a phone. One overflow story and one inset, on `AeSiteAuthStage` / `AeSiteBrowser` / `AeSiteAuthPanel`. Specimen: `/sign-in/$` row 2. Sign-up and onboarding cite this. Do not patch one auth page. Clerk internals stay unscored.

## `/market`

Job: open one listing that fits the need. Saved: reopen a shortlist.

**Good.** The need ask is first. The one action is open a listing, from the shortlist, from Saved, or after Compare. Many peers show as a shortlist with listed price and Provider, or an honest no-fit. Not Quote, Call, or a modality exit.

**Seen.** Source only. Skills read before code. Consolidated; one row per root cause. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | HIGH | Accessibility | `DirectoryHero.tsx:33` | Hover `scale-105` still applies when reduced motion is on; only the transition is removed. |
| 2 | MEDIUM | Accessibility | `AeX402Directory.tsx:339`, `DirectoryHomeDiscovery.tsx:58` | Accessible names drop the visible label (“Load more”, “View collection”). |
| 3 | MEDIUM | Accessibility | `AeX402Directory.tsx:242`, `:182`, `:227` | Result count is not a live region. Compare tray `aria-label` sits on a plain `div`. Changing tab does not move focus; the document title stays fixed (`market.tsx:43`). |
| 4 | MEDIUM | Accessibility | `DirectoryFilters.tsx:45`, `DirectoryExplorerFilters.tsx:81` | Invalid filters render an alert without focusing the field. Explorer sets `aria-invalid`; the older filter form does not. |
| 5 | MEDIUM | Layout | `AeX402Directory.tsx:75`, `:265` | Indexed Tools append every page of 24 into one grid. Saved maps the stored list up to 100. |
| 6 | MEDIUM | Layout | `AeX402Directory.tsx:236`, `:247` | The leading tab is Tools while the default view is Collections, and that tab mounts index shelves and six editorial rails together. |
| 7 | MEDIUM | Layout | `DirectoryFilters.tsx:24` | Clear and Show results sit inside the scrolling sheet body. |
| 8 | MEDIUM | Writing | `DirectoryHero.tsx:38`, `directory-card.view-model.ts:67` | “one Call away.” and “Used recently by other agents” are on the hero and on cards. |
| 9 | MEDIUM | Writing | `DirectoryHomeDiscovery.tsx:66`, `AeX402Directory.tsx:330` | Empty collection and empty results describe the miss and do not name an exit. “Open All Tools” sits next to “Browse all Tools”. |
| 10 | MEDIUM | Typography | `globals.css:167`, `DirectoryToolCard.tsx:55`, `DirectoryHomeDiscovery.tsx:53` | Caption token is 10px. Price kicker is 11px. Collection labels are 10px. |
| 11 | MEDIUM | Typography | `DirectoryExplorerFilters.tsx:49` | Facet search forces `text-xs`, under 16px on a phone. |
| 12 | MEDIUM | Colors | `DirectoryHero.tsx:31`, `AeX402Directory.tsx:338` | Hero uses `foreground` as the fill and `background` as the text, over a translucent photo. Load-more failure is `text-muted-foreground` on `role="alert"`. Contrast not verified from source. |
| 13 | MEDIUM | UI | `DirectoryToolCard.tsx:27`, `button-variants.ts:9` | Every card lifts on hover. Press scale is `0.98` on the shared button. |
| 14 | MEDIUM | Cognitive load | `AeX402Directory.tsx` Collections and Tools | Source-only. Collections stacks two discovery systems and about 60 cards. Search, job pills, Save, and Compare compete with opening a listing. Tools can show up to 128 category choices before a card. |

Layout physical left/right utilities, separator-plus-gap grouping, and decorative icons missing `aria-hidden` were reported and folded into the rows above where they share a cause. Providers tab was outside this view set.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Block (one HIGH). Not verified in the browser.

**Approach.** 2026-09-22 full wave. Layout, cognitive load, Rams, accessibility, writing, typography, colors and UI. Not built. Seen rows stay.

The frame fails. Tabs (`AeX402Directory.tsx:227`) look like filters and mount different trees. Collections is the page that works: `DirectoryHomeDiscovery`, job chips, named rails, carousel of `DirectoryToolCard`. Rams vetoes flattening those rails. Tools is see-all of that section as a grid. Providers and Saved keep their own cards and the same section header and card width. The hero does not collapse when the view changes (`:195`). Tab changes keep scroll (`:227`, `resetScroll: false`).

**Row 1. Blocker.** The poster still scales on hover when reduced motion is on (`DirectoryHero.tsx:33`); only the transition is removed. Accessibility called this Platform because the card can still be opened. It is a Blocker: the person asked the page to hold still, and the hero does not. Put the scale behind `motion-safe:`. Do not redesign the poster.

**Row 2. Platform.** “Load more” and “View collection” drop the visible label from the accessible name (`AeX402Directory.tsx:339`, `DirectoryHomeDiscovery.tsx:58`). The controls still work. The name must contain the visible words.

**Row 3. Platform.** The result count is not a live region (`:242`). The Compare tray’s name sits on a plain `div` (`:182`). The document title stays fixed (`market.tsx:43`). Tab change does not move focus, and it should not: focus stays on the tab. Do not invent a new tray.

**Row 4. Platform.** Invalid filters paint an alert and do not focus the field. The explorer sets `aria-invalid`; the older sheet does not. Mark the field and focus it. This is the filter control, not Collections.

**Row 5. Refuse.** Appending 24 and listing up to 100 saved cards is the shortlist growing. A second pagination layout would sand see-all.

**Row 6. Blocker.** Collections also mounts `DirectoryIndexDiscovery` (`:248`), and the first tab is Tools while the page opens on Collections (`:236`). Unmount the shelves. Collections is the first tab. The rails stay.

**Row 7. Platform.** Clear and Show results scroll away inside `DirectoryFilters`. Pin them the way `DirectoryExplorerFilters` already pins its footer. If that sheet remains after Tools stops being a second page, this still applies.

**Row 8. Blocker, and a refusal.** “one Call away.” (`DirectoryHero.tsx:38`) is a false next step. A human opens a listing. The line becomes listed Tools. “Used recently by other agents” stays. It is an activity fact, not a layout change.

**Row 9. Blocker, and a refusal.** Empty collection copy sends the person into search (`DirectoryHomeDiscovery.tsx:66`). See-all is the one exit. Chips and “View collection” scroll to the rail. Home empty says “Open All Tools” beside “Browse all Tools” and “catalogue” (`AeX402Directory.tsx:250`). One label: See all Tools. The filtered-empty body that says try another description stays: Clear filters is already in the chrome.

**Row 10. Platform.** Caption token 10px, price kicker 11px, collection labels 10px. Cite the ledger. Do not restyle Collections alone.

**Row 11. Blocker.** Facet search forces `text-xs` on an `Input` (`DirectoryExplorerFilters.tsx:49`), under 16px on a phone, so the control used to find a listing can zoom the page. Drop that override. The shared input already stays 16px until `md`. This stays with the filter control wherever that control sits. It is not a new Market layout.

**Row 12. Refuse.** Hero and load-more alert contrast were not measured. Do not repaint from source tokens.

**Row 13. Platform.** Press scale `0.98` on the shared button becomes `0.96` (`button-variants.ts:9`). That is the button constructor, not this page. Card hover lift does not stop opening a listing, and the card already drops the transform under reduced motion. Rams would drop the lift. I leave it. Deleting it is decoration, not the job.

**Row 14. Blocker.** Same defect as row 6: two discovery systems, then Save and Compare beside the open action, and Tools can put a facet list before a card. Cut the second system and the facet page. Do not cut Save, Compare, search, or the rails.

**Morph.** Leave `DirectoryHomeDiscovery.tsx` as the Collections body. Do not pull it into a generic header. Do not put its carousel or job chips on the other tabs.

1. Freeze the shell. `AeX402Directory.tsx:195`: stop setting `compact` because the view is not Collections. Tab `navigate` (`:227`) gets `resetScroll: false`.
2. Collections paints only `DirectoryHomeDiscovery`. Unmount `DirectoryIndexDiscovery` at `:248`. Collections is the first tab (`:236`). Chips and “View collection” scroll to the rail.
3. Tools is that section as a grid: header rhythm, `toolGrid`, load more (`:172`, `:335`). The `13rem` facet column (`:285`) leaves the card field. Filters, if they stay, sit in section chrome.
4. Saved and Providers keep their own cards and the same section header and card width.
5. Hero: `motion-safe:` on the scale (`DirectoryHero.tsx:33`). “one Call away.” becomes listed Tools (`:38`). Home empty uses one See all Tools label (`AeX402Directory.tsx:250`).
6. Facet find inputs drop `text-xs` (`DirectoryExplorerFilters.tsx:49`).

Platform, not this morph: rows 2, 3, 4, 7, 10, and the shared press scale in row 13.

Refused: one flat grid instead of the rails. Carousels or job chips on Tools, Providers, or Saved. Hiding Tools. Removing search, Save, or Compare. A new layout component. Repainting the hero. Rewriting “Used recently by other agents.” Moving focus into the tab panel on every tab change.

## `/tools/…`

Job: continue with an Agent, or connect one.

**Good.** One Tool, not a browse. First: title, Provider, listed price (not a Quote), readiness, and the unmet prerequisite if any. One action: Continue with your Agent, or Connect an Agent. Many means more facts about this Tool, not peer Tools. Done when it can go into an existing Agent. Not Reserve. Not Top up as the commit.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | HIGH | Accessibility | `AeToolInspector.tsx:132` | The article that receives focus on mount uses `focus:outline-none` with no visible replacement. |
| 2 | MEDIUM | Accessibility | `AeDirectoryToolCanonicalPage.tsx:57` | Pending and resolved readiness swap distinct `role="status"` nodes instead of one stable region. |
| 3 | MEDIUM | Layout | `AeDirectoryToolCanonicalPage.tsx:50` | On the not-yet-admitted summary, the description comes before the listed price. |
| 4 | MEDIUM | Layout | `PublicToolDetail.tsx:87`, `AeDirectoryToolCanonicalPage.tsx:42` | Page rail wraps `AePageHeader`, which already applies `ae-rail`, so the header is double-inset. |
| 5 | MEDIUM | Writing | `PublicToolDetail.tsx:92`, `public-tool-detail.contracts.ts:45` | The market exit is “Catalog”, “Browse current Tools”, and “Browse Tools”. |
| 6 | MEDIUM | Writing | `tools.$toolRef.tsx:62`, `tools.$providerHost.$slug.tsx:39`, `AeToolNextAction.tsx:67` | Pending and refusal copy uses “capability”, “descriptor”, and `tool.quote`. “Check Status” is title case (`public-tool-detail.contracts.ts:63`). |
| 7 | MEDIUM | Typography | `AeToolPrice.tsx:25` | The price label is 11px. Descriptions on the summary and next action omit `text-pretty`. |
| 8 | MEDIUM | UI | `AeCopyReference.tsx:36` | Copy and Check swap by mounting one icon. No cross-fade. |
| 9 | MEDIUM | Cognitive load | `AeToolNextAction.tsx` | Source-only. Overview shows economics, four metrics, and a chart before the next-action aside. “Tool reference” and outline “Connect an Agent first” share that aside. The contract label “Continue with your Agent” is not on the page. |

**Clear.** Colors: semantic tokens only on the page modules. Contrast of muted text was not verified from source. The not-yet-admitted slug is a short identity, price, and readiness stack.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Block (one HIGH). Not verified in the browser.

**Approach.** 2026-09-22. Frame question cleared. Every Seen row judged. Not built.

Overview and Contract (`AeToolInspector.tsx:79`) swap panels inside one article. The header and `AeToolNextAction` stay mounted. Schemas is a sheet. `Await` (`AeDirectoryToolCanonicalPage.tsx:30`) is admission loading, not a filter that mounts another product. Accessibility called that Await a composition swap. It is not Market’s tab split, and it is not this morph.

The page fails its job in the commit slot, not in the frame. On a routeable Tool, `tool-inspector-model.ts:52` sets the action to copy a command labeled “request for Agent”. Connect is a text link under that copy (`AeToolNextAction.tsx:66`, “Need to connect an Agent?”). When the Tool is not routeable, the same slot navigates to peer Tools (“Find Tool alternatives”, `:57`). Good’s one action is Continue with your Agent, or Connect an Agent. Peer Tools are forbidden as the many. The dossier (economics, four metrics, chart) stays: Good allows more facts about this Tool. The aside stays below that dossier. Moving it above Overview would put a button before listed price and readiness, which the header does not carry (`PublicToolDetail.tsx:88` is title and Provider only). Fix the verb in the slot that exists. Do not reorder the article to make a false button louder.

**Row 1. Blocker.** The full article is focused on mount (`AeToolInspector.tsx:48`) and then strips the ring (`:126`; Seen cites `:132`). A keyboard user cannot see that they landed on this Tool. Restore a visible `focus-visible` ring on that article. Keep `tabIndex={-1}` and the `focus()` call.

**Row 2. Blocker.** Pending and resolved readiness mount two different `role="status"` nodes (`AeDirectoryToolCanonicalPage.tsx:57`). Readiness is a first fact, and a swapped live region often never announces. One region stays mounted; its text changes.

**Row 3. Blocker.** On the not-yet-admitted summary, the description sits above the listed price (`:50`). Good says price is with the first facts. Swap those two blocks on that summary only. Layout called this Platform. It is this page’s order, not a shared token, and it does not touch the inspector.

**Row 4. Platform.** `PublicToolDetail.tsx:87` and the summary at `AeDirectoryToolCanonicalPage.tsx:42` wrap `AePageHeader`, which already applies `ae-rail`. Drop the outer rail; let the header own the inset, and rail the body under it. Same constructor on both shells. Not a new page.

**Row 5. Blocker.** One exit, three names: “Catalog” (`PublicToolDetail.tsx:92`, summary `:47`), “Browse current Tools”, and “Browse Tools” (`public-tool-detail.contracts.ts:45`), all to `/market`. Catalog is the wrong place. Writing called this Platform because it is not the Agent commit. The back control still lies about where it goes. One label: “Browse Market”. Same string in the contracts module and both headers.

**Row 6. Platform.** Pending and refusal still say “capability” (`tools.$toolRef.tsx:62`), “descriptor” (`tools.$providerHost.$slug.tsx:39`, `PublicToolDetail.tsx:56`), and title-case “Check Status” (`public-tool-detail.contracts.ts:63`). Those become “Loading this Tool…”, “this Tool”, and “Check status”. The Seen cite `AeToolNextAction.tsx:67` does not match the file: that line is “Need to connect an Agent?”, which is the job’s other action. Do not rewrite it in the copy pass. That fight is row 9.

**Row 7. Platform, and a refusal.** The price label is 11px on shared `AeToolPrice` (`:25`). The caption token is 10px. The floor is 12px. Changing only this listing would fake a scale. Raise the shared price label with the caption token, or leave both until that token moves. Do not add `text-pretty` to the next-action description. The summary and the next-action title already wrap. That omission does not hide the price or the action.

**Row 8. Refuse.** Copy and Check remount one icon in `AeCopyReference`. The control is not Continue or Connect. Toast, status text, and the label already answer whether the copy worked. A cross-fade would sand attention onto a secondary control.

**Row 9. Blocker on the verb. Refuse on the dossier.** `tool-inspector-model.ts:50`: routeable becomes copy “request for Agent”; otherwise “Find Tool alternatives”. The connect link only renders on the copy path, so the case that needs Connect is the case that offers peer Tools. In that same aside, the primary control reads “Continue with your Agent” when the Tool can go into an Agent, and “Connect an Agent” (`/agent-access?resumeTool=`) when it cannot. The copy payload may stay as how a human hands the Tool to an Agent today; the button may not keep the internal label. Do not delete economics, the four metrics, or the chart. Do not move `AeToolNextAction` above Overview in this morph.

**Morph.** No new component. Overview, Contract, and Schemas stay.

1. Ring on the focused article (`AeToolInspector.tsx:126`).
2. One readiness region on the summary (`AeDirectoryToolCanonicalPage.tsx:57`). Price block before the description (`:50`).
3. Outer `ae-rail` off both shells that wrap `AePageHeader`. Header keeps its own rail.
4. Exit strings: “Browse Market”. Pending and refusal: Tool, not capability or descriptor. “Check status”.
5. `tool-inspector-model.ts:50` and `AeToolNextAction.tsx:45`: the primary control is Continue with your Agent, or Connect an Agent. Peer-Tool navigation is not that control.

Refused: a Market-style tab morph; deleting the dossier; moving the aside above Overview before price and readiness are in the first stack; `text-pretty` as a fix; a Copy/Check cross-fade; rewriting “Need to connect an Agent?” as if it were the jargon in row 6.

## `/t/new`, `/t/$threadId`, `/s/$shareToken`

Job: keep a few candidates and use one with an Agent.

**Good.** Opens on the candidates, each with the Market card facts. The one action is Use this with your Agent. Many peers stay a shortlist in front; the long thread stays supporting context. No Quote or Call for this session. A share is read-only: the link can follow the keep, not buy.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | HIGH | Accessibility | `ChatHistory.tsx:140`, `:150` | Rename and Delete stay `opacity-0` at `lg` and remain in tab order. The hover/focus classes target `group`, while the row is `group/item`. |
| 2 | MEDIUM | Accessibility | `ChatComposer.tsx:50` | Enter submits. Shift+Enter is the newline. |
| 3 | MEDIUM | Accessibility | `ChatHeader.tsx:46`, `ChatTranscript.tsx:40` | With messages, the stage title is a `<p>`, not a heading. Pending status announces “Search the catalog.” Routes do not move focus to `<main>` on client navigation. |
| 4 | MEDIUM | Layout | `SharedChat.tsx:15` | A share takes one page of 20 messages and renders no remaining-count or load-more cue. |
| 5 | MEDIUM | Layout | `ChatTranscript.tsx:40` | Pending skeletons sit in a gutter grid. The loaded transcript is a `max-w-3xl` column. |
| 6 | MEDIUM | Writing | `chat-ia.ts:36`, `:96`, `:6` | “Browse Tools” and “Browse market”. Empty title is “Search the catalog.” under a stage title “Ask”. |
| 7 | MEDIUM | Writing | `chat-ia.ts:7`, `ToolCard.tsx:170` | Copy says “call” and “canonical result”. Product term is Call. Empty history and unavailable threads do not name a next step (`chat-ia.ts:52`, `t.$threadId.tsx:43`). |
| 8 | MEDIUM | Typography | `ChatHeader.tsx:69` | The share-link input is `text-xs` (12px) on a focusable field. |
| 9 | MEDIUM | UI | `ChatHeader.tsx:72`, `ChatComposer.tsx:70` | Copy/Check and Send/Spinner swap by mounting one icon. Composer and share field nest the same radius on InputGroup and Button. |
| 10 | MEDIUM | Cognitive load | `ChatHeader.tsx`, `ChatTranscript.tsx` | Source-only. Empty new has two first lines (“Ask” and “Search the catalog.”) and New chat in both the header and the rail. Execute cards stack alert, output, facts, refs, and a next action. Shared stays read-only, which matches the job. |

**Clear.** Colors: semantic tokens only. Contrast of muted text and `bg-muted/35` was not verified from source.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Block (one HIGH). Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. Empty, thread, and history stay one chat frame. Share is its own read-only route, not a filter that remounts Ask. The part that works is the candidate shortlist with Market card facts. Rams vetoes flattening that shortlist into the thread, and vetoes a buy button. This session does not Quote or Call.

**Row 1. Blocker.** Rename and Delete stay `opacity-0` at `lg` and stay in tab order. The reveal targets `group` while the row is `group/item` (`ChatHistory.tsx:140`, `:150`). Fix the group name so focus shows them, or keep them visible. Do not delete the actions.

**Row 2. Platform.** Enter submits on a textarea (`ChatComposer.tsx:50`). Shift+Enter already inserts a newline, so the person can write a multi-line need. Disclose that chord on the field. Do not replace Enter-to-send.

**Row 3. Blocker on the pending line. Platform on the heading. Refuse on focus.** Pending status announces “Search the catalog.” (`ChatTranscript.tsx:40`). That is a false next step while the thread is loading. Say the conversation is loading. With messages, the stage title is a `<p>` (`ChatHeader.tsx:46`). Make it a heading. Do not move focus to `<main>` on every thread change. That would take the caret out of the composer.

**Row 4. Blocker.** A share asks for one page of 20 and paints it as the whole keep (`SharedChat.tsx:15`). When more remains, show a load-more cue on that same transcript and advance the cursor. Do not build an archive page. The share stays read-only.

**Row 5. Blocker.** Pending skeletons sit in a gutter grid. The loaded transcript is `max-w-3xl` (`ChatTranscript.tsx:40`). Put the skeletons in that same column. Do not stretch the transcript to the gutter.

**Row 6. Blocker.** “Search the catalog.”, “Browse Tools”, and “Browse market” (`chat-ia.ts:6`, `:36`, `:96`). The place is Market. One exit label: Browse Market. The empty title becomes “Find Tools for an Agent.” The stage name Ask stays.

**Row 7. Blocker, and a refusal.** “then call” (`chat-ia.ts:7`) teaches this session to purchase. It becomes “Compare and inspect. Then use one with your Agent. Price is on the card.” “canonical result” (`ToolCard.tsx:170`) becomes “Open the Call receipt for the full result.” Empty history and an unavailable thread do not grow a new next-step sentence. New chat and Ask already carry that.

**Row 8. Platform.** The share URL input is `text-xs` (`ChatHeader.tsx:69`). It is a real field, and a phone will zoom it. Copy already shares the keep without focusing that field, so this is not the job’s action. Drop `text-xs` so the shared input stays 16px on a phone. Do not restyle the transcript.

**Row 9. Refuse, and Platform.** Copy/Check and Send/Spinner remount one icon. The labels already change. The job’s action is Use this with your Agent. Do not cross-fade them. Nested `rounded-md` on InputGroup and Button is the shared pair. Fix that constructor once. Do not restyle chat alone. Press scale stays the Market ledger (`0.98` to `0.96` on the shared button).

**Row 10. Blocker, Platform, and Refuse.** Empty new has two first lines, “Ask” and “Search the catalog.” One first line: the stage is Ask, and the empty body is the row 6 sentence, not a second title. “New chat” in the header and the rail is Platform: keep it on the rail. Execute cards that stack alert, output, facts, refs, and a next action are a Blocker. The front stays the choice shortlist. A Call result, if it must appear, is one status line and a handoff off this session. Shared read-only stays. Do not make the link editable or purchasable.

Colors stay Clear. Muted text and `bg-muted/35` were not measured. Do not repaint.

**Morph.** No new component. The choice shortlist stays in front.

1. History actions reveal on `group/item` (`ChatHistory.tsx:140`, `:150`).
2. Share shows a remaining cue when the page of 20 is not the end (`SharedChat.tsx:15`). Skeletons use the transcript column (`ChatTranscript.tsx:40`).
3. Strings in `chat-ia.ts` and `ToolCard.tsx:170`, as in rows 6 and 7. Pending status stops saying “Search the catalog.”
4. Empty state has one title. The execute stack is not the front of Ask (`ToolCard.tsx` execute body).

Platform, not this morph: rows 2, 8, the stage heading in row 3, the second New chat, and the InputGroup radius in row 9.

Refused: flattening candidates into thread bubbles. A buy, Quote, or Call button on Ask or on a share. Moving focus to main on every navigation. A chat-only type scale. Icon cross-fades. An archive browser for shares.

## `/agent-access`

Empty job: connect an Agent. Returning job: see who is connected and what they may do.

**Good.** Empty opens on Connect, and that is the only primary action. Returning opens on the Agents already granted, each showing policy, limits, and Tools. The action then is tighten the grant. Many Agents stay a roster of those four facts. Credit never stands in for the grant.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | HIGH | Accessibility | `AgentLifecycleConfirmDialog.tsx:50` | Revocation mode options are `role="button"` with `tabIndex={-1}`, so they are not in the tab order. |
| 2 | MEDIUM | Accessibility | `AeOperatorPage.tsx:205` | The `<main>` that is the navigation focus target uses `focus:outline-none` with no replacement. |
| 3 | MEDIUM | Accessibility | `AeConnectAgentWizardDialog.tsx:118`, `EnvironmentRadioCards.tsx:12`, `AgentNameField.tsx:10` | Submit stays disabled until the name is valid. Radio groups have no group name. The name field’s helper and count are not described. |
| 4 | MEDIUM | Layout | `HomeEmptyInstallPanel.tsx:14`, `AeAssistantInstallFunnel.tsx:32` | Empty stacks “+ Connect New Agent” and an already-open install funnel. |
| 5 | MEDIUM | Layout | `AeKeyRevealDialog.tsx:206` | The dialog scrolls as one region, including Done, so the close action can leave the viewport. |
| 6 | MEDIUM | Writing | `HomeEmptyInstallPanel.tsx:17`, `AeAgentOperatorConsole.tsx:130`, `suggested-next-action.ts:79` | Connect is “+ Connect New Agent”, “Connect an Agent”, “Connect another Agent”, and “Connect agent”. “Spending Policy”, “Edit Limits”, and “Graceful Drain” are title case. |
| 7 | MEDIUM | Writing | `brand-copy.ts:65`, `:68` | “Open Agents” and “Review Spending policy” both go to `/agent-access` from this page. |
| 8 | MEDIUM | Typography | `AeCollectionRail.tsx:30`, `AeRecordHeader.tsx:49` | The empty-state kicker is the 10px caption token. From `sm`, the rail `h2` is larger than the page `h1`. |
| 9 | MEDIUM | Typography | `SpendingLimitInputs.tsx:69` | Spend fields force `text-sm` on mobile. |
| 10 | MEDIUM | Colors | `HomeResumeToolSection.tsx:25`, `AeAgentOperatorConsole.tsx:130` | With a resume Tool and a connected Agent, “Return to selected Tool” and “Connect an Agent” are both filled primary. |
| 11 | MEDIUM | Colors | `AeKeyRevealDialog.tsx:416` | The waiting indicator uses `bg-warning-foreground` as a fill. The warning alert body stays `text-muted-foreground`. |
| 12 | MEDIUM | Cognitive load | `HomeEmptyInstallPanel.tsx`, `AeAgentOperatorConsole.tsx:130` | Source-only. Empty has two starts with different outcomes. Returning makes “Connect an Agent” more prominent than opening a row. Approvals add Approve once above the roster. |

**Clear.** UI: one nested `rounded-md` in the wizard spending well and a hard Eye/EyeOff swap in key reveal; not raised above the rows above. Contrast of muted and warning pairs was not verified from source.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Block (one HIGH). Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. Empty and returning are two states of one Agents home. Empty’s one primary is Connect an Agent, the wizard. The Codex install funnel does not sit open beside it as a second start. Returning opens on the roster. Connect on that console is outline. When a resume Tool is present, Return to selected Tool is the one filled control. Credit is not on this page. Approve once stays above the roster when a grant is waiting.

**Row 1. Blocker.** Revoke modes are `role="button"` with `tabIndex={-1}` (`AgentLifecycleConfirmDialog.tsx:50`). Tab never reaches Soft versus Immediate. Use real radios, or one tab stop and arrow keys. Do not drop the two modes.

**Row 2. Platform.** `AeOperatorPage` main is focused after navigation and uses `focus:outline-none` (`:205`). Same constructor as the listing article. Restore a visible `focus-visible` ring on that shared main. Keep the focus call. Not an Agents-only morph.

**Row 3. Blocker.** Connect stays disabled until the name is valid (`AeConnectAgentWizardDialog.tsx:118`). Enable it until the request starts, then show a spinner. On an invalid submit, mark the name and focus it. The Environment radios need a group name (`EnvironmentRadioCards.tsx:12`). The name field’s helper and count need `aria-describedby` (`AgentNameField.tsx:10`).

**Row 4. Blocker.** Empty stacks a filled “+ Connect New Agent” on an already-open install funnel. One start: the Connect button. The funnel stays in the product and does not compete as a second primary. Layout would delete the button and keep the funnel. That makes the marketing rail the home. Rams vetoes that.

**Row 5. Blocker.** Key reveal scrolls the whole dialog, so Done can leave the viewport (`AeKeyRevealDialog.tsx:206`). Scroll the body. Leave the header and Done outside it.

**Row 6. Blocker, and Platform.** Four Connect strings become “Connect an Agent” (`HomeEmptyInstallPanel.tsx:17`, `useAeAgentAccessHome.ts:335`, `suggested-next-action.ts:79`). The console label already says that. “Spending Policy”, “Edit Limits”, and “Graceful Drain” become sentence case. That is the shared button-case constructor.

**Row 7. Blocker.** “Open Agents” and “Review Spending policy” both link to `/agent-access` from this page (`brand-copy.ts:65`, `:68`). Unmount those two links inside the funnel when the person is already here. Do not send Spending policy to Credit. Leave the strings for `/for-agents`, where they still leave that page.

**Row 8. Platform.** The empty kicker is the 10px caption token. From `sm`, the rail `h2` outranks the page `h1`. Cite the caption ledger. Align the shared rail and record header together later. Do not restyle Agents alone.

**Row 9. Blocker.** Spend fields force `text-sm` on a phone (`SpendingLimitInputs.tsx:69`). Those fields are tighten-the-grant. Drop the override. The shared input stays 16px until `md`.

**Row 10. Blocker.** With a resume Tool and a connected Agent, Return and Connect are both filled. Connect becomes outline on the returning console (`AeAgentOperatorConsole.tsx:130`). Return stays filled on that strip (`HomeResumeToolSection.tsx:25`). Empty Connect stays the one filled button.

**Row 11. Platform, and a refusal.** The waiting dot uses `bg-warning-foreground` as a fill (`AeKeyRevealDialog.tsx:416`). Use `bg-warning`, as the success dot uses `bg-success`. Do not repaint the warning body. Contrast was not measured.

**Row 12. Blocker, and a refusal.** Same defect as rows 4 and 10: two empty starts, and Connect louder than opening a row. Approve once above the roster stays. It is the waiting grant, and the section is absent when nothing is waiting.

UI stays Clear. Do not cross-fade Eye/EyeOff. Do not restyle the wizard’s nested radius on this page.

**Morph.** No new home.

1. Empty shows one Connect an Agent. The install funnel is not a second filled start (`HomeEmptyInstallPanel.tsx:15`).
2. Returning Connect is outline (`AeAgentOperatorConsole.tsx:130`). Resume Return stays filled.
3. Revoke modes are in the tab order. Connect submit stays enabled until the request starts. Spend inputs drop `text-sm`. Done stays outside the key-reveal scroll.
4. One Connect string. Sentence-case the three titled controls. Drop the two self-links in the on-page funnel.

Platform, not this morph: the operator main ring, the caption and heading scale, the warning-dot token, and button sentence case.

Refused: a second Agents layout. Replacing the roster with the install funnel. Credit or top-up on this page. Deleting Soft versus Immediate. Deleting Approve once. Sending Spending policy to Credit.

## `/agent-access/authorize`

Job: approve or decline this grant.

**Good.** Opens on the grant: who the Agent is, what it may do, and the limits. The one action is Approve or Decline. Many Tools or limit facts stay a readable stack under that decision. The page does not start an Agent, fund a wallet, or become settings.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Accessibility | `ConsentDecisionBar.tsx:27` | Approve stays disabled until connection, tool, or replacement preconditions hold. Pending labels become “Connecting…”, “Replacing…”, and “Working…”. |
| 2 | MEDIUM | Accessibility | `ConsentToolAccessFieldset.tsx:49`, `:75` | Empty selection and search failure are alerts only. The search field is not marked invalid, and Enter does not run the search. |
| 3 | MEDIUM | Accessibility | `AeAgentAccessAuthorizeForm.tsx:46` | Approved, denied, and error replace the form, including the focused control, with no focus move. |
| 4 | MEDIUM | Layout | `ConsentDecisionBar.tsx:20` | Approve and Decline sit at the bottom of a card that grows with tool lists and search results. |
| 5 | MEDIUM | Writing | `ConsentRequestFacts.tsx:24`, `AeAgentAccessAuthorizePage.tsx:26`, `protocol.ts:323` | Duration reads “until in N days”. The page says “agent”; the home says “Agent”. Limits mix “Calls” and “calls”. A zero-result Tool search has no empty copy (`ConsentToolAccessFieldset.tsx:76`). |
| 6 | MEDIUM | Typography | `ConsentToolAccessFieldset.tsx:57`, `:80` | Tool refs truncate with no title or expand path. |
| 7 | MEDIUM | Cognitive load | `AeAgentAccessAuthorizeForm.tsx` | Source-only. The ready form shows connection, authority, tools, and a fact list that restates the radios, then Approve. Expanded Replace and Selected Tools push the decision below that stack. |

**Clear.** Colors: one filled Approve, secondary Decline, semantic tokens only. Contrast not verified from source. UI: radio cards and tool rows share a radius with their parent well; no page-owned motion.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One grant card. Outcomes replace it after the decision. Who, what, and limits stay first. Approve and Decline stay on that card and stay in view while tool lists grow. One filled Approve. Decline stays secondary. This page does not start an Agent, fund a wallet, or become settings.

**Row 1. Blocker, with one gate kept.** Approve stays disabled for empty Selected Tools and for a missing replacement (`ConsentDecisionBar.tsx:27`). Those are incomplete fields, not a dead action. Enable Approve and, on activate, focus the field that is empty. Keep Approve disabled only when agent targets are unavailable: the grant body cannot be built, so Approve would be a lie. While the request is in flight, keep the original label. Do not rename it Connecting, Replacing, or Working.

**Row 2. Blocker.** Empty selection and search failure are alerts only (`ConsentToolAccessFieldset.tsx:49`, `:75`). Mark the search field invalid and point the alert at it. Enter in the field runs the search.

**Row 3. Blocker.** Approved, denied, and error replace the focused form with no focus move (`AeAgentAccessAuthorizeForm.tsx:46`). Move focus to the outcome heading or the recovery link. This is not the operator-main ring.

**Row 4. Blocker.** Approve and Decline look like a fixed footer and scroll away (`ConsentDecisionBar.tsx:20`). Scroll the grant body. Leave the bar as the card’s bottom chrome, or pin it. Do not pull Approve into the page header.

**Row 5. Blocker.** “until in N days” is a broken duration (`ConsentRequestFacts.tsx:24`). The visible line becomes “Stays signed in for 7 days after approval, unless you disconnect it first.” The page says “agent”; Agents says “Agent”. Limits mix “Calls” and “calls” (`protocol.ts:323`). A zero-result Tool search paints an empty list (`ConsentToolAccessFieldset.tsx:76`). Say “No Tools match” the query. Do not rewrite Decline, Technical details, or outcome Open Agents in this row.

**Row 6. Blocker.** Tool refs truncate with no `title` (`ConsentToolAccessFieldset.tsx:57`, `:80`). Add `title` with the full ref. Keep truncate. Do not wrap the list open, and do not send the person to `/tools/…` as the only way to read the grant.

**Row 7. Blocker on the buried decision. Refuse on deleting the grant.** The same stack as row 4 pushes Approve below Replace and Selected Tools. The bar stays visible under the facts. Cognitive would drop the fact rows that restate the radios and put Approve above the expandable work. Rams refuses that. The fact list is the grant. Keep Application, limits, and duration. Do not flatten connection, authority, and tools into a quieter summary.

Colors and UI stay Clear. Do not fill Decline. Do not repaint unmeasured contrast. Do not restyle the well’s radius.

**Morph.** No new page.

1. Grant facts stay first. The decision bar stays in view (`AeAgentAccessAuthorizeForm.tsx:47`, `ConsentDecisionBar.tsx:20`).
2. Approve stays enabled except when targets are unavailable, and except while the request is in flight with its original label.
3. Search is marked invalid and runs on Enter. Truncated refs get `title`. Focus moves to the outcome.
4. Duration, Agent, and Call strings, and a zero-result line, as in row 5.

Refused: settings or Credit on this page. Approve with no who, what, or limits. Deleting the fact list. A second consent layout.

## `/owner/credit`

Job: see available credit and add funds.

**Good.** Available credit and reserved credit come first, as two balances. The one action is Add funds: a quote, then top-up. Topping up is funding, not a purchase. Many funding events read as a quiet ledger, so the person can refuse “I topped up, so it can buy.”

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Layout | `AeOwnerCredit.tsx:179` | Under “Account balance”, order is balance, monthly cap, payment methods, auto-recharge, then “Add credit”. The first control is Set Limit / Edit Limit. |
| 2 | MEDIUM | Colors | `AeCreditTopUpPanel.tsx:249`, `AeSavedPaymentMethodsCard.tsx:230`, `AeAutoRechargeCard.tsx:296` | Pay, Add card, and auto-recharge Save can all be filled primary in the same view. Warning and critical spend bands both use `bg-warning` (`AeMonthlySpendCeilingCard.tsx:41`). |
| 3 | MEDIUM | Writing | `AeOwnerCredit.tsx:181`, `AeOwnerCreditPage.tsx:13`, `AeMonthlySpendCeilingCard.tsx:255` | Chrome says Credit. The section says “Account balance”, “Balance unavailable”, and “Balance history”. Cap controls are “Set Limit” / “Edit Limit”. Empty invoice and balance history do not name a next action. |
| 4 | MEDIUM | Accessibility | `AeAutoRechargeCard.tsx:100`, `AeMonthlySpendCeilingCard.tsx:178` | Invalid amounts render an alert only. The inputs are not marked invalid and focus stays put. Continue stays disabled until a quote exists (`AeCreditTopUpPanel.tsx:225`). |
| 5 | MEDIUM | Accessibility | `AeAutoRechargeCard.tsx:247`, `AeMonthlySpendCeilingCard.tsx:303` | The switches are `h-6 w-11`. The visible label is a sibling, not the hit target. |
| 6 | MEDIUM | Typography | `AeSavedPaymentMethodsCard.tsx:169`, `AeOwnerCredit.tsx:287` | Card initials are 10px. The “Add credit” `h3` matches the section `h2` in size and weight. |
| 7 | MEDIUM | Cognitive load | `AeOwnerCredit.tsx` | Source-only. One section holds cap, cards, auto-recharge, and top-up. Invoice history maps the collected funding commands (`ownerFundingInvoiceHistory.ts:183`). A spending cap sits on the funding page as a peer of Add credit. |

**Clear.** UI: nested `rounded-lg` on the accounting details shell; page surfaces use borders. Contrast of muted, warning, and progress bands was not verified from source.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One Credit page. Available credit is first. Add funds is the one filled action: a quote, then Pay. Pay stays disabled until that quote exists. The invoice and balance ledgers stay quiet. They do not grow a buy step. The monthly cap, saved cards, and auto-recharge are not peers of Add funds and are not a second primary. Funding is not a purchase and not authority. Do not invent a reserved figure the funding read does not supply. If reserved credit is on that read, it sits beside available. If it is not, one Available credit is the honest first fact.

**Row 1. Blocker on the peer stack. The Seen order is stale.** Current source mounts Add credit before the cap (`AeOwnerCredit.tsx:228` before `:241`). Set Limit is not the first control. What remains: cap, cards, and auto-recharge share the fund section as the same kind of block as Add funds. Keep balances, then Add funds, in that section. Move the cap out of that peer stack. Cards and auto-recharge stay quieter than Pay. Do not invent a second Credit page.

**Row 2. Blocker, and Platform.** Pay stays filled (`AeCreditTopUpPanel.tsx:249`). Add card and auto-recharge Save become secondary (`AeSavedPaymentMethodsCard.tsx:230`, `AeAutoRechargeCard.tsx:296`). Warning and critical both use `bg-warning`. Critical already has a percent and an approaching line, so color is not the only cue. Cite the band once. Do not paint a Credit-only progress color. Contrast was not measured.

**Row 3. Blocker, Platform, and Refuse.** “Account balance”, “Balance unavailable”, and “Balance history” become Credit, Credit unavailable, and Credit history. “Add credit” becomes “Add funds”. “Set Limit” / “Edit Limit” become “Set limit” / “Edit limit”. Do not rename the cap itself to Credit. Empty invoice and empty history stay quiet. Do not add Find Tools or a Call.

**Row 4. Blocker, with the quote gate kept.** Invalid auto-recharge and cap amounts are alerts only. Mark the field and focus it (`AeAutoRechargeCard.tsx:100`, `AeMonthlySpendCeilingCard.tsx:178`). Do not disable Save until the amount looks valid. Continue on the top-up stays disabled until a quote exists (`AeCreditTopUpPanel.tsx:225`). Pay with no quote would charge nothing.

**Row 5. Blocker.** The switches are 24px tall and the label is not the hit target (`AeAutoRechargeCard.tsx:247`, `AeMonthlySpendCeilingCard.tsx:303`). Associate the label. Extend the hit area toward 44px. No new switch.

**Row 6. Platform, and a Blocker.** Card initials at 10px cite the caption ledger. Do not restyle them on Credit alone. The Add funds heading matches the section heading in size and weight (live heading near `AeOwnerCredit.tsx:230`; Seen cites `:287`). Make that heading subordinate (`text-sm font-medium`), and the peer subsection titles that share bare `font-medium`.

**Row 7. Blocker.** Same peer stack as row 1. The cap teaches spending authority beside Add funds. Demote it. Keep the invoice ledger. Do not hide available credit. Do not turn top-up into a Tool purchase.

**Morph.** No new page.

1. Balances, then Add funds, in the fund section. The monthly cap leaves that peer stack.
2. Only Pay is filled. Add card and auto-recharge Save are secondary.
3. Credit strings and Add funds, as in row 3. Add funds heading steps down from the section heading.
4. Invalid amounts mark and focus the field. Switches share a hit target with their labels.

Refused: a purchase checkout. Deleting the ledgers. Enabling Pay before a quote. A reserved number the read does not have. A Credit-only caption or progress paint.

## `/activity`

Job: open the Call you mean. Empty: Find Tools.

**Good.** Empty opens on that emptiness and Find Tools. With Calls, the page opens on the list. Each row shows Call identity, Agent, and Tool. The one action is open the receipt. Many Calls stay that list until the right one is obvious. Not tiles, and not an overview.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Layout | `ActivityFilterBar.tsx:36` | When there is at least one Call, the first bar is four status chips, four date chips, Reset, an export count, CSV, and JSON. Open-receipt sits on the row below. |
| 2 | MEDIUM | Layout | `useAeActivity.ts:117`, `AeActivity.tsx:118` | Load more appends pages of 50 into one list. “This month” mounts under the empty state as well as the populated one. |
| 3 | MEDIUM | Accessibility | `AeViewBar.tsx:57`, `ActivityFilterBar.tsx:107` | Queue counts and the export preview change with no live region. Busy controls replace “Try again”, “Load more”, and “Refresh summaries”. |
| 4 | MEDIUM | Writing | `useAeActivity.ts:69`, `:233`, `AeActivity.tsx:92` | The queue title is “Needs Attention”; status vocabulary is “Needs attention”. Date chips are “7d” and “30d”. Empty and error copy says “calls”. |
| 5 | MEDIUM | Cognitive load | `ActivityCallQueue.tsx:74` | Source-only. Each row shows Status, Purchase status, and a payment line. Chip filters and an in-table filter both narrow the same loaded list. |

**Clear.** Typography: activity-owned type stays on the scale, inputs at 16px on mobile, measures capped. Colors: semantic tokens only; warning-badge and muted contrast not verified from source. UI: radius, shadow, icons, motion, and press match the shared controls.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. Chips narrow one Call list. Empty is Find Tools. With Calls, the page opens on the list. The row’s action is open the receipt. Not tiles. Not an overview. Load more may keep appending. Rams refuses a dashboard and refuses deleting the list.

**Row 1. Blocker.** The first bar is status chips, date chips, Reset, and export (`ActivityFilterBar.tsx:36`). Open-receipt is on the row, which is right. Export is a different job in that first place. Move the export count, CSV, and JSON off that bar. Keep the chips.

**Row 2. Blocker on the empty month. Refuse on a new pager.** “This month” mounts under empty as well as under the list (`AeActivity.tsx:118`). Empty’s action is Find Tools. Unmount the month summary when there are no Calls. Appending pages of 50 stays. A second pagination layout would sand the list.

**Row 3. Platform.** Queue counts and the export preview are not live regions. Busy buttons rename Try again, Load more, and Refresh summaries. The list still opens. Keep one polite region and update its text. Keep the original button labels and add a spinner. Same family as Market’s result count.

**Row 4. Blocker.** “Needs Attention” and “Needs attention” are one status. Use “Needs attention”. “7d” and “30d” become “Last 7 days” and “Last 30 days”. “calls” becomes “Calls”. Do not merge “Needs review” into “Needs attention”. Those are different facts.

**Row 5. Blocker, and a refusal.** Each row leads with Status, Purchase status, and a payment line before open-receipt (`ActivityCallQueue.tsx:74`). Chip filters and an in-table filter both narrow the same loaded list. The scan is Call identity, Agent, Tool, then open the receipt. The three facts stay distinct. They do not become one badge, and they do not lead the row. Keep the chip bar. Drop the in-table filter that re-filters the same rows. Do not hide the list.

Typography, colors, and UI stay Clear. Do not repaint. Do not reopen press scale. Do not restyle this list’s type.

**Morph.** No new page. The list stays.

1. Export leaves the opening filter bar.
2. The month summary unmounts on empty.
3. The row leads with identity, Agent, Tool, and open-receipt. One filter: the chips.
4. Status, date, and Call strings, as in row 4.

Platform, not this morph: row 3.

Refused: tiles, a dashboard, deleting the list, a second pager, merging the three commercial facts into one badge, a purchase button.

## `/calls/$callRef`

Job: take the one next action on this Call.

**Good.** First is this Call, with delivery, payment, and purchase as three facts, plus who must act and help for this Call. The one action is the safe next step on this Call: cancel, reconcile, or accept. Many events stay support for that decision. Not Retry, and not a fresh Call. Done when the actor can leave and return to the same Call.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `CallSummarySection.tsx`, `CallRecoveryPanel.tsx:162` | Source-only. The found path shows one status badge and an amount, not delivery, payment, and purchase as three facts. Check status, Cancel Call, Get help, View Tool, and “Use this Tool again” share the article. The written next step is not the focal control on the found path. |
| 2 | MEDIUM | Colors | `CallRecoveryPanel.tsx:112`, `CallSummarySection.tsx:41`, `CallTechnicalRecord.tsx:163` | Uncertain charge copy uses success tokens. Check status, View Tool, Submit reconciliation evidence, and Review Tool can all be filled primary. |
| 3 | MEDIUM | Writing | `call-receipt-view.ts:92`, `CallReceiptPrimitives.tsx:21`, `CallRecoveryPanel.tsx:186` | Body copy says “Try again”; the button is “Check status”. Confirm is “Confirm cancellation”. Several lines say “owner-scoped”, “call”, and “provider”. |
| 4 | MEDIUM | Accessibility | `CallReceiptPrimitives.tsx:24` | Every copy control announces “Call reference”, including Tool references, attempt references, and evidence hashes. Static issue and blocker blocks use `role="alert"`. |
| 5 | MEDIUM | Typography | `AeCopyCommand.tsx:55`, `select.tsx:34`, `AeRecordHeader.tsx:49` | Compact command text is 11px. The reconciliation select is `text-sm` on mobile. The page title truncates the Tool name with no recovery. |

**Clear.** Layout: section rules sit on top of `gap-section`; the timeline forces six columns at `lg`. UI: nested card and alert radii; borders used as card chrome. Contrast of success, warning, and muted pairs was not verified from source.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One Call, one article. Found, refused, and unavailable are outcomes of this reference, not a second page. Technical details stay a disclosure. The timeline stays a six-stage strip. Layout Clear holds. Do not invent a new timeline.

The found path must open on this Call: delivery, payment, and purchase as three facts, who must act, and help for this Call. The one filled control is the safe next step: Cancel Call, submit reconciliation evidence, or the leave that accepts a closed Call. Check status, Get help, View Tool, and “Use this Tool again” are outline or secondary. Not Retry. Not a fresh Call. Events stay support. Do not collapse the three facts into the one badge that is there now.

**Row 1. Blocker.** The summary is one status badge and an amount (`CallSummarySection.tsx:28`). Check status, Cancel Call, Get help, View Tool, and Use this Tool again share the article. Reconcile sits under Advanced evidence (`CallRecoveryPanel.tsx:162`) when that is the safe step, so the written next step is not the focal control. Lead with the three facts. The safe next step is the filled control, not buried. Rams holds this and refuses deleting the three facts.

**Row 2. Blocker.** A completed Call whose settlement is still uncertain paints success (`call-receipt-view.ts` stage complete, `CallReceiptTimeline.tsx:35`). Words say uncertain. Color says done. Use the attention or warning stage for that step. One filled primary, as in the opening. Check status and Copy request for Agent are not filled. Review Tool is already a link. Do not repaint unmeasured contrast. Refunded money that was restored may keep success. Uncertain must not.

**Row 3. Blocker.** “Try again” (`call-receipt-view.ts:92`) becomes “Check status” on this same Call. The button stays Check status. “Confirm cancellation” becomes “Cancel Call” (`CallRecoveryPanel.tsx:152`; Seen cites `:186`). Drop “owner-scoped”. “call” and “provider” become Call and Provider where they are the product roles. Do not write Retry.

**Row 4. Platform.** Every copy control says “Call reference”, including Tool refs, attempt refs, and hashes (`CallReceiptPrimitives.tsx:24`). Pass the fact’s name. Static issue blocks drop `role="alert"` and keep the heading. Do not cross-fade Copy and Check. That control is not the next step.

**Row 5. Blocker on the title. Platform on the other two.** The page title truncates the Tool name with no recovery (`AeRecordHeader.tsx:49`). Add `title` on that heading. Keep truncate. Compact command text at 11px cites the caption ledger. Do not enlarge it only on this receipt. The reconciliation select inherits `select.tsx:34` `text-sm` at every width. Align that shared select with the input (`text-base` until `md`). Do not patch only this panel.

**Morph.** No new frame.

1. Three facts first. One filled safe next step. Reuse and Check status are not that step.
2. Uncertain settlement is not a success stage.
3. Strings in row 3. Copy labels name the thing copied. The record title exposes the full Tool name.

Platform, not this morph: the 11px command, the shared select size, and the copy-label helper.

Refused: Retry or a fresh Call as the primary. Collapsing the three facts into one badge. A new timeline. A receipt-only type scale. A Copy/Check cross-fade.

## `/owner/operations`

Job: a Provider adds a Tool, or opens one they already have.

**Good.** Empty opens on the onboarding wizard, and Add Tool is the way in. With Tools, inventory comes first: rows, projection freshness, readiness, Provider earnings, and identity. Add Tool stays the primary action. Many Tools stay scannable rows: open one, connect payouts, or offboard. Tool, Publication, Source, and connection stay distinct. This is not the buyer Market.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Layout | `AeProviderWorkspace.tsx:84`, `FirstToolStep.tsx:29` | Empty stacks the wizard, a Tools empty state, availability, and earnings. Header Add Tool, the empty-state Add Tool, and “Import OpenAPI / MCP Tool” are all level-one. |
| 2 | MEDIUM | Colors | `AddToolAction.tsx:8`, `PayoutsStep.tsx:46`, `FirstToolStep.tsx:29` | Those same entries, plus “Add your first Tool” and “begin connection”, can be filled primary together. |
| 3 | MEDIUM | Cognitive load | `ProviderWorkspaceToolsSection.tsx:78` | Source-only. Returning keeps availability, earnings, and settings as peers under the list. Each row offers Next action, Test Run, and Activity. Inventory replaces a page of 50; it does not append. |
| 4 | MEDIUM | Writing | `FirstToolStep.tsx:33`, `AddToolAction.tsx:9`, `supplier-onboarding-wizard.contracts.ts:36` | “Import OpenAPI / MCP Tool” sits beside “Add Tool”. Wizard steps are title case (“Provider Identity”, “Connect Bank Account via Stripe Express”). Earnings is titled Earnings and described as a Stripe payout connection. |
| 5 | MEDIUM | Accessibility | `useSupplierOnboardingWizard.ts:76`, `AeConnectReturnPoller.tsx:145` | Profile errors set a diagnostic only; fields are not marked invalid and focus does not move. The connect-return poller runs up to 60s with no pause and no live region for status changes. |
| 6 | MEDIUM | Typography | `ProviderIdentityFields.tsx:44`, `OnboardingStepper.tsx:38` | Setup inputs force `text-sm` on mobile. Step durations are 10px. Field help is 11px. |

**Clear.** UI: nested `rounded-lg` in the connect-return poller and nested `rounded-card` in Provider settings. Contrast of muted and badge pairs was not verified from source.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. Empty and returning are one Provider workspace, not Market. Empty opens on the wizard. The wizard’s current step is the one filled action. Header Add Tool is outline while there are no Tools, and filled once inventory exists. Returning opens on the inventory rows. Availability, earnings, and settings stay under that list. They do not become a dashboard above it. Tool, Publication, Source, and connection stay distinct. Pages of 50 replace; they do not append.

**Row 1. Blocker.** Empty stacks the wizard, a Tools empty state, availability, and earnings, and three ways into add (`AeProviderWorkspace.tsx:84`, `FirstToolStep.tsx:29`). Keep the wizard. Unmount the empty-state Add Tool while the wizard is up. One filled control: the wizard step. Do not delete the wizard. Do not delete Earnings or the connection as objects.

**Row 2. Blocker.** Header Add Tool, Connect Stripe, Import, and Add your first Tool can all be filled. Same rule as row 1. Skip stays outline. Do not repaint unmeasured badge contrast. Nested radii stay Clear.

**Row 3. Blocker, and a refusal.** Availability, earnings, and settings sit as peers under the list. Each row offers Next action, Test Run, and Activity, and two of those open the same Tool. Inventory stays first. One row exit opens the Tool. Test Run and Activity are not equal buttons on the row. The peer sections stay below the list, quieter than it. Replacing a page of 50 stays. Next and First already reach the rest. Do not force append. Do not hide Tools.

**Row 4. Blocker.** “Import OpenAPI / MCP Tool” and “Add Tool” both go to `/owner/operations/new`. One label on this page: Add Tool. Source language belongs on the new page. Wizard steps become sentence case: Provider identity, Payout account, First Tool. The Earnings section is not described as a Stripe payout connection. Stripe stays on the payout step’s own copy.

**Row 5. Blocker.** Profile errors are a diagnostic only (`useSupplierOnboardingWizard.ts:76`). Mark the field, describe it, and focus it. Continue stays enabled until the save starts. The connect-return poller runs up to 60s with no pause and no live region (`AeConnectReturnPoller.tsx:145`). Add a pause and one status region whose text changes.

**Row 6. Blocker on the inputs. Platform on the captions.** Name, website, and ABN force `text-sm` (`ProviderIdentityFields.tsx:44`). Drop it. The shared input stays 16px until `md`. Step durations at 10px and help at 11px cite the caption ledger. Do not restyle them here alone.

**Morph.** No new frame. Not Market.

1. Empty: wizard first, one filled step action, no second Add Tool in the empty list.
2. Returning: inventory first, one open on the row, header Add Tool filled. Availability, earnings, and settings stay under the list.
3. Add Tool is the only add label on this page. Earnings is not the Stripe blurb. Identity fields drop `text-sm`. Invalid identity focuses the field. The poller can be paused and announces its state.

Refused: a buyer catalogue. Collapsing Tool and Source. Deleting the inventory to leave only the wizard. Promoting earnings above the list. Append pagination. A contrast repaint. Disabling Continue until the profile looks valid.

## `/owner/operations/new`

Job: discover one candidate from a source the Provider already runs, then continue into terms.

**Good.** First is the source they already operate. The one action is discover, then choose one candidate and continue into terms. Connection is a detour, not publish. Price stays off the first stage. Many candidates are a list, and the person picks one Tool. Source, Publication, and Tool stay distinct. The draft survives leaving for OAuth.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | HIGH | Colors | `AeSupplySourceNativeStart.tsx:188` | Completed progress steps use `text-brand-foreground` on `bg-brand`. The theme defines `on-brand`, not `brand-foreground`, so the check inherits page foreground on brand. Estimated from token hex, not a browser measurement. |
| 2 | MEDIUM | Layout | `SupplySourceTypeSection.tsx:26` | Find Tools sits above Environment, URL, and method. Stage changes do not move focus to the new heading (`AeSupplySourceNativeStart.tsx:31`). |
| 3 | MEDIUM | Cognitive load | `SupplyPublicationFlow.tsx` | Source-only. Terms is one group of name, description, category, price, connection, and consequence checks before Continue. Candidates replace on each preview (`useSupplyNativeStartState.ts:208`); they do not append. |
| 4 | MEDIUM | Accessibility | `useSupplyNativeStartState.ts:268`, `SupplyRemoteSelectionSection.tsx:22` | Validation sets an alert only. Continue with selected server stays disabled until a remote is chosen. Several radio groups have no group name. |
| 5 | MEDIUM | Writing | `useSupplyNativeStartState.ts:236`, `:210`, `AeOwnerSupplySourceStartPage.tsx:54` | Errors say “Discover” while the button is “Find Tools”. Empty is “No Tools were found in this source.” The page says “Agentic Economy” and errors say “AE”. |
| 6 | MEDIUM | Typography | `AeSupplySourceNativeStart.tsx:188`, `:206` | Progress numerals are 10px. The terms sticky price has no `tabular-nums`. |

**Clear.** UI: sticky summaries and the review well are not concentric; the progress check mounts without a cross-fade.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Block (one HIGH). Contrast of the step glyph was estimated from tokens, not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. Source, candidates, terms, and review are one Add Tool wizard. Source, Publication, and Tool stay distinct. Price stays off the source stage. It belongs on terms after a candidate is chosen. Candidates replace on each preview. They do not append. Connection is a detour, not publish. The draft still survives OAuth.

**Row 1. Blocker.** Completed steps use `text-brand-foreground` on `bg-brand` (`AeSupplySourceNativeStart.tsx:188`). That class is not a color. The check inherits page foreground on brand and can disappear. Use `text-on-brand`. Do not redesign the progress strip. Rams refused a new strip from an unmeasured pair. This is a missing token, not that pair.

**Row 2. Blocker.** Find Tools sits above Environment, URL, and method (`SupplySourceTypeSection.tsx:26`). The button cannot succeed without those facts. Put the fields first, then Find Tools. When the stage advances, focus the new section heading (`AeSection` already has `headingRef`). Do not merge Source and Tool into one surface.

**Row 3. Refuse.** Terms as one group before Continue is the terms stage Good allows. Price there is after the pick. Replacing the candidate list is a preview of one source, not a shortlist to append. Do not split terms to shrink the group. Do not put price on discover.

**Row 4. Blocker, with one gate kept.** Terms and submit validation are an alert only (`useSupplyNativeStartState.ts:268`). Mark the field, describe it, and focus it. Continue to review stays enabled until the request starts. Continue with selected server stays disabled until a remote is chosen. A click with none would continue nothing. Radio groups for remote, candidates, price, connection, and classification need a group name.

**Row 5. Blocker.** Errors say Discover and AE. The button is Find Tools. The page says Agentic Economy. Those strings use Find Tools and Agentic Economy, including the empty miss, which points at Find Tools again. Do not rename Find Tools to Add Tool or Discover. Do not rename internal discover identifiers.

**Row 6. Platform, and a Blocker.** Progress numerals at 10px cite the caption ledger. Do not bump them on this page alone. The sticky terms price gets `tabular-nums` (`AeSupplySourceNativeStart.tsx:206`). Review’s fact list already uses tabular figures.

UI stays Clear. Do not cross-fade the progress check. Do not restyle sticky radius.

**Morph.** No new frame.

1. Source fields, then Find Tools. Stage change focuses the new heading.
2. The completed-step check uses `text-on-brand`.
3. Validation focuses the bad field. Remote continue stays gated. Strings match Find Tools and Agentic Economy. The sticky price uses tabular figures.

Refused: collapsing Source and Tool. Price on discover. Appending candidates. A new progress strip. Enabling continue with no remote. A route-only type scale.

## `/owner/operations/$toolRef`

Job: inspect one publication and take the one maintenance step its state allows.

**Good.** Opens on this publication: name, lifecycle status, and source health. One control: recheck, withdraw, republish, refresh, or resume. Recheck does not mint a Tool. Withdraw does not delete the Business. Extra facts sit below. Price opens in a sheet. The title stays the publication.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `AeProviderToolDetail.tsx`, `AeToolTestPlayground.tsx` | Source-only. Status is repeated in the overview, the state heading, and a Tool status block. On a published Tool, “Send test Call” is a filled control whose handler rechecks the source. Withdraw is secondary beside it. |
| 2 | MEDIUM | Layout | `AeOwnerToolDetailPage.tsx:105` | The lifecycle action sits under the overview. The page title truncates the Tool name (`AeRecordHeader.tsx:49`). |
| 3 | MEDIUM | Writing | `owner-tool-detail.contracts.ts:9`, `AeProviderToolDetail.tsx:169`, `AeToolTestPlayground.tsx:40` | Recovery is “Back to Tools” and “Return to Tools”. Confirm is “Confirm withdrawal”. Playground chrome is title case (“Interactive Test Playground”, “Load Example Arguments”). Errors say “AE”. |
| 4 | MEDIUM | Accessibility | `JsonPayloadEditor.tsx:48`, `:30` | Playground syntax errors are not tied to the textarea. Auxiliary controls are `h-6` / `h-7`. The document title stays “Tool status” while the heading is the Tool name. |
| 5 | MEDIUM | Typography | `JsonPayloadEditor.tsx:53` | The JSON textarea forces `text-xs` on mobile. |

**Clear.** Colors: semantic tokens only. Muted, destructive, and success contrast not verified from source. UI: playground nests `rounded-xl` over `rounded-lg`; copy and check swap without a cross-fade; a lightning emoji sits in the latency badge.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. The page opens on this publication: name, lifecycle, and source health. The one filled control is the maintenance step the state allows: recheck, withdraw, republish, refresh, or resume. The playground is extra. It does not wear a Call. Price stays in a sheet. The title stays the publication. Recheck does not mint a Tool. Withdraw does not delete the Business.

**Row 1. Blocker.** On a published Tool, filled “Send test Call” only runs source recheck. That is a false next step. Name the control for the verb the handler runs: Recheck source. This wave does not invent a Call. One filled control is the state-allowed maintenance step. The playground stays outline beside it. Rams holds the three status reads. Overview, the state heading, and source health stay. Collapsing them to one badge is refused.

**Row 2. The order stays. The title is Platform.** The lifecycle action under the overview matches “opens on this publication.” Do not promote it above the facts. The truncating title is the shared `AeRecordHeader` `h1`. Receipt row 5 already decided `title={title}` and keep truncate. Cite that ledger. No second title treatment.

**Row 3. Blocker.** One exit: Return to Tools (`owner-tool-detail.contracts.ts:9` and `AeOwnerToolDetailPage.tsx:182`). “Confirm withdrawal” becomes “Withdraw Tool” (`AeProviderToolDetail.tsx:169`). “Confirm republish” becomes “Republish Tool”. Playground chrome is sentence case. Person-facing errors say Agentic Economy, not AE, the same string decision as Add Tool.

**Row 4. Platform on the document title. Refuse on the playground.** Drive the document title from the publication name (`owner.operations.$toolRef.tsx:42`) so it matches the heading. Syntax errors stay untied, and Load / Reset stay at `h-6` / `h-7`, because recheck does not consume the JSON textarea. Binding that editor would sand the extra block.

**Row 5. Platform.** Drop `text-xs` on `JsonPayloadEditor.tsx:53` so the shared Textarea stays 16px on phone. Cite the ledger. Do not restyle the publication page. The editor is not the maintenance control.

Colors and UI stay Clear. Unmeasured contrast is not a repaint. Copy/Check remount, nested radii, and the latency lightning mark are Refuse.

**Morph.** No new frame.

1. The playground control is named for recheck and stays outline. The one filled control is the state-allowed maintenance step.
2. One exit: Return to Tools. Confirm buttons name the consequence: Withdraw Tool, Republish Tool. Playground chrome is sentence case. Errors say Agentic Economy.

Platform, cited and not morphed again here: `title={title}` on `AeRecordHeader`; document title from the publication name; drop `text-xs` on the JSON textarea.

Refused: a buyer listing. A real Call as the primary. Collapsing source health to one badge. Moving the maintenance step above the overview. Tying playground syntax errors. A contrast repaint. A Copy/Check cross-fade. A radius restyle.

## `/owner/supply/connections/new`

Job: attach a credential or start OAuth, then return to Add Tool.

**Good.** First is the origin, with either an HTTP secret or an MCP OAuth start. The one action is submit, begin OAuth, or cancel. Success returns to Add Tool. Consumed or expired says the handoff is finished and sends them to start again. Connection is not a publication. The raw key never lands on the Tool form.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Accessibility | `HttpCredentialForm.tsx:47`, `useConnectionHandoff.ts:248` | Connect stays disabled until the field is non-empty. A failed Cancel on the HTTP path is not shown. |
| 2 | MEDIUM | Writing | `connection-handoff.contracts.ts:32`, `:95` | One line says “reconnect”; the other says “start again”. The unavailable surface still uses the pending description. Sign-in is hyphenated in the error and not in the button. |
| 3 | MEDIUM | Layout | `HttpCredentialForm.tsx:20`, `connection-handoff.view-model.ts:25` | The origin URL is inlined with no break. The title is `Connect {hostname}` under a truncating `h1`. |
| 4 | MEDIUM | Cognitive load | `AeConnectionHandoff` | Source-only. The form and the status panel do not appear together. Operator chrome marks `/owner/operations/new` as the current place. The environment badge sits above the form as its own block. |

**Clear.** Colors: one filled primary on the pending form; status is a secondary return. Contrast not verified from source. UI: shared controls only; no page-owned motion or icons. Typography: the credential input is 16px on mobile; the clipped title is the layout row above.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One handoff. Origin first, then an HTTP secret or an MCP OAuth start. The one filled action is Connect or Continue to sign in. Cancel stays secondary. Success returns to Add Tool. Consumed or expired says the handoff is finished and sends them to start again. Connection is not a publication. The raw key stays on this form.

**Row 1. Blocker.** Connect stays disabled until the field is non-empty (`HttpCredentialForm.tsx:47`). An empty submit cannot attach a blank credential: the server requires a non-empty secret. Keep Connect enabled until the request starts, then a spinner. On an empty submit, mark the field, describe it, and focus it. A failed Cancel on the HTTP path is set and never shown (`useConnectionHandoff.ts:248`). MCP already surfaces that cancel error. HTTP shows it the same way.

**Row 2. Blocker.** Finished lines say “reconnect” (`connection-handoff.contracts.ts:32`, `:34`) while the unavailable line already says “start again” (`:95`). One verb: start again. Do not invent a reconnect product. The unavailable surface stops using the pending description (`connection-handoff.view-model.ts:14`). Pending keeps “Connect the credential required by this Provider source.” Sign-in in the error and the busy line matches the button: sign in. Person-facing AE becomes Agentic Economy. Cite the ledger. Do not rename internal identifiers.

**Row 3. Platform on the title. Refuse on an origin wrap.** `Connect {hostname}` is the shared `AeRecordHeader` `h1`. Cite `title={title}` and keep truncate. The inlined origin is an origin, and the host is already the title. Do not add a wrap block or a second heading.

**Row 4. Refuse.** The form and the status panel stay exclusive. That is one action in one place. The painted chrome is Connect, not Add Tool. `currentPath` pointing at `/owner/operations/new` is focus registration, not a second page. Do not fold this route into Add Tool. The environment badge stays. It does not beat the origin as the first read.

Colors, UI, and typography stay Clear. Unmeasured contrast is not a repaint. One filled primary already holds. Cancel is secondary.

**Morph.** No new frame.

1. Connect stays enabled until the request starts. An empty submit marks the field. A failed HTTP Cancel is shown.
2. Finished copy says start again. Unavailable does not wear the pending description. Sign in matches the button. Person-facing errors say Agentic Economy.

Platform, cited and not morphed again here: `title={title}` on `AeRecordHeader`.

Refused: wrapping the origin into a new row. Merging Connection into Add Tool. Putting the raw key on the Tool form. A second primary beside submit. A reconnect product. A contrast repaint, a radius restyle, or page-owned motion.

## `/owner/supply/connections/oauth/callback`

Job: show the MCP return, then go back to Add Tool.

**Good.** First is the outcome: connected or refused. The one action is Return to Add Tool, resuming the draft if there was one. This page does not start a new OAuth. A replayed return counts as connected. Refusal uses the same return, with no retry from here.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Writing | `owner-mcp-oauth-callback.contracts.ts:3`, `:4` | The page description says return after the Provider confirms access. The only painted states are refusals; connected and replayed redirect away. The button is always “Return to Add Tool and retry”. |
| 2 | MEDIUM | Accessibility | `AeOwnerMcpOAuthCallback.tsx:23` | `currentPath` is `/owner/operations/new` on the callback route. The recovery link goes to that same path. |
| 3 | MEDIUM | Layout | `AeOwnerMcpOAuthCallback.tsx:31`, `alert.tsx:42` | When set, the environment badge sits above the refusal, spaced as a section. Alert titles use `line-clamp-1`. |

**Clear.** Colors: one destructive alert and one secondary return. Contrast not verified from source. UI: shared Alert, Badge, and link. Typography: no sub-12px text and no inputs; the clamped title is the layout row.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser. Connected and replayed do not paint this page.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. This page paints a refusal. Connected and replayed redirect to Add Tool and do not get a panel here. The one action is Return to Add Tool, resuming the draft. This page does not start OAuth. There is no retry from here. There is no cognitive Seen row.

**Row 1. Blocker.** The description says return after the Provider confirms access (`owner-mcp-oauth-callback.contracts.ts:3`). That confirm never paints. The button says “Return to Add Tool and retry” (`:4`). Retry is a false next step. The description becomes “This Provider connection was not completed. Return to Add Tool.” The button becomes “Return to Add Tool.”

**Row 2. Refuse.** `currentPath="/owner/operations/new"` names the return place for focus registration. Sidebar and skip use this page’s own main. The recovery link to Add Tool is the job. Do not merge this page into Add Tool. Do not add a second destination.

**Row 3. Refuse.** The environment badge stays above the refusal. It does not beat the outcome. `line-clamp-1` on `AlertTitle` is the shared Alert. The refusal reason stays in the unclamped description. Do not unclamp this page alone. Do not delete the reason and leave the badge.

Colors, UI, and typography stay Clear. The return is secondary. Unmeasured contrast is not a repaint.

**Morph.** No new frame. No composition Blocker.

1. The description matches the painted refusal. The button is Return to Add Tool, with no retry.

Refused: a connected panel on this route. A retry control. A second OAuth start. Folding the page into Add Tool. A contrast repaint, a radius restyle, or page-owned motion.

## `/$slug`

Job: open one offering on a Provider’s shop.

**Good.** The shop leads with the Provider’s name, then offerings with price and readiness, and a way back to Market or the thread. The one action is open one offering. An empty catalogue still shows the profile. Machine metadata does not compete with that path.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `AeProviderListingPage.tsx:207` | Source-only. Row actions are “Open provider route”, “Open website”, and “Call provider”. There is no control that opens the offering inside Agentic Economy. Agent-readable JSON sits on the Customer page. |
| 2 | MEDIUM | Colors | `AeProviderListingPage.tsx:207` | Each row with an operation path uses a filled primary. Website and phone stay outline. |
| 3 | MEDIUM | Writing | `AeProviderListingPage.tsx:43`, `:61`, `:66` | The list is “listed tools”. Copy says “before calling” beside “Call provider”. Empty is “No tools listed” with no exit. |
| 4 | MEDIUM | Accessibility | `AeProviderListingPage.tsx:104`, `:206` | External links do not say they open a new tab. Every row’s link name is the same phrase, without the offering name. |
| 5 | MEDIUM | Layout | `AeProviderListingPage.tsx:52`, `:32` | Header meta and the first-screen facts both show listed and ready counts before a row. Offerings replace; they do not append. |

**Clear.** Typography: prices use `tabular-nums`; no sub-12px type; no inputs. UI: the agent-JSON copy control swaps Code and Check by remounting. Contrast of readiness badges was not verified from source.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. The shop leads with the Provider’s name, then offerings with price and readiness, and a way back to Market. The one action is open one offering inside Agentic Economy. Empty still shows the profile. Agent-readable JSON stays in the aside. Offerings replace. They do not append. This page does not Quote, Call, or checkout.

**Row 1. Blocker.** Rows only leave the product: “Open provider route”, “Open website”, and “Call provider” (`AeProviderListingPage.tsx:207`). There is no control that opens the offering here. The row opens that offering in Agentic Economy. External route, website, and phone stay secondary. Do not add a buy, a Quote, or a Call. The JSON disclosure is not this Blocker.

**Row 2. Blocker.** Every operation path is a filled primary (`AeProviderListingPage.tsx:207`). A list of peers cannot all be the one action. The in-app open is the row link. Website and phone stay outline. Do not invent a checkout fill to keep one primary.

**Row 3. Blocker.** The list paints offerings and names them tools (`AeProviderListingPage.tsx:43`, `:61`, `:66`). The list is Offerings. “before calling” becomes “before you open one.” “Call provider” becomes “Phone provider” so a phone link is not a Call. Empty is “No offerings listed.” The profile stays. The existing back is Browse Market, the one `/market` exit. Do not add a second leave on the empty body.

**Row 4. Blocker.** Provider website, Open provider route, and Open website use `target="_blank"` and do not say they open a new tab (`AeProviderListingPage.tsx:104`, `:207`, `:217`). Every row reuses the same link name. The name includes the offering. External links say they open a new tab.

**Row 5. Blocker on the repeated counts. The replace stays.** Header meta and the first-screen strip both state listed and ready (`AeProviderListingPage.tsx:52`). Keep the header line. Drop Tools and Ready from the first-screen strip. Leave category and last indexed. Offerings already replace. Do not force append. Do not flatten the shop into Market.

Typography stays Clear. Prices keep `tabular-nums`. The agent-JSON Code/Check remount is Refuse. Unmeasured readiness contrast is not a repaint.

**Morph.** No new frame.

1. Each offering row opens that offering in Agentic Economy. External route, website, and phone stay outline, named with the offering, and say they open a new tab. No filled primary on every row.
2. The list says Offerings. The phone control says Phone provider. The back exit says Browse Market. Empty keeps the profile.
3. Listed and ready counts once, on the header.

Refused: a checkout. A Call as the row primary. Deleting the profile on empty. Hiding price. Promoting agent JSON. Flattening into Market. Appending offerings. A contrast repaint. A Copy/Check cross-fade.

## `/owner/team`

Job: see who may administer the workspace, and invite or change a role.

**Good.** Opens on people and roles. Invite and change role are the actions. Many people stay a directory. This is not the Tool market, not Credit, and not an Agent grant.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `AeTeamDirectoryTable.tsx` | Source-only. The page is a read-only roster: search, four role chips, and a table. There is no Invite, change-role, or remove control. Role labels have no legend of what Owner, Admin, and Member may do. |
| 2 | MEDIUM | Writing | `owner.team.tsx:32`, `AeOperatorPage.tsx:22` | The section heading is “Canonical directory”. The breadcrumb is “Team settings” on a page that does not manage settings. |
| 3 | MEDIUM | Accessibility | `AeTeamDirectoryTable.tsx:61`, `:155` | Every copy control is named “Copy email”, without the person’s name. The count live region can say “Showing 0 of 0” while loading. |
| 4 | MEDIUM | Typography | `AeTeamDirectoryTable.tsx:128` | The filter search is `text-sm` on mobile. |
| 5 | MEDIUM | Layout | `AeTeamDirectoryTable.tsx` | The directory maps the full member payload. It does not page. |

**Clear.** Colors: the Active pill uses `bg-success/15 text-success` rather than the success surface pair. Contrast not verified from source. UI: copy and check remount. The shared `<main>` still uses `focus:outline-none` (`AeOperatorPage.tsx:209`).

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. The page stays a directory of people and roles. Invite and change role are the actions. This is not the Tool market, not Credit, and not an Agent grant.

**Row 1. Blocker.** The roster is search, role chips, and a table (`AeTeamDirectoryTable.tsx`). There is no Invite and no change-role. The job cannot be done. Invite is the one filled action beside the filter strip. Change role sits on the row. Owner, Admin, and Member already name the role. Do not add a permission legend as the fix. Do not invent remove. Good does not name it.

**Row 2. Blocker.** The section heading is “Canonical directory” (`owner.team.tsx:32`). The breadcrumb is “Team settings” (`AeOperatorPage.tsx:22`). The page is Team. Both say Team.

**Row 3. Blocker.** Every copy control is named “Copy email” (`AeTeamDirectoryTable.tsx:61`). The name includes the person. The count live region can say “Showing 0 of 0” while loading (`:155`). Stay quiet until the directory is known. One region; its text changes. Copy/Check remount is Refuse. Copying email is not the job.

**Row 4. Platform.** Drop `text-sm` on the filter search (`AeTeamDirectoryTable.tsx:128`) so the shared Input stays 16px on a phone. Cite the ledger. The search is a filter. It is not Invite. Do not restyle the directory.

**Row 5. Refuse.** `listDirectory` already returns one workspace roster. Mapping that list is the directory. Do not add a pager. Do not turn it into Market.

The Active pill uses real `success` colors. Unmeasured contrast is Refuse. `AeOperatorPage` main `focus:outline-none` is Platform. Cite `/agent-access` row 2. Do not morph that shell here.

**Morph.** No new frame.

1. Invite is the filled action beside the directory. Change role sits on the row. Search, chips, and the table stay.
2. The heading and the breadcrumb say Team.
3. Copy email names the person. The count stays quiet until the directory is known.

Platform, cited and not morphed again here: drop `text-sm` on the search; the operator main focus ring.

Refused: a role-legend essay. Remove. A Tool market, Credit, or Agent grant. Deleting the roster to leave an invite form. A pager. A contrast repaint. A Copy/Check cross-fade.

## `/owner/settings`

Job: manage sessions and recovery, and read security history.

**Good.** Opens on this person’s security: sessions, recovery, and a history. The one action is manage sessions or recovery. Many events stay a history. This is Account, not Credit, not Agents, and not a market decision. When done, they remain on Account.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `OwnerSettingsShell` | Source-only. Seven section peers share the nav: Profile, Team, Business, Privacy, Recovery, email alerts, and security history. Session revoke sits inside the Profile embed. Recovery steps leave Account for Agents and operations. |
| 2 | MEDIUM | Typography | `TaxProfileForm.tsx:113`, `OwnerSettingsSections.tsx:33` | Tax inputs force `text-xs`, under 16px on mobile. The nested Sign out heading is `text-4xl` under a `text-base` section title. |
| 3 | MEDIUM | Writing | `AeCompromiseRecoveryChecklist.tsx:7` | Recovery copy names Clerk and x402. The visible section is Profile. Alert toggles name topics (“Low credit balance”) rather than the email that sends when they are on. |
| 4 | MEDIUM | Accessibility | `TaxProfileForm.tsx:64`, `OwnerNotificationSettings.tsx:101` | Save stays disabled until every tax field passes. The low-balance choices are a radiogroup where each option is its own tab stop. |
| 5 | MEDIUM | Layout | `OwnerSettingsShell.tsx:22`, `AeAccountSecurityHistory.tsx` | Section chips use `gap-1` inside a horizontal scroller with no peek. Security history appends older pages. |

**Clear.** Colors: semantic tokens; one filled action per section. Contrast of the sticky header was not verified from source. UI: compromise details nest radii; security-history copy and check remount.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser. Clerk-hosted profile widgets were not scored.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One Account page. Sessions, recovery, and security history are the opening read. Profile, Team, Business, and Privacy stay reachable. They are not deleted. When done, the person remains on Account. This is not Credit, not Agents, and not a market. Clerk-hosted widgets stay unscored.

**Row 1. Blocker.** Seven equal chips bury recovery and history (`owner-settings.contracts.ts:51`). The page opens on Profile. Reorder so sessions, recovery, and history lead. Do not collapse the other Account jobs. Session revoke stays inside Profile. Recovery links to `/agent-access` and `/owner/operations` (`AeCompromiseRecoveryChecklist.tsx:14`, `:19`, `:24`) are false next steps. Keep the containment as copy on this page. Drop those destinations. Rams would keep the outbound links. Good says they remain on Account. The links go.

**Row 2. Blocker.** Tax inputs force `text-xs` (`TaxProfileForm.tsx:113`). The person types in them. Drop the override so the shared Input stays 16px on a phone. Nested Sign out is `text-4xl` under a `text-base` section title (`OwnerSettingsSections.tsx:33`). Demote it with an existing smaller heading. Do not invent a settings type scale.

**Row 3. Blocker.** Recovery says “Review and revoke Clerk sessions” and names x402 (`AeCompromiseRecoveryChecklist.tsx:7`). The person-facing lines say sessions and Profile. Alert toggles name the email that sends: “Email when credit balance is low”, and the same pattern for the other topics. Do not build a Credit page from that sentence. Do not rename internal identifiers.

**Row 4. Blocker.** Save stays disabled until every tax field looks valid (`TaxProfileForm.tsx:64`). The server rejects an incomplete profile, so an early click is not a successful lie. Keep Save enabled until the request starts, then a spinner with the Save label. On an invalid submit, mark the field, describe it, and focus it. The low-balance choices are one radiogroup where each option is its own tab stop (`OwnerNotificationSettings.tsx:101`). One tab stop for the group. Arrows move the choice. Do not collapse the three amounts into a select. Do not move tax Save onto workspace to dodge this row.

**Row 5. Blocker on the chip row. Refuse on a pager.** Section chips sit in a horizontal scroller with `gap-1` and no peek (`OwnerSettingsShell.tsx:22`). The next chip peeks so the row does not look finished. Security history already appends older events. That matches “many events stay a history.” Do not add a pager.

Colors and UI stay Clear. One filled action per section. Unmeasured sticky-header contrast is not a repaint. Nested radii and the security-history Copy/Check remount are Refuse.

**Morph.** No new frame.

1. Sessions, recovery, and history lead. The other Account sections stay. Recovery facts stay on Account. The Agents and operations links come off the checklist.
2. Tax inputs drop `text-xs`. Sign out is not a second page title. Recovery copy says sessions and Profile. Alert labels name the email.
3. Tax Save stays enabled until the request starts. An invalid submit marks and focuses the field. Low-balance radios are one tab stop. Section chips peek. History still appends.

Refused: deleting history. Collapsing Account to one button. Building Credit here. A new settings shell. A route-only type scale. A select in place of the three amounts. A pager. A contrast repaint. A radius restyle. A Copy/Check cross-fade.

## `/owner/workspace`

Job: save the organisation profile and tax facts. Close or transfer stays in a danger zone.

**Good.** Opens on the organisation profile and tax facts. The everyday action is save. Close and transfer sit apart, each behind its own confirm. Many tax fields stay one form. This is not the Tool market.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | HIGH | Colors | `WorkspaceDangerZone.tsx:16`, `WorkspaceTransferPanel.tsx:64` | A destructive alert wraps both panels, so Transfer inherits danger text. Transfer’s confirm stays the ordinary primary. Close’s confirm is destructive. |
| 2 | MEDIUM | Cognitive load | `owner.workspace.tsx` | Source-only. Tax is not on this page. Close and Transfer are expanded peers under the profile. The name to type is not shown beside the field. |
| 3 | MEDIUM | Writing | `WorkspaceClosePanel.tsx:76` | Close copy says prepaid credit is not spent until close succeeds. Fence messages name the blocker and not the next step. An empty transfer list has no invite path. |
| 4 | MEDIUM | Accessibility | `WorkspaceDangerZone.tsx:16`, `WorkspaceClosePanel.tsx:71` | The danger zone is a permanent `role="alert"` around the controls. Failure diagnostics sit beside the trigger while the confirm dialog stays open. Close stays disabled until the typed name matches. |
| 5 | MEDIUM | Layout | `WorkspaceClosePanel.tsx:34`, `AeSection.tsx:30` | “Close workspace” and “Transfer ownership” are `text-lg` under a `text-base` Danger zone heading. The transfer select inherits `text-sm` on mobile. |

**Clear.** UI: no page-owned icons or motion beyond shared controls. Contrast of destructive text on the alert was not verified from source. Clerk organisation profile was not scored.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Block (one HIGH). Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. Everyday work is save the organisation profile. Close and Transfer stay apart, each behind its own confirm. Tax save stays on Account, where the settings wave already kept it. This page does not grow a second tax form. This is not the Tool market.

**Row 1. Blocker.** One destructive alert wraps Close and Transfer (`WorkspaceDangerZone.tsx:16`), so Transfer’s text reads as danger. Transfer is not Close. Destructive color stays on Close only. Transfer’s confirm stays the ordinary primary (`WorkspaceTransferPanel.tsx:64`). Do not paint that confirm destructive. Do not merge the two panels into one blob. Unmeasured contrast is not a repaint.

**Row 2. Blocker on the open danger peers and the name. Not a Blocker on missing tax.** Close and Transfer are expanded under the profile (`owner.workspace.tsx:39`). They compete with Save. Each sits behind its own trigger. They do not merge. The type-to-confirm field shows the workspace name beside it (`WorkspaceClosePanel.tsx:51`). Tax is already on Account Business. Do not add it here. Do not move Close onto Account.

**Row 3. Blocker.** Close copy invents prepaid credit this page does not load (`WorkspaceClosePanel.tsx:76`, and the `A$0.00` fence and transfer lines). State the consequence: the workspace ends, Tools and active delegations end, no money figure. Fence lines keep the blocker and add the next step, such as settle Provider obligations before close. An empty transfer list says nobody else can receive ownership, and points at Team invite. Do not invent a successor. Do not invent a balance.

**Row 4. Blocker, with the name gate kept.** The danger zone is a permanent `role="alert"` around resting controls (`WorkspaceDangerZone.tsx:16`). Drop that role from the chrome. A close failure stays beside the trigger while the dialog is open (`WorkspaceClosePanel.tsx:71`). Put the diagnostic inside the open dialog. Close stays disabled until the typed name matches. A click without the match would close the workspace. That gate stays.

**Row 5. Blocker on the headings. Platform on the select.** “Close workspace” and “Transfer ownership” are `text-lg` under a `text-base` Danger zone heading (`WorkspaceClosePanel.tsx:34`, `AeSection.tsx:30`). Demote those titles to the section heading. Do not enlarge Danger zone. The transfer select’s `text-sm` cites the shared-select ledger (`/calls/$callRef` row 5). Do not patch this page’s select.

UI stays Clear. No page-owned motion. Nested radius is Refuse. Clerk’s organisation profile stays unscored.

**Morph.** No new frame.

1. Only Close wears destructive color. Transfer stays neutral, and its confirm stays primary. Two panels, two confirms.
2. Each danger action sits behind its own trigger. The workspace name is beside the type-to-confirm field. Close copy states the consequence, not a balance. Fence lines name the next step. Empty transfer points at Team.
3. The resting danger zone is not an alert. A close failure shows inside the open dialog. Close stays disabled until the name matches. Panel titles match the section heading.

Platform, cited and not morphed again here: the shared select size.

Refused: a second tax form. Moving Close onto Account. Promoting Close to the everyday filled action. Merging Close and Transfer. Inventing a credit balance. A Tool market on this page. Enabling Close before the name matches. A route-only type scale. A contrast repaint. Page-owned motion.

## `/developers/discovery`

Job: see whether each discovery artifact is current.

**Good.** Opens on whether each artifact is current. The one action is open one artifact. Many artifacts stay a quiet list: origin, one status, and when it was checked. This is not a roadmap and not a support-capacity page.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `AeDeveloperDiscoveryPage.tsx` | Source-only. Catalog facts, artifact status, and read paths are peer sections. Each artifact also mounts a code block. Header actions repeat the row View links. |
| 2 | MEDIUM | Writing | `developer-discovery-route-projection.ts:201`, `discovery.contracts.ts:37` | The description promises unavailable-capability reasons that this page does not show. Links say “View schema status” for the JSON artifact. Row links are both “View”. Badges say “Fresh” beside “Discovery current”. |
| 3 | MEDIUM | Accessibility | `AeDeveloperDiscoveryPage.tsx:83`, `AeEmptyState.tsx:79` | Repeated “View” names. Empty states inside a rail add a second `h2`. |

**Clear.** Typography: no sub-12px type, no inputs, counts use `tabular-nums`. Colors: secondary actions only; status uses badge tokens. Contrast not verified from source. UI: no page-owned icon swaps. Public catalog facts map the whole set; that list is the reference, not a decision wall.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One document. The page opens on whether each artifact is current. The one action is open that artifact. Catalog facts stay a reference list after the status. This is not a roadmap and not a support page. There is no layout Seen row.

**Row 1. Blocker.** Catalog facts, artifact status, and read paths are peer sections, so currency is not the opening read (`AeDeveloperDiscoveryPage.tsx`). Each artifact also mounts a code block. Header actions repeat the row open. Artifact status leads. Each row keeps origin, one status, when it was checked, and one open. The per-row code block unmounts. The header artifact buttons go. Catalog facts stay after status. Do not hide per-artifact status behind one page badge.

**Row 2. Blocker.** The description promises unavailable-capability reasons this page does not show (`developer-discovery-route-projection.ts:201`). Drop that promise. Do not invent the reasons. Row opens both say “View” (`discovery.contracts.ts:37`). They become “Open schema” and “Open examples.” “Fresh” and “Discovery current” become one word: Current.

**Row 3. Blocker.** The row links use that same “View” (`AeDeveloperDiscoveryPage.tsx:83`). The name includes the artifact, matching row 2. An empty state inside a named rail adds a second `h2` (`AeEmptyState.tsx:79`). Demote the empty title. Keep the rail heading.

Colors, UI, and typography stay Clear. Views stay secondary. Unmeasured contrast is not a repaint. No icon motion.

**Morph.** No new frame.

1. Artifact status leads. Catalog facts follow. Per-row code blocks unmount. Header artifact buttons go.
2. Each open is named for its artifact. The status word is Current. The description stops promising reasons this page does not show. An empty rail does not add a second heading.

Refused: a roadmap. A support-capacity page. Deleting status and leaving the code blocks. Deleting the catalog reference. Inventing unavailable-capability reasons. A contrast repaint. A badge restyle. Flattening into Market.

## `/developers/api`

Job: find one API operation in a reference.

**Good.** Opens on the API reference. The one action is open the operation they mean. Many operations stay a quiet reference list, not a short decision set. This is not the Tool market and not a marketing door.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Accessibility | `AePublicPage.tsx:71`, `DevelopersApiPage.tsx:15` | The public document route does not move focus into `main` after client navigation. Operator chrome does. |
| 2 | MEDIUM | Layout | `DevelopersApiPage.tsx:61`, `developers-api.view-model.ts:32` | Every operation is one flat card grid. OpenAPI tags are dropped, so Call gateway, Tool market, Funding, Businesses, and Platform do not form groups. Each row stacks method, path, summary, and operationId. Errors is a second equal card grid. The list is not sliced. |
| 3 | MEDIUM | Cognitive load | `DevelopersApiPage.tsx` | Source-only. The page opens on setup facts (contract, auth, ExactAmount) before the operation list. |

**Clear.** Writing: title, intro, and footer say “API reference”; the intro uses Tool, Quote, and Call. Body copy inside operation cards was not scored. Typography: no sub-12px type, no inputs, no truncation. Colors: semantic tokens; brand on the OpenAPI link. Contrast not verified from source. UI: nested card and command radii folded here. The operation list is the reference, not a decision wall.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One API reference. The operation list leads. Contract, auth, and ExactAmount stay on the page. Errors stay below the operations. Tool, Quote, and Call stay three nouns in the intro. This is not the Tool market and not a marketing door.

**Row 1. Platform.** After client navigation, focus stays on the control that left the previous page (`AePublicPage.tsx:71`). Operator chrome already focuses `#main-content`. Fix the public document shell once. Cite the ledger. Do not patch only this page. Do not add a second main. Ask’s refuse of focus-to-main does not apply here.

**Row 2. Blocker on the missing groups. Refuse on a pager. Errors stay.** OpenAPI tags are dropped (`developers-api.view-model.ts:32`), so every operation is one flat grid (`DevelopersApiPage.tsx:61`). Group the list under Call gateway, Tool market, Funding, Businesses, and Platform. That is reference structure, not Market. Do not slice the list. Errors remain a second grid after the operations. They are not the opening read.

**Row 3. Blocker.** The page opens on setup facts before the operation list (`DevelopersApiPage.tsx`). That buries the job. Lead with the operations. Keep contract, auth, and ExactAmount after or beside the list. Do not delete them. Do not replace them with a tutorial hero.

Writing, colors, UI, and typography stay Clear. The intro already keeps Tool, Quote, and Call distinct. Unmeasured contrast is not a repaint. Nested radii are Refuse.

**Morph.** No new frame.

1. The operation list leads, grouped by its OpenAPI tags. Setup facts stay on the page. Errors stay below. The list is not sliced.

Platform, cited and not morphed again here: focus into `AePublicPage` main after client navigation.

Refused: a marketing hero. A Market grid. Deleting auth, version, or ExactAmount. A decision wizard. A pager. A contrast repaint. A radius restyle. Collapsing Tool, Quote, and Call.

## `/admin/index-health`

Job: an admin sees which indexes failed and follows the remediation for one failure. Without the Admin role, the page says Admin access is required.

**Good.** Health comes first. The one action is follow the remediation for one failure. Many failures stay a quiet table: which index, what failed, when, and the remedy. Someone without the Admin role sees that Admin access is required and one way back. This is not the Tool market and not a purchase.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Accessibility | `AeAdminReadbackPanel.tsx:162` | Object and Correlation both name the control “View reference”. |
| 2 | MEDIUM | Accessibility | `AeAdminReadbackPanel.tsx:32` | The authorized path announces “Readback available” with `role="alert"`. |
| 3 | MEDIUM | Layout | `AeAdminCatalogHealthPage.tsx:16`, `AeAdminReadbackPanel.tsx:32` | The authorized path opens on a success alert and four counts before the failure table. A source-authority confirm can sit above that table and become the loudest control. Rows replace; there is no next page. |
| 4 | MEDIUM | Writing | `AeAdminCatalogHealthPage.tsx:22`, `AeAdminReadbackPanel.tsx:81`, `admin-readbacks.ts:94`, `SourceAuthorityReviewPanel.tsx:107` | The section describes fields the table does not show. The empty state says “No operational rows yet”. A membership denial does not name a next step. Source-authority outcomes say “Package 5” and “No approval can be claimed”. |

**Clear.** Non-admin denial: one heading, “Your account does not have the Admin role for this page.”, and recovery actions. Typography: no sub-12px type; inputs stay at 16px; counts use `tabular-nums`. Colors: semantic tokens; one filled confirm. Contrast not verified from source. UI: no page-owned icons or motion. The bounded read is one snapshot, not a missing pager.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One health table. The failure table leads. Counts stay quiet beside or after it. A source-authority confirm sits above the table only when it is the remediation for the failure shown. Rows replace. There is no pager. Without the Admin role, the page says Admin access is required and offers one way back. This is not the Tool market and not a purchase. There is no cognitive Seen row.

**Row 1. Platform.** Object and Correlation both say “View reference” (`AeAdminReadbackPanel.tsx:162`). Name the thing opened. Fix the shared panel once. Cite the ledger. Do not patch only this page.

**Row 2. Platform.** Authorized “Readback available” uses `role="alert"` (`AeAdminReadbackPanel.tsx:32`). That is resting chrome, not a change. Drop the alert role on that branch. Same panel, same ledger. Do not strip `role="alert"` from every Alert.

**Row 3. Blocker on the opening. Refuse on a pager.** The authorized path opens on a success alert and four counts before the failure table (`AeAdminCatalogHealthPage.tsx:16`, `AeAdminReadbackPanel.tsx:32`). Lead with the failure table. Counts stay quieter after it. The source-authority confirm is not the loudest control unless it is the remediation in front of the admin. Do not add a pager. The bounded read stays one snapshot.

**Row 4. Blocker.** The section promises columns the table does not show (`AeAdminCatalogHealthPage.tsx:22`). Describe the columns that paint: which index failed, its state, when it was updated, and the next step. Do not invent the missing columns. Empty is “No index failures”, not “No operational rows yet” (`AeAdminReadbackPanel.tsx:81`). A membership denial says Admin access is required and returns to Overview (`admin-readbacks.ts:94`). It does not stop at an HTTP code, and it does not exit to Market. “Package 5” and “No approval can be claimed” (`SourceAuthorityReviewPanel.tsx:107`) become plain sentences: unable to confirm, reload and try again; the publication is verified, rerun the release task.

Colors, UI, and typography stay Clear. One filled confirm. Unmeasured contrast is not a repaint. No page-owned motion.

**Morph.** No new frame.

1. The failure table leads. Counts stay quiet. The confirm is loud only when it is the remediation.
2. The section describes the columns that exist. Empty says no index failures. Denial names Admin access and the way back. Person-facing outcomes drop “Package 5”.

Platform, cited and not morphed again here: distinct reference names and no resting alert on `AeAdminReadbackPanel`.

Refused: a Tool market. A purchase. A pager. Deleting the failure table to leave counts. A success hero. Inventing columns. A contrast repaint. Page-owned motion.

## `/admin/audit-events`

Job: an admin reviews security audit events. Without the Admin role, the page says Admin access is required.

**Good.** Opens on the event list. The one action is open one event, or filter to the events they mean. Many events stay a quiet table: what happened, who, when, and a redacted reference. Someone without the Admin role sees that Admin access is required and one way back. This is not the Tool market and not a purchase.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Accessibility | `AeAdminReadbackPanel.tsx:162`, `:164` | Object and Correlation both name the control “View reference”. The disclosure is `text-xs` with no minimum hit area. |
| 2 | MEDIUM | Accessibility | `AeAdminReadbackPanel.tsx:32`, `AeViewBar.tsx:58` | The authorized path announces “Readback available” with `role="alert"`. The filter count is a plain paragraph. |
| 3 | MEDIUM | Layout | `AeAdminReadbackPanel.tsx:32`, `admin.audit-events.tsx:33` | The authorized path opens on a success alert and four counts before the table. Columns stay the catalog-health set: every row is Guarded, “Inspect the audit record”, and available. Rows replace; there is no next page. |
| 4 | MEDIUM | Writing | `app-shell.contracts.ts:39`, `admin.audit-events.tsx:16`, `admin-readbacks.ts:94` | Nav says Audit, the title says Activity log, and the section says Audit readback. The description talks about source-owned membership and redacted payloads. A denied read names HTTP 403 and does not say what to do next. The empty state says “No operational rows yet”. |

**Clear.** Non-admin denial: one heading, the Admin-role sentence, and recovery actions. Typography: no sub-12px type; the filter stays 16px on mobile; counts use `tabular-nums`. Colors: semantic tokens; denied uses the destructive alert. Contrast not verified from source. UI: disclosure chevron and press folded here. The bounded read is one snapshot, not a missing pager.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. The page opens on the event list. The one action is open one event, or filter to the events they mean. This is not the buyer Activity list, not the Tool market, and not a purchase. Rows replace. There is no pager. There is no cognitive Seen row.

**Row 1. Platform on the names. Blocker on the hit area, fixed on the shared control.** Object and Correlation both say “View reference”. Cite the ledger. Do not rename them again on this page. The disclosure that opens the reference is `text-xs` with no hit floor (`AeAdminReadbackPanel.tsx:164`). That control is how they open one event. The shared `RefDisclosure` meets the 24px floor, aim 44. That hit area is part of the same panel fix. It is not a second morph.

**Row 2. Platform on the alert. Blocker on the count.** Resting “Readback available” cites the ledger. The filter count is a plain paragraph (`AeViewBar.tsx:58`). Filtering is half the job. One polite live region announces the new count. Do not swap status nodes.

**Row 3. The opening cites index health. The columns are a Blocker. Refuse a pager.** The success alert and four counts are the same panel as `/admin/index-health` row 3. Do not morph that lead again. The cells are the catalog-health set: Guarded, “Inspect the audit record”, and available (`admin.audit-events.tsx:33`). They do not answer this job. Paint `objectRef`, `updatedAt`, and `correlationId` from the rows the readback already returns. Do not invent who. The readback does not supply an actor. Do not add a pager.

**Row 4. Blocker.** Nav says Audit, the title says Activity log, and the section says Audit readback (`app-shell.contracts.ts:39`, `admin.audit-events.tsx:16`). One name: Audit. Activity stays the Call list. The description becomes “Review security audit events.” Empty is “No audit events”, supplied by this page, not the index-health sentence. A denial says Admin access is required and returns to Overview (`admin-readbacks.ts:94`). It does not stop at HTTP 403, and it does not exit to Market.

Colors, UI, and typography stay Clear. Unmeasured contrast is not a repaint. Disclosure chevron motion is Refuse. Do not restyle the page type scale to fix the disclosure.

**Morph.** No new frame.

1. The table shows the returned event facts: object reference, when, and correlation. It does not keep the catalog-health cells, and it does not invent who.
2. The filter count is one live region.
3. The page is named Audit. Empty says no audit events. Denial names Admin access and the way back.

Platform, cited and not morphed again here: reference names, the resting alert, the disclosure hit floor, and the success-alert lead.

Refused: a Tool market. A purchase. A pager. Deleting the event table. Renaming this page Activity. Inventing an actor column. A contrast repaint. Chevron motion. A route type scale.

## `/for-agents`

Job: one start to connect an Agent. This door does not list Agents, edit a Spending policy, or buy a Tool.

**Good.** Opens on Connect your Agent. The one action is Start setup. Other clients stay secondary. Questions wait below the start.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `brand-copy.ts:63`, `AeAssistantInstallFunnel.tsx` | Source-only. The heading is “Connect your Agent.” The button says “Connect an Agent”. The ordered setup then includes Open Agents and Set a Spending policy, and the deck mentions browsing Tools. |
| 2 | MEDIUM | Layout | `AeSiteFaq.tsx:25`, `AeAssistantInstallFunnel.tsx:41` | The FAQ nests a second rail inset. The Codex steps sit flush against the alternatives disclosure. The alternatives trigger is styled as a link. |
| 3 | MEDIUM | Writing | `brand-copy.ts:63`, `AeAssistantInstallFunnel.tsx:58` | The hero says “agents”, “tools”, and “spending limits”. The funnel also says “spending permission” and “tools” beside “Spending policy”. |
| 4 | MEDIUM | Typography | `AeCollectionRail.tsx:30` | The setup kicker uses the 10px caption token. |

**Clear.** Accessibility: one heading, named copy control, disclosures expose expanded state. Colors: one filled door button. Contrast not verified from source. UI: nested command radii folded here.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One door. It opens on Connect your Agent. The one filled action is Start setup. Other clients stay in a disclosure. Questions stay below. This page does not list Agents, edit a Spending policy, or buy a Tool.

**Row 1. Blocker.** The heading is “Connect your Agent.” The button is “Connect an Agent” (`brand-copy.ts:63`). The button becomes Start setup. The ordered setup then offers Open Agents, Set a Spending policy, and browsing Tools (`AeAssistantInstallFunnel.tsx`). Those steps leave this door. Unmount them. Start setup may still go to `/agent-access`. A line may say account connection does not set a Spending policy. It does not add a peer step that edits one. Do not mount a roster, a spending editor, or Market here. Claude Code and Cursor stay secondary.

**Row 2. Blocker on the disclosure. Platform on the FAQ. Refuse on the flush edge.** The alternatives trigger is styled as a link (`AeAssistantInstallFunnel.tsx:41`) while it discloses. Match the troubleshoot trigger, which already discloses without looking like a leave. The FAQ’s second rail inset is `AeSiteFaq`. Cite the ledger. Do not restyle this door alone. The Codex steps and the disclosure stay separate. The border already does that. Do not add a gap system for flush spacing.

**Row 3. Blocker.** The hero says agents, tools, and spending limits. The funnel says spending permission beside Spending policy (`AeAssistantInstallFunnel.tsx:58`). One name each: Agent, Tool, Spending policy. “spending limits” and “spending permission” become Spending policy. Lowercase tools and agents that mean the product objects become Tool and Agent. Do not turn the door into a buying pitch.

**Row 4. Platform.** The setup kicker uses the 10px caption token (`AeCollectionRail.tsx:30`). Cite the caption ledger. Do not bump it on this page.

Colors, UI, and accessibility stay Clear. One filled door button. Unmeasured contrast is not a repaint. Nested command radii are Refuse.

**Morph.** No new frame.

1. The filled button is Start setup. The funnel does not add Open Agents, a Spending policy editor, or browsing Tools.
2. The alternatives disclosure is not styled as a link.
3. The copy says Agent, Tool, and Spending policy.

Platform, cited and not morphed again here: the FAQ inset, and the caption token.

Refused: an Agent roster. A spending editor. A Tool market. A second filled start. A hero redesign. A contrast repaint. A radius restyle.

## `/for-providers`

Job: one start to list a Tool. This door does not open an operations inventory and does not buy a Tool.

**Good.** List a Tool comes first. What listing requires sits above that start. The one action is Add Tool. Questions sit below.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `AeSupplyLanding.tsx:71`, `:148`, `AeSupplyAgentProof.tsx:112` | Source-only. The heading is “Add a Tool.” Manage listed Tools leaves for the operations inventory. When listings load, each proof row opens a Market Tool. |
| 2 | MEDIUM | Writing | `provider-copy.ts:16`, `AeSupplyAgentProof.tsx:23` | The FAQ says public onboarding is not open and that the page tracks access, while the button is Add Tool. Proof copy says “AE” and “more tools”. The control block says “test calls”. |
| 3 | MEDIUM | Accessibility | `AeSupplyLanding.tsx:131`, `:133` | The steps block nests two named regions. The ordered steps and proof lists use `list-none`, so the sequence is not exposed as a list. |
| 4 | MEDIUM | Typography | `AeCollectionRail.tsx:30` | Rail kickers use the 10px caption token. |

**Clear.** Colors: one filled Add Tool button. Contrast not verified from source. UI: no page-owned icons or nested radii. No fee, payout timing, or refund rule is stated. The FAQ nests a second rail inset, the same shell as `/for-agents`.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One door. Add Tool is the filled start. What listing requires stays above that start. Questions stay below. This page does not open the operations inventory and does not buy a Tool.

**Row 1. Blocker.** “Manage listed Tools” leaves for `/owner/operations` (`AeSupplyLanding.tsx:148`). Published proof titles open a Market Tool (`AeSupplyAgentProof.tsx:112`). Those are other products. Unmount the inventory control. Proof stays facts. Drop the Market links. Do not delete the listing requirements. Do not invent a checkout. Add Tool stays the one filled action.

**Row 2. Blocker.** The FAQ says public onboarding is not open (`provider-copy.ts:16`) while the button is Add Tool. The answer names Add Tool. Person-facing AE becomes Agentic Economy. Cite the ledger. “more tools” becomes “more Tools”. “test calls” becomes “setup checks” (`AeSupplyLanding.tsx:146`). A check is not a Call. Do not invent a purchased Call. Do not empty the FAQ.

**Row 3. Blocker.** The steps block nests two regions with the same job (`AeSupplyLanding.tsx:131`). Keep the rail’s name. Drop the outer label. The ordered steps use `list-none` (`:133`). Remove it so the sequence stays a list. Do not delete the rail. Do not remake the proof rows as a numbered chrome.

**Row 4. Platform.** Rail kickers use the 10px caption token. Cite the caption ledger and `/for-agents` row 4. Do not bump it here. The FAQ inset cites the `AeSiteFaq` ledger. Do not restyle this door.

Colors and UI stay Clear. One filled Add Tool. Unmeasured contrast is not a repaint. Do not invent a fee, a payout clock, or a refund rule.

**Morph.** No new frame.

1. Unmount Manage listed Tools. Proof rows do not open Market.
2. The FAQ names Add Tool. The control line says setup checks. Person-facing copy says Agentic Economy and Tools.
3. The steps block has one region name, and the ordered list stays a list.

Platform, cited and not morphed again here: the caption token and the FAQ inset.

Refused: an inventory dashboard. A market of proof Tools. A checkout. A second filled start. Deleting the requirements. Flattening the steps rail. A contrast repaint. A fee line.

## `/about`

Job: explain what Agentic Economy is. This page does not sell, list Agents, or list Tools.

**Good.** Opens on that explanation. One optional way onward is enough. Many sections stay reading, not a wall of choices.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `AeAboutPage.tsx:25`, `AeSiteCtaBand.tsx:29` | Source-only. The first screen pairs Browse Tools and Add Tool before the explanation. The same pair repeats at the end. Four principles sit in peer cards. |
| 2 | MEDIUM | Writing | `brand-copy.ts:122`, `:124`, `:141` | The page calls AI agents a new kind of customer. Supply is “services” and “the outside service”. Evidence is “after the request”. Agent is capitalized in one line and not in others. |
| 3 | MEDIUM | Accessibility | `AeAboutPage.tsx:72` | The ABN link opens a new tab and does not say so. |

**Clear.** Typography: no sub-12px type, no inputs, no truncation. Colors: semantic tokens; one filled button beside an outline in each pair. Contrast not verified from source. UI: no page-owned icons or motion.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One reading page. It opens on the explanation. One optional way onward is enough, and it comes after that explanation. Sections stay reading. This page does not sell, list Agents, or list Tools. There is no layout Seen row.

**Row 1. Blocker.** Browse Tools and Add Tool sit before the explanation, and the same pair repeats at the end (`AeAboutPage.tsx:25`, `AeSiteCtaBand.tsx:29`). The open is the explanation. One onward remains, after it. The end band does not repeat the pair. The four principle cards stay. They are reading, not four next steps. Do not delete the editorial to leave a market door.

**Row 2. Blocker.** “a new kind of customer: AI agents” collapses Customer and Agent (`brand-copy.ts:122`). Customer owns the objective. An Agent acts for a Customer. “services”, “the outside service”, and “after the request” become Tool and Call. Agent is capitalized when it is the product role. Do not rewrite the page into a sales pitch.

**Row 3. Blocker.** The ABN link uses `target="_blank"` and does not say so (`AeAboutPage.tsx:72`). Announce that it opens in a new tab. Do not drop the link.

Colors, UI, and typography stay Clear. Browse Tools is filled and Add Tool is outline. That pair is still two doors. Unmeasured contrast is not a repaint. No page-owned motion.

**Morph.** No new frame.

1. The explanation leads. One onward follows. The opening pair and the repeated end pair go. The principle cards stay.
2. The copy keeps Customer, Agent, Tool, and Call distinct. The ABN link says it opens in a new tab.

Refused: a Tool grid. An Agent roster. A second hero. Deleting the explanation. Four checkout cards. A contrast repaint. Page-owned motion.

## `/privacy`

Job: state how personal information is handled. Sections stay reading. One privacy request is enough.

**Good.** Opens on how personal information is handled. Sections stay reading. If there is one action, it is make a privacy request. This page does not buy a Tool and does not connect an Agent.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Accessibility | `AeSiteUtilityDocument.tsx:82`, `privacy.contracts.ts:88`, `:146` | Section targets are not focusable from the contents list. Analytics copy names “Analytics preferences in the footer”, and that control is not in the footer. Complaints contacts are plain text. |
| 2 | MEDIUM | Cognitive load | `AeSiteUtilityDocument.tsx` | Source-only. The dedicated action is a Provider correction or removal. Email, a contact page, and the OAIC sit beside it as separate exits. |
| 3 | MEDIUM | Writing | `privacy.contracts.ts:21`, `:49` | Paid work is a “request”, not a Call. Purchase is framed only against the Provider. |

**Clear.** Layout: title, contents, then sections at a reading measure. Typography: no sub-12px type, no inputs. Colors: semantic tokens, no filled peer actions. Contrast not verified from source. UI: prose and links. Customer and Agent stay distinct in the copy. Fifteen sections are the notice, not a decision wall.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One notice. It opens on how personal information is handled. Fifteen sections stay reading. If there is one action, it is the privacy request already on the page: correction or removal. This page does not buy a Tool and does not connect an Agent.

**Row 1. Platform on the targets. Blocker on the false control and the email.** Contents links land on headings that cannot take focus (`AeSiteUtilityDocument.tsx:82`). Add `tabindex={-1}` on those headings once. Cite the ledger. Terms uses the same shell. Do not patch only this page. The analytics sentence names “Analytics preferences in the footer” (`privacy.contracts.ts:88`). That control is not in the footer. Change the sentence. Do not invent the control. Complaints leave `hello@aecon.ai` as plain text (`:146`). It is a mailto link.

**Row 2. Blocker.** After the notice, correction, email, a contact page, and the OAIC read as equal exits. One privacy request stays the action. Email and the contact page stay in the prose. They are not peer doors. The OAIC stays as the external complaint fact. It is not a second primary. Do not turn this notice into Provider operations. Do not unmount the fifteen sections.

**Row 3. Blocker.** “A paid request” is a Call (`privacy.contracts.ts:49`). Provider handling is not the Customer’s purchase (`:21`). Those two sentences keep Customer, Provider, and Call distinct. Person-facing AE in that paragraph becomes Agentic Economy. Lawful access, correction, and complaint requests stay requests. They are not Calls. Do not rewrite the rest of the notice. Do not invent tax or credit facts.

Colors, UI, typography, and layout stay Clear. Unmeasured contrast is not a repaint. Do not collapse the notice into a dashboard.

**Morph.** No new frame.

1. The analytics sentence stops naming a missing footer control. The complaints email is a link. One privacy request stays the action. The other exits stay facts in the prose.
2. The two commercial sentences name Call, Customer, and Provider. The rest of the notice stays.

Platform, cited and not morphed again here: focusable section headings on `AeSiteUtilityDocument`.

Refused: a footer analytics control invented for one sentence. A one-card notice. A market. Complaints as a second product. Rewriting every “request” into a Call. A contrast repaint.

## `/privacy/remove-business`

Job: ask to remove a business from public listing. This is not the privacy policy and not the Tool market.

**Good.** The request comes first. The one action is submit it.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `AeRemoveBusinessPage.tsx:12`, `privacy.remove-business.tsx:22` | Source-only. Three path cards sit above the form and do not set the reason. The heading is “Provider corrections”. |
| 2 | MEDIUM | Writing | `remove-business.contracts.ts:8`, `useRemoveBusinessPage.ts:67`, `RemovalRequestForm.tsx:135` | The default reason is “Remove Provider profile”. Path cards and the reason list use different words. The error says “Evidence summary” while the label is “What should change?”. The hint says “A short note is enough.” “Profile” stands in for Business and Provider. |
| 3 | MEDIUM | Accessibility | `RemovalRequestForm.tsx:77`, `:50`, `CorrectionPathCards.tsx:7` | The email field has no autocomplete token. Success uses `role="alert"`, and field errors also raise a form-level alert. Path titles are paragraphs. |
| 4 | MEDIUM | Typography | `RemovalRequestForm.tsx:108` | The reason select stays `text-sm` on a phone. |

**Clear.** Colors: one submit; errors use the destructive alert. Contrast not verified from source. UI: no page-owned motion. Path-list dividers folded here.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One form. The request comes first. The one action is submit. This is not the privacy policy and not the Tool market.

**Row 1. Blocker.** Three path cards sit above the form and never set the reason (`AeRemoveBusinessPage.tsx:12`). They delay the request. Unmount them. Do not wire them into the reason select. The heading is “Provider corrections” (`privacy.remove-business.tsx:22`). The title is the removal request. The form and one Submit stay.

**Row 2. Blocker.** The error says “Evidence summary is required” while the label is “What should change?” (`useRemoveBusinessPage.ts:67`). The error uses that label. The default reason is “Remove Provider profile” (`remove-business.contracts.ts:8`). “Profile” does not stand in for Business or Provider. The removal reason names the Business. Provider stays Provider. The hint “A short note is enough” stays. The cards are gone, so they do not keep a second vocabulary.

**Row 3. Blocker on the field and the alerts. Refuse on path headings.** The email field has no autocomplete (`RemovalRequestForm.tsx:77`). Add `autocomplete="email"`. Success uses `role="alert"` (`:50`). A recorded request is polite status. Field errors also raise a form-level alert. Keep the error on the field. A form-level alert is for a failure that is not a field. Do not turn the path titles into a second picker. The cards unmount in row 1.

**Row 4. Platform.** The reason select inherits `text-sm` from the shared select. Cite the ledger (`/calls/$callRef` row 5). Do not patch this page.

Colors and UI stay Clear. One filled Submit. Unmeasured contrast is not a repaint. No page-owned motion.

**Morph.** No new frame.

1. The form leads. The path cards unmount. The title is the removal request.
2. The error uses “What should change?”. Reasons name Business or Provider, not profile.
3. The email field autocompletes. Success is polite status. A field error stays on the field.

Platform, cited and not morphed again here: the shared select size.

Refused: wiring the cards to the reason. A privacy-policy reprint. A Tool market. Deleting the form. A second submit. A contrast repaint. Page-owned motion.

## `/terms`

Job: state the terms of use. Sections stay reading. This page does not buy a Tool.

**Good.** Opens on the terms of use. Those terms come first. Sections stay reading. This page does not buy a Tool, connect an Agent, or list supply.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Layout | `AeSiteUtilityDocument.tsx:21` | Below the large breakpoint, company destinations sit above the article. At large widths they own the leading column. |
| 2 | MEDIUM | Writing | `terms.contracts.ts:18`, `:35`, `:44` | Spending copy says “services”. Purchase is a “paid request”. The offer names a “supplying party”. The Customer definition says “an authorised agent” without the Agent term. |

**Clear.** Accessibility: one heading, labelled navigation, real links. Shared contents-target focus was not re-filed. Typography: no sub-12px type, no inputs. Colors: semantic tokens; link color tracks foreground and the underline carries the link. Contrast not verified from source. UI: prose and links. The contents list is a jump index. The statement leads the article.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One notice. The terms come first. Sections stay reading. This page does not buy a Tool, connect an Agent, or list supply. There is no cognitive Seen row.

**Row 1. Platform.** Below the large breakpoint, company destinations sit above the article. At large widths they own the leading column (`AeSiteUtilityDocument.tsx:21`). The terms stop leading. The article leads. Company links trail. They do not sit above the article, and they do not own the first column. Privacy uses the same shell. Fix it once. Cite the ledger. Do not restyle only this page. Section focus cites `/privacy` row 1. Do not morph that again.

**Row 2. Blocker.** Three sentences rename the chain (`terms.contracts.ts:18`, `:35`, `:44`). “an authorised agent” becomes “an authorised Agent”. “paid request” becomes purchase or Call where that sentence means the purchase or the Call. “services” that mean Tools become Tools. “supplying party” becomes Provider. Person-facing AE becomes Agentic Economy. Ordinary requests (support, complaint, closure) stay requests. Do not rewrite the rest of the terms. Do not invent a Seller fact these clauses do not state.

Colors, UI, typography, and accessibility stay Clear. Unmeasured contrast is not a repaint. Do not restyle the type.

**Morph.** No new frame. No composition Blocker on this page alone.

1. The three sentences keep Agent, Tool, Call, purchase, and Provider distinct.

Platform, cited and not morphed again here: the article leads on `AeSiteUtilityDocument`; section headings can take focus.

Refused: cutting the terms to one card. A market. Company destinations as the job. A full rewrite. Turning every “request” into a Call. A contrast repaint. A type restyle.

## `/support`

Job: explain the next step. The one action is email support and keep the reference. This page does not start a new Call.

**Good.** Opens on the next step, and on the Call reference when one was brought. The one action is email support with that reference kept. Without a reference, the page still states the next step. This does not start a Call and does not buy a Tool.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `AeSupportHelpPage.tsx:28`, `SupportStatusSection.tsx:23` | Source-only. Email support and Open this Call are both filled. The first body group is Call, Provider setup, and credit. Agent connection sits above private contact. The private section’s button opens a public issue. |
| 2 | MEDIUM | Writing | `SupportStatusSection.tsx:17`, `AeSupportHelpPage.tsx:26`, `AgentConnectionSection.tsx:17` | With no Call, the page still says “the original Call” and “trying again”. References are a “request or Call”. The button says “Review agent setup”. |
| 3 | MEDIUM | Accessibility | `PrivateSupportSection.tsx:19` | The public issue link opens a new tab and does not say so. |

**Clear.** A missing reference hides the Call banner. Typography: no sub-12px type, no inputs. Colors: semantic tokens. Contrast not verified from source. UI: one decorative external icon. No control on this page starts a Call.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. The page opens on the next step, and on the Call reference when one was brought. The one filled action is email support, with that reference kept. This page does not start a Call and does not buy a Tool.

**Row 1. Blocker.** Email support and Open this Call are both filled (`AeSupportHelpPage.tsx:28`, `SupportStatusSection.tsx:23`). Email support stays filled. Open this Call becomes outline. It stays when a reference was brought, because it opens that Call. It does not start one. The private section’s control opens a public issue (`PrivateSupportSection.tsx:19`). That control leaves the private section. Do not delete the Call banner when a reference was brought.

**Row 2. Blocker.** With no Call, the status line still says “the original Call” and “trying again” (`SupportStatusSection.tsx:17`). Name a Call only when one was brought. Do not invent a retry. The description says “request or Call” (`AeSupportHelpPage.tsx:26`). It says Call reference. “Review agent setup” becomes “Review Agent connection” (`AgentConnectionSection.tsx:17`). That control does not start a Call.

**Row 3. Blocker.** The public issue link uses `target="_blank"` and does not say so (`PrivateSupportSection.tsx:19`). Announce that it opens in a new tab. Do not drop the link. This is not a shared external-link constructor.

Colors, UI, and typography stay Clear. Unmeasured contrast is not a repaint. The decorative icon does not get motion.

**Morph.** No new frame.

1. Email support is the one filled action. Open this Call is outline and stays when a reference was brought. The public-issue control leaves the private section and says it opens a new tab.
2. Status copy names a Call only when one was brought. The Agent control says Review Agent connection.

Refused: a new Call. A Tool market. Two filled primaries. Deleting a brought reference. A retry control. A contrast repaint. Icon motion.

## `/status`

Job: say whether the platform is up. When a check fails, the one action is retry. This page does not buy a Tool.

**Good.** Opens on whether the platform is up. Checks stay a quiet list: what was checked, the result, and when. If something failed, the only action is retry. This page does not buy a Tool or start a Call.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `AeSystemStatus.tsx:24`, `StatusRecoveryPanel.tsx:20`, `StatusCheckList.tsx:15` | Source-only. When a check fails, Refresh stays outline and Open Calls or Help is filled. Help also sits in the footer. Each row repeats its own “Checked” time. |
| 2 | MEDIUM | Writing | `system-status.contracts.ts:74`, `:92`, `:120` | The intro says “shared agent interfaces”. Checking rows repeat “Checking now…”. “Last updated” and “Last checked” use different clocks. Recovery says “Open Calls to inspect its current status”. |
| 3 | MEDIUM | Colors | `system-status.contracts.ts:105` | A non-operational check uses the destructive badge. The status word is still on the badge. |

**Clear.** Accessibility: refresh is a button, status text is not color alone, and a polite live region reports the check. Typography: no sub-12px type, no inputs. UI: one refresh icon. Contrast not verified from source. The title states the platform answer. No purchase control.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. The page opens on whether the platform is up. Checks stay a quiet list. If a check failed, the one filled action is retry. This page does not buy a Tool and does not start a Call.

**Row 1. Blocker.** On failure, Refresh stays outline and Open Calls or Help is filled (`AeSystemStatus.tsx:24`, `StatusRecoveryPanel.tsx:20`). Refresh is the filled action. The recovery exit becomes outline or a quiet link. Footer Help stays a quiet link. Per-row “Checked” times stay. They do not bury the result. Do not delete them.

**Row 2. Blocker.** The intro says “shared agent interfaces” (`system-status.contracts.ts:74`). It says whether the platform is up. Tool readiness stays on Market and each Tool page. Every checking row shouts “Checking now…”. One busy signal stays on the page. Rows stay quiet. “Last updated”, “Checked”, and “Last checked” become one name: Last checked. Recovery that says “Open Calls to inspect its current status” stops. A failed check retries. It does not inspect platform status through Calls. Do not collapse the five checks into one badge.

**Row 3. Refuse.** A non-operational check uses a destructive badge and the word Degraded is on the badge (`system-status.contracts.ts:105`). Color is not the only cue. Destructive here means a failed check. Do not swap it to warning for taste. Unmeasured contrast is not a repaint.

Accessibility, typography, and UI stay Clear. Refresh stays a button. The refresh icon does not get motion.

**Morph.** No new frame.

1. On failure, Refresh is the one filled action. Open Calls and Help are not.
2. The intro names the platform. One clock: Last checked. Recovery does not send a failed check to Calls.

Refused: a Call as the failure action. A Tool market. Deleting the check list. A success hero over a failure. Collapsing the checks. A contrast repaint. Icon motion.

## `/fund/$fundingSessionId`

Job: say whether this exact session added credit. Never start a second payment. Funding is not authority.

**Good.** Opens on whether this exact session added credit. The one action, if any, resumes the work they left and never starts a second charge. Unknown stays unknown. This is not a Spending policy.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Writing | `funding-return.contracts.ts:9`, `:16`, `AeFundingReturnState.tsx:40` | An invalid link says “Open Credit to start again”. A settled session’s button is Open Agents. Unconfirmed and refresh-failed copy says “we could not”. |
| 2 | MEDIUM | Accessibility | `AeFundingReturnState.tsx:32`, `:63` | Each outcome mounts a new status region. Checking replaces the focused button and does not move focus. |

**Clear.** Layout: one answer and one action. In-flight states recheck this session. Typography: no sub-12px type, no inputs; amounts are prose. Colors: only a settled session uses the positive tone. Contrast not verified from source. UI: no page-owned icons or motion. Credit is not called a Spending policy.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One answer for this session. The one action resumes the work they left. It never starts a second charge. Unknown stays unknown. Funding is not authority. Credit is not a Spending policy.

**Row 1. Blocker.** An invalid link says “Open Credit to start again” (`funding-return.contracts.ts:9`). That reads as a new charge. The line becomes “Open Credit if you own the Account.” It does not say start again. A settled session keeps Open Agents (`:16`). That resumes work. It does not charge. “We could not confirm” and “we could not refresh” stay unknown (`AeFundingReturnState.tsx:40`). Do not turn them into a confirmed failure. Do not invent a balance.

**Row 2. Blocker.** Each outcome mounts a new `role="status"` (`AeFundingReturnState.tsx:32`). Cite the ledger: one region, its text changes. This component is this page. Do not restyle every `AePageState`. When Checking replaces the focused button, move focus to the outcome heading or that one region. Do not add a second payment.

Colors, UI, typography, and layout stay Clear. Only a settled session uses the positive tone. Unknown does not. Unmeasured contrast is not a repaint.

**Morph.** No new frame.

1. The invalid-link line does not say start again. Unknown stays unknown. Open Agents stays the settled leave.
2. One status region. Focus moves to the outcome when the check control unmounts.

Refused: a second charge. A Spending policy editor. An invented balance. Success paint on unknown. A contrast repaint.

## `/fund/cancelled`

Job: checkout was cancelled. No Account credit changed and no authority changed. One way back. This page never starts a payment.

**Good.** First: no Account credit changed and no authority changed. The one action is a way back. This page never starts a payment. Funding is not a Spending policy.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `fund.cancelled.tsx:24`, `funding-return.contracts.ts:4` | Source-only. The filled action is Try again and it opens Credit. Open Agents is a second exit. The body says no payment was made or Credit added, and does not say authority is unchanged. |

**Clear.** Accessibility: a real heading, status role, and two named links. Typography: no sub-12px type, no inputs. Colors: neutral tone, not a success fill. Contrast not verified from source. UI: no page-owned icons or motion.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. One cancelled checkout. First: no Account credit changed, and no authority changed. The one filled action is a way back that does not start a payment. Funding is not a Spending policy.

**Row 1. Blocker.** The filled action is Try again and it opens Credit (`fund.cancelled.tsx:24`). After cancel, that reads as a new payment. The body says no payment was made or Credit added, and it does not say authority is unchanged (`funding-return.contracts.ts:4`). State both facts. The filled leave does not say Try again. Open Agents stays outline. Do not invent a balance. Do not delete Open Agents. Do not add a Spending policy.

Colors, UI, typography, and accessibility stay Clear. The tone stays neutral. Unmeasured contrast is not a repaint. There is no status-node swap on this route.

**Morph.** No new frame.

1. The body states that credit did not change and authority did not change. The filled leave is not Try again. Open Agents stays quieter.

Refused: a payment start. A second filled charge. An invented balance. A success tone. A Spending policy editor. Deleting Open Agents.

## `/sign-in/$`

Job: sign in. This is not the Tool market, Agent setup, or a purchase.

**Good.** Sign in is first, and it is the one action. Creating an account stays secondary. Done means the person is signed in and can continue. The page does not invent a second job.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass. Clerk widget internals were not scored.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `sign-in.contracts.ts:32`, `AeSignInPage.tsx` | Source-only. Any `/owner` return says “Sign in to manage Tools” and “Provider Workspace”. With no return path, the body says “where you left off” while the fallback is Market. A methods list sits above the sign-in well. The shell still offers Browse Tools and a marketing footer. |
| 2 | MEDIUM | Layout | `AeSiteAuthStage.tsx:18`, `AeSiteAuthPanel.tsx:83` | The stage opts out of clipping, then the browser frame sets `overflow-hidden`. Rail gutter and page padding stack on a narrow phone. |

**Clear.** Accessibility: one heading, a labelled panel, and a decorative fallback. Typography: no sub-12px type in AE markup. Colors: semantic tokens. Contrast not verified from source. UI: one decorative mark, no page-owned motion.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. Sign in is first, and it is the one action. Creating an account stays secondary. Done means the person is signed in and can continue. This page does not invent a second job. Clerk widget internals stay unscored.

**Row 1. Blocker.** Any `/owner` return says “Sign in to manage Tools” and “Provider Workspace” (`sign-in.contracts.ts:32`). That wording stays only when the return is supply. A Market-bound `/owner` return is not Provider work. With no return path, the body says “where you left off” while the fallback is Market. The body names Market, or it stops claiming a remembered place. The methods list sits above the well. Drop it from AE copy. Method choice stays inside Clerk. The marketing footer’s filled Browse Tools competes with sign in. Do not mount that filled closer on this route. The muted header link is not this Blocker.

**Row 2. Platform.** The stage opts out of clipping, then the browser frame clips (`AeSiteAuthStage.tsx:18`). Rail gutter and page padding stack (`AeSiteAuthPanel.tsx:83`). Sign-up and onboarding use the same stage. Cite the ledger. Do not patch only this page. Do not invent a new auth hero.

Colors, UI, typography, and accessibility stay Clear. Unmeasured contrast is not a repaint. No page-owned motion.

**Morph.** No new frame.

1. Provider copy only on a supply return. The default body matches the Market fallback. The methods list leaves AE copy. The filled Browse Tools closer leaves this route.

Platform, cited and not morphed again here: the shared auth stage overflow and inset.

Refused: scoring Clerk. Turning the page into Market. A Provider pitch on every sign-in. A new auth hero. A contrast repaint. Page-owned motion.

## `/sign-up/$`

Job: create an account. This is not the Tool market, Agent setup, or a purchase.

**Good.** Create is the one action. Sign in stays secondary. The page does not sell a Tool, set up an Agent, or start a purchase.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass. Clerk widget internals were not scored.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Cognitive load | `sign-up.contracts.ts:36` | Source-only. A return to Agent connection titles the page “Create an account to connect an Agent”. A supply return titles it “Create a Provider account”. The body lists email, Google, GitHub, and a passkey before the form. |

**Clear.** Accessibility: one heading and named Sign in, Terms, and Privacy links. Layout, typography, colors, and UI: no page-specific findings beyond the shared auth stage. Contrast not verified from source. Sign in stays a text link.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. Create is the one action. Sign in stays a text link. This page does not sell a Tool, set up an Agent, or start a purchase. Clerk widget internals stay unscored.

**Row 1. Blocker.** A return to Agent connection titles the page “Create an account to connect an Agent” (`sign-up.contracts.ts:36`). A supply return titles it “Create a Provider account”. The title stays Create an account. Honest destination words may stay in the body. Provider wording stays only on a real supply return. The body lists email, Google, GitHub, and a passkey before the form. Drop that list from AE copy. Method choice stays inside Clerk. The marketing footer’s filled Browse Tools leaves this route, the same rule as sign-in.

Colors, UI, typography, accessibility, and layout stay Clear beyond the shared stage. Unmeasured contrast is not a repaint. Sign in stays a text link.

**Morph.** No new frame.

1. The title stays Create an account. Destination words may stay in the body. The methods list leaves AE copy. The filled Browse Tools closer leaves this route.

Platform, cited and not morphed again here: the shared auth stage overflow and inset (`/sign-in/$` row 2).

Refused: scoring Clerk. A market primary. A Provider pitch on every sign-up. A new auth hero. A contrast repaint.

## `/onboarding`

Job: set up the first workspace. Intent and a name, then continue and finish. This is not the supplier wizard.

**Good.** After sign-in, one short setup: say why you are here and name the workspace, then continue and finish. Listing, browsing, and buying do not interrupt it.

**Seen.** Source only. Skills read before code. Consolidated. Remedies are not in this pass.

| # | Severity | Domain | Location | What is there |
| --- | --- | --- | --- | --- |
| 1 | MEDIUM | Accessibility | `OnboardingRoleStep.tsx:27`, `useOnboardingPage.ts:93` | Role and workspace helpers are not tied to the controls. Continue and Create stay disabled until the step is valid. Back unmounts the focused control and does not move focus. |
| 2 | MEDIUM | Cognitive load | `onboarding.contracts.ts:16`, `:37`, `OnboardingWorkspaceStep.tsx:70` | Source-only. Both role cards say the intent can be changed in Settings. Buyer finish says “Workspace overview”. Provider copy says “Provider Operations”. The first step already describes naming. Skip completes setup with the suggested name. |
| 3 | MEDIUM | Layout | `OnboardingWorkspaceStep.tsx:23` | The name, the outcome line, the actions, and Skip sit as equal peers. |

**Clear.** Typography: the name field stays 16px on a phone. Colors: one filled continue or create. Contrast not verified from source. UI: no page-owned icons. Buyer and Provider stay separate labels. This is not the supplier wizard.

**Coverage.** Accessibility, layout, writing, typography, colors, UI, cognitive load: inspected. Verdict: Needs changes. Not verified in the browser.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

No composition swap. After sign-in, one short setup: why you are here, then the workspace name, then continue and finish. Listing, browsing, and buying do not interrupt. Buyer and Provider stay separate labels. This is not the supplier wizard.

**Row 1. Blocker.** Role and workspace helpers are not tied to the controls (`OnboardingRoleStep.tsx:27`). Tie them with `aria-describedby`. Continue and Create stay disabled until the step looks valid (`useOnboardingPage.ts:93`). A blank role or a blank name does not finish setup: the handlers return, and the server rejects an empty name. Drop those empty gates. Keep Create disabled only while the request is in flight. On an empty activate, mark the control, describe it, and focus it. Back unmounts the focused control and does not move focus. Move focus to a stable control on the role step.

**Row 2. Blocker.** Both role cards say the intent can be changed in Settings (`onboarding.contracts.ts:16`). That teaches a second job before finish. Drop it. Skip completes setup with the suggested name (`OnboardingWorkspaceStep.tsx:70`). Good requires the person to name the workspace. Remove that finish path. Buyer finish may stay Workspace overview. Provider finish may stay Provider Operations. The labels stay distinct. The role step does not teach naming. Naming is the next step. Do not add Market. Do not open the supplier wizard.

**Row 3. Blocker.** The name, the outcome line, the actions, and Skip sit as equal peers (`OnboardingWorkspaceStep.tsx:23`). One filled Create. Skip is quieter. It does not finish the workspace.

Colors, UI, and typography stay Clear. The name field stays 16px. Unmeasured contrast is not a repaint. No page-owned icons.

**Morph.** No new frame.

1. Helpers are tied to the controls. Continue and Create stay enabled until the request starts. An empty activate marks and focuses the field. Back moves focus.
2. The Settings promise leaves the role cards. Skip does not finish setup. Buyer and Provider finish lines stay distinct. Skip is quieter than Create.

Platform, cited and not morphed again here: the shared auth stage (`/sign-in/$` row 2).

Refused: the supplier wizard. A market. Deleting the name step. Two filled finishes. Keeping Skip as a silent finish. A contrast repaint.

## `/`, `/owner`, `/owner/market`

Job: there is no page. Each path sends the person to Market.

**Good.** There is nothing to see. The person arrives on Market.

**Seen.** Source only. These routes redirect before a page renders. `/` replaces to `/market` (`index.tsx:10`). `/owner` and `/owner/market` redirect to `/market` (`owner.index.tsx:8`, `owner.market.tsx:10`). There is no surface to inspect.

**Coverage.** Not a page.

**Approach.** 2026-09-22 full wave. Not built. Seen rows stay.

There is no page. `beforeLoad` throws before a surface renders.

`/` replaces to `/market` (`src/routes/index.tsx:10`). A search `q` becomes Market’s `query`. `/owner` redirects to `/market` (`src/routes/_operator/owner.index.tsx:8`). `/owner/market` redirects to `/market` (`src/routes/_operator/owner.market.tsx:10`). The person arrives on Market.

There is no component Seen row. There is no page to morph. Market’s wave already owns what they land on. Do not build a home, an owner lobby, or a second market at these paths.

**Morph.** No page. Nothing to ship on these three paths.

Refused: a landing page at `/`. An owner home at `/owner`. A market duplicate at `/owner/market`.
