# L3 UX Audit — Query-First Landing + Conversion Flows

**[CODE-ONLY REVIEW — visual issues not assessed]**

**Scope:** `index.tsx`, `AeQueryBox`, `q.$answerId.tsx`, `AeAnswerStream`, claim/inquiry/owner flows  
**Date:** 2026-06-30  
**UsabilityScore:** 53 / D (judged) — prior heuristic 70/C report is **stale** (old claim-first landing)

## Findings

| # | Finding | Production gate? | Conversion lift | Effort | ROI tier | Evidence | Next step |
|---|---------|:---:|:---:|:---:|:---:|---|---|
| 1 | Claim auth gate with no landing context | Soft | **High** | S | **P0/A** | `claim.tsx`; `claim-owner-session.ts` | Preface sign-in on `/claim` or landing CTA copy |
| 2 | Ask submit has no in-flight feedback | No | **High** | S | **P0/A** | `AeQueryBox.tsx`; `index.tsx` | Wire `busy` on navigate/submit |
| 3 | Answer error/stopped states lack same-query retry | No | **High** | S | **P0/A** | `AeAnswerStream.tsx` | Add retry for same query |
| 4 | Claim "First request" section exposes backend modes | No | Medium | M | **P1/B** | `claim.tsx` | Plain defaults; hide mode select |
| 5 | Answer page can't refine query in place | No | Medium | M | **P1/B** | `q.$answerId.tsx` | Add compact `AeQueryBox` on answer page |
| 6 | Secondary controls undersized on mobile (<44px) | Soft | Low | S | **P2/C** | `answer.css` | Increase touch targets |

## Top 5 ROI

1. Claim auth gate without context (blocks owner conversion)
2. Ask submit lacks progress feedback
3. No same-query retry on stream failure
4. Claim first-request jargon
5. No query refinement on answer page
