# Last-Mile Agent Services

**Status:** category thesis  
**Relationship to the active product:** this explains why an Atomic Operation
Market should exist. It does not replace the current product charter or require
Agentic Economy to own an agent’s project.

## The starting point

AI models can already reason across more information than most people can gather
or hold at once. But an agent remains bounded by what its model knows, what its
current context contains, and which tools somebody connected before the work
began.

The boundary appears constantly:

- the agent understands restaurant quality but cannot see live tables;
- it can compare products but cannot obtain current inventory;
- it can diagnose a webhook failure but cannot create a suitable sandbox;
- it can understand a proprietary file but cannot render it;
- it can plan a shipment but cannot obtain a regional carrier quote;
- it can reason about a specialist question but lacks the relevant data,
  machinery, access, or judgement.

At that point, more inference is not enough. The agent needs an outside service.

**Last-Mile Agent Services is the category in which an agent finds and uses an
outside service when its current capabilities cannot complete the next step in
its work.**

The person or organization provides the larger goal, authority, preferences, and
budget. The agent is the actor that encounters the gap, selects the outside
contribution, consumes it, and continues.

“Last mile” is relative to the agent’s next step, not the completion of the whole
project. The service crosses the gap between what the agent can presently do and
what its work requires next.

## The restaurant journey

A user asks ChatGPT:

> Find the three best Greek restaurants near me with a table for two this Friday
> evening, then book the best one.

ChatGPT can identify nearby Greek restaurants, compare reviews, interpret the
user’s preferences, and decide which options appear strongest. It then reaches
a boundary. It does not possess reliable live reservation inventory or the
ability to create a booking.

The agent:

1. recognises that live availability is missing;
2. looks beyond its existing capabilities;
3. finds OpenTable, Resy, or another booking service;
4. asks for availability for the specified location, time, and party size;
5. receives current bookable slots;
6. selects the best match;
7. books under the authority the user has granted;
8. returns with the confirmation.

There are two ordinary units of work:

- one availability lookup;
- one reservation.

The booking provider is not responsible for the user having a successful
evening. It supplies current state and performs a bounded action. ChatGPT retains
the user relationship, the preferences, the reasoning, and the larger task.

This is not a metaphor for the Agentic Economy. It is an Agentic Economy
transaction when the agent itself can find and select the provider.

## What the agent buys

The reusable service and the purchased unit are different.

| Layer         | Restaurant example                        | General form                                                                           |
| ------------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| Supplier      | OpenTable, Resy, or another provider      | A company, individual, platform, API owner, or agent business                          |
| Capability    | Find and reserve restaurant inventory     | What the supplier can add to an agent’s reach                                          |
| Interface     | API, MCP, CLI, or computer-usable surface | How the agent accesses the capability                                                  |
| Invocation    | Search for two seats on Friday evening    | One use against a specific input                                                       |
| Returned unit | Available slots or a booking confirmation | Information, artifact, judgement, computation, access, or action consumed by the agent |

The economic unit does not need a new name. It may be one API call, one actor
run, one rendered file, one data result, one booking, one simulation, one expert
review, or one completed piece of work.

What matters is that the contribution is bounded from the consuming agent’s
perspective. Producing it may be complex. A supplier may use models, software,
private data, human expertise, physical machinery, or an entire operating
company. The supplier can sell a complete service to one customer while acting
as one contributor inside another agent’s larger project.

Atomic demand does not require simplistic supply.

## Agents are the customers

Today, most integrations are chosen before the agent begins working. A developer
installs an MCP server, a platform signs a partnership, or a user connects an
account. The agent can choose among the tools it has been given, but the available
world was selected in advance.

That is useful, but it is not the full category.

The Agentic Economy begins when an agent can:

1. recognise that it has reached the edge of its present abilities;
2. describe the missing contribution from its working context;
3. discover supply it was not preconfigured to use;
4. choose within delegated constraints;
5. acquire and consume one unit;
6. continue its project;
7. return to the supplier, replace it, or stop when the gap changes.

