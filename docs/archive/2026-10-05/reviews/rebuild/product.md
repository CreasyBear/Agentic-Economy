> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../README.md) for its successor and remaining limits.

# Product first principles and information architecture

**Date:** 29 September 2026
**Checkout:** `d104a8009`
**Lens:** who the product is for on day one, what job they hire it for, and whether the navigation teaches that job.
**Evidence:** current checkout source for AEcon. OpenRouter and RapidAPI from pages fetched the same day. Perplexity’s consumer site returned HTTP 403 to this review, so that comparison uses the published navigation FAQ and changelog the search index returned, not a click-through of the live app.

## Answer

The day-one user is an Australian business that wants an agent it already uses to buy one outside service. The job is: fund one AUD balance, let that agent buy one bounded service, and keep a record the business can explain. The top-level navigation does not reflect that job. It opens on a catalogue, splits attention across three audiences, and then hides funding and agent setup inside a workspace menu that also contains the provider product.

A new person who follows the public header and the signed-in menu meets **24 named domain concepts** before one purchase is finished. OpenRouter, RapidAPI and Perplexity ask for about two to five before the equivalent first success. Ten of AEcon’s twenty-four are the nouns this review was asked to count: Tool, Quote, Call, Provider, Agent, credit, workspace, principal, listing, publication. The other fourteen are taught on the same screens.

## Who hires AEcon on day one

`PRODUCT.md` names the customer as the person or organisation that owns the objective, grants permission and bears the cost. The agent stays in its existing app. The entry customer is narrower than the long-term two-sided market:

> Let me fund one AUD balance, let an authorised agent buy a bounded x402 service through Agentic Economy, and give me the result, exact Call history, usage, spend and invoice-ready record in ordinary business terms.

`START_LINE.md` is the same sequence: fund AUD credit, authenticate an agent under a spending policy, search, quote, call, and see one record. Provider publishing, payouts and the whitepaper’s institutional machinery are not that job. `PRODUCT.md` also says the buyer workflow is the first design priority, and that navigation should be derived from stable destinations after the job is mapped.

The live product addresses someone else first.

- `/` does not state the job. It redirects to `/market` (`src/routes/index.tsx`). The signed-in owner home does the same (`src/routes/_operator/owner.index.tsx`).
- The public header offers three audiences at equal weight: **Market**, **For agents**, **For providers** (`PUBLIC_NAVIGATION` in `src/lib/navigation/app-navigation.ts`).
- The market hero is a catalogue pitch, not a purchase: “THE TOOL MARKET”, “Tools for what’s next.”, “Give your agent the capability to take the next step.” (`src/components/ae/market/DirectoryHero.tsx`).
- `/for-agents` then tells that same visitor the job is closed: “Agentic Economy is pre-launch. Public access, funding and purchases are not open yet.” (`AGENT_PAGE` in `src/content/brand-copy.ts`).

So the charter’s buyer cannot complete the charter’s job, and the first screen is still a directory for agents and a door for providers. The closest statement of the buyer job in the UI is onboarding, after sign-in: “Buy with an Agent” unlocks “Market, Agents, Credit, and Call records.” (`ONBOARDING_ROLE_COPY` in `src/components/ae/principal-account/onboarding/onboarding.contracts.ts`). Those four are not the four things in the primary bar.

`brand-copy.ts` says the voice should use “Named jobs, not internal unit names.” `CONTEXT.md` says ordinary language comes before unusual vocabulary. The screens do the reverse.

## Does the navigation reflect the job?

No. The job has four steps: find a service, fund the account, authorise an agent, keep the receipt. The information architecture has three different maps, and none of them is that sequence.

### Public

| Item | Where it goes | Whose job |
| --- | --- | --- |
| Market | `/market` | Browse a catalogue |
| For agents | `/for-agents` | Connect a harness |
| For providers | `/for-providers` | Publish supply |

Finding is present. Funding, authority and the receipt are absent. Publishing is present at the same rank as buying.

### Signed in

Desktop has no primary navigation. The header is the mark, the page title, search, the workspace name, a menu behind a settings icon, theme and the account button (`src/components/ae/layout/app-shell/AeAppHeader.tsx`). The only persistent bar is mobile, and only these four items are marked `topLevel` (`mobileNavigation()`):

