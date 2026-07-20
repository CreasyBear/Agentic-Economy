---
phase: 03B-second-provider-plugin-test
status: complete
evidence_boundary: labelled-local-mock
updated: 2026-07-20
---

# Phase 3B — Second-provider plug-in test summary

## Decision

The Phase 3A paid-operation seam is provider-pluggable at the labelled local
mock boundary. A second BTC/USD provider can be selected before authority and
run through the unchanged application service, `agentic-paid-operation:v1`
semantics and query-agnostic renderer.

This is not a multi-provider product. There is no ranking, comparison or
automatic fallback. Selecting another provider creates a new invocation,
authority, payment identifier and attempt/effect lineage.

## Source outcome

- Restore validation now rebinds exact x402 scheme, network, asset, payee,
  amount and challenge material.
- Provider B owns its publication, endpoint, query mapping, payment recipient,
  raw schema and strict decimal-string normalization.
- Provider A and B raw payloads cannot cross-parse; normalized results retain
  attributable provider and operation revision.
- Live selection scenarios prove zero Provider B activity during Provider A
  uncertainty and refuse crossed commands, reconciliation evidence, snapshot
  substitution, payee tampering and payment-identifier collision.
- Evidence packets contain JSON-safe material only. The verifier rebuilds the
  two providers and recomputes normalization, identities, counters,
  dispositions, provenance and checksum.

## Execution ledger

| Revision | Outcome |
| --- | --- |
| `bb137a9c` | Bound restored payment rows to exact selected x402 material. |
| `3374af7b` | Added the two-provider conformance RED. |
| `aff61f34` | Repaired tamper cloning without cloning runtime functions. |
| `25c922b7` | Added Provider B fixture, evidence and normalization. |
| `5bb4a9eb` | Proved explicit selection and non-fallback with live seams. |
| `95a72c24` | Added recomputed Phase 3B evidence tooling. |
| `db7a8552` | Made dirty-checkout refusal deterministic after independent review. |

The final documentation commit is the clean evidence revision. The official
packet is generated once from that exact detached revision and is kept
out-of-tree; any later source, test, tool or active-document edit invalidates
it.

## Claim ceiling

Completion proves local mock provider conformance, explicit selection,
non-fallback behavior, consequence separation and evidence mechanics. It does
not prove a hosted route, real payment or settlement, independently operated
provider fulfilment, production safety, customer demand or customer value.
