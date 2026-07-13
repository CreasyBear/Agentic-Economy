import { describe, expect, it, vi } from 'vitest'

import { deployCustomerRequestGitSource } from '../../../tools/release/deploy-customer-request-git-source'

const revision = '16cc86337ca68d5dc509c8bf1e17c46d8e348a80'

describe('Customer Request Git-source deployment', () => {
  it('asks Vercel to fetch the exact GitHub revision and waits for READY', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({
        id: 'dpl_exact', url: 'agentic-economy-exact.vercel.app', readyState: 'BUILDING',
        createdAt: 1_783_979_390_635,
        gitSource: { type: 'github', repoId: 1_283_024_672, ref: 'main', sha: revision },
      }))
      .mockResolvedValueOnce(Response.json({
        id: 'dpl_exact', url: 'agentic-economy-exact.vercel.app', readyState: 'READY',
        createdAt: 1_783_979_390_635,
        gitSource: { type: 'github', repoId: 1_283_024_672, ref: 'main', sha: revision },
      }))

    await expect(deployCustomerRequestGitSource({
      token: 'vercel_token',
      teamId: 'team_exact',
      projectId: 'prj_exact',
      sourceRevision: revision,
      fetchImpl,
      wait: async () => undefined,
    })).resolves.toEqual({
      kind: 'deployed',
      deploymentId: 'dpl_exact',
      deploymentUrl: 'https://agentic-economy-exact.vercel.app',
      sourceRevision: revision,
      createdAt: '2026-07-13T21:49:50.635Z',
    })

    expect(fetchImpl.mock.calls[0]?.[0].toString()).toBe(
      'https://api.vercel.com/v13/deployments?teamId=team_exact&forceNew=1',
    )
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      name: 'agentic-economy',
      project: 'prj_exact',
      target: 'production',
      gitSource: {
        type: 'github',
        repoId: 1_283_024_672,
        ref: 'main',
        sha: revision,
      },
    })
    expect(fetchImpl.mock.calls[1]?.[0].toString()).toBe(
      'https://api.vercel.com/v13/deployments/dpl_exact?teamId=team_exact',
    )
  })

  it('refuses Vercel source drift and terminal deployment failure', async () => {
    const response = (gitRevision: string, readyState: string): typeof fetch => async () => Response.json({
      id: 'dpl_exact', url: 'agentic-economy-exact.vercel.app', readyState,
      createdAt: 1_783_979_390_635,
      gitSource: { type: 'github', repoId: 1_283_024_672, ref: 'main', sha: gitRevision },
    })
    await expect(deployCustomerRequestGitSource({
      token: 'vercel_token', teamId: 'team_exact', projectId: 'prj_exact', sourceRevision: revision,
      fetchImpl: response('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'READY'),
    })).rejects.toThrow('vercel_git_source_revision_mismatch')
    await expect(deployCustomerRequestGitSource({
      token: 'vercel_token', teamId: 'team_exact', projectId: 'prj_exact', sourceRevision: revision,
      fetchImpl: response(revision, 'ERROR'),
    })).rejects.toThrow('vercel_git_source_deployment_failed:ERROR')
  })
})
