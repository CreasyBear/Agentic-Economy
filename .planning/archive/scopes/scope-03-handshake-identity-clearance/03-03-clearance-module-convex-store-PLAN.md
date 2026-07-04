---
phase: scope-03-handshake-identity-clearance
plan: "03-03"
type: execute
wave: 2
depends_on: ["03-01", "03-02"]
files_modified:
  - src/modules/clearance/public.ts
  - src/modules/clearance/internal/clearance-schema.ts
  - src/modules/clearance/internal/schema.ts
  - src/modules/clearance/internal/convex-protocol-store.ts
  - src/modules/clearance/internal/mandate.ts
  - src/modules/clearance/internal/signing.ts
  - src/modules/clearance/internal/signed-payload.ts
  - src/modules/clearance/internal/key-resolver.ts
  - src/modules/clearance/clearance.functions.ts
  - src/modules/business-action/internal/schema.ts
  - src/modules/business-action/internal/business-action.ts
  - src/modules/business-action/public.ts
  - src/modules/protected-action/internal/schema.ts
  - src/modules/protected-action/internal/gateway.ts
  - src/modules/protected-action/public.ts
  - convex/schema.ts
  - convex/clearance.ts
  - convex/businessActions.ts
  - convex/businessActionStore.ts
  - convex/protectedActions.ts
  - convex/protectedActionStore.ts
  - convex/convex.config.ts
  - tests/unit/clearance/convex-protocol-store.test.ts
  - tests/unit/clearance/mandate.test.ts
  - tests/unit/clearance/signed-payload.test.ts
  - tests/unit/business-action/mandate-request-checkpoint.test.ts
  - tests/unit/protected-action/selected-action-gateway.test.ts
  - tests/unit/convex/business-actions-runtime.test.ts
  - tests/unit/convex/protected-actions-runtime.test.ts
  - tests/imports/source-mining.test.ts
  - .planning/scopes/scope-03-handshake-identity-clearance/03-03-CREDENTIAL-CUSTODY-DECISION.md
  - .planning/scopes/scope-03-handshake-identity-clearance/03-03-SIGNING-POSTURE-DECISION.md
autonomous: true
requirements: [D2, D4, D6, D7, D8]
user_setup:
  - "03-01-SUMMARY.md exists and records the #17 Convex-runtime spike verdict as FALLBACK."
  - "03-02-SUMMARY.md exists and records the agentPrincipal / WBA identity seam."
  - "#21 selected local_hmac signing. Configure `AE_CLEARANCE_SIGNING_SECRET` and `AE_CLEARANCE_SIGNING_KEY_ID` in local/dev only if a Convex/server path reads signer material. Do not put secret values in evidence artifacts."
execution_scope: source_local
production_executable: false
must_haves:
  truths:
    - id: s3-clearance-module-wraps
      statement: "src/modules/clearance/ owns a single kernel-backed admission gate that wraps P4 and P6; P4/P6 pure record/consume/verify functions remain the reconstruction oracle."
    - id: s3-convex-store-source-owned
      statement: "ConvexProtocolStore persists kernel records/events/greenlights/idempotency/gateway checks/isolation state in Convex tables with index-backed CAS; authority never leaves Convex."
    - id: s3-mandate-generalized
      statement: "P6 BuyerMandate is generalized into a reusable clearance mandate keyed to agentPrincipal; identity grants attribution/quota only and no verb."
    - id: s3-reshape-sequencing
      statement: "Default path reshapes P4/P6 clearance rows in place only while no deployed clearance rows exist; if Scope 1 deploys first, freeze-and-supersede is mandatory."
    - id: s3-cloud-rejected
      statement: "handshake-cloud/customer-edge/agentic-endpoint-access/x402/mcp/http subpaths are rejected and scan-forbidden; AE authors only its Convex-backed adapter/store."
  artifacts:
    - path: src/modules/clearance/internal/convex-protocol-store.ts
      provides: "Fallback ProtocolStore adapter over Convex-backed port functions, using the resolved 03-01 #17 FALLBACK runtime shape."
    - path: src/modules/clearance/internal/mandate.ts
      provides: "Reusable principal-bound mandate model and validation helpers consumed by P4/P6."
    - path: src/modules/clearance/internal/schema.ts
      provides: "Convex table definitions and indexes for existing agentPrincipals plus mandates, protocol records (including greenlights by recordKind), stream events, idempotency, gateway checks, and isolation state."
    - path: .planning/scopes/scope-03-handshake-identity-clearance/03-03-CREDENTIAL-CUSTODY-DECISION.md
      provides: "Resolution of #20 with the AE gateway abstraction and ActionContract enforcementMode/custody mapping."
    - path: .planning/scopes/scope-03-handshake-identity-clearance/03-03-SIGNING-POSTURE-DECISION.md
      provides: "Resolution of #21 with the chosen signature posture, key location, fail-loud config, and rotation note."
  key_links:
    - from: resolved #17 FALLBACK verdict
      to: ConvexProtocolStore execution shape
      via: "Do not assume a root-exported HandshakeKernel or import forbidden package subpaths. Non-transactional/kernel-shaped work may run outside Convex, but every authority-changing CAS/commit/consume ends in exactly one terminal internalMutation."
    - from: resolution of #20
      to: ActionContract projection
      via: "AE's own execution surface is modeled as a gateway only if it preserves source-owned checkpoint and receipt boundaries."
    - from: resolution of #21
      to: receipt/evidence signing
      via: "Greenlight/receipt records use the selected signaturePosture and keyIdentityRef; missing secret/config fails closed."