The agent does not need unlimited autonomy. Human economic actors also operate
inside budgets, mandates, approved categories, and laws. An agent becomes an
economic allocator when it has meaningful discretion over which supplier
receives the next unit of demand.

## From connectors to a market

A connector answers:

> What has already been installed for this agent?

A market answers:

> What available service can provide the missing piece now?

MCPs, APIs, CLIs, computer use, Apify actors, and platform connectors are not
competitors to this market. They are ways of delivering supply. Agentic Economy
does not need to replace them. It gives an agent a wider field of services to
discover and use through them.

The distinction is selection.

- If the provider was permanently chosen by the harness and the agent only fills
  in parameters, the agent is routing.
- If the agent can find, choose, reuse, and replace suppliers within its delegated
  authority, the agent is allocating demand.

Preinstalled connectors will remain preferable for predictable, frequent, or
tightly controlled work. Runtime discovery matters when needs are unexpected,
fragmented, specialised, regional, temporary, or too numerous for one harness to
integrate in advance.

Both will coexist.

## The market loop

The loop is simple:

1. An agent reaches a capability boundary.
2. It looks for an outside service.
3. A supplier provides the missing unit.
4. The agent incorporates the unit and continues.
5. Similar gaps create more calls.
6. Useful suppliers receive more demand.
7. Suppliers improve, specialise, reprice, or create new services for agents.

No supplier needs to observe the final project outcome. The immediate result is
enough for the consuming agent to decide whether to continue, repair, retry,
switch, or return later.

The signals can remain local and ordinary:

- Did the result contain what the agent needed?
- Could the agent use it immediately?
- Did it make the next step possible?
- Was another provider required?
- Did the agent return when the gap appeared again?

Calls and repeat use direct demand. They are not a universal measure of truth or
quality; they are the consuming agent’s allocation behaviour.

## What transfers from ad creative

Advertising provides the clearest mature example of repeated allocation across
bounded supply.

| Ad-creative market              | Agentic Economy                                           |
| ------------------------------- | --------------------------------------------------------- |
| Media buyer                     | Consuming agent                                           |
| Creator or creative supplier    | Service provider, specialist, platform, or agent business |
| Creative                        | Returned unit used by the agent                           |
| Creative delivery               | Invocation                                                |
| Test and continued allocation   | Initial use and repeat calls                              |
| Creative replacement            | Switching when the current supplier stops fitting         |
| Creators following media demand | Suppliers building where agents direct calls and money    |

The analogy stops there. An agent-service unit is consumed inside the agent’s
project rather than shown to an advertising audience. Different services will
also have different immediate measures of usefulness.

The transferable behaviour is capital allocation. Supply gathers where active
buyers direct demand, and suppliers learn what to make by observing what buyers
continue to use.

## The supply of an Agentic Economy

The market is not restricted to “tools.” Its supply may include:

- an API returning live or proprietary information;
- an MCP server exposing an existing application;
- an Apify actor performing one extraction;
- a platform exposing inventory and fulfilment;
- a specialist model performing one analysis;
- an AI-native service company completing a bounded piece of work;
- a human expert responding through an agent-ready service;
- physical machinery or compute available for one run;
- another agent with a specialised capability.

These suppliers do not need the same internal structure. They need only offer
something a consuming agent can find, acquire, and use as part of its own work.

This makes the category larger than an API directory and smaller than a market
for entire business outcomes. It is a market for outside contributions to agent
work, purchased at the level appropriate to the service.

## What the emerging evidence supports

