# ADR-020 Phase 3A scope

**Status:** implementation authorized
**Owner:** Founder
**Phase:** 03-protocol-kernel-product-conversion

## Decision supported

Can AE safely perform and explain one exact paid unit operation through human
and agent hosts without duplicate payment or protocol theatre?

## In scope

- one standalone `approve_each` BTC/USD operation;
- one allowlisted mock provider revision and exact $0.01 USD ceiling;
- durable payment preparation and possible-submission custody;
- separate query, payment, settlement and quote truth;
- operation-owned normalized BTC/USD result;
- shared `agentic-paid-operation:v1` semantics;
- compact human and typed structured-agent projections;
- uncertainty, attributable reconciliation, duplicate delivery and restore;
- persistent local/mock provenance;
- focused accessibility and comprehension evals.

## Exposure kill rules

Stop if any path:

- signs or dispatches again before exact reconciliation permits it;
- represents possible paid submission as ordinary refusal or safe retry;
- claims settlement from an opaque provider header;
- accepts a wrong or malformed BTC/USD result;
- reconstructs state from component, transcript or process memory;
- gives human and agent callers different safe continuations;
- exposes raw payment material; or
- presents fixture execution as independent provider or production evidence.

## Explicitly deferred

Phase 3B owns the second-provider plug-in test. Provider comparison and automatic
fallback remain excluded. Workflows, Activity, mandate dashboards, standing
authority, Full autonomy, public routes, Convex and real payment remain outside
Phase 3A.
