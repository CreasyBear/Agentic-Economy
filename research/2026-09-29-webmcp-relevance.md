# WebMCP and its relevance to Agentic Economy

**Date:** 29 September 2026
**Status:** research memo. It does not change `PRODUCT.md`, `CONTEXT.md`, or the whitepaper.
**Question:** What is WebMCP, and does it change how Agentic Economy should expose, discover, or sell Tools?

## Judgment

WebMCP is a proposed browser API for the page the user already has open. It lets that page register structured tools so a browser agent can call them instead of guessing clicks. It is not a replacement for the Model Context Protocol, not a catalogue, and not a purchase record.

Agentic Economy should keep its market on the existing harness surfaces: the authenticated MCP server, the HTTP API, and the CLI. Those surfaces stay available while the customer's agent is doing other work, and they already separate anonymous reads from authority to Quote and Call.

WebMCP matters in three narrower ways:

1. It is the interaction model Chrome, Shopify, and PayPal are teaching websites for a human sitting in a browser with an agent. That is a different job from just-in-time procurement.
2. If customers later drive the AE website itself with a browser agent, a small read-only WebMCP layer on that site would be a progressive enhancement of the existing pages. It would not be a second market.
3. A logged-in browser session is a poor stand-in for a spending policy. WebMCP tools run with the page's cookies. Treating that session as permission to buy would collapse the distinction the product is built on: funding is not authority, and a credential or endpoint is not a commercial role.

Do not ingest WebMCP pages as supply, do not register one MCP tool per website tool, and do not route Calls through `document.modelContext`.

## What WebMCP is

The current text is the W3C Web Machine Learning Community Group draft of 28 September 2026, edited by Brandon Walderman (Microsoft) and Khushal Sagar and Dominic Farolino (Google). It is a Community Group draft. It is not a W3C Standard and it is not on the W3C standards track. The draft's abstract is one sentence: the WebMCP API enables web applications to provide JavaScript-based tools to AI agents.

The introduction is more specific. A page exposes JavaScript functions with natural-language descriptions and structured schemas. Those tools can be invoked by an agent, by a browser's agent (built in, or hosted through an extension), or by assistive technology. The draft says a WebMCP page can be thought of as an MCP server whose tools run in client-side script rather than on a backend. It also says the point is a shared web interface, with the user and the agent working in the same page.

Chrome's comparison page, published 11 March 2026 and marked updated 19 May 2026 in the article header, is explicit that WebMCP is not an extension or a replacement of MCP. MCP is the persistent, cross-platform way to reach data and actions. WebMCP exists only while the page is open, only for a browser agent, and only for the live tab, including that tab's DOM, cookies, and session. Once the user leaves the site or closes the tab, the tools are gone. Chrome also says clients must visit a site to know whether it has tools. There is no registry in the draft.

### Browser status

| Milestone | What was published |
| --- | --- |
| 10 February 2026 | Chrome early-preview post. Two shapes: a declarative API on HTML forms, and an imperative JavaScript API. Prototyping was limited to the early-preview program. |
| 11 March 2026 | "When to use WebMCP and MCP," article header updated 19 May 2026. WebMCP does not replace MCP. |
| 18 May 2026 | Chrome developer guide, updated 7 August 2026. Origin trial, local flag, permissions, and the limits below. |
| 9 June 2026 | Origin trial announced for Chrome 149. Security guidance published the same day and updated 1 September 2026. |
| 28 September 2026 | Community Group draft fetched for this memo. Test suite linked from the draft: `https://wpt.fyi/results/webmcp`. |

