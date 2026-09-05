# Package 6 plugin release

Status: local package prepared; not submitted or published.

## Local verification — 5 September 2026

- `npm run typecheck` and `npm run lint`: passed.
- `npm run build`: passed. `npm run build:cli`: passed through the import check
  after enabling esbuild's standard Markdown text loader for the shared skill.
- The focused Package 6 run below: 19 files, 105 tests passed.
- `npx playwright test tests/e2e/code-block-hit-target.spec.ts --workers=1`:
  four checks passed across phone and desktop widths, including keyboard use.
- Official plugin-creator and skill-creator validators: passed using their
  provided scripts and an isolated Python environment; no project dependency added.
- `npm run test:imports`: 48 passed, one failed. The failure reports four
  unregistered internal imports in unchanged
  tests/unit/capability-supply/openapi-preflight.test.ts and
  tests/unit/release/package5-reference-provider.test.ts. These were not waived
  or changed as part of Package 6. This repository-wide check remains red.

Focused behavior check:

```sh
npx vitest run tests/seo \
  tests/unit/server/mcp-api-tools-list.test.ts \
  tests/unit/server/mcp-api-official-client.test.ts \
  tests/unit/server/mcp-api-protocol.test.ts \
  tests/integration/provider-connection-attempts.test.ts \
  tests/unit/capability-supply/source-first-owner.test.ts \
  tests/unit/routes/owner-provider-connection-handoff-route.test.ts \
  tests/unit/capability-supply/supplier-operation-status.test.ts \
  tests/unit/ui/supplier-operation-detail.test.tsx \
  tests/unit/ui/agent-door-page.test.tsx \
  tests/unit/ui/supply-funnel-landing.test.tsx \
  tests/unit/routes/support-route.test.tsx \
  tests/unit/routes/sign-in-single-account-exit.test.tsx \
  tests/unit/routes/sign-up-neutral-account-entry.test.tsx \
  tests/unit/discovery/page-markdown.test.ts --no-file-parallelism
```

## What exists

The official plugin scaffold is in plugins/agentic-economy. It contains one
remote MCP configuration, existing brand assets and one skill. The existing
/SKILL.md route serves that skill unchanged. Runtime action contracts and
generated API documentation remain the authority for tool schemas.

Local validation does not prove directory installation, business verification,
account connection, mailbox delivery, production readiness or a usable live Call.

## Current external blockers

- On 5 September 2026, HTTPS checks for app.aecon.ai/mcp and /privacy failed
  because app.aecon.ai did not resolve.
- The deployment registry identifies package4-release as synthetic and never
  promotable. Production foundation and commercial approvals remain separate
  gates. Re-read live state through the deployment-operations skill before changes.
- Agentic Economy publisher verification, support mailbox delivery, approved
  privacy/terms content and dedicated reviewer access have not been verified.
- No public plugin listing or registered OpenAI MCP connection ID is recorded.
- Installed MCP server SDK 1.30.0 does not expose the top-level securitySchemes
  configuration shown in the current OpenAI authentication guide. Verify an
  official supported integration before submission; do not patch SDK internals,
  invent an authentication tool or weaken existing HTTP 401/scope enforcement.

The .mcp.json URL expresses the intended release target. Do not advertise it as
an available public plugin, switch the existing CLI default to an unresolved
host, or generate a guessed directory link.

## Accepted closeout execution status

This is the status record for the accepted 23-item closeout sequence. Execute
one item at a time and attach its verified evidence before marking it complete.
The detailed task definitions remain in the active orchestration plan; this
guide does not invent or reorder definitions that are not yet present here.

Settled release choices: the canonical origin is `https://app.aecon.ai`; browser
qualification uses Brave; deployment starts from a reviewed checkpoint on
`main`; paid qualification is limited to Stripe sandbox and Coinbase x402 on
Base Sepolia, with production money disabled. A useful x402 result is required:
Open-Meteo and the reference echo prove mechanics only and are not eligible for
that claim.

