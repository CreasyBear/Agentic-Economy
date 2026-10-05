# aecon CLI

Install the pinned `ae` command from a signed [aecon-cli release](https://github.com/CreasyBear/aecon-cli/releases). Node.js 20 or newer is required. The CLI archive is published here, not to npm.

## Download and verify v0.2.1

Choose the exact release version you intend to install; do not use a moving `latest` URL. This example pins `v0.2.1`:

```sh
VERSION=0.2.1
BASE="https://github.com/CreasyBear/aecon-cli/releases/download/v${VERSION}"
curl -fLO "${BASE}/aecon-cli-${VERSION}.tgz"
curl -fLO "${BASE}/SHA256SUMS"
curl -fLO "${BASE}/aecon-cli-${VERSION}.tgz.sigstore.json"
shasum -a 256 -c SHA256SUMS
cosign verify-blob "aecon-cli-${VERSION}.tgz" \
  --bundle "aecon-cli-${VERSION}.tgz.sigstore.json" \
  --certificate-identity "https://github.com/CreasyBear/Agentic-Economy/.github/workflows/cli-release.yml@refs/tags/v${VERSION}" \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
npm install --global --ignore-scripts "./aecon-cli-${VERSION}.tgz"
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

Update `packages/cli/package.json` in the private source first, then create and push a source tag named exactly `v<package version>` (for example, `v0.2.1`). The release workflow also supports manual dispatch **only when the selected ref is that matching tag**, not a branch. It runs `npm run gate`, packs the workspace once through its existing `prepack`, checks and signs the archive, then creates the matching public release against `main` with its archive, `SHA256SUMS`, and Sigstore bundle. Publication refuses any pre-existing public tag rather than attaching assets to an unrelated version; investigate a failed publication rather than replacing assets. Update this README's pinned example for each new public version.
