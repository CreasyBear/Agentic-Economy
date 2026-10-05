# Agentic Economy CLI

`ae` finds public Tools, describes their input contracts, obtains a caller-specific Quote, makes a deliberate Call, and reads the durable result. The package ships one compiled executable, requires Node.js 20 or newer, and does not require this source repository at runtime. Its supported interface is the `ae` binary, not JavaScript imports.

## Install a verified versioned release

**No public release has been published yet.** The [CreasyBear/aecon-cli releases](https://github.com/CreasyBear/aecon-cli/releases) repository is currently empty. Do not treat the commands below as a working download until the first tagged release and its three assets appear. `@aecon/cli` has not been published to npm; `npm install @aecon/cli` is not the installation path.

For an *existing* version, install `curl`, `jq`, `cosign`, npm, and a SHA-256 checker (`shasum` on macOS), then download all three assets **from the same tag**. The example is for version `0.2.1`; substitute the actual published version if different:

```sh
VERSION=0.2.1
BASE="https://github.com/CreasyBear/aecon-cli/releases/download/v${VERSION}"
ARCHIVE="aecon-cli-${VERSION}.tgz"
curl --fail --location --remote-name "${BASE}/${ARCHIVE}"
curl --fail --location --remote-name "${BASE}/SHA256SUMS"
curl --fail --location --remote-name "${BASE}/${ARCHIVE}.sigstore.json"
shasum -a 256 -c SHA256SUMS
cosign verify-blob "${ARCHIVE}" \
  --bundle "${ARCHIVE}.sigstore.json" \
  --certificate-identity="https://github.com/CreasyBear/Agentic-Economy/.github/workflows/cli-release.yml@refs/tags/v${VERSION}" \
  --certificate-oidc-issuer="https://token.actions.githubusercontent.com"
npm install --global "./${ARCHIVE}"
ae --version
```

Stop if either integrity check fails. The checksum covers the archive; the Sigstore keyless bundle binds that archive to the exact tagged source workflow and GitHub Actions OIDC issuer. Do not substitute an unsigned download, a different tag, or a GitHub attestation command. `ae --version` runs locally without contacting AE.

## Discover before connecting

Search is anonymous. Run this without a key; inspect the complete JSON, not just a candidate's title:

```sh
ae search "the job you need done" --json
```

For a script, select a `toolRef` only from a `match` with `access == "ae_callable"` **and** `readiness == "ready"` (external listings and unverified Tools are not a Call handoff):

```sh
SEARCH="$(ae search "the job you need done" --json)"
AE_TOOL_REF="$(printf '%s\n' "$SEARCH" | jq -er '
  if .kind == "match" then
    first(.results[] | select(.access == "ae_callable" and .readiness == "ready") | .toolRef // empty)
  else empty end
')" || { printf '%s\n' "$SEARCH" | jq '{kind, assessed, next, nextPageCommand}'; exit 1; }
ae describe "$AE_TOOL_REF" --json
```

Describe the **exact** returned ref and read its input schema before supplying values. Search and describe prices are indicative; only a caller-specific Quote confirms exact payable terms and readiness.

A `scoped` response assesses only part of the selected supply: follow its typed `next` action, including `next-page`, rather than claiming there is no Tool. With `--cursor`, pass `pagination.nextCursor` unchanged along with the **same query, source, limit, and filters**; the JSON `nextPageCommand` supplies that continuation for inspection. `noMatch` after `assessed.coverage == "complete"` means no suitable Tool in the assessed sources; it does **not** assert the market has none anywhere. An `unavailable` response is a failed assessment: follow `next: retry` rather than treating it as no match. A private `ae request create "<job>"` can remember a genuinely missing job for the connected caller; it is not a Tool or a provider order, and creation refuses a current matching Tool.

## Connect, inspect a Quote, then Call

```sh
ae connect
ae doctor --json
```

`connect` starts a public OAuth device flow: open the displayed verification URI, approve its user code as the owner, then let the CLI validate and store the buyer credential for that exact server origin. `doctor` only reads readiness; it does not connect or fund. **Before connecting, `ae doctor --json` reports degraded and exits 1** because buyer quote and purchase checks cannot complete—even while anonymous search and describe remain usable. After connecting, read its checks and continuations rather than interpreting an exit code alone as hosted or provider fulfilment. Production network access needs owner approval (`ae connect --environment production`); production spending defaults to zero until the owner enables it.

Create `tool-input.json` yourself with a JSON **object matching the schema returned by `ae describe`**. Do not invent fields from the search summary or reuse another Tool's input. Quote is read-only:

```sh
ae quote "$AE_TOOL_REF" --input - --json < tool-input.json
```

Inspect its exact price, currency, expiry, budget and readiness. **Only after accepting those terms**, make the separate purchase decision below. The Call command obtains a **new Quote** internally; it does not purchase using the standalone Quote's `quoteRef`. If terms or input change, re-quote and decide again; do not treat a stale Quote as consent.

```sh
if CALL_JSON="$(ae call "$AE_TOOL_REF" --input - --json < tool-input.json)"; then
  printf '%s\n' "$CALL_JSON" | jq .
  if CALL_REF="$(printf '%s\n' "$CALL_JSON" | jq -er '.callRef | select(type == "string" and length > 0)')" &&
     RECOVERY_REF="$(printf '%s\n' "$CALL_JSON" | jq -er '.recoveryRef | select(type == "string" and length > 0)')"; then
    ae status "$CALL_REF" --json
    ae wait "$CALL_REF" --json
  else
    printf '%s\n' 'No Call reference to inspect; follow the returned continuation.' >&2
    false
  fi
else
  printf '%s\n' "$CALL_JSON" | jq .
  false
fi
```

Both ref extractions use `jq -e` and fail when the CLI does not return a recorded Call; status and wait run **only** with those exact returned refs. Preserve `callRef`, `recoveryRef`, the retained idempotency identity, and any typed `nextCommand`. `ae status` reads recorded state and its receipt, including usage and available evidence; `ae wait` observes the same Call until a bounded terminal outcome. Follow the returned continuation instead of assuming a pending Call failed.

`--wait` on `ae call` waits for a bounded outcome; a timeout does not mean failure or permission to start another Call. For an interrupted or unknown purchase, run `ae call resume "$RECOVERY_REF" --json` against the same origin and Agent; it reuses the saved Quote and idempotency key. Do not pass new input or a new key to resume. If a status says reconciliation is required, inspect it first and use `ae recover` only with canonical evidence for a genuinely uncertain outcome; it does not replay a known result. `ae cancel` also requires its own explicit `--idempotency-key`. `ae help call`, `ae help status`, and `ae help recover` expose the exact command contracts.

## Origin, credentials, and Provider access

`--base-url <origin>` selects an origin-only HTTP(S) URL; `AE_CLI_BASE_URL`, then `AE_CANONICAL_BASE_URL`, are environment defaults when the flag is absent. With neither set, a loopback `CONVEX_URL`/`VITE_CONVEX_URL` selects `http://127.0.0.1:3024`; otherwise the CLI uses `https://app.aecon.ai`. Changing the origin does not prove that deployment is reachable or move credentials from another origin. Credentialed requests require HTTPS except loopback development.

`ae connect` stores an origin-bound buyer profile with user-only file permissions. For an environment-managed buyer key, set **both** `AE_API_KEY` and `AE_API_KEY_ORIGIN` to the key and the server's exact origin; mismatch or missing origin is rejected locally before sending the credential. `ae account status --json` reads the authenticated principal and scopes. `ae account connections --json` lists stored origins and profiles without bearer material. `ae account disconnect --json` removes only the selected origin's **local** buyer profile (use `disconnect provider` for the provider profile), not an environment key and not server-side access. `ae revoke` opens the owner's browser revocation controls; the CLI command itself does not revoke.

Provider access is separate and owner-approved; an ordinary buyer credential is not a Provider credential:

```sh
ae connect --provider
ae doctor --provider --json
ae supply tools "$BUSINESS_REF" --json
ae supply status "$BUSINESS_REF" "$AE_TOOL_REF" --json
```

`ae doctor --provider "$BUSINESS_ID" --json` scopes readiness to that exact business; without an ID it checks provider credential access only. Provider `supply` offers preview, Tools/status, publication lifecycle, connections, earnings, Calls, and offboarding; read `ae help supply` and the exact operation's schema before any lifecycle write. A Provider `supply disconnect` starts provider-connection revocation/cleanup and is **not** the same as local `ae account disconnect provider`. These commands report the selected deployment's local execution, not proof of a hosted release, Provider fulfilment, or customer value.
