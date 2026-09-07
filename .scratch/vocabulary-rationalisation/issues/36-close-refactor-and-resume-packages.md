# Close the refactor and resume Package 6/7 delivery

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee:
Assigned role: Luna Max / refactor closeout and package-handoff owner
Parent: ../map.md
Blocked by: 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 37

## Outcome

Close the vocabulary refactor only after its implementation, review, local,
live and hosted acceptance evidence is complete; preserve the recoverable dirty
baseline; make a narrowly owned local commit when the changes can be isolated;
and hand one coherent contract/evidence set to the Package 6 and Package 7
owners. This issue is not permission to declare unrelated package work done or
to turn planning completion into product delivery.

## Fixed closeout rules

- Familiar AE language is consistent across implemented source, physical schema,
  HTTP/MCP, installed clients, generated/plugin instructions, screens and
  current documentation. Remaining old names have exact protected,
  protocol, identity, evidence or historical reasons.
- Existing permission, identity, money, delivery, payment, purchase-resolution,
  concurrency, idempotency and recovery behavior is proven unchanged. Protected
  identifier/hash/signature vectors and external financial history remain
  intact.
- Package 6 closeout and Package 7 implementation resume only after their
  refactor dependencies and handoff evidence are recorded. No outstanding
  Package 6/7 acceptance criterion is marked complete by association.
