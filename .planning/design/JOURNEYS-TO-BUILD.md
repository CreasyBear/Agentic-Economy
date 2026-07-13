# Journeys To Build — the distillation

**Created:** 2026-07-13 · **Status:** canonical build map
**Synthesizes:** JOURNEY-SYSTEM contracts (C1–C7) + SIMULATION-FINDINGS (G1–G10) into the named journeys implementation plans against, with the kernel capability each journey demands. The design thesis of §3: **the surface reviews are a requirements simulator for the neutral kernel** — every journey row derives kernel primitives from observed user need, not from protocol ambition.

---

## 1. The build journeys (priority order)

Each journey = an end-to-end, provable loop. A journey ships when a blind persona can complete it; partial page delivery is not journey delivery.

### J1 · Cold trust — "I landed here from Google and believe this page"
**Persona proof:** SeoLander (2★, worst floor score — this is the acquisition surface).
**Path:** Google → `/:slug` → 10-second comprehension → call directly OR ask.
**Pages:** listing.md (G5/G6 amendments), registry.md.
**Ship test:** cold visitor finds phone/hours/service-area above the fold, understands AE in one line, and direct-call is a peer action.

### J2 · Ask → decision aid (R0) — "I researched and left with my shortlist, respected"
**Persona proof:** BrowserOnly (3.5★, best score — protect it), UrgentTradie's front half.
**Path:** `/` → `/t/:threadId` → shortlist → "Your shortlist is ready" → export/copy/call → leave.
**Pages:** home.md, thread.md, listing.md, activity.md.
**Ship test:** researcher completes, exports a sanitized shortlist with visible payload, and never sees send-pressure chrome. Urgent asks get early actionable candidates + call routing (G5).

### J3 · One governed send (R1 core) — "AE asked in writing and I hold the record"
**Persona proof:** SkepticalShopper's consent praise; all four sophisticated critics' "excellent one-shot value."
**Path:** thread/listing/registry → `BeginSingleBusinessReview` (C1) → exhaustive review (A5 tuple + G7 principal UI) → pending lock → `/t/:threadId?k=` with returnPosture (C4).
**Pages:** confirm-and-send.md, private-record.md.
**Ship test:** all six entry paths converge on one review; the record proves what was sent; a no-channel user gets the explicit fragility acknowledgment.

### J4 · The multi-day loop — "the reply found me and I could act on it"
**Persona proof:** ReturningUser (the two-URL ritual), OwnerPlumber (channel death), the C5 breaks.
**Path:** send → clocks (dispatch/readback/no-reply, JOURNEY §6) → owner notification → durable-session re-entry (G8) → triage row (10-second standard) → disposition (5 executable, decline taxonomy) → customer notification → bounded reply loop (C5) → close/cessation OR "handled another way" (G10).
**Pages:** owner-inbox.md, owner-settings.md, private-record.md, activity.md (record handles, G3).
**Ship test:** a full owner↔customer clarification round-trip completes across devices and days; every waiting state has a clock owner; out-of-band resolution closes the record honestly.

### J5 · Sequential comparison — "I asked three, compared their replies, and decided"
**Persona proof:** SkepticalShopper, BuilderProcurement, FacilitiesManager — the unanimous sophisticated demand (G1/G4/G2).
**Path:** J3 → episode 2, 3 (C7, carried-brief diff G4) → `/t/:threadId/compare` at ≥2 replies → export comparison pack (G2) → follow-up or decide.
**Pages:** compare.md (NEW), confirm-and-send.md (episode diff), thread.md, private-record.md (export).
**Ship test:** Greg's head-office proof: two vendors asked with an asserted-identical brief, one exported comparison artifact, zero Excel.

### J6 · Owner activation — "I claimed my page and requests reach me"
**Persona proof:** OwnerPlumber's channel viability + C6 (unclaimed businesses can never receive sends — activation IS the supply gate).
**Path:** `/claim` → publish → verified destination → first request → J4.
**Pages:** claim.md, owner-status.md (readiness readback), owner-settings.md.
**Ship test:** the `R1TargetAdmitted` predicate flips from refused to admitted through owner actions the status page makes legible.

### J7 · Machine entry — "an assistant used the same contracts"
**Persona proof:** deferred to agent-surface work; the gateway spec exists (for-agents.md).
**Path:** `/for-agents` → v1 API → same object graph, `ConversationEnvelope` projections.
**Ship test:** third-party agent completes J3 semantics with principal/delegation admission (A5 fail-closed) and renders `doesNotProve` semantics.

