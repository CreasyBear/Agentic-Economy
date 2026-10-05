> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../README.md) for its successor and remaining limits.

# Reshuffle aecon from treg's design (29 September 2026)

Source: six read-only goblins over /tmp/treg and aecon. treg is source-available (Apache 2.0 plus a hosted-service restriction), so we take patterns only, never code.

Binding rules (Joel):
- Directory-first: every Bazaar listing is callable.
- A paid HTTP 200 is a success. aecon does not meter output quality. Reputation (ratings) and the market (distinct payers) handle quality.
- Limited liability: buyers do their own due diligence.

## How treg ticks
- **Nouns:** Tool, the catalogue, your own tools.
- **API:** search → get → call. The directory MCP has 10 tools (`mcp.py:1616-1754`).
- **No Quote step.** The call pipeline is auth → budgets → idempotency → resolve → hold at the estimate → relay → settle (`application/call/intake.py:143-176`, `service.py:565-1219`). No response, 5xx or network failure releases the hold (`settle.py:57-82,897-949`).
- **Ranking:**
  - Relevance first, then success bucket (≥0.9 / unknown / weak / zero, with a 5-call floor), then core vs extended, then price, then ID (`store.py:1332-1371`, `stats.py:178-211`).
  - Caller-caused 4xx is excluded.
  - Reviews are shown but do not rerank.
- **Money:**
  - One micro-USD ledger.
  - A $1 grant once per verified user.
  - Top-up presets with bonuses, and opt-in auto top-up.
  - Hard team daily cap.
  - No MFA at spend time (`domain/money/__init__.py:1-312`, `docs/context/architecture/money.md`).
- **First call:** sign in → team with $1 → search → Try → result. The 402 top-up happens only when the balance runs out (`tests/callmatrix/test_journey.py`).

## aecon today (friction and fragility)
- **Journey:** sign in → chat → Tool card → "Turn on paying" (MFA). Success then **starts a new chat, so the user must search and select again** (`useChatSession.ts:379-391`). Then comes the JSON form → Quote. If funds are short, the user leaves for `/owner/credit`, returns and requotes. Then approval → Call → receipt.
- **Bazaar rows are `external_listing`**, which cannot be quoted (`choices.ts:12-26`, `api.v1.registry.detail.ts:54-62`).
- **Sixteen noun concepts** reach users. There are parallel HTTP discovery families (`/registry`, `/market-tools`, `/businesses`), 39 MCP actions and 23 CLI commands (`mcp-toolsets.ts:4-16`, `tools/ae/cli.ts:447-470`).
- **Whole-journey failures:**
  - A catalogue-search outage returns `selection_unavailable` (`procure-engine.ts:194-219`).
  - A `/market` loader error replaces the whole route (`market.tsx:49-65`).
- **Evidence is keyed to the published toolRef, not the directory listing** (`buyerCompletedCall.ts:55-126`). The scorer ignores ratings (`tool-selection-score.ts:36-50`).
- **Money:**
  - Caps are A$1 per Call, A$5 a day and A$20 a month for each agent. They multiply across agents, and there is no aggregate daily cap.
  - There is no starter credit.
  - MFA guards turning on chat spending, but not issuing keys or raising limits (`agent-access.functions.ts:463-487,649-660`).

## Target
- **Nouns:** Tool, Call, Balance. Provider is attribution only. Agent access becomes "Connection". Quote becomes an internal Call preflight. Receipt becomes the Call result. Operation, Offering, Publication, Binding, Business and Grant become internal only.
- **Consumer loop:**
  1. Ask.
  2. Ranked Tools; every Bazaar listing is callable.
  3. The model fills the input.
  4. "Run · A$0.02". One Call does the live 402 read, the valuation, the cap check, the hold and the payment.
  5. Result and receipt.
  6. Optional rating.
- **Delivery facts only:**
  - Settled 200 = success.
  - ≥400 = provider failure; not settled, not charged.
  - Timeout = reconcile, then count.
  - Price mismatch = refused before payment.
- **Ranking:**
  - Relevance first. Jev only reorders; on outage keep full-text order.
  - Then the aecon delivery bucket, with a 5-call floor.
  - Then damped `log1p(payers30d)`, capped for wash trading.
  - Then ratings, recency, price, and a stable ID.

## Steps (one at a time, each proven live before the next)
1. **Listing → callable.** At Call time, resolve a directory row through `x402Directory.resolve` (`convex/x402Directory.ts:67-100`, `facilitatorDiscovery/publication.ts:110-133`).
2. **One Call.** Fold the Quote into the Call: the live 402 read, AUD valuation, caller-max and cap check, and the exact hold. Keep the fresh-challenge equality check before payment. Approval is needed only above the caps. Files: `quoteAction.ts`, `issueQuote.ts`, `callReservationActions.ts`, `runPreparation.ts`, `route-transport-x402.ts`, `chat/tools/purchase.ts`, `admission.ts`.
3. **Consumer chat:**
   - The model fills the input.
   - "Run · price" replaces the JSON form.
   - Readable result.
   - Turning on paying resumes the same chat and the same intent.
4. **Money:**
   - A shortfall shows one "Add A$X" button, pre-filled from the Call shortfall (`quoteValuation.ts:329-363` → `funding-quote.ts:122-181`), then resumes the same Call.
   - A$1 starter credit for verified accounts.
   - MFA only for raising caps, spend-capable keys and withdrawals.
   - Aggregate daily cap for the organisation.
5. **Ranking by listing:**
   - Key evidence to the directory resource (extend `marketEvidenceFacts`).
   - Record delivery facts only.
   - Ratings and payers enter the scorer.
   - Fail-open fixes in `procure-engine.ts` and `market.tsx`.
6. **Surface collapse:**
   - HTTP: `/registry` search and inspect plus `/tools/call`.
   - MCP: search, describe, call and recovery.
   - CLI: search, describe, call, with history, status, wait, cancel and recover nested under Call.
   - Retire `external_listing`, admission, qualification, lifecycle and readiness gates.
7. **Limited-liability line** on the Call, the receipt and the terms.
