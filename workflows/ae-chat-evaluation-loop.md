# AE Chat Evaluation Loop

## Status

Draft under grilling. Do not implement until every open question is resolved.

## Loop

When the AE chat surface feels wrong, run a structured evaluation and improvement loop that examines IA, look and feel, component operation, streaming behavior, and shadcn / AI Elements fit. The loop should produce a decision-ready brief, make the smallest high-leverage changes when implementation is in scope, verify with browser evidence, and repeat until the surface clears the agreed bar.

## Goal

Move the AE chat surface from "blocks appear in a transcript" toward "a generated commerce answer assembles in front of the user," while preserving AE's product boundaries and Daylight Commerce Routing design system.

## Known Inputs

- AE design authority: `DESIGN.md`.
- Product/trust authority: `PRODUCT.md` and `AGENTS.md`.
- UI memory: `.ui-craft/brief.md`, `.ui-craft/tokens.md`, `.ui-craft/surfaces/chat.md`.
- Component sources: shadcn primitives, AI Elements components, local AE chat/artifact components.
- Browser evidence: screenshots, timing samples, CLS, overflow checks, and mobile/desktop behavior.

## Known Output

- A brief that names the current score, the blocking issues, the evidence, and the next highest-leverage change.
- Optional implementation patch when the user asks to keep going or explicitly wants fixes.
- Verification notes from typecheck/static checks/browser checks.

## Trigger

Event-triggered by explicit design dissatisfaction or evaluation language about the AE chat surface. Trigger phrases include:

- "This is a 3/10."
- "Evaluate the chat."
- "Go study the behavior."
- "Keep going on AE chat."
- "The layout / streaming / components still feel wrong."

The trigger should preserve the user's blunt score as the opening constraint. If the user says "3/10," the workflow starts from "this currently fails the bar" rather than from a neutral audit posture.

## Open Questions

- Does the workflow implement changes by default, or stop at the brief unless asked?
- What is the minimum evidence packet required before a brief is valid?
- What score or criteria defines "good enough" for one loop run?
- Where should the brief be written?
- Should the workflow create follow-up tasks when it cannot finish in one pass?
