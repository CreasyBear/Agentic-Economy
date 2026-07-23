# Phase 5 Gate 0 — Offering predecessor

## Result

Gate 0 freezes the inherited Offering v2 lane as one commit on
`codex/phase5-gate0`, based on
`a27ee0c9efeae4dccd5d683958620b167f35af23`
(`af40e244e7aae7db5a6f834659433e2f0c672f07`).

The commit containing this summary is the only permitted predecessor for
05-02. Its exact commit and tree are recorded in the parent handoff after Git
creates them. The final content-bound custody manifest is
`/tmp/ae-phase5-gate0-final.json`.

## Observable behavior

- Native Offering revisions and access paths persist with exact source hashes.
- Legacy synthetic identities cannot become durable native Offering identity.
- Migration drift and incomplete cutover evidence fail closed.
- Public business, discovery, UCP, registry, owner and agent projections derive
  from the same Offering source contract.
- Capability support is attributed only through a current exact catalog origin.
- Advertised discovery routes, including `/for-agents` and the read-only
  Customer Request schema, resolve through existing route handlers.
- No consequential action, provider call, payment or deployment is introduced.

## Verification

RED before the correction:

```text
tests/integration/discovery-route-parity.test.ts
https://ae.example/for-agents: expected false to be true
```

After adding the existing static route to the parity resolver, the same loop
also exposed the already-advertised read-only schema URL:

```text
https://ae.example/api/v1/requests/schema: expected false to be true
```

The resolver now dispatches both existing routes. No Customer Request source
or behavior changed.

Commands:

```text
npm exec -- vitest run <23 focused Offering/capability/discovery/registry/UI files>
PASS — 23 files, 109 tests

npm run build
PASS — production bundle and TanStack route-tree generation

generated-import base/readback script
PASS — 38 added generated imports exist; catalogSupplyProjection is the sole
overlay-new module and every other generated module is tracked in the frozen base

git diff --check
PASS

npm run typecheck
DIAGNOSTIC — exit 2
```

Typecheck remains the parent-accepted inherited diagnostic until 05-08. The
first failures are in `convex/capabilitySupplyGraphPorts.ts`,
`convex/capabilitySupplyOperationPorts.ts` and inherited Customer Request
ports. Later failures include pre-existing Action Invocation, notification and
capability-origin hash typing. Focused Gate-0 tests are green; this commit does
not claim repository-wide typecheck closure.

## Generated Convex edge

The first local command:

```text
npm exec -- convex codegen --typecheck=disable
```

failed because `CONVEX_DEPLOYMENT` was absent.

The parent then authorized one process-local read of the existing configured
`.env.local`, without copying or printing it. That command exited successfully
and generated `convex/_generated/api.d.ts`, but emitted:

```text
.env.local:19: parse error near `\n'
Downloading current deployment state...
Uploading functions to Convex...
Generating TypeScript bindings...
```

No further Convex command was run. The parent accepted the exact generated
output after local inspection proved that every added module except the new
`catalogSupplyProjection` already exists in the frozen base. The unexpected
upload wording is recorded as an unresolved provenance concern; it is not
treated as deployment, hosted readback or release evidence.

## Changed-path custody

The source closure is the 77 paths bound by
`/tmp/ae-phase5-gate0-overlay.json`
(`47f4246159af2372b094d17a099910307ccaec4a21bbfa163ac06de5e70f5cb0`),
plus:

- `convex/_generated/api.d.ts`
- `.planning/phases/05-consumer-operating-proof/05-01-SUMMARY.md`

No other path is part of this commit.

## Evidence and claim ceiling

Evidence is a committed source candidate plus focused local unit, integration,
UI-contract, generated-import and build evidence.

It does not prove hosted behavior, deployment identity, provider availability,
routeable supply quality, customer demand, willingness to pay, fulfilment,
payment, accessibility in use or production safety.

## Unresolved finding and next action

The broad typecheck baseline remains red and the Convex CLI's unexpected upload
wording prevents any deployment or hosted claim. The parent must audit this
commit and final custody manifest, then may dispatch 05-02 only from the exact
accepted commit/tree. No later plan should rerun Convex control-plane commands
as part of this Gate-0 evidence.