---

<objective>
Build the Scope-3 clearance module: a Convex-owned ProtocolStore and reusable principal-bound mandate model that wrap P4 contact-follow-up and P6 business-action checkpoints without replacing their source-owned reconstruction verifiers.

Purpose: converge the two existing singleton clearance patterns onto one internal Handshake-shaped module while preserving the AE trust contract: identity is attribution only, authority remains in Convex, every consequential state transition is indexed/idempotent/audited, and no public surface learns the internal protocol vocabulary.

Output: #20 and #21 resolved, clearance tables + store port + mandate model implemented, P4/P6 reshaped or freeze-and-supersede gated, and cloud/money subpaths scan-forbidden.
</objective>

<how_to_execute>
Fresh session: read `SCOPE-03-INDEX.md`, then `03-01-SUMMARY.md` and `03-02-SUMMARY.md`. Execute this plan's tasks in order. TDD where marked; run each task's `<verify>` before moving on. Load the skills named in `<skill_usage>` before starting. On completion write the `SUMMARY.md` named in `<output>` and state source/local proof only; deployed proof is not claimed.
</how_to_execute>

<context>
@.planning/adr/ADR-003-handshake-agent-identity-clearance.md
@.planning/ENGINEERING-STANDARDS.md
@convex/_generated/ai/guidelines.md
@AGENTS.md
@.planning/ROADMAP.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/CONCERNS.md
@src/modules/security/source-write-admission.ts
@src/modules/protected-action/internal/gateway.ts
@src/modules/protected-action/internal/schema.ts
@src/modules/business-action/internal/schema.ts
@src/modules/business-action/internal/business-action.ts
@convex/schema.ts
@convex/businessActionStore.ts
@convex/protectedActionStore.ts
</context>

