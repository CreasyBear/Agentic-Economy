# User & Organization Application Ergonomics & Retention: Operating Protocol

**Date:** 18 September 2026  
**Status:** Approved Master Protocol & Execution Reference  
**Authority:** `PRODUCT.md`, `CONTEXT.md`, `AGENTS.md`, `docs/operations/user-and-org-maturity-register.md`, `docs/operations/user-and-org-maturity-protocol.md`

---

## 1. Executive Purpose & Retention Thesis

Having established the baseline functional correctness for all 44 standard application workflows (`W-01` through `W-44`)—including multi-tenant authority isolation, Formance double-entry ledger settlement, Clerk identity synchronizations, and strict TypeScript/linter gates—we now enter the **Ergonomic & Retention Refinement Phase**.

Functional compliance proves an application *works without crashing or leaking state*. However:
> **"Compliance is a utility; retention, trust, and word-of-mouth growth are driven by craft, anxiety reduction, and developer velocity."**

In an agentic marketplace where buyers deploy autonomous software and suppliers monetize custom tools:
1. **Developers churn from clunky onboarding, opaque billing, and slow test loops.**
2. **Developers retain when software feels instantaneous, tactile, predictive, and respectful of their attention.**

This protocol governs the systematic, non-one-shot elevation of every maturity line item into a compounding retention asset.

---

## 2. The 3-Phase Subagent Protocol

To prevent rushing, regressions, or superficial changes, every wave and workflow cluster must traverse this 3-phase cycle sequentially:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   THE 3-PHASE REFINEMENT PROTOCOL                      │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 1: Ergonomic Scouting & Friction Audit (Grok Subagent)          │
│    └─ Audit incumbent UI component, user journey, and loading states   │
│    └─ Identify layout shifts (CLS), missing feedback, or copy friction │
│    └─ Reference design standards (Linear, Stripe, Raycast, Dub.co)     │
│    └─ Output: Before/After UX spec & tactile interaction requirements  │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 2: Bounded Craft Implementation (Composer Subagent)             │
│    └─ Write red-to-green component and interaction tests               │
│    └─ Implement Emil Kowalski tactile physics (:active, spring curves) │
│    └─ Implement zero-CLS skeletons, copyable snippets, and toast hooks │
│    └─ Preserve strict TS (exactOptionalPropertyTypes) & AE invariants  │
├────────────────────────────────────────────────────────────────────────┤
│  Phase 3: Cold Review & Craft Verification Gate (Orchestrator)         │
│    └─ Run oxlint --deny-warnings and strict typecheck (tsc --noEmit)   │
│    └─ Run dependency-cruiser ratchet (npm run deps:check)              │
│    └─ Run ui-contract tests (semantic tokens, z-index, spacing)        │
│    └─ Run vitest suite across affected and full regression test sets   │
│    └─ Update operational status in ergonomics register                 │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Subagent Roles & Responsibilities

### Phase 1: Grok Subagent (`cursor-grok-4.6-high-fast`)
- **Role:** Ergonomic Scout, Friction Hunter, and UX Specifier.
- **Responsibilities:**
  - Reads existing component files, route loaders, and user journey paths.
  - Pinpoints specific UX friction: lack of immediate feedback, confusing copy, missing zero-states, jarring layout snaps, and copy-paste friction.
  - Produces an exact markdown specification table detailing:
    - Target file path.
    - Before / After interaction behavior.
    - Specific micro-interaction tokens (`:active:scale-[0.98]`, spring transition durations).
    - Diagnostic playbooks for failure states.
  - *Constraint:* Does not edit production source files.

### Phase 2: Composer Subagent (`composer-2.5`)
- **Role:** Bounded Craft & Design Engineer.
- **Responsibilities:**
  - Implements the Grok specification in React components, view models, and hooks.
  - Writes or updates Vitest unit tests verifying interactive behaviors (e.g. copy feedback, filter reactivity, modal states).
  - Implements layout-stable skeletons, monospace code cards, and toast micro-affirmations.
  - Guarantees strict type compliance under `exactOptionalPropertyTypes: true` and zero lint warnings.
  - *Constraint:* Bounded strictly to the assigned cluster files; never introduces unapproved dependencies or alters backend ledger contracts.

