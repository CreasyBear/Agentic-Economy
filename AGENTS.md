# AGENTS.md

Always-on instructions for any assistant operating inside or against Agentic Economy (AE).
Read this before acting. `DESIGN.md` is the source of truth for visual/UI decisions;
`PRODUCT.md` is the source of truth for the product thesis and trust contract.

## What AE is

AE is the trust and discovery layer for agentic commerce. Today it publishes
business-supplied service pages that customers can compare and assistants can
safely read. The first owned conversion is a **qualified inquiry** — a human
first-contact message to a business for owner review.

## What AE is not

AE does not book, charge, dispatch, or auto-fulfil. Do not imply that it does,
in copy, tool descriptions, or agent responses. "Verified" is only used when a
named standard exists and a listing meets it — otherwise use "checked",
"supplied", "published", "last checked", or "needs confirmation".

## The safe contract for assistants

An assistant reading AE may: **read**, **compare**, **summarize**, and **route
to the next step**. It may **send a qualified inquiry** on a person's behalf
when the listing publishes that capability. It may **not** assume booking,
payment, dispatch, availability, or any fact the listing marks as needing
confirmation. If a requested action exceeds the safe contract, return the
person to AE and state the boundary plainly.

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
  a receipt and delivery state. This is the only assistant-exposed write.
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

- Read `DESIGN.md` before any visual or UI change. `src/styles/tokens.css` is
  the token implementation; when they disagree, `DESIGN.md` wins.
- No coral, pink, cream, linen, or beige. The single warm accent is signage
  amber `#E89B3C`. Body field is sunlit drafting paper `#ECEAE1`.
- Fonts: Fraunces (display), Hanken Grotesk (body/UI), IBM Plex Mono (data).
- Keep the hand-drawn pen-and-ink line illustration as the signature brand
  asset. Do not replace it with flat vector illustration.
- No AI-slop: purple gradients, 3-column icon grids, centered-everything,
  bubble radius on everything, gradient CTA buttons, glassmorphism, blobs.
- Add new operations as actions (`<module>/<module>.actions.ts`) and import
  them in `src/modules/actions/index.ts` so they register.
- Keep public human copy free of internal architecture words: `source-owned`,
  `readback`, `manifest`, `capability`, `gateway`, `operator`, `MCP`,
  `OpenAPI`, `callable`, `autonomous`, `agent-native`, `DTO`, `fixture`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
