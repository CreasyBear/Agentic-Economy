# T22 — Destination walkthrough

Labels: `wayfinder:grilling` (HITL). Status: open, unblocked 2026-07-31 — ready for the founder walkthrough. Blocked by: [T19](T19-eval-suite.md) (closed), [T20](T20-self-onboarded-endpoint.md) (core closed, publication HITL open), [T21](T21-engine-segment-live.md) (closed). Map: [Agent engine](../MAP-engine.md).

## Question

Founder drives the live dialog end-to-end (ordinary ask → dialog → plan/proposal → quote against sandbox + real endpoint) and either accepts the destination as reached or names the gaps. Acceptance graduates the async-inquiry fog into the next effort's charting session; rejection produces sharp tickets on this map. No agent stands in for the founder here.


**Walkthrough setup (2026-07-31):** dev app on `127.0.0.1:3000` with `AE_ENGINE_PROPOSALS=true`
(hub process `agent-engine-ui`). Suggested drive: (a) `dentist near Adelaide` — instant options,
no dialog theater; (b) `I need my home office set up for video calls next month` — plan card +
dialog; (c) reply to the clarifying question in the same ask box — same-thread continuation;
(d) hosted T20 endpoint: `https://agentic-economy-phi.vercel.app/api/demo-provider/health` and a
POST quote. Independent critic reports: `output/eval/phase1-journey-evaluation.md`,
`output/eval/engine-suite-report.json`, `output/eval/t20-evidence.json`. Known gaps to react to:
clarifying-question copy quality (first ask→plan ultraloop target), OpenRouter privacy toggle for
DeepSeek, Clerk owner credential for real funnel publication.
## Resolution

(pending)
