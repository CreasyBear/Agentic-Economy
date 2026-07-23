## 2026-07-20 protected human route-operability correction mapping

Three source-compatible mappings were evaluated against the accepted UI
contract and the live TanStack Start patterns:

1. **Shared server-bound human admission/read seam — selected.**
   `src/lib/server/hosted-paid-operation-human-api.ts` can follow
   `src/lib/server/require-operator-session.ts`: a `createServerFn`-backed
   `beforeLoad` derives the current Clerk session and redirects an
   unauthenticated request to `/sign-in` with the exact `location.href` as its
   return target. The setup POST remains a native form submission and thinly
   translates the existing source-created inspect relation into a `303
   Location`. The detail loader calls a route-local `createServerFn` whose
   server handler alone imports the authenticated runtime and human inspect
   adapter. This protects initial GET and client navigation without adding
   lifecycle, authority, provider, custody, or evidence state.
2. **Client fetch/navigation — rejected.** A client-owned fetch, pending state,
   error state, and imperative navigation path would duplicate transport
   behavior already owned by the route/server boundary. It would also make it
   easier for auth/environment/runtime dependencies or protected response
   details to enter client state.
3. **JSON-only or narrowed route — rejected.** Returning the creation JSON to a
   native browser form leaves the evaluator on an API payload and violates
   Plan04 Task2's protected create-to-Action-Detail golden path. Removing or
   narrowing the route would orphan the already accepted Plan05 browser
   contract rather than close this route-operability defect.

The selected blast radius is the two human routes, the minimum shared human
guard/navigation response helper, their focused tests, and this handoff only.
Route names do not change, so generated route-tree bytes must remain unchanged.

## 2026-07-20 protected human route-operability correction handoff

