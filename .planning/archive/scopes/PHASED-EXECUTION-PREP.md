# Phased Execution Prep — Five ROI Scopes

**Status:** pre-execution orchestration note.  
**Inputs:** `.planning/scopes/PREMORTEM-VALIDATION-GATES.md`, ADR-001..ADR-005, all scope indexes/plans, `PRODUCT.md`, `.planning/PRODUCT-10-STAR.md`, `.planning/ENGINEERING-STANDARDS.md`, `AGENTS.md`.

This file is the runbook for the next implementation session. It does not replace any scope plan. It defines the order, gates, and evidence discipline that keep the five scopes from turning into parallel slop.

## Execution invariants

1. **Scope 1 is the substrate gate.** It may run while validation gates are being answered. Its deployed env, canonical URL, authz canonicalization, security headers, source-state guard, and smoke evidence unlock safer downstream work.
2. **Validation gates are not optional research.** A KILL freezes the affected downstream scope. An ADAPT rewrites the relevant plan/index before code. A GO records evidence and proceeds.
3. **No scope may widen public authority by accident.** `agentTools` starts as exactly `registry.search`, `registry.detail`, and `inquiry.submit`; any later widening requires a deliberate snapshot diff and the trust contract in `AGENTS.md`.
4. **All proof is labelled.** Every summary must classify each claim as source/local, deployed test-mode, deployed provider, or live/production. Live/production money remains out of scope.
5. **No housekeeping before behavior.** Within an implementation plan, run only the `<verify>` commands named by tasks; central verification runs at scope closeout.

## Phase 0 — Validation lane

Run these before implementation beyond Scope 1 hardening:

| Gate | Output | Blocks |
|---|---|---|
| PM-01 owner pull | owner-pull notes: contacted count, claims, 24h response commitments, wedge/geo/script | S2 build, S3 public posture widening, S4, S5 |
| PM-02 assistant distribution probe | query/citation table across target assistant/search surfaces; boundary-survival notes | S2 discovery, S3 public posture, S4/5 agent readback/propose surfaces |
| PM-03 launch wedge lock | one-sentence v1 wedge + one-sentence not-yet list | all S2–S5 implementation |
| PM-05 trust-language red-team | public promise deck + reviewer answers + renamed risky labels | public/demo copy and agent descriptors in all scopes |
| PM-04 hands-require-pull | one owner/business willing to replay thread/receipt demo with real words/constraints | S4 04-02+, S5 05-02+ |

Scope-local gates from `PREMORTEM-VALIDATION-GATES.md` run before the plan they name. Record the verdict in the first SUMMARY that consumes the gate.

### Current Phase 0 gate snapshot — 2026-07-04

| Gate | Current verdict | Artifact | Execution effect |
|---|---|---|---|
| PM-01 owner pull | **OPEN / not proven** | none | Still blocks product/supply proof and any claim that owners will respond. |
| PM-02 assistant distribution | **OPEN / not proven** | none | Still blocks discovery/public-posture/readback/propose expansion beyond source-local work. |
| PM-03 launch wedge lock | **GO** | `.planning/scopes/PM-03-launch-wedge-lock.md` | V1 wedge may be used in recruiting/fixtures; core schemas remain wedge-agnostic. |
| PM-04 hands-require-pull | **OPEN / not proven** | none | Still blocks Scope 4 04-02+ and Scope 5 05-02+ product-demo proof. |
| PM-05 trust-language red-team | **ADAPT** | `.planning/scopes/PM-05-trust-language-red-team.md` | Public/demo copy and assistant-visible descriptors remain blocked until rename/scan additions and real reviewer evidence land. |
| S2-G3 wedge-agnostic contract | **GO for source-local consumption** | `.planning/scopes/scope-02-capability-registry/S2-G3-wedge-agnostic-contract-pack.md` | 02-02/02-04 must use the fixture matrix, forbidden-field scan, and generic descriptor/table contract. |
| S3-G2 WBA fixture/header proof | **ADAPT** | `.planning/scopes/scope-03-handshake-identity-clearance/S3-identity-preflight.md` | 03-02 must exact-pin `web-bot-auth@0.1.3`, start OpenAI-only, add AE-owned policy checks, and document the OpenAI pretrusted-directory exception. |
| S3-G4 identity-not-authority | **GO** | `.planning/scopes/scope-03-handshake-identity-clearance/S3-identity-preflight.md` | `agentIdentity` may be attribution/quota/audit only; signed identity must never authorize a verb. |

## Phase 1 — Production landing substrate

**Run:** Scope 1 wave 1 in parallel, then 01-04.

```text
01-01 canonical base URL helper
01-02 security header middleware
01-03 convex authority + source invariants
  ↓
01-04 deploy target + CI gate + smoke evidence
```

**Extra preflight from premortem:**

- S1-G1 deployed-smoke readiness ledger before 01-04.
- S1-G2 authz/source-state rollout proof before identity narrowing or fallback deletion.

**Exit:** Scope 1 local/source checks green; deploy-smoke evidence captured if env is provisioned; STATE blockers updated only with real evidence. Scope 1 does not ship new public capability.

## Phase 2 — Supply and identity foundations

Run Scope 2 and Scope 3 as separate lanes after Phase 0 gates are non-kill and Scope 1 source substrate is in place.

### Scope 2 lane

```text
02-01 resolve tickets + pure capability model
  ↓
02-02 capability tables + additive migration
  ↓
02-03 check engine + ae-endpoint-check:v1
  ↓
02-04 registry search/discovery/disclosure/copy
```

**Locks:**

