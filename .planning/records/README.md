# Project record-keeping system

This directory is the durable record for project decisions, research
provenance, unresolved questions, evidence owners, and review dates. It does
not replace `PROJECT.md`, `STATE.md`, `REQUIREMENTS.md`, `PRODUCT.md`,
`DESIGN.md`, source, tests, or hosted evidence.

This is record keeping, not a strategy workspace. It answers:

- What did the project decide?
- Which evidence supported that decision?
- What remains a hypothesis or unknown?
- Who owns the next proof?
- When must the record be reviewed?
- Which authority file or ADR changed as a result?

## Knowledge views

- [`KNOWLEDGE-INDEX.md`](./KNOWLEDGE-INDEX.md) — what the project currently
  knows, with explicit current, target, accepted, observed, hypothesis, and
  unknown states.
- [`PROJECT-RECORDS.md`](./PROJECT-RECORDS.md) — decisions, hypotheses, research
  provenance, owners, and review triggers.
- [`SOURCE-REGISTER.md`](./SOURCE-REGISTER.md) — primary sources that own
  material external facts and the triggers that require refresh.
- [`RESEARCH-QUEUE.md`](./RESEARCH-QUEUE.md) — unresolved questions ordered by
  the project decisions they block.

## Authority order

When documents disagree, use this order:

1. Production source and executable evidence decide what exists now.
2. `PRODUCT.md` decides the current evidenced state and target product contract.
3. `DESIGN.md` decides human-surface language and interaction principles.
4. `AGENTS.md` decides always-on operating and claim boundaries.
5. Accepted ADRs decide expensive-to-reverse product and engineering choices.
6. [`PROJECT-RECORDS.md`](./PROJECT-RECORDS.md) records project decisions, hypotheses,
   research status, owners, and review dates.
7. Research informs decisions. It does not become authority by accumulation.

Planning documents never promote a target behavior into the current product.
That requires source plus executable evidence through the intended surface and
an explicit update to `PRODUCT.md`.

## The lifecycle

```text
Question
  -> research with primary evidence
  -> explicit inference or hypothesis
  -> experiment with a falsifier
  -> decision
  -> ADR when reversal would be expensive
  -> authority update
  -> implementation and executable evidence
  -> current-product claim
```

Skipping a step does not make the later state true. In particular:

- research is not a decision;
- a decision is not an implementation;
- implementation is not customer reachability;
- a sandbox result is not useful real supply or fulfilment;
- a closed issue is not product evidence.

## Document classes

| Class | Location | Purpose | May decide |
|---|---|---|---|
| Product authority | `PRODUCT.md` | Current evidence and target contract | Product truth and maturity |
| Interface authority | `DESIGN.md` | Human-facing product and language | UI and public-language rules |
| Operating rules | `AGENTS.md` | Always-on assistant constraints | How work is performed |
| ADR | `.planning/adr/` | Expensive-to-reverse decision and rationale | The named decision only |
| Project record | `.planning/records/PROJECT-RECORDS.md` | Status, ownership, links, review | What is accepted, proposed, stale, or superseded |
| Research | `.planning/research/` | Evidence and analysis | Nothing until adopted |
| Experiment evidence | Existing scope/eval/audit directories | A test and its result | The tested proposition only |
| Implementation plan | `.planning/scopes/`, roadmap, issues | Ordered work | Work intent, not product truth |

## Required research header

New strategic research must begin with:

```markdown
**Owner:**
**Status:** Active | Superseded | Archived
**Maturity:** Current evidence | Target research | Hypothesis | External field
**Question:**
**Decision affected:** D-### | None
**Evidence cutoff:** YYYY-MM-DD
**Review by:** YYYY-MM-DD
**Supersedes:** path | None
**Superseded by:** path | None
```

Use [`RESEARCH-RECORD-TEMPLATE.md`](./RESEARCH-RECORD-TEMPLATE.md). Every material statement
must be distinguishable as:

- **OBSERVED** — supported directly by cited source, source code, or executable evidence;
- **INFERRED** — a conclusion drawn from observations;
- **UNKNOWN** — unresolved and important;
- **HYPOTHESIS** — a falsifiable proposition with a named test.

Primary sources are required for current product, protocol, market-mechanism,
partner, and competitor claims. Secondary sources may identify questions but
must not own the conclusion.

## Decision rules

Add a row to `PROJECT-RECORDS.md` when a conclusion changes what AE will build, refuse,
measure, say, or monetize.

Write an ADR as well when the decision changes a public contract, authority
boundary, canonical data model, dependency direction, interoperability posture,
or business-model constraint that would be costly to reverse.

Never edit history to make a changed decision look inevitable. Mark the old row
or ADR superseded and link the replacement.

## Hypothesis rules

Every hypothesis must name:

- the decision it could change;
- the population or request family;
- the comparison or baseline;
- the measurement;
- the falsifier;
- the evidence owner;
- the review date.

If the review date passes without evidence, status becomes `STALE`. A stale
hypothesis may remain interesting but cannot justify implementation or public
copy.

## Language boundary

Research and engineering documents may use precise standards and internal type
names where needed. Positioning, customer research, and human-facing copy use
ordinary language: need, business, option, comparison, condition, confirmation,
progress, and next step.

Do not let internal terms such as route, graph, mandate, protocol, binding,
readback, or capability become the public explanation merely because they are
convenient in source. For the public product, describe what a business can do
and how the options compare.

## Review cadence

- Review `PROJECT-RECORDS.md` whenever a research task closes or a project decision changes.
- Review external-field research monthly while the ecosystem is moving quickly.
- Review GTM hypotheses after each meaningful business or caller cohort.
- Review accepted decisions only when their trigger fires or contradicting
  evidence appears.
- Review current-product claims at every public release using `PRODUCT.md` and
  intended-surface evidence.

The owner performs the review. Agents may prepare evidence and propose status
changes, but they do not silently promote a hypothesis or target claim.
