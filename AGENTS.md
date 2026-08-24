# Agentic Economy project instructions

## Read this first

Before product reasoning, planning, documentation, or implementation, read
`PRODUCT.md`. It is the active product authority.

Use this precedence when sources disagree:

1. `PRODUCT.md`
2. Current executable source and tests
3. `README.md` for the public and operational introduction

Git history, deleted planning ledgers, old gate files, generated codebase maps,
research scripts, and archived diagrams are not product authority.

## Product boundary

Agentic Economy is a cross-harness market where agents discover, compare, and
buy bounded outside services while pursuing work owned by their existing
harness.

The implemented market unit is the Operation. Preserve the single loop:

capability gap -> search -> compare -> inspect -> controlled call -> usable
result -> agent continues.

Agentic Economy does not own the user's project, planning, memory, orchestration,
or general-purpose agent runtime.

Do not infer product capabilities from historical compatibility identifiers,
deleted documents, negative regression tests, or old names in Git history. A
concept absent from `PRODUCT.md` is out of scope until the charter deliberately
adds it.

Do not confuse the lower-authority external registry with the canonical market.
Imported metadata becomes an Operation only after admission and publication.

## Convex

This project uses Convex as its backend. Before changing Convex code, read
`convex/_generated/ai/guidelines.md`. Its project-specific API rules take
precedence over general guidance.

Convex agent skills for common tasks can be installed with
`npx convex ai-files install`.
