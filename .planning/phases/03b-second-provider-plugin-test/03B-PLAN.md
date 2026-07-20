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

These files are frozen after the parent-owned Wave 0. A later child must stop
if a failing conformance test appears to require editing one:

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

Before dispatch, the parent runs:

```text
test -x node_modules/.bin/vitest
test -x node_modules/.bin/tsx
test -x node_modules/.bin/playwright
```

Children do not install or acquire packages. A missing binary returns
`BLOCKED_DEPENDENCIES_NOT_PROVISIONED`.

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

The decimal string must be parsed strictly into a finite positive number.
Whitespace, exponent notation, non-decimal strings, zero, negatives, infinity,
wrong pair and malformed/future timestamps refuse normalization.

## Wave 0 — Close the restore-binding gap

Owner: parent only.

Source review found that `paymentAttemptsValid` currently rebinds restored rows
to invocation, operation key, payment identifier, endpoint and operation
revision, but not to the selected operation's payee, amount, scheme, network,
asset or the externally anchored challenge digest.

Owned paths:

- `src/modules/action-invocation/dynamic-published-snapshot-verifier.ts`;
- `tests/unit/action-invocation/dynamic-published-operation.test.ts`.

Add failing snapshot tamper cases for `payTo`, `amount`, `scheme`, `network`,
`asset` and `challengeDigest`. Then make the verifier derive the expected x402
terms from the selected operation's admitted transport, exact price and
snapshot anchors. Every mutation must refuse before custody lookup, signing,
send or state mutation.

Focused command:

```text
npm run test -- tests/unit/action-invocation/dynamic-published-operation.test.ts
```

End condition: all six tamper cases refuse and the existing Phase 3A snapshot,
restore, reconciliation and cold-process cases remain green. The parent commits
this prerequisite, records the new exact base, and freezes both files again.

## Wave 1 — Write the differential conformance harness first

Owner:

- `tests/unit/capability-supply/published-operation-provider-conformance.test.ts`;
- `tests/unit/capability-supply/btc-usd-quote-result.test.ts`.

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

Wave 1 proceeds in two recorded steps:

1. Run the existing Provider A baseline. Any failure stops as a Phase 3A
   regression.
2. Add the table-driven test against the exact Wave 2 filenames and exports.
   Its only permitted initial failure is a missing Provider B export or
   Provider A's closed `BtcUsdQuoteResult.source` type.

No `.todo`, skipped case, weakened assertion or provider-conditional expected
result may be committed.

Acceptance:

- Provider A passes the extracted conformance cases unchanged.
- Provider B failures name missing provider-owned artifacts.
- No frozen file is edited.

Focused command:

```text
npm run test -- tests/unit/capability-supply/published-operation-provider-conformance.test.ts tests/unit/capability-supply/btc-usd-quote-result.test.ts
```

## Wave 2 — Add Provider B in operation ownership

Owner:

- `src/modules/capability-supply/btc-usd-quote-result.ts`;
- `src/modules/capability-supply/development-alternate-btc-usd-quote-result.ts`;
- `src/modules/capability-supply/development-alternate-published-operation-evidence.ts`;
- `src/modules/capability-supply/public.ts`.

Wave 1 tests are read-only to this instance.

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

Focused command:

```text
npm run test -- tests/unit/capability-supply/published-operation-provider-conformance.test.ts tests/unit/capability-supply/btc-usd-quote-result.test.ts
```

## Wave 3 — Prove explicit selection and non-fallback end to end

Owner:

- `src/modules/capability-supply/development-provider-conformance-scenario.ts`;
- `tests/unit/action-invocation/paid-operation-provider-selection.test.ts`.

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

The test records `{ authorizations, signatures, sends }` separately for A and
B. Every refused cross-provider command must leave both snapshot digests and
all counters unchanged. An explicit switch must produce pairwise-different
`invocationRef`, `authorityRef`, `paymentIdentifier` and
`(attemptRef, effectGeneration)` lineage.

Mandatory cases:

- duplicate authority click from one prepared version;
- concurrent A and B preparation with crossed continuations;
- stale expected version after the other provider advances;
- complete operation substitution and payee-only snapshot tampering;
- forced payment-identifier collision across providers;
- A reconciliation evidence replayed against B;
- A exact `not_settled`, followed by explicit B selection;
- A settled with an invalid result, followed by explicit B selection;
- A and B raw payloads crossed into the other projector.

