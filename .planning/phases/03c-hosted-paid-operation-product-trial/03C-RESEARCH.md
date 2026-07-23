# Phase 03C: Hosted Paid-Operation Product Trial — Research

> Supersession note (2026-07-20): the route and provider-selection proposals
> below predate founder IA realignment. Current authority is
> `03C-CONTEXT.md` plus `03C-UI-SPEC.md`: canonical `/` remains unchanged;
> `/actions/paid/new` is evaluator-only Sandbox setup and
> `/actions/paid/:invocationRef` is reusable paid Action Detail. Provider
> selection remains in setup and outside the card. D-07 is an ordered forward
> golden path plus named goblin branches.

**Researched:** 2026-07-20  
**Domain:** protected hosted-sandbox Action Invocation persistence, authentication, transport, projection, and exact-revision evidence  
**Confidence:** HIGH for current source ownership and gaps; MEDIUM for the proposed file split until the planner confirms route naming and existing parent-owned edits

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### D-01 — Evidence target

Phase 3C targets authenticated exact-revision hosted-sandbox reachability,
durable reconstruction, shared human/agent truth and product comprehension.
It does not target real payment, provider fulfilment, production safety or
customer-value proof.

### D-02 — Existing semantic and application seams

Reuse `PaidOperationApplicationService`, `agentic-paid-operation:v1`,
`projectRichPaidOperation`, `projectStructuredPaidOperation` and
`AePaidOperationCard`. Hosted transport and persistence must adapt to these
source-owned seams rather than creating a parallel lifecycle.

### D-03 — Human surface

Provide one protected Action detail experience. It leads with the task,
provider, maximum charge, disclosed data, current payment/result truth and safe
next action. Technical identity and evidence remain progressively disclosed.

The surface may be reached from the canonical authenticated product experience,
but chat does not own or reconstruct its state.

### D-04 — Agent surface

Provide one authenticated structured-agent adapter over the same application
service. It returns the semantic object and digest, expected invocation version,
typed refusal/error and only permitted current command.

There is no generic tool marketplace and no caller-constructed authority,
provider choice, continuation or reconciliation result.

### D-05 — Provider choice

Keep both existing labelled mock providers. Provider identity is material and
visible, but comparison is not a customer feature in this phase. Selection
occurs before authority. Switching provider creates a new invocation,
authority, payment identifier and effect lineage.

### D-06 — UI system

Use Astryx neutral and the semantic bridge in `src/styles/globals.css`. Shared
UI remains operation- and query-agnostic. BTC, x402 and provider-specific
payload fields stay inside the operation adapter or protected technical detail.
Models do not generate components or executable controls.

### D-07 — Adverse-state contract

The hosted trial must make success, refusal before release, payment possibly
submitted, settlement unknown, invalid result, reconciliation, duplicate
delivery, stale/cross-principal refusal, reload and cold reconstruction
inspectable. Uncertainty exposes reconciliation only and never automatic retry
or fallback.

### D-08 — Claim language

Every surface labels the environment as hosted sandbox and identifies mock
provider provenance. A provider response or payment assertion is not promoted
to independent settlement or fulfilment.

### the agent's Discretion

- Exact protected route names, provided human and agent routes share the same
  source application service and authentication boundary.
- Whether the protected Action detail is embedded in the authenticated root
  workspace or linked as a dedicated detail route.
- Internal file splits and port names that preserve current module ownership.
- Focused fixture identifiers and test harness structure.

### Deferred Ideas (OUT OF SCOPE)

