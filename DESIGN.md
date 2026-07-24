# Agentic Economy interface authority

## Design objective

Make consequential autonomy understandable and controllable without reducing
the product to confirmation screens.

The public category is an agent getting real work done with real businesses.
The routing engine, mandate ledger, and attempt machinery stay backstage.

Show that detail only when it explains a choice, consequence, exception, or
recovery path.

Brand leads on the public landing surface. Product begins when a person asks,
chooses an operating mode, reviews work, or intervenes.

## System

Use Astryx (`@astryxdesign/core`) with the neutral theme. Tailwind 4 supplies
layout only. The semantic token bridge in `src/styles/globals.css` is the visual
authority.

Do not create another component system, route-local palette, retired Daylight
layer, or bespoke visual language.

Ink, warm canvas, white surface, slate, and eucalyptus remain the base.
Eucalyptus identifies primary action, current selection, and active progress;
it is not decoration.

Status colours remain functional and always have text, shape, or icon
equivalents.

## Primary experience

The primary object is the **objective and current work**:

- what the person wants done;
- the useful tasks AE has identified and how they contribute to the outcome;
- the operating mode and remaining mandate;
- what the agent is doing now and with whom;
- material choices already made and their reasons;
- cost, timing, data sharing, and external commitments;
- what succeeded, failed, is uncertain, or needs intervention;
- the durable next action.

A standalone task appears as one compact piece of work. A broader Customer
Request appears as a sequence of recognizable actions.

Actions can be completed, active, next, optional, blocked, uncertain, or
human-owned. Do not force customers to inspect or approve a graph wholesale.

The interface must support both dimensions of the product. A person can inspect
one useful task horizontally or understand how several tasks combine vertically
into the outcome they asked AE to complete.

Show decomposition as an understandable work sequence, not a technical graph.
Name each task by its customer consequence, show why it exists, and expose
dependencies only when they affect choice, timing, cost, authority, or recovery.

Do not flatten unlike work into generic steps. Research, comparison,
recommendation, communication, booking, payment, monitoring, cancellation, and
recovery require distinct language, evidence, controls, and completion states.

The outcome remains the visual anchor. Task detail supports confidence and
intervention; it must not make the customer reconstruct the objective from a
list of protocol events.

Technical projections—Action Invocation, attempts, effect generation, provider
binding, quote digest, RoutePlan, and evidence—belong in progressive detail and
protected operational views.

## Operating-mode experience

Mode selection explains behavior, not fear:

| Mode | Interface behavior |
| --- | --- |
| Inspect only | Show findings and prepared actions; execution controls remain unavailable. |
| Approve each | Present the exact material consequence before every action. |
| Bounded mandate | Show the standing limits once, then act inside them without repeated prompts. |
| Full autonomy | Show the objective and broad mandate, then run end to end with a live activity record and exception-only step-up. |

The current mode is persistent and easy to inspect. Consequential modes show the
mandate's material limits in ordinary language.

Show maximum spend, timeframe, allowed recipients, permitted actions, shared
data, fallbacks, concurrency, and exclusions.

`full_yolo` may be the internal and builder name. Public copy should use **Full
autonomy** unless research establishes a better customer term.

A customer can pause new work or revoke future authority from the active-work
surface. The interface distinguishes:

- stopping work that has not been released;
- requesting provider cancellation;
- confirmed provider cancellation;
- an effect that may already have occurred;
- a completed effect that cannot be undone by AE.

Do not ask again for authority already granted. Step up only for scope widening,
an excluded or irreducible decision, exhausted limits, changed material risk, or
missing credentials. Explain exactly what changed.

## Core views

**Ask** accepts an objective, immediate action, or continuation. It does not
force a project intake before useful work begins.

**Options** compares viable businesses or paths using the person's priorities.
It shows price, timing, material conditions, evidence quality, and unknowns.

Recommendations explain the decisive evidence. Delegated choices made during
autonomous work appear in activity with the same rationale.

**Work plan** shows the tasks required for the outcome, what can proceed in
parallel, what depends on a prior result, and which tasks are optional. It is
editable before release and becomes a live record during execution.

**Mandate** selects the operating mode and defines its material boundary. Dense
protocol details remain available but do not lead.

**Active work** answers: what is happening, what has been committed, what limits
remain, what is waiting externally, and whether attention is needed.

It exposes pause and revoke controls without presenting an emergency dashboard
during ordinary progress.

**Action detail** shows the business, consequence, amount, shared information,
status, attempts, receipt, and available continuation.

Booking, payment, dispatch, inquiry, and cancellation use action-specific
language rather than a generic success receipt.

**Outcome summary** states whether the customer's objective was completed,
partly completed, blocked, or changed. It never converts a collection of
successful tasks into a successful outcome without matching outcome evidence.

**Recovery** leads with the safe next choice. Unknown external effect is never
rendered as failure or silently retried.

It shows reconciliation status, provider contact state, retry eligibility, and
what the customer should avoid doing twice.

**Operations** exposes mandate use, reservations, attempts, generations,
provider evidence, incidents, and interventions for authorized operators.

## Information architecture

- **Ask** — start an objective or action.
- **Businesses** — discover real businesses and supported work.
- **Activity** — inspect active and completed work for returning users.
- **For agents** — integration entry in the footer or builder navigation.
- **Claim your business** — supply-side entry.

Use familiar top navigation publicly and compact side navigation for protected
operational surfaces. Mobile navigation collapses structurally. Migration
routes must not introduce a second vocabulary or product model.

## Interaction contract

Every stateful control has hover, focus, active, disabled, loading, and error
states when relevant. Actions show their exact consequence before a new mandate
is granted.

Once granted, autonomous execution uses activity updates, not repeated modal
confirmation.

Timelines distinguish prepared, authorized, reserved, released, waiting,
succeeded, refused, failed, uncertain, cancelling, cancelled, reconciled, and
revoked states with words and non-colour cues.

Overall completion never hides an unresolved or externally owned action.

Loading uses stable skeletons. Empty states teach the next valid action. Motion
explains state change only, lasts 120–250ms, and respects reduced motion.
Durable results must be resumable without reconstructing a conversation.

## Copy

Use customer nouns: goal, work, business, option, booking, payment, price,
timing, details, permission, progress, problem, pause, and cancel. Name the
actual action and outcome.

Builder and protected surfaces may use request, route, mandate, invocation,
attempt, provider, idempotency, reconciliation, and incident.

Do not use inquiry, lead, directory, posting, household, bounded action, or
approval as the universal product frame.

Do not expose `KNOWN`, `UNKNOWN`, `UNAVAILABLE`, `NEXT_STEP`, DTO, fixture,
manifest, gateway, MCP, or OpenAPI as public human labels.

Current limitations belong in the relevant unavailable state, not repeated
defensive disclaimers. Label target mockups as target, mock, sandbox, or
prototype.

Never use fake providers, reviews, prices, availability, or activity as evidence
of real supply.

## Accessibility and anti-patterns

Target WCAG AA with persistent labels, visible focus, keyboard access, practical
44px touch targets, responsive layouts, non-colour status cues, and reduced
motion support.

No AI gradients, glowing graphs, glass, blobs, ornamental networks,
centered-everything landing pages, uniform feature-card grids, fake activity, or
protocol theatre.

Autonomy should feel calm and capable: visible state, exact consequences, strong
controls, and no performative friction.
