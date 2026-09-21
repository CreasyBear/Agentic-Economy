# FIND walk — walker 1

**Date:** 2026-09-21  
**App:** `http://127.0.0.1:3024` (desktop, cursor-ide-browser)  
**Method:** code + browser snapshot/screenshot + interpretation  
**Law applied (not rewritten):** [platform-experience-audit.md](../../designs/2026-09-21-platform-experience-audit.md) §2 S1–S7, page contract, Discover/decide group; [buyer-journey-baseline.md](../buyer-journey-baseline.md) Market / Listing / Ask rows; [DESIGN.md](../../../DESIGN.md) five questions.

No dests invented. No purchase. No register rewritten. Compare was attempted from cards; it never started. Listings never yielded a `toolRef`. `/owner/market` stopped at sign-in.

---

### `/` — redirect

Job (one sentence): Send a visitor (and any `?q=` need) into the Tool market without a second home.

Code: `src/routes/index.tsx` `beforeLoad` redirects to `/market`, mapping `search.q` → `query` (`index.tsx:9-14`). No page container renders. Primary action is the redirect itself.

Visual: Opening `http://127.0.0.1:3024/` landed on title **Agent tool market | Agentic Economy** at `/market`. Header **Find Tools**. Eyebrow **THE TOOL MARKET**. Heading **Tools for what’s next.** Search **Describe what you need done…**. Collections tab selected.

Interpretation: Visual matches the code job. One action: leave `/` for Market. This is not a buyer decision page; it does not answer DESIGN.md’s five questions and should not.

Verdict: PASS

Evidence: SEEN url `http://127.0.0.1:3024/market`

Handoff: Need string `q` becomes Market `query`. Everything else on `/` dies because the route never renders.

---

### `/market` — Collections (default discover)

Job (one sentence): Describe a need and start a shortlist of suitable Tools (J-B01, J-B02).

Code: `src/routes/market.tsx:75-78` → `AeMarketPage` → `AeX402Directory`. Default view is `discover` when home exists (`AeX402Directory.tsx:110`; `resolveMarketView` in `market-route-data.ts:81-85`). Primary implemented action is **Search** (`AeX402Directory.tsx:201-210`), which navigates to Tools with `query`. Cards implement open-listing via the title `Link` (`DirectoryToolCard.tsx:41-42`) and a footer **Compare** (`DirectoryToolCard.tsx:59-62`).

Visual: **THE TOOL MARKET** / **Tools for what’s next.** Deck: “Search the web. Work with data. Make something new. Give your agent the capability to take the next step.” Search **Describe what you need done…**. Need chips **Research a topic**, **Create an image**, **Explore markets**. Editorial tile **Explore creative Tools** / **From possibility to something real.** Tabs **Tools**, **Collections** (selected), **Providers**, **Saved**. Count **15,158 Tools**. Job chips **Create**, **Research**, **Build**, **Markets**, **Commerce**, **Identity**. Rail **CREATIVE** / **Bring an idea into view** / “Discover image generation and creative services for your next project.” First cards: **Suede AI · app.suedeai.ai** / **AI image generation from a text prompt.** / **Returns imageUrl · jobId · pollUrl** / **Used recently by other agents** / **Provider-listed price** **0.15 USDC** / **Provider price per Call**; next card **Returns created · data · b64_json** / **0.08 USDC** / **13 Provider payment options**. Footer action on each card: **Compare**.

Interpretation: Hero job matches “find a capability.” Card job does not. The showroom speaks outcome; the shelves speak indexed Bazaar metadata (`b64_json`, `pollUrl`, payment-option counts). Compare is the labeled item action; opening the Tool is the title stretch-link (S6 / card hierarchy). Cards speak like callable Tools (“Used recently by other agents”) with no indexed-vs-callable mark. Listed price is labeled **Provider-listed price**, not Quote — that label is honest; the surrounding fields are not a decision layer. Compare clicks throw (see Compare state). DESIGN.md Q1 is only partly answered (title + Provider host); Q2 Seller/Customer/Agent absent; Q3 money is Provider USDC not authority; Q4 claimed Provider facts; Q5 next valid action is Compare, which does not run.

Verdict: FAIL

Evidence: SEEN url `http://127.0.0.1:3024/market`

Handoff: Search / collection chip carries `query` onto Tools. Tab change to Saved/Providers/Discover replaces search with `{ view }` only (`AeX402Directory.tsx:231-235`) — the need dies. Compare selection never enters the URL.

---

### `/market?query=image+generation+creative` — Tools search

Job (one sentence): Turn a stated need into a shortlist the buyer can inspect or compare.

Code: Same Market route. Query forces `view: 'tools'` (`market-route-data.ts:84`). Results render `toolGrid` of `DirectoryToolCard` (`AeX402Directory.tsx:181-187`, `:337`). Primary item action in source is still the title `Link` to `/tools/$providerHost/$slug`; the visible control is **Compare**. Search submit does **not** call `carryMarketCompare` (`AeX402Directory.tsx:205-209`).

