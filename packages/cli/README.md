# Agentic Economy CLI

`ae` finds public Tools, describes their input contracts, obtains a caller-specific Quote, makes a deliberate Call, and reads the durable result. The package ships one compiled executable, requires Node.js 20 or newer, and does not require this source repository at runtime. Its supported interface is the `ae` binary, not JavaScript imports.

## Install from npm

The npm package is `@agentic-economy/cli`; its installed command is `ae`. This documentation candidate does not record a published, qualified client/server combination. If the [compatibility record](../../docs/operations/deployments.md#public-contract-compatibility) does not identify a supported published version for your target deployment, stop here. Otherwise, verify that exact version in the registry and replace the placeholder before running:

```sh
CLI_VERSION='<verified published version>'
npm view "@agentic-economy/cli@${CLI_VERSION}" version
npm install --global "@agentic-economy/cli@${CLI_VERSION}"
ae --version
ae --help
```

A 404 means that version is not published yet. The version in this source tree does not prove publication or hosted compatibility. Node.js 20 or newer is required. The JSON command examples below also require `jq`.

## Install a verified signed archive

Signed archives are distributed through [CreasyBear/aecon-cli releases](https://github.com/CreasyBear/aecon-cli/releases). Use these commands only when the selected tagged release and its three assets exist.

For an *existing* version, install `curl`, `jq`, `cosign`, npm, and a SHA-256 checker (`shasum` on macOS), then download all three assets **from the same tag**. Replace the placeholder with the verified published version:

```sh
VERSION='<verified published version>'
BASE="https://github.com/CreasyBear/aecon-cli/releases/download/v${VERSION}"
ARCHIVE="agentic-economy-cli-${VERSION}.tgz"
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

This guide describes the existing single-Tool commands and their recovery mechanics. Public discovery is usable without a key. A safe public discovery-to-delivery sandbox is not yet qualified: the installed-CLI fixture now discovers its Tool reference through anonymous search, but still seeds supply and authority and uses a mock Provider. Production paid access remains Admin-only; do not run a production Call merely to try this guide. Use an owner-authorised environment and a returned ready Tool whose data release and effects are permitted. If those prerequisites are unavailable, stop at discovery and retain the blocker.

The shell examples below require `jq` to inspect JSON and extract returned references. Search is anonymous. Run this without a key; inspect the complete JSON, not just a candidate's title:

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

A `scoped` response means the assessment is incomplete. Read its `reason`: required filter evidence may be unavailable, or more supply may remain. Follow the returned `registry.tools.search` action and exact `args` when pagination or a retry is offered. Hard filters never turn unknown location, data use, effects or price facts into matches. With `--cursor`, pass `pagination.nextCursor` unchanged along with the **same query, source, limit, and filters**; the JSON `nextPageCommand` supplies that continuation for inspection. `noMatch` after `assessed.coverage == "complete"` means no suitable Tool in the assessed sources; it does **not** assert the market has none anywhere. An `unavailable` response is a failed assessment: follow its returned `registry.tools.search` continuation and `retryAfterMs` when present. A private `ae request create "<job>"` can remember a genuinely missing job for the connected caller; it is not a Tool or a provider order, and creation refuses a current matching Tool.

## Send product feedback

CLI 0.3.2 supports `ae feedback "<message>" --json` for optional
feedback when AE gets in the way or lacks needed functionality. Use an existing
buyer or provider connection. Describe expected and actual behaviour and relevant
errors; exclude credentials, personal information, Customer business data and Tool
payloads. The explicit text goes to the AE team through PostHog with pseudonymous
Account/Agent attribution. It is separate from Call ratings and refunds.

`{"kind":"accepted"}` confirms ingestion, not review or a promised fix. Tell the
user after acceptance, then continue the original task. Skip `feedback_disabled`
or `feedback_unavailable` and do not automatically retry: a timeout may follow
successful ingestion. Feedback is not a required end-of-task step.

Set `DO_NOT_TRACK=1` or `AE_DISABLE_ANALYTICS=1` in the CLI process to prevent
feedback submission before authentication or network access. The same server
flags disable PostHog analytics and feedback for that deployment while preserving
Sentry error diagnostics. `VITE_AE_DISABLE_ANALYTICS=1` disables browser analytics
at build time. CLI opt-out does not change the remote server's analytics policy
for other requests. The existing `AE_DISABLE_OBSERVABILITY=true` switch also
disables feedback.

HTTP clients use authenticated `POST /api/v1/feedback` with only
`{"message":"..."}` (nonblank, at most 10,000 characters). MCP exposes the
`ae_feedback_submit` tool to authenticated connections with writes enabled.

## Connect, inspect a Quote, then Call

```sh
ae connect
ae doctor --json
```

`connect` starts a public OAuth device flow: open the displayed verification URI, approve its user code as the owner, then let the CLI validate and store the buyer credential for that exact server origin. `doctor` only reads readiness; it does not connect or fund. **Before connecting, `ae doctor --json` reports degraded and exits 1** because buyer quote and purchase checks cannot complete—even while anonymous search and describe remain usable. After connecting, read its checks and continuations rather than interpreting an exit code alone as hosted or provider fulfilment. Production network access needs owner approval (`ae connect --environment production`); production spending defaults to zero until the owner enables it.

Create `tool-input.json` yourself with a JSON **object matching the schema returned by `ae describe`**. Do not invent fields from the search summary or reuse another Tool's input. Inspect the disclosed recipient before quoting: managed x402 price inspection can send this input to the selected Provider. Quote creates no purchase or payment; it is not a promise of no outbound request:

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
  RECOVERY_REF="$(printf '%s\n' "$CALL_JSON" | jq -er '.refs.recoveryRef | select(type == "string" and length > 0)')" || RECOVERY_REF=''
  # Inspect the returned nextCommand; retain RECOVERY_REF when present.
  false
fi
```

Both ref extractions use `jq -e` and fail when the CLI does not return a recorded Call; status and wait run **only** with those exact returned refs. Preserve `callRef`, `recoveryRef`, the retained idempotency identity, and any typed `nextCommand`. `ae status` reads recorded state and its receipt, including usage and available evidence; `ae wait` observes the same Call until a bounded terminal outcome. Follow the returned continuation instead of assuming a pending Call failed.

`--wait` on `ae call` waits for a bounded outcome; a timeout does not mean failure or permission to start another Call. For an interrupted or unknown purchase with a returned `recoveryRef` (under `refs` in an error), run `ae call resume "$RECOVERY_REF" --json` against the same origin and Agent; it reuses the saved Quote and idempotency key. Do not pass new input or a new key to resume. If a status says reconciliation is required, inspect it first and use `ae recover` only with canonical evidence for a genuinely uncertain outcome; it does not replay a known result. `ae cancel` also requires its own explicit `--idempotency-key`. `ae help call`, `ae help status`, and `ae help recover` expose the exact command contracts.

## Quote and run a Plan

A Plan groups up to ten admitted Tools into a dependency graph. Put the Plan in
`plan.json`, with each node's exact Tool reference, inputs and dependencies.

```sh
ae plan quote plan.json --json
ae plan run <planRef> <approvedTotalAudUnits> --idempotency-key <key> --json
ae plan resume <recoveryRef> --json
ae plan watch <planRef> --json
ae plan get <planRef> --json
ae plan cancel <planRef> --json
```

Review the returned quote and data flows before running. Managed price inspection can release permitted node inputs before the Quote; approval-required Plan quotes send no Provider request. Pass the exact AUD micro-unit maximum unchanged. The CLI saves the exact Plan reference, approved total, run key, origin and Account/Agent identity before submission and returns a local `recoveryRef`. Preserve that reference and the quoted Plan. `ae plan resume <recoveryRef>` checks the same Agent and reads the original Plan first; only an untouched `quoted` Plan can submit the saved run command. Do not supply new input or a new key. Approval-required
Plans wait for their owner at `/plans/<planRef>` before a Hold. A Plan receipt
links each admitted Call and reports settled and released funds separately.
Cancellation stops future nodes; uncertain payments retain their Hold until
reconciled. Read the same Plan after a timeout or lost response. Supported paid
execution uses admitted managed x402 Tools; paid fixed-AUD execution and unbounded
dependent prices refuse before a Hold.

`ae plan watch` observes while the Plan is `running`; returning `awaiting_approval` or `reconciliation_required` does not mean delivery is complete. Follow owner approval for the former. For the latter, retain the same Plan and inspect its per-node Calls and permitted recovery; do not run a replacement Plan. A partial result preserves completed outputs and identifies failed/skipped nodes. Read settled, released and still-held units independently. After response loss, use the returned `ae plan resume <recoveryRef>` continuation. Accepted, missing or refused Plan observations never trigger another run. Direct HTTP/MCP callers must still retain the exact original reference, total and key themselves; changing the key is not recovery.

## Exact procurement

`ae procure --input - --json` accepts either a `kind: "need"` selection request or a `kind: "exact"` purchase request. Selection returns a Tool and its required input without buying. An exact request contains `toolRef`, schema-valid `input`, `maxSpendAud` and `idempotencyKey`; inspect `ae help procure` and the generated schema before constructing it.

The CLI saves the complete exact request, origin, Account/Agent identity and key in the protected local purchase journal before sending it and returns a `recoveryRef`. This includes the Tool input, unlike ordinary Call records; preserve the private journal and do not share it. Authentication credentials are not added to purchase records. The serialized procurement body is limited to 64 KiB. Selection by need creates no purchase journal. Repeating unresolved material or a saved key after changing the local Account/Agent profile fails before a purchase; reconnect the original Agent. For intentionally independent Agents on one machine, use separate `AE_CONFIG_DIR` directories rather than clearing unresolved journals.

On response loss, run `ae procure resume <recoveryRef> --json` with the same origin and Agent, without input, preference or a new key. A known Call is observed only; its canonical Call status is returned with the local recovery reference. Without a Call reference, resume submits only the saved exact request and original key to the existing procurement replay boundary. Delivery alone does not resolve payment: `ae procure resume <recoveryRef>` records the original Call status before the journal can allow a fresh purchase with a different key. A refusal without a Call reference, even `retryable: false` or a budget refusal, can remain unresolved. Unresolved material blocks a fresh purchase under a different key. If Quote preparation stays unresolved, preserve the original request/key and request ID and contact support for investigation; the CLI cannot restart uncertain inspection. Direct HTTP/MCP callers still retain their own complete request and key. A fresh key can make another purchase.

## Origin, credentials, and Provider access

`--base-url <origin>` selects an origin-only HTTP(S) URL; `AE_CLI_BASE_URL`, then `AE_CANONICAL_BASE_URL`, are environment defaults when the flag is absent. With neither set, a loopback `CONVEX_URL`/`VITE_CONVEX_URL` selects `http://127.0.0.1:3024`; otherwise the CLI uses `https://app.aecon.ai`. Changing the origin does not prove that deployment is reachable or move credentials from another origin. Credentialed requests require HTTPS except loopback development.

`ae connect` stores an origin-bound buyer profile with user-only file permissions. For an environment-managed buyer key, set **both** `AE_API_KEY` and `AE_API_KEY_ORIGIN` to the key and the server's exact origin; mismatch or missing origin is rejected locally before sending the credential. `ae account status --json` reads the authenticated principal and scopes. `ae account connections --json` lists stored origins and profiles without bearer material. `ae account disconnect --json` removes only the selected origin's **local** buyer profile (use `disconnect provider` for the provider profile), not an environment key and not server-side access. `ae revoke` prints an owner-browser continuation URL; open it as the owner and complete revocation there. The CLI command itself does not revoke or open the browser.

Provider access is separate and owner-approved; an ordinary buyer credential is not a Provider credential:

```sh
ae connect --provider
ae doctor --provider --json
ae supply tools "$BUSINESS_REF" --limit 50 --json
ae supply status "$BUSINESS_REF" "$AE_TOOL_REF" --json
```

`ae doctor --provider "$BUSINESS_ID" --json` scopes readiness to that exact business; without an ID it checks provider credential access only. Provider `supply` offers preview, Tools/status, publication lifecycle, connections, Calls, and offboarding; read `ae help supply` and the exact operation's schema before any lifecycle write. Retain the authenticated `maintenance` tuple returned by publish or status and add the operation’s retained idempotency key. It contains the exact Business, Offering and Publication references, revisions and source hash; do not reconstruct them from a Tool title. Follow `continuation.args` and supply each named `requiredInput`, retaining the same key before a maintenance write. `supply tools` accepts `--limit` and an opaque `--cursor`; keep the same Business and origin when continuing. A stale or legacy publication can omit the maintenance tuple and require owner repair. The current `supply earnings` read returns `capability_unsupported`, not a usable balance or evidence of zero earnings. A Provider `supply disconnect` starts provider-connection revocation/cleanup and is **not** the same as local `ae account disconnect provider`. These commands report the selected deployment's local execution, not proof of a hosted release, Provider fulfilment, or customer value.


## Response compatibility

This pre-stability source uses one canonical response for each operation across
HTTP, MCP and CLI. Search retains its continuation arguments; Provider reads return
available maintenance identity; Plan reads describe permitted next actions.
There is no response-profile header to send or inspect. The proposed profile split
was never shipped and has been removed before external adoption.

The OpenAPI contract revision is independent of the app and CLI package versions.
Use a supported client and server combination from the [compatibility record](../../docs/operations/deployments.md#public-contract-compatibility).
This source change is not a newly published CLI or hosted compatibility claim.
Existing accepted purchase references, original request material and authorised
recovery remain valid; upgrading is not permission to replace an uncertain purchase.

## Upgrade, disconnect and uninstall

Read existing Calls and Plans and preserve their recovery identity before upgrading or removing a client. Verify the new published archive/version and the deployment's supported combination; a successful local install alone does not qualify hosted behaviour. Reconnect to the same exact origin if its credential or supported protocol requires it, then inspect `ae account status --json`.

`ae config --json` reports the local configuration path without bearer material. The sibling `calls` directory contains the purchase recovery journal: historical version 1 Call records and version 2 Plan run/exact procurement records. Existing saved Call records and their opaque references remain readable; no automatic migration or deletion is performed. Preserve that directory and the original origin/Agent context while any purchase is unresolved. Do not share the credential file or journal publicly. `ae account disconnect --json` removes a local buyer credential only; finish server-side revocation through the printed owner continuation when needed. Provider Connection cleanup is a separate supply operation.

For a global npm installation, `npm uninstall --global @agentic-economy/cli` removes the installed executable. It does not cancel accepted work, revoke server authority or settle/refund a purchase. Retain unresolved purchase journals and any manually retained direct HTTP/MCP requests so the same work can be read and recovered by an authorised client.
