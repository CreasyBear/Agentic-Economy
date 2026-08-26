import { afterEach, describe, expect, it, vi } from 'vitest'

import { requireSourceWrite } from '../../../convex/sourceWriteAdmission'
import {
  readControlSource,
  recordLateObservationSource,
} from '../../../convex/actionInvocationControl'
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

type RuntimeHandler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
type IsolationCaseKind =
  | 'owner'
  | 'member'
  | 'workload'
  | 'missing_workload'
  | 'stranger'
  | 'wrong_account'
  | 'stale_generation'

const ISOLATION_CASES = [
  'owner',
  'member',
  'workload',
  'missing_workload',
  'stranger',
  'wrong_account',
  'stale_generation',
] as const satisfies readonly IsolationCaseKind[]
const readControlSourceRuntime = (readControlSource as unknown as { _handler: RuntimeHandler })._handler
const recordLateObservationSourceRuntime = (
  recordLateObservationSource as unknown as { _handler: RuntimeHandler }
)._handler

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Convex source-write:v2 admission', () => {
  it.each(ISOLATION_CASES)(
    'drives the %s isolation case through both registered source handlers without a denied data or control effect',
    async (caseKind) => {
      vi.stubEnv('AE_SOURCE_WRITE_SECRET', secret)
      const readDb = createNonceDb()
      const readCommand = {
        invocationRef: `invocation:isolation-read:${caseKind}`,
        callerRef: `caller:isolation-read:${caseKind}`,
        principalRef: `principal:isolation-read:${caseKind}`,
        operationKey: 'actionInvocationControl:readControlSource',
        correlationId: `correlation:isolation-read:${caseKind}`,
      }
      const readArgs = await isolationArgs(readCommand, `nonce:isolation-read:${caseKind}`, caseKind)

      const writeDb = createNonceDb()
      const writeCommand = {
        invocationRef: `invocation:isolation-write:${caseKind}`,
        commandId: `command:isolation-write:${caseKind}`,
        effectGeneration: 1,
        actorRef: `actor:isolation-write:${caseKind}`,
        sourceEvidenceRef: `evidence:isolation-write:${caseKind}`,
        release: 'not_released',
        evidenceDigest: `sha256:${'b'.repeat(64)}`,
        recordedAt: '2026-08-26T00:00:00.000Z',
        operationKey: 'actionInvocationControl:recordLateObservationSource',
        correlationId: `correlation:isolation-write:${caseKind}`,
      }
      const writeArgs = await isolationArgs(writeCommand, `nonce:isolation-write:${caseKind}`, caseKind)

      if (caseKind === 'workload') {
        await expect(readControlSourceRuntime({ db: readDb }, readArgs)).resolves.toBeNull()
        await expect(recordLateObservationSourceRuntime({ db: writeDb }, writeArgs)).resolves.toEqual({
          kind: 'refused',
          code: 'stale_invocation_version',
        })
        expect(readDb.queries).toEqual(['actionInvocationControls'])
        expect(writeDb.queries.filter((table) => table === 'actionInvocationControls')).toHaveLength(1)
        expect(writeDb.inserts).toHaveLength(1)
        return
      }

      await expect(readControlSourceRuntime({ db: readDb }, readArgs)).rejects.toThrow()
      await expect(recordLateObservationSourceRuntime({ db: writeDb }, writeArgs)).rejects.toThrow()
      expect(readDb.queries).toHaveLength(0)
      expect(readDb.inserts).toHaveLength(0)
      expect(writeDb.queries).toHaveLength(0)
      expect(writeDb.inserts).toHaveLength(0)
    },
  )

  it('runs the registered source read query with exact signed provenance and denies caller drift before data access', async () => {
    vi.stubEnv('AE_SOURCE_WRITE_SECRET', secret)
    const db = createNonceDb()
    const command = {
      invocationRef: 'invocation:runtime-read',
      callerRef: 'caller:runtime-read',
      principalRef: 'principal:runtime-read',
      operationKey: 'actionInvocationControl:readControlSource',
      correlationId: 'correlation:runtime-read',
    }
    const args = await signedArgs(command, 'nonce:runtime-read')

    await expect(readControlSourceRuntime({ db }, args)).resolves.toBeNull()
    expect(db.queries).toEqual(['actionInvocationControls'])

    await expect(readControlSourceRuntime({ db }, {
      ...args,
      principalRef: 'principal:attacker',
    })).rejects.toThrow()
    expect(db.queries).toEqual(['actionInvocationControls'])
  })

  it('runs the registered source write mutation once and rejects replay before a duplicate control effect', async () => {
    vi.stubEnv('AE_SOURCE_WRITE_SECRET', secret)
    const db = createNonceDb()
    const command = {
      invocationRef: 'invocation:runtime-write',
      commandId: 'command:runtime-write',
      effectGeneration: 1,
      actorRef: 'actor:runtime-write',
      sourceEvidenceRef: 'evidence:runtime-write',
      release: 'not_released',
      evidenceDigest: `sha256:${'a'.repeat(64)}`,
      recordedAt: '2026-08-26T00:00:00.000Z',
      operationKey: 'actionInvocationControl:recordLateObservationSource',
      correlationId: 'correlation:runtime-write',
    }
    const args = await signedArgs(command, 'nonce:runtime-write')

    await expect(recordLateObservationSourceRuntime({ db }, args)).resolves.toEqual({
      kind: 'refused',
      code: 'stale_invocation_version',
    })
    await expect(recordLateObservationSourceRuntime({ db }, args))
      .rejects.toThrow('action_invocation_source_write_rejected:source_write_nonce_replayed')
    expect(db.inserts).toHaveLength(1)
    expect(db.queries.filter((table) => table === 'actionInvocationControls')).toHaveLength(1)
  })

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
    const args = await validArgs('nonce:sibling-scope', 'catalog_publish')
    await expect(requireSourceWrite({ db }, args, 'removal_dispute')).resolves.toEqual({
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

  it.each(['discovery_repair', 'billing', 'catalog_publish'] as const)('fails closed for %s without the exact request binding', async (scope) => {
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

async function validArgs(nonce: string, scope: 'protected_action' | 'catalog_publish' = 'protected_action'): Promise<Record<string, unknown> & { sourceWrite: SourceWriteAdmission }> {
  const command = { operationKey: 'operation:one', correlationId: 'correlation:one', value: 'one' }
  return await signedArgs(command, nonce, scope)
}

async function signedArgs(
  command: Record<string, unknown> & { operationKey: string; correlationId: string },
  nonce: string,
  scope: 'protected_action' | 'catalog_publish' = 'protected_action',
  now?: number,
): Promise<Record<string, unknown> & { sourceWrite: SourceWriteAdmission }> {
  const sourceWrite = await createSourceWriteAdmission({
    env: { AE_SOURCE_WRITE_SECRET: secret },
    request,
    scope,
    operationKey: command.operationKey,
    correlationId: command.correlationId,
    commandDigest: sourceWriteCommandDigest(command),
    nonce,
    ...(now === undefined ? {} : { now }),
  })
  return { ...command, sourceWriteRequest: request, sourceWrite }
}

async function isolationArgs(
  command: Record<string, unknown> & { operationKey: string; correlationId: string },
  nonce: string,
  caseKind: IsolationCaseKind,
): Promise<Record<string, unknown>> {
  if (caseKind === 'owner' || caseKind === 'missing_workload') return command
  if (caseKind === 'member') {
    return await signedArgs(command, nonce, 'catalog_publish')
  }
  const args = await signedArgs(command, nonce)
  if (caseKind === 'workload') return args
  if (caseKind === 'stranger') {
    return {
      ...args,
      sourceWrite: {
        ...args.sourceWrite,
        signature: `${args.sourceWrite.signature}forged`,
      },
    }
  }
  if (caseKind === 'wrong_account') {
    if (typeof command.principalRef === 'string') {
      return { ...args, principalRef: `principal:wrong-account:${nonce}` }
    }
    return { ...args, actorRef: `actor:wrong-account:${nonce}` }
  }
  return await signedArgs(command, nonce, 'protected_action', Date.now() - 10 * 60_000)
}

function createNonceDb() {
  const rows = new Map<string, Record<string, unknown>>()
  const inserts: Record<string, unknown>[] = []
  const queries: string[] = []
  const db = {
    inserts,
    queries,
    query: (tableName: string) => ({
      withIndex: (_indexName: string, callback: (builder: { eq: (field: string, value: unknown) => unknown }) => unknown) => {
        queries.push(tableName)
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