The same application-service calls must drive both cases. Tests may parameterize
provider material; production hosts may not switch on provider ID.

Acceptance:

- No frozen shared file changes.
- Provider-specific variation is confined to capability-supply and development
  composition.
- Existing Phase 3A browser suite remains green without new UI.

Focused command:

```text
npm run test -- tests/unit/action-invocation/paid-operation-provider-selection.test.ts tests/unit/action-invocation/paid-operation-projection.test.ts tests/unit/action-invocation/paid-operation-application-service.test.ts
```

## Wave 4 — Implement evidence tooling before freeze

Owner:

- `tools/dev/phase-3b-provider-conformance-evidence.ts`;
- `tools/dev/verify-phase-3b-provider-conformance-evidence.ts`;
- `tests/unit/capability-supply/provider-conformance-evidence.test.ts`.

The packet builder embeds both provider source fixtures, normalized outputs,
semantic schema identities, per-provider effect counters, switch identities
and every non-fallback case. The verifier independently rebuilds the two
operations, normalizes both raw payloads, recomputes digests and counters, and
rejects advertised claims that disagree with reconstruction.

This wave generates only temporary working-tree packets. It must prove that
tampered provider identity, raw evidence, schema, effect counter, switch
identity or non-fallback result is rejected.

Focused command:

```text
npm run test -- tests/unit/capability-supply/provider-conformance-evidence.test.ts
node --import tsx tools/dev/phase-3b-provider-conformance-evidence.ts run /tmp/phase-3b-working.json HEAD
node --import tsx tools/dev/verify-phase-3b-provider-conformance-evidence.ts /tmp/phase-3b-working.json HEAD
```

End condition: builder and verifier are integrated before the source freeze.
No official packet exists yet.

## Wave 5 — Official evidence and closeout

Parent only after Waves 1–3 integrate.

Run one clean detached-checkout proof at the final integrated revision:

```text
npm run test -- tests/unit/capability-supply/published-operation-provider-conformance.test.ts
npm run test -- tests/unit/capability-supply/btc-usd-quote-result.test.ts
npm run test -- tests/unit/action-invocation/paid-operation-provider-selection.test.ts
npm run test -- tests/unit/action-invocation/paid-operation-application-service.test.ts
npm run test -- tests/unit/action-invocation/paid-operation-projection.test.ts
npm run test:e2e:paid-operation
npm run test:ui-contract
git diff --check
```

After source, tests, tools and active documentation are committed, freeze the
revision. Generate exactly one official packet in a clean detached checkout:

```text
node --import tsx tools/dev/phase-3b-provider-conformance-evidence.ts run /tmp/phase-3b-provider-conformance.json <final-revision>
node --import tsx tools/dev/verify-phase-3b-provider-conformance-evidence.ts /tmp/phase-3b-provider-conformance.json <final-revision>
```

Any later source, test, tool or active-document edit invalidates it and requires
one replacement official run.

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

The exact dispatch roster is
`.planning/phases/03b-second-provider-plugin-test/03B-INSTANCE-CONTRACTS.md`.

## Requirement execution map

| Requirement | Owner | Primary executable proof | Stop condition |
| --- | --- | --- | --- |
| P3B-R1 | Wave 2 | provider conformance test | provider payload reaches a host |
| P3B-R2 | Wave 3 | provider selection test | selection needs a host command |
| P3B-R3 | Wave 3 | identical command/projection assertions | frozen shared file must change |
| P3B-R4 | Wave 2 | crossed-schema normalization cases | shared result needs provider fields |
| P3B-R5 | Wave 3 | per-provider zero-activity counters | any automatic B activity appears |
| P3B-R6 | Wave 3 | pairwise consequence-identity inequality | A identity must be reused |
| P3B-R7 | Waves 0 and 3 | tamper/restore/dedupe cases | snapshot format must change |
| P3B-R8 | Waves 1 and 3 | same table and host sequence for A/B | provider branch enters harness |
| P3B-R9 | Waves 4 and 5 | recomputed clean packet plus review | dirty/mismatched revision or P0/P1 |

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