### Phase 3: Parent Agent (Orchestrator)
- **Role:** Quality Auditor, Gatekeeper, and Verifier.
- **Responsibilities:**
  - Dispatches Grok and Composer with isolated, bounded briefs per cluster.
  - Executes quality gates via terminal commands:
    ```bash
    npm run lint
    npm run typecheck
    npm run deps:check
    npx vitest run tests/ui-contract/ tests/imports/ <affected_tests>
    ```
  - Verifies visual token compliance (no raw Tailwind colors, hardcoded shadows, or generic z-indexes).
  - Updates the operational register (`docs/operations/user-and-org-ergonomics-register.md`) from `PENDING` $\rightarrow$ `IN REVIEW` $\rightarrow$ `VERIFIED`.

---

## 4. The 5 Inviolable Craft Rules

### Rule 1: The Zero-CLS (Cumulative Layout Shift) Mandate
- Loading skeletons must reserve the **exact pixel dimensions and grid structure** of the final loaded component.
- Never use a generic `<div className="h-24 w-full" />` that snaps or jerks the viewport when queries resolve.
- Table skeletons must render identical headers, matching column count, and matching cell alignments.

### Rule 2: The Emil Kowalski Tactile Physics Standard
- **Tactile feedback:** All interactive buttons and clickable cards must provide responsive feedback: `:active:scale-[0.98] transition-transform duration-100 ease-out`.
- **Natural geometry:** Popovers and dropdown menus must originate from trigger bounds using Radix transform origin CSS variables.
- **Keyboard speed:** Never animate or add artificial delay to typing inputs, search bars, or command palette navigation.

### Rule 3: The Copy-Paste Ergonomic Law
- Any API key, endpoint URL, CLI command, code snippet, or reference ID must feature an integrated **1-click copy button**.
- Copy confirmation must provide immediate visual feedback (transition icon to checkmark for 2000ms).
- When copying environment variables or configs, provide dynamic destination cues (e.g., *"Copied to clipboard — paste into ~/.cursor/mcp.json"*).

### Rule 4: Actionable Diagnostic Playbooks (No Raw Errors)
- Never display raw machine error strings (e.g., `Error 429`, `ECONNREFUSED`, `tool_execution_failed`) directly to an operator.
- Every error state must answer three questions:
  1. **What happened:** Plain-English explanation without jargon.
  2. **Financial impact:** Clear statement of credit safety (e.g., *"A$0.00 deducted — your balance is safe"*).
  3. **Next step:** Concrete diagnostic suggestion or alternative tool option.

### Rule 5: Financial Peace-of-Mind & Trust
- Autonomous agents spend real capital; interface ambiguity creates anxiety.
- Always display:
  - Tabular monospace numbers for currency and call counts (`tabular-nums font-mono`).
  - Itemized Australian GST breakdown (`A$XX.XX GST included`).
  - Visual budget velocity and ceiling gauges (progress indicators showing current burn vs monthly hard cap).

---

## 5. Execution Waves & Groupings

The 44 items are divided into 4 sequential Waves. **No wave begins until the prior wave passes all quality gates:**

- **Wave 1: Buyer Onboarding & Developer Launchpad**
  - Workflows: `W-01`, `W-02`, `W-25`, `W-26`, `W-27`, `W-29`
  - Focus: 60-second activation, multi-harness code snippets (Cursor, Claude Code, Python, cURL), 1-time key vault, and spend boundary controls.

- **Wave 2: Financial Peace-of-Mind & Spend Observability**
  - Workflows: `W-20`, `W-21`, `W-22`, `W-23`, `W-24`, `W-38`, `W-39`, `W-40`
  - Focus: Visual budget velocity gauge, auto-recharge timeline, ATO tax invoice hub, call receipt diagnostic playbooks, and RFC 4180 CSV export.

- **Wave 3: Supplier Monetization & Testing Playground**
  - Workflows: `W-30`, `W-31`, `W-32`, `W-33`, `W-34`, `W-35`, `W-36`, `W-37`
  - Focus: Postman-grade dry-run console, live KYC scanner, 1-click Stripe Express SSO, transparent price updates, and commercial catalog projection.

- **Wave 4: Team Operations, Identity & Tactile Standards**
  - Workflows: `W-03`–`W-09`, `W-10`–`W-19`, `W-28`, `W-41`–`W-44`
  - Focus: Command-grade workspace switcher, copyable invite links, Emil Kowalski tactile physics, zero-CLS skeletons, and flicker-free theme toggle.
