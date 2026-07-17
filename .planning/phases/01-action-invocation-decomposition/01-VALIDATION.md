# Phase 1 — Action invocation decomposition: independent design validation

**Date:** 2026-07-17
**Method:** 6 read-only scout validators, each adopting a named engineering persona from `msitarzewski/agency-agents/engineering` (all fetched 200 OK). Each independently re-checked the committed design (`01-SPEC.md`, `01-RESEARCH.md`, `01-01-PLAN.md`, `01-PATTERNS.md`) against the real source tree — not against the design's own claims.
**Scope:** Validation only. No source edits. Planning-artifact corrections applied where the design contained a factual error or overclaim.

## Overall verdict

**SOUND, with corrections applied.** The six-axis design is buildable and its citations are unusually accurate (22/22 confirmed). No axis was refuted. Five caveats were raised; two were concrete factual errors now corrected in RESEARCH/PLAN, three are execute-phase implementation constraints now recorded in the PLAN tasks. **One real security gap** in the *current* codebase (not the design) was surfaced and the design already closes it — but the RESEARCH wording overstated that it "already exists" and has been corrected.

| Axis | Persona | Verdict | Corrected? |
|---|---|---|---|
| (i) Seam | software-architect | SOUND | — (minor citation drift only) |
| (iii) Persistence | backend-architect + database-optimizer | SOUND | PLAN Task 4 enriched (VAL-02) |
| Blast-radius | minimal-change-engineer | SOUND-WITH-CAVEATS | RESEARCH §B + PLAN:85 (VAL-03) |
| (iv) Authority | identity-access-engineer | SOUND-WITH-CAVEATS + current-code GAP | RESEARCH:39 + PLAN:110 (VAL-04) |
| (ii) First action + contract | api-platform-engineer | SOUND-WITH-CAVEATS | PLAN Task 1 + axis (ii) (VAL-05) |
| Citations + PATTERNS | code-reviewer + codebase-onboarding | SOUND | — (22/22 confirmed) |

## Findings

### VAL-01 — Seam decision is sound (CONFIRMED)
All four sub-claims confirmed against source: adapter-over-registry is the only two-way-door option; `submitInquiryAction` carries zero `requestRef` (grep confirmed); `src/modules/actions/index.ts` is the single registry seam and `defineAction`/`ActionDefinition` extend additively; the in-memory authority-store pattern (`preparation-authority.ts:238-334`) exists and is reusable. The architectural challenge — can an adapter add an `awaiting_authority` gate to a one-shot write without editing it — resolves YES for the gate, NO for the uncertain-effect path (correctly handled by the provider simulator). No action required.

### VAL-02 — Persistence sound; table needs explicit lineage-union + indexes + writer isolation (CONFIRMED + caveat)
Every reuse candidate (`customerRequestV2ActionAttempts`, `…ApprovalGrants`, `…ActionAttemptResolutions`) carries **non-optional** `requestId`/`requestRevision` — so ADR-009's "new table only when reuse forces optional Request lineage" is genuinely satisfied. Schema-fragment composition and null-presence confirmed; no `node:` import in any schema file. **Caveats now in PLAN Task 4:** (a) `invocationOrigin` must be a discriminated **union value-object** (mirroring `convex-v2-schema.ts:715-720`), never an optionalized Request field; (b) the standalone read path needs its own indexes (`by_invocationRef`, `by_authorityReference`, `by_invocationOrigin/principal`) — it cannot reuse the Request-keyed indexes; (c) the `node:` trap is a **writer-file** concern — the future `actionInvocations` mutation module must isolate any Node builtin or `check:convex-codegen` breaks even with a clean schema file.

### VAL-03 — Blast-radius table numbers were inflated in both directions (CORRECTED)
- **"14 route files" is wrong — actual = 12** (`ls src/lib/server/customer-request-*-api.ts` → 12). Corrected in RESEARCH §B and PLAN:85.
- The chosen option's slice-one footprint is **6 files** (per the PLAN's own frontmatter + Tasks 1/3), not "~1 new adapter file + 0 edits." Note added to PLAN:85.
- ROADMAP bloat-detector citation refined to `:241-242` — `:241` "placeholder module" better matches option (ii); `:242` "one-implementation adapter for later" arguably indicts the chosen option's in-memory adapter too (mitigated: it is a test/eval adapter deleted before persistence).
- Independent re-ranking still agrees: **(i) < (ii) < (iii)**; chosen option (i) remains lowest blast radius and the only clean two-way door.

