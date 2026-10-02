# Code size and hotspots — 29 September 2026

**Lens.** Lines of code by top-level area, files over 300 / 500 / 1,000 lines, 60-day churn times current size, and Convex root files over 200 lines.

**Checkout.** `722d85158ef9` on `well-28/journey-fragility` (2026-09-29 03:30 +0800). Counts are the working tree, so uncommitted edits are included. Twenty-one code files over 500 lines differ from HEAD; they are marked \*. Three churn-ranked paths do too: `tests/fixtures/convex-api-kind-snapshot.json`, `convex/_generated/api.d.ts`, and `tests/unit/server/agent-access-oauth-api.test.ts`.

**Line count.** UTF-8 `text.split('\n').length`, the same counter as `scanFileSizes` (`src/lib/ui/contract-scans/file-size-ratchet.ts:35`) and `scanConvexFacadeSizes` (`src/lib/ui/contract-scans/convex-facade-size.ts:34`). A trailing newline counts as one extra line versus `wc -l`. Code is `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`. Generated means a path under `_generated/` or a `*.gen.ts` file. Test means a path under `tests/` or a `.test.` / `.spec.` name.

**Verdict.** The `src` + `convex` size gate is exactly on its pins: 206 files over 300, 63 over 500, none over 1,000. The seven-area census is larger because `tools/`, tests, and generated files sit outside that gate. Of 204 code files over 500 lines, 121 are tests, 82 are source, and 1 is generated. Nineteen of those source files are under `tools/`, and all four source files over 1,000 lines are there. Sixty-day edit heat times current size is a lockfile, generated route and API files, large tests, a finished ledger extraction, and `supply-actions.ts`.

## Area size

| Area | Files | Lines | Source | Tests | Generated |
|---|---:|---:|---:|---:|---:|
| `src/components` | 648 | 62,216 | 57,240 (610) | 4,976 (38) | — |
| `src/modules` | 632 | 112,308 | 111,963 (630) | 345 (2) | — |
| `src/routes` | 157 | 6,903 | 6,903 (157) | — | — |
| `src/lib` | 160 | 20,828 | 20,828 (160) | — | — |
| `convex` | 749 | 94,606 | 84,669 (723) | 8,042 (21) | 1,895 (5) |
| `tools` | 115 | 29,098 | 29,098 (115) | — | — |
| `tests` | 882 | 211,022 | — | 211,022 (882) | — |
| **Seven areas** | **3,343** | **536,981** | | | |

`src/modules` is the largest hand-written area (111,963 source lines). `tests/` is the largest area (211,022). The other six areas together are 325,959. `src/routeTree.gen.ts` is 3,526 lines and is outside these four `src/` folders; it is rank 2 in the churn table.

## Files over 300, 500, and 1,000

Thresholds are strict: a file of exactly 300, 500, or 1,000 is not over the line. The file-size ratchet uses the same cut (`src/lib/ui/contract-scans/file-size-ratchet.ts:41-43`).

| Kind | Over 300 | Over 500 | Over 1,000 |
|---|---:|---:|---:|
| Source | 237 | 82 | 4 |
| Test | 241 | 121 | 17 |
| Generated | 1 | 1 | 1 |
| **All code in the seven areas** | **479** | **204** | **22** |

Source files over 500, by area: `src/modules` 53, `tools` 19, `src/lib` 7, `src/components` 2, `src/routes` 1. The only route is `src/routes/api.internal.provider-consequence.ts` (632). The two components are `src/components/ae/market/AeX402Directory.tsx` (621) and `src/components/ae/operator/AeOperatorDataTable.tsx` (553).

