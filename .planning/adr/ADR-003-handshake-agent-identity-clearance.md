---
# ADR-003: Agent identity, mandates, and per-action clearance via Handshake convergence
Status: Proposed
Date: 2026-07-03
Scope: 3 — Agent identity, mandates, clearance via Handshake

## Context

AE's agent door is anonymous: `contextFromRequest` (`src/routes/api.agent.tools.ts:112-122`)
builds an `ActionContext` with only `{ request, sourceWriteRequest:{method,origin,pathname} }` —
**no identity, no principal, no signature** is derived, and `runHarnessTool` is called with
`allowWrites:true` (`api.agent.tools.ts:74`). `resolveBusinessActor` returns
`{kind:'anonymous', anonymousBucket:'convex:anonymous'}` for every unauthenticated caller
(`convex/authz.ts:40-45`). This is deficit #3 in `local://five-scopes.md` ("Agent door is
anonymous — no agent identity, principal, or mandate").

The clearance machinery, by contrast, is half-built. Three admission layers already exist at
different trust radii (`local://research-ae-seams.md` §orientation): SourceWriteAdmission
(origin-signed HMAC, `src/modules/security/source-write-admission.ts:3-15`, 11 closed scopes
incl. `protected_action`), P4 one-use gateway admission (`admitted→consumed`,
`src/modules/protected-action/internal/gateway.ts`), and P6 checkpoint + receipt verifier
(`src/modules/business-action/internal/business-action.ts`). P4/P6 already speak HSK-shaped
grammar (greenlight id, contract hash, policy hash, one-use, proof-gap) per
`06-ENGINEERING-REQUIREMENTS.md:66-72`.

The user direction is LOCKED (`local://five-scopes.md` Scope 3): build **in** the Handshake
system rather than deepen a bespoke kernel. `ROADMAP.md` reserves this exactly — the "Handshake
Protocol Kernel posture" door (one-way for public positioning, phase 4/6): *"protected-action
clearance should be HSK-shaped internally; do not expose HSK as a public AE surface or dependency
until a phase gate needs it."* `PRODUCT-10-STAR.md` H4.5 (§237-244) names this convergence.
**Why now:** Scope 3 is the phase gate — P4/P6 clearance work is the trigger the door reserves.

Primary external evidence: `local://research-handshake.md` (three-repo source study,
`handshake-protocol-kernel@0.4.0` grammar/store/adapters/maturity/risks) and
`local://research-wba.md` (RFC 9421 / Web Bot Auth verification brief). Boundary authority:
`AGENTS.md` (identity ≠ authority; no MCP/protocol/callable labels; banned internal words on
public surfaces).

## Grilling record

### G1 — Which Handshake packages does AE consume; npm vs vendored; version pin?
**Evidence:** `research-handshake.md` §1d proves the monorepo (`CreasyBear/Handshake`,
`ScopedApproval`/`Warrant` era, frozen 2026-05-17) and the kernel
(`handshake-protocol-kernel@0.4.0`, `ActionContract`/`Greenlight` era, 2026-06-12) are
**different grammars** — the monorepo contains no `protocol/areas/` and no reference to the
kernel. The kernel is ESM, Node≥20, **zero peerDependencies**, Apache-2.0, storage-agnostic
(`§5`, `§6`). It ships as an artifact repo (compiled `dist/`) with subpath `exports`; hard
`dependencies` include `hono`, `@x402/core`, `@x402/evm` (pulls `viem`), `@modelcontextprotocol/*`,
but the core protocol/store use only `zod ^4.4.3` + `@noble/hashes` + `@noble/curves` (`§5`).
Public npm availability is a **declared-but-unconfirmed gap** (`README.md:178-183`, `§6`/`§7 risk 10`).
Apache-2.0 permits vendoring the `dist/`.
**Answer:** Target the **kernel v0.4.x only**, importing only the root (`handshake-protocol-kernel`)
+ `/adapter-sdk` subpaths — never `/x402-protected-tool`, `/mcp`, `/http`, so the x402/mcp/viem
transitive weight never executes (and money-rail code never enters AE, honoring the P5 quarantine).
Exact-pin the version. npm-first with vendored-`dist/` fallback if the registry does not resolve
at install time. **Confidence: high** (target/pin) / **medium** (npm resolution → ticket T1).

