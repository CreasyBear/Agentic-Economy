# Phase 3B: Second-provider plug-in test — Context

**Gathered:** 2026-07-20
**Status:** Ready for planning review
**Source:** Phase 3A retrospective plus live source inspection

## Phase boundary

Add one second labelled mock provider for the same exact BTC/USD operation and
prove that it plugs into the existing paid-operation product seam. This is a
conformance falsifier, not a second provider product, comparison experience or
fallback system.

## Locked decisions

### Product

- The recognizable operation remains “Get the latest BTC price in USD.”
- Provider selection is explicit and occurs before authority. It may be
  expressed through development composition; Phase 3B does not add a customer
  provider picker.
- Provider B uses a distinct provider identity, endpoint, operation revision,
  payment recipient and raw response shape.
- Both providers remain labelled local mock fixtures priced at exactly one US
  cent. No real supply or settlement claim follows.

### Architecture

- `agentic-paid-operation:v1`, its host commands and the query-agnostic card
  are frozen.
- Provider-specific publication, transport mapping, raw output validation,
  normalization and provenance stay in capability-supply operation ownership.
- `BtcUsdQuoteResult` becomes provider-attributable without learning a
  provider-specific raw payload.
- Provider A uncertainty can never invoke Provider B. Switching providers is a
  new invocation and authority boundary.

### Operating model

- The parent owns planning authority, protected-file arbitration, integration,
  evidence generation and completion claims.
- Implementation children receive exact owned paths, forbidden paths,
  commands, falsifiers and stop conditions.
- Working-tree demonstrations may run during implementation. Official evidence
  runs once, after source and active documentation are frozen.
- Browser work is regression-only unless shared visible semantics change.

## Source findings

- `PublishedOperation` already binds provider, publication, binding, endpoint,
  payment and material digests.
- `createDynamicPublishedActionInvocationAdapter` already receives the selected
  `PublishedOperation`; selection can therefore remain composition-time input.
- `agentic-paid-operation:v1` already carries provider identity and generic
  result blocks.
- `btc-usd-quote-result.ts` currently hard-types Provider A’s source identity.
  That operation-owned coupling is the expected Phase 3B refactor.
- The current development evidence builder combines Provider A source material,
  result schema and verification. Phase 3B must separate reusable conformance
  assertions from provider-owned fixtures without creating a generic provider
  lifecycle.

## Canonical references

- `.planning/adr/ADR-020-product-projection-of-delegated-work.md`
- `.planning/phases/03-protocol-kernel-product-conversion/03-SUMMARY.md`
- `.planning/phases/03-protocol-kernel-product-conversion/03-UI-SPEC.md`
- `src/modules/capability-supply/published-operation.ts`
- `src/modules/capability-supply/btc-usd-quote-result.ts`
- `src/modules/capability-supply/development-published-operation-evidence.ts`
- `src/modules/action-invocation/dynamic-published-adapter.ts`
- `src/modules/action-invocation/paid-operation-semantics.ts`

## Scope fence

If Provider B requires a new paid-operation schema version, host command,
lifecycle state, renderer branch, retry rule or public surface, the child stops.
The parent records the abstraction failure and decides whether to repair Phase
3A or narrow Phase 3B. The child does not improvise a general multi-provider
framework.
