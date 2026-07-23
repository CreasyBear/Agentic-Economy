---
phase: 03c-hosted-paid-operation-product-trial
plan: 07
type: execute
wave: 7
depends_on: [03C-05, 03C-06]
files_modified:
  - tools/release/verify-paid-operation-hosted-release.ts
  - tests/unit/release/paid-operation-hosted-release.test.ts
  - tests/deploy-smoke/paid-operation-hosted-sandbox-smoke.spec.ts
  - tests/imports/paid-operation-trial-residue.test.ts
  - .planning/phases/03c-hosted-paid-operation-product-trial/03C-CLOSURE-CLASSIFICATION.md
  - package.json
autonomous: false
requirements: [P3C-R1, P3C-R2, P3C-R3, P3C-R5, P3C-R7, P3C-R9, P3C-R10, P3C-R11]
must_haves:
  truths:
    - "A separate clean proof worktree created from the exact integrated Phase 3C revision passes source/browser gates before deployment; the original custody tree is never cleaned, restored, staged, or committed."
    - "Separately authorized readback binds named deployment, exact revision, authenticated human/agent identities, fixture/provider provenance, transitions, cold reconstruction, parity digest, and zero duplicate effects."
    - "The evidence packet proves authenticated exact-revision hosted-sandbox reachability only and cannot manufacture success from caller assertions."
    - "Every Phase 3C artifact is classified for ownership/retirement, and trial removal cannot damage neutral Action Invocation or leak paid-operation imports into non-paid actions."
  artifacts:
    - path: "tools/release/verify-paid-operation-hosted-release.ts"
      provides: "Exact-revision source/readback verifier"
    - path: "tests/deploy-smoke/paid-operation-hosted-sandbox-smoke.spec.ts"
      provides: "Authenticated human cold-readback smoke"
    - path: "tests/unit/release/paid-operation-hosted-release.test.ts"
      provides: "Packet falsification and claim-ceiling tests"
    - path: ".planning/phases/03c-hosted-paid-operation-product-trial/03C-CLOSURE-CLASSIFICATION.md"
      provides: "Artifact ownership, retention, residual-record and retirement posture"
  key_links:
    - from: "verify-paid-operation-hosted-release.ts"
      to: "named hosted deployment"
      via: "revision-bound authenticated human and agent readback"
---
<objective>
Produce the separately authorized exact-revision hosted readback for the complete Phase 3C loop.

Purpose: Establish the narrow D-01 hosted claim without upgrading mock provider assertions into payment, settlement, fulfilment, production-safety, demand, or value evidence.
Output: Release verifier, deploy-smoke spec, focused scripts, and a revision-bound readback handoff.