Real credentials/payment, independent settlement, independently operated
providers, public anonymous execution, provider onboarding, provider ranking
or comparison, automatic fallback, composition, broad Activity, standing
mandates and Full autonomy.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Research support |
|---|---|
| P3C-R1 | Durable owner/gap map and atomic hosted record recommendation below. |
| P3C-R2 | Existing Clerk human/API-key authentication and application-service adaptation below. |
| P3C-R3 | Freeze the existing semantic, projection, and renderer seams. |
| P3C-R4 | Dedicated protected detail route using the approved UI contract. |
| P3C-R5 | Typed agent route over the same composition root and application service. |
| P3C-R6 | Creation contract selects one source-owned fixture before `prepare`; switching creates a fresh invocation. |
| P3C-R7 | Focused adverse-state, stale, cross-principal, replay, and cold-restore tests. |
| P3C-R8 | Existing UI-contract and Playwright mechanics extended to the hosted route. |
| P3C-R9 | Reuse the existing exact-revision release/readback machinery. |
| P3C-R10 | Human comprehension session and fixed hosted-sandbox claim ceiling. |
</phase_requirements>

## Decision Supported

The planner should support one decision: **can the existing local paid-operation loop be made durably reachable in a protected hosted sandbox without creating a second lifecycle or trusting the caller?**

The informed answer is **yes, but only after a source-owned hosted composition and persistence boundary is added**. The current Convex control tables are useful substrate, not a complete hosted paid-operation store. The blast radius should remain within Action Invocation persistence/composition, narrow protected routes, the existing card host, focused tests, and release evidence. Provider adapters, shared semantics, projections, and the renderer should remain unchanged. [VERIFIED: `src/modules/action-invocation/internal/convex-schema.ts:91-157`; `.planning/phases/03c-hosted-paid-operation-product-trial/03C-CONTEXT.md:36-81`]

## Confirmed Source Owners and Gaps

| Concern | Current owner | Confirmed gap for 3C |
|---|---|---|
| Invocation control, authority binding, attempt generation, history, CAS/dedupe | `src/modules/action-invocation/internal/durable-contracts.ts`, `async-durable.ts`, `convex/actionInvocationControl.ts` | Convex persists control/attempt/history and enforces command identity, expected version, and effect generation, but its projection is hard-labelled `MOCK/DEVELOPMENT ONLY`; no authenticated public application handler composes it into the paid-operation service. [VERIFIED: `src/modules/action-invocation/internal/convex-schema.ts:81-89`; `convex/actionInvocationControl.ts:53-91`] |
| Business/source record and selected provider material | `dynamic-published-source.ts` and `dynamic-published-adapter.ts` | Source rows, current publications, semantic claims, input work/history, and operations are development in-memory/snapshot state. They are not in the Convex schema, so control rows alone cannot reconstruct selected-provider/business truth. [VERIFIED: `src/modules/action-invocation/dynamic-published-source.ts:22-74,85-167`; `src/modules/action-invocation/dynamic-published-adapter.ts:80-100,201-233`] |
| x402 payment authorization and attempt events | `x402-payment-attempt.ts`; development file port | The port contract is sound, but hosted persistence is absent. The only file port explicitly says it is labelled local development and not a production custody store. Convex has no payment-attempt or authorization-event tables. [VERIFIED: `src/modules/action-invocation/x402-payment-attempt.ts:9-56`; `src/modules/action-invocation/development-file-x402-payment-attempt-port.ts:20-39`; `src/modules/action-invocation/internal/convex-schema.ts:91-157`] |
| Reconciliation evidence | `reconciliation-evidence.ts`; `x402-payment-reconciliation-evidence.ts` | Validation binds digest, source, attempt, generation, time, payment material, and a trusted verifier. The current `PaidOperationCommand` nevertheless accepts both envelopes as command input; the hosted agent/human route must obtain them from a trusted test/operator evidence source, not deserialize caller assertions. [VERIFIED: `src/modules/action-invocation/reconciliation-evidence.ts:25-65`; `src/modules/action-invocation/x402-payment-reconciliation-evidence.ts:42-99`; `src/modules/action-invocation/paid-operation-application-service.ts:62-88`] |
| Custody references | `x402-payment-attempt.ts` | `custodyRef` is constrained to an opaque SHA-256 reference, while the development file holds no raw signature/payload. Hosted records should persist only this opaque reference and non-secret event facts; a separate injected mock custody boundary owns any signing material. [VERIFIED: `src/modules/action-invocation/x402-payment-attempt.ts:9-33,82-84`; `src/modules/action-invocation/development-file-x402-payment-attempt-port.ts:51-59`] |
| Shared semantic truth | `paid-operation-application-service.ts`, `paid-operation-semantics.ts`, `host-projection.ts` | The application service currently has synchronous read ports and reconstructs human and agent projections together. A hosted adapter must either provide an async composition wrapper or load one durable aggregate before calling this unchanged pure seam; do not fork its lifecycle. [VERIFIED: `src/modules/action-invocation/paid-operation-application-service.ts:24-49,102-140`] |
| Renderer | `src/components/ae/action-invocation/AePaidOperationCard.tsx` | Reuse unchanged except for genuinely UI-contract-required generic behavior. Provider/query-specific branching is forbidden. [VERIFIED: `src/components/ae/action-invocation/AePaidOperationCard.tsx:18-53`; `.planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md:430-470`] |