<preflight_gates>
- **03-01 verdict gate (#17):** STOP if `03-01-SUMMARY.md` is absent or does not state FALLBACK. This plan's store shape must match that verdict exactly; do not guess from ADR prose or root-kernel assumptions.
- **03-02 identity seam gate:** STOP if `ActionContext.agentIdentity` and `agentPrincipal` were not introduced or are still unresolved. Mandates may reference a principal only through the 03-02 module seam.
- **Scope 1 deployed-data gate (D7):** before touching P4/P6 schema, check whether Scope 1 deployed clearance rows exist. If no deployed P4/P6 clearance rows exist, reshape in place. If any deployed rows exist, switch this plan to freeze-and-supersede with new tables and a migration/readback plan; do not mutate receipt hashes in place.
- **#20 and #21 gates:** credential custody/enforcementMode (#20) and signature posture/key management (#21) are resolved in this repo. Read and verify those decision files before Task 3; do not re-decide them unless current files are missing or contradict 03-01/03-02. Tracker sync for #20/#21 is administrative evidence, not permission to re-open the decisions.
- **Signed payload + key resolver gate:** before binding P4/P6, implement fully bound greenlight/receipt payload builders and a verifier-side key resolver/rotation policy. Do not treat the existing placeholder `signatureRefHash` as proof of local-HMAC signing.
- **Production posture:** this plan is source/local. A live signed agent request and deployed audit readback remain a Scope 1 + later smoke gate.
</preflight_gates>

<standards>
Rules that bind these files:
- **Prime directive / /ponytail full:** add the smallest module that strengthens the authority spec. Do not scaffold a generic marketplace protocol, hosted gateway, wallet, x402 rail, SDK, or cloud sync. P4/P6 are the only consumers.
- **codebase-design / module public seam:** `src/modules/clearance/public.ts` is the only cross-module import. P4/P6 import exported types/functions from the public seam, never `clearance/internal/*`. Routes continue to import module public seams only.
- **TypeScript hard spec:** no explicit `any`, no `as any`, no `as unknown as`, no non-null assertions, no broad `string` statuses, no TypeScript enum. Use const tuple unions for mandate status, signature posture, credential custody, enforcement mode, store result codes, and CAS verdicts. Expected failures return discriminated result unions.
- **Validator/source-of-truth pattern:** every domain status/value tuple has a Zod validator and, where persisted, a Convex validator or documented tuple-to-`v.union` helper with a type test. No global `validators.ts` dumping ground.
- **Convex standards + Convex AI guidelines:** every Convex function has validators; sensitive functions are `internalQuery`/`internalMutation`/`internalAction`; public functions expose allowlisted DTOs only. Indexes exist for every query path. Do not use `.filter()` or unbounded `.collect()` on runtime paths. Use `ctx.db.patch`/`replace` for existing docs. Actions never use `ctx.db`; because #17 is FALLBACK, any Node action goes in a separate action-only file with `"use node"` and calls exactly one terminal internal mutation for atomic commit/consume.
- **Auth/security standards:** actor/admin authority is derived server-side; never accept a caller-supplied user/principal ID for authorization. Credential custody and signing secrets fail closed, redact values, and write typed audit evidence in the same logical operation.
- **Audit standard:** consequential clearance transitions include event id, actor/principal, target, before/after state, idempotency key, correlation ID, redacted payload, and payload hash.
- **Import/source-mining gates:** runtime imports of `.planning` and forbidden Handshake cloud/money/provider subpaths fail scans. If vendored kernel code is used, `.planning/SOURCE-MINING.md` has a ledger row from 03-01.
- **No public vocabulary leak:** internal module names may use clearance/kernel terms; public human surfaces, agent JSON/tools/boundaries copy may not. This plan does not modify UI; any future readback UI stays Astryx-only.
</standards>

<antipatterns>
Relapses this plan could cause, and the gate that catches each:
- **Identity becomes authority** — using `agentIdentity`/`agentPrincipal` to authorize a write. Caught by mandate tests proving signed-but-unmandated writes refuse with a typed reason.
- **Opaque kernel token bypasses AE receipt reconstruction** — trusting a Greenlight/Receipt record as the source of truth. Caught by tests that P4/P6 pure verifiers still reconstruct from Convex source state without external calls.
- **Cloud authority relapse** — importing `handshake-cloud`, `customer-edge`, `agentic-endpoint-access`, `x402`, `mcp`, `http`, wallet, or payment rails. Caught by `test:imports`/`test:source-mining` scan additions.
- **CAS theatre** — claiming single-use without an index-backed idempotency/consume path. Caught by Convex tests that replaying the same greenlight/operation returns `already_consumed`/typed refusal and never writes a second consequence.
- **Schema mutation after deployed rows** — reshaping receipt-bearing rows in place after deployment. Caught by the D7 preflight gate and summary requirement; fallback is freeze-and-supersede.
- **Secret reuse by convenience** — reusing `AE_SOURCE_WRITE_SECRET` for kernel signing without an explicit #21 resolution. Caught by the signing decision file and fail-loud tests for missing/mis-scoped key material.
- **Unbounded Convex queries** — scanning all protocol records/idempotency rows. Caught by guidelines review + tests covering index names and by avoiding `.filter()`/unbounded `.collect()` in store functions.
</antipatterns>

<skill_usage>
- **Task 1 (#20 sync):** `wayfinder` only if the tracker/map still needs resolution comments. Do not re-grill or re-threat-model the already recorded custody/enforcementMode decision unless the decision file contradicts current code.
- **Task 2 (#21 sync):** `wayfinder` only if the tracker/map still needs resolution comments. Do not change the `local_hmac` posture or dedicated key names without a new explicit decision.
- **Task 3:** `convex-best-practices`, `convex-schema-validator`, `convex-functions`, `convex-migration-helper` (tables, indexes, internal functions, reshape vs freeze/supersede), `codebase-design` (single public seam), `tdd`, `ponytail`.
- **Task 4:** `security-best-practices`, `convex-security-audit`, `code-review` (`/mattpocock-review` after implementation: Standards axis + Spec axis), `react-doctor` only if UI is touched (expected: no UI), `learn` (capture the #17 FALLBACK store shape and key-posture lesson if non-obvious).
</skill_usage>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Verify/sync #20 — credential custody + enforcementMode</name>
  <files>.planning/scopes/scope-03-handshake-identity-clearance/03-03-CREDENTIAL-CUSTODY-DECISION.md, src/modules/clearance/internal/clearance-schema.ts, issue://20, issue://1</files>
  <read_first>.planning/scopes/scope-03-handshake-identity-clearance/03-03-CREDENTIAL-CUSTODY-DECISION.md, src/modules/clearance/internal/clearance-schema.ts, .planning/scopes/scope-03-handshake-identity-clearance/03-01-SUMMARY.md, .planning/scopes/scope-03-handshake-identity-clearance/03-02-SUMMARY.md</read_first>
  <action>Task 1 is complete in repo: #20 maps P4 contact-follow-up and current source/local P6 business-action flows to `credentialCustodyStatus: no_mutation_credential` and `enforcementMode: customer_gateway_adapter`. Verify the decision file and tuple/Zod implementation only. Do not re-decide custody unless the files are missing or contradict 03-01/03-02. Before Task 3, sync issue #20 and issue #1 map state if tooling is available; if tracker state is stale/unavailable, record that honestly and proceed from local repo evidence.</action>
  <verify>npm run typecheck</verify>
  <acceptance_criteria>
    - #20 decision file exists and distinguishes identity, mandate, checkpoint, and execution credentials.
    - Selected values are represented as const tuple unions + Zod validators in `clearance-schema.ts`.
    - Tracker/map status is synced or explicitly recorded as stale/unavailable; no claim of closed tickets is made without evidence.
  </acceptance_criteria>
  <done>#20 is verified from repo evidence and tracker status is honest.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Verify/sync #21 — local_hmac signing posture</name>
  <files>.planning/scopes/scope-03-handshake-identity-clearance/03-03-SIGNING-POSTURE-DECISION.md, src/modules/clearance/internal/signing.ts, tests/unit/clearance/signing.test.ts, issue://21, issue://1</files>
  <read_first>.planning/scopes/scope-03-handshake-identity-clearance/03-03-SIGNING-POSTURE-DECISION.md, src/modules/clearance/internal/signing.ts, tests/unit/clearance/signing.test.ts, convex/_generated/ai/guidelines.md, resolution of #20</read_first>
  <action>Task 2 is complete in repo: #21 selected `local_hmac` for greenlight and receipt records with dedicated `AE_CLEARANCE_SIGNING_SECRET` and `AE_CLEARANCE_SIGNING_KEY_ID`. Verify the helper/tests only. Do not reuse `AE_SOURCE_WRITE_SECRET`; do not change posture without a new explicit decision. Before Task 3, sync issue #21 and issue #1 map state if tooling is available; if tracker state is stale/unavailable, record that honestly and proceed from local repo evidence.</action>
  <verify>npx vitest run tests/unit/clearance/signing.test.ts && npm run typecheck && npm run test:ts-standards</verify>
  <acceptance_criteria>
    - #21 decision file records `local_hmac`, dedicated key material names, rotation stance, and fail-closed proof gaps.
    - Missing key material fails closed with a typed result; no secret value is logged or written into evidence artifacts.
    - Tracker/map status is synced or explicitly recorded as stale/unavailable; no claim of closed tickets is made without evidence.
  </acceptance_criteria>
  <done>#21 is verified from repo evidence and tracker status is honest.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: ConvexProtocolStore + reusable mandate model</name>
  <files>src/modules/clearance/public.ts, src/modules/clearance/internal/clearance-schema.ts, src/modules/clearance/internal/schema.ts, src/modules/clearance/internal/convex-protocol-store.ts, src/modules/clearance/internal/mandate.ts, src/modules/clearance/internal/signed-payload.ts, src/modules/clearance/internal/key-resolver.ts, src/modules/clearance/clearance.functions.ts, convex/schema.ts, convex/clearance.ts, tests/unit/clearance/convex-protocol-store.test.ts, tests/unit/clearance/mandate.test.ts, tests/unit/clearance/signed-payload.test.ts, tests/unit/convex/business-actions-runtime.test.ts, tests/unit/convex/protected-actions-runtime.test.ts</files>
  <read_first>03-01-SUMMARY.md (#17 FALLBACK), 03-02-SUMMARY.md, 03-03-CREDENTIAL-CUSTODY-DECISION.md (#20), 03-03-SIGNING-POSTURE-DECISION.md (#21), .planning/adr/ADR-003-handshake-agent-identity-clearance.md (D2, D4, D6), convex/_generated/ai/guidelines.md, convex/schema.ts, convex/businessActionStore.ts, convex/protectedActionStore.ts, src/modules/business-action/internal/schema.ts</read_first>
  <action>Implement the owning clearance module. Extend the existing `src/modules/clearance/internal/schema.ts` table object and import it through the existing `convex/schema.ts` spread. Reuse the existing `agentPrincipals` table; do not create `clearanceAgentPrincipals` or a parallel `convex-schema.ts`. Add `clearanceMandates`, `handshakeRecords`, `handshakeStreamEvents`, `handshakeIdempotencyLedger`, `handshakeGatewayChecks`, and `handshakeIsolationStates`; store greenlights as `handshakeRecords` rows with `recordKind: "greenlight"` rather than a separate `handshakeGreenlights` table, per `03-03-D4-STORE-SHAPE-AMENDMENT.md`; every index name must include all queried fields. Because #17 = FALLBACK, do not implement against a root-exported `HandshakeKernel` or forbidden package subpaths. Authority-changing `putRecordIfAbsentOrSame`, greenlight consume, idempotency ledger write, gateway check commit, and isolation-state commit must be terminal internal mutations. Any Node action must be action-only (`"use node"`) and may call exactly one terminal internal mutation per authority-changing operation. If full kernel transitions require non-root exports or vendored dist, stop and record a separate dependency/export decision instead of importing forbidden subpaths. Map CAS results to explicit unions: record `inserted | replayed | rejected`; greenlight `consumed | rejected` with typed reasons including replay, expiry, missing, mismatch, and ambiguous reference; idempotency conflicts reuse `clearance_record_conflict`; gateway/isolation tables remain source-owned future hooks until runtime consumers need them. Implement `mandate.ts` as principalId + allowedScopes[] + optional spend cap + expiry + revocation + sourceHash, with const unions, Zod validators, Convex validators, and tests for expired/revoked/scope-overrun/spend-overrun/signed-unmandated refusals. Implement signed payload builders for greenlights and receipts that bind principal, mandate, action, request/checkpoint/receipt ids, hashes, expiry, idempotency key, correlation ID, and action posture before calling `signClearanceRecord`. Implement a key resolver that maps `keyIdentityRef` to active/retired verification secrets for local tests and future rotation; verification must fail closed for unknown or retired-signing-only keys. Do not persist or describe the existing `signatureRefHash` placeholder as local-HMAC proof.</action>
  <verify>npm run check:convex-codegen && npx vitest run tests/unit/clearance/convex-protocol-store.test.ts tests/unit/clearance/mandate.test.ts tests/unit/clearance/signed-payload.test.ts tests/unit/convex/business-actions-runtime.test.ts tests/unit/convex/protected-actions-runtime.test.ts && npm run typecheck && npm run test:ts-standards</verify>
  <acceptance_criteria>
    - `src/modules/clearance/public.ts` exposes the store/mandate/admission seam; no P4/P6 code imports `clearance/internal/*`.
    - A test or import guard asserts sibling modules do not import `src/modules/clearance/internal/*`; P4/P6 consume only the public seam.
    - Every Convex function validates args, uses internal registration for sensitive operations, and uses index-backed lookups in the order declared.
    - CAS tests prove explicit result unions for record insert, greenlight consume, idempotency ledger write, gateway check commit, and isolation-state commit.
    - Mandate tests prove signed identity alone refuses; allowed action scopes, expiry, revocation, and optional spend caps are enforced.
    - Signed payload/key-resolver tests prove greenlights and receipts are fully bound, verifiable across active/retired verification keys, and fail closed for unknown keys.
    - The store shape matches the #17 FALLBACK verdict exactly.
  </acceptance_criteria>
  <done>Clearance state is source-owned in Convex, replay-safe, and exposed through one public module seam.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Reshape P4/P6 clearance into the module + forbid rejected clouds/subpaths</name>
  <files>src/modules/business-action/internal/schema.ts, src/modules/business-action/internal/business-action.ts, src/modules/business-action/public.ts, src/modules/protected-action/internal/schema.ts, src/modules/protected-action/internal/gateway.ts, src/modules/protected-action/public.ts, convex/businessActions.ts, convex/businessActionStore.ts, convex/protectedActions.ts, convex/protectedActionStore.ts, tests/unit/business-action/mandate-request-checkpoint.test.ts, tests/unit/protected-action/selected-action-gateway.test.ts, tests/imports/source-mining.test.ts</files>
  <read_first>.planning/adr/ADR-003-handshake-agent-identity-clearance.md (D2, D7, D8), .planning/STATE.md lines 167-170, .planning/codebase/CONCERNS.md security considerations, resolution of #17, resolution of #20, resolution of #21, src/modules/protected-action/internal/gateway.ts, src/modules/business-action/internal/business-action.ts</read_first>
  <action>Execute D7 honestly. If preflight confirms no deployed P4/P6 clearance rows, reshape in place: P4 gateway admissions and P6 mandates/checkpoints consume the `clearance` public seam and persist any generalized mandate/protocol refs without changing public capability claims. If deployed rows exist, STOP and switch to freeze-and-supersede: add new tables/fields and preserve old receipt verification for historical rows. In both paths, P4 `consumeContactFollowUpGatewayAdmission` and P6 `recordAuthorizationCheckpoint` keep their pure source-state semantics; the kernel-backed gate wraps them, never replaces them. Add import/source-mining scan cases forbidding `handshake-cloud`, `customer-edge`, `agentic-endpoint-access`, `handshake-protocol-kernel/x402-protected-tool`, `/mcp`, `/http`, `@x402/*`, `viem`, wallet identifiers, and any runtime `.planning` import.</action>
  <verify>npx vitest run tests/unit/business-action/mandate-request-checkpoint.test.ts tests/unit/protected-action/selected-action-gateway.test.ts && npm run test:imports && npm run test:source-mining && npm run typecheck</verify>
  <acceptance_criteria>
    - P4/P6 call the clearance public seam but their pure record/consume/verify functions remain the reconstruction oracle.
    - D7 path is recorded in `03-03-SUMMARY.md`: reshape-in-place if no deployed rows; freeze-and-supersede if any deployed rows exist.
    - `handshake-cloud`, customer-edge, agentic-endpoint-access, x402, MCP, HTTP package subpaths, provider/money rails, and runtime `.planning` imports fail scans.
    - No public route, agent-tools descriptor, or human copy advertises a new capability from identity or clearance.
  </acceptance_criteria>
  <done>P4/P6 are wrapped by the shared clearance module without cloud/money relapse or receipt-history ambiguity.</done>
</task>

</tasks>

<verification>
- [ ] npm run check:convex-codegen
- [ ] npx vitest run tests/unit/clearance/convex-protocol-store.test.ts tests/unit/clearance/mandate.test.ts tests/unit/clearance/signed-payload.test.ts
- [ ] npx vitest run tests/unit/business-action/mandate-request-checkpoint.test.ts tests/unit/protected-action/selected-action-gateway.test.ts
- [ ] npx vitest run tests/unit/convex/business-actions-runtime.test.ts tests/unit/convex/protected-actions-runtime.test.ts
- [ ] npm run test:imports
- [ ] npm run test:source-mining
- [ ] npm run test:ts-standards
- [ ] npm run typecheck
</verification>

<success_criteria>
- #20 and #21 are resolved with decision files; GitHub resolution comments, closed tickets, and map #1 lines are synced when reachable, otherwise the summary states the local evidence and does not claim closed tracker state.
- `src/modules/clearance/` owns one public seam for store/mandate/admission; P4/P6 import only that seam and keep their source-owned verifiers.
- ConvexProtocolStore uses index-backed tables and terminal internal-mutation CAS; no unbounded query/filter path, no ctx.db in actions, no sensitive public functions.
- `BuyerMandate` is generalized into a principal-bound mandate without granting any verb from identity alone, and local-HMAC payload builders/key resolver bind greenlights and receipts without treating `signatureRefHash` as proof.
- D7 reshape/freeze path is explicitly recorded; no deployed receipt-bearing row is silently rehashed.
- Cloud/money/protocol-provider subpaths are scan-forbidden; copy/source scans remain green with zero new public capability claims.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-03-handshake-identity-clearance/03-03-SUMMARY.md` stating: #17 FALLBACK verdict consumed, #20/#21 decisions and tracker sync status, table/store shape and CAS result unions, signed payload/key resolver shape, mandate model, P4/P6 reshape/freeze path, import/copy posture including `handshake-cloud` scan coverage, commands run with exact results, source/local proof only, and production/deployed proof not claimed.
</output>
