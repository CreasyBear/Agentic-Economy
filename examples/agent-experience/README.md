# Agent-experience audit (ADR-006)

Drive a real agent through Agentic Economy's **live** agent surfaces and score
the run. No mocks — every call is real HTTP against the origin you name.

This is the runnable implementation of
[`.planning/adr/ADR-006-agent-experience-audit-gate.md`](../../.planning/adr/ADR-006-agent-experience-audit-gate.md).
Analysis: [`.planning/AGENT-EXPERIENCE-AUDIT-CROSSREF.md`](../../.planning/AGENT-EXPERIENCE-AUDIT-CROSSREF.md).

## What it does

Given only a base URL and a one-sentence goal, an agent must **discover** AE
itself (`/llms.txt` → the quiet door `/api/agent/tools` → `registry.search` /
`registry.detail` → the qualified-inquiry step) and take the first real step
toward contacting a fitting business. The deterministic probe now records four
named release scenarios:

1. **Cold storefront discovery** — start at `/llms.txt` and reach a published
   business profile without repo briefing.
2. **Signed inquiry submission** — hit the unsigned `403 + Accept-Signature`
   step-up, score whether it teaches recovery, and when signing env is supplied
   submit a signed+admitted `inquiry.submit` expecting `inquiry_submitted` or
   `inquiry_replayed`.
3. **Boundary refusal** — refuse booking/payment/dispatch-shaped asks without a
   write attempt or overreach.
4. **Freshness/correction** — detect profile last-checked and
   needs-confirmation/correction signals from agent-readable profile data.

The run is scored on the five Arena dimensions (Setup Friction, Speed,
Efficiency, Error Recovery, Doc Quality) plus AE's sixth axis, **boundary
overreach** (did the agent try to book/pay/dispatch, or treat a tool as a
completed consequence?).

Two drivers:

- **`probe`** — a deterministic baseline (no LLM, no key). Use it to sanity-check
  the target and to iterate on AE's surfaces.
- **`hermes`** — *your* Hermes agent. It gets only generic HTTP tools
  (`fetch_url`, `http_post`) and must discover + drive AE itself.

## Run it

Bring AE up locally (real target):

```bash
npx convex dev --once --typecheck=disable --codegen=disable   # deploy dev backend
npm run seed:dev                                               # seed the catalog
npm run dev                                                    # vite on http://127.0.0.1:3000
```

Then, from the repo root:

```bash
# Deterministic probe — no key needed:
npm run audit:agent-experience            # == run-audit.ts --driver probe

# Your Hermes agent (set HERMES_* first — see .env.example):
export HERMES_BASE_URL=... HERMES_API_KEY=... HERMES_MODEL=...
npm run audit:agent-experience:hermes -- --agents 3

# Against a deployed origin (the actual Scope-1/GTM gate run):
npm run audit:agent-experience -- --base https://your-deployed-ae.example

# Release gate check (does not run a new audit; inspects stored reports):
npm run audit:agent-experience:gate -- --base https://your-deployed-ae.example --max-age-days 7 --min-grade B
```

Flags: `--base <url>`, `--driver probe|hermes`, `--goal "<text>"`,
`--agents <n>` (hermes), `--max-steps <n>` (hermes), `--out <dir>`,
`--gate`, `--max-age-days <n>`, `--min-grade A|B|C|D|F`.

Reports (JSON + Markdown) land in `.planning/audits/agent-experience/`.
Gate mode exits non-zero unless that directory contains a report from a
non-localhost target, newer than the configured age window, with grade at or
above the configured threshold and the ADR gate passing.

## Local vs. the gate

A **local** run is an iteration signal you can use now — it is *not* launch
proof. The ADR-006 **gate** (grade ≥ B, zero convergent overreach,
`docs_promise_met ≥ onboarding`, one-hop unsigned-write recovery) runs against
the **deployed** surface (Scope 1 / issue #5). Every report states which it is.

## Safety

The audit only reads AE over HTTP; it needs no host installs and no AE operator
credentials (AE reads are open; the only write wall is the signed-identity
requirement, which the audit deliberately hits and scores). It never books,
pays, or dispatches. Never paste AE docs, schema, or `AGENTS.md` into a driver
prompt — discovery is the test.
