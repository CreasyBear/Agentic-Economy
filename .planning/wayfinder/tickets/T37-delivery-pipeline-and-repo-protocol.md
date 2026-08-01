# T37 — Delivery pipeline + multi-agent repo protocol

Labels: `wayfinder:task` (AFK build + HITL for gh/CI credentials). Map: [Framework](../MAP-framework.md).

## Question

Program hygiene, found derelict (847 uncommitted files, last commit 3 days old, direct-on-main,
13 stashes): (1) commit/branch protocol for multi-agent development — checkpoint cadence, what a
commit must contain (green focused tests), branch-per-effort vs main+tags, review gate; (2) restore
`gh` auth (old-map T1) and mirror maps to Issues or explicitly re-affirm local-markdown tracker;
(3) CI: typecheck + focused suites + eval smoke gating, baseline-error ratchet (fix or freeze
`convex-source.ts:96`); (4) environments: staging Convex deployment, secrets management/rotation,
deploy runbook. Adopt-first: GitHub Actions standard patterns, no bespoke runners.

## Resolution

(pending)
