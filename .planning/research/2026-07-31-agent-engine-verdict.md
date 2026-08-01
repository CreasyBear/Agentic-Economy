# Agent engine — adjudicated verdict after OSS literature review

Date: 2026-07-31. Adjudicator: Main session, against five primary-source reviews:
`agent-engine-loops.md`, `agent-engine-durability.md`, `agent-engine-authority.md`,
`agent-engine-commerce.md`, `agent-engine-counterevidence.md` (same directory).

## Honest correction

The grilling session settled on "model-driven loop replaces the mechanical router"
(D1/D2). The evidence contradicts that as a **default**. Every first-party builder
source (Anthropic *Building Effective Agents*, OpenAI *Practical Guide*, smolagents
docs) says: simplest solution first, workflows for predictable tasks, agents only
where flexibility is genuinely required. Benchmarks agree: τ-bench GPT-4o pass^8
< 25% (retail); τ²-bench performance approaches zero beyond ~7 dependent actions;
Agentless (staged pipeline, no loop) beats loop agents on SWE-bench Lite at ~1/10
cost; GAIA shows AutoGPT-style automatic tool selection underperforming plain GPT-4.
"The router is mechanical" was a real UX finding; "therefore the model should own
the loop" was flattery, not diligence.

## Revised decisions

- **D1 (revised): bounded model segments inside deterministic stages.** `/` keeps
  the conversational spine. The model owns *understanding, plan proposal, candidate
  comparison, and explanation* as typed, budgeted proposal steps. Deterministic code
  owns stage transitions, validation, effect preparation, commit, wait/resume, and
  recovery. A task-shape gate routes predictable asks (exact search, quote on known
  offering, thread refinement) through deterministic paths without a model round trip
  — the just-shipped deterministic `narrowSuburb` branch is the correct pattern, not
  an embarrassment.
- **D2 (revised): the router is a policy-and-candidate kernel, not just a safety
  kernel.** It also owns: the candidate action menu per stage (tool-selection error
  grows with menu size; minimal frontier menus outperform 100-tool exposure), typed
  model outputs, action/turn budgets, stop conditions, and fallbacks on low
  confidence or repeated failure.
- **D3 (refined): approval seam = digest-bound preparation before provider dispatch.**
  Explore-freely stands, with two corrections: (1) disclosure is itself an effect —
  sending customer contact/details to a business requires the same preparation
  authority as payment; (2) after the agent reads untrusted business replies, it may
  not autonomously compose outbound messages (indirect prompt injection: AgentDojo
  ASR up to 92% on Slack suite; OpenAI explicitly names "sending an email" as the
  confirmation-worthy action). Our existing Customer Request authority modes
  (inspect_only / approve_each / bounded_mandate) match the recommended OSS seam
  almost exactly — the kernel we built survives intact; only route orchestration is
  being re-scoped.
- **D4 (conditional support): hybrid supply on Convex components; async inquiry is a
  durable state machine, never "the model keeps running."**
  `prepared → sent → awaiting → reminder/expiry → resolved/escalated`, owned by
  `@convex-dev/workflow` + `@convex-dev/agent` (verdict: build on Convex; do NOT
  adopt Temporal/Restate/Inngest/Trigger). Honest flag: **no reviewed OSS system has
  shipped the full demand-side async business loop** (discover arbitrary business →
  email/phone inquiry → interpret reply → survive pause → offer/hold/confirm with
  receipt). It is greenfield. Pilot ONE inquiry type with strict SLA before
  generalizing.
- **D5 (demoted to experiment): contact-at-first-async-effect is not doctrine.**
  Direct evidence conflicts (Frick 2001: early personal-info capture *reduced*
  dropout 10.3% vs 17.5%; Decipher/eBay: end-of-survey contact question spiked
  dropout; conversational funnels lose ~33% at greeting in one real telemetry set).
  Implement contact capture as an explicit typed blocker inside the first prepared
  disclosure (authority seam step 7) and A/B the timing.
- **D6 (refined): act-first within a budgeted, reversible exploration stage only.**
  Anthropic's own production data: Claude asks clarification >2× more on complex
  tasks; a targeted question is cheaper than speculative tool calls when intent or
  constraints are missing. Hard caps per segment; never bypass a required approval.

## Cost/latency ruling for the hero surface

Model-in-the-loop on `/` must run under a latency/cost ceiling: small model for
classification/extraction, one bounded search/compare segment, streamed progress,
deterministic fast path for predictable asks. Evidence: OpenAI latency guide ("don't
default to an LLM", fewer requests, parallelize), Codex loop overhead (~40% saved on
transport alone), ZTRON case (2s query → 10-15s after naive agentification).

## What builds next (unchanged product goal, corrected architecture)

1. Effect metadata on every registered action (observation / quote / disclosure /
   commitment / payment; reversibility; recipient kind).
2. Plan-proposal seam: model emits typed plan/next-action proposals; kernel
   validates, budgets, executes.
3. Durable inquiry state machine on Convex workflow components, one inquiry type
   first, reply ingestion quarantined from model authority.
4. Approval UX on the answer-thread SSE stream per the authority review's
   seven-step seam.
5. Contact-capture experiment at the first prepared disclosure.