- The original dirty checkout is recoverable evidence, not a clean commit. The
  baseline was captured at branch `codex/vocabulary-rationalisation`, HEAD
  `91a4fff6f68fecd63ac39bbbd4509de0bc0d5b0d`, with 131 modified/staged path
  entries and 122 untracked entries at capture. The private source archive and
  checksums remain at
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/`.
  Joel subsequently authorised **all dirty work** to be committed. Local
  checkpoints `971660119a80a58013c67e2dafee5e47fe7edca8` and
  `645a348421479510432db4bdc630ed306acd18d8` preserve that work, including
  retained screenshots and blueprint artifacts. The coordinator verified a
  completely clean worktree after the second commit. Use the second checkpoint
  as the pre-source-refactor Git boundary; the original private archive remains
  separate recovery evidence. No push or deployment occurred. Later refactor
  commits still stage only their explicitly owned changes; this checkpoint
  approval is not blanket permission to absorb future unrelated work.

## Finite evidence and write allowlist

Read the exact predecessor tickets and receipts below; their closure receipts
are the finite authority for changed paths, test results and ownership. Do not
rediscover scope with a whole-repository wildcard:

- `.scratch/vocabulary-rationalisation/issues/08-execution-baseline.md`
- `.scratch/vocabulary-rationalisation/issues/09-consolidate-canonical-language.md`
- `.scratch/vocabulary-rationalisation/issues/10-rationalise-customer-agent-terminology.md`
- `.scratch/vocabulary-rationalisation/issues/11-rename-generic-action-execution.md`
- `.scratch/vocabulary-rationalisation/issues/12-rename-spending-policies-authorizations.md`
- `.scratch/vocabulary-rationalisation/issues/13-rename-callable-catalogue-to-tools.md`
- `.scratch/vocabulary-rationalisation/issues/14-rename-provider-supply-terminology.md`
- `.scratch/vocabulary-rationalisation/issues/15-rename-commitments-to-quotes.md`
- `.scratch/vocabulary-rationalisation/issues/16-rename-purchased-invocations-to-calls.md`
- `.scratch/vocabulary-rationalisation/issues/17-rationalise-next-actions-and-purchase-outcomes.md`
- `.scratch/vocabulary-rationalisation/issues/18-propagate-money-and-durable-record-names.md`
- `.scratch/vocabulary-rationalisation/issues/19-cut-over-http-and-mcp-contracts.md`
- `.scratch/vocabulary-rationalisation/issues/20-update-cli-consumers-and-distribution.md`
- `.scratch/vocabulary-rationalisation/issues/21-update-discovery-and-plugin-instructions.md`
- `.scratch/vocabulary-rationalisation/issues/22-regenerate-shared-artifacts.md`
- `.scratch/vocabulary-rationalisation/issues/23-update-customer-and-agent-screens.md`
- `.scratch/vocabulary-rationalisation/issues/24-update-catalogue-and-call-screens.md`
- `.scratch/vocabulary-rationalisation/issues/25-update-provider-screens.md`
- `.scratch/vocabulary-rationalisation/issues/26-update-money-and-business-record-screens.md`
- `.scratch/vocabulary-rationalisation/issues/27-reconcile-current-documentation.md`
- `.scratch/vocabulary-rationalisation/issues/28-preserve-and-cross-reference-history.md`
- `.scratch/vocabulary-rationalisation/issues/29-engineering-review.md`
- `.scratch/vocabulary-rationalisation/issues/30-developer-experience-review.md`
- `.scratch/vocabulary-rationalisation/issues/31-hosted-cutover-preflight.md`
- `.scratch/vocabulary-rationalisation/issues/32-verify-source-and-contract-completeness.md`
- `.scratch/vocabulary-rationalisation/issues/33-rebuild-local-test-data.md`
- `.scratch/vocabulary-rationalisation/issues/34-exercise-application-and-installed-clients.md`
- `.scratch/vocabulary-rationalisation/issues/35-perform-hosted-test-cutover.md`
- `docs/designs/vocabulary-rationalisation.md`
- `docs/workflow/work/WF-20260905-vocabulary.md`
- `docs/guides/package-6-plugin-release.md`
- `docs/workflow/work/WF-20260905-package-7.md`
- `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/status.porcelain`
- `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/head`
- `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/index.name-status`
- `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/worktree.sha256`
- `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/archive.sha256`

The only direct repository write owned by this issue is its closure receipt:

- `.scratch/vocabulary-rationalisation/issues/36-close-refactor-and-resume-packages.md`

The final refactor commit may contain only exact implementation/documentation
paths named in resolved predecessor closure receipts and approved by the
coordinator. Do not edit source, generated outputs, Package 6/7 records,
`map.md`, the vocabulary work record or the selected plan from this issue.

## Commit and handoff procedure

1. Confirm every required issue is resolved with its stated acceptance and
   inspect the exact changed-path/verification receipts. Confirm issues 31 and
   35 contain hosted target, backup/restore, reconciliation, rollback and live
   evidence, not only planning text.
2. Compare the current tree with baseline HEAD and the private archive. Classify
   each path as pre-existing baseline work, refactor-owned work or mixed. A
   mixed path is a coordinator decision point; do not overwrite, revert,
   silently include or claim reproducibility for it.
3. Run the final checks below. Stage only the explicit refactor-owned paths;
   never use `git add .`, `git add -A`, `git commit -am`, reset, checkout or
   clean operations. If ownership cannot be isolated, leave the tree intact
   and report the blocker instead of creating a misleading refactor-only
   commit.
4. Record the local commit SHA and changed-path list separately from the
   deployed candidate SHA, hosted URL/deployment ID and live verification
   result. A local commit does not prove deployment, and a deployed candidate
   does not prove the dirty baseline was preserved.
5. Hand the final Tool/Provider/Quote/Call/policy/action-execution contracts,
   exceptions, generated/client artifacts and evidence to the Package 6 and
   Package 7 owners. Resume their work only through their existing records and
   acceptance criteria.

## Verification commands and expected results

Use Node 22 and npm 11.5.1 through the existing runner, consuming the final
issue 32 integrated receipt:

```sh
git status --short --branch
git rev-parse HEAD
git diff --name-status 91a4fff6f68fecd63ac39bbbd4509de0bc0d5b0d
git ls-files --others --exclude-standard
git diff --check --
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:all
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run build
```

Expected: the dirty baseline remains recoverable, only documented refactor
paths are selected for commit, whitespace is clean, and the final integrated
checks/build agree with the predecessor receipts. The 26 pre-existing
TypeScript-standards findings remain separately recorded if still present; no
assertion is weakened or relabelled to obtain a pass. `test:cli-package` stays
pending until the explicit Node 20/22 compatibility decision from report 30 is
resolved and then runs only under the approved policy.

## Exclusions and rollback boundary

- Do not delete the private source archive, old evidence, historical research,
  external financial records, retained recovery drill or Package 6/7 history.
- Do not deploy, reset, migrate, replay payments, alter routes/domains, create
  a Vercel project, add dependencies or change product direction during
  closeout. Hosted rollback remains issue 35's matched application/backend/
  data boundary and reconciles any new external effects first.
- Do not mark the accepted plan, issue 03 inventory, Package 6 or Package 7
  complete solely because this receipt exists. Missing deployed/live proof
  remains open on its owning issue.

## Acceptance

- [ ] All implementation, review, local-data, live-QA and hosted-cutover
      predecessor issues have passed their own acceptance, with no unresolved
      refactor regression or unrecorded hosted limitation.
- [ ] Final source/contract/generated/client/documentation parity, protected
      vectors and remaining old-name exceptions are attached.
- [ ] Dirty-baseline classification is explicit; no unrelated modified or
      untracked path is silently committed, and any mixed-path boundary is
      escalated to the coordinator.
- [ ] Local commit SHA (if isolatable), deployed candidate SHA and live proof
      are recorded as separate facts with changed-path lists.
- [ ] Package 6/7 receive a written handoff and resume without altering their
      outstanding requirements or claiming them complete by association.

## Closure evidence

Attach the predecessor resolution table, final command/runtime receipts,
changed-path classification against the baseline archive, local commit and
candidate deployment identities, final naming-exception list, rollback record,
Package 6/7 handoff and coordinator acceptance. Keep this issue open if a
required proof, ownership boundary or handoff is missing.
