# AE Design Document Set

**Updated:** 2026-07-13 · Canonical set. Everything not listed as canonical is archived rationale — cite it, never treat it as authority.

## Canonical documents (normative)

| Doc | Authority over | Cited IDs |
|---|---|---|
| `PRINCIPLES.md` | Design constitution: locked decisions D1–D6, laws, IA/conversational/confirmation/design-system rules, anti-patterns, route blueprints | LAW-1..10, IA-1..9, CH-1..11, AX-1..7, DS-1..15 |
| `JOURNEY.md` | Flow semantics: decided funnel (Shape D), 11 stage contracts, JourneyContext projection, provenance vocabulary, temporal operations, R0 value covenant | stage contracts, clock owners |
| `JOURNEY-SYSTEM.md` | The connective tissue: identity spine, route canonicality (`/t` vs `/i`), entry normalization (C1), transition envelope (C2), cross-actor sequence + messaging (C5), routability admission (C6), return-channel readiness (C4), episodes (C7), nav/route registry, break registry | contracts C1–C7, break registry B/A |
| `CONVERSATION-ITEM-SPEC.md` | The shared primitive: item types, discriminated state unions, transition registry, public envelope, anatomy, projections, a11y | item types, transition registry |
| `JOURNEYS-TO-BUILD.md` | The build map: journeys J1–J7 with ship tests, new-views delta, kernel derivation K1–K11, build order + persona re-run gates | J1–J7, K1–K11 |
| `WEDGE-LADDER.md` | Capability & claims: rungs R0–R4, group/child object model, authority tuple, release gates, retention/evidence separation, anti-scope guardrails | R0–R4, nine seams |
| `KERNEL-CEILING.md` | Kernel strategy ceiling: vertical-neutral schema constraints C-1..C-7, protocol-field posture (adopt Web Bot Auth/MCP/A2A/UCP/AP2), neutrality economics, ceiling kill conditions | C-1..C-7 |
| `ECONOMY-THESIS.md` | Economic object + market structure: commitment-lattice constraints E-1..E-6, structural claim, incumbent windows, behavior capture map, R2-era capacity-stake candidate, curriculum framing, falsifiers | E-1..E-6 |
| `DECISION-REGISTER.md` | Management ledger: DRI/trigger/acceptance per C/E constraint, dated windows with auto-downgrade, moat-vocabulary gate, ADR stubs, strategy-freeze rules | ledger rows |
| `WAVE-1-PLAN.md` | Executable Wave 1: task breakdown J1.1–J2.5, dated cadence Jul 14–23, cut order, success metrics, instrumentation contract, persona-gate protocol, risk register | tasks J1.x/J2.x |

## Precedence <!-- tape-out: A8 -->

When documents disagree, the owner of the domain wins:

1. **`WEDGE-LADDER.md`** — what AE may claim and do at the current rung (capability/claim authority).
2. **`JOURNEY.md`** — what happens at each stage and when (journey semantics).
3. **`JOURNEY-SYSTEM.md`** — what happens BETWEEN surfaces: identity spine, transitions, cross-actor edges, notification re-entry. Page specs defer to it on any cross-route question.
4. **`CONVERSATION-ITEM-SPEC.md`** — how state is typed and rendered (state/presentation authority). Once a generated TypeScript schema exists, the generated schema supersedes the prose spec for state shape.
5. **`PRINCIPLES.md`** — cross-cutting rules; constrains all of the above but never defines domain objects.

Archived docs have **no precedence**. They are rationale.

## Drift protocol <!-- tape-out: A8 -->

- A code change that conflicts with a canonical doc MUST update the owning doc in the same change, or the change fails review. Runtime never silently wins; docs never silently preserve obsolete behavior.
- Rule IDs are frozen: never renumber. Retire an ID by marking it superseded in place with a pointer.
- Copy-claim scanners (`src/lib/ui/contract-scans.ts`) currently encode `PhaseNumber = 2..6`. At the first rung-gate decision they MUST migrate to an `allowedRungs` manifest driven by `WEDGE-LADDER.md §7`. Until then, scanner phases are legacy vocabulary — do not add new phase-keyed exceptions.
- New item types, statuses, rungs, or stages require: transition-registry entry, audit-class derivation, projection rules, and a migration fixture — before any renderer work.

## Two-layer framing (voice vs mechanics)

Root `PRODUCT.md` (2026-07-13, "rebuild AE around the routing engine") owns the **customer voice**; this design set owns the **interaction mechanics**. Surfaces speak PRODUCT.md's vocabulary; every surface projects the design set's typed objects. Neither replaces the other.

| Customer voice (PRODUCT.md / DESIGN.md) | Mechanics (this set) |
|---|---|
| Ask / need in your own words | composer → `user_text` item, thread created (LAW-2) |
| Clarify | `clarification_prompt` item, provenance vocabulary |
| Recommendation (+ alternatives, tradeoffs) | `proposal` / `shortlist` / `comparison` items, evaluationMode gate |
| Quote → Approve (exact quote digest, spend, recipients, purposes) | `permission_request` + enforced authority tuple (A5); confirmation ladder AX-2 |
| Confirm | named send, pending lock |
| Progress / Activity / record | `receipt` + `business_response` items, temporal operations clocks |
| Route docket / Root Run (technical disclosure) | receipt + delivery evidence + admin run projection |
| Businesses | `/registry` projection |
| For agents | machine gateway + `ConversationEnvelope` |

