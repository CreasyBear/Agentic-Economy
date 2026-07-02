# Spike Manifest

## Idea

Explore AE local context retrieval as a boring, auditable locality guard before the answer tool loop. The goal is to make the user understand what area is active before search, keep public registry search literal, and preserve model-led typo correction only as explicit evidence.

## Requirements

- Public `registry.search` remains query-only in v1.
- `locationConstraint` stays internal; it is not passed through the public action schema.
- Resolver runs only for fresh `tool_search` turns.
- Original user wording is preserved as `displayQuery`.
- Any model/tool query divergence is persisted with a named reason.
- User-facing copy must not claim booking, payment, dispatch, or live availability.

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | local-context-retrieval-plan | standard | Given query + active area, when the resolver plans retrieval, then service text and location constraint stay separate and explainable | VALIDATED | retrieval, locality, evidence, ui |
| 002 | answer-response-rebuild | standard | Given a broad chat query and an existing provider-rich catalog, answer planning asks for the missing service before registry/provider UI and budgets generated artifacts by response mode | VALIDATED | answer-thread, planning, chat, eval |
