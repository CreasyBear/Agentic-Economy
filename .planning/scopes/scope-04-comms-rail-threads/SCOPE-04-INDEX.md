# Scope 04 — Communication rail: durable receipted agent-business threads (CURRENT INDEX)

**Status:** active lightweight execution index.  
**Historical context:** `.planning/archive/scopes/scope-04-comms-rail-threads/`.  
**ADR:** `.planning/adr/ADR-004-comms-rail-threads.md`.  
**Boundary:** messages/status only. No booking, payment, dispatch, or auto-fulfilment; AE never fabricates a business reply.

## Current truth

- Issues #22-#28 are treated as resolved in the wayfinder map and ADR-004 decision text. The archived index line saying tickets are "to resolve in wave 1; not pre-resolved" is stale for current orchestration.
- 04-01 is now a reconciliation/verification task, not a fresh decision-discovery task, unless current ADR/issue evidence contradicts it.
- 04-02+ remains gated by Scope 2 endpoint/reply-channel facts, Scope 3 identity/readback principal, PM-04 owner replay evidence, and PM-05 copy/provenance adaptation.
- Deployed dev/staging proof must use an explicitly enrolled, URL/domain-pinned test/demo endpoint. Local fixtures are CI smoke only.

## Preflight gates

| Gate | Required artifact before code/demo |
|---|---|
| S4-G1 decision reality check | ADR-004 has concrete resolutions for #22-#28; issues closed; map issue #1 has one line per decision. |
| S4-G2 endpoint dispatchability | Scope 2 output: checked+fresh same-origin reply URL, signing refs, SSRF/refusal matrix, no-dispatch-before-S4 statement. |
| S4-G3 status-model fixture | Outbox state fixture proving delivered != read, failures/backoff/dead-letter, cursor-gated read, and no reuse of `triggered|sent` to imply read. |
| S4-G4 readback-token tabletop | Token mint/delivery/access/cursor/expiry/tombstone/foreign-thread refusal/no-store/no-referrer/log-scrub/hashed-storage projection. |
| S4-G5 copy/provenance fixture | Human owner reply, business-operated reply, AE demo reply, assistant-submitted inquiry, quote, intent-to-continue; all pass PM-05. |

## Execution order

| Work | Source | Current status | Gate |
|---|---|---|---|
| 04-01 reconcile decisions | Archived 04-01 plan + issue #1 | Planning reconciliation only | Must not re-litigate resolved tickets unless evidence changed. |
| 04-02 message envelope + thread readback | Archived 04-02 plan | Blocked from implementation until S4-G1/G4 and Scope 3 readback principal are settled | Source-local only. |
| 04-03 business reply channel dispatch/inbound | Archived 04-03 plan | Blocked until Scope 2 output + S4-G2/G3 | Endpoint 2xx means delivered to channel, never read. |
| 04-04 provenance/e2e | Archived 04-04 plan | Blocked until PM-04/PM-05 and dev/staging endpoint | No local-only proof closeout. |

## Done

A reviewer can reconstruct submit -> signed delivery attempt -> signed business reply -> read/status from source rows, and every human/demo label preserves quote != transaction, delivered != read, and intent != booking/payment.
