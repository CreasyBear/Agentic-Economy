# 03-03 Credential Custody Decision — #20

**Status:** resolved for source/local Scope 3.
**Date:** 2026-07-04

## Decision

AE models its own protected execution surface as a **customer-owned gateway adapter** internally: Convex remains the authority, source-write admission proves the request came from AE's server, and P4/P6 owner approval records decide whether a one-use action may proceed. This is an internal implementation mapping only; no public surface or agent descriptor uses gateway/protocol vocabulary.

Selected ActionContract posture values:

| Action class | `credentialCustodyStatus` | `enforcementMode` | Why |
|---|---|---|---|
| P4 contact follow-up | `no_mutation_credential` | `customer_gateway_adapter` | The action writes AE-owned inquiry/follow-up source state and does not expose or require a third-party mutation credential. |
| P6 business-action receipt flow, current source/local slug | `no_mutation_credential` | `customer_gateway_adapter` | Current P6 records proposal/checkpoint/evidence/receipt source state. Live provider mutation credentials are not deployed proof and are not claimed. |
| Future provider-backed action, if separately admitted | `gateway_held` or `gateway_resolved_from_vault` | `customer_gateway_adapter` or `provider_gateway` | Only allowed after a dedicated decision records the provider, custody boundary, server-side secret location, and receipt evidence. |

`unsafe_agent_visible`, `agent_has_raw_credential`, and `unknown` are refusal/proof-gap postures for AE-owned writes. A signed agent identity may be recorded for attribution and quota, but it never receives the credential and never performs the verb directly.

## Proof-gap rules

A clearance/action contract must be marked proof-gap/refused when any of these are true:

- the action class has no explicit custody/enforcement mapping;
- a mutation credential is needed but is visible to the agent or only described as `unknown`;
- owner approval evidence is absent, stale, mismatched, or not hash-bound to the source record;
- source-write admission does not match the expected scope/operation/correlation;
- a replay presents the same one-use greenlight/admission after consumption.

## Owner approval evidence

P4 contact follow-up approval is proven by the existing owner decision record, `ownerDecisionHash`, `policyHash`, `canonicalContractHash`, one-use gateway admission hash, source-write admission, and the consumed admission state.

P6 business-action approval is proven by the authorization checkpoint, `ownerDecisionRef`, checkpoint hash, accepted decision, request hash, source-write admission, and receipt reconstruction over AE-owned source state.

## Identity boundary

A valid Web Bot Auth signature answers only: which signer/key presented the request. It grants attribution, quota, and audit context. The verb still requires mandate/scope, owner checkpoint or admission, single-use consumption, source-write admission, and receipt reconstruction.

## Implementation hook

The selected value tuples and Zod schemas live in `src/modules/clearance/internal/clearance-schema.ts`. P4/P6 must consume them through `src/modules/clearance/public.ts` when they are reshaped in the later 03-03 task.

## Boundary

No booking, payment, dispatch, autonomous fulfillment, or deployed provider proof is claimed. This is source/local posture only.
