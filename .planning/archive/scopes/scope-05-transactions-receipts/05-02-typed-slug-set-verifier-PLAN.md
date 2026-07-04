---
phase: scope-05-transactions-receipts
plan: "05-02"
type: execute
wave: 2
depends_on: ["05-01"]
files_modified:
  - src/modules/business-action/internal/schema.ts
  - src/modules/business-action/internal/business-action.ts
  - src/modules/business-action/public.ts
  - convex/businessActionStore.ts
  - convex/businessActions.ts
  - src/lib/ui/contract-scans.ts
  - tests/unit/business-action/two-slug-receipt-verifier.test.ts
  - tests/copy/phase6-business-action-claims.test.ts
  - tests/seo/business-action-claims.test.ts
  - tests/imports/source-mining.test.ts
autonomous: true
requirements: [D1, D2]
user_setup: []
execution_scope: source_local_hackathon_spike
production_executable: false
must_haves:
  truths:
    - id: s5-closed-two-slug-set
      statement: "BusinessActionSlugValues is a closed, typed set of exactly two slugs (provision-paid-intake-endpoint + publish-agent-intake-endpoint); an unknown/caller-supplied slug returns a typed refusal; there is no generic executeAction."
    - id: s5-actionslug-threaded
      statement: "The card's actionSlug is threaded through every request/checkpoint/result/receipt hash payload and the verifier guard instead of the hardcoded BusinessActionSlug constant."
    - id: s5-verifier-both-slugs
      statement: "verifyReceiptStatus reconstructs complete + refused_no_consequence for BOTH slugs and still returns tampered/evidence_mismatch/stale_source/expired_mandate/unbound_provider_event for tampered or mismatched input."
    - id: s5-convex-literalunion
      statement: "Convex slug validators use literalUnion(BusinessActionSlugValues) instead of v.literal(BusinessActionSlug), and codegen/typecheck stay green."
    - id: s5-scans-no-new-allowance
      statement: "Copy/source/SEO/import scans pass with the second slug allowed only in owned contexts and no new autonomous/payment/marketplace/wallet allowances."
  artifacts:
    - path: src/modules/business-action/internal/schema.ts
      provides: "Closed two-slug union + per-slug card profiles preserving all D1 invariants."
    - path: src/modules/business-action/internal/business-action.ts
      provides: "actionSlug threaded through hashes and the verifier tamper oracle."
    - path: tests/unit/business-action/two-slug-receipt-verifier.test.ts
      provides: "Permanent two-slug success/refusal/tamper coverage (supersedes the 05-01 spike)."
  key_links:
    - from: door-amendment record (05-01)
      to: BusinessActionSlugValues widening
      via: "Each admitted slug passes the ratified D1 6-point checklist before entering the union."
    - from: card actionSlug
      to: receipt hash chain
      via: "verifyReceiptStatus recomputes source truths using the request/card actionSlug, so per-slug tamper detection holds."
---

<objective>
Make the 05-01 proof permanent: widen the Phase 6 one-slug pin to the closed, typed two-slug set and thread `actionSlug` through the entire hash chain and verifier so the receipt loop reconstructs success and refusal for both slugs without weakening any tamper detection.

Purpose: turn the one-slug spike into a bounded, typed loop that is safe-by-construction (D1 checklist enforced) and money-free-provable (D2 non-paid mirror).
Output: closed two-slug schema + card profiles, actionSlug-threaded hashes/verifier, Convex literalUnion validators, and extended copy/source/SEO scans.
</objective>

<context>
@.planning/scopes/scope-05-transactions-receipts/05-DOOR-AMENDMENT-2026-07-04.md
@.planning/scopes/scope-05-transactions-receipts/05-NONPAID-SLUG-CARD-LOCK.md
@.planning/adr/ADR-005-transactions-receipts.md
@src/modules/business-action/internal/schema.ts
@src/modules/business-action/internal/business-action.ts
@convex/businessActionStore.ts
@convex/businessActions.ts
@.planning/codebase/CONVENTIONS.md
</context>

