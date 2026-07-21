---
phase: 04-market-activation
type: product-and-engineering-plan
status: proposed_ready_for_founder_review
depends_on:
  - final Phase 3C integration revision
subphases:
  - 04A-routeable-supply-onboarding
  - 04B-three-viable-quotes
  - 04C-close-one-and-see-it-through
---

# Phase 4A–4C implementation plan

## What we are building

Phase 4 makes AE usable for founder-led market activation. The founder can
onboard supply, enter a customer need, show current comparable offers, and
start one exact provider operation without asking an engineer to edit data or
explain the control plane.

This is a vertical product conversion over existing source owners. It is not a
new marketplace kernel.

```text
SUPPLY                              DEMAND                         CLOSE
Business                            Customer Request               Registered Action
  ↓                                  ↓                              ↓
Capability contract                 Material requirements          Exact selected offer
  ↓                                  ↓                              ↓
Offering + binding                  Qualified suppliers            Authority + attempt
  ↓                                  ↓                              ↓
Eligibility + readiness             Attributable quotes            Business result
  ↓                                  ↓                              ↓
Published operation                 Honest comparison              Activity/recovery
```

## Operating rules

1. Parent owns phase authority, exact base, custody, cross-phase interfaces,
   integration, deployment authorization and claims.
2. One plan-owned writer works at a time. Read-only audits may run in parallel.
3. Every writer starts from the parent-integrated revision of its predecessor.
4. Every parcel has one named semantic RED. Broad suites are not the loop.
5. A child may change only exact writable paths. An unexpected path is a stop,
   not an invitation to clean or restore it.
6. Source-issued projections precede UI work. UI never invents routeability,
   comparison, authority, evidence or commands.
7. Each child gets one bounded correction for a source-linked defect in its
   owned slice. Contract changes, new tables outside the plan, or cross-owner
   repairs return to the parent.
8. Real provider/customer onboarding is not an implementation dependency.
   Fixtures are persistently labelled. Claims never exceed the evidence class.

## Phase 4A — Routeable supply onboarding

### 4A outcome

An authenticated owner or authorized founder operator can resume a business
onboarding case, configure one supported operation, connect an opaque
credential reference, run a guarded readiness check, see exact blockers, and
publish or pause it. Public discovery shows the operation only while its
canonical routeability facts are current.

### 4A-0 — Freeze contracts and hostile substitutions

Parent owns ADR-022 acceptance candidate and freezes these terms:

- draft versus canonical supply;
- token-identifier owner authority;
- opaque credential-custody port;
- source-issued onboarding/readiness projection;
- removable executable-operation search projection;
- exact routeability gate conjunction.

The first child writes RED tests before implementation. Required substitutions:

- claimed/public business becomes unadmitted;
- contract becomes inactive or digest changes;
- offering becomes inactive or integrity changes;
- binding becomes unadmitted, non-conformant or points elsewhere;
- credential becomes unavailable;
- readiness becomes unhealthy, stale or revision-mismatched;
- public projection remains stale after canonical withdrawal.

Every mutation must remove routeability. No form success or projection row may
override the source graph.

### 4A-1 — Canonical identity, custody and onboarding draft

Add a resumable capability-onboarding draft owned by capability supply. It
stores canonical JSON/digests and an opaque `credentialRef`, never secret
material.

Draft status is one of:

```text
draft | validating | ready_to_publish | published | needs_attention | abandoned
```

Required fields:

```text
draftRef, businessId, ownerTokenIdentifier, revision, status,
sourceKind, contractDocumentJson, contractDigest,
offeringDraftJson, offeringDigest, bindingDraftJson, bindingDigest,
credentialRef, currentStep, validationIssues,
publicationRef?, publishedRevision?, createdAt, updatedAt
```

Required indexes:

- `by_draftRef`;
- `by_businessId_and_status_and_updatedAt`;
- `by_ownerTokenIdentifier_and_updatedAt`.

Migrate owner authorization to token identifier with bounded dual-read and a
resumable backfill. Do not rename or reinterpret historical owner IDs.

