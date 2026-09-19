# Code Quality, Component Purity & Structural Decoupling: Operating Protocol

**Date:** 19 September 2026
**Status:** Approved Master Protocol & Execution Reference
**Authority:** `PRODUCT.md`, `CONTEXT.md`, `AGENTS.md`, `docs/designs/2026-09-19-code-quality-iceinvein.md`, `.cursor/rules/leaf-and-component-cleanliness.mdc`

---

## 1. Executive Purpose & Anti-Compaction Memory Anchor

This document is the **immutable operating manual** for executing the 30 Code Quality workflows (`CQ-01` through `CQ-30`). It establishes the formal subagent operating protocol utilizing **Grok (`cursor-grok-4.6-high-fast`)** for scouting and specification, **Composer (`composer-2.5`)** for bounded implementation, and the **Orchestrator (Parent Agent)** for quality gate enforcement and provenance tracking.

When context windows compact or subagents are dispatched, **always read this file first** to restore exact operational alignment.

### The Canonical Quality Invariants
1. **Component Type Quarantine:** `.tsx` files must NEVER define, export, or house domain models, database schema types, API payloads, or complex state unions. Exactly ONE props type per file: `<ComponentName>Props`.
2. **Pure Leaf Component Invariant:** Leaf components receive pre-formatted view-models and callbacks. Zero `useQuery`, `useMutation`, `useServerFn`, or `fetch()` inside leaf markup; zero inline BigInt, GST, or ABN validation.
3. **Single Responsibility & Size Ceilings:** Components soft limit 300 lines; hard ceiling 500 lines. Backend modules hard ceiling 1,000 lines.
4. **Command-Query Separation (CQS):** Queries are 100% read-only and cache-safe. Reads never burn one-time write nonces.
5. **Internal Modules Never Import Own Barrel:** No file under `src/modules/<domain>/internal/` may import from `src/modules/<domain>/public.ts`.
6. **Compound Component Encapsulation:** Decomposed components live in dedicated feature folders (`src/components/ae/<domain>/<feature>/`), preventing loose-file sprawl.
7. **Convex Façade Router Pattern:** Root `convex/<module>.ts` remains a thin Façade (<200 lines) preserving RPC routes; logic lives in `convex/<module>/<submodule>.ts`.
8. **Three-Tier Component Hierarchy:** Clean separation between Tier 1 (Atomic `src/components/ui`), Tier 2 (Shared Domain `src/components/ae/shared`), and Tier 3 (Feature Compounds).
9. **Ultra-Thin Route Controllers:** Route files in `src/routes/` are <80 lines, handling only URL params, loaders, and rendering page containers.
10. **Colocated Zero-CLS Skeletons & Tests:** Skeletons and unit tests are colocated directly within the compound component folder.

---

## 2. The 5-Stage Subagent Lifecycle

Every workflow from `CQ-01` to `CQ-30` must traverse these 5 stages sequentially without skipping:

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    THE 5-STAGE SUBAGENT REFACTOR LIFECYCLE                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│  STAGE 1: SEAM SCOUTING & CONTRACT SPECIFICATION (Grok Subagent)               │
│    └─ Target: cursor-grok-4.6-high-fast                                         │
│    └─ Inputs: Source files, consumer routes, and existing test suites           │
│    └─ Output: Exact TypeScript contract code + Dumb Leaf Props + Hook signature │
│    └─ Constraint: Read-only; zero file edits, zero git operations               │
├─────────────────────────────────────────────────────────────────────────────────┤
│  STAGE 2: ORCHESTRATOR SPECIFICATION REVIEW & BOUNDARY FREEZE                   │
│    └─ Review Grok's output against domain models in CONTEXT.md & PRODUCT.md     │
│    └─ Verify no circular dependencies are introduced in proposed paths          │
│    └─ Freeze target file budget for Composer                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│  STAGE 3: BOUNDED CRAFT IMPLEMENTATION (Composer Subagent)                      │
│    └─ Target: composer-2.5                                                      │
│    └─ Inputs: Grok's frozen contract specification + Bounded file budget        │
│    └─ Step 1: Create/extract destination *.contracts.ts or *.view-model.ts      │
│    └─ Step 2: Extract pure leaf components & custom hooks                       │
│    └─ Step 3: Rewire imports across consumer routes and components              │
│    └─ Step 4: Harmonize unit tests to verify zero behavioral regression         │
│    └─ Constraint: Strictly bounded to assigned files; no new external packages │
├─────────────────────────────────────────────────────────────────────────────────┤
│  STAGE 4: MULTI-GATE QUALITY VERIFICATION (Orchestrator)                        │
│    └─ Gate 1: oxlint --deny-warnings                                            │
│    └─ Gate 2: tsc --noEmit (strict exactOptionalPropertyTypes: true)            │
│    └─ Gate 3: npm run deps:check (deps-ratchet import cycle ceiling)            │
│    └─ Gate 4: npx vitest run <affected-and-regression-suites>                   │
│    └─ Self-Healing Loop: Max 2 targeted fix dispatches if any gate fails        │
├─────────────────────────────────────────────────────────────────────────────────┤
│  STAGE 5: PROVENANCE TRACING & REGISTER UPDATE (Orchestrator)                   │
│    └─ Record Subagent Assignment trace:                                         │
│         Grok (Spec: <uuid>) → Composer (Implement: <uuid>) → Orchestrator       │
│    └─ Record exact test counts, file surfaces, and gate evidence                │
│    └─ Advance workflow status: READY → IN PROGRESS → VERIFIED                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Subagent Roles, Prompts & Communication Protocols

