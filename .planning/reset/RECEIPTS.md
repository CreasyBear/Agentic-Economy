# Atomic Operation Market Reset — Receipts

Measured evidence per card. Append-only. Cards defined in [`CARD-LEDGER.md`](CARD-LEDGER.md).

## P0-a — Stash triage

**Verdict: abandon all 13, archived as recoverable tags.**

Every stash was created on retired branches (`gsd/plan-21.7`, `gsd/execute-21.6`,
`codex/stabilize-working-tree`) against an architecture that no longer exists. Path existence
check on the current tree: every touched path is dead.

| Dead path family | Present today |
| --- | --- |
| `convex/ownerInbox.ts`, `convex/ownerInboxDashboard.ts`, `convex/ownerInbox/` | no |
| `src/views/inbox/`, `src/routes/dashboard.inbox.tsx` | no |
| `src/lib/billing/` (`outcomeBilling.ts`, `moneyMovementGate.ts`) | no |
| `src/lib/convex/runtimeStores/`, `src/lib/inbox/` | no |
| `src/routes/v1/agents/chat-sessions.ts` | no |
| `tests/security/` | no |
| `.planning/OUTCOME-VOCABULARY.md`, `.planning/SCHEMA.md` | no |

No unique surviving work exists in any stash: outcome-billing was superseded by
`src/modules/money`, owner-inbox by the operator supply surfaces, and the agent chat-session
routes by `src/modules/answer-thread`. Restoring any stash would resurrect deleted modules.

Archive tags (recoverable via `git stash apply <tag>` or `git show <tag>`):

| Tag | Commit | Origin |
| --- | --- | --- |
| `archive/stash-00` | `1b5d2cba` | gsd/plan-21.7 pre-main-integration dirty state |
| `archive/stash-01` | `561991d0` | ownerInbox drift |
| `archive/stash-02` | `c5bbd1d8` | final unrelated churn isolation |
| `archive/stash-03` | `ab28a444` | dashboard inbox route drift |
| `archive/stash-04` | `dbde3a65` | inbox drift |
| `archive/stash-05` | `893591ae` | 21.7 planning-closeout source drift |
| `archive/stash-06` | `017448af` | pre-restore dirty on gsd/plan-21.7 |
| `archive/stash-07` | `0481ef94` | post-21.6-merge billing churn |
| `archive/stash-08` | `2199ce82` | pre-21.6 branch cleanup |
| `archive/stash-09` | `325b149b` | post-21.6-closeout billing drift |
| `archive/stash-10` | `385e8235` | post-21.6 execution churn (42 files) |
| `archive/stash-11` | `9208ebb4` | 21.6-wave1-isolation (16 files) |
| `archive/stash-12` | `75fd8cc2` | pre-21.6-execution churn isolation |

Stash list cleared after tagging. Per the operating model, any new stash after Phase 0 is a regression.
