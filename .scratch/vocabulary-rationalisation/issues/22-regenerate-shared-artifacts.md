# Regenerate shared artifacts and verify packaged public surfaces

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee: Luna Max / shared artifact integration owner
Assigned role: Generator, route-tree and CLI distribution integration owner
Parent: ../map.md
Blocked by: 08, 09, 29, 30

Final closure prerequisites: 10–21 source receipts and the approved
non-deploying target receipt below. Early, serialized generation checkpoints may be
claimed before those source issues close; they are not final closure of 22.

## Outcome

After the serialized core owners and the disjoint public-surface consumers land,
regenerate the existing Convex and route-tree outputs, rebuild the installed
`ae` bundle and refresh the public archive. Verify that source, generated
surfaces, discovery/import conformance and packaged consumers expose one exact
approved Tool, Quote and Call vocabulary. This ticket owns the existing
generator/build/packaging integration and its staged checkpoints; it does not
invent a generator, checker, package boundary or compatibility layer.

## Fixed contract and protected values

Use the exact mapping in
`docs/designs/vocabulary-rationalisation.md:270-291` and the field/protection
rules in the accepted plan. Generated and packaged outputs must reflect
`registry.tools.*`, `tool.quote`, `tool.call`, `call.list` and
`call.status/cancel/reconcile`, the `/api/v1/tools/*`, `/api/v1/calls` and
`/api/v1/market-tools/*` paths, and `toolRef`/`quoteRef`/`callRef` after issues
19–21 provide those source contracts.

The retained CLI verbs remain `describe`, `call` and `history`: `describe` is
anonymous `registry.tools.describe` Tool detail, while the existing
`tools/ae/commands/invoke.ts` and `tools/ae/commands/action-adapters.ts` path
performs the caller-specific Quote -> Call flow; `history` presents
`call.list`. `--supplier` is replaced by `--provider` without an alias.

Preserve MCP JSON-RPC methods and action-derived names, upstream OpenAPI
`operationId`, OAuth fields, x402 payment fields, opaque identifiers,
hash/signature material, external financial namespaces, and the separate
Customer/Agent/Provider/Seller, authority, payment, delivery, purchase-status
and Outcome facts. Do not alter generic IAM, portfolio Service, Offering,
Publication, Listing or external-registry record/link semantics. Preserve
`market_supply:manage` unless the coordinator makes the explicit decision
required by the plan.

## Finite implementation allowlist

Only these existing generator, packaging and generated-output paths are in
scope. Do not turn a directory-wide generated sweep into an implementation
shortcut.

### Existing generator and package-integrity inputs

- `scripts/build-cli.mjs`
- `scripts/test-cli-package.mjs` (decision/read-only until the Node 20/22
  compatibility question is resolved)
- `tools/release/release-integrity.ts`
- `.nvmrc` (read-only runtime pin)
- `convex.json` (read-only action-runtime pin)
- `package.json` (read-only command definitions; issue 20 owns package-facing
  metadata changes)
- `packages/cli/package.json` (read-only package contract; issue 20 owns any
  consumer-language change)

### Generated outputs

- `convex/_generated/api.js`
- `convex/_generated/api.d.ts`
- `convex/_generated/server.js`
- `convex/_generated/server.d.ts`
- `convex/_generated/dataModel.d.ts`
- `src/routeTree.gen.ts`
- `packages/cli/dist/ae.js`
- `public/downloads/agentic-economy-cli-0.1.0.tgz`

The generated paths above already contain user/branch state in the supplied
dirty baseline (`convex/_generated/api.d.ts`,
`convex/_generated/server.d.ts` and `src/routeTree.gen.ts` are modified at
baseline). Preserve unrelated changes; do not reset, overwrite or hand-edit a
generated file to hide a mismatch.

### Run-only integration evidence

These are existing maintained tests and may be run for the final integration
receipt, but issue 22 does not edit their assertions or fixtures:

- `tests/imports/private-imports.test.ts`
- `tests/imports/tool-surface-conformance.test.ts`
- `tests/unit/discovery/cli-distribution.test.ts`
- `tests/unit/discovery/developer-discovery-parity.test.ts`
- `tests/unit/server/mcp-api-official-client.test.ts`
- `tests/unit/server/mcp-api-protocol.test.ts`
- `tests/unit/server/mcp-api-call-recovery.test.ts`
- `tests/unit/server/call-api.test.ts`
- `tests/unit/server/call-recovery-api.test.ts`
- `tests/unit/market-terminal/cold-loop.test.ts`

