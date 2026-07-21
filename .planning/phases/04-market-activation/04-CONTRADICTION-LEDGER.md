# Phase 4 contradiction ledger

**Reconciled:** 2026-07-21
**Mapped source:** `63a451f43edea453d0a1a8d8502504433acf76fb`

| Contradiction | Resolution | Superseding authority |
|---|---|---|
| Phase 4A Business Account → 4B three quotes → 4C quote-to-close was described as the closure loop. | Superseded. Phase 4 is Business Account and routeable-supply source maturity. Three-quote/quote-to-close moves to future Phase 5 and has no dispatch authority. | ROADMAP; 04-CONTEXT; 05-CONTEXT |
| Phase 4 plans were based on the Phase 3B planning snapshot. | Superseded by the seven-file codebase map pinned to Phase 3D commit/tree. The planning branch itself is not an executable base. | `.planning/codebase/*`; 04-INSTANCE-CONTRACTS preflight |
| “Commercial references” could collapse account billing, operation payment, usage, metrics and payouts. | Rejected. Commercial and Usage gain separate source owners; all five truths remain independent. | ADR-025 |
| Closure was scheduled before supply and Work existed. | Reordered. Relationship/support is early; pause/withdraw/offboard/closure is WP2.4 after reachable supply and Work/recovery. | 04-PLAN; instance contracts |
| WP1–WP12 had no reachable operation-ingress owner. | Added WP4.2 for exact supply materialization, registration, human/agent adapters, authority, attempt, Usage and business-affinity Work creation. | 04-PLAN; 04A-INSTANCE-CONTRACTS |
| Operation invocation routes were treated as the whole agent Business Account surface. | Split final scoped-agent account/Work reads and closed commands into WP7.2 after bounded projections and exact Work exist. | 04-PLAN; 04A-INSTANCE-CONTRACTS |
| The paid-information seed could have reused Phase 3 evaluator result records. | Rejected. WP3 creates a domain-owned result/reconciliation source and persistence adapter; evaluator records remain evidence-only. | 04-SOURCE-MAP; WP3 |
| Browser routes were planned without an agent Business Account surface. | Added one account resolver and semantic projection used by human and scoped-agent adapters with parity falsifiers. | 04-UI-SPEC; WP1/WP4.2/WP12 |
| Phase 4 appeared to require three implemented availability products. | Narrowed to one paid-information seed operation plus appointment/dispatch hostile substitution fixtures. | WP3/WP10/WP12 |
| `/businesses/:businessId/settings/security` duplicated personal security. | Retired. Personal identity, sessions and security remain canonical at `/settings`. | 04A Business Account contract; UI-SPEC |
| Canonical Inbox used `threadRef` while parcel paths used `threadId`. | Normalized target paths to `threadRef`; compatibility adapters may translate existing source IDs without changing canonical vocabulary. | 04A-INSTANCE-CONTRACTS |
| Route generation was deferred until all UI parcels while parcel browser tests required routes earlier. | Parent now integrates and generates after each route-bearing parcel before that parcel's browser test. | 04-INSTANCE-CONTRACTS; 04A-INSTANCE-CONTRACTS |

Historical files and Git history remain provenance. They cannot override the
active documents above or prove implementation.
