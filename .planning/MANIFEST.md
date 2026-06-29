# Planning Manifest

**Repo:** `agentic-economy`
**Created:** 2026-06-27

## Authority files

- `PROJECT.md` — root engineering charter: ICP, problem, source authority, state contracts, module interfaces.
- `ENGINEERING-STANDARDS.md` — implementation constitution: skills/modes, TypeScript, Convex, route, audit, tests, and review proof.
- `SOURCE-MINING.md` — contract for mining `Agentic-Economy-Backup` without copying coupling.
- `SECURITY-SPEC.md` — threat model, admin authority, audit union, redaction, abuse controls, P2-P6 private/provider/payment/business-action security.
- `AI-SPEC.md` — UCP/llms/agent discovery support matrix and eval controls.
- `SEO-AEO-SPEC.md` — public business service catalog page SEO, sitemap, robots, llms, schema, and AI visibility proof.
- `GTM-READINESS.md` — 90-day launch proof, ORB channels, activation, claims register, and P2-P6 support/commercial readiness.
- `FRONTEND-DESIGN-FRAMEWORK.md` — frontend design architecture: tokens, shadcn posture, AE component seams, route class policy, `/taste` + `/impeccable` proof.
- `../DESIGN.md` — machine-readable visual seed for Agentic Economy colors, typography, spacing, radii, and component hints.
- `../.impeccable/design.json` — rich design sidecar for agents/panels: tonal ramps, shadows, motion, breakpoints, and primitive previews.
- `ROADMAP.md` — phase sequence, decision doors, and hard boundaries.
- `phases/01-ten-star-spine-foundation/PHASE.md` — master Phase 1 authority and PR sequence.
- `phases/01-ten-star-spine-foundation/PREMORTEM.md` — Phase 1 failure modes, runtime kill-switches, and repair loops.
- `phases/01-ten-star-spine-foundation/01-UI-SPEC.md` — Phase 1 visual, IA, UX, state, accessibility, and responsive contract.
- `STATE.md` — current phase and active risks.
- `source-mining/phase-1-ledger.md` — concrete Phase 1 backup-source ledger and PR proof.

- `phases/02-05-PRODUCTION-MATURITY-CONTEXT.md` — cross-phase P2-P5 production posture, module seams, and evidence standard.
- `phases/02-05-PRODUCTION-MATURITY-PLAN.md` — P2-P5 production execution framing and shared substrate requirements.
- `phases/02-05-PRODUCTION-MATURITY-REVIEWS.md` — internal GSD fallback review of P2-P5 plan executability; all current findings must be incorporated before P2 execution.
- `phases/02-human-inquiry-owner-inbox/02-01-human-inquiry-owner-inbox-production-PLAN.md` — Phase 2 inquiry/inbox/Resend/Novu execution plan.
- `phases/02-human-inquiry-owner-inbox/02-UI-SPEC.md` — Phase 2 inquiry, owner inbox, Resend/Novu readback, accessibility, responsive, and copy contract.
- `phases/03-standard-agent-builder-discovery/03-01-standard-agent-builder-discovery-production-PLAN.md` — Phase 3 read-only builder/agent discovery execution plan.
- `phases/03-standard-agent-builder-discovery/03-UI-SPEC.md` — Phase 3 read-only builder/agent discovery, support matrix, docs/schema/readback, and copy contract.
- `phases/04-owner-pending-protected-actions/04-01-one-owner-approved-protected-action-PLAN.md` — Phase 4 selected owner-approved action execution plan.
- `phases/04-owner-pending-protected-actions/04-UI-SPEC.md` — Phase 4 one owner-approved protected action, consequence UI, receipt/proof-gap, and copy contract.
- `phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md` — Phase 5 Autumn/Stripe paid activation execution plan.
- `phases/05-paid-activation-money-rails/05-UI-SPEC.md` — Phase 5 Autumn/Stripe paid activation, receipts, reconciliation, responsive, and copy contract.
- `phases/06-agentic-business-action-receipts/06-SPEC.md` — Phase 6 receipt-backed autonomous business operation spec; planning/spike authority only until plan gates pass.
- `phases/06-agentic-business-action-receipts/06-CONTEXT.md` — Phase 6 PRD-express context, decisions, hard cuts, and source references.
- `phases/06-agentic-business-action-receipts/06-DISCUSSION-LOG.md` — Phase 6 hard-question closure from typed subagents and PRD Express Path.
- `phases/06-agentic-business-action-receipts/06-RESEARCH.md` — Phase 6 source-grounded implementation research and verification gates.
- `phases/06-agentic-business-action-receipts/06-PATTERNS.md` — Phase 6 codebase pattern map and drift guardrails.
- `phases/06-agentic-business-action-receipts/06-FABLE-FOUNDATION-REVIEW.md` — adversarial foundation review and resolved plan-phase blockers.
- `phases/06-agentic-business-action-receipts/06-MONEY-EVIDENCE-DECISION.md` — Phase 6 direct Stripe test-mode evidence decision.
- `phases/06-agentic-business-action-receipts/06-CHECK.md` — typed plan-checker findings and split-plan remediation.
- `phases/06-agentic-business-action-receipts/06-01-business-action-domain-verifier-PLAN.md` through `06-06-copy-source-smoke-gates-PLAN.md` — split Phase 6 execution plans.
- `phases/06-agentic-business-action-receipts/06-ENGINEERING-REQUIREMENTS.md` — Phase 6 engineering synthesis and source-grounded implementation constraints.
- `phases/06-agentic-business-action-receipts/06-SOURCE-DOC-GROUNDING.md` — Phase 6 Stripe/Link/NVIDIA/Hermes/source-doc grounding and prohibited rails.

## Supporting context

- `AGENTIC-MARKET-STUDY.md` — research artifact translating Agentic.Market/x402 marketplace patterns into Phase 1 AE service-catalog/read-only registry shape; does not override no-payment/no-callable boundaries.
- `PRODUCT-LENS.md` — review lenses: `/ponytail`, Stripe, Coinbase/protocol, Matt Pocock, security, accessibility.
- `REVIEW-PANEL-SYNTHESIS.md` — findings from the 10-agent review panel and accepted fixes.

## Source mine

- `../Agentic-Economy-Backup` is read-only context.
- Copy concepts, not folders.
- If a future implementation imports backup code, it must name the source file, reduce the code to the fresh module interface, and add tests at the new seam.

## Current phase

Phase 6 planning/spike — Agentic Business Action Receipts.

Phase 6 is admitted only as planning plus hackathon-spike preparation. It may not claim production launch, live money movement, wallet/custody/settlement, generic marketplace, generic action runtime, or provider authority until a verified `06-*-PLAN.md` names passed preflight gates, spike exceptions, commands, files, and stop conditions.
