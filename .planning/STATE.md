---
gsd_state_version: 1.0
milestone: protocol-kernel-product-conversion
milestone_name: Protocol/kernel to product conversion
current_phase: 3C
current_phase_name: hosted-paid-operation-product-trial
status: verification_required
stopped_at: "Phase 3C repair Cuts 0-4 locally complete; fresh v2 hosted authorization pending"
last_updated: "2026-07-21"
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 7
  completed_plans: 7
  percent: 80
---

# Current state

Phases 1 and 2 are complete at the local control-plane evidence boundary.
ADR-009 is accepted. ADR-010 is accepted with Gate 10 narrowed. ADR-019 owns
the four-mode product destination.

Phase 3A is complete at the labelled local/mock boundary. Phase 3B confirmed
that a second operation-owned provider can use the same paid-operation host,
semantics and query-agnostic renderer without fallback or a second product
stack.

Phase 3C implementation and one bounded hosted labelled-mock run exist, but
the post-closeout audit reopened verification. Revision
`07581a5a1c91cfaeba8c717fbac5765b9b1fd5b5` served protected human and
structured-agent surfaces and retained three source-owned mock effects. The
live collector then refused `unsafe_uncertainty_continuation`; the packet was
rebuilt later from retained facts and verified only as local packet integrity.
That sequence does not admit the final hosted evidence class.

## Repair frontier

Cuts 0-4 of `03C-REPAIR-PLAN.md` are integrated locally: immutable payment
proposal custody; server-issued agent commands and safe transport recovery;
digest-only human proof; v2 exact-source evidence with post-run admission
shutdown; and the independent lifecycle, surface and release audit corrections.
The source implementation snapshot immediately before this planning checkpoint
is `74107bd347630e83c4fe4b4572e1d17335a932d0` (tree
`b00507a11690b8447fbd2f47c4692d8beaa4a51d`). A fresh hosted run remains a
separate exact-revision authorization gate.

## Remaining evidence gaps

- no real screen-reader session or human comprehension study has been run;
- immutable proposal reconstruction, source-issued commands, stale and
  relationless recovery, digest-only human proof, immutable deployment binding
  and retained shutdown are green only in source, focused fixtures and labelled
  local browser execution; they have not run from a deployed repair revision;
- exact deployment binding, live-evidence admission, credential revocation and
  retained post-disable state still require a fresh v2 collector run;
- the completed run used labelled mock providers and a mock $0.01 payment
  lifecycle; it proves no real payment, settlement or provider fulfilment;
- no customer demand, customer value, production-safety or general non-paid
  action compatibility claim follows from the trial.

## Evidence ceiling

The strongest admitted class is `local_packet_integrity_only` for the retained
labelled mock BTC/USD packet. The sanitized packet digest is
`sha256:18b5f80eeccdc6a102af3993f7145e2b1e5fb604eba64d4723a5db13fb7ded82`.
Hosted observations remain historical provenance, but the post-hoc packet
cannot prove exact-revision hosted admission. Human comprehension remains
`NOT_RUN`; automated comprehension remains an adjunct.

Historical state, roadmap, requirements and scopes are preserved under
`.planning/archive/pre-product-conversion-rebaseline-20260720/`.
