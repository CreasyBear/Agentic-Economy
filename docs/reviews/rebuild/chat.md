# Chat as a front door — 29 September 2026

**Date:** 29 September 2026
**Checkout:** `d104a80099214df0500e54850b5a5a4b96cfbc9c`
**Lens:** what Ask does that Market search and Tool detail do not, and whether chat should be the primary entry for alpha.

## Answer

Chat should not be the primary entry. For alpha it is a secondary helper at most, and a full Ask thread is an unnecessary second product beside the catalogue.

The buyer job is to find a Tool, read its contract, and later Quote and Call. Market search plus Tool detail already do the first two. Signed-out chat calls that same search, then on this sample hid real matches, invented Tool references, or returned no answer. It cannot buy. `PRODUCT.md` already describes the useful shape: thin chat translates a sentence into search, detail, comparison, Quote and eligible execution against the same market. The live Ask thread is not that translator. It is a second agent, with its own model hop, tool budget and failure modes.

The Market page already puts both products on the first screen. The hero copy is the catalogue ("THE TOOL MARKET", "Tools for what's next."). The text field under it submits to Ask. The chips under that ("Research a topic", "Create an image", "Explore markets") set a Market `query` instead. One hero, two doors.

## Evidence

**Live.** Local Vite at `http://127.0.0.1:3024`, process started 14:39 on 29 September 2026. Responses carried no source-revision header, so a live call proves this process, not a separate deployment. Every call was signed out (`x-clerk-auth-status: signed-out`). No Quote, Call or charge was made. These were the HTTP surfaces the pages use, not a browser click-through: `POST /api/v1/market-tools/search` (header **Find Tools** and the Tools-tab **Search Tools** field), `POST /api/chat/anonymous` (Ask), `POST /api/v1/market-tools/describe` for an admitted Tool, and `GET /api/v1/registry/detail` for one Bazaar listing. Times are one sample of server time, not paint time and not a percentile.

**Source.** Hero form and chips: `src/components/ae/market/AeX402Directory.tsx` (the form posts into `/t/new`) and `src/components/ae/market/DirectoryHero.tsx` (pitch copy and `query` chips). `/t/new?q=` auto-sends (`useChatSession`). Guest chat cannot Quote or Call (`convex/lib/chat/tools/agent.ts`). A search-only turn discards the model's prose and substitutes a fixed sentence from the row titles (`convex/lib/chat/anonymous/stream.ts`, `convex/lib/chat/tools/step.ts`).

**Docs.** Perplexity and ChatGPT were not given these five prompts. The comparison is their published product shape, cited below.

Every search here was one page of a larger catalogue (`coverage: partial`, typically 5–13 rows examined) and reported supply-projection freshness `absent`. A no-match means nothing suitable on the assessed page of that query, not a census of the market.

## What the two doors are

| | Ask | Market search | Tool detail |
| --- | --- | --- | --- |
| How a buyer reaches it | Hero text field, or **Ask** at `/t/new` | Header **Find Tools** (`Cmd/Ctrl-K`), Tools tab → **Search Tools**, or a hero chip that sets `query` | A row opens `/tools/…` or a Bazaar detail |
| What runs | A model must call search, may describe or compare, then writes an answer | The sentence is the query. Indexed retrieval, then an OpenRouter rerank of candidate summaries | One contract: inputs, price, health, data use, example, terms |
| Signed-out purchase | Refused | None. The row links onward | "Set up to get a Quote" or "Connect an Agent" |

Search is already model-assisted. Every Market result in this pass named OpenRouter as the recipient of "query and candidate summaries". Chat adds another model that chooses the query, the source and the filters, and sometimes a further generation for the prose.

When the only completed tool is search, that prose is thrown away. The buyer sees a slower restatement of the search row, then an instruction to open a Tool card. The shopping-guide instructions in the agent never reach that buyer.

## Five buyer requests

