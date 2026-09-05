# Bounded workflow evolution

Use this when an observed delivery failure suggests the workflow itself needs
repair, or the user explicitly requests `evolve`. A recurring inconvenience can
justify a candidate; an unsupported review opinion cannot. Ordinary product
bugs stay in the delivery loop. Evolution is not a scheduler or a new product.

The method borrows incumbent/revision/synthesis comparison and fresh blind
judging from [NousResearch autoreason](https://github.com/NousResearch/autoreason).
Its [runner](https://github.com/NousResearch/autoreason/blob/main/experiments/v2/run_overnight.py)
retains an unchanged candidate and stops on repeated incumbent wins. This is an
adaptation for workflow instructions, not evidence that the method improves this
repository. Karpathy's autoresearch is a separate project.

## Bound the experiment first

Use the [experiment template](../assets/experiment.md). Record:

- The reproduced failure and link to its work record/finding.
- A falsifiable hypothesis and the smallest editable workflow surface.
- Incumbent version/digest, fixed task criteria and realistic scenarios.
- An explicit budget: default at most **two candidate rounds, twelve fresh agent
  runs and fifteen minutes**, whichever is exhausted first. Existing task budget
  may be lower. A user-requested larger experiment uses that budget instead.
- Objective pass/fail constraints plus judgment criteria chosen before authoring.

Workflow-owned instructions/templates are the editable surface. Product charter,
user approvals, acceptance criteria, safety/authorization boundaries, evaluation
fixtures/rubrics and third-party gstack/shared skills are immutable during the
experiment. Changing those requires a separately scoped goal. Prepare candidate
files in isolation; never overwrite the installed incumbent to run an experiment.

## Compare candidates

1. Reproduce and evaluate incumbent **A**. Keep its exact bytes as a candidate.
2. A fresh critic receives the task, evidence and A; it may find no actual defect.
   A fresh author produces a narrow revision **B**, fixing supported defects only.
3. A fresh synthesizer considers A and B equally and produces **AB**. It may retain
   A. Do not require a longer document or additional stages.
4. Exercise candidates on the same realistic tasks in isolated workspaces. Include
   the triggering case and previously fixed cases, plus a held-out scenario the
   candidate authors did not see. Evaluate actual decisions/artifacts when
   feasible. Hypothetical prose reviews alone do not prove behavioral improvement.
5. Use three fresh judges with no author discussion. Give them anonymized,
   independently shuffled candidates, original task, fixed rubric and outcome
   evidence. Collect a complete ranking containing each candidate exactly once,
   with evidence-based reasons. Record the random mappings. Invalid/missing ranks
   do not count as a win; allow at most one repair within the same budget.
6. Reject candidates that fail any hard requirement, regress a protected case,
   change the rubric, or overrun the agreed scope. For eligible candidates, rank
   using 3/2/1 Borda points from all three valid judges. On a tie retain A if tied;
   otherwise choose the smaller supported change. Objective regressions cannot
   be outvoted. Without three valid judgments or behavioral evidence, retain A
   and mark the result inconclusive.

Fresh agents may run sequentially when concurrency is limited. The initial
budget covers the six critic/author/synthesizer/judge roles per round; behavior
execution agents and repairs also consume that budget, reducing possible rounds.
Agents must receive only their role's needed context and task-scoped resources.
Track and await every agent. If independent execution is unavailable, record a
candidate for later rather than label the author's self-review independent.

## Promote or stop

Promote B or AB only with a reproduced improvement, no protected regression and
the complete judgment/evidence record. Preserve A and a scoped rollback patch.
Apply the winning diff to the versioned source only if its current digest still
matches A; concurrent changes require a new comparison. Keep instruction growth
only where it changes demonstrated behavior. Check actual Codex discovery and
explicit invocation after changing entry metadata.

If the loaded skill contains `.wayfinder-install.json`, its `source` identifies
the versioned editable directory; the loaded copy is derived. Edit that source
and run its sibling `install-skill.py`, followed by `--check`. An installer refusal
means local/concurrent changes need reconciliation, never force-overwrite them.
Do not claim promotion until the installed bytes match the accepted source.

Stop when A wins twice consecutively, no supported defect remains, a hard blocker
appears or the time/agent/round budget expires. Never expand the budget silently.
With a valid win already proved before the limit, retain that winner; otherwise
retain A. A failed experiment does not reopen settled product scope or undo
unrelated delivery work. Do not call `evolve` from an evolution closeout.

Record observed changes in criterion completion, recurrence, unplanned rework,
unnecessary approvals, instruction size and measured time/cost when available.
Do not manufacture missing baseline measurements or claim speed from fewer files.
Link the promoted commit and update the applicable lesson. Watch the next related
invocation for recurrence; report a regression and revert only the owned workflow
change when safe. Do not create a monitoring automation unless separately asked.
