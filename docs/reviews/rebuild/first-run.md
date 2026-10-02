# First run and time to first value

**Date:** 29 September 2026
**Lens:** cold start until first value, for a buyer who wants a Tool result, a developer connecting an Agent by MCP or CLI, and a Provider publishing a Tool.
**App:** the process listening on `http://127.0.0.1:3024`, started 29 September 2026 at 14:39 local (Vite). `GET /api/v1/release` reported `sourceRevision` `851e1454558db59e80e321d7b0d3cb2d5551558a`. Checkout HEAD during the walk was `d104a80099214df0500e54850b5a5a4b96cfbc9c`. Vite serves this checkout, so the pages can be newer than the release stamp.

Signed-in work stopped at Cloudflare “Verify you are human” on `/sign-up`. No Call was purchased, no Provider source was submitted, and no MCP client on this machine was modified.

## What “first value” means here

| Persona | First value | Reached |
|---|---|---|
| Buyer | The Tool’s returned answer for the need they typed or chose | No |
| Developer | The connected Agent returns a live market or Tool response | A public search hit, yes. An authenticated connection, no |
| Provider | The product confirms the Tool is published | No |

A catalogue card, a price, “Found 1 tool”, and a copied install command are earlier screens. They are counted below as the path. They are not the value.

## How the counts were made

Same rules for Agentic Economy and the four references.

- **Cold start.** New browser profile, no session. CLI checks used an empty `AE_CONFIG_DIR` unless a row says otherwise. This machine’s existing `~/.config/ae` was used only as a second observation.
- **Step.** One deliberate action that advances the task: open a destination, click, submit one form, run one command, approve one prompt. Filling the fields of that form is part of the step. A redirect is not an extra step.
- **Screen.** A distinct URL, or a replacement of the task surface (captcha, wizard step, approval).
- **Decision.** A choice among real alternatives, or a next action that is ambiguous. One obvious primary button is not a decision.
- **Words.** Whitespace-separated words. **Viewport** means text inside `main` that intersects a 1440×900 viewport. **Main** means all of `main`, including below the fold. Header is about 11 words and footer about 66; those are not added again on every screen. “Words read” on a path is the instructional copy the persona has to pass, not the whole catalogue.

Reference products were not signed into. Their counts are the published minimum from the pages fetched on this date, so they are comparable as documented paths, not as stopwatch replays.

## Summary

| Path | Steps observed | Screens | Decisions | Words read before the stop | First value |
|---|---:|---:|---:|---:|---|
| Buyer, open `/` and ask | 2 | 2 | 6 on the first screen | 116 in the first viewport, then an empty chat completion | Not reached |
| Buyer, inspect the first featured card | 3 | 2 | 6, then which card | 116, plus a card below the fold, plus 153 on the Tool page | Not reached. The page says no Quote or Call is available |
| Developer, follow `/for-agents` | 2 commands shown; login not finished | 1, then an unopened browser approval | Which client; whether install counts | 52 in the first viewport; 132 on the page; more after opening Claude Code and Cursor | Not reached. The page says install is not enough |
| Developer, public MCP search | 2 HTTP calls after reading `SKILL.md` | Machine only | Which tool name | `SKILL.md` is 968 words; the search instruction is the short “Find a suitable Tool” section | A candidate list. One match, partial coverage. Not a Call |
| Developer, cold CLI search | 1 command, once `ae` exists | Terminal | None if the binary is already installed | `llms.txt` is 261 words and assumes `ae` is installed | A candidate list. Same partial search |
| Provider, Add Tool | 2 | 2, then a captcha | GitHub, Google, or email | 275 words of fit copy, then 31 on the sign-in screen | Not reached |

Against the published minimums: OpenRouter claims 3 steps to a first request, RapidAPI documents 6 to a subscribed test call, Smithery documents 2 commands plus a client restart to install an MCP, and Stripe documents 4 Dashboard steps to a test payment link after an account that can already charge in a sandbox. None of those four was re-run signed-in. Agentic Economy’s three human paths stopped before the equivalent outcome.

## Buyer

