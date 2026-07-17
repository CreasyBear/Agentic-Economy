# Agentic Economy interface authority

## Register

Brand on the public landing surface; product inside the ask, confirmation, and
activity flows. The routing engine is architecture, not the public category.

## System

Use Astryx (`@astryxdesign/core`) with the neutral theme. Tailwind 4 supplies
layout only. The semantic token bridge in `src/styles/globals.css` is the visual
authority. Do not create another component system or route-local palette.

The existing ink, warm canvas, white surface, slate, and eucalyptus tokens stay.
Eucalyptus identifies current selection, primary action, and active route state.
It is not decoration. Status colours remain functional.

## Product shape

The primary customer object is the **current task and its result**:

- what the person or agent is trying to do now;
- the constraints and prior work being relied upon;
- the business or businesses involved;
- what AE learned, prepared, sent or observed;
- what remains unknown or blocked;
- the useful next action and who owns it.

A recommendation is one possible task result. It shows the recommended way
forward, price, timing, the few tradeoffs that matter, one clear confirmation
action, and alternatives when they change the decision.

The **route docket** is the technical projection behind a complete route or a
recommendation that depends on one:

- the request and constraints;
- ranked graph options;
- ordered steps and fallback edges;
- provider and capability binding for each step;
- cost, data disclosure, and authority limits;
- immutable quote digest;
- Root Run state after execution.

Secondary objects are a network ledger, binding record, incident record, and run
timeline. These replace inquiry receipts, household imagery, generic feature
cards, and ornamental diagrams.

The customer-facing route is a progressive composition of recognizable tasks:
completed, current, next, optional, blocked, or human-owned. It is offered as AE
learns enough to be useful. It is never presented as a graph the customer must
design or approve wholesale before receiving value.

## Customer information architecture

- **Ask** — public header; say what you need, ask for one task, or continue from
  work already completed.
- **Businesses** — public header; discover real businesses and what they can help with.
- **Claim your business page** — public header; the supply-side entry.
- **For agents** — footer; integrate through the machine-readable contract.
- **Activity** — a returning-user rail on `/` until accounts exist, not public navigation. <!-- stupid-shit: S3 -->

Recommendation views progressively disclose **Why this**, **What it costs**,
**What will be shared**, **Other options**, and **Technical details**. Graphs,
digests, bindings, and protocols never lead the customer journey.

Task views show **What you asked**, **What we know**, **What happened**, **What
needs attention**, and **What you can do next**. Route views grow from those
tasks rather than replacing them with a project dashboard.

Use a familiar top navigation publicly and a compact side navigation for
protected operational surfaces. Mobile navigation collapses structurally.

## Interaction rules

1. Every stateful control has hover, focus, active, disabled, loading, and error
   treatment where applicable.
2. Quote approval always shows the quote digest, maximum spend, expiry, allowed
   recipients, allowed purposes, and disclosed fields before the action.
3. Execution and approval are separate actions. Never merge them into one CTA.
4. A Root Run timeline distinguishes planned, authorized, running, succeeded,
   failed, cancelled, and reconciliation states with text and shape, not colour
   alone.
5. Empty states teach the next valid action. Loading uses stable skeletons.
6. Motion explains state change only, lasts 120–250ms, and respects reduced
   motion.
7. Completing one task may reveal or recommend later tasks, but never selects or
   authorizes them silently.
8. A person or agent can stop after any completed task and later resume from the
   durable result without reconstructing the conversation.
9. Overall progress never hides an unresolved, externally owned, or unsupported
   task behind a generic completion state.

## Copy

Use the customer's nouns: need, task, business, option, price, timing, details,
confirmation, progress, and problem. Builder surfaces may use request, route
quote, provider, capability, approval, run, and incident.

Do not use household, inquiry, lead, posting, sorted, domestic economy, or
business-owner framing as the universal product voice. Do not call registry rows
routeable unless an admitted and conformant binding exists.

## Anti-patterns

No AI gradients, glowing graphs, glass, blobs, centered-everything landing pages,
uniform feature-card grids, fake activity, fake providers, fake reviews, fake
prices, or protocol theatre. Do not expose internal proof vocabulary as a brand.
Do not turn safeguards into repeated defensive disclaimers.
