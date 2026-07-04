---
phase: scope-03-handshake-identity-clearance
plan: "03-01"
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - tests/spike/handshake-convex-runtime.spike.test.ts
  - convex/spikeHandshakeRuntime.ts
  - .planning/SOURCE-MINING.md
  - vendor/handshake-protocol-kernel/README-PROVENANCE.md
autonomous: true
requirements: [D1, D3]
user_setup:
  - "Network access to the npm registry to attempt the exact-pinned kernel install (ticket #16)."
  - "A local Convex dev deployment (npx convex dev --once --typecheck=disable --codegen=disable) for the spike round-trip (ticket #17)."
execution_scope: source_local_hackathon_spike
production_executable: false
must_haves:
  truths:
    - id: s3-kernel-pinned
      statement: "AE depends on handshake-protocol-kernel at an exact-pinned 0.4.x version, acquired from npm or vendored Apache-2.0 dist with a source-mining ledger row."
    - id: s3-subpath-quarantine
      statement: "Only the kernel root and /adapter-sdk subpaths are importable; x402/mcp/http/customer-edge subpaths are import-scan-forbidden so viem/wallet/mcp code never enters AE."
    - id: s3-runtime-verdict
      statement: "The T2 Convex-runtime spike produces an explicit verdict: kernel + @noble + zod v4 either run inside one Convex mutation with injected now/IDs and atomic single-use CAS, or the action + terminal-mutation fallback is chosen and recorded."
  artifacts:
    - path: tests/spike/handshake-convex-runtime.spike.test.ts
      provides: "Reproducible spike proving (or refuting) kernel transitions inside one Convex mutation."
    - path: convex/spikeHandshakeRuntime.ts
      provides: "Throwaway Convex mutation running the kernel round-trip in the V8 isolate."
    - path: .planning/SOURCE-MINING.md
      provides: "Ledger row for the acquired/vendored kernel with provenance."
  key_links:
    - from: ticket #17 spike verdict
      to: 03-03 store execution shape
      via: "PASS -> kernel-in-mutation; FAIL -> kernel-in-action + terminal atomic commit* in an internal mutation."
    - from: D1 subpath quarantine
      to: test:imports
      via: "Forbidden kernel subpath imports fail the import scan by construction."
---

<objective>
Acquire `handshake-protocol-kernel` at an exact-pinned 0.4.x version (npm-first, vendored `dist/` fallback) importing only root + `/adapter-sdk`, and settle by prototype whether the kernel's clearance transitions run inside a single Convex mutation or require the action + terminal-atomic-mutation fallback.

Purpose: unblock the entire scope with a real dependency and a real runtime verdict — no adapter is written until the isolate question is answered.
Output: pinned dependency (or vendored dist + ledger row), a subpath-quarantine import rule, and a reproducible spike whose verdict fixes 03-03's store shape.
</objective>

<how_to_execute>
Fresh session: read `SCOPE-03-INDEX.md`, then execute this plan's tasks in order. TDD where marked; run each task's `<verify>` after the task. Load skills per `<skill_usage>` before starting. On completion write the `SUMMARY.md` named in `<output>`.
</how_to_execute>

<context>
@.planning/adr/ADR-003-handshake-agent-identity-clearance.md
@.planning/ENGINEERING-STANDARDS.md
@.planning/ROADMAP.md
@.planning/SOURCE-MINING.md
@.planning/codebase/CONVENTIONS.md
@package.json
@convex/schema.ts
</context>

<preflight_gates>
- **Cross-scope (Scope 1):** ticket #16 declares `depends_on_scopes: [1]`. The spike runs against a local Convex dev deployment; deployed proof is out of scope until Scope 1 stands up the deployed env. State this in the summary.
- Network to the npm registry is required to confirm registry resolution (D1); if it does not resolve, the vendored-`dist/` fallback path is taken (still autonomous).
- Production public claims remain BLOCKED. This plan is a source-local acquisition + spike; it is not external proof.
</preflight_gates>

<standards>
Rules that bind these files (`.planning/ENGINEERING-STANDARDS.md`, `AGENTS.md`, `CONVENTIONS.md`):
- **/ponytail full:** the spike is throwaway. Do NOT scaffold `src/modules/clearance/`, an adapter pack, or any "for later" abstraction in this plan — only acquire the dep and answer the isolate question.
- **Import/source-mining gates:** a vendored `dist/` is backup/external source and MUST have a `.planning/SOURCE-MINING.md` ledger row (backup source copied without a ledger row is a bloat-detector stop). `test:imports` must forbid the money-rail/mcp/http/customer-edge kernel subpaths.
- **Convex standards:** the spike mutation validates its args, injects `now` and record IDs (no reliance on isolate-restricted globals/`Date.now`/randomness), and follows `convex/_generated/ai/guidelines.md` (validators on every function; no hyphens in Convex filenames — hence `spikeHandshakeRuntime.ts`).
- **TypeScript hard spec:** no `any`/`as any`/`as unknown as`/non-null; zod v4 `.strict()` parsing as the kernel ships; the spike file is exempt from being a domain interface but still typechecks.
- **exactOptionalPropertyTypes / ESM / Node>=20:** the kernel is ESM-only, Node>=20; confirm it loads under AE's toolchain.
</standards>

