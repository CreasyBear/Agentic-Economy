# Agent Experience — skill cross-reference against live ADRs / plans / issues

**Date:** 2026-07-04
**Skill audited:** `browserbase/skills` → `agent-experience` v1.4.0
(installed at `.agents/skills/agent-experience/`; source
<https://www.skills.sh/browserbase/skills/agent-experience>).
**Purpose:** decide what a new AE "agent experience" ADR / issue / plan should
contain, informed by this skill, by comparing the skill's method against what
AE's live decision records, scope plans, and issues already cover.

> This is an internal `.planning/` doc. Internal vocabulary (agent door, tools,
> clearance, boundaries) is allowed here; none of it is a public-copy proposal.

---

## 1. The two lenses (why they don't overlap)

**The skill is an outside-in, black-box audit of *agent DX*.** It drops N
unbriefed subagents at a *live* product from a one-sentence prompt ("get started
with X and do its primary thing"), forbids spoonfeeding, lets them discover the
docs / install / hit real failures, captures each tool-call trace, and scores
**Setup Friction (25%) · Speed (20%) · Efficiency (20%) · Error Recovery (15%) ·
Doc Quality (20%)** → A–F. It measures *whether a naive agent can actually
succeed*, and — critically — whether it succeeds **because of** the docs or **in
spite of** them (`docs_promise_met_rate` vs `onboarding_success_rate`).

**AE's live ADRs/plans/issues are inside-out producer machinery.** They build
the agent-facing surfaces correctly and boundary-honestly (identity, clearance,
capability registry, discovery, tool loop, receipts) and verify with
unit/integration/**copy**/**SEO**/**route-parity** tests. They prove the
surfaces are *correct, safe, and truthfully worded*. **None of them observes a
real agent trying to use the surface cold.**

That is the whole gap: **AE verifies its agent surfaces are right; it never
verifies they are *usable and boundary-respected by an actual agent that was
not told how they work*.** The skill is exactly that missing outside-in check.

---

## 2. What the skill actually does (digest, so the ADR reader needn't re-read SKILL.md)

- **Abstract goal, no checklist.** The subagent is told the *goal* ("make the
  product do its primary thing once"), never the steps. Prescriptive steps
  pollute the test (`SKILL.md:38-53`).
- **No spoonfeeding, no pre-fill.** Never paste docs into the prompt; never
  pre-fill the target from env/repo/memory signals — the operator must name it
  (`SKILL.md:34,444-447`).
- **N agents in parallel** (default 5), across personas × languages, optionally
  mixed models (Opus/Sonnet/Haiku) to test "are my docs robust to weaker
  models?" (`SKILL.md:59-88,201-215`).
- **Generic credential names on purpose.** Keys injected as `API_KEY` /
  `PROJECT_ID` / `SECRET`, never `PRODUCT_API_KEY`. The agent must read the docs
  to learn the real var name and map it; failure to map = a doc-quality signal
  (`SKILL.md:97-108`). Asking for creds at all **counts as Setup Friction**
  (`SKILL.md:448`).
- **URL provenance per WebFetch:** `TRAINING PRIOR` / `FROM LLMS.TXT` /
  `FROM PREV PAGE` / `GUESS · 404`. Lots of `GUESS · 404` = URL taxonomy drifts
  from convention; `FROM LLMS.TXT` after a 404 = **llms.txt is carrying
  discoverability — credit it** (`SKILL.md:233-253`).
- **Narrative cross-agent review (the highest-value step):** re-read all prose,
  hunt **convergent mistakes** (all agents use the same wrong package/endpoint/
  env var → doc failure even if each "completed"), **hallucinated artifacts**,
  **inconsistent outcomes**, **silent workarounds** (`SKILL.md:255-271`).
- **Sanity floor:** onboarding <50% caps *every* dimension at 55; convergent
  hallucination caps Doc Quality at 50 regardless of other signals
  (`evaluation-rubric.md:27-40`).
- Output: an HTML report (opinion-before-data ordering) + prioritised fixes.

---

## 3. Coverage matrix — skill concept × live AE artifact

| Skill concept / dimension | AE live artifact that touches it | Alignment | Gap / tension |
|---|---|---|---|
| **Outside-in agent audit** (drop unbriefed agents, score) | *(none)* | — | **Total gap.** No ADR/plan/issue runs a black-box agent-onboarding audit. Phase-03 D-03 states the *goal* ("agents determine facts/freshness/next action without a private conversation", `03-CONTEXT.md:50`) but verifies with route/schema **parity**, not agent behaviour. |
| **Doc Quality via llms.txt** (`FROM LLMS.TXT` provenance) | `/llms.txt` route (`src/routes/llms[.]txt.ts`), `readPublicLlmsTxt`; scope-02-04 adds per-business capability summary to llms.txt/UCP (`02-04…PLAN.md:134-140`); SEO-AEO-SPEC | **Strong.** AE treats `/llms.txt` as a first-class truth file and tests every advertised URL route-resolves. | Never measured from the *consumer* side: does an agent that fetches `/llms.txt` cold actually find the door and the right tool? Provenance/`GUESS·404` signal is uncaptured. |
| **Setup Friction** = ceremony before working code | ADR-003 identity: unsigned reads served, **unsigned writes `403 + Accept-Signature`** (`ADR-003…:117-119,214-219`); scope-03-02 `s3-unsigned-policy` | **Deliberate, honest friction.** AE *intends* a credential/signature wall on writes. | The skill will **score that wall as Setup Friction**. That's fine — but it only stays a *good* score if the `403`/`Accept-Signature` response is self-describing enough that the agent recovers in one hop. AE has no test that an agent recovers from it. |
| **Generic-cred-forces-doc-reading** | ADR-003 WBA: agent must discover it needs to *sign* requests (no shared secret) (`ADR-003…:124-128`) | **Conceptual match.** AE's "you must read to learn you must sign" is the same doc-quality lever as the skill's generic `API_KEY`. | Unproven that the docs (`/llms.txt`, tool `boundaries`) tell an agent *how* to become a signed principal. If they don't, agents converge on the unsigned path and bounce off writes. |
| **Efficiency** = straight line to the goal, few wasted calls | phase-07-01 agent tool loop: exact toolset `registry.search`+`registry.detail`, read-only, real result JSON fed back (`07-01…PLAN.md:59-66`); `/api/agent/tools` list+invoke (`api.agent.tools.ts`) | **Strong internally.** The tool contracts + quiet-door filter are tight and typed. | Efficiency is measured for AE's *own* answer loop, not for a *third-party* agent discovering `/api/agent/tools` and picking the right tool unaided. |
| **Error Recovery** | Typed `jsonError(code,reason,status)` on the door (`api.agent.tools.ts:165-166`); typed retryable failures (e.g. `inquiry_rate_limited`, `02-EXECUTION-EVIDENCE.md:46`) | **Good primitives.** Errors are typed, coded, retryable-flagged. | No evidence an agent *uses* the code/reason to route around. Skill scores recovery from observed traces; AE has none. |
| **Convergent mistakes** (all agents do the same wrong thing) | Whole AE trust contract: agents must **not** assume booking/payment/dispatch (`AGENTS.md`); copy scans ban `callable/autonomous/verified` etc.; ADR-003 D9 extends bans to agent JSON/boundaries | **This is AE's #1 risk and the skill's sharpest tool.** | **AE verifies boundary *wording* (producer copy scans); it never verifies boundary *behaviour*.** If 5/5 audit agents try to `inquiry.submit` expecting it to *book*, that's a boundary failure invisible to every current test. The skill catches exactly this. |
| **`docs_promise_met` vs `onboarding_status`** | inquiry conversion path defined in AGENTS.md (card → `/$slug` → inquiry) | AE has a clear "primary successful outcome" (send a qualified inquiry). | Never checked that an agent *infers* that outcome from the surfaces alone (vs. being told). |
| **Mixed-model robustness** | *(none)* | — | AE never asks "do my agent surfaces work for a weaker model, not just a frontier one?" |
| **No-pre-fill / explicit target** (`SKILL.md:34,444-447`) | — | — | Governs *running* the skill: an AE self-audit is fine (operator names AE), but the audit must hit the **deployed** surface — see Finding B. |


### 3.1 Issue-level mapping (live open issues)

No open issue *is* an agent-experience audit, but several are direct inputs to,
or dependencies of, the audit gate. Mapped to the skill's dimensions:

| Issue | Title (scope · label) | Relation to the agent-experience audit |
|---|---|---|
| **#5** | Stand up deployed env + five smoke evidence artifacts (scope 1 · `wayfinder:task`) | **Hard dependency.** The skill needs a *live* target (`SKILL.md:30,36`); the audit cannot run until #5 deploys. The new gate hangs off #5. |
| **#1** | Wayfinder map: AE five-scope build (ADR-001..005) (`wayfinder:map`) | Attach point — a new `ADR-006` + audit-gate line goes on this map. |
| **#20** | Decide credential-custody + `enforcementMode` for AE actions (scope 3 · grilling) | Setup Friction: defines the credential model an audited agent hits. |
| **#21** | Signing posture + key management for greenlights/receipts (scope 3 · grilling) | Setup Friction / Error Recovery: whether an agent can *become* a signed principal — Finding C's recoverability depends on this. |
| **#22** | Initiator readback auth: token vs magic-link vs attributed-only (scope 4 · grilling) | Setup Friction on the readback path an agent uses to see inquiry status. |
| **#23** | Fix `business_endpoint` SSRF + endpoint-trust envelope (scope 4 · research) | Doc Quality / boundary honesty of the endpoint-trust the agent surface exposes. |
| **#24** | Source-write scope for business-agent reply admission (scope 4 · grilling) | Setup Friction on writes — the exact wall the `None` credentials mode exercises. |
| **#26** | Business-side read-receipt honesty: ack event vs unknown (scope 4 · grilling) | `docs_promise_met` / epistemic honesty: does the surface claim more than it knows? |
| **#31** | Lock v1 non-paid slug card schema vs demo business (scope 5 · grilling) | The DTO/card shape an agent reads — Efficiency + Doc Quality of the contract. |
| **#33** | Run full demo-kit receipt loop against a seeded fixture (scope 5 · prototype) | **Inside-out sibling** of the audit: proves the loop with a *fixture*; the audit proves it with an *unbriefed agent*. Keep both; they catch different failures. |
| **#34** | Public receipt-verification privacy + human-surface copy (scope 5 · grilling) | Boundary copy the audit's convergent-mistake review scores. |

Takeaway: the live issue set builds the *mechanisms* an agent traverses
(credentials #20/#21, write admission #24, readback #22, endpoint trust #23,
card schema #31, receipt honesty #26/#34) and one *fixture-driven* loop (#33) —
but nothing turns an **unbriefed agent** loose on the assembled surface. The new
vehicle adds that, gated on #5.

---

## 4. The three sharpest findings

**A. Boundary-respect is verified only on the producer side.** AE's entire
thesis is that agents read/compare/route and **do not** assume
booking/payment/dispatch (`AGENTS.md`). Today that is enforced by *copy* scans
(banned words, plain labels: scope-02-04 Task 3, scope-03-02 Task 3) and typed
`boundaries` on each action. Copy scans prove AE *says* the right thing; they
cannot prove an agent *behaves* accordingly. The skill's narrative
convergent-mistake review is the only method in reach that answers "do real
agents actually respect the safe contract, or do they overreach?" — the single
most load-bearing question for AE.

**B. The audit is deploy-gated — and so is everything else.** The skill demands
a *live* target discovered cold (`SKILL.md:30,36`). Per five-scopes deficit #1 /
`STATE.md`, **nothing is deploy-proven** — Scope 1 (deployed env + smoke
evidence, issue #5) is still open. So the outside-in audit **cannot run** until
Scope 1 deploys. This is not a reason to defer the *decision*; it is a reason to
make "passes an agent-experience audit at grade ≥ B" a **named Scope-1 exit /
GTM-readiness gate**, so the audit runs the moment the surface is live instead of
being bolted on later.

**C. Deliberate friction only scores well if recovery is one hop.** ADR-003's
`403 + Accept-Signature` on unsigned writes is correct security and *intended*
friction. The skill will dock Setup Friction for it — acceptable — **but** the
grade only survives if the response teaches the agent how to become a signed
principal in a single recovery step (Error Recovery + Doc Quality). There is
currently no plan item asserting the unsigned-write refusal is *self-describing
to an agent*. That is a concrete, cheap addition.

---

## 5. Baked in — status (2026-07-04)

This is no longer a recommendation. The audit is decided, built, and wired:

- **Decision:** `.planning/adr/ADR-006-agent-experience-audit-gate.md` (Proposed)
  — adopts the outside-in audit + AE's boundary-overreach axis (D3), the abstract
  goal (D2), `None`-credentials WBA-wall realism (D4), the deploy-bound gate (D5),
  mixed-model (D6), measurement-only posture (D7), and placement (D8).
- **Runnable harness (real, no mocks):** `examples/agent-experience/` —
  `ae-surface.ts` (provider-agnostic client + trace recorder over the live
  contract), `score.ts` (5 Arena dimensions + boundary-overreach + gate),
  `run-audit.ts` (`--driver probe` deterministic baseline; `--driver hermes`
  drives the operator's own Hermes agent over generic HTTP tools via an
  OpenAI-compatible loop isolated in `callHermes()`). `npm run
  audit:agent-experience[:hermes]`. Reports → `.planning/audits/agent-experience/`.
- **First real run (probe vs local dev):** grade **D**, gate **FAIL** — it
  confirmed both predicted findings live: (A) `/api/agent/tools` absent from
  `/llms.txt`; (B) `inquiry.submit` uncompletable from public reads (needs
  `businessId`/`serviceId`). These are being remediated in plan 01-05 (Fix A:
  list the door on `/llms.txt` — landed + live-verified, incl. the Convex-side
  duplicate builder `convex/discovery.ts`; Fix B: slug-accepting `inquiry.submit`
  — in progress).
- **Gate wiring:** Scope-1 `S1-G3` + plan `01-05` + `SCOPE-01-INDEX` end
  condition; a DEPLOYED end-condition added to `SCOPE-02..05-INDEX` for each
  agent surface; `GTM-READINESS.md` §"P2-P6 claim acceptance" gate;
  GitHub issue **#36** (`wayfinder:task`, `scope:1`, depends #5); wayfinder map
  #1 "Decisions so far" line.
- **Follow-ups noted:** dedupe the two `/llms.txt` builders (`convex/discovery.ts`
  vs `src/modules/discovery/internal/discovery-files.ts`); calibrate thresholds
  after the first deployed run (ADR-006 T2); extend the goal to `inquiry.readThread`
  + `businessAction.verifyReceipt` as Scopes 4/5 deploy (ADR-006 T3).

---

## 6. Evidence (files read for this cross-reference)

- Skill: `.agents/skills/agent-experience/{SKILL.md, references/evaluation-rubric.md, references/subagent-brief.md}`.
- Decision records: `.planning/adr/ADR-002-capability-registry-agent-native-supply.md`, `.planning/adr/ADR-003-handshake-agent-identity-clearance.md`.
- Plans: `.planning/archive/scopes/scope-02-capability-registry/02-04-search-discovery-disclosure-copy-PLAN.md`,
  `.planning/archive/scopes/scope-03-handshake-identity-clearance/03-02-agent-door-identity-public-posture-PLAN.md`,
  `.planning/archive/phases/03-standard-agent-builder-discovery/03-CONTEXT.md`,
  `.planning/archive/phases/07-answer-thread-ai/07-01-ae-agent-tool-loop-PLAN.md`.
- Surfaces: `src/routes/llms[.]txt.ts`, `src/routes/api.agent.tools.ts`; `AGENTS.md`.
- Issues: open GitHub issues #1, #5, #18–#35 (scopes 1–5); none is an agent-experience audit.
