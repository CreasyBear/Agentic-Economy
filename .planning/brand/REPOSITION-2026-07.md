# AE Reposition — Outcome-first, 2026-07-04

Authority for the copy + design-system pass. Supersedes trust-led public messaging
("the honest way", "proof desk", "proof-ledger", "business of record", "Dated facts,
not claims"). Trust becomes **texture** (stamps, receipts, dated notes stay as UI
detail); the **pitch** is the outcome. Grammar modeled on Airtasker / Google Maps /
Thumbtack / Airbnb-host (see local://competitor-messaging.md).

## Non-negotiable rails (unchanged)

- No booking / payment / dispatch / availability / review / rating claims.
- "Verified" only against a named standard. No quality certification ("good",
  "best", "trusted", "vetted" are banned for providers).
- Never promise the business responds or fits — promise the user's action and the
  written record ("send one clear inquiry", "in writing", "you'll have a receipt").
- All rewrites must pass `npm run test:copy` and `npm run test:ui-contract`
  (scans in `src/lib/ui/contract-scans.ts`; phrasings like "submit an inquiry",
  "owner inbox", "message the owner" trip `p2-inquiry-overclaim` — use the shipped
  vocabulary already passing: "Send inquiry", "for owner review").
- No internal words in public copy: proof-ledger, source-owned, manifest, receipt-backed,
  agent-readable, handoff (as jargon), capability, operator.

## Message architecture

**Customer promise:** say what you need once; compare who does it; reach them in writing.
**Business promise:** get found by people ready to ask.

## Unfair advantage (the "why AE" beneath all copy)

Consumer-led site; the wedge (`.planning/vision/2026-07-04-PLATFORM-ANATOMY.md`
§117) carries the business side. AE is NOT another marketplace because:
1. **Built for where customers now ask.** AE pages are built for the AI
   assistants customers already ask — readable, shareable, clear about the next
   step. Business copy: "the page your customers'
   assistants can read" — never "join agentic commerce", never protocol words.
2. **No lead fees. No resold leads.** Inquiries come direct, in writing, and
   claiming is free. This is the anti-hipages/anti-lead-fee angle; use it.
3. **You own the page.** Claim, correct, and set your contact boundary — vs
   platform-owned profiles.
4. **Everything in writing.** One clear ask in, one written record out. Consumer
   angle: no phone tag. Business angle: fewer, clearer inquiries.

Consumer-side unfair advantage: ask in plain language once; compare side by side;
one written inquiry — no directory fog, no phone tag, and your assistant can use
the same page you do.

| Slot | Old (trust-led) | New (outcome-led) |
| --- | --- | --- |
| Brand tagline (nav) | "Proof-ledger handoffs for agentic commerce." | *(none — brand name alone; less is more)* |
| Home H1 | "Find a local business, the honest way." | "Find a local business. Ask once." |
| Home sub | "…Compare the facts each business publishes…" | "Say what you need once. It reaches the business in writing — no phone tag." |
| Prompt placeholder | examples list | Keep examples; placeholder reads like a real ask: "Need a plumber for a hot water system in Marrickville…" |
| Ledger section H2 | "Compare published facts, side by side." | "Compare who does what, side by side." (source notes stay in the table as texture) |
| Spine section H2 | "A record that travels, then returns." | "Know where your ask is, every step." |
| Business section H2 | "Be listed as a business of record." | "Get found by people ready to ask." |
| Business CTA | "List your business" | "List your business — free" |
| Closing H2 | "Start with what is published." | "What do you need done?" + CTA "Find a business" |
| Footer boundary | "Published facts, dated source notes, and inquiry receipts. AE does not book…" | *(deleted — footer carries links only; no disclaimer line)* |
| Boundary micro (hero) | "AE does not book, charge, dispatch, or confirm timing." | Delete. Marketing surfaces carry ZERO caveats. |

**Tone: confident, winning. NO CAVEATS on marketing surfaces (user directive:
"think about the JTBD — no caveats").** Delete every "AE doesn't/does not book,
charge, dispatch…" disclaimer from home, registry, about, help, claim, nav, and
footer. Boundary language survives ONLY where the contract requires it: beside
the inquiry send action, on the inquiry receipt (tested string "AE has not
booked, charged, or confirmed."), in terms/privacy, and in assistant/agent JSON
payloads. Sell the job to be done: need → businesses that do it → reach them in
writing. Rules of thumb: headlines 2–6 words where possible, verb-led;
sub carries the three-beat choreography ("Search. Compare. Send one inquiry.");
kickers like "Proof spine", "Published facts", "Source and
freshness" are deleted or replaced with plain outcome words ("What happens next",
"What they offer", "Updated"). The mono stamps themselves (`business supplied · 12 Jun`,
`last checked · 14 Jun`) STAY — they are the trust texture. The receipt object STAYS
and is called "Your inquiry receipt".

## Per-surface copy direction

- **registry.tsx** — H1 "Who does what, near you." sub "Compare local businesses by
  service, area, and how to reach them." Empty state: "No businesses here yet." /
  "Try a service, business name, or suburb." Owner card: "Own a service business?" /
  "Get found by people ready to ask." CTA "List your business — free". Kill kickers
  "Browse published service pages" / "Published businesses"; counts become
  "{n} businesses". Boundary under search stays one line: "The business confirms
  timing, quote, and availability."
- **AeProviderListingPage** — kicker migrates to the final consumer-name lockup language once `LAUNCH` Phase 0 exits: "Listed on {final consumer name}" or the approved wordmark equivalent from `ARCHITECTURE-2026-07-05.md` §9 row 6. Until the name gate clears, keep the section functional rather than candidate-name-specific. The surrounding section-label rewrites ("Published facts"→"What they offer", etc.) are unaffected. Sections:
  "Published facts"→"What they offer"; "Details the business chose to publish."→
  "Services, area, and hours from {business}."; "Source and freshness"/"Dated facts,
  not claims."→ merge into a small "Last updated" block keeping the mono stamps;
  "Proof spine"/"The handoff stays dated."→"What happens when you reach out" with the
  same 3–4 steps in plain words. Sidebar CTA copy: "Tell {business} about the job.
  The business can reply with timing, quote, and whether they can take the work."
  Keep "Get as agent JSON" (rename to "For your assistant" if trivially safe with tests).
- **$slug.inquiry.tsx** — header "Tell {business} about the job." sub "What you need,
  where, and when. It reaches them in writing." Receipt kicker → "Your inquiry
  receipt". Spine → "What happens next". Boundary lines stay but once per view.
  Delivery-state and clipboard strings keep their exact tested vocabulary.
- **about.tsx** — H1 "Local help, without the runaround." Keep does/does-not lists
  (they're the honest bit) but retitle sections in outcome words: "How it works",
  "What AE does", "What the business decides", "What AE never does". Kill kickers
  "Agent-readable directory" / "Answer shape" / "The offer".
- **help.tsx / terms.tsx / privacy.tsx** — already close; sweep remaining
  "published facts / source cues / record / receipt" phrasing into plain words
  where a human wouldn't say it. Keep legal accuracy.
- **claim.tsx / claim.success.tsx** — owner-facing sales tone: header "Get your
  business found." sub "Publish your services once. People and their assistants
  find you, compare you, and reach you in writing." Field labels stay functional;
  kill "fact/truthful/evidence" framing in helper copy where scans allow.
- **Meta titles/descriptions** — outcome-led: home "Find local businesses | Agentic
  Economy"; registry "Compare local businesses | Agentic Economy"; etc.
- **seo/public-route.ts** — align generated $slug titles/descriptions with the same voice.

## Design system — bottom-up (tokens only, no bespoke components)

All changes land in `src/styles/globals.css` `@layer astryx-theme` overrides +
Tailwind arrangement classes. No new CSS files, no new `Ae*` presentation
components, Astryx primitives only.

1. **Canvas off the cream band.** `--color-background-body` #F6F5F1 (warm) →
   chroma toward eucalyptus, not warmth: `#F5F7F4` (oklch ≈ 0.972 0.005 155).
   `--color-background-muted` `#E9E7DF` → `#E7EBE5`. `--color-border` `#E5E4DD`
   → `#E2E6E0`. Surface `#FEFEFC` → `#FCFDFC`. Warmth now comes from imagery,
   space, rounding — not a beige wash.
2. **Commit the accent.** Keep Eucalyptus `#40614F` as the only accent, but allow
   ONE committed eucalyptus band per page (business-side section or closing CTA:
   `bg-accent` surface, `--color-on-accent` text). Everywhere else stays restrained.
   Add `--color-accent-strong: #35523F` for hover/pressed on accent surfaces.
3. **Type scale commits.** Hero clamp up to `clamp(2.5rem, 6vw, 4.25rem)`,
   letter-spacing −0.02em (floor −0.03em), `text-wrap: balance` on h1–h3. Section
   H2s one full step down (~2rem–2.5rem), body 1rem/1.6. Kill the flat 2xl/3xl
   sameness across sections — vary scale for rhythm.
4. **Motion fix.** Content must be visible by default; IntersectionObserver reveals
   are enhancement-only (start visible, animate transform/opacity from a
   `motion-safe` class that does not gate visibility). Fix `ProofSpineSection`'s
   `opacity-0` gating on the home page.
5. **Fewer cards.** Cards only where they are the affordance (receipt, listing,
   ledger). Sections breathe on the canvas with rules/space instead of Card wrappers
   (home hero prompt keeps its Card; "for businesses" example keeps its Card).
6. Shadows/radius stay as defined in DESIGN.md §2a.

## Done means

- `npm run test:copy`, `npm run test:ui-contract`, `npm run typecheck` pass.
- No public surface says: proof-ledger, business of record, the honest way,
  proof desk, "Dated facts, not claims", "Published facts" (as a heading).
- Home hero headline ≤ 8 words, outcome-led, no trust word in it.
