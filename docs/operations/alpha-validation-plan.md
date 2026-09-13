# Alpha validation and product maturity

Status: authorised; integration completion precedes the application audit.
Owner: Joel. Audit model: `gpt-5.6-luna`, reasoning `max`, cold context.

## Outcome

Establish, with observed behaviour, where Agentic Economy is ready for waitlist
alpha and where it is not. Then design and implement bounded corrections using
maintained components, official SDKs and the existing commercial boundaries.

The design question is: **Would Stripe build this? If so, how would they build
it?** This is a quality and ownership question, not evidence of Stripe's actual
implementation or roadmap. Any claimed reference behaviour needs a source or
an observed example.

Reference evidence:

- [Product authority](../../PRODUCT.md)
- [Whop maturity](../../research/WHOP-AE-MATURITY.md)
- [Locus maturity](../../research/LOCUS-AE-MATURITY.md)
- [Existing comparison, including Nevermined](../../research/PACKAGE-5-MATURE-SCAVENGE-COMPARISON.md)
- [Current integration evidence](hosted-cutover-2026-09-12.md)

No dedicated Nevermined maturity/scavenger file was located in this checkout.
The comparison document is secondary evidence, not a substitute for verifying
any Nevermined behaviour used in a design decision.

## Integration entry conditions

Before launching the full audit, establish one verified baseline:

- Intended web deployment, Convex deployment and production Clerk instance;
  successful authentication and signed webhook delivery.
- Stripe sandbox command/readback access and funding webhook reconciliation.
- Formance schema, authenticated access and transaction readback.
- Hosted Infisical identity authentication and scoped secret lifecycle proof.
- Supported sandbox supply, genuine authority and a paid testnet Call with
  matching funding, reservation, delivery and purchase records.
- Prepared test roles, authorised sandbox records, recovery references and
  a fixed deployed revision for the audit wave.

Binding a variable is not integration proof. An unavailable external dependency
is recorded as blocked. A free HTTP demonstration does not prove the paid
purchase path: current paid booking requires x402 financial evidence. Never
fabricate treasury observations, ownership, readiness or settlement facts to
satisfy an entry condition.

## Coverage

Generate a surface inventory from current routes, navigation, rendered controls,
public contracts and machine entry points. Assign every applicable element an
ID and a journey owner. Reconcile the inventory against completed reports;
unvisited, unavailable and intentionally excluded surfaces remain explicit.

| Partition | Journeys and elements |
| --- | --- |
| Discovery | Entry pages, catalogue, search, filters, comparison, Tool detail, playground, Provider pages, saved items, documentation and discovery files. |
| Customer activation | Signup, signin, Account setup, Agent access, authorisation, Connections, spending policies, approvals, security and team/role boundaries where implemented. |
| Funding and purchase | Balance, funding terms, Checkout return/cancel, Quote, Call, delivery, usage, spending, receipts and purchase status. |
| Provider supply | Setup, source import/preview, credentials/OAuth, admission, publication, recheck, revision, withdrawal, offboarding, earnings and payout status. |
| Recovery and operations | Pending/unknown outcomes, caller interruption, retry/reconcile/cancel/refund, duplicate or reordered events, audit, admin health, support and account removal. |
| Machine parity | HTTP, OpenAPI, MCP, CLI, chat and other implemented machine contracts; identifiers, amounts, authority, status and suggested next actions must agree. |

Across each relevant journey, cover desktop and compact layouts, keyboard use,
focus, loading, empty, validation, permission-denied, unavailable, success and
recovery states. Do not claim coverage merely from opening a page.

## Finite cold-agent lifecycle

Each agent receives one bounded journey, persona, entry URL/channel, authorised
test resources, success condition and stop rules. It receives no conversation
history or known-bug list. Spawn with `fork_turns: none`, the specified model
and reasoning level. Use independent browser tabs. Parallelise reads; serialize
mutations against shared records or assign isolated, authorised test resources.

Lifecycle: assigned → observe → attempt → bounded recovery → report → closed.

- Cap each run at six decision turns or twelve minutes, whichever comes first.
  A decision turn observes the current surface, chooses an action, performs it
  and checks the result. Record actual interactions/tool calls separately;
  batching must not conceal backtracking or user effort.
- Record any task requiring more than three decision turns, including the
  fourth turn's cause. This is a friction flag, not an automatic defect verdict.
- Retry an unchanged failure at most once. Stop the affected journey on unclear
  authority, possible duplicate financial effect, data isolation failure or an
  unknown external outcome; retain its durable reference for review.
- Use sandbox money and approved testnet supply only. No real payments,
  arbitrary external communications, credential exposure or destructive cleanup.
- Audit agents do not change application code, enable features, invent fixtures
  or fix what they are auditing. They produce evidence and terminate.
- Root reviews the report and closes the assignment. Later verification is a
  new bounded cold task against the changed revision, not an open-ended retry.

## Report contract

Record revision/deployment, run and journey IDs, model, persona/role, channel,
preconditions, timestamps, decision turns, interaction count, action trace,
expected and observed behaviour, terminal state and recovery outcome. Attach
sanitised screenshots, request/Call references or other relevant evidence.

For each journey explicitly report:

- What worked easily and why it was clear.
- Papercuts, frustrations, surprises and unnecessary effort.
- What the evaluator liked and disliked, labelled as judgement and tied to an
  observed behaviour rather than presented as a user-research finding.
- Every task over three turns, workaround, dead end and missing next action.
- Evidence supporting ready, not ready, blocked or not tested.

Critical blockers include unauthorised access, false success, duplicate or
excess economic effects, incorrect records, unusable delivery and recovery that
loses an uncertain purchase. Broken core journeys also block alpha. Cosmetic
issues and understandable extra steps are ranked separately by impact and
frequency; they are not silently waived.

## Design and implementation after evidence

Consolidate related findings by user goal and root cause before changing code.
For each accepted correction, specify the intended behaviour, affected boundary,
trigger, visible states, permitted actions, durable side effects, completion
evidence and recovery. Preserve separate funding, authority, delivery, settlement
and purchase-status facts.

Apply the Stripe question to clarity, predictable transitions, hosted-provider
ownership, truthful pending states, idempotency, reconciliation and supportable
records. Reuse an existing pattern or maintained provider capability where it
fits. Any custom domain behaviour must have a real AE requirement and caller.

Assign implementation in owned one-to-three-file tasks where practicable, review
the blast radius independently, run relevant checks, then verify the affected
journey with a fresh cold agent. The final maturity report links every finding
to evidence, decision, correction and verification; unresolved blockers remain
visible. No alpha-ready claim follows from source tests alone.