### G2 — One AE clearance module wrapping both P4 and P6, or per-module adapters? Where; wrap vs replace?
**Evidence:** The kernel authoring model is "author your own **adapter pack**" via `adapter-sdk`
(`AdapterSdkDefinitionSchema`), whose `AdapterSdkAuthorityBoundarySchema` makes every
authority-creating field `z.ZodLiteral<false>` — an adapter pack **cannot mint** authority
(`research-handshake.md §3`). P4/P6 clearance logic is **pure functions over source state, zero I/O**
(`research-ae-seams.md §(a)` splice iii): P4 `consumeContactFollowUpGatewayAdmission`/
`createContactFollowUpGatewayAdmission` (`gateway.ts:48`, `contact-follow-up.ts:733`); P6
`recordAuthorizationCheckpoint`/`verifyActionReceipt`/`verifyReceiptStatus`
(`business-action.ts:327/638/910`). The reconstruction verifier `verifyReceiptStatus` re-derives
every hash and is the **tamper oracle** — must not be routed around (`research-ae-seams.md §risk 4`).
Divergence §3: AE clearance must stay reconstructable from owned Convex state; an opaque kernel
token cannot be the source of truth, only an additional attestation.
**Answer:** **One** AE clearance module (proposed `src/modules/clearance/`) exposing a
kernel-backed admission gate that **wraps both** P4 and P6 (they are two singletons today —
`ContactFollowUpActionSlug` and `BusinessActionSlug` — that this module unifies). It **replaces
nothing**: the pure `record*`/`consume*`/`verify*` functions remain as the deterministic
reconstruction oracle. The adapter sits **between the Convex mutation handler and the pure
functions**: mutation → `requireSourceWrite` (unchanged) → kernel admission gate (mint/verify
clearance) → existing pure functions (source-owned audit + reconstruction). The kernel verdict is
recorded as **bound evidence** hashed into the receipt chain, never as a bypass.
**Confidence: high** (module shape) / **medium** (exact evidence binding → ticket T3).

### G3 — Convex runtime compatibility of the kernel (crypto/zod-in-Convex flagged UNVERIFIED)?
**Evidence:** `research-handshake.md §7 risk 1-2` + summary: the `ProtocolStore` port's load-bearing
methods (`consumeGreenlight → "consumed"|"already_consumed"`, `commitGatewayCheck`,
`putRecordIfAbsentOrSame`) are **atomic CAS** and map cleanly onto Convex's serializable mutations
— *only if each commit/consume runs inside a single Convex mutation, not an action*. But whether
the pure kernel + `@noble` + zod v4 `.strict()` tolerate Convex's deterministic V8 isolate
(restricted globals, `Date.now`, randomness) is **UNVERIFIED**; the kernel takes `now` as an arg and
generates IDs, so time/ID sources may need injection. Research verdict: **"Spike this first."**
**Answer:** This cannot be settled from docs → **prototype ticket T2** (entry after T1), with exact
pass/fail (below). It gates the storage-adapter wiring (G4). **Confidence: n/a — open (ticket).**

