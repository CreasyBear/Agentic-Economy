# Simple user expectations — scoreboard

Well 7 (2026-09-10). One row per thing a simple user expects, in persona order and roughly by frequency of use. Status is `done`, `partial` or `absent`; a row flips to `done` only when a persona journey completes against a preview (agents over HTTP/CLI/MCP for contracts, a browser spec for shell and settings). Corpus ids (E-nnn) point to the grouped papercut corpus from the Well 7 research. Package 7 (`docs/designs/package-7-trust-and-lifecycle.md`) owns terms, export, deletion, suspension and the hosted support inbox; those rows are intentionally absent here.

Modules that move rows: M1 one app shell · M2 settings that act · M3 events rail · M4 events surface · M5 money visibility · M6 refunds and support · M7 API reference and SDK · M8 trust and onboarding.

Status: done / partial / absent, with corpus ids. A row flips to done only on a completed persona journey.

### Buyer / agent developer
1. Install and connect in one command and know it worked — done (tier 0); tier-1 proof pending (E-031, E-056).
2. Find a Tool, see price and whether it is callable — done (Well 4).
3. Fund and see the fee before paying — partial (E-019, E-015).
4. Call, get result, receipt, history — done.
5. See what my agents spent and can still spend, in one place — absent (E-042, E-047, E-051, E-052).
6. Be told when something happens instead of polling — absent (E-043, E-071).
7. Rotate or revoke a key from a page; see which agent holds what — partial (E-049, E-072).
8. Ask for help privately with a request reference — partial (E-014 done, E-048, E-064, E-065, E-066).
9. Ask for a refund — absent.
10. Read an API reference and use an SDK — absent (E-045, E-057, E-058, E-060).
11. One coherent app: market and settings feel the same — partial (M1 landed one frame; design pass U9 and settings pages M2 pending) (E-062, E-063, E-067).

### Provider
1. Onboard through the hosted flow — done. 2. Listing state in one word — done. 3. See Calls and earnings — done (Well 6); payout maturity live-unproven (E-039, E-050). 4. Get paid and see it — partial. 5. Notified of Calls, readiness changes, payouts — absent (E-043). 6. Tax invoice — partial. 7. Versioned docs per source family — absent (E-060, E-061).

### Operator
1. Readiness truth — done (Well 6). 2. One joined view of what is stuck — absent (E-044, E-048). 3. Suppress a business — absent (E-020). 4. Audit trail — done.

### Newcomer
1. Glossary and conventions — done. 2. Browse-first onboarding with a verified first success — partial (E-054, E-055, E-056). 3. Know what the gate does and how long — partial (E-009).