The import gate scans `src/**/*.{ts,tsx}` and `convex/**/*.ts`, drops `_generated`, `*.test.*`, and `routeTree.gen.ts`, and also drops `convex/devSeed.ts` (`tests/imports/file-size-ratchet.test.ts:25-34`). That set is 2,290 files and 282,581 lines, and it matches the pinned ceilings with no slack: over 300 = 206, over 500 = 63, over 1,000 = 0 (`tests/imports/file-size-ratchet.test.ts:11-14`). `convex/devSeed.ts` is 44 lines, so dropping it does not change the buckets. `tools/` is not in the scan, which is why the four source files over 1,000 lines do not trip the gate.

### Over 1,000

| Lines | Kind | File |
|---:|---|---|
| 2,384 | test | `convex/agentAccessOAuth.test.ts` |
| 2,363 | test | `tests/integration/capability-call-workpool.test.ts` |
| 1,979 \* | test | `tests/unit/server/agent-access-oauth-api.test.ts` |
| 1,810 | test | `tests/unit/convex/workspace-membership-observation.test.ts` |
| 1,651 | test | `tests/unit/convex/capability-call-worker-harness.ts` |
| 1,597 | test | `tests/unit/capability-supply/route-transport-x402.test.ts` |
| 1,501 \* | generated | `convex/_generated/api.d.ts` |
| 1,487 | test | `tests/unit/market-terminal/cold-loop.test.ts` |
| 1,434 | test | `convex/agentAccessPrincipals.test.ts` |
| 1,360 | test | `tests/unit/convex/capability-call-authority-boundary.test.ts` |
| 1,316 | source | `tools/dev/local-dev.ts` |
| 1,303 \* | test | `tests/unit/convex/workspace-decommission.test.ts` |
| 1,297 | test | `tests/unit/ui/demand-console.test.tsx` |
| 1,264 | test | `tests/unit/convex/money-x402-payment-attempts.test.ts` |
| 1,237 | test | `tests/unit/convex/money-account-funding.test.ts` |
| 1,234 | test | `convex/securityAccountHistory.test.ts` |
| 1,234 | test | `tests/integration/dev-seed-public-catalog-facts.test.ts` |
| 1,095 | source | `tools/release/tool-gateway-production-smoke.ts` |
| 1,086 | test | `tests/integration/money-formance-boundary.test.ts` |
| 1,078 | source | `tools/release/tool-gateway-production-smoke-hosted-owner.ts` |
| 1,074 | source | `tools/release/tool-gateway-production-smoke-receipt.ts` |
| 1,004 | test | `tests/integration/capability-supply-owner-funnel-publish.test.ts` |

All four source files over 1,000 are under `tools/`: `tools/dev/local-dev.ts` (1,316), `tools/release/tool-gateway-production-smoke.ts` (1,095), `tool-gateway-production-smoke-hosted-owner.ts` (1,078), and `tool-gateway-production-smoke-receipt.ts` (1,074).

### Over 500

204 files. \* means the working tree differs from `722d85158ef9`.