```json
{
  "plan": "03C-04",
  "artifactState": "one additive child-authored correction candidate on top of the audited checkpoint; not integrated, deployed, or a Plan04/Phase3C completion claim",
  "correctionBaseRevision": "77ac162bb4b03cde9c9f26428ab23414e32150a3",
  "correctionBaseTree": "c60154ed5bdafe15342d290add94baee3f893139",
  "correctionBaseParent": "42d840a9d0b7032c3d53b84efbd51dae966a21e0",
  "cumulativeBaseRevision": "f24cf08a351ffdc2b537b8eb758c043764be3ac4",
  "cumulativeBaseTree": "c9a121db0f70d504a5b687dfb5b2fd8ad5cbdb25",
  "integrationDestination": "codex/phase3c-execution; parent remains sole integrator",
  "inheritedManifest": {
    "path": "/tmp/ae-phase3c-parent-custody-fdb990ac.json",
    "rawSha256": "3e53d94d419d1ba824d5c8b787c657a8fdb3fa5774864e6429d7c6b45d8aa924",
    "canonicalSha256": "4d8952bceaba82c5a617be6b1747152e002131d0e5a7375ef5e2620b59060092",
    "entries": 66,
    "childIntersection": 0
  },
  "correctionChangedPaths": [
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-04-SUMMARY.md",
    "src/lib/server/hosted-paid-operation-human-api.ts",
    "src/routes/actions.paid.$invocationRef.tsx",
    "src/routes/actions.paid.new.tsx",
    "tests/imports/hosted-paid-operation-boundaries.test.ts",
    "tests/unit/server/hosted-paid-operation-api.test.ts",
    "tests/unit/server/hosted-paid-operation-creation-api.test.ts"
  ],
  "cumulativeChangedPathCount": 21,
  "redBefore": {
    "command": "npm test -- tests/unit/server/hosted-paid-operation-api.test.ts tests/unit/server/hosted-paid-operation-creation-api.test.ts",
    "result": "Five behavioral failures reproduced the route defect: setup and detail had no protected navigation guard; the detail loader had no server-function boundary; setup rendered the wrong select/default/copy semantics; and a native urlencoded creation returned 201 JSON instead of a 303 relation navigation. Seven pre-existing tests passed."
  },
  "observableMechanism": "Both human routes run the same createServerFn-backed Clerk session admission before loading and preserve the exact protected href through /sign-in. Setup renders the frozen labelled mock-provider contract with a fieldset, radios, no default, and a disabled Create sandbox operation control until selection. Its native POST calls creation once and translates only the source-created inspect relation into 303 Location. Detail navigation calls a createServerFn seam; only its server handler obtains the authenticated runtime and invokes inspect. Missing and cross-owner reads render one ordinary non-enumerating state.",
  "acceptedBacklinkContract": "Action Detail includes exactly one protected link with text Back to Sandbox setup and href /actions/paid/new. The corrected import boundary permits that exact context plus setup and generated registration while continuing to forbid setup/provider selection in /, shared paid-operation UI, and all other production paths.",
  "verification": [
    {
      "command": "npm test -- tests/unit/server/hosted-paid-operation-api.test.ts tests/unit/server/hosted-paid-operation-creation-api.test.ts",
      "result": "2 files, 12 tests passed."
    },
    {
      "command": "npm test -- the two focused server tests plus tests/imports/route-boundary.test.ts and tests/imports/hosted-paid-operation-boundaries.test.ts",
      "result": "4 files, 17 tests passed."
    },
    {
      "command": "npm test -- relevant Plan02/03 persistence, creation, application, projection, effect, reconciliation and Plan04 runtime/auth/route tests",
      "result": "16 files, 72 tests passed."
    },
    {
      "command": "npx --no-install oxlint --deny-warnings <six changed TypeScript/test paths>",
      "result": "Passed with zero warnings."
    },
    {
      "command": "npx --no-install react-doctor . --scope changed --base 77ac162b --verbose --no-supply-chain --no-telemetry --blocking warning",
      "result": "Passed with no issues after canonical TanStack route-property ordering, a private server-function seam, and router-native backlink navigation."
    },
    {
      "command": "npm run typecheck -- --pretty false",
      "result": "Exit 2 from the inherited capability-supply/Customer Request baseline; zero diagnostics name a correction path."
    },
    {
      "command": "npm test -- tests/imports/private-imports.test.ts tests/imports/route-boundary.test.ts tests/imports/ts-standards.test.ts",
      "result": "Route boundary passed. The private-import and TS-standards baselines remain red outside this correction; zero findings name a correction path."
    },
    {
      "command": "route-tree byte readback; git diff --check; exact status allowlist; parent manifest raw/self-digest/intersection",
      "result": "src/routeTree.gen.ts remains unchanged at SHA-256 95b15655c07de7d722959a60db846d1bcc2725d8f525047d2ae96cf644ab78a4. Diff check passed; exactly seven authorized paths changed; parent raw and canonical identities match with 66 entries and zero child intersection."
    }
  ],
  "adverseAndRecovery": "A first test edit contained a malformed regular expression and was repaired before the semantic RED was recorded. The initial stale confinement assertion rejected the accepted detail backlink; the frozen UI contract proved the link was required, so the explicitly authorized import test was narrowed to the exact backlink context instead of weakening the UI. Three changed-path type diagnostics were mechanical server-function/fixture inference issues and were repaired without widening source behavior. The first scoped-commit hook then identified TanStack route-property ordering as an inference defect; validateSearch and loaderDeps were moved ahead of beforeLoad, the server function was kept private, and the backlink became router-native. The new correction commit was rewritten before handoff without changing or amending checkpoint 77ac162b.",
  "evidenceClass": "source inspection, local authenticated route/server fixtures, local labelled mock lifecycle regressions, and unchanged generated-route readback",
  "claimCeiling": "A local additive correction candidate proving protected route admission, form-to-detail translation, loader server-boundary behavior, non-enumerating detail refusal, and frozen setup/backlink contracts.",
  "explicitNonclaims": "No browser execution, hosted reachability, served revision, independent provider, real credential/payment/settlement/fulfilment, production safety, accessibility/comprehension, demand, or customer-value proof.",
  "unresolvedFindings": "Repository-wide typecheck, private-import, and TS-standards baselines remain red outside this correction. The React Doctor route-property, Fast Refresh, and internal-link findings were repaired locally without widening the route contract. No changed-path P0/P1 remains in the focused local evidence.",
  "candidatePreservation": "One scoped child commit will be created on top of 77ac162b; its exact revision and tree are returned to the parent after commit.",
  "exactNextSafeAction": "Parent audits this additive correction and the 21-path cumulative candidate against f24cf08a, reruns the focused route/import bundle, and if accepted integrates it into codex/phase3c-execution. Do not deploy, start Plan05, or claim Plan04/Phase3C complete."
}
```

## 2026-07-20 runtime-composition resumption — stopped at source-owned reconstruction boundary

