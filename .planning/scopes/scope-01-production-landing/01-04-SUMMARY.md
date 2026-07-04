# 01-04 Summary — Deploy target, CI gate, and smoke evidence

## Status

Source/config tasks are complete. Deployed smoke evidence is **not** captured yet because the user-provisioned deployment/provider inputs in `01-04-deploy-ci-and-smoke-evidence-PLAN.md` are still absent. Scope 1 therefore has local/source proof for the deploy target, PR gate, and money boundary, but no external deployment proof.

## Source/config changes

- `vite.config.ts` pins Nitro to Vercel Node serverless:
  - `preset: 'vercel'`
  - `vercel.entryFormat: 'node'`
  - `vercel.functions.runtime: 'nodejs20.x'`
- `.github/workflows/eval-gate.yml` adds the four cheap deterministic PR scans:
  - `npm run test:types`
  - `npm run test:source-mining`
  - `npm run test:ts-standards`
  - `npm run test:seo`
- `.planning/scopes/scope-01-production-landing/EVIDENCE-deploy-smokes.md` now records:
  - runtime target proof from generated Vercel/Nitro output.
  - sandbox/test-mode money boundary.
  - the non-secret deployed smoke evidence template.
  - user-provisioned blockers.
- `SCOPE-01-INDEX.md` now separates complete source/config status from blocked deployed-smoke status.

## Runtime target proof for #3

`npm run build` generated the runtime evidence needed for the Vercel decision:

- `.vercel/output/functions/__server.func/.vc-config.json` contains `"launcherType": "Nodejs"`, `"runtime": "nodejs20.x"`, and `"supportsResponseStreaming": true`.
- `.vercel/output/nitro.json` contains `"preset": "vercel"`, `"entryFormat": "node"`, and `"runtime": "nodejs20.x"` under `config.vercel.functions`.

This confirms the local generated Vercel output targets Node serverless, not edge. The runtime keeps raw `Request` body handling available for existing webhook routes and preserves WebCrypto/HMAC primitives needed for scope-3 agent-signature / Web Bot Auth verification. D1 does not reopen.

Issue #3 was resolved and closed: https://github.com/CreasyBear/Agentic-Economy/issues/3#issuecomment-4880427108

## CI boundary for #7

Implemented PR-blocking workflow file:

- `.github/workflows/eval-gate.yml`

PR-blocking set:

- typecheck
- Convex codegen dry-run
- unit + integration
- type-level contract tests
- copy, SEO, UI-contract, import, source-mining, and TypeScript-standard scans
- answer eval
- build

Not PR-blocking:

- `test:e2e`
- `test:a11y`
- `test:graph-freshness`
- deployed provider/header smokes

No GitHub deploy-smoke workflow was added. The deploy-smoke specs require deployed/provider env plus local Clerk storage-state JSON files checked with `existsSync()`, so GitHub execution needs a separate storage-state secret materialization design. Until that exists, deploy smokes remain operator-local/manual and fail loud when inputs are missing.

Issue #7 was resolved and closed: https://github.com/CreasyBear/Agentic-Economy/issues/7#issuecomment-4880427340

## Money boundary for #6

Scope 1 stops at sandbox Autumn and test-mode Stripe evidence. Live-mode money smokes remain out of scope and require a named money-rail decision record before code, evidence, or public copy changes. The evidence file names the Roadmap money-rail doors (`ROADMAP.md` L22 and L226).

Human-facing Scope 1 copy must not imply live payment, booking, dispatch, or autonomous fulfillment. `AGENTS.md` remains the trust boundary.

Issue #6 was resolved and closed: https://github.com/CreasyBear/Agentic-Economy/issues/6#issuecomment-4880427209

## Local/source proof

- `npm run build` — passed; generated Vercel/Nitro Node runtime evidence.
- `npm run typecheck` — passed.
- `npm run test:types && npm run test:source-mining && npm run test:ts-standards && npm run test:seo` — passed.
- `npm run test:copy` — passed.
- `npm run test:all` — passed after the wave-wide fixes recorded in `01-01-SUMMARY.md`, `01-02-SUMMARY.md`, and `01-03-SUMMARY.md`.

## Deferred deployed proof

No deployed smoke rows are recorded yet. A smoke counts as external proof only when it passes against a configured deployed sandbox/test-mode environment and records non-secret evidence in `EVIDENCE-deploy-smokes.md`.

Still blocked on user setup:

- Vercel deployment selection/provisioning.
- deployed Convex source state and deployment env.
- deployed Clerk/operator storage-state artifacts.
- Resend + Novu provider configuration.
- Autumn sandbox + Stripe test-mode configuration.
- seeded eligible published business and support row for `SMOKE_PHASE2_BUSINESS_SLUG`.

Issue #5 remains the deployed evidence gate. `STATE.md` deploy-smoke blockers are not cleared by this source/config summary.
