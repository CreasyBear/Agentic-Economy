> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../README.md) for its successor and remaining limits.

# Magical aecon: familiar first, then unique (29 September 2026)

Goal: a person asks for something, and aecon gets it done with their money and their permission. Everything else stays out of the way. Familiar before unique.

## Reference products
- **Perplexity:** ask, get an answer, sources cited under it. The source is shown after the answer, not chosen before it.
- **treg / OpenRouter:**
  - A credit balance, top-up when low, an activity list.
  - One key for agents.
  - Search → describe → call.
  - Ranked by live results.
- **App Store in-app purchase / Uber:**
  - Payment is set up once.
  - The price is known up front.
  - Small charges happen without asking again.
  - Receipts come afterwards.

aecon = Perplexity for things the internet sells. Each answer shows the source aecon paid and what it cost.

## Pass 1 (first guess, decent, not magical)
A Run button on each Tool card and a top-up modal. It is still the user's job to pick a Tool, read a price and confirm every Call.

## Pass 2: cognitive-load audit of today's journey
Source: the DeepJourney goblin.
- **Decisions and concepts the user has to handle:**
  1. Pick a Tool out of n.
  2. Write JSON (recall, not recognition).
  3. "Turn on paying" (a new concept).
  4. MFA (context switch).
  5. Search and pick again, because a new chat starts (memory loss).
  6. Choose a funding amount on another page (context switch).
  7. Review the Quote.
  8. Approve.
  9. Read a receipt full of internal nouns.
- **Totals:** 9 decisions, 3 context switches, and roughly 6 unfamiliar nouns (Tool, Quote, Call, agent access, x402, "listed on Bazaar").
- **Extraneous load:** nearly all of it. The only intrinsic decision is "do I want this for about A$0.02?"

## Pass 3: inversion (how to make the user think)
- Ask them to choose something aecon can rank better.
- Show a noun they have never met in another app.
- Navigate them away from their request.
- Confirm something they have already agreed to.
- Make them retype or re-find anything.
- Show internal state (verified, listed, setup_required).

Every item on that list happens today.

## Pass 4: the familiar product
### Six rules
1. **The chat box is the only input.** No forms, no JSON. The model fills the input from the listing's input description. "Edit input" is a disclosure.
2. **aecon picks, the user can override.** Use the best-ranked listing. "Other sources" sits under the answer.
3. **Money interrupts once.** The first paid answer opens one sheet; after that, charges under the limit happen silently.
4. **Context is never lost.** Sheets open over the chat. After sign-in or top-up, the same request carries on.
5. **Failures are aecon's problem, not the user's.** A seller that errors isn't paid (x402 does not settle on ≥400). aecon tries the next source automatically, at most twice, and says so in one line: "AX1 didn't answer, used Verdicto."
6. **Cents are shown afterwards, not before.** Each answer carries a chip: "Paid A$0.02 · AX1 · ★4.6 · 1.2k buyers". The only confirm is for a single Call above A$1 or anything over the daily limit.

### First run
0. **aecon.ai opens on a chat box** with four starters that show their price ("Weather in Perth tomorrow · about A$0.01").
1. **Ask.** Signing in isn't needed to ask. aecon streams "Finding a source… Weatherstack · A$0.01".
2. **One sheet** for someone who isn't signed in or funded: "Get this answer for A$0.01."
   - Continue with Google or Apple (Clerk).
   - Add A$5 with Apple Pay or card. GST is shown in small print. Stripe Checkout runs in the sheet or a popup.
   - "Spend up to A$5 a day without asking." On by default.
   - The sheet closes and the answer streams.
   - One sheet, two or three taps, no page change.
3. **Every later ask:** the answer plus the chip. Tapping the chip opens a sheet with the receipt, other sources, and "Rate this".
4. **Low balance:** the balance pill turns amber. When empty, the same sheet opens with only the top-up step, and the request carries on.
5. **Multi-Tool jobs:** a plan card, "3 sources · about A$0.12 · Run". This is the only place a Quote exists.

### Places (4)
- **Chat:** home.
- **Browse:** a treg-style catalogue. Search plus categories; each listing shows price, buyers and delivery rate. "Ask about this" opens chat pre-filled.
- **Activity:** every Call with its receipt.
- **Account:** balance, top-up, daily limit, agent keys.

Navigation: Chat · Browse · Activity. The balance pill sits top right. Account is behind the avatar.

### Agents (same loop, familiar like OpenRouter)
- **Connect:** "Connect an agent" gives one line to copy (MCP URL plus key).
- **Tools:** `search`, `describe`, `call`.
- **Errors say what to do:** the out-of-funds 402 includes the top-up link.
- **Money:** the same balance and daily limit.

### Hidden from users (still internal)
Quote (for single Calls), per-Call approval under the limit, the JSON form, "Turn on paying", MFA to start spending, "Not yet verified", "listed on Bazaar", `setup_required`, searching again after enabling, the trip to `/owner/credit`, and the words Operation, Offering, Publication, Binding, Business, Grant, x402.

### Where MFA sits
- **MFA for:** raising the daily limit, issuing agent keys, withdrawals, and changing the payment method.
- **Not for starting to spend:** paying with Apple Pay or a card is already strong authentication (3DS), and the daily limit caps the exposure.

### Magic touches (ae-magical-ui-motion)
- A thinking orb while aecon finds a source.
- The price pops in on the chip.
- The balance ticks down.
- The sheet opens on a spring.
- All of it respects reduced motion.

## Pass 5: unique, after familiar
- **The chip is the brand:** "aecon paid the internet for you." Prices are live, and reputation comes from real buyers.
- **One balance serves the person and their agents.**
- **Later:** saved jobs ("every morning"), and aecon's own services on the Browse shelf.

## Built from existing parts
- **Chat:** `/t/new` with Tool cards and streaming.
- **Price-then-Call:** `convex/lib/chat/tools/purchase.ts:93-127`, extended with building the Tool from a listing (`convex/x402Directory.ts:67-100`).
- **Live 402 price read:** `quoteAction.ts:92-101`.
- **Caps:** owner-chat grant A$1 per Call, A$5 a day, A$20 a month (`sandbox-policy.ts`).
- **Stripe top-up:** the funding session, with the shortfall from `quoteValuation.ts:329-363`.
- **Ranking:** `tool-selection-score.ts` plus directory payers.
- **Receipts:** existing.
- **New:** the sheet (sign-in + top-up + limit), the paid chip, automatic fallback, and no restart after enabling.

## Decisions for Joel
1. Replace MFA-to-start-spending with the payment itself plus the daily limit.
2. aecon picks the source automatically, with a bounded automatic fallback on unpaid failures.
3. Asking without an account is allowed; paying needs sign-in.
4. No starter credit. The first sheet makes funding one tap, so there is one less money primitive.
5. Default daily limit A$5; confirm above A$1 per Call.