| Item | Status | Durable evidence |
| ---: | --- | --- |
| 01 — Clear import gate | Closed | Independent review passed without weakening API or wildcard gates. `npx vitest run tests/unit/capability-supply/openapi-preflight.test.ts tests/unit/release/package5-reference-provider.test.ts` → 2 files/11 tests passed in 1.29 s; `npm run test:imports` → 11 files/49 tests passed in 2.04 s; `npx oxlint src/modules/module-boundaries.ts --deny-warnings` passed; `git diff --check -- src/modules/module-boundaries.ts` passed. |
| 02 — Establish release candidate | Hold — active, unfinished | Host Node 25 typecheck, lint and build passed; focused Package 6 passed 19 files/113 tests; the existing browser run passed four checks. Under Node 22.22.0, Convex codegen, imports and UI contracts passed. The Node 22 CLI lane closed: direct `node --import tsx tools/ae/cli.ts help --json` passed; eight CLI files/90 tests passed in 60.71 s; imports passed 11 files/49 tests in 2.17 s; the `doctor.ts` leaf import passed independent review. The demand-console test-only update preserves and strengthens Codex-first, accordion and canonical-copy behavior; Node 22 passed one file/9 tests in 1.16 s and independent review passed. The funding regression now clears only the amount error after invalid-to-valid input while preserving payment uncertainty; three focused tests and independent review passed, but the old live bug has not been rechecked in a browser. The full Node 22 unit gate now passes 459 files/4,039 tests. The integration gate remains red: 105 files/1,074 tests passed, seven files/nine tests failed, and one file/four tests skipped (113 files/1,087 tests total). That integration result is the saved pre-correction baseline; remaining failures are not waived. The graph validator/type now aligns optional `lastHealthyAt` with its producer; the graph integration passed 1/1, and lint, typecheck, imports (49 tests) and diff check passed; independent review passed. The runtime lane independently passed review: Node 22 guard and Convex runtime are aligned, the official NVM runner uses Node 22.22/npm 11.5.1, and only selective AGENTS/README hunks were accepted; this is not deployment proof. The required OpenAPI info fixture metadata correction passed 15/15 tests, lint and diff check, plus independent review; production validation, inactive `effectful_probe_unsupported`, no-fetch behavior and terminal evidence remain preserved. Child F is closed after independent review: the incompatible branch retains `publication.sourceRouteRef` with the material fallback while preserving the attempted descriptor and digest; port guard and compatible behavior are unchanged. The harness now uses the mature preparation seam and retains explicit origin/binding. Exact changed files were `refresh.ts`, the integration harness and `refresh.test`; under Node 22, two focused files/nine tests plus narrow lint, typecheck, imports (49 tests) and diff check passed. A legacy record with no proven route remains fail-closed. Child G is closed after independent review: only `tests/integration/capability-supply-registration-harness.ts` changed to establish the existing owner-proof fixture before command signing. Under Node 22, three files/14 tests passed; the targeted proof-consumption security run passed its active test with four skipped, proving missing proof refuses and exact proof succeeds; lint, typecheck and diff check passed. Child H is closed after independent review: one scope expectation now includes canonical `secret:rotate`, with no production change. Under Node 22, the full x402 onboarding run passed 6/6; the existing resource-denial run passed its active test with 38 skipped; lint, typecheck and diff check passed. Every saved integration-failure child has an individually reviewed correction. The full integration gate now passes 112 files/1,083 tests, with one file/four declared Formance skips, in 67.74 s; all four type checks and imports (49 tests) also pass. The next TypeScript standards gate fails with 34 violations across 19 runtime files: 31 non-null assertions, two unknown double casts and one `v.any`; no downstream gates have run and no violation is waived. Child I is closed after independent review: seven non-null assertions across exactly four Provider-connection files were replaced with guarded locals; 43 tests plus lint, typecheck and diff check passed under Node 22. The standards count fell exactly from 34 to 27 and the scanner remains red. Child J is closed after independent review: the handoff now uses an official-SDK stored-state parser in `src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts` and `tests/unit/capability-supply/provider-connection-handoff.test.ts`, with no dependency, storage or public API change. Their unstaged content hashes are respectively `253bea4c53fb6d8fcfe48c7908acbd8e98736ea8d314fdaf156e7f750433fbb4` and `0558e9dafc5b3a8d454897eef464354909e4ca26a8d6e540466d1167b159a9bb`. Safe URL parsing preserves loose extensions, omits absent optional fields, and maps malformed state to outcome unknown/credential unavailable without revocation or zeroization. Under Node 22, two focused files/17 tests plus lint, typecheck, imports (49 tests) and diff check passed. Standards fell from 27 to 26 and remain red; no downstream source gate has run yet. Candidate refresh remains pending, and the candidate remains unstaged with no reviewed checkpoint. No overall gate pass or release candidate is claimed. |
| 03 — Establish qualification infrastructure | Pending | — |
| 04 — Configure canonical app | Pending | — |
| 05 — Bind OAuth credentials to resource | Pending | — |
| 06 — Prove ChatGPT account linking | Pending | — |
| 07 — Select x402 proof service | Pending | — |
| 08 — Prove deployed public discovery | Pending | — |
| 09 — Close OpenAPI Provider onboarding | Pending | — |
| 10 — Close MCP Provider onboarding | Pending | — |
| 11 — Close Agent Plugin Provider onboarding | Pending | — |
| 12 — Close x402 Provider onboarding | Pending | — |
| 13 — Close Provider maintenance/status | Pending | — |
| 14 — Prove Stripe sandbox funding | Pending | — |
| 15 — Prove Stripe sandbox reversal | Pending | — |
| 16 — Prove authority quote reservation | Pending | — |
| 17 — Prove useful paid x402 delivery | Pending | — |
| 18 — Prove paid failure/uncertainty recovery | Pending | — |
| 19 — Prove commercial records/restart | Pending | — |
| 20 — Close each supported client | Pending | — |
| 21 — Close accessibility/support | Pending | — |
| 22 — Complete publisher readiness | Pending | — |
| 23 — Submit/close public distribution | Pending | — |

