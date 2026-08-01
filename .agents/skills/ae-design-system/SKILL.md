---
name: ae-design-system
description: Use for AE visual or UI changes. Apply Astryx neutral primitives, semantic tokens, accessibility, complete applicable interaction states, and current source-owned claims.
---

# AE interface work

> **North star:** Tell your AI what you need. It finds the right business, compares real options, gets your approval, and moves the work through to completion. Businesses publish what they do once, then earn whenever agents bring them work.

**Hierarchy:** ambition → customer promise → executable journey → hidden controls → proof.

## Ground the surface

Read `.planning/PROJECT.md`, `UBIQUITOUS_LANGUAGE.md`, relevant ADRs, live
source, and existing UI-contract/browser coverage. Consult an optional
`AGENTS.md` or design guide only when present. Name the customer task, result,
unknown, responsibility, and next valid action; a capability gap is an
implementation task, not a permanent public caveat.

## Compose the interface

Use `@astryxdesign/core` with `@astryxdesign/theme-neutral`. Use Tailwind 4
only for layout glue and shared values from `src/styles/globals.css`. Reuse an
existing Astryx primitive or adapter before composing; do not add bespoke
presentation systems, route-local palettes, or retired assets. Routes stay
thin and project source-owned state.

Lead with the objective and recognizable work, not a technical graph. Give
research, comparison, communication, approval, execution, payment, monitoring,
cancellation, and recovery distinct language and states. Approval shows exact
scope before action and remains separate from execution; progress never hides
unresolved or externally owned work.

Add every applicable state: hover, focus, active, disabled, loading, empty,
error, blocked, reconciliation, recovery, and reduced motion. Preserve
keyboard access, persistent labels, non-colour status cues, responsive layout,
and practical 44px targets. State responsibility and next action positively;
place a limitation at the decision it changes.

## Direct proof

Inspect narrow and wide rendered states and run the focused UI check plus the
smallest relevant browser or accessibility check. Use labelled mock data only
in development/test surfaces. Tests and readback verify semantics, effects,
authority, uncertainty, refusal, and recovery—not phrase locks or speculative
states.
