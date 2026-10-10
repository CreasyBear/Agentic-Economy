---
name: aecon-rulebook
description: Audit or restyle one aecon route against the design system rulebook. Use for /aecon-audit <route> (report findings by rule ID and file:line) and /aecon-restyle <route> (fix one route to its page archetype), or when asked whether a page follows the aecon rulebook, spec or archetypes.
---

# aecon rulebook

Sources, in order of authority:
1. `docs/designs/design-system-spec.md`: Foundations, Components, Page archetypes, Language, Agent surfaces.
2. `docs/designs/aecon-rulebook.md`: rules R1 to R29.
3. `docs/designs/design-system.md`: benchmarks and the change log.

This skill applies those rules. It never adds a rule. Each finding cites an
existing rule ID (R1 to R29), or a spec section when the spec, not the rulebook,
states the rule (for example "spec: Components").

## Resolve the route

`<route>` is a URL path such as `/market` or `/calls/$callRef`.

1. Find the route file: the TanStack file route under `src/routes/` (dots stand
   for slashes, `$param` for params, `_operator/` for signed-in pages).
2. Scope = the route file plus every `@/components/...` and `@/modules/...`
   file it imports, followed one more level into component directories.
   List the scope before sweeping.
3. Find the archetype in the spec's Page archetypes table: job, primary action,
   top-to-bottom order, hidden-by-default content, reference.

## /aecon-audit <route>

Report only. Change nothing.

Run each sweep over the scope files with `git grep -nP '<pattern>' -- <files>`.
Every hit is a candidate. Read the line, drop false positives (identifiers,
comments, tests, JSON keys), and keep only user-facing or styling hits.

