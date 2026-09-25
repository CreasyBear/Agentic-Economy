import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { encodeCapabilityContractDocument } from '@/modules/capability-contract-registry/public'
import { capabilityContractV2 } from '../../../../tests/fixtures/capability-contract-v2'
import { convexModules as modules } from '../../../../tests/helpers/convex-fixtures'
import schema from '../../../schema'
import { getActiveExactCapabilityContract } from './reads'

describe('active exact capability contract reader', () => {
  it('returns an intact exact document and fails closed for absent, mismatched, or corrupt material', async () => {
    const backend = convexTest(schema, modules)
    const { contract, documentJson } = encodeCapabilityContractDocument(capabilityContractV2())
    const ref = contract.ref
    const registeredAt = 123
    const rowId = await backend.run((ctx) => ctx.db.insert('capabilityContractDocuments', {
      capabilityId: ref.capabilityId,
      version: ref.version,
      contractDigest: ref.contractDigest,
      documentJson,
      status: 'active',
      registeredAt,
    }))
    const read = (requestedRef: typeof ref) => backend.run((ctx) => (
      getActiveExactCapabilityContract(ctx.db, requestedRef)
    ))

    expect(await read(ref)).toEqual({ kind: 'found', ref, documentJson, registeredAt })
    expect(await read({ ...ref, version: ref.version + 1 })).toEqual({
      kind: 'unavailable', reason: 'not_found',
    })
    expect(await read({ ...ref, contractDigest: `sha256:${'0'.repeat(64)}` })).toEqual({
      kind: 'unavailable', reason: 'not_found',
    })

    await backend.run((ctx) => ctx.db.patch(rowId, { documentJson: '{' }))
    expect(await read(ref)).toEqual({ kind: 'unavailable', reason: 'integrity_failure' })
  })
})
