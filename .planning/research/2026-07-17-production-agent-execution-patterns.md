# Production agent execution patterns for ADR-009 and ADR-010

**Owner:** Engineering
**Status:** Active
**Maturity:** External field
**Question:** Which implemented production-grade patterns in five open-source agent systems should inform engineering decisions for partial-entry work and one action plane across human and agent experiences?
**Decision affected:** Proposed D-006 and D-007
**Evidence cutoff:** 2026-07-17
**Review by:** 2026-08-17
**Supersedes:** None
**Superseded by:** None

## Executive finding

The five repositories do not provide one architecture AE can copy. They do
provide convergent implementation evidence for four decisions:

1. Give every consequential invocation a stable identity and persist its
   desired state, observed state, attempt/generation counters, freshness and
   error posture independently of any chat transcript.
2. Treat approval as a resumable execution gate addressed by execution identity,
   not as a conversational “yes”; bind the gate to the exact pending action and
   make human and machine hosts consume the same decision.
3. Retry only behind an operation-specific reconciliation boundary. Persist an
   intermediate state before an effect, inspect external state after interruption,
   and either continue the same generation or explicitly begin a new one.
4. Register one typed action/tool definition—schema, consequence annotation and
   implementation—and project it through different hosts. Host sessions may
   carry interaction state, but they do not own domain truth.

Confidence is high that these are real implemented patterns: the strongest
claims below are supported by source and tests at pinned commits, not README
descriptions. Confidence is lower that any repository proves AE's complete
cross-surface or multi-business composition contract. The systems solve coding,
tool execution or infrastructure reconciliation; none demonstrates commerce
authority, provider evidence, external-effect uncertainty, or independently
portable task results at AE's target boundary.

## Evidence method and repository posture

The review inspected the default branch at one immutable commit per repository,
including source, schemas/models, tests, change logs and repository automation.
“Implemented” below means a source path exists at that commit; “tested” means a
checked-in test exercises the stated behavior. It does not mean this review ran
the repository's entire test suite or verified a hosted deployment.

