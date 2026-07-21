---
phase: 04
status: accepted_target_contract
decisions: D-011,D-012
accepted: 2026-07-21
design_system: Astryx neutral
authority: DESIGN.md
implementation: pending
---

# Phase 4 UI contract

## Experience promise

A business operator always knows which business they are operating, whether
customers can find it and request named work, what needs attention, which Work
is waiting, which conversations need response and the one safe next action.
They do not need AE's control-plane vocabulary.

## Information architecture

```text
Current business [switch]

Home
Work
Inbox
Offerings
Business settings
Help
```

History is a secondary route. Integrations is canonical at Business settings →
Integrations. Offerings and Integrations link many-to-many. A technical member
may receive a shortcut to the same canonical route.

Desktop uses a compact business sidebar and one main reading column. Mobile
keeps current business persistently visible. Home, Work and Inbox are reachable
in one interaction from every first-level business view; Offerings, Business
settings and Help are reachable in at most two. The component remains reversible.

## Surface separation

| Customer surface | Technical disclosure | Founder/backstage |
|---|---|---|
| visibility, availability, Work, Inbox, Offerings, settings and Help | exact revisions, bindings, checks, evidence and retry posture | portfolio, relationship, private tasks/notes, support ownership and releases |

Technical disclosure never exposes secret values. Founder commands are
attributable and never impersonate a member.

## Shared view primitives

Every source readback may carry identity, source revision, observed time,
current-until time, incompleteness, allowed commands and provenance. Views may
reuse stable loading, empty, partial, stale, forbidden, conflict and uncertain
components, but the continuation is view-specific below.

Transport acceptance renders Saving/Checking until source-owned readback.
Possible external effect never exposes retry.

## View contracts

### Home

- Shows current business; Visible to customers; per-offering Available through
  AE; deduplicated attention; waiting Work; response-needed Inbox; onboarding.
- Reads a removable source-reference summary and bounded source-owned lists.
- Performs no consequential command. It opens canonical source views or
  refreshes/rechecks one named fact.
- Loading preserves answer slots. Empty means nothing needs action. Partial
  names the unavailable section. Stale removes shortcuts. Guessed business is
  refused before shell entry. Uncertain Work links to detail without retry.

### Work list

- Shows customer action, counterparty, consequence summary, source state,
  attention reason and currentness.
- Reads removable business-affinity references; it never owns result truth.
- Work operations may open items and use only explicitly list-safe commands.
- Empty means no current Work. Partial keeps exact links. Stale suppresses
  shortcuts. Unauthorized items do not leak. Uncertain items say Needs
  checking and open exact detail.

### Work detail

- Rehydrates exact Action Invocation, attempt/effect generation, authority use
  and operation-owned result.
- Shows consequence, commitment, shared data, status, evidence, uncertainty and
  source-issued continuation.
- Only current commands render. Approval, release, retry and cancellation
  remain distinct.
- Stale state refreshes before command. Conflict invalidates stale command
  preparation. Possible effect permits inspect/reconcile only.

### Inbox

- Shows business-scoped conversation summary, unread/response-needed state,
  delivery issue and linked Work.
- Customer communication may filter, open and mark read.
- Message text alone never creates Work.
- Empty means no response-needed messages, not no history. Partial never
  invents zero. Stale refreshes. Uncertain outbound delivery suppresses resend.

### Conversation

- Shows ordered messages, participants, delivery, response need, linked Work
  and attributable timestamps.
- Customer communication may reply, mark read and close/reopen where supported.
- A reply never claims booking, payment, dispatch or fulfilment.
- Loading disables composer until authority/current revision. Conflict
  preserves draft and reveals newer messages. Possible delivery offers check,
  not blind resend.

### Offerings

- Shows customer name, visibility, narrow availability, supported customer
  action and attention reason.
- Reads business/catalog facts with referenced operation/availability facts.
- Offering management may create, order, preview, publish, pause or retire.
- Saving/publishing never implies executable availability. Missing availability
  is Unknown. Stale availability remains separate from visibility.

### Service detail

- Shows public fields, draft/published difference, customer action,
  availability and affected Integrations.
- Offering management edits/saves/previews/publishes; availability changes
  require matching responsibility.
