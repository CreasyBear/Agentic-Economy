# Wave 4 distribution review

Scope: CLI package publication and consumer checks, CLI build/packaging scripts,
release workflow evidence paths, production gateway smoke tooling, and the
deployment release boundary. HEAD checked: `a51e17b221c6b73851c5873502d8150120ef3aad`;
the vocabulary cutover source commit is `3770b43bac9bf3ea11478664ee8249ec4ddf505e`.
Runtime checked: Node `v22.22.0`, npm `11.5.1`. No source, test, package, or
deployment files were changed and no broad test/compiler run was performed.

Inspected boundaries include:

- `packages/cli/package.json`, `packages/cli/README.md`, and the committed
  `public/downloads/agentic-economy-cli-0.1.0.tgz` archive.
- `scripts/build-cli.mjs`, `scripts/test-cli-package.mjs`, root `package.json`,
  and the CLI-related source/build references in `README.md`.
- `.github/workflows/kernel-release-gate.yml` and the
  `tools/release/tool-gateway-production-smoke*.ts` producer/validator family.
- `src/lib/deployment/manifest.ts` and the `/api/v1/release` route inventory.

## Confirmed findings

### P3 — Current release workflow still presents the removed Operation vocabulary

- Confidence: 9/10.
- Provenance: pre-existing workflow wording retained through the Tool/Quote/Call
  cutover; the cutover commit did not update this workflow boundary.
- Locations and motivating code:

  ```text
  .github/workflows/kernel-release-gate.yml:83-84
  - name: Run deterministic operation chat conformance
    run: npm run test:chat:conformance

  .github/workflows/kernel-release-gate.yml:113
  name: Opt-in exact-revision operation chat staging smoke
  ```

  The same workflow labels its current gateway evidence and paths with
  `operation-gateway` at lines 307, 315, 340, 343, 353, and 360, while the
  producer and npm script are `tool-gateway-production-smoke.ts` and
  `validate-tool-gateway-production-smoke-receipt.ts`.
- Trigger/caller path: a maintainer opens the workflow run or downloads its
  source/staging/paid-gateway evidence after invoking the current `chat` and
  `tool-gateway` scripts.
- Observable impact: release UI and retained evidence identify current chat and
  Tool gateway proof as an Operation-era surface. This can mislead a reviewer
  about which product object the gate exercises and leaves stale search terms in
  current release automation. The artifact paths are internally consistent, so
  this is a release vocabulary/documentation defect rather than a proven runtime
  failure.
- Evidence/reproduction: `rg` finds these seven `operation-gateway` workflow
  references, but no current `tools/release/operation-gateway-production-smoke*`
  producer or `/api/v1/release/operation-gateway` route. The current source
  command names and route inventory use `tool-gateway` and `/api/v1/release`.
- Minimal correction direction: rename the workflow labels and generated
  evidence filenames to the current chat/Tool gateway vocabulary as one bounded
  release-workflow change; update all producer/upload/download/validator path
  references together.
- Counterevidence considered: old terms are permitted in historical evidence,
  protected protocol/hash material, and some document filenames. These are live
  workflow labels and newly generated artifacts, not a protocol field or a
  historical document body. No claim is made that the current path values alone
  make the smoke fail.

## Uncertain leads and verification gaps

### Release smoke context still contains an Operation-era target path (unconfirmed)

`tools/release/tool-gateway-production-smoke-hosted-runtime.ts:224-231` sets
`sourceWriteRequest.targetPath` to `/api/v1/release/operation-gateway`, while the
current route is `src/routes/api.v1.release.ts` at `/api/v1/release`. This may be
receipt/evidence metadata rather than an HTTP caller path; the available static
trace does not establish whether a downstream validator compares it strictly.
Treat as a follow-up trace, not a confirmed finding. If it is part of the
signed/validated source-write contract, update it with the route cutover and add
an assertion; if it is historical evidence material, document that exception.

### Exact hosted/public CLI completion proof is explicitly absent

`scripts/build-cli.mjs:9-12` embeds `AE_SOURCE_REVISION` when supplied but falls
back to `development`. The source-proof job in
`.github/workflows/kernel-release-gate.yml:67-96` does not set that variable.
Its CLI coverage reaches `test:cli-package` through
`package.json:38`, and `scripts/test-cli-package.mjs:138-148` compares a fresh
workspace pack only with the checked-in `public/downloads` archive. There is no
registry/deployed-archive fetch or publication/readback step in this workflow.

This means the source gate can prove local package shape, Node 20/22 execution,
and byte equality with the committed archive, but it cannot prove that a hosted
or published package is the exact source revision. The repository README
explicitly states at `README.md:169-182` that installed-package and hosted
deployment acceptance are not established, and the source commit records hosted
release as open. Classify this as an intentional verification gap/deferred
release work (P3, confidence 10/10), not as a regression in the current local
CLI contract. A future hosted-release gate should build with the exact revision,
publish or deploy through the intended channel, then install/read back that
artifact and verify its digest and executable behavior.

## Review conclusion

One confirmed P3 distribution papercut was found. The CLI archive, package
manifest, local pack integrity checks, and current source command mappings showed
no additional confirmed distribution defect within this boundary. Protected
`operationRef`/`operationRefs` strings found inside bundled protocol/evidence
material were excluded from findings because the product instructions preserve
those exact external or historical meanings.