```json
{
  "plan": "03C-04",
  "runtime": "Codex local isolated worktree; existing local dependency tree used by absolute path; no install or network",
  "baseRevision": "2623bc204be38f7d22f9549e659e23cff02927dc",
  "baseTree": "202dfd9e19eb33e9c49529c0641da664a2fe3731",
  "parentSha": "2623bc204be38f7d22f9549e659e23cff02927dc",
  "custodyManifestHash": "ef316f053d5d5655b160c9d78097aad9fdcce6c35d5a20ace4dc191ff8f5efa9",
  "changedPaths": [
    "src/routeTree.gen.ts",
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-04-SUMMARY.md"
  ],
  "forbiddenPathsChecked": "All paths outside Plan04 ownership remained unchanged. The parent manifest's 66 inherited changes remained absent as worktree changes.",
  "commands": [
    {
      "command": "route generator through the locked local @tanstack/router-generator dependency, twice",
      "exitCode": 0,
      "result": "Both clean rebuilds produced SHA-256 55d50bca6040eeedc63be4ca0ff2dbb901a6e8f1a669b2b543f233359aaef2ed. The only baseline normalization is removal of a stale ten-line React Start Register trailer."
    },
    {
      "command": "focused source trace of hosted composition, creation, persistence, Convex gateway and server adapters",
      "exitCode": 0,
      "result": "Found the earliest required ownership boundary before RED implementation."
    }
  ],
  "observableOutcome": "The route tree now has a deterministic clean-generator baseline. No paid-operation route was mounted and no runtime gateway was created.",
  "redDisposition": "NOT_RUN_SOURCE_BOUNDARY_STOP. A decisive runtime RED would require specifying a gateway contract that the current persisted source rows cannot fulfil without fabricating reconstruction truth.",
  "evidenceClass": "local source inspection and deterministic generated-artifact readback",
  "claimCeiling": "Generated-tree normalization and a source-linked implementation blocker only. No runtime composition, route reachability, hosted behavior, provider/payment behavior, production safety, comprehension, demand or customer-value proof.",
  "remainingFailure": "convex/hostedPaidOperation.ts exposes internal bounded row loading, CAS transaction and admission reservation only. Its persisted source row contains provider identifiers and materialInputDigest but not the typed material inputs, presentation, or complete interpretation required by HostedPaidOperationAggregate. It also has no source-owned initial creation write that can implement persistProviderBinding and persistCreated. The existing createHostedPaidOperationComposition requires a HostedPaidOperationPort whose loadComplete returns that complete typed aggregate, and createHostedPaidOperation requires those two creation persistence transitions.",
  "stopReason": "SOURCE_OWNED_RECONSTRUCTION_AND_CREATION_BOUNDARY_OUTSIDE_PLAN04",
  "nextDecision": "Parent must extend Plan02/03 ownership with a source-owned Convex serialization/reconstruction adapter and initial creation transaction, or explicitly widen this cut to those exact modules and tests. Then resume Plan04 from the resulting integrated revision.",
  "commitCandidate": "Set by the scoped child commit containing only the two changed paths.",
  "resumptionCommand": "git show --stat --oneline HEAD && git diff HEAD^ -- src/routeTree.gen.ts .planning/phases/03c-hosted-paid-operation-product-trial/03C-04-SUMMARY.md"
}
```

## 2026-07-20 replacement cumulative candidate — authenticated intent gateway