Visual: URL `http://127.0.0.1:3024/market?query=image+generation+creative`. Compact hero **Explore capabilities.** Search value **image generation creative**. Tab **Tools** selected. **16 matching Tools on this page**. Heading **Results for “image generation creative”**. **Clear search & filters**. **Filters**. First result is Suede: **AI image generation from a text prompt.** / **0.15 USDC** / **Provider price per Call**. Second: **OpenAI-compatible image generation over x402** / **0.08 USDC** / **13 Provider payment options**. Same **Returns …** schema keys. Footer **Compare** on every card. No readiness / callable badge. Footer note: “Directory: Coinbase Bazaar. Descriptions and payment requirements are published by providers.”

Interpretation: Need-ask works; results exist; listed price ≠ Quote is labeled. Visual does **not** match the Discover/decide contract: cards do not distinguish indexed directory rows from callable Tools; Compare is the dominant item action; opening a card (next section) is unavailable. No human no-fit — 16 matches — but the matches are not inspectable. Same DESIGN.md gaps as discover.

Verdict: FAIL

Evidence: SEEN url `http://127.0.0.1:3024/market?query=image+generation+creative`

Handoff: Query stays in the URL while the Tools tab is open. **Clear search & filters** and tab changes drop it. Card hrefs collected: `/tools/app.suedeai.ai/agent-image`, `/tools/agent402.tools/v1-images-generations`. Compare set is not written.

---

### `/market` — Compare (add 2 → dialog → listing → Back)

Job (one sentence): Keep a ≤4 shortlist and compare the same facts after inspect (baseline Compare / S5).

Code: Selection is *read* from `search.compare` (`AeX402Directory.tsx:124-133`; persist helpers `market-route-data.ts:14-56`). Tray **Compare Tools** opens `DirectoryComparison` (`AeX402Directory.tsx:190-196`, `:362-365`; dialog title **Compare Tools**, `DirectoryComparison.tsx:29-30`). Toggle **writes** `setComparison(...)` (`AeX402Directory.tsx:176-179`) — **that setter is not defined**. Clear tray also calls `setComparison([])` (`:194`).

Visual: First two Compare buttons were clicked on the search results. URL stayed `?query=image+generation+creative`. No **Selected comparison** tray. Buttons stayed **Add … to comparison** / `aria-pressed=false`. Dialog never opened. CDP: `Uncaught ReferenceError: setComparison is not defined`.

Interpretation: Visual matches the broken code, not the intended job. Compare cannot start, so it cannot survive inspect. URL carry exists in source and is unused by the button. Tab/search navigations would drop `compare` even if the URL were populated. Baseline “Compare dies on inspect” is weaker than what was seen: Compare dies on click.

Verdict: FAIL

Evidence: SEEN url (unchanged search) + console `setComparison is not defined`

Handoff: Nothing. Selection never enters history, search, or the listing.

---

### `/market?view=saved` — Saved (save one, leave, return)

Job (one sentence): Keep a few candidate Tools and find them again.

Code: Heart on the card calls `saved.toggleSavedTool` (`DirectoryToolCard.tsx:34-36`; storage `ae:directory:saved-tools:v1` in `DirectorySavedTools.tsx` / `saved-tools.contracts.ts`). Saved tab is `{ view: 'saved' }` (`AeX402Directory.tsx:231-233`, `:258-270`). Primary item action remains the title `Link` / **Compare**.

Visual: After Save on the Suede search card, tab read **Saved (1)**. URL `http://127.0.0.1:3024/market?view=saved`. Compact hero **Find your next capability.** Heading **Your saved Tools**. Note **Saved on this browser · Prices may have changed**. Card: **Suede AI · app.suedeai.ai** / **AI image generation from a text prompt.** / **Returns imageUrl · jobId · pollUrl** / **Provider-listed price** **0.15 USDC** / **Provider price per Call**. Heart **Unsave** pressed. Left to Collections (`/market?view=discover`, tab still **Saved (1)**). Returned: same card still present.

Interpretation: Persist job matches code and visual. Search need died when entering Saved (query stripped from URL; search box empty). Saved card is the same indexed projection as Market — still not marked callable. Opening it is the listing fail below, not a Saved-storage fail.

Verdict: FAIL

Evidence: SEEN url `http://127.0.0.1:3024/market?view=saved` after leave/return

Handoff: Saved set survives tab leave/return in this browser. The originating search does not. Compare on the saved card still throws. Opening the card does not carry the Saved view or the original query unless `fromMarket` history-back applies.

---

### `/tools/app.suedeai.ai/agent-image` — first search result (Suede)

