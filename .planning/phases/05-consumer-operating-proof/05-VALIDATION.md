---
phase: 05
slug: consumer-decision-support
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-23
---

# Phase 05 — Validation Strategy

> Feedback and evidence contract for public Offering comparison. No result from
> this file upgrades labelled source/demo evidence into customer or market proof.

## Test Infrastructure

| Property | Value |
|---|---|
| **Unit/integration** | Vitest 4.1.9 via `vitest.config.ts` |
| **UI semantics** | Testing Library and jsdom |
| **Browser/e2e** | Playwright 1.61.1 via `playwright.config.ts` |
| **Hosted readback** | `playwright.deploy-smoke.config.ts` plus exact-revision packet generator/verifier |
| **Quick run** | `npm exec -- vitest run <changed focused files>` |
| **Full changed boundary** | Focused unit, integration, copy, SEO, imports, UI contracts, typecheck and build |
| **Feedback target** | Under 30 seconds for the focused task loop |

## Sampling Rate

- After every task commit: run the task's named focused Vitest command.
- After every wave: run that wave's complete focused matrix. Run typecheck
  separately; changed-path errors block. Only the literal inherited failures
  assigned at 05-01 may remain diagnostic before Wave 8.
- Public-copy/SEO wave: run `npm run test:copy` and `npm run test:seo`.
- Wave 8 clean integration gate: run every named focused matrix, copy, SEO,
  imports, one authorized `npm run check:convex-codegen`, mandatory-green full
  typecheck, production build and clean-tree verification.
- After the clean source gate: complete the bounded manual accessibility
  checkpoint against that exact revision.
- Phase gate: deploy that same revision, call both the actual human loader and
  fixed `POST /api/compare`, run hosted smoke and independently verify one frozen packet.

## Per-Wave Verification Map

| Gate / wave | Behavior | Threat ref | Test type | Automated command/artifact | Existing |
|---|---|---|---|---|---|
| Wave 1 / 05-01 | Exact clean Offering custody, cutover refusal and safe v2 predecessor | T-05-01 | unit/integration/schema + custody | `npm exec -- vitest run tests/unit/catalog/offering-*.test.ts tests/unit/registry/offering-*.test.ts tests/unit/schema/convex-schema.test.ts tests/integration/discovery-llms-offering-parity.test.ts`; typecheck green or diagnostic only for literal named inherited owners | Partial WIP: custody missing |
| Wave 2 / 05-02 | Accepted withdrawal policy, exact history and both closed profile versions | T-05-02 | decision + unit/Convex | `npm exec -- vitest run tests/unit/catalog/offering-public-history.test.ts tests/unit/comparison/contract.test.ts tests/unit/comparison/profiles.test.ts` | ❌ |
| Wave 3 / 05-03 | Both profiles round-trip catalog → strict registry codecs/Convex returns → registered actions → three public HTTP adapters | T-05-03 | unit/integration/action | `npm exec -- vitest run tests/unit/actions/registry.test.ts tests/unit/registry/offering-api-projection.test.ts tests/unit/registry/offering-runtime-guards.test.ts tests/integration/registry-api.test.ts tests/integration/registry-offering-parity.test.ts` | ❌ |
| Wave 4 / 05-04 | Answer, Answer Thread and discovery consumers preserve Offering-v2 and literal inventory rejects undeclared consumers | T-05-04 | integration/import/copy | `npm exec -- vitest run tests/integration/answer-tool-calls.test.ts tests/integration/discovery-llms-offering-parity.test.ts tests/integration/registry-offering-parity.test.ts tests/unit/answer/answer-tool-use-agent.test.ts && npm run test:copy && npm run test:imports` | ❌ |
| Wave 5 / 05-05 | Pure comparison plus complete deterministic brief across current/partial/stale/unknown/not-comparable, ties and priorities | T-05-05 | unit | `npm exec -- vitest run tests/unit/comparison/contract.test.ts tests/unit/comparison/profiles.test.ts tests/unit/comparison/resolve.test.ts tests/unit/comparison/compare.test.ts tests/unit/comparison/brief.test.ts` | ❌ |
| Wave 6 / 05-06 | Answer-first public loader/detail/shortlist/compare, bounded presentation fallback, refresh/share and automated accessibility | T-05-06 | unit/UI/e2e/a11y | `npm exec -- vitest run tests/unit/comparison/presentation.test.ts tests/unit/ui/offering-comparison.test.tsx && npm exec -- playwright test tests/e2e/comparison-surface.spec.ts tests/e2e/a11y/comparison.spec.ts` | ❌ |
| Wave 7 / 05-07 | Fixed anonymous POST, actual loader/action parity, inspect-only fence and transfer eval | T-05-07 | integration/import/eval | `npm exec -- vitest run tests/integration/comparison-public-agent-route.test.ts tests/integration/comparison-surface-parity.test.ts tests/imports/comparison-boundaries.test.ts tests/eval/offering-comparison-transfer.test.ts` | ❌ |
| Wave 8 / 05-08 source gate | Clean integrated codegen/typecheck/build and all named focused matrices | T-05-08 | source/build | Full 05-01..07 matrix plus `npm run test:copy`, `npm run test:seo`, `npm run test:imports`, `npm run check:convex-codegen`, `npm run typecheck`, `npm run build`, clean-tree check | ❌ |
| Wave 8 / 05-08 human gate | 320px, 400% zoom, VoiceOver reading order/table headers and focus recovery | T-05-08 | bounded human verification | automated browser specs plus exact-revision manual record | ❌ |
| Wave 8 / 05-08 hosted gate | Exact hosted revision serves labelled data through human loader and `POST /api/compare` | T-05-08 | hosted smoke/packet | `npm exec -- playwright test --config=playwright.deploy-smoke.config.ts tests/deploy-smoke/consumer-comparison-smoke.spec.ts`; generate once, verify independently | ❌ |

