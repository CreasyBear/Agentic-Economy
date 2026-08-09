# graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

# Lean coding rules (8 core rules — "code like a 10-year vet, not an intern")
Write the leanest code that actually runs. Reuse before you build. No reinventing wheels, no inventory-grade abstraction. Shorter code, less rework, fewer tokens.

1. **No backward compatibility.** Outdated stuff? Delete it outright — no compatibility layers, no migration scripts, no fallbacks.
2. **Pick the simplest implementation that meets the current needs.** No premature abstraction, no unnecessary config layers.
3. **Layer the system gradually.** Get a minimal end-to-end version running first, then build on it. Never tear down working code for unfinished complexity.
4. **Keep components modular, with separation of concerns.**
5. **Prioritize mature, maintained libraries.** Don't rewrite unless there's a damn good reason.
6. **Check what the project's existing dependencies can do first** — then think about adding new packages or writing from scratch. Don't assume the libs are missing it off the bat.
7. **Make architecture decisions for the long haul.** No "we'll swap it out later" half-measures.
8. **See how mature products solve the same problem.** Use proven patterns, don't invent from scratch.

Source: distilled from the Vercel Next.js team's AGENTS.md (≈60B tokens of evals). Enforcement: the installed `ponytail` skill (ponytail / ponytail-review / ponytail-audit / ponytail-debt) applies these same checks at runtime.
