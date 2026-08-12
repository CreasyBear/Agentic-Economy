import { afterEach, describe, expect, it, vi } from 'vitest'

import { requireSourceWrite } from '../../../convex/sourceWriteAdmission'
import {
  createSourceWriteAdmission,
  sourceWriteBodyDigest,
  sourceWriteCommandDigest,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'

const secret = 'convex-source-write-test-secret-with-32-bytes'
const request: SourceWriteAdmissionRequest = {
  method: 'POST',
  initiatorOrigin: 'https://app.example',
  targetOrigin: 'https://ae.example',
  targetPath: '/v1/operations',
  targetQuery: '?source=convex',
  bodyDigest: sourceWriteBodyDigest('{"operationRef":"op:one"}'),
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Convex source-write:v2 admission', () => {
  it('accepts a valid exact command and consumes the nonce exactly once', async () => {
    vi.stubEnv('AE_SOURCE_WRITE_SECRET', secret)
    const db = createNonceDb()
    const args = await validArgs('nonce:valid')

    await expect(requireSourceWrite({ db }, args, 'protected_action')).resolves.toMatchObject({
      kind: 'accepted',
      csrf: { origin: request.initiatorOrigin, allowedOrigins: [request.initiatorOrigin] },
    })
    await expect(requireSourceWrite({ db }, args, 'protected_action')).resolves.toEqual({
      kind: 'rejected',
      reason: 'source_write_nonce_replayed',
    })
    expect(db.inserts).toHaveLength(1)
    expect(db.inserts[0]).toMatchObject({ commandDigest: sourceWriteCommandDigest(args) })
  })

  it('recomputes the command digest and rejects changed args before nonce consumption', async () => {
    vi.stubEnv('AE_SOURCE_WRITE_SECRET', secret)
    const db = createNonceDb()
    const args = await validArgs('nonce:command')
    await expect(requireSourceWrite({ db }, { ...args, value: 'tampered' }, 'protected_action')).resolves.toEqual({
      kind: 'rejected',
      reason: 'source_write_command_mismatch',
    })
    expect(db.inserts).toHaveLength(0)
  })

  it('rejects a sibling scope from the same key family before nonce consumption', async () => {
    vi.stubEnv('AE_SOURCE_WRITE_SECRET', secret)
    const db = createNonceDb()
    const args = await validArgs('nonce:sibling-scope', 'public_inquiry')
    await expect(requireSourceWrite({ db }, args, 'owner_inquiry')).resolves.toEqual({
      kind: 'rejected',
      reason: 'source_write_scope_mismatch',
    })
    expect(db.inserts).toHaveLength(0)
  })

  it('does not consume a nonce for an invalid signature, then accepts the valid first writer', async () => {
    vi.stubEnv('AE_SOURCE_WRITE_SECRET', secret)
    const db = createNonceDb()
    const args = await validArgs('nonce:invalid-then-valid')
    const invalid = { ...args, sourceWrite: { ...args.sourceWrite, signature: `${args.sourceWrite.signature}tampered` } }
    await expect(requireSourceWrite({ db }, invalid, 'protected_action')).resolves.toEqual({
      kind: 'rejected',
      reason: 'invalid_source_write_signature',
    })
    await expect(requireSourceWrite({ db }, args, 'protected_action')).resolves.toMatchObject({ kind: 'accepted' })
    expect(db.inserts).toHaveLength(1)
  })

  it.each(['public_inquiry', 'billing', 'catalog_publish'] as const)('fails closed for %s without the exact request binding', async (scope) => {
    vi.stubEnv('AE_SOURCE_WRITE_SECRET', secret)
    const db = createNonceDb()
    const args = await validArgs(`nonce:missing-request:${scope}`)
    const { sourceWriteRequest: _sourceWriteRequest, ...withoutRequest } = args
    await expect(requireSourceWrite({ db }, withoutRequest, scope)).resolves.toEqual({
      kind: 'rejected',
      reason: 'missing_source_write_request',
    })
    expect(db.inserts).toHaveLength(0)
  })
})

async function validArgs(nonce: string, scope: 'protected_action' | 'public_inquiry' = 'protected_action'): Promise<Record<string, unknown> & { sourceWrite: SourceWriteAdmission }> {
  const command = { operationKey: 'operation:one', correlationId: 'correlation:one', value: 'one' }
  const sourceWrite = await createSourceWriteAdmission({
    env: { AE_SOURCE_WRITE_SECRET: secret },
    request,
    scope,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    commandDigest: sourceWriteCommandDigest(command),
    nonce,
  })
  return { ...command, sourceWriteRequest: request, sourceWrite }
}

function createNonceDb() {
  const rows = new Map<string, Record<string, unknown>>()
  const inserts: Record<string, unknown>[] = []
  const db = {
    inserts,
    query: (_tableName: string) => ({
      withIndex: (_indexName: string, callback: (builder: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
        const filters: Record<string, unknown> = {}
        callback({
          eq: (field, value) => {
            filters[field] = value
            return {
              eq: (nextField: string, nextValue: unknown) => {
                filters[nextField] = nextValue
                return undefined
              },
            }
          },
        })
        return {
          unique: async () => rows.get(`${String(filters.keyId)}:${String(filters.nonce)}`) ?? null,
        }
      },
    }),
    insert: async (_tableName: string, value: Record<string, unknown>) => {
      inserts.push(value)
      rows.set(`${String(value.keyId)}:${String(value.nonce)}`, value)
      return `sourceWriteNonces:${inserts.length}`
    },
  }
  return db
}
