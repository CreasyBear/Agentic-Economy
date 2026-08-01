# Demand-anchored example asks (2026-08-01)

Trigger: founder rejected invented niche examples ("fortepiano restorer in Coober Pedy") — no market
familiarity for demand-side customers. Direction: anchor on what people actually search and use AI for.
Two research agents ran: one over the local Anthropic Economic Index corpus
(`~/Documents/Hermes/Agentic Economy/wiki/Raw/Research/Anthropic Economic Index`), one over web demand
evidence. Full transcripts: `history://AeiDemandScout`, `history://WebDemandScout`.

## Evidence

### What Australians search for locally (hire-a-business demand)
- Google Keyword Planner via BizCover (Sep 23–Aug 24, 165 trades, 50 cities): **electrician #1 —
  624,540 annual searches**; carpenter 158,970; concreter 157,800; roofer 153,920; landscaper 105,860;
  cleaners #11.
- Jobs & Skills Australia 2025 Occupation Shortage Drivers: plumbers and electrical workers in
  persistent structural shortage (ageing population, energy/housing transition).
- Health Dept: 3 in 10 Australians delay/avoid the dentist on cost — large familiar unmet demand.

### What people actually ask AI (usage logs, not vibes)
- OpenAI (1.5M conversations, Sep 2025): 75% practical guidance / info-seeking / writing; 49%
  advice-shaped, 40% doing-shaped; ~70% non-work.
- AEI (AU, May 2026): consumer chat is writing/education/research-heavy. Local-hire-shaped categories
  are the thin tail: medical questions 1.68%, buying/investing 2.10%, accounting/bookkeeping 0.53%,
  tutoring (Tutors occupation 1.37%), IT support (Computer User Support 1.90%), graphic design 1.45%.
- What competitors showcase (they have conversion data): Perplexity's official example is **"compare
  contractor proposals on price/timeline/materials for a kitchen remodel"**; Thumbtack's Operator
  examples: "book an emergency plumber to fix a leak", "top-rated house cleaner this weekend".

### Synthesis
"AI usage" and "local-services demand" barely overlap today; the brand anchor must sit at their
intersection: **high-frequency, universally familiar procurement moments that assistants are starting
to route** — trades emergencies, health appointments, cleaning/moving, and SMB back-office (bookkeeper/
BAS — AU-specific, AEI-supported). Invented novelty niches demonstrate agnosticism to engineers but
anchor nothing for customers.

## Ranked anchor asks (demand-evidenced, natural phrasing)

1. **Dentist in Adelaide who can see me this week** — unmet-demand evidence + AE's proven winning
   journey (listed supply, won ultraloop 2 blind at 231ms). Flagship hero.
2. **Electrician who can come this week** — #1 AU local search by volume.
3. **Plumber for a leaking hot water system** — shortage-driven, emergency-familiar (Thumbtack's own
   showcase shape).
4. **End-of-lease clean for a 2-bedroom unit** — cleaners #11, renter-universal, AU idiom.
5. **Bookkeeper to sort my BAS before the quarter** — SMB back-office, AEI-supported, AU-specific.
6. **Compare quotes for a kitchen renovation** — Perplexity's conversion-tested comparison shape.
7. Tutor for Year 10 maths (education 16% of AU usage; Tutors 1.37%).
8. Removalist for a move next month.
9. NDIS / aged-care home support provider (procurement-shaped, category familiar; no volume claim —
   unsourced rank, flagged by WebDemandScout).
10. Mechanic to service the car before a road trip (JSA trade shortage supports broadly).

Rule going forward: example asks on public surfaces must trace to demand evidence (search volume, usage
logs, or a competitor's conversion-tested showcase) — never invented for novelty. The "agnostic engine"
story is told by the *spread* of familiar categories (trade, health, cleaning, back-office), not by
exotic ones.

## Correction (founder, 2026-08-01): AE is not local hire

Anchoring on trades/local search ("find an electrician") misreads the product — PROJECT.md: AE is not a
directory or lead marketplace. The unit of value is **work an agent carries to completion through
registered business capabilities** (quote → approval → execution → evidence), not a phone number. The
AEI applied view already pointed here: target text-in/text-out professional services, document
processing, business ops, bookkeeping, compliance; avoid physical sectors (near-zero exposure). The
dentist journey only ever won because a registered quote capability answered it.

### Corrected anchor asks (outcome-phrased, agent-completable, demand-evidenced)

1. **Get my BAS lodged before the quarter** — bookkeeping idx 1.18, business compliance idx 1.39, AU
   over-indexes admin 1.42. Flagship hero ("Get my BAS lodged by Friday.").
2. **Get a logo and flyer designed for my café** — graphic designers 1.45%, promotional writing 4.36%.
3. **Turn 40 invoices into a clean ledger** — document processing/extraction 3.68%, API ratio 3.89
   (the most automation-deployed category in the corpus).
4. **Book a dental check-up in Adelaide this week** — kept, reframed from "find a dentist" to the
   booking outcome; a registered capability answers it today.
5. **Get my website copy rewritten for launch** — content/copywriting 23.5%, the largest usage category.

Rule amended: asks must be demand-evidenced AND completable through registered capabilities (now or in
the funnel) — outcome-phrased ("get X done"), never vendor-search-phrased ("find a Y near me").
