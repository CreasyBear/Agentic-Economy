# Catalogue development cold review — purchase contracts, wave 1

Reviewed 2026-09-08 against the current uncommitted source. Read AGENTS.md and PRODUCT.md. Runtime: Node v22.22.0, npm 11.5.1. Initial review was read-only except this report; the parent subsequently assigned the bounded inspector parity fix recorded below. No deployment or paid requests. Findings include existing seams exposed by the new managed catalogue flow, not only newly introduced lines.

## Findings and smallest fixes

### P1 — An idempotent Call replay still depends on a new Provider request — fixed

`convex/capabilityQuotes.ts:903–945` accepts a consumed Quote with the matching Call/idempotency key, but returns the same inspection material as an unused Quote. `convex/lib/callLifecycle/authorityHandlers.ts:529–544` always performs the live inspection before reaching `callHandler`, including that replay. If the Provider is unavailable or its amount changes after the first successful Call, retrying the original request returns `operation_not_current` instead of its durable result. It also releases the original customer input again. Expiry is checked before the consumed branch, so a retry after Quote expiry cannot reach the Call either.

Smallest fix: distinguish an existing matching Call in the read result and resolve its durable result/status before Quote freshness and Provider inspection. Preserve identity and current recovery-access checks. For an unused Quote retain all current freshness checks. Add a real canonical action test: complete/consume a Quote, change the Provider challenge (then expire the Quote), retry the same key, assert the same Call and zero further network requests.

Implemented: `readForCall` distinguishes a matching consumed Call and applies Quote expiry only to unused Quotes. The canonical Call action uses existing persisted-Call authority resolution, then reads the durable result (using the existing result serializer) or returns pending without inspection, reservation or dispatch. The regression uses the actual Convex action with an expired consumed Quote, retained x402 requirement, a persisted refusal and then an unfinished Call; both return their existing state with zero network requests. A different idempotency key is refused.

### P2 — Quote inspection accepts an x402 response that execution cannot consume — fixed

`src/modules/capability-supply/internal/x402-seller-endpoint-inspector.ts:333–397` accepts v2 PaymentRequired supplied only in the response body. The new managed Quote test expressly exercises this at `tests/unit/convex/capability-quotes.test.ts:678–680`. But `src/modules/capability-supply/internal/route-transport-x402.ts:678–681` reads only `payment-required` and discards the body. That same Provider is therefore considered Quote-ready but execution deterministically fails with `payment_provider_requirement_stale`, after reservation and another release of customer input.

Pinned SDK evidence: package.json pins `@x402/core` 2.23.0. Its `node_modules/@x402/core/dist/cjs/client/index.js:1024–1034` implements v2 extraction from PAYMENT-REQUIRED and permits body fallback only for v1. Body-only v2 is bespoke extra compatibility, not an SDK requirement.

Smallest fix: align inspection with the SDK's v2 header contract and update the Quote fixture to supply the official header. If body-only v2 is an intentional supported extension, share the bounded extractor with execution and test that extension end-to-end; do not leave two different admission rules. Keep AE's bounded reads, source matching and conflict controls around the SDK.

Implemented: removed body-only v2 admission while preserving bounded body inspection and header/body conflict checks. The body-only inspector test now expects `challenge_missing`; the successful Quote test provides an SDK-encoded PAYMENT-REQUIRED header. Verification: `npm exec -- vitest run tests/unit/capability-supply/x402-seller-endpoint-inspector.test.ts tests/unit/convex/capability-quotes.test.ts` — 2 files, 31 tests passed. Scoped `git diff --check` passed. An initial `npm run test:unit -- ...` unintentionally included the script's entire `tests/unit` directory and was stopped promptly; no broad-suite result is claimed.

### P2 — The Quote can label a tax split with a different policy than the one that produced it — fixed

`convex/capabilityQuotes.ts:403` snapshots `callTaxBps` during preparation. Network inspection, FX lookup and financial reads occur before issuance. `issueQuoteHandler` reads the current commercial policy, but `formanceFinancialSnapshot` has no policy digest (`:146–159`), the validation at `:475–481` only checks hard-coded generation 1, and `:494` computes tax using the earlier snapshot. The Quote then records the current policy digest (`:603`, `:674`). A policy change between preparation and issuance can therefore create a Quote whose tax amounts contradict its attributed policy. The zero-tax change makes this especially visible when moving between an absent/zero Call tax and a configured positive Call tax.

