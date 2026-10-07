# Documentation

Start with the question you need answered. Current source and tests establish
implemented behavior; a plan, proposal or dated review does not establish a release.

## Authority and current work

| Question | Owner |
| --- | --- |
| What is the product and commercial boundary? | [PRODUCT.md](../PRODUCT.md) |
| Why should this institution exist? | [Australian whitepaper](../AGENTIC_ECONOMY_AUSTRALIA_WHITEPAPER.md) |
| What do its terms mean? | [CONTEXT.md](../CONTEXT.md), with the shorter [glossary](glossary.md) |
| What is the next complete commercial proof? | [START_LINE.md](../START_LINE.md) |
| What capabilities remain? | [Implementation roadmap](../IMPLEMENTATION_ROADMAP.md) |
| What needs action now? | [TODOS.md](../TODOS.md) and its existing issue links |
| What runs where, and what has been verified? | [Deployment map](operations/deployments.md), [readiness](production-readiness-plan.md) |
| How do I run and change the code? | [README](../README.md#run-locally), [AGENTS.md](../AGENTS.md) |

## Maintained contracts and operations

- [Accounts, Agents and Tool Calls](foundations.md): current setup, purchase entry points, lifecycle and recovery handoffs.
- Persona journeys: [Customer](foundations.md#choose-and-use-a-tool), [Administrator](foundations.md#administrator-journey), [Integrator](foundations.md#integrator-journey), [Provider](foundations.md#provider-journey). These are supported source steps; completed persona qualification remains recorded separately.
- [CLI guide](../packages/cli/README.md): install a verified release, discover an exact Tool, inspect and Call it, recover, and disconnect. Its public sandbox journey remains unqualified.
- [Canonical Agent skill](../plugins/agentic-economy/skills/use-agentic-economy/SKILL.md): source for the public `/SKILL.md` instructions; keep its machine guidance consistent with the guides and owner schemas.
- [DESIGN.md](../DESIGN.md): product presentation and interaction principles.
- [Operating model](operating-model.md): current commercial/alpha boundaries and outstanding qualification.
- [Agent operating contract](designs/agent-operating-contract.md): the machine-facing control loop.
- [Platform data privacy](designs/platform-data-privacy.md): data recipients, release, access and retention requirements.
- [Chat market entry](designs/chat-market-entry.md): discovery, comparison, recovery and purchase boundaries.
- [Founder console](designs/founder-console.md) and [commercial surfaces](designs/commercial-surfaces.md): bounded UI/data contracts.
- [Treasury](designs/treasury.md): operator facts, reconciliation and payment controls.
- [Convex root protocol](operations/convex-root-protocol.md), [local Stripe test mode](operations/local-stripe-test-mode.md), [journey alerts](operations/journey-alerts.md): standing engineering and operating instructions.
- [Usage metering](operations/usage-metering.md): reporting semantics and operations that remain inactive.
- [Infrastructure](../infra/package4/README.md) and [recovery drills](../infra/package4/recovery-drill/README.md): configuration and recovery procedures.
- [Licences](licenses): retained third-party notices.

## Decisions, proposals and research

[Architecture decisions](adr) retain their identifiers and stated status:
[0001](adr/0001-principal-reseller-commercial-topology.md) records principal resale;
[0002](adr/0002-jev-system-one-opportunity-statement.md) is withdrawn;
[0003](adr/0003-jev-market-journey-intelligence.md) and
[0004](adr/0004-bounded-service-packages.md) remain proposals.
[0005](adr/0005-datadog-supported-operational-observability.md) is prepared and
awaiting direction; configuration and acceptance are not established.

[ADR 0006](adr/0006-mercator-capability-foundations.md) records the Mercator capability
baseline and proposed procurement work. The [Mercator maturity register](operations/mercator-maturity-register.md)
retains MM-001–MM-060 requirements and evidence; accepted Plan decisions in ADR 0006
and its linked RFC take precedence over the dated baseline.
The [Plan Quotes RFC](designs/2026-10-05-plan-quotes-rfc.md) records the accepted
D1–D5 contract for multi-Tool purchasing, implemented in #362. Release evidence
establishes deployed behavior; the RFC remains distinct from ADR 0004’s
Provider-created service packages.

[Research](../research/README.md) distinguishes active managed-agent qualification
from dated comparisons and experiments. [Strategy](strategy) supports the thesis.
[AEcon Signals](workflow/aecon-signals-proposal.md) remains a proposal.
None of these changes scope or activates a service by being indexed here.

## Build the public documentation candidate

The private `packages/docs` app uses the official Fumadocs TanStack Start/MDX
scaffold with Scalar-generated Markdown reference. Install its pinned dependencies
separately from the application, then generate and qualify the approved content:

```sh
npm ci --prefix packages/docs
npm run docs:build
npm run docs:dev
```

Use Node 22 and npm 11.5.1. The docs app has its own lockfile to preserve its
upstream renderer dependencies without changing the application. `docs:build`
checks tooling, exports from canonical owners, verifies examples and publication
boundaries, builds HTML, typechecks the app and checks emitted files/anchors.
It also runs inside the existing merge/release gate; the docs install is a
prerequisite for that gate. These commands do not publish or deploy.

To inspect the built site locally, run `HOST=127.0.0.1 PORT=3197 npm --prefix packages/docs start`
and open `http://127.0.0.1:3197/docs`. Stop the process when finished.

The generated Start here page leads to four persona guides, authority, purchase
choice and recovery. Official Fumadocs `meta.json` files order the pages; do not
build another navigation system. The API index records every owner operation,
including exact OpenAPI fallbacks where Scalar cannot preserve the constraints.
Fallback links use this build's `/openapi.json`, never another hosted revision.

Edit the existing authored guide or action/schema owner, then regenerate.
`packages/docs/content`, `public`, `src/routeTree.gen.ts` and build outputs are
generated and ignored. [The manifest](../tools/docs/publication-manifest.ts)
selects precise public sections; a link never adds another document automatically.
[MM-055](operations/mercator-maturity-register.md#mm-055) and the deployment record
retain qualification and remaining public-sandbox/client gates.

## History and maintenance

[The archive](archive/README.md) preserves superseded plans, review dumps,
execution journals, copied references and raw conversation material. Its index
identifies current successors and retained open questions.

This repository index includes internal design and operating material; it is not a public publication allowlist. A public renderer must select content roots and their permitted links/assets explicitly. Linking a guide to a deployment record or privacy design does not authorise publishing that document or its transitive content. Maintain each permitted guide once for human HTML and Agent Markdown, and generate structural reference from owner schemas rather than maintaining another operation registry.

Keep one maintained owner for each question above. Update it when behavior or a
supported boundary changes. Put dated evidence in the release/issue record and
link it from the owner. Archive completed or superseded working documents with
their date and successor; preserve unresolved requirements and proposal status.
Use repository-relative links or immutable Git permalinks. Local recovery bundles
and ignored files must not be required to understand a clean checkout.
