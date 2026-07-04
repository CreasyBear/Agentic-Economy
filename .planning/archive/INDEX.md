# Planning Archive Index

**Archive-cut date:** 2026-07-04

This archive preserves planning history that no longer belongs in the active decision path after the 2026-07-04 platform-anatomy reset. Nothing was deleted; superseded material moved here so current work starts from `MANIFEST.md`, `ROADMAP.md`, `STATE.md`, `adr/**`, `vision/**`, `scopes/scope-14day-bootstrap-gate/**`, `scopes/scope-01-production-landing/**`, active copy/trust gates, `codebase/**`, and `audits/agent-experience/**`.

| Archived path | Former active path | Why it moved |
| --- | --- | --- |
| `archive/phases/` | `phases/` | Completed or superseded phase working docs, discussion logs, reviews, and source/local proof artifacts. Preserved for provenance; not the current gate. |
| `archive/root/` | root `.planning/*.md` strategy/review sprawl | Older product architecture, harness, market-study, chat-loop, review-panel, and product-lens docs superseded by `vision/**`, `ROADMAP.md`, `STATE.md`, and active contracts. |
| `archive/audits/` | `audits/` except `audits/agent-experience/**` | Old audit lanes, React Doctor remediation ledgers, readiness audits, and domain reports. The agent-experience audit evidence remains active as a release gate. |
| `archive/react-doctor/` | `react-doctor/` | Diagnostic output retained as historical remediation evidence after React Doctor remediation closed. |
| `archive/react-doctor-chat/` | `react-doctor-chat/` | Chat-specific diagnostic output retained as historical evidence. |
| `archive/product-council/` | `product-council/` | Product-council review pack superseded by the 2026-07-04 roast/anatomy decision reset. |
| `archive/spikes/` | `spikes/` | Validated local-context and answer-response spikes preserved as historical experiments, not active requirements. |
| `archive/architecture-measurement/` | `architecture-measurement/` | Measurement review retained as historical architecture evidence. |
| `archive/scopes/` | `scopes/WAVE-1-HANDOFF.md`, `scopes/PHASED-EXECUTION-PREP.md`, `scopes/scope-02-*`, `scopes/scope-03-*`, `scopes/scope-04-*`, `scopes/scope-05-*` | Stale execution handoff and downstream scope drafts archived because the active 14-day bootstrap gate blocks further platform widening. |

Use archived files only when reconstructing history or auditing a past decision. If an archived artifact must become active again, move it back deliberately and update `MANIFEST.md` in the same change.
