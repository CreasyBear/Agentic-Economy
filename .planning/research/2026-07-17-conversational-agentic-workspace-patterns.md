# Conversational agentic workspace patterns

**Owner:** Product  
**Status:** Active  
**Maturity:** External field  
**Question:** How do current agentic products combine conversation, tool use, generated or interactive work products, approvals, durable state, and parity between a first-party human experience and external callers?  
**Decision affected:** Proposed ADR-010  
**Evidence cutoff:** 2026-07-17  
**Review by:** 2026-08-17  
**Supersedes:** None  
**Superseded by:** None

## Executive finding

The strongest current pattern is not “chat replaces software.” It is a conversational control layer over reusable actions, with task-shaped work products and explicit intervention points. Harvey makes the work product durable through Vaults, review tables, drafts, and history; Glean most clearly documents reusable actions shared by assistants and workflow agents; OpenAI most clearly separates conversational state, component state, and authoritative server state while rendering tool results as interactive UI; Sierra most clearly describes one underlying agent implementation deployed across channels.

That supports the proposed ADR-010 direction: AE's first-party human agent and external agents should use the same registered actions and authoritative AE work state, while the first-party interface adds task-shaped views, clarification, approval, progress, and recovery. A broader outcome uses the canonical Customer Request; an independently useful bounded task must not be forced into a synthetic Request when its existing action and result records are sufficient. The transcript should remain an interaction record, not the sole durable representation of the work.

Confidence is **moderate**. The cited first-party sources establish offered product structures and documented contracts. They do not establish production reliability, user adoption, or exact internal architecture. Where sources are marketing pages, they prove positioning only.

## Cohort comparison

| System | Conversation and tool gathering | Work product / generated UI | Approval and continuation | Human / external parity | Material caution for AE |
|---|---|---|---|---|---|
| Harvey | Assistant queries uploaded, Vault, DMS, legal, public, and web sources; agentic search iteratively refines searches. Workflow Agents gather required files, text, and choices. | Vaults, review tables, cited reports, directly editable drafts, exports, and retrievable history sit beside threads. | Workflow Agents expose steps, citations, follow-ups, sharing, and export. Public material reviewed does not establish a general action-approval contract. | Vault is reused across Assistant, Workflows, Mobile, and add-ins. No reviewed public API establishes equivalent external-agent access to the same work state. | Excellent proof that chat benefits from durable work objects; weak public evidence for open caller parity or consequential action authority. |
| Glean | Assistant and agents select reusable Actions, infer inputs, ask for missing inputs, call external APIs, and chain outputs. | Conversation results, editable write previews, Canvas-created content, linked external records, and forms. | Web sessions pause before writes, show target and planned change, optionally allow editing, then continue. Background runs may notify through Agent Inbox. | Glean says Actions are shared and stable across Assistant and agents. However, `Wait for user input` is unavailable through MCP, APIs, Slack, Teams, and scheduled agents. | Shared actions do not automatically produce channel parity; intervention, approval, and resumption semantics must be specified and tested per surface. |
| Microsoft Copilot Studio | Agents combine conversational topics and flows with connected systems. | Adaptive Cards render structured information and collect input inside conversation across supported hosts. | AI approvals and workflow approvals exist; interactive cards can validate or collect information. | Adaptive Cards are portable JSON rendered by hosts, but supported schema and actions differ by Web Chat, live chat, Teams, and the test canvas. | Portable schemas still degrade by host. AE should define a semantic fallback for every generated decision surface. |
| Sierra | Agents use knowledge, systems of record, composable skills, goals, guardrails, and multi-step orchestration. | First-party examples show conversational widgets such as calendars and flight check-in; human handoff carries a conversation summary. | Deterministic guardrails constrain consequential operations; unresolved work is handed to a person with gathered details. Public pages reviewed do not specify a general end-user approval primitive. | Sierra says agents are built once and deployed across chat, phone, email, SMS, messaging, ChatGPT, and contact centres; Studio and SDK use the same underlying intelligence/building blocks. | Strong channel-reuse positioning, but public evidence does not show that channels expose identical interaction or durable-work affordances. |
| OpenAI Responses / Apps / Agents | Responses can call functions, connectors, and remote tools; Conversations persist messages, tool calls, tool outputs, and other items across sessions, devices, or jobs. | Apps turn structured tool results into inline interactive components; components can call tools and update model-visible context. | Remote-tool calls can require explicit approval; sensitive actions are recommended to require it. | MCP Apps UI is designed to run across compatible hosts, and remote tool servers can be used from API-built agents. The application still owns authoritative business state. | OpenAI explicitly warns that chat, component, and server state can diverge. Conversation durability is not the same as durable domain work. |

