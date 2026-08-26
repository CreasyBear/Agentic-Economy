import { describe, expect, it } from 'vitest'

import {
  assertSameCallEventAuthority,
  sameCallEventAuthority,
  validCapabilityCallEvent,
  type RecordCapabilityCallEventArgs,
} from '../../convex/capabilitySupplyLists'
import type { Id } from '../../convex/_generated/dataModel'

const validEvent: RecordCapabilityCallEventArgs = {
  eventRef: 'event:valid',
  businessId: 'business:valid' as Id<'businesses'>,
  offeringRef: 'offering:valid',
  publicationRef: 'publication:valid',
  publicationRevision: 1,
  operationRef: 'operation:valid',
  taskDigest: 'sha256:valid',
  eventKind: 'supply_owner_test_observed',
  outcome: 'filled',
  taskStartedAt: 10,
  successfulAt: 20,
  durationMs: 10,
  eligibleDepth: 1,
  observedAt: 20,
  evidenceRefs: ['evidence:valid'],
  environment: 'development',
}

describe('capability call-event invariants', () => {
  it('accepts both a fully measured fill and an explicitly explained zero', () => {
    expect(validCapabilityCallEvent(validEvent)).toBe(true)
    expect(validCapabilityCallEvent({
      ...validEvent,
      eventRef: 'event:zero',
      eventKind: 'supply_liquidity_depth_observed',
      outcome: 'zero',
      zeroReason: 'no_routeable_supply',
      taskStartedAt: undefined,
      successfulAt: undefined,
      durationMs: undefined,
      eligibleDepth: 0,
    })).toBe(true)
  })

  it.each([
    ['blank event ref', { eventRef: ' ' }],
    ['blank offering ref', { offeringRef: ' ' }],
    ['blank task digest', { taskDigest: ' ' }],
    ['fractional observed time', { observedAt: 1.5 }],
    ['negative observed time', { observedAt: -1 }],
    ['negative publication revision', { publicationRevision: -1 }],
    ['negative start time', { taskStartedAt: -1 }],
    ['negative success time', { successfulAt: -1 }],
    ['negative duration', { durationMs: -1 }],
    ['negative depth', { eligibleDepth: -1 }],
    ['missing evidence', { evidenceRefs: [] }],
    ['blank evidence', { evidenceRefs: [' '] }],
    ['zero without reason', { outcome: 'zero', zeroReason: undefined }],
    ['fill with zero reason', { zeroReason: 'outcome_unknown' }],
    ['success before start', { successfulAt: 9 }],
    ['duration without start', { taskStartedAt: undefined }],
    ['duration without success', { successfulAt: undefined }],
    ['duration mismatch', { durationMs: 9 }],
  ] satisfies ReadonlyArray<readonly [string, Partial<RecordCapabilityCallEventArgs>]>)('rejects %s', (_label, patch) => {
    expect(validCapabilityCallEvent({ ...validEvent, ...patch })).toBe(false)
  })

  it('detects any consequence-time canonical authority change', () => {
    const initial = canonicalActor('prn_owner', 'acc_owner', 7)
    expect(sameCallEventAuthority(initial, initial)).toBe(true)
    expect(sameCallEventAuthority(initial, canonicalActor('prn_substituted', 'acc_owner', 7))).toBe(false)
    expect(sameCallEventAuthority(initial, canonicalActor('prn_owner', 'acc_substituted', 7))).toBe(false)
    expect(sameCallEventAuthority(initial, canonicalActor('prn_owner', 'acc_owner', 8))).toBe(false)
    expect(() => assertSameCallEventAuthority(initial, initial)).not.toThrow()
    expect(() => assertSameCallEventAuthority(
      initial,
      canonicalActor('prn_substituted', 'acc_owner', 7),
    )).toThrow('capability_call_event_authority_changed')
  })
})

function canonicalActor(principalRef: string, accountRef: string, revision: number) {
  return {
    kind: 'authenticated_owner' as const,
    clerkUserId: 'clerk_hostile_not_authority',
    canonicalPrincipalRef: principalRef,
    canonicalAccountRef: accountRef,
    legacyOwnerId: 'owner_legacy',
    authorityRevision: revision,
    authorityProvenance: {
      providerNamespace: 'clerk',
      bindingRef: 'binding:1',
      credentialRef: 'credential:1',
      credentialGeneration: 1,
      accessKind: 'owner' as const,
      accessRef: 'access:1',
      currentOwnershipRef: 'ownership:1',
    },
  } as unknown as Parameters<typeof sameCallEventAuthority>[0]
}