Bindings declare `credentialMode: none | managed_ref`. Open endpoints are valid
with `none`; the UI must not manufacture a credential blocker for them.
Authenticated endpoints use an injected custody interface and the existing
server-resolved environment-reference adapter as the first configured
founder-assisted implementation. Owners never type raw secrets into the web
form: a founder/operator provisions the secret through the deployment's
protected configuration channel and records only its managed reference. A
labelled mock adapter drives fixtures. Self-service secret intake or a different
external secret manager requires a later custody decision, but Phase 4 can
truthfully onboard open endpoints and founder-provisioned authenticated ones.

The credential mode is executable policy, not descriptive metadata. Carry it
through binding admission, publication, readiness and route execution. `none`
must not invoke a credential resolver or emit an Authorization header.
`managed_ref` fails closed at every boundary until the exact source-owned
reference resolves; no caller may downgrade it during execution. The mode is
persisted and reconstructed with the canonical binding and participates in the
probe target/digest, so changing it invalidates earlier readiness evidence.

End condition: the draft survives reload, rejects raw credentials, enforces
expected revision, and cannot independently create routeable supply.

### 4A-2 — Publish, readiness and operation projection

The application service validates the draft, calls the existing canonical
contract/offering/binding/publication commands, then schedules or invokes a
guarded readiness observation. Partial failure leaves an inspectable inactive
publication; it never manufactures a ready row.

Add a removable registry projection containing only current discovery facts:

```text
logicalKey, businessId, publicationRef, publicationRevision,
capabilityId, version, contractDigest, offeringId, bindingId,
label, summary, searchText, sourceKind, environment,
routeabilityStatus, readinessObservedAt, readinessValidUntil,
sourceDigest, generatedDigest, updatedAt
```

Required indexes:

- `by_logicalKey`;
- `by_publicationRef_and_publicationRevision`;
- `by_businessId_and_routeabilityStatus_and_updatedAt`;
- search `search_searchText_by_routeabilityStatus`.

Maintain `by_routeabilityStatus_and_readinessValidUntil` and invalidate expired
projection rows in bounded batches of 100. Public search may follow at most
three cap-plus-one cursor pages (hard scan ceiling 150) and returns at most 50.
If valid results beyond that ceiling are unknown, the page returns
`coverage: incomplete` plus a continuation cursor; it never implies exhaustive
membership. Exact execution resolves canonical source records again.

End condition: a projection can be deleted/rebuilt without losing supply; an
expired or withdrawn operation disappears from routeable discovery; 10,000
unrelated operations do not expand the read budget for one page.

### 4A-3 — Owner/founder surface

Create protected routes:

- `/owner/capabilities` — list current operations and blockers;
- `/owner/capabilities/new` — configure one operation;
- `/owner/capabilities/$publicationRef` — inspect, test, publish, pause or repair;
- `/admin/supply-onboarding/$caseRef` — founder-assisted draft and admission
  case without owner impersonation or raw credential custody.

The route sequence is:

```text
business identity → public profile → supported operation → connection
→ readiness → publish/pause
```

The UI renders only source-issued state and allowed commands. It must visibly
distinguish profile publication, operation registration, mechanical
eligibility, current readiness and intended-surface reachability.

End condition: a fresh evaluator can identify what is public, what operation
is supported, whether it is routeable, the exact blocker and the consequence
of publish/pause/update.

### 4A-4 — 4A integration evidence

Run the owner workflow with three labelled fixture cases:

1. valid contract, missing credential;
2. ready then readiness-expired;
3. published then paused/withdrawn.

Generate a source/local packet that recomputes gate dispositions and projection
digests. Hosted readback is optional until the Phase 4C release cut. Do not call
fixtures real providers.

The parent then runs the repository's route generator, owns only the generated
route-tree diff, verifies the four owner/founder route IDs and imports, and runs
focused route tests plus typecheck. Children do not edit generated routes.

## Phase 4B — Three viable quotes

### 4B outcome

A customer can describe one digital project, review the material requirements
and disclosure, ask up to three qualified providers, and compare the current
attributable offers that actually return.

### 4B-0 — Freeze one reference RFQ contract

Define and register one operation-owned contract pack outside the neutral
kernel:

- `digital_project.request_quote:v1` input and material fields;
- strict normalized quote result;
- comparable outputs and non-comparable domain evidence;
- validity, price/currency, terms, exclusions and response identity;
- source-specific raw adapters for three labelled mock providers.

`digital_project.request_quote:v1` is registered through
`src/modules/actions/index.ts`. Every supplier contact creates one Request-owned
Action Invocation/attempt/release identity before its operation adapter sends.
No sourcing application may call a provider quote adapter directly.

