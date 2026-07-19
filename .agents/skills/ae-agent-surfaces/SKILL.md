---
name: ae-agent-surfaces
description: Audit or change AE machine-readable surfaces, registered action descriptors, Customer Request APIs, public catalog JSON, assistant setup, llms.txt, or UCP-shaped listing output. Use when an assistant-facing route, schema, action exposure, navigation relation, or machine-readable product claim changes.
---

# AE agent surfaces

Treat every surface as a projection of source-owned product meaning. A route is
not proof that the capability behind it is customer-reachable.

## Establish the live surface

1. Read `AGENTS.md` and `PRODUCT.md`.
2. Inspect the route, its imported action or application function, and its
   focused tests. Do not rely on a remembered route inventory.
3. Classify the change as public discovery, qualified inquiry, authenticated
   Customer Request, or internal/owner operation.
4. State the evidence level: source, fixture, labelled local/dev, hosted
   readback, cold external agent, or real customer and supply.

This step is complete when the public path, source owner, caller identity,
authority boundary, effects, and evidence ceiling are named.

## Current source map

- Assistant setup and index: `GET /SKILL.md`, `GET /llms.txt`,
  `src/modules/discovery/internal/agent-skill.ts`, and
  `src/modules/discovery/internal/discovery-files.ts`.
- Public catalog: `GET /api/businesses`,
  `GET /api/businesses/search?q=`, and `GET /api/businesses/$slug`.
- Listing fallback: `GET /$slug/ucp`. This is AE-hosted, UCP-shaped discovery
  output; it is not a claim of Google UCP compliance or action authority.
- Authenticated external-agent Customer Request:
  `GET /api/v1/requests/schema`, `POST /api/v1/requests`, then only the
  `navigation.actions` returned by the latest response.
- Registered actions: `src/modules/*/*.actions.ts` and the explicit registry at
  `src/modules/actions/index.ts`.

There is no generic `/api/agent/tools` contract in current source. `agentJson`
is an action exposure marker, not by itself a public invocation endpoint.

## Change the contract

1. Put business meaning in the existing action or Customer Request application
   seam; keep the HTTP handler thin.
2. Register new actions explicitly in `src/modules/actions/index.ts`. Exposure
   remains opt-in through `surfaces`; registration alone creates no public
   route.
3. Keep descriptors boundary-honest: exact inputs, outputs, effects, authority,
   uncertainty, evidence, replay behavior, and recovery.
4. For Customer Request, return the next permissible transition through
   `navigation.actions`. Callers must not construct later paths, businesses,
   costs, recipients, effects, or authority fields.
5. Bind writes to an authenticated principal, exact reviewed input or revision,
   bounded authority, and stable idempotency identity. An agent signature is
   attribution, never customer authority.
6. Preserve one semantic object across human and machine projections. Hosts
   render or transport state; they do not own business rules.

This step is complete when every changed surface reaches the same source-owned
transition and no projection widens its meaning.

## Demonstrate and evaluate

Use clearly labelled fixture or sandbox data while developing. Show at least
one success state and the material refusal, uncertainty, interruption, or
recovery state changed by the work. A mock must traverse the real application
seam; a hand-written response or transcript is not evidence.

Run the smallest focused tests that cover the changed route and transition.
Then run the relevant contract checks:

```sh
npm run test:copy
npm run test:seo
```

Add `npm run test:imports` when module ownership or registration changes.
Use `npm run smoke:customer-request:development:surface-parity` for a local
Customer Request parity change, and hosted smoke only when the task explicitly
requires hosted evidence and credentials are available.

Tests are feedback, not a reason to abandon the slice for unrelated cleanup.
Record unrelated failures with their exact command.

## Completion

Report the paths and source owners changed, caller and authority boundary,
labelled demonstration, commands run, earliest failure, and evidence class.
Sandbox or local parity proves development behavior only; it does not prove
production reachability, independent supply, provider fulfilment, or customer
value.