Custody model: the original worktree remains the parent-owned custody tree with
base `2debf4b9f65ce228491f7d3d17ed1654a23bb496`, original tree
`1b92b650e3e821b87619ba46a416b78c8e15ba76`, and 66 inherited modified tracked
files outside Phase 3C ownership. The 66 observed inherited modifications are
preserved, but a sorted path/status custody-manifest hash—not the count—is the
enforcement identity. Source gates, deployment and readback run only
from a separate clean proof worktree or isolated checkout created from the exact
integrated Phase 3C revision. The proof handoff records both the original
custody base/tree and the clean proof revision/tree.
</objective>
<execution_context>
@/Users/joelchan/.codex/gsd-core/workflows/execute-plan.md
@/Users/joelchan/.codex/gsd-core/templates/summary.md
</execution_context>
<context>
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-CONTEXT.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-05-SUMMARY.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-06-SUMMARY.md
@.planning/phases/03c-hosted-paid-operation-product-trial/03C-AGENT-RUNBOOK.md
@docs/hosted-paid-operation-trial.md
@tools/release/verify-customer-request-release.ts
@tools/release/verify-customer-request-release-credential.ts
@tests/deploy-smoke/customer-request-human-lifecycle-smoke.spec.ts
@src/routes/api.v1.release.ts
</context>
<tasks>
<task type="auto" tdd="true">
  <name>Task 1: Build the exact-revision verifier and falsification gates</name>
  <files>tools/release/verify-paid-operation-hosted-release.ts, tests/unit/release/paid-operation-hosted-release.test.ts, tests/deploy-smoke/paid-operation-hosted-sandbox-smoke.spec.ts, tests/imports/paid-operation-trial-residue.test.ts, .planning/phases/03c-hosted-paid-operation-product-trial/03C-CLOSURE-CLASSIFICATION.md, package.json</files>
  <behavior>
    - "Verifier refuses dirty or revision-mismatched source, missing identity/fixture provenance, divergent digests, unsafe continuation, or nonzero duplicate counters."
    - "Packet records environment, provenance, evidence class and exact claim ceiling on both projections."
    - "Hosted smoke covers auth, all material transitions, reload, fresh-process reconstruction, and zero duplicate signature/send/effect generation."
    - "Closure classifies every introduced artifact as paid-operation-owned, trial-only, or candidate-shared-after-second-use and proves trial deletion/import boundaries."
  </behavior>
  <action>Extend the existing release machinery, not a parallel system. Verify the integrator chain, final diff allowlist and custody manifest, then create the proof worktree only from the integrated revision. Define and falsify packet `agentic-paid-operation-hosted-proof:v1` as specified; source/local verifier work remains local evidence until Task 3 succeeds. Add `03C-CLOSURE-CLASSIFICATION.md` and classify every introduced artifact as `paid-operation-owned`, `trial-only`, or `candidate-shared-after-second-use`; nothing is promoted to shared/DESIGN merely because Phase 3C passes. Record Sandbox setup/mock/persistence removal targets, sandbox account and record retention or expiry, kill-switch owner, expected residual records after trial, and objective retirement trigger. `03C-UI-SPEC.md` becomes phase provenance at closure. Add an import/deletion-boundary acceptance test proving removal of trial routes, mocks and operation-owned persistence does not damage neutral Action Invocation, and booking/inquiry/dispatch/communication/cancellation/non-paid actions cannot import paid-operation DTOs, semantics or payment panels. Preserve source proof and redaction falsifiers. Owned paths exactly listed. Forbidden: deleting artifacts during the test, modifying neutral Action Invocation to accommodate paid residue, promoting candidate-shared artifacts, workflows, real providers/payments, credentials, inherited paths, or original-worktree cleanup/stage/commit. RED/falsifier: any artifact is unclassified, trial removal breaks neutral imports, a non-paid action imports paid-operation types/panels, retention/kill-switch/retirement ownership is absent, local evidence claims hosted, or packet tampering verifies. Commands: focused release test, import/residue test and source gate. Evidence: source/local verifier only. Stop on ownership ambiguity, unavailable integrated revision, custody mismatch, secret detection, unexpected effect or regression. Leave proof worktree in parent custody and follow the runbook handoff plus proof fields.</action>
  <verify><automated>npm run test -- tests/unit/release/paid-operation-hosted-release.test.ts tests/imports/paid-operation-trial-residue.test.ts &amp;&amp; npm run test:release:source</automated></verify>
  <done>The release verifier fails closed on every missing/tampered proof field, closure residue is classified and removable at the import boundary, and the exact source revision passes focused release gates.</done>
</task>
<task type="checkpoint:decision" gate="blocking-human">
  <name>Task 2: Source-prove deployment and authorize readback</name>
  <files>None — external-action authorization gate; no repository mutation</files>
  <action>From the proof worktree, use read-only source/config inspection to record the exact existing deployment command, component, target/environment, current deployment ID and served revision, Convex deployment identity, credential/account owner, and rollback command/target. Guessing is forbidden. If any item is absent or ambiguous, return the earliest blocker without mutation. Then present the bounded one-deploy/readback action, blast radius, proof revision/tree, custody manifest, mock constraint, prior target, and rollback target. Founder authorization applies only to the recorded command/component/target. No deployment, Convex, credential, or hosted call occurs before authorization.</action>
  <decision>Permit one exact-revision deployment/readback run that contacts the configured hosted application and Convex control plane using labelled mock providers only.</decision>
  <context>Local gates cannot prove hosted reachability. This action changes external deployment/control-plane state and is deliberately separate from implementation authority.</context>
  <options>
    <option id="authorize">
      <name>Authorize hosted readback</name>
      <pros>Can establish the narrow authenticated exact-revision hosted-sandbox claim.</pros>
      <cons>Creates a hosted deployment and bounded sandbox records; still proves no real settlement, fulfilment, safety, demand, or value.</cons>
    </option>
    <option id="withhold">
      <name>Withhold hosted readback</name>
      <pros>Keeps all evidence local and avoids external state changes.</pros>
      <cons>P3C-R9 and the hosted portion of D-01 remain unproven.</cons>
    </option>
  </options>
  <resume-signal>Select authorize or withhold after every deployment, identity, credential-owner, and rollback field is source-proven. Never infer authorization.</resume-signal>
  <verify><automated>test -n "$PHASE3C_PROOF_WORKTREE" &amp;&amp; git -C "$PHASE3C_PROOF_WORKTREE" diff --quiet &amp;&amp; git -C "$PHASE3C_PROOF_WORKTREE" diff --cached --quiet &amp;&amp; git -C "$PHASE3C_PROOF_WORKTREE" rev-parse HEAD &amp;&amp; git -C "$PHASE3C_PROOF_WORKTREE" rev-parse HEAD^{tree}</automated></verify>
  <done>The founder explicitly authorizes one bounded hosted run against the recorded clean proof revision/tree, or hosted execution is withheld and P3C-R9 remains open; original custody remains untouched.</done>
