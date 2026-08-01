# Agent-engine shape: counterevidence review

Date: 2026-07-31. Scope: red-team of the proposed `/` agent engine against primary papers, first-party engineering guidance, builder postmortems, and first-party UX/product evidence. The target decisions are:

- **D1** — `/` is a model-driven loop (understand → investigate → act → revise → complete), replacing classification → predefined-route orchestration.
- **D2** — deterministic code is demoted to a safety kernel (identity, authority, spend limits, idempotency, effects, evidence, recovery); the model owns planning and action selection.
- **D3** — the agent explores freely (search/compare/ask businesses); the person approves only effects (commitments, payments, sensitive disclosure).
- **D4** — one plan combines instant machine-callable endpoints and asynchronous human-business inquiries; async chase/notify is the product.
- **D5** — contact is captured at the first asynchronous effect, not up front.
- **D6** — act first and ask only when blocked (strong defaults, minimal questions).

## Executive verdict

The evidence does not say “never use agents.” It says the proposed **unbounded default** is the risky part. The strongest primary evidence favors bounded model calls inside deterministic stages, explicit validation, compact tool/context surfaces, action budgets, and escalation when the user or an external party must participate. The cheapest safe cut is therefore: keep `/` as the conversational spine and registered-action surface, but make model planning a bounded proposal step; let deterministic code own eligibility, effect preparation, commit, wait/resume, and recovery.

### Ranked top-five risks