```json
{
  "plan": "03C-04",
  "artifactState": "child-authored replacement cumulative candidate; not integrated, deployed, or a Plan04/Phase3C completion claim",
  "runtime": "Codex local isolated worktree; existing ignored local dependency symlink only; no install, network, Convex control-plane, generated Convex API, remote, deployment, or external-state call",
  "checkpointRevision": "42d840a9d0b7032c3d53b84efbd51dae966a21e0",
  "checkpointTree": "51bd58dff6fb879a93853917eb8bd0a9c8056f3c",
  "cumulativeBaseRevision": "f24cf08a351ffdc2b537b8eb758c043764be3ac4",
  "cumulativeBaseTree": "c9a121db0f70d504a5b687dfb5b2fd8ad5cbdb25",
  "integrationDestination": "codex/phase3c-execution; parent remains sole integrator",
  "inheritedManifest": {
    "path": "/tmp/ae-phase3c-parent-custody-fdb990ac.json",
    "rawSha256": "3e53d94d419d1ba824d5c8b787c657a8fdb3fa5774864e6429d7c6b45d8aa924",
    "canonicalSha256": "4d8952bceaba82c5a617be6b1747152e002131d0e5a7375ef5e2620b59060092",
    "entries": 66,
    "childIntersection": 0
  },
  "cumulativeChangedPaths": [
    ".planning/adr/ADR-021-hosted-paid-operation-trial-boundaries.md",
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-04-SUMMARY.md",
    "convex/hostedPaidOperation.ts",
    "convex/hostedPaidOperationGateway.ts",
    "src/lib/server/hosted-paid-operation-agent-api.ts",
    "src/lib/server/hosted-paid-operation-human-api.ts",
    "src/lib/server/hosted-paid-operation-runtime.ts",
    "src/modules/action-invocation/hosted-paid-operation-service-auth.ts",
    "src/modules/action-invocation/internal/convex-schema.ts",
    "src/routeTree.gen.ts",
    "src/routes/actions.paid.$invocationRef.tsx",
    "src/routes/actions.paid.new.tsx",
    "src/routes/api.v1.paid-operations.$invocationRef.commands.ts",
    "src/routes/api.v1.paid-operations.$invocationRef.ts",
    "src/routes/api.v1.paid-operations.ts",
    "tests/imports/hosted-paid-operation-boundaries.test.ts",
    "tests/unit/action-invocation/convex-handler-contract.test.ts",
    "tests/unit/server/hosted-paid-operation-agent-auth.test.ts",
    "tests/unit/server/hosted-paid-operation-creation-api.test.ts",
    "tests/unit/server/hosted-paid-operation-runtime.test.ts"
  ],
  "boundaryTestChange": "The import test's Plan01 absence assertions were genuinely obsolete after accepted Plan02-04 source landed. They were replaced with exact owned-surface/setup-route inventories. Its prohibition on low-level lifecycle/effect language in routes and src/lib/server remains unchanged and passes.",
  "redBefore": [
    {
      "command": "npm test -- tests/unit/server/hosted-paid-operation-agent-auth.test.ts",
      "result": "The actual API-key route fell into session-oriented createAuthenticatedConvexClient and raised session_auth_fallback; the opaque Clerk API key could not satisfy Convex JWT auth."
    },
    {
      "command": "npm test -- tests/unit/server/hosted-paid-operation-creation-api.test.ts",
      "result": "The native urlencoded setup form returned 422 instead of the expected 201 because parseSetup used request.json only."
    },
    {
      "command": "checkpoint source and focused behavior trace",
      "result": "The checkpoint had no command-bound service token, no operation-owned mock-effect observation table, no persisted admission reservation header, and no atomic terminal release. Its tests were registration/source assertions rather than an operational create-authorize-execute-reconcile proof."
    }
  ],
  "observableMechanism": "Human routes use a lazy Clerk convex-audience JWT client; subject becomes principal and tokenIdentifier becomes caller inside Convex. Agent routes first recheck the current Clerk API key and paid-operation scope, then send only a paid-operation-specific encrypted serviceToken valid for at most 30 seconds and bound to the exact provider/inspect/version/command intent. Convex independently verifies the token with AE_CONVEX_SERVER_FUNCTION_TOKEN. Public create/inspect/command validators contain only closed intent plus the opaque token; raw actor, authority, provider state, payment/result state, and evidence are impossible arguments.",
  "lifecycleAndEffect": "The authenticated gateway consumes the existing Action Invocation lifecycle behind Convex. It persists pre-release uncertainty before the labelled mock effect. The effect is the atomic insertion of exactly one source-owned observation row keyed by invocation, attempt, and effect generation. Provider B loses its response only after that row exists. Reconciliation reads only that exact row; absence resolves not-released/not-submitted. Execute checks current policy/reservation before pre-release persistence and recordMockEffect atomically rechecks enabled policy, active owner-bound reservation/counter, current attempt/effect generation, payment lineage, and exact accepted approve-each authority.",
  "admissionClosure": "The source header persists admissionReservationRef. Provider A terminal execution, Provider B released reconciliation, and invalidated authority_not_accepted release concurrency in the same transaction as durable closure. Uncertainty and reconciled-not-released retryability retain the reservation. Duplicate commands/effects/releases neither add a row nor decrement the counter again.",
  "cohesionAudit": "The former approximately 1950-line mixed Convex module was split once: convex/hostedPaidOperation.ts now owns indexed storage/admission/mock-observation persistence (1029 lines), while convex/hostedPaidOperationGateway.ts owns authenticated public intent plus the one lifecycle/mock fixture composition (1461 lines). The server runtime is transport/application intent only. A further split was not source-required and would fragment one request lifecycle without a clearer owner/deletion boundary.",
  "verification": [
    {
      "command": "npm test -- Plan02/03 persistence, creation, application, projection, effect, reconciliation, provider-selection; Plan04 Convex/server; three focused import boundaries",
      "result": "16 files, 66 tests passed. This includes unauthenticated convex-test service-token verification and wrong-intent/key/expiry refusal; create at version 1; exact authorize/refuse CAS; one Provider A effect and settlement; Provider B response loss/reconcile; stale version and command-digest conflict; crash before mock mutation resolving not-released/not-submitted with zero effect rows; kill-switch before and after pre-release; terminal reservation release exactly once; public intent-only reconciliation; non-enumeration; human/agent semantic digest/version/provenance parity; urlencoded form submit; and all three agent route auth modes."
    },
    {
      "command": "npx oxlint --deny-warnings <changed TypeScript paths>",
      "result": "Passed with zero warnings."
    },
    {
      "command": "npm run typecheck -- --pretty false",
      "result": "Exit 2 from pre-existing capability-supply and Customer Request errors; zero diagnostics name a changed Plan04/correction path."
    },
    {
      "command": "npm test -- tests/imports/ts-standards.test.ts tests/imports/private-imports.test.ts tests/imports/route-boundary.test.ts",
      "result": "Route boundary passed. Repository-wide standards/private-import gates remain red on inherited baseline. All local non-null/inexact-runtime findings exposed by the probe were repaired; the final standards output names no hosted-paid-operation correction path."
    },
    {
      "command": "local @tanstack/router-generator run twice",
      "result": "Before/first/second SHA-256 all 95b15655c07de7d722959a60db846d1bcc2725d8f525047d2ae96cf644ab78a4; no route-tree diff."
    },
    {
      "command": "static .collect()/.filter() scan; git diff --check; exact status allowlist; parent manifest self-digest/intersection",
      "result": "No collect/filter in the owned hosted paths; diff check passed; zero unexpected current paths; raw and canonical manifest identities matched with 66 entries and zero inherited-path intersection."
    }
  ],
  "adverseAndRecovery": "Direct low-level server composition was rejected by the live host-boundary test. Raw public create/transact state was rejected because it made authority/provider/payment/evidence caller-constructible. Clerk API-key forwarding was rejected from installed Clerk and Convex source. A new session/M2M credential was rejected as product widening. The selected narrow server attestation preserves route admission and Convex-side attribution without turning identity into consequence authority. A zsh reserved-variable wrapper error was rerun mechanically; shared-machine load made the last full typecheck slow but it completed with the same unrelated baseline.",
  "counters": {
    "acceptedRoutes": 5,
    "mockEffectRowsPerReleasedAttempt": 1,
    "secondEffectRowsOnReplay": 0,
    "secondAdmissionDecrementsOnReplay": 0,
    "callerActorAuthorityEvidenceFieldsAccepted": 0,
    "commandReplayFallbackProviderSwitchAfterAmbiguity": 0,
    "focusedFilesPassed": 16,
    "focusedTestsPassed": 66
  },
  "evidenceClass": "source inspection, generated-route readback, local authenticated route fixtures, and local Convex lifecycle/persistence fixtures",
  "claimCeiling": "A replacement cumulative local candidate proving the declared intent/auth/CAS/mock-effect/reconciliation mechanics only.",
  "explicitNonclaims": "No browser or hosted reachability, served revision, independent provider, real API credential exchange, real payment/submission/settlement, provider fulfilment, production safety, accessibility/comprehension, demand, or customer value.",
  "unresolvedFindings": "Repository-wide typecheck, private-import, and TS-standards baselines remain red outside this cut. No changed-path P0/P1 remains in the focused evidence.",
  "candidatePreservation": "One scoped child correction commit on top of checkpoint 42d840a9; exact revision/tree returned to the parent after commit.",
  "exactNextSafeAction": "Parent audits the cumulative candidate against f24cf08a and the 20-path cumulative allowlist, reruns the focused bundle, and if accepted integrates it into codex/phase3c-execution. Do not deploy, start Plan05, or claim Plan04/Phase3C complete."
}
```

