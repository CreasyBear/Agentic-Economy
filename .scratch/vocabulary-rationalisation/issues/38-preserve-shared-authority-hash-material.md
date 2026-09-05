# Preserve shared authority hash material before policy vocabulary cutover

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee: /root/vocabulary_12 (GPT-5.6 Luna, max)
Assigned role: Luna Max / shared authority-material serializer owner
Parent: ../map.md
Blocked by: 11

## Outcome

Introduce one narrow shared serializer for the accepted authority basis before
issue 12 changes its source vocabulary. The serializer is named
`canonicalAuthorityBasisMaterial` and lives in the existing
`src/modules/action-execution/contracts.ts`, re-exported through the existing
`src/modules/action-execution/runtime.ts`.

The serializer must be used by exactly these three existing stored-hash sites:

- `src/modules/action-execution/canonical-claim.ts` when building
  `canonicalCommandMaterial.authority.acceptedBasis`.
- `src/modules/capability-execution/operation-invoke.ts` in
  `buildOperationInvokeAuthority`.
- `convex/capabilityOperationInvocationIdentity.ts` when building
  `expectedDecisionDigest`.

Before issue 12, the helper preserves the current authority-basis shape,
canonical key order, discriminators, opaque references and exact digest bytes.
Issue 12 subsequently owns the literal target-to-protected mappings in this
same helper. This issue changes no runtime decisions, authority ordering,
expiry/revocation behavior, public HTTP/MCP contract or persisted authority
mode.

`src/modules/action-execution/internal/durable-contracts.ts` is not a fourth
hash site: its `canonicalDigest` call validates that the accepted authority is
stable JSON, but the result is discarded and is not compared with a retained
identity. Preserve that validation behavior; do not add a codec or route that
file through the new serializer.

## Exact structural change

- Add `canonicalAuthorityBasisMaterial` to the existing action-execution
  contracts module.
- Re-export it from the existing action-execution runtime entry so all three
  consumers use one owner.
- Replace the three direct accepted-basis inputs to the stored hash material
  with the helper result, without changing the surrounding format literals,
  fields, key order or digest algorithm.
- Keep the returned/persisted authority's source-facing `acceptedBasis` and
  validated type separate from its serialized hash input. Do not cast a
  `StableHashValue` result into the runtime authority union. Before issue 12
  their values and bytes are identical; issue 12 later changes only the
  protected serialization projection. This creates no second authority
  record or new compatibility layer.
- Keep the current basis values and fields byte-identical before issue 12:
  `approve_each`, `standing_mandate_use`, `customer_request_mandate_use`,
  nested `explicit`/`standing_low_risk`, and `public_capability_use`, including
  their existing `mandateRef`, `mandateDigest`, standing-policy references,
  grant evidence and `grantDigest` keys.

No target Spending policy/Request authorization names or new authority modes
are introduced here. Those source-facing mappings belong to issue 12 and must
be implemented in this same helper after this issue closes.

## Finite source and test allowlist

### Source files

- `src/modules/action-execution/contracts.ts`
- `src/modules/action-execution/runtime.ts`
- `src/modules/action-execution/index.ts` — remove only this issue's newly
  added helper export, restoring the file to its pre-issue state; do not
  publish the broad barrel as a runtime entry.
- `src/modules/action-execution/canonical-claim.ts`
- `src/modules/capability-execution/operation-invoke.ts`
- `convex/capabilityOperationInvocationIdentity.ts`

### Tests

- `tests/unit/action-execution/authority-material.test.ts` — new focused
  helper test, importing the serializer and claim builder through the existing
  action-execution runtime entry.
- `tests/unit/capability-execution/operation-invoke-authority.test.ts` — add
  deterministic fixed-time decision-digest vectors while preserving existing
  cases.
- `tests/unit/convex/capability-operation-invocation-identity.test.ts` — add
  only if needed to prove the existing identity consumer uses the shared
  serializer.

No other source, test, Convex schema, generated output, package script,
fixture, documentation, map, work record or deployment file is in scope.

## Protected material and exclusions

- Preserve `action-invocation-claim:v1` and
  `operation-invoke-authority:v1` format literals, command/decision identity
  fields, canonical ordering and all existing digest bytes.
- Preserve the existing `issued-agent-principal:v2`, audit, OAuth, x402,
  provider, seller, financial and opaque identifier/signature namespaces.
- Preserve the accepted-basis validation and refusal behavior, including the
  distinction between reusable standing authority, request-specific authority
  and explicit Approval.
- Do not rename any authority mode/discriminator yet; issue 12 owns the later
  source-to-protected projection in the shared helper.
- Do not add a compatibility alias, second serializer, generic framework,
  migration, dependency or persisted-row rewrite.
- Do not modify `internal/durable-contracts.ts`; its discarded digest result
  is validation only and must not be treated as a retained identity.

## Dependencies and sequencing

- Issue 11 must close its generic module/table move first so the
  `action-execution` target paths and `executionRef` boundary are stable.
- This issue is serialized before issue 12: `11 -> 38 -> 12`.
- Issue 12 is the only later owner allowed to add target policy/authorization
  mappings to `canonicalAuthorityBasisMaterial`.
- Issue 22 owns generated Convex/router/CLI/public output and remains a later
  checkpoint; this issue does not edit generated files or package scripts.

## Verification commands and expected results

