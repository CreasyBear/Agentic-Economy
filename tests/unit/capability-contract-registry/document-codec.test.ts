import { describe, expect, it } from 'vitest'

import {
  decodeDurableCapabilityContract,
  encodeCapabilityContractDocument,
} from '@/modules/capability-contract-registry/public'
import { capabilityContractV2 } from '../../fixtures/capability-contract-v2'

describe('V2 capability contract durable codec', () => {
  it('stores canonical normalized document material without the derived ref', () => {
    const encoded = encodeCapabilityContractDocument(capabilityContractV2())

    expect(encoded.contract.ref).toEqual({
      capabilityId: 'reference.lookup',
      version: 1,
      contractDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    })
    expect(JSON.parse(encoded.documentJson)).not.toHaveProperty('ref')
    expect(encoded.documentJson).toBe(encodeCapabilityContractDocument(JSON.parse(encoded.documentJson)).documentJson)
  })

  it('round-trips only when every stored identity member and canonical byte matches', () => {
    const encoded = encodeCapabilityContractDocument(capabilityContractV2())
    const record = {
      ref: encoded.contract.ref,
      documentJson: encoded.documentJson,
      status: 'active' as const,
      registeredAt: 1_000,
    }

    expect(decodeDurableCapabilityContract(record)).toMatchObject({
      kind: 'found',
      contract: { ref: encoded.contract.ref },
      registeredAt: 1_000,
    })
    expect(decodeDurableCapabilityContract({
      ...record,
      ref: { ...record.ref, contractDigest: `sha256:${'0'.repeat(64)}` },
    })).toEqual({ kind: 'unavailable', reason: 'integrity_failure' })
    expect(decodeDurableCapabilityContract({
      ...record,
      documentJson: JSON.stringify(JSON.parse(record.documentJson), null, 2),
    })).toEqual({ kind: 'unavailable', reason: 'integrity_failure' })
  })

  it('fails closed for retired, malformed and oversized durable material', () => {
    const encoded = encodeCapabilityContractDocument(capabilityContractV2())
    expect(decodeDurableCapabilityContract({
      ref: encoded.contract.ref,
      documentJson: encoded.documentJson,
      status: 'retired',
      registeredAt: 1_000,
      retiredAt: 2_000,
    })).toEqual({ kind: 'unavailable', reason: 'not_active' })
    expect(decodeDurableCapabilityContract({
      ref: encoded.contract.ref,
      documentJson: '{',
      status: 'active',
      registeredAt: 1_000,
    })).toEqual({ kind: 'unavailable', reason: 'integrity_failure' })
    expect(() => encodeCapabilityContractDocument({
      ...capabilityContractV2(),
      description: 'x'.repeat(400_000),
    })).toThrowError('capability_contract_invalid')
  })
})