## 2026-07-20 authenticated runtime/routes completion attempt — narrowed

```json
{
  "baseRevision": "f24cf08a351ffdc2b537b8eb758c043764be3ac4",
  "baseTree": "c9a121db0f70d504a5b687dfb5b2fd8ad5cbdb25",
  "inheritedManifest": {
    "path": "/tmp/ae-phase3c-parent-custody-fdb990ac.json",
    "rawSha256": "3e53d94d419d1ba824d5c8b787c657a8fdb3fa5774864e6429d7c6b45d8aa924",
    "canonicalSha256": "4d8952bceaba82c5a617be6b1747152e002131d0e5a7375ef5e2620b59060092",
    "entries": 66,
    "childInterpretation": "The clean child matches the exact base/tree. All inherited paths are absent and forbidden."
  },
  "red": "The new runtime contract test failed because the server composition root and all five generated route registrations were absent.",
  "observableOutcome": "Authenticated public Convex load/create/transact/admission gateways derive tokenIdentifier server-side and do not accept owner or principal authorization arguments. Five thin route modules are registered by a deterministic two-run generator result.",
  "adverseAndRecovery": "Unauthenticated Convex access refuses. Public reconcile remains intent-only in the pre-existing adapters and transport ambiguity remains inspect-only. A missing local dependency tree was recovered by reusing an existing ignored local dependency symlink; no install or network occurred.",
  "verification": "Five focused files and eleven tests passed. The route generator produced SHA-256 95b15655c07de7d722959a60db846d1bcc2725d8f525047d2ae96cf644ab78a4 twice.",
  "remainingFailure": "The server runtime currently composes authenticated inspection, but creation and consequence-bearing command persistence are fail-closed placeholders. It does not yet map createInitial/transact into working create/authorize/execute/reconcile behavior. Therefore this is not a Plan04 completion candidate.",
  "evidenceClass": "source inspection and local authenticated/server/generated-route fixtures",
  "claimCeiling": "Authenticated gateway and deterministic route registration mechanics only.",
  "explicitNonclaims": "No complete creation or command runtime, browser or hosted reachability, provider fulfilment, real credential/payment/settlement, production safety, accessibility/comprehension, demand or customer value.",
  "stopReason": "IMPLEMENTATION_INCOMPLETE_AT_RUNTIME_COMMAND_AND_CREATION_MAPPING",
  "nextSafeAction": "Continue within hosted-paid-operation-runtime.ts by mapping the authenticated createInitial/reserveAdmission/transact references into createHostedPaidOperation and request-scoped command ports, then rerun the focused persistence, creation, reconciliation and route tests before any parent integration."
}
```

