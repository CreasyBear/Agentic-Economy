# AGENTS.md

Always-on instructions for any assistant operating inside or against Agentic Economy (AE).
Read this before acting. `DESIGN.md` is the source of truth for visual/UI decisions;
`PRODUCT.md` is the source of truth for the product thesis and trust contract.

## Authority and maturity

`PRODUCT.md` deliberately separates the **current evidenced state** from the
**target product contract**. Preserve that separation in source, plans, issues,
copy, tests, and status reports.

- Current claims require production source plus executable evidence through the
  intended human or machine surface.
- Target requirements direct architecture but are not public feature claims.
- Sandbox evidence proves contract behavior only. It does not prove useful real
  supply, customer value, or production fulfilment.
- Internal objects, schemas, tests, scripts, planning files, and closed issues do
  not establish customer reachability by themselves.
- When documents and runtime differ, report the difference. Do not silently
  downgrade the target to match legacy behavior or upgrade current claims to
  match the target.

## What AE is

AE is being built as the trust, discovery, decision, and bounded-action layer for
agentic commerce. Its neutral engine matches a Customer Request only against
registered capability contracts and is intended to return inspectable routes
before authority or execution.

Today, the customer-reachable product is narrower: AE publishes
business-supplied pages that customers can compare and assistants can safely
read, and it can send a **qualified inquiry** for owner review. The authenticated
Customer Request path can interpret and prepare bounded proposals, while
multi-capability RoutePlans remain below the customer projection. Treat this as
current migration state, not AE's permanent category or core identity.

## What AE does not publicly do today

AE does not book, charge, dispatch, or auto-fulfil. Do not imply that it does,
in copy, tool descriptions, or agent responses. "Verified" is only used when a
named standard exists and a listing meets it — otherwise use "checked",
"supplied", "published", "last checked", or "needs confirmation".

## The current safe contract for assistants

An assistant reading AE may: **read**, **compare**, **summarize**, and **show
the supported next step**. It may **send a qualified inquiry** on a person's behalf
when the listing publishes that capability. It may **not** assume booking,
payment, dispatch, availability, or any fact the listing marks as needing
confirmation. If a requested action exceeds the safe contract, return the
person to AE and state the boundary plainly.

An authenticated external agent may also use the published Customer Request API
to create or resume a Request, provide missing facts, and inspect the states that
surface actually returns. That API does not by itself prove customer-visible
RoutePlan choice, mandate, composite execution, useful real supply, or successful
external fulfilment. Describe only the exact state returned.

The target Request → RoutePlan → Approve → Run → Inspect lifecycle in
`PRODUCT.md` guides implementation. Do not expose a target operation as an
available assistant action until its production surface, authority boundary,
failure behavior, and readback have been proven.

## Actions (define once, call from any surface)

AE operations are declared as actions in `src/modules/*/<module>.actions.ts`
and registered through `src/modules/actions/index.ts`. One action fans out to
the React UI, the HTTP API, the agent JSON payload, and the quiet agent-tools
door. Each action carries a boundary-honest `summary` and an explicit
`boundaries` list — read them before calling.

Currently exposed to assistants (`surfaces` includes `agentTools`):

- `registry.search` — search published business listings. Read-only. Returns
  public catalog facts only; it does not book, charge, dispatch, or send
  inquiries.
- `registry.detail` — read one published business listing by slug. Read-only.
  Returns public catalog facts or a not-found result; do not invent missing
  provider details.
- `inquiry.submit` — send a qualified inquiry. Write, admission-gated. Returns
  a receipt and delivery state. This is the only `agentTools` write.
  Refuse if the person wants booking, payment, dispatch, or autonomous
  fulfillment — AE does not do those.

Owner-only actions (`inquiry.readOwnerInbox`, `inquiry.readOwnerThread`,
`inquiry.reply`, `inquiry.markRead`, `inquiry.close`) are not exposed to
external agents; they require owner auth and are reached through owner UI.

## The quiet agent door