<preflight_gates>
- Requires 05-01: the ratified door-amendment record (each slug passes the D1 6-point checklist) and the locked non-paid card. Do not widen the union before both exist.
- Requires 05-01 Task 1's proven threading contract; the spike is superseded by this plan's permanent test.
- `check:convex-codegen` requires network access to Convex (dev deployment reachable). A sandbox DNS failure on Sentry is not a codegen failure (per 06-VERIFICATION).
- Production public claims remain BLOCKED; this is source/local test-mode widening only.
</preflight_gates>

<standards>
Rules that bind this plan's files:
- TS hard spec (ENGINEERING-STANDARDS §TypeScript hard spec): no `any`/`as any`/`as unknown as`/non-null assertions; `BusinessActionSlugValues` stays a `const` tuple union with `type BusinessActionSlug = (typeof BusinessActionSlugValues)[number]`; per-slug card profile uses `satisfies Record<BusinessActionSlug, ...>` so it is exhaustive; expected failures return discriminated result unions (`business_action_unknown_slug`).
- Validator/source-of-truth pattern: Convex imports the domain tuple and uses the approved `literalUnion` helper (already imported in both convex files); no global validators dumping ground.
- Module seam: cross-module consumers import from `src/modules/business-action/public.ts` only; the widening stays inside `internal/`. Export the new slug values from `public.ts` if a consumer needs them.
- Convex standards: validators on every function, indexed reads, server-derived authority, no caller-supplied slug/authority/money fields.
- Money-rail quarantine + Phase-6 bloat detector: no payment/provider field leaks into core catalog/registry/discovery; the non-paid slug carries no Stripe provider and no amount/currency.
- /ponytail full: no speculative third slug, no generic action abstraction, no "future adapter" seam — exactly two slugs.
</standards>

<antipatterns>
- Adding a generic `executeAction` or accepting a caller-supplied/arbitrary slug → `isBusinessActionSlug` closed-set guard + a unit test asserting an unknown slug returns `business_action_unknown_slug`; `tests/imports/source-mining.test.ts`.
- Threading `actionSlug` wrong and silently breaking reconstruction for both slugs → `tests/unit/business-action/two-slug-receipt-verifier.test.ts` asserts complete/refused + tamper detection per slug (the 05-01 spike is the contract).
- A speculative third slug or a "later" adapter → /ponytail full; door record admits exactly the two D1-checklisted slugs.
- Payment/provider field in core catalog/registry/discovery, or Phase-6 field before card/checkpoint/receipt enforcement → `npm run test:source-mining` + ROADMAP bloat detector.
- New autonomous/payment/marketplace allowance in copy/SEO scans → `npm run test:copy` (phase6-business-action-claims) + `npm run test:seo` (business-action-claims) allow the phrase only in owned contexts.
</antipatterns>

