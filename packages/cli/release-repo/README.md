# aecon CLI

Install the pinned `ae` command from npm or a signed [aecon-cli release](https://github.com/CreasyBear/aecon-cli/releases). Node.js 20 or newer is required. The npm package is `@agentic-economy/cli`; the installed command is `ae`.

For a published npm version:

```sh
npm install --global @agentic-economy/cli@0.3.0
ae --help
```

A 404 from `npm view @agentic-economy/cli@0.3.0 version` means that version has not been published yet.

## Download and verify v0.3.0

Choose the exact release version you intend to install; do not use a moving `latest` URL. This example pins `v0.3.0`:

```sh
VERSION=0.3.0
BASE="https://github.com/CreasyBear/aecon-cli/releases/download/v${VERSION}"
curl -fLO "${BASE}/agentic-economy-cli-${VERSION}.tgz"
curl -fLO "${BASE}/SHA256SUMS"
curl -fLO "${BASE}/agentic-economy-cli-${VERSION}.tgz.sigstore.json"
shasum -a 256 -c SHA256SUMS
cosign verify-blob "agentic-economy-cli-${VERSION}.tgz" \
  --bundle "agentic-economy-cli-${VERSION}.tgz.sigstore.json" \
  --certificate-identity "https://github.com/CreasyBear/Agentic-Economy/.github/workflows/cli-release.yml@refs/tags/v${VERSION}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
npm install --global --ignore-scripts "./agentic-economy-cli-${VERSION}.tgz"
```

Install [Cosign](https://docs.sigstore.dev/cosign/system_config/installation/) before verifying. The Sigstore bundle proves the archive was signed by the tagged source workflow using GitHub Actions OIDC, with a public Fulcio certificate and Rekor transparency entry; this is **not** a GitHub attestation. Stop if either checksum or signature verification fails. The archive contains the compiled `ae` executable, its package manifest, and its CLI README—not this release-repository README or private source.

Start with commands that do not require a connected account or guessed Tool inputs:

```sh
ae --version
ae search "weather forecast"
```

Search may return no matching Tool. If it returns one, use its actual Tool reference and documented input schema; never invent fields for a paid Call. Consult the CLI's installed README and `ae --help` to inspect the Tool, connect, check account readiness, request a Quote for exact inputs, and choose deliberately whether to Call.

## Maintainer release setup

The source workflow is `CreasyBear/Agentic-Economy/.github/workflows/cli-release.yml`. Set its GitHub Actions repository secret `AECON_CLI_RELEASE_TOKEN` to a **fine-grained personal access token** limited to `CreasyBear/aecon-cli` with **Contents: Read and write**; it must be able to create a release and tag there. Do not place the token in this public repository or release assets. The source workflow uses its own `id-token: write` permission for keyless Cosign signing and needs the existing source-gate Clerk test secrets.

Update `packages/cli/package.json` in the private source first, then create and push a source tag named exactly `v<package version>` (for example, `v0.3.0`). The release workflow also supports manual dispatch **only when the selected ref is that matching tag**, not a branch. It runs `npm run gate`, packs the workspace once through its existing `prepack`, checks and signs the archive, then creates the matching public release against `main` with its archive, `SHA256SUMS`, and Sigstore bundle. Publication refuses any pre-existing public tag rather than attaching assets to an unrelated version; investigate a failed publication rather than replacing assets. Update this README's pinned example for each new public version.

### npm publication

The npm account must have publish access to the `agentic-economy` scope. Sign in with `npm login --registry=https://registry.npmjs.org/` and verify `npm whoami` and `npm org ls agentic-economy`. Keep credentials outside the repository.

Before the first publication, run `npm run gate` for the source revision, pack the CLI once with `npm pack --workspace @agentic-economy/cli --json --pack-destination /path/to/release`, and validate that exact archive with `AE_CLI_PACKAGE_TARBALL=/path/to/release/agentic-economy-cli-0.3.0.tgz AE_CLI_PACKAGE_EXPECTED_SHA256=<sha256> npm run test:cli-package`. Publish only the validated archive:

```sh
npm publish /path/to/release/agentic-economy-cli-0.3.0.tgz --access public --registry=https://registry.npmjs.org/
npm view @agentic-economy/cli@0.3.0 name version dist.integrity
```

The release contract requires the archive name and version to match the package manifest, its files to match the allowlist, and its digest to match the tested archive. Publication preserves `ae` as the command and never replaces an existing npm version. On a mismatch or an existing version, stop and investigate; do not unpublish or bump the version merely to retry. After an uncertain network result, inspect the existing version and compare its `dist.integrity` with the pack report before attempting another publication. The registry's unique package/version key prevents concurrent attempts from overwriting a release.

The current GitHub workflow publishes signed archives only. npm publication is a separate maintainer step. Once the first package exists, future automation can use [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) instead of a long-lived npm token. Configure it for the repository and workflow that actually perform `npm publish`; update that identity if repository ownership changes. The private source repository cannot supply npm provenance, so retain the separately verified Cosign archive evidence.
