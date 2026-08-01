# AE cold-agent proof contract

## Required record

Record these before the run:

- customer job in ordinary language;
- public origin, exact Git revision, deployment ID, and environment;
- caller identity and granted scope, without recording the secret;
- supply class: fixture, labelled sandbox, or independently operated real supply;
- run class: development feedback, hosted readback, cold external-agent, or
  real-customer comparison;
- permitted effects and the authority point that must stop them;
- direct-agent baseline;
- one predeclared customer gain.

Record these from the run:

- discovery path and operations found without source access;
- Request reference, revisions, and non-duplicating replay;
- every clarification shown to the person;
- the customer-semantic state actually returned, including choice, alternatives,
  cost, data use, effects, evidence, uncertainty, freshness, and fallback only
  where present;
- confirmation boundary and the exact action it authorizes;
- progress, interruption, resume, cancellation, failure, and outcome-unknown
  behavior exercised;
- final evidence or absence of evidence;
- direct-agent baseline result and measured gain.

## Pass conditions

A cold external-agent run passes only when:

1. A cold agent discovers and navigates AE from the public origin without leaked
   endpoint, schema, contract, graph, provider, or state-machine knowledge.
2. The customer's initial request is ordinary language and may be incomplete.
3. Clarification fills registered contract inputs while remaining understandable
   to the person.
4. The returned choice helps a person decide and exposes important boundaries
   before authority.
5. Replays do not duplicate work, and interruption resumes the same Request.
6. Returned outcomes are supported by named evidence; uncertainty stays visible.
7. The run beats or clearly differs from the predeclared direct-agent baseline
   for the declared evidence class.
8. The evidence class and supply class are stated without promotion.

## Hard failures

Fail the run when any of these occurs:

- the agent is given capability IDs, graph structure, digests, transport details,
  fixture identities, internal states, or the expected sequence;
- success requires source imports, direct database access, or privileged Convex
  functions unavailable to a caller;
- the interface asks the person to fill a disguised schema rather than carrying
  a contextual conversation;
- a single provider response is wrapped in route language without improving the
  decision;
- multiple calls hit one hand-coded adapter and are presented as independently
  operated supply;
- cost, data recipients, effects, uncertainty, evidence, or recovery is absent
  where material;
- an effect starts before explicit bounded authority;
- replay causes a duplicate effect, or interruption loses the Request;
- a result is fabricated, an operator is hidden, or unknown is converted to
  success;
- sandbox evidence is described as useful real supply, customer value, or
  external fulfilment;
- a generated report, issue state, test fixture, or scripted transcript is used
  as completion evidence.

## Evidence classes

| Class | Establishes | Does not establish |
|---|---|---|
| Source and unit | Typed behavior in source | Reachability or deployment |
| Integration fixture | Cross-module behavior under fixtures | Hosted or real supply behavior |
| Labelled local/dev | Real application seams under mock or sandbox data | Hosted dependencies or customer value |
| Hosted readback | Named deployment and response | Independent agent usability |
| Cold external agent | That exact agent journey | General customer value |
| Real customer and supply | Observed use for that cohort | Universal product-market fit |

## Verdict

Return one of:

- `PASS_FOR_DECLARED_CLASS`
- `FAIL_CUSTOMER_JOURNEY`
- `FAIL_AGENT_NAVIGATION`
- `FAIL_AUTHORITY_OR_SECURITY`
- `FAIL_RECOVERY_OR_EVIDENCE`
- `BLOCKED_BEFORE_EFFECT`

Name the earliest failing transition and the smallest source change that would
move it forward. Do not average hard failures into a score.
