# Agentic Economy — Brand Position & Messaging Authority

**Status:** LOCKED (founder, 2026-08-08 category rebase). This file owns positioning, messaging, and
voice. Surfaces express this; they do not invent their own. PROJECT.md owns the product; this owns how
it is said. Brand-core strings live in `src/content/brand-copy.ts`; the surface register is
`.planning/COPY-MAP.md`. Change here first, then express once.

## Position (locked)

**The agent-services market thesis.** Agentic Economy is the market and controlled transaction layer
where authorized agents discover, buy and invoke admitted third-party Market Operations, and suppliers
are paid after contract-valid delivery.

**Roles:** A human or organization is the **Principal**: it owns authority and budget. The agent is
the Principal’s delegated shopper and distribution interface. A **Supplier** hosts the implementation
and publishes an admitted Market Operation; AE owns admission, invocation identity, authority/policy,
evidence, Qualified Use, metering and reconciliation, but does not host supplier runtimes.

**First-party proving ground:** The person-facing execution application is a subordinate demand-side
surface where a Principal experiences authorized agent discovery and invocation. It is useful for
testing trust, evidence and recovery, but it is not the category, ICP, wedge or default product frame.

- **Soul:** the decided path. Overwhelm in; a structured, decided, moving plan out. The market boundary
  is the machinery underneath.
- **The leap we never ask:** the Principal grants authority deliberately; the agent earns broader
  operating scope from inside the plan, one approval at a time.
- **One product, three roles:** Principals own authority and budget; Agent/Runtimes discover, compare,
  buy and invoke; Suppliers host implementations and publish Operations.
- **One brand:** Agentic Economy, across all three doors. Person-side warmth comes from the copy, not
  a sub-brand.
- **Category:** a market and controlled transaction layer for admitted third-party Market Operations,
  not a local-hire marketplace, goods checkout, generic tool/data catalog or directory.
- **Audience order:** Principal → Agent/Runtime → Supplier.
- **Enemy:** the unbounded handoff — a capability exists, but no trusted boundary makes it callable,
  payable and accountable.
- **Promise register:** destination language names the intended market; current proof remains explicit,
  source-owned and tied to a decision point.

**Category guardrail:** Trades, Australian small businesses, BAS and human-service coordination may be
future suppliers/use cases; they are not the category, ICP, wedge or default product frame.

## Voice rules (binding)

1. The demonstration is the headline; no slogan-only posting. Mechanism and named supply over
   adjectives; category thesis demoted to secondary bands.
2. Instances are furniture, never the anchor. The hero names the market boundary; executable example
   asks carry the instances and are swappable in one file without a rebrand.
3. Example asks are familiar, problem-phrased and executable — what a person or runtime actually
   supplies at the wall. No vendor-search phrasing; AE is not local hire, not a directory. Trades,
   Australian-SMB, BAS and human-service examples are not category/default examples.
4. No "work" and no PM vocabulary on person-facing surfaces. Say: the big thing, decisions, done,
   sorted, moving, off your plate.
5. Invite the problem, not the specification. People arrive with a situation; the agent does the
   scoping. Never demand the person name a service category.
6. Destination-promise verbs on the doors describe the intended loop; current proof is stated only
   from source-owned evidence at the decision that needs it.
7. Live counters and named supply only from source-owned truth; no invented numbers.
8. Machine descriptors (`defineAction`, llms.txt, SKILL.md, UCP) are exactness-governed and are never
   restyled in a rebrand — semantic alignment only.

## Person-facing plain-language register (LOCKED 2026-08-08)

The person-facing surfaces (home, chat, welcome, doors, ask box, follow-ups, recovery copy, work trail)
speak to someone who has just arrived with a problem. They must be jargon-free and read like a capable
assistant, not a technical spec. The market/category vocabulary is a *secondary band*, never the
person-facing lead.

Tone anchors (Perplexity-style): the visitor types *what they want done*, the product shows a confident,
calm working trail, then a clear answer. No product nouns a first-time visitor would have to decode.

Plain-language register (person-facing surfaces only — machine descriptors unchanged, rule 8):

