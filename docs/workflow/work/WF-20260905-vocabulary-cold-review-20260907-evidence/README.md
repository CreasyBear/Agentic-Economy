# Cold review evidence — 2026-09-07

These are deliberate supporting records for the [consolidated audit](../WF-20260905-vocabulary-cold-review-20260907.md), not new product/test infrastructure.

## Review reports

The fifteen `w1`–`w5` reports are the raw independent reviewer returns. Their original severity and claims are preserved. The consolidated report's parent dispositions govern accepted scope, deduplication and counterevidence. In particular, funding's dead continuation was not found in the technical manifest; access-grant expiry was not shown to bypass money admission; literal shell placeholders were not promoted as a broken substituted command; and the retained `supply operations` verb works.

[Neutral review brief](./review-brief.md)

- Wave 1: [Market/registry](./w1-market.md)
- Wave 1: [Authority](./w1-authority.md)
- Wave 1: [Purchase/Quote/Call](./w1-purchase.md)
- Wave 2: [Provider lifecycle](./w2-provider.md)
- Wave 2: [Money](./w2-money.md)
- Wave 2: [Human UI](./w2-human-ui.md)
- Wave 3: [CLI](./w3-cli.md)
- Wave 3: [HTTP/MCP](./w3-http-mcp.md)
- Wave 3: [Served discovery/plugin/chat](./w3-discovery.md)
- Wave 4: [Storage/hash/evidence](./w4-storage.md)
- Wave 4: [Current docs/examples/links](./w4-docs.md)
- Wave 4: [Distribution/CI/release](./w4-distribution.md)
- Wave 5: [Cross-module journeys](./w5-journeys.md)
- Wave 5: [Test blind spots](./w5-test-blindspots.md)
- Wave 5: [Semantic cutover](./w5-semantics.md)

## Local reproduction records

All seven probes used Node 22.22.0/npm 11.5.1 and the project's existing Vitest setup. Each appended one named assertion in memory to an existing test module using a Vite transform. Repository test files were never edited; unrelated tests were filtered out. Each assertion deliberately confirms the reported bad behavior, so a passing probe is not a correctness pass.

The original scripts are retained as `.mjs.txt` evidence, not executable project test files. To reproduce deliberately at the reviewed checkout, copy the chosen text file to a temporary `.mjs` file and run it from the repository root with Node 22 through the existing NVM runner. They refer to this checkout's existing Vitest installation and fixtures. Do not run them against a different revision and treat changed results as proof about the reviewed revision.

| Finding | Receipt | Original probe source as text |
| --- | --- | --- |
| C01 | [probe-owner-tool.log](./probe-owner-tool.log) | [probe-owner-tool.mjs.txt](./probe-owner-tool.mjs.txt) |
| C07 | [probe-health-pagination.log](./probe-health-pagination.log) | [probe-health-pagination.mjs.txt](./probe-health-pagination.mjs.txt) |
| C08 | [probe-treasury-history.log](./probe-treasury-history.log) | [probe-treasury-history.mjs.txt](./probe-treasury-history.mjs.txt) |
| C09 | [probe-access-expiry.log](./probe-access-expiry.log) | [probe-access-expiry.mjs.txt](./probe-access-expiry.mjs.txt) |
| C13 | [probe-request-origin.log](./probe-request-origin.log) | [probe-request-origin.mjs.txt](./probe-request-origin.mjs.txt) |
| C14 | [probe-media-type.log](./probe-media-type.log) | [probe-media-type.mjs.txt](./probe-media-type.mjs.txt) |
| C16 | [probe-late-digest.log](./probe-late-digest.log) | [probe-late-digest.mjs.txt](./probe-late-digest.mjs.txt) |

## Summaries

- [Fresh TypeScript result](./typecheck-summary.json): exit 0, zero diagnostics.
- [Source manifest excerpts](./manifest-excerpts.json): C03/C12 only; no hosted manifest claim.
- [Rejected source CLI command results](./dead-command-results.json): C12/C18, all reject locally before external effects.
- [Preservation summary](./preservation-summary.json): reviewed revision and original source/working-tree preservation.

No hosted, production, installed-package, payment-provider or live database acceptance is represented by these records. Existing broader source receipts remain in the vocabulary work record and are not relabelled as fresh audit runs.
