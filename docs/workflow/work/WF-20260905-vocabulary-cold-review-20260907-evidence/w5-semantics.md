# Wave 5 — semantic cutover review

Scope reviewed: current HEAD `a51e17b221c6b73851c5873502d8150120ef3aad` (source
cutover `3770b43bac9bf3ea11478664ee8249ec4ddf505e`), focused on public and
machine vocabulary, action IDs/CLI commands, Tool versus Offering/Publication/
Listing/Source boundaries, Agent/Provider/Seller roles, and Action execution
versus purchased Call. Node `v22.22.0`, npm `11.5.1`.

Inspected boundaries included `src/modules/actions`, registry Tool actions and
contracts, capability execution Quote/Call/recovery actions, funding and account
actions, `src/lib/server/supply-landing.functions.ts`, the provider landing
route/UI, `tools/ae` command manifest/adapters/runners/README, current status,
privacy, support, and owner supply UI copy, plus focused unit tests. I used
`git show`/HEAD content where the checkout had unrelated dirty edits. No source
or test files were changed and no broad tests/compiler/deployment was run.

## Confirmed findings

### P2 — provider landing drops every public Tool inspection action

- Confidence: 10/10.
- Evidence: `src/lib/server/supply-landing.functions.ts:10-15` filters
  `listMcpActions()` with `action.id.startsWith('registry.operations.')`.
  The current registry in `src/modules/actions/index.ts:71-76` registers the
  Tool reads as `registry.tools.list/search/describe/compare`; no current
  `registry.operations.*` action exists. The resulting `tools` array is always
  empty on the normal `/for-providers` loader path (`src/routes/for-providers.tsx:7-31`),
  so `AeSupplyAgentProof` renders “AE public inspection actions are temporarily
  unavailable” (`src/components/ae/supply/AeSupplyAgentProof.tsx:39-42`) even
  when the anonymous Tool actions are available.
- Masking evidence: `tests/unit/capability-supply/supply-landing-authority.test.ts:12-21`
  mocks the removed `registry.operations.search` ID and expects it at lines
  39-44, so the test preserves the stale contract instead of exercising the
  current Tool action IDs.
- Minimal correction direction: select the registered Tool market reads by the
  current `registry.tools.*` contract (or the existing `isToolMarketReadAction`
  identity) and update the focused fixture to use current IDs. Do not add an
  old-ID alias. This is refactor-induced: the consumer remained on the prior
  registry prefix after the Tool action rename.
- Counterevidence considered: the landing UI intentionally keeps public action
  rows separate from published Tool listings, and that distinction is correct;
  only the stale action filter prevents the rows from being populated.

### P2 — Provider CLI exposes a removed `operations` subcommand for Tool listing

- Confidence: 10/10.
- Evidence: `tools/ae/commands/supply.ts:37-40` maps the current
  `supply.tools.list` action to subcommand `operations`; `:91-97` parses only
  that word. The manifest repeats it in `tools/ae/commands/manifest.ts:195-207`
  and `:509-513`; packaged/source guidance repeats it in
  `tools/ae/README.md:36-41`. `tools/ae/commands/connect.ts:79-81,106-110`
  and `tools/ae/commands/doctor.ts:205-228` emit `ae supply operations ...`
  as the next command. Consequently `ae supply tools ...` is rejected as an
  unknown provider subcommand while the current `supply.tools.list` action is
  reached only through the old noun.
- Trigger/caller path: `ae connect --provider` or `ae doctor --provider
  <businessId>` gives the old continuation; a provider following the canonical
  Tool vocabulary cannot invoke the listed Tool inventory command.
- Minimal correction direction: rename the CLI subcommand and every manifest,
  README, connection, and doctor continuation to `supply tools`; preserve the
  action ID `supply.tools.list` and route. With no users, no compatibility alias
  is required.
- Provenance: the descriptor mapping was introduced/retained in the 3770
  vocabulary cutover; the surrounding continuation callers are omitted
  consumers. Counterevidence considered: the old command does route to the
  correct action, so this is a public vocabulary/caller contract defect rather
  than a server route failure.

### P2 — public action metadata advertises nonexistent continuation IDs

- Confidence: 9/10.
- Evidence: `src/modules/agent-access/account.actions.ts:362-366` declares
  `safeContinuations: ['operation.status']` for the current
  `agentAccess.activity` action, and
  `src/modules/money/funding-handoff.actions.ts:195-199` declares
  `safeContinuations: ['operation.invoke']` for current
  `funding.handoff.status`. Current registered action IDs are Tool/Call names
  (`src/modules/actions/index.ts:71-110`); neither `operation.status` nor
  `operation.invoke` is registered. `tools/ae/commands/manifest.ts:292-310`
  includes each action's `invocationContract` in the machine manifest, and
  `:449-467` includes account and funding/supply action entries, so a technical
  manifest consumer can receive an action ID it cannot resolve or invoke.
- Observable impact: an agent following the manifest's safe continuation after
  account activity or funding status cannot map that continuation to a current
  action; this breaks the advertised machine chain even though the underlying
  read/status action itself may succeed.
- Minimal correction direction: replace these two continuation IDs with the
  actual supported current action(s), or remove a continuation where none is
  supported; add a registry-reference check for machine continuation IDs. Do
  not retain the old IDs as aliases. Provenance is pre-existing/omitted from
  the cutover (the two lines predate 3770), but it is within this current
  action-ID boundary.
- Counterevidence considered: `describeActionForAgent` alone omits
  `invocationContract`, but the public `ae manifest --technical` path includes
  it, so omission from ordinary descriptors does not make the metadata safe.

## Uncertain leads / verification gaps

- Ordinary UI copy still says “Operation(s)” in current Tool/provider contexts,
  including `src/lib/operator/navigation.ts:61-65`,
  `src/components/ae/status/AeCapabilityList.tsx:24,53-70`,
  `src/routes/privacy.tsx:23,33-39,54-76`, `src/routes/status.tsx:27,36,96,220-264`,
  and `src/components/ae/console/AeAssistantInstallFunnel.tsx:23,33-34`.
  These are clear canonical-language residues, but I did not split them into
  another finding because they are copy-only and several records shown by the
  owner view are deliberately portfolio Offering rows; a bounded copy sweep
  should confirm the intended label per surface.
- `operationRef`, `invocationRef`, `operationId`, `operation:v1:*`, and
  standing-mandate strings remain in current internals/tests. I treated them as
  protected evidence/hash material, external OpenAPI vocabulary, opaque
  encodings, or generic Action-execution records as directed, and did not flag
  raw grep matches.
- No confirmed Agent/Provider/Seller collapse or Action-execution/Call record
  duplication was found in this focused pass; current Call action boundaries
  and public Tool projections keep those distinctions explicit.

Confirmed findings: 3. Report path: `/tmp/ae-cold-papercut-audit-20260907/w5-semantics.md`.