**Explicitly NOT journeys (accounts-era, named honestly per WEDGE anti-scope):** portfolio worklists (Rhonda's six tables), recurring schedules/compliance rounds (Greg's quarters), saved sites/templates, multi-subject caseload management (Amara's 22 participants), attachments (R1.5 gate).

---

## 2. New pages / views / IA delta

| Addition | Type | Journey | Status |
|---|---|---|---|
| `/t/:threadId/compare` | NEW page (thread projection) | J5 | spec `pages/compare.md` |
| Export artifact (PDF/print/sanitized copy + payload preview) | View/contract on record, thread, compare | J2/J3/J5 | amended into specs (G2) |
| Record handles in Activity + "Needs attention" grouping | View upgrade | J4 | amended (G3) |
| Episode diff panel in review | View | J5 | amended (G4) |
| Principal/subject authority statement | View in review + record + export | J3 | amended (G7) |
| Urgency triage row + posture labels | View on listing/registry cards | J1/J2 | amended (G5) |
| Decline-reason taxonomy | View owner + customer sides | J4 | amended (G8) |
| "I handled this another way" | Terminal action on record | J4 | amended (G10) |

IA verdict: **no new top-level IA.** Public nav (post-S3): Ask · Businesses · Claim your business page; For agents in footer; Activity as home rail. Everything new is a projection of existing objects — which is the healthiest possible signal for the object model.

---

## 3. Kernel derivation — what the surface simulation proves the neutral kernel must provide

Method: every kernel row below is *demanded by an observed user behavior*, not by protocol ambition. This is the discipline PRODUCT.md asks for ("the graph is the differentiator and stays backstage") run in reverse: the backstage is derived from the stage.

| # | Surface demand (evidence) | Neutral kernel primitive required | Already in contracts? |
|---|---|---|---|
| K1 | Six entry paths, one review; thread always exists (C1) | **Atomic task-creation operation** with idempotency, provenance-seeded events, revisioned context projection | Yes — C1 `BeginSingleBusinessReview`; kernel-neutral name: task admission |
| K2 | Exhaustive consent, principal/subject posture, one-use send (A5, G7) | **Mandate primitive**: principal-bound, subject-aware, action+scope+revision-bound, expiring, one-use authorization with typed refusals | Yes — A5 tuple; G7 adds subject/delegation posture UI-side; kernel already models it (clearance/mandate) |
| K3 | Record proves handoff, survives disputes, exports (G2, boundary non-claims) | **Evidence ledger**: immutable payload snapshot/hash, consent snapshot, delivery observations, append-only lineage + **redaction-safe projection** (export = a projection with field selection, never a new truth) | Receipt/records yes (A2); the *export projection with selective disclosure* is NEW kernel work |
| K4 | Waiting states age truthfully; no-reply terminalizes; snooze requeues; cessation verified (C5, JOURNEY §6) | **Temporal orchestration**: owned clocks, leases, idempotent sweeps, terminal ownership | Yes — Temporal Operations Contract; kernel needs the actual scheduler (repo has none — engineering hard stop W2) |
| K5 | Comparison across sequentially obtained replies; unknowns as unknowns; no fake equivalence (G1, compare.md) | **Response schema + commensurability model**: versioned `responseSchemaRef`, field-level provenance (business-verbatim vs extracted), null ≠ not-asked distinction | Partially — WEDGE seam was 'deferred'; **J5 promotes it to required now**; comparison = one versioned object with two projections (compact in-thread item + full-width `/compare` route) and conversational basis refinement — see compare.md §Projection model |
| K6 | Identical-brief assertion across episodes; field diff (G4) | **Brief revision model with structural diff**: canonical field identity across revisions/episodes | Partially — brief versioning exists (A1 seams); the cross-episode diff is new |
| K7 | Response posture on cards before selection (G5) | **Binding telemetry**: per-business reply-rate/latency evidence with attribution + recency, computed from delivery/response events — evidence, not a verdict (PRODUCT.md rule 5) | NEW — derived entirely from K3/K4 events; no new writes |
| K8 | Cold-trust listing facts; unclaimed honesty; admission gate (G6, C6) | **Capability admission registry**: `R1TargetAdmitted` predicate as a queryable, explainable state (why refused, what's missing) | Yes — C6; the *explainability projection* (owner-status legibility) is the addition |
| K9 | Record handles in Activity without keys (G3); two-URL access grants (C3) | **Capability-scoped access objects**: bearer key + derived non-secret handles + thread-read grants, rotation/revocation | Partially — key lifecycle specced (A12); handle minting is new |
| K10 | Out-of-band resolution (G10) | **Customer-asserted terminal events**: user statements as first-class evidence class (distinct provenance from business/system events) | NEW — small but semantically important: the ledger accepts asserted, not only observed, events |
| K12 | Sign-what-you-see; disputes answered by replay (TX lens, WEDGE §4.3b) | **Canonical serialization + content digest**: one typed canonical encoding of the brief (schema version inside hashed bytes); digest binds review UI, admission, receipt, and export; owner reply countersigned over its digest | NEW — MUST land before the first persisted receipt (cannot be retrofitted) |
| K11 | Third-party agents act for principals (J7, W5 hard stops) | **Delegation verification** + versioned public envelope with `doesNotProve` | Yes — A3/A5; kernel has clearance verification already |

**The reading of this table:** the kernel the surfaces need is *smaller and different* from a generic routing engine. Nothing here demands live routing graphs, multi-provider execution, or spend authority. It demands: task admission, mandates, an evidence ledger with projections, clocks, a response/commensurability model, and derived telemetry. K5 and K6 are the strategic surprises — the "deferred" response-schema seam is the first thing sophisticated users hit. K7 is the compounding moat: posture evidence derived from the ledger makes every marginal journey improve routing honesty — evidence, never a verdict.

---

## 4. Build order

| Wave | Journeys | Rationale |
|---|---|---|
| 1 | J1 + J2 | Acquisition + the free-value covenant; no consequential writes; K8 read-side + K7 stub ('No reply history yet') |
| 2 | J6 then J3 | Claim-first: activate admitted supply before exposing the send wedge. J3's ship test requires ≥1 admitted business; K1/K2/K3; **first task: K12 canonical serialization/digest — everything downstream references it**. <!-- stupid-shit: S2 --> |
| 3 | J4 | The loop that makes J3 true (clocks, owner side, messaging); K4/K9/K10 |
| 4 | J5 | The sophistication unlock; K5/K6 + export projections |
| 5 | J7 | Machine parity once human loops are proven |

Gate between waves: the corresponding blind-persona simulation re-run must clear the prior walkout point.

<!-- stupid-shit: S2 -->
Claim-first is the GTM order: J6 leads so at least one business is admitted before J3 can deliver a send; until then, J1/J2 carry customer value and J3 refuses honestly.

---

## 5. Common-sense register (final pass, 2026-07-13)

Scope corrections from a cold judgment pass. These adjust the BUILD, not the architecture.

### Add (missing obvious things)
| # | Gap | Lands in |
|---|---|---|
| CS1 | **Owner reply-by-email**: notification email contains the request; owner replies to the email; AE ingests + records it. Portal = power surface, email = on-ramp. Kills the sign-in cliff. | J4/J6; owner-inbox.md gains an email-channel section; kernel: inbound-email ingestion as an attested event source |
| CS2 | **Distance/map**: "how far from me" as a first-class registry-card + listing fact | J1/J2; registry.md, listing.md |
| CS3 | **Indicative pricing**: optional owner-published rate field ("callout from $X"), business-attested provenance | J6 claim form; listing rail price posture |
| CS4 | **"When do you need this?"** structured timing field (today/this week/flexible/date) on composer + brief | J2/J3; feeds urgency routing (G5) |
| CS5 | **Human support path**: visible "contact AE" escape on record, confirm, and owner surfaces | J3/J4 |
| CS6 | **Honest third-party proof link-outs** (Google reviews, ABN lookup) on listings | J1 |

### Simplify (V1 cuts; architecture unchanged)
| # | Cut | Rule |
|---|---|---|
| CS7 | Consent screen = ONE calm page (what's sent, to whom, send). Digest/nonce mechanics stay; ceremony grows with stakes, not before them | confirm-and-send V1 render; full readback depth returns at money rungs |
| CS8 | Item types collapse to ~6 in V1 (`system_note` absorbs status/work/error kinds); the union grows later | ITEM-SPEC V1 note |
| CS9 | `/activity` ships as a home rail + paste-a-link box; the route/pillar is deferred until it has content | nav registry |
| CS10 | Countersigning deferred until first real dispute; K12 digest stays (un-retrofittable) | WEDGE §4.3b target-state row |
| CS11 | No episode/group vocabulary may ever surface in UI; user model is "message another one" | copy rule |
| CS12 | **Doc freeze**: no new design documents; new insights land as code or spec diffs | process |

**The V1 sentence:** a trustworthy listing + a structured message relay with receipts + owners who can reply by email.