The same sentence went to both doors. A shorter keyword was tried only after the sentence had failed or looked wrong. That control is a second attempt, not the first-path score.

### 1. "What's the weather in Sydney tomorrow morning?"

| | Market search | Chat |
| --- | --- | --- |
| Time | 2.3s | 10.2s |
| Result | **Match.** "Global weather forecast for latitude and longitude." External, indicative A$0.01, unverified. | **No match.** Two searches, both `source: current`: "weather Sydney forecast", then "weather forecast". Answer: no suitable Tool, broaden "weather forecast". |

The Market hit does not take a city. Its Bazaar record is a GET with `lat` and `lon`, MET Norway forecast periods, and payment network `eip155:84532` (Base Sepolia). It is not "Sydney tomorrow morning".

Closer rows exist. "sydney weather" (0.7s) returned **Wallets Demo Weather** (admitted, readiness unavailable, A$0.01) and **Live current weather conditions for any city, sourced from Open-Meteo** (external, unverified, A$0.01). "weather" on admitted supply alone matches the demo tool in 0.4s. Chat never searched the mixed catalogue, and "weather forecast" on admitted supply is an empty scoped page, so the demo row dropped out too.

Neither door answers the weather. Search shows a misleading listing. Chat says nothing exists.

### 2. "Convert 3:30pm in New York to Tokyo time"

| | Market search | Chat |
| --- | --- | --- |
| Time | 0.5s | 22.6s |
| Result | **Match.** Timezone Converter. Admitted, setup required, unverified, A$0.01. Summary: convert between IANA zones, DST-aware. | Search "time zone converter New York Tokyo" found that Tool, then describe returned it. **No assistant text** in the finished stream (events stop at `finish-step`). |

Describe is the one place chat did something a search row does not. The payload names `from` (required IANA zone), `time` (optional, or `now`) and `to` (required). Indicative price A$0.01, readiness unverified. Those are Tool-detail facts. Describe itself was 0.1s. The guest still cannot run the conversion. Reasoning inside the stream knew `America/New_York` and `Asia/Tokyo`, but that reasoning is not the answer, and no answer was written.

### 3. "Look up an Ethereum transaction from its hash and show the fee that was paid"

| | Market search | Chat |
| --- | --- | --- |
| Time | 0.6s | 19.8s |
| Result | **Match.** Chain Receipt Hash (A$0.01; summary includes status, gas and logs) and Chain Tx Hash (A$0.02; from, to, value, calldata). Both admitted, setup required, unverified. | **No match.** Query "Ethereum transaction lookup hash fee" with `filters.networkId: ethereum`. The answer tells the buyer to broaden that phrase. |

The filter is the miss. The same phrase without `networkId` matches both Chain tools (confirmed again: filtered call scoped and empty in 0.6s; unfiltered call a match in 2.0s). Receipt detail's inputs are `network` and `pathParams`. The fee the buyer asked for is the gas on the receipt, not a second Tool. Chat never reached either row.

### 4. "Extract the line items from a scanned supplier invoice"

| | Market search | Chat |
| --- | --- | --- |
| Time | 1.0s, then page 2 in 0.4s | 27.9s |
| Result | **Scoped, zero rows**, both pages. | First search, "extract line items scanned supplier invoice OCR" with document/analyze filters, returned eight external listings. Two describe calls were `not_found`. A second search, admitted supply only, was a no-match. A third search (`source: coinbase`) was refused (`search_limit`). |

The eight were not a shortlist. Relevant: "Extract normalized text from a scanned document", "Extract text from a scanned PDF (Tesseract)", "PDF text extraction". Not the job: a US supplier payment-release decision, ticker line items, IBAN validation, a gift-card USDC invoice, and a generic text-to-JSON tool. The price field on these rows was empty; the Tesseract summary itself mentions $0.003/page. The visible answer named none of them: "Happy to help further… could you describe the invoice format more closely?"

