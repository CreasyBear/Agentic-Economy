# First-run journeys, 2026-10-09

**Sources:** a live walk of app.aecon.ai; benchmarks of 12 products (OpenRouter, Replicate, Exa, Firecrawl, Browserbase, Composio, Apify, Smithery, Stripe, x402 Bazaar, Coinbase CDP, Skyfire); a code map of today's journeys; and the 2026-10-09 saasyass ads notes (users pay only after value, a one-job landing page, one-click signup, a three-step checklist, and an upgrade prompt right after value).

**Today, from the code:**
- `/` redirects to `/market` (`src/routes/index.tsx:5-13`). The finished landing page `AeHomeLanding.tsx` is never loaded.
- The first paid call comes only after sign-in, Stripe funding, agent connection and about 5 CLI commands with 3 copied IDs.
- `ae fund` only prints a link.
- The A$10 trial needs admin approval.
- Adding a provider listing is a wizard of 10+ fields plus attestations, gated on admission.

## How aecon reads to a stranger today

- **The hero never says what aecon is.** "Intelligence, put to work." and "A world of tools for you and your agents" could describe any AI product. Neither line mentions paying, calling or agents buying anything.
- **It promises things it hasn't built.** "We're building one AUD account for your Agent's paid Tools" is future tense, and "pay per Call in AUD" gives no amount.
- **The words keep changing.** "Capability", "Tool", "Quote", "Call" and "Plan" are used interchangeably and none is defined. "x402" never appears.
- **A visitor can't see anything work.** Finance search returns "Search is unavailable. This search could not complete." No tool page has a public link, and `/status` says "Some systems are degraded".
- **No real price and no runnable code.** The only price is "Example price: A$1.25", the only code is a JSON template, and `/pricing` and `/docs` return 404.

## The first-five-minutes pattern set

1. **First call without a key.** Firecrawl does this best: its docs' first cURL to `/v2/scrape` needs no account. aecon should offer one free tool (FX rate or ABN lookup) that answers a curl with no key.
2. **A runnable snippet right under the hero.** Best is Firecrawl's 7-line cURL; Replicate's `replicate.run(model, {input})` is close. aecon should put a 3-line copyable curl under the hero (search, quote, call) in place of the category cards.
3. **A free offer in the main button.** Best is Apify ("$5 of usage credit every month", no card), with Composio's "100,000 free actions" close behind. aecon's CTA should read "Start with A$5 of calls, no card."
4. **Tool pages anyone can browse.** Apify Store and Smithery ("Browse 25,776+ MCPs") need no account. aecon should give each tool a public `/tools/{slug}` page with price per call, input schema, sample output and live readiness.
5. **Install with one agent-native command.** Exa's MCP needs no key; Coinbase uses `npx skills add …` and Smithery uses `npx smithery auth login`. aecon should offer one MCP URL or `npx aecon connect` for Claude, Cursor and Codex.
6. **Keep payment out of the first-call path.** All four dev-API benchmarks do this; Replicate pushes billing to the docs sidebar. aecon should fund the sandbox balance automatically and ask for a card or x402 only at the first top-up.
7. **A free test rail for crypto payments.** Coinbase CDP pairs a testnet faucet with a managed wallet. aecon should let a builder toggle to Base Sepolia and watch 402, then pay, then 200 happen live.
8. **Sellers onboard with one line.** x402 needs only `paymentMiddleware` per endpoint. aecon should let a provider paste an OpenAPI or MCP URL, set an AUD price and publish.

## The one-line promise aecon should make

- **A.** "One key for every paid API your agent calls."
- **B.** "Give your agent a budget, not your card."
- **C.** "Find a tool, pay per call, keep the receipt."

**Recommendation: A.** It names a pain builders already have (too many keys and billing accounts) and has a familiar comparison ("OpenRouter, for tools"). The first snippet can prove it. B is the better subhead because it carries the spending-policy idea.

## The ideal first-run journey for an agent builder

1. They land on `/` with no redirect. It shows promise A, a 3-line curl and "A$5 free, no card."
2. They paste the curl to call the free keyless tool and get the result in their terminal. **★ First value: a working call in under 60 seconds with no account.**
3. They open a public tool page that shows "A$0.012 / call", the input schema, sample output and current readiness.
4. They sign in with GitHub or a passkey. A workspace is created with A$5 of sandbox credit, and the API key is shown once.
5. A spending policy is pre-filled (A$5/day cap, per-tool ceiling), and accepting it takes one click.
6. They add the MCP URL to Claude or Cursor, or put the key into the snippet.
7. Their agent calls a paid tool: the quote comes back inline, the call runs and the receipt appears in the workspace. **★ Main value: their agent paid for a third-party API by itself, within budget and with a receipt, and they never set up a provider account.**
8. When the balance drops to A$1, they top up by card (Stripe) or an x402 wallet, and the loading fee is shown before they pay.

## The ideal first-run journey for a provider

1. `/for-providers` says "Get paid per call by AI agents. List an API in 10 minutes." It shows a sample payout and the fee.
2. They sign in.
3. They paste an OpenAPI or MCP server URL. aecon finds the endpoints and drafts tool names, descriptions and input schemas.
4. They set an AUD price per call, with a suggested range from similar tools, and choose how aecon holds their upstream credential.
5. They run a sandbox test call from the dashboard and see exactly what a buyer sees: quote, call, receipt. **★ First value: watching their API being sold.**
6. They connect payouts through Stripe Connect or an x402 receive address.
7. They publish. The public tool page goes live in search, with a link they can share.
8. They get notified of their first real paid call, and the earnings ledger updates. **★ Main value: they earned money with no sales or integration work.**

---

## Rules aecon breaks (from the 2026-10-09 saasyass notes, checked against code and the live site)

| Rule from the notes | How aecon breaks it | Evidence |
|---|---|---|
| People only pay once the product solves their problem | Value comes after sign-in, Stripe funding and agent connection, and search returns tools that can't be called | Code map; live "weather" search returned 8 of 8 "External listing (not AE callable)" |
| The landing page does one job | There's no landing page. `/` redirects to `/market`, and the hero ("Intelligence, put to work") doesn't say what aecon does | `src/routes/index.tsx:5-13`; live walk |
| As few fields as possible, plus one question | Provider listing is a wizard of 10+ fields plus attestations, followed by admission checks | `SupplyPublicationFlow.tsx:186-365` |
| A three-step checklist to the aha, with sample data | About 5 CLI commands, 2 browser approvals and 3 copied IDs; `ae fund` only prints a link | `tools/ae/commands/fund.ts:8-26`; code map |
| Make the tour optional | Agents get about 38 KB of instructions and tool definitions before the first call, and the workflow is restated three times | MCP measurement |
| Upgrade prompts right after a moment of value | The trial needs an admin to approve it, and funding is demanded before any value | `trial-access-contracts.ts`; `/owner/credit#fund` |
| Email a nudge when step 1 is done but step 2 isn't | No triggered follow-up exists for "connected but never called" or "searched but never called" | Nothing found in the code map |
| Matched proof | No real usage, counts or case studies are shown; the only price is "Example price: A$1.25" | Live `/developers/api` |
| Fix the thing before buying traffic (inferred, not stated in the notes) | Production `/api/ready` returns 503, live search returned "Search is unavailable", and `/status` says degraded | Live checks on 2026-10-09 |
| Remove friction rather than explain it (inferred, not stated in the notes) | Refusals are presented as features ("not AE callable", readiness jargon, Quote/Plan/Capability) | Live copy |
