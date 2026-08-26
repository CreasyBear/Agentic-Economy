import { getFunctionName } from 'convex/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActionCtx } from '../../../convex/_generated/server'
import { secretLifecycleRpc } from '../../../convex/secretLifecycleHttp'

const TOKEN = 'a'.repeat(43)
const OTHER_TOKEN = 'b'.repeat(43)
const SECRET_MATERIAL = 'secret-material-must-not-cross-the-convex-boundary'

type HttpHandler = (ctx: ActionCtx, request: Request) => Promise<Response>
type HttpExport = { _handler: HttpHandler }

const handler = (secretLifecycleRpc as unknown as HttpExport)._handler

const authority = Object.freeze({
  operation: 'rotate' as const,
  snapshotRef: 'das_00000000000040008000000000000121',
  accountRef: 'acc_00000000000040008000000000000121',
  actorPrincipalRef: 'prn_00000000000040008000000000000121',
  grantRef: 'grt_00000000000040008000000000000121',
  grantGeneration: 1,
  correlationRef: 'secret:http:rotate',
  idempotencyRef: 'secret:http:rotate',
  occurredAt: 5_000,
})

const preparedRecord = Object.freeze({
  operationRef: 'sop_00000000000040008000000000000121',
  idempotencyRef: authority.idempotencyRef,
  operation: 'rotate' as const,
  secretRef: 'sec_00000000000040008000000000000121',
  targetGeneration: 'sgn_00000000000040008000000000000122',
  previousGeneration: 'sgn_00000000000040008000000000000121',
  previousRevision: 1,
  state: 'prepared' as const,
  createdAt: authority.occurredAt,
  updatedAt: authority.occurredAt,
})

const provisionRecord = Object.freeze({
  ...preparedRecord,
  operationRef: 'sop_00000000000040008000000000000122',
  idempotencyRef: 'secret:http:provision',
  operation: 'provision' as const,
  targetGeneration: 'sgn_00000000000040008000000000000121',
  previousRevision: 0,
})
const { previousGeneration: _omittedPreviousGeneration, ...provisionRecordWithoutPrevious } = provisionRecord

function request(body: unknown, token = TOKEN, headers: Record<string, string> = {}): Request {
  return rawRequest(JSON.stringify(body), token, {
    'Content-Type': 'application/json',
    ...headers,
  })
}

function rawRequest(body: string, token = TOKEN, headers: Record<string, string> = {}): Request {
  return new Request('https://deployment.convex.site/internal/secret-lifecycle', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...headers },
    body,
  })
}

function ctx(result: unknown = null) {
  return {
    runMutation: vi.fn(async () => result),
  } as unknown as ActionCtx
}

function functionPath(reference: unknown): string {
  return getFunctionName(reference as never)
}

