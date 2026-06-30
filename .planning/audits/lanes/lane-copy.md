# L4 Copy Audit — Public voice, banned terms, overclaim gaps

**Date:** 2026-06-30  
**Mode:** Audit only

## Top 5 findings

| ID | Finding | Production gate? | Conversion lift | Effort | ROI tier | Evidence | Next step |
|----|---------|:---:|:---:|:---:|:---:|---|---|
| F1 | No static epistemic-token or "Unavailable" label rule | **Yes** | Medium | S | **P0/S** | `status-presentation.ts`; `route-readbacks.ts` | Add `scanEpistemicLabels`; use plain customer voice |
| F2 | Landing/answer WIP excluded from `scanPublicLanguage` | **Yes** | Medium | S | **P0/S** | `public-language-copy.test.ts` | Extend targets to `q.$answerId`, answer components, synthesizer |
| F3 | Default `__root` meta leaks "source-owned" | **Yes** | Medium | S | **P0/S** | `__root.tsx` L14–17 | Customer-outcome meta; broaden scanner |
| F4 | Protocol-vocabulary ban incomplete in scanners | Soft | Low | M | **P1/B** | `contract-scans.ts` | Mirror AGENTS.md banned list |
| F5 | Public status UI shows ops-grade badge descriptions | Soft | Medium | M | **P1/B** | `AeStatusBadge.tsx`; `$slug.tsx` | Use `plain*Label` helpers on public surfaces |
