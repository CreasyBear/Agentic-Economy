# Chat research-to-action trial

Date: 15 October 2026. Base: d9a9fd96f92a8c04b217629a453b3986a79b5c90.

## Outcome and boundary

Compare a minimally repaired current chat, Dify 1.17.1 and the lean LangGraph
alternative on research → evidence-backed answer → authorized action → delivery
and recovery. Browser and external-agent entry points must preserve the same
commercial meaning. This trial changes no production configuration or authority.

The minimum current-chat repair preserves exact Run selections during read-only
inspection and corrects the misleading approval-only spending label. Remaining
journey gaps are measured, not silently rebuilt to make the baseline pass.

## Contracts before implementation

**Exact selection.** Requires: a syntactically valid explicit Inspect or Run
request. Ensures: describe uses the exact selected reference or refuses before
lookup. Invariant: selection is an untrusted lookup hint, never spending
authority. On violation: selected_tool_mismatch, with zero lookup/dispatch I/O.

**Trial execution.** Requires: isolated local services, synthetic accounts and
declared fixture Tool contracts. Ensures: answer evidence is returned Tool data;
every simulated purchase has Quote, Call and idempotency identities. Invariant:
the runtime never bypasses the AE contract boundary, grants authority implicitly,
or converts uncertain delivery into a new purchase. On violation: fail the case;
retain the existing Call reference and report uncertainty.

**Recovery.** Model-only errors may be retried within the case's bound. A
dispatched purchase is inspected/reconciled by its existing identity. Sign-in,
funding and approval pauses must retain selected Tool, inputs and evidence.
Missing or expired authority is an expected refusal, not a payment outage.

## Design and complexity decisions

- Dify runs locally in a named temporary Docker project. The trial excludes its
  new beta Agent runtime; use maintained classic workflow/chatflow facilities.
- Trial dependencies live in an isolated experiment package, never the product
  dependency graph. No customer content or production Tool/payment credentials
  enter it. Bounded live inference retrieves the existing model-provider key
  into process memory from its owning deployment; inference has real provider cost.
- Use a shared fixture service at the external boundary. Real runtime execution
  proves orchestration; simulated providers/purchases do not prove production
  payments, natural-language quality or live delivery.
- Reuse current Agent, Tool schemas and test setup for the baseline. Add only
  the adapters needed by actual comparison callers. Record framework/version,
  state transitions, failures, latency and request counts separately from money.
- LangGraph is the bounded code-first alternative. A second full visual platform
  is unnecessary; Flowise's official repository is archived.

The extra experiment package and runtime adapters buy reproducible comparison
and fault injection without changing product architecture. Keep them off runtime
routes; remove task containers and temporary secrets after collecting results.

## Work and acceptance

1. Pin framework sources and create isolated local trial; verify service identity.
2. Add a failing regression for the observed reference substitution; implement
   the smallest repair and run affected tests plus `npm run check`.
3. Exercise actual Dify and alternative runtime execution against identical
   synthetic Tool inputs, outputs, authority states and injected failures.
4. Compare the current implementation through its actual chat Tool/stream
   boundary. Do not substitute a newly written ideal graph for the baseline.
5. Cover subject research, explicit selection, clarification, sign-in continuity,
   expired authority, funding return, successful delivery, pre-action model error,
   pending/uncertain Call and duplicate/reconnect behavior.
6. Get independent review of code and evidence, fix accepted findings, run
   repository checks, and present exact proposed production changes and limits.

No merge, deployment, production policy renewal or paid live Tool acceptance is
authorized until Joel reviews the concrete production packet.
