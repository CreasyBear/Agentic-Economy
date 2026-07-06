# AE BRAND MEASUREMENT — 2026-07-05

Adapted from the `brand-measurement` playbook (`~/.omp/agent/skills/brand-measurement/SKILL.md`)
for the actual conditions of this brand: pre-launch, zero marketing budget, one
founder, no customer base large enough for a panel or a survey to mean anything
yet. Where the playbook assumes a marketing team, a research budget, and
quarterly stakeholder reporting, this document replaces that apparatus with
proxies that cost nothing, take minutes, and are truthful about what a
pre-revenue brand can actually know about itself.

**Read first:** `BONES-2026-07-04.md` (north star, enemy, voice posture),
`GUIDELINES-2026-07-05.md` (consolidated standards), `VOICE-2026-07-05.md`
(register matrix — this document is written in the internal-ops register the
sibling planning docs use, not campaign register), `LAUNCH-2026-07-05.md`
(the rollout plan this measurement system reports against — Phase 3 of that
plan is a subset of what follows here), `POSITIONING-2026-07-05.md` (the
category-ownership thesis and the competitive map this system watches),
`COMPETITOR-BRAND-SCAN-2026-07-04.md` (the ten-player scan set used below).

**Hard rules carried from those authorities, restated because they bind this
document too:**
- Never let a measurement finding soften the brand. A weak number is a
  distribution problem or a sequencing problem to fix forward — never a
  reason to hedge the north star, add caveats, or dilute the voice.
- Never fabricate a reading. If a metric has no data yet (no domain, no
  handles, no final consumer name in public), the honest entry is "not yet
  applicable," not an invented number and not a skipped row.
- The consumer name is not ratified yet. Measurement activates after the
  Phase 0 screen and founder go/no-go line in `LAUNCH-2026-07-05.md`; a low
  awareness number is never, by itself, a trigger to rename — see §9.
- No formatters, no full test suites in service of this document.

---

## 1. Measurement philosophy

Three questions this system exists to answer, in order of how much a
pre-launch founder actually needs to know:

1. **Is anyone starting to know this by name, unprompted, before distribution
   spend exists to force it?** (the category-ownership race named in
   `POSITIONING-2026-07-05.md` §02 — Google, Perplexity, and OpenAI are
   commoditizing the capability in parallel; the brand's only real lead is
   whether the *name and enemy* are sticking before they attach one.)
2. **Is the rename (AE → final consumer name) helping or hurting the one real
   conversion event the product already has** (a qualified inquiry sent in writing)?
3. **Is the brand staying disciplined** — no banned words, no caveat drumbeat,
   no destination language leaking onto product surfaces as a live claim —
   as copy keeps changing hands between the founder and agents?

A brand tracker built for an established company (unaided-awareness surveys,
NPS panels, a quarterly brand-equity scorecard) answers none of these
questions faster or cheaper than the proxies below, and most of them require
either a research budget or a customer base this stage doesn't have. See §10
for the full list of what's deliberately not being built yet.

### North star: the Category Claim Signal (CCS)

**Definition:** the weekly count of *unprompted* instances — by a person or
an AI assistant — where the final consumer name, "Agentic Economy," "the
halfway," or "the action layer of the agentic economy" is used to name this
brand or its territory, without AE having supplied that exact term in that
interaction first.

**Why this is the north star at this stage, not inquiry volume or a survey
score:** inquiry volume is a *product* metric the team already tracks from
Convex data for its own reasons (conversion, activation); it stays a
cross-check here (§9), not the brand's job to own. A brand-equity survey
score needs a panel size this stage doesn't have and would be a fabricated
precision this early. CCS is the one number that is (a) free to collect, (b)
directly tied to the actual bet in `BONES-2026-07-04.md` §2 and
`POSITIONING-2026-07-05.md` §02 — own the category before the capability
commoditizes — and (c) impossible to fake, because "unprompted" is the whole
point.