- An admitted seed offering may expose `Run test request` in a persistent
  `Labelled sandbox` context. It uses the protected Business Account test route,
  creates attributable source records and never claims a real provider ran.
- Exact revision is required. Conflict compares current and draft. Publish
  remains Checking until accepted readback.

### Availability

- Shows Available, Limited, Paused, Unavailable or Unknown; reason; observation;
  customer impact; domain summary.
- Domain policy owns configuration and commands.
- Pause preview separates new requests from accepted Work. Hours do not prove a
  slot/capacity.
- Missing/expired evidence yields Unknown. Stale suppresses acceptance where
  current evidence is required. Uncertain pause/resume waits for readback.

### Integrations

- Canonical route is under Business settings.
- Shows name/purpose, account or offering scope, affected offerings, source
  state, last check, blocker and safe action.
- Technical integration may configure, check, reconnect, disable and inspect.
- Secrets never render. Security-critical change requires step-up.
- Partial connection data does not mark every dependent offering unavailable.
  Stale requires recheck. Binding conflict requires exact revision. Uncertain
  checks never trigger destructive automatic reconnect.

### Team and access

- Shows member/invite status, presets, effective responsibilities, Ownership,
  expiry and attributable changes.
- Business administration invites/changes/suspends/removes; Owner handles
  transfer/closure.
- Ownership never follows from permission union. Last Owner commands are
  absent and server-refused.
- Unknown/stale effective access disables mutations. Conflicts require
  reconfirmation. Uncertain invite delivery is checked/replaced without
  duplicate grants.

### Business settings

- Contains Integrations, Team, Commercial & Usage, personal-security link,
  data/export and lifecycle.
- Personal identity/security remains at `/settings`.
- Section commands require their matching responsibility.
- “No paid plan applies” is a complete state. The Commercial section shows
  arrangement and status separately, entitlement revision/effective period,
  billing contact/period, opaque invoice/payment currentness references and
  their `asOf`/completeness. Usage shows the named meter, current period,
  settled/held/remaining units, limit, `asOf` and completeness.
- Customer-to-business operation payment stays on Work detail. No payout,
  earnings, balance, raw provider/payment or secret material renders.
- Commercial labels and remaining Usage never grant Work authority. Closure
  shows durable progress and preserves history.

### Help and support

- General help remains usable while case data loads.
- Shows customer-visible cases/messages only; private notes never render.
- Support interaction may open/reply/resolve/reopen.
- Support cannot rewrite Work, Offering or Integration truth. Uncertain reply
  delivery offers check rather than resend.

### Founder account detail

- Shows relationship, accountable founder, people, onboarding tasks,
  reason-coded attention, customer support, Commercial/Usage references and linked
  source truth.
- Founder/admin commands name the actual actor.
- Partial source failure never invents At risk. Lifecycle reduction requires
  fresh revision. Offboarding shows durable progress and failed references.

## Fixed view-state and continuation matrix

This matrix is required in addition to the view descriptions. A generic
fallback cannot replace a cell.