## Pinned commands and staged checkpoints

All project commands and child processes use Node 22 and npm 11.5.1 through
the project NVM runner. Before each checkpoint, preserve the current dirty
baseline and use the predecessor ticket's exact changed-path receipt; do not
create a parallel tracker.

1. **Core propagation checkpoints:** after a source patch in issues 10–18,
   before accepting that issue or dispatching its next shared-file writer,
   regenerate required types through step 2 when its target gate is satisfied.
   Then run the existing `typecheck` and `test:types` commands under Node 22,
   plus the source owner's named focused tests. The source owner fixes its
   regressions. Do not require a source issue to close before the generation
   needed to verify it: claim this ticket's checkpoint while that issue remains
   open. Record each result in both owners' receipts. If generation is blocked,
   retain the patch and report the exact verification blocker without claiming
   acceptance or hand-editing generated output.
2. **Convex and route outputs:** use the exact non-deploying hosted-test
   analysis procedure in the coordinator receipt below. Run the dry-run first,
   then the existing generator with the same process-scoped selection. This
   avoids starting the stopped local backend. Codegen does not authorise a
   deployment, schema push, data reset, `dev --once`, or another backend. Local
   restart/reset and hosted cutover remain separately gated in issue 31. The
   route tree must be regenerated from accepted route sources, never hand-edited.
3. **Serialized CLI artifact slot:** after issue 20's source/package consumer
   changes and issue 21's producers are ready, run the existing `build:cli`
   command, then `pack:cli:public`, so `packages/cli/dist/ae.js` and the public
   archive are produced from the same source. Do not run a second parallel CLI
   build while `test:imports` is executing.
4. **Import/conformance checkpoint:** run the repository's existing
   `test:imports` command after issue 20 and generated artifacts are complete;
   it builds the CLI and therefore consumes the serialized slot. Run the
   existing `test:conformance` command only after issues 19–22 are integrated.
   These checkpoints must not claim an independently green CLI half before its
   issue 20 consumer owner has landed.

Use these exact existing command forms when the gates above permit them:

- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck`
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:types`
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run check:convex-codegen`
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run generate:convex`
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run build:cli`
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run pack:cli:public`
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:imports`
- `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:conformance`

The existing `test:cli-package` script invokes a downloaded Node 20/22 matrix
despite the project-wide Node 22/npm 11.5.1 rule. Do not run it, download a
temporary runtime, lower the compatibility assertion or call the question
waived. Joel/coordinator must decide whether a narrowly documented installed-
client compatibility exception is allowed; all project commands remain on the
installed Node 22 runtime either way.

## Approved non-deploying generation target — 2026-09-05

The coordinator inspected the installed Convex CLI's `codegen.ts` and
`lib/components.ts`: `runCodegen` performs analysis and type generation, not
the deployment-finishing path. `withRunningBackend` would start the selected
stopped local backend. The supported process-scoped selection below instead
uses the existing synthetic test deployment, with ambient deployment keys and
self-hosted selectors disabled for this process only. It changes no saved
configuration and uses the existing CLI login, not a printed admin key.

Exact dry-run command:

```sh
CONVEX_DEPLOYMENT=dev:fastidious-barracuda-66 CONVEX_DEPLOY_KEY='' CONVEX_DEPLOYMENT_TOKEN='' CONVEX_SELF_HOSTED_URL='' CONVEX_SELF_HOSTED_ADMIN_KEY='' CONVEX_VERBOSE='' NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run check:convex-codegen
```

For the serialized generation checkpoint, use that exact environment prefix
with `npm run generate:convex` instead. No target substitution, secret retrieval,
`dev`, `deploy`, schema push or backend-start command is authorised here.

At 09:10 UTC the coordinator's dry-run exited 0. All five generated Convex
files and `src/routeTree.gen.ts` still matched their private source-baseline
checksums. No generated content was written or deployed. Immediately preceding
readback confirmed the existing test app health/readiness (200), old release
revision `6593dbe7b4b8f75304caeed5b468acc497b720f4`, protected Formance edge
(401), and zero stalled/failed/reconciliation-held Stripe inbox rows. The
broader snapshot was incomplete with five explicitly untested areas, not an
operational pass or backup/cutover approval. The 20 pending funding records
remain a separate blocker. Recheck the exact target before each generation
session; authentication loss is a blocker, not permission to select another.

## Explicit exclusions and sequencing

Do not edit issues 19–21's contract, CLI or discovery producers; current root
README, screens, plugin/source copy, test fixtures, plan/map/work record,
Package 6/7 records, deployment state or external data. Do not add a new
generator, test checker, dependency, alias, route hierarchy, public API,
package import surface or JSONL tracker. Do not change `package-lock.json`.

Issues 10–18 are serialized core producers; issue 19 owns the HTTP/MCP
contract; issues 20 and 21 may prepare disjoint consumers but both must land
before final artifact generation. Issues 29 and 30 are review gates. Issue 31
retains the hard local-start/reset and hosted-cutover safety gates. The bounded
non-deploying codegen target above does not require those destructive gates to
close first.
The pre-existing generated-file modifications listed above are evidence to
preserve, not permission to discard or regenerate unrelated work.

## Verification commands and expected results

- `node --version` and `npm --version` through the project shell report Node
  22 and npm 11.5.1 before any project command.
- The staged type/test checkpoints for issues 10–18 are recorded before final
  generation; no checkpoint is silently replaced by one final run.
- With the exact non-deploying target above, `check:convex-codegen` succeeds as
  a dry-run and `generate:convex` changes only the accepted local generated
  outputs; no deployment, local backend restart or data mutation occurs.
- `build:cli` and `pack:cli:public` succeed in the serialized slot. The bundle
  and tarball advertise the retained CLI verbs, target action/path/ref names,
  `--provider`, anonymous Tool `describe`, mediated Quote -> Call `call` and
  `history` -> `call.list`, with no old AE alias or weather-proxy example.
- `test:imports` and `test:conformance` pass at the final integration
  checkpoint, with the supplied issue 08 baseline kept separate from
  refactor results. Existing official MCP, recovery, cold-loop, discovery and
  private-import checks remain intact.
- `test:cli-package` remains pending the explicit Node 20/22 decision; its
  downloaded-runtime behavior is not hidden by changing the script or
  assertions.
- `git diff --check --` on the listed ticket/generated paths reports no
  whitespace errors, and unrelated dirty files remain untouched.

## Acceptance

- [ ] Each issue 10–18 table/function rename has a recorded pre-next-step
      type/test checkpoint; final generation is not the only evidence.
- [ ] Existing Convex and route-tree generators produce only the accepted
      local outputs under Node 22 through the approved analysis target, with
      no deploy, backend restart, data mutation or `dev --once` workaround.
- [ ] The generated CLI bundle and public archive are rebuilt once from the
      updated source and preserve the one compiled `ae` binary boundary,
      retained verbs, `--provider`, anonymous `describe`, mediated `call` and
      `history`/`call.list` semantics without aliases.
- [ ] `test:imports` runs after issue 20 and generated artifacts in the
      serialized build slot; final conformance and the listed run-only tests
      agree across HTTP/MCP, discovery, CLI distribution and package imports.
- [ ] External protocol fields, OAuth/x402 values, opaque IDs/hashes,
      generic IAM and financial/delivery/purchase distinctions remain unchanged
      except for the approved AE-owned vocabulary mapping.
- [ ] The Node 20/22 compatibility-matrix decision is explicit and owned;
      no temporary runtime, weakened assertion or silent waiver is introduced.
- [ ] No unrelated source, dependency, generated, deployment, plan/map or Git
      change is included.

## Closure evidence

Attach the exact generated/output path list, each issues 10–18 checkpoint
receipt, exact non-deploying target receipt, command/runtime
receipts, route-tree and Convex generation result, CLI bundle/archive integrity
result, final import/conformance and run-only focused-test results, and the
explicit Node 20/22 decision. Distinguish the supplied issue 08 baseline and
pre-existing dirty generated paths from refactor changes. Do not claim hosted
or live proof from this artifact ticket.

## Comments

- 2026-09-05 — Prepared as the shared generator and packaged-artifact owner
  after the bounded DX review. Generation is serialized after issues 19–21;
  the Node 20/22 package-matrix question remains with the coordinator.
