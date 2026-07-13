# J2 · Ask → decision aid (R0)

## Identity

- **ID:** J2
- **Name:** Ask → decision aid (R0)
- **Customer story:** “I researched and left with my shortlist, respected.”

## Status

**designed.** The R0 path and export contract are specified; the canonical docs record no end-to-end ship-test or persona-clearance result.

## Persona proof

- **Blind critic:** BrowserOnly — Lena, sensitive researcher who never sends, scored 3.5★ (best floor score).
- **Walkout:** `Copy shortlist` had an unknown payload, so copying was a privacy gamble (G2).
- **Companion evidence:** UrgentTradie’s front half failed when response posture surfaced too late (G5).

## Ship test

From a clean signed-out session, a researcher must:

1. submit an ask at `/` and land immediately on a durable `/t/:threadId`;
2. receive an interpreted need plus actionable shortlist with known facts, unknowns and source limits;
3. reach exact terminal status `Your shortlist is ready` with no send-pressure chrome;
4. open `Export preview`, inspect the exact sanitized field selection, then copy/print/download an artifact matching that preview; and
5. leave by copy, export, business page or direct call without granting contact data or send authority.

For an urgent ask, provisional candidates and evidence-based reply/direct-call posture must appear before any request-review choice.

## Pages & views

- `pages/home.md` — §2 primary composer; §3 example asks; §4 browse exit; §5 continue work; §6 registry rails; streaming/navigation urgency rule.
- `pages/thread.md` — conversation spine; shortlist/comparison items; settled decision-aid export; R0 terminal; no-shame exits.
- `pages/listing.md` — first-screen facts, evidence/reply posture, capability facts, direct-call and request-entry peer actions.
- `pages/activity.md` — Needs attention/recent-work rows and private-record handle form for signed-out continuation.

## Stage map

- **Stage 1 — Ask** and **Stage 2 — Clarify:** durable ask, correctable interpretation, at most one blocking clarification before provisional value.
- **Stage 3 — Shortlist** and **Stage 4 — Compare:** 3–5 evidence-bearing candidates; facts, unknowns and criteria remain inspectable.
- **Stage 11 — Decide / handoff:** `Your shortlist is ready`; copy/export/call/leave are successful outcomes without authority.

## Kernel dependencies

- **K1:** atomic durable thread/task creation with idempotency, provenance and revisioned context.
- **K3:** redaction-safe export projection whose artifact matches the visible payload preview.
- **K7:** attributable reply posture derived from evidence, not a verdict.
- **K8:** capability admission facts on candidates without implying availability.
- **K9:** non-secret activity handles and scoped access objects for safe continuation.

## Open items

- **G2 — specified, persona re-run open:** thread export requires visible preview, sanitized default and exact artifact parity.
- **G3 — partial:** Activity indexes session-local work and record handles; it remains a bounded convenience, not account history.
- **G5 — specified, persona re-run open:** early posture and urgent direct-call routing are in the serving specs.
- **CS2 — specified, ship proof open:** distance/map must be first-class on registry/listing facts.
- **CS4 — specified, ship proof open:** structured `When do you need this?` belongs in the composer/brief.
- **CS9 — decision conflict to resolve:** the build map says Activity ships as a home rail plus paste-a-link box while `pages/activity.md` still specifies the route; J2 cannot claim both without an explicit current projection decision.

## Hedge & common-sense checklist

- **Facts before hedges:** PASS when candidates show published facts, provenance, distance/reply posture and unknowns before the single business-confirmation boundary.
- **Export obviousness:** PASS in design only if the preview shows exactly what copy/print/PDF will contain; a blind `Copy shortlist` is forbidden.
- **Obvious transitions:** FAIL at the CS9 Activity route/rail inconsistency; continuation must have one obvious current location. Urgent asks also fail until early call routing is runtime-proven.
- **Pricing posture:** render dated `Callout from $X` if published; otherwise a useful reply fact or silence. Never repeat ambient `Business will quote` across shortlist/listing/thread.

## Re-run gate

Re-run BrowserOnly from ask through `Your shortlist is ready`, export preview and leave, with no contact details and no send. J2 becomes `persona-cleared` only if Lena can predict every exported field before committing, sanitized mode excludes private links/PII by default, and no send-pressure chrome appears. Re-run UrgentTradie’s front half to confirm actionable candidates and call routing appear before the prior late-posture walkout.
