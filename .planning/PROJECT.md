# Agentic Economy Maturity Rebaseline

## What This Is

Agentic Economy (AE) is an existing agentic-economy MVP for human and autonomous-agent principals to discover and invoke provider capabilities under explicit authority, Account context, budgets, evidence, and commercial policy. This maturity rebaseline turns the accepted foundation into an operated, scalable multi-principal platform while preserving autonomous agents as first-class owners and avoiding speculative commerce or platform abstractions.

The immediate deliverable is one canonical, executable GSD roadmap made of end-to-end vertical slices through real registered endpoints, runtime authority, durable or external effects, operator controls, and independent acceptance. It replaces the historical custom maturity decomposition as the planning authority without erasing that tree's evidence.

## Core Value

An autonomous agent can safely discover and invoke a useful capability with explicit Account-scoped authority, attributable effects, and enough human/operator visibility to understand, control, recover, and support the transaction.

## Business Context

- **Customer**: Australian B2B buyers and suppliers whose human, organization, agent, or workload principals invoke and provide capabilities.
- **Revenue model**: B2B reseller commercial posture; AE coordinates provider payment and buyer charging without deposits, withdrawals, transferable balances, or reusable stored value.
- **Success metric**: Independently accepted consequential invocations through real registered endpoints with correct Account authority, attributable durable/external effects, reconciliation, and operated recovery.
- **Strategy notes**: Treat `.planning/maturity-execution/PLAN.md` as historical intent only; use comparative provider/platform research as evidence, not imported product requirements.

## Requirements

### Validated

- ✓ Canonical Principal, Account, ownership, membership, external-identity, Credential, and workload-context domain boundaries with lifecycle, provenance, replay, and canonical-context rules — accepted Phase 1 source `ae284871d9d5bad40245182aefd6f2050d53b556`.
- ✓ Phase 1 adversarial and hermetic source acceptance, including trusted succession attribution, independently observed reset effects, and clean-checkout dependency closure — acceptance handoff `d20d62d8255ee7a38ce7cb8f1c618b1e0393d4e0`, verdict `SOURCE_ACCEPTED_EVIDENCE_OPEN`.
- ✓ Existing MVP Operation discovery and invocation surfaces across HTTP, MCP, CLI, and a thin website/chat adapter, with Convex-backed durable work and provider/payment/recovery seams — existing brownfield product source; deployment and hosted proof remain distinct evidence classes.
- ✓ The Phase 2 stop-line correctly withheld the unsound 298-registration migration and preserved an exact incomplete state — stop-line `f293325c87934e5fefc52c1dbc8cb3b799d00aa0`, assessment `05528077dfbc020518c7c603acaf20658ee2e4dd`, forensics `d0f15cee38e03aee97b0e5dd5fa62ca89e029a7d`.

### Active

- [ ] Establish runtime Principal and Account authority at every consequential HTTP, MCP, CLI, UI, callback, cron, job, worker, and reconciliation entry through documented Convex custom-function, middleware, and domain patterns.
- [ ] Prove multi-hop delegation, monotonic narrowing, cycle rejection, generation revocation, consequence-time server authority, and complete attribution through actual registered-reference vertical slices.
- [ ] Operate canonical Principal, Account, ownership, membership, Credential, delegation, Connection, secret, recovery, break-glass, invocation, and audit facts through explicitly owned UI, CLI, MCP, API, staff, and support workflows.
- [ ] Execute useful provider calls with provider-neutral resolution, authority, budgets, durable effect history, x402/provider-402 transactional truth where supported, safe unknown-outcome reconciliation, refunds/disputes, and non-x402 adapters.
- [ ] Keep Connection and secret lifecycle in the control plane with JIT memory-only material, fail-closed vault behavior, generation-safe rotation, observable reconciliation, and a replaceable SecretStore provider.
- [ ] Establish production-grade evidence, observability, rollback, recovery, release, and support gates with exact ref/digest/tool/freshness/evidence-class ownership.
- [ ] Demonstrate scaling and reliability through measured triggers and operational evidence while retaining a Convex modular monolith until extraction thresholds are breached.
- [ ] Execute every roadmap phase as independently checked and verified endpoint vertical slices, with fresh red-team acceptance and bounded repair/rebaseline rules.

