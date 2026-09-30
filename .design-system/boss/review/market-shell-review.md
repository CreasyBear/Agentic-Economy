# Market shell UI review (partial)

Status: complete (partial: valid product runtime unavailable; catalogue and Tool detail not reviewed)
Commit: none

## Scope and method

`ui-review` was applied to `/market?view=discover` at commit `939237d83`, at 390×900 emulated touch and 1280×900 desktop in light theme. The surviving screenshots are from a Vite-only server without the local Convex backend. They support only shell-level observations. The documented `dev:local` start timed out during Convex initialization (exit 124); further startup was stopped at Joel's direction to keep the task focused on UI/UX/IA structure.

Captures: [390px](market-discover-before-390.png), [1280px](market-discover-before-1280.png). Axe output: [scan JSON](market-discover-scan.json).

## Verdict

No criterion-based visual issue was confirmed in the shell. Its market heading, question input, featured card and four browse tabs are visible at both widths. Measured document widths were 390px and 1258px respectively, with no horizontal overflow in these captures. This verdict does not cover a populated catalogue or a completed buyer journey.

Axe found zero WCAG 2.0 A/AA violations in this shell scan. It left color contrast incomplete for 17 mobile and 28 desktop nodes, and one ARIA attribute-value check incomplete at each width. These are unresolved checks, not confirmed failures.

## Not verified

Populated catalogue, Tool detail, search submission, keyboard and form probes, authenticated buyer states, Quote/Call and recovery, dark theme and actual-device touch. Blank catalogue content in the Vite-only render was excluded as a product finding.

Source-only IA observations are recorded separately in [ia.md](../ia.md).