Run only after issue 11 closes, with Node 22/npm 11.5.1 through the repository
runner:

1. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/unit/action-execution/authority-material.test.ts tests/unit/capability-execution/operation-invoke-authority.test.ts tests/unit/convex/capability-operation-invocation-identity.test.ts --no-file-parallelism` — the shared serializer and all three consumers produce the pre-issue-12 vectors; existing authority cases remain green. If the optional Convex identity test is not needed, omit only that path.
2. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck` — no authority-basis type drift.
3. `NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:types` — generated type consumers remain valid.
4. Check the existing module/import boundary tests relevant to the new shared
   entry. Under Joel's source-first adjustment, this existing-module helper
   does not require a Convex generation or operational exercise unless an
   affected generated contract is identified. Broad integrated checks remain
   at integration; no backend start, deployment, reset or generated-file hand
   edit is permitted.

## Acceptance

- [x] One and only one `canonicalAuthorityBasisMaterial` serializer exists in
      the existing action-execution contracts/runtime boundary.
- [x] The three named hash sites consume that serializer; no runtime decision
      or refusal behavior changes.
- [x] Fixed vectors prove the pre-issue-12 accepted-basis material and digest
      bytes are unchanged, including operation-invoke and Convex identity
      consumers.
- [x] Durable-contract validation remains unchanged and does not become a
      fourth serializer consumer.
- [x] No target authority modes, aliases, migrations, generated edits,
      dependencies, public contract changes or unrelated files are included.

## Closure evidence

Attach the helper's before/after canonical material and digest vectors, the
three call-site comparison, the focused test output, typecheck/test:types
output and relevant existing import-boundary checks. Record explicitly that
`internal/durable-contracts.ts` still discards its validation digest and that
issue 12 is the next serialized owner for target vocabulary projection.

## Comments

- 2026-09-05 — Coordinator resolves the import blocker using the existing
  approved `runtime.ts` entry: move the new helper export there, update both
  cross-module callers and the new helper test to `/runtime`, and restore
  `index.ts` to its pre-issue bytes. The direct same-module claim import stays
  unchanged. No module-manifest change, test exception or new runtime surface
  is authorized. This supersedes the initial index-entry instruction; rerun
  the same focused tests and affected import checks.
- 2026-09-05 — Coordinator direction: this structural serializer is necessary
  before issue 12 because canonical claim, operation-invoke authority and
  Convex expected-decision identity otherwise duplicate old-name projections.
- 2026-09-05 — Coordinator direction: standalone
  `normalizeStoredAgentAccessPolicy` v1-to-v2 normalization is preserved; the
  stored-grant legacy branch remains issue 12's v1/omitted-`operationRefs`
  digest-preservation boundary.
- 2026-09-05 — Source receipt: `canonicalAuthorityBasisMaterial` is implemented
  in the existing contracts/runtime boundary and is consumed by the canonical
  claim, operation-invoke authority and Convex expected-decision hash sites.
  Runtime/persisted `acceptedBasis` remains the typed validated union; only the
  hash material uses the helper result. The durable-contracts validation digest
  remains untouched and discarded. Fixed helper vectors cover
  `approve_each`, `standing_mandate_use`, both request-authorization branches,
  and `public_capability_use`; the canonical-claim fixed command digest is
  `sha256:fd71f1cb4e8a50accb2d655f4d112ccb80935ee895a8ba4039801a6ce9120862`,
  and the operation-invoke fixed decision digest is
  `sha256:a6593ac21dc320b6dc73b350feea4b5832f23f88ded0319037f5fe18d1e517f7`.
  Focused suites pass (3 files, 10 tests), `typecheck` passes, and `test:types`
  passes (4 tests), all under Node 22.22.0/npm 11.5.1.
- 2026-09-05 — Bounded import-check blocker: the existing module-boundary
  manifest does not declare `action-execution/index.ts` (or `contracts.ts`) as
  a runtime entry. Therefore the required public-index imports from
  `operation-invoke.ts` and `capabilityOperationInvocationIdentity.ts` are
  rejected, and the new public-index test needs a white-box exception. No
  manifest/runtime-seam expansion was made outside this issue's finite
  allowlist; coordinator direction is required before resolving this issue.
- 2026-09-05 — Coordinator-approved resolution: the serializer is now
  re-exported through the existing `action-execution/runtime.ts` entry; the two
  production consumers and focused authority-material test import that seam,
  while the direct same-module canonical-claim contracts import remains. The
  broad `action-execution/index.ts` is restored to its pre-issue bytes. The
  issue-specific runtime/import violations are cleared without a manifest
  change, new exception or additional runtime surface. Focused suites pass (3
  files, 10 tests), `typecheck` passes, and `test:types` passes (4 tests).
  `action-execution-host-boundaries.test.ts` passes. The module-boundary suite
  issue-specific runtime/consumer checks pass (2 tests); that initial full run
  also reported an import introduced by issue11 (not original baseline debt) from
  `tests/unit/action-execution/standing-mandate.test.ts` to
  `action-execution/standing-mandate.ts`; issue38 does not modify that test or
  manifest entry. The coordinator returned it to the issue11 owner; corrective
  commit `7780b1673` now tests the same integrity through the existing store
  restoration boundary. Standing-policy, complete module-boundary and host
  boundary suites then passed together (3 files, 62 tests). No import failure
  was waived, and no runtime manifest exception was added.
