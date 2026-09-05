# Package 6 — onboarding, guidance and public distribution

Status: local implementation delivered; public release is not approved or published.

This implements Package 6A–D in IMPLEMENTATION_ROADMAP.md. PRODUCT.md remains
product authority; CONTEXT.md owns terminology. The maturity references are
.planning/research/2026-08-25-platform-maturity-rubric.md,
research/PACKAGE-6-MATURITY-REQUIREMENTS-RESEARCH.md and
research/PACKAGE-6-INVERSE-PREMORTEM.md.

## Accepted decisions

- Implement alongside Package 4/5 closeout; retain substantive production gates.
- Public discovery first, then the host's native account connection before
  protected Calls. Exactly four anonymous MCP tools; no authentication tool added.
- One OpenAI plugin and one maintained skill, also served at /SKILL.md.
- app.aecon.ai is the intended public origin, Agentic Economy the publisher and
  support@aecon.ai the private support address.
- Native Codex CLI, Claude Code and Cursor remain alternatives. Public listing
  approval and a real ChatGPT/Codex installation are part of completion.
- Reuse existing action declarations, Provider drafts, connection attempts,
  status projections, account connection and UI components.
- Do not add an installer, workflow, draft store, error taxonomy, CMS, ticketing
  system or model-evaluation framework.

## Bounded tasks and ownership

Each slice includes the existing tests for its changed behavior. Workers do not
stage or commit other contributors' edits. The lead owns shared-file integration,
heavy checks, deployments and publication.

| Task | Owner | Deliverable and dependency |
| --- | --- | --- |
| P6-01 | Terra | Standard MCP annotations from shared action facts; four public tools; per-role payload bounds. Native-host authentication compatibility remains a publication check. |
| P6-02 | Terra | Bind the existing saved OpenAPI candidate to the manual connection attempt; validate owner, source and environment. No new draft store. |
| P6-03 | Terra | Preserve references on connection exits and check authoritative state before retry. Depends on 02. |
| P6-04 | Terra | Existing Operation status returns one appropriate continuation; pending review does not schedule repeated validation. |
| P6-05 | Lead | Official plugin scaffold and one shared skill; package validation and public-route parity. |
| P6-06 | Lead | Value-first agent entry, one native path and disclosed alternatives; public plugin CTA waits for verified listing. |
| P6-07 | Terra | Provider fit, requirements and outcomes; protocol details in existing documentation. |
| P6-08 | Lead | Private support, current-record links and disclosed diagnostics. |
| P6-09 | Lead | Consistent language on touched onboarding, sign-in, skill and distribution surfaces. |
| P6-10 | Lead/operator | Canonical origin deployment using existing configuration; blocked until an approved production target is available. |
| P6-11 | Lead/operator | Same-revision ChatGPT/Codex and fallback-client proof; reproducible submission cases. |
| P6-12 | Business owner/lead | Verified publisher, legal/support readiness, directory submission, approval and public installation. |

Start independent implementation lanes together and refill only with bounded,
non-overlapping work. A dependency or external approval blocks its dependent
claim, not unrelated implementation.

## Acceptance

- Public discovery returns actual market facts or a truthful no-match/outage.
- Account connection does not grant authority; inspection and Invocation remain
  enforced by existing contracts.
- Same-input idempotence is distinct from recovery after an uncertain result.
- Manual/OAuth handoff preserves the saved selection and refuses mismatched
  Business, source, connection or environment.
- Status shows current evidence and one next action; uncertain outcomes never
  suggest a blind new Call.
- Plugin and /SKILL.md contain the same instructions; named tools exist.
- Anonymous tools/list stays at four tools and at most 8 KiB; authenticated
  buyer/provider/combined projections stay within 10% of measured baselines.
- Keyboard and compact-screen onboarding/support checks pass.
- Public publication requires an approved production environment and actual
  native-client evidence. A local build or reference fixture is not that proof.

Release procedure, reviewer cases and external blockers:
[Package 6 plugin release](docs/guides/package-6-plugin-release.md).

## Implementation handoff — 5 September 2026

P6-01–09 are implemented locally, except for the explicitly unresolved OpenAI
authentication metadata compatibility in P6-01. P6-10–12 remain incomplete:
production origin, actual native-client proof and public publication require
the external gates in the release guide. No deployment or publication was made.

The shared Markdown skill uses the existing Vite raw import and esbuild text
loader. No duplicate skill generator, installer, draft store, dependency or
authentication workaround was added. Existing unrelated changes were preserved;
no commits were made from the shared worktree.
