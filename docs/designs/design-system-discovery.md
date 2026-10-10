# Discovery product, 2026-10-10

Source: 12 discovery-first personas with poteto journeys checked against source, a discovery study of 7 competitors and an opus synthesis. First opinion; second and third opinions are pending.

**Decision:** build a task-first catalogue. Search comes first, each task gets its own page, every row shows a name, a price and real output, and one install line works everywhere. Payment, trust and protocol show up only where they answer someone's question.

## Who comes and what they want

| Persona | In their words | How they browse | Priority now |
|---|---|---|---|
| Priya, weekend builder | "Search and scraping tools, price per call, in my agent tonight." | Task search, cards, copy install | Now |
| Agent mid-task | "Two or three tools for this URL: name, price, sample, callable now?" | MCP or HTTP search only | Now |
| Dana, startup engineer | "Is ElevenLabs here? What's next to it? One install for the team?" | Provider name, then alternatives | Now |
| Marcus, price feeds | "Ten say 'token price'. Fastest? Stocks too? Batch history?" | Search, sort, compare, `ae` | Now |
| Priya, lead lists | "Right person, working email, tech stack. Cost per row?" | Task search, compare three | Next |
| Marcus, client integrator | "Maps, property, weather side by side; a cost my client gets." | Category, then compare | Next |
| Marcus, SEO consultant | "Rank checks, backlinks, reviews, paid as I use them." | Category, task, recipe | Next |
| Sam, returning tinkerer | "What's new? Is my scraper still up, same price?" | Recency, known names, CLI | Next |
| Hannah, researcher | "App reviews, X chatter, search trends. What did it cost?" | Task page via link or agent | Later |
| Dana, store owner | "What could my assistant do for my shop, in normal words?" | Link from Claude | Later |
| Tom, phone scroller | "What's actually in here? Anything for my business?" | Scrolls tiles and cards | Later (the landing must win him in 30s) |

Now means builders and their agents. Next uses the same task pages. Later needs an install path for the Claude app.

## The discovery jobs
1. "Show me what my agent could do here."
2. "Find me a tool that does this" (or "Is this brand here?").
3. "Which of these should I use, and why?"
4. "Show me what it gives back before I commit."
5. "Put it in my agent, and tell me when something better turns up."

## The browse model

**Task-first, entered through search.** Nearly everyone arrives with a job, not a brand. The competitors agree:
- treg is "one page per job" ("24 providers · from $0.00483").
- Mercator says "Start with what you want to do".
- Nevermined's catalog leads with "Route a need".
- Locus lists providers, so 3,347 entries become "Page 1 of 70".

aecon's ~20k x402 listings have even more duplicates: one host farm made up ~17% of a September sample. A task page folds those duplicates into "14 tools, here's our pick". Categories, providers and the Most used rail are side doors.

Landing to first use:
1. /market, or a task page reached from Google or an agent, opens on "What should your agent do?" with task chips.
2. Typing "scrape a page" gives "Scrape a web page · 14 tools · from A$0.003 per call". Our pick comes first, with the reason.
3. Tick two and compare price, speed and example output.
4. Open one. Example output comes first, then **Try it** runs on your own input using starter credit. treg gives new accounts $1; our amount is the founder's call.
5. Copy `claude mcp add --transport http --scope user aecon https://app.aecon.ai/mcp`. It covers every Ready tool.
6. Ask the agent. The reply shows the result and "A$0.003".

## Page set and IA

Nav: **Search** (⌘K) · **Tasks** · **Providers** · **For your agent**. Signed-in users also get **Your tools**: saved and recent tools, with changes flagged. A "New this week" view needs a first-seen date, which we don't store yet.

