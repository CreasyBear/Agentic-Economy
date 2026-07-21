---
phase: 04
status: proposed
design_system: Astryx neutral
authority: DESIGN.md
---

# Phase 4 UI contract

## Experience promise

The interface should make one sentence true:

> A business can show what it can do; a customer can ask for it; AE can compare
> real responses and safely start the chosen work.

The primary object remains the customer's objective and current work. Capability
setup is a protected supply-side workflow. Quote details and action detail
support the outcome; they do not become the product home.

## Information architecture

| Area | Route | Job |
|---|---|---|
| Ask | `/` | Start an objective or standalone task |
| Businesses | `/registry` | Discover admitted businesses and current supported operations |
| Activity | `/activity` | Resume active and completed customer work |
| Request detail | `/activity/$requestRef` | Requirements, sourcing, options, selected work and recovery |
| Action detail | action-class route | Inspect one exact action and safe continuation |
| Supply entry | `/claim` | Establish business identity and explain operation activation |
| Owner operations | `/owner/capabilities` | Configure and maintain supported operations |
| Owner operation | `/owner/capabilities/$publicationRef` | Connection, readiness, publication, pause and repair |
| Founder assist | `/admin/supply-onboarding/$caseRef` | Assist a draft without impersonation or secret custody |
| For agents | existing agent entry | Explain and expose the matching structured contracts |

`/registry` never owns a Customer Request comparison. `/activity` never owns
business or provider results. Phase 3C Sandbox routes remain evaluator-only and
do not become public IA.

## Shared shell versus domain ownership

Shared UI may render:

- objective/task identity and lineage;
- business/provider display identity;
- consequence and maximum commitment;
- data disclosed and to whom;
- source-issued state and blockers;
- evidence environment/class;
- zero or more read-only links and exactly the allowed commands;
- current uncertainty and durable next action.

The registered operation/domain owns:

- input labels and validation;
- quote/result/evidence meaning;
- price, expiry, terms and exclusions;
- domain comparison fields;
- cancellation and reconciliation language;
- fulfilment and completion evidence;
- adapter-specific setup instructions.

No shared component parses raw provider payloads, accepts executable/HTML/tool
blocks, or implements a universal form/action DSL. Closed source-issued field
descriptors are allowed only for the registered contract that validates them.

The neutral Activity/work-item shell must render both a Request-owned RFQ work
summary and an existing paid-operation work summary without importing either
domain panel. Domain detail stays in `QuoteComparisonView` or
`AePaidOperationCard`; the shell owns only identity, status, consequence
summary, evidence label and detail relation.

## Phase 4A surface states

| State | Meaning | Only valid movement |
|---|---|---|
| Draft | Nothing is public or routeable | Continue setup or abandon |
| Profile published | Discovery facts only | Add supported operation |
| Operation registered | Contract exists; no connection implied | Configure connection |
| Connection incomplete | Exact endpoint/adapter/credential blocker exists | Complete blocker |
| Check running | Read-only readiness observation underway | Wait or inspect |
| Check failed | Named current check failed | Correct and recheck |
| Eligible, not published | Ready mechanically; not exposed | Review and publish |
| Published and ready | Routeable on named intended surface | Inspect, pause or update |
| Readiness expired | Prior evidence is stale | Recheck; do not route |
| Paused/withdrawn | New work unavailable; history preserved | Repair/recheck before resume |

The owner must be able to answer without technical detail: what customers can
ask the business to do, what is public, what AE connects to, whether it is
actually ready, what blocks it, and what publish/pause changes.

## Phase 4B request and quote states

```text
needs_information → ready_to_source → disclosure_review → sourcing
                  → partial → quotes_ready
```

Every supplier is independently:

```text
queued | contacted | responded | refused | unavailable | timed_out
| uncertain | invalid | expired
```