- **R1, R7 (spec: Foundations, density)**. Two type sizes, weights 400/500. `\btext-(xs|sm|base|lg|[2-9]?xl|\[)`, `font-(semibold|bold|extralight|light|black)`, `font-size:` in CSS modules. Count distinct sizes in the scope: more than 2 is a finding
- **R2**. Rows and controls on the density tokens. `\b(h|min-h)-(\[|9\b|10\b|12\b)` on rows, inputs and buttons
- **R4**. No blur. `backdrop-blur|\bblur-|filter:\s*blur`
- **R5**. No in-flow shadows. `shadow-\[`, `box-shadow:` not `none` or the overlay shadow, `shadow-overlay` outside a dialog, sheet, menu, tooltip or palette
- **R6**. Hover changes surface, not elevation. `hover:(shadow|-?translate|scale)`
- **R7**. Forest only on the primary button, selected row, focus, links. `(bg|text|border)-(brand|primary)` outside those four uses
- **R8**. Status is icon plus grey label. `<Badge` or `rounded-full` pills that carry a status; status not rendered by `AeStatusBadge`
- **R9, R10**. Money only through `formatCurrencyAmount`, one price per view. `npx oxlint <files>` (rule `no-restricted-properties`), plus `toFixed\(`, `AUD \$\{`, `\$\{[^}]*\} USDC`, `US\$`, `formatDisplayAmount`; count prices shown for one tool
- **R11**. Time only through `format-time.ts`; names over refs. oxlint as above; `toISOString\(\)` rendered as text; `Ref\b` or raw ids rendered outside a copy button
- **R12**. Motion at most 150ms, no bounce, transform and opacity only. `duration-(200|300|500|700|1000)`, `transition-all`, `[0-9]{3,}ms` above 150, `bounce:\s*0?\.[1-9]`, `stiffness`, `animate-bounce`
- **R13**. Actions reachable from the palette with shortcuts. `onKeyDown` handlers checking `metaKey`/`ctrlKey`; actions missing from `AeCommandPanel`
- **R14**. 4px grid spacing tokens. `\b(p|m|gap|space-[xy])[trblxy]?-\[`, `-(hero|band)\b`, `min-h-(fold|chapter)`
- **R15**. Labels left, numbers right, nothing centred. `text-center|justify-center|mx-auto` on table cells or text blocks
- **R16**. Sentence case, no em dashes, eyebrows or mono uppercase. `uppercase`, `—`, `eyebrow`, `tracking-(wide|widest|\[0\.)`, Title Case in JSX text
- **R17 (spec: Language)**. Banned words. `\b(capabilit(y|ies)|endpoint|listing|offering|Directory Host|publisher|use case|admitted|Routeable|readiness|readback|evidence|assessed|coverage|scope|provenance|eip155|AUD Credit|wallet|playground|Agentic Economy|AE)\b`, raw `snake_case` enums in JSX. Scope: count only text a person or agent reads. That means JSX text, user-facing string props (title, aria-label, placeholder, label, description), `src/content/**`, MCP and CLI output strings, and `/llms.txt` and `/SKILL.md`. Never count identifiers, type names, imports, comments, log keys, or enum values that aren't rendered. Confirm each hit by reading the line. On 2026-10-10 the R1 baseline overcounted R17 by about 2x without this scope.
- **R18**. One primary action, verb plus object. Count `<Button` without `variant` or with `variant="default"`; duplicate intents; vague labels ("Not now", "OK", "Submit")
- **R19**. Errors at the cause, no "sorry" or "invalid". `\b(sorry|invalid|Something went wrong)\b`
- **R20**. Skeleton, empty, inline error with retry, success in place. Route has `pendingComponent` and `errorComponent` (`RouteError`); `Loading workspace`; empty states built with `AeEmptyState` and saying why plus one next step
- **R21 (spec: Components)**. One table, `AeRecordTable`. `SortableDataTable|AeSortableDataTable|AeComparisonTable|<table\b|components/ui/table`
- **R22, R23**. Toolbar 5 actions or fewer; sort icon on the sorted column; 3+ row actions in overflow. Read the table toolbar and row actions
- **R24**. Filters in the URL, empty state outside the table, unknown cells `--`. `useState` holding filters, `'—'` in cells, empty text rendered inside table rows
- **R25 to R29 (spec: Agent surfaces)**. Agent output budgets. Only for `src/lib/server/mcp-api.ts`, `src/modules/actions/contract.ts`, `tools/ae/`, `/llms.txt`: measure bytes with `wc -c` against the spec budget table
- **Spec: Page archetypes**. Job, primary action, order, hidden content. Compare the rendered order and primary action with the archetype row; check `staticData` has `job` and `primaryAction` (`src/router.tsx:71`)
- **Spec: Components**. The one component per job. Any component in the table's Delete column used in scope

Report format, one finding per line, most severe first (money, then copy, then
layout, then style):

```
R9  src/components/ae/market/AeToolPrice.tsx:22  price built with toFixed, bypasses formatCurrencyAmount
R17 src/routes/tools.$providerHost.$slug.tsx:88   "admitted" in visible copy; say "Ready"
```

End with the count per rule ID and the total. That total is benchmark R1 for
this route; record it in the README change log when it is a baseline or a
re-measure.

## /aecon-restyle <route>

Fix one route per pass. Do not touch other routes.

1. Run `/aecon-audit <route>` and keep the findings as the baseline.
2. Restyle the route to its archetype from the spec: the job, the one primary
   action, the top-to-bottom order, hidden-by-default content, and the named
   reference. Use the component the spec's Components table names for each job
   and the copy from its Language section. Fix each audit finding by its rule.
3. Reuse tokens and existing components. No new tokens, components or
   dependencies unless the spec names them.
4. Do not change money semantics, who can pay, or route authority.
5. Prove it by real use on the actual surface (the running app, `ae` CLI, MCP
   or HTTP), not by a new test suite. Update existing tests whose literal
   expectations the restyle intentionally changes.
6. Re-run `/aecon-audit <route>`. Fix what remains or list it with its reason.
7. Record the route, the before and after finding counts, and the benchmarks
   it moved in the `docs/designs/design-system.md` change log.

Optional sub-passes, each run as its own skill when installed: better-writing
(R16 to R19), cognitive-load-auditor (archetype, R18), number-formatting (R9 to
R11), review-animations (R12), break-ui (R20, R24).
