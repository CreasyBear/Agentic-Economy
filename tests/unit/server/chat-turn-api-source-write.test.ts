import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { handleChatTurnPost, handleChatTurnResource, type ChatTurnOptions } from '@/lib/server/chat-turn-api'
import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { sourceWriteCommandDigest, verifySourceWriteAdmission } from '@/modules/security/source-write-admission'
import { installTestSourceWriteSecret } from '../../helpers/source-write-admission'

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development'))
afterEach(() => vi.unstubAllEnvs())

const turnRef = `turn_${'0'.repeat(8)}-${'0'.repeat(4)}-4000-8000-${'0'.repeat(12)}`
const snapshot = { turnRef, threadId: 'thread_test', promptMessageId: 'message_test', sequence: 7, state: 'completed' as const, callRefs: [`operation-invocation:v1:${'a'.repeat(64)}`], inFlightCallRefs: [] }
const post = () => new Request('https://ae.example/api/v1/chat/turns', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ prompt: 'Find a current weather Tool', clientTurnId: 'turn-stable' }),
})
const resource = () => new Request(`https://ae.example/api/v1/chat/turns/${turnRef}`, { method: 'GET' })
async function parts(response: Response): Promise<Record<string, unknown>[]> {
  const wire = await response.text()
  return wire.split('\n').filter(line => line.startsWith('data: {'))
    .map(line => JSON.parse(line.slice(6)) as Record<string, unknown>)
}

describe('chat Turn source-write admission', () => {
  beforeEach(() => setHttpRateLimitAdmissionForTests(async () => ({ ok: true })))
  afterEach(() => setHttpRateLimitAdmissionForTests(undefined))

  it('signs the actual key command at the edge and verifies read proofs without a read mutation', async () => {
    installTestSourceWriteSecret()
    const commands: { method: string; args: Record<string, unknown> }[] = []
    const transport = {
      mutation: vi.fn(async (_ref: unknown, args: Record<string, unknown>) => {
        commands.push({ method: 'mutation', args })
        return snapshot
      }),
      query: vi.fn(async (_ref: unknown, args: Record<string, unknown>) => {
        commands.push({ method: 'query', args })
        return args.streamArgs === undefined ? snapshot : {
          turnRef, sequence: 7, state: 'completed', streams: {
            kind: 'list', messages: [],
          },
        }
      }),
      action: vi.fn(),
    }
    const restore = setPublicSourceTransportForTests(transport)
    const keyOptions: ChatTurnOptions = {
      authenticate: async () => ({
        isAuthenticated: true, tokenType: 'api_key', id: 'ak_test', subject: 'user_test',
        scopes: ['market_tools:call'], claims: { aeEnvironment: 'sandbox' },
      }),
      resolvePrincipal: async (projection) => ({
        ...projection, principalId: 'prn_00000000000040008000000000000043',
        ownerId: 'acc_00000000000040008000000000000043',
      }),
    }
    try {
      const request = post()
      request.headers.set('Authorization', 'Bearer test-agent-key')
      expect((await parts(await handleChatTurnPost(request, keyOptions)))[0])
        .toMatchObject({ type: 'data-ae-state', data: { turnRef } })
      const status = resource()
      status.headers.set('Authorization', 'Bearer test-agent-key')
      expect((await handleChatTurnResource(status, turnRef, keyOptions)).status).toBe(200)
      expect(transport.mutation).toHaveBeenCalledOnce()
      expect(transport.query).toHaveBeenCalled()
      for (const { args } of commands) {
        const admission = args.sourceWrite as NonNullable<Parameters<typeof verifySourceWriteAdmission>[0]['admission']>
        const expectedRequest = args.sourceWriteRequest as NonNullable<Parameters<typeof verifySourceWriteAdmission>[0]['expected']['request']>
        expect(await verifySourceWriteAdmission({
          admission,
          expected: {
            scope: 'protected_action',
            operationKey: args.operationKey as string,
            correlationId: args.correlationId as string,
            commandDigest: sourceWriteCommandDigest(args),
            request: expectedRequest,
          },
        })).toMatchObject({ kind: 'accepted' })
      }
    } finally {
      restore()
    }
  })
})
