---
name: ae-agent-journey-testing
description: Evaluate AE as a cold external agent and as the person relying on it. Use for assistant discovery, Customer Request journey checks, labelled development demonstrations, hosted verification, interruption and recovery, surface parity, customer-value comparisons, or claims that an external agent can use AE.
---

# AE agent journey testing

Evaluate the product a caller can actually reach. Start with the customer's need
and public origin; do not teach a cold test agent AE's routes, schemas,
capability IDs, expected answer, or internal state machine.

Read [references/proof-contract.md](references/proof-contract.md) before running
or judging a journey.

## Ground the run

1. Read `AGENTS.md`, `PRODUCT.md`, and the current implementations of
   `/SKILL.md`, `/llms.txt`, the public discovery routes, and
   `/api/v1/requests`.
2. Name the exact revision, deployment, environment, supply class, identity,
   authority, and permitted external effects.
3. State one ordinary-language customer job and predeclare what AE must improve
   over the same agent going directly to providers.
4. Use `src/modules/customer-request/hosted-agent-journey/` when its contract
   fits. Extend that source-owned runner instead of creating a parallel
   transcript harness.

This step is complete when the job, baseline, environment, caller, permitted
effects, authority stop, and maximum evidence claim are predeclared.

## Choose the loop

- **Development loop:** use labelled mock/sandbox supply to exercise the real
  application seam while building. Show the state changed, including a refusal,
  interruption, uncertainty, or recovery path. This is feedback, not product
  proof.
- **Cold hosted loop:** give the agent only the public origin, ordinary-language
  job, authorized credential, and comprehensible customer answers. This tests
  discoverability and that deployment only.
- **Customer-value loop:** compare the same job with and without AE using real
  customers and independently operated supply. Fixture or simulated personas
  cannot establish this claim.

Stop before an unapproved real-world effect. If revision or auth cannot be
verified, report the exact boundary rather than downgrading the run silently.

## Run the journey

Give the cold agent only:

- the public AE origin;
- the customer's ordinary-language request;
- an authorized credential, if the test includes authenticated operations;
- the customer's answers when the agent asks a comprehensible question.

The cold agent must discover the current machine surface, create one Request,
follow only navigation returned by the latest response, ask only for facts
needed by registered contracts, inspect whatever customer-semantic state the
surface actually returns, stop at explicit authority, and resume the same
Request after interruption. Exercise failure or cancellation when declared
scope allows it.

Never substitute source imports, direct Convex calls, fixture IDs, privileged
database reads, or a scripted transcript for the cold journey.

## Judge both actors

Evaluate two actors separately:

- **Calling agent:** Can it discover, interpret, navigate, retry, and resume the
  surface without private knowledge?
- **Person:** Does the agent receive enough customer-semantic information to
  explain the choice, cost, data sharing, uncertainty, authority, progress, and
  recovery without exposing routing machinery?

Use the proof contract's hard failures. A technically valid exchange fails the
declared journey when it merely moves schemas, makes the agent reverse-engineer
AE, or promotes internal RoutePlan state into a customer result.

## Compare the baseline

Run or honestly bound the same agent attempting the job without AE. Development
comparators are useful eval feedback. Claim customer value only when real use
shows the predeclared gain.

## Report evidence

Lead with the customer outcome and the first break. Include exact revision and
deployment, input request, public paths discovered, state transitions, questions
asked, option presented, authority stop, interruption/resume result, evidence
readback, baseline result, and claim boundary.

Classify every conclusion as source proof, fixture test, labelled local/dev
proof, hosted readback, cold external-agent proof, or real-customer and supply
evidence. Never let one class silently upgrade another. The current hosted
sandbox Request journey proves only that narrow deployed journey; it does not
prove human parity, useful real supply, composite execution, booking, payment,
dispatch, fulfilment, or general customer value.

Focused tests and evals steer the transition under change. Record unrelated
failures without turning broad suite cleanup into a journey gate. Completion
requires the labelled demonstration or cold run, exact command and revision,
earliest failing transition, verdict from the proof contract, and an explicit
claim ceiling.
