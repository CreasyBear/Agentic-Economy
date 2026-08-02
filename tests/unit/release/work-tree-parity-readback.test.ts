import { describe, expect, it, vi } from 'vitest'

import { readFreshAgentReadbackFromEnvironment } from '../../../tools/release/work-tree-parity-readback'

const readback = {
  kind: 'accepted',
  projectId: 'project:one',
  revision: 4,
  generation: 2,
  tree: { nodes: [{ nodeId: 'node:one', status: 'ready' }] },
  agentApiKey: 'ak_fresh_secret',
  authorization: 'Bearer ak_fresh_secret',
}

describe('T51 fresh child-agent readback', () => {
  it('uses a fresh-agent key and returns a classified sanitized inspect readback', async () => {
    const fetchImpl = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(readback))

    const result = await readFreshAgentReadbackFromEnvironment({
      AE_T51_FRESH_BASE_URL: 'https://preview.example.test',
      AE_T51_FRESH_PROJECT_ID: 'project:one',
      AE_T51_FRESH_AGENT_KEY: 'ak_fresh_secret',
    }, fetchImpl)

    expect(result.classification).toEqual({
      process: 'fresh-child-process',
      client: 'fresh-agent-key',
      context: 'new-node-process',
    })
    expect(result.operation).toBe('inspect')
    expect(result.body).toMatchObject({ kind: 'accepted', projectId: 'project:one', revision: 4 })
    expect(JSON.stringify(result)).not.toContain('ak_fresh_secret')
    const fetchCall = fetchImpl.mock.calls[0]
    if (fetchCall === undefined) throw new Error('expected_work_tree_inspect_request')
    const [requestUrl, requestInit] = fetchCall
    if (requestInit === undefined) throw new Error('expected_work_tree_inspect_request_init')
    expect(String(requestUrl)).toBe('https://preview.example.test/api/v1/work-tree/inspect')
    expect(requestInit.method).toBe('POST')
    const headers = requestInit.headers
    if (!(headers instanceof Headers)) throw new Error('expected_work_tree_inspect_headers')
    expect(headers.get('authorization')).toBe('Bearer ak_fresh_secret')
  })

  it('fails closed when child credentials or deployment coordinates are absent', async () => {
    await expect(readFreshAgentReadbackFromEnvironment({
      AE_T51_FRESH_BASE_URL: 'https://preview.example.test',
      AE_T51_FRESH_PROJECT_ID: 'project:one',
    }, vi.fn())).rejects.toThrow('AE_T51_FRESH_AGENT_KEY_required')
    await expect(readFreshAgentReadbackFromEnvironment({
      AE_T51_FRESH_PROJECT_ID: 'project:one',
      AE_T51_FRESH_AGENT_KEY: 'ak_fresh_secret',
    }, vi.fn())).rejects.toThrow('AE_T51_FRESH_BASE_URL_required')
  })
})