| Lines | Kind | File |
|---:|---|---|
| 2,384 | test | `convex/agentAccessOAuth.test.ts` |
| 2,363 | test | `tests/integration/capability-call-workpool.test.ts` |
| 1,979 \* | test | `tests/unit/server/agent-access-oauth-api.test.ts` |
| 1,810 | test | `tests/unit/convex/workspace-membership-observation.test.ts` |
| 1,651 | test | `tests/unit/convex/capability-call-worker-harness.ts` |
| 1,597 | test | `tests/unit/capability-supply/route-transport-x402.test.ts` |
| 1,501 \* | generated | `convex/_generated/api.d.ts` |
| 1,487 | test | `tests/unit/market-terminal/cold-loop.test.ts` |
| 1,434 | test | `convex/agentAccessPrincipals.test.ts` |
| 1,360 | test | `tests/unit/convex/capability-call-authority-boundary.test.ts` |
| 1,316 | source | `tools/dev/local-dev.ts` |
| 1,303 \* | test | `tests/unit/convex/workspace-decommission.test.ts` |
| 1,297 | test | `tests/unit/ui/demand-console.test.tsx` |
| 1,264 | test | `tests/unit/convex/money-x402-payment-attempts.test.ts` |
| 1,237 | test | `tests/unit/convex/money-account-funding.test.ts` |
| 1,234 | test | `convex/securityAccountHistory.test.ts` |
| 1,234 | test | `tests/integration/dev-seed-public-catalog-facts.test.ts` |
| 1,095 | source | `tools/release/tool-gateway-production-smoke.ts` |
| 1,086 | test | `tests/integration/money-formance-boundary.test.ts` |
| 1,078 | source | `tools/release/tool-gateway-production-smoke-hosted-owner.ts` |
| 1,074 | source | `tools/release/tool-gateway-production-smoke-receipt.ts` |
| 1,004 | test | `tests/integration/capability-supply-owner-funnel-publish.test.ts` |
| 991 | test | `tests/integration/capability-supply-owner-funnel-harness.ts` |
| 986 | test | `tests/unit/capability-supply/publication-importers-openapi.test.ts` |
| 978 | test | `tests/integration/chat-scheduled-authority.test.ts` |
| 976 | test | `tests/unit/command-panel/command-panel.test.tsx` |
| 970 | source | `src/modules/chat/tool-card.ts` |
| 960 \* | test | `tests/unit/ui/supply-source-native-start.test.tsx` |
| 958 | test | `tests/unit/capability-supply/cdp-x402-payment-signer.test.ts` |
| 949 | source | `src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts` |
| 946 | test | `tests/unit/money/formance.test.ts` |
| 943 | test | `tests/unit/routes/call-status-route.test.tsx` |
| 933 | test | `tests/unit/convex/capability-quotes.test.ts` |
| 916 | test | `tests/unit/action-execution/in-memory-action-execution.test.ts` |
| 910 \* | test | `tests/unit/chat/chat-agent-tools.test.ts` |
| 906 | test | `tests/unit/market-terminal/doctor.test.ts` |
| 894 | source | `src/modules/money/internal/formance-transaction-templates.ts` |
| 893 | test | `tests/helpers/convex-fixtures.ts` |
| 882 \* | test | `tests/unit/schema/convex-schema.test.ts` |
| 875 | source | `src/lib/server/mcp-api.ts` |
| 874 | test | `tests/unit/routes/provider-consequence-coverage-gaps.test.ts` |
| 862 | source | `src/modules/capability-supply/internal/publication/publish.ts` |
| 862 \* | source | `src/modules/money/internal/convex-schema.ts` |
| 854 \* | source | `src/modules/capability-supply/source-preview.ts` |
| 853 | test | `tests/integration/capability-supply-owner-funnel-withdraw-republish.test.ts` |
| 840 | test | `tests/unit/convex/workspace-team-directory.test.ts` |
| 838 | source | `src/modules/capability-supply/internal/supply-funnel/source-first-owner.ts` |
| 832 | test | `tests/unit/capability-execution/jit-provider-consequence.test.ts` |
| 820 | source | `src/modules/capability-supply/internal/route-transport-x402.ts` |
| 818 | test | `tests/unit/dev/local-dev.test.ts` |
| 810 | test | `tests/integration/registry-api.test.ts` |
| 810 | test | `tests/unit/capability-supply/supply-actions.test.ts` |
| 805 | source | `src/lib/server/call-api.ts` |
| 803 | test | `tests/unit/authority/context/consequence-authority.test.ts` |
| 803 | source | `tools/dev/x402-local-canary.ts` |
| 798 | test | `tests/unit/convex/capability-call-approval.test.ts` |
| 793 | test | `tests/unit/convex/workspace-invitation-observation.test.ts` |
| 788 | test | `tests/unit/convex/authority-boundary.test.ts` |
| 785 | test | `tests/integration/provider-connection-attempts.test.ts` |
| 784 | source | `src/modules/capability-execution/call-worker/x402Authorization.ts` |
| 784 | source | `src/modules/discovery/internal/developer-discovery-route-projection.ts` |
| 783 | source | `src/modules/authority/context/consequence-authority.ts` |
| 774 | test | `tests/unit/secrets/infisical-cloud.test.ts` |
| 770 | test | `tests/unit/principal-account/account/account-registry.test.ts` |
| 770 | test | `tests/unit/server/call-recovery-api.test.ts` |
| 765 \* | test | `tests/integration/chat-durable-messaging-share.test.ts` |
| 763 | source | `tools/release/tool-gateway-production-smoke-hosted-money.ts` |
| 756 \* | test | `tests/unit/market/x402-directory-page.test.tsx` |
| 749 | test | `tests/unit/action-execution/spending-policy.test.ts` |
| 738 | test | `tests/unit/money/stripe-money-provider.test.ts` |
| 735 | test | `tests/unit/convex/capability-call-worker-charge.test.ts` |
| 735 | test | `tests/unit/release/tool-gateway-production-smoke-harness.ts` |
| 734 | source | `src/modules/principal-account/external-identity/registry.ts` |
| 733 | source | `src/modules/money/internal/formance-reads.ts` |
| 732 | source | `src/lib/ui/status-presentation.ts` |
| 732 | test | `tests/unit/convex/money-managed-call.test.ts` |
| 722 | source | `tools/ae/cli.ts` |
| 719 | test | `tests/unit/capability-supply/publication-importers-x402.test.ts` |
| 712 | source | `src/modules/capability-supply/internal/convex-schema.ts` |
| 705 | source | `src/modules/agent-access/policy.ts` |
| 704 | source | `src/modules/action-execution/spending-policy.ts` |
| 704 | test | `tests/unit/convex/agent-credential-replacement.test.ts` |
| 695 | test | `tests/unit/market-terminal/recovery.test.ts` |
| 694 | source | `tools/ae/commands/manifest.ts` |
| 691 | test | `tests/integration/capability-publication-harness.ts` |
| 690 | test | `tests/unit/convex/money-x402-payment-attempt-fixtures.ts` |
| 690 | test | `tests/unit/server/diagnostic-routes.test.ts` |
| 688 | source | `src/modules/agent-access/agent-access.functions.ts` |
| 688 | test | `tests/unit/capability-supply/eligible-supply.test.ts` |
| 688 | test | `tests/unit/convex/personal-account-deletion.test.ts` |
| 687 | source | `tools/dev/eval-ds-grammar.ts` |
| 685 | test | `tests/integration/capability-publication-probe.test.ts` |
| 684 | test | `tests/unit/convex/capability-call-reservation.test.ts` |
| 683 \* | test | `tests/unit/capability-supply/supply-source-preview.test.ts` |
| 678 | test | `tests/unit/market-terminal/doctor-test-harness.ts` |
| 676 | source | `src/modules/money/internal/payout-connect-http.ts` |
| 671 | test | `tests/unit/authority/delegation/delegation.test.ts` |
| 669 | test | `tests/unit/server/clerk-organization-membership-webhook.test.ts` |
| 668 | test | `tests/unit/market-terminal/account.test.ts` |
| 665 | source | `tools/dev/action-execution-evidence-packet.ts` |
| 664 | source | `src/modules/capability-execution/call-worker/jitProviderConsequence.ts` |
| 664 | source | `src/modules/principal-account/account/registry.ts` |
| 663 | test | `tests/unit/convex/workload-cron.test.ts` |
| 657 | test | `tests/unit/convex/capability-call-projection.test.ts` |
| 654 | source | `src/modules/agent-access/oauth-state.ts` |
| 653 \* | test | `tests/unit/routes/agent-access-authorize.test.tsx` |
| 652 | test | `tests/unit/chat/chat-system.test.ts` |
| 651 | test | `tests/unit/convex/interactive-consequence-context.test.ts` |
| 650 | test | `tests/unit/capability-supply/supplied-candidate-qualification.test.ts` |
| 649 | test | `tests/unit/convex/seller-onboarding-canary-funding-readiness.test.ts` |
| 648 | test | `tests/unit/routes/secret-lifecycle.test.ts` |
| 647 | source | `src/modules/action-execution/canonical-claim.ts` |
| 646 | source | `src/modules/capability-supply/internal/provider-connection/lease.ts` |
| 642 | test | `tests/unit/convex/interactive-authority.test.ts` |
| 641 | source | `tools/dev/fixtures/capability-supply/development-published-tool-evidence.ts` |
| 638 | source | `src/modules/capability-execution/call-worker/runRelease.ts` |
| 632 | source | `src/routes/api.internal.provider-consequence.ts` |
| 631 | source | `tools/dev/spending-policy-evidence-packet.ts` |
| 628 | source | `src/modules/capability-supply/internal/transport-adapters.ts` |
| 628 | source | `tools/dev/fixtures/provider-tool/development-provider-tool-objective.ts` |
| 624 | source | `src/modules/capability-execution/call-worker/call-execution-gates.ts` |
| 621 \* | source | `src/components/ae/market/AeX402Directory.tsx` |
| 620 | test | `tests/unit/convex/x402-route-authorization.test.ts` |
| 619 | source | `src/modules/money/internal/account-funding-http.ts` |
| 619 | test | `tests/unit/market-terminal/cli-errors-origin.test.ts` |
| 617 | test | `tests/unit/agent-access-oauth-state.test.ts` |
| 613 | test | `tests/unit/deployment/deployment-manifest.test.ts` |
| 612 | source | `src/modules/action-execution/durable.ts` |
| 612 | source | `src/modules/security/source-write-admission.ts` |
| 611 | source | `src/modules/capability-supply/internal/route-transport-http-json.ts` |
| 607 | source | `src/modules/capability-supply/internal/facilitator-discovery-ingest.ts` |
| 607 | source | `src/modules/capability-supply/supply-actions.ts` |
| 606 | source | `tools/dev/unrestricted-test-only-evidence-packet.ts` |
| 605 | source | `src/lib/deployment/manifest.ts` |
| 604 | test | `tests/unit/market-terminal/cli-errors-help.test.ts` |
| 603 | test | `tests/unit/capability-supply/provider-connection-handoff.test.ts` |
| 600 \* | source | `src/modules/capability-execution/internal/convex-schema.ts` |
| 600 | source | `src/modules/market-demand/market-demand.actions.ts` |
| 599 | test | `tests/unit/market-terminal/call.test.ts` |
| 598 | source | `src/modules/capability-supply/internal/tool-projection-wire-serialize.ts` |
| 596 | source | `src/modules/capability-supply/supply-management-service.ts` |
| 594 | test | `tests/integration/capability-supply-owner-sandbox-staging.test.ts` |
| 591 \* | source | `src/modules/capability-supply/internal/x402-seller-endpoint-inspector.ts` |
| 590 | test | `tests/unit/capability-supply/provider-connection.test.ts` |
| 589 | test | `tests/unit/convex/capability-call-worker-reconcile.test.ts` |
| 587 | test | `convex/agentSpendingPolicy.test.ts` |
| 587 | source | `src/modules/registry/internal/projection-attempts.ts` |
| 586 | test | `tests/helpers/recovery-break-glass-driver-fixture.ts` |
| 581 | test | `tests/unit/convex/workload-cron.harness.ts` |
| 577 | test | `tests/unit/capability-supply/published-tool.test.ts` |
| 571 | test | `tests/integration/discovery-route-parity.test.ts` |
| 570 | source | `src/modules/security/internal/admin-authority.ts` |
| 569 | source | `src/modules/registry/internal/services-api-projection.ts` |
| 567 | test | `tests/unit/convex/interactive-authority-tenancy.test.ts` |
| 566 | test | `tests/helpers/money-funding-fixtures.ts` |
| 566 \* | test | `tests/unit/components/ae-key-reveal-dialog.test.tsx` |
| 566 \* | test | `tests/unit/routes/tool-detail-route.test.tsx` |
| 565 | test | `tests/security/maturity/recovery-production-support.test.ts` |
| 564 | source | `tools/release/package5-provider-operations.ts` |
| 563 | source | `src/modules/agent-access/agent-access.ts` |
| 563 | source | `tools/release/tool-gateway-production-smoke-call.ts` |
| 562 | source | `src/modules/capability-execution/call-receipt-view.ts` |
| 562 | test | `tests/helpers/capability-call-recovery-harness.ts` |
| 561 | source | `tools/release/stripe-webhook-destinations.ts` |
| 559 | test | `tests/integration/admin-runtime.test.ts` |
| 558 \* | source | `src/modules/capability-supply/supply-publication-v2.ts` |
| 554 | source | `src/modules/money/formance-schema.ts` |
| 553 | source | `src/components/ae/operator/AeOperatorDataTable.tsx` |
| 549 | test | `tests/unit/authority/context/consequence-authority.harness.ts` |
| 548 | test | `tests/integration/capability-call-workpool-harness.ts` |
| 546 | test | `tests/unit/agent-access.test.ts` |
| 545 | source | `tools/ae/commands/call.ts` |
| 543 | source | `src/modules/capability-supply/public.ts` |
| 543 | test | `tests/unit/server/agent-access-auth.test.ts` |
| 542 | test | `tests/integration/catalog-system-offering-authority.test.ts` |
| 538 | source | `src/modules/capability-contract/internal/decision-model.ts` |
| 537 | source | `src/modules/capability-supply/internal/provider-connection/command-model.ts` |
| 537 | test | `tests/unit/routes/provider-consequence.test.ts` |
| 535 | source | `src/modules/capability-supply/internal/readiness-probe-mcp.ts` |
| 535 | test | `tests/unit/convex/capability-call-recovery.test.ts` |
| 533 | test | `tests/unit/operator-shell-chrome.test.tsx` |
| 533 | test | `tests/unit/principal-account/external-identity/external-identity-registry.test.ts` |
| 530 \* | test | `tests/unit/convex/invoice-history.test.ts` |
| 528 | source | `src/lib/server/stripe-checkout-evidence.ts` |
| 527 | source | `src/modules/capability-contract/internal/pointed-schema.ts` |
| 523 | test | `tests/unit/convex/money-customer-tax-facts.test.ts` |
| 522 | source | `src/modules/authority/recovery/recovery.ts` |
| 522 | test | `tests/integration/canonical-tool-reads.test.ts` |
| 522 | test | `tests/unit/ui/agent-access-owner-console.test.tsx` |
| 521 \* | test | `tests/unit/chat-ui/chat-presence.test.tsx` |
| 517 | test | `tests/integration/capability-supply-integration-draft.test.ts` |
| 516 | test | `tests/helpers/convex-rpc-contract-scans.ts` |
| 513 | test | `tests/unit/capability-supply/tool-projection-public.test.ts` |
| 512 | source | `tools/dev/experiment-chained-jev-router.ts` |
| 510 | test | `tests/unit/market-demand/market-demand-actions.test.ts` |
| 509 | source | `src/modules/action-execution/in-memory.ts` |
| 508 \* | source | `src/lib/server/agent-access-oauth/consent-security.ts` |
| 507 | source | `src/modules/discovery/internal/site-manifest.ts` |
| 507 | test | `tests/unit/convex/recovery-break-glass-driver.test.ts` |
| 507 | test | `tests/unit/registry/services-api-projection.test.ts` |
| 506 | source | `src/modules/capability-supply/internal/x402-seller-onboarding/canary.ts` |
| 504 | source | `src/lib/server/agent-access-oauth-store.ts` |
| 504 | test | `tests/unit/discovery/developer-discovery-route.test.ts` |
| 501 | test | `tests/unit/capability-supply/source-first-owner.test.ts` |