## Required RED Falsifiers

1. Correct `offeringRef` with the wrong `businessId` refuses.
2. A synthetic `legacy-offering:*` reference cannot become a durable comparison selection after native cutover.
3. A revision never published is unavailable; a previously public revision remains exact and reports a newer current revision without substitution.
4. Later business suppression makes existing human and agent comparison links unavailable.
5. Unknown, not supplied or stale decisive facts never sort first and block recommendation.
6. Similar labels across profile versions do not become comparable without the same registered dimension, version and unit.
7. No-priority and tie cases remain explicitly unranked.
8. HTTP and `registry.*` action outputs agree on exact Offering revisions and support posture.
9. Comparison has no inquiry, Customer Request, RoutePlan, Action Invocation, mandate, booking, payment, provider transport or effect import.
10. View, shortlist, compare, priority and share interactions create zero mutation, endpoint fetch, inquiry, Request or action-attempt record.
11. Malformed, duplicate or over-capacity URL selections become a bounded ordinary state rather than loader failure.
12. Public/agent outputs cannot expose source hashes, credentials, adapter configuration, private reasons or arbitrary stored fields.
13. Both closed profile payloads survive catalog → registry HTTP → registered action without loss or reinterpretation.
14. `POST /api/compare` imports only `comparisonCompareAction`, accepts no caller-selected action ID, returns malformed 400/oversized 413 and ordinary unavailable/unranked 200.
15. External POST and the actual human `/compare` loader deep-agree and both re-resolve suppression/publication with zero effect.
16. Direct posture, decisive differences and all mandatory caveats render before the full comparison; the complete evidence remains keyboard reachable in one disclosure.
17. Missing, invalid, slow, unsafe, disabled or switched-model presentation output cannot delay, reorder, weaken or remove the deterministic answer.
18. Presentation proposals containing free text, component names, URLs, actions, ARIA, unknown/duplicate IDs or the wrong semantic digest fall back without partial application.

## Vertical and Horizontal Evals

**Vertical:** A visitor browses a professional-service Offering, selects two
exact revisions, receives an answer-first unranked posture with decisive
differences and caveats, supplies a current comparable priority, sees an
inspectable order, discloses the full comparison, shares and refreshes the URL,
then sees a changed revision disclosed without historical substitution.
Unknown/stale material keeps the result unranked and the effect ledger remains
empty. The same loop remains complete with presentation composition disabled or
failed.

**Horizontal:** The same resolver, comparator, human route and agent action
compare two machine/data Offerings. Only the closed profile projector changes.
A cross-profile comparison shows common envelope facts and marks profile-only
rows not comparable without a host branch.

Use at least four labelled demo Offerings, two per category. This is demo
coverage, not a supply or demand claim.

## Wave 0 Requirements

- [ ] Freeze and integrate the inherited Offering lane with exact commit/tree and custody.
- [ ] Decide and implement historical-public revision eligibility through an accepted ADR amendment or new ADR.
- [ ] Add strict v2 stored-snapshot and Convex return codecs.
- [ ] Add `tests/unit/comparison/contract.test.ts`, `profiles.test.ts`, `compare.test.ts`, `brief.test.ts`, `presentation.test.ts` and `resolve.test.ts`.
- [ ] Add registry/comparison human-agent parity and forbidden-import tests.
- [ ] Add `tests/integration/comparison-public-agent-route.test.ts` for the fixed POST status/auth/schema/no-store/actual-loader contract.
- [ ] Add comparison UI, browser, accessibility and two-category transfer evals.
- [ ] Add hosted smoke and exact-revision evidence generator/verifier.

## Manual-Only Verifications

| Behavior | Why manual | Instructions |
|---|---|---|
| 400% zoom and narrow responsive integrity | Visual relationships need observation beyond DOM assertions | Against the exact clean candidate, inspect all canonical states at 320px and 400% zoom; confirm no hidden facts/actions, overlap, clipping or page-level overflow. |
| VoiceOver answer/disclosure reading order, table headers and focus recovery | Automated checks cannot establish the named interaction behavior in the actual assistive technology | Record browser/OS/VoiceOver versions; verify answer/caveat order and **See full comparison** announcement, then navigate table row/column headers and mobile fact relationships; exercise remove/apply/replace focus recovery. This is bounded observation, not comprehension proof. |
| Exact hosted share/readback | Requires one configured hosted revision | Open the frozen comparison URL from a fresh browser, compare human and agent results, and record served revision plus packet digests. |

## Validation Sign-Off

- [x] Every planned wave has an automated feedback target.
- [x] No three consecutive tasks may lack automated verification.
- [x] Missing tests and hosted tooling are explicit Wave 0 requirements.
- [x] Commands are non-watch-mode.
- [x] `nyquist_compliant: true` records plan-time coverage, not implementation completion.

**Approval:** pending plan-checker and execution

## Claim Ceiling

Maximum closure claim: at one exact hosted revision, AE publicly browsed and
compared exact revisions of labelled professional-service and machine/data demo
Offerings through equivalent human and structured agent semantics, including
honest missing, stale and changed states, with no external effect.

No demand, customer value, supplier quality, independent fulfilment,
willingness to pay, retention, revenue or production-safety claim follows.
