import { describe, expect, it } from 'vitest'

import { handleInvokeAgentTool, handleListAgentTools } from '@/routes/api.agent.tools'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'
import { withRegistrySourcePortForTest } from '../helpers/source-ports'

describe('GET /api/agent/tools', () => {
  it('lists inquiry.submit with boundaries and without protocol vocabulary', async () => {
    const response = await handleListAgentTools()
    const body = (await response.json()) as {
      tools: readonly {
        id: string
        name?: string
        summary: string
        boundaries: readonly string[]
      }[]
    }

    expect(response.status).toBe(200)
    expect(body.tools.map((tool) => tool.id)).toContain('inquiry.submit')

    const submitTool = body.tools.find((tool) => tool.id === 'inquiry.submit')
    expect(submitTool?.boundaries.length).toBeGreaterThan(0)
    expect(JSON.stringify({ id: submitTool?.id, name: submitTool?.name, summary: submitTool?.summary })).not.toMatch(
      /MCP|OpenAPI|callable/i
    )
  })

  it('lists the read-only registry actions with boundaries and without architecture vocabulary', async () => {
    const response = await handleListAgentTools()
    const body = (await response.json()) as {
      tools: readonly {
        id: string
        name?: string
        summary: string
        boundaries: readonly string[]
        readOnly: boolean
      }[]
    }

    const ids = body.tools.map((tool) => tool.id)
    expect(ids).toContain('registry.search')
    expect(ids).toContain('registry.detail')

    const search = body.tools.find((tool) => tool.id === 'registry.search')
    expect(search?.readOnly).toBe(true)
    expect(search?.boundaries.length).toBeGreaterThan(0)
    expect(search?.boundaries.join(' ')).toMatch(/book|charge|dispatch|inquiry/i)
    expect(JSON.stringify(search)).not.toMatch(
      /MCP|OpenAPI|callable|autonomous|agent-native|DTO|fixture/i
    )

    const detail = body.tools.find((tool) => tool.id === 'registry.detail')
    expect(detail?.readOnly).toBe(true)
    expect(detail?.boundaries.length).toBeGreaterThan(0)
  })
})

describe('POST /api/agent/tools', () => {
  it('rejects non-JSON content types', async () => {
    const response = await handleInvokeAgentTool(
      new Request('https://ae.example/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'tool=inquiry.submit',
      })
    )

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({
      code: 'agent_tools_invalid_content_type',
    })
  })

  it('rejects unknown tools', async () => {
    const response = await handleInvokeAgentTool(
      new Request('https://ae.example/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'does-not-exist', input: {} }),
      })
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      code: 'agent_tools_unknown_tool',
    })
  })

  it('rejects invalid inquiry.submit input before source writes', async () => {
    const response = await handleInvokeAgentTool(
      new Request('https://ae.example/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'inquiry.submit',
          input: { body: 'Need help with a leak.' },
        }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'error',
      code: 'agent_tools_invalid_input',
      retryable: false,
    })
  })
})

describe('POST /api/agent/tools registry search', () => {
  it('invokes registry.search and returns the public catalog page', async () => {
    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleInvokeAgentTool(
        new Request('https://ae.example/api/agent/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'registry.search',
            input: { query: 'parramatta' },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        kind: string
        items: readonly { slug: string }[]
        pagination: { total: number }
      }
      expect(body.kind).toBe('ok')
      expect(body.items.map((item) => item.slug)).toContain(
        'parramatta-emergency-plumbing',
      )
      expect(body.pagination.total).toBeGreaterThan(0)
    })
  })

  it('keeps the registry literal: a misspelled suburb does not auto-correct', async () => {
    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleInvokeAgentTool(
        new Request('https://ae.example/api/agent/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'registry.search',
            input: { query: 'paramata' },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        kind: string
        items: readonly { slug: string }[]
        pagination: { total: number }
      }
      expect(body.kind).toBe('ok')
      expect(body.items).toEqual([])
      expect(body.pagination.total).toBe(0)
    })
  })

  it('rejects invalid registry.search input', async () => {
    const response = await handleInvokeAgentTool(
      new Request('https://ae.example/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'registry.search', input: {} }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'error',
      code: 'agent_tools_invalid_input',
      retryable: false,
    })
  })
})

describe('POST /api/agent/tools registry detail', () => {
  it('invokes registry.detail and returns the published business', async () => {
    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleInvokeAgentTool(
        new Request('https://ae.example/api/agent/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'registry.detail',
            input: { slug: 'parramatta-emergency-plumbing' },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        kind: string
        business?: { slug: string }
      }
      expect(body.kind).toBe('found')
      expect(body.business?.slug).toBe('parramatta-emergency-plumbing')
    })
  })

  it('returns a not_found result for an unknown slug without erroring', async () => {
    const state = createDefaultRegistrySourceState()
    await withRegistrySourcePortForTest(state, async () => {
      const response = await handleInvokeAgentTool(
        new Request('https://ae.example/api/agent/tools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'registry.detail',
            input: { slug: 'no-such-business' },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { kind: string; code?: string }
      expect(body.kind).toBe('not_found')
    })
  })
})
