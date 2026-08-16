# Parked capability decisions — Product-Frontier Cleanup

Captured: 2026-08-15. These decisions satisfy Batch 2 park-or-wire and Batch 5
successor ownership. No named vision primitive is deleted by this record alone.

## 1. WorkTree weekly memo / async re-entry

**Status:** parked and owned — do not delete.

**Decision:** Notification-outbox is the re-entry owner. Weekly memo remains the
WorkTree projection + React Email template that enqueues through
`enqueueWorkTreeMemoNotification` → notification-outbox
(`template: work-tree-weekly-memo`).

**Successor path:** Keep `src/modules/work-tree/internal/memo.tsx` and
`memo-notification.ts` until a scheduler/cron (or owner UI action) regularly
enqueues memos in hosted environments. React Email stays until that wire is
live or an explicit retirement ADR replaces this decision.

**Not chosen:** Delete memo now; replace with an undefined alternate projection.

## 2. Project-spine wayfinding / chase

**Status:** parked — successor named, characterization pending.

**Decision:** WorkTree owns project-spine wayfinding and chase semantics as the
product successor. Customer Request remains the bounded execution/mandate spine
and does not absorb project-spine chase UI.

**Required before code deletion:**
1. Characterize which WorkTree verbs/nodes replace project-spine chase.
2. Soft-retirement deployment that drains/cancels workflow instances.
3. Export rows/events/quotes with checksum evidence.
4. Later deployment drops the three project-spine tables.
5. Add an intentional retirement entry to the product-frontier manifest with
   successor + evidence disposition.

**Until then:** Keep `src/modules/project-spine/` and `convex/projectSpine.ts`.

## 3. Shipping provider-integration (Batch 2)

**Status:** retired (test-only shipping stack).

**Successor:** none — capability-supply + generic operation invoke cover market
operations; shipping was not on the product frontier.

**Evidence disposition:** deleted module + dedicated tests; domain vocabulary in
Customer Request fixtures may still use “shipping” as scenario labels.
