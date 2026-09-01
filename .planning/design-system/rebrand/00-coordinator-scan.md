# Coordinator Scan — Why the System Reads as "Bland Text on a White Background"

**Analysis Date:** 2026-09-01
**Author:** coordinator read (source token math + 9-lens review evidence), no browser render needed — the numbers are the evidence.

## The claim, verified

The user's perception is empirically correct. The system was engineered for maximal restraint and landed at visual absence. Every structural signal — surface depth, brand color, type personality, elevation — is either below perceptual threshold or quarantined to the landing page.

## Evidence (computed from authored tokens in `src/styles/globals.css`)

| Metric | Value | Why it reads bland |
|---|---|---|
| Canvas `--ae-bg` L/C | `oklch(0.9663 0.004)` ≈ `#e7e7e0` — 99.3% lightness, chroma 0.004 | Perceptually **white** with an invisible warmth cast; distance to pure white ≈ 0.18 in RGB space, i.e. one step above white |
| Surface stack | bg 0.9663 · sunken 0.9546 · surface 1.0 (all achromatic) | Three "levels" separated by ~0.5–1% lightness — **no depth**; a card is white on near-white on near-white |
| Neutral chroma | fg 0, muted 0, surface 0, bg 0.004, border 0.004 | **Every neutral in the system is pure gray.** Zero warmth/character in the ink layer |
| Only chroma in system | brand 0.1056 · success 0.1222 · warning 0.1401 · danger 0.176 | One blue + three status colors are the entire color presence — and the blue is AA-insecure for normal text (4.21:1 on canvas), so it mostly cannot be used as designed |
| Border strength | `--ae-border` = fg at 12% alpha → **1.3:1** against canvas | Structure = invisible hairlines; grouping reads as whitespace only, and the spacing ladder is small (8/16/32) |
| Elevation | shadows at 0.04–0.08 alpha, 1–4px | Imperceptible on most displays; nothing floats |
| Typography on product surfaces | Inter, near-black `#030303` on white, ad-hoc sizes; Geist Pixel quarantined to Public hero; DM Mono only for some values | Product surfaces are literally "Inter in black on white" — the type personality never reaches the product |
| Motion | 100/160/220ms property-only tweaks, no decorative motion allowed | No life, by design |
| Focus/selection | double ring on near-black | Correct a11y, zero personality |

## Diagnosis

The brand's hard constraints — "ink actions, blue only for links/info, no gradients, no glass, monochrome, restraint" — were executed so faithfully that the perceptual result is **a white page with gray text**. Each rule individually is defensible; the sum is a brand that hides. The three mode definitions (Public/Market/Operator) differentiate density, not identity, so every surface shares the same achromatic face.

Specifically:
1. **Chroma is nearly absent everywhere** (0–0.004 neutrals; one blue at 0.1056). No hue identity, no warm/cool tension.
2. **Surface hierarchy is below threshold** — three near-white levels and invisible borders mean no composition, no focus, no "product".
3. **Personality is quarantined** — Geist Pixel, the notch, the construction marks live only on `/`; the catalog and workspace (the actual product) inherit default-with-no-character.
4. **The one accent is too weak to function** — `--ae-brand` at 4.21:1 can't carry normal text links, so even the intended blue presence is absent in practice.
5. **Elevation and motion are effectively off** — nothing signals importance or state beyond text weight.

## What a fix must preserve vs change

**Preserve (still correct):** market-terminal information density; evidence-first Operation composition; semantic status colors for literal state; AA contrast discipline; the "one exact next action" grammar; a11y-is-brand.

**Change (where blandness comes from):** the perceptual floor — canvas chroma and depth; the surface stack (make levels ≥2–3% luminance apart, or invert to dark); adding real brand hue presence at usable contrast; giving product surfaces a type voice; allowing elevation/motion to actually register. Direction candidates below vary these deliberately.

---
*Evidence: `src/styles/globals.css` authored OKLCH tokens (lines 108–160), `src/styles/base.css`, 9 lens reviews in `reviews/`, DESIGN.md/BRAND.md authority.*