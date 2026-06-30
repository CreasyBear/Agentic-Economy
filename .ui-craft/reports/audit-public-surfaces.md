# Technical UI Audit — Public Surfaces

**[CODE-ONLY REVIEW — visual issues not assessed]**

Scope: `AeChat`, `AePublicShell`, `AeProviderListingPage`, `registry.tsx`, `src/styles/answer/`, `globals.css` (trimmed).

## Critical

| Before | After | Why |
| --- | --- | --- |
| Dual answer implementations (`AeAnswerStream` + chat section) | Single chat path | Removes drift and duplicate stream logic. |
| 700ms `.ae-public-reveal` on static marketing blocks | Removed with landing CSS | Honors MOTION_INTENSITY 4 and reduced-motion. |

## High-impact

| Before | After | Why |
| --- | --- | --- |
| Stream error: registry link only | *(open)* Add retry same query | Recovery without retyping (Nielsen #9). |
| Whole-answer `aria-live` in legacy stream | Live regions scoped in artifact renderer | Prevents SR flood during summary deltas. |

## Quick wins

| Before | After | Why |
| --- | --- | --- |
| Footer: two spans only | Footer nav with Ask, Browse, Assistants, Corrections, Claim | Recognition / help (Priya persona). |
| `globals.css` comment contained "readback" | Renamed to operator status cards | Passes microcopy finish bar. |
| Copy scan omitted `ae/chat` | Added chat folder to `public-language-copy` targets | Contract covers active landing. |

## Accessibility checklist (code)

- Skip link present on `AePublicShell`
- Query box: labelled input, `role="search"`, hint via `aria-describedby`
- Listing: semantic `article`, `h1`, section `h2`s, `dl` facts
- `prefers-reduced-motion` global in `globals.css` + answer.css animations gated

## Performance (code)

- No `transition: all` in trimmed public CSS
- Illustration uses width/height via CSS aspect-ratio on hero figure
- SSE stream with bounded retries (2) and abort on unmount