Smallest fix: calculate the split from `policyGate.controls.tax.callTaxBps ?? 0` in the issuance mutation, or carry and compare the preparation policy digest before using its tax value. Since funding/exposure setup also uses preparation policy facts, carrying/comparing the digest protects that wider snapshot as well. Add a deterministic test that changes the policy between the two mutations and expects refusal/re-preparation rather than a mixed-policy Quote.

Implemented: the internal financial snapshot carries its preparation policy digest, and issuance requires it to match the freshly read commercial policy. A changed Call tax policy between preparation and issuance now produces retryable `inspection_unavailable` instead of a mixed-policy Quote. The regression changes the actual policy row between those mutations.

### P2 — Fresh challenge failures omit the fact that customer input has been released — fixed

`src/modules/capability-supply/internal/route-transport-x402.ts:656–664` sends the real mapped query/body to the Provider. The response-mismatch branch at `:685–694` returns `refused(..., false, ...)` with payment-not-submitted evidence but no `queryReleaseStatus`. The network-exception branch at `:665–674` also omits it, although receipt by the Provider is uncertain. The observation contract already supports `released` and `unknown`; successful/paid exception paths use it elsewhere in this file. Absence obscures the material distinction between refusing before customer data leaves and refusing after an unpaid request.

Smallest fix: mark `queryReleaseStatus: 'released'` after an observed HTTP response and `unknown` on a send exception. Preserve payment-not-submitted independently. Assert these fields in the existing stale-challenge transport test and a send-timeout test. This does not claim the Provider performed the paid effect.

Implemented and tested for stale amount (`released`) and send timeout (`unknown`), independently retaining `paymentSubmissionStatus: not_submitted` and zero signer calls. All later refusals after a successful unpaid challenge also retain `released`; a signer-unavailable regression verifies this without a paid request.

## Controls that are present

- Quote preflight now checks source-write admission, live agent/selected-Tool authority, environment, contract input and managed authority mode before entering the inspection action (`capabilityQuotes.ts:305–349`). Invalid input and an unknown credential are tested through the action handler.
- Selected request serialization is shared by Quote and transport through `prepareX402Request`; the admitted Bazaar transport test uses a real admitted binding and verifies the selected amount and query values.
- The committed challenge and upstream amount now propagate from Quote to dispatch, transport and both normal/recovery receipts. Transport compares the fresh selected requirement before signing. Receipt amounts no longer necessarily inherit the listing's example price.
- Reference pricing uses bounded decimal arithmetic with local precision and rounds AUD upward. Booking checks immutable FX evidence integrity independently of current freshness, which is appropriate for recovery. Zero Call tax has targeted monetary validation rather than allowing zero for every ledger variable.
- Readiness observations do not rotate an already-fresh current Tool, avoiding needless invalidation of concurrent Quotes. The integration test verifies stable current digest after repeated observations and rejection of a changed target digest.

## Remaining verification seams

The new successful Quote test manually stitches preparation, inspection, readiness recording and issuance together; it does not run the successful action through its actual network and financial boundaries. The transport test separately starts with manually supplied committed material. Add one narrow orchestration test spanning these existing components, mocking only network/custody/ledger boundaries, to prove that the committed challenge and amount reach the signer and resulting receipt. Include consumed replay and policy-change cases above rather than adding broad infrastructure.

The initial inspection action accepted only Tool/input and reloaded its target. The bounded fix now carries the principal, rechecks its captured inspection target after DNS/request preparation, and invokes the existing `resolveCallAgentAuthority` immediately before sending. It requires the current managed authority mode and matching environment. Actual Convex action regressions revoke the credential or withdraw the publication during DNS preparation and verify no outbound send.

Residual boundaries: the initial financial-preflight target digest is not carried into the inspection action; a source change before that action starts is evaluated as the current authorized Tool. The new check prevents drift from the action's own captured target during preparation. Database reads/mutations and an external HTTP send are not atomic: a change after the final checks can still race dispatch. No distributed lock or new workflow was introduced, and post-send source drift still refuses readiness recording. These precise limits remain, rather than claiming atomic data-release authorization.

Follow-up verification: `npm exec -- vitest run tests/unit/convex/capability-quotes.test.ts tests/unit/convex/capability-call-authority-boundary.test.ts tests/unit/capability-supply/x402-committed-request.test.ts tests/unit/capability-supply/x402-seller-endpoint-inspector.test.ts tests/integration/managed-x402-inspection.test.ts` — 5 files, 118 tests passed. Final Quote-only rerun after fixture type narrowing: 12 passed. Final committed-request rerun including signer-unavailable coverage: 5 passed. Scoped diff whitespace checks and `npm run typecheck` passed.

No claim of live Formance zero-tax acceptance, custody settlement, deployed compatibility or production readiness follows from this source review.