### Capability tier map

| Capability | Primary tier | Secondary tier | Reason |
|---|---|---|---|
| Creation/provider selection | API/application | Database | Server resolves an allowlisted fixture and writes one new source/control identity before authority. |
| Authority and command admission | API/application | Database | Authenticated actor plus expected version reaches source-owned transition; CAS persists it. |
| Payment/attempt/reconciliation truth | Database/source owner | API/application | Durable records own reconstruction; routes only translate typed commands. |
| Human projection | Browser/client | API/application | Card renders server-derived semantics and sends explicit commands. |
| Structured projection | API/application | — | Closed JSON serialization of the same in-memory projection. |
| Exact-revision proof | Release tooling | Hosted app/Convex | Existing deployment and readback machinery binds revision and deployment. |

## Recommended Production-Shaped Adaptation

1. **Add one hosted paid-operation composition root inside the Action Invocation module.** It loads source row, control, bounded attempts/history, payment attempt/authorization event, and trusted evidence references; it then supplies the existing `PaidOperationApplicationService`. Keep transport routes thin. [VERIFIED: application seam at `src/modules/action-invocation/paid-operation-application-service.ts:90-171`]
2. **Extend the module-owned Convex schema with separate bounded tables**, not arrays on the control document: source/business invocation rows, semantic-effect claims if needed for dedupe, payment attempts, payment authorization events, and evidence-reference records. Use exact compound indexes by invocation/attempt/generation/payment identifier. Convex guidance prohibits unbounded child arrays and requires indexed bounded reads. [CITED: `convex/_generated/ai/guidelines.md:116-135,220-244`]
3. **Keep command mutation atomic at the durable boundary.** A command ID/digest, expected invocation version, and expected effect generation must fence each transition; payment-prepared and submission-started events must be durable before their respective boundary. Existing CAS/dedupe behavior is the model. [VERIFIED: `convex/actionInvocationControl.ts:58-140`]
4. **Use source-owned creation, not caller-created invocation material.** Accept only a closed provider selection key. Server code resolves one of the two fixture publications, fixes BTC/USD and the one-cent ceiling, derives actor from authentication, generates invocation/authority/payment identities server-side, and prepares a new invocation. A switch is only admitted from a safely terminal old record and invokes the same creation contract anew.
5. **Human authentication:** reuse the existing Clerk session guard/Convex token pattern. The guard redirects unauthenticated users while `createAuthenticatedConvexClient` obtains a Clerk `convex` token. Do not use the local E2E bypass outside labelled tests. [VERIFIED: `src/lib/server/require-operator-session.ts:9-36`; `src/lib/server/convex-source.ts:81-95,187-197`]
6. **Agent authentication:** reuse the Clerk API-key authentication pattern, but issue a paid-operation-specific least-privilege scope rather than silently reusing Customer Request authority. Verify current key state and derive principal/owner/credential from Clerk; the route must not accept identity fields. [VERIFIED: `src/lib/server/customer-request-agent-auth.ts:30-70`]
7. **Non-enumeration:** authenticate first, then load by `(owner principal, invocationRef)` or return the same 404 shape for missing/cross-principal human reads. Agent-side `403 cross_principal_refused` is acceptable only if review confirms it cannot become an enumeration oracle.
8. **Trusted reconciliation:** client commands request reconciliation; they do not contain resolution facts. The server-side sandbox observer supplies both validated evidence envelopes through an injected trusted port. Persist references/digests, not raw responses, credentials, signatures, or payloads.
9. **No new packages.** The installed TanStack, Clerk, Convex, Vitest, Playwright, Astryx, and existing x402 packages cover the phase. [VERIFIED: `package.json:67-125`]

