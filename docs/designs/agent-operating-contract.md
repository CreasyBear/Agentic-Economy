# Agent operating contract

**Status:** active design contract  
**Revised:** 2026-10-07 (source policy and local renderer trial; no new hosted acceptance)
**Product authority:** [`PRODUCT.md`](../../PRODUCT.md)  
**Benchmark inputs:** [Locus maturity map](../../research/LOCUS-AE-MATURITY.md), [Whop maturity map](../../research/WHOP-AE-MATURITY.md), and [platform priorities](../../research/AE-PLATFORM-MATURITY-PRIORITIES.md)

## Decision

Agentic Economy will be designed as one agent-legible market system, not as a
collection of catalogue, identity, payment, Call, and support features.
Every surface projects the same canonical lifecycle:

> capability gap → service request/comparison → Quote → Call → delivery or uncertainty → remedy if required → Purchase resolution → Outcome records → agent continues

Each transition has one durable owner, one stable reference, explicit
preconditions, explicit uncertainty, and a machine-executable next action. The
Tool remains the only unit of supply. The supporting artifacts below exist
only to preserve decision continuity and make the market controllable.

An Agent Principal is the durable technical identity acting for a Business
Principal. It may use replaceable credentials and a bounded spending policy, but a
credential does not own a balance, reset a budget, or become an economic
principal. AE does not acquire the agent's project, plan, prompt history,
memory, or orchestration.

## Cross-transport contract policy

