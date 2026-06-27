# Planning Manifest

**Repo:** `agentic-economy`
**Created:** 2026-06-27

## Authority files

- `PROJECT.md` — root engineering charter: ICP, problem, source authority, state contracts, module interfaces.
- `ENGINEERING-STANDARDS.md` — implementation constitution: skills/modes, TypeScript, Convex, route, audit, test, review gates.
- `SOURCE-MINING.md` — contract for mining `Agentic-Economy-Backup` without copying coupling.
- `SECURITY-SPEC.md` — threat model, admin authority, audit union, redaction, abuse gates.
- `AI-SPEC.md` — UCP/llms/agent discovery support matrix and eval gates.
- `SEO-AEO-SPEC.md` — public business service catalog page SEO, sitemap, robots, llms, schema, AI visibility gates.
- `GTM-READINESS.md` — 90-day launch gates, ORB channels, activation and claims register.
- `ROADMAP.md` — phase sequence, decision doors, and hard boundaries.
- `phases/01-ten-star-spine-foundation/PHASE.md` — master Phase 1 authority and PR sequence.
- `phases/01-ten-star-spine-foundation/PREMORTEM.md` — Phase 1 failure modes, runtime kill-switches, and repair loops.
- `STATE.md` — current phase and active risks.
- `source-mining/phase-1-ledger.md` — concrete Phase 1 backup-source ledger and PR gate.

## Supporting context

- `AGENTIC-MARKET-STUDY.md` — research artifact translating Agentic.Market/x402 marketplace patterns into Phase 1 AE service-catalog/read-only registry shape; does not override no-payment/no-callable gates.
- `PRODUCT-LENS.md` — review lenses: `/ponytail`, Stripe, Coinbase/protocol, Matt Pocock, security, accessibility.
- `REVIEW-PANEL-SYNTHESIS.md` — findings from the 10-agent review panel and accepted fixes.

## Source mine

- `../Agentic-Economy-Backup` is read-only context.
- Copy concepts, not folders.
- If a future implementation imports backup code, it must name the source file, reduce the code to the fresh module interface, and add tests at the new seam.

## Current phase

Phase 1 — Ten-Star Spine Foundation.
