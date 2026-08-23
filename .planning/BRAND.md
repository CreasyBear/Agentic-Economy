# Agentic Economy — Product and Brand Authority

**Status:** LOCKED by founder direction, 2026-08-23. Supersedes the retired
Perplexity/assistant and teal-on-cream system.

## Position

Agentic Economy is the market where agents find, compare, pay for, and call
useful third-party tools through one controlled transaction boundary.

The market is the product. Search, exact Operation inspection, access, calling,
billing, replay, activity, supplier publication, and administration are one
continuous system—not separate demos or architectural stories.

Agentic Economy owns admission, invocation identity, authorization, evidence,
Qualified Use, metering, reconciliation, and recovery. Suppliers host their
implementations. Exact Operations remain the transaction authority.

## Familiar product grammar

Treg at pinned commit `603540f` and live v0.12.0 is the structural donor. We
reuse the familiar category-marketplace grammar, not its source, provider
inventory, name, logo, or claims:

1. Search the catalogue anonymously by capability or job.
2. Browse recognizable categories and capability shelves.
3. Compare exact suppliers on price, readiness, rating, completed use, and
   measured latency where those facts exist.
4. Inspect one exact Operation, its parameters, examples, evidence, and access
   posture.
5. Connect one caller identity and invoke through the existing AE gateway.
6. Read activity, cost, settlement, replay, failure, and recovery in the same
   account workspace.
7. Let suppliers publish and manage Operations through the same system.

## Messaging rules

- Lead with useful tools and literal actions, not category theory.
- Say `Catalog`, `Operation`, `Supplier`, `Price`, `Ready now`, `Calls`,
  `Latency`, `Rating`, `Activity`, `Usage`, `Access`, and `Publish`.
- Explain a mechanism only at the decision where it matters.
- Keep evidence classes distinct. A payment is not delivery; delivery is not
  Qualified Use; admission is not verification.
- Missing evidence is `Unknown` or `Not measured`, never inferred.
- Never fabricate inventory, popularity, ranking, savings, revenue, or live
  activity.
- Do not say `Ask. It gets done.`, `Principal`, `controlled transaction layer`,
  `Market Operation`, or `admitted` in first-viewport consumer copy.
- Machine contracts remain exact. Human copy may be simpler but may not change
  authorization, money, evidence, or execution meaning.

## Voice

Direct, useful, and technically calm. Short sentences. Concrete nouns. A buyer
should always know the next action and what evidence supports a claim.

Good:

- `Find tools your agent can call.`
- `Compare price, readiness, calls, and measured latency.`
- `Inspect the Operation before you connect an agent.`
- `Price is shown before the call.`

Avoid:

- Prestige slogans and abstract economy language.
- Mystical assistant or autonomous-agent theatre.
- Terminal cosplay, crypto ticker language, and “verified” without a named fact.
- Five nouns for the same entity. The product noun is `Operation`; `tool` is the
  familiar browse word.

## Visual identity

The visual system is a compact, neutral tool market:

- Canvas `#f4f4f1`; white data surfaces; near-black `#1a1a1a` ink.
- Ink actions. Blue only for links/information. Green, amber, and red only for
  state and evidence.
- Inter for interface copy, DM Mono for identifiers/data, Geist Pixel for the
  small number of primary display headings.
- 10px controls, 15px cards, pill statuses, hairline dividers, ambient shadows.
- 1080px content rail; comfortable page density and compact data regions.
- The mark is a black inverse `ae` tile with a lowercase mono wordmark.
- Public navigation may float; the authenticated workspace is a restrained
  sidebar and sticky top bar.
- No ornamental serif, teal wash, gradients, glass cards, giant whitespace,
  decorative dashboards, ticker marquees, tilt, shake, or number-roll theatre.

Accessibility remains part of the brand: AA text contrast, visible double focus,
semantic tables/headings, keyboard operation, 44px mobile touch targets, reduced
motion, and explicit loading/empty/error/recovery states.

## Surface hierarchy

- `/`: catalogue entry with literal search, useful category proof, agent setup,
  and supplier listing.
- `/market`: complete native Agentic Economy catalogue.
- `/$slug`: supplier profile over native Operations, not a local-business page.
- `/operations/$operationRef`: exact inspect-and-call page.
- `/for-agents`: one setup path followed by search → inspect → call.
- `/for-providers`: list → configure → test → publish → manage.
- Operator workspace: Overview, Operations, Marketplace, Activity/Usage/Access,
  Team & settings, and role-gated Administration.

Historical brand decisions remain recoverable in git and in
`.planning/reference/pre-treg-ui-theme.md`; they are not current authority.