Rules:
- Customer surfaces NEVER lead with mechanics vocabulary (inquiry, receipt, item, tuple, lifecycle) — PRODUCT.md rule 8. The customer word for a receipt is **record**; for a permission_request is **confirmation**.
- DESIGN.md's "replace inquiry receipts" is read as **rename, not delete**: the immutable receipt object (WEDGE-LADDER §4.2) survives; its customer-facing projection is "your record".
- PRODUCT.md's ban on "inquiry workflow" bans the *definition of AE*, not the R1 mechanism. Public copy defines AE by the customer promise; the wedge action is presented as "AE sends your request to {business}".
- Canonical customer strings (locked by audit ruling 2026-07-13): the wedge CTA is **"Send request to {business}"** (names object + consequence per AX-3, no mechanics leak); the durable receipt's one customer name is **"Your record"**; the proposal review entry is **"Review what will be sent"**. Mechanics docs may keep internal names (inquiry, receipt) — they never render as customer copy.
- **TX lens** (locked 2026-07-13): every consequential action follows transaction discipline — sign-what-you-see canonical digest, commit-time preconditions, one-use nonce, append-only ledger with derived projections, receipt≠outcome, countersigned responses, dispute-by-replay. Normative source: `WEDGE-LADDER.md §4.3b`. Customer copy never surfaces digest/nonce/ledger vocabulary.
- Precedence: PRODUCT.md wins on framing/copy/banned-vocabulary; this set wins on object model, states, and confirmation mechanics. A page spec citing both MUST satisfy both.

## Page specs (`pages/`)

Per-route design/wireframe/IA/layout documents. Each follows the canonical page-spec format (register/scene, job, layout+wireframes at desktop and ≤375px, section anatomy, states, interactions, copy voice, responsive, a11y, rule compliance, anti-slop check). Audited 2026-07-13 (two independent reviewer passes; all BLOCK findings fixed).

| Spec | Routes |
|---|---|
| `pages/home.md` | `/` composer front door |
| `pages/thread.md` | `/t/:threadId` |
| `pages/private-record.md` | `/t/:threadId?k=` record projection (S1: one route; key = access method; legacy `/i` redirects) |
| `pages/activity.md` | home returning-user rail + find-record box (CS9: route deferred until accounts) |
| `pages/registry.md` | `/registry` |
| `pages/listing.md` | `/:slug` |
| `pages/confirm-and-send.md` | `/:slug/inquiry` review flow ("Send request to {business}") |
| `pages/compare.md` | `/t/:threadId/compare` comparison workbench (≥2 sequential replies; no ranking) |
| `pages/owner-inbox.md` | `/owner/inquiries`, `/owner/inquiries/:id` |
| `pages/owner-status.md` | `/owner/status` |
| `pages/owner-settings.md` | `/owner/settings` |
| `pages/admin-runs.md` | `/admin/runs`, `/admin/runs/:turnId` |
| `pages/admin-readback.md` | `/admin/claims`, `/admin/inquiries`, `/admin/audit-events`, `/admin/index-health` |
| `pages/trust-pages.md` | `/about`, `/help`, `/privacy`, `/terms` |
| `pages/claim.md` | `/claim`, `/claim/success` |
| `pages/for-agents.md` | `/for-agents` public gateway (+ relationship to `/developers/discovery`) |

Shared public nav projection (IA-2, stated once): **Ask · Businesses · Claim your business page** — footer: For agents · Privacy · Terms · Help · About (S3). Activity = home rail (CS9).

## Journey registers (`journeys/`)

Journey registers turn J1–J7 into first-class management artifacts: each names the end-to-end identity, current status, persona proof, ship test, participating views, stage map, kernel dependencies, open work, common-sense checks, and re-run gate. See [`journeys/README.md`](journeys/README.md) for the register index and status vocabulary, and `JOURNEYS-TO-BUILD.md §5` for the common-sense register applied by every journey.

Pages are built journey-first: every page change MUST cite the journey register whose ship test it advances. A page is not complete merely because its isolated route spec is complete.

## Simulation evidence

`SIMULATION-FINDINGS.md` — 10 blind persona critiques (consumer floor + sophisticated coordination/procurement waves) run against the amended page specs. Owns the convergent abandonment map (G1–G10), the confirmed strengths register, and the prioritized action packet. Key finding: the consent/record spine is universally praised; the work-management layer above it (comparison, export, reuse, worklist) is what gates sophisticated users — and most of it is R1-compatible.

## Archive

`archive/` holds superseded and rationale documents:

- `archive/IA-BEHAVIORAL-FOUNDATIONS.md` — superseded by `PRINCIPLES.md` (all rule IDs carried forward)
- `archive/DESIGN-STUDY-EXEMPLARS.md` — research behind LAW-1..10 (Perplexity/Airbnb/Stripe/Linear/Uber, URL-cited)
- `archive/FUNNEL-CHALLENGE.md` — decision rationale for Shape D (abandonment scoring, Maps steelman)
- `archive/JOURNEY-CONTRACT.md` — superseded by `JOURNEY.md` (stage contracts carried forward)
- `archive/TAPE-OUT-REVIEW.md` — inverse-premortem council record; source of amendments A1–A14 (markers `<!-- tape-out: A# -->` in canonical docs trace back here)

## The decided spine (one paragraph)

A visitor asks at `/` (LAW-1). AE immediately creates a durable thread (LAW-2) and delivers free, inspectable value: an understood-need readback plus an evidence-bearing shortlist (R0, zero consent). Only after value is visible does AE offer the wedge action: turn the understood need into an editable brief and send it to **one** selected business (R1) behind a single exhaustive consent readback ("Send inquiry to {business}") with pending lock and durable receipt (AX-5, LAW-6). The wait is bridged by owned clocks, a notification channel, and private-link return; responses arrive as linked items in the same thread. Calling, copying, or leaving are legitimate successes. The kernel records group/child, brief, response-schema, and comparison-basis seams so R2–R4 extend cardinality and schemas without redesign — and none of their language or UI appears before its rung is supply-proven.
