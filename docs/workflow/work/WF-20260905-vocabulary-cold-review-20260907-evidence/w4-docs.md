# Wave 4 — cold documentation review

Scope reviewed: current checked-in normative/product docs, operational guides,
CLI/plugin instructions, runnable examples and internal links for the
Tool/Quote/Call cutover at HEAD `a51e17b221c6b73851c5873502d8150120ef3aad`
(source commit `3770b43bac9bf3ea11478664ee8249ec4ddf505e`). `PRODUCT.md`,
`CONTEXT.md`, root `AGENTS.md`, current route files, action contracts and CLI
manifest were used as authority. Node `v22.22.0`; npm `11.5.1`. No source,
test, deployment or external state was changed.

## Confirmed findings

### W4-DOC-01 — Current shell examples treat angle-bracket placeholders as literal runnable syntax

- Severity: P2
- Confidence: 10/10
- Files: `README.md:176-177`, `X402_SELLER_ONBOARDING.md:65`, plus the
  checked-in source guide’s same pattern at `tools/ae/README.md:14-15`
  (the latter is ignored/untracked in this checkout and is recorded here only
  as a lead for whoever publishes that guide).
- Motivating code:
  - `npm run -s ae -- describe <toolRef>`
  - `npm run -s ae -- call <toolRef> --input '{"city":"Perth"}'`
  - `ae supply operations <businessId> --base-url "$AE_ORIGIN" --json`
- Trigger/caller path: a user copies the documented `sh` blocks and substitutes
  nothing, or expects the conventional placeholder to be accepted by the
  shell. In zsh, `<toolRef>` is parsed as redirection; `describe` produced
  `parse error near '>'`, and the `call` example produced `no such file or
  directory: toolRef`. The Provider example likewise produced
  `no such file or directory: businessId` before `ae` ran.
- Observable impact: the new source CLI quickstart and Provider onboarding
  snippets fail at shell parsing/file redirection, so the advertised cold path
  cannot be copied and run. This is independent of the underlying current
  command contract, which does support `manifest`, `search`, `describe`,
  `call`, and `supply operations`.
- Evidence/reproduction: bounded `zsh -fc` runs against the exact three command
  forms above; `npm run -s ae -- manifest --json` succeeded, confirming the CLI
  entrypoint exists and the failure is the example syntax.
- Minimal correction direction: use quoted placeholders or environment
  variables, e.g. `"$AE_TOOL_REF"` and `"$AE_BUSINESS_ID"`, consistently in
  every copyable shell block. Keep the current Tool/Quote/Call commands.
- Provenance: `README.md:176-177` and `X402_SELLER_ONBOARDING.md:65` were
  introduced/rewritten by `a51e17b22`; the ignored source guide predates that
  commit. The defect is a refactor-era documentation regression in the tracked
  examples; the underlying CLI implementation is current.
- Counterevidence considered: `packages/cli/README.md:15-17` already quotes
  `"$AE_TOOL_REF"`, and generated discovery examples also quote the reference.
  Those correct examples do not repair the two tracked quickstarts or the
  Provider runbook.

### W4-DOC-02 — Plugin manifest metadata still teaches the retired Operation vocabulary

- Severity: P2
- Confidence: 9/10
- File: `plugins/agentic-economy/.codex-plugin/plugin.json:17,26-29`.
- Motivating code: `"longDescription": "Search public Operations, connect your
  account, review the selected service and make a Call within your authority..."`
  and default prompts `"Find an Operation..."` / `"Compare the terms of these
  Operations."`
- Trigger/caller path: plugin discovery/installation surfaces expose the
  manifest metadata and default prompts before the skill body is read. A user
  or host-generated task is therefore instructed to ask for “Operations,” while
  the accepted source contracts and the companion skill use Tool discovery
  (`registry.tools.*`) and Tool/Quote/Call language.
- Observable impact: the current plugin presents internally inconsistent product
  vocabulary. Agents can emit retired product terms in the first request and
  users cannot tell whether “Operation” is a distinct market object or the
  current Tool. This undermines the explicit plugin/discovery cutover and can
  make review or support instructions diverge from the current action IDs.
- Evidence/reproduction: the manifest parses as JSON and contains the exact
  strings above; `plugins/agentic-economy/skills/use-agentic-economy/SKILL.md:8-15`
  instead identifies a suitable Tool and the four `ae_registry_tools_*` tools.
  `docs/guides/package-6-plugin-release.md:43-48` says the checked-in plugin
  source uses the accepted Tool procedure, so the manifest is the mismatching
  surface.
- Minimal correction direction: update only the user-facing manifest
  description/default prompts to Tool terminology, then run the existing plugin
  validator when publication work resumes. Preserve protocol names and the
  separate historical evidence fields in the skill/runtime.
- Provenance: manifest text is unchanged since the plugin scaffold checkpoint
  `971660119`; it survived the Tool/Quote/Call refactor and is a pre-existing
  omitted propagation within the approved plugin-instructions boundary.
- Counterevidence considered: `SKILL.md` is already current, and the MCP tool
  names are correctly `ae_registry_tools_*`; this finding is limited to manifest
  metadata/default prompts, not those protected/generated names.

### W4-DOC-03 — Active normative documents retain legacy Business Principal / Agent Principal product prose

