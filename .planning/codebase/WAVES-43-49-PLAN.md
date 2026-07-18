# Waves 43–49 — Next residual deepen plan

**Status:** CLOSED (Waves 43–49 complete at `6983a50d`)  
**Baseline:** Waves 23–42 **CLOSED** · ADR-011–014 **Accepted**  
**Thermo:** PASS WITH RESERVATIONS (2026-07-18)

## Goal

Continue optional leftovers without reopening closed deepens. Primary track: notification outbox webhook/retry. Secondary: V2 preparation, then V2 reads, then mandate issue/revoke.

## Locked constraints (carry forward)

1. Provide-facts ports pattern.
2. No `WritePlan` / `intendedPatches` under `journal/`, `machines/`, or `v2-write/`.
3. No Convex sibling chops.
4. Do not grow JournalPorts / closed families for new work.
5. Adapter ceiling ~**1000** lines.
6. Call paths unchanged; validators in Convex forever.
7. ADR-002 governed-send stays inquiry-owned.
8. Do **not** reopen Waves 23–42.

### Process (each implement wave)

`Task(engineering-*)`: architect → onboarding → backend → minimal-change → code-reviewer → thermo. Commit after thermo PASS. Do not commit `outputs/*`.

---

## Wave map

| Wave | Kind | Deliverable |
|------|------|-------------|
| **43** | Implement (+ short ADR/note) | Outbox webhook ingest + operator retry/no-repair ports |
| **44** | Design | **ADR-015** V2 preparation family |
| **45** | Implement | Prep / resume ports (first prep slice) |
| **46** | Implement | Prep egress / prepared-action (same ADR if ceiling allows) |
| **47** | Design+Implement | V2 read projections (skip if quiet) |
| **48** | Design | ADR mandate issue/revoke ports |
| **49** | Implement | Mandate issue/revoke machines |

**Insert anytime:** `readProblemForBusiness` micro-thin (ProblemPorts headroom).  
**Side-band:** inquiry dual-path parity harness (verification, not deepen).  
**Park:** registry/discovery/Application size-only.

---

## Wave 43 — Outbox webhook / retry / operator (top)

**Why Strong:** Only host clearly past 1k (`notificationOutbox.ts` **1287**). Wave 37 closed shared persist; module commands already exist.

**In scope:**
- `ingestNotificationWebhookEvent`
- `retryNotificationDispatchAsOperator`
- `markNotificationDispatchNoRepairAsOperator`
- Shared audit/serialize/reconstruction helpers those need

**Out of scope:** inquiry enqueue/bind (ADR-002); re-inflate `inquiryNotificationBridge.ts`.

**Locked names (proposed):** `NotificationOutboxOperatorPorts` (or MutationPorts) + `convex/notificationOutboxOperatorPorts.ts` — finalize in Wave 43 design half.

**Exit:** host under ~1k or clearly validator+shell; thinness lock; `notification-outbox-runtime` green.

---

## Waves 44–46 — V2 preparation

ADR-014 deferred prep. Four hosts ~2005 LOC. New ADR-015 required. Slice prepare/resume first, then egress/prepared-action if adapter headroom.

## Waves 47 — V2 reads

Optional after prep. Do not absorb into WritePorts (856). Separate read ports ADR.

## Waves 48–49 — Mandate issue/revoke

Target `customerRequestRouteMandate.ts` (~873), **not** already-thin `…MandateLifecycle.ts` (76). New ADR.

---

## Acceptance for Wave 43 band start

- [ ] Map refreshed (`be0979d4`)
- [ ] Thermo PASS WITH RESERVATIONS naming only parked leftovers
- [ ] User picks which candidate to execute first (default: Wave 43 outbox)