### VAL-04 — Authority: real current-code gap; RESEARCH overclaimed reuse (CORRECTED — most important)
The "possession of a reference is not authority" invariant **is** genuinely enforced today (`releasePreparationDisclosure` re-verifies signature+digest+trusted-issuer, then principal, then scope). **But** RESEARCH:39 said per-action binding "already exists in shape" — true only for the per-preparation *reservation record* (`ActionPreparationAuthorityReservation`), NOT the *enforced grant* `VerifiedPreparationAuthority` (`preparation-authority.ts:35-59`), which `validateAuthorityScope` (`:494-499`) checks **request-scoped**: it binds `requestId`/`requestRevision`/fields/recipients/purposes but never `actionId`, invocation ref, or prepared-input digest. Consequences for the implementer (now recorded at PLAN:110):
- The axis-(iv) bound fields (invocation ref/version, prepared-input digest) are **net-new grant fields + scope comparisons**, not reuse.
- **Current gap:** one grant today can authorize *multiple* actions in the same request that match the same field/recipient/purpose envelope — exactly the too-broad binding ADR-010 forbids. The design closes this, but only by adding the new grant fields and scope checks.
- For `standalone` invocations, `requestRevision`-anchored invalidation disappears, so **material-input-change** and **action-version-change** invalidation must be re-expressed as prepared-input-digest + action-version binding on the new grant — 2 of the 5 triggers have no existing enforcement path.

### VAL-05 — Action-contract extension must be optional; simulator rationale should rest on paused-authority absence (CORRECTED)
- REC-02 (skill `ae-actions-and-modules` stale) is **correct and understated**: source `ActionSurface = 'ui'|'http'|'agentJson'|'answerThread'` (`action.ts:26`); the skill claims an `agentTools` surface at the wrong line (`:27`), plus stale per-action surface tables and a `businessAction.requestCapability` action that is not registered. `agentTools` is an **allowlist gate** (`tool-contract.ts` `PublicQuietAgentToolIds`), not a surface value — do not reintroduce it as a surface. Noted in PLAN Task 1.
- Task 1's ActionDefinition metadata **must be OPTIONAL** — a required field is a compile-time break of all 19 `defineAction` callsites; and `describeActionForAgent` (`action.ts:118-142`) must be extended in the same task or the metadata is invisible to agents. Both now in PLAN Task 1.
- The provider-simulator rationale should be grounded in the **absent controllable paused-authority state** (structural), not merely the absent `unknown` delivery value (a real provider also returns deterministic terminals). Corrected in PLAN axis (ii).

### VAL-06 — Citations and pattern map are accurate (CONFIRMED)
22/22 RESEARCH citations opened and confirmed to contain what the artifact claims; the null-presence grep was re-run independently and returns no matches; the PATTERNS analog map resolves. Only cosmetic ±2–3 line anchor drift on a few multi-line constructs (e.g. `needs_authority` at ~184 vs cited `:181`), non-material.

## Corrections applied to planning artifacts (planning-only)
- `01-RESEARCH.md:39` — authority "already exists in shape" → two-layer reality (reservation record vs request-scoped enforced grant; net-new fields).
- `01-RESEARCH.md:81` — "14" route files → "12".
- `01-01-PLAN.md:85` — route count 14→12; ROADMAP citation `:241-242`; chosen-option footprint note.
- `01-01-PLAN.md:92` — provider-simulator rationale grounded in paused-authority absence.
- `01-01-PLAN.md:110` — bound fields flagged net-new on the enforced grant + scope check.
- `01-01-PLAN.md` Task 1 — optional fields + `describeActionForAgent` + `agentTools`-is-not-a-surface note.
- `01-01-PLAN.md` Task 4 — union lineage value-object, index set, writer-file `node:` isolation.

## Required before execute-phase (implementer checklist)
1. Add `invocationRef` + `actionId`+version + prepared-input digest to the enforced grant (`VerifiedPreparationAuthority` analog) **and** to `validateAuthorityScope`'s comparisons (VAL-04).
2. Express `invocationOrigin` as a discriminated union value-object; give the new table its own non-Request indexes (VAL-02).
3. Declare all new `ActionDefinition` metadata OPTIONAL and extend `describeActionForAgent` (VAL-05).
4. Isolate any Node builtin in the future `actionInvocations` writer module (VAL-02b).
5. (Doc hygiene, non-blocking) Refresh the `ae-actions-and-modules` skill per REC-02.

None of these change the six locked decisions; they are enforcement/wiring details the design already points at.

---
*Phase: 01-action-invocation-decomposition · Validation: 2026-07-17 · Still design-only; no source touched.*
