# Hosted paid-operation comprehension trial

## Decision and boundary

This runbook supports one decision: can an eligible evaluator understand the
consequence, payment/result truth and only safe continuation of the Phase 3C
paid-operation projection?

The current evidence is **labelled local browser mechanics + authenticated
route fixtures**. It is not a protected hosted browser session. The runtime
labels are:

- environment: `Local labelled sandbox`
- provenance: `Labelled mock provider`
- evidence class: `local_labelled_sandbox_fixture`

No real provider, credential, payment, settlement, fulfilment, production,
customer-value or hosted-reachability claim is available in Plan06.

Do not run a cohort from this file alone. Bind the session to the exact frozen
digest in `03C-COMPREHENSION-EVAL.md` and use the participant-safe packet only.
The scorer and empty results envelope are the authoritative admission gate.

## Non-mutating local preflight

Plan06 permits read-only local inspection and focused local tests only. It does
not permit a network call, account lookup, credential access, browser-hosted
probe, deployment, Convex command, provider request or payment action.

Before any session:

1. Record the exact source revision and tree with `git rev-parse HEAD
   HEAD^{tree}`. The instrument was derived from the integrated Plan05 base
   `7a7ecbfdfcb04920e38ba79a168f8eac720224e8` and
   tree `d2c838e3243535a65da53e7542906b0ea8dc58a0`. After Plan06 integration,
   use the parent-supplied integrated instrument revision and prove it descends
   from that base; do not pretend the pre-commit base is the served revision.
2. Confirm `git status --short --untracked-files=all` contains only the
   authorized Plan06 files or is clean after parent integration.
3. Inspect `package.json` before invoking any named script. Do not install or
   update dependencies.
4. Confirm the instrument, scorer and results files exist and that the scorer
   accepts the empty `not_run` envelope at the frozen digest.
5. If local UI verification is required, use the already-installed dependency
   tree only. A temporary ignored `node_modules` symlink may point only to the
   approved shared dependency path. Move the link itself to Trash immediately
   afterward.
6. Stop if any preflight step requires network access, a credential, an
   external account, a source/UI change, a control-plane call or a path outside
   the Plan06 allowlist.

## Route shapes under evaluation

These are source and authenticated-route-fixture shapes. They are not evidence
that a hosted origin currently serves them.

Human setup:

```text
/actions/paid/new
```

This is evaluator-only `Sandbox setup`, not canonical product navigation,
provider comparison or a public action marketplace. It accepts one closed
fixture choice and keeps provider selection outside the paid-operation card.

Human detail:

```text
/actions/paid/:invocationRef?expectedInvocationVersion=:version
```

The detail surface shows provider, maximum charge, shared data, separate
payment/payment-outcome/result truth and the source-issued safe continuation.

Structured-agent creation:

```http
POST /api/v1/paid-operations
Content-Type: application/json

{"providerKey":"A"}
```

Structured-agent inspection:

```http
GET /api/v1/paid-operations/:invocationRef?expectedInvocationVersion=:version
```

Structured-agent command:

```http
POST /api/v1/paid-operations/:invocationRef/commands
Content-Type: application/json

{"command":"authorize","commandId":"<opaque-id>","expectedInvocationVersion":3,"accept":true}
```

Execute carries only command, command ID and expected version. Public
reconciliation is intent-only:

```json
{
  "command": "reconcile",
  "commandId": "<opaque-id>",
  "expectedInvocationVersion": 3
}
```

The caller supplies no reconciliation evidence, settlement result, provider
response, identity, amount, recipient, authority scope or semantic digest as
truth. A trusted server/operator-side boundary obtains attributable evidence.

## Golden tape

Run this tape first for every participant. Technical details stay closed.

| Step | Participant sees | Action | Required observation |
|---|---|---|---|
| Evidence boundary | `Local labelled sandbox`, `Labelled mock provider`, no real payment, and the exact label `labelled local browser mechanics + authenticated route fixtures` | None | Participant does not call this hosted or real |
| Sandbox setup | “Get the latest BTC price in USD”; two unranked mock fixtures; each shows Operation revision 1 and `$0.01 USD` | Select Mock provider A; create sandbox operation | Setup is evaluator-only and outside the shared card |
| Consequence review | Provider A, up to `$0.01 USD`, BTC and USD, `Ready for permission`, nothing sent or paid | Authorize up to `$0.01` | Exact consequence is understood before authority |
| Permission recorded | `Payment prepared`; “Permission recorded. Nothing has been submitted yet.” | Continue operation once | Authority and execution remain separate |
| Result | Payment request `Observed by provider`; payment outcome `$0.01 settled in recorded sandbox evidence`; result `Validated` | Review only | Three truths remain separate; sandbox evidence is not independent settlement |
| Restore | Same completed operation after reload and a new local page | Inspect only | No new invocation, command, effect generation or release |
| Agent parity | Latest response supplies only its current inspect/command relation and expected version | Follow returned relation only | Agent invents no command, provider, result or version |

The source-linked Plan05 counters are administration evidence, not participant
stimulus:

```text
ready_for_permission v3  invocation 1  effect 0  release 0  command 0
payment_prepared     v4  invocation 1  effect 0  release 0  command 1
result_received      v5  invocation 1  effect 1  release 1  command 2
reload/new page delta    invocation 0  effect 0  release 0  command 0
```

## Named goblin matrix

Every branch either rejoins through one explicit source-issued continuation or
stops visibly. None may replay a consequence automatically.

| Goblin | Branch point and visible truth | Sole rejoin or stop | Evidence used in Plan06 |
|---|---|---|---|
| `authentication_or_admission` | Before setup/inspect; no operation facts disclosed | Authenticate, return to setup, or stop unavailable | Authenticated route fixtures |
| `authority_refusal` | `Not sent`; nothing sent and no payment request submitted | Review current record; any future operation is separate | Local card state + route fixture |
| `source_refusal` | Stopped before anything sent or paid, with ordinary-language reason | Correct only if current semantics permits; otherwise stop | Source/UI fixture contract |
| `duplicate_delivery` | `Already recorded`; no second payment request or operation | Current durable continuation only | Application/route fixtures |
| `stale_or_disallowed` | `Operation changed`; old action not applied again | Inspect latest durable state | Authenticated route fixtures |
| `ambiguous_transport` | `Update not confirmed`; command outcome not assumed | Read-only Reload operation | Route fixture + local browser mechanics |
| `possibly_submitted` | `Needs checking`; provider may have received request | Check existing payment only | Local typed semantics/card |
| `settlement_unknown` | Payment may have occurred; settlement unknown | Check existing payment only | Local typed semantics/card |
| `invalid_result` | Payment may have occurred; result not validated | Check existing payment only | Local typed semantics/card |
| `reconciliation_in_progress` | Existing payment is being checked; no new request sent | Read-only review/inspect while waiting | Local typed semantics/card |
| `reconciled_not_settled` | `Checked — not paid`; earlier payment not settled | Review old record; a new result needs new operation and permission | Local typed semantics/card |
| `settled_unusable_result` | Recorded sandbox payment evidence; result unusable | Review evidence; no implied free retry | Local typed semantics/card |
| `read_outage` | Durable record cannot be loaded | Read-only Reload operation or visible stop | Route + local browser fixtures |
| `reload_or_cold_restore` | Same durable truth after reload/new page | Current source-issued continuation | Local browser mechanics and zero-delta counters |

The participant comprehension set uses the seven frozen goblin stimuli in the
instrument: authority refusal, possibly submitted, invalid result, reconciled
not settled, stale/duplicate, read outage and completed restore.

## Counterbalancing

Golden is always first. Then use the exact assignment recorded in the frozen
instrument:

```text
A: authority refusal → possibly submitted → invalid result
   → reconciled not settled → stale/duplicate → read outage → completed restore

B: stale/duplicate → read outage → completed restore → authority refusal
   → possibly submitted → invalid result → reconciled not settled

C: invalid result → reconciled not settled → stale/duplicate → read outage
   → completed restore → authority refusal → possibly submitted
```

For the automated adjunct, dispatch exactly three independent fresh-agent
contexts:

```text
agent-00000001 → assignment A
agent-00000002 → assignment B
agent-00000003 → assignment C
```

They may receive only the participant-safe stimulus and questions. They must
not inspect the repository, files, source, tools, scorer, answer key, rubric,
prior responses or one another’s output. Automated results are recorded only
as `automated_model_comprehension`; they never satisfy or overwrite
`declared_human_comprehension_session`.

## Participant administration

Eligibility is decided before showing the tape. Exclude Phase 3C implementers,
Phase 3C reviewers, anyone with answer-key exposure, anyone coached, and anyone
who inspected repository/files/tools. Use anonymous IDs matching the frozen
class pattern; do not store a name, email, account ID, credential, IP address
or other personal identifier.

Show only:

1. the evidence-boundary notice;
2. the assigned stimulus frames in order;
3. the ten question prompts, option IDs and option labels; and
4. the response JSON skeleton.

Do not show `correctOptionId`, mandatory-gate flags, hard-fail tags, thresholds,
source trace, scorer output or another participant’s answer. Do not paraphrase
a question, suggest an option, explain an error or reveal correctness until the
response is sealed. Any such help is coaching and makes the session ineligible.

Golden-path incompletion is non-pass. Questions 3, 5, 7, 8, 9 and 10 are
all-participant gates. Total accuracy must be at least 90%. Choosing retry or a
provider switch while an effect is uncertain is a hard fail.

## Required response JSON

Each participant returns exactly this schema. Replace placeholders only; do not
add fields.