**Goal.** A Tool result for a concrete need. The need used was “Convert a time zone / 3:30pm New York to Tokyo”, which the empty chat offers, and “weather forecast for Sydney tomorrow”, typed into Market.

### Path A — land and ask

1. Open `/`. The server redirects to `/market`. Screen: “Tools for what’s next.” Viewport: **116 words**. The whole `main` is **2,254 words** because the catalogue continues below.
2. Type a need and press **Ask**. Market navigates to `/t/new?q=…`. A separate cold open of `/t/new` is the same chat with **56 words** and four suggestions.

The settled timezone turn ended with the status **Response complete**, the user sentence still in the bubble, no assistant answer, and no tool card. The counter read **2 / 12 browser messages**. An earlier turn, captured while the UI still said “Getting a response…”, had shown:

- “Found 1 tool”
- “Timezone Converter”
- “A$0.01”
- “Not yet verified”
- **Select**
- **Next page**

That card is a listing. Select, in the current chat component, toggles the card and asks the chat to “Tell me more about” that name. A Quote control appears only when the option is quoteable. Signed out, that control is “Sign in to get a Quote”. Signed in, the next form asks for “Exact Tool input (JSON object)” and says “No Call is made by this step.” Those Quote states were not reached on the settled turn, because the settled turn had no card. The JSON-input behaviour is source for `OptionsGrid` and `ChatTranscript`, not a screen this walk submitted.

`POST /api/v1/tools/quote` without a credential returned **401** with detail “Connect an agent key: run `ae connect` or complete OAuth device authorization”. That is the purchase gate behind the chat.

**Counts for path A.** 2 steps, 2 screens, value not reached. About **116 words** before the ask, then a completion with no answer. The settled turn was still empty after waiting up to 55 seconds.

**Decisions on the first viewport, before any result:**

1. **Ask**, versus **Find Tools ⌘K** in the header.
2. One of four starter ideas: Research a topic, Create an image, Explore markets, or the creative promo card.
3. Collections, Providers, Tools, or Saved.
4. One of six category chips: Create, Research, Build, Markets, Commerce, Identity.
5. Sign in, or stay anonymous. Sign up is not in the header.
6. Whether to type a need at all, given “20,603 Tools in the catalogue” and a creative collection already on screen.

### Path B — inspect a featured card

The first viewport does not contain a Tool card. The creative collection starts at the bottom edge. The first card is BlockRun.AI, “AI image generation API”, “External listing · inspect”, “A$0.06”, “Provider-listed estimate”.

1. Open `/market`.
2. Move to that card.
3. Activate **Inspect Tool**.

Screen: `/tools/blockrun.ai/api-v1-images-generations`. Viewport about **153 words**. The page states:

- Price “A$0.06 per Call”, “Price source: directory reported”
- “Readiness unknown”
- “External payment”
- “Directory or catalogue listing, not callable through AE.”
- “No admitted AE Tool or verified execution Provider is attached to this listing.”
- “no AE Quote or Call is available here.”
- “No example output was published.”
- The only actions are **Start** and **Browse Market**.

**Counts for path B.** 3 steps, 2 screens, value not reached.

The Tools tab (`/market?view=tools`) is the same directory in a table: “20,603 Tools in the catalogue”, “12 Tools on this page”, rows marked “External listing · inspect” or “Currently unavailable”. Some prices say “See payment details” and give no amount. The footer of that view says the directory is Coinbase Bazaar, refreshed 28 September 2026, and that the upstream directory changed during the refresh.

`POST /api/v1/market-tools/list` with an empty body returned **41** items, separate from the 20,603 directory rows. All 41 were `verification: not_verified`. Thirty-nine were `healthStatus: unverified`. The sandbox reference Tool and one other were `degraded`. The Market home the buyer sees first is the directory, not those 41.

### Buyer hesitations