describe('secret lifecycle Convex HTTP bridge', () => {
  beforeEach(() => {
    vi.stubEnv('AE_SECRET_LIFECYCLE_RPC_TOKEN', TOKEN)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('requires the exact hashed transport token before parsing or mutating', async () => {
    for (const candidate of [
      rawRequest('{}', '', { 'Content-Type': 'application/json' }),
      new Request('https://deployment.convex.site/internal/secret-lifecycle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      }),
      rawRequest('{}', 'short', { 'Content-Type': 'application/json' }),
      rawRequest('{}', OTHER_TOKEN, { 'Content-Type': 'application/json' }),
    ]) {
      const context = ctx()
      const response = await handler(context, candidate)
      expect(response.status).toBe(401)
      expect(response.headers.get('cache-control')).toBe('no-store')
      await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
      expect(context.runMutation).not.toHaveBeenCalled()
    }

    vi.stubEnv('AE_SECRET_LIFECYCLE_RPC_TOKEN', 'short')
    const invalidConfiguration = ctx()
    await expect(handler(invalidConfiguration, request({}))).resolves.toMatchObject({ status: 401 })
    expect(invalidConfiguration.runMutation).not.toHaveBeenCalled()
  })

  it.each([
    ['wrong media type', rawRequest('{}', TOKEN, { 'Content-Type': 'text/plain' })],
    ['oversize declaration', rawRequest('{}', TOKEN, {
      'Content-Type': 'application/json', 'Content-Length': String(129 * 1024),
    })],
    ['oversize body', request({ operation: 'pointer_read', args: { padding: 'x'.repeat(129 * 1024) } })],
    ['invalid JSON', rawRequest('{', TOKEN, { 'Content-Type': 'application/json' })],
    ['array body', rawRequest('[]', TOKEN, { 'Content-Type': 'application/json' })],
    ['missing operation', request({ args: {} })],
    ['non-string operation', request({ operation: 7, args: {} })],
    ['missing args', request({ operation: 'pointer_read' })],
    ['array args', request({ operation: 'pointer_read', args: [] })],
    ['extra envelope key', request({ operation: 'pointer_read', args: {}, callerProof: 'attacker' })],
  ])('rejects malformed envelopes before mutation: %s', async (_label, candidate) => {
    const context = ctx()
    const response = await handler(context, candidate)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
    expect(context.runMutation).not.toHaveBeenCalled()
  })

  it.each([
    ['missing authority', { operation: 'journal_read', args: { idempotencyRef: authority.idempotencyRef } }],
    ['array authority', { operation: 'journal_read', args: { authority: [], idempotencyRef: authority.idempotencyRef } }],
    ['extra authority key', {
      operation: 'journal_read',
      args: { authority: { ...authority, callerPrincipal: 'attacker' }, idempotencyRef: authority.idempotencyRef },
    }],
    ['invalid authority operation', {
      operation: 'journal_read',
      args: { authority: { ...authority, operation: 'admin' }, idempotencyRef: authority.idempotencyRef },
    }],
    ['unsafe grant generation', {
      operation: 'journal_read',
      args: { authority: { ...authority, grantGeneration: 0 }, idempotencyRef: authority.idempotencyRef },
    }],
    ['unsafe occurrence time', {
      operation: 'journal_read',
      args: { authority: { ...authority, occurredAt: Number.NaN }, idempotencyRef: authority.idempotencyRef },
    }],
    ['caller-shaped secret bytes', {
      operation: 'journal_read',
      args: { authority, idempotencyRef: authority.idempotencyRef, materialBase64: btoa(SECRET_MATERIAL) },
    }],
  ])('rejects non-canonical authority and exact-key violations before mutation: %s', async (_label, body) => {
    const context = ctx()
    const response = await handler(context, request(body))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
    expect(context.runMutation).not.toHaveBeenCalled()
  })

  it.each([
    ['non-string journal key', 'journal_read', { authority, idempotencyRef: 7 }],
    ['non-record journal insert', 'journal_insert', { authority, record: 'attacker' }],
    ['extra journal field', 'journal_insert', {
      authority, record: { ...preparedRecord, callerProof: 'attacker' },
    }],
    ['invalid journal operation', 'journal_insert', {
      authority, record: { ...preparedRecord, operation: 'admin' },
    }],
    ['invalid journal state', 'journal_insert', {
      authority, record: { ...preparedRecord, state: 'retryable' },
    }],
    ['non-string journal field', 'journal_insert', {
      authority, record: { ...preparedRecord, operationRef: 7 },
    }],
    ['non-string optional generation', 'journal_insert', {
      authority, record: { ...preparedRecord, previousGeneration: 7 },
    }],
    ['negative previous revision', 'journal_insert', {
      authority, record: { ...preparedRecord, previousRevision: -1 },
    }],
    ['unsafe created timestamp', 'journal_insert', {
      authority, record: { ...preparedRecord, createdAt: Number.NaN },
    }],
    ['non-string expected state', 'journal_replace', {
      authority, record: preparedRecord, expectedState: 7,
    }],
    ['unknown expected state', 'journal_replace', {
      authority, record: preparedRecord, expectedState: 'retryable',
    }],
    ['non-string pointer ref', 'pointer_read', { authority, secretRef: 7 }],
    ['non-string initial generation', 'pointer_initialize', {
      authority: { ...authority, operation: 'provision' },
      secretRef: 'sec_00000000000040008000000000000121', activeGeneration: 7,
    }],
    ['unsafe expected revision', 'pointer_advance', {
      authority, secretRef: 'sec_00000000000040008000000000000121',
      expectedActiveGeneration: 'sgn_00000000000040008000000000000121',
      expectedRevision: 0, newGeneration: 'sgn_00000000000040008000000000000122',
    }],
    ['non-string new generation', 'pointer_advance', {
      authority, secretRef: 'sec_00000000000040008000000000000121',
      expectedActiveGeneration: 'sgn_00000000000040008000000000000121',
      expectedRevision: 1, newGeneration: 7,
    }],
  ])('rejects malformed operation payload before mutation: %s', async (_label, operation, args) => {
    const context = ctx()
    const response = await handler(context, request({ operation, args }))
    expect(response.status).toBe(400)
    expect(context.runMutation).not.toHaveBeenCalled()
  })

  it.each([
    ['journal_read', { authority, idempotencyRef: authority.idempotencyRef },
      'secretLifecycleOperations:readLifecycleJournal', null],
    ['journal_insert', { authority, record: preparedRecord },
      'secretLifecycleOperations:insertLifecyclePrepared', null],
    ['journal_insert', {
      authority: {
        ...authority,
        operation: 'provision',
        correlationRef: 'secret:http:provision',
        idempotencyRef: 'secret:http:provision',
      },
      record: provisionRecordWithoutPrevious,
    }, 'secretLifecycleOperations:insertLifecyclePrepared', null],
    ['journal_replace', {
      authority,
      record: { ...preparedRecord, state: 'active', updatedAt: authority.occurredAt + 1 },
      expectedState: 'prepared',
    },
      'secretLifecycleOperations:replaceLifecycleJournal', null],
    ['pointer_read', { authority, secretRef: 'sec_00000000000040008000000000000121' },
      'secretLifecycleOperations:readSecretPointer', null],
    ['pointer_initialize', {
      authority: { ...authority, operation: 'provision' },
      secretRef: 'sec_00000000000040008000000000000121',
      activeGeneration: 'sgn_00000000000040008000000000000121',
    }, 'secretLifecycleOperations:initializeSecretPointer', null],
    ['pointer_advance', {
      authority,
      secretRef: 'sec_00000000000040008000000000000121',
      expectedActiveGeneration: 'sgn_00000000000040008000000000000121',
      expectedRevision: 1,
      newGeneration: 'sgn_00000000000040008000000000000122',
    }, 'secretLifecycleOperations:advanceSecretPointer', null],
  ] as const)('routes the exact allowlisted %s operation and no secret material', async (
    operation,
    args,
    expectedPath,
    result,
  ) => {
    const context = ctx(result)
    const response = await handler(context, request({ operation, args }))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ kind: 'ok', result })
    expect(context.runMutation).toHaveBeenCalledOnce()
    const [reference, forwarded] = vi.mocked(context.runMutation).mock.calls[0]!
    expect(functionPath(reference)).toBe(expectedPath)
    expect(JSON.stringify(forwarded)).not.toContain(SECRET_MATERIAL)
  })

  it('returns safe denials for unknown operations and mutation failures', async () => {
    const unknown = ctx()
    const unsupported = await handler(unknown, request({ operation: 'admin', args: { authority } }))
    expect(unsupported.status).toBe(400)
    await expect(unsupported.json()).resolves.toEqual({ kind: 'unavailable' })
    expect(unknown.runMutation).not.toHaveBeenCalled()

    const throwing = {
      runMutation: vi.fn(async () => { throw new Error(SECRET_MATERIAL) }),
    } as unknown as ActionCtx
    const denied = await handler(throwing, request({
      operation: 'journal_read',
      args: { authority, idempotencyRef: authority.idempotencyRef },
    }))
    expect(denied.status).toBe(409)
    const body = await denied.text()
    expect(body).toBe(JSON.stringify({ kind: 'unavailable' }))
    expect(body).not.toContain(SECRET_MATERIAL)
  })
})