Persist each admitted normalized result in the reference operation owner:

```text
quoteResultRef, invocationRef, requestRef, requirementRevision,
supplierBindingId, operationRevision, resultDigest, normalizedResultJson,
rawEvidenceRef, observedAt, validUntil
```

The routing-kernel provider-offer row holds `quoteResultRef` and the comparable
projection needed by the Request. It is not the sole business source.

The shared Request/UI sees only the normalized contract. The fixture count and
website-project language stay in the reference operation and scenario.

End condition: crossed provider payloads, wrong requirement revision, wrong
currency, invalid price, expired offer and wrong supplier binding refuse.

### 4B-1 — Persist the existing structured-quote store

Implement the Convex adapter for the existing
`StructuredQuotePreparationStore`. Do not add a second quote schema.

Use the current candidate-set, candidate, attempt, provider-offer, execution
field and material-term tables plus operation-owned quote-result references.
Add only indexes proved necessary:

- candidates `by_candidateSetDigest_and_position`;
- attempts `by_candidateSetDigest_and_disposition`;
- offers `by_candidateSetDigest_and_expiresAt`;
- Request heads `by_principalId_and_updatedAt`.

Bound one action to at most 32 candidates/attempts/offers. The reference policy
contacts at most three.

Required transition truth:

```text
not_contacted → allocated → dispatched → quoted | unavailable | uncertain
```

`allocated` is pre-release. A timeout or invalid response after dispatch is
uncertain/reconcile-only; it is not an ordinary refusal and cannot silently
contact the same or a replacement provider.

End condition: cold restoration produces zero additional provider contacts;
duplicate commands produce one attempt; 10,000 unrelated offers do not expand
the exact candidate-set read budget.

### 4B-2 — Bounded qualified-supplier discovery and coverage

Replace graph-wide/N+1 candidate hydration for this intended surface with an
index-first exact capability/network projection query, then hydrate only the
selected eligible publications from canonical supply.

Customer Request owns sourcing coverage:

```text
evaluated, contacted, responded, unavailable, refused, pending, uncertain,
viable, expired, invalid
```

An eligible provider is not a quote. “Three viable quotes” requires three
current attributable normalized results. Partial results remain useful and
visible; the product does not wait forever or fabricate cardinality.

End condition: candidate discovery is bounded, requirements/disclosure are
bound to the exact Request revision, and each provider has independent release
and uncertainty truth.

### 4B-3 — Durable Activity request route and sourcing UI

After Request creation, navigate to `/activity/$requestRef`. Browser storage
may retain a convenience pointer but cannot be the only recovery mechanism.

Add:

- `/activity` — bounded current/completed Request list;
- `/activity/$requestRef` — working understanding, disclosure, sourcing
  progress and quote comparison;
- query/domain panels under Customer Request, not `/registry`.

Split the existing `AeCustomerRequestWorkspace`; do not add another lifecycle
to that file. The shared shell owns request orientation and commands. A
`QuoteComparisonView` owns quote-specific price, terms, expiry, coverage and
evidence. Do not widen the common action contract into a procurement DSL.

End condition: at 320px/400% zoom and by keyboard, a customer can distinguish
two-of-three results, one uncertain supplier, an expired quote, unknown fields,
commercial influence and the fact that nothing is selected or started.

### 4B-4 — Human/agent parity and evidence

The existing `/api/v1/requests` path exposes the same Request revision,
requirements, disclosure, coverage, normalized options, ordering basis and
safe actions as the human surface.

Golden cases:

- three comparable current quotes;
- two quotes plus one unavailable;
- two quotes plus one uncertain;
- one invalid/expired response;
- changed Request invalidates prior comparability;
- commercial influence unknown prevents recommendation.

Evidence ceiling: labelled local/hosted mock sourcing and comprehension only.

The parent then reruns route generation, owns only the generated route-tree
diff, verifies `/activity` and `/activity/$requestRef`, and runs focused route
tests plus typecheck before 4C starts.

## Phase 4C — Close one and see it through

### 4C outcome

A customer selects one current offer, understands exactly what accepting it
does, grants exact authority, starts the provider operation once and resumes
through success, refusal, cancellation or uncertainty.

### 4C-0 — Freeze close-operation ownership