</task>
<task type="auto">
  <name>Task 3: Run one bounded hosted readback and verify the packet</name>
  <files>tools/release/verify-paid-operation-hosted-release.ts, tests/deploy-smoke/paid-operation-hosted-sandbox-smoke.spec.ts</files>
  <action>Only after Task 2 authorization and passing comprehension, execute from the proof worktree in this exact short-circuited order: focused source gates; recorded deployment command once; non-mutating served-revision check; only when it equals `PROOF_REVISION`, run human golden smoke from evaluator `/actions/paid/new` through `/actions/paid/:invocationRef`; run evaluator agent create/inspect/command smoke; run one predeclared post-release uncertainty goblin and verify intent-only public reconcile with trusted internal evidence; packet collect; independent verify. Served-revision confirmation precedes every lifecycle mutation. The golden packet records setup-selected/source-bound provider, permission-recorded/not-submitted, execute-once, separated truth and cold restore. The goblin packet records branch point, durable truth, sole rejoin/stop and zero replay/switch. Only this successful task may emit `authenticated_exact_revision_hosted_sandbox`. Runbook rows and rollback remain as specified. Preserve and report residual sandbox records under the closure retention posture; never claim reversal or delete evidence. Owned paths are frozen. Forbidden: real providers/payments, caller reconciliation evidence, repeated probes, different revision, inherited work or unrecorded rollback. RED/falsifier: deploy without discovery/authorization, revision mismatch before mutation, external reconcile evidence, golden transition missing/reordered, goblin replay/switch, absent rollback, rollback verification failure, custody/digest drift, duplicate/unexpected effect, secret leakage or hosted label before successful readback. Evidence: authenticated exact-revision hosted sandbox only on full success. Claim ceiling remains hosted reachability, durable reconstruction, declared comprehension and paid-operation human/agent parity—not onboarding, fulfilment, demand/value, settlement, production safety or non-paid action compatibility. Stop at first failure. Follow the expanded handoff plus deployment/rollback/custody/proof/packet/event/records-left fields.</action>
  <verify><automated>cd "$PHASE3C_PROOF_WORKTREE" &amp;&amp; npm run test:release:hosted:paid-operation-readback &amp;&amp; npm run smoke:paid-operation:hosted-sandbox &amp;&amp; npm run verify:paid-operation:hosted-packet</automated></verify>
  <done>After authorization, the named hosted commands and independent verifier pass once with exact revision/deployment/identity/fixture binding, warm/cold parity, and zero duplicate effects; otherwise the earliest blocker is recorded and P3C-R9 remains open.</done>
</task>
</tasks>
<threat_model>
## Trust Boundaries
| Boundary | Description |
|---|---|
| Git revision → deployment | Hosted proof must run the exact clean source |
| Hosted surfaces → evidence packet | Readback, not caller assertions, supplies observed truth |
| Sandbox → external providers | Only labelled mock endpoints are authorized |
## STRIDE Threat Register
| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-03C-24 | Spoofing | Deployment revision | critical | mitigate | Exact revision/readback binding |
| T-03C-25 | Tampering | Evidence packet | critical | mitigate | Independent recomputation and falsification tests |
| T-03C-26 | Information disclosure | Hosted logs/packet | high | mitigate | No credentials, signatures, payloads or raw evidence |
| T-03C-27 | Denial of service | Hosted probing | medium | mitigate | One bounded authorized scenario; stop on fan-out |
</threat_model>
<verification>In the separate clean proof worktree, verify source gates first, then—only with authorization—run one named deployment/readback and independently validate custody base/tree, proof revision/tree, deployment, actor/fixture bindings, transitions, cold parity, counters, labels and claim ceiling. Confirm the original custody tree and its inherited modifications were never cleaned, restored, staged, committed or otherwise changed.</verification>
<success_criteria>Phase hosted proof ends only with one clean-proof-revision authenticated readback and verified packet, or the earliest reproducible blocker. The original custody tree remains untouched and the proof worktree remains in parent custody unless later moved to Trash under explicit direction. Local success never substitutes for hosted evidence.</success_criteria>
<source_coverage>

