# T37 — Delivery pipeline + multi-agent repo protocol: implementation plan

Ticket: [T37](../tickets/T37-delivery-pipeline-and-repo-protocol.md). Map: [Framework](../MAP-framework.md).
Prepared 2026-08-01 by six parallel read-only scouts: `history://ExamplesDecision`,
`history://RepoProtocol`, `history://CiGapAudit`, `history://BaselineRatchet`,
`history://GhAuthAndTracker`, `history://EnvSecretsRunbook`.
Baseline at `6f064fb1`.

## Two founder decisions gate everything below

**D1 — Fork reconciliation.** Local `main` and `origin/main` are two histories, not a stale ref.
`git rev-list --left-right --count origin/main...main` = **169 / 30**, merge base `a27ee0c9`, and
`--cherry-pick` still reports 169/30, so local never reproduced origin's commits. Origin's 169 are
granular Phase 5 work (median 3 files, +60,637/−7,051: Offering v2 registry/search/comparison,
durable clarification, hosted release evidence). Local's 30 include the 1026-file `fe50518d` rebuild
that deliberately deleted much of it. Trees differ across 1,418 paths. `backup/main` (`f6015c76`)
has **no merge base with either** — separate root after repair `09e5c297`; it is an archive, not an
integration base. `origin/main` was last fetched 2026-07-30 and cannot be refreshed until D3.

> **Question:** do you approve declaring local `337f01cc` canonical and retiring origin's Phase 5
> line as an archive, or must specific origin work be salvaged first?
> **Recommended default:** declare canonical, reconcile with `merge -s ours`. No force-push.

**D2 — Tracker of record.** Markdown, or mirror to Issues?

> **Question:** re-affirm local markdown as the tracker of record and delete the "mirror to Issues"
> intention from the five documents that still carry it?
> **Recommended default:** yes. The litreview's own reading of the wayfinder protocol is to adopt its
> mechanics "as product schema/UX, not GitHub issues"; issue **#181** already holds a stale map with
> 11 sub-issues, so a mirror collides rather than fills; and a full export is 44 issues + 43 parent
> links + 17 blocker links + ~98.7 KB of bodies whose issue numbers cannot be cleanly rolled back.

---

## Item 1 — Repo protocol

**Ship:** protected `main`; one branch per effort, `agent/<ticket>/<slug>`, cut from canonical main,
one agent (or pair) per branch, its own worktree, PR back, delete on merge. No direct pushes to main,
no shared write branches, no stashes as handoff, no stacked-PR default (rebase/force complexity
contradicts no-force). Dependent work serialises.

**Parallel-agent rule, learned from this session:** Main assigns exclusive file ownership up front.
Generated and shared files (`package.json`, lockfile, `routeTree.gen.ts`, `tsconfig.json`, Convex
schema/codegen) have exactly one integrator. Overlap serialises or arrives as a patch — never
concurrent edits. Seven agents merged cleanly today because the lists were disjoint, no agent ran a
project-wide command, and every behaviour-affecting change carried a differential proof.

**Commit admission:** an atomic behaviour unit with its tests; `git diff --check` clean; the named
focused suites green. TS/TSX/Convex also run `typecheck`; source runs `lint`; Convex schema/functions
run `check:convex-codegen`; boundary changes run `test:imports` + `test:ts-standards`; route/config
changes run `build`. Commits over 50 files or 1,000 lines require Main review plus an explicit written
reason — `fe50518d` (1,026 files) and `337f01cc` (240) are the anti-pattern, not the template.

**Review:** every agent PR gets an independent Main/critic diff review. Founder HITL is reserved for
history reconciliation, retirements, baseline changes, production/secrets, and tracker choice. Note
both fork lines are 100% `Joel Chan` commits, so review rules cannot key on author identity — gate on
status checks and explicit review instead.

**Git debt.** 13 stashes, all 2026-06-18. @0–@4 were already preserved under `.stash-recovery/` by
`3d423ed3` then deleted as superseded by `f2e3de4e` — drop after tagging those commits. @5–@11 each
have a named `recovery/stash-*` branch or applying merge — drop after pinning those refs. @12
(`75fd8cc2`) has no recovery ref — inspect once, then drop. 46 local branches: 7 merged and safe to
delete after tagging; the `archive/unmerged/*`, `recovery/*` and `safety/*` sets stay until D1 is
resolved. `worktree-agent-phase5-06-public-ui` is stale but carries a 169-file public-Offering diff —
tag before deleting. Remove the detached `/private/tmp/ae-head` worktree.

