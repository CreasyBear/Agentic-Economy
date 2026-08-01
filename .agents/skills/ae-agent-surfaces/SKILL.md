---
name: ae-agent-surfaces
description: Audit or change AE machine-readable surfaces, registered action descriptors, Customer Request APIs, public catalogs, assistant setup, and navigation.
---

# AE agent surfaces

> **North star:** Tell your AI what you need. It finds the right business, compares real options, gets your approval, and moves the work through to completion. Businesses publish what they do once, then earn whenever agents bring them work.

**Hierarchy:** ambition → customer promise → executable journey → hidden controls → proof.

## Trace the live projection

Read `.planning/PROJECT.md`, `UBIQUITOUS_LANGUAGE.md`, relevant ADRs, live
source, and focused tests. If an optional `AGENTS.md` exists, consult it.
Classify the surface as public discovery, qualified inquiry, authenticated
Customer Request, or owner/internal. Name its source owner, caller identity,
authority boundary, effects, and evidence class. A route or registry entry is
not by itself customer-reachable supply.

Current machine surfaces include `/SKILL.md`, `/llms.txt`, public business
catalog/search/detail, `/{slug}/ucp` AE-hosted discovery, and
`/api/v1/requests/schema` → `POST /api/v1/requests` → only the latest returned
`navigation.actions`. Registered actions live in `src/modules/*/*.actions.ts`
and the explicit registry. `agentJson` marks exposure; it is not a generic
invocation route.

## One source-owned contract

Put business meaning in the existing action or Customer Request seam and keep
HTTP/host adapters thin. Register actions explicitly and expose only surfaces
with real adapters. Descriptors must state exact inputs, outputs, effects,
authority, uncertainty, evidence, replay, and recovery. Machine docs may use
exact technical terms and routes where live source supports them; human
projections use customer language and hide protocol machinery.

Return the next permissible Customer Request transition through
`navigation.actions`. Callers must not construct later paths, businesses,
prices, recipients, effects, or authority. Bind writes to an authenticated
principal, exact reviewed input/revision, bounded authority, and stable
idempotency identity. An agent signature is attribution, not customer
authority. Hosts project state; they do not recompute business rules.

## Direct proof

Run the smallest focused route/action check and inspect the actual response.
When a changed path has a material refusal, interruption, uncertainty, or
recovery state, exercise it through the real seam with labelled fixture or
sandbox data. Add UI, SEO, import, or development journey checks only when the
change crosses that boundary. Tests assert exact schema/navigation, private
field exclusion, semantic effects, refusal, and safe continuation—not stale
phrase locks. Local or sandbox proof does not establish deployment, supply,
fulfilment, or customer value.
