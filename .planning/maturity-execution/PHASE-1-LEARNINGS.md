---
phase: 1
phase_name: "Canonical principals and accounts"
project: "Agentic Economy"
generated: "2026-08-26"
counts:
  decisions: 6
  lessons: 8
  patterns: 7
  surprises: 6
missing_artifacts:
  - ".planning/phases/01-*/SUMMARY.md (not used; this program uses the frozen maturity-execution ledger)"
---

# Phase 1 Learnings: Canonical principals and accounts

This extraction uses the `gsd-extract-learnings` categories and attribution
contract against AE's frozen maturity-execution artifacts. The stock GSD query
cannot locate this program because AE deliberately has no replacement
`.planning/phases/01-*` roadmap tree. No GSD planning state was manufactured.

## Decisions

### Credentials authenticate but never own

Principal identity and resource ownership remain stable when an external binding
or Credential rotates. Provider identifiers are bindings, not canonical identity.

**Rationale:** Rotation, revocation and provider failure must not transfer or erase
ownership.
**Source:** `PLAN.md`; `PHASE-1-BLAST-RADIUS.md`

---

### Every consequence has one Account context

Human, organization, autonomous-agent and workload Principals use the same
explicit active Account contract. A counterparty is attribution, not a second
ambient Account.

**Rationale:** This prevents active-stranger and implicit-superuser paths while
preserving explicit cross-Account transactions.
**Source:** `PLAN.md`; `PHASE-1-BLAST-RADIUS.md`; `phase-1-acceptance.md`

---

### Principal-account remains the canonical identity boundary

Other bounded contexts receive stable references and typed services. They may not
infer identity, ownership or tenancy from Clerk, Credentials or legacy owner rows.

**Rationale:** Phase 2 must centralize authorization without creating a second
identity source.
**Source:** `PLAN.md`; `PHASE-1-BLAST-RADIUS.md`

---

### Recovery authority is a canonical consumed fact

Account succession resolves an Account-bound, policy-revision-bound, one-use
authorization backed by verified unique participant approvals. Caller-shaped
proof objects are not authority.

**Rationale:** Structural validity and self-consistent timestamps do not prove
threshold approval or trusted provenance.
**Source:** `phase-1-acceptance.md`; `gates/repair-B1-trusted-account-succession.md`

---

### Effect receipts require trusted execution and reconciled post-state

Reset replay binds to trusted execution/transaction identity and proves zero
remaining target facts with protected canonical counts unchanged.

**Rationale:** A digest-correct receipt can still lie about whether an effect
occurred.
**Source:** `phase-1-acceptance.md`; `gates/repair-B2-trusted-reset-replay.md`

---

### Source acceptance and external evidence are separate

Source-complete phases may advance with hosted, legal, vendor, soak or commercial
evidence explicitly open. Final L3 still requires the root evidence ledger.

**Rationale:** Non-source evidence must not roadblock unrelated engineering, while
final maturity claims must remain evidence-complete.
**Source:** `PLAN.md` status log; `phase-1-acceptance.md`

## Lessons

### Mechanical green gates do not prove semantic outcomes

Phase 1 initially reported every leaf and integration checkbox green while an
active stranger could still enter an Account context.

**Context:** Independent source verification reopened P1-02 and required explicit
ownership or active Membership at context admission.
**Source:** `PLAN.md` status log; `phase-1-acceptance.md`

---

### Caller-supplied provenance is not provenance

An authorization reference, approval array or trusted-sounding string remains
attacker-controlled until resolved from a canonical trusted store and consumed.

**Context:** The first succession design accepted an attacker-invented recovery
proof that was internally self-consistent.
**Source:** `phase-1-acceptance.md`

---

### Idempotency cannot certify an unobserved effect

Matching plan and receipt digests prove replay identity, not deletion or provider
consequence.

**Context:** The first reset replay returned `already-applied` even when no deletion
had occurred.
**Source:** `phase-1-acceptance.md`

---

### Release evidence must be hermetic

A release check that passes only after an undeclared local build artifact is a
false gate.

**Context:** `test:imports` consumed ignored `packages/cli/dist/ae.js` before the
declared CLI package build step.
**Source:** `phase-1-acceptance.md`; `gates/repair-B3-hermetic-release.md`

---

### Coverage inventories must distinguish code from seams

Pure zero-statement TypeScript barrels must not be treated as uncovered executable
critical paths, but executable canonical modules still require exact 100% coverage.

**Context:** Phase 1 replaced filename assumptions with TypeScript AST source
classification without weakening the coverage threshold.
**Source:** `PLAN.md` status log

---

### Schema counts are integration evidence, not documentation trivia

Adding canonical tables invalidated the Phase 0 exact schema inventory until the
integration contract was updated and regenerated.

**Context:** Phase 1 found the release baseline still expected 54 tables after six
canonical tables had been composed.
**Source:** `PLAN.md` status log

---

