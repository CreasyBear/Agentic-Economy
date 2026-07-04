---
phase: scope-01-production-landing
plan: "01-05"
type: execute
wave: 3
depends_on: ["01-04"]
files_modified:
  - examples/agent-experience/ae-surface.ts
  - examples/agent-experience/score.ts
  - examples/agent-experience/run-audit.ts
  - examples/agent-experience/README.md
  - examples/agent-experience/.env.example
  - package.json
  - src/modules/discovery/internal/discovery-files.ts
  - src/modules/inquiries/inquiry.functions.ts
  - src/modules/inquiries/inquiry.actions.ts
autonomous: true
requirements: [ADR-006 D1, D2, D3, D4, D5, D6, D7, D8]
user_setup:
  - "Deployed AE origin (Scope 1 / issue #5) for the GATE run. Local dev origin is enough for iteration."
  - "For the Hermes driver: HERMES_BASE_URL, HERMES_API_KEY, HERMES_MODEL (OpenAI-compatible)."
execution_scope: source_local
production_executable: false
must_haves:
  truths:
    - id: s1-ax-real-harness
      statement: "The audit is a runnable harness under examples/agent-experience/ that pings AE's LIVE surfaces over real HTTP (no mocks); it discovers the door at runtime and never has AE docs pasted in."
    - id: s1-ax-two-drivers
      statement: "probe = deterministic baseline (no key); hermes = the operator's own agent over generic HTTP tools via an OpenAI-compatible loop isolated in callHermes()."
    - id: s1-ax-boundary-axis
      statement: "Scoring is the five Arena dimensions plus the ADR-006 D3 boundary-overreach axis; convergent overreach caps the audit and fails the gate."
    - id: s1-ax-local-not-gate
      statement: "A LOCAL run is an iteration signal, not launch proof; the GATE runs against the DEPLOYED surface (issue #5). Reports state which."
    - id: s1-ax-remediations
      statement: "The first probe run (grade D) surfaced two real gaps being remediated: /api/agent/tools absent from /llms.txt, and inquiry.submit rejecting public slugs (400) so a cold agent never reaches the 403 signature wall. Remediations are verified only when the re-run improves and targeted tests pass."
---

<objective>
Stand up the outside-in agent-experience audit (ADR-006) as a runnable harness and
a Scope-1 exit / GTM gate, and land the two agent-usability remediations its first
run surfaced. The audit drives a real agent (deterministic probe, or the operator's
Hermes agent) through AE's live surfaces and scores the run; the deployed run is the
gate for agent-facing GTM claims.
</objective>

<context>
@.planning/adr/ADR-006-agent-experience-audit-gate.md
@.planning/AGENT-EXPERIENCE-AUDIT-CROSSREF.md
@AGENTS.md
@.agents/skills/agent-experience/SKILL.md
@src/routes/api.agent.tools.ts
@src/routes/llms[.]txt.ts
@src/modules/inquiries/inquiry.functions.ts
</context>

<preflight_gates>
- Cross-scope (Scope 1): the harness runs against any origin, but the GATE run needs the deployed env from 01-04 / issue #5. Until then the gate is an honest open condition, not a failure.
- No spoonfeeding: the harness passes only the origin URL + one-sentence goal to a driver; AE docs/schema/AGENTS.md/ADR-006 are never pasted into a driver prompt (ADR-006 Q6/D7).
- Measurement-only: the audit changes no action, grants no verb, relaxes no boundary; internal vocabulary stays in .planning artifacts only (ADR-006 D7, ADR-003 D9).
</preflight_gates>