| View | Source truth | Commands / responsibility / boundary | Loading | Empty | Partial | Stale | Forbidden | Conflict | Uncertain | Exact safe continuation |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Home | membership context plus reference summary | permitted members; open/refresh only; no consequence | stable answer slots | no attention or source task | name failed section | remove shortcuts/show age | refuse before shell | owning view | link possible effect; no retry | canonical owner or named refresh |
| Work list | business-affinity references | Work operations; no result/retry/cancel | stable rows/filters | no current Work | label missing domain | suppress shortcuts | omit/direct refusal | refresh row | Needs checking | exact Work detail |
| Work detail | invocation, attempt/generation, authority, domain result | Work/action authority; readback commands only | stable identity; no transient success | unavailable/forbidden | preserve known facts | refresh before command | non-enumerating refusal | discard stale preparation | explain effect; reconcile only | exact source-issued command |
| Inbox | business inquiry summaries | Customer communication; text cannot create Work | stable rows/filters | no response-needed messages | never invent zero | refresh shortcut | omit/direct refusal | refresh thread | no resend | Conversation/retry read |
| Conversation | thread/messages/delivery/Work ref | Customer communication; reply is not fulfilment | composer disabled | explain absence | label missing history | pause/refresh | no metadata | preserve draft/show new | check delivery | refresh/check/open Work |
| Offerings | catalog plus referenced availability | Offering management; publish not availability | stable order | explain first offering | Unknown availability | visibility stays/age availability | read-only/refuse | refresh revision | Checking | Service/Availability/Integration |
| Service detail | draft/current/published revisions | Offering management; availability separately authorized | no commands before revision | unpublished draft | preserve editable facts | stale draft cannot publish | read-only/refuse | compare/copy/discard | wait readback | correct/resolve/preview/relation |
| Availability | domain policy/observation | Availability responsibility; domain commands | last confirmed plus age | unsupported/not configured | Unknown | suppress acceptance | summary only/refuse | preserve policy/draft | wait readback | domain configure/recheck/pause/resume |
| Integrations | binding/readiness/offering refs | Technical integration; no secrets; step-up critical changes | last confirmed aged | none configured | dependencies stay distinct | recheck | impact only/refuse config | exact revision | no destructive reconnect | recheck/repair/diagnostics |
| Team/access | membership/invitation/grants/Ownership | Business admin; Owner transfer/closure | no edits before authority | Owner plus invite | disable mutations | refresh remove/widen | hide/refuse | show change/reconfirm | check/replace invite | correct/accept/add Owner |
| Business settings | section source owners | matching responsibility; closure preserves history | section-level | no-charge complete | other sections usable | refresh sensitive command | hide/refuse | expected revision | resume durable run | update section/resume |
| Help/support | help and visible cases | Support interaction; no truth rewrite/private notes | help usable | no cases/contact action | case still usable | refresh reply/resolve | no content | preserve draft | check delivery | case/guidance/linked owner |
| Founder account | relationship/tasks/support/commercial/source links | explicit admin; no impersonation/rewrite | section skeletons | plainly absent facts | never invent At risk | refresh lifecycle | backstage refusal | show intervening action | durable progress/failures | admin command/source/resume |

## Queue and attention contract

Work is the sole operational queue. Inbox is conversation. Help owns support.
Integrations owns connection repair. History is evidence.

Conversation links to Work only after a source-owned transition creates a
durable operational identity. Each source owns its count. Home references
attention by:

```text
sourceKind + sourceRef + reasonCode + sourceRevision
```

One underlying condition appears once, with related messages or connections as
context. Home priority is uncertainty, blocked Work, customer response,
availability/Integration blockage, security/access, onboarding, then support.

## Responsibility visibility

Presets initially expose additive responsibilities:

| Preset | Visible responsibility composition |
|---|---|
| Owner | all responsibilities plus protected Ownership |
| Administrator | business administration, Offerings, Work, Inbox, support, reporting |
| Operations | Work, Inbox and operational availability |
| Billing | AE Commercial/Usage administration and reporting; never Work authority |
| Developer | Integrations, diagnostics and reporting |
| Viewer | reporting/read only |

The UI may hide unavailable navigation for clarity. Direct routes and commands
always re-evaluate server authority. Sensitive widening, ownership transfer,
closure and security-critical Integrations require step-up.

## Horizontal shared-field boundary

Paid digital information, appointment-shaped and dispatch-shaped offerings use
the same shell. Shared availability owns only disposition, customer impact,
reason, observation/currentness, source, allowed actions and domain-detail link.

Price/currency/payment, calendar/slots/duration, and fleet/zone/capacity/
fulfilment remain in domain panels. Shared Work shows identity, action class,
counterparty, consequence summary, source status, attention, provenance, safe
continuation and domain-detail link—never one universal lifecycle.

## Shared human and agent semantics

One versioned Business Account semantic projection supplies both the human
shell and scoped-agent API. It includes account and source revision, effective
membership/responsibilities/Ownership, relationship, offering/readiness
references, Commercial arrangement/status/entitlement/currentness, Usage
period/balance/`asOf`/completeness, attention references and source-issued safe
continuations. The agent projection adds machine commands; the human projection
adds routes and copy. Neither infers missing truth.

A human session and scoped agent credential at the same source revision must
agree semantically. A semantic digest proves equality only; it is not identity,
membership or authority. Guessed account, stale membership, forged principal,
wrong business and cross-account API key receive the same non-enumerating
server refusal before projection or command.