`GET /api/agent/tools` lists assistant-callable actions with their parameters
and boundaries. `POST /api/agent/tools` with `{ "tool": "<id>", "input": {...} }`
invokes one. This endpoint is MCP-shaped but is never labelled "MCP",
"protocol", or "callable" on human surfaces (DESIGN.md §8/§13). It is the
machine counterpart to the human "Get as agent JSON" affordance.

Read-only payloads also live at `GET /api/businesses/search?q=...` and
`GET /api/businesses/$slug`, and the human-readable registry at `/registry`.
`/llms.txt` is the canonical plain-text index for assistants.

## Epistemic vocabulary

`KNOWN` / `UNKNOWN` / `UNAVAILABLE` / `NEXT_STEP` exist only in the JSON API,
`llms.txt`, the "Get as agent JSON" payload, and owner/admin surfaces. They
never appear as labels on public human surfaces. On human surfaces, honesty is
shown through truthful content, not a labelled ledger.

## When you change AE

- Read `DESIGN.md` before any visual or UI change. `DESIGN.md` is the visual
  authority; it now defines the Astryx-era system and supersedes the retired
  Daylight Register identity.
- Use Astryx (`@astryxdesign/core` plus `@astryxdesign/theme-neutral`) first for
  components, templates, overlays, tables, forms, feedback, and navigation.
  Tailwind 4 utilities are layout glue only.
- Do not add or extend bespoke `Ae*` presentation components, shadcn/radix/cva
  wrappers, handwritten CSS files, fontsource fonts, or Daylight
  Fraunces/amber/paper/hand-drawn brand assets. Existing behavioral AE modules
  may remain while they are re-skinned onto Astryx primitives.
- No AI-slop: purple gradients, 3-column icon grids, centered-everything,
  bubble radius on everything, gradient CTA buttons, glassmorphism, blobs.
- Add new operations as actions (`<module>/<module>.actions.ts`) and import
  them in `src/modules/actions/index.ts` so they register.
- Customer conversation must compile into and resume the canonical Customer
  Request. Do not add another intent compiler, customer history, recommendation
  model, or recovery state machine to the legacy Answer Thread path.
- A registered business page is discovery inventory. Routeable supply requires
  a current admitted business, exact capability contract, offering, binding,
  eligibility decision, publication, credentials, and readiness evidence.
- Keep domain-specific behavior in registered contracts or adapters. The neutral
  compiler, Request API, customer projection, and UI must not change when a
  conformant business is added or swapped.
- Keep public human copy free of internal architecture words: `source-owned`,
  `readback`, `manifest`, `capability`, `gateway`, `operator`, `MCP`,
  `OpenAPI`, `callable`, `autonomous`, `agent-native`, `DTO`, `fixture`.

## Project records and research

- Read `.planning/records/README.md` before creating project research,
  positioning, competitor, GTM, ecosystem, or business-model documents.
- Start project orientation at `.planning/records/KNOWLEDGE-INDEX.md`; follow
  links to authority and evidence instead of treating the index as authority.
- Record material decisions, hypotheses, research status, owners, and review
  dates in `.planning/records/PROJECT-RECORDS.md`; do not create a competing ledger.
- Research informs decisions but never overrides `PRODUCT.md`, `DESIGN.md`,
  source, tests, or intended-surface evidence.
- New research uses `.planning/records/RESEARCH-RECORD-TEMPLATE.md` and labels
  observations, inferences, unknowns, and falsifiable hypotheses distinctly.
- If a conclusion changes a public contract, authority boundary, canonical data
  model, interoperability posture, or neutrality constraint, write or supersede
  an ADR. Never rewrite old decisions to make a new direction look inevitable.
- A missed research or hypothesis review date makes it stale. Stale material may
  not justify implementation or public claims until reviewed.
- Update `SOURCE-REGISTER.md` when a material external source is added or
  changes, and update `RESEARCH-QUEUE.md` when a question starts, closes, or
  changes the decision it blocks.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