## Churn × current size

Window: `git log --since=60.days --numstat` on HEAD. 1,704 commits, 2026-08-01 12:27 +0800 through 2026-09-29 03:30 +0800. 27,820 numstat rows, 178 binary (`-` / `-`, not added into the sums).

For each path, changes = added + deleted across the window. Score = changes × current scanner lines. Paths that are not a file now drop out, because current lines are zero. Renames are not followed: without `-M`, a rename is a deletion of the old path plus an addition of the new path, and the old path scores nothing once it is gone. Adding `-M` did not change this top 20.

| Rank | Score | Changes | Added | Deleted | Commits | Lines | File |
|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | 1,998,894,838 | 101,606 | 49,350 | 52,256 | 52 | 19,673 | `package-lock.json` |
| 2 | 24,752,520 | 7,020 | 4,093 | 2,927 | 58 | 3,526 | `src/routeTree.gen.ts` |
| 3 | 14,636,058 | 4,022 | 3,812 | 210 | 26 | 3,639 \* | `tests/fixtures/convex-api-kind-snapshot.json` |
| 4 | 7,332,389 | 3,103 | 2,186 | 917 | 22 | 2,363 | `tests/integration/capability-call-workpool.test.ts` |
| 5 | 7,252,099 | 4,877 | 3,182 | 1,695 | 36 | 1,487 | `tests/unit/market-terminal/cold-loop.test.ts` |
| 6 | 7,154,384 | 3,001 | 2,692 | 309 | 15 | 2,384 | `convex/agentAccessOAuth.test.ts` |
| 7 | 5,748,995 | 2,905 | 2,314 | 591 | 24 | 1,979 \* | `tests/unit/server/agent-access-oauth-api.test.ts` |
| 8 | 4,795,695 | 3,195 | 2,287 | 908 | 97 | 1,501 \* | `convex/_generated/api.d.ts` |
| 9 | 4,286,348 | 2,684 | 2,140 | 544 | 11 | 1,597 | `tests/unit/capability-supply/route-transport-x402.test.ts` |
| 10 | 3,798,320 | 3,005 | 2,134 | 871 | 15 | 1,264 | `tests/unit/convex/money-x402-payment-attempts.test.ts` |
| 11 | 3,731,244 | 28,267 | 14,199 | 14,068 | 36 | 132 | `convex/moneyLedger.ts` |
| 12 | 3,597,196 | 2,908 | 2,077 | 831 | 14 | 1,237 | `tests/unit/convex/money-account-funding.test.ts` |
| 13 | 3,539,742 | 3,907 | 2,406 | 1,501 | 32 | 906 | `tests/unit/market-terminal/doctor.test.ts` |
| 14 | 3,335,830 | 1,843 | 1,826 | 17 | 2 | 1,810 | `tests/unit/convex/workspace-membership-observation.test.ts` |
| 15 | 3,069,999 | 2,367 | 1,799 | 568 | 56 | 1,297 | `tests/unit/ui/demand-console.test.tsx` |
| 16 | 2,477,750 | 1,802 | 1,588 | 214 | 8 | 1,375 | `IMPLEMENTATION_ROADMAP.md` |
| 17 | 2,419,580 | 1,555 | 1,555 | 0 | 1 | 1,556 | `tools/release/package5-reference-provider/package-lock.json` |
| 18 | 2,368,046 | 1,919 | 1,576 | 343 | 23 | 1,234 | `tests/integration/dev-seed-public-catalog-facts.test.ts` |
| 19 | 2,341,722 | 1,633 | 1,533 | 100 | 24 | 1,434 | `convex/agentAccessPrincipals.test.ts` |
| 20 | 2,243,472 | 3,696 | 2,151 | 1,545 | 14 | 607 | `src/modules/capability-supply/supply-actions.ts` |

