# Lane L1: Information Architecture

**Scope:** Site map, public/operator nav, query→answer→detail→inquiry funnel, owner/admin/developer IA  
**Evidence base:** `src/routeTree.gen.ts`, route files, `AePublicShell`, `AeOperatorShell`, `.ui-craft/surfaces/*.md`, `.planning/GTM-READINESS.md`  
**Audit date:** 2026-06-30

## Committed vs WIP

| Layer | Status | Notes |
|---|---|---|
| Public routes (`/`, `/q/*`, `/registry`, `/$slug`, `/$slug/inquiry`, `/claim`) | **Committed** | Query funnel live in route tree |
| Operator routes (`/owner/*`, `/admin/*`, `/developers/discovery`) | **Committed** | Full tree in `routeTree.gen.ts` |
| WIP uncommitted | **Not IA-changing** | Billing module in `src/future-phases/`; answer/landing routes committed in tree |

## Findings

| ID | Finding | Production gate? | Conversion lift | Effort | ROI tier | Evidence paths | Recommended next step |
|---|---|:---:|:---:|:---:|:---:|---|---|
| **L1-001** | Phase 1 GTM funnel events not emitted from public route surfaces | **Yes** | High | M | **S** | `.planning/GTM-READINESS.md`; `src/modules/observability/internal/funnel.ts`; `src/routes/*.tsx` | Wire emitters at `/`, `/registry`, `/claim`, `/$slug/inquiry`; add admin funnel readback |
| **L1-002** | Public nav is registry-first; Ask funnel nav-invisible | **Yes** | High | S | **A** | `src/components/ae/layout/AePublicShell.tsx`; `src/routes/index.tsx` | Add persistent "Ask" nav item → `/` |
| **L1-003** | Owner activation IA missing share/copy URL affordance | **Yes** | High | S | **A** | `.planning/GTM-READINESS.md`; `src/routes/claim.success.tsx` | Add "Copy public URL" + funnel event on claim success and owner status |
| **L1-004** | Answer → inquiry requires extra hop; no deep-link when inquiry available | **Yes** | Medium–High | M | **A** | `src/components/ae/landing/AeProviderSourceCard.tsx`; `src/routes/$slug.tsx` | Secondary CTA "Send inquiry" → `/$slug/inquiry` when available |
| **L1-005** | Operator nav exposes P4/P6 at same weight as P2 | **Yes** | Low direct; High risk | M | **B** | `src/components/ae/layout/AeOperatorShell.tsx` | Stage-gate nav by launch stage; default owner = Status + Inquiries only |
| L1-006 | Registry pagination "Previous" always disabled | No | Medium | S | **B** | `src/routes/registry.tsx` | Implement bidirectional cursor or remove control |
| L1-007 | Home navigates to `/q/$answerId` vs in-place answer (spec drift) | No | Medium | M | **B** | `src/routes/index.tsx`; `.ui-craft/surfaces/landing-query.md` | Document intentional split or add query box on answer page |
| L1-008 | No-JS fallback: form action `/ask` not `/registry?q=` | Yes (a11y) | Low | S | **B** | `src/components/ae/landing/AeQueryBox.tsx` | Progressive enhancement to registry search for no-JS |

## Top 5 by ROI

1. **L1-001** — GTM funnel events + admin query surface
2. **L1-002** — "Ask" in public nav
3. **L1-003** — Copy/share public URL on owner activation
4. **L1-004** — Inquiry deep-links from answer cards
5. **L1-005** — Stage-gate P4/P6 operator nav
