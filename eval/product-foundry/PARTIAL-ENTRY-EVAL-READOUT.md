# Partial Entry Eval Readout

Status: source-bound eval, not customer evidence<br>
Date: 2026-07-17<br>
Decision supported: whether AE can expose independently useful network
capabilities without owning the caller's complete lifecycle

## Executive result

The current engine is internally compositional but externally Request-owned.
Only public business discovery passes the partial-entry test. Five later entry
cases cannot accept state created outside AE and return the requested bounded
economic result.

| Entry case | Result | Adjacent AE machinery | Actual obstruction |
|---|---|---|---|
| Find published businesses | Independent current operation | Registry search and detail | None within the published-fact boundary |
| Qualify named businesses | Not addressable | Inquiry and Request interpretation | No structured requirement plus caller-supplied candidate-set input |
| Quote caller-supplied candidates | Not addressable | Request option preparation and provider quote adapters | Preparation owns candidate selection and requires Request lineage |
| Commit an external proposal | Not addressable | Route confirmation | Confirmation only accepts an AE-generated current route |
| Inspect an external commitment | Not addressable | Request resume and evidence export | Inspection only knows AE Request, route, run, and evidence references |
| Recover an external commitment | Not addressable | Request cancellation, problems, and reconciliation | Recovery only knows AE-owned run lineage |

This is stronger than saying that later operations are “available but coupled.”
The adjacent operation often has different semantics. Confirming an AE route is
not obtaining provider acceptance for a proposal supplied by another agent.
Exporting AE run evidence is not inspecting work initiated elsewhere.

## What is reusable

The existing kernel already contains much of the difficult neutral machinery:
registered contracts and bindings, candidate readiness, action composition,
dependency mapping, route quotes, bounded authority, idempotency, provider
effects, evidence, cancellation, reconciliation, and replay.

The missing seam is a portable invocation contract:

`caller-owned entry state → one declared economic operation → AE trust envelope
→ attributable result → portable exit state`

The trust envelope cannot be discarded. A partial operation still needs:

- the contract and operation being invoked;
- attributable facts and their freshness;
- the provider or candidate scope selected by the caller;
- data, spend, and external-effect authority;
- idempotency and prior-attempt references;
- expected result and evidence semantics;
- timeout, uncertainty, cancellation, and reconciliation behavior.

Whether that envelope can be compiled into the current Request machinery
without making Request the public interface is the next architectural
falsification. This eval does not authorize a new interface or kernel change.

## Next eval

Define eval-only invocation envelopes for:

1. qualify a supplied candidate set;
2. request quotes from supplied candidates;
3. inspect or recover a supplied external commitment.

Attempt to compile each envelope into existing contracts, Request actions,
authority, evidence, and recovery machinery. Record every field that requires a
new kernel concept versus a new interface or adapter. The desired result is a
second shallow entry seam over the same deep neutral modules, not a parallel
execution system.
