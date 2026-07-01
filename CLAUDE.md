# CLAUDE.md

## Design System

Always read `DESIGN.md` before making any visual or UI decisions. It is the source of truth for the Agentic Economy design system ("Daylight Register"): north star, color, typography, spacing, layout, motion, imagery, components, copy voice, and the agent contract.

`src/styles/tokens.css` is the token implementation. When `tokens.css` and `DESIGN.md` disagree, `DESIGN.md` wins.

Hard rules:

- No coral, pink, cream, linen, or beige. The single warm accent is signage amber `#E89B3C`. Body field is sunlit drafting paper `#ECEAE1`.
- Fonts: Fraunces (display), Hanken Grotesk (body/UI), IBM Plex Mono (data). No Inter/Roboto/Space Grotesk as primary.
- The agent epistemic vocabulary (`KNOWN`/`UNKNOWN`/`UNAVAILABLE`/`NEXT_STEP`) never appears as labels on public human surfaces. It lives in the JSON API, `llms.txt`, "Get as agent JSON," and owner/admin surfaces only.
- Hand-drawn pen-and-ink line illustration is the signature brand asset. Do not replace it with flat vector illustration.
- No AI-slop: purple gradients, 3-column icon grids, centered-everything, bubble radius on everything, gradient CTA buttons, glassmorphism, decorative blobs.
- In QA mode, flag any code that doesn't match `DESIGN.md`.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