### Role 1: Grok Subagent (`cursor-grok-4.6-high-fast`)
- **Archetype:** Analytical Scout, Seam Characterizer, AST Auditor, and Contract Specifier.
- **Tools Available:** Read, Grep, Glob (Read-only tools).
- **Core Directive:** Read source code deeply; pinpoint every entangled concern; design the clean TypeScript contracts and view-models *before* a single line of production code is moved.

#### Standard Grok Dispatch Prompt Template
```markdown
You are an expert TypeScript & Clean Architecture scout executing STAGE 1 of the Code Quality Protocol.

Task:
Perform a comprehensive seam characterization and draft the exact refactoring specification for workflow: {WORKFLOW_ID} ({WORKFLOW_TITLE}).

Target File(s):
{TARGET_FILE_PATHS}

Consumer Surfaces to Check:
{CONSUMER_ROUTES_AND_COMPONENTS}

Your Objectives:
1. Identify all trapped types (domain models, API payloads, state unions, diagnostics) that violate the Component Type Quarantine Rule.
2. Identify all entangled logic in render functions (Convex queries, server actions, BigInt math, currency rescaling, GST splits, ABN validation).
3. Specify the exact destination files under `src/modules/<domain>/` or `src/lib/`.
4. Write out the COMPLETE, compile-ready TypeScript interfaces for:
   - The extracted contracts/view-models.
   - The dumb leaf component props.
   - The container hook signature (`use<Feature>.ts`).
5. Provide a "What NOT to Touch" boundary checklist to prevent Composer from over-refactoring.

Output Format:
Provide your response in structured markdown:
- ### 1. Trapped Types & Destination Mappings
- ### 2. Proposed TypeScript Contracts (Full code blocks)
- ### 3. Pure Leaf Components Breakdown (Props & Responsibilities)
- ### 4. Container Hook Signature (`use<Feature>.ts`)
- ### 5. What NOT to Touch & Invariants Checklist
```

---

### Role 2: Composer Subagent (`composer-2.5`)
- **Archetype:** Surgical Implementer, Craft Design Engineer, and Test Harmonizer.
- **Tools Available:** Read, Write, StrReplace, Grep, Glob (Local filesystem editing).
- **Core Directive:** Implement the refactoring strictly bounded by Grok's frozen specification. Move types, create pure leaf components, extract hooks, and update consumer imports without altering runtime behavior or adding dependencies.

#### Standard Composer Dispatch Prompt Template
```markdown
You are a bounded implementation worker executing STAGE 3 of the Code Quality Protocol.

Task:
Execute the bounded refactoring for workflow: {WORKFLOW_ID} ({WORKFLOW_TITLE}) strictly following Grok's specification below.

Permitted File Budget (Do NOT edit files outside this list without explicit instruction):
{BOUNDED_FILE_LIST}

Grok's Architectural Specification:
{GROK_OUTPUT_SPECIFICATION}

Implementation Execution Sequence:
1. Write/Update Contracts: Create the destination contract or view-model files (e.g. `*.contracts.ts`, `*.view-model.ts`) with the exact interfaces specified by Grok.
2. Extract Pure Leaves: If decomposing a component, create the dumb leaf components in `src/components/ae/...` with pure props and callback emitters.
3. Extract Container Hooks: Implement the custom hook encapsulating state, queries, and mutations.
4. Clean the Incumbent Component: Remove trapped types from `.tsx`; export only `<ComponentName>Props`; convert the component to use the extracted hook and leaf components.
5. Rewire Consumer Imports: Update all consumer routes and components to import types from the new contract modules, NOT from `.tsx` files.
6. Harmonize Tests: Update existing unit tests to ensure all tests pass with zero behavioral regressions.

Strict Engineering Constraints:
- Imports must be at the very top of files (no inline imports).
- Use exhaustive switches with `never` checks for unions.
- Preserve Emil Kowalski tactile physics (`:active:scale-[0.98]`) and zero-CLS reserved heights on all leaf components.
- Do NOT introduce any new dependencies.
```

---

