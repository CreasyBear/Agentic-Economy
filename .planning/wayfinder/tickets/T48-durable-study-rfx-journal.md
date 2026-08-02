# T48 — Durable Study and RFx journal

Labels: `wayfinder:task`, `tdd:red`, `study`. Parent: [T43](T43-human-agent-framework-parity-spec.md). Source tickets: T28, T29.
Status: landed + verified at the source/local-smoke evidence boundary — durable Study/RFx paths and WorkTree binding are landed in `src/modules/study/study.actions.ts`, `src/modules/study/study.functions.ts`, `src/modules/study/internal/pipeline.ts`, `src/modules/study/internal/rfx-machine.ts`, `convex/studies.ts` and `src/modules/actions/index.ts`; study→propose appears in `output/release/work-tree-smoke.json.log` and the source gate is green in `output/release/final-gate-2.log`; open: hosted/provider/customer evidence remains downstream in T51/T53.

Blocked by: T45; T46 may proceed with a deterministic development Study fixture until this lands.

## Outcome

One WorkTree Study scans admissible supply, qualifies candidates, collects evidence-labelled quotes, scores every criterion, recommends or refuses, and survives replay as a durable journal.

## Public seam

`workTree.apply({ verb: 'study', ... })` followed by `workTree.inspect` Study readback; provider calls remain registered actions.

## Red

`convex/studies.ts` stores Study snapshots/results, while RFx lifecycle events are embedded as an opaque artifact and the WorkTree `study` verb only changes status. No registered Study action composes scan → qualify → quote → recommendation into the WorkTree journal.

## Minimal green

1. Keep the existing Study schema and Convex create/result fencing; add WorkTree ownership and a public action seam.
2. Persist replayable RFx events (`scan_started`, candidate observed/quarantined, quote requested/received/refused/expired, scoring completed, recommended/refused) append-only with operation/digest/revision.
3. Use XState for lifecycle validation; store domain events, not an opaque machine dump.
4. Reuse registry/discovery and registered quote actions; caller-supplied discovery claims are quarantined until source/evidence validation.
5. Store every criterion score and contribution, not only the winner.
6. Enforce quote `observedAt`, `expiresAt`, revision and evidence class; expired/unknown/mock quotes cannot become real-provider success.
7. Completion proposes a bounded WorkTree change with exact fences, then appears in the decision inbox.

## TDD tracer bullets

- study start → durable journal entry and `studying` node;
- three labelled candidates → qualification chronology;
- fresh quotes → per-criterion score readback and recommendation proposal;
- expired quote → refusal/no recommendation;
- provider refusal/timeout → explicit refused/unknown result;
- identical retry → same Study/result; conflicting payload or stale generation → refusal;
- replay events → same public Study state and WorkTree proposal.

## Adopted seams

AI SDK `generateText` + `Output.object`, Zod, XState, existing registry/quote actions, Convex Study/WorkTree stores. The category-generic quote adapter and AE scoring/evidence mapping are sanctioned integration code.

## Acceptance

- No category-specific quote alias in the Study API.
- No fallback model/provider invents a result.
- RFx chronology is queryable and replayable through public readback.
- Evidence class and freshness survive every projection.
- Recommendation cannot bypass the decision inbox.

## End condition

The labelled BAS development cohort completes scan → qualify → quote → score → recommend/refuse and produces one WorkTree decision proposal whose provenance is fully readable.

## Source evidence

`src/modules/study/internal/rfx-machine.ts`; `src/modules/study/internal/pipeline.ts`; `convex/studies.ts`; `src/modules/work-tree/internal/verbs.ts`; registry and sandbox/capability-supply quote actions.
