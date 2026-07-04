# Planning Manifest

**Repo:** `agentic-economy`
**Created:** 2026-06-27
**Archive-cut:** 2026-07-04

## Active authority files

- `PROJECT.md` — product/engineering charter: current slice, source authority, state contracts, and module interfaces.
- `ENGINEERING-STANDARDS.md` — implementation constitution: TypeScript, Convex, route, audit, tests, and review proof.
- `ROADMAP.md` — current capability ladder, decision doors, 14-day bootstrap gate, and phase boundaries.
- `STATE.md` — current state, open blockers, active next action, and proof posture.
- `SOURCE-MINING.md` — rules for mining `Agentic-Economy-Backup` without copying old coupling.
- `source-mining/phase-1-ledger.md` — executable Phase 1 source-mining ledger used by `tests/imports/source-mining.test.ts`.
- `SECURITY-SPEC.md` — threat model, admin authority, audit union, redaction, abuse controls, and private/provider/payment/business-action security.
- `AI-SPEC.md` — UCP/llms/agent discovery support matrix and eval controls.
- `ANSWER-AI-CONTRACT.md` — answer/thread synthesis, retrieval/prose/gate pipeline, SSE contract, and LLM posture.
- `SEO-AEO-SPEC.md` — public business service catalog SEO, sitemap, robots, llms, schema, and AI visibility proof.
- `GTM-READINESS.md` — launch proof, activation, claims register, and support/commercial readiness.
- `FRONTEND-DESIGN-FRAMEWORK.md` — frontend design architecture and UI proof posture.
- `REQUIREMENTS.md` — active requirements baseline.
- `../DESIGN.md` — machine-readable visual seed for Agentic Economy colors, typography, spacing, radii, and component hints.
- `../.impeccable/design.json` — rich design sidecar for agents/panels.

## Active decision and gate directories

- `adr/**` — all ADRs stay active, including ADR-003 and the 2026-07-04 strategy-gate ADRs.
- `vision/**` — 2026-07-04 roast and platform anatomy; current strategy authority.
- `scopes/scope-14day-bootstrap-gate/**` — active go/no-go gate before further platform widening.
- `scopes/scope-01-production-landing/**` — open deploy-proof substrate gate.
- `scopes/PREMORTEM-VALIDATION-GATES.md` — validation gate register.
- `scopes/PM-03-launch-wedge-lock.md` — launch wedge lock with wedge-agnostic schema constraints.
- `scopes/PM-05-trust-language-red-team.md` — trust-language gate and copy-risk register.
- `audits/agent-experience/**` — release-gate outside-in agent-experience evidence.
- `codebase/**` — current codebase maps.
- `graphs/**` — graphify graph artifacts consumed by graph-freshness checks.

## Archive

- `archive/INDEX.md` explains the 2026-07-04 archive-cut and maps moved planning sprawl to its preserved location.
- Archived files are retained for provenance, not active authority.
- Active work should cite the files above before citing archived phase plans, old audits, spikes, product-council reviews, or superseded scope drafts.

## Source mine

- `../Agentic-Economy-Backup` is read-only context.
- Copy concepts, not folders.
- If a future implementation imports backup code, it must name the source file, reduce the code to the fresh module interface, and add tests at the new seam.

## Current phase

The current active next action is the 14-day bootstrap gate in `scopes/scope-14day-bootstrap-gate/`.

Phase 6 source/local proof and earlier phase working plans are preserved under `archive/phases/`; they do not override the active gate, ADRs, ROADMAP, STATE, or vision docs.