- 02-01 may proceed as decision/source modeling while deployed proof is pending.
- 02-02+ require S2-G1 cross-scope lock and PM-03 wedge lock.
- 02-03 requires S2-G2 threat fixture pack.
- 02-04 requires PM-02 assistant-distribution verdict and S2-G3 wedge-agnostic contract pack.

**Exit:** capability model is additive and wedge-agnostic; registry/search DTOs remain backward-compatible; no human surface says callable/agent-native/autonomous/verified; provider smoke fails loud until real deployed inputs exist.

### Scope 3 lane

```text
03-01 kernel acquisition + Convex-runtime spike
03-02 WBA identity at agent door + public posture scan
  ↓
03-03 clearance module + Convex store + mandate
  ↓
03-04 evidence binding + reconstruction
```

**Locks:**

- 03-01 requires S3-G1 package/subpath quarantine and S3-G3 CAS replay proof.
- 03-02 requires S3-G2 WBA fixture/header proof and S3-G4 identity-non-authority dispatch review.
- 03-03 requires S3-G5 key/copy posture and #20/#21 decisions.
- 03-04 requires receipt reconstruction still treats kernel evidence as bound evidence, never authority.

**Exit:** identity is attribution/quota/audit only; mandate/checkpoint/action contract grants verbs; unsigned writes refuse; public surfaces and machine descriptors avoid internal Handshake vocabulary.

## Phase 3 — Durable communication rail

Run only after Scope 2 provides a dispatchability model, Scope 3 provides attributed identity/mandate posture, PM-02 is non-kill for attributed-agent readback/submission surfaces, and PM-04 is non-kill.

```text
04-01 settle decisions #22–#28
  ↓
04-02 message envelope + initiator readback
  ↓
04-03 business_endpoint dispatch + inbound admission
  ↓
04-04 receipts + provenance + boundary e2e
```

**Locks:**

- 04-01 must write ADR-004 `Resolution:` lines and close/map #22–#28; indexes/plans may not treat them as already resolved.
- 04-02 requires S4-G4 token-leak tabletop and #22/#25/#27 resolutions.
- 04-03 requires S4-G2 dispatchability matrix, S4-G3 status model, and #23/#24 resolutions.
- 04-04 requires S4-G5 copy/provenance fixture and #26/#28 resolutions.

**Exit:** full submit → signed dispatch attempt → signed business reply → readback → delivery/read receipts loop reconstructs from persisted rows. A quote remains communication; acceptance creates only a next-step pointer and never a booking/payment/dispatch claim.

## Phase 4 — Receipt-backed action demo

Run after Scope 3 authority posture exists, PM-02 is non-kill for agent-facing propose/readback surfaces, and Scope 2 supplies at least one real or manually onboarded agent-operated business for the demo story. For a hackathon-only path, Scope 5 may stay source/local/test-mode and must not be counted as product proof unless PM-01/PM-04 pass.

```text
05-01 door amendment + pre-implementation resolutions
  ↓
05-02 closed two-slug verifier widening
  ↓
05-03 propose seam authored, not registered + public verifier
  ↓
05-04 demo kit closeout
```

**Locks:**

- 05-01 requires S5-G2 wedge mapping and S5-G4 public verifier privacy decision before route work is committed.
- 05-02 requires two-slug widening to remain closed, typed, and individually admitted; no generic `executeAction`, no third slug, no caller-supplied action slug.
- 05-03 requires S5-G3 propose exposure STOP gate. `businessAction.propose` stays unregistered unless Scope 3 completion artifact proves attributed principal + mandate refusal + deliberate snapshot diff.
- 05-04 requires S5-G1 anti-theatre tabletop and S5-G5 evidence boundary matrix.

**Exit:** public verifier is hash/token-only and non-enumerable; demo kit proves source/local receipt reconstruction against Stripe test-mode labels only; summaries state what is proved and not proved.

## Minimum hackathon path

The minimum demo path is still:

```text
Scope 1 substrate → Scope 3 identity/mandate slice → Scope 5 source/local receipt demo
```

That path is acceptable for a hackathon **only** if it is labelled as a receipt-kernel proof. It is not proof of supply liquidity, assistant distribution, local-services demand, live money, production payment, dispatch, booking, or broad marketplace readiness. If PM-01 or PM-04 is KILL, run the demo as a lab artifact only and do not let it steer product claims.

## Central verification after each scope

At the end of each scope, the orchestrator runs the scope-specific commands named in the index plus central checks. The baseline central set remains:

```text
npm run typecheck
npm run check:convex-codegen
npm run test:copy
npm run test:source-mining
npm run test:imports
npm run test:ts-standards
npm run test:seo
npm run build
```

Run deploy/provider smokes only when their required environment is configured. A fail-loud missing-env result is not product proof.

## Summary template requirement

Every plan SUMMARY must include this table:

| Claim | Proof level | Provider mode | Public-copy permission | Missing gate |
|---|---|---|---|---|
| Example: receipt verifier reconstructs local fixture | source/local | Stripe test-mode fixture, if any | planning/demo only | deployed provider smoke |

Every SUMMARY must also state:

- source/local proof only, unless deployed proof is actually captured;
- production/deployed proof not claimed when missing;
- no booking/payment/dispatch/auto-fulfilment claim introduced;
- any validation gate consumed, with GO/ADAPT/KILL verdict and artifact pointer.

## Parallelization boundaries

- Safe parallel: Scope 1 wave-1 plans; Scope 2 and Scope 3 lanes after Phase 0; independent validation gates.
- Not safe parallel: 04-02 before 04-01 resolutions; 04-03 before 04-02 envelope; 05-03 exposure before Scope 3 completion; any two agents editing the same scope index/ADR/summary without coordination.
- If two agents touch the same file family, coordinate through IRC before editing. Do not infer peer state from filesystem reads.
