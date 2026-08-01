# Blind side-by-side comparator (standing check — do not edit mid-round)

Purpose: a like-for-like fight, not an absolute rubric. Each round, after the rubric panel, a separate comparator panel judges AE against live reference products on the same job. The comparator critic captures screenshots of both products, anonymizes them as "Product A" and "Product B" (random assignment, recorded only in the verdict footer), and picks a winner per dimension. No ties allowed.

## Jobs and references

- **Driver job** (like-for-like): "Get my business/service listed so agents and people can find and call it."
  - AE: `/claim` from the origin under test.
  - Reference: https://agentic.market seller/supply entry (and its /validate seller tools if linked).
- **Rider job** (consumer-grade reference): "Find a dental check-up and find out what it costs."
  - AE: `/` from the origin under test.
  - Reference: https://www.airbnb.com search-to-price flow (structure/clarity only — different vertical, same experience grade). Note the vertical difference in the verdict.

## Dimensions (winner per line, no ties)

1. First-glance clarity: do I know what this product does and what to do first?
2. Time-to-first-value: fewest interactions to a concrete price/confirmation of progress.
3. Visual hierarchy and craft: typography, spacing, one dominant action, composure.
4. Trust: honest labels, expectation-setting, no dead ends.
5. Mobile (390px) experience.

## Verdict file format

```
comparator: <agent name>
round: <N>
job: rider|driver
assignment: A=<product>, B=<product>
winners:
- clarity: A|B — <one line why>
- time_to_value: A|B — <one line why>
- craft: A|B — <one line why>
- trust: A|B — <one line why>
- mobile: A|B — <one line why>
overall: A|B
ae_won: <n>/5
```

Write to `eval/consumer/round-<N>/comparator-<job>.md` with screenshots beside it. The loop's informational target: AE wins ≥3/5 on driver and ≥3/5 on rider. Comparator results steer improvement rounds; the goal's hard gate remains the rubric panel.