Y Combinator now explicitly asks founders to build software for agents as
first-class customers: machine-readable services that agents can discover, sign
up for, and use programmatically without human configuration. YC separately
expects AI-native companies to sell completed services rather than merely sell
tools. Those positions support both sides of this market: agents becoming buyers
and service companies becoming supply. [YC Requests for Startups](https://www.ycombinator.com/rfs.html)

Andreessen Horowitz’s MCP analysis describes agents choosing, ordering, and
combining tools, while identifying the present limitation directly: discovering
and configuring MCP servers remains manual, and dynamic discovery is a proposed
next phase. [a16z, _A Deep Dive Into MCP and the Future of AI
Tooling_](https://a16z.com/a-deep-dive-into-mcp-and-the-future-of-ai-tooling/)

YC and a16z also postulate agents with bounded spending power, including
machine-to-machine payments for data, compute, and API calls. These are important
directional claims, but not evidence that a neutral service market already
exists. [YC x Coinbase RFS](https://www.ycombinator.com/blog/build-onchain%26quot),
[a16z, _How Will My Agent Pay for Things?_](https://a16z.com/newsletter/agent-payments-stack/),
[a16z, _Big Ideas 2026_](https://a16z.com/newsletter/big-ideas-2026-part-3/)

The evidence therefore supports the direction, not the market outcome.

It makes one assumption substantially more credible: suppliers will increasingly
design software and services for agents as customers.

It leaves the decisive assumption unproven: agents will reliably discover
unfamiliar, specialised supply at runtime through an independent market rather
than remain inside preinstalled or platform-owned channels.

## How the category may form

The future is unlikely to have one distribution shape.

- Major platforms will directly supply services near inventory, checkout,
  fulfilment, and repeat consumer behaviour.
- Harnesses will bundle common connectors.
- Enterprises will maintain preferred private supply.
- Suppliers will sell directly where relationships justify it.
- Open markets can aggregate fragmented, specialised, regional, temporary, and
  cross-harness supply.

Agentic Economy does not require every service call to enter an open market. It
requires a meaningful class of capability gaps for which runtime choice is more
useful than permanent preselection.

The neutral opportunity is strongest where no platform can economically bundle
the complete supply surface: long-tail data, regional services, specialist
actions, niche machinery, temporary compute, obscure formats, professional
micro-work, and capabilities that appear faster than harnesses can integrate
them.

## What this means for Agentic Economy

The current product boundary is directionally correct. Consuming agents own
their projects and orchestration. Suppliers host their own implementations.
Agentic Economy exposes exact callable Operations through a shared market.

In the last-mile frame:

| Current product element          | Meaning to the consuming agent                             |
| -------------------------------- | ---------------------------------------------------------- |
| Agent Service / Market Operation | One outside service available when the agent reaches a gap |
| Capability                       | What the supplier can add to the agent’s reach             |
| Operation                        | The exact contribution the agent can choose and invoke     |
| Invocation                       | One acquired execution against the current need            |
| Result                           | The returned unit that lets the agent continue             |
| HTTP, MCP, CLI, and web          | Different entrances to the same service supply             |

The product should make the following ordinary behaviour possible:

> The agent cannot complete its next step with what it has. It looks for an
> outside service, finds one that fits, acquires one use, consumes the result, and
> continues.

Agentic Economy does not need to own the agent, become the harness, or accept
responsibility for the larger project. Its role is to make more of the world’s
useful services available to agents when they need them.

## What must be proven

The category thesis becomes real when these behaviours occur outside a seeded
demo:

1. Agents encounter valuable gaps their installed capabilities cannot close.
2. They recognise those gaps instead of fabricating an answer or stopping.
3. They can describe the missing contribution precisely enough to find useful
   supply.
4. Runtime discovery costs less than the missing unit is worth.
5. One invocation returns something the agent can use immediately.
6. Agents receive enough delegated discretion to choose among providers.
7. Similar gaps create repeat calls and switching behaviour.
8. Suppliers receive incremental demand and change what they offer in response.
9. The second use still passes through the market rather than bypassing it.
10. The behaviour occurs across more than one agent or harness.

The hardest problem is not payment or invocation. It is matching a live,
contextual capability gap to specialised supply at the moment the agent needs it.

If that matching works, Agentic Economy can become a market.

If it does not, the world remains a richer collection of connectors.

## The immediate pressure on the product

The product should now be judged by whether it increases an agent’s reach, not by
how complete its marketplace machinery appears.

The decisive demonstrations are:

- an agent recognises an unanticipated capability boundary;
- it discovers a supplier it was not configured to use;
- it spends real delegated value on one bounded contribution;
- the result lets it continue;
- it returns to the market when a comparable gap appears;
- the supplier receives demand it would not otherwise have received.

That is the point at which the market stops being a catalogue and begins becoming
an economy.
