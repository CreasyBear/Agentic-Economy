---
name: ae-verification-gates
description: Use to choose and interpret AE verification before yielding implementation or changing package scripts. Build a focused proof loop, preserve evidence levels, and distinguish changed-transition failures from unrelated suite failures.
---

# AE verification

Verification supports a decision about the changed transition. Plans, generated
maps, checklists, issue state, and stored reports are orientation evidence, not
runtime proof.

## Loop

1. State the behavior, failure mode, surface, and evidence class the change must
   prove.
2. Run the narrowest test that exercises the changed transition. Include a
   labelled mock/dev failure or recovery state when the behavior has one.
3. Fix regressions caused by the change. If a broad suite fails elsewhere,
   record the exact command, first failure, and why it is unrelated; continue
   the authorized slice instead of entering an unbounded testing loop.
4. Expand only across boundaries the change actually crosses.
5. Inspect the artifact or readback the claim names. Report what is proven,
   contradicted, and still unproven.

The loop is complete only when every changed boundary has a matching executable
check or a reproducible earliest blocker. Test counts and repeated reruns without
a source change, demonstration, or concrete blocker are not progress.

## Verification ladder

| Changed boundary | Minimum executable check |
|---|---|
| TypeScript/domain transition | affected unit test, then `npm run typecheck` |
| Convex schema/function | affected Convex/schema test, typecheck, then `npm run check:convex-codegen` when configured and authorized |
| HTTP route or module wiring | affected integration test and direct response inspection |
| Module/import ownership | `npm run test:imports` |
| Public or assistant-visible copy | `npm run test:copy` and emitted-output inspection |
| SEO/discovery output | `npm run test:seo` and serialized-output inspection |
| UI structure or state | `npm run test:ui-contract` and the relevant `tests/e2e/` spec |
| Cross-cutting source change | `npm run test:all` after focused checks |
| Release candidate | `npm run test:release:source`, then the separately authorized hosted readback/smokes or `npm run test:release` |

Do not use the full suite as the first diagnostic. A package script proves only
the commands it currently contains; inspect `package.json` before relying on it.

## Evidence classes

- Static inspection proves source shape, not execution.
- Unit/integration tests prove behavior under their declared fixtures.
- Labelled mock or sandbox runs prove that development contract and inputs.
- Local browser tests prove the named local journey.
- Model evals prove performance against the declared evaluation set.
- Hosted readback proves the named deployed revision, surface, identity, and
  inputs.
- Provider fulfilment evidence proves only the observed external attempt.
- Customer research proves only the sampled workflow and value proposition.

No class silently upgrades another. A local or sandbox pass does not establish
deployment, independent supply, real fulfilment, human parity, customer value,
or production safety. An issue or ADR gate can remain externally unproven while
authorized development implementation continues.
