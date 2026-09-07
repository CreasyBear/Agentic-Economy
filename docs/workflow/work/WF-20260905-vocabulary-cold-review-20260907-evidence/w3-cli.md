# Wave 3 CLI review

## Scope inspected

Reviewed the current CLI boundary at HEAD `a51e17b221c6b73851c5873502d8150120ef3aad`, including the source refactor `3770b43bac9bf3ea11478664ee8249ec4ddf505e` and its surrounding callers. Read `PRODUCT.md`, `CONTEXT.md`, the applicable `AGENTS.md`, and the assigned brief first. Inspected `tools/ae/cli.ts`, `tools/ae/commands/{manifest,request,doctor,connect,list,search,compare,status,wait,history,account,supply,call,recover,cancel}.ts`, the CLI argument/config/output/continuation helpers, package/build metadata, and the relevant market-terminal unit tests. Node/npm were `v22.22.0` / `11.5.1`. No source or test files were changed and no tests/compiler were run, per the brief.

## Confirmed findings

### CLI-01 — Manifest advertises two commands with no runner (P2, confidence 10)

**Location and evidence.** `tools/ae/commands/manifest.ts:312-317` emits the technical manifest with `commands: COMMANDS` followed by `coldLoop: ['search', 'describe', 'connect', 'call', 'history', 'wait', 'receipt', 'reuse']`. The human manifest projection repeats `coldLoop: ['search', 'describe', 'call', 'wait', 'receipt', 'reuse']` at `:490-495`. `COMMANDS` at `:97-283` has no `receipt` or `reuse` entry. The only registered root runners are assembled in `tools/ae/cli.ts:418-435`; there is no `receipt` or `reuse` runner, and an unknown root returns `code: 'unknown-command'` at `:506-519`.

**Trigger / impact.** An external agent follows the manifest's mixed command list and invokes `ae receipt` or `ae reuse` after a Call. The CLI rejects both as unknown commands, even though the manifest's `about` text (`manifest.ts:315`) says to preserve and reuse successful work. The actual recovery surface is `history`, `status`, `wait`, and `recover`; receipt data is embedded in those Call projections rather than exposed by either advertised command. This is a dead-end machine contract and makes the cold loop non-executable.

**Evidence / counterevidence.** `tests/unit/market-terminal/recovery.test.ts:176` explicitly locks the stale eight-item list, while `tests/unit/market-terminal/cli-errors-help.test.ts:20-40` enumerates the actual nineteen root commands and omits both names. Receipt fields at `manifest.ts:364-368` are valid output metadata, so the finding is the command-list mismatch, not the protected `receipt` vocabulary.

**Minimal correction direction.** Make each cold-loop item an actual registered command, or remove `receipt`/`reuse` from the executable command list and describe their status/recovery projections separately. Update the manifest test so it derives or checks against the runnable command set. **Provenance:** pre-existing stale conceptual entries carried through the refactor; the refactor changed surrounding protocol/vocabulary but did not repair the mismatch.

### CLI-02 — Private request continuations lose the selected origin and JSON mode (P2, confidence 10)

**Location and evidence.** `tools/ae/commands/request.ts:65-69` builds the `current_match_exists` and idempotency continuations without `options.baseUrl` or `--json`. A successful create always builds `ae request status <requestRef>` at `:84`; each human list item builds `ae request status <requestRef>` at `:141-147`; and status builds either `ae describe <toolRef>` or another `ae request status <requestRef>` at `:169-173`. These paths do not use the origin/output suffix that list pagination correctly applies at `:118-129`.

**Trigger / impact.** Run `ae request create ... --base-url http://[::1]:<port> --json`, or run `request status`/`request list` against a selected custom origin. The returned next command silently resolves the default hosted origin on a fresh invocation and, for a JSON caller, switches to human output. If `AE_API_KEY_ORIGIN` remains bound to the custom server, the continuation can fail origin validation before reaching the intended server; otherwise it can inspect or search the wrong server. This breaks the request re-entry chain for local, self-hosted, and explicitly selected origins.

**Evidence / counterevidence.** `tools/ae/lib/args.ts:91-105` shows that a `--base-url` selection is per invocation and defaults to the hosted origin; stored connections do not change that default. The dedicated request-origin test only covers list pagination (`tests/unit/market-terminal/request-origin-continuation.test.ts:41-165`), leaving create/status/per-item paths unprotected. The existing list paginator is correct and demonstrates the intended preservation rule.

**Minimal correction direction.** Centralize request continuation construction and append the selected non-default origin and current output mode to every actionable request continuation, including refused/create/status/list-item paths. **Provenance:** pre-existing in the request command and carried through the refactor; the refactor changed the matched field from operation to Tool but preserved the omission.