<skill_usage>
- Task 1 (schema): `convex-schema-validator`, `domain-modeling` (slug-set language), `codebase-design` (per-slug card profile as a small exhaustive map), `ponytail` (exactly two slugs).
- Task 2 (verifier threading): `tdd`, `security-threat-model` (the verifier is the tamper oracle — reason about each guard), `codebase-design`.
- Task 3 (Convex validators): `convex-migration-helper` (v.literal → literalUnion), `convex-functions`, `convex-best-practices`, `convex-performance-audit` (indexed reads unchanged).
- Task 4 (scans): `tdd`, `security-best-practices` (money-rail quarantine), `seo-audit`/`ai-seo` (SEO claim tests).
</skill_usage>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Widen to the closed two-slug set + add the non-paid card profile</name>
  <files>src/modules/business-action/internal/schema.ts, src/modules/business-action/public.ts, tests/unit/business-action/two-slug-receipt-verifier.test.ts</files>
  <read_first>src/modules/business-action/internal/schema.ts (:21-24, :80-84, :61-66, :125-151), resolution of #31 (05-NONPAID-SLUG-CARD-LOCK.md), resolution of #30 (05-DOOR-AMENDMENT-2026-07-04.md)</read_first>
  <action>Replace the singleton `BusinessActionSlug` pin with the closed set: keep `BusinessActionSlugValues = ['provision-paid-intake-endpoint', 'publish-agent-intake-endpoint'] as const`, derive `type BusinessActionSlug = (typeof BusinessActionSlugValues)[number]`, and add a per-slug card profile map (`satisfies Record<BusinessActionSlug, {...}>`) fixing each slug's `resultArtifactRequirements`, `allowedExternalEvidenceProviders`, and amount/currency posture from the 05-01 card lock. Preserve `BusinessActionCardDefaults` invariants (`proposal_only`, `callable:false`, `paymentRequired:false`, `ownerApprovalRequired:true`, `receiptRequired:true`) for both slugs. Keep `isBusinessActionSlug` validating against the closed set. Write the permanent `two-slug-receipt-verifier.test.ts` (TDD: fails before Task 2 threads the hashes). Pattern: exported `Values` const tuple union + `satisfies` exhaustive map (CONVENTIONS §Types).</action>
  <verify>npx vitest run tests/unit/business-action/two-slug-receipt-verifier.test.ts tests/types/business-action-contracts.test.ts && npm run test:ts-standards</verify>
  <acceptance_criteria>
    - Exactly two slugs; both preserve all D1 card invariants.
    - The non-paid slug profile has no Stripe provider and no amount/currency.
    - An unknown slug is rejected by `isBusinessActionSlug`.
  </acceptance_criteria>
  <done>The typed closed set and per-slug card profiles exist.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Thread actionSlug through the hash chain and verifier</name>
  <files>src/modules/business-action/internal/business-action.ts, tests/unit/business-action/two-slug-receipt-verifier.test.ts</files>
  <read_first>src/modules/business-action/internal/business-action.ts (createCapabilityRequest :250-325, recordAuthorizationCheckpoint :327-364, verifyActionReceipt :638-696, validateMandate :698-724, verifyReceiptStatus :910-1002), resolution of #29 (05-01 spike threading contract)</read_first>
  <action>Replace every hardcoded `BusinessActionSlug` constant in hash payloads and guards with the request/card `actionSlug` value: `requestHash` (`:276`), the card/mandate `actionSlug` checks (`:263`, `:714`), `checkpointHash` (`:357`), the receipt payload hash, and the verifier guard `receipt.actionSlug !== BusinessActionSlug` (`:984`) — compare against the request's `actionSlug` and validate membership via `isBusinessActionSlug`. Keep the unknown-slug typed refusal (`business_action_unknown_slug`) for slugs outside the closed set. `verifyReceiptStatus` must recompute expected outcome/hashes from source using the request `actionSlug`, so tamper/evidence_mismatch/stale_source/expired_mandate/unbound_provider_event still hold per slug. Make the permanent test pass. Pattern: source-truth recomputation verifier (verifier recomputes, never trusts receipt fields).</action>
  <verify>npx vitest run tests/unit/business-action/two-slug-receipt-verifier.test.ts tests/unit/business-action/evidence-receipt-verifier.test.ts tests/unit/business-action/mandate-request-checkpoint.test.ts tests/unit/business-action/hermes-evidence.test.ts tests/unit/business-action/stripe-checkout-evidence.test.ts && npm run typecheck</verify>
  <acceptance_criteria>
    - Both slugs reconstruct complete + refused_no_consequence.
    - Tamper/evidence_mismatch/stale_source/expired_mandate/unbound_provider_event still fail loudly for both slugs.
    - No hardcoded singleton slug remains in any hash payload or guard.
  </acceptance_criteria>
  <done>The verifier is per-slug and the tamper oracle is intact.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Move Convex slug validators to literalUnion + codegen</name>
  <files>convex/businessActionStore.ts, convex/businessActions.ts</files>
  <read_first>convex/businessActionStore.ts (:5 literalUnion import, :78 `v.literal(BusinessActionSlug)`, :38 slug import), convex/businessActions.ts (:16 literalUnion import, :29 slug import), src/modules/common/convex-literals.ts</read_first>
  <action>Change `const actionSlug = v.literal(BusinessActionSlug)` (`businessActionStore.ts:78`) to `literalUnion(BusinessActionSlugValues)`, updating the import from `BusinessActionSlug` to `BusinessActionSlugValues`. Grep both convex files for any remaining `v.literal(BusinessActionSlug)` or singleton usage in args/schema and switch to the union. Preserve indexes (`by_status` etc.) and forbidden-field guards (no caller-supplied authority/money/provider/slug beyond the closed set). Run codegen. Pattern: approved `literalUnion` helper (already used for every other Phase-6 union in these files); no bespoke validator.</action>
  <verify>npm run check:convex-codegen && npm run typecheck && npx vitest run tests/unit/convex/business-actions-runtime.test.ts</verify>
  <acceptance_criteria>
    - No `v.literal(BusinessActionSlug)` remains; validators accept exactly the closed set.
    - Codegen and typecheck are green (network-reachable Convex).
    - Forbidden-field guards and indexed reads are unchanged.
  </acceptance_criteria>
  <done>Convex accepts the typed slug set and rejects unknown slugs.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Extend copy/source/SEO scans for the second slug</name>
  <files>src/lib/ui/contract-scans.ts, tests/copy/phase6-business-action-claims.test.ts, tests/seo/business-action-claims.test.ts, tests/imports/source-mining.test.ts</files>
  <read_first>src/lib/ui/contract-scans.ts, tests/copy/phase6-business-action-claims.test.ts, tests/seo/business-action-claims.test.ts, .planning/GTM-READINESS.md, AGENTS.md (:90-92)</read_first>
  <action>Extend the Phase-6 scan rules so `publish-agent-intake-endpoint` is allowed only in owned/proven contexts (planning docs, `src/modules/business-action/`, `convex/businessAction*.ts`, owner/admin business-action routes, Phase-6 tests) exactly like the paid slug, and so the money-free mirror never carries a payment/Stripe/amount claim. Keep forbidden: `executeAction`, arbitrary slug, autonomous fulfillment, agent checkout, wallet, credits, custody, settlement, Connect, x402, marketplace, live/production payment. Add source-mining coverage rejecting a generic-action or route-local fixture drift for the second slug. Pattern: contract-scans drift rules + owned-context allowlist (mirrors the paid-slug rules already present).</action>
  <verify>npm run test:copy && npm run test:seo && npm run test:source-mining && npm run test:imports</verify>
  <acceptance_criteria>
    - Second slug allowed only in owned/proven contexts; forbidden terms still fail.
    - The non-paid slug cannot be described with any payment/Stripe/money language.
    - No new autonomous/marketplace/wallet allowance is introduced.
  </acceptance_criteria>
  <done>Scans protect the widened public truth with zero new allowances.</done>
