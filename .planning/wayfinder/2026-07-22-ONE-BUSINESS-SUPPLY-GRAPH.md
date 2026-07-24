# Reconcile one business supply graph from listing to execution

Destination: a decision-complete, source-backed specification and migration
that preserves one Offering identity from directory discovery through optional
AE-supported execution. This feeds and narrows issue #185; it does not reopen
Customer Request or Action Invocation.

```mermaid
flowchart TD
  T1["Lock Offering language and identity spine (research)"]
  T2["Define Business Profile, Offering and Access Path contracts"]
  T3["Design compatibility migration and rollback"]
  T4["Prototype public and Business Account projections"]
  T5["Define declared-to-supported promotion and security gate"]
  T6["Falsify with GraphQL data and professional-service quoting"]
  T7["Approve reconciliation specification"]
  T8["Supersede ADR-002; revise Phase 4, R-026 and issue #185"]
  T1 --> T2
  T2 --> T3
  T2 --> T4
  T2 --> T5
  T3 --> T6
  T4 --> T6
  T5 --> T6
  T6 --> T7 --> T8
```

## Closure evidence

- [x] One Offering identity across catalogue and supported supply.
- [x] Business visibility without mandatory services.
- [x] Simultaneous human and machine access paths.
- [ ] Enforce exact promotion against current catalogue source rows.
- [ ] Persist crosswalks and complete dual-read/rollback cutover controls.
- [ ] Connect the safe projection to public, discovery and owner reads.
- [x] GraphQL data and engineering quote use the same contract.
- [x] ADR-002, Phase 4 and R-026 reconciled at decision/source-plan level.
- [ ] Live migration readback and Business Account UI cutover.
- [ ] Independently operated business validation.

## Premortem gates

A declared URL always retains its provenance and never implies AE support.
Directory publication performs no network call. Route generation consumes only
strict routeable supply. Any crosswalk mismatch leaves v1 authoritative. A
private-data or consequential promotion stops until its vertical rights,
quality and evidence gate exists.