Define the reference operation-owned `accept_offer` or `start_work` contract.
It binds:

```text
requestRef + requestRevision + routeGeneration
+ providerOfferId + offerDigest + issuerBindingId + expiry
+ provider operation/revision + exact terms/price ceiling
+ principal + disclosure + authority limits
```

The business result minimally distinguishes accepted/acknowledged work from
later fulfilment. Acknowledgement never closes the customer's whole outcome.

Register `digital_project.start_work:v1` through
`src/modules/actions/index.ts`. Persist the operation-owned result under an
exact `startWorkResultRef`; Customer Request and Activity keep only that
reference and a bounded display projection.

### 4C-1 — Exact selection and authority

Selection is a Customer Request v2 transition persisted as
`customerRequestV2QuoteSelections` with:

```text
selectionRef, requestId, requestRevision, routeGenerationRef,
providerOfferId, offerDigest, quoteResultRef, issuerBindingId,
selectedByPrincipalId, selectedAt, expiresAt, status
```

Indexes are `by_selectionRef`,
`by_requestId_and_requestRevision_and_selectedAt`, and
`by_providerOfferId`. The command requires expected Request revision and one
idempotency key; the latest Request readback exposes selection reference and
validity only after exact affinity validation.

Selection persists against the exact current offer and Request revision.
Material change or expiry invalidates it. Approval binds the prepared action;
possession of a Request, offer or selection is never authority.

Required REDs:

- stale Request/offer revision;
- replacement provider using old approval;
- changed terms, price, operation revision or recipient;
- duplicate selection/approval click;
- cross-principal read or command.

End condition: selection, authorization and start are distinct durable states
and human/agent projections agree.

### 4C-2 — Execute once and preserve business truth

Reuse existing Request execution and Action Invocation machinery. Do not add a
new activity, order or universal execution table.

The operation owner persists its result/reference. Shared records persist
authority, reservation, attempt, provider release, current effect generation,
resolution and safe continuation.

Crash cuts:

- before release;
- after possible release and before send returns;
- after provider response and before result commit;
- after result commit and before projection refresh.

Cold restoration must not duplicate effects. Possible release exposes inspect
and reconcile only. Late completion cannot overwrite a newer generation.

### 4C-3 — Activity, action detail and recovery

Activity reads exact, bounded source records:

1. current Request head/revision;
2. current route-plan generation;
3. exact selected offer;
4. approval/attempt/resolution;
5. current route-run head and capped step attempts;
6. capped problem/recovery history.

The UI shows selected offer, exact consequence, authority, released/possibly
released truth, business result, payment/fulfilment evidence when relevant and
only the source-issued safe next action. Request and Action Detail link to one
another without copying source truth.

Cancellation distinguishes requested, externally confirmed, unknown and
irreversible effects. Changing provider during uncertainty is absent.

### 4C-4 — Hosted founder demonstration and closeout

From one clean exact revision, deploy the already configured Vercel and Convex
targets only after the parent records separate release authorization. Run:

- one supply onboarding golden path;
- one human three-quote-to-close path;
- one structured-agent equivalent;
- one predeclared uncertainty/reconciliation goblin;
- one cold reload/resume path;
- one 320px/keyboard/accessibility pass.

Verify served revision before lifecycle mutation. Evidence packet verification
recomputes source revision/tree, fixture provenance, Request/offer/authority
identities, effect counts, projection parity and safe continuation.

The program stops if deployment identity differs, a real provider/payment
would be contacted, or exact-revision readback fails. It does not repeatedly
probe or reinterpret a failed external authorization.

## Completion standard

Phase 4 closes only when:

- the founder can onboard a labelled business operation without source edits;
- routeability is the conjunction of current canonical gates;
- public operation search is indexed, bounded and removable;
- quote attempts and normalized offers survive cold restoration;
- three is a sourcing policy, while partial/uncertain coverage remains honest;
- comparison rejects materially unlike or expired evidence;
- selection, authorization and execution are separate;
- possible release remains reconcile-only with zero duplicate effect;
- Activity reconstructs current work from source records;
- human and agent surfaces agree on material truth and commands;
- the hosted-sandbox loop is understandable and accessible;
- an independent review finds no unresolved P0/P1 in the declared surface.

No provider-quality, market-liquidity, fulfilment, settlement, production-safety
or customer-value claim follows.
