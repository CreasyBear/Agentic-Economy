---
name: wayfinder-delivery
description: Coordinate gstack scoping and plan reviews through approved implementation, evaluation, housekeeping and local commit; resume work or test workflow improvements.
---

# Wayfinder Delivery

Run one bounded goal through the existing skills. Start by reading the current
repository's instructions, product authority and any existing accepted plan.
Use `docs/workflow/README.md` in the working repository when present; never import
the source repository's product rules or file layout into another project.

## Start or resume

Find the existing issue/work record before creating one. Read its approval,
current acceptance evidence and next action, then verify against current source
and Git state. A chat summary, stage label or successful command is not enough.
Record owned paths and starting dirty/staged work before editing.

Reuse the established tracking home without adding a parallel work record.
Only create `docs/workflow/work/<goal-id>.md` when multi-session work needs a
resumable record and none exists. The [work template](assets/work.md) is optional;
drop inapplicable sections and link larger plans and outputs. Routine work needs
only an outcome, checks and remaining risk in the response.

## Scope, then agree

Read [delivery.md](references/delivery.md) for routing and handoff rules.

1. Use the installed gstack `office-hours` to scope a new uncertain goal;
   `investigate` supplies evidence for a defect. Reuse completed scoping.
2. Use the relevant gstack plan reviews to settle product scope, engineering,
   user experience and platform fit. Investigate direction-changing unknowns
   before choosing the architecture. Keep one accepted plan.
3. Present the resulting concrete plan: outcome, complete bounded journey,
   chosen approach, affected areas, exclusions and proof in the target environment.
   **Obtain one direction approval per new goal before implementation.** Record
   the user's actual response and the approved revision. Reuse existing approval
   for that same direction. Scoping answers and silence are not blanket approval.

Run the actual installed skill instructions when selecting a stage; prefer the
gstack copy on a name collision. Do not claim a skill ran after merely reading
its description or template. Carry the user's workflow agreement through skill
handoffs: gather needed choices during scoping and one final direction approval
after planning, rather than repeated ceremonial approvals. A handoff to another
skill is a coordinator transition, not completion or new authorization.

## Deliver and close

After approval, implement and run focused checks, inspect the owned diff, fix
supported defects, and update affected documentation before local commit.
Separate reviews are risk-driven or requested, not universal stages.
Read [records.md](references/records.md)
for evidence, findings and closeout. Read only the applicable stack/specialist
skills. `ship`, publishing and deployment require corresponding task scope.

Fix issues needed for the accepted outcome. Capture unrelated findings in the
canonical backlog. Reopen direction only when new evidence changes the product
responsibility, platform choice, agreed outcome or material scope. Explain the
invalidated assumption and propose the smallest correction.

Evaluate every acceptance criterion in its agreed environment. Review the owned
diff, not every concurrent change. After a fix, rerun affected checks. Stop a
repeating failed approach after two attempts without new evidence: investigate
the cause or record the concrete blocker; do not restart an endless review loop.

Complete only with supported acceptance, correct touched docs, dispositioned
findings, owned housekeeping and a verified local commit. Report missing access
or live proof as blocked/remaining; never silently substitute SDK or unit proof
for an installed-client or deployed journey. Preserve other work and the index.

## Other requests

- **status:** Reconcile the existing record with current evidence; report outcome,
  unresolved criteria and next action. No automatic implementation or release.
- **tidy:** Inspect and fix housekeeping inside the named scope. Register larger
  ownership, naming, duplication or archival problems; scope broad moves as a goal.
- **evolve:** Read [evolution.md](references/evolution.md). Run a bounded comparison
  prompted by an evidenced failure. Preserve the incumbent when improvement is
  unproven. Never recursively invoke evolution on its own output.

No retrospective or evolution experiment is required at closeout. Record a
lesson only when useful and evidence-supported; run an evolution experiment only
when requested. This skill creates no scheduler or unattended continuation.
