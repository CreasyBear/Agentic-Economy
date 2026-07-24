---
name: ae-public-copy-guardrails
description: Use for public human copy, assistant-visible action descriptors, discovery files, metadata, and machine-readable AE claims. Keep wording aligned with current source, intended-surface readback, and the safe action boundary.
---

# AE public copy

Read the current-state, brand, product-rule, and banned-framing sections of
`PRODUCT.md`, plus the copy rules in `AGENTS.md`. Inspect the implementation and
the emitted human or machine surface before writing. Target requirements are not
public feature claims.

## Loop

1. Identify the audience, intended surface, operation, and strongest available
   evidence: source/local, sandbox/dev, hosted readback, provider fulfilment, or
   customer value.
2. Write the current action in ordinary nouns and verbs. Lead with the person's
   need or useful next step; state a limitation once where it changes the
   decision.
   State responsibility positively: who confirms, commits, pays, acts, or owns
   the next step. Do not make incapability the page headline or repeat a
   disclaimer across answer, card, composer, and footer.
3. Compare human copy, action `summary` and `boundaries`, agent JSON, discovery
   output, metadata, and refusal behavior that describe the same operation.
4. Run `npm run test:copy`; add `npm run test:seo` for discovery, metadata,
   `llms.txt`, sitemap, robots, or structured-data changes. Inspect the actual
   rendered or serialized output because a string scan is not readback proof.

The loop is complete only when every changed public and assistant-visible
projection agrees, every claim has matching evidence at that surface, and the
earliest unproven boundary is explicit.

## Product and evidence language

State AE's destination confidently: it decomposes objectives into useful tasks
and composes those tasks into completed outcomes. Horizontal capabilities recur
across domains; verticals supply domain meaning, providers, risks, and evidence.

State current reachability only where it affects the action in front of the
person. On today's public discovery surface, lead with reading, comparing, and
the supported next action. For inquiry, say the business reviews the request and
confirms timing, price, availability, and the work.

Do not enforce truth with a mandatory negative slogan such as “AE does not
book.” A copy gate must detect action overclaims and require a clear
responsibility boundary. It must not require defensive wording.

Use `verified` only with a named current standard and its evidence reference;
otherwise use `checked`, `supplied`, `published`, `last checked`, or `needs
confirmation`.

Keep these internal terms out of public human copy: `source-owned`, `readback`,
`manifest`, `capability`, `gateway`, `operator`, `MCP`, `OpenAPI`, `callable`,
`autonomous`, `agent-native`, `DTO`, and `fixture`. Builder and protected
diagnostic surfaces may use precise technical language when it is necessary and
does not imply unsupported availability.

`KNOWN`, `UNKNOWN`, `UNAVAILABLE`, and `NEXT_STEP` are reserved for JSON,
`llms.txt`, agent payloads, and owner/admin surfaces. Human pages communicate
the same honesty in ordinary language.

Action summaries state the observable result. `boundaries` state responsibility,
approval, unsupported effects, failure behavior, and fallback once, at the
decision point. Registration or a business page is discovery inventory, not
proof of routeable supply.