| Mobile item | Route | What the page actually says |
| --- | --- | --- |
| Market | `/market` | Catalogue |
| Ask | `/t/new` | “Search, compare and buy AI tools. You approve every purchase.” (`src/lib/public/chat-ia.ts`) |
| Activity | `/activity` | Title is **Calls**, not Activity (`src/components/ae/activity/AeActivity.tsx`) |
| Settings | `/owner/settings` | Account, workspace, billing, developer keys |

Credit and Agents are not on that bar. Onboarding just told the buyer those are what the role unlocks.

Everything else is inside the workspace menu (`src/components/ae/layout/app-shell/WorkspaceMenu.tsx`), grouped like this:

| Group | Items | Routes |
| --- | --- | --- |
| Market | Market | `/market` |
| Ask | Ask, Agents | `/t/new`, `/agent-access` |
| Activity | Activity, Credit, Earnings | `/activity`, `/owner/credit`, `/owner/operations#earnings` |
| Workspace | Tools, Settings, Support, Status | `/owner/operations`, `/owner/settings`, `/support`, `/status` |

That menu fails the job in four concrete ways.

1. **The first money step is buried.** Credit sits under Activity. The credit page is the funding step: “Add AUD credit for paid Calls. Each Agent’s spending limit remains separate.” (`AeOwnerCreditPage.tsx`). A buyer who follows the mobile bar never sees it.
2. **The agent step is buried.** Agents sit under Ask, not next to Credit or the receipt. The buyer’s authority and the buyer’s money are in different groups.
3. **One word covers two jobs.** Market is where a buyer finds Tools. The menu item **Tools** opens the provider workspace: “Manage the Tools buyers can find and call.” (`AeProviderWorkspace.tsx`, route `/owner/operations`). Earnings is a hash on that same provider page. A buyer looking for “the tools” opens the seller product.
4. **Ask and Market are peers.** Both are ways to find and buy. The charter’s “describe a need” journey and the catalogue journey are two top-level places, with no indication which one is the job.

Settings then adds a fourth map: Account, Workspace, Billing (payment methods, receipts, spending defaults) and Developers (agent keys, integrations) (`settings-shell.contracts.ts`). Spending limits now exist in three places: the agent, Credit’s subtitle, and Settings → Spending defaults. Receipts exist both under Activity/Calls and under Settings → Billing.

Admin and developer role links (Overview, Search, Exceptions, Providers, Metrics, Audit, Discovery) hang off the same menu when the role allows it. They are not the day-one problem. They show the shell is an operator console that the buyer is dropped into.

## Concepts a new user must learn

**Rule.** A concept counts if user-visible copy names it as its own object, role or place, and a new person has to tell it apart from the neighbouring nouns to know what to do next. Ordinary chrome (Sign in, Settings, Support, Status, Privacy, Team) does not count. Two labels for one object count once, and the split is noted. TypeScript names that never render do not count.

The path counted is the one the navigation itself offers: public header, the market and a tool page, For agents, then the signed-in menu’s buyer and provider items once each. That is what a new user can reach without being told a shortcut.

