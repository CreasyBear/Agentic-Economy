---
phase: 03B-second-provider-plugin-test
plan: 01
type: implementation
wave: 1
depends_on:
  - Phase 3A at eec9131c
files_modified:
  - src/modules/capability-supply
  - tests/unit/capability-supply
  - tests/unit/action-invocation
  - tools/dev
autonomous: false
requirements:
  - P3B-R1
  - P3B-R2
  - P3B-R3
  - P3B-R4
  - P3B-R5
  - P3B-R6
  - P3B-R7
  - P3B-R8
  - P3B-R9
---

# Phase 3B — Second-provider plug-in test

## Objective

Falsify or confirm the Phase 3A provider seam by adding one second labelled
mock BTC/USD provider without changing the shared paid-operation workflow,
semantic schema or renderer.

## Change budget and protected seams

Expected implementation blast radius is no more than 14 owned source/test/tool
files and approximately 1,500 net new lines. Crossing either threshold is a
review trigger, not an invitation to compress code.

These files are frozen. A child must stop if a failing conformance test appears
to require editing one:

- `src/modules/action-invocation/paid-operation-semantics.ts`
- `src/modules/action-invocation/paid-operation-application-service.ts`
- `src/modules/action-invocation/host-projection.ts`
- `src/modules/action-invocation/dynamic-published-adapter.ts`
- `src/components/ae/action-invocation/AePaidOperationCard.tsx`
- `tools/dev/paid-operation-surface-host.tsx`
- Action Invocation snapshot or payment-attempt formats

The parent may authorize a narrow shared fix only after recording the exact
Provider A assumption exposed, affected invariant and why provider-owned code
cannot contain it.

## Provider B fixture

Provider B is a labelled local mock with:

- provider ID `mock:business:alternate-quote-api`;
- operation ID `btc-usd.spot`;
- operation revision `3`;
- `GET https://alternate-provider.example/v1/spot`;
- query mapping `symbol → base`, `convert → quote`;
- exact `$0.01 USD` price;
- the existing x402 transport on the same mock network and asset;
- distinct payee `0xmock-alternate-recipient`;
- raw response:

```json
{
  "spot": {
    "base": "BTC",
    "quote": "USD",
    "amount": "118245.12",
    "observed_at": "2026-07-20T08:04:00.000Z"
  }
}
```

The decimal string must be parsed strictly into a finite positive safe number.
Whitespace, exponent notation, non-decimal strings, zero, negatives, infinity,
wrong pair and malformed/future timestamps refuse normalization.

## Wave 1 — Write the differential conformance harness first

Owner: tests and development-only conformance helpers.

Create a provider case contract containing only:

- selected `PublishedOperation`;
- exact material input;
- raw success payload;
- operation-owned normalizer and presenter;
- expected provider identity, endpoint, payee and normalized result.

Run the same table-driven cases against Provider A and Provider B:

1. materialization and exact input acceptance;
2. successful paid invocation and normalized BTC/USD result;
3. pre-release refusal;
4. possible paid submission exposes reconciliation only;
5. exact not-settled reconciliation;
6. settled payment with invalid result;
7. snapshot restoration and duplicate delivery;
8. provider-specific tampering;
9. Provider A uncertainty leaves all Provider B counters at zero.

The first Wave 1 run is expected to fail only because Provider B does not yet
exist or because Provider A’s result source type is closed. Any failure in
shared command truth is a Phase 3A regression and stops the wave.

Acceptance:

- Provider A passes the extracted conformance cases unchanged.
- Provider B failures name missing provider-owned artifacts.
- No frozen file is edited.

Focused command:

```text
npm exec -- vitest run tests/unit/capability-supply/published-operation-provider-conformance.test.ts tests/unit/capability-supply/btc-usd-quote-result.test.ts
```

## Wave 2 — Add Provider B in operation ownership

Owner:

- `src/modules/capability-supply/btc-usd-quote-result.ts`;
- new Provider B publication/evidence fixture;
- new Provider B result-adapter tests;
- capability-supply public exports strictly required by tests/tools.

Implementation:

- Generalize only `BtcUsdQuoteResult.source` from Provider A literals to an
  attributable provider/operation/revision value.