### Out of Scope

- Regulated custody, deposits, withdrawals, transferable stored value, or reusable balances — incompatible with the locked Australian B2B reseller posture.
- SAML, SCIM, nested enterprise organizations, or customer-managed keys — no current evidence of need.
- Active-active regional writes, dedicated tenant deployments, or self-hosted Infisical — defer until measured operational requirements justify them.
- Hosted app runtime/app store, cards, ads, BNPL, company formation, or tax remittance — unrelated platform expansion.
- Microservices — Convex remains the sole writable system of record and the modular monolith remains the default until measured extraction triggers are breached.
- Composite reputation — defer until samples and manipulation thresholds support a defensible requirement.
- Speculative Quote, Order, or Offer hierarchies for x402-native synchronous calls — add only if requirements and current protocol gaps prove an independent lifecycle is needed.
- Treating MasterKey, Bazaar, Whop, or any external registry/payment source as AE identity, sole registry, sole inventory, or sole settlement rail — they are comparative discovery/provider/payment inputs only.
- Preserving the old Phase 3+ maturity decomposition — phases are re-derived from current requirements and evidence.

## Context

### Existing product

- The current source is a TypeScript/React/TanStack Start application with Convex as application state, function, scheduling, auth-verification, and component runtime; Clerk provides human identity; HTTP, MCP, CLI, chat, Stripe, Coinbase CDP/x402, supplier credentials, and workpool recovery form the current integration surface.
- Operation catalogue and contracts are product authority. Website chat is a bounded adapter over five canonical tools; machine agents use HTTP, MCP, or CLI for consequential invocation, payment, recovery, and supply workflows.
- Convex is the only writable system of record. Provider SDKs and external effects remain behind reviewed ports/adapters, with durable invocation and reconciliation responsibilities inside AE.

### Accepted and unaccepted evidence boundary

- Preserve accepted Phase 1 source `ae284871d9d5bad40245182aefd6f2050d53b556` and handoff `d20d62d8255ee7a38ce7cb8f1c618b1e0393d4e0`.
- Phase 2 is `INCOMPLETE_NOT_ACCEPTED_NOT_MATURE`. Preserve stop-line `f293325c87934e5fefc52c1dbc8cb3b799d00aa0`, independent assessment `05528077dfbc020518c7c603acaf20658ee2e4dd`, and forensics `d0f15cee38e03aee97b0e5dd5fa62ca89e029a7d` as evidence only.
- The 298 registrations across 52 files are static registration-identity scope input, never runtime authority or effect-path proof.
- Initially exclude the 17-file `a0ced993c729738ef6833b0291f4d9502f9481af` aggregate from the accepted baseline. Individually review and re-land only hardening that conforms to the canonical adapter, validators, and vertical-slice gates.
- Retain the bounded Start source repair plus `DelegationService`, `ConnectionLifecycleService`, and `SecretPlane` only as review candidates, not completed leaves.
- Hosted Clerk, live Infisical, real provider consequences, deployed revision binding, audit streams, and operational procedures remain separate open evidence; mocks and injected identities cannot close them.

### Process rebaseline