This policy governs new work and review of HTTP, MCP, CLI, chat, UI and plugin
projections. It is a design requirement, not evidence that every existing
surface satisfies it. Current action schemas and dated release receipts
establish implementation; [MM-055](../operations/mercator-maturity-register.md#mm-055)
owns docs acceptance. The [accepted Plan Quotes RFC](2026-10-05-plan-quotes-rfc.md#13-accepted-decisions--2026-10-05)
owns buyer-side Plans; its Call, authority and recovery boundaries apply here.

| Concern | Required rule | Review evidence |
| --- | --- | --- |
| Naming | Use Tool, Quote, Call, Customer, Agent, Account and Spending policy consistently. Preserve opaque IDs, protocol fields and hashes exactly. Derive transport names from the action ID; do not invent business aliases in copy. | [Registry `mcpToolName`](../../src/modules/actions/index.ts), route contracts and published examples agree. |
| Identity | Resolve the signed caller, Account and durable Agent identity server-side. A credential, wallet or endpoint is neither a Customer nor a commercial role; rotation preserves budgets and prior Calls. | Owner-bound reads and credential rotation retain the same durable references. |
| Authority | Validate the current grant/scope, generation, budget and Quote binding before each consequential admission. Funds and successful authentication cannot expand permission. A refusal names the bounded remediation and required actor. | Missing/revoked authority and stale Quote cause no new effect; guides distinguish funding from approval. |
| Outcomes | Distinguish accepted work, delivery, payment, Purchase resolution and buyer-reported usefulness. Retain provenance and unknowns; transport success cannot manufacture completion. | Tagged action results and status show each applicable axis without a universal empty envelope. |
| Recovery | Keep the same material intent, idempotency key and durable refs across a timeout, process restart or transport switch. Changed intent conflicts. Possible effect leads to status/reconcile; cancel describes its actual scope. | Same-key cross-transport replay, changed-input conflict and uncertain-effect recovery; no duplicate paid start. |
| Output | Return bounded decision facts and literal output when ready; otherwise return the authorized durable read/next action and freshness. Preserve partial results, independent refund status and access/expiry rules. | Schema-valid examples include pending, partial, denied and expired reads without reexecution. |
| Version | Bind published instructions/examples to action contract versions and an identified release tuple. A breaking name/input/default/output change needs migration instructions and a stated supported-client range. | Generated drift checks and an installed-client receipt; a source build alone cannot prove compatibility. |

The schema owner is [the action definition and descriptor](../../src/modules/common/action.ts)
(`schema`, `outputSchema`, `describeActionForAgent`); [registered actions](../../src/modules/actions/index.ts)
select supported operations. [OpenAPI action generation](../../src/modules/discovery/internal/openapi-agent-routes.ts)
(`actionOperations`) and [Call examples](../../src/modules/discovery/internal/tool-contract.ts)
(`callRouteExamples`) project those contracts. Provider Tool schemas remain owned
by [capability contracts](../../src/modules/capability-contract/public.ts), not by
editorial documentation. Do not add a parallel operation registry or state ledger.

An HTTP `202` means accepted processing, not final delivery
([RFC 9110 §15.3.3](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.3.3)).
Publish a durable observation path and never normalize an uncompleted Provider
handle as output. HTTP refusals use [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html)
through [the existing problem owner](../../src/lib/server/problem.ts); adapters
retain its code, safe next action and available request/Call refs. CLI/MCP/chat
may project that information but cannot silently change retry or authority rules.
[Stripe idempotency](https://docs.stripe.com/api/idempotent_requests) is a useful
same-key/changed-parameters benchmark; AE retains its own durable Call identity
and cannot treat Stripe's key retention as AE's recovery lifetime.

[Supermemory's API v5 author post](https://x.com/DhravyaShah/status/2107552558961275145)
motivates explicit namespaces, consistent inputs/filter defaults, compact output,
Markdown and versioned migration. Migration success is author-reported, not
independently verified here. Its [primary v5 migration guide](https://supermemory.ai/docs/migration/api-v5.md)
was subsequently retrieved and inspected locally: explicit namespaces, matched
filter semantics/defaults and before/after migration examples are the relevant
design evidence. Its prose contains inconsistent SDK-default advice, so the
reference is a design comparison rather than proof of behavioural equivalence. [OpenRouter first use](https://openrouter.ai/docs/quickstart) and
[server tools](https://openrouter.ai/tools) remain usability benchmarks: measure
time, turns, bytes, cost and recovery to useful output through AE's supported
purchase journey. Neither benchmark establishes AE acceptance.

## The driver's-seat test

If I were the caller, I should be able to answer these questions without prose
interpretation, hidden dashboard state, or support intervention:

1. What does AE know, and what is unknown or stale?
2. Which Tools are actually executable by me now?
3. Why were these candidates included, excluded, and ordered?
4. What exact inputs, authority, money, data use, and effects will this call use?
5. Has anything changed since I inspected it?
6. Is the effect safe to retry, definitely completed, definitely absent, or
   genuinely uncertain?
7. What is the cheapest safe action that moves the state forward?
8. Can a fresh process continue using only durable references?
9. What did AE directly observe, what did the buyer report, and what did AE infer?
10. Did this interaction make the next allocation better without capturing the
    caller's private project context?

If the system cannot answer one of these questions, it must return `unknown` and
the exact way to resolve it. It must not manufacture confidence.

## Tower of linked abstractions

The tower deliberately has few layers. Each layer consumes references from the
layer below and adds one kind of meaning.

| Layer | Canonical artifact | Question it answers | Durable identity |
|---|---|---|---|
| 0 | Fact | What is known, by which source, as of when? | `factRef` or inline provenance |
| 1 | Tool version | What exact bounded contribution does one Provider offer? | `toolRef` + version |
| 2 | Service request | What missing contribution and hard constraints did the caller state? | `requestRef` |
| 3 | Service comparison | Which versions were considered, viable, excluded, and why? | `resolutionRef` |
| 4 | Quote | What exact viable choice did AE and the caller inspect before effect? | `quoteRef` + digest + expiry |
| 5 | Spending policy | Who may do what, for which customer, within what budget and time? | policy version |
| 6 | Call | What single command/effect identity is progressing? | `callRef` + idempotency identity |
| 7 | Result and continuation | What literal output or durable state can the caller consume next? | `resultRef` or `callRef` |
| 8 | Outcome evidence | What use, repeat, switch, failure, and economic facts accumulated? | `outcomeRef` + provenance |
| 9 | Projection | What does a buyer, Provider, or operator need to see or do now? | derived; never a second state owner |

### Layer 0 — Fact

A fact contains a value, source, observation time, freshness/expiry, and
provenance class. Missing is different from false. Provider-claimed,
AE-observed, buyer-reported, and AE-derived facts never collapse into one
unqualified score.

### Layer 1 — Tool version

A Tool version is an immutable callable contract: Provider, inputs,
outputs, price basis, material terms, effects, data use, access requirements,
readiness, evidence, and runtime route. Imported registry metadata is only a
candidate source fact until admission and publication create a revision.

### Layer 2 — Service request

A service request is a bounded description of the missing next contribution plus
hard constraints such as budget, deadline, geography, data policy, and effect
class. It contains only the context required to allocate supply. It is not a
task, conversation, workflow, tender, or Provider message.

### Layer 3 — Service comparison

A service comparison is an immutable snapshot of considered Tool versions,
caller-specific viability, exclusions, ranking evidence, and the policy version
used. Search results must say `executable_now`, `setup_required`, or
`unavailable`, with closed reason codes and exact remediation. Search must not
fan out to Providers; readiness is maintained by bounded background probes.

### Layer 4 — Quote

A Quote is the bridge between detail and effect. It binds the caller, owner
Account, authority generation, Tool version, normalized arguments, total price
or hard ceiling, material terms, data use, effects, readiness evidence, and
expiry. Call rejects any drift before reservation, Charge, secret read, or
Provider effect. A Quote is not a generic order.

### Layer 5 — Spending policy

A Business Principal issues a bounded spending policy for a durable Agent
Principal. It states Account, Tool scope, environment, per-Call and aggregate spend,
rate/concurrency bounds, effect classes, approval requirements, validity, and
generation. Aggregate limits follow the Agent Principal across credential
rotation. The first platform milestone supports direct one-hop delegation;
general delegation chains wait for a demonstrated use case.

### Layer 6 — Call

A Call owns one accepted intent and all of its monotonic observations.
Execution state and payment state remain separate correlated axes. Transport
success is never business success. Retrying is automatic only when the system
can prove no effect occurred; ambiguity becomes `reconciliation_required`.

### Layer 7 — Result and continuation

The terminal response contains literal output when available. Otherwise it
contains a durable reference, current state, freshness, and the exact safe next
actions: status, cancel, supply input, reconnect, approve, reconcile, or escalate.
A fresh process can continue from these references without conversation history.

### Layer 8 — Outcome records

AE records only market-relevant evidence: candidate exposure, exclusion,
selection, Call, delivery, qualified use, buyer-reported acceptance, repeat,
switch, bypass when observable, Provider earnings, and recovery. Replay
is not repeat demand. Provider completion is not usefulness. Allocation changes
must be attributable to versioned policy and inspectable evidence.

### Layer 9 — Projections

Buyer, Provider, operator, API, MCP, CLI, and UI views are projections over the
same facts and allowed transitions. A projection may redact or compress; it may
not invent a parallel lifecycle or hidden source of truth.

## Action-specific response language

Machine surfaces share action contracts and domain semantics, not one universal
response envelope. Search, Quote, Call and status each use one
versioned tagged result containing only the facts required for that decision.
Ordinary reads do not carry empty money, warning, state or continuation fields.
`correlationRef` appears only when accepted asynchronous work, refusal,
uncertainty or support requires it; `callRef` owns the Call lifecycle.

A non-terminal response contains at most one executable machine continuation:

```json
{
  "action": "call.status",
  "args": { "callRef": "<returned Call reference>" },
  "authority": "same_principal",
  "retryAfterMs": 5000
}
```

The 7 October source uprev selects this flat grammar over a nested generic
request/handoff union. Each domain owns an exact union of registered operation
names and arguments; no generic runner or second action registry is introduced.
`requiredInput`, when present, names missing caller material such as a new
idempotency key. Never invent that material in a read response. Timing and
authority appear only where meaningful. Per-candidate inspection controls and
explicit cancellation controls are distinct from the single primary next step.
HTTP-only inspection and browser setup remain links or human handoffs; they must
not masquerade as callable MCP operations. Existing containers may differ by
domain, but operation names and argument meaning do not.

Stored Calls, procurement checkpoints, signed cursors and version-1 CLI journals
retain their original material. Storage-only adapters may read historical shapes
and project current guidance; live public validators accept the current contract.
Quote input remains stored for execution and evidence even when its redundant
echo is removed from public output. Payer handoffs confer no Account authority.

An optional owner handoff is separate and identifies the required actor, bounded
reason and durable status reference. The response does not repeat
manifest-owned schemas, preconditions, consequence descriptions or effect
metadata. Possible dispatch never exposes `tool.call` as a continuation.
Exact money is always a decimal string plus currency and scale; a machine
response never asks the caller to infer a balance from events.

## Agent ergonomics

### Orient from the existing contract

Do not create a new generic orientation protocol. The generated agent manifest
describes supported actions and versions. `agentAccess.whoami` and
`agentAccess.balance` remain explicit setup, diagnostic and accounting reads;
they are not mandatory steps before each Call. Authentication resolves the
Business Principal, Agent Principal, Account, credential, environment and
spending policy server-side, and `tool.quote` includes only the balance and limit
facts material to the selected Call. The caller never supplies an `accountRef`.

### Progressive disclosure

- `registry.tools.search` returns up to eight compact results by default;
  callers can request at most twelve per page. A result identifies its source,
  access and readiness without repeating the full Tool schema.
- `registry.tools.describe` supplies the selected Tool's input contract and
  material terms. Use it before constructing Quote input unless the caller
  already holds the exact current Tool contract. Comparison is an optional
  public read when choosing between candidates.
- `tool.quote` checks the caller's current authority and spending capacity,
  returns the exact price, available Account balance and per-Call limit, and
  produces the expiring Quote used by `tool.call`. It does not replace Describe
  or promise an exact remaining period budget. Refusals provide the supported
  remediation or owner handoff.
- Package 4 v1 has one bounded, decision-safe response shape per action. It has
  no selectable detail level or arbitrary field group. Larger evidence remains
  behind stable references.
- Pagination, cursors, conditional reads and version-aware status prevent
  repeated full-state downloads.

### Bounded action surface

The recommended managed-Call path is:

```text
registry.tools.search -> registry.tools.describe -> tool.quote -> tool.call -> result
```

`call.status`, `call.cancel` and `call.reconcile` appear only
when the Call state permits them. Compare, whoami and balance are optional
reads; Describe supplies the selected Tool contract before Quote input is built. Outcome reporting is deferred until a
real repeat-selection consumer justifies the action and its aggregates.
Provider and operator verbs live in separate namespaces. MCP, API and CLI
project the same contracts without transport-specific business behavior.

### One deep managed-Call interface

The buyer-facing Call module is a deep module: a small interface hides the
coordinated market, authority, execution, economic, x402 and evidence work.
The Agent Principal chooses a Tool and supplies literal input plus its
constraints to `tool.quote`. It then calls the returned `quoteRef` through
`tool.call` with an idempotency key and follows safe continuations. It does
not choose a treasury pool, provide a wallet or `accountRef`, calculate foreign exchange,
reserve balances, interpret settlement finality, construct ledger entries, or
decide whether an unknown effect is safe to retry.

Internally, market choice, spending-policy use, Call, AUD reservation, corporate
USDC commitment, x402 payment, Provider obligation, delivery evidence and
recovery remain separate modules and state owners joined by stable references.
They must not be flattened into a mutable Call mega-record merely to simplify a
response.

### Make cost a first-class control input

`tool.quote` returns exact monetary cost, available Account funds, the
Agent Principal's per-Call limit and expiry after checking current spending
capacity. Allowance refusals distinguish daily and monthly limits and provide
reset guidance. Describe and action metadata disclose the permitted recipients
and effects before input is sent. The caller supplies literal input and only
constraints supported by the action contract. Additional budget or latency
fields require a demonstrated caller need; they are not current guarantees.
Deterministic validation, matching, policy, and state transitions never invoke a
model. A model may normalize ambiguous natural language only behind a bounded,
observable adapter with a deterministic fallback.

### Never make the caller reconstruct truth

Commands return authoritative post-command state or a durable accepted-state
reference. Status returns valid transitions. Idempotency applies to every
consequential command. Same identity plus different material intent fails. Safe
automatic retry, unsafe retry, and reconciliation are distinct machine states.
Status accepts an optional previously observed state version. An unchanged read
returns only the Call reference, current version and recommended next
observation time; a changed read returns the current bounded delta. Credential
rotation cannot reset an Agent Principal's budget or detach its prior Calls.

## Coherent system boundaries

The system has five control planes, joined by references rather than shared
mutable objects:

1. **Market plane:** Tools, service requests, comparisons, Quotes, allocation.
2. **Authority plane:** Business Principals, Accounts, Agent Principals, credentials, spending policies,
   budgets, approvals, Connections.
3. **Execution plane:** Call admission, dispatch, observation, results,
   cancellation, reconciliation.
4. **Economic plane:** price, reservation, buyer charge, Provider payable,
   platform fee, refund/dispute, payout.
5. **Evidence plane:** events, outcome provenance, operator queues, SLOs,
   release/restore proof, market learning.

Each canonical table/state machine has one owning module. Cross-plane joins use
stable refs and immutable snapshots. Adapters translate transport and provider
protocols; they do not decide domain policy. No new service is introduced merely
to mirror Convex state.

## Accretive without becoming invasive

An interaction is accretive when it improves future market allocation from
facts AE is entitled to know. AE may retain:

- normalized market intent and hard constraints;
- candidate exposure, exclusions, selection, and policy version;
- Call, payment, delivery, recovery, and Provider evidence;
- later repeat/switch links when directly observed; and
- aggregate demand that satisfies privacy and sample thresholds.

Package 4 retains operational evidence AE already observes: price, latency,
delivery, payment, failure and recovery. Buyer-reported use is not required to
prove the first managed Call and is deferred until a demonstrated allocation or
evaluation consumer justifies collecting it. Free-form project context is
neither required nor accepted.

Future Resolution uses these observations as labelled inputs: hard constraints
first, then fit and evidence adequacy, then the caller's stated preference among
price, latency and recovery risk. It does not hide alternatives behind one
universal quality score. Every aggregate exposes scope, sample size, window,
freshness and provenance so the agent can decide how much weight to give it.

AE must not retain arbitrary prompts, plans, files, conversations, chain of
thought, or wider project state. Private intent is not exposed to Providers.
Provider-facing demand intelligence is aggregated, delayed where necessary, and
cannot reveal a buyer or private workload.

## Buy before build

“No handrolling” is a design constraint, not a preference. AE owns market
semantics and buys commodity platform machinery behind narrow ports.

| Concern | Default | AE still owns | Do not hand-roll |
|---|---|---|---|
| Human and owner-bound machine authentication | Clerk sessions, OAuth access tokens, and user/org API keys | Principal binding, Account context, grants, consequence-time policy | Passwords, token formats, OAuth server, API-key hashing/management UI |
| Runtime state and atomicity | Convex transactions and indexed queries | Domain state machines and invariants | Distributed lock service or shadow database |
| Queued/durable work | Convex Workpool; Convex Workflow only for genuine multistep durability | Call/effect semantics and reconciliation | Queue, scheduler, backoff engine, workflow runtime |
| Rate and aggregate limits | Convex Rate Limiter and Aggregate components | Budget meaning and consequence admission | Home-grown token bucket or hot-path full scans |
| Machine contracts | Official MCP SDK, Zod, JSON Schema/OpenAPI tools | Tool/Call semantics and cross-surface parity | Protocol framing, schema parser, generated protocol types |
| Provider onboarding and payouts | Stripe Connect hosted or embedded onboarding and payout surfaces | Provider admission, payable truth, margin, remedy, payout correlation | KYC, bank-detail collection, payout dashboard |
| Payment protocols | Official Stripe, Coinbase CDP, and x402 SDKs behind adapters | Provider-neutral price/effect/economic truth | Signing primitives or protocol clients already supplied by SDKs |
| Outbound events | Svix sending, signatures, retries, replay, and consumer portal | Event vocabulary, payload schemas, Account mapping, source event IDs | Webhook retry scheduler, signing, replay UI, endpoint health |
| Observability and product evidence | Sentry and PostHog | Safe dimensions, market semantics, SLO ownership | Bespoke trace store or analytics pipeline |
| Secrets | Managed secret provider behind `SecretStore`; Vercel OIDC for workload access where applicable | Connection lifecycle, generation, redaction, fail-closed policy | Secret vault or long-lived shared workload keys |
| Tests | Vitest, Playwright, contract fixtures, official sandboxes | Adversarial invariants and exact-revision evidence | Custom test runner or fake provider protocol |

Dependency adoption requires a short decision record covering maintained status,
installed-version fit, required semantics, failure mode, data ownership,
exportability, and fallback. A provider must not become AE's authority or
canonical market history merely because it supplies infrastructure.

Current documentation supports these choices: Clerk exposes owner-delegated API
keys and OAuth machine authentication; Stripe recommends hosted or embedded
Connect onboarding; Convex provides isolated Components, Workpool, Workflow,
rate limiting, scheduling, and usage controls; and Svix provides delivery,
signing, retries, replay, idempotency, and a consumer portal. Version and plan
availability must be rechecked during each implementation phase.

## Invariants

1. One Tool version is the exact unit quoted and called.
2. One mutable lifecycle has one authoritative owner.
3. Missing facts remain explicit unknowns.
4. A read-only stage cannot reserve, charge, read secrets, or create effects.
5. `tool.call` cannot drift from its unexpired caller-bound Quote.
6. An Agent Principal acts under a Business Principal-issued spending policy; a
   credential is not a principal and rotation does not reset limits.
7. Consequential work is idempotent and revalidates current authority.
8. Unknown irreversible effects reconcile; they do not retry blindly.
9. Every response is resumable from durable references.
10. Every implemented allocation claim names evidence, provenance, freshness,
    and policy.
11. All surfaces expose the same facts and transitions.
12. AE learns market behavior without taking ownership of project context.
13. Commodity infrastructure is bought unless an explicit decision proves it
    cannot satisfy the required invariant.

## Deliberate non-goals

- General agent runtime, planning, memory, workflow, or multi-agent coordination.
- Ownerless autonomous economic Accounts.
- A general multi-hop delegation graph in the first platform milestone.
- Provider fan-out at search time.
- Opaque composite reputation or model-only allocation.
- Automatic irreversible failover.
- New Order, Offer, or Task market units where Quote and Call already express
  the required lifecycle.
- Transport-specific domain implementations.

## Acceptance contract

The system is agent-intuitive only when an external agent in a fresh process can:

1. search and receive a bounded page of compact candidates without full schemas or
   repeated navigation;
2. inspect one selected Tool and receive caller-specific material detail,
   authority, budget, shared-balance viability and an expiring Quote;
3. call exactly that Quote under narrow authority and idempotency;
4. consume a literal result or resume/cancel/reconcile from one durable next
   action without a dashboard; and
5. use optional whoami, balance, public detail or comparison reads only when its
   own task requires them.

The four required Package 4 journeys are: cheapest successful Call,
insufficient balance or authority, material terms drift before effect, and
unknown payment or delivery after submission. Their response budgets, excluding
literal output and the generated manifest, are: three-candidate search at most
3 KB JSON, Quote at most 4 KB, unchanged status at most 512 bytes, and
refusal or uncertain result at most 1 KB. Contract tests also record round trips,
serialized bytes, caller-supplied fields and stale-state windows for each
journey.

The platform is mature only when the same chain works with two independent paid
Providers, two external harnesses, no founder/database intervention, Provider
payout, managed outbound event recovery, and an operator who can diagnose every
state from a correlation reference.

## Documentation architecture and publication boundary

This is the executable specification for the existing docs owner. The current
[docs index](../README.md) includes internal material and is not a publication
allowlist. Keep canonical content in this repository; prepare Markdown now.
The isolated renderer trial below does not adopt a production docs app, create a
public repository or establish deployment acceptance.

| Audience / job | Canonical authored source and anchors | Public projection contract |
| --- | --- | --- |
| Ordinary user: choose, use, recover, find help | [Foundations: choose/use](../foundations.md#choose-and-use-a-tool), [recovery](../foundations.md#recover-without-making-another-purchase), [data/receipts/lifecycle](../foundations.md#data-receipts-and-lifecycle) | One supported journey with price, recipient and result facts at the decision. |
| Organisation admin: connect, scope, fund, rotate/revoke | [Foundations: actors](../foundations.md#who-owns-what), [authority](../foundations.md#connect-an-agent-and-control-authority) | Distinguish Account funds, identity, grants and human handoffs; label unsupported lifecycle steps. |
| Agent integrator: install, discover, Quote/Call, resume | [CLI installation](../../packages/cli/README.md#install-from-npm), [upgrade/disconnect](../../packages/cli/README.md#upgrade-disconnect-and-uninstall), [canonical skill](../../plugins/agentic-economy/skills/use-agentic-economy/SKILL.md#keep-the-task-in-its-harness) | Release-bound setup plus generated HTTP/MCP/CLI references and safe recovery examples. |
| Provider: entitlement, setup, publish, deliver/recover, withdraw | [Foundations: Provider setup](../foundations.md#provider-setup), [skill: Provider setup](../../plugins/agentic-economy/skills/use-agentic-economy/SKILL.md#provider-and-client-lifecycle) | Current `supply.*` contracts and supported earnings/remedy boundaries; proposed adapters stay labelled. |

Organize each persona's entry into tutorial, how-to, reference and explanation
according to [Diátaxis](https://diataxis.fr/). Reuse these content owners and
anchors; a renderer may split navigation without creating a second prose manual.
Existing `/for-agents` and `/for-providers` remain entry points. Future page URLs
must be mapped explicitly to canonical source paths and stable fragment IDs
before publication; redirects preserve prior paths and anchors during migration.
Do not advertise a `/docs` tree or `.md` counterpart before it exists.

Authored prose owns workflow, consequences and supported limits. Generated
reference owns action IDs, fields, defaults, required headers, schemas and
versions. [Site manifest `buildSiteDiscoveryManifest`](../../src/modules/discovery/internal/site-manifest.ts)
and action descriptors supply machine discovery; [plugin manifest](../../plugins/agentic-economy/.codex-plugin/plugin.json)
owns packaged metadata, while [the skill source](../../plugins/agentic-economy/skills/use-agentic-economy/SKILL.md)
is shared by the installed plugin and [`buildPublicAgentSkillMarkdown`](../../src/modules/discovery/internal/agent-skill.ts).
Generate structural reference and validate illustrative requests/responses
against the owner schemas; handwritten examples cannot override them. Existing
examples require validation too; their presence is not proof of validity.

Human HTML and Agent Markdown must project the same supported facts, source
revision and stable anchors. The current owner is
[`respondWithAgentPageMarkdown`](../../src/lib/server/agent-page-markdown.ts), using
[`page-markdown.ts`](../../src/modules/discovery/internal/page-markdown.ts) builders
and [content negotiation](../../src/lib/http/agent-content-negotiation.ts).
It currently maps `/`, `/for-agents`, `/about` and published business slugs;
unsupported page projections return `406`, missing businesses `404`.
`/for-providers` is not a current Markdown guide projection. Preserve this
truthful unsupported handling until an explicitly mapped projection exists;
do not turn internal Markdown or arbitrary filesystem paths into public routes.

Public publication must use an explicit entry allowlist: foundations, glossary,
the CLI guide and canonical skill are candidates for review, not blanket approval
to publish their dependencies. Resolve every local link, include/import, image,
download and generated asset transitively. Each target must be approved public
content or rewritten to a public summary; otherwise fail the build. Exclude
operations, ADRs/designs, research, archives, deployment inventory, runtime
receipts and secrets by default. Reading an internal source to generate selected
contract fields does not authorize copying that source into public output.
Never glob all `docs/`, follow symlinks out of approved roots, or bundle internal
source maps/assets through an apparently safe guide.

Unsupported capabilities carry a current/preview/proposed label, the missing
requirement and a useful supported alternative. Help instructions request only
the available `requestId`/correlation header and Quote/Call/Plan reference,
timestamp, environment and client version; never keys, full prompts or private
output. [Journey problems](../../src/modules/actions/contract.ts) distinguish
remote request IDs from local failures, and [request correlation](../../src/lib/server/request-correlation.ts)
owns the HTTP header. These are diagnostic references, not bearer authorization.

**Renderer trial: conditional fit, 7 October 2026.** An isolated TanStack Start
build used Fumadocs core/UI 16.16.2, MDX 15.4.6 and OpenAPI 12.3.0 with React
19.2.7, Start 1.168.60 and Router 1.170.41. Build, types and actual built-server
responses passed for one allowlisted guide and one generated Call reference.
HTML and Markdown used the same guide source. The complete seven-schema closure
was retained in machine reference; private paths and unapproved transitive links
were absent, and an unlisted page returned 404. This used the inspected baseline
schema, not a newly deployed contract.

The full default reference renderer stalled on a recursive response contract;
disabling TypeScript definitions alone did not resolve it. Supported options
`showResponseSchema: false`, `generateTypeScriptDefinitions: false`, disabled
playground and omission of response example tabs produced a completed request
reference. That omits human response-schema UI and examples. Default generated
Markdown contained only a heading/wrapper; the explicit LLM adapter needed the
original allowlisted OpenAPI document. Fumadocs internally normalized OpenAPI
3.1 to 3.2, so emitted machine content retained the original source document.
The generated `quoteRef: "string"` violates Aecon's pattern and is not a runnable
example. The approximately 12 MiB client output also needs deployment assessment.

That earlier Fumadocs OpenAPI trial did not qualify adoption: recursive response
rendering and source-owned valid examples remained unresolved in that renderer.
Browser hydration/search, hosted packaging, full operation coverage and the four
guide-led journeys remain unqualified. Reproduce the bounded trial using the
[pinned TanStack integration](https://www.fumadocs.dev/docs/manual-installation/tanstack-start),
[OpenAPI options](https://www.fumadocs.dev/docs/integrations/openapi/api-page) and
[LLM output adapter](https://www.fumadocs.dev/docs/integrations/llms), selecting
`POST /api/v1/tools/call` and its local schema-ref closure from the owner generator.
Record adoption evidence in MM-055 and the existing release record; do not infer
full renderer support from a constrained build.

Prefer a separate docs build from this same repository if the adoption gates pass: it keeps prose/contracts/release provenance together and narrows
published input, while adding a build and compatibility check. A separate public
repository gives a clearer disclosure boundary and independent contributions,
but adds export/version synchronization and a second release owner. Revisit that
tradeoff only with demonstrated distribution needs; the bounded implementation below selects the same-repository option. [Deployment compatibility](../operations/deployments.md#compatibility-and-docs-release-policy)
owns the release tuple, not this design document.

### Current implementation: Fumadocs with Scalar Markdown

The approved pre-stability implementation uses a private, independently installed
`packages/docs` app in this repository. The official `create-fumadocs-app@16.2.16`
TanStack Start/MDX template and `@fumadocs/cli@1.7.3` LLM feature supply the layouts,
page tree, Orama search, theme, Markdown routes and components. Core is 16.16.2,
MDX 15.4.6 and the official UI alias is `@fumadocs/base-ui@16.16.2`.
Its separate exact npm lock preserves upstream Shiki 4 while the main application
retains Shiki 3. Both use Node 22 and npm 11.5.1. This adds a separate install/build,
not a second content owner, public repository or deployment.

`@scalar/openapi-to-markdown@1.5.2` renders 61 operation pages and their
148-model closure. The generated index accounts for all 68 owner operations.
Seven operation pages link to the exact operation in the local, unchanged OpenAPI
artifact because Scalar omits positional tuple constraints or the Plan Quote's
`propertyNames` pattern. These pages are fallbacks, not qualified renderings.
The original Call and seven-model qualification remains in place, including
all five outcomes and its 26 ordered, validated examples.

Only owner-supplied examples are published. Scalar's linked mode still invents
examples for unannotated object models. A narrow, version-pinned AST check removes
only its final Example paragraph and JSON block when the owner supplies no example.
Any other shape fails export. This is the explicit sanitation exception to the
earlier no-postprocessor trial: it neither generates examples nor renders schemas.
Every remaining JSON example must match its owner value and validate. The official
SSR alternative remains rejected because it hid response branches behind interaction
and added 4.4 MB of JavaScript in the recorded trial.

Publication checks unsupported schema keywords, paired constraint values, parameter
requiredness, authentication, schema links and source examples. These are bounded
checks; repeated constraints on different nested fields are not independently
associated by the Markdown check. The full owner OpenAPI remains authoritative.
Source and browser readbacks must qualify each expansion; page counts do not prove
runtime behaviour or complete semantic equivalence.

Reference expansion exposed defects in the owner projection. OpenAPI 3.1 now uses
Zod's native 2020-12 conversion instead of TanStack's draft-07 conversion. A shared
native override preserves the tuple lengths enforced by Zod's runtime parser,
including optional tails and rest items. MCP and draft-07 CLI/Agent descriptors
use the same correction. Reference hoisting and inlining preserve `$ref` siblings.
This corrects advertised schemas without changing accepted payloads, authority,
request identity, stored purchases or the domain's tuple definitions.

The only Aecon tooling is [publication-manifest.ts](../../tools/docs/publication-manifest.ts),
[export-docs.ts](../../tools/docs/export-docs.ts) and
[verify-docs.ts](../../tools/docs/verify-docs.ts). The manifest allows the CLI guide,
glossary, Start here, four persona sections, authority, purchase-choice and recovery
guides, and only the public compatibility-policy section of the deployment record. It does not publish the operations document.
The reference is generated through the discovery public facade; the original
owner OpenAPI and canonical plugin skill are copied unchanged. New operations
remain in their existing schema owners; this allowlist is not another registry.

Publication rejects unknown pages/assets/links, executable MDX, includes,
symlinks, remote schema references and browser source maps. Generated content is
ignored and recreated; never edit it. Static HTML, actual anchors, source examples,
raw artifacts and exact emitted files are checked. Browser hydration, visible
contract branches, search and copy require their separate observed evidence.
Public provenance contains the source revision, dirty-source digest, lock digests,
contract digest and renderer normalization; a dirty tree is never labelled a
released revision. Scalar normalizes a rendering clone to OpenAPI 3.2 internally;
the independently served original remains OpenAPI 3.1.

Run `npm ci --prefix packages/docs`, then `npm run docs:build`. `npm run check`
typechecks tooling separately from the application; combining the renderer types
with the application exceeded its 4 GB heap during qualification. No heap increase
or skipped typecheck was used. The existing release gate also runs the docs build.
Faithful human rendering of the seven fallback operations, a public safe sandbox
and installed/hosted four-persona acceptance remain separate gates. This is a qualified local
docs foundation, not a stable or deployed API declaration.

## Official implementation references

- [Clerk machine authentication](https://clerk.com/docs/guides/development/machine-auth/overview)
- [Clerk API keys](https://clerk.com/docs/guides/development/machine-auth/api-keys)
- [Clerk OAuth applications](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
- [Stripe Connect onboarding](https://docs.stripe.com/connect/onboarding)
- [Stripe Connect platform model](https://docs.stripe.com/connect/how-connect-works)
- [Convex Components](https://docs.convex.dev/components/overview)
- [Convex durable workflows](https://docs.convex.dev/agents/workflows)
- [Convex rate limiting](https://docs.convex.dev/agents/rate-limiting)
- [Svix webhook delivery](https://docs.svix.com/introduction)
- [Svix retries and replay](https://docs.svix.com/retries)
- [Svix consumer portal](https://docs.svix.com/app-portal)
- Historical context-efficient source proposal: unavailable in this repository;
  its former citation does not add a separate maintained design authority.
