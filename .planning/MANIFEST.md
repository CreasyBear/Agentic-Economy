# Planning manifest

**Rebaselined:** 2026-07-25. **Gutted:** 2026-08-01 (checkpoint `fe50518d` and after — everything
removed from the tree remains recoverable in git history; nothing deleted is citable authority).

## Authority order

1. `.planning/adr/ADR-032-founder-category-and-ownership.md` — the founder-confirmed category and ownership decision. A later founder ADR may explicitly supersede it; other accepted ADRs remain authoritative only for their bounded architecture.
2. `.planning/VISION-conceptual-map.md` and `.planning/wayfinder/MAP.md` — the active category and destination authorities. `MAP.md` is the active category/destination map.
3. `.planning/PROJECT.md` — the product charter, current-vs-target maturity, and operating boundary.
4. `UBIQUITOUS_LANGUAGE.md` and `.planning/BRAND.md`, with `src/content/brand-copy.ts` and `COPY-MAP.md` — canonical vocabulary, voice, and copy surface.
5. `.planning/research/2026-08-08-agent-services-market-category-thesis.md` — category rationale, evidence ladder, proof boundary and pilot gates; it explains the decision but does not replace founder authority.
6. Remaining accepted ADRs for durable architecture; `ROADMAP.md`, `STATE.md`, and `records/**` — implementation plans and current-state snapshots/records, not category destinations. `REQUIREMENTS.md` preserves completed historical paid-operation mechanics and is not the current V1 plan.
7. `.planning/wayfinder/MAP-framework.md`, `.planning/wayfinder/MAP-engine.md`, `.planning/wayfinder/MAP-vision-gap.md`, `.planning/wayfinder/JOURNEYS.md` and other older maps — historical/mechanics/execution evidence only where still useful. They must not define the current category, ICP, wedge or destination.
8. Live source and executable behavior — authoritative only for behavior actually shipped in the current tree; never for destination, category, or unearned proof claims.

`PRODUCT.md`, `DESIGN.md` (removed 2026-07-25, `ba263c10`) and `AGENTS.md` (archived 2026-08-01)
may not be cited as active authority. Historical references inside ADRs and records are provenance
only. `UBIQUITOUS_LANGUAGE.md` owns domain vocabulary.

## Current corpus (everything that exists in this tree)

- Root authorities: `PROJECT.md`, `VISION-conceptual-map.md`, `BRAND.md`, `COPY-MAP.md`,
  `UBIQUITOUS_LANGUAGE.md`, `DOCTRINE-builder-critic-loop.md`, `ROADMAP.md`, `REQUIREMENTS.md`,
  `STATE.md`, `ENGINEERING-STANDARDS.md`, `AI-SPEC.md`, `ANSWER-AI-CONTRACT.md`, `config.json`;
- Founder category authority: `adr/ADR-032-founder-category-and-ownership.md`; other `adr/**` records
  remain bounded architecture decisions and historical provenance where marked;
- `.planning/wayfinder/MAP.md` — active category/destination map; `MAP-framework.md`, `MAP-engine.md`,
  `MAP-vision-gap.md`, `JOURNEYS.md` and older maps — historical/mechanics/execution records only;
- `research/2026-08-08-agent-services-market-category-thesis.md` — category rationale and proof
  boundary; other research is historical input unless an active authority explicitly cites it;
- `records/**` — living registers (source register, knowledge index, research queue, and snapshots);
- `scopes/**` — completion contracts still referenced by `STATE.md`;
- live source and executable behavior — implementation evidence for shipped behavior only.

## Removed from tree 2026-08-01 (git history holds them)

`archive/**`, `graphs/**` (25MB derived dumps — now gitignored), `phases/**`, `codebase/**`,
`vision/**` (superseded by `VISION-conceptual-map.md`), `audits/**`, `reviews/**`,
pre-engine `research/*` (2026-07-17 → 2026-07-26), `HANDROLLED-VS-SDK-AUDIT.md` (superseded by
the adopt-first rule; any old `MAP-framework.md` citation is historical provenance only).
