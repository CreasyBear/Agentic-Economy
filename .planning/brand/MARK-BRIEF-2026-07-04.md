# AE MARK BRIEF — the mark that replaces the dead seal (2026-07-04)

Authority: subordinate to `BONES-2026-07-04.md`. This brief specifies the
replacement for the retired octagonal AE seal (`public/brand/logo/ae-seal.svg` —
octagon + concentric octagon + AE-ligature cut by a proof rule). The new mark is
designed from the **action-brand posture**: it must read as *economy being built /
motion / completion*, never as certification.

Palette (locked, from `src/styles/globals.css` `@layer astryx-theme`):
- **Eucalyptus** `#40614F` (the single accent) · pressed `#35523F`
- **On-accent** `#FDFDFB` (near-white for use on eucalyptus fields)
- **Ink** `#20261F` (primary marks/text) · **Sage** `#8AA396` (muted only)
- **Canvas** body `#F5F7F4` · surface `#FCFDFC` · **white cards** `#FFFFFF`

Type system (locked): theme-neutral **grotesk** scale (Inter / Geist family),
mono role reserved for record marks. Wordmark target is the **final consumer name**
ratified in `LAUNCH-2026-07-05.md` Phase 0 — R2 currently recommends **Cinch**,
with **Handled** as fallback. All mark directions below are **name-agnostic and
letterform-flexible**: they pair with the final wordmark, but do not hard-code its
letters, length, or candidate status.

---

## 1. Diagnosis — why a seal/badge is wrong for an ACTION brand (5 lines)

1. **Seals certify stasis.** A badge says *this was inspected and found sound* — a
   verdict frozen in the past tense; AE's soul is future-tense momentum, the
   distance between asking and done collapsing in real time.