1. Six ways to start, and none of them runs the need and shows the answer.
2. The ask field says the question goes to OpenRouter (`openrouter.ai`) and not to include private data. The buyer has to decide what is safe to type before they have seen a result.
3. “Your agent” in the hero, while the header splits Market, For agents, and For providers. The buyer is not named.
4. “20,603 Tools” against a Provider page that says “No Tools are published yet.” Both were true in this walk: the large number is the Bazaar directory; published Agentic Economy Tools are a different set, and the Provider page’s public list was empty.
5. Price is not one fact. Cards say “Provider-listed estimate”, “Indicative before Quote”, “External payment”, “See payment details”, a USDC source amount, and an AUD figure together.
6. “External listing · inspect”, “Connect to call”, “Currently unavailable”, “Not yet verified”, and “Readiness unknown” are different gates. The first featured card’s gate has no Call.
7. The timezone suggestion spent 2 of 12 browser messages. The settled completion had no answer, so the quota moved and the need did not.
8. Select, when a card does appear, does not run the Tool. The next human step is either another chat turn or a sign-in Quote, and the Quote form requires a JSON object the buyer does not have yet.
9. Saved, while signed out, showed the line “Saved to your account” and three blank cards. The sign-in empty state had not replaced those cards at capture time.
10. A direct weather search (`POST /api/v1/market-tools/search`, “weather forecast for Sydney tomorrow”) returned `kind: match` with `partialResults: true`, `freshness.state: absent`, and `coverage: partial`. The hits were `access: external_listing`. The API can return candidates in under two seconds. Those candidates are not a forecast.

## Developer

**Goal.** An Agent connected through MCP or the CLI, far enough that the connection has returned something live.

`/for-agents` is the human door. `llms.txt` (261 words) and `SKILL.md` (968 words) are the machine doors. They do not describe the same amount of work.

### Path C — the page a person is shown

Screen: “Connect your Agent.” First viewport **52 words**. Full `main` before opening the alternatives: **132 words**.

The ordered steps on the page:

1. Run both lines:

```text
codex mcp add agentic-economy --url "http://127.0.0.1:3024/mcp"
codex mcp login agentic-economy
```

2. Approve access in the browser. “Codex opens browser approval during login.”
3. Confirm the connection. “Connection is complete only when it appears in Agents. A live result confirms the connection; installing it alone does not. Account connection does not set a Spending policy.”

Opening **Use Claude Code or Cursor** adds two more commands, each with its own approval:

```text
claude mcp add --transport http --scope user agentic-economy "http://127.0.0.1:3024/mcp"
```

“In Claude Code, open /mcp, select agentic-economy, then choose Authenticate.”

```text
cursor --add-mcp '{"name":"agentic-economy","url":"http://127.0.0.1:3024/mcp"}'
```

“Enable agentic-economy in Cursor, then follow its OAuth prompt.”

This walk did not run those commands. They would change Codex, Claude Code, or Cursor on this machine. The commands embed `http://127.0.0.1:3024`, which matches this process and is not a public host.

**Counts for path C, as far as the page itself.** 1 screen to read, 2 commands for the recommended client, then an uncompleted browser approval. Decisions: Codex versus Claude Code versus Cursor; whether the visible `$` is part of the command; whether “install” is the finish. The page answers the last one: it is not. Words before the first command are the viewport (52) if the reader stops at the Codex block, or 132 if they read the confirmation rule.

FAQ answers observed on the page:

- “Do I need to move my Agent into Agentic Economy?” — “No. Your Agent stays in its existing app or framework.”
- “Is AUD Credit a crypto wallet?” — “No. AUD Credit belongs to the Business account.”
- “When can I connect an Agent?” — “Agentic Economy is pre-launch. Public access, funding and purchases are not open yet. The status page tracks availability.”

`/status` at the same time said “All systems operational”, including “Tool search and new Calls are ready” and “Agents can discover the current AE interfaces.” The connection page and the status page disagree about whether a new person can connect and purchase.

### Path D — public MCP, no account

`SKILL.md` says public discovery does not require an account connection, and that a result is a candidate, not proof the caller can buy it. That matched the server.

Observed, unauthenticated, against `POST /mcp`:

1. `initialize` returned **200**, server `agentic-economy`, protocol `2025-06-18`, with instructions to search, describe, or compare.
2. `tools/list` returned **200**, including `ae_registry_tools_search`.
3. `tools/call` of `ae_registry_tools_search` with query “convert a time zone” returned **200**: “1 matching Tools”, scope partial (7 examined), ranking recipient OpenRouter, and a public `describe` action.

**Counts.** 2 calls to get the list and the search hit, after the reader has found the URL. No sign-in. Elapsed time about 2 seconds for the handshake and the search. First value under the developer definition used here: a live search response. It is not a Tool result, and `SKILL.md` says a configured plugin is still not proof of connection. Account tools, Quote, and Call stay behind connection. The human page does not present this anonymous search as the finish line.

### Path E — CLI

`llms.txt` line 1 tells the reader to run `ae search "…" --base-url "http://127.0.0.1:3024" --json`. It does not say how to install `ae`. `/for-agents` does not mention the CLI. `npm` publication is still described in the README as pending. The tarball is nevertheless served: `GET /downloads/aecon-cli-0.2.0.tgz` returned **200**, `1,084,639` bytes. Nothing in the walked pages linked that URL.

With an empty config directory, `ae search "convert a time zone" --base-url http://127.0.0.1:3024 --json` exited 0 and returned the same partial match as the HTTP search. One command, about 2 seconds, once the binary exists.

With this machine’s existing `~/.config/ae/config.json` (four stored connections, including loopback tokens from 8 and 22 September), the same command returned **401**, “Unauthenticated”, and `nextCommand: ae connect`. Help text for `ae search` says “Search current public Tools”. On a machine that has connected before, that public search failed until connect.

`ae search --help` says exact payable price is confirmed by `ae call` or by `ae_tool_quote`. Quote without a credential returned the 401 connect challenge above.

### Developer hesitations

1. Three front doors. `/for-agents` requires login and a live result. `SKILL.md` says discovery needs no account. `llms.txt` assumes `ae` is already installed. `/developers/api` is a fourth door: **2,382 words** in `main`, and the Quote and Call blocks are labelled “Request template · not runnable”.
2. The recommended client is Codex. Claude Code and Cursor are behind one accordion. A reader who does not use Codex has to know to open it.
3. The copy block shows a `$` prompt on its own line. Pasting the block into a shell depends on whether that dollar sign is decoration.
4. Every command points at loopback.
5. “Pre-launch / purchases are not open” sits on the same site as “All systems operational” and “new Calls are ready”.
6. Install is defined as incomplete, and the confirmation screen (“Agents”) is in the product, not in the terminal. The reader cannot see success from the command alone.
7. Account connection “does not set a Spending policy.” A finished login is still not permission to buy.
8. A previous CLI login on this machine made the documented public search return 401. A brand-new config directory succeeded. Someone who connected last week is in a worse state than someone with no config.
9. Anonymous MCP search works. The page a person reads still sends them through browser OAuth before it will call the connection real.
10. Troubleshoot copy tells the reader, if Tools are missing, to check client settings and start a fresh task, and if a result is uncertain, to check status before trying again. It does not say which of those states they are in.

## Provider

**Goal.** A Tool that the product says is published.

### Path F — from the public page to the captcha

1. Open `/for-providers`. “Add a Tool.” First viewport **135 words**, which cuts off inside the fit checklist. The “Before you sign in” section is **275 words**. The whole `main` is **546 words**.
2. Press **Add Tool**. The button is visible without scrolling.

Screen: `/sign-in?redirect=%2Fowner%2Foperations%2Fnew`. Heading “Sign in to manage Tools”. “After you sign in, you’ll return to your Provider Workspace.” **31 words** in `main`. Choices: GitHub, Google, or email.

Creating an account instead (`/sign-up?redirect=%2Fowner%2Foperations%2Fnew`) says “you’ll continue to the Tool publishing Workspace.” Pressing **Continue** with an email and password replaced the form with Cloudflare “Verify you are human.” This walk stopped there. No workspace, no source form, and no publication status were shown.

The Add Tool route is built as four stages — source, tool, terms, review — and publish can require a second verification. Those stages were not opened. They are not counted as walked steps.