| SOURCE | ID | Feature/Requirement | Plan | Status | Notes |
|---|---|---|---|---|---|
| GOAL | — | Authenticated hosted BTC/USD sandbox loop with equivalent human/agent recovery | 01-07 | COVERED | Vertical loop from boundary through readback |
| REQ | P3C-R1 | Durable hosted truth | 01-03,07 | COVERED | ADR/RED, persistence, trusted recovery, cold readback |
| REQ | P3C-R2 | Authenticated application seam | 01,04,07 | COVERED | Identity/authority RED and both adapters |
| REQ | P3C-R3 | Shared semantics unchanged | 01-02,04-05,07 | COVERED | Same service/object/digest plus no-branch eval |
| REQ | P3C-R4 | Human trial surface | 04-06 | COVERED | Protected detail, browser and comprehension |
| REQ | P3C-R5 | Structured-agent surface | 04,07 | COVERED | Closed typed adapter and hosted parity |
| REQ | P3C-R6 | Explicit provider consequence | 01,03 | COVERED | Server selection and new lineage |
| REQ | P3C-R7 | Forward golden path and named goblin paths | 01-07 | COVERED | Ordered success tape plus source, transport, browser and hosted branch/rejoin falsifiers |
| REQ | P3C-R8 | Interface quality | 05-06 | COVERED | Automated mechanics and human comprehension |
| REQ | P3C-R9 | Exact hosted evidence | 07 | COVERED | Separately authorized exact-revision readback |
| REQ | P3C-R10 | Comprehension/claim ceiling | 01,03-07 | COVERED | Labels, eval and evidence ceiling |
| REQ | P3C-R11 | Trial residue and retirement | 07 | COVERED | Artifact classification, removal/import gate, retention, kill switch and retirement trigger |
| RESEARCH | ADR-021 | Canonical model/auth/trust boundary decision | 01 | COVERED | Blocking founder acceptance and ADR |
| RESEARCH | Durable composition | Bounded indexed records and one aggregate load | 02 | COVERED | No second lifecycle |
| RESEARCH | Creation/reconciliation | Server-selected fixture and trusted observer | 03 | COVERED | No caller result |
| RESEARCH | Auth adapters | Clerk session and least-privilege agent key | 04 | COVERED | Non-enumerating typed transport |
| RESEARCH | UI/evals | UI contract, browser and comprehension | 05-06 | COVERED | Non-BTC horizontal renderer proof |
| RESEARCH | Release | Existing exact-revision machinery | 07 | COVERED | No parallel proof system |
| CONTEXT | D-01 | Narrow evidence target | 01,06-07 | COVERED | Explicit ceiling throughout |
| CONTEXT | D-02 | Existing application/semantic seams | 01-05 | COVERED | Hosted adapters compose unchanged seam |
| CONTEXT | D-03 | Protected human detail | 04-06 | COVERED | Ordinary hierarchy and progressive detail |
| CONTEXT | D-04 | Authenticated agent adapter | 01,04,07 | COVERED | Closed server-owned contract |
| CONTEXT | D-05 | Source-bound provider before authority; evaluator override only | 01,03-05 | COVERED | Normal path has no false choice; switch is a new consequence |
| CONTEXT | D-06 | Astryx paid-operation UI | 05 | COVERED | Query/provider agnostic within paid operations; no non-paid compatibility claim |
| CONTEXT | D-07 | Golden path and goblin-path contract | 01-07 | COVERED | Named branches, safe rejoin/stop, reconcile-only uncertainty |
| CONTEXT | D-08 | Claim language | 01,03-07 | COVERED | Exact labels and ceilings |

Deferred ideas and Phase 3C non-requirements are excluded and appear in no task.
</source_coverage>
<output>Create `.planning/phases/03c-hosted-paid-operation-product-trial/03C-07-SUMMARY.md` with the required handoff schema and exact hosted evidence ceiling.</output>