**Formula (raw sum, unweighted — direction matters more than the composite
number, same principle as the playbook's brand-equity scorecard, §04):**

```
CCS(week) = branded_search_events
          + direct_type_in_sessions
          + organic_social_mentions_or_tags
          + verb_sightings (final-name verb/use forms; for Cinch, "cinched it")
          + assistant_citation_hits (name-level, when the panel runs)
          + independent_phrase_attributions ("the halfway" / "action layer
            of the agentic economy" used by someone else, about AE, unprompted)
```

Each feeder count has its own free/cheap collection method in §3–§6. Track
the trend, not the absolute value — a CCS of 3 rising to 9 over a month means
something at this stage; a single week's number in isolation does not.

---

## 2. Current state baseline (read before collecting anything)

Several assignment proxies are dormant until the thing they measure exists in
public. This is sequencing, not a system gap — resolved forward below, not
paused.

| Precondition | Current state (verified in repo, 2026-07-05) | What this gates |
|---|---|---|
| Live production domain | None. Server fallbacks read `SITE_URL`/`VITE_SITE_URL` and default to `https://ae.example` (`src/modules/inquiries/inquiry.functions.ts`, `owner-claim.functions.ts`, `contact-follow-up.functions.ts`, `removal-dispute.functions.ts`). Final consumer-name domains are Phase 0.2 tasks, not yet registered per `LAUNCH-2026-07-05.md`; for the Cinch candidate, R2 examples include `getcinch`, `trycinch`, `cinchit`, and `cinch.au`, to confirm at registrar. | Google Search Console branded-query data (needs a verified property). Use the Google Trends proxy in §3 until a domain is live. |
| Social handles | None found in the codebase (`src/`) under any name. Claiming them is Phase 2.3, gated on the Phase 0 name clearance and founder ratification. | Social handle growth (§3) is dormant — log "N/A, pending Phase 2.3" rather than zero. |
| Final consumer name in public | No ratified consumer-name string exists in `src/`, `public/`, or shipped copy yet. Phase 0 (TM screen, domain, mark, founder go/no-go) has not exited. | Name-level verb sightings and name-level assistant citations (§5, §6) cannot fire yet — nobody can use a word that isn't public. Category-level checks (does anyone name *the territory*, not the word) can and should start now — see §6. |
| Analytics instrumentation | PostHog and Sentry are already wired (`src/lib/observability/*`, both client and server) — this is real, already-paid-for infrastructure, not a proposal. Free tier covers this stage's volume. | Direct-traffic and funnel-based metrics in §3–§5 use PostHog now, at zero incremental cost. |
| "How did you hear" capture | No such field exists on the inquiry submission flow (`src/modules/inquiries/route-readbacks.ts` validates only body/contact; no source field). | Not yet instrumented. §5 proposes the one-field addition and names the zero-cost interim proxy until it ships. |

**Sequencing resolutions (forward, not paused):**

1. **Name recall and pronunciation checks** run in two stages. Stage 1 (now,
   pre-Phase-0-exit): baseline recall of "Agentic Economy" / "AE" — the
   currently shipped name — so there is a real *before* number when the final
   consumer name ships, honoring the spirit of `LAUNCH-2026-07-05.md` 3.1's
   before/after framing even though that task only specifies "after." Stage 2
   (post-Phase 0/1.3 exit): the actual final-name recall/pronunciation check
   the assignment asks for.
2. **Verb sightings and name-level assistant citations** are written into
   this system now (queries pre-drafted, search saved) but stay dormant —
   log "N/A, final name not yet public" — until Phase 0 exits and Phase
   1.3/2.3 put the final name in front of anyone. Building the system before
   it can fire means zero ramp-up cost the week it can.
3. **Category-level assistant citation and phrase share-of-voice checks are
   not gated on anything.** They test whether the *territory* ("agentic
   economy for households," "the halfway," "action layer of the agentic
   economy") is being claimed by anyone else, independent of what the
   consumer name ends up being. These start this week — see §6.

---

## 3. Awareness tier — do people/systems know this exists?

| Metric | Definition | Collection method (free/cheap) | Status | Cadence |
|---|---|---|---|---|
| Branded search interest (pre-domain proxy) | Public search interest in "agentic economy" as a phrase (category-level, not brand-specific yet) | Google Trends (free, no login) — save a query for "agentic economy" filtered to Australia; screenshot or note the interest-over-time trend | Live now | Weekly glance, monthly trend read |
| Branded search volume (post-domain) | Impressions/clicks on queries containing the final consumer name, its obvious lowercase/search variants, or "agentic economy" once a domain is live | Google Search Console (free) — Performance report filtered by query string, once the final consumer-name domain is registered and verified (Phase 0.2/2.5) | N/A until domain live | Weekly once live |
| Direct traffic | Sessions with no referrer and no UTM — the closest free proxy for "someone typed the name in because they already knew it" | PostHog (already wired, `src/lib/observability/posthog.client.ts`) — a saved insight filtering `$referrer` empty/direct, excluding internal navigation | Live now once any traffic exists | Weekly |
| Social handle growth | Follower count trend on whichever platforms Phase 2.3 claims (X/Twitter, LinkedIn, Instagram) | Each platform's own native analytics (free) — a 30-second manual log per platform | N/A, pending Phase 2.3 | Weekly once claimed |
| Category phrase share of voice | See §6 — awareness-relevant but grouped with the other category-ownership KPIs since it is the sharpest leading indicator of the capability-race risk named in `LAUNCH-2026-07-05.md` Phase 0 | — | Live now | Weekly (Alerts digest), monthly (manual search) |

---

## 4. Perception tier — what do people think this is, once they've seen it?

No survey panel exists at this stage and building one (even a "free"
Google Form) would produce a sample too small to mean anything — see §10.
The honest substitute is structured, logged spot checks from conversations
the founder is already having.

| Metric | Definition | Collection method (free/cheap) | Status | Cadence |
|---|---|---|---|---|
| Name pronunciation/recall (Stage 1: AE baseline) | Can someone who has just seen the site say the name back correctly and describe what it does in their own words? | Ask 3–5 people/week the founder is already talking to (business owners in claim-your-page outreach, any early user, a friend shown the site) two questions: "what's this called?" and "what does it do?" — log verbatim answers | Live now (tests current shipped name) | Weekly, tallied monthly |
| Name pronunciation/recall (Stage 2: final consumer name) | Same two questions, once the final name is public | Same method | N/A, pending Phase 0/1.3 exit | Weekly once live |
| Open-ended association check | What 3 words would someone use to describe this, unprompted? | Fold into the same conversations above as a third question; log verbatim, don't lead the witness | Live now | Monthly tally against the intended personality words (visionary, kinetic, unflinching, exact, first-mover — `.agents/brand-context.md`) |
| Organic sentiment skim | Positive/neutral/negative tone in any unprompted public mention | Manual read of whatever the Google Alerts digest (§6) and social search (§5) surface — no sentiment-analysis tool needed at this volume | Live now, but volume will be near-zero pre-launch | Weekly (folds into the same 30-minute ritual, §7) |

---

## 5. Usage tier — are people acting like they know the name and the promise?

| Metric | Definition | Collection method (free/cheap) | Status | Cadence |
|---|---|---|---|---|
| Verb usage sightings (final-name forms; for Cinch, "cinched it" / "cinched a plumber") | Organic use of the brand as a verb or action phrase — the sharpest signal the naming bet worked, per `LAUNCH-2026-07-05.md` 3.2 | Manual search: X/Twitter search, LinkedIn search, a plain Google search for the final verb/use forms, plus a grep of inbound inquiry-thread text for the same strings | Dormant pending ratification/public launch | Weekly once public (10 minutes) |
| "How did you hear about us" | Free-text source attribution at the point of highest intent — the inquiry flow | **Proposed instrumentation:** one optional free-text field on the public inquiry form (`src/modules/inquiries/route-readbacks.ts` currently validates only body/contact — this is a one-field schema and UI addition, not a new system). **Interim, zero-build proxy:** ask the same question by reply in the inquiry thread or in any founder conversation with an early user, and log the answer by hand | Not yet instrumented; interim proxy usable immediately | Weekly tally of whatever came in |
| Qualified-inquiry volume (confound check, not a brand metric) | The existing shipped conversion metric — used here only to catch rename friction, per `LAUNCH-2026-07-05.md` 3.3 | Existing Convex inquiry data, no new instrumentation | Live now | Weekly during any Phase 1–2 copy/name change window; otherwise this metric belongs to product, not brand |
| Assistant-citation hits (name-level) | Does ChatGPT, Perplexity, Claude, or Google AI Mode mention the final consumer name by name for a wedge query | Manually prompt each assistant's free consumer tier with the fixed query panel in §6 and log a Y/N per assistant | Dormant pending ratification/public launch, then indexing lag | Monthly once Phase 0/2 exits and enough time has passed for search-augmented assistants to index the live site |

---

## 6. Category-ownership KPIs (the moat-specific checks)

These are the two checks that exist specifically because
`POSITIONING-2026-07-05.md` §02 and `COMPETITOR-BRAND-SCAN-2026-07-04.md`
identify the real risk as a *race*, not an empty room: Google, Perplexity,
and OpenAI are all shipping pieces of the same capability, and the brand's
only lead is the name, the enemy, and the record — not the mechanic. Both
checks run **now**, independent of the final consumer-name gate, because they
test the territory, not the word.

### 6a. Category phrase share of voice

**What it watches:** who, if anyone, is publicly using "agentic economy" (as
more than a generic industry term), "the halfway," or "the action layer of
the agentic economy" to describe this exact territory.

**Collection method (free):**
- A Google Alerts (free) subscription for the exact phrase `"agentic
  economy"`, delivered as a daily or weekly digest.
- A second Alert for `"the halfway"` combined with a local-services or
  AI-agent context (this phrase alone is too generic to alert on by itself;
  scan it manually via a monthly search instead).
- A monthly manual search-operator pass: `"agentic economy" site:twitter.com`,
  `"agentic economy" site:linkedin.com`, `"agentic economy" site:reddit.com`.

**What counts as erosion (log it, don't panic, escalate per §9):** a VC,
competitor, or press outlet using "agentic economy" or "the halfway" to
describe someone else's product, or Google/Perplexity/OpenAI publishing
copy that names the same enemy or the same territory. This is exactly the
capability-race risk named in `LAUNCH-2026-07-05.md` Phase 0 and Phase 2 —
watching for it is this metric's entire purpose.

### 6b. AI-answer presence vs. the competitor scan set

**What it watches:** for a fixed panel of wedge queries, which brand (if
any) each assistant surfaces — tracked against the ten-player set already
scanned in `COMPETITOR-BRAND-SCAN-2026-07-04.md`.

**Fixed query panel (do not rotate — consistency across months is the
point):**
1. "I need a plumber and don't want to call around, what should I use"
2. "AI tool that contacts local businesses for me and gives me a written record"
3. "what happens after ChatGPT gives me a list of local businesses"
4. "agentic economy for households"
5. "AI that acts on my behalf to hire a local service"
6. "how do I compare local business quotes without calling everyone myself"
7. "app that sends one inquiry to a local business and keeps a record for me"

**Assistants checked (all free consumer tiers, zero cost):** ChatGPT,
Perplexity, Claude, Google AI Mode/AI Overviews — the four surfaces named or
implied in the assignment and in the competitor scan.

**Competitor set tracked in the same panel** (from
`COMPETITOR-BRAND-SCAN-2026-07-04.md`, Oneflare dropped from the active set
since it closes 30 June 2026 and is no longer a live comparison):
Airtasker, hipages, ServiceSeeking, Yelp, Thumbtack, Angi — plus whether the
assistant itself claims to do the calling (Perplexity's "Buy with Pro,"
ChatGPT shopping research, Google's "call businesses on your behalf"
feature).

**Collection method:** manually prompt each assistant with each query once a
month, log a simple matrix (query × assistant → which brand, if any, is
named), zero tooling required. ~20 minutes total across 4 assistants × 7
queries.

**Category Presence Score** = (cells where AE / Agentic Economy / final
consumer name is named) ÷ (28 total cells). This will read 0% for a long
stretch pre-launch — that is the honest baseline, not a failure to log around.

---

## 7. Cadence + who/how

**Owners, reusing the `LAUNCH-2026-07-05.md` key:** **F** = founder only
(any go/kill read, any threshold breach decision). **A** = agents (the
mechanical collection: running searches, prompting assistants, pulling
PostHog/Search Console numbers, drafting the weekly log entry for the
founder to review). Delegate the collection; never delegate the read.

### Weekly ritual — 30 minutes, founder-run (or agent-drafted, founder-reviewed)

| Minutes | Task |
|---|---|
| 0–5 | PostHog: check direct-traffic count (§3) and any funnel movement on the inquiry flow. Google Trends glance if pre-domain, Search Console if live. |
| 5–10 | Social handle counts if claimed (§3); skim Google Alerts digest for the week (§6a). |
| 10–15 | Log any verb sightings (§5) and any "how did you hear" answers collected that week. |
| 15–25 | Log any name-recall/pronunciation conversations from the week (§4) — even one or two is worth recording verbatim. |
| 25–30 | Write the week's CCS components into the log (template in §8), flag any threshold in §9 that's been crossed. |

### Monthly ritual — 60–90 minutes, founder-run

- Run the full AI-answer presence panel (§6b) — the 20-minute prompting pass
  plus 15 minutes to log the matrix and compare to last month.
- Tally the month's perception spot-checks (§4) against the intended
  personality words.
- Review the month's CCS trend, not any single week's number.
- Cross-check against the current `LAUNCH-2026-07-05.md` phase — has a gate
  exited that activates a dormant metric (§2)?
- Re-run the Phase 1.6 banned-word/boundary-copy grep sweep even if
  `test:copy`/`test:seo` are passing in CI, per `LAUNCH-2026-07-05.md` 3.4 —
  this is the recurring check that plan explicitly calls for, not a one-time
  launch task.

---

## 8. Weekly log template (copy into a running note each week)

```
Week of: YYYY-MM-DD
LAUNCH phase active: [0 / 1 / 2 / 3]

AWARENESS
- Direct traffic (PostHog):
- Branded search (Trends pre-domain / GSC post-domain):
- Social followers (per platform, or N/A pending 2.3):

PERCEPTION
- Recall spot checks this week (verbatim, n=___):
- 3-word associations (verbatim):
- Organic sentiment observed:

USAGE
- Verb sightings (final-name forms; for Cinch, "cinched it") — dormant/N/A or count + links:
- "How did you hear" answers this week:
- Qualified-inquiry volume (only log if in a rename/copy-change window):

CATEGORY OWNERSHIP
- Google Alerts digest — anything notable:
- Erosion sightings ("agentic economy"/"the halfway" used by someone else):

CCS this week (sum of the above, raw): ___
CCS trend vs. last 4 weeks: [up / flat / down]

Threshold flags (see §9): [none / list them]
```

---

## 9. Decision thresholds tied to LAUNCH gates

| Signal | Threshold | Action | LAUNCH tie-in |
|---|---|---|---|
| Name screen / founder ratification | Cinch returns HIGH risk, or founder chooses the R2 fallback after the screen | Promote Handled or the documented final R2 name before public rollout | `LAUNCH-2026-07-05.md` Phase 0.4 — the name is not public until the recorded go/no-go line exists. No awareness/CCS number below substitutes for that gate. |
| Qualified-inquiry volume | Unexplained drop >15% in the 2 weeks around any name/copy cutover | Pause further final-name rollout (hold nav wordmark/title changes), root-cause before continuing Phase 1.3/2 | `LAUNCH-2026-07-05.md` 3.3 and its "Attribution" risk — log the cause (seasonal, product, or genuinely name-driven) rather than crediting or blaming the rename by default |
| Boundary-copy compliance | Any banned-word/overclaim hit in the monthly grep sweep or a `test:copy`/`test:seo` failure | Same-day fix before the next public asset ships — zero tolerance, this is a hard rule not a trend | `LAUNCH-2026-07-05.md` 1.6, 3.4 |
| Verb sightings | ≥1 organic final-name verb/use sighting outside the founder's own copy, within 6 weeks of Phase 2.3 | Confirms the naming bet — no action needed, just log it as the milestone `LAUNCH-2026-07-05.md`'s exit criteria names explicitly | `LAUNCH-2026-07-05.md` Phase 3 exit criteria |
| Verb sightings | Zero organic sightings by week 6 post-debut, but recall spot checks (§4) are ≥50% correct | Reinforcement problem, not a naming problem — add the one-line bridge under the wordmark that `LAUNCH-2026-07-05.md` Phase 2 risks already names as the mitigation, then re-check at week 10 | `LAUNCH-2026-07-05.md` Phase 2 risk: "Cold-start name recognition" |
| Recall spot checks | <20% correct recall AND zero branded search AND Category Presence Score still 0% by week 10 post-debut | This is a **distribution** problem, escalate to the founder for a GTM decision (more claim-your-page outreach, more manifesto-page linking) — **never** a trigger to soften voice, add caveats, or reconsider the name outside the Phase 0 TM process | Ties to the capability-race risk in `POSITIONING-2026-07-05.md` §02/03 — the fix is speed and distribution, not brand dilution |
| Category phrase share of voice | A competitor or a major AI lab publicly attaches a name/enemy/household framing to the same territory | Escalate immediately to the founder — this is the capability-race window closing that `LAUNCH-2026-07-05.md` Phase 0/2 flags as the reason to collapse the timeline, not a reason to change course | `LAUNCH-2026-07-05.md` Phase 0/2 risks: "Capability-race timing" |
| Category Presence Score | Rising from 0% across consecutive monthly checks | Confirms the category-ownership bet is landing; no threshold action, keep logging the trend | `POSITIONING-2026-07-05.md` §01 opportunity-category thesis |

---

## 10. What NOT to measure yet, and why

- **No unaided/aided awareness survey panel.** The playbook's brand-funnel
  awareness metrics assume a research budget and a sample size; at zero
  traffic and zero customers, even a "free" Google Form would produce a
  sample too small to be anything but noise dressed up as data.
- **No NPS.** Net Promoter Score needs a customer base with enough
  transaction volume for the 0–10 distribution to mean something. This
  product has qualified inquiries, not a purchase loop yet — there's nothing
  to survey a meaningful NPS against.
- **No brand-equity 1–5 scorecard run as a survey.** The playbook's
  Awareness/Differentiation/Relevance/Trust/Preference/Loyalty scorecard
  (§04 of that skill) needs bi-annual survey waves this stage can't run
  honestly. The category-ownership KPIs in §6 are the honest substitute:
  they measure the same underlying question (is this brand differentiated
  and gaining relevance) through free, observable proxies instead of a
  fabricated survey score.
- **No paid social listening (Brandwatch, Mention, etc.).** Google Alerts
  plus manual search-operator queries cover this volume for zero dollars;
  a paid tool buys precision this stage doesn't need yet.
- **No brand-to-CAC/ROI correlation formula.** The playbook's Brand ROI
  Framework (§06 of that skill) needs ad spend and revenue data to
  correlate against. There is no ad spend and no revenue yet — building that
  formula now would be fitting a line to two points.
- **No quarterly cadence.** A quarterly report is the right rhythm for an
  organization reporting up to stakeholders who aren't in the work daily.
  Here the founder is the only stakeholder and the brand is changing weekly
  (Phase 0 through Phase 2 of `LAUNCH-2026-07-05.md` are timeboxed to weeks,
  not quarters) — weekly is the native unit, monthly is the rollup.
- **No dedicated brand-tracking software procurement.** PostHog and Sentry
  are already integrated and already paid for at this scale (free tier);
  Google Trends, Search Console, and Alerts are free; the rest is manual
  search and logged conversation. Buying a brand-tracking SaaS product would
  be solving a team-coordination problem this one-founder operation doesn't
  have.
