---
phase: 03c-hosted-paid-operation-product-trial
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/adr/ADR-021-hosted-paid-operation-trial-boundaries.md
  - tests/unit/action-invocation/hosted-paid-operation-contract-red.test.ts
  - tests/unit/server/hosted-paid-operation-auth-contract-red.test.ts
  - tests/imports/hosted-paid-operation-boundaries.test.ts
  - tests/unit/action-invocation/hosted-paid-operation-red-harness.test.ts
  - tools/dev/verify-phase-3c-red-contract.ts
  - .planning/phases/03c-hosted-paid-operation-product-trial/03C-RED-REPORT.json
autonomous: false
requirements: [P3C-R1, P3C-R2, P3C-R3, P3C-R6, P3C-R7, P3C-R10]
must_haves:
  truths:
    - "ADR-021 fixes source/business ownership, neutral-control limits, opaque custody, trusted reconciliation, identity-versus-authority, provider switching, and the D-01/D-08 evidence ceiling before implementation."
    - "Executable REDs fail against every authority, reconstruction, parity, and evidence-boundary gap they are intended to drive."
  artifacts:
    - path: ".planning/adr/ADR-021-hosted-paid-operation-trial-boundaries.md"
      provides: "Accepted implementation boundary for the hosted trial"
    - path: "tests/unit/action-invocation/hosted-paid-operation-contract-red.test.ts"
      provides: "Durability, custody, reconciliation, provider-switch, and shared-semantics falsifiers"
    - path: "tests/unit/server/hosted-paid-operation-auth-contract-red.test.ts"
      provides: "Authentication, non-enumeration, identity-versus-authority, and typed-transport falsifiers"
    - path: "tests/imports/hosted-paid-operation-boundaries.test.ts"
      provides: "Thin-host and no-second-lifecycle ownership gate"
    - path: "tools/dev/verify-phase-3c-red-contract.ts"
      provides: "Expected-failure classifier that rejects infrastructure and unrelated failures"
    - path: ".planning/phases/03c-hosted-paid-operation-product-trial/03C-RED-REPORT.json"
      provides: "Machine-readable expected RED identities, reasons, and dispositions"
  key_links:
    - from: "ADR-021"
      to: "Phase 3C REDs"
      via: "Each irreversible boundary decision has an executable falsifier"
---

<objective>
Obtain founder acceptance, record ADR-021, and establish the failing contracts that govern all Phase 3C implementation per D-01, D-02, D-04, D-05, D-07 and D-08.

Purpose: Put the hardest constraint first: fresh-process reconstruction and safe continuation must work without caller assertions, raw custody, route memory, or a second lifecycle.
Output: Accepted ADR-021 plus focused RED suites. No production implementation.
</objective>

<execution_context>
@/Users/joelchan/.codex/gsd-core/workflows/execute-plan.md
@/Users/joelchan/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@PRODUCT.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-CONTEXT.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-RESEARCH.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-AGENT-RUNBOOK.md
@.planning/adr/ADR-019-authority-modes-and-consequential-operations-target.md
@.planning/adr/ADR-020-product-projection-of-delegated-work.md
@src/modules/action-invocation/paid-operation-application-service.ts
@src/modules/action-invocation/paid-operation-semantics.ts
@src/modules/action-invocation/internal/convex-schema.ts
@convex/actionInvocationControl.ts
</context>