- The canonical `.planning/PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, research, and phase lifecycle are authoritative. `.planning/maturity-execution/**` is historical evidence only.
- Phase 1 needed two formal rejection rounds before acceptance. Phase 2 produced 82 commits, a 0/6 root gate, late runtime architecture, and an unaccepted 17-file aggregate after interface-first leaves appeared green. The new lifecycle must prevent mechanical counts or horizontal interfaces from substituting for production composition.
- Product operability is a first-class maturity dimension. Existing partial UI does not establish canonical control-plane completion.

## Constraints

- **Principal model**: Principals are human, organization, autonomous agent, or workload; Credentials never own resources.
- **Account model**: Accounts are tenant, isolation, policy, and commercial contexts; an autonomous agent may directly own an Account and resources.
- **Role separation**: Legal payer, beneficial owner, operator, supplier, beneficiary, tax subject, technical principal, and Credential stay distinct.
- **Delegation**: Multi-hop delegation must narrow monotonically, reject cycles, revoke by generation, revalidate with current server time at consequences, and preserve complete attribution.
- **Context coverage**: Every HTTP, MCP, CLI, UI, callback, cron, job, worker, and reconciliation path carries explicit Principal and Account context.
- **Data architecture**: Convex is the only writable system of record; remain a modular monolith until measured extraction triggers are breached.
- **Convex architecture**: Use documented custom-function/middleware/domain patterns, thin registered endpoints, explicit least-privilege wrappers, internal-function revalidation, and actual registered-reference tests. Do not make a bespoke alias/dataflow analyzer a security boundary.
- **Canonical integration**: Exactly one integration-owned Convex adapter resolves Principal, Account, ownership, membership, Credential, and workload facts.
- **Secrets**: Connections and secrets are control-plane concerns. Vault failure blocks new consequential work; secret material is JIT and memory-only; rotation validates a new generation before advancing the pointer. Infisical Cloud is a candidate behind a replaceable port pending phase research and official current documentation.
- **Commerce**: Maintain Australian B2B reseller/no-stored-value posture. Treat x402/provider 402 as transactional truth for supported synchronous calls; AE retains provider-neutral resolution, authority, budgets, history, reconciliation, refunds/disputes, and non-x402 adapters.
- **Unknown effects**: Unknown additive external states remain unknown. Ambiguous irreversible effects reconcile rather than retry blindly.
- **Vertical execution**: Each phase/slice includes a real registered endpoint, production adapter, domain logic, durable/external effect, denial/no-effect behavior, observability, rollback, and operator path.
- **Pre-code gates**: Architecture ADR/design acceptance uses official documentation and mature examples before source edits; semantic/adversarial gates are predeclared and counts are secondary evidence.
- **Independent review**: Independent plan checker and post-execution verifier are mandatory; fresh Ox/red-team acceptance follows each phase in a separate task.
- **Repair budget**: Maximum two repair passes per slice and two `CHANGES_REQUIRED` verdicts per phase. Repeated trust-defect class, three consecutive repairs to a critical file, or any proof-property/runtime-seam change forces a stop and rebaseline.
- **Evidence ownership**: Source, test-harness, hosted/external, operational, legal, and commercial gates have separate owners and cannot substitute for one another. Every claim names exact artifact, ref, digest, tool, freshness, and evidence class.
- **Change ownership**: Exact file ownership and shared integration ownership are mechanically enforced; parallelism is limited to genuinely independent slices with non-overlapping ownership.
- **Lifecycle close**: Every task and phase closes with reachable refs, clean state, archived task, removed scratch/worktree, and reconciled lifecycle records.
- **Current authorization**: This initialization may create and commit canonical GSD planning/config artifacts only. It does not authorize product source changes, phase discussion, phase planning, or implementation.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Preserve accepted Phase 1 and treat Phase 2 as evidence-only | Independent acceptance established Phase 1's source boundary; Phase 2 root remained 0/6 and the assessment withheld implementation | — Pending roadmap execution |
| Re-derive phases as vertical endpoint slices | Horizontal interface leaves deferred the hard production composition and drove repair churn | — Pending roadmap review |
| Use canonical GSD artifacts as the only active lifecycle | Deleting the prior canonical artifacts made stock planning, review, resume, and close workflows unable to locate the work | — Pending operational use |
| Keep Convex as sole writable record and a modular monolith | Existing architecture is coherent; no measured extraction trigger justifies distributed consistency and operational cost | — Pending scale evidence |
| Use framework-native runtime authority seams | The bespoke alias/dataflow checker missed concrete bypasses and became a second load-bearing platform | — Pending design acceptance |
| Require one integration-owned Principal/Account adapter | Phase 2 duplicated converters and resolvers, losing invariant locality | — Pending implementation |
| Treat x402/provider 402 as synchronous transactional truth where supported | Avoid speculative Quote/Order/Offer resources while keeping AE's provider-neutral authority, accounting, recovery, and reconciliation responsibilities | — Pending protocol research |
| Make operability part of maturity | Canonical backend facts without inspect/change/recover/escalate workflows cannot support an operated platform claim | — Pending roadmap execution |
| Commit roadmap as a candidate only | Separate engineering-plan review and Ox challenge must accept it before phase planning or implementation | — Pending external review |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-26 after maturity rebaseline initialization*