## 2026-07-20 correction mapping decision

Three source-compatible mappings were evaluated before correction:

1. **Direct low-level server composition — rejected after the live boundary
   falsifier.** Although the runtime could technically reconstruct the
   invocation tracer, `tests/imports/hosted-paid-operation-boundaries.test.ts`
   forbids low-level lifecycle/effect symbols in `src/lib/server`. Serializing
   aggregate, authority, payment, result, or evidence state into public Convex
   functions would also make trusted state caller-constructible.
2. **Minimal high-level authenticated Convex intent gateway — selected.** The
   Task1 DTO already carries the closed create/inspect/command intent. The
   request-scoped server runtime sends only `providerKey`, `invocationRef`,
   `commandId`, `expectedInvocationVersion`, `command`, and the authorize
   decision. `convex/hostedPaidOperationGateway.ts` resolves authenticated
   identity and closed provider facts, consumes the existing lifecycle
   read-only, and invokes the typed storage/admission functions retained in
   `convex/hostedPaidOperation.ts`. Public validators contain no owner,
   principal, authority, selected source, payment, result, resolution, or
   evidence fields. The runtime contains no aggregate serializer or low-level
   lifecycle/effect language.
3. **Further source-module widening — rejected.** The required lifecycle
   symbols are exported read-only from
   `src/modules/action-invocation/in-memory.ts`; the creation and persistence
   contracts expose the necessary ports. The narrowly authorized
   `hosted-paid-operation-service-auth.ts`, schema fields, and Convex gateway
   split close the source-proven identity, admission, and mock-observation gaps.
   No additional owner is required.

The identity trace evaluated three paths separately. Forwarding the Clerk API
key was rejected because the machine `getToken()` returns that opaque key while
Convex accepts a Clerk JWT with audience `convex`. Replacing the credential with
a session or M2M product was rejected as a new credential contract. The
selected path reuses the existing server-attestation pattern, but narrows it to
one paid-operation-specific encrypted token valid for at most 30 seconds and
bound to the exact public intent. It is minted only after current API-key
revocation/scope admission and independently verified inside Convex using
`AE_CONVEX_SERVER_FUNCTION_TOKEN`. Human calls continue to derive
subject-as-principal and tokenIdentifier-as-caller from `ctx.auth`.