</task>

</tasks>

<how_to_execute>
Fresh session: read the scope INDEX, then execute this plan's tasks in order; TDD where marked; run each task's `<verify>` after the task; write the SUMMARY.md named in `<output>`. Load `convex-schema-validator`, `convex-migration-helper`, `tdd`, `security-threat-model`, `codebase-design`, `ponytail` first. Do not run formatters/linters/full suites.
</how_to_execute>

<verification>
- [ ] npx vitest run tests/unit/business-action/two-slug-receipt-verifier.test.ts tests/unit/business-action/evidence-receipt-verifier.test.ts tests/unit/business-action/mandate-request-checkpoint.test.ts tests/unit/business-action/hermes-evidence.test.ts tests/unit/business-action/stripe-checkout-evidence.test.ts
- [ ] npx vitest run tests/unit/convex/business-actions-runtime.test.ts tests/types/business-action-contracts.test.ts
- [ ] npm run typecheck
- [ ] npm run check:convex-codegen
- [ ] npm run test:ts-standards
- [ ] npm run test:copy
- [ ] npm run test:seo
- [ ] npm run test:source-mining
- [ ] npm run test:imports
</verification>

<success_criteria>
- The closed two-slug set ships; unknown/caller-supplied slugs are refused.
- `actionSlug` is threaded through every hash and the verifier; success + refusal reconstruct for both slugs; tamper detection holds.
- Convex validators use `literalUnion`; codegen/typecheck green.
- Copy/source/SEO/import scans green with zero new allowances.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-05-transactions-receipts/05-02-SUMMARY.md` stating: source/local proof only; production proof not claimed; Stripe test-mode only; provider-smoke status not counted as external proof unless configured evidence passes.
</output>
