# L5 AI Integration Audit

**Date:** 2026-06-30  
**Verdict:** Locally sound and boundary-honest; not production-complete for assistant discovery and agent-tools verification.

## Top 5 findings

| # | Finding | Production gate? | Conversion lift | Effort | ROI tier | Evidence | Next step |
|---|---------|:---:|:---:|:---:|:---:|---|---|
| 1 | Agent-tools route has no integration tests | **Yes** | High | S | **T1/S** | `api.agent.tools.ts`; missing integration tests | Add GET/POST integration tests |
| 2 | `llms.txt` omits `/api/answer` and `/api/agent/tools` | **Yes** | Medium | S | **T1/S** | `discovery-files.ts`; `AGENTS.md` | Add to llms + deploy smoke |
| 3 | `agentJson` surface declared but unwired | Soft | Medium | M | **T2/A** | `inquiry.actions.ts`; `AeAgentJsonAffordance.tsx` | Envelope with actions + boundaries |
| 4 | SSE seam ready; synthesis is deterministic only | No | Medium | H | **T3/C** | `deterministic-synthesizer.ts` | LLM provider swap when ready |
| 5 | Deploy/Phase 2 proof gap blocks agent write confidence | **Yes** | **High** | M | **T1/S** | `02-DEPLOY-SMOKE-BLOCKERS.md` | Complete Phase 2 deploy proof |
