# Phase 3C agent runbook

## Runtime and authority

Implementation uses Codex in the repository worktree with shell read access,
`apply_patch` for edits, and only the focused commands named by the active plan.
The agent must read `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, the accepted
ADR-021, this runbook, the active plan, and every source file named in that
plan before editing. Planning files, prior summaries, mocks, and tests are
context; live source decides what exists.

Ignore unrelated roadmap history, issue strategy, broad-suite failures, and
unowned dirty changes. Never normalize, restore, stage, commit, or rewrite an
inherited path. One worker owns one plan's exact paths. Plan 04 has one
sequential executor for all coupled server and route files; none may be edited
in parallel.

Before the Plan 07 authorization gate, network, browser-hosted, deployment,
Convex control-plane, credential, provider, and payment calls are forbidden.
Read-only shell commands and focused local tests are allowed. Use
`apply_patch`, never shell redirection, for edits. Missing runtime, command,
credential owner, test-auth fixture, browser startup command, or required tool
is a blocking RED; do not substitute or invent one.

## Browser and protected-action posture

Local browser work starts only through the dedicated Phase 3C Playwright
configuration and its documented test-auth bootstrap. It must fail closed when
test auth or the labelled mock fixture is unavailable. Hosted browser work is
Plan 07 only and requires the recorded base URL, authenticated evaluator
account, and explicit founder authorization.

x402 is a protected-action overlay even in the labelled mock sandbox:
authentication is not authority; source-owned provider binding precedes
authority; the closed provider selector exists only in evaluator Sandbox setup
and stays outside the shared paid-operation card; prepared
custody persists before authorization/submission; submission-started persists
before possible release; ambiguous transport forbids replay; reconciliation
accepts exactly command, commandId and expectedInvocationVersion and obtains
evidence from a trusted server/operator-side observer. If a public application
type exposes evidence, Plan 01 must split public intent from internal trusted
resolution before routes proceed. Raw credentials, signatures, payment
payloads, provider responses, auth headers, and trusted evidence are never
persisted in shared records, packets, screenshots, or logs.

Plan 05 local fixtures use `local_labelled_sandbox_fixture`. Only an authorized,
successful Plan 07 exact-revision readback may use
`authenticated_exact_revision_hosted_sandbox`. Environment, provenance and
evidence class are runtime/source inputs, never renderer constants.

Generality is limited to query- and provider-agnostic rendering within the
paid-operation class. Never infer compatibility with booking, inquiry,
dispatch, communication, cancellation or other non-paid actions, and never let
those action classes import paid-operation DTOs, semantics or payment panels.

## Custody and integration

At the start and end of every plan, record `HEAD`, tree, `git status --short`,
and a SHA-256 custody manifest made from the sorted path/status pairs of all
pre-existing changes. A count is informational only. Stop if the manifest
changes outside owned paths.

Each executor returns an owned-path commit candidate and parent SHA; the parent
integrator alone selectively stages and commits verified owned paths in plan
order. Before integration, compare the final diff-name allowlist with all plan
ownership lists and reject every inherited path. The clean proof worktree is
created only from that final integrated revision. The original worktree is
never cleaned or used as proof.

## Required handoff and resumption

Every task and plan returns:

`{plan, runtime, baseRevision, baseTree, parentSha, custodyManifestHash,
ownedPaths, changedPaths, forbiddenPathsChecked, commands, exitCodes,
results, observableOutcome, redDisposition, counters, structuredEventRefs,
evidenceClass, claimCeiling, remainingFailure, stopReason, nextDecision,
commitCandidate, resumptionCommand}`.

On resumption, re-read this runbook and the active plan, verify the base/parent
and custody manifest, inspect the owned diff, and rerun only the last failed
focused command. Never replay a consequential or externally ambiguous command.
Stop at the earliest source contradiction, ownership collision, missing tool,
unexpected external effect, or claim-ceiling breach.

The invariant claim ceiling is: Phase 3C may prove authenticated hosted-sandbox
reachability, durable reconstruction, and declared evaluator comprehension plus
human/agent semantic parity. It cannot prove onboarding, real provider
fulfilment, demand or customer value, real settlement, or production safety.