### Local Convex and hosted authorization prove different things

Anonymous local Convex can prove source, schema and codegen integrity. It cannot
prove hosted Clerk mapping, deployment authorization or production isolation.

**Context:** Local proof closed the source release gate; hosted proof remains later
external evidence.
**Source:** `PLAN.md` status log; `phase-1-acceptance.md`

---

### Do not create planning metadata to satisfy a tool

Roadmap-dependent GSD review/extraction commands cannot locate AE's frozen
maturity-execution tree. The contract remains authoritative; tools may be used only
where their preconditions fit.

**Context:** The Phase 1 reviewer recorded `phase_found:false` rather than
manufacturing ROADMAP, STATE or phase-plan artifacts.
**Source:** `phase-1-acceptance.md`

## Patterns

### Context-local exports, driver-owned composition

Leaves own bounded-context code and tests. They publish typed local exports; only
the phase driver edits root schema, HTTP composition, generated files, package
scripts and cross-context barrels.

**When to use:** Every Phase 2 leaf and every later parallel phase.
**Source:** `PLAN.md`; `PHASE-1-BLAST-RADIUS.md`

---

### Live authority at consequence points

Resolve canonical Principal and Account context, then recompute generation,
revocation and expiry from server time before every new consequence.

**When to use:** Grants, Connection leases, secret retrieval, callbacks, jobs,
crons and reconciliation.
**Source:** `PLAN.md`

---

### Trusted fact plus post-state reconciliation

For irreversible or security-sensitive effects, persist a trusted execution fact
and independently reconcile the resulting state before reporting success.

**When to use:** Secret rotation, connector revocation, recovery, settlement and
deletion.
**Source:** `phase-1-acceptance.md`; `gates/repair-B2-trusted-reset-replay.md`

---

### Counterexample-first acceptance

Turn each discovered exploit into a durable test, make it demonstrate the defect,
then retain it as a safe-rejection regression after repair.

**When to use:** Authority narrowing, cycles, revocation races, cross-Account
access, secret leakage and operator break-glass.
**Source:** `tests/review/phase-1-succession-forgery.test.ts`;
`tests/review/phase-1-reset-forged-receipt.test.ts`

---

### Clean-source release proof

Prove gates from a fresh checkout with ignored build output absent before and after
the relevant command.

**When to use:** Every phase release gate and package/import integrity change.
**Source:** `gates/repair-B3-hermetic-release.md`; `PLAN.md` status log

---

### Fresh-context phase acceptance

The implementation task stops at an exact ref. A new task independently reruns
gates, performs Standards/Spec review and uses Ox to try to refute deciding claims.

**When to use:** Every phase before its successor begins.
**Source:** `PLAN.md` status log; `phase-1-acceptance.md`

---

### Named external-evidence ledger

Non-source gaps carry an owner and eventual blocking gate rather than becoming an
ambient blocker.

**When to use:** Infisical live identity/audit evidence, hosted auth, migration,
soak, legal and commercial proof.
**Source:** `PLAN.md` status log; `phase-1-acceptance.md`

## Surprises

### Active-stranger access survived the first complete suite

The original 34 Account tests and all leaf gates passed before an independent
verifier found the bypass.

**Impact:** Phase 2 requires a generated cross-surface isolation matrix, not a
sample of representative entry points.
**Source:** `PLAN.md` status log

---

### Threshold succession was forgeable despite plausible fields

Account, policy revision, delay and expiry bindings looked complete, yet no trusted
approval provenance existed.

**Impact:** Phase 2 delegation and break-glass must resolve canonical facts rather
than accept proof-shaped request bodies.
**Source:** `phase-1-acceptance.md`

---

### Exact reset receipts could still be false

A matching receipt returned a successful replay result without any deletion.

**Impact:** Phase 2 secret rotation and Connection revocation evidence must prove
state, not merely replay identity.
**Source:** `phase-1-acceptance.md`

---

### Import tests depended on ignored package output

The full release appeared green in a prepared workspace but failed in a pristine
checkout.

**Impact:** Every Phase 2 integration claim must be rerun without inherited local
artifacts.
**Source:** `phase-1-acceptance.md`

---

### Canonical context initially had no production consumers

Phase 1 correctly introduced the bounded context without mass-migrating legacy
callers, leaving production surface wiring entirely to P2-02.

**Impact:** P2-02 is a measured migration/integration program, not a small helper
module.
**Source:** `PHASE-1-BLAST-RADIUS.md`; `phase-1-acceptance.md`

---

### Phase 2 touches a broad legacy surface

Launch preparation measured 17 production files referencing legacy Principals,
8 referencing legacy Grants, 19 reading Convex identity directly and 62 touching
provider Connections.

**Impact:** Phase 2 uses dependency waves and driver-owned adapters; leaves may not
edit these shared consumers concurrently.
**Source:** Phase 2 launch blast-radius measurement, 2026-08-26
