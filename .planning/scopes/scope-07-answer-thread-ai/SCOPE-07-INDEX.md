# Scope 07 — Answer/search demand routing (CURRENT INDEX)

**Status:** planning stub for remaining answer/thread work.  
**Historical context:** `.planning/archive/phases/07-answer-thread-ai/`.  
**Boundary:** answer/search routes demand into trusted listings; it is not an open-ended chat product and it performs no booking, payment, dispatch, protected action, or owner/private-data write.

## Current truth

- `07-DECISIONS.md` records the accepted answer/thread product direction.
- `07-01-SUMMARY.md` records the AE read tool loop and Convex deployment proof for that slice.
- `07-02-meilisearch-cloud-convex-retrieval-SUMMARY.md` records local/source retrieval work; rollout needs Meilisearch Cloud env values and normal deployment path.
- Public/agent-facing claims still depend on Scope 1 deployed evidence and issue #36 outside-in audit gate.

## Dependencies before further implementation

| Dependency | Why |
|---|---|
| P1 registry/search/detail truth | Every answer turn must ground provider facts through AE-owned public facts. |
| P2 qualified inquiry if routing to inquiry | Routing into inquiry must preserve the qualified-inquiry trust contract. |
| Issue #36 / ADR-006 deployed agent-experience gate | Agent-facing claims require outside-in proof, not just local answer tests. |
| PM-02 assistant distribution evidence | Do not claim assistant distribution from local tool-loop proof. |
| PM-05 adaptation | Answer artifacts, descriptors, and share copy must avoid public internal vocabulary and overclaims. |
| CSP/connect-src/model-call decision | Streaming/model calls must not silently widen security policy. |
| Evidence retention contract | Each answer must be replay/reconstruction-safe from source-bounded evidence and tool-call records. |

## Required wording patch

ROADMAP/local examples may mention suburbs or service categories as fixtures, but the generic answer/search contract is `location/category/request wording`, not local-services schema. No urgency/jobSuburb/serviceArea/hours/emergency fields enter core inquiry, thread, capability, action, or receipt models without a later decision.

## Remaining slice map

| Slice | Historical source | Status | Current gate |
|---|---|---|---|
| 07-01 AE tool loop | `07-01-SUMMARY.md` | Source/local + Convex deployed slice recorded | Web/Vercel proof separate. |
| 07-02 Meili retrieval | `07-02-...SUMMARY.md` | Local/source complete | Needs Meilisearch env + deployment path for production proof. |
| Thread UI/share/readback | `07-ENGINEERING-PLAN.md` | Not mapped to active scope plan here | Needs PM-05 + evidence retention + deployment proof. |
| Eval/audit gate | `07-DECISIONS.md` + ADR-006 | Not complete | Needs issue #36 deployed gate and answer-specific eval fixtures. |

## Done for this planning stub

No implementation starts from P7 historical phase docs alone. A future P7 execution plan must name source-owned evidence, routes, no-goals, user-visible states, failure/readbacks, repair/runbook, tests, copy checks, bloat cuts, and deployment/readback evidence per ROADMAP.