## Explicit Unresolved Decisions for Planner Verification

1. **Async seam shape:** confirm whether to add `AsyncPaidOperationApplicationService` or perform one async aggregate load before calling the existing synchronous pure service. Prefer the latter if it preserves one reconstruction path; stop if either option duplicates continuation rules.
2. **Source/business row ownership:** decide whether the hosted source row belongs in a new Action Invocation-owned table or a capability-supply-owned table with an Action Invocation reference. The invariant is fixed: business/provider facts must not be copied into neutral control as competing truth.
3. **Atomicity across control and payment tables:** map the exact transaction sequence around payment preparation and submission. If an external action requires multiple mutations, pre-bound durable events and recovery must prove no crash window can erase possible submission.
4. **Agent scope name and issuance:** confirm the new least-privilege Clerk API-key scope and its owner-issued lifecycle. Existing Customer Request scope must not imply paid-operation authority.
5. **Route names:** select a dedicated protected human detail route and structured `/api/v1/...` resource/command routes; route naming is discretionary, semantics are not.
6. **Trusted sandbox evidence generator:** identify the exact source that produces reconciliation envelopes and how its fixture provenance is anchored. A browser or API caller cannot provide outcome/resolution.
7. **Hosted fixture validity:** replace time-expiring local readiness with deterministic hosted-sandbox fixture validity without representing it as routeable real supply.

## ADR Decision

**ADR-021 is required before schema/route implementation.** Phase 3C changes a canonical durable data model by adding hosted source/payment/evidence records; introduces a new protected public structured-agent contract and authentication scope; and defines the trust boundary for reconciliation/custody. Those are explicitly ADR-triggering public-contract, authority-boundary, and canonical-data-model changes under `AGENTS.md`. ADR-021 should *apply* ADR-009/010/019/020 rather than supersede their lifecycle decisions. It should record:

- one hosted composition over the existing application and semantic seams;
- source/business versus neutral-control ownership;
- opaque custody and trusted evidence boundaries;
- human session and agent API-key identity mapping versus consequence authority;
- provider-switch-as-new-invocation behavior;
- hosted-sandbox evidence ceiling.

## Security Domain

| Threat | Failure | Required control/eval |
|---|---|---|
| Cross-principal enumeration | IDs reveal another evaluator's operation | Authenticate before read; owner-indexed lookup; identical human missing/cross-owner shape; no semantic payload in refusal. |
| Caller assertions | Caller selects principal, provider material, authority, digest, continuation, or reconciliation result | Derive actor and all material server-side; closed provider-selection key; trusted reconciliation port. |
| Secret/custody leakage | Signature, payload, credential, raw evidence appears in DB projection, browser data, logs, snapshots, or agent JSON | Persist opaque custody reference and evidence refs/digests only; negative serialization/snapshot/log tests. |
| Stale version/replay | Old UI or duplicate delivery executes again | Expected version + command identity/digest + effect-generation CAS; return current inspect relation without replay. |
| Uncertain effect | Lost response causes retry/new provider | Reconciliation-only continuation; provider switch absent until safely terminal; zero new signature/send counters. |
| Read outage | UI infers failure and offers execute | Typed `hosted_read_unavailable`; bounded read retry only; no command replay. |

Applicable ASVS categories are V2 Authentication, V4 Access Control, V5 Validation/Sanitization, V6 Stored Cryptography/secret handling, and V13 API/Web Service. The planner should turn each row above into an executable negative test; no production-safety claim follows.