`package-lock.json` is about 80 times the next score. After it, the ranking is generated or snapshot files (`src/routeTree.gen.ts`, `convex/_generated/api.d.ts`, `tests/fixtures/convex-api-kind-snapshot.json`), large tests, a nested lockfile, `IMPLEMENTATION_ROADMAP.md`, and two maintained source files: `convex/moneyLedger.ts` and `src/modules/capability-supply/supply-actions.ts`.

`convex/moneyLedger.ts` is rank 11 at 132 lines because the window deleted almost as much as it added (14,199 / 14,068 across 36 commits). The body moved to `convex/lib/money/connect` on 2026-09-24 (`3945f4283`, 56 insertions and 292 deletions on this path). The score is a finished extraction times a small registration root, not a 132-line file under daily edit.

`src/modules/capability-supply/supply-actions.ts` is the only application module in the top 20 (rank 20, 607 lines, 14 commits, 2,151 added and 1,545 deleted). `tools/dev/local-dev.ts` and `tools/release/tool-gateway-production-smoke.ts` are over 1,000 lines but outside this top 20: their older edits sit on paths that no longer exist, so this command does not charge those edits to the current file.

## Convex roots over 200 lines

A root is a depth-one `convex/*.ts` file. There are 169, of which 162 are not tests. The façade gate counts scanner lines and skips `*.test.ts` (`src/lib/ui/contract-scans/convex-facade-size.ts:57-67`). The cap is 200, with one pinned exception (`tests/imports/convex-facade-size.test.ts:13-16`).

