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
3. Compare human copy, action `summary` and `boundaries`, agent JSON, discovery
   output, metadata, and refusal behavior that describe the same operation.
4. Run `npm run test:copy`; add `npm run test:seo` for discovery, metadata,
   `llms.txt`, sitemap, robots, or structured-data changes. Inspect the actual
   rendered or serialized output because a string scan is not readback proof.

The loop is complete only when every changed public and assistant-visible
projection agrees, every claim has matching evidence at that surface, and the
earliest unproven boundary is explicit.

## Current safe language

AE currently lets people and assistants read, compare, summarize, and see a
supported next step. `inquiry.submit` may send a qualified inquiry when the
listing publishes that action. It does not prove booking, charging, payment,
dispatch, availability, autonomous fulfilment, provider quality, or outcome
validity.

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

Action summaries state read/write scope; `boundaries` state approval,
unsupported effects, failure behavior, and fallback. Registration or a business
page is discovery inventory, not proof of routeable supply.