## Validation Architecture and Exact Focused Commands

Use existing tooling; do not run external/hosted commands until separately authorized.

```bash
npm run test -- tests/unit/action-invocation/convex-handler-contract.test.ts tests/unit/action-invocation/durable-action-invocation.test.ts tests/unit/action-invocation/x402-payment-reconciliation.test.ts
npm run test -- tests/unit/action-invocation/paid-operation-application-service.test.ts tests/unit/action-invocation/paid-operation-projection.test.ts tests/unit/action-invocation/paid-operation-provider-selection.test.ts
npm run test:imports
npm run test:ui-contract
npm run test:e2e:paid-operation
npm run typecheck
npm run check:convex-codegen
npm run build
```

Add focused Phase 3C unit/integration tests for schema/ports, creation, human/agent handlers, authentication, cross-principal behavior, stale commands, trusted reconciliation, and cold reconstruction. Add a dedicated hosted Playwright config/spec rather than repurposing the local development-surface exclusion test. The current release pipeline already separates source gates from hosted readback and exposes exact-revision deployment/readback seams (`test:release:source`, `test:release:hosted`, `/api/v1/release`); extend that machinery with a Phase 3C verifier instead of inventing another deployment proof path. [VERIFIED: `package.json:19-22,39-63`; `src/routes/api.v1.release.ts:1-7`]

Likely baseline issue: `npm run test:imports` currently encodes that paid-operation development hosts are excluded from production inventory. Phase 3C must preserve the development-only host exclusion while adding a distinct hosted composition; update only the boundary assertion that recognizes the new approved host. [VERIFIED: `tests/imports/paid-operation-development-surface-exclusion.test.ts:9-19`]

## Recommended Wave Boundaries

### Wave 0 — ADR and RED contracts

**Own:** `.planning/adr/ADR-021-*.md`; new focused tests under `tests/unit/action-invocation/`, `tests/unit/server/`, and `tests/imports/`.  
**Forbidden:** implementation routes, renderer, provider fixtures.  
**RED/falsifier:** durable reconstruction fails without process snapshot; caller-authored reconciliation is accepted; switching can reuse identity.  
**Evidence ceiling:** source/test contract only.  
**Handoff:** ADR decision, failing test names, exact protected paths, no implementation claim.

### Wave 1 — Durable source/payment composition

**Own:** `src/modules/action-invocation/internal/convex-schema.ts`, new module-owned hosted port/composition files, `convex/actionInvocationControl.ts` or narrowly split Action Invocation Convex handlers, focused tests.  
**Forbidden:** `paid-operation-semantics.ts`, `host-projection.ts`, `AePaidOperationCard.tsx`, provider normalizers/fixtures.  
**RED/falsifier:** fresh-process load cannot recreate provider, authority, payment submission, settlement/result truth, and one continuation; duplicate command creates another effect generation.  
**Evidence ceiling:** local Convex-test/fixture persistence mechanics.  
**Handoff:** schema/index map, transaction order, reconstructed digest/version, duplicate counters, remaining crash window.

### Wave 2 — Source-owned creation and trusted reconciliation

**Own:** narrow hosted composition/creation and trusted sandbox evidence ports; their tests.  
**Forbidden:** route-owned provider material, generic retry/fallback, caller-supplied evidence resolution, changes to shared semantics/renderer.  
**RED/falsifier:** provider switch reuses invocation/authority/payment/effect lineage; reconciliation works with caller-fabricated evidence; uncertainty exposes anything but reconcile.  
**Evidence ceiling:** labelled local hosted-composition fixture only.  
**Handoff:** selected fixture provenance, four pairwise-distinct switch identities, trusted evidence source, zero-send uncertainty proof.

### Wave 3 — Authenticated human and agent adapters

