# Speed and trust plan, 2026-10-09

This is an independent review: five haiku agents measured app.aecon.ai and the code, then an opus latency engineer and an opus trust designer weighed in, then an opus judge decided. It was read-only, with no paid calls.

## The honest read
You're right to worry, but the problem is narrower than it feels. Browsing is fast: https://app.aecon.ai/market answers in 0.25s and /api/v1/registry in 0.2s. Trust breaks in two places. A paid call takes 86.8s, and almost all of that is the code deliberately waiting. https://app.aecon.ai/api/ready returned 503 `payments_unavailable` on 2 of 2 GETs today, while the same response says `sellable: true`. This needs about two weeks of focused cuts, not a rewrite.

## Trust targets
| Surface | Today | p50 / p95 |
|---|---|---|
| Web TTFB | 0.25–0.55s | 0.25 / 0.4s |
| API read | 0.2s | 0.2 / 0.3s |
| ae search | 6.0s (one run) | 1 / 1.5s |
| Quote | not measured | 0.8 / 1.5s |
| Paid call to result | 86.8s (one run) | 6 / 10s |
| Recovery start | 60s | 15s |
| /api/ready | 503 today | 200 at least 99.9% |

## The 5 fixes that matter
1. **Readiness.** Find out why the production payments check fails. Then keep the last good result for one extra 5-minute refresh, and report browse, quote and pay separately. File: `convex/lib/money/readiness/refresh.ts:18,27`. Removes the public 503. 1 day.
2. **Return the result after 1 block confirmation.** `x402Authorization.ts:613` asks for 12 confirmations with a 60s timeout. The receipt reader already handles 1 confirmation (`x402-evm-receipt-reader.ts:150-152`). Do the 12-confirmation check afterwards in a background job. Saves 22–58s. 1–2 days.
3. **Start recovery after 15s, from one timer.** Today it starts after 60s: `observe.ts:208` (`runAfter(60_000)`) and `responseRecovery.ts:50,56` (`60_000*2**attempt`). Keep the same idempotency key. Saves about 45s on a stalled call. 1 day.
4. **Show each stage while the call runs.** `ae call --wait`, MCP and HTTP status should print each step as it happens: quoted, signed, tx sent, confirming, response, receipt. The silence is what makes it feel untrustworthy. 1 day.
5. **Search.** Show only tools AE can call by default, and let the OpenRouter re-rank be skipped (`tools/ae/commands/search.ts`). Saves about 4s and stops agents copying the wrong ref. 1 day.

## What to stop doing
- Adding new timers or plan layers. There is already a duplicate `startNode` at `plans/nodeCommands.ts:102-103`.
- Working on the web bundle. Pages already load fast.
- Doing bloat-review refactors before the paid path is fast.
- Writing test suites as proof. Real `ae` calls are the proof.
- Judging speed by feel. Log the timestamp of every stage.

## Two-week plan
**Week 1:** Make 10 testnet paid calls through `ae call --wait` as a baseline, logging each stage's timestamp. Then do fixes 1 and 2.
**Week 2:** Fixes 3, 4 and 5. Move `syncCapacity` into the existing `Promise.all` (`quoteAction.ts:131,138`). On Friday, make the same 10 calls with the same tool and input, and compare p50/p95 before and after.

## How you will know it worked
- Paid call: p95 of 10s or less.
- Search: p95 of 1.5s or less.
- Quote: p95 of 1.5s or less.
- /api/ready: zero 503s across 7 days.
- Web: TTFB p95 under 0.4s.