## Literal core copy and command labels

These strings are contract examples for the first executable loop; operation-
specific nouns may replace “operation” only from source presentation.

| State | Heading | Explanation | Primary action |
|---|---|---|---|
| Home clear | `You're ready for new work` | `Your published offerings can receive requests through AE.` | `View offerings` |
| Home attention | `One thing needs your attention` | Source-owned reason and currentness follow. | exact source continuation |
| Work empty | `No work needs attention` | `New and completed work will appear here.` | `View offerings` |
| Inbox empty | `No replies are waiting` | `Customer conversations will appear here.` | `View conversation history` |
| Commercial no charge | `No paid plan applies` | `This account currently has no AE account charge.` | `View arrangement details` |
| Usage current | `Usage is current` | Named meter, period, settled/held/remaining and `asOf` follow. | `View usage details` |
| Usage incomplete | `Usage needs checking` | `AE cannot confirm the current balance yet. No additional quota will be used until this is resolved.` | `Check usage` |
| Offering sandbox | `Test this offering` | `This labelled sandbox creates a real AE work record without contacting a real provider.` | `Run test request` |
| Work uncertain | `We need to confirm what happened` | `AE will not try this operation again until the previous attempt is reconciled.` | `Check outcome` |
| Relationship paused | `New work is paused` | `Existing work and history are preserved.` | `Review pause` |
| Offboarding partial | `Offboarding needs attention` | Name the failed withdrawal step and preserved state. | `Resume offboarding` |
| Fatal section error | `We couldn't load this section` | `Other account areas are still available. Try this source read again.` | `Try again` |

Consequential labels use verb plus object: `Publish offering`, `Pause new work`,
`Disable integration`, `Remove member`, `Transfer ownership`, `Close business
account`. Ownership transfer, last-member removal attempt, Integration disable,
offering retirement and account closure require a confirmation naming what
stops, what remains and the exact safe continuation. Possible external effect
never offers `Try again`.

## Visual constraints and registry safety

Use a 60/30/10 balance: neutral canvas, white/quiet surfaces and Eucalyptus only
for the primary action, current selection or active progress. Use at most four
type sizes and two weights; body copy uses at least 1.5 line height. Use the
4/8/16/24/32/48/64 spacing scale unless a component contract records an
exception. Phase 4 uses Astryx neutral and existing AE components only; no
third-party registry block is admitted without dated design and security
vetting.

## Provenance

Visible, Available, Paused, Stale and Needs checking state:

- what it means;
- who/what supplied it;
- when it was observed/changed;
- whether it is current;
- the safe next action;
- a “Why this status?” disclosure.

“Verified” requires a named standard and matching evidence.

## Design system and accessibility

Use Astryx neutral and the semantic bridge in `src/styles/globals.css`.
Tailwind is layout only. Eucalyptus marks primary action, selection and active
progress rather than decoration.

- 320px and 400% zoom without page-level horizontal scrolling;
- persistent business context and labels;
- 44 by 44 CSS pixel practical targets;
- visible focus and predictable focus return;
- keyboard completion of every permitted task;
- tables transform to labelled records;
- text plus icon/shape for status;
- bounded atomic live announcements;
- 120–250ms functional motion and reduced-motion behavior;
- safely wrapped names, reasons and references.

Home is a ranked operating brief, not a grid of equal-weight cards.

## Contract falsifiers

- published profile plus failed readiness never says Available;
- stale observation suppresses request acceptance when currentness is required;
- guessed business never enters the shell;
- Billing cannot act on Work;
- Developer cannot invite members;
- last Owner cannot be removed;
- transport acceptance never says Saved;
- uncertain dispatch suppresses retry/resend;
- paused new availability preserves accepted Work;
- hidden navigation and direct command agree;
- one Integration-many offerings and one offering-many Integrations remain
  coherent;
- paid information, appointment and dispatch panels add no vertical fields to
  shared shells;
- 320px, 400% zoom, keyboard and reduced-motion journeys lose no information.

## Evidence boundary

This contract authorizes documentation and future implementation planning. It
does not prove usability, customer validation, accessibility in use, hosted
behavior, provider fulfilment, payment, settlement or production maturity.