| # | Concept | What the UI makes them learn | Where it shows |
| --- | --- | --- | --- |
| 1 | Tool | The thing in the catalogue, and also the name of the publishing area | Market hero; menu item Tools |
| 2 | Market | A place, not the job | Public nav; hero eyebrow “THE TOOL MARKET” |
| 3 | Agent | A durable identity they must connect, distinct from themselves | For agents; onboarding; credit subtitle |
| 4 | Provider | The party that performs the service | Tool detail; “Explore Providers” |
| 5 | Call | One paid use, and the name of the history page | Tool detail; Activity title “Calls” |
| 6 | Quote | A binding price they must obtain before a Call, not the price on the card | “An agent gets a Quote for the real input, then makes one Call.” (`AeToolDecision.tsx`); comparison dialog; “Set up to get a Quote” |
| 7 | Credit | An AUD balance that is not permission to spend | `/for-agents` FAQ; Credit page |
| 8 | Workspace | The account container they must name before anything else | Onboarding title “Finish workspace”; header “Workspace: …”; menu group |
| 9 | Spending policy | Rules that are not the balance. Also called a spending limit and “Spending defaults” | For-agents subhead; credit subtitle; Settings |
| 10 | Account | The business that owns the credit. Also “Business account” and “Business profile” | For-agents FAQ; credit ledger “Account transactions”; settings |
| 11 | Listing | Not a Tool. An external or Bazaar listing cannot be called here | Badge “External listing · not AE-callable”; “directory listing only”; footer “Remove a listing”; provider FAQ “Listing a Tool does not buy one.” |
| 12 | Publication | A state that does not prove the tool has been used | “Publication alone is not usage evidence.” (`AeToolContractSections.tsx`) |
| 13 | Catalogue | The index, also called a directory | Empty states; “Provider catalogue” |
| 14 | Readiness | Whether a tool can be called now | Badges; “Readiness and reliability” |
| 15 | Host | A provider, under a second name | Kicker “Hosts”; “The count is the whole host.” |
| 16 | Capability | A need, not a Tool | “Find your next capability.”; “Explore capabilities.” |
| 17 | Bazaar | A foreign directory whose rows are not AEcon tools | “Coinbase Bazaar directory listing only.” |
| 18 | x402 | The supply rail, named in buyer and provider copy | For-agents FAQ; provider steps; credit “Managed x402” |
| 19 | USDC | A second currency beside the AUD price they will actually pay | “Provider-listed source price: … USDC per Call.” |
| 20 | Principal | An identity id, shown rather than explained | Call receipt label “Agent principal reference”; agent rows expose `principalRef`; credit reconciliation shows `ownerPrincipalRef` under “Owner” |
| 21 | Ask | A second place to find and buy, beside Market | Nav label; empty state |
| 22 | Earnings | Provider payouts, in the buyer’s activity group | Menu item; `#earnings` on the provider page |
| 23 | Approval | A human step between Quote and Call | “a Call follows only after approval” |
| 24 | Connection | The credential link to an agent or a provider source | “Connect an Agent”; “Connect to call” |

**24.** The ten nouns in the brief are all present. Principal is the only one that is leaked rather than taught: it is not in the nav, but it is on the receipt, the agent list and a credit case.

The same screens also split names without adding a new object. Those splits still cost a new user a guess:

| One object | Names on screen |
| --- | --- |
| The history of purchases | Activity in the nav, Calls on the page |
| The thing you buy | Tool in the market, Tools in the menu (which is publishing) |
| Who performs it | Provider and Host |
| The index | Market, catalogue, directory |
| Permission to spend | Spending policy, spending limit, Spending defaults |
| Who owns the money | Workspace, Account, Business |

Opening Credit far enough to fund also adds Ledger, Documents, Reconciliation and Provider obligations (`CreditAccountingPanel.tsx`). Opening For providers, which the header offers before sign-in, adds OpenAPI, remote MCP and Agent Plugin as source types (`AeSupplyLanding.tsx`). Those were not added to the 24 because they are sections of a page already counted, but they are on the day-one path the nav creates.

`AeHomeLanding` still contains a shorter pitch (“The marketplace built for agents.”). It is not the entry. `/` redirects to the market, so that copy does not reduce the count.

## Comparison

The useful comparison is the number of named objects between arrival and first success, and whether the top of the product is that success. Feature depth behind a settings page does not count, for them or for AEcon.

### OpenRouter

