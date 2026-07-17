# Action Bundle Case Readout

Status: simulated workflow eval, not field evidence<br>
Date: 2026-07-17<br>
Decision supported: whether AE has a useful action vocabulary for converting neutral engineering into wedge products

## Executive readout

Five simulated workflows were decomposed into 54 actor-owned tasks: a low-risk
event, strata repair, commercial fit-out, routine export consignment, and direct
booking as a negative control.

The strongest repeated gap is not another broad lifecycle. It is a small set of
business-action families between discovery and completion:

| Action family | Human meaning | Observed in | Current interpretation |
|---|---|---:|---|
| `catalog` | Find businesses and inspect what they sell or do | 5/5 | Partly current through registry search and detail |
| `query` | Ask whether a business can meet this exact need | 5/5 | Mixed: target request machinery, but live availability remains absent |
| `quote` | Obtain and compare bounded proposals | 4/5 | Missing as a proved business interaction |
| `commit` | Select, authorize, and obtain provider acceptance | 5/5 | Target authority machinery; external commitment not proved |
| `coordinate` | Track dependencies, owners, access, deadlines, and blockers | 4/5 | Missing as a proved product behavior |
| `inspect` | Request progress, evidence, contradictions, and final state | 4/5 | Target evidence model; external progress is not proved |
| `recover` | Reconcile uncertainty, substitute, cancel, or replan | 3/5 | Target recovery behavior requiring case evidence |

These are endpoint-family hypotheses, not endpoint specifications. They name
economic work a product must support. A later interface may expose them as
actions, resources, events, or multiple endpoints.

## What the cases reveal

The event case is the best first product test because it uses every family and
has comprehensible authority boundaries. The strata case is the most useful
transfer test because access, responsibility, and resident acknowledgement
force human ownership to remain explicit. Fit-out is a strong falsifier because
professional judgment and statutory approval cannot be collapsed into agent
execution. Export adds regulated handoffs and uncertain milestones. Direct
booking correctly rejects most orchestration and hands the customer to the
provider.

Across the 54 tasks, 8 map to AE's current safe surface, 24 map to target
machinery that still requires product and external evidence, 17 are missing as
proved interactions, and 5 remain human or external responsibilities.

No kernel promotion follows from this simulation. Repetition earns an action
candidate for evaluation, not a primitive. Field cases must still prove that the
same inputs, outputs, authority semantics, evidence, and failure behavior survive
across workflows.

## The proposed bundle contract

An AE action bundle should declare:

`goal → required facts and unknowns → ordered or parallel tasks → actor for each
task → business capability required → input and expected output → authority and
evidence boundary → optional branches and fallbacks → completion boundary`

That is the useful lesson from an API bundle, transposed into real economic
coordination. The wedge defines the composition. Registered businesses supply
compatible capabilities. The kernel preserves requests, authority, effects,
evidence, and recovery without learning domain nouns.

## Next eval

Take five recent event cases and encode their incumbent task sequence using this
grammar. Measure which tasks recur, where facts are re-entered, who waits on
whom, and which proposed outputs businesses can actually return. Only then
specify the first event bundle and test whether the same action contracts survive
the strata cases.
