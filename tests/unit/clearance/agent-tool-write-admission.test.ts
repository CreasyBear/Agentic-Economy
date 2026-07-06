import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveAgentToolWriteAdmissionThroughSource } from '@/modules/clearance/clearance.functions'
import type { AgentIdentity } from '@/modules/clearance/public'

const identity: AgentIdentity = {
  kind: 'identity',
  signatureAgent: 'https://chatgpt.com',
  keyid: 'test-key',
  verifiedAt: '2026-07-05T10:00:00.000Z',
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('agent tool write admission', () => {
  it('admits reserve-booking capability requests only for the declared business-action scope under the local gate', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')
    vi.stubEnv('AE_DEV_AGENT_TOOL_WRITE_ADMISSION', 'business_action_request')

    await expect(
      resolveAgentToolWriteAdmissionThroughSource({
        identity,
        toolId: 'businessAction.requestCapability',
        scope: 'business_action_request',
      }),
    ).resolves.toMatchObject({
      kind: 'admitted',
      toolId: 'businessAction.requestCapability',
      scope: 'business_action_request',
    })
  })

  it.each([
    {
      name: 'reserve-booking tool presented with the legacy inquiry scope',
      toolId: 'businessAction.requestCapability',
      scope: 'public_inquiry' as const,
    },
    {
      name: 'unknown write tool presented with the legacy inquiry scope',
      toolId: 'evil.write',
      scope: 'public_inquiry' as const,
    },
  ])('refuses $name before any local admission bypass can grant authority', async ({ toolId, scope }) => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')
    vi.stubEnv('AE_DEV_AGENT_TOOL_WRITE_ADMISSION', scope)

    await expect(
      resolveAgentToolWriteAdmissionThroughSource({
        identity,
        toolId,
        scope,
      }),
    ).resolves.toEqual({ kind: 'refused', reason: 'agent_tool_write_not_declared' })
  })

  it('continues to admit the legacy inquiry.submit write pair under the public-inquiry local gate', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', 'true')
    vi.stubEnv('AE_DEV_AGENT_TOOL_WRITE_ADMISSION', 'public_inquiry')

    await expect(
      resolveAgentToolWriteAdmissionThroughSource({
        identity,
        toolId: 'inquiry.submit',
        scope: 'public_inquiry',
      }),
    ).resolves.toMatchObject({
      kind: 'admitted',
      toolId: 'inquiry.submit',
      scope: 'public_inquiry',
    })
  })
})
