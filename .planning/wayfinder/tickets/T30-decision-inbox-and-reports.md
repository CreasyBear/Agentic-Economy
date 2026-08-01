# T30 — Decision inbox + report projection

Labels: `wayfinder:prototype` (HITL). Map: [Framework](../MAP-framework.md). Blocked by: [T26](T26-node-contract-and-rollup-algebra.md).

## Question

Prototype the two person-surfaces to founder reaction: (1) the decision inbox — never more than N
decision-ready items, consultant voice (v3), lock/adjust/park exits, batched money-yes; (2) the sent
report — weekly memo/exception alert as a crafted projection through notification-outbox ("the report
IS the product surface"). Includes the live tree view (v4 structure: tree pane + workspace pane +
five-dimension top bar) at prototype fidelity. Linear-builder craft bar; reactive/never-stale via
Convex.

## Resolution

(pending founder reaction; the decision-dialog slice below is implemented, not the full ticket)

**Scope ruling (founder, 2026-08-01):** the tracker is NOT the consumer product. Primary person
surfaces are the dialog + decision inbox + memo (relationship surfaces); the tree (v4) is a
behind-disclosure view ("see the whole plan") and suits work-shaped users (SMB/GTM), never the
front door for life projects. CRM/tracker density belongs to operator/business consoles. circle
(`ln-dev7/circle`, MIT) is a pattern source for the disclosure tree + consoles only.

### Decision-dialog checkpoint (2026-08-01)

The smallest J1 → J3 → J7 slice now runs through the existing `/` dialog: a typed model proposal
authors one shallow, durable decision map; the person can correct an assumption or Lock/Adjust/Park
the single ready decision; a correction returns the exact preserved/affected/reopened ripple; the
full map and decision trail stay behind **See the whole plan**. No business search, quote, account,
notification, payment, or mandate is claimed or executed on this branch.

Source: `src/modules/decision-map/`, `convex/decisionMaps.ts`,
`src/modules/answer-thread/internal/turns/proposal.ts`, and
`src/components/ae/decision-map/`. The UI reuses shadcn Card/Badge/Button/Collapsible and the
existing TanStack Start dialog seam; Convex remains canonical. Focused proof: 47 tests across the
proposal transport, kernel, Convex store, session ownership, durable replay marker, stream
reducer/presenter, and Lock/correction/stale UI transitions. Convex codegen also bundles successfully.

Proof ceiling: mocked model transport and local Convex tests prove the source contracts, not hosted
model availability. The live `/` smoke reached the proposal path but fell back safely because the
configured OpenRouter credential returned `User not found`; no real-business interaction occurred.
The weekly memo, exception report, five-dimension top bar, and founder visual reaction remain in
T30.

## Named adopted libraries (adopt-first rule)

Source: [donor hunt](../../research/2026-08-01-framework-kernel-donor-hunt.md), 2026-08-01.

- **INSTALL (not yet installed — T31 recommended it, nobody added it)** `@react-email/components` +
  `@react-email/render` for the memo/exception report. Convex-safe: Render 1.2.3 shipped "use edge
  exports in convex runtime"; render inside a Convex action and hand the HTML to the mail provider.
  Rejected `jsx-email` — its `render()` reads config from the filesystem (`node:path`, `lilconfig`).
- **VENDOR** `shadcn-labs/emailcn` (MIT) `registry/bases/react-email/blocks/notification-*.tsx` as
  the digest/exception-alert layout donor; keep the LICENSE when copying.
- **BORROW** `ln-dev7/circle` (MIT) exact files for the inbox pattern:
  `components/common/inbox/inbox.tsx`, `issue-line.tsx`, `issue-preview.tsx`,
  `store/notifications-store.ts`, `components/issues/status-selector.tsx`.
- **AVOID as our inbox** `@novu/react` `<Inbox />` — `Notifications.list()` fetches Novu-hosted
  notifications and the render props receive Novu `Notification` objects; there is no seam for AE
  Convex records. Only adoptable if we adopt Novu's backend.
- **INSTALL (not yet installed — T31 recommended it, nobody added it)** `react-arborist@3.16.0`
  (verified active, React 19-compatible peers) for the behind-disclosure tree; `@headless-tree/react`
  is the headless alternative if rows need to carry fog/dimension metadata.
- **ADOPT** `@svar-ui/react-gantt@2.7.1` (MIT, React 19 peers, supports `criticalPath`/`calendar`)
  for the plan/timeline disclosure view; fallback `react-calendar-timeline@0.30.0-beta.19`.
  Rejected `gantt-task-react` (React 18 peer, frozen 2022).

**Recorded adoption-search failure (legitimate hand-roll):** the proposal → positions → outcome
decision affordance. No MIT React component exists; Polis/DemocracyOS/ConsiderIt/Loomio are
AGPL/GPL/Ruby, `snapshot.js` is schema-only and Ethereum-specific. Compose shadcn primitives over
the Convex mutation contract.