```json
{
  "schema": "ae-paid-operation-comprehension-response:v1",
  "participantId": "agent-00000001",
  "class": "automated_model_comprehension",
  "counterbalanceAssignment": "A",
  "scenarioOrder": [
    "GOLDEN",
    "AUTHORITY_REFUSAL",
    "POSSIBLY_SUBMITTED",
    "INVALID_RESULT",
    "RECONCILED_NOT_SETTLED",
    "STALE_DUPLICATE",
    "READ_OUTAGE",
    "COMPLETED_RESTORE"
  ],
  "completedScenarioIds": [
    "GOLDEN",
    "AUTHORITY_REFUSAL",
    "POSSIBLY_SUBMITTED",
    "INVALID_RESULT",
    "RECONCILED_NOT_SETTLED",
    "STALE_DUPLICATE",
    "READ_OUTAGE",
    "COMPLETED_RESTORE"
  ],
  "goldenJourneyCompleted": true,
  "eligibility": {
    "independent": true,
    "humanParticipant": false,
    "freshAgentContext": true,
    "phase3cImplementer": false,
    "phase3cReviewer": false,
    "answerKeyExposed": false,
    "coachingReceived": false,
    "participantSafePacketOnly": true,
    "repoInspection": false,
    "fileInspection": false,
    "toolInspection": false
  },
  "answers": [
    {"questionId": "Q1", "selectedOptionId": "<Q1-A|Q1-B|Q1-C>"},
    {"questionId": "Q2", "selectedOptionId": "<Q2-A|Q2-B|Q2-C>"},
    {"questionId": "Q3", "selectedOptionId": "<Q3-A|Q3-B|Q3-C|Q3-D>"},
    {"questionId": "Q4", "selectedOptionId": "<Q4-A|Q4-B|Q4-C>"},
    {"questionId": "Q5", "selectedOptionId": "<Q5-A|Q5-B|Q5-C|Q5-D>"},
    {"questionId": "Q6", "selectedOptionId": "<Q6-A|Q6-B|Q6-C|Q6-D>"},
    {"questionId": "Q7", "selectedOptionId": "<Q7-A|Q7-B|Q7-C|Q7-D>"},
    {"questionId": "Q8", "selectedOptionId": "<Q8-A|Q8-B|Q8-C>"},
    {"questionId": "Q9", "selectedOptionId": "<Q9-A|Q9-B|Q9-C>"},
    {"questionId": "Q10", "selectedOptionId": "<Q10-A|Q10-B|Q10-C>"}
  ],
  "friction": {
    "durationMinutes": 0,
    "backtracks": 0,
    "helpRequests": 0,
    "confusingScenarioIds": [],
    "notes": "",
    "containsPii": false
  }
}
```

For a human session, use class
`declared_human_comprehension_session`, an anonymous
`human-[a-z0-9]{8}` ID, `humanParticipant: true`, and
`freshAgentContext: false`. All other eligibility and no-inspection rules stay
the same.

Friction fields are descriptive only:

- `durationMinutes`: elapsed time, zero or greater;
- `backtracks`: count of returning to an earlier frame;
- `helpRequests`: questions asked before sealing;
- `confusingScenarioIds`: only frozen scenario IDs;
- `notes`: at most 500 characters and no PII;
- `containsPii`: must remain false.

## Results and scoring

Store raw anonymous session objects under the matching cohort in
`03C-COMPREHENSION-RESULTS.json`. Never move an automated session into the
human cohort. Keep the other cohort untouched. Set the cohort’s recorded status
and report from the scorer’s recomputation; the scorer refuses any disagreement.

An empty `not_run` envelope is valid and earns no comprehension claim. A human
PASS requires at least three eligible human sessions. An automated PASS requires
exactly the three fresh-agent sessions above and earns only the automated
adjunct class.

The Plan06 founder override is exact:

> Real-human comprehension may remain unproven without blocking the
> already-authorized Plan07 source/deploy work, but that does not satisfy
> P3C-R8’s human-comprehension evidence or upgrade the claim.

## Hosted placeholders — Plan07 gate only

Do not populate or use these placeholders during Plan06:

```text
PLAN07_BASE_URL=[UNSET]
PLAN07_DEPLOYMENT_ID=[UNSET]
PLAN07_EXPECTED_REVISION=[UNSET]
PLAN07_SERVED_REVISION=[UNCONFIRMED]
PLAN07_HUMAN_ACCOUNT_REFERENCE=[UNSET, NON-SECRET]
PLAN07_AGENT_CREDENTIAL_OWNER=[UNSET, NO SECRET MATERIAL]
PLAN07_ROLLBACK_TARGET=[UNSET]
PLAN07_FOUNDER_AUTHORIZATION=[NOT GRANTED BY PLAN06]
```

Hosted steps remain blocked until Plan07 independently confirms the exact
served revision, named deployment and authorized identities, and the founder
authorizes the external action. Only then may Plan07 replace the local evidence
label with `authenticated_exact_revision_hosted_sandbox`. No Plan06 artifact,
fixture, digest or comprehension result can make that promotion.

## Stop conditions

Stop before participant answers if the instrument digest drifts, the
participant-safe packet exposes a rubric or technical/source detail, eligibility
cannot be established, or the frozen stimuli contradict the integrated source.

Stop during administration at the first answer-key exposure, coaching, repo/
file/tool inspection, PII, incomplete golden journey, retry/provider switch
during uncertainty, class mismatch or external-call requirement. Record the
session as ineligible or failed; never repair it into PASS.