**Preserve before touching anything:**
```
git branch safety/t37-local-main-337f01cc main
git branch safety/t37-origin-main-74a14732 origin/main
git branch safety/t37-backup-main-f6015c76 backup/main
git tag t37/reconcile/local-337f01cc main
git tag t37/reconcile/origin-74a14732 origin/main
git tag t37/reconcile/backup-f6015c76 backup/main
```

**Reconciliation, after D1 + D3:** on a disposable branch,
`git merge -s ours --no-commit origin/main` then commit. Origin becomes the second parent, so the
push is a fast-forward — no force, no protocol violation, origin's 169 commits survive as history.
Force-push is the alternative and contradicts the map; it needs an explicit founder override.

## Item 2 — CI

Already true and previously mis-stated: **`test:integration` is in `test:release:source`**
(`package.json:21`), so the gate has been failing continuously, not silently skipping. And the
pre-commit hook runs react-doctor `--staged --blocking warning` but never calls `exit 1`
(`.git/hooks/pre-commit:3-25`) — **advisory despite the flag**, which is why 168 warnings did not
block `337f01cc`.

**Ship:**
1. Add `npm run check:convex-codegen` to `test:release:source` (exists at `package.json:17`, is in
   `test:all`, omitted from the release chain).
2. Add `npm run test:eval` — verified local and deterministic: the promptfoo provider
   (`eval/answer/providers/gate.mjs`) shells to local `run-case.ts`, no API key, 26 cases.
3. React Doctor action: `blocking: error`, `version: '0.7.7'`. Official docs confirm PR-baseline
   semantics — new errors fail the PR, pushes to main never fail on existing findings.
4. `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` on the kernel workflow. Keep
   `false` for main so a production deploy is never cancelled.
5. Rename the `source-proof` job label — it says "browser proof" but the source chain contains no
   Playwright; browser coverage is hosted-only.
6. Branch protection (after D3): require `source-proof`; never require `hosted-proof`, which is
   skipped on PRs. Merge queue only once source-proof is green — and it needs a `merge_group`
   trigger added to the workflow or the required check never reports.

**Do not** weaken `hosted-proof` or add `continue-on-error`. Hosted currently cannot pass for a
second reason: `smoke:customer-request:production:human` referenced a deleted
`playwright.deploy-smoke.config.ts` — restored in `6f064fb1`.

## Item 3 — Baseline ratchet

**Do not adopt Betterer.** Verified: latest `@betterer/cli` is `6.0.0-alpha.1`, published
2024-12-01, and it has no native Vitest failure identity.

**Ship instead:** Vitest's built-in JSON reporter (`--reporter=json --outputFile=…`, documented at
`https://vitest.dev/guide/reporters`) plus a small Node comparator — integration code, not a
reinvented tool. Normalise each failure to `suite + file + testName`, compare against a committed
`.planning/wayfinder/baseline-errors.json`. CI fails on any **new** ID, passes when failures are a
subset of the baseline, and reports IDs that started passing. The comparator never auto-adds; a
baseline addition requires an explicit maintenance PR with reason and owner. An ID may be removed
only in the same change whose focused command proves it passes.

**The classification is the important part: of 56 current failures, freeze 1.**

