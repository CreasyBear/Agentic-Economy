# L9 Code Quality Audit

**Date:** 2026-06-30  
**Sources:** `.planning/codebase/CONCERNS.md`, `.planning/codebase/TESTING.md`, import guardrails

## Findings

| ID | Finding | Production gate? | Conversion lift | Effort | ROI tier | Evidence | Next step |
|----|---------|:---:|:---:|:---:|:---:|---|---|
| CQ-001 | `npm run test:all` omits e2e, a11y, deploy/provider smokes | **Yes** | Low | S | **T1/S** | `package.json` scripts | Add `test:release` profile |
| CQ-002 | Production E2E bypass flag lacks fail-fast guard | **Yes** | Low | S | **T1/S** | `src/start.ts`; `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` | Hard-stop in production env |
| CQ-003 | `convex/inquiries.ts` concentrates highest-change-risk behavior | No | Medium | L | **T2/M** | CONCERNS.md; ~largest Convex file | Split by command/readback responsibilities |
| CQ-004 | Business-action reuses `protected_action` source-write scope | Soft | Low | M | **T2/B** | `business-action.functions.ts` | Dedicated `business_action` scope |
| CQ-005 | Future-phase code in active `src` tree | Soft | Low | M | **T2/B** | `src/future-phases/`; billing schema | Import scan + stage-gate routes |
| CQ-006 | Unused `AeLandingPage.tsx` with picsum placeholders | Soft | Low | S | **T3/C** | `src/components/ae/brand/AeLandingPage.tsx` | Delete or guard import |
| CQ-007 | No integration tests for `/api/agent/tools` | **Yes** | High | S | **T1/S** | `api.agent.tools.ts` | Add integration test file |
| CQ-008 | Registry/search rebuilds full catalog before pagination | Soft | Medium | L | **T2/B** | `convex/registry.ts` | Use projection read model |

## Top 5 ROI

1. **CQ-001** — Release CI profile including e2e + deploy smokes
2. **CQ-002** — Production auth-bypass hard-stop
3. **CQ-007** — Agent-tools integration tests
4. **CQ-003** — Split inquiry module (maintainability under production load)
5. **CQ-008** — Registry projection performance
