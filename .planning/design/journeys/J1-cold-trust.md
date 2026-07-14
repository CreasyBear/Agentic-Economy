# J1 · Cold trust

## Identity

- **ID:** J1
- **Name:** Cold trust
- **Customer story:** “I landed here from Google and believe this page.”

## Status

**persona-cleared** (2026-07-14). Built across Wave 1 commits 7f0159f5..0e6becc1. Gate history: run 1 SeoLander 2/5 (walkouts on missing trust trio + explainer contradiction); run 2 SeoLanderRerun 4/5 (P3 held on GATE-1); clearance run SeoLanderClear **4/4 predicates PASS, 5/5** — "Trust held — both pages expose their limits before asking Ben to act, and neither converts missing evidence into a promise." GATE-1 resolved by founder ruling 2026-07-14 (capability-gated explainer clause). UrgentTradie companion evidence: posture + direct-call visible before request selection (UrgentTradieFinal P2/P4 PASS).

## Persona proof

- **Blind critic:** SeoLander — Ben, Google → listing at 9pm, scored 2★.
- **Walkout:** `Ask this business` plus `Business will quote`, with no phone, reviews, or hours; the page lost to the Google panel he came from (G6).
- **Companion evidence:** UrgentTradie walked when response timing appeared only beside Send (G5).

## Ship test

A fresh, signed-out mobile visitor arriving directly at `/:slug` must, without scrolling past the first screen:

1. find a published phone number, published hours, and published service area, or an explicit `Not listed` for each;
2. explain AE in one capability-honest sentence: `AE sends your request in writing and keeps a record — or call directly.` when a phone is published, otherwise `AE sends your request in writing and keeps a record.`;
3. use the phone action as a peer to `Ask this business`, not a demoted escape;
4. see an attributable reply-posture label before selecting the request path; and
5. return from listing to the same registry query/window/focus when entry came from `/registry`.

## Pages & views

- `pages/listing.md` — §1 identity/first-screen trust facts; §2 capability facts; §3 evidence/reply posture; §6 proof; §7 service boundary; §8 proposal/action.
- `pages/registry.md` — §1 source boundary; §2 editable search summary; §4 result boundary; §5 business cards, including reply posture and direct/detail actions.

## Stage map

- **Stage 3 — Shortlist:** published identity, service area, hours/contact and attributable posture establish fit without implying exhaustive coverage.
- **Stage 4 — Compare:** known facts and unknowns remain separate before a visitor chooses a business.
- **Stage 11 — Decide / handoff:** call directly is a valid link-out success; asking begins a separately governed path.

## Kernel dependencies

- **K7:** attributed, recent reply-rate/latency telemetry; `No reply history yet` when evidence is insufficient.
- **K8:** queryable capability-admission state explaining whether request entry is available.

## Open items

- <!-- gate-1 --> **GATE-1 — RESOLVED (founder ruling 2026-07-14):** option (a) selected. The locked explainer’s `— or call directly.` clause is rendered only when the business has a published phone. Phoneless listings render `AE sends your request in writing and keeps a record.` Persona re-run remains open.
- **G5 — specified, persona re-run open:** response posture is before selection; emergency/direct-call routing still needs the blind journey test.
- **G6 — specified, persona re-run open:** phone/hours/service area and the 10-second explainer are in `listing.md`; third-party proof remains CS6.
- **CS2 — specified, ship proof open:** distance/map is required on registry cards and listings.
- **CS3 — specified, ship proof open:** optional business-attested indicative pricing must render as `Callout from $X`, dated.
- **CS6 — open:** honest Google-review and ABN link-outs are required on listings but are not part of the current page-section evidence cited above.

## Hedge & common-sense checklist

- **Facts before hedges:** PASS in the design: phone, hours, service area, reply evidence and source limits precede the request action.
- **Pricing posture:** show dated `Callout from $X` when published; otherwise show reply posture or nothing. Do not render ambient `Business will quote`.
- **Obvious transitions:** FAIL until CS2/CS6 are complete and Ben can compare the page with his Google context without hunting. Direct call and registry return must remain obvious peers.
- **Hedge budget:** one decision-point boundary may say the business confirms price/timing/availability; no second defensive clause in the same view.

## Re-run gate

Re-run SeoLander from an external-search direct landing, signed out, at mobile width and 9pm. J1 may be marked `persona-cleared` only if Ben finds the trust trio and AE’s purpose within 10 seconds, can call without entering AE, and does not walk out at the former missing-phone/hours/proof point. Include UrgentTradie to verify reply posture and emergency/direct-call routing are visible before request selection.
