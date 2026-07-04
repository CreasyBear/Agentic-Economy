# Scope 05 — Transactions + receipts (CURRENT INDEX)

**Status:** active lightweight execution index.  
**Historical context:** `.planning/archive/scopes/scope-05-transactions-receipts/`.  
**ADR:** `.planning/adr/ADR-005-transactions-receipts.md`.  
**Boundary:** source/local and Stripe test-mode only unless a later accepted money decision plus deployed proof admits stronger work. No booking, payment, dispatch, live money, marketplace, wallet, settlement, or autonomous fulfillment claim.

## Current truth

- ADR-005 D1/D2 slug widening is ratified for the closed two-slug set: `provision-paid-intake-endpoint` and `publish-agent-intake-endpoint`.
- ADR-005 D3 mandate binding is an implementation contract, not exposure permission. `businessAction.propose` must remain unregistered until Scope 3 verified identity/mandate exists and an agentTools snapshot diff is reviewed.
- ADR-005 D5 public verifier privacy is settled: read-only, hash/held-ref, non-enumerable, exact `PublicActionReceiptReadback`, no list route, no private payloads.
- ADR-005 D6 live money remains a blocker/non-goal. The future live-money record contents are drafted by issue #32; no live code is authorized.
- Issue #33 overrides the archived demo-kit plan: the full demo-kit receipt loop is blocked until `businessAction.propose` exposure, public receipt verification, pinned dev/staging demo endpoint, and issue #5 deployed inputs exist. No non-runnable `examples/receipt-backed-business-action/` skeleton.

## Preflight gates

| Gate | Required artifact before code/demo |
|---|---|
| S5-G1 demo anti-theatre tabletop | Every visible demo step maps to AE source rows and user/business value; deleting seeded rows breaks the demo. |
| S5-G2 hackathon vs product wedge mapping | Names buyer/operator/business, repeated real behavior represented, horizon proved, and claims not proved. |
| S5-G3 propose exposure STOP gate | Scope 3 attributed principal + mandate refusal tests + deliberate action snapshot diff before registration/exposure. |
| S5-G4 verifier privacy/enumeration | Non-enumerable held ref/hash, no list route, rate-limit posture, field allowlist, sample readbacks with private payloads absent. |
| S5-G5 test-mode/live-money matrix | Every Stripe/pay/paid/checkout term paired with source/local/test-mode and no live payment; provider/deployed/live gates named. |

## Execution order

| Work | Source | Current status | Gate |
|---|---|---|---|
| 05-01 governance/resolutions | Archived 05-01 plan + issues #29-#32/#34/#35 | Mostly resolved; reconcile docs only | Keep #33 open; keep live-money non-goal. |
| 05-02 typed slug set/verifier prep | Archived 05-02 plan | Source-local implementation can proceed if code still needs it | No public/deployed claim. |
| 05-03 propose/private seam + public verifier | Archived 05-03 plan | May author private seams/read verifier; registration/exposure blocked | Scope 3 + snapshot diff + PM-05. |
| 05-04 demo kit | Archived 05-04 plan | Blocked by #33 | No skeleton or proof theatre. |

## Done for any source-local Scope 5 slice

- `businessAction.propose` is absent from `src/modules/actions/index.ts` and `/api/agent/tools` unless the exposure gate is explicitly passed.
- Public verifier returns only `PublicActionReceiptReadback` and cannot enumerate receipts.
- Every summary says source/local/test-mode where applicable and production/live proof not claimed.
