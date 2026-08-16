# Product frontier baseline — golden journeys (2026-08-15)

Evidence class: `source-local` before cleanup. Hosted Tier C remains blocked until production gateway proof.

## Machine paths (commands / contracts)

| Journey | Proof owner | Baseline status |
| --- | --- | --- |
| public-discovery-cold-path | `tests/seo/*`, `tests/integration/discovery-*.test.ts` | source-green expected |
| skill-cli-contract | `tests/seo/agent-skill.test.ts`, `npm run ae -- --help` | source-green expected |
| http-market-operations-anonymous | registry operations actions + MCP anonymous set | frozen in frontier MCP list |
| http-operation-lifecycle-authenticated | `operation.invoke/status/cancel/reconcile` | frozen protected actions |
| mcp-tools-list | `listMcpActions()` vs frontier manifest | positive import test |
| customer-request-dev-smoke | `npm run smoke:customer-request:development` | env-gated; run before deeper cleanup |
| work-tree-dev-smoke-with-study | `npm run smoke:work-tree:development` | must exercise Study |
| action-invocation-development-evidence | `npm run evidence:action-invocation:development` | packet schema preserved |

## Person journeys (E2E / UI)

| Journey | Spec / surface | Baseline status |
| --- | --- | --- |
| landing-ask-to-cited-answer | `tests/e2e/landing-answer.spec.ts` | required E2E |
| discovery-compare-listing-inquiry | `tests/e2e/chat-discovery-inquiry-loop.spec.ts` | required E2E |
| customer-request-decision-review | Customer Request UI + actions | protected actions |
| protected-owner-action | owner supply / claim surfaces | retain |
| developer-discovery | `tests/seo/developer-discovery.test.ts` | required |
| worktree-create-study-propose-inbox-reload | WorkTree + Study + notification-outbox | Study protected |

## Dirty-tree baseline

- Captured path list: `output/cleanup/baseline-dirty-tree.txt`
- Path count at freeze: see `dirtyTreePathCount` in `product-frontier-manifest.json`
- Deletion inventory: `output/cleanup/deletion-inventory.json`
- Do not reset or overwrite unrelated dirty paths during cleanup batches.

## Positive assertion doctrine

Retirement tests may assert absence. The frontier floor asserts presence of Study, WorkTree, operation lifecycle, MCP tools, eval tags, E2E specs, and conformance paths. A batch that greens only by deleting tests/code fails acceptance.
