---
phase: scope-03-handshake-identity-clearance
plan: "03-02"
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - src/modules/clearance/public.ts
  - src/modules/clearance/internal/web-bot-auth.ts
  - src/modules/clearance/internal/principal-schema.ts
  - src/modules/common/action.ts
  - src/routes/api.agent.tools.ts
  - convex/schema.ts
  - convex/clearance.ts
  - src/lib/ui/contract-scans.ts
  - tests/copy/scope3-handshake-banned-copy.test.ts
  - tests/unit/clearance/web-bot-auth.test.ts
  - tests/integration/agent-tools-api.test.ts
autonomous: true
requirements: [D5, D6, D9, D10]
user_setup:
  - "Network access to fetch a live signer directory (e.g. https://chatgpt.com/.well-known/http-message-signatures-directory) when confirming the WBA signer landscape (ticket #19). Deployed end-to-end attribution is a Scope 1 gate."
execution_scope: source_local
production_executable: false
must_haves:
  truths:
    - id: s3-identity-not-authority
      statement: "A verified Web Bot Auth signature yields an attested principal used for attribution/quota/audit only; it never authorizes a verb (D10)."
    - id: s3-unsigned-policy
      statement: "Unsigned reads are served; unsigned writes are refused 403 with Accept-Signature; malformed signatures are 400 and bad/unknown-key are 401 — never fail-open on a gated write."
    - id: s3-principal-owned
      statement: "The clearance module owns the agentPrincipal record (principalId, signatureAgent, keyid, operatorRef?, status, reputationTier) and the module public seam is the only cross-module import."
    - id: s3-handshake-unbranded
      statement: "Handshake/HSK/kernel/greenlight/clearance/mandate/protocol/gateway/ActionContract never appear on public human surfaces nor in agent JSON/tools/boundaries copy, and are scan-enforced."
  artifacts:
    - path: src/modules/clearance/internal/web-bot-auth.ts
      provides: "RFC 9421 Web Bot Auth verifier returning an identity or null — never an authorization decision."
    - path: src/routes/api.agent.tools.ts
      provides: "Route pre-check mounting identity verification and threading the principal through ActionContext.agentIdentity."
    - path: src/lib/ui/contract-scans.ts
      provides: "D9 public-posture scan banning Handshake vocabulary across human surfaces and agent JSON/tools/boundaries."
  key_links:
    - from: verified signature
      to: rate-limit/audit buckets
      via: "Buckets key on (signatureAgent, keyid); attribution feeds into, never past, the clearance layer."
    - from: agent JSON/tools/boundaries copy
      to: test:copy
      via: "Handshake vocabulary in any agent payload fails the D9 scan."
---

<objective>
Verify Web Bot Auth (RFC 9421 HTTP Message Signatures) at the quiet agent door as an identity-only layer, thread the attested principal through `ActionContext`, register `agentPrincipal`, and lock the public posture: unsigned reads served, unsigned writes refused, Handshake vocabulary banned everywhere public — with identity granting attribution/quota only, never new verbs.

Purpose: give the anonymous agent door cryptographic attribution end-to-end without changing what any action is allowed to do.
Output: an identity verifier + principal model + agent-door pre-check + the D9 banned-vocabulary scan, all source-owned in `src/modules/clearance/`.
</objective>

<how_to_execute>
Fresh session: read `SCOPE-03-INDEX.md`, then execute this plan's tasks in order. TDD where marked; run each task's `<verify>` after the task. Load skills per `<skill_usage>` before starting. On completion write the `SUMMARY.md` named in `<output>`.
</how_to_execute>

<context>
@.planning/adr/ADR-003-handshake-agent-identity-clearance.md
@.planning/ENGINEERING-STANDARDS.md
@AGENTS.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/ARCHITECTURE.md
@src/routes/api.agent.tools.ts
@src/modules/common/action.ts
@convex/authz.ts
@src/lib/ui/contract-scans.ts
@src/modules/security/source-write-admission.ts
</context>