### G4 — Storage adapter: kernel state → Convex tables; idempotency owner; table sketch?
**Evidence:** No Convex `ProtocolStore` exists; bundled impls are memory/kv/**D1** only
(`research-handshake.md §5`, `§7 risk 1`). The port bundles `records[]+events[]+index-entries+claims`
per atomic `commit*`; endpoint/stream counters use CAS with bounded retries (`§7 risk 7`). AE's
existing idempotency is keyed on `idempotencyKey`/`operationKey` with `by_idempotencyKey` indexes
across P4/P6 (`research-ae-seams.md §risk 5`); the kernel's idempotency must map **onto** these,
not layer beside them (divergence §4).
**Answer:** AE implements a `ConvexProtocolStore` satisfying the port. **Convex owns idempotency**:
every `commit*`/`consume*`/`putRecordIfAbsentOrSame` is one Convex `mutation` (serializable),
returning the port's CAS verdicts from unique-index conflicts. Table sketch (source-owned):
`handshakeRecords`(recordType, recordId, actionContractId, digest, payload, streamOffset),
`handshakeStreamEvents`(streamId, partitionKey, offset — monotonic CAS),
`handshakeGreenlights`(greenlightId, contractDigest, `maxUses=1`, notBefore, expiresAt,
consumedAt, consumedByGateAttemptId),
`handshakeIdempotencyLedger`(ledgerKeyDigest UNIQUE, ledgerState, …),
`handshakeGatewayChecks`(+ operation-claim/receipt-index unique constraints),
`handshakeIsolationStates`. **Confidence: medium** (contingent on T2: if kernel-in-mutation fails,
the transition runs in an action delegating only the terminal atomic `commit*` to an internal
mutation — `research-handshake.md §7 risk 2 option b`).

### G5 — WBA at the agent door: library, key-directory caching, replay store, unsigned policy, mount?
**Evidence:** `research-wba.md §6` recommends Cloudflare **`web-bot-auth`** (TS, Apache-2.0,
Fetch-`Request`-native, 0.x/unaudited → pin) + a self-owned policy layer, or dhensby
`http-message-signatures` (v1, ISC) if 0.x churn hurts. Directory→JWKS caching honoring
`Cache-Control max-age`, re-fetch on `keyid` miss for rotation, verify directory self-signature
(`§1.5`, `§4`). Replay: short `expires` (~1 min) is the primary stateless defense; a stored-nonce
store is needed only once identity gates a side-effecting write (`§2`). Unsigned traffic → "no
identity"; resource policy decides: default-allow read-only GET, `403 + Accept-Signature` on gated
writes (`§3`) — matching five-scopes S3 "Unattributed callers keep read-only; writes escalate."
Mount point: route-handler pre-check inside `handleInvokeAgentTool`/`handleListAgentTools` right
after body parse (`api.agent.tools.ts:56`), mirroring `api.business-actions.stripe-webhook.ts:116`;
thread the verified principal through `ActionContext` (add `agentIdentity?` beside `harnessApproval?`,
`src/modules/common/action.ts:47-56`) via `contextFromRequest` (`research-ae-seams.md §(b)` splice i).
**Answer:** Cloudflare `web-bot-auth` (pinned) + explicit checks (tag=`web-bot-auth`, cover
`@authority`+`signature-agent`, `expires`/skew, `keyid`→signed-JWKS). Directory cache per
Signature-Agent. WBA nonce-store is defense-in-depth for writes; the **clearance layer owns the
real per-action anti-replay** (greenlight `consumedAt`). Unsigned reads served; unsigned writes
`403 + Accept-Signature`. Mount at `api.agent.tools.ts:56`; principal on `ActionContext.agentIdentity`.
**Confidence: high** (mechanics) / **medium** (0.x library maturity + signer landscape → ticket T4).

### G6 — Principal + mandate model: table shapes; relation to P6 mandate rows; owning module?
**Evidence:** P6 already has `BuyerMandate` (`schema.ts:153-167`): `buyerRef:string`,
`allowedBusinessId`, `allowedActionSlug`, `maxAmountCents?`, `currency?`, `status`, `mandateHash`,
`idempotencyKey`, `correlationId`, `expiresAt`, `revokedAt?`. Five-scopes S3: "mandates as
first-class records… P6 buyer/operator mandate lifted into reusable module"; "identity gets
attribution + quota, not new verbs. New verbs only via mandates + checkpoints + action contracts."
Initiators are anonymous today (`authz.ts:40-45`).
**Answer:** The new clearance module owns both. New `agentPrincipal` table:
principalId, signatureAgent (WBA origin), keyid (JWK thumbprint), operatorRef? (claimed,
low-trust — `research-wba.md §5` `Forwarded: for=`), status(active|revoked), reputationTier,
createdAt. `mandate` **generalizes** `BuyerMandate`: principalRef (→agentPrincipal, replacing the
raw `buyerRef` string), allowedActionScope (slug set, not one literal), spendCap
(`maxAmountCents?` — stays optional/absent for non-money actions), expiry, revocation, mandateHash,
idempotencyKey. Existing P6 `BuyerMandate` becomes a specialization referencing `agentPrincipal`.
**Confidence: medium** (shape decided; hash-preserving reshape covered by G7/D7).

### G7 — Migration of existing P4/P6 clearance rows: reshape-in-place or freeze-and-supersede?
**Evidence:** `STATE.md`/memory: "Nothing is deploy-proven; all capability is source/local proof"
(five-scopes deficit #1) — Scope 1 (production landing) is still open, so **no deployed P4/P6
clearance rows exist**. But the hash chains are load-bearing: `verifyReceiptStatus` re-derives every
hash and `previousReceiptHash` chains receipts (`research-ae-seams.md §risk 4`, divergence §3) — a
field reshape changes hashes.
**Answer:** Because no clearance data is deployed, **reshape in place** the P4/P6 clearance schemas
into the reusable module **before** any deployed clearance data exists; the pure verifier functions
are preserved and re-pointed at the new shapes (hashes recompute from source, nothing to migrate).
**Trigger override:** if Scope 1 deploys P4/P6 clearance rows before Scope 3 lands, switch to
**freeze-and-supersede** with new tables. **Confidence: medium** (conditioned on Scope 1 sequencing
— coordination noted).

### G8 — handshake-cloud: adopt / defer-with-date / reject?
**Evidence:** `research-handshake.md §4`, `§7 risk 8`: Cloud is closed SaaS, Cloudflare **D1 + CF
Workers + Durable Objects + Clerk + Stripe**, and **issues no authority** (`FORBIDDEN_KERNEL_CLIENTS`).
It conflicts with AE's Convex/TanStack stack; AE does not need it to use the kernel.
**Answer:** **Reject** for AE. Keep authority in Convex; build AE's own readback over kernel
evidence projections (AE already has reconstruction verifiers). The boundary is clean (Cloud never
issues authority), so rejecting Cloud loses no clearance capability. **Confidence: high.**

### G9 — Public posture: copy rules keeping Handshake un-branded + agent-JSON boundaries wording?
**Evidence:** `AGENTS.md` bans on public human surfaces the words `gateway`, `operator`, `MCP`,
`OpenAPI`, `callable`, `autonomous`, `agent-native`, plus the "never labelled MCP/protocol/callable"
rule and DESIGN.md §8/§13. ROADMAP door: "do not expose HSK as a public AE surface… until a phase
gate." Five-scopes S3: "Handshake never publicly branded until phase-gated." Epistemic vocabulary
(`KNOWN/UNKNOWN/UNAVAILABLE/NEXT_STEP`) lives only in JSON API / llms.txt / agent JSON / owner-admin.
**Answer:** `Handshake`, `HSK`, `kernel`, `greenlight`, `clearance`, `mandate`, `protocol`,
`gateway`, `ActionContract` NEVER appear on public human surfaces **nor** in the agent JSON / tools
payloads / action `boundaries` copy. Internal module names (`src/modules/clearance`) may use them.
The agent door keeps existing epistemic vocabulary only; identity attribution adds attribution +
quota, and the agent JSON MUST NOT advertise new verbs from identity alone. Add the Handshake terms
to the public banned-claim copy scan. **Confidence: high.**

### G10 — WBA-vs-Handshake layering: what must the ADR state so future work never conflates them?
**Evidence:** `research-wba.md §5` one-line contract: "Identity layer proves the signer and hands a
principal + evidence to the clearance layer; the clearance layer alone decides whether the action
happens." Five-scopes S3: "identity != authority… Cloudflare WBA is identity, Handshake is per-action
clearance — different layers, stackable."
**Answer (principle, stated normatively):** WBA/RFC-9421 answers **"which agent signed this
request"** → outputs an attested principal `{signatureAgent, keyid}` feeding **attribution / quota /
audit / reputation only**. Handshake answers **"may THIS principal perform THIS action, once, bound
to price/target/expiry, replay-safe"** → outputs a `Greenlight` + `Receipt`. A verified signature
**never** authorizes a verb; identity is an **input** to clearance, never a substitute. Rate-limit
buckets key on `(signatureAgent, keyid)`; the clearance layer independently checks
mandate + one-use + idempotency. **Confidence: high.**

## Decisions

- **D1 — Dependency posture.** Depend on `handshake-protocol-kernel` **v0.4.x only** (not the
  `CreasyBear/Handshake` monorepo). Import only root `handshake-protocol-kernel` + `/adapter-sdk`;
  never the `x402`/`mcp`/`http` subpaths. Exact-pin the version. npm-first; vendor the Apache-2.0
  compiled `dist/` if the registry does not resolve at install time.
- **D2 — Single clearance module, wrap not replace.** Create `src/modules/clearance/` exposing one
  kernel-backed admission gate that wraps **both** P4 and P6 checkpoints. The pure
  `gateway.ts`/`business-action.ts` `record*`/`consume*`/`verify*` functions remain the source-owned
  reconstruction/tamper oracle. The gate sits between the Convex mutation handler and the pure
  functions; its verdict is recorded as bound evidence hashed into the receipt chain.
- **D3 — Convex runtime is spike-gated.** Run the kernel's clearance transitions inside a single
  Convex mutation **only after** prototype T2 proves kernel + `@noble` + zod v4 run in the V8 isolate
  with injected `now`/IDs and atomic single-use CAS. Fallback: kernel-in-action + terminal atomic
  `commit*` in an internal mutation.
- **D4 — ConvexProtocolStore.** Implement the `ProtocolStore` port over Convex tables
  (`handshakeRecords`, `handshakeStreamEvents`, `handshakeGreenlights`, `handshakeIdempotencyLedger`,
  `handshakeGatewayChecks`, `handshakeIsolationStates`). Convex owns idempotency via unique indexes;
  every `commit*`/`consume*` is one serializable mutation. Kernel idempotency maps onto AE's existing
  `idempotencyKey`/`operationKey`, not beside it.
- **D5 — WBA identity at the agent door.** Verify RFC-9421 Web Bot Auth with pinned Cloudflare
  `web-bot-auth` + explicit policy checks (tag, `@authority`+`signature-agent` coverage,
  `expires`/skew, `keyid`→signed-JWKS with rotation re-fetch). Mount as a route pre-check at
  `api.agent.tools.ts:56` (mirroring the Stripe-webhook route); thread the principal through
  `ActionContext.agentIdentity`. Unsigned reads served; unsigned writes `403 + Accept-Signature`.
  Short `expires` is the read-path replay defense; a nonce store is defense-in-depth for writes.
- **D6 — Principal + mandate model owned by the clearance module.** New `agentPrincipal`
  (principalId, signatureAgent, keyid, operatorRef?, status, reputationTier). Generalize P6
  `BuyerMandate` into a reusable `mandate` (principalRef, allowedActionScope[], spendCap optional,
  expiry, revocation, mandateHash). Attested identity grants attribution + quota only; new verbs come
  solely from mandate + checkpoint + action contract.
- **D7 — Reshape-in-place (no deployed data).** Because no clearance data is deployed, reshape P4/P6
  clearance schemas into the reusable module before deploy; verifier functions re-point at new shapes.
  If Scope 1 deploys P4/P6 clearance rows first, switch to freeze-and-supersede with new tables.
- **D8 — Reject handshake-cloud.** Do not adopt Cloud (CF/D1/Clerk/Stripe, closed, issues no
  authority). Keep authority + readback in Convex over kernel evidence projections.
- **D9 — Handshake stays un-branded publicly.** Handshake/HSK/kernel/greenlight/clearance/mandate/
  protocol/gateway vocabulary never appears on public human surfaces or in agent JSON/tools/boundaries
  copy; add these to the public banned-claim scan. Identity attribution never advertises new verbs.
- **D10 — Identity ≠ authority (normative).** WBA proves the signer (attribution/quota/audit only);
  Handshake clears the action (mandate + one-use + idempotency + receipt). A signature never
  authorizes a verb. The two layers are stackable and orthogonal; identity is an input to clearance.

## Consequences

**Positive:**
- Converges two bespoke singleton clearance patterns (P4 `contact-follow-up`, P6
  `provision-paid-intake-endpoint`) onto one maintained, test-backed kernel grammar instead of
  deepening a hand-rolled kernel — the user-locked direction.
- The agent door gains cryptographic attribution end-to-end (audit rows, spoof-resistant quotas),
  the Scope-3 "done" condition, without granting new verbs.
- Authority stays 100% in Convex source state; the reconstruction verifier remains the tamper oracle.
- Money-rail code (`x402-payment`) never enters AE — the P5 quarantine door holds by construction.

**Negative:**
- Adds a pre-1.0 (0.4.x) dependency with active schema evolution (`"0.2.4"` schemaVersion,
  breaking additions across 0.2.9→0.4.0) → expect version-migration work.
- The kernel is heavier than a "wrap my mutation" one-liner: it needs a seeded OperatingEnvelope /
  GatewayRegistry / ToolCapability layer before any clearance runs (`research-handshake.md §7 risk 4`).
- Two 0.x/unaudited libraries in the trust path (`handshake-protocol-kernel`, `web-bot-auth`).

**Risks:**
- Convex isolate may reject the kernel's crypto/zod (mitigated by T2 spike + action fallback).
- Wrong `credentialCustodyStatus`/`enforcementMode` mapping → perpetual `proof_gap`/refusal
  (`research-handshake.md §7 risk 5` → ticket T5).
- Signing-key management (`local_hmac` vs `unsigned`, key in Convex secret) unresolved
  (`research-handshake.md §7 risk 6` → ticket T6); depends on Scope-1 authz canonicalization.
- WBA signature coverage over too few components is replayable; only OpenAI is a confirmed signer
  today (`research-wba.md` vendor table → ticket T4).

## Alternatives considered

- **Deepen the bespoke P4/P6 kernel (no external dep).** Rejected: contradicts the user-locked Scope-3
  direction and the ROADMAP HSK door; duplicates a maintained, test-backed clearance spine.
- **Adopt the `CreasyBear/Handshake` monorepo (`@handshake/receiver` + hosted authority).** Rejected:
  Warrant-era grammar, frozen 2026-05-17, and the receiver calls a **remote CF+D1 hosted authority**
  for single-use consumption — authority would leave Convex (`research-handshake.md §1d`, `§5`).
- **Model B customer-edge middleware + handshake-cloud.** Rejected: `agentic-endpoint-access` gates
  endpoint entry, not per-action business clearance (`research-handshake.md §5`), and Cloud reintroduces
  CF/Clerk/Stripe hosting (D8).
- **Fork/reuse the `x402-payment` adapter pack.** Rejected: payment-specific (buyer-side `exact`,
  pulls `@x402/evm`/`viem`), and importing it breaches the P5 money-rail quarantine. AE authors its
  own `auth-md`-style pack via `adapter-sdk` instead (`research-handshake.md §3` names `auth-md` the
  most AE-relevant template).
- **Let a verified WBA signature authorize writes directly.** Rejected: violates D10 / `AGENTS.md`
  (identity ≠ authority); a bearer-replayable signature must never grant a verb.
- **Freeze-and-supersede P4/P6 tables now.** Rejected as default: no deployed data exists, so
  reshape-in-place is cheaper (kept as the conditional fallback in D7).

## Boundary posture

- **AGENTS.md trust contract:** attributed identity grants attribution + quota, never new verbs; all
  writes stay proposal-only, owner-approved, receipt-required (P4/P6 posture booleans `callable:false`,
  `paymentRequired:false`, `ownerApprovalRequired:true` are preserved per `research-ae-seams.md §risk 3`).
  No booking/payment/dispatch/autonomous claim enters from this scope.
- **Public copy rules (D9):** banned on public human surfaces AND in agent JSON/tools/boundaries:
  `Handshake`, `HSK`, `kernel`, `greenlight`, `clearance`, `mandate`, `protocol`, `gateway`,
  `ActionContract`. Existing `AGENTS.md` banned words (`callable`, `autonomous`, `MCP`, `operator`,
  `agent-native`, …) continue to apply. Epistemic vocabulary stays JSON/llms/owner-admin-only.
- **ROADMAP door — PROPOSED clarification (not a silent violation).** The "Handshake Protocol Kernel
  posture" door reserves phase 4/6 and forbids exposing HSK "as a public AE surface **or dependency**
  until a phase gate needs it." This ADR proposes that **Scope 3 is that phase gate**: it admits the
  kernel as an **internal** dependency (D1) while keeping the **public-positioning** side of the door
  one-way-closed (D9 — no public HSK surface/brand). No other door is touched; the P5 money-rail
  quarantine is strengthened, not relaxed (x402 subpath excluded by D1).

## Implementation notes

- **2026-07-04 — quiet agent inquiry rung lit.** `/api/agent/tools` now keeps unsigned
  reads open, returns `403 + Accept-Signature` for unsigned `inquiry.submit`, refuses
  signed-but-not-admitted writes, and permits only a signed caller with a separate
  `public_inquiry` admission for `inquiry.submit`. The public answer/thread tool runner
  remains read-only. Identity recording is still attribution/quota/audit only; admission
  is checked separately before the harness receives `allowWrites:true`.

## Open questions -> tickets

- Obtain handshake-protocol-kernel 0.4.x: npm resolves or vendor dist
- Spike kernel clearance transitions inside one Convex mutation
- Map kernel evidence into P4/P6 receipt hash chains
- Confirm WBA signer landscape and pin web-bot-auth verify semantics
- Decide credential-custody and enforcementMode mapping for AE-executed actions
- Decide signing posture and key management for greenlights/receipts

## References
- `local://five-scopes.md` (Scope 3, sequencing)
- `local://research-handshake.md` (§1d, §2, §3, §5, §6, §7)
- `local://research-wba.md` (§1, §2, §3, §5, §6)
- `local://research-ae-seams.md` (§orientation, §(a), §(b), §(c), §(d), divergences, risks)
- `AGENTS.md` (trust contract, banned words, epistemic vocabulary)
- `.planning/ROADMAP.md` (decision-door register: HSK posture; P5 money-rail quarantine; P6 door)
- `.planning/archive/root/PRODUCT-10-STAR.md` §237-244 (H4.5 convergence)
- `.planning/archive/phases/04-owner-pending-protected-actions/04-SPEC.md` (R5/R6, constraints §77-83)
- `.planning/archive/phases/06-agentic-business-action-receipts/06-ENGINEERING-REQUIREMENTS.md` (§52-72, seam)
- `src/routes/api.agent.tools.ts:112-122`; `convex/authz.ts:35-48`;
  `src/modules/security/source-write-admission.ts:3-33`;
  `src/modules/business-action/internal/schema.ts:21-24,153-167`