**Own:** dedicated `src/routes/` files, thin `src/lib/server/` handlers, protected page host, route/handler/auth tests.  
**Forbidden:** lifecycle rules in routes/components, Customer Request authority reuse, anonymous exposure, broad Activity or autonomy UI.  
**RED/falsifier:** missing/cross-principal request leaks facts; stale command mutates; human and agent digests differ; browser command contains authority/evidence truth.  
**Evidence ceiling:** local authenticated route and browser fixture behavior.  
**Handoff:** route matrix, auth identity mapping, typed outcomes, parity digest, claim labels.

### Wave 4 — UI contract and comprehension

**Own:** Phase 3C UI-contract tests, hosted Playwright spec/config, only generic card changes proven necessary by the approved UI spec.  
**Forbidden:** BTC/x402/provider branches, comparison/ranking, automatic replay, secret fields.  
**RED/falsifier:** any adverse state offers unsafe continuation; non-BTC fixture cannot render; keyboard/focus/live-region/320px/zoom/reduced-motion contract fails.  
**Evidence ceiling:** focused automated accessibility plus declared human comprehension result; not real screen-reader or customer evidence.  
**Handoff:** state matrix, screenshots/results, evaluator answers, failures, exact evidence ceiling.

### Wave 5 — Exact-revision hosted readback

**Own:** Phase 3C release verifier, deploy-smoke spec, minimal workflow/package-script integration.  
**Forbidden:** deployment from dirty or mismatched revision; real provider/payment calls; manufactured evidence packet.  
**RED/falsifier:** named deployment/revision/actor/fixture cannot be bound; cold readback changes digest/continuation or creates a signature/send/effect generation.  
**Evidence ceiling:** authenticated exact-revision hosted sandbox only.  
**Handoff:** revision, deployment ID/URL, identities, fixture provenance, transition ledger, cold reconstruction, parity digest, zero-duplicate counters, claim ceiling.

Each handoff should use: `{baseRevision, ownedPaths, forbiddenPaths, commands, results, observableOutcome, REDDisposition, evidenceClass, claimCeiling, remainingFailure, nextDecision}`.

## Project Constraints (from AGENTS.md)

Preserve unrelated dirty work; never permanently delete or use destructive Git cleanup. Start from the customer outcome, trace source ownership once, and use focused tests/evals. Keep source-owned modules deep and hosts thin. Identity is not authority; uncertain release must reconcile before retry; durable records must reconstruct safe continuation. Business records own business truth while shared control owns continuity. Use typed ordinary outcomes, bounded reads/retries/fan-out, Astryx neutral, accessible interaction states, and exact evidence-class/claim ceilings. Before Convex work, read the complete generated guidelines; keep schema fragments with owners and Node actions separate. Create/supersede an ADR for public-contract, authority-boundary, canonical-model, interoperability, or neutrality changes. [VERIFIED: `AGENTS.md:1-220`]

## Earliest Blocker

**The earliest blocker is the absent trusted hosted aggregate/composition contract.** Today, Convex control state is development-labelled and incomplete, while selected-provider source rows, semantic claims, payment attempt/authorization events, and trusted reconciliation evidence live in development memory/file/snapshot paths. Building routes first would force reconstruction from route/component memory, caller input, or a second lifecycle.

Planning may proceed through Wave 0. Implementation beyond the durable Wave 1 boundary must stop until ADR-021 fixes ownership and the RED proves a fresh process can reconstruct one semantic object and only safe continuation from durable source-owned records with no raw custody material.

## Sources and Confidence

- **HIGH:** live repository source and focused tests cited above.
- **HIGH:** accepted Phase 3C context, UI contract, PRODUCT/AGENTS constraints, ADR-010/019/020, and Phase 3A/3B summaries.
- **MEDIUM:** exact new filenames, route names, and whether the async adaptation is a wrapper or preloaded aggregate; these remain planner verification tasks.
- **No external packages or web claims were required.**

## RESEARCH COMPLETE

Recommended execution is six bounded waves: ADR/RED, durable composition, creation/reconciliation, authenticated adapters, UI/comprehension, then exact-revision hosted readback. The first four waves may produce only local fixture evidence; only the final authorized deployment/readback can establish the narrow hosted-sandbox claim.