## Observations

### Harvey: conversation beside durable legal work

- **OBSERVED:** Harvey presents Assistant, Vault, Workflow Agents, History, and Library as distinct but connected core tools. Assistant supports Q&A, multi-step analysis, cited answers, file creation and editing, and search across uploaded files, Vault, DMS, premium databases, public sources, and the web. [Harvey Assistant](https://www.harvey.ai/platform/assistant) [Getting Started with Harvey](https://help.harvey.ai/articles/getting-started-with-harvey)
- **OBSERVED:** Workflow Agents proactively gather required files, text, or choices, provide incremental progress, expose completed steps and citations, allow follow-up or revision, and can produce editable drafts and exported files. [Workflow Agents Overview](https://help.harvey.ai/articles/assistant-workflows)
- **OBSERVED:** Vault persists large document collections and queries, generates structured review tables and drafts, and can originate an Assistant thread. Queries started in Vault or Assistant can become the same Assistant thread and appear in History. [Vault guide](https://help.harvey.ai/articles/vault)
- **OBSERVED:** Harvey says Vault is usable across Assistant, Workflows, Mobile, Word, and Outlook add-ins; Assistant can create review tables without changing to the Vault page. [Harvey Vault](https://www.harvey.ai/platform/vault) [Unified Vault and Assistant Query Creation](https://help.harvey.ai/release-notes/create-review-tables-in-assistant)
- **UNKNOWN:** The reviewed public sources do not establish an external-agent API that reads and advances the same Vault, workflow-run, approval, and draft state as Harvey's own interface.

### Glean: shared actions, explicit approvals, uneven channel parity

- **OBSERVED:** Glean defines Actions as reusable operations with descriptions, typed inputs and outputs, side effects, and error behavior. It says Actions are shared across Assistant and workflow agents and can be updated once for every caller. [Actions Overview](https://docs.glean.com/administration/actions/home)
- **OBSERVED:** Glean describes an outcome loop in which an Assistant or agent interprets a request, chooses Actions, populates inputs from context, executes external APIs, and uses outputs in a response or later Action. Actions can execute inside Glean or redirect the user to finish in another system. [Actions concepts](https://docs.glean.com/agents/actions/introduction-to-actions)
- **OBSERVED:** In Glean's web app, direct write Actions pause by default and display the target, planned change, and allow/cancel choice. Supported Actions then expose an editable preview. Multiple writes are approved separately and their returned identifiers can feed later steps. [Human-in-the-loop confirmations](https://docs.glean.com/agents/actions/human-in-the-loop-experience-for-actions)
- **OBSERVED:** A separate `Wait for user input` step can pause for up to 30 days, preserve the same thread, and support clarification loops. It cannot currently run through MCP, Glean APIs, Slack, Teams, scheduled agents, or background runs. [Wait for user input](https://docs.glean.com/actions/glean/wait-for-user-input)
- **INFERRED:** Glean is the clearest caution against assuming capability reuse equals experience parity. The action implementation may be shared while the authority and continuation semantics differ materially by host.

### Microsoft: portable interactive cards with host-dependent behavior

- **OBSERVED:** Copilot Studio uses Adaptive Cards to show information, validate information, and collect structured input inside a conversation. The JSON is intended to render natively in different hosts. [Adaptive Cards overview](https://learn.microsoft.com/en-us/microsoft-copilot-studio/adaptive-cards-overview)
- **OBSERVED:** Host support differs: the default Web Chat supports a different schema/action subset from live chat and Teams, and Copilot Studio's test canvas does not render every supported version. Microsoft recommends unique action data to avoid stale-card submissions affecting the wrong interaction. [Adaptive Cards overview](https://learn.microsoft.com/en-us/microsoft-copilot-studio/adaptive-cards-overview)
- **OBSERVED:** Copilot Studio's AI approval stages evaluate requests against configured business rules and return an approve/reject decision with a rationale; Microsoft positions this as retaining human control over important decisions. [AI approvals FAQ](https://learn.microsoft.com/en-us/microsoft-copilot-studio/faqs-ai-approvals)
- **INFERRED:** AE should treat generated UI as a projection of a semantic decision object. A caller that cannot render the preferred component must still receive the same options, constraints, consequences, and valid continuation tokens.

### Sierra: one agent logic across channels, guarded action and handoff

- **OBSERVED:** Sierra's Agent SDK composes skills such as triage, respond, and confirm around goals and guardrails, connects to systems of record, performs multi-step workflows, exposes traces, and can hand unresolved conversations to a human with a summary. [Sierra Agent SDK](https://sierra.ai/product/agent-sdk/)
- **OBSERVED:** Sierra says an agent can resume a conversation after the customer steps away and can take actions such as exchanges or reservation changes through connected systems. [Meet your agent](https://sierra.ai/product/meet-your-agent)
- **OBSERVED:** Sierra positions its implementation as build-once deployment across chat, phone, email, SMS, messaging, ChatGPT, and contact centres. It also says Agent Studio and Agent SDK use the same underlying intelligence or building blocks. [Agent OS 2.0](https://sierra.ai/blog/agent-os-2.0) [Agent Studio 2.0](https://sierra.ai/uk/blog/agent-studio-2-0)
- **OBSERVED:** Sierra describes deterministic safeguards for consequential operations and conversation simulation/regression tests derived from annotated failures. [Agent development life cycle](https://sierra.ai/blog/the-agent-development-life-cycle)
- **UNKNOWN:** Public sources reviewed do not establish that all channels expose identical approvals, interactive work products, or externally addressable durable task state.

### OpenAI: components over tools, with explicit state ownership

- **OBSERVED:** OpenAI's Apps SDK turns structured results from a remote tool server into UI components rendered inline with conversation. The components can initiate tool calls, send messages, and update model-visible context; the UI architecture is standardized for compatible MCP Apps hosts. [Build your ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui)
- **OBSERVED:** OpenAI distinguishes component state, authoritative server state, and model messages. Its guidance says authoritative data belongs in the backend or storage layer and warns that an explicit state contract is needed to prevent synchronization problems. [Design components](https://developers.openai.com/apps-sdk/plan/components)
- **OBSERVED:** The Conversations API persists a long-running object with a durable identifier across sessions, devices, or jobs and stores messages, tool calls, tool outputs, and other items. [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- **OBSERVED:** Remote tools and connectors can be automatically allowed or explicitly approved. OpenAI defaults remote-tool data sharing to approval and recommends approvals for sensitive actions. [MCP and Connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
- **INFERRED:** A durable conversation object is useful execution context but should not become AE's canonical task model. AE still needs a Customer Request whose constraints, evidence, authority, progress, and recovery are understandable without replaying model messages.

## Inferences

- **INFERRED:** The defensible ADR-010 architecture is one action plane and one canonical work state, with multiple interaction hosts. AE's embedded agent should not own a second search, recommendation, approval, or recovery system.
- **INFERRED:** “Generative UI” should mean selecting and populating a bounded task-shaped view from action results and canonical state—not allowing the model to invent business facts, action authority, or an unconstrained interface.
- **INFERRED:** Clarification and approval are different primitives. Clarification gathers facts needed to call an action; approval authorizes a specific consequential action with known inputs and consequences. Combining them obscures authority.
- **INFERRED:** Durable work should outlive a thread. The thread records how understanding evolved; authoritative AE records and their projections record what is currently known, proposed, authorized, attempted, and returned. Customer Request owns a broader outcome, but it is not a mandatory parent for every bounded task.
- **INFERRED:** Parity must be semantic rather than pixel-identical. External callers and limited hosts need the same action definitions, state transitions, evidence, authority boundaries, and continuation options even when only AE's first-party surface can render rich comparison or approval views.
- **INFERRED:** The highest-risk failure is state divergence: a click changes component state, a chat message changes model context, but the authoritative AE record does not change—or an external caller advances the work without the first-party workspace reflecting it.

## Unknowns

- **UNKNOWN:** Whether users perform better when clarification appears conversationally, as a generated form, or as a mixed interaction for each Customer Request family.
- **UNKNOWN:** Which AE task objects deserve first-class durable projections beyond the canonical Customer Request—for example candidate comparisons, proposals, approval packets, or recovery choices—without creating a competing state model.
- **UNKNOWN:** Whether external agents should be able to request a renderable UI description, or only receive semantic JSON plus safe continuation actions.
- **UNKNOWN:** How long a paused Request may remain actionable before business facts, eligibility, prices, or authority must be refreshed.
- **UNKNOWN:** No reviewed competitor establishes a complete open parity contract spanning first-party chat, external callers, generated UI, user approvals, and resumable domain state. This remains an architectural claim for AE to prove, not an industry-standard feature.

## Hypotheses and falsifiers

| ID | Hypothesis | Baseline | Measurement | Falsifier | Owner | Review by |
|---|---|---|---|---|---|---|
| H-010-1 | For supported request families, a conversational first-party agent compiling into the canonical Customer Request reduces effort without reducing decision quality. | Current form/search entry | Completion, clarification turns, corrections, abandoned Requests, and post-task confidence | More corrections or materially worse decision accuracy than the baseline | Product | 2026-08-17 |
| H-010-2 | One action and state contract can support AE's interface and an external agent without host-specific business logic. | Separate surface handlers | Contract parity eval across search, detail, inquiry, interruption, resume, and error cases | A supported business rule or state transition must be duplicated in a host adapter | Engineering | 2026-08-17 |
| H-010-3 | Task-shaped UI improves comparison and approval comprehension over prose-only chat. | Prose-only transcript | Correct option selection, consequence recall, time, and reversal rate | No improvement or higher consequential-error rate | Product | 2026-08-17 |

## Decision impact

This research supports proposing ADR-010 with the following decision:

> AE's first-party conversational agent and external agents use the same registered actions and authoritative work records. Conversation gathers and explains; task-shaped UI projects current work and collects structured input or authority; Customer Request remains canonical for a broader outcome, while supported bounded tasks retain their own truthful action and result lineage without a synthetic Request.

The ADR should require:

1. One action definition and boundary for every human or machine caller.
2. One source-owned transition path for each supported action, reused by every host; Customer Request composes those actions for a broader outcome rather than duplicating their meaning.
3. A semantic interaction contract beneath every rich component so non-rendering callers can continue safely.
4. Explicit separation of conversational context, UI-local state, and authoritative Request state.
5. Approval bound to a particular action, inputs, target, consequence, and freshness window.
6. Cross-surface parity evals rather than assuming parity from shared code.

This file does not itself adopt the decision. Adoption requires the ADR and the corresponding project-record update. No authority-file or current-product claim follows from competitor evidence.

## Current-versus-target check

- **Current evidenced behavior:** AE currently exposes shared registered actions for public registry search, listing detail, and qualified inquiry submission through human and machine surfaces. The authenticated Customer Request surface can create or resume a Request, provide missing facts, and inspect the states it actually returns. This research does not add functionality to those surfaces.
- **Target behavior informed by this research:** A first-party AE agent understands the immediate task and whether it belongs to a broader outcome, discovers the same registered actions available to external agents, gathers only material missing information, invokes a bounded task or compiles the broader outcome into Customer Request, renders task-shaped views from authoritative state, seeks bounded authority for consequential actions, and resumes with the same semantics on any surface.
- **Claims this research does not authorize:** It does not authorize claims that AE books, charges, dispatches, auto-fulfils, exposes customer-visible RoutePlan choice, or currently provides generated UI, complete cross-surface parity, or durable multi-step execution. Competitor marketing does not prove their reliability or AE's feasibility.

## Sources

- [Harvey Assistant](https://www.harvey.ai/platform/assistant)
- [Getting Started with Harvey](https://help.harvey.ai/articles/getting-started-with-harvey)
- [Harvey Workflow Agents Overview](https://help.harvey.ai/articles/assistant-workflows)
- [Harvey Vault guide](https://help.harvey.ai/articles/vault)
- [Harvey Vault](https://www.harvey.ai/platform/vault)
- [Harvey unified Vault and Assistant query creation](https://help.harvey.ai/release-notes/create-review-tables-in-assistant)
- [Glean Actions Overview](https://docs.glean.com/administration/actions/home)
- [Glean Actions concepts](https://docs.glean.com/agents/actions/introduction-to-actions)
- [Glean human-in-the-loop confirmations](https://docs.glean.com/agents/actions/human-in-the-loop-experience-for-actions)
- [Glean Wait for user input](https://docs.glean.com/actions/glean/wait-for-user-input)
- [Microsoft Adaptive Cards overview](https://learn.microsoft.com/en-us/microsoft-copilot-studio/adaptive-cards-overview)
- [Microsoft AI approvals FAQ](https://learn.microsoft.com/en-us/microsoft-copilot-studio/faqs-ai-approvals)
- [Sierra Agent SDK](https://sierra.ai/product/agent-sdk/)
- [Sierra Meet your agent](https://sierra.ai/product/meet-your-agent)
- [Sierra Agent OS 2.0](https://sierra.ai/blog/agent-os-2.0)
- [Sierra Agent Studio 2.0](https://sierra.ai/uk/blog/agent-studio-2-0)
- [Sierra agent development life cycle](https://sierra.ai/blog/the-agent-development-life-cycle)
- [OpenAI Build your ChatGPT UI](https://developers.openai.com/apps-sdk/build/chatgpt-ui)
- [OpenAI Design components](https://developers.openai.com/apps-sdk/plan/components)
- [OpenAI Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [OpenAI MCP and Connectors](https://developers.openai.com/api/docs/guides/tools-connectors-mcp)