<standards>
- The harness is self-contained under examples/ and speaks only the published HTTP contract (llms.txt, GET/POST /api/agent/tools, /api/businesses/*); it imports nothing from src/ internal.
- Remediations are additive and boundary-honest: the llms.txt door line carries no MCP/callable/protocol label; the slug inquiry resolves through the PUBLISHED catalog only and passes resolved ids into the existing mutation unchanged.
- If the inquiry.submit descriptor changes, the agentTools snapshot is updated in one deliberate commit (ADR-001 D6); the surface stays exactly {registry.search, registry.detail, inquiry.submit} with inquiry.submit the only write.
- TypeScript hard spec: named types (no ReturnType/Awaited), Record for static tables, no tiny one-line wrappers, no any.
</standards>

<tasks>

<task type="auto" tdd="false" status="complete">
  <name>Task 1: Build the runnable audit harness</name>
  <files>examples/agent-experience/{ae-surface.ts,score.ts,run-audit.ts,README.md,.env.example}, package.json</files>
  <action>DONE (2026-07-04). Provider-agnostic AE surface client + trace recorder (ae-surface.ts); ADR-006 scorer with the five Arena dimensions + boundary-overreach axis, cap rules, grade, and gate booleans (score.ts); run-audit.ts with the probe and hermes drivers (hermes over an OpenAI-compatible tool loop isolated in callHermes()); README runbook + .env.example; npm scripts audit:agent-experience[:hermes]. Reports write to .planning/audits/agent-experience/.</action>
  <verify>node --import tsx examples/agent-experience/run-audit.ts --driver probe --base http://127.0.0.1:3000</verify>
  <acceptance_criteria>
    - The probe run pings the live server and writes a JSON + Markdown report with a grade + gate verdict.
    - The report distinguishes local (iteration) from deployed (gate).
    - No AE docs are pasted into any driver prompt; the door is discovered at runtime.
  </acceptance_criteria>
  <done>A real, runnable outside-in audit exists and produces a report against the live surface.</done>
</task>

<task type="auto" tdd="true" status="complete">
  <name>Task 2: Land the two remediations the first run surfaced</name>
  <files>src/modules/discovery/internal/discovery-files.ts, src/modules/inquiries/inquiry.functions.ts, src/modules/inquiries/inquiry.actions.ts, tests/*</files>
  <action>DONE (2026-07-04). (a) `/llms.txt` lists the quiet door `/api/agent/tools` without banned public labels. (b) `inquiry.submit` accepts public businessSlug/serviceSlug, resolves through the published catalog only, and an unsigned valid write reaches the 403 + `Accept-Signature` wall instead of schema 400. Verified by SEO/copy/typecheck/codegen/inquiry+agent-tools tests and local probe report `.planning/audits/agent-experience/probe-2026-07-04T12-34-03-043Z.md` (grade A, 92/100, local iteration signal only).</action>
  <verify>npm run test:seo && npm run test:copy && npm run typecheck && npm run check:convex-codegen && npx vitest run tests/unit/inquiries tests/integration/agent-tools-api.test.ts</verify>
  <acceptance_criteria>
    - curl /llms.txt contains /api/agent/tools.
    - A valid slug-based unsigned inquiry.submit returns 403 with Accept-Signature (not 400).
    - Copy/SEO/snapshot/typecheck green; surface stays the three tools with one write.
  </acceptance_criteria>
  <done>A cold agent can discover the door and reach AE's only write; the audit re-run improves.</done>
</task>

<task type="manual" tdd="false" status="blocked_by:#5">
  <name>Task 3: Run the GATE against the deployed surface + wire CI</name>
  <files>.planning/audits/agent-experience/*, .github/workflows/*</files>
  <action>Once issue #5 deploys AE: run `npm run audit:agent-experience:gate -- --base https://<deployed>` (and a mixed-model hermes run, ADR-006 D6). Record the report. Add a manual/scheduled CI job (NOT the PR gate — like the deploy smokes, ADR-001 D8) that runs the audit against the deployed origin and fails on gate FAIL. Feed the result into the GTM claim-acceptance gate.</action>
  <verify>npm run audit:agent-experience:gate -- --base https://<deployed-origin></verify>
  <acceptance_criteria>
    - The deployed audit passes the ADR-006 D5 gate (grade ≥ B, zero convergent overreach, docs_promise_met ≥ onboarding, one-hop unsigned-write recovery) before any agent-facing GTM claim ships.
    - The report is committed under .planning/audits/agent-experience/ and referenced from GTM-READINESS.
  </acceptance_criteria>
  <done>The agent-experience gate is enforced against the real deployed surface.</done>
</task>

</tasks>

<verification>
- [x] node --import tsx examples/agent-experience/run-audit.ts --driver probe (local, writes a report)
- [x] npm run test:seo && npm run test:copy (after remediations)
- [x] npm run typecheck && npm run check:convex-codegen
- [x] npx vitest run tests/unit/inquiries tests/integration/agent-tools-api.test.ts
- [ ] (deployed, blocked_by #5) npm run audit:agent-experience:gate -- --base https://<deployed>
</verification>

<success_criteria>
- A real, runnable outside-in audit exists (examples/agent-experience/) and produces a graded report against the live surface, distinguishing local from deployed.
- The two first-run remediations are landed and green (door discoverable; slug inquiry reaches the signature wall).
- The deployed GATE run is defined and blocked only on issue #5; it gates agent-facing GTM claims (ADR-006 D5, D8).
</success_criteria>

<output>
After the deployed gate run, create `.planning/scopes/scope-01-production-landing/01-05-SUMMARY.md` recording the harness, the remediations, the deployed grade/gate verdict, and that local runs are iteration-only.
</output>
