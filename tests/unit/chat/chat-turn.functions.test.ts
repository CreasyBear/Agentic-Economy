import { afterEach, describe, expect, it, vi } from 'vitest'
import { productionWebManifestFixture } from '../../helpers/production-web-manifest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ isAuthenticated: true, userId: 'user_test' })),
  callSourceMutation: vi.fn(async () => ({ threadId: 'thread_test', turnRef: 'turn_test', promptMessageId: 'prompt_test', state: 'submitted', sequence: 1 })),
  sourceWriteAdmissionFromContext: vi.fn(async () => ({ marker: 'signed' })),
}))

vi.mock('@clerk/tanstack-react-start/server', () => ({ auth: mocks.auth }))
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ validator: () => ({ handler: (handler: unknown) => handler }) }),
}))
vi.mock('@tanstack/react-start/server', () => ({ setResponseHeader: vi.fn() }))
vi.mock('@/lib/server/convex-source', () => ({
  sourceMutation: () => 'chatTurns:startTurn', callSourceMutation: mocks.callSourceMutation,
}))
vi.mock('@/lib/server/source-write-admission', () => ({
  sourceWriteAdmissionFromContext: mocks.sourceWriteAdmissionFromContext,
  sourceWriteRequestFromAdmission: () => ({ marker: 'request' }),
}))

import { startOwnerChatTurnServer } from '@/lib/server/chat-turn.functions'

const handler = startOwnerChatTurnServer as unknown as (input: {
  data: { prompt: string; clientTurnId: string }; context: unknown
}) => Promise<unknown>

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

describe('owner chat Turn server producer', () => {
  it('keeps sandbox starts available without a production source-write proof', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development')
    await expect(handler({ data: { prompt: 'Find weather', clientTurnId: 'turn-sandbox' }, context: {} }))
      .resolves.toMatchObject({ state: 'submitted' })
    expect(mocks.sourceWriteAdmissionFromContext).not.toHaveBeenCalled()
    expect(mocks.callSourceMutation).toHaveBeenCalledOnce()
  })

  it('does not dispatch an unready production start to Convex', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    vi.stubEnv('AE_X402_CUSTODY_ENABLED', 'false')
    await expect(handler({ data: { prompt: 'Find weather', clientTurnId: 'turn-1' }, context: {} }))
      .resolves.toEqual({ kind: 'not_started', code: 'source_unavailable' })
    expect(mocks.sourceWriteAdmissionFromContext).not.toHaveBeenCalled()
    expect(mocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it('signs and dispatches an authenticated production start with a complete manifest', async () => {
    for (const [name, value] of Object.entries(productionWebManifestFixture)) vi.stubEnv(name, value)
    await expect(handler({ data: { prompt: 'Find weather', clientTurnId: 'turn-2' }, context: {} }))
      .resolves.toMatchObject({ threadId: 'thread_test', state: 'submitted' })
    expect(mocks.sourceWriteAdmissionFromContext).toHaveBeenCalledOnce()
    expect(mocks.callSourceMutation).toHaveBeenCalledWith('chatTurns:startTurn',
      expect.objectContaining({ principal: { kind: 'clerk' }, sourceWrite: { marker: 'signed' } }))
  })
})
