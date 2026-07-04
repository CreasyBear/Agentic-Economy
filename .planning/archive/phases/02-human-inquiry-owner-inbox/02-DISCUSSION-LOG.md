# Phase 2: Human Inquiry + Owner Inbox - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-27
**Phase:** 02-human-inquiry-owner-inbox
**Areas discussed:** planning horizon, production maturity, inquiry boundary, notification boundary, deferred surfaces

---

## Planning horizon and maturity bar

| Option | Description | Selected |
|--------|-------------|----------|
| Phase-only executable | Discuss and plan only Phase 2 now; keep P3-P5 as dependency notes. | |
| Cross-phase architecture + production proof | Plan P2-P5 as one live-app architecture; each completed phase ships real behavior and evidence. | ✓ |
| Collapse phase boundaries | Build P2-P5 as one integrated release. | |

**User's choice:** User clarified full maturity production-ready implementation, no runtime theatre, full keys/dependencies when phases complete, and future-state modularity.
**Notes:** Context now uses cross-phase architecture plus production evidence. Execution can still be phased, but each phase must be live-app complete for its scope.

---

## Human inquiry boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Human-only inquiry | Customer submit, owner inbox/reply, one real notification adapter. | ✓ |
| Rich inbox platform | Multi-channel inbox, attachments, automations, marketplace workflows. | |
| AI-assisted reply | Draft or send AI/agent-authored replies. | |

**User's choice:** Locked by spec and production reframing.
**Notes:** Phase 2 is not smaller because it is scoped. It is production-complete for the human communication loop.

---

## Notification boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Resend/Novu production module | Resend delivery plus Novu workflow/readback layer behind AE-owned outbox, env/key setup, webhooks, and idempotency. | ✓ |
| Multi-channel suite | SMS/WhatsApp/Slack/voice/push abstractions beyond the Resend/Novu email path. | |
| Provider bake-off | Re-open provider choice despite backup Resend/Novu direction. | |

**User's choice:** Use Resend/Novu similar to the backup.
**Notes:** Phase 2 locks Resend/Novu. The completed phase must configure and verify real Resend and Novu provider/sandbox paths without moving message, consent, inbox, or audit authority out of AE.

---

## the agent's Discretion

- Exact Resend sender/domain, Novu workflow IDs, and env names after current official docs review.
- Exact table/function/component names.
- Whether unauthorized owner reads return forbidden or not-found per security posture.

## Deferred Ideas

- AI replies, booking, payments, protected actions, request-market behavior, multi-channel notifications, SDK/API-platform surfaces.
