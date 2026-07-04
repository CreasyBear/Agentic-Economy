<!-- wayfinder:research -->
# Map the design bible onto Astryx tokens + DESIGN.md

- Type: research
- Status: closed
- Assignee: Main
- Blocked by: 003-lock-design-bible

## Question

How does the brand express through theme-neutral tokens without bespoke systems?
Which overrides are permitted, how do accent + motifs bind, and what is the DESIGN.md
update? Validate a11y.

## Answer

Detail: [`.planning/brand/ASTRYX-TOKEN-MAP.md`](../../brand/ASTRYX-TOKEN-MAP.md) +
[`.planning/brand/DESIGN-UPDATE-DRAFT.md`](../../brand/DESIGN-UPDATE-DRAFT.md) (draft, not applied).

**Mechanism:** override Astryx theme-neutral CSS vars in `src/styles/globals.css`
(`@layer astryx-theme` + `@scope [data-astryx-theme="neutral"]`); `--color-accent:#40614F`.
No shadcn/radix/cva, no bespoke `Ae*`, no new CSS file.

**a11y (AA):** Ink/Bone 14.52:1 PASS · Bone-on-Eucalyptus 6.03:1 PASS · Eucalyptus-on-Bone
6.03:1 PASS · Slate/Bone 5.40:1 PASS. Caveat: Eucalyptus-dust/Bone 2.36:1 and Stone/Bone
1.35:1 FAIL for text → dust/stone are borders/dividers/fills only.

**DESIGN.md changes proposed:** (1) Fusion as current authority; (2) supersede
neutral-default color guidance with the bible palette mapped to Astryx tokens; (3)
Eucalyptus as the only brand accent, status colors functional, Clay imagery-only; (4)
install the four hero objects as visual grammar; (5) keep boundary-honesty + add imagery
guardrails.