### Role 3: Parent Agent (Orchestrator)
- **Archetype:** Judgment Authority, Gatekeeper, and Provenance Auditor.
- **Responsibilities:**
  1. Inspects Grok's output before dispatching Composer to ensure domain integrity and prevent architectural sprawl.
  2. Dispatches Composer with explicit file boundaries.
  3. Executes the 4 terminal quality gates upon Composer completion:
     ```bash
     # Gate 1: Lint
     NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run lint
     # Gate 2: Typecheck
     NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck
     # Gate 3: Dependency Ratchet
     NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run deps:check
     # Gate 4: Test Suite
     NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run <affected_tests>
     ```
  4. Manages the Self-Healing Loop: If any gate fails, collects the compiler/linter error output and dispatches a single targeted fix brief to Composer.
  5. Updates `docs/operations/code-quality-maturity-register.md` with full operational provenance.

---

## 4. Self-Healing & Failure Protocol

When a quality gate fails during Stage 4, adhere to these triage procedures:

```text
Gate Failure Detected
  ├── Case 1: Linter Warning (oxlint)
  │     └─ Cause: Unused import, inline import, or missing exhaustive switch.
  │     └─ Action: Dispatch Composer with specific file and line numbers to clean imports.
  ├── Case 2: TypeScript Compiler Error (tsc --noEmit)
  │     └─ Cause: Missing property, exactOptionalPropertyTypes violation, or wrong import path.
  │     └─ Action: Dispatch Composer with exact tsc diagnostic message.
  ├── Case 3: Dependency Cycle (deps:check ratchet)
  │     └─ Cause: New contract imports from barrel, or circular import between leaf and container.
  │     └─ Action: Break the cycle by ensuring leaf/contract never imports from parent barrel or container.
  └── Case 4: Vitest Failure
        └─ Cause: Component DOM structure changed, or mock props do not match new view-model shape.
        └─ Action: Verify if it's a test harness update (updating test mock data to view-model) vs a true behavioral bug. Never weaken assertions.
```

**Loop Bounds:** The Orchestrator allows a maximum of **two** self-healing repair cycles per workflow. If an issue cannot be resolved in two cycles, halt and review the fundamental abstraction boundary.

---

## 5. Provenance Logging & Register Maintenance

Every completed workflow line item in `docs/operations/code-quality-maturity-register.md` must record:
1. **Surfaces:** List of all files created, modified, or cleaned.
2. **Incumbent Baseline:** Description of the code debt before refactoring.
3. **Target Spec:** Summary of the clean-sheet architecture.
4. **Subagent Assignment Trace:** Exact UUIDs linking Grok and Composer runs:
   ```markdown
   Subagent Assignment: Grok (Spec: `<uuid>`) → Composer (Implement: `<uuid>`) → Orchestrator (Verify: Passed 4/4 Gates)
   ```
5. **Verification Evidence:** Test suite paths, test assertion counts, and confirmation of 0 lint warnings and 0 type errors.
6. **Status:** Advanced to `VERIFIED`.

---

## 6. Topology, File Structure & Directory Layout Specifications

Every subagent must adhere to these structural file layout standards:

### 1. Compound Component Directory Layout
When any component is decomposed (Container + Hook + Leaves + Contracts), it must be housed in a compound folder:
```text
src/components/ae/<domain>/<feature-name>/
  ├── <ComponentName>.tsx          # Smart Container / Orchestrator (<150 lines)
  ├── use<ComponentName>.ts        # State machine, calculations & mutations hook
  ├── <feature-name>.contracts.ts  # View-model contracts & pure leaf props definitions
  ├── <ComponentName>Skeleton.tsx  # Colocated zero-CLS loading skeleton
  ├── <ComponentName>.test.tsx     # Colocated unit test for leaf rendering
  └── components/                  # Pure Leaf Presenters (<150 lines each)
        ├── <SubSectionOne>.tsx
        └── <SubSectionTwo>.tsx
```

### 2. Convex Façade Router Pattern
To prevent breaking existing client RPC paths (`api.<module>.<method>`):
```text
convex/
  ├── <module>.ts                  # Thin Façade (<200 lines): query/mutation schemas & delegations
  └── <module>/                    # Internal submodules (<400 lines each)
        ├── <submoduleOne>.ts      # Pure business logic & database transactions
        ├── <submoduleTwo>.ts      # Telemetry & verification helpers
        └── <module>.contracts.ts  # Backend-internal type definitions
```

### 3. Three-Tier Component Hierarchy
- **Tier 1 (Atomic Primitives):** `src/components/ui/` (Zero domain logic, zero `@/modules/*` imports).
- **Tier 2 (Shared Domain Primitives):** `src/components/ae/shared/` (Cross-cutting domain badges, copy buttons, currency formats).
- **Tier 3 (Feature Compounds):** `src/components/ae/<domain>/<feature>/` (Encapsulated workflow packages).

### 4. Ultra-Thin Route Controllers
Files in `src/routes/` are strictly controllers (<80 lines). They validate search params via Zod, invoke loaders, and render the Page Container from `src/components/ae/`. All state, modals, and layouts reside inside the component container.