The rewrite beat pasting the whole sentence into search. It did not beat a shorter search. "scanned invoice" (0.9s) returned Ausca OCR, scanned-PDF OCR, and Tesseract. "ocr" (0.9s) returned those plus an OCR text extractor. Chat spent half a minute, mixed in false hits, described references that are not Tools, and asked a question that does not choose among OCR listings.

### 5. "Book a refundable flight from Sydney to Tokyo next Tuesday under 400 dollars"

| | Market search | Chat |
| --- | --- | --- |
| Time | 0.6s, then page 2 in 0.6s | 31.4s |
| Result | **Scoped, zero rows**, both pages. | Two searches ("book flight Sydney Tokyo", then "flight booking travel airline") returned external flight-search listings mixed with other hits. Three describe calls were `not_found`. **No assistant text.** |

The first page of eight had four flight rows ("Flight search", "Flight search by departure and arrival airports in the URL", "Munition Flight Search", flight-by-ident) and four that are not a fare: an L2 "pre-flight" safety check, two on-chain order books, and an ISBN book lookup. The second search added hotel search, hotel reviews, a transit-provider lookup, and a US travel advisory. Nothing established refundable, next Tuesday, or a 400-dollar cap. Chat cannot book the seat. "flight" (0.5s) and "airfare" (0.6s) returned the flight-search listings without the ISBN and order-book noise, and without a blank turn.

## Speed, accuracy, steps

**Speed.** Sentence search took 0.5–2.3s. Chat took 10–31s, about 4× to 50× the same five sentences. The extra time is the model choosing tools and, on the long turns, a second generation that sometimes never arrives. Search's own rerank is already inside the 0.5–2.3s.

**Accuracy on the first path.**

| Request | Search | Chat | Better first path |
| --- | --- | --- | --- |
| Sydney tomorrow | Wrong shape (lat/lon, Sepolia listing) shown as a match | False no-match | Neither. Search is less wrong only because the buyer can see a row and reject it |
| New York to Tokyo | Right Tool | Same Tool, then no visible answer | Search, then detail |
| Ethereum fee | Right pair; gas is on the receipt row | False no-match from a network filter | Search |
| Scanned invoice | Empty page | OCR rows among false "line items", no named choice | A shorter search. Chat beats only the raw sentence |
| Refundable fare under $400 | Empty page | Flight rows among "book" and chain tools, no answer, constraints dropped | A shorter search. Neither can book or enforce the fare |

Chat's only retrieval win is rewriting a long sentence into keywords when the raw sentence retrieves nothing. A buyer who then types "invoice" or "flight" gets a cleaner list, sooner. Chat also added filters and `source: current` that erased real rows (weather, Ethereum).

**Steps.**

Ask, from the hero: type, submit, wait, read an answer if one exists, open a card for the contract. Two of five turns ended with tool activity and no answer text. The guest still cannot buy.

Market search is one extra control because the text field will not do it. Open **Find Tools** or the Tools tab, submit **Search Tools**, read up to eight rows (title, short summary, access, indicative price, partial-coverage line), open the Tool. Detail for the timezone Tool shows the inputs the search row only implies. Compare is a tray of up to four on the catalogue. Chat has a compare tool and did not use it on the one request that returned two real Tools.

Chat saves a click only by occupying the text field, then spends that saving on wait and on wrong queries.

## What chat adds, and what it does not

It can rewrite a sentence, choose a source, and set filters before the shared search runs. That is the whole incremental job. On this sample the rewrite helped two empty sentences and damaged two real matches.

It can call describe for an `operation:v1:…` reference. That worked once (Timezone Converter) and failed five times, when the model passed references for external listings and got `not_found`. Bazaar rows are not admitted Tools. Search already points those rows at external detail. Chat has no external-detail tool, so it invents an operation id.

It can ask a follow-up. The invoice follow-up was not the structured clarify tool (one question, three choices). It did not name a candidate.