The page also says, in the public facts section: “No Tools are published yet. Be the first provider to add one bounded job.”

FAQ answers after expanding:

- “What kinds of Tools are supported first?” remained a heading; the useful constraint is in the body above it (one bounded Tool, not an app).
- “Does a Bazaar listing publish my Tool on Agentic Economy?” is a real question, because Market is full of Bazaar rows.
- “Can I onboard my Tool today?” expanded to: “Add Tool starts the listing for one Tool. The requirements on this page are what that listing needs. Listing a Tool does not buy one.” That does not say yes or no.

**Counts until the captcha.** 2 steps, 2 screens, plus the captcha surface. Decisions: whether the Tool fits (four checklist items, three source kinds), then which sign-in method. Words read if the Provider does what the page asks before the button: **275**, then **31**, then the captcha. Value not reached.

### Provider hesitations

1. The primary button is available immediately, and the page also says to check fit before signing in. The checklist’s fourth item is below the first viewport, so the button arrives before the warning about keys is finished. The visible fragment ends at “Never paste a raw key…”.
2. Three source shapes are offered before an account exists: public OpenAPI or MCP, a source that needs an owner-controlled connection, and a public x402 endpoint. The second one says that if setup offers no compatible connection, the source cannot be listed. The Provider cannot know that until after sign-in.
3. “A check may reach the configured upstream” and may “consume its quota, or incur its normal cost.” “A successful check does not publish the Tool.” The Provider is asked to spend a live call before they know the listing will exist.
4. “Creating the Provider business is an owner step. After that, an owner can approve a separate agent credential for maintenance.” Role, business, and a second credential appear before any Tool.
5. “No Tools are published yet” on this page, and 20,603 directory rows on Market.
6. Publication “does not guarantee demand, payment, delivery, or payout.”
7. The “today” answer does not say whether onboarding is open, while `/for-agents` says public access is not open and `/status` says Calls are ready.
8. Sign-in offers three identity providers, then a human-verification captcha, before any Tool field.
9. The redirect promise (“Provider Workspace”, “Tool publishing Workspace”) names a place the new Provider has not seen.

## Comparison

Published minimums, fetched 29 September 2026. Signed-in competitor dashboards were not replayed, so their steps are the documented path, not a measured click-track. Agentic Economy’s figures are the observed stop, or the observed public search where that really returned data.