The surface says “2 of 3 viable quotes received,” not “three options,” when one
is unavailable or uncertain. It names evaluated businesses, disclosed fields,
quote source/revision/expiry, comparable fields, unknowns and commercial
influence.

Ranking is absent unless source truth supplies a declared customer priority,
comparable shapes/currency and known influence. `Not supplied` replaces guesses.

Throughout 4B, selection, authority and work-start state are explicitly absent.

## Phase 4C selection and work states

```text
selected → needs_authorization → authorized_not_started → starting
         → released_or_waiting → completed_or_recovery
```

Required alternatives remain first-class:

- selection or quote expired;
- provider/terms changed;
- pre-release refusal;
- duplicate command absorbed;
- possible external release;
- uncertain result;
- cancellation requested/unknown/confirmed;
- partly completed;
- reconciled not effected/effected.

The operation uses its exact public verb: accept offer, place order, book, pay,
send or cancel. Shared UI never labels all consequences “run.”

Selection is not authorization. Authorization is not execution. Uncertainty
shows inspect/reconcile only. A replacement provider or changed offer requires
new selection, authority and invocation identities.

## Layout and interaction

Use Astryx neutral and the semantic bridge in `src/styles/globals.css`. Tailwind
is layout only. No new component system, palette, design token or Phase 3C
sandbox vocabulary.

Desktop Request detail uses an outcome header, a compact work/status rail and a
single main reading column. At narrow widths the rail becomes an ordered summary
above content. Comparison tables become labelled stacked records rather than
horizontal scroll.

Every stateful command has visible focus, pending, disabled, success and error
behavior. Pending transport never optimistically changes durable truth. Live
announcements are short and atomic; polling must not reread a whole page.

## Accessibility contract

- keyboard-only completion of setup, sourcing, selection and recovery;
- persistent labels and descriptions;
- error summary plus first-error focus for multi-section setup;
- visible focus and practical 44px targets;
- 320px and 400% zoom without page-level horizontal scrolling;
- non-colour state cues and safely wrapped long names/terms/references;
- accessible row/column meaning in comparison before stacked transformation;
- stable skeleton geometry, 120–250ms functional motion and reduced motion;
- expiry and uncertainty expressed in text, never colour alone.

## Mock and evidence labelling

Every fixture surface persistently says `Local labelled sandbox` or
`Hosted mock sandbox`. Fixture businesses are visibly mock businesses. A label
cannot be hidden in technical detail.

Never render fixture content as verified supply, live customer quote,
independent settlement, fulfilment, traction or production readiness.

## UI RED matrix

| RED | Required proof |
|---|---|
| `profile_publication_is_not_operation_routeability` | A published listing with failed readiness never says available/live |
| `three_attempts_do_not_collapse_into_one_loading_state` | Per-supplier progress and uncertainty survive reload |
| `partial_or_expired_quotes_are_not_ranked_as_complete` | Coverage, expiry and comparability are visible |
| `selection_is_not_authority_or_execution` | Three distinct durable states and copy |
| `possible_release_has_no_retry_control` | Only inspect/reconcile is actionable |
| `browser_storage_is_not_request_custody` | Another tab/direct Activity URL resumes from server state |
| `shared_shell_is_domain_neutral_without_becoming_a_dsl` | RFQ Request and paid-operation summaries use the same shell while domain panels retain quote/payment fields |

## Existing hazards to correct, not copy

- `claim.tsx` currently models public service/inquiry state, not registered
  operation setup.
- `claim.success.tsx` can imply “live” from discovery publication alone.
- owner status and capability cards are inquiry/listing-shaped.
- the current Options panel is quote-shaped and should become a quote-domain
  panel, not the universal option renderer.
- `AeCustomerRequestWorkspace.tsx` is already a large browser host; split it
  before adding Activity/sourcing.
- technical `quoteDigest`/choice codes do not belong in primary customer copy.
- legacy CSS retirement is not a Phase 4 gate, but no new Phase 4 surface may
  depend on it.