| Group | Count | Verdict |
| --- | --- | --- |
| `customer-request-v2-*` integration | 35 | **Fix — 2 root causes**, not 35 bugs: an aggregate/generation fence mismatch on commit-refresh, and current action/generation not admitted by prepare/compare. Trace `application/interpret-compile/compile.ts`, `convex/customerRequestV2WritePorts.ts:273-425`, `application/compare-resume/prepare.ts:27-60`, `v2-preparation/prepare.ts:42-68` |
| `answer-turn-empty-state` | 5 | Fix — deterministic source regression |
| `discovery-route-parity`, `developer-discovery`, `claim-publish` | 3 | Fix — deterministic |
| `customer-request-source-completeness` (imports) | 4 | Fix — **stale markers**: asserts a deleted `kernel-router.ts`, a literal `fetch(replacing` the code no longer writes, and renamed workflow step labels |
| `private-imports` | 1 test, **36 violations** | Fix — real boundary erosion, not a flake |
| `backup-imports` | 1 test, 2 violations | Fix — unallowlisted MCP SDK imports at `src/lib/server/mcp-api.ts:6-7` |
| `capability-*-boundaries` | 3 | Fix — real architecture, includes direct `ctx.db.insert/patch/replace` |
| `security/ssrf-surface-drift` | 1 | Fix — unguarded dynamic fetch in `convex/capabilitySupply.ts`. **Security; never freeze** |
| `direct-agent-baseline` | 1 | Fix — source builds `available={request,...customerAnswers}` and ignores cohort `directAnswers` (`direct-agent-baseline.ts:82-84`) |
| `development-host-parity` | 1 | Fix — evidence-integrity regression |
| `planning/project-records` active-research marker | 1 | **Freeze** — the only genuinely stale assertion |

While the debt exists, run strict `source-proof` as advisory so main's red state stays visible, and
make `baseline-ratchet` the required check. Graduate `source-proof` to required when the set empties.

## Item 4 — Environments, secrets, deploy

**INCIDENT, act before anything else.** During this preparation a scout's broad grep pulled
`.env.local` **values** into tool output. It self-reported and stopped, but the values were rendered.
Treat all 54 keys as compromised and rotate, Stripe and Resend first, then Clerk, then the rest. The
brief said "never print a secret value" but did not forbid the grep that reached the file — the
lesson is that the exclusion has to be mechanical, not advisory.

**Staging:** use **Convex Preview deployments paired with Vercel Preview deployments**; do not create
a permanent named staging deployment yet. Preview gives branch/PR-isolated functions, data, crons and
env config, and is auto-cleaned (5 days Free/Starter, 14 days Pro+). It consumes the team deployment
quota and is documented as beta. Add a permanent staging project only when a long-lived shared
dataset or manual-QA URL is actually needed. Vercel Custom Environments require Pro/Enterprise —
later, if ever.

**Findings to fix regardless:** naming mismatches between `.env.local` and the code that reads it —
`CHAT_MODEL` is set but `model-gateway/public.ts:25-37` reads `AE_LLM_MODEL`;
`NOVU_API_KEY`/`NOVU_APP_ID`/`NOVU_ENVIRONMENT_ID` are set but `notification-provider.ts:239-329`
reads `NOVU_SECRET_KEY` and workflow names. `.vercelignore` has no `.env*` line (`.gitignore` does
cover it). The OpenRouter credential returning `User not found` is a **live incident** blocking model
proof for the whole framework slice, not an unverified health row.

Source-write admission already supports rotation properly (`source-write-admission.ts:275-425`:
per-family `keyId:secret`, previous keys still accepted) — use it as the model for the others.

The deploy runbook should follow the shape of `RUNBOOK-money-hitl.md`, covering the existing exact-SHA
path: Vercel production deploy at a 40-hex SHA → Convex deploy-key deployment → four Convex
production env checks → labelled sandbox seeding → hosted readback.

## Sequence

1. **Rotate the exposed credentials.** Blocks nothing formally; do it first anyway.
2. **D3 — founder restores `gh` auth.** `unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN
   GITHUB_ENTERPRISE_TOKEN`, then `gh auth login --hostname github.com --web --git-protocol https
   --scopes repo`. There is no credential to repair — no env var, no `hosts.yml` token, no keychain
   entry — so this is a fresh login. Verify with `gh auth status`, `gh api user --jq .login`,
   `gh issue list -R CreasyBear/Agentic-Economy --state open --limit 1`.
3. **D1 + D2 answered.** Then: preserve refs → reconcile → protect main → stash/branch cleanup.
4. **Ratchet lands** and becomes the required check.
5. **CI edits land.**
6. **Then, and only then, the debt burn-down** — starting with the 2 root causes behind the 35 V2
   failures, because that single fix is the largest movement available.