Job (one sentence): Decide whether to use this Tool with an existing Agent, or leave (J-B02, J-B03).

Code: `src/routes/tools.$providerHost.$slug.tsx:13-46` → `AeDirectoryToolCanonicalPage`. Found path: indexed summary then `Await` admission → `PublicToolDetail` (`AeDirectoryToolCanonicalPage.tsx:27-35`). Intended primary action on a found Tool: copy **Tool reference** and/or **Connect an Agent first** (`AeToolNextAction.tsx:64-76`; `tool-inspector-model.ts:50-55`). This walk rendered the unavailable branch: **Tool details are unavailable** + **Browse current Tools** (`AeDirectoryToolCanonicalPage.tsx:64-74`; `MarketBackButton.tsx:22-29` → `/market` when `fromMarket` is absent).

Visual: Title **Tool unavailable | Agentic Economy**. Region **NOTICE**. Heading **Tool details are unavailable**. “AE cannot verify the current directory entry right now.” Primary control **Browse current Tools**. No Tool name, Provider, listed price, readiness, or Quote. No `toolRef`.

Interpretation: Visual does **not** match the listing job. A featured/search card opened as an unavailable page dressed as a Tool (EX-01; audit § “The promise breaks at the next click”). Indexed ≠ callable, and the listing does not say that until it fails. DESIGN.md five questions: none answered. One primary action exists for this *error* state (**Browse current Tools**), and it predicts `/market` with the need discarded.

Verdict: FAIL

Evidence: SEEN url `http://127.0.0.1:3024/tools/app.suedeai.ai/agent-image`

Handoff: Direct navigation had no `fromMarket`, so Back/Browse is bare `/market` — search, Saved view, and compare (had it existed) die. Saved localStorage entry remains (`resource` `https://app.suedeai.ai/agent/image`). No `toolRef` to carry.

---

### `/tools/agent402.tools/v1-images-generations` — second search card

Job (one sentence): Same listing job: inspect one Tool and take it into an Agent, or leave.

Code: Same slug route and unavailable branch as Suede (`tools.$providerHost.$slug.tsx:43-45`; `AeDirectoryToolCanonicalPage.tsx:64-74`).

Visual: Identical unavailable page. Heading **Tool details are unavailable**. “AE cannot verify the current directory entry right now.” **Browse current Tools.**

Interpretation: Not a Suede-only miss. The first two search cards both fail inspection. Indexed directory identity does not survive into a callable listing.

Verdict: FAIL

Evidence: SEEN url `http://127.0.0.1:3024/tools/agent402.tools/v1-images-generations`

Handoff: Same as Suede. No `toolRef`. Compare still empty.

---

### `/tools/$toolRef` — no listing ref; invalid probe only

Job (one sentence): Inspect one admitted Tool by stable ref (or say why it cannot be shown).

Code: `src/routes/tools.$toolRef.tsx:16-58` → `PublicToolDetail`. Invalid ref → **This Tool reference is invalid** (`PublicToolDetail.tsx:56-61`). Found + canonical slug → replace redirect to `/tools/$providerHost/$slug` (`tools.$toolRef.tsx:23-29`). Found without canonical: `AeToolInspector` / copy **Tool reference** + **Connect an Agent first** (`AeToolNextAction.tsx:64-76`). Price on that path is **Indicative price** (`AeToolDecision.tsx:26-30`), not a Quote.

Visual: No listing produced a `toolRef` (saved entry has `resource` / `metadataJson`, no `operation:v1:`). Probe `/tools/not-a-ref` (same dest family, not a found Tool): heading **This Tool reference is invalid**. “The reference is malformed, so AE did not query the catalog or show commercial facts and invocation steps.” **Browse current Tools.**

Interpretation: Found/callable listing was not seen. Invalid-ref copy is honest and does not invent a Quote. The buyer cannot reach the intended “Use this with your Agent” state from this walk.

Verdict: BLOCKED (found / callable); FAIL is not claimed for the missing happy path. Invalid-ref state SEEN.

Evidence: BLOCKED from listings; SEEN url `http://127.0.0.1:3024/tools/not-a-ref` for the invalid branch only

Handoff: Nothing from Market. Source-only: a real `operation:v1:` ref would copy into the Agent or `resumeTool` on `/agent-access`.

---

### `/t/new` — Ask / new chat

Job (one sentence): Name a need and keep candidates that can rejoin the Market listing journey (J-B01). Chat cannot buy.

Code: `src/routes/t.new.tsx:24-38` → `Chat` (`chat-session/Chat.tsx:4-7` → `ChatLayout`). Empty primary is suggestion chips + **Send** (`ChatTranscript.tsx:56-66`; `ChatComposer.tsx:64-73`). Copy: **Search the catalog.** / “Name a job. Compare, inspect, then call. Price is on the card.” (`chat-ia.ts:5-8`, `:25-31`). Header **Ask** / **Private to this browser session**. Backend chat tools include `tool.quote` and `tool.call` (`convex/chatTools.ts:96-128`, `:352-399`).