| Rank | Risk to the shape | Evidence | Cheapest mitigation / scope cut |
|---|---|---|---|
| **1** | **Long-horizon model loops are not reliably compositional.** Repeated tool decisions and retries compound errors; success can approach zero once a task needs more than a handful of actions. This attacks D1 and D2 directly. | τ-bench reports GPT-4o success below 50% and retail `pass^8 < 25%`; τ²-bench reports a telecom `pass^1` of 34% for GPT-4.1 and performance near zero above seven actions in default mode. [τ-bench](https://arxiv.org/abs/2406.12045), [τ²-bench](https://ar5iv.labs.arxiv.org/html/2506.07982#S4.SS2.SSS0.Px4) | Put a hard action/turn budget around each model segment; require typed plan/proposal output; use deterministic stage transitions and validation after every effect. Start with one bounded search/compare stage, not a general loop. |
| **2** | **Shared-control and asynchronous coordination are a separate reliability problem, not merely “more exploration.”** When a user has to act, τ²-bench observes an 18% GPT-4.1 and 25% o4-mini drop from no-user to dual-control. D4’s business-side waits add another unmeasured participant and failure boundary. | [τ²-bench dual-control ablation](https://ar5iv.labs.arxiv.org/html/2506.07982#S4.SS2.SSS0.Px2), [Anthropic agent guidance](https://www.anthropic.com/engineering/building-effective-agents) | Treat every business inquiry as a durable, explicit state machine (`prepared → sent → awaiting → reminder/expiry → resolved/escalated`); do not let the model own waiting, retries, or notification policy. Pilot one async inquiry type with a strict SLA and manual fallback. |
| **3** | **Outbound inquiry content is an indirect-prompt-injection and authority-confusion channel.** External business replies are untrusted data that can attempt to induce a send, disclose data, or alter the plan. “Approve only effects” is too late if the model drafts or routes a sensitive message based on hostile content. | LLMail-Inject simulates malicious emails triggering unauthorized email-assistant tool calls (208,095 submissions, 839 participants); InjecAgent finds ReAct GPT-4 vulnerable 24% of the time, nearly doubling under a stronger attacker prompt. [LLMail-Inject](https://arxiv.org/abs/2506.09956), [InjecAgent](https://arxiv.org/abs/2403.02691), [OpenAI instruction hierarchy](https://arxiv.org/abs/2404.13208) | Separate untrusted business text from instructions; never permit a reply or disclosure to be selected solely from retrieved content; require deterministic recipient/data/purpose policy checks and explicit user confirmation for every outbound message in v1. Begin with read-only business discovery or pre-approved templates. |
| **4** | **Latency and cost grow with every model/tool round trip.** A builder’s production case study reports an agentic retrieval path taking a 2-second query to 10–15 seconds and then replacing many calls with one cached-context call; Anthropic explicitly says agents trade latency/cost for task performance. | [ZTRON builder case study](https://www.decodingai.com/p/building-vertical-ai-agents-case-study-1), [Anthropic](https://www.anthropic.com/engineering/building-effective-agents), [τ-bench cost](https://arxiv.org/abs/2406.12045) | Set a latency/cost ceiling per request; use one-shot or fixed-stage calls for routine tasks, retrieval batching/caching, and a small model for classification/extraction. Show “researching” only when it is bounded and measurable. |
| **5** | **Late contact capture and act-first defaults have conflicting direct evidence for this funnel and can strand a user before an async effect.** Typeform reports conversational-form completion above an industry average, while a randomized online study found materially lower dropout and email nonresponse when personal information was requested early. Conversational UX studies also disagree on preference versus speed/usability. [Typeform](https://www.typeform.com/blog/how-to-complete-the-customer-picture), [Frick et al.](https://www.uni-konstanz.de/iscience/reips/pubs/papers/chapters/2001FrickBaechtigerReips.pdf), [Soni et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC9606606/), [Iftikhar et al.](https://pmc.ncbi.nlm.nih.gov/articles/PMC8190652/) | Capture a verified contact at the first point where work cannot finish in-session, before sending the inquiry; explain why it is needed and offer a visible “continue without contact” path only when no follow-up is required. Run a holdout test of upfront vs late capture; do not make D5 a permanent assumption. |

These risks are ranked by the likelihood that they invalidate the proposed default and by the cost of discovering the failure after external effects have begun. The benchmark numbers are not AE forecasts: most use synthetic or constrained environments, and each caveat is recorded below.

## Findings and implications

### F1 — τ-bench: repeated tool use is materially inconsistent

**Finding.** The τ-bench authors evaluate customer-service agents against end-state database goals and introduce `pass^k` for repeated-trial reliability. GPT-4o function-calling agents succeed on fewer than half of tasks; retail reliability falls below 25% at `pass^8`. The paper reports GPT-4o `pass^1` of 61.2% in retail and 35.2% in airline, and identifies wrong arguments, wrong information, partial resolution, and wrong decisions among analyzed failures. Removing the policy guidance drops GPT-4o airline performance from 33.2% to 10.8%. The reported simulation cost is $0.38 for the agent plus $0.23 for the user simulator per task. [τ-bench paper](https://arxiv.org/abs/2406.12045)

**Threatened decisions / Implications for AE.**

- **D1 — CONTRADICTS.** A free model loop should not be treated as a reliable replacement for predefined routing when a task requires several dependent actions; single-run success overstates reliability.
- **D2 — CONTRADICTS.** A safety kernel that checks authority and effects but leaves action selection to the model does not address wrong arguments, wrong information, or policy drift. Deterministic preconditions must own more than the final commit.
- **D4 — REFINES.** Async plans need repeatable state transitions and an idempotent resume path; a failed or duplicated chase cannot be “reasoned through” ad hoc.
- **D6 — REFINES.** Act-first is acceptable only for reversible, low-risk exploration with a strict budget; asking a targeted question is cheaper than several speculative tool calls when identity, constraints, or intent are missing.

**Cheapest mitigation / scope cut.** Keep the model for candidate generation and comparison, but enforce typed outputs, action budgets, deterministic validation, and a fallback route for low-confidence or repeated failure. Do not expose arbitrary writes or outbound messages in the first general loop.

**Caveat.** τ-bench uses simulated users and service domains; its objective state may miss policy/reputation failures, and the official repository warns that legacy tasks are outdated. [Official repository caveat](https://github.com/sierra-research/tau-bench)

### F2 — τ²-bench: user participation causes a measurable additional drop

**Finding.** τ²-bench adds a dual-control telecom environment where the agent and user both act on shared state. GPT-4.1 `pass^1` is 74% retail, 56% airline, and 34% telecom. In the telecom ablation, moving from no-user to default dual-control causes an 18 percentage-point drop for GPT-4.1 and a 25-point drop for o4-mini. Performance decreases as action count rises and is close to zero above seven actions in default mode. A workflow-style policy slightly improves default/no-user performance, while an oracle plan performs better than default, separating reasoning load from user coordination. [τ²-bench paper](https://ar5iv.labs.arxiv.org/html/2506.07982#S4.SS2)

**Threatened decisions / Implications for AE.**

- **D1 — CONTRADICTS.** The loop is not one problem; it combines planning, communication, and execution. A single “understand → investigate → act” controller hides separate failure modes.
- **D2 — REFINES.** Deterministic stages should own known procedures and shared-state transitions; model reasoning should fill bounded gaps rather than choose every next action.
- **D3 — CONTRADICTS.** “The person approves only effects” does not capture the coordination burden of having the person perform or confirm intermediate actions. The evidence favors explicit user-state checkpoints when the human controls part of the environment.
- **D4 — CONTRADICTS.** A business inquiry is a second external participant, analogous to an active user but less predictable. Treating it as just another tool call understates the coordination and waiting problem.
- **D6 — REFINES.** Act-first is safe only when the agent has all required state. When a user or business must provide state, ask early enough to avoid a long speculative path.

**Cheapest mitigation / scope cut.** Define a small async protocol with deterministic checkpoints and user-visible state. Limit v1 to one inquiry per plan, one reminder, and an explicit expiry/escalation outcome. Do not promise arbitrary multi-party plans.

**Caveat.** The user is an LLM simulator constrained by tools and prompts; τ²-bench reports simulator error rates (47% airline, 40% retail, 16% telecom), so exact absolute scores do not transfer to AE. The directional dual-control and action-horizon findings are still directly relevant. [Repository/version caveat](https://github.com/sierra-research/tau2-bench)

### F3 — Agentless: an explicit staged pipeline can beat agentic systems at lower cost

**Finding.** Agentless asks whether complex autonomous agents are necessary and uses a three-phase localization → repair → patch-validation process without letting the LLM decide future actions or operate complex tools. On SWE-bench Lite it reports 96/300 fixes (32%) at $0.70, the highest among compared open-source agents at the time. Generated reproduction tests improve patch selection over majority vote and regression tests. [Agentless paper](https://arxiv.org/abs/2407.01489), [official implementation](https://github.com/OpenAutoCoder/Agentless)

**Threatened decisions / Implications for AE.**

- **D1 — CONTRADICTS.** This is direct evidence that a bounded, interpretable pipeline can outperform a more autonomous setup on a difficult real-world task family; model-driven next-action choice is not automatically an advantage.
- **D2 — CONTRADICTS.** The kernel should not merely police a model-owned plan. It can own decomposition, validation, and candidate selection wherever the task grammar is known.
- **D4 — REFINES.** Async inquiry work should be represented as explicit stages and validations, with model calls only where text interpretation is genuinely needed.
- **D6 — REFINES.** “Act first” should mean execute a known safe stage, not permit unconstrained exploration.

**Cheapest mitigation / scope cut.** Preserve the agent engine as a thin proposal layer over a deterministic action graph: model proposes candidates; code validates and executes; a bounded evaluator selects among results. Start with one domain whose task stages are known.

**Caveat.** Agentless is GPT-4o-only and SWE-bench-Lite-specific; generated tests are imperfect and the benchmark contains insufficient/misleading issue descriptions. It is evidence against complexity as a default, not proof that all AE tasks should be pipelines.

### F4 — SWE-bench and SWE-agent: context, search, and history do not improve monotonically

**Finding.** Original SWE-bench contains 2,294 real GitHub issues. Claude 2 resolves only 1.96% in the original evaluation. The SWE-bench paper reports that longer/oracle context does not make success reliable. SWE-agent’s interface ablations show non-monotonic results: iterative search 12% versus 15.7% without search (summarized search 18%); full-file viewer 12.7% versus 18% with a 100-line viewer; full history 15% versus 18% with the last five observations. Its GPT-4 Turbo run reports 18% on SWE-bench Lite at $1.67/issue, versus a RAG baseline 2.67% at $0.13. [SWE-bench](https://arxiv.org/abs/2310.06770), [SWE-agent](https://arxiv.org/abs/2405.15793), [SWE-agent repository](https://github.com/SWE-agent/SWE-agent)

**Threatened decisions / Implications for AE.**

- **D1 — CONTRADICTS.** More model-directed investigation and more trajectory memory can hurt rather than help; “investigate until satisfied” is not a reliability strategy.
- **D2 — CONTRADICTS.** A safety kernel needs context/tool budgets and deterministic compaction, not only identity/effect checks.
- **D4 — REFINES.** Long async threads need bounded summaries and explicit state, not replay of the whole conversation to the model.
- **D6 — CONTRADICTS.** Strong defaults that trigger ever-more search can create distraction and cost without increasing completion.

**Cheapest mitigation / scope cut.** Give the model the smallest task-specific tool set and context slice; summarize/compact deterministically; stop after a fixed number of investigations; require a structured “enough evidence” output.

**Caveat.** SWE-agent results are on a 300-task Lite subset with tuned settings and a per-instance budget; SWE-bench original is Python-only and one historical evaluation. Current repositories distinguish newer Verified/mini systems from these historical numbers.

### F5 — WebArena: realistic web state exposes stopping and execution failures

**Finding.** WebArena provides functional sites across e-commerce, forums, collaborative development, and content management. Its best GPT-4 agent achieves 14.41% end-to-end task success versus 78.24% for humans. The benchmark reports only 4 of 61 task templates reaching 100% for GPT-4 and no template doing so for GPT-3.5. An “unachievable-task hint” caused GPT-4 to falsely label 54.9% of feasible tasks impossible; removing the hint still yielded only 14.41%. [WebArena paper](https://arxiv.org/abs/2307.13854), [canonical repository](https://github.com/web-arena-x/webarena)

**Threatened decisions / Implications for AE.**

- **D1 — CONTRADICTS.** Realistic, stateful environments make “complete the job loop” materially harder than producing a plausible answer.
- **D2 — REFINES.** The kernel must verify state transitions and task completion independently; model confidence is not completion evidence.
- **D3 — REFINES.** Human approval of effects is insufficient if the model can misread current state or incorrectly stop; the user needs a legible evidence trail.
- **D4 — CONTRADICTS.** Async business interactions are at least as stateful as WebArena tasks but have less deterministic feedback and weaker observability.
- **D6 — CONTRADICTS.** Acting first can create false starts and premature “cannot do this” outcomes; ask when the missing state is outcome-critical.

**Cheapest mitigation / scope cut.** Make every action return machine-verifiable state/evidence; prohibit completion until deterministic postconditions pass. Fall back to a human when state cannot be verified.

**Caveat.** WebArena’s baseline predates newer agent scaffolds and has annotation/version caveats; human performance is not perfect. It remains useful because it tests end-to-end state, not just text quality.

### F6 — GAIA: automatic tool choice can be slower and worse than simpler baselines

**Finding.** GAIA asks real-world questions requiring reasoning, browsing, multimodality, and tool use. The original paper reports humans at 92% versus GPT-4 with plugins at 15%. Exact level scores show GPT-4 9.1/2.6/0, GPT-4 Turbo 13.0/5.5/0, and AutoGPT-4 14.4/0.4/0 for levels 1/2/3; manually selected plugins reach 30.3/9.7/0. AutoGPT is slower (7.6/11.7 minutes) and worse than GPT-4 alone on level 2. [GAIA paper](https://arxiv.org/abs/2311.12983), [dataset card](https://huggingface.co/datasets/gaia-benchmark/GAIA), [leaderboard](https://huggingface.co/spaces/gaia-benchmark/leaderboard)

**Threatened decisions / Implications for AE.**

- **D1 — CONTRADICTS.** The agent loop’s exploration and automatic tool selection are not intrinsically better than a simpler or manually constrained tool path.
- **D2 — CONTRADICTS.** Tool selection belongs partly in deterministic routing/eligibility when the tool set is large or costly; the model should not discover authority by trial.
- **D3 — REFINES.** Approval of an effect cannot correct a wrong or unnecessarily expensive exploration path after the fact.
- **D6 — CONTRADICTS.** “Act first” can be slower and less accurate than asking one disambiguating question or selecting a bounded route.

**Cheapest mitigation / scope cut.** Use deterministic candidate filtering and tool eligibility before the model sees tools. Expose only 3–5 distinct tools for a task; require a reason/evidence field for each selected action.

**Caveat.** GAIA’s plugin selection was manual/oracle, AutoGPT was one historical revision, final answers—not traces—were graded, and web evidence can decay. The result is a warning about automatic tool use, not a current model leaderboard.

### F7 — Official guidance says not to default to agents

**Finding.** Anthropic defines workflows as predefined code paths and agents as model-directed processes. It explicitly recommends finding the simplest solution, possibly not building an agent at all; workflows provide predictability/consistency for well-defined tasks, while agents trade latency and cost for flexibility. It recommends adding complexity only when it demonstrably improves outcomes, and warns that autonomy brings higher costs and compounding errors. [Anthropic, “Building effective agents”](https://www.anthropic.com/engineering/building-effective-agents)

OpenAI’s practical guide says agents fit workflows with nuanced judgment, extensive rules, natural-language interpretation, or conversational interaction; otherwise a deterministic solution may suffice. It says to start incrementally, split tools/agents when tool selection fails, and notes that some implementations handle 15 distinct tools while others struggle with fewer than 10 overlapping tools. It recommends risk-rating tools and human oversight for sensitive, irreversible, or high-stakes actions. [OpenAI, *A practical guide to building agents*](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)

**Threatened decisions / Implications for AE.**

- **D1 — CONTRADICTS.** Replacing routing/workflows wholesale is opposite to both vendors’ “simplest solution first” guidance.
- **D2 — REFINES.** The deterministic layer should retain routing wherever categories and policies are known; model control is justified only in genuinely open-ended segments.
- **D3 — REFINES.** Human approval should be triggered by risk, reversibility, and financial impact, not only by the final effect classification.
- **D4 — REFINES.** Async orchestration is a workflow concern even when the inquiry text is model-generated.
- **D6 — REFINES.** Strong defaults are useful only after risk rating and evals show that the action path is safe.

**Cheapest mitigation / scope cut.** Adopt a “workflow first, agent by exception” policy: every new agentic segment must beat a deterministic baseline on success, latency, cost, and escalation rate before becoming default.

### F8 — Production builder evidence: agentic loops can be too slow and unstable

**Finding.** ZTRON’s founding AI engineer describes a production pilot where agentic RAG made the app slow and unstable; a simple query that should take two seconds took 10–15 seconds because of repeated LLM/vector-database round trips. They reduced multiple tool calls and LLM round trips to one by loading bounded context and caching, making the path faster, cheaper, and more deterministic, while retaining RAG only for open-ended questions. [ZTRON builder case study](https://www.decodingai.com/p/building-vertical-ai-agents-case-study-1)

OpenAI’s engineering report on Codex says complex fixes involve dozens of back-and-forth Responses API requests and can take minutes. It identifies repeated full-history processing and API/tool-context overhead as structural costs; WebSocket connection-scoped caching made agentic workflows up to 40% faster end to end. [OpenAI Engineering, “Speeding up agentic workflows with WebSockets”](https://openai.com/index/speeding-up-agentic-workflows-with-websockets/)

**Threatened decisions / Implications for AE.**

- **D1 — CONTRADICTS.** A production builder explicitly reduced rather than expanded agentic loops for many specialized tasks.
- **D2 — REFINES.** The safety kernel needs an operational budget (latency, token spend, retries) and deterministic context management, not only authority checks.
- **D4 — CONTRADICTS.** A loop that already takes 10–15 seconds before a business wait will make “async chase/notify” feel like delay rather than value.
- **D6 — REFINES.** Act-first should be measured against a one-shot baseline; extra reasoning is not free UX.

**Cheapest mitigation / scope cut.** Establish a latency/cost budget and a one-call baseline. Use cached, bounded context for known domains; reserve loops for open-ended search where the extra calls improve measured completion.

**Caveat.** This is a builder self-report from a roughly 100-user pilot, not a controlled comparative study. It is valuable operational evidence but should not be generalized into a universal rollback claim.

### F8b — Production survey reports widespread post-deployment rollback

**Finding.** Sinch reports an independent survey of 2,527 senior decision-makers across 10 countries and six industries: 62% said AI customer-communications agents were live in production, while 74% said their organization had rolled back or shut down a deployed agent after a governance failure; the reported rollback rate was 81% among organizations with mature guardrails. Sinch says the study was conducted in January–February 2026 with an independent research institute and third-party panel. [Sinch, *The AI Production Paradox*](https://sinch.com/news/sinch-releases-ai-production-paradox/)

**Threatened decisions / Implications for AE.**

- **D1 — CONTRADICTS.** Production deployment and a model loop are not evidence of durable success; rollback is a plausible default outcome when reliability and governance fail.
- **D2 — REFINES.** Safety infrastructure is not merely a launch checklist. AE needs observability, rollback/stop controls, and deterministic recovery before widening model authority.
- **D3 — REFINES.** Mature guardrails may reveal more failures rather than prevent them; approval boundaries need outcome metrics and post-deployment review.
- **D4 — CONTRADICTS.** A communications product that depends on many external exchanges inherits provider/infrastructure failures that can force shutdown even when the model is capable.

**Cheapest mitigation / scope cut.** Ship one narrow, reversible inquiry path with a kill switch, complete event trace, and manual takeover. Treat rollback rate, unresolved/expired inquiries, and unsafe-send attempts as launch-blocking metrics.

**Caveat.** This is a vendor-sponsored press release and survey, not a controlled causal study; “rollback or shut down” is self-reported and “governance failure” is survey-defined. It is directional production evidence, not an estimate of AE’s failure rate.

### F9 — Tool selection and untrusted content create a concrete outbound-email attack

**Finding.** LLMail-Inject simulates an LLM email assistant that retrieves attacker-controlled emails and attempts to trigger unauthorized tool calls. The challenge produced 208,095 unique submissions from 839 participants across models, retrieval setups, and defenses. [LLMail-Inject](https://arxiv.org/abs/2506.09956)

InjecAgent evaluates 1,054 indirect-prompt-injection cases across 17 user tools and 62 attacker tools, including email-style exfiltration. ReAct-prompted GPT-4 is vulnerable 24% of the time, and a stronger attacker prompt nearly doubles attack success. [InjecAgent](https://arxiv.org/abs/2403.02691)

OpenAI’s instruction-hierarchy paper explains the root cause: models often treat system instructions as having the same priority as untrusted third-party content. It proposes treating third-party/tool content as lower-privilege and training models to ignore conflicting lower-privilege instructions. [OpenAI instruction hierarchy](https://arxiv.org/abs/2404.13208)

AgentDojo tests stateful agents over untrusted data with 97 realistic tasks, 629 security cases, and 70 tools. Agents solve fewer than 66% of benign tasks; the best attacks succeed in under 25% overall, but the Slack suite reaches 92% attack success. A simple tool filter lowers attack success to 7.5%, yet fails when the tool list cannot be planned in advance or when required tools also enable the attack (17% of cases). Injections near the end of tool output reach up to 70% success against GPT-4o. [AgentDojo](https://arxiv.org/html/2406.13352)

OpenAI’s current safety guidance says to limit an agent to only the data it needs, confirm consequential actions such as sending an email or completing a purchase, and avoid broad instructions such as “review my emails and take whatever action is needed,” because hidden malicious content can mislead the model. [OpenAI, “Understanding prompt injections”](https://openai.com/safety/prompt-injections/)

**Threatened decisions / Implications for AE.**

- **D2 — CONTRADICTS.** Model-owned action selection is unsafe when tool output can contain instructions; deterministic trust boundaries must be enforced before the model can select a write.
- **D3 — CONTRADICTS.** “Approve only effects” is too narrow if a model can compose recipient, content, or sensitive data from hostile business text. The user must approve disclosure/send semantics, not merely a generic effect.
- **D4 — CONTRADICTS.** A business inquiry creates exactly the untrusted external-content channel used in the attack setup.
- **D5 — REFINES.** Contact capture must include data-purpose and recipient disclosure; delaying identity collection does not reduce injection risk and can make attribution/audit harder.
- **D6 — CONTRADICTS.** Acting first on external content is unsafe; ask/confirm before outbound sends and sensitive disclosure.

### F10 — Late contact capture has conflicting direct evidence

**Finding.** Typeform reports a 47.3% completion rate for its forms versus a 21.5% industry average in 2023, while describing its forms as conversational. This is a large directional signal that a low-friction conversational capture experience can work, but it is vendor-reported, not a randomized test of early versus late contact capture. [Typeform](https://www.typeform.com/blog/how-to-complete-the-customer-picture)

A randomized Web-experiment study of 789 completers found the opposite of the D5 intuition: requesting personal information at the beginning reduced dropout to 10.3% versus 17.5% when requested at the end; email nonresponse was 9.5% when requested early versus 20.5% when requested late. The authors’ online-study setting is not an AE marketplace, but it is direct evidence that postponing contact can reduce completion and data capture. [Frick, Bächtiger & Reips, “Financial Incentives, Personal Information, and Drop Out in Online Studies”](https://www.uni-konstanz.de/iscience/reips/pubs/papers/chapters/2001FrickBaechtigerReips.pdf)

Baymard’s first-party checkout research reports that 26% of users have abandoned because a checkout was too long/complex and recommends reducing form friction. It also documents email as an early gateway in some guest-checkout patterns. That supports minimizing unnecessary upfront fields; it does not show that contact should be delayed until after an external side effect. [Baymard checkout research](https://baymard.com/research/checkout-usability), [Baymard guest checkout](https://baymard.com/blog/make-guest-checkout-prominent)

Intercom charges for one outcome per conversation and counts a resolution when no further help is requested after the last AI answer. Its outcome model also documents cases where a clarification is asked and the user does not reply; absence of a follow-up request is not equivalent to verified task success or consent to future contact. [Intercom outcome definition](https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes)

**Threatened decisions / Implications for AE.**

- **D4 — REFINES.** The product can be conversational and low-friction without postponing the identity needed for durable async work.
- **D5 — CONTRADICTS (as a universal rule); REFINES as a testable hypothesis.** The Frick study found lower dropout and email nonresponse when personal information was requested early, while Typeform and some chatbot studies support low-friction conversational capture. Late capture should be an AE experiment, not an axiom.
- **D6 — REFINES.** Ask late when the task can complete synchronously; ask at the first durable handoff when follow-up is unavoidable.

**Cheapest mitigation / scope cut.** Make contact capture a deterministic gate immediately before the first async effect, with a clear reason, expected cadence, and edit/withdraw controls. Instrument started inquiry → contact supplied → reply received → resolution, and run an A/B holdout against upfront capture before locking D5.
**Evidence boundary.** The literature found here supports reducing unnecessary form friction, not a blanket “never ask contact up front” rule. Any claim that late contact universally improves conversion is **[INFERENCE]** unless AE runs its own experiment.

### F11 — Human oversight belongs at high-risk boundaries, not only after planning

**Finding.** OpenAI recommends human intervention when failure thresholds are exceeded and for high-risk actions such as canceling orders, large refunds, and payments. It says tools should be risk-rated by write access, reversibility, permissions, and financial impact. Anthropic recommends extensive sandbox testing and guardrails because agents have compounding errors and should operate autonomously only in trusted environments. [OpenAI guide](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf), [Anthropic](https://www.anthropic.com/engineering/building-effective-agents)

**Threatened decisions / Implications for AE.**

- **D2 — REFINES.** Identity, authority, spend, idempotency, and evidence are necessary but must be enforced before proposal and before commit; do not rely on an approval dialog to repair an unsafe plan.
- **D3 — CONTRADICTS (as stated).** Sensitive disclosure and outbound business communication should be treated as high-risk effects, not as free exploration merely because they are not payments.
- **D4 — REFINES.** Async work needs explicit stop/escalate conditions and a human fallback when an inquiry exceeds retry/SLA limits.
- **D6 — REFINES.** “Minimal questions” must include risk-based confirmations even when the model believes it is unblocked.

**Cheapest mitigation / scope cut.** Add a deterministic risk tier to each registered action: read, reversible write, outbound communication/disclosure, irreversible/financial. Require confirmation or human review for the last two tiers and cap retries for all tiers.

### F12 — Conversational UX is preference-positive in some studies but can be slower or less usable

**Finding.** In a counterbalanced within-subject health-data experiment, 206 analyzed participants preferred a chatbot over an online form 69.9% of the time; chatbot NPS was 24 versus 13, but the chatbot took longer to complete and its SUS advantage (69.7 versus 67.7) was not statistically significant. [Soni et al., “Virtual conversational agents versus online forms”](https://pmc.ncbi.nlm.nih.gov/articles/PMC9606606/)

A separate counterbalanced usability study (20 participants completing each of three forms) found the opposite usability result: a single-page form scored SUS 76 versus 57 for the conversational form, had the shortest completion time, and was preferred. [Iftikhar et al., “Comparing Single-Page, Multipage, and Conversational Digital Forms”](https://pmc.ncbi.nlm.nih.gov/articles/PMC8190652/)

**Threatened decisions / Implications for AE.**

- **D4 — REFINES.** Conversational interaction can be valuable, but “conversation” is not automatically the lowest-friction or fastest route for data capture and execution.
- **D5 — REFINES.** A compact form may collect contact and constraints more reliably than a late conversational prompt; preserve a visible form fallback.
- **D6 — CONTRADICTS as a universal rule.** Act-first minimal questions may create a long, slow interaction when a user would rather see and complete the required fields.

**Cheapest mitigation / scope cut.** Keep conversation as the default discovery surface, but offer a structured “give me the fields” mode and measure completion time, abandonment, contact capture, and downstream resolution—not preference alone.

**Caveat.** Both studies are health-data tasks with small or specialized samples and do not measure AE marketplace outcomes. They establish heterogeneity, not a universal winner.

### F13 — Large registries need causal/minimal tool exposure, not just semantic retrieval

**Finding.** ToolRet evaluates retrieval over 43,000 heterogeneous tools and 7,600 tasks; the abstract reports poor retrieval quality even for strong conventional IR models and degraded downstream tool-use pass rates. Its detailed results report all retrievers below 35% Completeness@10 and 52% Recall@10; GPT-3.5’s pass rate is 50.60 with retrieved tools versus 62.00 with oracle tools. [ToolRet](https://arxiv.org/abs/2503.01763)

ToolChoiceConfusion evaluates 102 tasks with 100 tools. All-tools exposure reaches 0.83 success at 24,569 tokens/task, while causal-minimal filtering reaches 0.99 success at 2,405 tokens/task with one visible tool/step. The authors explicitly caution that their synthetic benchmark omits real API failures, permissions, latency, and open-ended discovery. [ToolChoiceConfusion](https://arxiv.org/html/2606.06284v1#S7.T4)

**Threatened decisions / Implications for AE.**

- **D1 — CONTRADICTS.** A model cannot safely “own action selection” over a growing registry when retrieval itself omits or misranks tools.
- **D2 — CONTRADICTS the narrow version; SUPPORTS a stronger version.** The registered-action seam should deterministically filter by preconditions, risk, authority, and current state before the model sees tools.
- **D3 — REFINES.** User approval cannot fix an omitted or wrong tool path; approvals need a compact, auditable candidate set.
- **D4 — REFINES.** Async inquiries should expose only the current state’s next action, not every possible send/remind/escalate action at once.
- **D6 — REFINES.** Ask when the state contract is insufficient instead of exposing more tools and hoping exploration discovers the missing prerequisite.

**Cheapest mitigation / scope cut.** Add precondition/effect/risk contracts to registered actions and expose the minimal next-step frontier. Use semantic retrieval only to shortlist candidates; never use it as authority or eligibility.

**Caveat.** ToolRet aggregates heterogeneous datasets and tests retrieval once rather than interleaving retrieval and execution. ToolChoiceConfusion is synthetic and does not measure real provider failures. The evidence supports deterministic exposure controls, not a claim that one tool should always be visible.

## What the evidence supports, contradicts, and leaves open

| Decision | Overall read | Why |
|---|---|---|
| **D1** model loop replaces routing | **CONTRADICTS as a default; REFINES as an exception.** | τ-bench, τ²-bench, WebArena, GAIA, and Agentless all show that open-ended action selection is fragile, horizon-sensitive, or unnecessarily expensive. Anthropic explicitly says to start with the simplest solution. Keep model loops only where required steps cannot be predicted and a deterministic baseline is worse. |
| **D2** deterministic router becomes safety kernel | **CONTRADICTS the narrow version; SUPPORTS a stronger version.** | Deterministic identity/effect checks are necessary but insufficient. The kernel should also own eligibility, stage transitions, context/tool budgets, postconditions, idempotency, waits, retries, and recovery. The model proposes within these bounds. |
| **D3** free exploration; approval only effects | **CONTRADICTS.** | User/shared-control coordination drops performance; external content can steer tool calls; disclosure/recipient selection is itself consequential. Approval must cover high-risk communication and sensitive data, not only money/commitment. |
| **D4** instant + async in one plan; chase is product | **REFINES, not disproved.** | The sources establish that multi-party coordination and long horizons are hard, not that asynchronous supply has no value. Start with one durable inquiry type, visible state, bounded reminders, verified response attribution, and an escalation path. |
| **D5** capture contact at first async effect | **CONTRADICTS as a universal rule; REFINES as a testable hypothesis.** | Typeform and some chatbot studies support low-friction conversational capture, but the randomized online study found early personal-information requests reduced dropout and email nonresponse versus late requests. Capture at the first durable handoff only as a measured compromise, then compare against an upfront transparent request. |
| **D6** act first; ask only when blocked | **REFINES.** | Strong defaults help for reversible, low-risk actions. But dual control, missing state, high-risk disclosures, and hostile external content justify proactive confirmation. Ask one precise question before speculative loops or durable side effects. |

## Cheapest cut that preserves the product goal

1. **Keep `/` as the conversation and action-discovery surface, not as an unconstrained executor.** A model may interpret the request and propose a bounded plan.
2. **Keep the registered-action registry, but make action descriptors carry risk tier, required identity/authority, input provenance, idempotency key, postcondition, and timeout/SLA.** The model sees only eligible actions for the current stage.
3. **Implement a deterministic state machine around every async inquiry.** Minimum states: `draft → user-confirmed → sent → awaiting → reminder_due → resolved/expired/escalated`. Convex can persist these states; no queue infrastructure is assumed here.
4. **Make outbound business contact template-based and data-minimized in v1.** Business replies are untrusted evidence, never instructions. A user confirms recipient, content, and disclosed fields before send.
5. **Cap loops.** Use a small action/turn/token budget, stop on missing required state, and return an explicit “blocked: need X” question. Never silently keep chasing.
6. **Validate completion deterministically.** Require a machine-verifiable postcondition and evidence artifact; model confidence alone cannot close a job.
7. **Run a baseline gate before expanding autonomy.** For each task family compare bounded model proposal versus deterministic route on task success, cost, p95 latency, retries, escalation, and user/business response rates.

## Skip list: patterns that do not transfer cleanly

- **Benchmark absolute scores as AE forecasts.** τ-bench, τ²-bench, WebArena, GAIA, and SWE-bench use synthetic, constrained, historical, or domain-specific tasks. Transfer the failure mode (horizon, coordination, state verification), not the exact percentage.
- **Software-engineering architecture as a marketplace architecture.** Agentless and SWE-agent show pipeline/loop tradeoffs under code/test feedback. AE’s external businesses can be delayed, adversarial, unavailable, or ambiguous; code tests are much stronger feedback than an email reply.
- **GAIA’s manually selected plugins as automatic discovery.** Its plugin result is an oracle-like comparison and cannot justify exposing a large registry to a model.
- **WebArena human score as a product conversion target.** Human task success there is a benchmark reference, not an AE willingness-to-wait or trust metric.
- **Typeform’s conversational-form completion rate as proof for D5.** It is vendor-reported, compared with an industry average, and does not isolate contact timing or async commitment.
- **Intercom “no further help requested” as verified resolution.** A silent user may be satisfied, distracted, or abandoned. AE must record explicit business response and deterministic completion evidence separately.
- **ZTRON’s builder case study as a controlled rollback study.** It is a self-reported pilot. Use it to set a latency/cost hypothesis and run AE instrumentation, not to claim every agent should be removed.
- **Prompt-injection benchmark rates as AE’s exact attack probability.** LLMail-Inject and InjecAgent establish exploitability and attack surfaces, not a calibrated AE incidence rate. The correct transfer is architectural: external text is untrusted and must not authorize actions.
- **AgentDojo security rates as AE attack probabilities.** Its stateful benchmark establishes realistic exploitability and defense tradeoffs, but its apps, attacker capabilities, and tool set differ from AE. Transfer least-privilege and confirmation patterns, not exact ASR.
- **Health-data conversational-form studies as marketplace funnel forecasts.** Soni and Iftikhar use small/specialized health tasks; their disagreement is evidence against a universal UX winner, not a conversion estimate for AE.
- **Frick et al. contact timing as proof of AE-optimal identity capture.** The 2001 online-study experiment directly challenges “ask later,” but study participation and AE’s durable business follow-up have different incentives and privacy expectations. Use it to justify an A/B test.
- **ToolRet/ToolChoiceConfusion as production tool-router benchmarks.** ToolRet aggregates heterogeneous datasets; ToolChoiceConfusion uses synthetic tools and mocked outputs. Use them to motivate contracts and exposure limits, then validate on AE’s registry and provider failures.
- **Vendor guidance as neutral evaluation.** Anthropic and OpenAI guidance is first-party and directly useful for design principles, but naturally reflects their platforms and customers. Confirm the recommended boundaries with AE’s own evals.

## Sources (named primary sources)

1. Shunyu Yao et al., **τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains** (2024). https://arxiv.org/abs/2406.12045; code/data caveats: https://github.com/sierra-research/tau-bench
2. Victor Barres et al., **τ²-Bench: Evaluating Conversational Agents in a Dual-Control Environment** (2025). https://arxiv.org/abs/2506.07982; readable full text: https://ar5iv.labs.arxiv.org/html/2506.07982; repository/version caveats: https://github.com/sierra-research/tau2-bench
3. Carlos E. Jimenez et al., **SWE-bench: Can Language Models Resolve Real-World GitHub Issues?** (2023). https://arxiv.org/abs/2310.06770; repository: https://github.com/swe-bench/SWE-bench
4. John Yang et al., **SWE-agent: Agent-Computer Interfaces Enable Automated Software Engineering** (2024). https://arxiv.org/abs/2405.15793; repository: https://github.com/SWE-agent/SWE-agent
5. Chunqiu Steven Xia et al., **Agentless: Demystifying LLM-based Software Engineering Agents** (2024). https://arxiv.org/abs/2407.01489; repository: https://github.com/OpenAutoCoder/Agentless
6. Shuyan Zhou et al., **WebArena: A Realistic Web Environment for Building Autonomous Agents** (2023). https://arxiv.org/abs/2307.13854; repository: https://github.com/web-arena-x/webarena
7. Grégoire Mialon et al., **GAIA: A benchmark for General AI Assistants** (2023). https://arxiv.org/abs/2311.12983; dataset: https://huggingface.co/datasets/gaia-benchmark/GAIA; leaderboard: https://huggingface.co/spaces/gaia-benchmark/leaderboard
8. Anthropic, **Building effective agents** (engineering guidance). https://www.anthropic.com/engineering/building-effective-agents
9. OpenAI, **A practical guide to building agents** (business guide). https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
10. Eric Wallace et al. (OpenAI), **The Instruction Hierarchy: Training LLMs to Prioritize Privileged Instructions** (2024). https://arxiv.org/abs/2404.13208
11. Sahar Abdelnabi et al. (Microsoft Research), **LLMail-Inject: A Dataset from a Realistic Adaptive Prompt Injection Challenge** (2025). https://arxiv.org/abs/2506.09956; challenge code: https://github.com/microsoft/llmail-inject-challenge
12. Qiusi Zhan et al., **InjecAgent: Benchmarking Indirect Prompt Injections in Tool-Integrated Large Language Model Agents** (2024). https://arxiv.org/abs/2403.02691
13. Paul Iusztin / ZTRON, **We Killed RAG, MCP, and Agentic Loops. Here’s What Happened.** (builder case study, 2025). https://www.decodingai.com/p/building-vertical-ai-agents-case-study-1
14. Sinch, **The AI Production Paradox** (survey press release, 2026). https://sinch.com/news/sinch-releases-ai-production-paradox/
15. Typeform, **The data dilemma: How to complete the customer picture** (first-party product data). https://www.typeform.com/blog/how-to-complete-the-customer-picture
16. Baymard Institute, **E-Commerce Cart & Checkout Usability Research**. https://baymard.com/research/checkout-usability; guest checkout study: https://baymard.com/blog/make-guest-checkout-prominent
17. Intercom, **Fin AI Agent outcomes** (first-party outcome definitions). https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes
18. Edoardo Debenedetti et al., **AgentDojo: A Dynamic Environment to Evaluate Prompt Injection Attacks and Defenses for LLM Agents** (2024). https://arxiv.org/html/2406.13352; repository: https://github.com/ethz-spylab/agentdojo
19. Brian Yu and Ashwin Nathan (OpenAI Engineering), **Speeding up agentic workflows with WebSockets in the Responses API** (2026). https://openai.com/index/speeding-up-agentic-workflows-with-websockets/
20. OpenAI, **Understanding prompt injections** (safety guidance). https://openai.com/safety/prompt-injections/
21. Zhengliang Shi et al., **Retrieval Models Aren’t Tool-Savvy: Benchmarking Tool Retrieval for Large Language Models** (2025). https://arxiv.org/abs/2503.01763
22. Rahul Suresh Babu and Laxmipriya Ganesh Iyer, **ToolChoiceConfusion: Causal Minimal Tool Filtering for Reliable LLM Agents** (2026). https://arxiv.org/html/2606.06284v1
23. Hiral Soni et al., **Virtual conversational agents versus online forms: Patient experience and preferences for health data collection** (2022). https://pmc.ncbi.nlm.nih.gov/articles/PMC9606606/
24. Aleeha Iftikhar et al., **Comparing Single-Page, Multipage, and Conversational Digital Forms in Health Care: Usability Study** (2021). https://pmc.ncbi.nlm.nih.gov/articles/PMC8190652/
25. Andrea Frick, Marie-Thérèse Bächtiger, and Ulf-Dietrich Reips, **Financial Incentives, Personal Information, and Drop Out in Online Studies** (2001). https://www.uni-konstanz.de/iscience/reips/pubs/papers/chapters/2001FrickBaechtigerReips.pdf

**Internal AE facts used for mapping (from the assignment, not independently verified here):** TanStack Start + Convex as source of truth; registered action registry as tool surface; answer threads/SSE as conversation spine; OpenRouter for LLM; Clerk keys/OAuth device flow for agent authority; T12 credit ledger; no Temporal/queue infrastructure today.
