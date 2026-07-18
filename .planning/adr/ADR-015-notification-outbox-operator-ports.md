---
# ADR-015: Notification outbox operator ports
Status: Accepted
Date: 2026-07-18
Scope: Wave 43 design unlock for webhook ingest + operator retry / no-repair deepen on `convex/notificationOutbox.ts` (~1287 lines)
Supersedes: nothing
Related: `.planning/adr/ADR-002-governed-action-bounded-contexts.md` (inquiry governed-send stays inquiry-owned); `.planning/adr/ADR-013-route-dispatch-lifecycle-ports.md` / `.planning/adr/ADR-014-customer-request-v2-write-ports.md` (same deepen pattern; different host); `.planning/codebase/CONCERNS.md`; `.planning/codebase/WAVES-43-49-PLAN.md`; Wave 37 shared persist (`notificationOutboxPersistence.ts`, `notificationOutboxSourceStatePorts.ts`)

## Context

Wave 37 closed **shared dispatch persist** and left `inquiryNotificationBridge.ts` thin. Pure notification commands already live in
`src/modules/notification-outbox/` (`ingestNotificationWebhook`, `retryNotificationDispatch`,
`markNotificationNoRepair`). The Convex host `convex/notificationOutbox.ts` (~1287) still owns
webhook ingest and operator repair orchestration.

Three correctness-critical mutation surfaces remain host-owned orchestration today:

| Export | Host | Role |
|--------|------|------|
| `ingestNotificationWebhookEvent` | `convex/notificationOutbox.ts` | System-keyed webhook ingest |
| `retryNotificationDispatchAsOperator` | same | CSRF-gated admin operator retry |
| `markNotificationDispatchNoRepairAsOperator` | same | CSRF-gated admin operator no-repair mark |

**Out of this family:** `enqueueInquiryNotificationDispatch` (ADR-002), `dispatchNotificationOutbox`,
read projections, Wave 37 persist reopen, re-inflate `inquiryNotificationBridge.ts`.

## Decision

### 1. Dedicated NotificationOutboxOperatorPorts (Wave 43)

Wave 43 SHALL deepen the three exports so that:

1. Host exports remain the sole public registrations (same names/paths).
2. Handlers become thin: host validators + admission gates → ports → one module orchestration function.
3. Orchestration reuses existing pure commands under `src/modules/notification-outbox/`.
4. Load/persist of source state reuses Wave 37 `NotificationOutboxSourceStatePorts` **inside the adapter**; operator reconstruction/authority live on **NotificationOutboxOperatorPorts**.

**Locked names**

- Ports type: `NotificationOutboxOperatorPorts`
- Adapter: `convex/notificationOutboxOperatorPorts.ts`
- Factory: `notificationOutboxOperatorPorts(ctx)`

**Stop condition:** if adapter approaches ~1k lines, split reconstruction helpers under this same ADR — do not reopen Wave 37 persist as a chop.

### 2. No WritePlan / intendedPatches in notification-outbox modules

Ports expose semantic, immediately executed operations.

### 3. Validators stay in the outbox host forever

### 4. Forbid shallow Convex sibling chops

Rejected: `notificationOutboxWebhook.ts`, `notificationOutboxOperator.ts`, `notificationOutboxRepair.ts`.

### 5. Call sites unchanged

```text
System webhook → ingestNotificationWebhookEvent → operator.ingestWebhook(ports)
Admin repair → retry* | markNoRepair* → operator.*(ports)
```

### 6. Status and wave gating

**Status: Accepted.** Wave 43 implements under this ADR only.

## Consequences

Easier: shrink host webhook/operator glue; keep Wave 37 persist closed; keep ADR-002 enqueue inquiry-owned.

Harder: do not bleed into enqueue, dispatch-loop, or read projections.

## Rejected alternatives

Sibling host chops; WritePlan DTOs; folding enqueue into OperatorPorts; growing SourceStatePorts into operator orchestration; reopening Wave 37 persist as the deepen; implementing without Accepted ADR-015.

## Verification expectations (Wave 43 implement)

1. Three exports thin via OperatorPorts.
2. No WritePlan / Convex runtime in operator module home.
3. Adapter `<= 1000` lines; no sibling host chops; bridge not re-inflated.
4. `notification-outbox-runtime` and related suites green.
5. Deletion test: orchestration concentrates in module + adapter.

## Decision record

Accepted 2026-07-18 as Wave 43 design unlock. ADR-002 and Wave 37 remain authority for enqueue and shared persist.