Fetched 29 September 2026 from the docs header on [the quickstart](https://openrouter.ai/docs/quickstart) and from [the docs index](https://openrouter.ai/docs/llms.txt), the [Activity guide](https://openrouter.ai/docs/guides/features/activity.md) and the [Workspaces guide](https://openrouter.ai/docs/guides/features/workspaces.md).

The public header is **Models, Benchmarks, Chat, Rankings, Apps, Ori, Pricing, Sign in**. That is the job: pick a model or talk to one, then look at price and rank. Docs describe the first working setup as a model plus an API key, paid with credits. Activity (`https://openrouter.ai/activity`) is where spend and requests are inspected afterwards. It is not a step you must understand to send the first request.

Workspace exists, and the guide says the existing setup is already a Default workspace: “If you don't need multiple workspaces, keep working as usual; nothing changes.” Provider is a routing choice inside a model, not a party the user onboards. There is no user-facing Quote, Call, Listing, Publication or Principal. Price is a property of the model and the request.

Day-one concepts: **Model, API key, Credits, Chat** (or the API as the place the key is used). About four. The nav is those concepts.

AEcon’s charter already uses OpenRouter server tools as the ease benchmark for provider choice, price and spend visibility, while keeping a real Quote and Call underneath. The gap is that OpenRouter does not make the purchase machinery the vocabulary of the first screen. AEcon prints Quote, Call, listing, publication, host, Bazaar and USDC on the page where OpenRouter would print a price and a button.

### RapidAPI

Fetched 29 September 2026 from [Header Links and Icons](https://docs.rapidapi.com/docs/header-links-and-icons) and the Rapid Console contents.

The logged-in header depends on permission, but the consumer items are a **search box**, **API Hub** (discover, learn and test APIs) and **Apps** (the Developer Dashboard: usage and API keys). **My APIs** is the builder door and goes to Studio. Admin, organisations and approvals are permissioned, not the default consumer bar.

The consumer quick start is: find an API, connect to it, use an app and a key, subscribe to a plan. “Listing” in their docs is the API’s page (API Listing, Hub Listing), not a second object the buyer manages beside the API. Billing and subscriptions live under the app dashboard. There is no Quote, Call, workspace, principal or publication in the consumer header.

Day-one concepts: **API, Hub, App, API key, subscription**. About five, and the header is those. The provider product is a separate item, not a synonym of the thing the buyer just searched for.

AEcon’s equivalent would be a market, a key for the agent, and a bill. Instead the buyer’s “Tools” item is the provider studio, and “listing” is a status that means the row cannot be bought.

### Perplexity

The consumer homepage and the hub FAQ returned HTTP 403 to this review, so this is not a live click-through. The indexed help page [How do I navigate Perplexity?](https://www.perplexity.ai/hub/faq/interface-navigation) describes a left menu of **New Thread, Home, Discover, Library and Profile**. Spaces are a way to keep threads, files and instructions together, described on the Spaces FAQ, and a May changelog describes pinning Threads, Discover or Spaces. They are organisation, not a prerequisite for asking.

The consumer job is one action: ask, then read an answer with sources. Day-one concepts: **Thread**, and optionally **Space** or **Library** if the person wants to keep work. About two to four. No tool, quote, call, provider, credit or principal on that path.

Perplexity’s developer docs (fetched from [the overview](https://docs.perplexity.ai/getting-started/overview)) are a different product: models, an API key, search and agent APIs. They should not be added to the consumer count. AEcon mixes the equivalent of that developer product into the same header as the ask box.

### Side by side

| | Day-one job | Top of the product | Named concepts before first success |
| --- | --- | --- | --- |
| OpenRouter | Send a model request and pay from credits | Models, Chat, Rankings, Apps, Pricing | About 4: model, API key, credits, chat |
| RapidAPI | Find an API and call it with a key | Search, API Hub, Apps. My APIs is the other side | About 5: API, hub, app, key, subscription |
| Perplexity | Ask a question and read the answer | New thread, Home, Discover, Library | About 2–4: thread, and optionally space or library |
| AEcon | Fund AUD, let an existing agent buy one service, keep the record | Market, For agents, For providers; then Market, Ask, Activity, Settings | **24**, including both sides and the purchase machinery |

The pattern in the three references is the same. The first screen is the job. The other side of the market is a separate door. Money and history are one step down, not a second vocabulary. Optional structure (workspace, space, organisation) is there if you need it and invisible if you do not.

## What this means for the rebuild

The primary user on day one is the Australian business buyer in `PRODUCT.md`, not the agent, the provider or the operator. Until funding and purchases are actually open, the honest first screen is that job and its current limit, not a catalogue that implies a call can be made.

The top level should be the four steps onboarding already promises, in job language:

1. **Find** — one place. Ask can be the front of it. The catalogue is the result, not a second product.
2. **Credit** — the AUD balance and the limit, together, because the product already has to explain that balance is not permission.
3. **Agents** — connect the harness they already use.
4. **Receipts** — one history. Do not name it Activity in the nav and Calls on the page.

Provider publishing stays behind For providers, the way RapidAPI keeps My APIs off the consumer bar. It should not be a menu item called Tools.

Quote, Call, listing, publication, host, principal, Bazaar, x402 and USDC can remain precise records. They should not be the words on the first screens. OpenRouter shows a price and a charge without teaching a quote object. AEcon can keep the quote underneath a sentence a buyer already understands: the price for this input, then one purchase, then a receipt. Principal in particular should never be a visible label or a raw id on an agent row, a receipt or a credit case.

That is a smaller navigation, not a smaller product. The charter’s commercial record stays. The first hour stops teaching the record’s schema.
