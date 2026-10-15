# Chat orchestration trial and proposed production scope

15 October 2026. Candidate branch: `codex/chat-research-action-trial`.
Base: `d9a9fd96f92a8c04b217629a453b3986a79b5c90`.

## Decision

Keep the current product stack for the next repair. Retain the Dify and LangGraph
trials as local comparison harnesses; do not introduce either into production
from this evidence. The desired experience is research with source evidence,
followed by authorized action and a useful result in one conversation.

The trials establish that explicit workflow state can preserve a selected Tool,
inputs and existing Call through pauses. They do not establish a superior
reasoning engine or qualify real purchases. Our installed Convex Agent 0.7.1 and
Workflow 0.4.6 components already offer a path to this structure without a second
stateful service. That implementation remains proposed, not built by this trial.

## Executed evidence

| Surface | Observed result | Evidence boundary |
| --- | --- | --- |
| Dify 1.17.1 classic Chatflow | 18/18 scripted workflow scenarios | Actual published Chatflow API; synthetic market and scripted planner/renderer |
| LangGraph JS 1.5.0 | 18/18 identical scripted scenarios | Actual StateGraph, interrupts and MemorySaver; same synthetic market |
| Current chat runtime | Four integration scenarios pass: research, explicit audit Run, authority refusal and uncertain delivery | Actual `streamDurableChatResponse`, Agent tools, storage and fallback; external catalogue/purchase ports simulated |
| Dify with shared live classifier | 4/4 intent scenarios pass after contract corrections | External Node classifier through AE model gateway; no Dify Agent/LLM node; selection/rendering remain fixtures |
| LangGraph with shared live classifier | 4/4 intent scenarios pass after the same corrections | Intent classification only; not autonomous Tool reasoning or synthesis |
| Current chat with live model | Returned a Tool recommendation and “Review inputs”; two model requests, zero dispatches, no research table | Autonomous Agent against aligned synthetic Tool declarations and purchase ports; observation test's safety pass is not task completion |
| External agent entry | Official MCP client lists Tools, searches, Quotes, Calls and replays after reconnect with one dispatch | Native SDK transport against fixture server; not production AE authentication/payments |
| Dify API restart | Existing uncertain Call resumed by status; same Call reference, one dispatch | Dify API restarted; database and fixture Provider stayed running |
| LangGraph runtime replacement | MemorySaver state absent | Persistent checkpointer deliberately not implemented |

The 18 shared cases include authority/funding return, denial, changed terms,
missing inputs, research then audit, held pending/uncertain delivery, safe client
retry after model failure before market I/O, and denial followed by a new funded
request. Authority changes are test-controller operations, not real login or
credit top-ups. Held delivery remains unresolved until the controller completes
the same Call. No framework retry surrounds a purchase dispatch.

The current scripted research case saves a source-linked table and makes six
model requests: the fifth response ends in a Markdown table's `|`, triggering
the existing extra final-answer request. Its explicit Run path delivers an
escaped output preview with the Call reference rather than the trial renderer's
polished findings. These are concrete current behaviors, not framework defects.

Initial live classifiers failed because free-form clarification and an unsuitable
union representation permitted wrong decisions. Those runs remain in local
evidence. A flat validated wire contract, explicit examples and a separate
missing-URL decision corrected this small case set. A larger held-out language
evaluation is still required. Four positive cases are not a reliability estimate.

The current live autonomous Agent and candidates' live classifiers perform
different work. Their pass rates and timings must not be ranked as a head-to-head
reasoning comparison. The baseline declaration was corrected to the same A$0.10
price, required keyword input and source-bearing output before the retained
comparison run. Earlier mismatched baseline observations are excluded.

## Cost and operations

Dify's selected deployment used ten services, nine continuing after permissions
initialization. A point-in-time idle snapshot totaled about 1.1 GiB across them;
this is a local footprint, not a production capacity forecast. It adds database,
Redis, API/worker, plugin, sandbox, proxy and web operations. The trial excluded
beta Agent, vector/RAG and collaboration services.

LangGraph's scripted runner peaked at approximately 139 MiB RSS in this local
case set. That is a single Node test process, not an equivalent production
deployment or a sizing comparison. Production persistence, workers, auth and
observability would need explicit integration. Its package is MIT licensed.

