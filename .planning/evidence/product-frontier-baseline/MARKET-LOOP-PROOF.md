# Market-loop proof — Batch 4

Evidence class: `source-local` unless a command below prints a hosted receipt.

## Protected owners

| Surface | Path / ID | Gate |
| --- | --- | --- |
| Study actions | `study.start`, `study.inspect` | frontier manifest + unit characterization |
| Study source | `convex/studies.ts` | journal + inspect/replay |
| Study machine | `src/modules/study/` + `xstate` | no bespoke DAG |
| Product science | `src/modules/external-run/`, `convex/externalRuns.ts` | kill-gate harness |
| Invoke spine | `operation.invoke` + capability-execution | single invocation machine |
| Transport spine | `route-transport-runtime.ts` | single transport |
| Money spine | `convex/moneyLedger.ts` | single ledger |

## Local labelled loop (publish → learn)

Run in order when a development Convex deployment and keys are available:

```bash
npm run seed:dev
npm run evidence:operation:development
npm run evidence:action-invocation:development
npm run smoke:customer-request:development
npm run smoke:work-tree:development
npm run check:product-frontier
```

Expected narrative (development-labelled, not production money):

1. **Publish / admit** — curated or seed publications enter capability-supply.
2. **Distribute** — registry operations search/detail/compare/inspectPlan.
3. **Study compare/recommend** — WorkTree `study` verb + `study.start` journal.
4. **Principal decision** — `workTree.decide` / Customer Request confirm.
5. **Invoke → validate** — operation invoke + evidence packet.
6. **Ledger / evidence readback** — money usage + invocation status.
7. **Demand / learning** — demand.capture and/or Study chronology inspect.

## Hosted north star (Tier C — not silently promoted)

- One Clerk key
- Two real Operations from distinct suppliers
- Durable usage/evidence readback
- Truthful settlement state

If local or hosted proof fails, stop deeper cleanup (Batches 5–6 destructive
work) and return capacity to gateway/settlement remediation.

## 2026-08-15 proof attempt (this cleanup)

| Command | Result | Classification |
| --- | --- | --- |
| `npm run check:product-frontier` | ok | Tier A structural |
| `tests/unit/study/study-golden-path.test.ts` | pass | Study characterization |
| `tests/imports/development-evidence-boundary.test.ts` | pass | Quarantine without move |
| Action-invocation packet run + verify | pass | Labelled local evidence |
| `npm run test:quality:gate` | pass | 131 L1 runnable cases |
| Full E2E | 12 pass; 82 fail; 14 not run | blocked by local Convex refusal |
| Paid-operation E2E | 6 pass; 1 fail | unrelated exact-price UI drift |
| `npm run seed:dev` | refused existing Exa transition | Tier B blocked (state) |
| `npm run smoke:work-tree:development` | `FAIL convex_dev_server_unavailable` | Tier B blocked (env) |
| `npm run smoke:customer-request:development` | `FAIL AE_CUSTOMER_REQUEST_JOURNEY_SIGNING_KEY is required` | Tier B blocked (env) |
| Official operation/mandate/yolo packets | `evidence_checkout_dirty` | blocked by required clean provenance |
| Hosted gateway / Tier C | not attempted | blocked — do not promote |

Deeper destructive retirement remains deferred per
`POST-PROOF-RETIREMENT-DEFERRAL.md`. Capacity returns to gateway/settlement when
hosted proof is the forcing function.

## Characterization committed in-repo

- `tests/unit/study/study-golden-path.test.ts` — Study cannot be hollowed without
  failing the frontier floor and journal/xstate assertions.
- `tests/imports/product-frontier-manifest.test.ts` — positive action/MCP floor.
- `tests/imports/development-evidence-boundary.test.ts` — evidence quarantine.
