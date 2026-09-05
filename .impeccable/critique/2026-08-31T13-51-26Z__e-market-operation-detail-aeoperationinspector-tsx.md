---
target: C01 Operation inspector
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 4
timestamp: 2026-08-31T13-51-26Z
slug: e-market-operation-detail-aeoperationinspector-tsx
---
## Design Health Score

| # | Heuristic | Score | Key issue |
| ---: | --- | ---: | --- |
| 1 | Visibility of system status | 3 | Setup required is visible but repeated without explaining cause or recovery. |
| 2 | Match system / real world | 2 | Buyer-facing decisions are expressed as implementation concepts. |
| 3 | User control and freedom | 2 | The dominant continuation abandons the inspected Operation. |
| 4 | Consistency and standards | 3 | Status, price, evidence, and continuation still behave like separate systems. |
| 5 | Error prevention | 3 | Impossible calls are blocked, but an unusable quote remains visually dominant. |
| 6 | Recognition rather than recall | 2 | Core decision facts are distributed across distant regions. |
| 7 | Flexibility and efficiency | 1 | Compare, save, copy, and expert continuations are absent from the primary console. |
| 8 | Aesthetic and minimalist design | 2 | Sparse, repetitive, and visually unfinished rather than minimal. |
| 9 | Error recovery | 1 | Setup required is a dead-end diagnosis. |
| 10 | Help and documentation | 2 | Contract detail exists, but not at the point of decision. |
| **Total** |  | **21/40** | **Significant work required.** |

## Design Specificity Verdict

Category-interchangeable. Replace Operation with API plan or integration and the composition survives unchanged. The AE marker and display face are decoration, not an expression of the market loop. The interface reads as an internal QA record for an unpublished integration, not a market where an agent can compare, trust, and buy a bounded result.

The deterministic detector returned zero findings, but browser geometry found the defect it misses: at 390px the document is 550px wide, decision regions are 534px, and the primary action is 506px. The mobile inspector is clipped by roughly 171px. Desktop avoids page overflow but repeats status and leaves too much inert space.

## Overall Impression

The implementation is semantically careful and visually wrong. It treats accuracy as the product, but a market must make the decision legible: can this be used, what result will it produce, what proves that claim, what can go wrong, what will it cost, and what happens next?

## Priority Issues

### [P1] One decision is fragmented into competing regions

Status, quote, proof, facts, and continuation must become one market-native console. Current separation forces working-memory reconstruction.

### [P1] Claims have no purchase-grade proof near the decision

The summary promises a result, but result shape, output evidence, freshness, provider credibility, and material limitations are not staged where price is evaluated.

### [P1] Setup required is a dead-end diagnosis

The screen names a state but not its cause, owner, duration, or exact recovery. The only action discards the inspected Operation.

### [P1] Mobile containment is broken

At 390px, core regions and the primary CTA exceed the viewport by roughly 171px. This is a release-blocking responsive defect.

### [P2] Desktop is sparse rather than decisive

The page wastes the first viewport while raw strings such as USD 1.100000 and atomic-unit pricing make the commercial surface feel unfinished.

## Persona Red Flags

- Alex cannot compare or invoke from the primary console and has no expert continuation.
- Sam faces repeated status text, long linear traversal, and a clipped primary control on mobile.
- Casey encounters the abandonment action before the proof and loses the decision summary while scrolling.

## Questions to Consider

- What exact proof would make an agent trust the advertised result enough to authorize payment?
- When setup is missing, should AE preserve the Operation in comparison context instead of restarting discovery?
- Which facts earn the first viewport, and which belong in contract disclosure?