<preflight_gates>
- **Cross-scope (Scope 1):** `convex/authz.ts` auth-identity canonicalization to `tokenIdentifier` (or a documented issuer+subject tuple) must land BEFORE this scope adds an identity surface (five-scopes S3; Scope 1 ticket #4). Principal-to-actor linkage reads the canonical identity. If Scope 1 has not landed it, thread the principal but leave actor linkage on the canonical path Scope 1 will provide, and note it.
- **Confirm WBA signer landscape and pin web-bot-auth verify semantics (#19):** the exact application checks the pinned `web-bot-auth` enforces vs. what AE must add are resolved by Task 1 before the verifier is trusted.
- **[deployed — Scope 1 gate]** Live end-to-end attribution against a real signer + attributed audit rows in a deployed env is NOT claimed until Scope 1 deploys. Local proof uses fixtures + a real directory fetch in the research task.
</preflight_gates>

<standards>
Rules that bind these files:
- **Route/server-function boundary:** the agent door route stays a thin adapter — it parses the request, runs the identity pre-check, and threads the principal; it does NOT import provider SDKs, `convex/schema`, or module `internal/`. It imports `src/modules/clearance/public.ts` only.
- **Module public.ts seam / codebase-design:** `src/modules/clearance/` exposes exactly one public seam; the verifier + principal schema live under `internal/`. No global `validators.ts` dump.
- **TypeScript hard spec:** `agentPrincipal` `status`/`reputationTier` are const tuple unions (no broad `string`), zod `.strict()` validators derived from value arrays, discriminated result unions for verify outcomes (`{ kind: 'identity', ... } | { kind: 'unsigned' } | { kind: 'error', code, status }`), no `any`/`as any`/non-null; the identity verifier throws only for infra faults, returns typed results otherwise.
- **Convex standards:** `agentPrincipal` table has an index for every query path (`by_signatureAgent_keyid`); registration mutation validates args and derives actor authority server-side; codegen on schema change; `internal*` for any sensitive read.
- **Admin/security standard:** never fail-open on a gated write; require TLS for `Signature` headers; directory fetch has a timeout + fallback so a slow directory can't stall the route; no shared-secret/HMAC identity keys (asymmetric per-agent only, per WBA).
- **Astryx-first / no bespoke Ae*:** no UI ships in this plan; any later principal readback is Astryx-only.
- **AGENTS.md + D9:** existing banned public words plus the new Handshake set apply to human surfaces AND agent JSON/tools/boundaries copy.
</standards>

<antipatterns>
- **Identity grants a verb** (violates D10/AGENTS.md) — letting a verified signature authorize a write. Caught by a `web-bot-auth.test.ts` case proving a signed-but-unmandated write is still refused, and by the agent door threading identity into context only (no authority derived from it).
- **Fail-open on a gated route** (security) — treating a malformed/bad signature as trusted. Caught by verifier tests asserting 400/401/403 and never a pass.
- **Protocol-first / branded public copy** (ROADMAP bloat detector, D9) — Handshake/HSK/greenlight/clearance/mandate/gateway/protocol/ActionContract leaking to a human surface or agent payload. Caught by `tests/copy/scope3-handshake-banned-copy.test.ts` + `npm run test:copy`.
- **New verbs advertised from identity** — the agent-tools list growing new actions because a principal exists. Caught by the `tests/integration/agent-tools-api.test.ts` registration snapshot being unchanged except the deliberate identity field.
- **Boolean state soup** — principal state as booleans instead of a const union. Caught by `test:ts-standards`.
</antipatterns>

<skill_usage>
- **Task 1 (#19):** `librarian` (enumerate exactly which checks the pinned `web-bot-auth` version enforces vs. what AE adds; GET candidate signer directories and record who serves a valid signed JWKS), `security-threat-model` (replay/coverage/rotation), `wayfinder` (resolve + close #19, append map #1).
- **Task 2:** `clerk-tanstack-patterns` (Clerk human auth and WBA agent identity coexist without conflating principals — human owner auth stays Clerk-derived, agent identity is the WBA principal), `tanstack-router-best-practices` + `tanstack-start-best-practices` (route pre-check as an adapter), `security-best-practices` + `security-threat-model` (fail-closed on gated writes, directory self-signature, short `expires`, TLS), `domain-modeling` (principal ubiquitous language), `convex-schema-validator` + `convex-functions` (agentPrincipal table + registration), `tdd`, `ponytail`.
- **Task 3 (D9):** `security-best-practices` + `code-review` (banned-vocabulary posture), `seo-audit`/`ai-seo` awareness (llms.txt/agent JSON are the epistemic-vocabulary-only surfaces), `ponytail`.
</skill_usage>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Resolve #19 — confirm WBA signer landscape + pin web-bot-auth verify semantics</name>
  <files>package.json</files>
  <read_first>.planning/adr/ADR-003-handshake-agent-identity-clearance.md (D5, G5), local://research-wba.md §1/§4/§6, §"Vendor adoption"</read_first>
  <action>Follow "Confirm WBA signer landscape and pin web-bot-auth verify semantics" (#19). Using `librarian`: (1) GET each candidate agent's `/.well-known/http-message-signatures-directory` (OpenAI confirmed; Anthropic/Perplexity/Google/Bedrock UNVERIFIED) and record who serves a valid signed JWKS today. (2) Against the exact pinned `web-bot-auth` version, enumerate which application checks it enforces internally — {tag, required components, `expires`/skew, `@authority` match, `keyid`->signed-JWKS, directory self-signature} — and which AE must add on top. (3) Add `web-bot-auth` as an exact-pinned dependency (0.x/unaudited -> pin, no `^`). Record the pin + the enforce-vs-add matrix. Then resolve #19: post the signer list + check matrix as a resolution comment, close #19, append one line to map #1. No verifier code here — this task settles the contract the verifier in Task 2 implements.</action>
  <verify>npm run typecheck</verify>
  <acceptance_criteria>
    - The confirmed-signer list and the enforce-vs-add check matrix are recorded.
    - `web-bot-auth` is present at an exact pin.
    - #19 is closed with a resolution comment and map #1 has a new line.
  </acceptance_criteria>
  <done>The WBA verify semantics are pinned; the verifier's required explicit checks are enumerated.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: WBA identity verifier + agent-door pre-check + agentPrincipal</name>
  <files>src/modules/clearance/public.ts, src/modules/clearance/internal/web-bot-auth.ts, src/modules/clearance/internal/principal-schema.ts, src/modules/common/action.ts, src/routes/api.agent.tools.ts, convex/schema.ts, convex/clearance.ts, tests/unit/clearance/web-bot-auth.test.ts, tests/integration/agent-tools-api.test.ts</files>
  <read_first>resolution of #19, local://research-wba.md §1/§2/§3/§5/§7, src/routes/api.agent.tools.ts, src/modules/common/action.ts, convex/authz.ts</read_first>
  <action>Implement D5/D6(principal)/D10. Create `src/modules/clearance/internal/web-bot-auth.ts`: an identity-only `verifyAgentIdentity(request)` returning a discriminated union `{ kind:'identity', signatureAgent, keyid, verifiedAt } | { kind:'unsigned' } | { kind:'error', code, status }` — never an authorization decision. Layer the explicit checks the #19 matrix said AE must add: `tag="web-bot-auth"`, cover `@authority`(+`signature-agent` when present), `@authority` == our host, `expires`/skew (short window as primary replay defence), `keyid` -> signed-JWKS from the `Signature-Agent` directory with `Cache-Control` caching + re-fetch on `keyid` miss (rotation) + directory self-signature check, allowlist `ed25519`. Add `principal-schema.ts` (const-tuple `status`/`reputationTier`, zod `.strict()`) and an `agentPrincipal` table in `convex/schema.ts` (principalId, signatureAgent, keyid, operatorRef? [claimed/low-trust], status, reputationTier, createdAt) with a `by_signatureAgent_keyid` index; add `convex/clearance.ts` registration mutation (args-validated, actor derived server-side). Add `agentIdentity?` to `ActionContext` in `src/modules/common/action.ts` beside `harnessApproval?`. In `src/routes/api.agent.tools.ts`, mount the pre-check right after body parse (mirroring the Stripe-webhook route): unsigned + read tool -> serve (`200`); unsigned + write tool -> `403` with `Accept-Signature`; malformed -> `400`; bad/unknown key -> `401`; verified -> attach the principal to the context built by `contextFromRequest`. Rate-limit/audit buckets key on `(signatureAgent, keyid)`. Export the identity type + verifier through `src/modules/clearance/public.ts`. TDD the verifier (valid/expired/replay-window/unknown-keyid/rotation/unsigned-read/unsigned-write) and update the agent-tools integration snapshot to show identity is threaded but NO new verbs are advertised.</action>
  <verify>npm run check:convex-codegen && npx vitest run tests/unit/clearance/web-bot-auth.test.ts tests/integration/agent-tools-api.test.ts && npm run test:ts-standards</verify>
  <acceptance_criteria>
    - `verifyAgentIdentity` returns identity/unsigned/error typed results and never authorizes a verb.
    - Unsigned reads served; unsigned writes 403 + Accept-Signature; malformed 400; bad/unknown key 401; verified attaches the principal.
    - `ActionContext.agentIdentity` carries `{ signatureAgent, keyid, verifiedAt }`; buckets key on `(signatureAgent, keyid)`.
    - `agentPrincipal` registered with an index; a signed-but-unmandated write is still refused with a typed reason.
    - The agent-tools registration snapshot changed only for the identity addition — no new verbs.
  </acceptance_criteria>
  <done>The agent door has cryptographic attribution end-to-end with identity strictly separated from authority.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: D9 public-posture scan — Handshake vocabulary banned everywhere public</name>
  <files>src/lib/ui/contract-scans.ts, tests/copy/scope3-handshake-banned-copy.test.ts</files>
  <read_first>.planning/adr/ADR-003-handshake-agent-identity-clearance.md (D9), AGENTS.md (banned words, epistemic vocabulary), src/lib/ui/contract-scans.ts (scanPublicLanguage, copyClaimContextPhases)</read_first>
  <action>Implement D9. Extend `scanPublicLanguage` in `src/lib/ui/contract-scans.ts` with a `handshake-internal-vocabulary` rule banning `Handshake`, `HSK`, `kernel`, `greenlight`, `clearance`, `mandate`, `protocol`, `gateway`, `ActionContract` on public human surfaces. Add a scan target (or extend the existing public-copy target) so the ban ALSO covers the agent JSON / quiet-tools payloads / action `boundaries` copy — the surfaces where AGENTS.md already forbids `MCP`/`callable`/`operator` — not just human pages. Keep internal module names (`src/modules/clearance/*`) and `.planning`/test contexts allowed (they assert the ban). Add `tests/copy/scope3-handshake-banned-copy.test.ts` with positive fixtures (owner page, agent-tools descriptor, action `boundaries` string) that MUST fail the scan, and confirm existing green copy stays green with ZERO new phase allowances (this is a banned-vocabulary rule, not a phase-gated positive claim). Then confirm the agent JSON / tools / boundaries copy in the repo carries none of the banned terms.</action>
  <verify>npx vitest run tests/copy/scope3-handshake-banned-copy.test.ts && npm run test:copy</verify>
  <acceptance_criteria>
    - Any Handshake-vocabulary token on a public human surface or in agent JSON/tools/boundaries copy fails the scan.
    - Internal module names and planning/test contexts are unaffected.
    - `npm run test:copy` is green with zero new allowances added.
  </acceptance_criteria>
  <done>Handshake stays un-branded across every public and agent-facing surface, scan-enforced.</done>
</task>

</tasks>

<verification>
- [ ] npm run typecheck
- [ ] npm run check:convex-codegen
- [ ] npx vitest run tests/unit/clearance/web-bot-auth.test.ts tests/integration/agent-tools-api.test.ts
- [ ] npm run test:ts-standards
- [ ] npx vitest run tests/copy/scope3-handshake-banned-copy.test.ts
- [ ] npm run test:copy
- [ ] npm run test:imports
</verification>

<success_criteria>
- WBA identity verified at the agent door with the explicit checks the #19 matrix required; principal threaded through `ActionContext`; `agentPrincipal` registered.
- Unsigned reads served; unsigned writes refused with typed reasons; verified requests attributed on `(signatureAgent, keyid)` buckets; identity grants no new verbs.
- D9 public-posture scan live and green with zero new allowances; agent-tools snapshot changed only for the deliberate identity addition.
- #19 closed with a resolution comment and map #1 line. Summary states source/local proof only; deployed end-to-end attribution is a Scope 1 gate, not claimed.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-03-handshake-identity-clearance/03-02-SUMMARY.md` stating: the WBA verify contract implemented, the unsigned/gated-write policy, the principal model, the D9 scan coverage, source/local proof only, and that deployed proof is a Scope 1 gate.
</output>