### CLI-03 — `doctor` emits actionable commands against the default origin (P2, confidence 10)

**Location and evidence.** `tools/ae/commands/doctor.ts` receives `baseUrl` throughout but several returned commands omit it: provider readiness uses `ae supply operations <businessId>` at `:204-208`, `:220-223`, and `:225-229`; market-request re-entry uses `ae describe <toolRef>` at `:324-329` and `ae request list` at `:344-348`; balance uses `ae account balance` / `ae fund` at `:417-428`; Call recovery uses `ae history`, `ae status <callRef>`, and `ae wait <callRef>` at `:443-469`; and repeat-use uses `ae describe <toolRef>` at `:482-485`. Only the connect continuation helper at `:396-404` preserves the selected origin.

**Trigger / impact.** Run `ae doctor --base-url <custom-origin> --json` with a reachable custom server and a state that produces any of those warnings, failures, or re-entry/pass suggestions. The JSON diagnosis tells an agent or operator to execute a bare command. On a fresh invocation that command selects `HOSTED_DEFAULT_BASE_URL` (`tools/ae/lib/args.ts:78-104`), so it can inspect, recover, fund, or supply against the wrong server. The JSON result has no top-level selected-origin field from which a machine caller could safely reconstruct the command.

**Evidence / counterevidence.** `tests/unit/market-terminal/doctor.test.ts:194-198`, `:219-229`, `:314-323`, `:409-415`, and `:531-536` explicitly expect bare `status`, `wait`, `describe`, and `supply operations` continuations while invoking `doctor --base-url` with a test origin. `connectCommand` is correct, and `serverFailure` deliberately routes through a safe configuration continuation; those paths do not cover the omitted-origin branches. **Provenance:** pre-existing doctor behavior carried through the refactor; Tool/Provider renames in the source commit did not alter the origin omission.

**Minimal correction direction.** Pass one continuation context (selected origin and output mode) through every doctor check and use the same shell-safe builder as `connectCommand`; preserve deliberate owner-browser semantics for `fund` while still carrying the selected server URL.

### CLI-04 — `connect` success and timeout guidance drops the origin (P2, confidence 10)

**Location and evidence.** `tools/ae/commands/connect.ts:68-76` formats the timeout `nextAction` as `ae connect` (optionally `--provider`) without `--base-url`. The success helper at `:79-81` returns bare `ae search` or `ae supply operations <businessRef>`, and it is included in connected results at `:193-196` and `:291-295`; human output repeats bare next commands at `:106-110`. The selected origin is stored at `:269-275`, but `tools/ae/lib/args.ts:78-104` does not use stored connections as the next invocation's default.

**Trigger / impact.** Connect with `ae connect --base-url <custom-origin>` (or `--provider`) and either let the device flow time out or complete it. The emitted next action sends the user/agent to a bare command, which selects the hosted origin on a fresh process. Provider workflows can therefore run supply operations against the wrong deployment; buyer workflows can search a different catalog while the newly stored key remains bound to the selected custom origin. The timeout path also loses the server on the only actionable retry instruction.

**Evidence / counterevidence.** `ownerConnectionHref` correctly derives from `options.baseUrl` at `:84-87`, and OAuth requests and storage use `options.baseUrl` at `:205-218` and `:269-275`; the defect is confined to follow-up guidance. No focused test was found for a custom-origin connected or pending result. **Provenance:** pre-existing connect guidance carried through the refactor; only the profile word changed from supplier to provider in the source commit.

**Minimal correction direction.** Build success and pending follow-up commands from the selected origin and profile, preserving the caller's machine-output mode where the result is intended for automation.

## Uncertain leads and verification gaps

- `tools/ae/commands/connect.ts:117-122` passes the server-provided `verification_uri` directly to a detached OS opener whenever stdout is a TTY. The response field is only checked for nonempty text at `:48-55`; no same-origin or scheme policy is visible. This may permit an unexpected URI/scheme to be opened, but I did not classify it as confirmed because the supported deployment contract for verification URIs and platform opener behavior were not traced in this bounded pass.
- `tools/ae/commands/call.ts:64-100` has transport/timeout failures whose detail explains status/retry but does not always expose an executable `nextCommand`; the shared status/wait paths do preserve identity. This is a possible machine-actionability gap, but needs an output-contract trace before classification.
- No runtime or test execution was performed. Hosted deployment behavior, installed-package parity, and platform-specific detached opener behavior remain unverified; this report does not treat the existing broad receipt claims as production proof.