The effect/admission trace also changed the implementation. Provider release is
the atomic insertion of one operation-owned mock-observation row keyed by
invocation, attempt, and effect generation. A lost response occurs only after
that row exists; reconciliation derives release and payment truth only from
that row, while absence resolves to not-released/not-submitted. The source
header retains the exact admission reservation, execution rechecks policy
before pre-release persistence and atomically at mock-effect insertion, and
terminal/no-consequence closure releases concurrency idempotently.

The no-god-file audit selected one cohesive split: low-level indexed
storage/admission remains in `convex/hostedPaidOperation.ts`; authenticated
public intent, lifecycle composition, and the labelled mock fixture move
together to `convex/hostedPaidOperationGateway.ts`. A further ceremonial split
would separate one request lifecycle without creating a clearer source owner or
deletion boundary, so it was not made.

Rejected implementations: lifecycle logic in routes or server adapters;
caller-supplied owner/principal/evidence; raw public create/transact state;
runtime singleton or in-memory authority; a second copied lifecycle; mutation
time external effects; and reconcile mapped to inspect. Ownership widening
remains unjustified unless a focused Convex bundle/type RED identifies one exact
external symbol that cannot be consumed read-only.

### Prior Task1 handoff

{
  "plan": "03C-04",
  "runtime": "Codex local isolated worktree; existing local dependencies reused by an ignored node_modules symlink; no install or network",
  "baseRevision": "69e1d68c9e48cf91bc95249cd66f2dce0708b381",
  "baseTree": "7902d69ef2ea798689ba06b98c1866330168d1e6",
  "parentSha": "2debf4b9f65ce228491f7d3d17ed1654a23bb496",
  "custodyManifestHash": "720f83e5b683002ab97fb54664678829b1435aca03df21b003d303946f933430",
  "ownedPaths": [
    "src/lib/server/hosted-paid-operation-human-api.ts",
    "src/lib/server/hosted-paid-operation-agent-auth.ts",
    "src/lib/server/hosted-paid-operation-agent-api.ts",
    "src/routes/actions.paid.new.tsx",
    "src/routes/actions.paid.$invocationRef.tsx",
    "src/routes/api.v1.paid-operations.ts",
    "src/routes/api.v1.paid-operations.$invocationRef.ts",
    "src/routes/api.v1.paid-operations.$invocationRef.commands.ts",
    "tests/unit/server/hosted-paid-operation-api.test.ts",
    "tests/unit/server/hosted-paid-operation-agent-auth.test.ts",
    "tests/unit/server/hosted-paid-operation-creation-api.test.ts",
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-04-SUMMARY.md"
  ],
  "changedPaths": [
    "src/lib/server/hosted-paid-operation-human-api.ts",
    "src/lib/server/hosted-paid-operation-agent-auth.ts",
    "src/lib/server/hosted-paid-operation-agent-api.ts",
    "tests/unit/server/hosted-paid-operation-api.test.ts",
    "tests/unit/server/hosted-paid-operation-agent-auth.test.ts",
    "tests/unit/server/hosted-paid-operation-creation-api.test.ts",
    ".planning/phases/03c-hosted-paid-operation-product-trial/03C-04-SUMMARY.md"
  ],
  "forbiddenPathsChecked": "Every path outside ownedPaths. The parent's 66 inherited dirty paths were absent at start and remained absent. No root route, renderer/card/component, Plan 01-03 module, Customer Request, provider fixture/normalizer, generic discovery/API, dashboard/chat/Activity, generated/package/workflow, Convex, AGENTS.md, PRODUCT.md or DESIGN.md path was changed.",
  "commands": [
    {
      "command": "git rev-parse HEAD; git rev-parse HEAD^{tree}; git status --porcelain=v1 --untracked-files=all",
      "exitCode": 0,
      "result": "Exact required clean start: revision 69e1d68c9e48cf91bc95249cd66f2dce0708b381, tree 7902d69ef2ea798689ba06b98c1866330168d1e6."
    },
    {
      "command": "npm run test -- tests/unit/server/hosted-paid-operation-api.test.ts tests/unit/server/hosted-paid-operation-agent-auth.test.ts tests/unit/server/hosted-paid-operation-creation-api.test.ts",
      "exitCodes": [127, 1, 1, 0],
      "result": "Infrastructure RED: Vitest missing. Existing ignored local dependencies were reused without install/network. Product RED: the three plan test files and then the paid-operation auth module were absent. Final: 3 files, 6 tests passed."
    },
    {
      "command": "npm run test -- tests/unit/server/hosted-paid-operation-api.test.ts tests/unit/server/hosted-paid-operation-agent-auth.test.ts tests/unit/server/hosted-paid-operation-creation-api.test.ts tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts tests/unit/action-invocation/paid-operation-application-service.test.ts tests/unit/action-invocation/paid-operation-projection.test.ts tests/unit/action-invocation/hosted-paid-operation-reconciliation.test.ts",
      "exitCode": 0,
      "result": "7 files, 28 tests passed."
    },
    {
      "command": "npm run typecheck",
      "exitCode": 2,
      "result": "Repository-wide inherited capability-supply, Customer Request, test fixture and tooling failures remain. No errors name a Plan 04 changed path."
    },
    {
      "command": "npm run test:imports",
      "exitCode": 1,
      "result": "43 passed, 6 inherited failures in capability-contract, private-import and Customer Request completeness checks; no finding names a Plan 04 changed path."
    },
    {
      "command": "npm run test:copy",
      "exitCode": 1,
      "result": "87 passed, 4 inherited failures from the existing paid-operation card and absent .planning/GTM-READINESS.md; no finding names a Plan 04 changed path."
    },
    {
      "command": "git diff --check",
      "exitCode": 0,
      "result": "Passed."
    }
  ],
  "observableOutcome": "Task 1 is complete in local authenticated fixtures. Human sessions and current least-privilege agent keys derive actors server-side; revoked, expired and wrong-scope keys fail closed. Both inspect adapters expose the same agentic-paid-operation:v1 semantics, digest, expected version, environment, provenance, evidence class and claim ceiling. The frozen card input separates disclosure, authorize/refuse, pending identity, ambiguity recovery, payment, settlement and result truth, one safe continuation, closed operation blocks, runtime evidence and technical detail. Creation accepts exactly {providerKey}; commands accept command, commandId, expectedInvocationVersion and authorize decision only. Public reconcile is intent-only. Ambiguous command transport returns inspect-only recovery and never replays.",
  "redDisposition": "EXPECTED_TASK_1_RED_CONFIRMED_THEN_GREEN. Task 2 stopped before editing because route mounting requires forbidden generated route-tree output.",
  "counters": {
    "focusedServerTests": 6,
    "focusedAndPriorTests": 28,
    "commandReplaysAfterAmbiguity": 0,
    "callerSuppliedAuthorityFieldsAccepted": 0,
    "callerSuppliedReconciliationTruthAccepted": 0,
    "routeFilesMounted": 0
  },
  "structuredEventRefs": [
    "auth:human-session-derived",
    "auth:agent-current-key-derived",
    "transport:projection-parity",
    "transport:stale-version-refused",
    "transport:ambiguous-update-inspect-only",
    "creation:closed-provider-selector"
  ],
  "firstMeaningfulGoblinFinding": "A caller can lose the response to an admitted command. The adapter returns update_not_confirmed with one read-only inspect relation; it does not replay the command or accept caller-selected reconciliation truth.",
  "evidenceClass": "local authenticated server fixtures and labelled local composition fixtures",
  "claimCeiling": "Task 1 adapter behavior only. No mounted route, local browser reachability, hosted reachability, real credential/provider/payment, settlement, fulfilment, production safety, demand, comprehension or customer-value proof.",
  "remainingFailure": "Task 2 cannot mount the five planned file routes under current ownership. src/router.tsx imports only src/routeTree.gen.ts; the new route IDs are absent, and there is no local non-generated registration seam. Editing or generating src/routeTree.gen.ts is explicitly forbidden. Broad inherited typecheck/import/copy failures remain as recorded.",
  "stopReason": "ROUTE_GENERATION_OWNERSHIP_BOUNDARY",
  "nextDecision": "Authorize generated routeTree ownership/codegen in a clean integration step, or provide an owned non-generated route registration seam. Then resume Task 2 from this exact commit without reopening Task 1 or starting Plan 05.",
  "commitCandidate": "Set after the scoped owned-path commit.",
  "resumptionCommand": "git show --stat --oneline HEAD && npm run test -- tests/unit/server/hosted-paid-operation-api.test.ts tests/unit/server/hosted-paid-operation-agent-auth.test.ts tests/unit/server/hosted-paid-operation-creation-api.test.ts"
}