| Repository | Pinned commit | What it is evidence for | Material limit |
|---|---|---|---|
| `can1357/oh-my-pi` | [`0f9fceee`](https://github.com/can1357/oh-my-pi/tree/0f9fceeea483caad531a32b050ac38558516cb5c) | Append-only interaction journal, session resume/fork, tool approval policy and cautious model-call retry | Its durable object is an agent conversation, not domain work or a commerce effect |
| `proliferate-ai/proliferate` | [`eb5be954`](https://github.com/proliferate-ai/proliferate/tree/eb5be954fde1b0bbe12bba65c7d063259de631f3) | Durable invocation identity, leases, generations, desired/observed state, CAS projections and background retry | Some architecture documents explicitly describe target rather than deployed state |
| `buildermethods/agent-os` | [`cae8e664`](https://github.com/buildermethods/agent-os/tree/cae8e664fb59a01869718c3151e0f45b7a06a2fb) | Durable, discoverable planning artifacts and explicit human plan approval | v3 deliberately retired implementation orchestration; it is not an execution runtime |
| `UsefulSoftwareCo/executor` | [`72073475`](https://github.com/UsefulSoftwareCo/executor/tree/720734756a70b1b4f1564bdf82dc4118e5de2b76) | Typed tool collection, schema validation, consequence annotations, isolated execution and cross-surface paused approval/resume | The inspected self-host MCP session store is in-memory; session durability differs by host |
| `alchemy-run/alchemy` | [`c3ed7403`](https://github.com/alchemy-run/alchemy/tree/c3ed7403e6a04e0756aa072d68997b9b2ae3cec0) | Persisted intermediate state, plan/apply separation, reconciliation and generation-aware recovery | Infrastructure resources have stronger read/idempotency contracts than many real-world business operations |

The repositories were active at the cutoff and include tests and release/change
automation, but activity is not operational proof. Agent OS's latest pinned
commit fixes portable install behavior; Executor and Alchemy contain broad unit
and integration suites; Proliferate contains architecture-boundary scripts and
worker tests; oh-my-pi contains targeted session, approval and retry tests.
These signals support engineering maturity, not production reliability claims.

## Implemented patterns

### 1. Identity, authoritative state and projections

- **OBSERVED:** Proliferate persists a managed execution under
  `invocation_id` with separate delivery status/checkpoint, desired state,
  execution status, latest state version and projection, freshness basis,
  delivery/observation/cancel generations, attempt count and last error codes.
  Creation initializes this record as prepared, active and pending before work
  is delivered. [Managed execution snapshot and creation](https://github.com/proliferate-ai/proliferate/blob/eb5be954fde1b0bbe12bba65c7d063259de631f3/server/proliferate/db/store/workflow_managed_execution.py#L16-L103)
- **OBSERVED:** Proliferate applies observed projections under a row lock and
  expected observation generation. Higher versions apply, lower versions are
  stale, identical equal versions are heartbeats, and divergent equal versions
  are conflicts. Freshness and generation advance separately from the
  execution's reported status. [Projection CAS](https://github.com/proliferate-ai/proliferate/blob/eb5be954fde1b0bbe12bba65c7d063259de631f3/server/proliferate/db/store/workflow_managed_projection.py#L18-L63)
- **OBSERVED:** Cancellation is not inferred from UI state. Proliferate checks
  desired state, cancel generation, delivery checkpoint, invocation identity
  and workspace identity before applying the returned cancellation projection.
  [Cancellation projection guard](https://github.com/proliferate-ai/proliferate/blob/eb5be954fde1b0bbe12bba65c7d063259de631f3/server/proliferate/db/store/workflow_managed_projection.py#L66-L108)
- **OBSERVED:** oh-my-pi's session entries have stable `id`, `parentId` and
  timestamp fields and form an append-only tree. Extension state can be stored
  in custom entries and reconstructed on reload without putting that state into
  model context. [Session entry contract](https://github.com/can1357/oh-my-pi/blob/0f9fceeea483caad531a32b050ac38558516cb5c/packages/coding-agent/src/session/session-entries.ts#L47-L127)
- **OBSERVED:** oh-my-pi documents its persistence boundary precisely: the
  JSONL journal is safe against a software crash after append returns, atomic
  rewrite protects the previous file, but there is no `fsync`, so power-loss
  durability is not claimed. [Session manager durability contract](https://github.com/can1357/oh-my-pi/blob/0f9fceeea483caad531a32b050ac38558516cb5c/packages/coding-agent/src/session/session-manager.ts#L367-L380)

**INFERRED:** AE should not start by creating a universal `Task` aggregate.
It should define a small invocation/control envelope usable by existing action
or result records: stable invocation reference; action and version; actor,
principal and ownership scope; desired state; current resolution; attempt and
generation identities; freshness; expected evidence; and error/unknown posture.
The action-specific record remains authoritative for business facts and results.

**INFERRED:** Desired state, observed state and projection freshness must be
separate fields. “Cancel requested”, “provider reports cancelled” and “provider
cannot currently be reached” are materially different facts and must not
collapse into one status enum.

### 2. Execution claims, generations and interruption

- **OBSERVED:** Proliferate claims automation runs under a database row lock,
  matching run ID, claim ID, execution target, executor kind, allowed status
  and owner. The claim also has an expiry and can return an explicit
  `retry_after_seconds` while an active lease remains. [Claim validation and retry posture](https://github.com/proliferate-ai/proliferate/blob/eb5be954fde1b0bbe12bba65c7d063259de631f3/server/proliferate/db/store/automation_run_claims.py#L55-L103), [active-lease retry calculation](https://github.com/proliferate-ai/proliferate/blob/eb5be954fde1b0bbe12bba65c7d063259de631f3/server/proliferate/db/store/automation_run_claims.py#L152-L215)
- **OBSERVED:** Its Celery wrappers carry only invocation ID and generation into
  bounded deliver, observe and cancel operations. Escaped crashes retry with
  capped exponential backoff and jitter; generation checks in the operation
  prevent stale work from becoming current. [Bounded background operations](https://github.com/proliferate-ai/proliferate/blob/eb5be954fde1b0bbe12bba65c7d063259de631f3/server/proliferate/background/tasks/workflows.py#L25-L71)
- **OBSERVED:** Alchemy plans against the persisted intermediate state rather
  than an intended final state. A resource left `creating` is read back when
  possible and the same create is continued; an interrupted update continues as
  update; a replacement can explicitly restart with a fresh generation.
  [Recovery mapping](https://github.com/alchemy-run/alchemy/blob/c3ed7403e6a04e0756aa072d68997b9b2ae3cec0/packages/alchemy/src/Plan.ts#L822-L958),
  [replacement generations](https://github.com/alchemy-run/alchemy/blob/c3ed7403e6a04e0756aa072d68997b9b2ae3cec0/packages/alchemy/src/Plan.ts#L959-L1026)
- **OBSERVED:** Alchemy keeps plan construction side-effect-free. Even discovered
  existing resources are held in memory during plan and persisted only during
  apply, because mutating ownership during preview would make a later deploy
  dangerous. [Plan/apply authority boundary](https://github.com/alchemy-run/alchemy/blob/c3ed7403e6a04e0756aa072d68997b9b2ae3cec0/packages/alchemy/src/Plan.ts#L703-L742)
- **OBSERVED:** oh-my-pi refuses automatic replay after a stream has emitted
  observable output, including a tool call or non-empty content. Its retry path
  distinguishes transient provider/network errors from context overflow and
  uses bounded, jittered backoff. [Retry exclusion after observable output](https://github.com/can1357/oh-my-pi/blob/0f9fceeea483caad531a32b050ac38558516cb5c/docs/non-compaction-retry-policy.md#L23-L41), [retry lifecycle](https://github.com/can1357/oh-my-pi/blob/0f9fceeea483caad531a32b050ac38558516cb5c/docs/non-compaction-retry-policy.md#L59-L76)

**INFERRED:** AE needs two different identities: a stable invocation identity
for the caller-visible work and a generation/attempt identity for each delivery
or external-effect try. A worker lease prevents concurrent ownership; a
generation fence prevents a late worker or observation from overwriting newer
truth.

**INFERRED:** Retry policy belongs to the registered action/adapter, not a
generic worker. Pure computation may replay. Communication creates another
attributable attempt. A possibly completed external effect must enter
reconciliation before any retry unless the provider contract supplies a tested
idempotency guarantee.

### 3. Approval and authority as resumable execution state

- **OBSERVED:** Executor's checked-in cloud E2E creates an organisation policy
  requiring approval for a named tool, calls that tool through a real
  Streamable HTTP MCP session, receives an approval URL and execution ID, loads
  the paused execution, posts the decision, then resumes by the same execution
  ID. [Cross-surface approval/resume scenario](https://github.com/UsefulSoftwareCo/executor/blob/720734756a70b1b4f1564bdf82dc4118e5de2b76/e2e/cloud/mcp-browser-resume-page.test.ts#L85-L165)
- **OBSERVED:** The same Executor suite drives the approval through browser UI
  while the MCP caller waits on `resume`, demonstrating that the UI is a host
  for one paused execution rather than a second workflow. [Browser-hosted decision](https://github.com/UsefulSoftwareCo/executor/blob/720734756a70b1b4f1564bdf82dc4118e5de2b76/e2e/cloud/mcp-browser-resume-page.test.ts#L177-L240)
- **OBSERVED:** Executor tool definitions expose read-only, destructive and
  requires-approval annotations alongside input/output schemas and integration
  requirements. Collection and invocation are separate operations.
  [Collected tool and executor contracts](https://github.com/UsefulSoftwareCo/executor/blob/720734756a70b1b4f1564bdf82dc4118e5de2b76/packages/plugins/apps/src/executor/app-tool-executor.ts#L22-L74)
- **OBSERVED:** oh-my-pi resolves tool approval from an argument-dependent tool
  declaration, a per-tool user policy and an active mode. Missing declarations
  default to the most consequential `exec` tier, and deny is enforced before
  invocation. [Approval resolution](https://github.com/can1357/oh-my-pi/blob/0f9fceeea483caad531a32b050ac38558516cb5c/packages/coding-agent/src/tools/approval.ts#L13-L143), [deny/prompt enforcement](https://github.com/can1357/oh-my-pi/blob/0f9fceeea483caad531a32b050ac38558516cb5c/packages/coding-agent/src/tools/approval.ts#L145-L168)
- **OBSERVED:** oh-my-pi's test proves the execution-time context—not session
  settings—selects the approval mode, and proves no-UI execution fails rather
  than silently accepting a required prompt. [Approval mode test](https://github.com/can1357/oh-my-pi/blob/0f9fceeea483caad531a32b050ac38558516cb5c/packages/coding-agent/test/tools/approval-mode.test.ts#L31-L60), [headless refusal](https://github.com/can1357/oh-my-pi/blob/0f9fceeea483caad531a32b050ac38558516cb5c/packages/coding-agent/test/tools/approval-mode.test.ts#L90-L139)

**INFERRED:** ADR-010 should specify an `AwaitingAuthority` control state with
an opaque approval reference, exact prepared action/version/input digest,
principal, target, consequence summary, expiry and allowed decisions. The
decision produces an attributable authority record; it does not mutate a chat
message into permission.

**INFERRED:** A rich AE approval view and an external agent's structured
approval packet should address the same prepared invocation. The view may add
explanation, but cannot recompute inputs, eligibility, target or consequence.
If a material input changes, the prepared version and authority reference
expire.

### 4. One registered action plane, different hosts

- **OBSERVED:** Executor validates collected tool input and output against
  Standard Schema, projects integration declarations into the input schema, and
  returns typed collection/invocation failures. [Schema validation](https://github.com/UsefulSoftwareCo/executor/blob/720734756a70b1b4f1564bdf82dc4118e5de2b76/packages/plugins/apps/src/executor/app-tool-executor.ts#L90-L157), [integration projection](https://github.com/UsefulSoftwareCo/executor/blob/720734756a70b1b4f1564bdf82dc4118e5de2b76/packages/plugins/apps/src/executor/app-tool-executor.ts#L166-L251)
- **OBSERVED:** Executor serializes tool failures into a structured envelope
  that preserves tagged failures, object-shaped errors, defects and
  interruption rather than collapsing everything into prose. [Dispatcher contract tests](https://github.com/UsefulSoftwareCo/executor/blob/720734756a70b1b4f1564bdf82dc4118e5de2b76/packages/kernel/runtime-dynamic-worker/src/invocation.test.ts#L34-L158)
- **OBSERVED:** Executor's self-host wiring reuses the same MCP session-store and
  server-building seam as the cloud host, but the inspected self-host store is
  explicitly in-memory. This is evidence for adapter reuse and also a warning
  that semantic parity does not imply identical durability. [Self-host session-store seam](https://github.com/UsefulSoftwareCo/executor/blob/720734756a70b1b4f1564bdf82dc4118e5de2b76/apps/host-selfhost/src/mcp/session-store.ts#L15-L44)
- **OBSERVED:** Proliferate's current automation target document says the
  intended automation runner should reuse sandbox, auth, command and projection
  primitives across web, mobile, Slack and desktop, but it labels itself
  `target`, says the projection substrate is absent, and separately lists what
  is currently shipped. [Target/current boundary](https://github.com/proliferate-ai/proliferate/blob/eb5be954fde1b0bbe12bba65c7d063259de631f3/specs/codebase/systems/product/automations/target.md#L1-L21), [current shipped run model](https://github.com/proliferate-ai/proliferate/blob/eb5be954fde1b0bbe12bba65c7d063259de631f3/specs/codebase/systems/product/automations/target.md#L144-L226)

**INFERRED:** AE's existing action registry is the correct seam to extend.
Each consequential action needs one contract containing schemas, read/write/
external-effect classification, authority preparation, idempotency and
reconciliation policy, evidence expectation, structured outcomes and safe
continuations. Human UI, embedded agent and external-agent adapters consume
that contract; they do not implement those rules.

**INFERRED:** Host session state may hold transport cursors, presentation
preferences and a pending interaction. It must be disposable and reconstructable
from the authoritative invocation/result/authority records. AE must explicitly
test host durability differences rather than assuming a shared adapter makes
them equivalent.

### 5. Composition and the negative control

- **OBSERVED:** Agent OS v3 explicitly retired implementation orchestration and
  delegates task tracking and execution to the host agent. Its maintained
  capability is standards discovery/injection and spec shaping. [v3 scope](https://github.com/buildermethods/agent-os/blob/cae8e664fb59a01869718c3151e0f45b7a06a2fb/CHANGELOG.md#L11-L47)
- **OBSERVED:** Its shape workflow creates a timestamped, discoverable spec
  directory containing plan, shaping decisions, applicable standards,
  references and optional visuals, then asks for approval before execution.
  [Spec artifact and approval flow](https://github.com/buildermethods/agent-os/blob/cae8e664fb59a01869718c3151e0f45b7a06a2fb/commands/agent-os/shape-spec.md#L115-L192)
- **OBSERVED:** Proliferate models an automation definition separately from an
  execution attempt and freezes trigger-time snapshots into each run. This
  appears in a document that distinguishes target and shipped fields; the
  shipped `AutomationRun` already has a durable status, snapshots, workspace/
  session references, executor claim and error fields. [Definition/run split and current fields](https://github.com/proliferate-ai/proliferate/blob/eb5be954fde1b0bbe12bba65c7d063259de631f3/specs/codebase/systems/product/automations/target.md#L73-L113), [shipped run record](https://github.com/proliferate-ai/proliferate/blob/eb5be954fde1b0bbe12bba65c7d063259de631f3/specs/codebase/systems/product/automations/target.md#L165-L187)

**INFERRED:** Agent OS is a negative control for ADR-009: a plan, checklist or
spec can be a valuable portable artifact without being executable work state.
AE should preserve customer-readable objectives and plans, but must not treat a
Markdown plan, transcript or generated dependency list as proof that authority,
attempts, effects or evidence exist.

**INFERRED:** Composition should reference independently inspectable invocation
and result identities plus declared dependencies. A bundle/route owns ordering,
roll-up and completion conditions; it does not copy constituent action state or
manufacture one shared approval.

## Decision candidates for ADR-009 and ADR-010

These are proposed engineering decisions for adoption after evals; this research
does not itself accept the ADRs.

| Decision | Recommended choice | Blast radius |
|---|---|---|
| Common durable primitive | Introduce a narrow invocation/control envelope around existing action-specific records, not a universal task/domain schema | Action registry, attempt/run records, agent payloads and inspection; no forced migration of every read-only action |
| Identity | Stable `invocationRef` plus immutable action/version; separate `attemptRef` and monotonic generation for each effect lane | Worker payloads, receipts, logs and continuation APIs |
| State | Separate desired state, observed resolution and freshness/reachability | Status types, UI projections and external-agent responses |
| Ownership | Record caller, principal, owner scope and delegated-authority reference at preparation; check again at execution | Auth/admission, approval and resume paths |
| Approval | Persist prepared invocation version and `AwaitingAuthority`; approve/reject by opaque reference; invalidate on material change or expiry | Human approval view, embedded conversation, external-agent response and audit |
| Retry | Per-action retry class: replayable compute, attributable communication attempt, or reconcile-before-retry external effect | Adapters, workers, error schema and operator recovery |
| Receipts/events | Append attributable transition/attempt/evidence events, while keeping a current projection for efficient reads | Storage, inspection and observability; avoid event-sourcing all domain state initially |
| Host boundary | Host state is reconstructable cache; all business transitions call the same registered action implementation | React/agent/API adapters and parity tests |
| Composition | Bundle references invocation/result IDs and dependencies; approval, attempt, evidence and recovery remain constituent-owned | RoutePlan/bundle projection only, not a second execution kernel |

## Evals before acceptance

| ID | Loop | Passing evidence | Falsifier |
|---|---|---|---|
| E-PA-01 | Prepare one consequential action in human UI, approve it there, then inspect/resume from a cold external agent | Same invocation/version, principal, authority, attempt, evidence and continuations on both surfaces | Either host recomputes business inputs or requires hidden transcript/session state |
| E-PA-02 | Interrupt after provider dispatch but before local acknowledgement, then restart workers | New worker observes the prior generation, reconciles provider state and does not duplicate the effect | Blind retry, duplicated effect, or unsupported “failed” certainty |
| E-PA-03 | Race late observation/cancellation from generation N against generation N+1 | CAS/generation fence rejects stale mutation while retaining the attributable observation | Old worker overwrites newer projection |
| E-PA-04 | Change a material prepared input after authority is granted | Prior approval becomes unusable and a new prepared version is required | Approval remains reusable |
| E-PA-05 | Complete one bounded task directly, stop, then compose it into a broader Request from a cold caller | Existing result/evidence is referenced without synthetic history or duplicated action state | Composition copies state, re-runs completed work, or invents Request ownership |
| E-PA-06 | Render the same paused/recovery state in rich UI and structured non-visual form | Same consequences, evidence, unknowns, allowed decisions and next owner | Presentation changes eligibility, authority or recovery meaning |

## Unknowns

- **UNKNOWN:** Which existing AE action/run/receipt record is the least costly
  home for the narrow invocation envelope. The external evidence does not justify
  a new table before current source and eval traces are mapped.
- **UNKNOWN:** Whether AE needs a separate append-only transition table or can
  initially derive sufficient receipts from existing source-owned transitions
  plus attempt/evidence records.
- **UNKNOWN:** Which provider contracts can guarantee idempotent replay and
  which must always reconcile uncertain external effects.
- **UNKNOWN:** How long prepared authority remains fresh for each action family,
  and which input changes are material enough to invalidate it.
- **UNKNOWN:** Whether a caller-independent continuation token should expose the
  invocation reference directly or use a scoped, expiring capability.
- **UNKNOWN:** None of the reviewed repositories proves multi-business economic
  composition, admission neutrality, offer freshness or successful fulfilment.

## Hypotheses and falsifiers

| ID | Hypothesis | Baseline | Measurement | Falsifier | Owner | Review by |
|---|---|---|---|---|---|---|
| H-PA-01 | A narrow invocation envelope can support direct and Request-owned execution without a universal task schema | Current Request-owned lineage | Duplicate types/transitions, parity failures, migration effort | One supported task requires a second authority/attempt/evidence lifecycle | Engineering | 2026-08-17 |
| H-PA-02 | Generation fencing plus reconcile-before-retry prevents duplicate uncertain effects under worker interruption | Current action-specific retry behavior | Duplicate effects, unresolved effects, recovery time across fault injection | Any blind duplicate or stale overwrite | Engineering | 2026-08-17 |
| H-PA-03 | One prepared-approval record supports rich human UI and cold external-agent continuation | Host-specific approval handling | Semantic parity and hidden-context rate | Host-specific business rule or transcript dependency | Engineering | 2026-08-17 |
| H-PA-04 | Reference-only composition preserves independent value and reduces rework | Synthetic Request ownership or copied bundle state | Reused results, duplicated work, state divergence | Bundle requires copied action state or inherited authority | Engineering | 2026-08-17 |

## Decision impact

This research supports keeping ADR-009's refusal to introduce a universal task
schema and ADR-010's one-action-plane direction. It sharpens the likely
engineering seam: a narrow invocation/control envelope, action-specific
authoritative records, generation-fenced attempts, persisted authority gates,
structured outcome/error/continuation projections and reference-only
composition.

No decision is adopted here. If the evals pass, D-006/D-007 and the ADRs should
be updated with the selected envelope, authority and retry contracts. Any new
public continuation or approval interface, canonical data model, or delegated
authority mechanism requires an ADR/authority review. `PROJECT-RECORDS.md`,
`SOURCE-REGISTER.md` and `RESEARCH-QUEUE.md` were intentionally not changed in
this bounded research task.

## Current-versus-target check

- **Current evidenced behavior:** This record changes no AE behavior. AE's
  currently exposed assistant actions and Customer Request surface remain only
  what production source and intended-surface evidence establish.
- **Target behavior informed by this research:** A caller can prepare, authorize,
  invoke, inspect, interrupt and continue bounded work by stable reference,
  through human or agent hosts, with one action implementation and honest
  desired/observed/freshness state. Independently useful results can later be
  composed by reference.
- **Claims this research does not authorize:** It does not prove that AE
  currently has durable partial-entry execution, cross-surface approvals,
  automatic retries, external-effect reconciliation, generated UI, route
  composition, booking, payment, dispatch or fulfilment. It does not establish
  that the reviewed repositories deliver production reliability merely because
  their source contains the mechanisms.

## Sources

- [oh-my-pi pinned source](https://github.com/can1357/oh-my-pi/tree/0f9fceeea483caad531a32b050ac38558516cb5c)
- [Proliferate pinned source](https://github.com/proliferate-ai/proliferate/tree/eb5be954fde1b0bbe12bba65c7d063259de631f3)
- [Agent OS pinned source](https://github.com/buildermethods/agent-os/tree/cae8e664fb59a01869718c3151e0f45b7a06a2fb)
- [Executor pinned source](https://github.com/UsefulSoftwareCo/executor/tree/720734756a70b1b4f1564bdf82dc4118e5de2b76)
- [Alchemy pinned source](https://github.com/alchemy-run/alchemy/tree/c3ed7403e6a04e0756aa072d68997b9b2ae3cec0)
