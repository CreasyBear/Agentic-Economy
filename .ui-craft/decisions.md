# Design Decision Log

Append-only, date-stamped record of design decisions that override skill defaults or project conventions. Each entry must include the decision, the rationale, and the consequences.

## 2026-06-30 — Project memory format adopted

- **Decision:** Use UI Craft project memory in `.ui-craft/` as the durable design context for Agentic Economy.
- **Rationale:** Per-session re-derivation of color, typography, and voice leads to drift; a committed brief + tokens + specs keeps surfaces consistent.
- **Consequences:** Every public-surface change must run the finish bar (Passes 3, 4, 7, 9 at minimum) and update the relevant surface file.