| Lines | In the façade gate | File |
|---:|---|---|
| 2,384 | no, `*.test.ts` | `convex/agentAccessOAuth.test.ts` |
| 1,434 | no, `*.test.ts` | `convex/agentAccessPrincipals.test.ts` |
| 1,234 | no, `*.test.ts` | `convex/securityAccountHistory.test.ts` |
| 587 | no, `*.test.ts` | `convex/agentSpendingPolicy.test.ts` |
| 432 | no, `*.test.ts` | `convex/agentAccessPolicy.test.ts` |
| 274 | yes, pinned at 274 | `convex/capabilityProviderConnections.ts` |

No other depth-one root is over 200. `convex/devSeed.ts` is 44. The pin for `capabilityProviderConnections.ts` is exact: the test fails if the file grows past 274 or drops to 200 or below (`tests/imports/convex-facade-size.test.ts:86-100`). The root protocol treats a registration-only file over 200 as acceptable when the line count is the RPC list, and this is the one such pin (`docs/operations/convex-root-protocol.md:60`).

## Where size and churn meet

1. **The gate cannot see the four source files over 1,000 lines.** They are all under `tools/`. `local-dev.ts` is the local stack launcher. The other three are release smoke drivers. A size ceiling that includes `tools/**/*.ts` would make the next growth visible. Splitting them is a separate change from this census.
2. **Tests are the bulk of the over-500 list** (121 of 204, and 17 of 22 over 1,000). Five of those tests are depth-one Convex roots, so they also miss the 200-line façade cap. The largest is `convex/agentAccessOAuth.test.ts` at 2,384, and it is rank 6 by churn × size.
3. **`src/modules` holds 53 of 82 source files over 500.** Supply, money, chat, and call-worker files lead (`tool-card.ts` 970, `provider-connection-handoff.ts` 949, `formance-transaction-templates.ts` 894). The ratchet's over-500 ceiling is already equal to the count, so one new file over 500 fails `test:imports`, but a file may still grow from 501 to 970 without a new failure.
4. **Churn × current lines does not point at those module files.** Across 1,704 commits the product is lockfile and generated output, then tests. `supply-actions.ts` is the one application module in the top 20. `moneyLedger.ts` ranks on the extraction diff, and it is 132 lines now.

