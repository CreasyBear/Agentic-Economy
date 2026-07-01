# Product Architecture Decision Map

**Date:** 2026-06-30
**Seed docs:** `PRODUCT-ARCHITECTURE-INTERROGATION.md`, `PRODUCT-ARCHITECTURE-PATH-FORWARD.md`
**Purpose:** compact frontier map for turning AE's broad architecture into a focused product operating plan.

## #1: Surface Status Register

Blocked by: none
Type: Grilling

### Question

What is the smallest enforceable register that tells future humans and agents whether each mounted route, API, action, and feature is public core, support, beta, internal, future, or killed?

### Answer

Resolved enough to execute.

Create `.planning/SURFACE-STATUS.md` with one row per mounted route/action. Required columns:

```text
kind | id | file | status | visibility | user | product_job | proof_gate | owner
```

Add `tests/imports/surface-status.test.ts`. The test should parse `createFileRoute('...')` literals from `src/routes`, load action IDs from `listActions()`, and fail on missing rows, orphan rows, duplicate `kind:id`, unknown status values, or empty required cells. Do not scrape `src/routeTree.gen.ts`.

## #2: Loop Proof Gate

Blocked by: #1
Type: Grilling

### Question

What exact evidence proves the core loop works: listing -> qualified inquiry -> owner delivery -> owner response/correction -> listing freshness?

### Answer

Resolved enough to execute.

Create `.planning/LOOP-PROOF.md` as a release-blocking evidence ledger. It must separate local/source proof from deployed/provider proof, with rows for listing inspect, inquiry submit, owner delivery, owner read/reply, correction or confirmation, freshness/ranking effect, and failure state. The gate does not move on partial evidence.

## #3: Answer/Search Posture

Blocked by: #1, #2
Type: Grilling

### Question

Is answer/chat a public core entry point, a beta demand router, or a future surface until loop proof exists?

### Answer

Resolved.

Classify answer/chat as a beta demand router. `/ask` can be public core only as listing-first routing: provider cards first, public catalog facts only, persisted registry tool evidence, and next step into listing or qualified inquiry. It should not become generic chat.

## #4: Trust Language Standard

Blocked by: none
Type: Grilling

### Question

What exact public language is allowed for source, freshness, limitation, and proof, and what proof would ever permit "verified"?

### Answer

Resolved enough to execute.

Patch drift immediately. Use "checked", "business supplied", "published", "last checked", and "needs confirmation" unless a named verification standard exists. Keep `KNOWN` / `UNKNOWN` / `UNAVAILABLE` / `NEXT_STEP` and architecture vocabulary off public human surfaces. Update `AGENTS.md` for read-only registry tools, and remove latent public "Verified" labels from shared status presentation.

## #5: Multi-Sided Activation

Blocked by: #2
Type: Research

### Question

Which side is hardest to activate first: owners, customers, assistants, or internal operators, and what table stakes does each side require from the others?

### Answer

Resolved enough to execute.

The hard side is owners who will review/correct listings and act on inquiries. Customers and assistants have no reason to choose AE over Google/Maps unless owner-reviewed supply is materially clearer, fresher, and safer. The first proof should use one metro, one service category, and named owners rather than broad marketplace inventory.

## #6: Rails Quarantine

Blocked by: #1, #3
Type: Grilling

### Question

What must be true before billing, protected actions, business-action receipts, or provider webhooks can appear in public product language?

### Answer

Resolved.

These remain future/internal/proof rails until the inquiry loop has deployed proof and each rail has support, receipt, reconstruction, and no-overclaim gates. No public billing, payment, protected-action, business-action, provider-webhook, or broad marketplace copy should imply production maturity before those gates pass.

## #7: Observability As Product State

Blocked by: #2
Type: Prototype

### Question

What product-loop events and failure states should be tracked so trust decay is visible instead of hidden?

### Answer

Open.

Current leaning: track query, listing inspect, agent JSON copy, inquiry attempt, inquiry accepted/rejected, notification/delivery state, owner read, owner reply, correction, suppression, and freshness/ranking effect. Tie Sentry to user-visible broken jobs. This needs a prototype because the right home may be existing observability/funnel modules, not another shallow reporting layer.
