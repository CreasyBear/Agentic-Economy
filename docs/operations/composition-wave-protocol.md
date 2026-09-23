# Composition wave protocol

**Status:** how a route is judged after it is in the coverage register.
**Record:** [`composition-coverage-register.md`](./composition-coverage-register.md). Seen rows are not rewritten.
**One route at a time.** A wave is unfinished until every Seen row on that route has a verdict.

## Two questions, both required

**Frame.** A control that looks like a filter, a tab, a chip, or a peer mounts a different page: different hero, header, list, scroll, or focus. Market’s Collections / Tools / Providers / Saved split is the specimen. A route is cleared of this question only when the control stays inside one frame.

**Seen.** Every row already in the register is judged against the route’s Job and Good. Clearing the frame question does not clear the route. “Not this decision” and “stays open” are not verdicts.

## What a judge owes

Read the skill file before the route. Then read that route’s Job, Good, and the Seen rows assigned to you. Open the components those rows cite.

Return prose. These headings, in this order. A missing heading, an empty **Refuse**, or a Seen row with no verdict is an invalid return. Send it back.

### What is wrong

Harsh, about the component. File:line. If this route does not swap compositions, say so in the first sentence, then continue. Do not stop. The Seen rows are the rest of the job.

### The job, as this skill sees it

One sentence from Good. Not a restatement of the skill.

### Each Seen row

For every assigned row, in number order:

- **Verdict:** Blocker, Platform, or Refuse.
- **Why,** tied to the job. A Blocker stops the person doing the job, or states a false next step. Platform is a shared constructor (token, button, focus, live region) and is not this page’s layout. Refuse means honoring the row would sand the only part that works, or the row is taste against Good.
- **Change,** if Blocker or Platform: a prop, a class, a string, or an unmount. File:line. No new layout component.

### The tension

Where this skill wants a fix that would make the page worse, or where another honest reading would keep the thing you want to cut. Name that reading. Say why you hold yours.

### How we morph

Only the Blockers that are this route’s composition. Reuse a frame the route already has. Platform rows are not morph steps. If there is no composition Blocker, say so.

### Refuse

At least one assigned row, or one tempting tidy-up, that this wave will not do, and why.

## Rounds

### Round 1 — frame

Three judges, launched together. They do not see each other’s returns. They answer the frame question, and they judge the Seen rows in their attack. They do not invent rows.

| Judge | Reads first | Attacks | Owns these Seen domains |
| --- | --- | --- | --- |
| Layout | `better-layout`, Impeccable layout (Operate), and this line from Apple familiarity: things that look the same must behave the same and live in the same place. Do not apply the rest of the Apple skill. | Does the second view keep the same structure, scroll, and header, or is it another page? | Layout |
| Cognitive load | `cognitive-load-auditor` | Does the switch force a new decision before the job, or is it the same shortlist with a different slice? | Cognitive load |
| Rams | `rams-design-audit` | What already earns its place, and what would a unify pass destroy? | No domain. Veto only: a Blocker that would delete the part of the page that works. |

### Round 2 — constraints, every remaining row

One pass. These skills do not propose a second layout. They judge every Seen row in their domain, including rows Round 1 already touched. A disagreement is written, not averaged away.

| Skill | Seen domain |
| --- | --- |
| `better-accessibility` | Accessibility |
| `better-writing` | Writing |
| `better-typography` | Typography |
| `better-colors` and `better-ui` | Colors, UI |

Each row is **Blocker**, **Platform**, or **Refuse**.

### Round 3 — decision

The parent writes **Approach** under that route. Seen stays untouched.

Name every Seen row number and its verdict. Do not average the judges. Where they disagree, pick one and say why. Platform rows name the shared constructor, not a restyle of this route. Refuse rows say what would be lost.

If the frame question is clear, say so. That sentence does not end the Approach.

### Round 4 — morph

Append **Morph** only for composition Blockers and for route-local Blockers a builder can do without designing. Platform work is listed once, as platform, not repeated as a page morph. The page that already works is left alone.

## Forbidden returns

- Ending a wave because the frame question was cleared.
- A Seen row with no verdict.
- A class-tweak list with no account of the job.
- A new visual system, a new page component, or a flat grid that deletes the only good frame.
- Treating platform hygiene as the route’s composition win.

## Order

`/tools/…` is the completed per-row specimen. Every other heading in the coverage register still owes this full protocol, including Market and the redirects. A cleared frame does not finish a heading.

Market remains the specimen for the frame question. A later route that repeats that split is still judged on its own controls. After the judges have looked, the Approach may cite Market’s morph. The citation is not a skipped judge.

One heading at a time: Market, then Ask, Agents, authorize, Credit, Activity, receipt, then the remaining headings in register order.

## Platform ledger

Shared constructors are listed at the top of the coverage register. Judges still open the route’s own rows. The parent cites the ledger so the same constructor is not given two morphs.
