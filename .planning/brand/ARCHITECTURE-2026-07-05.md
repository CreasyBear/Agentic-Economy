# AE BRAND ARCHITECTURE — 2026-07-05

Formalizes the two-level name system. Does not create new brand facts — it
resolves *placement* (where each name appears), *system* (how the two names
relate), and *process* (the naming test for anything new). Where this
document and a cited source disagree, read §10 first: either the conflict is
resolved forward here (and the source needs a follow-up edit, listed exactly),
or it is flagged PAUSE for a founder call. Nothing here softens the brand to
resolve a conflict.

**Read in this order before touching a naming decision:**
`BONES-2026-07-04.md` §6 (name architecture, now superseded for the
consumer-name choice by the council rerun) → `GUIDELINES-2026-07-05.md`
§2 (brand architecture) → `VOICE-2026-07-05.md` (register matrix — governs
*tone*, not placement) → `naming/CANDIDATES-R2-2026-07-05.md` (Cinch
recommendation; round-1 compression rejected) → `LAUNCH-2026-07-05.md`
"Name architecture" + Phase 0/1/2 (rollout sequencing, gates) →
`.agents/brand-context.md` (terse always-loaded summary) → this document
(placement + system, the layer those sources don't fully specify).

**Locked facts this document inherits, does not relitigate:**
- Corporate/category frame: **Agentic Economy**. Consumer-facing name:
  **pending founder ratification** after the R2 naming rerun. R2 recommends
  **Cinch**; **Handled** is the fallback if Cinch screens HIGH risk. The
  consumer name is no longer locked by founder history.
  *(COUNCIL-CONVERGENCE §63-84, CANDIDATES-R2 §4, LAUNCH Phase 0)*
- **Until Phase 0 exits, public surfaces default to "Agentic Economy" / "AE."**
  Every final-consumer-name placement rule below is written for the
  post-ratification state and is **gated on Phase 0 exit** per `LAUNCH` — this
  document does not authorize shipping any unratified candidate string early.
  *(GUIDELINES §2, LAUNCH Phase 0 exit criteria)*
- Platform identity: **customer-side product, customer-side brand.** Business
  onboarding ("claim the page your customers' assistants can read") is the
  distribution motion that seeds supply, never the product's identity frame.
  *(LAUNCH Phase 2 GTM note, founder correction 2026-07-05)*
- Action brand, not a trust brand: no certification badges, no defensive
  caveat framing, no fabricated shipped capability. *(BONES §1, GUIDELINES
  Hard Rules)*

---

## 1. The two names, restated precisely

**Agentic Economy** — the corporate and category frame. It is the company,
the entity that ultimately answers for the product, and the noun that claims
the category ("the agentic economy for households") in registers where a
formal, stable, search-legible identity matters more than a warm one. It
never verbs, never appears in a speech bubble the household is meant to feel
affection for, and never changes on a naming whim — it is built to outlive
any single consumer-brand bet.

**Final consumer name** — the thing a household says. It fronts the product,
social handles, wordmark, campaign copy, and any earned verb form. The R2
recommendation is **Cinch** because it lives in the master-promise register
("it's a cinch" / "cinched it") without asking the household to decode the
corporate category. If founder ratifies a different R2 name, this layer takes
that name instead; the placement rules below do not depend on the literal word.

The relationship is deliberate, not incidental: the consumer name is not a
"codename" for Agentic Economy and Agentic Economy is not a "holding company"
indifferent to the product. They are two faces of one claim, aimed at two
different readers (the household vs. the ledger/legal/search-engine reader).

---

## 2. Architecture model — decision

Evaluated against the four standard models (`brand-architecture` playbook §
"The Four Architecture Models"):

| Model | Why not (or why) |
| --- | --- |
| **Branded House** (final consumer name as master, features named "Cinch X" if Cinch is ratified) | **Rejected.** This model exists to solve a *multi-product portfolio* naming problem. AE has one product. `GUIDELINES` §"feature naming" (via `BONES` action-brand posture) already bans sub-brand feature names outright — "the record, the receipt, the page," never "Cinch Record™." A Branded House would immediately manufacture the sub-brand sprawl the brand explicitly refuses. |
| **House of Brands** (final consumer name and Agentic Economy fully independent, parent invisible) | **Rejected, but closest in daily practice.** A pure House of Brands hides the parent everywhere (P&G doesn't put "a Procter & Gamble company" on a Tide bottle). AE needs the opposite in specific spots: the corporate name must stay traceable at legal/accountability touchpoints (terms, footer, receipts-adjacent legal context) precisely because the consumer name will be cold-start and not the legal company — regulators, skeptical households, and agents reading `llms.txt` need a real, findable operator behind the friendly name. |
| **Endorsed Brand** (visible co-branding, e.g. "Cinch, an Agentic Economy company" if Cinch is ratified, shown routinely in-product) | **Rejected as commonly practiced.** A persistent visible endorsement is a lockup, and a lockup that pairs a friendly name with a formal parent name to signal legitimacy *is* a trust badge by another shape — exactly the certification posture `BONES` §7 and `MARK-BRIEF` §3 kill (badges, crests, "protected by" framing). See the `AeProtectedByAe` component finding in §10 — that exact pattern already exists in the repo and is now a named anti-pattern. |
| **Hybrid** | Not needed — AE's whole portfolio is two names serving two readers, not a multi-brand estate needing per-branch rules. |

### Decision: **Endorsed Brand, textual-only (minimal variant)**

The final consumer name operates with full **House-of-Brands-level
independence** on every surface a household, an assistant, or a search result
sees: hero, nav, social, verb, receipts, agent self-description. **Agentic
Economy** retains a **textual-only endorsement** — never a shared visual lockup,
never a badge, never a "by" graphic — at a short, fixed list of accountability
touchpoints: legal pages, footer copyright, the meta `<title>` suffix,
package/repo identity, and specific professional-audience contexts (§4).

**Why this is the right model, not a compromise:** it gives the final consumer
name everything an action brand needs (a single, ownable, verbable name with
zero "corporate" drag on it) while keeping the one thing a cold-start consumer
brand structurally lacks — a traceable, accountable operator — available
exactly where a skeptical reader (a regulator, a wary household reading the
small print, an AI crawler deciding whether to trust a discovery file) would
go looking for it. It also match-fits the moat `.agents/brand-context.md`
already claims: the receipt/evidence plumbing is real trust infrastructure;
this architecture lets that plumbing carry the "who is actually accountable
here" signal instead of a badge doing it.

---

## 3. Where each name appears

Every row states the **rule**, the **rationale**, and the **current-state
evidence** (file/line where verified 2026-07-05). "Gated" = do not ship until
`LAUNCH` Phase 0 exits (AU trademark screen clear + domain registered +
Slipstream mark commissioned).

### 3a. Legal & corporate-frame surfaces — **Agentic Economy**

| Surface | Rule | Rationale | Current state |
| --- | --- | --- | --- |
| Legal entity name | Agentic Economy (or its future Pty Ltd/Inc. suffix once incorporated) | The accountable party in any dispute, filing, or contract must be the stable name, never the swappable consumer bet. | No entity name exists yet in the repo (`terms.tsx`/`privacy.tsx` bodies have no entity string). Gap — see §10. |
| Terms / Privacy pages | Agentic Economy | *(LAUNCH "Name architecture," GUIDELINES §2)* Locked, not gated on Phase 0 — legal pages read Agentic Economy today and after. | `src/routes/terms.tsx`, `src/routes/privacy.tsx` — no brand-name string currently in body copy; meta description says "Agentic Economy." No change needed. |
| Footer copyright line | Agentic Economy | Same accountability logic as terms/privacy. | **Does not exist yet** — `PublicFooter` in `AePublicShell.tsx:114-132` has nav links (Assistants/Privacy/Terms) but no copyright line at all. Gap — see §10. |
| `package.json` `name` | `agentic-economy` | No code rename, no entity change. *(LAUNCH 1.4, "No package.json rename, no route/module renames.")* | `package.json:2` — already correct, no change. |
| Repo / git remote / module identifiers | Agentic Economy-derived (`agentic-economy`) | Internal chrome, invisible to any user or agent; renaming buys nothing and costs a repo-wide churn. | No change. |
| Meta `<title>` suffix (every route) | `{page title} \| Agentic Economy` | *(LAUNCH 1.4, explicit: "'Agentic Economy' retained in ... the meta `<title>` suffix.")* Functions as a repeating, low-salience piece of browser chrome and a category-ownership SEO anchor in Google's blue-link title — not a brand "moment." See §10 for the LAUNCH-internal tension this resolves. | 44 routes verified carrying `\| Agentic Economy` (e.g. `src/routes/index.tsx:41`, `registry.tsx:74`, `$slug.inquiry.tsx:69`). Root fallback title `src/routes/__root.tsx:22` = bare `'Agentic Economy'`. **No change** — stays as-is through and after Phase 0. |
| `og:title` | Mirrors `<title>` — same suffix | Consistency: a shared link preview's title and the browser tab title should never disagree on which name is "official." | `og:title` currently derives from `seo.title` (`src/routes/t.$threadId.tsx:41`), which already carries the suffix. No change. |
| App-store publisher/developer field (later) | Agentic Economy (or its incorporated form) | Store-listing convention: the *app* is the final consumer name, the *publisher of record* is the company (same pattern as Slack/Slack Technologies, Linear/Linear Orbit). | Not yet applicable — no app store presence exists. Rule recorded for when it does. |
| LinkedIn Company Page — legal/registered business name field | Agentic Economy | LinkedIn's backend "legal name" field is a distinct accountability field from the page's display name/handle. | Not yet claimed. Rule recorded ahead of Phase 2 task 2.3. |
| Stripe account / business name on file | Agentic Economy | Payment-processor KYC fields are accountability fields, same category as terms/privacy. | Not probed — Stripe integration is test-mode only today (`stripe-checkout.ts`). |

### 3b. Product & campaign surfaces — **consumer name** (round-2 naming pending)

| Surface | Rule | Rationale | Current state |
| --- | --- | --- | --- |
| Home hero headline/sub | Consumer name, gated on round-2 naming | The single drenched brand moment should read as plain promise-register confidence, not founder swagger. *(BONES §3, GUIDELINES §9 "Home hero", COUNCIL-CONVERGENCE 2026-07-05.)* | Currently no consumer brand name in the H1 itself ("Find a local business. Ask once." — `src/routes/index.tsx:41` for meta title only). No regression; add the final round-2 name where the rewritten hero/tagline names the product. |
| Nav wordmark | Final consumer name | *(LAUNCH 1.3/1.4, gated on round-2 naming.)* First-read identity for every session. | `AePublicShell.tsx:105-109` — `aria-label="Agentic Economy home"`, visible text `"Agentic Economy"`, image `ae-seal.svg`. **Gated migration**: aria-label → final consumer-name home label, text → final consumer name, image → Slipstream lockup once commissioned. |
| `og:site_name` (net-new field) | Final consumer name | The compact site-identity badge shown in social/Slack/iMessage link-preview cards — a high-salience share-context surface, functionally closer to a handle than to a browser-tab suffix. | **Does not exist in code today** — no route sets `og:site_name`. This is a net-new recommendation, not a migration. Add once round-2 naming clears. |
| App display name (later, under the icon) | Final consumer name | What a household taps on a home screen is the product they use, not the operating company. | Not yet applicable. Rule recorded. |
| Social handles (X/Twitter, LinkedIn, Instagram) | Final consumer-name derived handle | *(LAUNCH 2.3, gated on round-2 naming.)* Defensively register Agentic Economy variants too, bio redirecting to the final consumer handle, to prevent squatting — never used as the primary consumer handle. | Nothing claimed yet (LAUNCH 3.1/3.2 measurement tasks assume post-claim state). |
| Email FROM display name (transactional: inquiry notifications, owner alerts, receipts) | `Final Consumer Name <notifications@{primary domain}>` | Matches the domain the recipient sees anyway (mismatched display-name-vs-domain reads as phishing); matches LAUNCH 2.x's decision that business-facing outreach is voiced in the consumer name, not in the corporate register; households and business owners alike should see one consistent sender identity. Legal footer line inside the email body (physical address / "operated by Agentic Economy" for anti-spam compliance) uses the corporate frame, same rule as terms/footer. | `RESEND_FROM` env var is unset in `.env.example:65` (no current value to migrate) — rule applies at first real configuration, not gated on Phase 0 wording (email body copy referencing the product IS gated, since it currently says "Agentic Economy" — see §9). |
| Manifesto / about-story page | Consumer name, gated on round-2 naming | Promise register only: household language, the lived halfway, then "Ask once. It gets sorted." No full-swagger public run; no book/charge/confirm declaration. | Not yet built (LAUNCH 1.5 pending). |
| Error/toast copy | Consumer name only where the copy names the product at all (most Register E copy doesn't) | Consistency with every other household-facing register. | `src/lib/server` toasts don't currently name the brand in the sampled strings (`VOICE §06 Register E` examples are brand-name-free already). Low-priority sweep only. |
| "Verb" surfaces (campaign copy, social, manifesto) | Gated on round-2 naming — do not assume a verb until the final name is ratified | Agentic Economy never verbs; the consumer name may only verb if it earns the mouth-test in the final naming decision. | New copy only; nothing shipped yet. |

### 3c. Machine & agent-facing surfaces — **consumer name leads, Agentic Economy as one nearby operator line**

This bucket needs its own rule because it's neither pure legal chrome nor a
pure "brand moment" — it's the identity string an LLM reads and may repeat
back to the household verbatim. Per `GUIDELINES` §9, agent JSON is
**Register C, functional and machine-facing** — plain and non-jargon, but
that section is silent on *which brand name* goes there. This document
closes that gap.

**Rule: every self-referential string an assistant reads to describe "what
is this data source / what am I talking to" migrates to the final consumer
name, atomically — not piecemeal.** If the answer-agent's system prompt says
"You are the Cinch answer agent" while the tool description a line later still
says "the Agentic Economy catalog," a model can reasonably infer these are two
different systems. That inconsistency is a correctness bug, not a style nit —
see §10.

| Surface | Rule | Current state |
| --- | --- | --- |
| `llms.txt` identity heading | `# {Final Consumer Name}` as the heading; keep one line under it, `Operated by Agentic Economy.`, for the textual-only operator echo (no lockup graphic — this file is plain text, so there is no graphic to make anyway) | `src/modules/discovery/internal/discovery-files.ts:52` — `'# Agentic Economy'`. Gated migration. |
| Answer-agent system prompt self-description | "You are the {Final Consumer Name} answer agent" | `src/modules/answer/internal/answer-llm-prompts.ts:29` — `'You are the Agentic Economy answer agent...'`. Gated migration. |
| Answer-agent follow-up-chip prompt | "You suggest follow-up questions for {Final Consumer Name}." | `answer-llm-prompts.ts:92` — same file. Gated migration. |
| `registry.search` / `registry.detail` tool summaries | "Search/List the {Final Consumer Name} catalog..." | `src/modules/registry/registry.actions.ts:194,219` — `'...Agentic Economy business catalog...'` / `'...Agentic Economy catalog...'`. Gated migration, must ship in the same commit as the system-prompt change above. |
| Boundary/contract lines the assistant speaks in-thread (`boundary-prose.ts`, `follow-up-compact-prose.ts`) | Subject noun becomes the final consumer name (e.g. "Cinch reads and compares published listings. It does not book, charge, or dispatch.") | `src/modules/answer/internal/boundary-prose.ts` (5 strings), `follow-up-compact-prose.ts` (2 strings), `turn-orchestrator.ts:837-839`. These are the highest-volume household-facing boundary strings in the codebase. Gated migration — see the test-suite risk in §10 before touching these. |
| Inquiry receipt object (`$slug.inquiry.tsx`) | "What {Final Consumer Name} sent" / "{Final Consumer Name} has not booked, charged, or confirmed." | `src/routes/$slug.inquiry.tsx:340,344,364,478-479,482` — currently "What AE sent" / "AE has not booked, charged, or confirmed." This is the literal Register D artifact VOICE §06 cites as the model receipt copy; the model stays, the noun migrates. Gated migration. |
| Stripe checkout product line-item name (test-mode today) | "{Final Consumer Name} paid intake endpoint proof" once real, but this is demo/proof-of-concept labeling today, not a live consumer charge | `src/modules/business-action/internal/stripe-checkout.ts:289` — `'Agentic Economy paid intake endpoint proof'`. Low priority — no real household ever sees this yet (test-mode only). Migrate whenever this path goes from proof-of-concept to a real charge, not before. |
| OpenRouter `X-Title` header | No change — internal integration credential, visible only in OpenRouter's own dashboard, never to a household or the answering assistant's output | `llm-follow-up-chips.ts:50`, `answer-tool-use-agent.ts:579` — `'Agentic Economy'`. Internal chrome, not a brand surface. No migration needed. |
| Agent JSON *affordance labels* ("Get as agent JSON", "For your assistant") | No change — already brand-name-free, plain and functional per GUIDELINES §9 | `AeAgentJsonAffordance.tsx:35`, `AeProviderListingPage.tsx:117`, `AeProviderCard.tsx:167`. Correct as shipped. |
| Per-business JSON payload content (`/api/businesses/:slug`) | No brand name inside the payload itself — it's business data (name, service, hours), not platform self-description | Not applicable — confirmed the payload is business-fact-shaped, not identity-shaped. |

---

## 4. Lockup rules

**Default: there is no lockup.** The final consumer name does not carry a
persistent "by Agentic Economy" endorsement anywhere in the product, in
marketing, or on the mark. A shared visual frame pairing a friendly name with
a formal one is a legitimacy badge wearing a different shape — the same
anti-pattern `MARK-BRIEF-2026-07-04.md` §3 already bans (badges, crests,
"protected by" framing). See §10 for the one place this anti-pattern already
exists in shipped code (`AeProtectedByAe`).

Two narrow, **textual-only, never-graphic** exceptions:

1. **Cold-start bridge footnote (time-boxed).** For the first weeks after
   Phase 2 debut, a small plain-text kicker under the wordmark or in the
   manifesto page may connect the final name to the promise once — e.g. if
   Cinch is ratified, *"Cinch — ask once, get it sorted"* or a similar
   "cinched it" bridge — so a first-time visitor parses the name without
   being told twice. This is a *sentence*, never a boxed badge, never
   "Cinch by Agentic Economy" set as a lockup graphic. Retire on the schedule
   LAUNCH already set — do not let this become a permanent co-brand.
2. **Professional-audience decks (investor, partnership, hackathon/competition
   submissions, press one-pagers).** These readers need entity-level context
   a household never does. A plain typographic byline — *"Cinch, by Agentic
   Economy"* or *"Cinch — an Agentic Economy product"* if Cinch is ratified —
   is allowed in this context only: no shared badge/frame graphic, never
   inside the product UI, never on a receipt, never on a marketing page a
   household reads.

Everywhere else: the final consumer name stands alone. Where the corporate
name must appear (§3a), it appears as an independent, unrelated-looking line
of text — never visually paired with the consumer wordmark or mark.

---

## 5. Product & feature naming rules

**Rule: features get plain descriptive names — the record, the receipt, the
page — never sub-brands.** This isn't a style preference; it's downstream of
the architecture decision in §2. A Branded House would want "Cinch Record™"
if Cinch is ratified. An action brand names the object what it plainly is,
because the swagger lives in the exactness of the object, not in a coined
feature name doing marketing work. *(BONES §5 "concrete nouns carry swagger,"
VOICE §03 "if an adjective is doing a verb's job, cut it" — the same logic
bans a proper-noun feature name doing a marketing job.)*

### The naming test (run this before naming anything new)

1. **Is it a noun a household already uses?** If a household would call the
   thing "the receipt" or "the record" unprompted, ship that word undressed.
2. **Would prefixing the final consumer name make it sound proprietary rather
   than plain?** If "Cinch Record" sounds like a product feature and "the
   record" sounds like a fact of the world, drop the prefix — always.
3. **The one-breath test.** Could a household explain it to a friend without
   naming the company first? ("I got a receipt," not "I got a Cinch Receipt.")
   If the company name is load-bearing in the sentence, the feature name is
   doing too much work.
4. **Does it name a mechanism instead of an outcome?** "Smart Match," "the
   Cinch Engine," "AI-powered sorting" — kill on sight. `VOICE` §04 already
   bans the adjacent hollow-hype vocabulary; a coined internal-mechanism brand
   name is the same failure at the feature-naming layer.
5. **Would it ever need its own trademark filing?** If yes, it is a sub-brand
   by definition — kill it. Only two names in this system are registered
   assets: Agentic Economy and the final consumer name.
6. **The receipt test.** If this name appeared on the actual receipt object,
   would it read as a plain fact of what happened, or as a marketing label
   stuck onto the fact? Facts pass; labels fail.

**Worked example, using a real shipped surface:** `AeProviderListingPage.tsx`
already has an internal-facing name for its evidence trail — "proof spine" —
that never ships publicly; the shipped public label is "What happens when you
reach out" (`REPOSITION-2026-07.md`, cited in `GUIDELINES` §9). That's the
naming test working correctly today: the internal engineering name stays
internal, the public name is the plain outcome sentence. Any new feature
should follow that exact split — an internal working name is fine in code
comments and Convex table names; the public name must pass all six checks
above before it ships.

---

## 6. The verb: earned from the final consumer name

- **Only the final consumer name can verb.** Agentic Economy is a static
  corporate/category noun and never inflects — there is no "Agentic
  Economy'd."
- **No assigned verb before ratification and use.** The final name may only
  get a house style after Phase 0 chooses it and the public launch starts
  producing real usage. For the Cinch candidate, the natural forms are already
  idiomatic English: "cinched it" / "cinched a plumber."
- **Register-scoped, exactly like every other completion claim.** A verb used
  to mean *the whole loop closed* ("cinched a plumber — sorted by lunch") is
  **Register A/B campaign language** — trajectory, not a live claim. On a
  product surface, the verb must describe what actually happened today (sent,
  in writing); implying *booked and paid* is not allowed until that ships. This
  is the same register-scoping rule `VOICE-2026-07-05.md` §00 already applies
  to "sorted" and "done" — the verb doesn't get an exemption just because it's
  a verb.
- **Never a possessive-noun construction.** Avoid "{Final Consumer Name}'s
  [feature]" as a substitute for a plain feature name (see §5) — the verb form
  and the naming-test rule protect each other; don't let one leak around the
  other.

---

## 7. Domain map

| Domain posture | Status | Role |
| --- | --- | --- |
| Cinch candidate examples: `getcinch`, `trycinch`, `cinchit`, `cinch.au` (+ AU equivalents where available) | R2 naming doc says confirm at registrar; no live registration fact is claimed here | Candidate launch posture for the recommended R2 name. Choose one canonical primary, register defensive redirects only where cheap, and do not fabricate exact-match ownership. |
| Handled fallback examples | Not probed in this document | If Cinch screens HIGH risk, run the same registrar pass for Handled before any public claim. |
| Corporate/legal domain (e.g. `agentic.economy`, `agenticeconomy.com`) | **Not probed, not registered** | **Gap, not yet resolved by any source doc.** Not urgent pre-launch: the corporate frame lives as *text* on the final-consumer-name-hosted domain (terms/privacy/footer) per §3a; no separate corporate site is needed until a distinct investor/legal presence is required. Recorded here as an open F-owner action, not fabricated as already secured. |

**Canonical-domain rationale (this document's call, not sourced from an
authority — flag for founder confirmation):** pick the domain that best matches
the final name's action posture and is easiest to say aloud. For Cinch,
`cinchit` has the strongest verb read, while `getcinch` / `trycinch` are safer
acquisition-style patterns. The registrar result decides what is real; this
document only records the posture to test.

---

## 8. What happens to "AE"

**Decision: retained as internal/code/dev chrome only. Retired from every
customer-facing and every agent-facing surface — no bare "AE" left for a
household or an external assistant to read, once Phase 0 clears.**

**Why keep it at all, rather than a clean sweep:** "Ae"-prefixed React
component names (`AePublicShell`, `AeProviderCard`, `AeProtectedByAe`, and
roughly 60+ others per the grep in this session) are a pure code-organization
convention, invisible to any user or agent outside the working repo. A
repo-wide component rename buys zero brand value and costs a large,
unnecessary refactor with real regression risk — this fails the naming test
in §5 in reverse: there's no "public" to protect here, so there's no reason
to touch it.

**Specific dispositions:**

| Where "AE" lives today | Disposition | Why |
| --- | --- | --- |
| React component file/export prefix (`Ae*`) | **Keep, unlimited.** | Invisible internal convention. |
| Env var prefix (`AE_SITE_URL`) | **Keep.** | Server-side only, never rendered. |
| Stripe metadata keys (`ae_action_slug`) | **Keep.** | Backend/operator-dashboard-only. |
| Test rule names / comments (`p6-autonomous-money-marketplace-overclaim` prose using "AE" generically) | **Keep, no action.** | Developer-facing test descriptions, never shipped. |
| `AeOperatorSidebar.tsx` heading text `"Agentic Economy"` + `"AE"` monogram badge (`AeOperatorSidebar.tsx:34-37`) | **Migrate the heading text to the final consumer name.** The monogram badge is authenticated-operator chrome (business owners logged into their own admin panel) — acceptable as a temporary placeholder glyph until the Slipstream mark ships, at which point swap the badge for the mark image. Do not leave bare "AE" here past Phase 0 + mark commission. | Business owners are a real, if secondary, audience reading this UI — the same customer-side-brand logic applies, just on a lower-priority timeline than the public nav. |
| Anywhere else a household or an external agent could read "AE" as the product's name (public copy, agent JSON, receipts) | **Retire — see §3c and §9.** | This is the actual boundary the decision protects: no bare "AE" left where it could be mistaken for the brand a household is meant to recognize. |

---

## 9. Migration table — current-state surfaces

Every row is a concrete, `grep`-verified location as of 2026-07-05. "Gate" =
the `LAUNCH` phase this migration is authorized to ship in; **none of these
should ship before Phase 0 exits** except where marked "not gated."

| # | File / Location | Current string | Target | Gate |
| - | --- | --- | --- | --- |
| 1 | `src/routes/__root.tsx:22` | `title: 'Agentic Economy'` | No change | n/a |
| 2 | 44 route files, meta `<title>` suffix (e.g. `index.tsx:41`, `registry.tsx:74`) | `... \| Agentic Economy` | No change (see §3a, §10) | n/a |
| 3 | `src/components/ae/layout/AePublicShell.tsx:105,108` | `aria-label="Agentic Economy home"`, text `"Agentic Economy"`, `ae-seal.svg` | `aria-label="{Final Consumer Name} home"`, text final consumer name, Slipstream lockup | Phase 0→1.3/1.4 |
| 4 | `AePublicShell.tsx:114-132` (`PublicFooter`) | No copyright line exists | **Add** `© {year} Agentic Economy` | Not gated — this is a net-new addition, ship independent of the naming gate |
| 5 | `src/components/ae/artifacts/AeProtectedByAe.tsx` | Boxed `"AE"` monogram + `"Listed on Agentic Economy."` | Drop the boxed-monogram treatment entirely (anti-pattern, see §10); text → `"Listed on {Final Consumer Name}."` as a plain mono stamp, matching the `GUIDELINES` §9 source/freshness-stamp pattern | Phase 0→1 (text); anti-pattern fix not gated, can ship anytime |
| 6 | `src/components/ae/listing/AeProviderListingPage.tsx:56` | `"Listed on Agentic Economy"` | `"Listed on {Final Consumer Name}"` | Phase 0→1 |
| 7 | `src/components/ae/landing/AeRoutingObject.tsx:9` | `aria-label="Agentic Economy routing preview"` | `aria-label="{Final Consumer Name} routing preview"` | Phase 0→1 |
| 8 | `src/components/ae/layout/AeOperatorSidebar.tsx:34-37` | Heading `"Agentic Economy"` + `"AE"` badge | Heading → final consumer name; badge → mark image once commissioned (interim: keep placeholder, see §8) | Phase 0→1 |
| 9 | `src/lib/server/notification-provider.ts:322-323` | `"Open your Agentic Economy owner inbox..."`, `"...tracked in Agentic Economy."` | `"Open your {Final Consumer Name} owner inbox..."`, `"...tracked in {Final Consumer Name}."` | Phase 0→1 |
| 10 | `src/modules/answer-thread/internal/llm-follow-up-chips.ts:50` | `'X-Title': 'Agentic Economy'` | No change (internal integration credential, §3c) | n/a |
| 11 | `src/modules/answer-thread/internal/turn-orchestrator.ts:837-839` | `"...Agentic Economy does not book or take payment..."` (×2) | `"...{Final Consumer Name} does not book or take payment..."` | Phase 0→1, **atomic with #12-15** |
| 12 | `src/modules/answer/internal/answer-llm-prompts.ts:29,72,92,95` | `"You are the Agentic Economy answer agent"`, `"whole Agentic Economy catalog"`, `"follow-up questions for Agentic Economy"`, `"AE boundary/meta questions"` | `"{Final Consumer Name} answer agent"`, `"whole {Final Consumer Name} catalog"`, `"for {Final Consumer Name}"`, `"{Final Consumer Name} boundary/meta questions"` | Phase 0→1, atomic |
| 13 | `src/modules/answer/internal/answer-tool-use-agent.ts:70,579` | `"...inside Agentic Economy boundaries."`, `'X-Title': 'Agentic Economy'` | Line 70 → `"...inside {Final Consumer Name} boundaries."`; line 579 no change (internal credential) | Phase 0→1 (line 70 only) |
| 14 | `src/modules/answer/internal/boundary-prose.ts` (5 strings) | `"Agentic Economy reads and compares..."`, `"Agentic Economy publishes..."`, `"Agentic Economy does not book or take payment..."` (×2), `"Agentic Economy cannot book, charge, or dispatch..."` | Subject noun → final consumer name throughout | Phase 0→1, atomic with #11-13,15 |
| 15 | `src/modules/answer/internal/follow-up-compact-prose.ts:37-38,107,110,114` | Same boundary-line family as #14 | Subject noun → final consumer name | Phase 0→1, atomic |
| 16 | `src/modules/registry/registry.actions.ts:194,219` | `"...Agentic Economy business catalog..."`, `"...Agentic Economy catalog..."` | `"...{Final Consumer Name} business catalog..."`, `"...{Final Consumer Name} catalog..."` | Phase 0→1, atomic with #11-15 (single-model-consistency requirement, §3c) |
| 17 | `src/modules/discovery/internal/discovery-files.ts:52` | `'# Agentic Economy'` (llms.txt heading) | `'# {Final Consumer Name}'` + new line `'Operated by Agentic Economy.'` | Phase 0→1 |
| 18 | `src/modules/billing/internal/projections.ts:122` | `"Active on Agentic Economy."` | `"Active on {Final Consumer Name}."` | Phase 0→1 |
| 19 | `src/modules/business-action/internal/stripe-checkout.ts:289` | `'Agentic Economy paid intake endpoint proof'` | `'{Final Consumer Name} paid intake endpoint proof'` | Low priority — migrate when this path leaves test-mode, not before |
| 20 | `src/routes/$slug.inquiry.tsx:340,344,364,478-479,482` | `"What AE sent"`, `"AE has not booked, charged, or confirmed."` (×2, incl. copy-to-clipboard string) | `"What {Final Consumer Name} sent"`, `"{Final Consumer Name} has not booked, charged, or confirmed."` | Phase 0→1, **read §10 test-suite risk before touching** |
| 21 | `package.json:2` | `"name": "agentic-economy"` | No change | n/a |

---

## 10. Contradictions & gaps found

*Flagged per the assignment's rule: resolved forward where a clean resolution
exists; the exact edit is listed, not made.*

### 10.1 `LAUNCH-2026-07-05.md` tasks 1.2 and 1.4 contradict each other on the meta `<title>` suffix

**The conflict:** Task 1.2 says: *"Update `<title>` in `src/routes/__root.tsx`
... and per-route meta ... to the final-consumer-name-forward pattern once
Phase 0 clears."* Task 1.4 says: *"'Agentic Economy' retained in footer
copyright, terms, privacy, and the meta `<title>` suffix."* Read literally,
1.2 says the title suffix changes to the final consumer name; 1.4 says the
exact same field does not change.

**Resolved forward (this document's ruling, §3a):** the suffix **stays**
`| Agentic Economy` — 1.4 is the more specific, field-level instruction and
wins. 1.2's "consumer-name-forward pattern" is read as applying to the
**pre-suffix page-title text** (e.g. rewording "Find local businesses" into
Register B/C final-name voice copy), not to the suffix itself. Rationale for
resolving this direction rather than the other way: the suffix functions as a
category-ownership SEO anchor in every Google search result (`Agentic Economy`
is the term worth owning in search while the final consumer name is
unrecognized), which is the "resolve forward into category ownership"
instruction this document is bound by.

**Exact edit needed (now reflected in `LAUNCH-2026-07-05.md`):** task 1.2
should refer to per-route meta page-title text (the segment before the `|`)
moving into Register B/C consumer-name-gated copy once Phase 0 clears, while
the `| Agentic Economy` suffix itself does not change.

### 10.2 `REPOSITION-2026-07.md` predates the R2 naming rerun and gives now-stale placement guidance

**The conflict:** `REPOSITION-2026-07.md` (dated 2026-07, before the council
rejected the round-1 compression name and the founder approved the naming rerun)
explicitly instructs: *"AeProviderListingPage — kicker 'Listed on Agentic
Economy' stays"* and *"Meta titles/descriptions — outcome-led: home 'Find local
businesses | Agentic Economy'; registry 'Compare local businesses | Agentic
Economy'; etc."* `GUIDELINES-2026-07-05.md` §9 still cites this file as the
live authority for "per-surface copy direction," so a reader following that
citation today lands on stale guidance for the one line this document changes.

**Resolved forward:** the meta-title guidance in `REPOSITION` is **still
correct** (matches §3a/§10.1's resolution — no change to the suffix). The
"kicker stays" guidance is **superseded** — per §9 row 6, that string migrates
to "Listed on {Final Consumer Name}" once Phase 0 clears.

**Exact edit needed (not made):** In `REPOSITION-2026-07.md`, the
`AeProviderListingPage` line, replace *"kicker 'Listed on Agentic Economy'
stays"* with *"kicker migrates to 'Listed on {Final Consumer Name}' once
`LAUNCH` Phase 0 exits — see `ARCHITECTURE-2026-07-05.md` §9 row 6; the
surrounding section-label rewrites ('Published facts'→'What they offer', etc.)
are unaffected."*

### 10.3 `tests/copy` overclaim regexes must include the final consumer name as the overclaim subject

**The gap (not a doc contradiction — a test-suite enforcement gap this naming
migration creates):** `tests/copy/phase1-banned-copy.test.ts` builds its
overclaim patterns on an explicit subject-noun alternation, e.g.
`(?:AE|Agentic Economy|we|platform|service)\s+(?:charges?|takes?|...)`. Once
shipped copy legitimately contains the final consumer name as the product's
name, a sentence like *"Cinch processes payments for you"* (if Cinch is
ratified) would **not** match this pattern — the final name isn't in the
alternation, and there's no "we"/"platform"/"service" noun in that sentence for
the fallback branches to catch. The banned-copy gate would silently stop
covering the exact subject noun the product will actually use in copy.

**Exact edit needed (not made, and this is code/tests, not a doc — flagged
here because it's a direct, material consequence of this architecture and must
land in the same change window as the migration in §9 rows 11-20):** in
`tests/copy/phase1-banned-copy.test.ts`, every regex alternation currently
listing `AE|Agentic Economy` as candidate subject nouns needs the final
consumer name added once ratified (for Cinch, include `Cinch` and the plausible
lowercase `cinch` where sentence case allows it). Apply the same audit to
`tests/copy/pm05-trust-language-gate.test.ts`,
`scope3-handshake-banned-copy.test.ts`, and `claims-register.test.ts`, all of
which use the same `AE`-literal subject-noun pattern in their fixtures/rules.
**This edit should ship gated with, not after, the copy migration in §9 —
otherwise there is a real window where live copy uses the final consumer name
and the overclaim gate has a blind spot for it.**

### 10.4 `AeProtectedByAe.tsx` is a live, shipped instance of the exact anti-pattern the brand kills

**The finding (not a doc contradiction — a shipped-code anti-pattern this
architecture surfaces):** the component renders a boxed monogram badge
(`"AE"` in a filled rounded-square, `bg-inverted`) next to reassurance text
("Listed on Agentic Economy. The business handles timing, price, and
availability.") directly beside the primary inquiry CTA on every business
listing page (`AeProviderListingPage.tsx:109`). This is structurally a
certification badge — a boxed monogram + a trust reassurance sentence — which
is precisely the shape `MARK-BRIEF-2026-07-04.md` §3 names as an anti-pattern
("badges," and by extension any boxed-glyph legitimacy stamp), and it
hardcodes both the retiring "AE" shorthand and "Agentic Economy" in a
household-facing spot in one component.

**Not resolved here — flagged for a design/eng decision, not a copy swap:**
this needs the boxed-monogram treatment removed, not just the string
updated. §9 row 5 records the target text; the visual restructuring (to a
plain mono stamp matching `GUIDELINES` §9's source/freshness-stamp pattern)
is a design task outside this document's scope.

### 10.5 No footer copyright line exists to carry the "retained in footer copyright" rule

**The gap:** `LAUNCH` and `GUIDELINES` both state "Agentic Economy retained
in footer copyright" as if a footer copyright line already exists. It
doesn't — `PublicFooter` (`AePublicShell.tsx:114-132`) has only nav links
(Assistants/Privacy/Terms), no copyright line at all. Recorded as an addition
in §9 row 4, not gated on the naming migration (it's additive, not a rename).

### 10.6 No corporate-specific domain has been probed or reserved

**The gap:** the assignment's own framing ("agentic.economy or existing
domains as corporate") assumes a decision exists; none of the read sources
probed or registered one. §7 records this as an open F-owner action, not
fabricated as already secured.

---

## 11. Governance

**Decision owner:** founder (single-founder + AI-agents operating model per
`LAUNCH` owner key — **F** = founder, brand-risk and naming calls; **A** =
agents draft/execute against the rules in this document).

**Before naming anything new (feature, surface, integration, handle):** run
the six-point test in §5. If it fails any point, it isn't a new brand
decision to escalate — it's a plain descriptive name waiting to be picked.

**Before adding a new *placement* rule this document doesn't cover:** default
to the model in §2 (final consumer name leads, Agentic Economy is textual-only
and only at accountability touchpoints) rather than inventing a third pattern.
If a genuinely new surface type doesn't fit either bucket in §3, that's a
founder call, not an agent inference — flag it, don't guess.

**Review cadence:** re-open this document at two fixed triggers, not on a
calendar — (1) `LAUNCH` Phase 0 exit (the trademark screen result and founder
ratification are the facts everything here is conditioned on: a HIGH-risk
result promotes the R2 fallback, and every `{Final Consumer Name}` placeholder
in §3b/§3c/§9 needs the same find-replace against the ratified name); (2) any
future second product/surface that would actually test the "one product, no
sub-brands" assumption in §5 — at that point, re-evaluate whether Branded House
has become the right model after all.
