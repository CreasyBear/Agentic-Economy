# Code Quality, Component Purity & Structural Decoupling: Operating Protocol

**Date:** 19 September 2026 (programme close addendum 21 September 2026)
**Status:** Invariants enforced by tests; campaign protocol retired 2026-09-21
**Authority:** `PRODUCT.md`, `CONTEXT.md`, `AGENTS.md`, `docs/designs/2026-09-19-code-quality-iceinvein.md`, `.cursor/rules/leaf-and-component-cleanliness.mdc`

---

## 1. Executive Purpose & Anti-Compaction Memory Anchor

This document is the **immutable operating manual** for executing the 30 Code Quality workflows (`CQ-01` through `CQ-30`). It establishes the formal subagent operating protocol utilizing **Grok (`cursor-grok-4.6-high-fast`)** for scouting and specification, **Composer (`composer-2.5`)** for bounded implementation, and the **Orchestrator (Parent Agent)** for quality gate enforcement and provenance tracking.

When context windows compact or subagents are dispatched, **always read this file first** to restore exact operational alignment.

### The Canonical Quality Invariants
1. **Component Type Quarantine:** `.tsx` files must NEVER define, export, or house domain models, database schema types, API payloads, or complex state unions. Exactly ONE props type per file: `<ComponentName>Props`. — enforced by tests/imports/tsx-type-quarantine.test.ts
2. **Pure Leaf Component Invariant:** Leaf components receive pre-formatted view-models and callbacks. Zero `useQuery`, `useMutation`, `useServerFn`, or `fetch()` inside leaf markup; zero inline BigInt, GST, or ABN validation. — enforced by tests/imports/leaf-purity.test.ts
3. **Single Responsibility & Size Ceilings:** Components soft limit 300 lines; hard ceiling 500 lines. Backend modules hard ceiling 1,000 lines. — enforced by tests/imports/file-size-ratchet.test.ts
4. **Command-Query Separation (CQS):** Queries are 100% read-only and cache-safe. Reads never burn one-time write nonces.
5. **Internal Modules Never Import Own Barrel:** No file under `src/modules/<domain>/internal/` may import from `src/modules/<domain>/public.ts`. — enforced by tests/imports/own-barrel-imports.test.ts
6. **Compound Component Encapsulation:** Decomposed components live in dedicated feature folders (`src/components/ae/<domain>/<feature>/`), preventing loose-file sprawl.
7. **Convex Façade Router Pattern:** Root `convex/<module>.ts` remains a thin Façade (<200 lines) preserving RPC routes. **Campaign 2/3 layout:** logic lives in `convex/lib/<domain>/` (<400 each). Never `convex/<module>/` — that breaks `api.<module>.<method>`. Root files with **0 RPC** are helpers, not façades (A08/A09); they may stay as re-export shells plus thinness wrappers. — enforced by tests/imports/convex-facade-size.test.ts
8. **Three-Tier Component Hierarchy:** Clean separation between Tier 1 (Atomic `src/components/ui`), Tier 2 (Shared Domain `src/components/ae/shared`), and Tier 3 (Feature Compounds).
9. **Ultra-Thin Route Controllers:** Route files in `src/routes/` are **≤80** lines, handling only URL params, loaders, and rendering page containers. Framework search types live in `.ts` contract modules, not the route `.tsx` (A11). — enforced by tests/imports/route-controller-size.test.ts
10. **Colocated Zero-CLS Skeletons & Tests:** Skeletons and unit tests are colocated directly within the compound component folder. **Synchronous static pages** (no pending/loader boundary) do not require a skeleton — record **N/A** (A13: privacy, terms, help).

Execution protocol: docs/operations/platform-stabilisation-register.md §0 and §5. Gates: tests/imports/ (run `npm run test:imports`).