<tasks>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 1: Founder acceptance of the Phase 3C execution boundary</name>
  <files>None — decision gate; no repository mutation</files>
  <action>Present the exact decision, evidence ceiling, base revision, inherited-work boundary, and options below. Do not create ADR/source/test changes until the founder selects accept and confirms current custody metadata.</action>
  <decision>Authorize implementation at exact base revision 2debf4b9f65ce228491f7d3d17ed1654a23bb496, with the inherited changes bound by a sorted path/status SHA-256 custody manifest and explicitly unowned, and accept the ADR-021 boundary.</decision>
  <context>No implementation may start until the founder accepts the protected hosted-sandbox claim ceiling, source/business-versus-control ownership, trusted reconciliation boundary, and separately authorized hosted readback. A changed base revision requires a new custody declaration.</context>
  <options>
    <option id="accept">
      <name>Accept Phase 3C boundary</name>
      <pros>Allows the RED-first implementation loop to begin with a fixed claim and ownership boundary.</pros>
      <cons>Still requires a later explicit authorization before deployment or hosted control-plane calls.</cons>
    </option>
    <option id="revise">
      <name>Revise boundary</name>
      <pros>Changes scope before source work begins.</pros>
      <cons>Stops this plan set until context, UI contract, and plans are reconciled.</cons>
    </option>
  </options>
  <resume-signal>Select accept or revise. If accepting, confirm the exact base revision and custody-manifest hash; the observed count of 66 is informational only.</resume-signal>
  <verify><automated>git rev-parse HEAD &amp;&amp; git status --short</automated></verify>
  <done>The founder explicitly accepts the boundary and confirms the current base/custody metadata, or the plan stops for revision.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Record ADR-021 and write the contract REDs</name>
  <files>.planning/adr/ADR-021-hosted-paid-operation-trial-boundaries.md, tests/unit/action-invocation/hosted-paid-operation-contract-red.test.ts, tests/unit/server/hosted-paid-operation-auth-contract-red.test.ts, tests/imports/hosted-paid-operation-boundaries.test.ts, tests/unit/action-invocation/hosted-paid-operation-red-harness.test.ts, tools/dev/verify-phase-3c-red-contract.ts, .planning/phases/03c-hosted-paid-operation-product-trial/03C-RED-REPORT.json</files>
  <behavior>
    - "Fresh-process reconstruction must recover selected source/provider facts, exact authority, possible submission, settlement/result truth, expected version, and exactly one safe continuation."
    - "Only opaque custody/evidence references persist; raw credentials, signatures, payloads, and provider responses fail serialization gates."
    - "A reconciliation command carries intent only; trusted server-side evidence supplies resolution."
    - "Authentication attributes the actor but cannot manufacture consequence authority."
    - "Switching providers creates pairwise-distinct invocation, authority, payment, and effect identities."
    - "Human and agent projections use agentic-paid-operation:v1 and the same digest; uncertainty exposes reconcile only."
  </behavior>
  <action>After founder acceptance, write ADR-021 as an application of ADR-009/010/019/020, not a lifecycle replacement. Fix business/provider/source rows outside neutral control; control owns continuity only. Source-prove and choose exactly one Convex authentication bridge: either a server-only trusted bridge or public functions using `ctx.auth`; caller-supplied owner/principal is forbidden. Record least-privilege human and paid-operation-agent mappings, revocation behavior, direct-bypass and IDOR refusals, and stop if the credential owner or trusted bridge is unavailable. Separate protected-trial admission (evaluator allowlist, sandbox kill switch, atomic per-principal count/concurrency/rate bounds) from consequence authority. Define opaque custody and trusted sandbox evidence ports. Freeze the external reconcile DTO as exactly command, commandId and expectedInvocationVersion. If the current application-service command type requires evidence, ADR-021 must split it into an intent-only public command and an internal trusted-evidence resolution command before any route work; external types may never expose evidence envelopes. Lock evaluator-only `/actions/paid/new` Sandbox setup, reusable `/actions/paid/:invocationRef` paid Action Detail, provider selection outside the card, provider-switch-as-new-invocation, request-scoped aggregate refresh, named golden/goblin transitions, runtime-supplied evidence labels, paid-operation-class genericity and the D-01/D-08 claim ceiling. Add focused REDs for auth bypass/IDOR/revocation, exhausted/concurrent admission, setup selector leakage into shared card, caller evidence fields, public/internal reconcile type crossover, custody ordering, refresh after mutation, cap+1 reads, golden transition collapse, unsafe goblin rejoin and local fixtures claiming hosted evidence. Create the classified RED harness exactly as otherwise specified. Owned paths are exactly the seven files listed. Forbidden paths: all production source, Convex handlers/schema, routes, components, provider fixtures, package.json, workflows, state/roadmap/requirements. RED/falsifier: any caller owner is trusted, auth implies authority, admission is non-atomic, public reconcile accepts evidence, Sandbox setup is treated as canonical IA, local evidence claims hosted, golden authority/execute boundaries collapse, a goblin path retries or switches, an unavailable bridge is waved through, or a malformed/unrelated failure is accepted. Commands remain focused as listed. Evidence class: source inspection plus classified executable failing fixtures. Claim ceiling: contract gaps only. Stop on an unavailable trusted auth bridge/credential owner, ownership contradiction, unsplittable public/internal reconcile boundary, unclassifiable RED, or changed custody manifest. Follow `03C-AGENT-RUNBOOK.md` for commands, custody, stop rules, and expanded handoff.</action>
  <verify>
    <automated>npm run test -- tests/unit/action-invocation/hosted-paid-operation-red-harness.test.ts &amp;&amp; npx tsx tools/dev/verify-phase-3c-red-contract.ts --report .planning/phases/03c-hosted-paid-operation-product-trial/03C-RED-REPORT.json &amp;&amp; AE_SCAN_MODE=clean npx vitest run tests/imports/hosted-paid-operation-boundaries.test.ts</automated>
  </verify>
  <done>Founder acceptance is recorded, ADR-021 resolves every research decision, the explicit harness reports every expected RED identity/reason and rejects all non-contract failures, no production path changed, and the handoff names the earliest failing boundary.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|---|---|
| Founder acceptance → implementation | Scope, base revision, and evidence ceiling become binding |
| Caller → hosted application | Caller identity and intent are untrusted; consequence truth is server-owned |
| Application → custody/evidence | Secrets and reconciliation facts cross only opaque trusted ports |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-03C-01 | Tampering | Reconciliation command | critical | mitigate | RED rejects caller-authored outcome evidence |
| T-03C-02 | Elevation of privilege | Auth identity mapping | critical | mitigate | ADR and RED separate identity from exact authority |
| T-03C-03 | Information disclosure | Custody/evidence serialization | high | mitigate | Negative fixtures permit opaque references only |
| T-03C-04 | Spoofing | Provider selection and actor | high | mitigate | Server resolves closed provider key and actor |
</threat_model>

<verification>
Inspect the RED output and ADR together: every irreversible ADR choice must have a named failing test, and every failure must be due to an absent Phase 3C contract rather than a malformed test.
</verification>

<success_criteria>
End only with founder acceptance, ADR-021, intentionally failing focused tests, exact custody/base metadata, and no implementation claim. If acceptance is withheld or the source/control split cannot be stated without competing truth, stop and return the decision.
</success_criteria>

<output>
Create `.planning/phases/03c-hosted-paid-operation-product-trial/03C-01-SUMMARY.md` with the required handoff schema.
</output>