- Keep Provider A’s strict raw schema and add a separate strict Provider B raw
  schema/projector.
- Reuse the common BTC/USD normalized result and generic presentation function.
- Build Provider B publication, offering, binding, readiness and x402 material
  from source-owned fixture data.
- Rebuild and tamper-check both provider packets independently.

Acceptance:

- Both raw shapes normalize to the same result contract.
- Result and presentation retain the selected provider identity.
- Provider A public behavior and existing tests remain unchanged.
- No provider switch, registry framework or host branch is introduced.

## Wave 3 — Prove explicit selection and non-fallback end to end

Owner: development-only Phase 3B scenario runner and focused integration tests.

Construct each invocation with one selected `PublishedOperation`. Prove:

- selection occurs before `prepare`;
- the authority target, payment attempt, endpoint and result all match the
  selected operation material digest;
- A and B successes use identical host commands and
  `agentic-paid-operation:v1`;
- rich and structured projections agree for each provider;
- A uncertainty yields zero B authorizations, signatures and sends;
- choosing B later starts a new invocation with a new authority reference,
  payment identifier and effect generation lineage;
- snapshots restore the selected operation and reject substitution.

The same application-service calls must drive both cases. Tests may parameterize
provider material; production hosts may not switch on provider ID.

Acceptance:

- No frozen shared file changes.
- Provider-specific variation is confined to capability-supply and development
  composition.
- Existing Phase 3A browser suite remains green without new UI.

## Wave 4 — Evidence and closeout

Parent only after Waves 1–3 integrate.

Run one clean detached-checkout proof at the final integrated revision:

```text
npm exec -- vitest run tests/unit/capability-supply/published-operation-provider-conformance.test.ts
npm exec -- vitest run tests/unit/capability-supply/btc-usd-quote-result.test.ts
npm exec -- vitest run tests/unit/action-invocation/paid-operation-application-service.test.ts
npm exec -- vitest run tests/unit/action-invocation/paid-operation-projection.test.ts
npm run test:e2e:paid-operation
npm run test:ui-contract
git diff --check
```

Generate one Phase 3B conformance packet that embeds both independently rebuilt
provider fixtures, per-provider normalized outputs, shared schema versions,
effect counters and the non-fallback scenario. Its verifier must recompute each
claim; it may not trust advertised booleans.

An independent reviewer checks the final diff against P3B-R1–R9. R9 closes only
if no unresolved P0/P1 exists within the labelled local/mock boundary.

## Instance operating contract

Every implementation instance receives:

- exact base revision;
- owned paths;
- frozen and protected paths;
- required initial failing test;
- focused commands;
- observable outcome;
- evidence ceiling;
- change-budget trigger;
- stop conditions.

Every handoff returns:

- base and resulting revision;
- changed paths;
- commands and exact results;
- provider cases demonstrated;
- frozen-file diff result;
- remaining findings by severity;
- evidence class and claim ceiling;
- earliest blocker and next safe action.

Instances do not edit planning authority, commit completion claims, generate
official packets, add public routes, touch Convex or “helpfully” generalize
multi-provider behavior.

## Must-haves

### Truths

- Provider A and B run through the same host command sequence and semantic
  schema.
- The selected provider is exact before authority and remains attributable
  through payment, result and restoration.
- Provider A uncertainty produces zero Provider B consequential activity.
- Switching providers creates a new consequence boundary.
- Both raw payloads normalize to one operation-owned BTC/USD result contract.

### Prohibitions

- No automatic fallback or provider ranking.
- No provider-specific branch in shared hosts, semantics or renderer.
- No new paid-operation lifecycle state or snapshot version.
- No new public, hosted, Convex or real-payment surface.
- No official evidence before the final integrated revision is frozen.

## Artifacts this phase produces

- Provider B source-owned publication/evidence builder.
- Provider B strict BTC/USD raw-result projector.
- Provider-neutral `BtcUsdQuoteResult.source`.
- Two-provider conformance case contract and tests.
- Development-only explicit-selection/non-fallback scenario.
- Phase 3B clean conformance packet and independent verifier.