Local testing is the flag `chrome://flags/#enable-webmcp-testing`. Live-origin testing is the Chrome 149 origin trial (`4163014905550602241` on Chrome's origin-trial registration page). Chrome Status tracks the feature as an experiment, not as a shipped platform API. The draft and Chrome's docs both say the API can still change. Earlier write-ups used `navigator.modelContext`. The 28 September draft puts the object on the document: `document.modelContext`.

Chrome lists three limits that matter more than the API shape:

- The API is aimed at a local browser with a person in the loop. Headless use is not the design centre.
- A complex application still has to be refactored so its tools match real state.
- Tools are discoverable only by visiting the page.

The API is also off unless the document is origin-isolated. Setting `document.domain`, including via `Origin-Agent-Cluster: ?0`, disables it. The `tools` Permissions Policy defaults to `self`. Cross-origin iframes do not get it unless the embedding page sets `allow="tools"`.

### The interface in the current draft

A model context holds a tool map. Each tool has:

- a name of 1–128 characters, limited to ASCII letters, digits, `_`, `-`, and `.`;
- an optional human title;
- a description string;
- an input schema, stored as a stringified JSON Schema;
- execute steps;
- optional annotations;
- an optional list of other origins the tool is exposed to.

Annotations are four booleans, all defaulting to false: `readOnlyHint`, `untrustedContentHint`, `consequentialHint`, and `debugging`.

`registerTool` returns a promise. Registration can be tied to an `AbortSignal`, so leaving a view can drop the tool without a separate unregister method. `getTools` lists tools visible to the caller. `executeTool` runs one. The draft also defines `toolchange`, `toolcancel`, and activation events. Pending executions are tracked on the traversable navigable, which is the browser's cross-document record of in-flight calls, and cancelled if the caller or target document unloads.

For imperative tools, execute steps call the page's JavaScript callback. For declarative tools, the draft says the steps that would fill a form "have not been defined yet." Chrome already documents a declarative form API for developers. The community draft has not finished specifying how that form is executed. Treat declarative WebMCP as a Chrome experiment, not as a completed standard.

Same-origin pages see their own tools. Another origin sees a tool only if the registering page listed that origin. A cross-origin iframe still needs the `tools` permissions policy.

### Security model, as written

Section 6 of the draft is non-normative. It says the document cannot require a particular mitigation from agents or user agents. The risks it names are the ones that collide with a purchase:

- **Prompt injection.** Tool names, descriptions, arguments, and return values are natural language. An agent may treat them as instructions. The draft splits this into metadata poisoning, output injection, and a hostile or buggy tool implementation.
- **Misrepresentation of intent.** Nothing checks that the description matches the function. The draft's own example of why that matters is an authenticated page: the tool runs with the user's cookies, so it can buy, transfer funds, change account settings, or share private data without a second login.
- **Privacy leakage through extra parameters.** A tool can ask for more than the task needs.
- **Same-origin and private-browsing interactions.** Exposure lists and browser modes are called out as separate hazards.

The specified mitigation for high-impact tools is the `consequentialHint` boolean. The draft says a client *can* use it to require a confirmation prompt before booking travel or transferring money. It does not say the browser must show one, and it does not define what the prompt must display. `untrustedContentHint` is likewise a signal that the result should not be treated as instructions.

Chrome's security guide of 1 September 2026 recommends those hints, origin allow-lists, and character budgets (about 500 characters for a tool description, 150 for a parameter description, 30 for names, and 1,500 for one tool result). Those budgets are Chrome guidance, not draft conformance requirements. The same page says the draft includes `requestUserInteraction()` so a tool can ask the user for input during execution. The 28 September draft fetched for this memo does not contain that name. Confirmation UX is therefore not a stable part of the spec. A hint is not an authorisation, and a site-drawn dialog is not independent evidence of what will execute.

## What commerce vendors are doing with it

Two public commerce implementations show the intended use. Both keep the person in the tab. Neither produces the buyer, seller, authority, and remedy record AE exists to provide.

**Shopify** documents WebMCP tools on every Liquid storefront, and on Hydrogen's developer preview, with no merchant setup. The tools act on the shopper's live session: `search_catalog`, `browse_store`, `get_product`, `show_variant`, `get_cart`, `update_cart`, `cancel_cart`, `proceed_to_checkout`, `manage_orders`, and `search_shop_policies_and_faqs`. Cart changes go through the same storefront actions a theme uses, so the shopper sees the cart update. Checkout is a different page with its own tool list. Shopify's note on the page is the useful split: these tools are for an agent the shopper brought in the browser. An agent that talks to Shopify's MCP servers is a different product ("Agentic commerce"), and Shopify points builders there instead.

**PayPal**'s developer blog says WebMCP support is optional and limited to Store Sync merchants while the ecosystem develops. The described path is discovery, cart, and checkout initiation on the merchant side, then a handoff into PayPal for the customer to authenticate, choose funding, review, and approve. Payment confirmation stays in PayPal's flow. Store Sync's merchant API then returns a completed cart, an order number, and an order-review URL.

Chrome's own examples match this shape: support forms, travel booking, and shopping, with a confirmation step for a purchase. The early-preview post's ecommerce example is "navigate checkout flows," not "settle an unattended machine purchase."

## Where Agentic Economy already stands

The product charter is a cross-harness Tool market. The customer owns the objective and the economic result. The agent stays in its existing app or framework, finds a bounded outside contribution, and uses it inside a spending policy. AE does not take over the larger task. The entry offer is one AUD balance, an authorised agent, a bounded x402 Call, and a record a business can explain.

The chain the product has to preserve is need, comparison, Quote and spending checks, Call, result or uncertainty, remedy if needed, purchase resolution, outcome records, then the agent continues. For a principal-reseller purchase, AE is the buyer-facing seller and the Provider performs upstream. The whitepaper's name for the missing end state is commercial closure: legal buyer and seller, authority, data destination, tax, delivery, remedy, and an audit record. A payment protocol can move value without establishing any of those.

The implemented agent door for that chain is the MCP host in `src/lib/server/mcp-api.ts`. It adapts the action registry. Anonymous callers stay read-only. Authenticated callers see only actions their authority mode allows. The server instructions tell a client to search, describe, or compare; a connected buyer then supplies exact input and a fresh purchase key to Quote and Call. Account tools show identity, balance, and activity. Provider tools require provider authority. `/mcp?readonly=1` is discover and read-only account tools, without buying. Catalogue entries come back as data. They are not registered as one MCP tool per Operation. Tool references keep the `operation:v1:` form.

That design already answers the question WebMCP is sometimes used to ask ("will the browser standard replace our MCP server?"). Chrome says no. AE's server is the persistent, authenticated market. WebMCP is the tab.

`PRODUCT.md` also already says a spending policy is not required to reconstruct a purchase that happened outside AE. A Shopify or PayPal WebMCP checkout in someone's browser is that kind of outside acquisition.

## Relevance

### It does not solve commercial closure

A WebMCP call can change a cart or start checkout because the page is logged in. The draft states that directly under misrepresentation of intent. The call does not establish:

- who the legal buyer and seller are;
- which spending policy or delegation authorised the agent;
- a Quote bound to a Tool version, price, terms, and data destination;
- a separate Provider obligation when AE is the seller;
- delivery versus settlement;
- a remedy and a purchase status the business can show later.

`consequentialHint` does not add those facts. It asks a client to consider a prompt. The prompt, if it appears, is outside the draft's conformance requirements, and the tool can still do something other than what the description said.

Shopify and PayPal do not pretend otherwise. Shopify separates in-browser shopper tools from its server MCP. PayPal puts the payment approval in its own human flow. Both are reasonable designs for a person shopping. They are the opposite of an agent buying a previously unknown service in the middle of other work, with no tab open and no new human procurement cycle.

### It is a weak supply channel

Future AE supply includes specialist businesses and professional sites, not only x402 APIs. A firm's website could expose WebMCP tools for "book a valuation" or "request a search." That is still a page, visited by a browser agent, acting as the person who is logged in.

It fails the market tests AE already uses:

- **Discovery.** The agent must already be on the site. AE's job starts from a capability gap, often before anyone knows the provider.
- **Availability.** Tools die with the tab. A Call has to be retryable and attributable after the page is gone.
- **Identity of the actor.** The session is the user's browser login, not an agent principal bound to an account and a spending policy.
- **Admission.** An observed outside interaction does not become a callable Tool. Publication still has to fix the version, inputs, price, terms, data use, effects, and evidence.
- **Comparison.** Two open tabs are not a quote comparison. There is no shared price type, expiry, or seller.

Using WebMCP as an ingest path would also import the draft's trust gap: the description is not the implementation. AE would be listing behaviour it cannot see.

### It is a possible front door to the website, not to the market

Chrome's guide is aimed at site owners who want browser agents to complete tasks on pages they already ship. AE has that kind of site: find, inspect, compare, account, and support. A browser agent on `aecon.ai` will otherwise scrape the DOM.

If that traffic appears, the useful WebMCP surface is the same read path the MCP server already describes:

- search the catalogue;
- describe one Tool;
- compare known references;
- show balance and recent activity only when the signed-in user could already see them on the page.

Quote and Call should stay off that surface. A cookie session on the marketing or console origin is not a purchase key, not an agent credential, and not a spending-policy check. The MCP adapter already refuses anonymous writes and refuses actions the caller's mode does not allow. A page script that called the procure path because `document.cookie` was present would be a new way around that adapter.

The same constraint applies to provider pages inside the console. Publishing, pricing, and payout changes are consequential account changes. They belong on the existing human screens and authenticated APIs, not on a tool whose only safety signal is a hint.

Chrome's character budgets are a practical warning even if AE never ships WebMCP. The agent-experience plan already treats a 31 KB buyer `tools/list` as too large. A browser agent will do worse with a long tool list. Any future page tools should be a handful of stable actions, with catalogue rows in the result, which is the shape `AE_MCP_INSTRUCTIONS` already requires.

### It competes for attention, not for the product

The charter's experience benchmarks are Locus, Nevermined, OpenRouter server tools, and Mercator: an agent in its harness, a clear provider and price, a completed task, spend the customer can see. WebMCP does not raise or lower that bar. A customer whose agent lives in Claude, Cursor, or a server workflow never opens an AE tab, so a WebMCP registration would not help them.

The risk is a false roadmap item. "Agent-ready" is now a label on storefronts and payment buttons. Copying that label onto AE would describe a shopper flow the product has deliberately refused: the agent does not become the merchant's in-page assistant, and AE does not become the merchant of record for whatever site the browser happens to be on.

There is a narrower product lesson. Shopify's storefront tools are few, named for the shopper's next step, and visibly change the page the person is looking at. AE's own website should be that legible for a human. That is a page-quality issue already covered by the buyer-journey work. It does not require implementing the draft.

## What not to build

- A WebMCP client that browses the web to find providers, fills their forms, and pays. That is unattended browser actuation plus an outside purchase. It drops admission, the Quote, the spending policy, and the seller record.
- A bridge that republishes each remote WebMCP tool as an AE Tool or as an MCP tool. Names are page-local, schemas are page-authored, and execution requires the user's tab and cookies.
- Payment inside `execute` on the AE origin, including "prepare checkout" tools that capture a card or move credit. PayPal's public pattern is a handoff to the payment provider's own confirmation. AE's pattern is already stricter: Quote, purchase key, Call, then the existing credit and recovery path.
- Treating `consequentialHint: true` as the control. The draft allows a client to ignore it. The page can also set it falsely, or omit it on a tool that spends.

## What would be worth doing later

Only after the API is stable enough that `document.modelContext` is not going to move again, and only if browser-agent traffic on the AE site is real:

1. Register a read-only tool set on the public catalogue and signed-in inspect views, behind feature detection (`"modelContext" in document`) and the origin trial or its successor.
2. Keep those handlers on the same read actions the MCP server already exposes. Do not add a parallel catalogue.
3. Return short structured results and mark anything that includes provider text with `untrustedContentHint`.
4. Leave Quote, Call, publish, payout, and credential actions unregistered. Link the agent to the human page where that decision already has its cost, terms, and authority.
5. Send `Permissions-Policy: tools=()` on any origin that should not participate, especially payment return URLs and embedded third-party frames.

That work is a website compatibility task. It is not a market, billing, or protocol task. It should not move ahead of the harness journey the charter already prioritises: find, compare, choose, Call, result, record.

## What would change this judgment

Revisit the memo if any of these become true:

- The API leaves the Community Group draft and ships in more than one browser, with a specified declarative execution algorithm and a normative user-confirmation step that shows amount, counterparty, and effect independently of the page's copy.
- A discovery mechanism exists that does not require an open tab. Until then, WebMCP cannot feed the capability-gap path.
- Customers' agents actually arrive through a browser agent on the AE site often enough to justify the read-only layer. Server and desktop MCP would still remain the purchase path.
- A provider standard binds a WebMCP tool to a durable, machine-checkable contract (identity, price, terms, evidence) that can be admitted without trusting the page description. Nothing in the current draft does that.

## Sources

Primary:

- WebMCP Draft Community Group Report, 28 September 2026. <https://webmachinelearning.github.io/webmcp/>
- Chrome, "WebMCP," published 18 May 2026, updated 7 August 2026. <https://developer.chrome.com/docs/ai/webmcp>
- Chrome, "When to use WebMCP and MCP," published 11 March 2026, updated 19 May 2026. <https://developer.chrome.com/docs/ai/webmcp/compare-mcp>
- Chrome, "WebMCP is available for early preview," 10 February 2026. <https://developer.chrome.com/blog/webmcp-epp>
- Chrome, "Join the WebMCP origin trial," 9 June 2026. <https://developer.chrome.com/blog/ai-webmcp-origin-trial>
- Chrome, "WebMCP tool security," published 9 June 2026, updated 1 September 2026. <https://developer.chrome.com/docs/ai/webmcp/secure-tools>
- Chrome Status feature entry linked from those pages. <https://chromestatus.com/feature/5117755740913664>
- WebMCP web-platform tests linked from the draft. <https://wpt.fyi/results/webmcp>

Commerce implementations:

- Shopify, "WebMCP tools." <https://shopify.dev/docs/api/web-mcp>
- PayPal Developer, "WebMCP is here: PayPal is helping every merchant become agent-ready." <https://developer.paypal.com/community/blog/WebMCP_PayPal_Agent_Ready/>
- PayPal Developer, Store Sync. <https://developer.paypal.com/store-sync/overview>

Agentic Economy, this checkout:

- `PRODUCT.md` — harness stays in place; Quote, Call, and spending policy; outside purchases are not reconstructed into the market.
- `AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md` — commercial closure, and what a payment protocol does not establish.
- `src/lib/server/mcp-api.ts` — anonymous read-only MCP, authority-filtered actions, catalogue entries returned as data.
- `docs/designs/2026-09-23-agent-experience-wave2-plan.md` — buyer MCP `tools/list` size.
