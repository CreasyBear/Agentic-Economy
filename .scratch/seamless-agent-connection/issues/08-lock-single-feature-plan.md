# Lock the single-feature implementation plan

Type: grilling
Status: claimed
Blocked by: 07

## Question

What is the smallest forward implementation plan that ships the approved connection workbench through vertical red-to-green slices, reuses maintained dependencies and current AE primitives, preserves the core purchase chain, and proves the user reaches both readiness states with actionable recovery?

The answer must name the files and public seams, sequence one behavioral test and minimal implementation per slice, identify dependency reuse, state non-goals, and define focused verification. Administrative bookkeeping is excluded unless it is user-visible feature behavior.

## Implemented vertical slice

- `/for-agents` now offers one Codex, Claude Code, or Cursor connection handoff. The maintained pinned `add-mcp` installer and public search verification are inside the copied request; the raw command is manual recovery only.
- `ae connect` now owns authorization only. The retired `--mcp` hybrid is no longer parsed or advertised.
- Authorization reaches `ready_to_buy` only after the issued credential passes canonical `GET /api/v1/account` readback. The result returns the durable principal, account, credential, authority, scopes, and exact owner Agents-record URL without bearer material.
- Existing first-protected-call behavior remains the JIT boundary: it returns `ae connect` after one public eligibility read and performs no Invocation.
- Existing owner directory and credential lifecycle remain the durable C record; no duplicate connection store or purchase semantics were added.

## Proof recorded

- 151 focused connection, OAuth, principal lifecycle, protected-call, route, and UI checks passed across 10 files.
- TypeScript, focused lint, CLI package build, and diff validation passed.
- Browser inspection confirmed the production `/for-agents` page presents the single handoff with manual setup collapsed.