<antipatterns>
Relapses this plan could cause, and the gate that catches each:
- **One-implementation adapter for later** (ROADMAP bloat detector) — writing a `clearance` adapter/module now. Caught by review + the plan scope (no `src/modules/clearance/` in `files_modified`).
- **Payment/provider field in core domain / money-rail relapse** — importing `handshake-protocol-kernel/x402-protected-tool`, `/mcp`, `/http`, `/agentic-endpoint-middleware`, or anything pulling `@x402/*`/`viem`. Caught by a new `test:imports` rule forbidding those specifiers (D1).
- **Backup source copied without source-mining ledger** — vendoring `dist/` with no ledger row. Caught by `npm run test:source-mining` + the required `.planning/SOURCE-MINING.md` row.
- **Theatre: "runtime verified" without a gate** — claiming the isolate works without the spike passing. Caught by the spike test being the named artifact; a red/absent spike = fallback path, stated honestly.
</antipatterns>

<skill_usage>
- **Task 1 (#16):** `librarian` (source-verify the kernel package: exact exports map, version, license, transitive deps before pinning), `ponytail` (minimum footprint — root + `/adapter-sdk` only), `wayfinder` (resolve + close #16, append map #1).
- **Task 2 (#17):** `convex-best-practices` + `convex-functions` (single-mutation transaction semantics, injected `now`/IDs), `security-threat-model` (crypto-in-isolate + determinism risk), `tdd` (the spike round-trip is the test), `grilling` (hold the exact pass/fail bar), `wayfinder` (resolve + close #17, append map #1).
- **Task 3:** `ponytail` (record the verdict as a decision, delete throwaway scaffolding that isn't the reproducible spike), `learn` (capture the runtime verdict for 03-03).
</skill_usage>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Resolve #16 — acquire + exact-pin handshake-protocol-kernel 0.4.x</name>
  <files>package.json, .planning/SOURCE-MINING.md, vendor/handshake-protocol-kernel/README-PROVENANCE.md</files>
  <read_first>.planning/adr/ADR-003-handshake-agent-identity-clearance.md (D1, G1), local://research-handshake.md §1b/§5/§6/§7 risk 3+10, .planning/SOURCE-MINING.md, package.json</read_first>
  <action>Follow "Obtain handshake-protocol-kernel 0.4.x: npm or vendor dist" (#16). Using `librarian`, source-verify the package first: confirm the `exports` map, the exact latest 0.4.x version, Apache-2.0 license, and that root + `/adapter-sdk` do not statically pull `@x402/*`/`viem`/`@modelcontextprotocol/*`. (1) Attempt an exact-pinned install `handshake-protocol-kernel@0.4.x` (pin the exact version, no `^`); confirm ESM/Node>=20 import of ONLY the root and `/adapter-sdk` subpaths resolves in AE's TanStack/Convex toolchain. (2) If the registry does not resolve, vendor the compiled Apache-2.0 `dist/` under `vendor/handshake-protocol-kernel/` and add a provenance note (repo, commit, version, license, retrieval date) — then add a `.planning/SOURCE-MINING.md` ledger row. (3) Record the chosen acquisition path + exact pinned version. Then resolve #16: post a resolution comment on the issue stating the acquisition path + pin, close #16, and append one line to map issue #1 "Decisions so far". Do NOT write any `src/modules/clearance/` code here.</action>
  <verify>npm run typecheck && npm run test:source-mining</verify>
  <acceptance_criteria>
    - `handshake-protocol-kernel` is present at an exact-pinned 0.4.x version (npm dependency or vendored dist).
    - Root + `/adapter-sdk` imports typecheck; no `x402`/`mcp`/`viem`/`hono` code is reachable from them.
    - A vendored dist (if used) has a provenance note and a `.planning/SOURCE-MINING.md` ledger row.
    - #16 is closed with a resolution comment and map #1 has a new "Decisions so far" line.
  </acceptance_criteria>
  <done>The kernel dependency is acquired and pinned per D1, with the money-rail/mcp subpaths excluded and provenance recorded.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Resolve #17 — spike kernel clearance transitions inside one Convex mutation</name>
  <files>tests/spike/handshake-convex-runtime.spike.test.ts, convex/spikeHandshakeRuntime.ts</files>
  <read_first>.planning/adr/ADR-003-handshake-agent-identity-clearance.md (D3, G3), local://research-handshake.md §5/§7 risk 1-2, resolution of #16, convex/_generated/ai/guidelines.md</read_first>
  <action>Follow "Spike kernel clearance transitions inside one Convex mutation" (#17). Write a throwaway internal Convex mutation `spikeHandshakeRuntime.ts` that runs a full `proposeActionContract -> evaluatePolicy(->Greenlight) -> gatewayCheck -> createReceiptExport` round-trip using a minimal in-mutation `ProtocolStore` shim, and a Vitest spike that drives it. PROVE (pass): (a) `@noble/hashes` sha256 + `@noble/curves` ed25519 + zod v4 `.strict()` parsing succeed in the isolate; (b) `now` and record IDs are injected (no reliance on `Date.now`/`Math.random`/banned globals); (c) hashes are deterministic across runs; (d) single-use CAS holds — a re-presented consumed greenlight yields a replay refusal, not a second consumption. If ANY of (a)-(d) fails in the V8 isolate, record the FAIL and prove the fallback instead: kernel transition in a Convex action delegating only the terminal atomic `commit*` to an internal mutation. Emit the verdict (PASS = kernel-in-mutation, or FALLBACK = action + terminal mutation) as the spike's asserted output. Then resolve #17: post the verdict as a resolution comment, close #17, append one line to map #1. Keep the spike throwaway — no adapter, no `src/modules/clearance/`.</action>
  <verify>npm run check:convex-codegen && npx vitest run tests/spike/handshake-convex-runtime.spike.test.ts</verify>
  <acceptance_criteria>
    - The spike asserts a definite verdict (PASS or FALLBACK) — never "unknown".
    - On PASS: the full round-trip completes inside ONE Convex mutation with injected `now`/IDs, deterministic hashes, and single-use CAS.
    - On FALLBACK: the action + terminal-atomic-mutation path is proven with the same single-use guarantee.
    - #17 is closed with the verdict as a resolution comment and map #1 has a new line.
  </acceptance_criteria>
  <done>The Convex-runtime question is settled by a reproducible spike, fixing 03-03's store execution shape.</done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Fix the D1 subpath quarantine + hand the verdict to 03-03</name>
  <files>tests/spike/handshake-convex-runtime.spike.test.ts</files>
  <read_first>.planning/ENGINEERING-STANDARDS.md (Import/source-mining gates), tests/imports/source-mining.test.ts, resolution of #16, resolution of #17</read_first>
  <action>Add the D1 import-scan antipattern so the quarantine holds by construction: extend the source-mining/import rules to FAIL on any import of `handshake-protocol-kernel/x402-protected-tool`, `/mcp`, `/http`, `/agentic-endpoint-middleware`, `/customer-edge`, `/experimental`, or any `@x402/*`/`viem`/`@modelcontextprotocol/*` specifier in `src/**` or `convex/**` (allowing only `handshake-protocol-kernel` root and `/adapter-sdk`). Confirm the throwaway spike does not leak into the runtime bundle (it lives in `tests/spike/` + a `spike*`-prefixed Convex file that 03-03 will delete). Ensure the recorded verdict from Task 2 is explicit and legible so 03-03's store execution shape (`<preflight_gates>`) reads it directly. This task modifies scanner rules and the spike only — no adapter code.</action>
  <verify>npm run test:imports && npm run test:source-mining && npm run typecheck</verify>
  <acceptance_criteria>
    - Importing any forbidden kernel subpath or money-rail/mcp specifier fails `test:imports`/`test:source-mining`.
    - The spike verdict is recorded in a form 03-03 can consume as a preflight gate.
    - No `src/modules/clearance/` or adapter code was introduced by this plan.
  </acceptance_criteria>
  <done>The subpath quarantine is enforced by scan and the spike verdict is handed forward.</done>
</task>

</tasks>

<verification>
- [ ] npm run typecheck
- [ ] npm run check:convex-codegen
- [ ] npx vitest run tests/spike/handshake-convex-runtime.spike.test.ts
- [ ] npm run test:imports
- [ ] npm run test:source-mining
</verification>

<success_criteria>
- Kernel acquired + exact-pinned per D1 (npm or vendored dist + ledger row); subpath quarantine enforced by scan.
- T2 spike produces a definite verdict (mutation-in-isolate PASS or action + terminal-mutation FALLBACK) that gates 03-03.
- #16 and #17 closed with resolution comments and map #1 lines.
- Summary states source/local proof only; production/deployed proof not claimed.
</success_criteria>

<output>
After completion, create `.planning/scopes/scope-03-handshake-identity-clearance/03-01-SUMMARY.md` stating: acquisition path + exact pin, the spike verdict (PASS/FALLBACK) with evidence, source/local proof only, and that production proof is not claimed.
</output>