2. **The octagon is a stop sign and a notary stamp** — both authority-that-halts,
   the exact posture BONES retires; our enemy is "the halfway," and a seal *is* a
   halfway (a list stamped "approved," then you're on your own).
3. **Badges are centripetal and static** — a closed ring pulls the eye inward to a
   fixed center and sits still; an action brand needs a mark that is directional,
   off-balance, and going somewhere.
4. **Trust is plumbing, not personality** — receipts and stamps are the brakes in a
   Porsche; putting the brake on the badge advertises the wrong organ and reads as
   defensive, which BONES bans as a personality.
5. **A seal claims a verdict AE has not shipped** — certifying implies an authority
   we do not yet exercise; a motion/completion mark expresses *trajectory and
   conviction* (allowed) without fabricating a stamped guarantee (banned).

---

## 2. Three mark directions

Each is specified on a **64×64 viewBox** using `currentColor` strokes/fills so the
mark inherits Ink or on-accent by context. Coordinates are exact enough to pen
directly; a designer may optically nudge ≤1px.

### Direction A — **SLIPSTREAM** *(motion → completion; the halfway collapsing)*

**Concept.** Two unequal converging strokes form a forward-leaning open apex; the
negative gap at the apex *is* "the halfway," and a single eucalyptus node sits just
past it on the trajectory line — the destination "done." The eye completes
apex → node: ask collapsing into handled. The most literal render of the brand's
core tension.

**Geometry (64×64, optical center ~32,32; ~12° forward lean).**
- Upper (leading) stroke: `M16 16 L44 30`.
- Lower stroke: `M16 48 L44 34` — converges toward the same right edge.
- The two strokes stop **~3px short of meeting** → an open apex near `(44,32)`
  (the gap = the halfway, deliberately unclosed).
- Destination node: filled circle, center `(52,32)`, `r 4` — on the extended
  trajectory line, just past the apex.
- Stroke weight **5.2** at 64px. Leading (left) ends `stroke-linecap="round"`;
  converging (right) ends squared. Optional acceleration taper: 5.2 at the tails →
  3.0 near the apex (drop the taper for flat-stroke builds).

**One animation beat.** Strokes draw tail → apex (`stroke-dashoffset`, ~220ms
ease-out); the destination node then pops (scale 0→1, ~120ms, starting ~60ms after
the strokes land). Reads: *the reach completes*. `motion-safe` only.

**16px favicon degradation.** Drop the taper and close the 3px apex gap (strokes
meet); keep 3 solid shapes — two-stroke chevron + node — at ~2px stroke, node
`r ~1.5`. Reads as a solid arrowhead hitting a target: still unmistakably
directional.

**Eucalyptus + Ink/Canvas application.** Two strokes in **Ink `#20261F`** on Canvas
/ white; the node is the **only eucalyptus `#40614F`** element — the single "done"
spark. On a eucalyptus hero field: strokes `#FDFDFB`, node `#FDFDFB` with a knocked-
out ink center (or a lighter eucalyptus tint). App icon: `#40614F` rounded tile,
mark in `#FDFDFB`, node knocked out to a lighter eucalyptus.

**Wordmark pairing.** Mark left of the final consumer-name grotesk wordmark (theme
grotesk, weight ~650, tracking tuned to the chosen letters; Cinch likely wants a
tighter, more kinetic lockup, while Handled can tolerate a fraction more width).
Cap-height = mark height. The apex → node trajectory **aims into the first letter**
— the mark literally points at the name. Letterform-flex: the eucalyptus node can
echo into one accented glyph (for Cinch, a terminal/diacritic-like spark; for
Handled, a handled/done punctuation beat), or the wordmark stays mono-Ink and the
mark carries the sole accent.

---

### Direction B — **THE STACK** *(economy being built)*

**Concept.** An economy assembling itself: offset modular cells interlock into a
rising, up-and-right form — a staircase of exchanges. Two cells are outlined
("in progress / structure"); the newest top cell is filled eucalyptus (the exchange
that closed). Direction of build = upward-right = growth/optimism.

**Geometry (64×64, ~15° shear, sharing slivers so it reads as ONE object).**
- Cell 1 (base, bottom-left) parallelogram: `M10 34 L24 34 L28 44 L14 44 Z`.
- Cell 2 (middle, up-right): `M22 28 L36 28 L40 38 L26 38 Z`.
- Cell 3 (top, up-right): `M34 22 L48 22 L52 32 L38 32 Z`.
- Cells overlap ~1–2px along shared edges so the three read as one assembled
  structure, not loose tiles.
- Cells 1 & 2: **Ink** outline, `stroke 2.6`, no fill. Cell 3: **filled eucalyptus
  `#40614F`** (the completed unit). Corners `1px` soft-round (echoes
  `--radius-inner`), never brutalist-sharp.

**One animation beat.** Cells rise and lock in sequence: cell 1 fades + lifts ~4px
into place (~140ms), cell 2 (+90ms), cell 3 lifts **and fills eucalyptus last** —
the build completes. Reduced-motion: static, cell 3 pre-filled.

**16px favicon degradation.** Collapse to **two** cells (drop the middle): one Ink-
outline base + one eucalyptus-filled top, offset up-right, stroke ~1.5px. Reads as a
filled block lifting off a base — growth/motion preserved and color-anchored by the
eucalyptus fill.

**Eucalyptus + Ink/Canvas application.** Ink outlines + one eucalyptus solid on
Canvas / white. On eucalyptus hero: outlines `#FDFDFB`, "completed" cell becomes
`#FDFDFB` fill (or Sage `#8AA396`) to hold contrast. App icon: `#40614F` tile, all
cells `#FDFDFB`, top cell inset/knocked-out.

**Wordmark pairing.** Denser mark → final wordmark set slightly heavier (~700),
tracking optically tightened to the ratified name. Locks left of the name; do not
force the stacked cells into a letter substitution unless the chosen wordmark earns
it. Letterform-flex: tune the shear angle to rhyme with the wordmark's terminals.

---

### Direction C — **THE SWEEP** *(motion → completion; the "it's sorted" exhale)*

**Concept.** One confident gesture: a forward arc that starts thin (the question)
and lands thick, resolving into a filled terminus (handled). Explicitly **not** a
closed ring/seal — an open, asymmetric, ~150° sweep whose mouth faces up-right:
momentum arriving, not a badge sitting.

**Geometry (64×64, hockey-stick / sideways-J curve).**
- Path (illustrative cubic; smooth in-tool): start `(14,22)` → sweep down through
  `~(20,44)` around center `~(34,34)` → rise to `(48,26)`, e.g.
  `M14 22 C16 40 26 48 38 44 C46 41 49 33 50 24`.
- **Variable width:** ~2.2 at the start-cap, widening to ~5.5 just before the
  terminus (energy building toward arrival).
- Filled terminus node: circle center `~(50,24)`, `r 5`, **eucalyptus `#40614F`**
  = "done."
- The gap between start-cap and terminus faces up-right and stays **generous** →
  open/in-motion, never a closed loop.

**One animation beat.** Arc draws start → terminus (`stroke-dashoffset`, ~260ms
ease-out with slight overshoot); terminus node blooms (scale + one subtle ring
pulse). Reads: the exhale, *sorted*. Reduced-motion: static full sweep.

**16px favicon degradation.** Variable width dies at 16px — degrade to a uniform
~2px swoosh + a ~2px eucalyptus terminus dot. Reads as a small motion-swoosh landing
on a dot; the eucalyptus dot is the color anchor.

**Eucalyptus + Ink/Canvas application.** Ink sweep + eucalyptus terminus on Canvas /
white. On eucalyptus hero: sweep `#FDFDFB`, terminus a bright `#FDFDFB`/Sage ring.
App icon: `#40614F` tile, `#FDFDFB` sweep, knocked-out terminus.

**Wordmark pairing.** Terminus points up-right into the wordmark baseline — mark
leads, final name follows the trajectory (grotesk ~650, tracking optically tuned).
The curve lends warmth to a hard-edged candidate such as Cinch and keeps a more
plainspoken fallback such as Handled from feeling static. Letterform-flex: the
terminus dot can double as a glyph's dot, counter, or punctuation only if it still
reads cleanly at small sizes.

---

## 3. Anti-patterns — refuse on sight

- **Octagons, badges, shields, roundels, crests, ribbons** — every closed
  certification frame; this is the dead seal by another silhouette.
- **Checkmarks / ticks** — a checkmark *is* a stamped verdict (stasis) and is the
  single most over-used SaaS glyph; motion ≠ approval.
- **Handshakes** — the marketplace-cliché of two-party trust; BONES puts trust in
  the plumbing, not the mark.
- **Circuit boards, nodes-as-neurons, brains, "AI sparkle" glyphs, chat bubbles** —
  literal AI/tech tropes that date instantly and describe the mechanism, not the
  outcome.
- **AI-slop gradients** — no purple→blue "intelligence" gradients, no glossy blobs,
  no neon glow, no mesh gradients. Eucalyptus is a flat single accent; depth comes
  from the token shadow scale, never from decorative color ramps.
- **Concentric rings / dials / progress pies** — anything that reads as a meter
  parked at a value (Direction C stays an *open* asymmetric sweep, never a ring).
- **Perfect central symmetry** — a mark with a fixed vertical axis sits still;
  the replacement must be off-balance and directional.
- **Literal buildings, houses, or trade tools** (wrench/spanner/hard-hat) — the
  wedge is domestic *economies*, not a trades directory (BONES §8).

---

## 4. Recommendation — **Direction A · SLIPSTREAM**

**Recommended.** Slipstream is the only direction whose *core geometry is the brand
thesis itself*: BONES names the enemy as **the halfway** and the hero as the
**collapse of the distance between asking and done**. Slipstream renders exactly
that — the open apex is the halfway, the eucalyptus node is *done*, and the
converging trajectory is the collapse happening in front of the viewer. Nothing in
the mark has to be *explained*; the eye performs the completion.

It also wins on the hard constraints:
- **Reduction / longevity** — two strokes + one node is the most reductive of the
  three, so it survives the 16px favicon and mono/record contexts intact and won't
  date like a device-specific motif.
- **Unambiguous direction** — it leans and points with zero read as a static badge;
  the trajectory even aims *into the wordmark*, reinforcing "ask → done" without
  depending on any one candidate name.
- **Single-accent discipline** — the lone eucalyptus node honors the one-accent rule
  and gives the color a job (the "done" spark) instead of decoration.

Why not the others: **The Stack** risks reading as generic startup/SaaS building-
blocks and skews toward "construction" over "completion." **The Sweep** is the most
beautiful but competes in the crowded swoosh category (telco/athletic) and its
variable-width stroke degrades worst at favicon size. Keep both as campaign/motion
accents if desired — but **Slipstream is the mark** for an ACTION brand.

**Build order:** commission Slipstream as `public/brand/logo/ae-mark.svg`
(+ `ae-favicon.svg`, `ae-app-icon.svg`, `ae-lockup.svg`) once the final consumer
wordmark is ratified in `LAUNCH` Phase 0; retire `ae-seal.svg`.