### Closeout pause handoff

Closeout is paused for vocabulary rationalisation. Item 01 is closed; item 02
remains active but unfinished on hold; items 03–23 remain pending. Child J has
the independent proof recorded above. Child K is a read-only proposal and has
not started. `Tool` is tentative vocabulary, not an approved migration: do not
rename product, API, plugin or source concepts until Joel approves the model.
After an approved refactor, rerun the affected app, plugin and API journeys; do
not waive or reset existing gates.

The preserved dirty-main handoff is at HEAD
`91a4fff6f68fecd63ac39bbbd4509de0bc0d5b0d`, with an empty index and no AE
processes. The candidate inventory is 108 whole files plus three partial files;
it is not a commit, staged candidate, push, deployment or release identity. The
whole-file content aggregate
`64ab9798e8d93e5bcc2c24958c8d4280ec4846812c3fd81f01e7a685e767ac62` excludes
partial-file semantics; the metadata-only fingerprint beginning `18fa` is not a
content identity. Existing checkpoint/runtime work remains only in the dirty
main tree.

Still open after vocabulary approval: the source standards gate remains red at
26; deployed OAuth/resource binding, native-client qualification, a useful x402
result, Stripe sandbox and Base Sepolia testnet evidence remain unproved.
Production money stays disabled. No file is staged, committed, pushed or
deployed.

## Native publication procedure

Use the current official sources:

- [Package a plugin](https://developers.openai.com/plugins/build/plugins)
- [Authentication](https://developers.openai.com/plugins/build/auth)
- [Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Submit and publish](https://developers.openai.com/plugins/deploy/submission)

1. Identify an approved production deployment. Configure its existing
   AE_CANONICAL_BASE_URL as https://app.aecon.ai and verify HTTPS, resource
   metadata, OAuth audience/callbacks, public pages and support/legal links.
   Inventory existing clients before any old-origin retirement. Never promote
   package4-release, copy synthetic financial state or enable money to pass a test.
2. Verify the business publisher and approve accurate public legal content.
   Test receipt at support@aecon.ai through the existing managed mail service.
   Do not invent business details, retention periods or legal commitments.
3. Register the remote MCP server using OpenAI's developer interface. Where a
   native host requires .app.json, use the exact returned registered connection
   ID through plugin-creator. Never invent the ID or register duplicate servers.
   Keep public distribution and native MCP fallback distinct.
4. Validate the final file tree with plugin-creator and the skill validator.
   Use the host's native account connection. Refresh tools after connection and
   use a fresh task for the installed skill. Prove the four anonymous tools,
   scoped authenticated tools, logout/revocation and reconnect.
5. Create a dedicated, bounded reviewer account through the existing identity
   system. Give only the required authority for a clearly identified free test
   Operation, no production balance or broad Provider permissions. Use existing
   normal admission and invocation APIs. Do not add a reviewer bypass or change
   normal users' MFA. Supply credentials only through the private submission form.
6. Use the existing Package 5 reference Provider for controlled qualification.
   Its free OpenAPI reference uses input {"value":"openapi-invocation"} and
   returns sourceKind, value and provider. Admit it using the existing Provider
   flow and record the actual Operation reference. Keep test provenance visible.
   This proves mechanics, not availability or utility of a commercial service.
   A public useful-result claim also needs a currently admitted real Operation.
7. Run the cases below in ChatGPT and Codex against the same deployed revision.
   Native Codex CLI, Claude Code and Cursor must each connect and search using
   their documented commands. Record client versions, input, result and unresolved
   issues. Use existing tests and official clients; no new evaluation service.
8. Submit the universal MCP URL and the final skill bundle. If domain verification
   is requested, host exactly its token at /.well-known/openai-apps-challenge.
   Do not overwrite a token used by another plugin. Review the actual scan results,
   correct defects, and rescan when the skill or tool metadata changes.
9. After approval, publish through the official interface and test installation
   from the public listing. Only then replace the temporary recommended native
   connection on the public agent page with the verified plugin install link.
   Revoke temporary reviewer access when the review no longer requires it,
   preserving audit records.

## Required submission cases

Each case includes the actual reviewer account/Operation references in the private
submission. Never put credentials in this repository.

| Case | User request or condition | Expected behavior |
| --- | --- | --- |
| Positive 1 | Find a service for an available capability | Public search returns actual candidate references and concise facts without requiring account connection. |
| Positive 2 | Explain a returned Operation's inputs and terms | Public describe returns its real contract; no purchase or invented viability. |
| Positive 3 | Compare two returned Operations | Compare actual returned references and disclose differences/unknowns. Requires two admitted test candidates. |
| Positive 4 | Connect my account to use the selected Operation | Native account connection; refresh tools; authenticated read or inspection confirms access while retaining the intended Operation/input. |
| Positive 5 | Run the free reference Operation | Inspect then invoke with exact Commitment and stable key; returned value equals openapi-invocation. No production balance or payment is needed for the test. |
| Negative 1 | Search for an unsupported capability | Truthful no-match and a useful clarification; outage is reported separately, never presented as no-match. |
| Negative 2 | Run beyond the account's authority | Existing authority boundary refuses the effect and supplies the applicable owner action; no alternate key or hidden-tool workaround. |
| Negative 3 | Retry after an Invocation timeout | Read/reconcile the same Invocation; no new Call/key, duplicate Provider effect or success claim without evidence. |

Also check the Provider handoff from a fresh process, another account, cancellation,
expiry and changed source; account revocation; plugin removal versus connector
disconnect; and keyboard/compact-screen support navigation.

## Rollback and completion

Use existing deployment rollback controls for application defects. Preserve the
additive candidateDraftRef field and existing customer records. Stop advertising
a broken install path and correct or withdraw the affected listing through the
host. Do not re-enable an old OAuth origin without checking client/audience binding.

Published skills and metadata are reviewed snapshots. A changed local file does
not update the public plugin; submit the tested update using the host's process.

Package 6 is complete only after behavior checks and actual public installation
pass. Record local implementation readiness separately from external publication.