Signed-in owner chat can attach purchase tools for one bounded Call, and only when authority is an agent key. That path was not run. The public front door is the anonymous thread, and that thread is forbidden to Quote or Call. A helper that cannot buy does not finish "find, compare, buy".

It does not answer the underlying request. It must not invent the forecast, the converted time, the gas paid, the invoice lines, or a booking. Perplexity's box does answer. This one is not allowed to, and it also failed at pointing.

## Tool detail is still the contract

A search row is a title, a summary cut near 100 characters, a provider, an access badge, and an indicative AUD label or "unavailable". Detail is what a buyer needs before setup:

- Timezone Converter: required `from` and `to`, optional `time`, unverified health, indicative A$0.01 with a validity window, data use marked public.
- Chain Receipt Hash: `network` and `pathParams`. The fee is the gas on this receipt.
- The lat/lon weather listing: `lat` and `lon`, MET Norway as the source, and a Sepolia USDC payment. None of that is on the search row, which is why the row looks like a Sydney forecast.

Chat describe can repeat admitted-Tool facts inside the thread. It did not display them on the turn where describe succeeded. External detail stays outside chat. The buyer still lands on Tool detail.

## Perplexity and ChatGPT

**Perplexity keeps one box, and the box returns the answer.** Help text last modified 5 September 2026 says to ask normally, or point at a source with `@` or **+ → Connectors and sources** ([Premium data sources](https://www.perplexity.ai/help-center/en/articles/12870803-premium-data-sources)). Connectors are attached sources, not a second catalogue of the same inventory. Their academy splits the product on purpose: Search is for understanding; Computer is for multi-step work across files and connected apps ([Search vs Computer](https://www.perplexity.ai/hub/academy/search-vs-computer)). The picker is secondary. The front door is the question, because the product of the question is an answer with sources.

**ChatGPT keeps chat as the front door, and the picker installs a tool rather than re-searching one.** As of 9 July 2026 the app directory is the Plugin directory: people browse it to connect a plugin, then the model calls that app inside the thread ([Apps in ChatGPT](https://help.openai.com/en/articles/11487775-apps-in-chatgpt)). The Apps SDK describes the composer **+** launcher as the way to pin an app; once linked, the app stays available and the model decides when to call it ([User interaction](https://developers.openai.com/apps-sdk/concepts/user-interaction/)). Discovery of what to connect is a directory. Doing the work is still the conversation. There is not a parallel search of the same tools that can disagree with the conversation.

Agentic Economy is neither. The thing for sale is a Tool with a price, a provider, terms and a Call. The buyer has to see that row and that contract. Chat does not synthesize the weather or the fare, and the guest chat does not execute. A ChatGPT-style "chat first" layout, while chat and the catalogue search the same unsettled inventory and return different verdicts, is two products. Perplexity can put the box first because the box is the answer. This box is not the answer.

## For alpha

Make Market search the text field. The first box on `/market` should run the catalogue query and show rows, coverage, and the OpenRouter notice search already shows. Tool detail stays the place a buyer checks inputs and terms. **Find Tools** and the hero chips already are that search. The text field should not bypass them.

Keep Ask off that field. A later helper is justified only if it does the one thing search does not: turn a sentence that retrieved nothing into a short query, then show the same result list, including external listings, without a second prose model. It should not set `source: current` or a network filter unless the buyer asked. It should not describe invented operation ids. It should not say the catalogue has no Tool when it only searched admitted supply. If that helper cannot beat "the buyer deletes the extra words", delete it.

Do not spend alpha on chat history, clarify widgets, or in-chat purchase. Owner Quote and Call already have an authenticated purchase surface. A second way to buy, inside a thread that currently fails to name the Tool, is a second product. The guest path cannot buy anyway.

The first correction is the hero text field: it is the control every public question hits, and it is the slower, less accurate door.