- "Market Operation" / "admitted Market Operation" → **the thing they want done** (e.g. "what's going
  on with the prices", "your options", "the businesses that can help").
- "authority" / "your authority" → **you approve / with your approval**. The person grants, never the
  other way round.
- "Principal" → **you** (they do not know they are a Principal).
- "discover, buy and invoke" → their own words: **find, compare, choose**.
- "registry" / "listed businesses" / "browse services" → **the businesses that can help / your options /
  matches**.
- "contract-valid delivery" / "qualified use" / "settlement" → never on person-facing copy; those stay
  machine-facing.
- "AE" as an agent persona → prefer "I"/"we" is neutral **the assistant**; never a product acronym doing
  the talking ("AE will…"). On person surfaces say what *happens*, not who the product is.
- The brand name sits on the shell/hero once; the working trail never repeats it.

Working-trail phrasing: a calm, human sequence of what is actually happening ("Checking what's
available", "Comparing the matches", "Putting together the answer"), with the current step legible. No
jargon step labels ("Searching listed businesses", "Comparing fit", "Preparing the qualified inquiry").

Specific current copy that violates this register and must be rationalised (mirrors `.planning/COPY-MAP.md`
flagged misalignments): the home hero/jargon subhead, `DIALOG_WELCOME` subhead, ask-box label/placeholder/
helper, all "Searching listed businesses…"/"browse services"/"qualified inquiry"/"authority" strings across
the chat, work trail, follow-ups, session journey, and server answer prose.

## Messaging architecture — one story, three doors

Core sentence: *Agentic Economy is the market and controlled transaction layer where authorized agents
discover, buy and invoke admitted third-party Market Operations, and suppliers are paid after
contract-valid delivery.*

| Door | Audience | Message | Surface |
| --- | --- | --- | --- |
| 1 | Principal | **Give your agent authority to move the outcome.** The Principal owns authority and budget; the person-facing application is the proving ground. | `/` hero + ask box + example asks |
| 2 | Agent / Runtime | **Point your runtime here.** Discover, compare, buy and invoke admitted Market Operations through one market boundary. | `/` agent strip → `/for-agents` |
| 3 | Supplier | **Publish one Market Operation.** Host your implementation; expose its contract, price and evidence path to authorized agent demand. | `/` supplier strip → `/claim` |

Secondary (manifesto/investor/press band, never the hero): *Principals own authority. Agents distribute
demand at runtime. Suppliers publish and host implementations. AE controls the market and transaction
boundary.*

Dialog welcome (engine empty state): heading *What do you need done?* — sub *Describe the outcome.
Your agent discovers and invokes an admitted Market Operation within your authority.*

## Example-ask set (executable furniture — swap in `brand-copy.ts`, never a rebrand)

These asks are current executable demand demos, not a definition of the category or proof that the
market is established. Keep the set machine-resolvable and problem-phrased:

1. I need the current price of bitcoin
2. Convert 500 US dollars to euros
3. What’s the weather like in Melbourne right now?
4. Summarise the Wikipedia page on quantum computing
5. Search the web for the latest on electric cars

Trades, Australian small businesses, BAS and human-service coordination may be future suppliers/use
cases; they are not category, ICP, wedge or default examples.

Demand evidence: `.planning/research/2026-08-01-demand-anchor-asks.md` is preserved as historical
provenance, not current category authority.

## Ask box

Parked by founder — label/placeholder/CTA unchanged until the ask-box redesign session.

**OVERRIDE (founder, 2026-08-06): the ask-box park is lifted for the Perplexity-familiar reset.
The new plain ask-box copy (label/placeholder/CTA) lands in `brand-copy.ts`; the ask-box is no
longer parked.**

## Visual identity

**Accent: teal-on-cream (founder, 2026-08-06).** The product moves to a Perplexity-familiar palette:
single teal brand accent (`~#016A71` deep / `~#20B2AA` bright) on a warm-cream canvas
(`~#FDFBFA`), near-black neutral ink. This replaces the amber/eucalyptus earth accent. Expressed
through the `--ae-*` tokens in `src/styles/globals.css`; the `--ae-primary` family and `--ae-brand`
family become teal; the canvas warms toward cream. All surfaces consume semantic tokens, so this is
a token remap, not per-component colour edits. Voice rules are unchanged; only the palette and the
ask-box copy change.

## Provenance trail

The competitive scan and demand research remain historical source material; they do not override this
category authority. Competitive scan: `.planning/research/2026-08-01-competitive-branding-scan.md`
(Monid formula, Thumbtack problem-invitation, OpenAI capability-retreat lesson). Demand research:
`2026-08-01-demand-anchor-asks.md`. Copy register: `.planning/COPY-MAP.md`. Decision history:
`MAP-engine.md` § Decisions.