- Severity: P2
- Confidence: 9/10
- Files and motivating code:
  - `DESIGN.md:29`: `Who is the Business Principal, acting Agent Principal,
    Provider and Seller?`
  - `START_LINE.md:16`: `The Business Principal funds an AUD prepaid balance.`
  - `START_LINE.md:44-45`: `Business Principal, Account, Agent Principal...`
  - `docs/designs/agent-operating-contract.md:21-22`: `An Agent Principal is the
    durable technical identity acting for a Business Principal.`
  - `docs/operations/deployment-architecture.md:89`: ``tool.quote` resolves
    Account, Agent Principal...``
- Trigger/caller path: a product, UI, implementation or operations reader follows
  the active design contract/start line/runbook after reading the accepted
  glossary. The active docs require the reader to map Customer/Agent back to the
  old role names and can seed new labels in screens, runbooks or acceptance
  criteria.
- Observable impact: current authoritative prose disagrees with `CONTEXT.md:28-29`
  (Customer/Agent mapping) and its explicit rule at `CONTEXT.md:41-47,61-64`
  that earlier names remain only for historical/protected/internal reasons and
  are not current ordinary prose. This does not change runtime behavior, but it
  keeps the product and implementation vocabulary split across active docs.
- Evidence/reproduction: `rg` over the tracked current docs finds these legacy
  role terms only in the active documents above (plus the explicit compatibility
  table in `CONTEXT.md`); current root README and current CLI/plugin instructions
  use customer/agent/Tool/Quote/Call language. The source’s internal
  `agentPrincipal`/generic `Principal` identifiers were checked and excluded as
  implementation/IAM concepts.
- Minimal correction direction: use Customer and Agent in ordinary active
  product/design/operations prose, while retaining generic IAM Principal and
  internal storage/API identifiers where `CONTEXT.md` expressly preserves them.
  Update the role labels and affected examples together; do not rename generic
  source concepts as part of this documentation correction.
- Provenance: the legacy wording predates the final cutover in the active design
  and start-line documents; `a51e17b22` changed adjacent Tool/Quote/Call prose
  but left these terms. Labelled pre-existing/omitted propagation rather than a
  runtime defect.
- Counterevidence considered: `CONTEXT.md` deliberately lists Business
  Principal and Agent Principal as retained implementation/historical meanings,
  and source files still use `agentPrincipal`. The finding is only the unqualified
  use in current normative product prose, not those compatibility/internal uses.

### W4-DOC-04 — Roadmap progress row links to two files removed from the current tree

- Severity: P3
- Confidence: 10/10
- File: `IMPLEMENTATION_ROADMAP.md:157`.
- Motivating code: links to
  `./src/components/ae/offerings/AeOwnerOperationsWorkspace.tsx` and
  `./tests/unit/ui/owner-operations-workspace.test.tsx` in the Package 2
  progress row.
- Trigger/caller path: a reader follows the active roadmap’s Package 2 evidence
  links to inspect the claimed workspace and tests.
- Observable impact: both relative links are dead in the checked-in HEAD; the
  reader cannot reach the implementation evidence from the roadmap. Current
  replacements exist as `src/components/ae/offerings/AeProviderWorkspace.tsx`
  and `tests/unit/ui/provider-workspace.test.tsx`, so the row points at a removed
  pre-refactor workspace/test pair rather than an intentionally external link.
- Evidence/reproduction: a read-only relative-Markdown-link scan reported both
  targets; `git cat-file -e HEAD:<target>` failed for both old paths and
  succeeded for the current Provider workspace/test paths. No runtime or source
  behavior was exercised.
- Minimal correction direction: point the Package 2 evidence row at the current
  workspace/test artifacts (or at the maintained Package 2 design if those are
  not the intended proof), and preserve the row’s explicit “no fresh acceptance
  run” qualification.
- Provenance: the stale links were introduced in `a51e17b22` while reconciling
  the roadmap; the underlying workspace rename/removal predates the cutover.
- Counterevidence considered: the Package 2 design and current Provider
  workspace route exist, and the roadmap is otherwise marked as a progress
  reconciliation rather than fresh acceptance. That status does not make dead
  internal links usable.

## Explicit gaps and excluded leads

- Per the brief, no broad test suite, compiler, deployment, hosted probe or
  installed-package/plugin acceptance run was performed. Source route files and
  the in-process CLI manifest were read to verify documented paths and command
  names only.
- No external URL availability was claimed. The package 6 release record itself
  documents unresolved hosted/plugin publication status; this review did not
  turn those holds into refactor findings.
- Dated historical evidence (including Package 4/5 records), the dated
  `UBIQUITOUS_LANGUAGE.md` proposal, protocol fields such as x402 `seller claim`,
  generic IAM/source identifiers, and runtime recovery evidence fields
  `invocationRef`/`operationRef` were inspected as needed and excluded where
  their retention is explicit.
- `tools/ae/README.md` is present but ignored/untracked in this checkout, so its
  duplicate shell-placeholder defect is not counted as a checked-in finding;
  release owners should decide whether that generated/local guide is published.
- No other confirmed current-doc link failures were found in the bounded scan.

Confirmed finding count: 4 (P2: 3, P3: 1).
