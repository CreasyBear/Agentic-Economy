# Planning manifest

**Rebaselined:** 2026-07-25. **Gutted:** 2026-08-01 (checkpoint `fe50518d` and after — everything
removed from the tree remains recoverable in git history; nothing deleted is citable authority).

## Authority order

1. live source and executable behavior for what exists;
2. accepted ADRs for durable architecture;
3. `.planning/PROJECT.md` for product destination and maturity;
4. `.planning/VISION-conceptual-map.md` — confirmed conceptual model and journey;
5. `.planning/BRAND.md` (LOCKED voice) with `src/content/brand-copy.ts` and `COPY-MAP.md`;
6. `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`;
7. the active wayfinder map: `wayfinder/MAP-framework.md` (program governance, risks, frontier).

`PRODUCT.md`, `DESIGN.md` (removed 2026-07-25, `ba263c10`) and `AGENTS.md` (archived 2026-08-01)
may not be cited as authority. `UBIQUITOUS_LANGUAGE.md` owns domain vocabulary.

## Current corpus (everything that exists in this tree)

- Root authorities: `PROJECT.md`, `VISION-conceptual-map.md`, `BRAND.md`, `COPY-MAP.md`,
  `DOCTRINE-builder-critic-loop.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`,
  `ENGINEERING-STANDARDS.md`, `AI-SPEC.md`, `ANSWER-AI-CONTRACT.md`, `config.json`;
- `adr/**` — accepted/decision provenance (historical `PRODUCT.md`/`DESIGN.md` citations inside
  ADRs are provenance, not live references);
- `wayfinder/**` — maps and tickets: the decision store. `MAP-framework.md` is active;
  `MAP.md` (parity) and `MAP-engine.md` (destination reached) are predecessors;
- `research/**` — engine-era and framework-era inputs only (2026-07-30 onward);
- `records/**` — living registers (source register, knowledge index, research queue);
- `scopes/**` — completion contracts still referenced by `STATE.md`.

## Removed from tree 2026-08-01 (git history holds them)

`archive/**`, `graphs/**` (25MB derived dumps — now gitignored), `phases/**`, `codebase/**`,
`vision/**` (superseded by `VISION-conceptual-map.md`), `audits/**`, `reviews/**`,
pre-engine `research/*` (2026-07-17 → 2026-07-26), `HANDROLLED-VS-SDK-AUDIT.md` (superseded by the
adopt-first rule on `MAP-framework.md`).