Visual: URL `http://127.0.0.1:3024/t/new`. Title **New chat | Agentic Economy**. **Ask** / **Private to this browser session**. Heading **Search the catalog.** Deck “Name a job. Compare, inspect, then call. Price is on the card.” Chips **Find a weather API**, **Compare lookups**, **Inspect before a call**. Composer **Find a weather API my agent can call** / **Send message**. Counter **0 / 12 browser messages**. No Tool cards (empty). No Quote. No Call.

Interpretation: Empty state is a discover prompt, not “Use this with your Agent.” “Then call” on a human Ask page contradicts the baseline (Chat cannot buy) and DESIGN.md Q5. Code can purchase for an interactive-chat principal (EX-04 / JI-04b); this walk did not send a message, so purchase was not exercised. Same card facts as Market were not shown because the thread was empty.

Verdict: FAIL

Evidence: SEEN url `http://127.0.0.1:3024/t/new` (empty only; no prompt sent)

Handoff: `?q=` can seed `initialPrompt` (`t.new.tsx:25-34`). Market search was not carried. A created thread goes to `/t/$threadId`. Nothing from Compare or Saved.

---

### `/owner/market` — auth gate

Job (one sentence): Same Market find/compare job, in owner chrome, then continue through an Agent (`owner.market.tsx:44-45`).

Code: `/_operator` `beforeLoad` `requireOperatorBeforeLoad` (`_operator.tsx:13`; `require-operator-session.ts:28-30`) → Clerk sign-in with `redirect` = current href. Authenticated leaf: `AeOperatorPage` + `AeX402Directory` `workspace` `marketPath="/owner/market"` (`owner.market.tsx:8-59`). Sign-in copy treats every `/owner*` redirect as Provider: **Sign in to manage Tools** / “you’ll return to your Provider workspace.” (`sign-in.contracts.ts:25-34`).

Visual: Redirect **SEEN** `http://127.0.0.1:3024/sign-in?redirect=%2Fowner%2Fmarket`. **Back to market**. Eyebrow **Account**. Heading **Sign in to manage Tools**. “Use email, Google, GitHub, or a passkey. After you sign in, you’ll return to your Provider workspace.” GitHub / Google / **Email address** / **Continue** / **Don’t have an account? Sign up**. Workspace Market was not rendered.

Interpretation: Auth gate is real (BLOCKED). The gate’s job language is wrong for this dest: `/owner/market` is buyer find in operator chrome, not Provider publish (`owner.market.tsx:16-21` group **Buy**). S2/S3 fail on the gate even before the page. `redirect=/owner/market` is preserved (S5 for the path). Compare/search from public Market do not exist here yet.

Verdict: BLOCKED

Evidence: BLOCKED login — SEEN url `http://127.0.0.1:3024/sign-in?redirect=%2Fowner%2Fmarket`

Handoff: Path survives as `redirect`. Public Market query/compare/Saved are not on that URL. Signing in was not done.

---

## Cross-page (Discover/decide + S1–S7)

| Rule | Observed |
| --- | --- |
| S1 One buyer proposition | Hero is understandable; cards force API translation. |
| S2 Stable dest names | `/` → Market works. **Find Tools** is a command panel, not a dest. `/owner/market` gate names Provider workspace. |
| S3 One interaction language | Compare is the labeled card action; inspect is the title. Ask says “call.” Gate says “manage Tools.” |
| S4 Connected journey | Find → inspect breaks on the first two cards (EX-01). |
| S5 Context survives | Saved set survives. Search dies on Saved/Collections. Compare never starts. Listing Back without `fromMarket` is bare `/market`. Sign-in keeps `redirect`. |
| S6 Essentials first | Listed USDC is present; callable-vs-indexed, Quote disclaimer in-context, and a use-with-Agent action are not. |
| S7 Input modes | Not the assignment this walk; search and tabs are labelled. Compare is a dead control. |
| Group: same identity/price/need | Card and listing do **not** agree — listing never shows the card’s Tool. Need drops on tab change. Compare set does not exist. |
| DESIGN.md five questions | Not answerable on any opened listing. Market cards answer Tool + Provider-listed money only. |
| Listed price vs Quote | Cards/dialog source say Provider-listed / preliminary; Ask copy says “Price is on the card” then “call.” No Quote was shown. |
| Indexed vs callable | Indexed Bazaar rows are presented as Tools; admission fails on inspect. |

## Carry / die

Carry: `/` → `/market`; need `query` while Tools search stays open; Saved (1) in this browser; sign-in `redirect=/owner/market`.

Die: Compare selection; search when changing Market tabs; listing inspect; `toolRef`; Ask thread (none started); owner Market page itself.
