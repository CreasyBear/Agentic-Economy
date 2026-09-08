# Package 6 inverse premortem

**Status:** research input for planning; no implementation is authorised by this paper  
**Studied:** 2026-09-04, Australia/Perth  
**Repository baseline:** `aa36c632df`, with a pre-existing dirty worktree  
**Question:** If Package 6 becomes unusually easy to understand and use, what familiar choices made that outcome likely—and where does the current product still fight those choices?

## Decision

Package 6 succeeds when people can use Agentic Economy without first learning
Agentic Economy.

The winning shape is familiar:

```text
describe the job
  -> see a real option
  -> install through the place the agent already uses, if needed
  -> connect the required account only when needed
  -> return to the same job
  -> see the result or one clear next step
```

For service providers it is equally familiar:

```text
check whether the service fits
  -> sign in
  -> point AE at the interface already in use
  -> choose what AE found
  -> connect the service only if required
  -> submit
  -> check the current status
```

This does not require a new onboarding system. It requires the existing market,
client installation, sign-in, source-reading, connection, status and recovery
mechanisms to meet cleanly.

The proposed Package 6 requirements are directionally right, but several are
written from the system's point of view. If implemented literally, they could
add a compatibility programme, a verification ceremony, a documentation
platform, a copy framework and a second error model. The amended requirements
below keep the intended outcomes while removing those invitations.

## Sources and authority