| Product | Named outcome | Published or observed steps | Decisions on that path | Where the clock stops |
|---|---|---|---|---|
| [OpenRouter](https://openrouter.ai/developers) | First API completion | The developers page says three: get a key, point a client at OpenRouter, pick a model. “No subscription and no card required to start.” The [quickstart](https://openrouter.ai/docs/quickstart) then offers API, Client SDK, Agent SDK, or the OpenAI SDK before the `curl`. The [FAQ](https://openrouter.ai/docs/faq) says to add credits, and also that new users get a small free allowance and free models | Auth method; model; whether credits are required | A completion body. Claimed “under five minutes” on the developers page. Not re-run here |
| [Stripe](https://docs.stripe.com/get-started/account) | First test charge | An account can test immediately in a sandbox. Creating a [payment link](https://docs.stripe.com/payment-links/create) is 4 Dashboard steps (open Payment Links, add a product, fill product details, Create link), then the test card `4242…` from [Testing](https://docs.stripe.com/testing). A test secret key plus one PaymentIntent request is the API shape on that testing page; the sample does not set `confirm=true`, so a succeeded charge can be one field more | Product versus “customer chooses what to pay”; card details | A test-mode payment visible in the Dashboard. Account creation itself was not click-counted |
| [RapidAPI](https://docs.rapidapi.com/docs/consumer-quick-start-guide) | Subscribe, then a call | 6 moves in the consumer quick start: sign up, search, choose an API, subscribe (a free BASIC plan is called out), return to Endpoints, press Test Endpoint, read the response in the browser | Which API; which plan; acknowledge quota | The response body in the browser. Not re-run signed-in |
| [Smithery](https://smithery.ai/docs/concepts/cli.md) | Install an MCP | 2 commands in the CLI doc (`npm install -g smithery@latest`, then `smithery mcp add exa --client claude`), then restart the client. `smithery auth login` is “required for some operations”, and the install examples do not put it on the critical path. The public catalogue at [smithery.ai/servers](https://smithery.ai/servers) puts **Add to toolbox** on each card | Which server; which client | The server is in the client config. A tool call is a further command (`smithery tool call`). Add to toolbox was not completed |
| Agentic Economy buyer | Tool result | 2 steps to an empty chat completion, or 3 steps to a directory page that has no Call | 6 on the first screen | Stopped. No result |
| Agentic Economy developer | Connected Agent with a live response | Human page: 2 commands, then browser login, then a result the page says is mandatory. Public MCP: 2 calls, no account, one candidate. Cold CLI: 1 command after an install the human page does not show | Client; whether login is required; how to get `ae` | Search hit without an account. Authenticated connection not finished |
| Agentic Economy Provider | Published Tool | 2 steps, then a captcha | Fit; identity provider | Stopped. Nothing published |

### What the step counts say

OpenRouter, Stripe, RapidAPI, and Smithery each publish a path whose last step is the thing named in the brief: a completion, a test charge, a subscribed response, or an installed MCP. The shortest of those, once an account or a binary exists, is a single request (OpenRouter `curl`, Stripe test PaymentIntent, Smithery `mcp add`). RapidAPI is longer because subscribe and the test call are both required, and the docs put sign-up, search, plan choice, and Test Endpoint in between.

Agentic Economy’s buyer never reaches a result in two or three steps. The first honest stop is either an empty chat completion or a directory page that says no Call is available. The extra distance after that, if a quoteable card appears, is still sign-in, a JSON input, a Quote that does not Call, an Agent credential, credit, and a spending policy. That remainder was not walked past the captcha and the 401.

The developer’s shortest live response is closer to Smithery than to the `/for-agents` page. Anonymous MCP search returned a candidate in two calls, which is in the same band as Smithery’s install. The page a person is given rejects that as completion: login, a browser approval, a row in Agents, and a live result, while the FAQ says public access and purchases are not open. Smithery’s documented success is the install. Agentic Economy’s documented success is stricter, and this walk did not reach it.

The Provider stops earlier than RapidAPI’s subscriber and far earlier than a Stripe test charge. RapidAPI’s consumer is the wrong role for publishing; the relevant comparison is that Stripe can create a test charge before a business is fully activated, and Smithery’s publish path is a separate doc (`smithery mcp publish`) that was not the install journey. Agentic Economy asks the Provider to pass a fit essay, an account, a captcha, a business, and a four-stage form whose check can spend the upstream, and still says a successful check does not publish. None of that form was reached.

## Evidence index

Live, this process, 29 September 2026:

- `/` → `/market`, `/t/new`, `/t/new?q=weather+forecast+for+Sydney+tomorrow`, `/market?view=tools`, `/market?view=saved`
- `/tools/blockrun.ai/api-v1-images-generations`
- `/for-agents` including the opened Claude Code and Cursor commands
- `/for-providers` and the Add Tool redirect to sign-in
- `/sign-up` stopped on Cloudflare human verification
- `/status` “All systems operational”
- `POST /api/v1/market-tools/search`, `POST /api/v1/market-tools/list`, `POST /api/v1/tools/quote` (401)
- `POST /mcp` initialize, `tools/list`, `tools/call` search
- `ae search` with an empty config directory (exit 0) and with `~/.config/ae` present (401)
- `GET /downloads/aecon-cli-0.2.0.tgz` (200)
- `GET /llms.txt`, `GET /SKILL.md`

Source, only where a control was seen and the next click was not completed: `OptionsGrid` Select / Quote copy, and the Add Tool stages `source`, `tool`, `terms`, `review`.

External docs, not signed in: OpenRouter developers, quickstart, and FAQ; Stripe account, payment links, and testing; RapidAPI consumer quick start; Smithery CLI doc and the public server list.