| Page, URL: purpose | Top to bottom | One action | Copies |
|---|---|---|---|
| Landing `/market`: see what exists (aecon.ai's hero search lands here) | Search and chips; top tasks as tiles with counts; Most used this month; install strip | Search | Locus /tools, treg home |
| Catalog `/tasks`: every job | Category headings, each listing tasks with "N tools · from A$x" | Open a task | treg /use-cases |
| Task `/tasks/$slug`: choose for one job | Plain H1; "N tools · from A$x per call"; our pick and why; the prompt that works; ranked rows with compare boxes; the pick's example output; install; related tasks | Try our pick | treg /use-cases/find-professional-emails, Mercator /use-cases/company-data |
| Tool `/tools/$providerHost/$slug`: decide and try | Name, provider, one-liner, price, Ready/Listed, buyers; example output; Try it; install and a prompt; inputs with types; three same-task alternatives; Technical | Try it | treg /tools/serper, Locus skill file |
| Provider `/providers/$providerHost`: all of one provider | "13 tools · from A$x"; its tasks; tool rows; other providers for those tasks | Add to your agent | treg /tools/serper |
| Compare `/market?compare=…`: pick between 2 to 4 | Price, median speed, buyers, inputs, example output | Use this one | OpenRouter /compare |
| Recipes `/recipes/$slug` (Next): multi-step jobs | Prompt, the 2 to 4 tools, cost per row | Copy the prompt | treg /workflows |
| For your agent `/for-agents`, `/llms.txt`: install once | Availability first; one block per client; llms.txt opens "Search by task: POST /api/v1/market-tools/search"; a `.md` per tool | Copy install | treg /agents, Locus skill files |

How to build it:
- Write 25 task pages by hand. Publish a task page only when three of its tools had paid calls in the last 30 days. This reverses September's decision to defer the taxonomy.
- Assign tools to tasks with the existing search ranker, then review the result.
- Use one tool page template and fold `/tools/$toolRef` into it.
- Reuse `DirectoryComparison`, the `adoption` rail, `MarketSavedNeedAction`, the stored `output.exampleJson` and `providers.$providerHost`.

## Cards, rows and detail anatomy

- **Task tile:** task · "14 tools · from A$0.003" · three provider logos. Copied from treg's use-case card.
- **Tool row**, in order:
  1. Logo and a name that says what it does ("Firecrawl · Scrape a page").
  2. What comes back ("Any URL to clean markdown").
  3. "A$0.003 per call".
  4. Ready or Listed.
  5. "41 buyers · 30 days".
  6. "1.2s median", shown only once five samples exist (`TOOL_MIN_LATENCY_SAMPLE_SIZE`).
  7. Compare box.

  This is Locus's card plus OpenRouter's comparable fields. No hostnames, refs or source labels.
- **Provider card:** logo, name, one-liner, "13 tools · from A$0.002 per call", top two tasks. Copied from treg's "Serper: 13 tools from $0.001/call".
- **Example output:** the provider's own output from its x402 listing (`output.exampleJson`). If there is none, show the output fields and "No example published".
- **Install:** one copy line per client, plus a prompt to paste ("Use aecon to scrape https://example.com").
- **Agent result** (MCP text, `ae search`, HTTP): three results, each with name, provider, price, Ready or Listed, a three-line sample and the exact call. Bookkeeping stays in `structuredContent`.
- **Price:** "A$0.003 per call". Use "from" only on tiles, providers and task headers. Quote-priced tools say "price shown before each call".

## Hard moments

- **No match:** say "Nothing for 'ABN lookup' yet." Show the nearest task with its count, a broader search, and **Tell me when one arrives** (the existing saved need).
  - Search the whole catalogue before saying no. On 10 Oct, "scrape a web page" examined only 6 listings ("coverage: partial") and returned 2.
  - When search is down, say "Search didn't finish. Your words are kept."
- **Too many:** "price" spans four tasks, so show four rows ("Token price · 23"), not 40 cards.
  - Inside a task, show our pick (Ready, then most buyers, then cheapest), five more rows, then "Show all 23".
  - Fold one host's duplicate listings into one row.
  - Chips: Cheapest, Fastest, Has example.
- **Try fails:** keep the input and say whether the problem was the input, the provider or a timeout. Say "You weren't charged", or show the amount and receipt. Offer "Try the next pick · A$0.002" with the same input.
- **Not yet callable:** say "Listed on x402. Not through aecon yet."
  - Show its published example, the Ready tools for the same task, **Ask us to add it**, and a "Call it directly" snippet for x402 wallet holders.
  - While paid calls are invite-only, say so once, at the top of the install block, with **Request access**.

## Language

One word per concept:
- **Tool**, not capability, endpoint or listing.
- **Provider**, not Directory Host or publisher.
- **Task**, not use case or need.
- **Ready** (works through aecon now) and **Listed** (x402 only), never admitted, routeable, assessed or readiness.
- **Add to your agent**, not Connect an Agent or Set up to get a Quote.
- **Try it**, not playground.
- **41 buyers · 30 days**, not Coinbase Bazaar calls.

Price is always "A$0.003 per call", never USDC, US$, "source price" or Quote. Also banned: AE, coverage, scope, provenance, refs and `eip155`. Use "x402" only on the landing and on Listed tools.

Locus often prints no number ("Varies by endpoint and usage"). treg mixes units (/call, /success, per 1M bytes). aecon uses one currency and one unit, and always shows a number.

## What aecon can own versus Locus and treg

1. **The whole x402 shelf, sorted by task.** aecon indexes about 20k listings, against treg's 3,860 endpoints and Locus's 3,347 entries. Folded into tasks, that becomes "14 tools scrape a page; use this one". This only counts once search reads the whole catalogue.
2. **Real use and real output before signup.** aecon already has 30-day buyer and call counts per tool from x402 settlement data, and it stores provider-published example output. Locus shows neither. treg shows no real output, and its usage figure counts only its own traffic ("619,868 calls measured").
3. **One install, one A$ balance, a receipt per call.** The same search works on the web, over MCP and in `ae`. One line puts every Ready tool into Claude Code, Cursor or Codex, and each call is itemised in A$ for a client invoice. Locus's catalog has no install line. Put this at the end of each page, not the top.

## What to stop

- The slogan hero and "What's your next move?" (`MarketLanding.tsx:32,50`), and category tiles that search their own label via a third party (`:58,70`).
- "N assessed · AE + Coinbase Bazaar · coverage" and the recipient note on every result (`AeX402Directory.tsx:426-427`). Move that disclosure to the privacy page.
- Provenance lines ("Title source: business published"), the hard-coded "No published output example", and primary buttons like "Set up to get a Quote" (`PublicToolDetail.tsx:80-89`).
- USDC, US$ and USD shown beside A$, and the "Coinbase Bazaar calls · 30 days" column (`DirectoryToolList.tsx:74`).
- Agent text that opens with scope and coverage, MCP replies that say only "name: kind." (`mcp-api.ts:230`), and an llms.txt whose first example is "wallet balance".
- Setup commands followed by "purchases are not open yet" (`brand-copy.ts:80`). Say it first, once.
- The MCP id `agentic-economy`. Use `aecon`.

Code references are under `/Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/`.

---

## Second opinion (data and code), 2026-10-10
The direction (task-first) is right, but the order is wrong. About half the proposal assumes data or callability that aecon does not have.

**Works with today's data:**
- the copy and IA cleanup
- one tool template
- the Most used rail
- provider pages
- folding duplicate listings from one host
- calling things "Listed" consistently

**Depends on `feat/call-any-x402` landing:** Ready status, Try it, our pick, and one install covering every Ready tool. Today 0 of 20 common tasks have a Ready tool.

**Needs data aecon does not have:**
- first-seen dates
- a task taxonomy
- example outputs for callable tools
- aecon's own call counts and latency
- curated picks

**Corrections:**
- "41 buyers" is the Bazaar's declared payers30d, not aecon settlement data.
- The rule "publish a task page when 3 tools had paid calls" publishes nothing today.
- "Search the whole catalogue" conflicts with the reranker cap of 24 candidates and with today's search outage.
- "Real output on every row" conflicts with "No example published" being the common case.

**Honest sequence:**
- **S0:** fix search (no errors, full-catalogue recall, honest coverage).
- **S1:** clean titles, fold duplicates, fix the "Tool unavailable" redirects, clean up copy.
- **S2:** land x402 so at least 3 of 20 common tasks have a Ready tool, and record first-seen dates.
- **S3:** hand-write about 10 task pages, gated on a Ready tool rather than paid calls.
- **S4:** Try it, compare and speed, once aecon call samples exist.

## Third opinion (competitors re-verified live, design shape), 2026-10-10
**Verified:**
- treg's "One page per job" and "24 providers · from $0.00483". The unit on that page is "per found".
- treg's $1 starter credit and "Serper: 13 tools".
- Locus: 3,347 entries, "Page 1 of 70", no install line.
- OpenRouter has a 3-slot compare.

**Corrected:**
- Mercator's "Start with what you want to do" is on /use-cases, not /use-cases/company-data.
- Nevermined's catalog is search-first ("Search 162 AI Services", grid, 14 pages). "Route a need" is not there.
- treg's home page shows the install block and category tiles first, with no search above the fold and no task-first layout. It claims "3,800+" endpoints, not 3,860.
- OpenRouter compare speed fields are unverified.

**Verdict:** task-first is right for the second click and wrong for the first screen. Under the first proposal a new visitor sees a prompt and count tiles, but no real tool, no named brand with a price, and no output.

**Changes:**
1. Above the fold, show 6 to 8 real Ready tools with logo, price, buyers and a one-line output. Task chips filter that list.
2. Search returns tools and tasks mixed, matching brand names first.
3. Put the install line on the landing page next to the tools.

## Reconciled position (all three opinions)
- **First screen.** Real tools with prices and output, plus the install line. This takes the third opinion; Locus and Nevermined are search-first.
- **Second click.** Task pages and filters, as treg does.
- **Order.** The second opinion's S0 to S4: fix search, clean the catalog, land x402, then task pages, then try and compare.
- **Constraint from the second opinion.** The first screen needs Ready tools, and none exist until x402 lands (S2). Until then the first screen shows the best Listed tools, labelled honestly.