Product meaning comes from [PRODUCT.md](../PRODUCT.md), [CONTEXT.md](../CONTEXT.md),
[DESIGN.md](../DESIGN.md) and the
[Package 6 roadmap](../IMPLEMENTATION_ROADMAP.md#6-onboarding-content-and-language--planned).
The proposed requirements come from
[Package 6 maturity requirements research](./PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md).
Current source and tests establish the local behaviour described below.

The Package 5 rule remains controlling:

> Use the maintained product for installation, identity, consent, secrets,
> payment, protocol handling and long-running work. AE owns only its Operation,
> authority, purchase and evidence meaning.

That rule is established in the
[Package 5 maturity comparison](./PACKAGE-5-MATURE-SCAVENGE-COMPARISON.md) and
[Package 5 primitives research](./PACKAGE-5-SUPPLIER-OPERATIONS-PRIMITIVES-RESEARCH.md).

For current OpenAI behaviour, this review used only official OpenAI guidance:

- [Plugins in ChatGPT and Codex](https://help.openai.com/en/articles/20001256)
- [Connecting and managing app accounts in ChatGPT](https://help.openai.com/en/articles/20001494)

The familiar OpenAI pattern is important here. One directory presents a
bundle. The bundle can contain instructions, connected services and MCP. A
person reviews it, installs it, connects an external service during install or
first use when prompted, starts a fresh chat or task, and describes the desired
outcome directly. Installing the bundle and authorising an external account are
separate. The external service and workspace still control permissions.
Removing the bundle does not by itself prove that every connected account has
been disconnected. Codex CLI uses its own plugin command and a fresh session;
the Codex IDE extension does not currently provide the same plugin path.

This is a reference for familiarity, not an instruction to copy OpenAI's
labels, directory or permission model.

The whole-product papercut register (local reference: `.planning/audits/product-papercut-register-2026-09-03.md`)
is point-in-time evidence. Its old score is not a current score. Its relevant
journeys must be rerun against one Package 6 revision.

## Current journeys

### 1. Agent from the public website

The present human path is:

```text
/for-agents
  -> Browse Operations, Read the skill, or Add Agentic Economy
  -> choose Codex, Claude Code or Cursor from equal tabs
  -> copy a client command
  -> run the client's MCP setup
  -> approve in the browser when required
  -> return to the client
```

What already works in the source:

- The value proposition and public market link come before the install panel.
- Each client uses its own command and its own authentication instructions.
- Public search is explicitly available before sign-in.
- The generated skill tells the agent to search, inspect, call, then check or
  recover the recorded Call.
- The generated skill already asks the agent to confirm the connected account
  with the existing `whoami` tool; no new ping is needed.

The important gaps are not theoretical:

- The page presents three equal technical choices. Defaulting a tab to Codex is
  not the same as recommending the familiar path for the person's current
  environment.
- The displayed command contains the real AE address, but the copy action uses
  a literal `$ORIGIN`. A person can copy a command that does not work unless
  they happen to define that variable.
- The page ends at browser approval. It does not say to start a fresh task and
  describe the job directly, nor does it bring the person back to the job that
  caused installation.
- “Configured”, “authorised” and “ready to use” remain easy to confuse. The
  machine guide has a useful check; the human journey does not reach a first
  useful result.
- The local source contains Claude and Cursor plugin manifests, but the current
  discovery support matrix still marks a plugin channel as deferred. There is
  no current evidence here of an installed, supported OpenAI Plugin Directory
  package. Package 6 must not market one until the distribution and support path
  is real.

Relevant source:
[agent page](../src/components/ae/agents/AeAgentDoorPage.tsx),
[install funnel](../src/components/ae/console/AeAssistantInstallFunnel.tsx),
[client definitions](../src/lib/cli-distribution.ts), and
[generated skill](../src/modules/discovery/internal/agent-skill.ts).

### 2. Agent from machine guidance

The present machine path is:

```text
/llms.txt or /SKILL.md
  -> search publicly
  -> inspect the chosen Operation
  -> connect through the current client if challenged
  -> confirm the connected account
  -> inspect again
  -> call
  -> wait, check status or recover the same Call
```

This path is safer and more complete than the human page. It also has a
familiarity problem: it gives a new agent protocol versions, command variants,
HTTP details, error envelopes, retry classes and recovery rules before the
first result. The material is valuable as reference. It should not all be the
first-use experience.

There are also two competing stories: the web page begins with installation,
while the skill begins with public search. The latter matches the product
charter and should win.

Relevant source:
[page Markdown](../src/modules/discovery/internal/page-markdown.ts) and
[generated skill](../src/modules/discovery/internal/agent-skill.ts).

### 3. Provider from the public website

The present Provider path is:

```text
/for-providers
  -> read fit, preparation and four source types
  -> Create or continue an Operation
  -> sign in at the shared owner boundary
  -> choose OpenAPI, MCP, Agent Plugin or x402
  -> provide the existing source
  -> let AE find Operations
  -> choose one result; the draft is saved
  -> connect the source if required
  -> review the fields AE owns
  -> submit for validation
  -> read one of eight current states and its available action
```

The strong part is Package 5: AE reads the interface the Provider already
operates. It does not ask the Provider to recreate the protocol. It saves the
selected candidate, rereads current source state, and projects one status model
across surfaces.

The public page is doing too much. Before sign-in it teaches selectors, schemas,
decimal exponents, protocol variants, connection mechanics and validation-call
effects. The owner form then teaches much of that again. The public decision is
therefore mixed with a technical reference.

There is also current drift:

- The public page says OpenAPI 3.1; the owner form says 3.0 or 3.1.
- The page alternates among Supplier, Provider, owner, service and Operation.
- The OAuth source-connection return carries the saved draft back to Add
  service. The manual API-key or bearer-token return carries only the
  connection and environment. Its saved draft is not present in the return
  address, so the exact selected Operation is not guaranteed to resume.
- The manual credential page is an AE form. It is justifiable only where the
  upstream offers no maintained authorisation flow. Where OAuth or a supported
  hosted flow exists, the official flow must remain first.

Relevant source:
[Provider landing](../src/components/ae/supply/AeSupplyLanding.tsx),
[source-native start](../src/components/ae/supply/AeSupplySourceNativeStart.tsx),
[Add service route](../src/routes/_operator/owner.offerings.new.tsx),
[connection handoff](../src/routes/_operator/owner.supply.connections.new.tsx),
and [OAuth return](../src/routes/_operator/owner.supply.connections.oauth.callback.tsx).

### 4. Status, recovery and support

The current shared Provider state is a sound base:

```text
Draft
Needs setup
Submitted
Under review
Published
Paused
Action required
Retired
```

The projector supplies stable reason codes, one status or correction action,
and an owner handoff when a source connection must be repaired. The general
Call continuation rules also distinguish safe retry from “check the recorded
Call before doing anything again.”

The joins are incomplete:

- `source_drift` gets “Recheck source”, and `credential_lost` gets “Reconnect
  source”. Other health reasons can produce “Action required” without an
  equally explicit next action from the shared projector.
- The support page maintains a second, hand-written list of messages and
  actions. It can drift from the owning reason and continuation contracts.
- Support repeats the undefined `$ORIGIN` command.
- GitHub is the primary report path even when the issue may concern a private
  Call, billing, security or personal information.
- Some advanced detail is already disclosed correctly on the agent approval
  page. Package 6 should reuse that disclosure pattern instead of introducing
  another component.

Relevant source:
Provider status (historical reference; unavailable: `src/modules/capability-supply/supplier-operation-status.ts`),
shared continuations (historical reference; unavailable: `src/modules/market/suggested-continuation.ts`),
Provider status view (historical reference; unavailable: `src/components/ae/supply/AeSupplierOperationDetail.tsx`),
and [support](../src/routes/support.tsx).

## Inverse premortem: what made success feel inevitable

Assume Package 6 is complete and new users rarely need help. These are the
conditions that would explain that result.

| Success condition | Familiar reference | What AE already has | Exact delta or risk |
|---|---|---|---|
| The person begins with the job, not setup. | OpenAI tells people to install, start a fresh conversation or task, then describe what they want. | Public search and task-language guidance exist. | The main install page still ends at setup. Make “describe the job” the next visible action and retain any job that led to connection. |
| Installation happens where the agent already lives. | OpenAI uses one Plugin Directory and native product controls; other clients provide their own MCP or plugin surfaces. | Client-specific commands and Claude/Cursor manifests exist. | Do not build a universal installer or equal-choice wizard. Use the maintained directory or bundle where it is supported, and the official client action where it is not. |
| Installing and connecting an account are visibly different. | OpenAI plugins can install before a required app is connected. Provider and workspace permissions still apply. | AE public search can work before account connection. | Current wording often treats “add”, “connect”, “approve” and “ready” as one path. Name each only when that state is true. |
| The account is connected only when the chosen work requires it. | OpenAI can ask for the external connection during install or first use. | AE already supports public search and connection-on-challenge. | The web page foregrounds OAuth setup. Make browse and direct task entry primary; let the protected action trigger the native connection. |
| The user's first proof is useful work. | Familiar plugins are used by asking for an outcome, not by running a diagnostics course. | Search and `whoami` already exist. | Use `whoami` and tool discovery as behind-the-scenes proof. Do not turn them into a new user step or build another ping. |
| A Provider supplies an address or bundle, not a second copy of the service definition. | OpenAPI, MCP, Agent Plugins and x402 own their formats. | Package 5 reads all four source types. | Remove protocol teaching from the public fit page. Keep only AE compatibility notes and links to the owning specification. |
| Leaving for sign-in never loses the work. | Hosted connection patterns return to a stable resource which is reread. | OAuth returns with attempt, draft and connection references. | The manual credential return currently omits the draft. Every handoff must resume from only durable references, including refresh and a second tab. |
| Current state wins over redirect or success copy. | OpenAI plugin installation does not override app permissions; hosted returns do not prove service readiness. | AE has current connection, Operation and Call readback. | Every return must reread. Never let “Connected”, “Submitted” or “Published” stand in for caller access, validation or useful delivery. |
| Removing access is unsurprising. | Plugin install, plugin enablement and app connection are separate; removal does not automatically prove source disconnection. | AE already models connections and credentials separately. | State exactly whether the user is removing an AE bundle, disconnecting AE, revoking a Provider connection or withdrawing an Operation. Do not combine these actions. |
| Help says what happened in ordinary words and offers one safe action. | Official design guidance keeps the error and known correction together, with optional detail disclosed. | Shared reason codes, status and continuation machinery exist. | Project those owners into help. Do not maintain a second hand-written help taxonomy. Fill states that currently have no clear action. |
| The same action works when copied, after restart and in another surface. | Mature clients and hosted flows use durable resources and current permissions. | Stable Operation, Call, attempt and connection references exist. | Remove hidden environment assumptions such as `$ORIGIN`; test exact emitted actions in clean clients and fresh processes. |

## Ordinary premortem: how the proposed requirements still fail

| Proposed requirement | How it fails despite being “done” | Handrolled outcome to prevent |
|---|---|---|
| **A1 — value and public evidence before connection** | Copy says “search first”, but the catalogue is empty, stale or unavailable. The page passes while the journey still cannot produce one real result. | A demo catalogue, onboarding-only result or fake success state. |
| **A2 — one recommended path** | The team declares Codex “recommended” because its tab is first, even when the person is already in Claude, Cursor or ChatGPT. | A chooser, device detector or ranking system that AE must maintain. |
| **A3 — native MCP ceremony** | “Native” becomes another long command guide and still mixes installation, AE authorisation and purchase approval. | A universal installer, config writer, token-paste flow or copied consent screen. |
| **A4 — first successful connection** | The user is made to run `whoami`, inspect status and interpret account terms before doing the job. A green ping becomes the goal. | A new ping, onboarding completion table or browser-only success record. |
| **A5 — current MCP compatibility** | A transport migration consumes Package 6 and changes runtime behaviour under a content brief. | A second MCP stack, custom negotiation or compatibility wrapper. |
| **A6 — compact cold entry** | A byte target is met by deleting necessary guidance, while `/llms.txt`, `/SKILL.md`, the web page and plugin instructions tell different stories. | A second machine guide or bespoke tool-search layer. |
| **B1 — public Provider fit page** | “Simple” copy hides test effects, cost, source requirements or what publication does not prove. | New eligibility rules, invented timing or marketing-only readiness states. |
| **B2 — versioned protocol documentation** | Package 6 creates and maintains four miniature protocol manuals which go stale independently of the parsers. | A documentation platform, copied specifications or universal Provider schema. |
| **B3 — preserve the exact draft** | URLs contain some references, so tests pass, but one branch drops the selected draft—as the present manual credential return does. | A local-storage wizard or a new workflow record used to cover missing existing references. |
| **B4 — evidence-bound requirements and timing** | The page either invents “usually takes” estimates or becomes so guarded that it answers nothing. | A scoring model or review forecast without an owning service level. |
| **C1 — canonical terms** | Every public page is filled with Business Principal, Agent Principal, Commitment and commercial closure. The words are exact and the experience is unfamiliar. | A new public ontology or glossary-first onboarding. |
| **C2 — one source per claim or action** | “Centralise copy” becomes a content engine, while feature-owned error text continues to drift outside it. | A copy database, universal message envelope or CMS. |
| **C3 — claims name evidence** | Every sentence gains a disclaimer, yet important claims still have no deployment evidence. | Copy-only “verified”, confidence scores or made-up completion states. |
| **D1 — one reason, owner and continuation** | A new seven-field error wrapper duplicates existing reason codes and still recommends the wrong action. | Another error taxonomy, action menu or retry-policy table. |
| **D2 — distinct empty and failure states** | New page-local enums make the wording different without changing the underlying facts. | Local status maps, fake zeros or copy-derived state. |
| **D3 — disclose advanced diagnostics** | Essential information is hidden in a custom accordion, or every page gains a diagnostics console. | A new disclosure component, raw-log viewer or support dashboard. |
| **D4 — guidance survives restart** | A Package 6 task engine or browser storage is added even though stable Call, attempt, connection and Operation references already exist. | A wizard state machine, local-storage recovery or second workflow engine. |
| **D5 — accessible, private-safe support** | The team builds a ticketing and focus-management system instead of using selected maintained services and existing components. | A support platform, form library or accessibility framework. |
| **D6 — human and machine parity** | A universal response envelope is introduced, or parity tests compare labels while copied actions still fail. | A second lifecycle, response wrapper or human-only authority path. |

## Requirement amendments

The 19 candidates should become nine planning requirements. Technical checks
remain mandatory, but they should not masquerade as new user features.

| Candidate treatment | Amended Package 6 requirement |
|---|---|
| **Keep and rewrite A1** | **Start with the job.** A person or agent can ask for an outcome and receive one real public Operation before any connection. If no current Operation can help, say that plainly. Connection begins only when the chosen action needs it, and the original job survives the connection. |
| **Merge and rewrite A2 + A3** | **Install through the environment already in use.** Prefer its maintained directory or bundle when that exact surface supports one; otherwise use its official MCP action. Keep install, external-service connection, AE account approval and purchase approval separate. Never ask for a token in prose. |
| **Rewrite A4** | **Prove use by completing the first useful step.** After installation, the person starts a fresh task and describes the job. The agent performs tool discovery, public search and any existing account check. The person sees a result or one exact blocker—not a verification course. |
| **Move A5 to a release prerequisite** | **Support claims require same-revision proof.** Test the exact client build, install route, MCP behaviour, authorisation, restart, disconnect and known limits before publishing support. Any protocol migration is its own scoped prerequisite, not Package 6 content work. |
| **Keep and rewrite A6** | **Keep first use short.** The first instruction contains the job-shaped path only. Client alternatives, protocol versions, HTTP examples and recovery detail remain available when requested. All versions project from the existing action and discovery contracts. |
| **Merge and rewrite B1 + B2 + B4** | **Help Providers decide before sign-in.** In plain words, state who fits, what they need, whether a test can touch or cost their service, what happens after submission, what AE knows about timing, and what publication does not guarantee. Put source-specific compatibility notes beside links to the official source specification; do not rewrite the protocol. |
| **Keep and strengthen B3** | **Return to the exact saved service.** Sign-in, OAuth, manual credential handoff, expiry, refresh and second-tab use all return to the same saved source and selected Operation, then reread current state. Use the official source authorisation flow whenever one exists. The AE credential form is a fallback only where no maintained flow exists. |
| **Merge and rewrite C1 + C2 + C3** | **Use ordinary words without changing the facts.** Public onboarding says “your business”, “your agent”, “service provider”, “price”, “call”, “connect”, “check status” and “try again” where those words are true. Consequential records still name the exact Account, Operation, Provider, Seller, authority, price, Call and evidence. Claims come from their current owner and never outrun deployed proof. |
| **Merge and rewrite D1–D6** | **Say what happened and what to do next.** Every empty, blocked, unavailable, unknown or failed state states the fact, what was not changed, and one safe action. When a person must act, preserve a stable reference. Keep necessary guidance visible, disclose technical detail with existing components, provide a private-safe help path, and project the same action across web, HTTP, MCP, CLI and generated guidance. |

### Requirements to drop as standalone features

- Do not make a “product language system” a new software system. It is a
  constraint on existing content owners.
- Do not make “first successful connection” a stored onboarding state. The
  first real read or result is the proof.
- Do not make “compatibility matrix” a customer workflow. It is release
  evidence and support documentation.
- Do not make “versioned Provider documentation” a new publishing platform.
  It is generated compatibility information plus links to source owners.
- Do not make “durable guidance” a new task engine. Existing stable references
  and readback carry the work.

## Familiar words to use

The public surface should not require the commercial data model as an entrance
exam. Familiar wording may introduce an exact record without replacing it.

| Situation | Say first | Exact term when it matters | Avoid on first use |
|---|---|---|---|
| Ask for help from the market | “Describe what you need done” | Capability gap or Market intent in records | resolution request, procurement intent |
| The thing for sale | “A service you can call” | Operation | callable contribution, market object |
| Who performs it | “Service provider” | Provider | upstream party, supplier-hosted capability |
| Who owns the work | “Your business” | Business Principal | principal |
| The acting software | “Your agent” | Agent Principal on access and audit views | acting principal, runtime identity |
| Set up in a client | “Install” or “Add” | Installed plugin or configured MCP server | provision, initialise |
| Allow an account | “Connect account” | Account and Agent access | establish caller viability |
| Allow one consequential action | “Review and approve” | Mandate or Commitment in the detailed record | bind authority evidence |
| Use the service | “Call” | Invocation reference in records and support | invoke, dispatch |
| Money available | “Available balance” or “Add funds” | Funding and Prepaid balance | wallet, treasury |
| Current result | “Check status” | Operation or Invocation state | authoritative readback |
| Uncertain outcome | “We could not confirm whether the Call started” | Reconciliation required in details | non-terminal ambiguity |
| Safe retry | “Try again” only when known safe | Retry rule and same command identity in details | replayable, idempotent retry |
| Provider publishing | “List a service” then “Publish this Operation” | Publication in the record | admission ceremony |
| Provider problem | “Needs attention” plus the exact cause | `Action required` state and reason code | blocker posture |

This is not permission to collapse roles or states. Provider and Seller remain
separate where the sale is being inspected. Funding, authority, purchase,
delivery, settlement and closure remain separate where money or remedy is at
stake.

## Explicit no-handroll constraints

1. Use the client's maintained directory, plugin bundle, install control or MCP
   command for that exact supported surface. Do not build a universal installer,
   client detector, config editor or copied plugin directory.
2. Use official OAuth and hosted consent. Do not build discovery, PKCE, callback
   listeners, refresh, revocation or consent screens when the source or client
   supplies them.
3. Keep install, external-service connection, AE access and purchase approval as
   separate facts. Do not infer one from another.
4. Treat external-service and workspace permissions as final. AE must not claim
   that installing its bundle widens source access.
5. Treat uninstall, disconnect, revoke and withdraw as separate actions. Never
   promise that one silently performs the others.
6. Use existing `whoami`, public search, status and current-resource reads. Do
   not add a ping, onboarding-complete field or synthetic success record.
7. Use Package 5 source readers and the official protocol SDKs/schemas already
   selected. Do not add a universal Provider schema, paste-in protocol builder
   or copied protocol manual.
8. Use official Provider authorisation when available. An AE password field is
   allowed only for an otherwise supported source with no maintained hosted
   authorisation path; it must use the existing secure handoff and secret store,
   preserve the exact draft, clear material from memory, and never put the
   secret in Convex, a URL, logs, telemetry or evidence.
9. Use Clerk's existing sign-in boundary and durable source, draft, attempt,
   connection, Operation and Call references. Do not add wizard sessions,
   browser storage or a Package 6 workflow engine.
10. Use the existing reason codes, status projector, continuation registry and
    problem responses. Do not add page-local lifecycle states, a second retry
    table or a universal response envelope.
11. Use existing design-system buttons, alerts, forms, tabs and disclosure
    components. Do not create an onboarding component library, animated setup
    flow, diagnostics console or focus framework.
12. Keep category claims in the existing brand-copy owner, functional wording
    with the feature that owns the fact, and machine wording generated from the
    action/discovery contract. Do not add a CMS or copy database.
13. Put only AE compatibility notes in AE documentation. Link to the official
    protocol or client owner for general setup and semantics. Do not fork their
    documentation.
14. Do not publish support, timing, readiness, payment, delivery or closure
    claims from source presence alone. Prove them on the deployed revision.
15. Use a selected maintained private support channel. Do not build a ticketing
    platform in Package 6.

## Black-box proof journeys

Tests must observe what a person or external agent can do. They must not assert
which React component, private method or internal table made it happen.

### Journey A — familiar OpenAI plugin path

Precondition: the AE plugin is genuinely available on the supported OpenAI
surface. If it is not, this journey is marked unsupported; Package 6 must not
imitate it with a web page.

1. Start with a clean supported ChatGPT or Codex profile.
2. Find AE in the native Plugin Directory and review the bundle's included
   instructions, connected service and setup requirements.
3. Install it through the native control.
4. Connect AE when prompted during install or first protected use. Confirm that
   workspace and source permissions remain unchanged.
5. Start the fresh chat or task required by the surface.
6. Say, in ordinary task language, what outcome is needed.
7. Receive one real public Operation or a truthful no-match result.
8. If the selected action needs access, complete the native connection and
   owner approval, then return to the same Operation and input.
9. Receive the first useful result or one exact next action.
10. Remove the plugin. Confirm the product does not claim that the AE or source
    account was disconnected. Disconnect or revoke it through its separate
    supported control.

### Journey B — native MCP fallback

Run separately for each claimed Codex, Claude Code and Cursor version.

1. Start with a clean client profile and no shell variables prepared for AE.
2. Copy the one published setup action. The copied value contains the real
   origin and works unchanged.
3. Start a fresh task and describe the desired outcome directly.
4. Public search returns one real result before authentication.
5. A protected inspection triggers the client's own authorisation flow.
6. Complete approval and return to the same task, Operation and input.
7. The agent uses existing discovery and account reads to prove access without
   asking the person to interpret diagnostics.
8. Restart the client and continue from the same stable references.
9. Revoke access, confirm the next protected action fails cleanly, and reconnect
   through the client's own control.

### Journey C — Provider from fit check to current status

Run once for each supported source family and both public and protected sources.

1. Open `/for-providers` signed out.
2. Without protocol knowledge, answer: Is this for me? What must I already have?
   Can AE's check touch or cost my service? What happens after submission? What
   does Published mean? How long is known and what is unknown?
3. Choose the single “List a service” or equivalent action and sign in.
4. Supply the existing source; do not recreate its schema.
5. Let AE find candidates and choose one. Record the stable draft reference.
6. If connection is required, use the official OAuth/hosted flow. Separately
   exercise the secure manual credential fallback only for a source that has no
   maintained authorisation flow.
7. Close the browser during the handoff, reopen from the stable attempt, and
   complete it. Repeat in a second tab and after expiry.
8. Return to the exact saved source and selected Operation on every branch. In
   particular, the manual credential branch must retain the draft as the OAuth
   branch already does.
9. Review only the price, description, effects, data use and evidence facts AE
   owns; submit once.
10. Read the current eight-state projection. A redirect or “Submitted” message
    alone cannot prove publication.

### Journey D — recovery in ordinary language

Exercise at least: no match, catalogue unavailable, client installed but not
connected, insufficient authority, insufficient balance, source connection
lost, source changed, validation stale, expired connection attempt, missing
Call, possible dispatch and reconciliation required.

For each state:

1. Human and machine surfaces identify the same underlying state.
2. The first message says what happened in ordinary words.
3. It says what was not changed when that matters.
4. There is one safe action, or no action when waiting is the only safe choice.
5. “Try again” appears only when retry is known safe.
6. A human handoff includes a stable, private-safe reference.
7. Technical detail is available through the existing disclosure pattern.
8. The same emitted link or command works unchanged after restart and from the
   current origin.
9. Private problems do not require posting transaction or personal information
   to a public GitHub issue.

### Journey E — language and claim parity

Using one fixture for each consequential state:

1. Compare the public page, owner page, HTTP response, MCP tool result, CLI and
   generated guidance.
2. Confirm they agree on Operation, Provider, Seller where known, price, state,
   uncertainty, stable reference and next action.
3. Confirm the public wording is understandable without the glossary.
4. Confirm details retain the exact commercial distinctions.
5. Follow every rendered link and copied command; labels alone do not pass.
6. Withhold any readiness or support claim whose deployed evidence is absent or
   stale.

## Planning gates

Package 6 should not begin implementation until the plan records:

1. Which supported surfaces have a maintained directory or plugin install and
   which require native MCP setup. Unsupported surfaces stay explicit.
2. The one current, same-revision proof for every published install action.
3. The real safe Operation used to prove public first value.
4. The exact durable reference carried through every sign-in and Provider
   connection branch, including the manual credential return.
5. The owner of every changed claim, message and action.
6. The plain-word-to-canonical-term mapping used by public and consequential
   surfaces.
7. The selected maintained private support channel.
8. A rerun of the Package 6-related papercuts against one deployed baseline.
9. A closure scan proving that no installer, OAuth client, consent screen,
   Provider schema, docs platform, workflow engine, status machine, error
   taxonomy, copy framework, diagnostics console or ticketing system was added.

## Validation performed for this research

The current focused source tests passed:

```text
7 test files passed
51 tests passed
```

They cover client command generation, sign-in return selection, Provider
connection handoff routing, source-native selection, Provider status, support
links and shared continuations. They do not prove a deployed client install,
OpenAI Plugin Directory package, real public result, actual Clerk return,
external OAuth, manual credential draft resumption, private support or live
publication. Those omissions are precisely the black-box work above.

## Close decision

The inverse premortem changes the centre of Package 6:

- from **teach setup** to **start with the job**;
- from **choose among integrations** to **use the environment already open**;
- from **connection successful** to **the first useful result arrived**;
- from **canonical vocabulary everywhere** to **ordinary words mapped to exact
  records**;
- from **new guidance machinery** to **existing state plus one safe action**;
- from **more documentation** to **small AE compatibility notes beside the
  maintained source**.

If implementation begins by adding a wizard, framework, taxonomy, status,
protocol guide or installer, the Package 6 premise has already failed.