Dify's license adds workspace/multi-tenant and frontend branding conditions to
Apache 2.0; it must not be described as unrestricted Apache/MIT. See its
[license](https://github.com/langgenius/dify/blob/1.17.1/LICENSE).
The official Flowise repository was archived on 13 August 2026, so it was not
chosen for another maintained-runtime trial.

Live inference used the existing OpenRouter model-provider credential ephemerally
from its owning Convex deployment. Synthetic prompts incurred real inference
charges. No customer content, production Tool/payment credentials, real AE Tool
purchases, credit movements or settlement were used. Usage records remain local;
missing model cost is unknown, never zero. The recorded classifier requests
across all attempts totaled US$0.0014310394. The retained two-request current
Agent observation recorded US$0.001149652 inline; its test turn was still marked
working, so this is observed request cost rather than terminal-turn accounting.
These perform different work and do not establish comparative unit economics.

## Skill conclusions and independent review

Simplicity Razor strands: intent/reasoning, workflow state, commercial authority,
provider execution, result evidence and presentation. AE must continue owning
authority, Quote/Call identity, delivery uncertainty and financial resolution.
Neither framework receives permission to infer or mint spending authority.

| Option | Coupling and concrete benefit | Keep/remove decision |
| --- | --- | --- |
| Current Agent + installed Workflow | Reuses account/auth and Convex state; an explicit workflow can isolate intent from purchase effects | Preferred next experiment; no new production dependency in this change |
| Dify | Workflow definitions, workspace administration and its persistence are coupled to a separate service stack; useful visual editing and restart persistence | Keep local trial; production adoption not justified yet |
| LangGraph | Small graph/checkpoint API; auth, durable persistence and product rendering remain our responsibility | Keep code-first alternative; MemorySaver is insufficient for production |

Design review thesis: one conversation preserves research evidence and commercial
intent until the requested authorized action resolves. Integrity is strong for
the bounded trial, mixed for an adoption decision: realistic browser authority
continuity and live Provider acceptance remain missing. Exploit existing Convex
state and AE purchase identities; cut a second permanent orchestration stack
until it proves a benefit the installed components cannot supply.

The independent reviewer reproduced and prompted fixes for Quote replay extending
expiry, fixture key reuse across different Quotes, automatic completion of
uncertainty, cross-account continuation and stale LangGraph request state after
denial. Regression evidence now covers those boundaries. The reviewer accepted
the two production changes below and required the comparison/credential caveats
recorded here. Retained financial proofs remain deferred.

## Exact production changes proposed for approval

Only two maintained runtime files change:

1. `convex/lib/chat/tools/step.ts`: recognize a valid explicit Run request as the
   exact selected reference during read-only inspection. A substituted reference
   fails before lookup; the selected reference does not grant purchase authority.
2. `src/components/ae/chat/chat-session/components/ChatHeader.tsx`: change the
   spending toggle label to “Enable chat spending within limits”, matching the
   existing behavior rather than promising approval before every Call.

Tests and isolated experiment/docs files accompany these changes. Root package
dependencies, public APIs, database schemas/indexes, crons, financial policy and
deployment configuration remain unchanged. This release does **not** renew
expired spending authority, add resumable browser login/funding, replace chat
with Dify/LangGraph or promise the complete desired research/action experience.

After final checks and exact-head approval, the proposed operations are:

1. Deploy that approved backend source to Convex `upbeat-cricket-954`, then set
   and read back its release-source revision using the existing release process.
2. Merge the exact approved PR head to `main`, explicitly build/deploy that same
   source to the existing Vercel project, verify the READY deployment, then
   promote it to `app.aecon.ai` and verify alias/source binding and label.
   `vercel.json` disables automatic deployments from `main`.
3. Verify a read-only explicit Run inspection preserves its exact registry
   reference and does not obtain purchase authority. No paid canary or authority
   renewal is included in these operations.

Code rollback is the two-file revert against the base above, followed by the
same backend/web release sequence. No database or financial rollback is needed
or authorized. Recheck production drift immediately before release.

## Remaining acceptance

The next product change should implement one explicit request state across
research/discovery/action intent, verified Tool inputs, current authority,
Quote review when requested, existing-Call observation and source-bearing result
rendering. Use the installed Workflow component as the first bounded candidate;
preserve effect identities and keep large result bodies out of workflow steps.

Before claiming the Perplexity-like experience, verify browser sign-in and
expired-grant renewal, credit return, account isolation, denied/changed Quotes,
live sourced research followed by an actual authorized Tool action, disconnect
and retry, receipt/delivery/status distinction, and a held-out language set.
These are not inferred from the synthetic passes above.

## Primary references

- [Dify workflow/chatflow](https://docs.dify.ai/en/cloud/use-dify/build/workflow-chatflow)
- [Dify 1.17.1 source](https://github.com/langgenius/dify/releases/tag/1.17.1)
- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph interrupts and replay](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [Existing Convex Agent/workflow integration](https://docs.convex.dev/agents/workflows)
- [Flowise official repository](https://github.com/FlowiseAI/Flowise)

Reproduction: `experiments/chat-trial/README.md`; portable summary:
`experiments/chat-trial/results.json`. Nonsecret raw results, failed
classifier attempts, resource/image snapshots and check logs are retained under
ignored `output/chat-trial/evidence/`. Temporary service cleanup is recorded there.
