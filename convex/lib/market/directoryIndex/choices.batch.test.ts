import { describe, expect, it, vi } from 'vitest'
const project = vi.hoisted(() => vi.fn())
vi.mock('../../capabilitySupply/tool/projection', () => ({ toolRecord: vi.fn(), toolRecordProjection: project }))
import { choicesForDirectoryRows } from './choices'

function indexedQuery(table: string, calls: string[], value: unknown) {
  return {
    withIndex: (_index: string, select: (query: { eq: (field: string, expected: string) => unknown }) => unknown) => {
      const chain = { eq: (field: string, expected: string) => { calls.push(`${table}:${field}=${expected}`); return chain } }
      select(chain)
      return { unique: async () => value }
    },
  }
}

describe('directory page choices', () => {
  it('reads each publication join once and keeps a missing publication external', async () => {
    const calls: string[] = []
    const publication = {
      offeringId: 'offering-a', bindingId: 'binding-a', businessId: 'business-a', toolRef: 'tool-a',
      capabilityId: 'capability-a', version: 1, contractDigest: 'digest-a',
    }
    project.mockResolvedValue({ kind: 'projected', record: { routeable: true, integrated: true, readiness: { validUntil: Date.now() + 1000 } } })
    const ctx = { db: {
      query: (table: string) => indexedQuery(table, calls, table === 'capabilityPublications' ? publication : null),
      get: async (id: string) => { calls.push(`get:${id}`); return { _id: id, publicStatus: 'published' } },
    } } as never
    const rows = [
      { _id: 'row-a', sourceRouteRef: 'route-a' },
      { _id: 'row-a-again', sourceRouteRef: 'route-a' },
      { _id: 'row-b' },
    ] as never
    const choices = await choicesForDirectoryRows(ctx, rows, Date.now())
    expect(calls.filter(call => call.startsWith('capabilityPublications:'))).toHaveLength(2)
    expect(calls.filter(call => call.startsWith('capabilityOfferings:'))).toEqual(['capabilityOfferings:offeringId=offering-a'])
    expect(calls.filter(call => call.startsWith('capabilityTransportBindings:'))).toEqual(['capabilityTransportBindings:bindingId=binding-a'])
    expect(calls.filter(call => call.startsWith('capabilityContractDocuments:'))).toHaveLength(2)
    expect(calls.filter(call => call.startsWith('get:'))).toEqual(['get:business-a'])
    expect(project).toHaveBeenCalledTimes(1)
    expect(choices.get('route-a')).toMatchObject({ access: 'ae_callable', toolRef: 'tool-a', sourceRouteRef: 'route-a' })
    expect(choices.get('row-b')).toEqual({ access: 'external_listing' })
  })
})
