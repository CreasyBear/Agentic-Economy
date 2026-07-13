# J5 · Sequential comparison

**Status:** designed · Wave 4 · Requires J3 and J4 evidence
**Promise:** “I asked three, compared their replies, and decided.”

## Identity

- **Journey ID:** J5
- **Canonical path:** J3 send → sequential episodes 2 and 3 → `/t/:threadId/compare` at ≥2 attributable replies → export → follow up or decide.
- **Object identity:** one thread, distinct one-business episodes and records, one versioned comparison object. No fan-out send.

## Status

- **Current:** designed, not proven end to end.
- **Entry gate:** J3 works for each business; at least two settled, attributable replies share a declared comparison basis.
- **Exit:** customer exports a comparison pack or records a decision without AE ranking or selecting.

## Persona proof

- **Primary:** FacilitiesManager — two vendors, an asserted-identical brief, one head-office artifact, zero Excel.
- **Supporting:** SkepticalShopper and BuilderProcurement.
- **Walkout repaired:** G1 cross-record comparison, G4 carried-brief diff, and G2 controlled export.

## Ship test

A blind FacilitiesManager asks two businesses sequentially with an asserted-identical brief, receives two attributable replies, corrects the comparison basis conversationally, exports one citable pack, and can trace every value to its source record without opening Excel.

## Pages & views

- `pages/compare.md` — full-width canonical comparison projection and export target.
- `pages/thread.md` — compact comparison item and composer-led basis refinement.
- `pages/confirm-and-send.md` — carried-brief assertion and structural episode diff.
- `pages/private-record.md` — source reply and controlled export projection.

## Stage map

1. Start from a completed J3 record.
2. “Message another one” creates a new one-business review; no episode jargon renders (CS11).
3. Review the structural diff and assert the carried brief where applicable.
4. Repeat until two distinct businesses have attributable replies.
5. Open comparison; fail closed if replies lack an honest shared basis.
6. Refine criteria in the thread composer; create a new immutable basis revision.
7. Inspect deterministic compact/full projections, open sources, export, then follow up or decide.

## Kernel dependencies

- **K5:** versioned response schema and commensurability model; null, unknown, and not-asked remain distinct.
- **K6:** canonical brief revisions plus structural cross-episode diff.
- **K3:** redaction-safe, field-selected export projection over the evidence ledger.
- **Projection-model decision:** one `{ comparisonBasis@revision, responseVersions[], cells }` domain object; compact in-thread and full-route projections are deterministic renderers of it. The model may propose criteria and provenance-marked extractions, but never layout, values, fake equivalence, rank, score, or a winner. Prior revisions remain reachable.

## Open items

- Define the versioned response-schema registry and migration fixture.
- Define comparison-basis revision commands and source-link stability.
- Define export field selection, payload preview, redaction, and citation format.
- Prove access inheritance for the citable URL without minting a second grant.

## Hedge & common-sense checklist

- **Pricing ladder:** show an owner-published indicative fact when available (`Callout from $90`, business-attested and dated). If none exists, show reply posture or nothing; never “Business will quote.”
- At the single send decision point only: `Price is confirmed by {business} in their reply`.
- Comparison cells show business-verbatim or AE-extracted provenance. Missing price is `Not addressed in their reply`, not a hedge or invented estimate.
- No hedge stacking; no unknown becomes zero, unavailable, or inferior.
- CS11 holds: UI says “message another one,” never episode/group.

## Re-run gate

Re-run FacilitiesManager, BuilderProcurement, and SkepticalShopper blind walks. Pass only when G1/G2/G4 walkouts are cleared, sources and unknowns remain inspectable, sequential-send boundaries hold, and no persona exports to a spreadsheet to complete the task.
