import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readAttempt: vi.fn(),
  complete: vi.fn(),
  completeMcp: vi.fn(),
  startMcp: vi.fn(),
}))

vi.mock('@/modules/capability-supply/supply-funnel.functions', () => ({
  readOwnerProviderConnectionAttemptServer: mocks.readAttempt,
  completeOwnerHttpProviderConnectionServer: mocks.complete,
  completeOwnerMcpProviderConnectionServer: mocks.completeMcp,
  startOwnerMcpProviderConnectionServer: mocks.startMcp,
}))
vi.mock('@/components/ae/layout/AeOperatorShell', () => ({ AeOperatorShell: () => null }))

import { Route } from '@/routes/_operator/owner.supply.connections.new'
import { Route as CallbackRoute } from '@/routes/_operator/owner.supply.connections.oauth.callback'

describe('Provider connection handoff route', () => {
  it('loads only the opaque attempt selected by the handoff URL', async () => {
    const readback = {
      kind: 'available',
      attempt: {
        attemptRef: 'pca_one',
        sourceKind: 'http_credential',
        sourceOrigin: 'https://provider.example',
      },
    }
    mocks.readAttempt.mockResolvedValue(readback)

    const loader = Route.options.loader as (input: { deps: { attemptRef?: string } }) => Promise<unknown>
    await expect(loader({ deps: { attemptRef: 'pca_one' } })).resolves.toBe(readback)
    expect(mocks.readAttempt).toHaveBeenCalledWith({ data: { attemptRef: 'pca_one' } })
  })

  it('does not query when the handoff URL has no attempt', async () => {
    mocks.readAttempt.mockReset()
    const loader = Route.options.loader as (input: { deps: { attemptRef?: string } }) => Promise<unknown>
    await expect(loader({ deps: {} })).resolves.toEqual({ kind: 'not_found' })
    expect(mocks.readAttempt).not.toHaveBeenCalled()
  })

  it('completes an exact OAuth callback without forwarding provider error prose', async () => {
    const connected = { kind: 'connected', connection: { connectionRef: 'connection:mcp' } }
    mocks.readAttempt.mockResolvedValue({
      kind: 'available',
      attempt: { attemptRef: 'pca_oauth', environment: 'production', draftRef: 'sds_exact_source' },
    })
    mocks.completeMcp.mockResolvedValue(connected)
    const loader = CallbackRoute.options.loader as (input: { deps: {
      attempt?: string
      state?: string
      code?: string
      iss?: string
      error?: string
      provider_parameter?: string
    }; location: { searchStr: string } }) => Promise<unknown>

    await expect(loader({
      deps: {
        attempt: 'pca_oauth',
        state: 'oauth-state-never-forwarded',
        code: 'oauth-code-never-forwarded',
        iss: 'https://login.provider.example',
        provider_parameter: 'preserved',
      },
      location: {
        searchStr: '?attempt=pca_oauth&state=oauth-state-never-forwarded&code=oauth-code-never-forwarded&iss=https%3A%2F%2Flogin.provider.example&provider_parameter=preserved',
      },
    })).rejects.toMatchObject({
      options: {
        to: '/owner/offerings/new',
        search: { connection: 'connection:mcp', environment: 'production', draft: 'sds_exact_source' },
        replace: true,
      },
    })
    expect(mocks.completeMcp).toHaveBeenCalledWith({ data: {
      attemptRef: 'pca_oauth',
      callbackParameters: [
        ['attempt', 'pca_oauth'],
        ['state', 'oauth-state-never-forwarded'],
        ['code', 'oauth-code-never-forwarded'],
        ['iss', 'https://login.provider.example'],
        ['provider_parameter', 'preserved'],
      ],
    } })

    mocks.completeMcp.mockClear()
    mocks.completeMcp.mockResolvedValue({ kind: 'refused', code: 'connection_conflict' })
    await expect(loader({
      deps: { attempt: 'pca_oauth', state: 'oauth-state-never-forwarded', error: 'access_denied' },
      location: { searchStr: '?attempt=pca_oauth&state=oauth-state-never-forwarded&error=access_denied&error_description=never-forward-this' },
    })).resolves.toEqual({ kind: 'refused', code: 'connection_conflict' })
    expect(mocks.completeMcp).toHaveBeenCalledWith({ data: {
      attemptRef: 'pca_oauth',
      callbackParameters: [
        ['attempt', 'pca_oauth'],
        ['state', 'oauth-state-never-forwarded'],
        ['error', 'access_denied'],
        ['error_description', 'never-forward-this'],
      ],
    } })
  })
})
