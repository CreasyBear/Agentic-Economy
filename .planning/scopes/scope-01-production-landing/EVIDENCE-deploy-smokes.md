# Scope 01 deploy-smoke evidence

## Evidence status

No deployed smoke evidence has been captured in this file yet. A smoke counts as external proof only when it passes against a configured deployed sandbox/test-mode environment and records non-secret evidence below. Missing provider/deployment inputs are blockers, not proof.

## Local build/runtime-target proof

Source/config proof captured locally after `npm run build` on 2026-07-04:

- `vite.config.ts` pins `nitro({ preset: 'vercel', vercel: { entryFormat: 'node', functions: { runtime: 'nodejs20.x' } } })`.
- Generated `.vercel/output/functions/__server.func/.vc-config.json` contains `"launcherType": "Nodejs"`, `"runtime": "nodejs20.x"`, and `"supportsResponseStreaming": true`.
- Generated `.vercel/output/nitro.json` contains `"preset": "vercel"`, `"entryFormat": "node"`, and `"runtime": "nodejs20.x"`.

This is build/runtime-target evidence for ticket #3. It is not deployed smoke evidence; external proof still requires the user-provisioned deployment/provider inputs below.


## Money boundary

Scope 1 stops at sandbox Autumn and test-mode Stripe evidence. Scope 1 does not run or claim live-mode money smokes. Live money remains gated by the Roadmap decision-door register: `Money rails` (Phase 5, ROADMAP L22) and the Phase 6 live-mode evidence door (ROADMAP L226). Any future live-mode smoke needs a named decision record before code, evidence, or public copy changes.

Human-facing copy for Scope 1 must not imply live payment, booking, dispatch, or autonomous fulfillment. `AGENTS.md` remains the trust boundary.

## Required deployed evidence template

When user provisioning is complete, record one row per passing proof item with only non-secret values. This matrix matches `.planning/scopes/SCOPE-EXECUTION-READINESS.md`; historical "five provider smokes" wording refers to rows 3-7, but rows 1-2 are also required for Scope 1 closeout.

| Order | Proof item | Host | Slug | Source refs | Dispatch/provider refs | Payload hashes | States | Operator next action | No secret values recorded |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | phase1 deployed header/canonical smoke | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | yes |
| 2 | phase2 support row | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | yes |
| 3 | inquiry + owner notification readback | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | yes |
| 4 | Resend provider smoke | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | yes |
| 5 | Novu provider smoke | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | yes |
| 6 | Autumn + Stripe test-mode smoke | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | yes |
| 7 | business-action Stripe test-mode smoke | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | _pending_ | yes |

## User-provisioned blockers

- Vercel project/deployment selected and provisioned.
- Deployed Convex source state exists with `CONVEX_URL` / `VITE_CONVEX_URL`.
- Deployed Clerk, canonical URL, host allowlist, Resend, Novu, Autumn sandbox, Stripe test-mode, and operator storage-state inputs are configured by name only.
- `SMOKE_PHASE2_BUSINESS_SLUG` points at a seeded eligible published business with complete `human_inquiry_owner_inbox` support state.

## Closeout notes

- Five friendly-owner activation packets remain GTM-side deferred debt, not engineering completion criteria.
- `STATE.md` deploy-smoke blockers must remain until the deployed smokes above pass with configured non-secret evidence.
