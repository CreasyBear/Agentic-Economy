import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { buildPublicAgentSkillMarkdown } from '@/modules/discovery/public'
import { listMcpActions, mcpToolName } from '@/modules/actions'
import handlePublicAgentSkillNitroRequest, { handlePublicAgentSkillRequest } from '@/routes/SKILL[.]md'

const packagedSkill = readFileSync(new URL('../../plugins/agentic-economy/skills/use-agentic-economy/SKILL.md', import.meta.url), 'utf8')

describe('public agent skill', () => {
  it('serves the exact packaged skill for every public content negotiation choice', async () => {
    for (const accept of ['*/*', 'application/json', 'text/markdown', 'text/plain', 'text/html']) {
      const response = handlePublicAgentSkillRequest(new Request('https://ae.example/SKILL.md', {
        headers: { Accept: accept },
      }))
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('text/markdown')
      expect(await response.text()).toBe(packagedSkill)
    }
    expect(buildPublicAgentSkillMarkdown({ canonicalBaseUrl: 'https://ae.example' })).toBe(packagedSkill)
  })

  it('only names existing MCP tools and keeps the instructions compact', () => {
    const available = new Set(listMcpActions().map(mcpToolName))
    const named = [...packagedSkill.matchAll(/`(ae_[A-Za-z0-9_]+)`/gu)].map((match) => match[1])
    expect(named.length).toBeGreaterThan(4)
    for (const name of named) {
      expect(name).toBeDefined()
      expect(available.has(name ?? ''), name).toBe(true)
    }
    expect(new TextEncoder().encode(packagedSkill).length).toBeLessThan(8192)
    expect(packagedSkill).toMatch(/^---\nname: agentic-economy\ndescription: .+\n---\n/u)
  })

  it('ships a remote MCP plugin with one skill and no embedded credentials', () => {
    const pluginRoot = new URL('../../plugins/agentic-economy/', import.meta.url)
    const manifest = JSON.parse(readFileSync(new URL('.codex-plugin/plugin.json', pluginRoot), 'utf8'))
    const mcp = JSON.parse(readFileSync(new URL('.mcp.json', pluginRoot), 'utf8'))
    expect(manifest.name).toBe('agentic-economy')
    expect(manifest.skills).toBe('./skills/')
    expect(manifest.mcpServers).toBe('./.mcp.json')
    expect(mcp).toEqual({ mcpServers: { 'agentic-economy': { type: 'http', url: 'https://app.aecon.ai/mcp' } } })
    expect(manifest.description).toContain('Tool')
    expect(manifest.interface.shortDescription).toContain('Tools')
    expect(manifest.interface.longDescription).toContain('Tools')
    expect(manifest.interface.longDescription).not.toMatch(/\bOperations?\b/u)
    const prompts = manifest.interface.defaultPrompt.join(' ')
    expect(prompts).toContain('Tool')
    expect(prompts).not.toMatch(/\bOperations?\b/u)
    expect(manifest.interface.defaultPrompt.length).toBeLessThanOrEqual(3)
    for (const prompt of manifest.interface.defaultPrompt) expect(prompt.length).toBeLessThanOrEqual(128)
  })

  it('answers HEAD with discovery headers and rejects unsupported methods', async () => {
    const response = handlePublicAgentSkillNitroRequest({
      req: new Request('https://ae.example/SKILL.md', { method: 'HEAD' }),
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/markdown')
    expect(await response.text()).toBe('')
    expect(handlePublicAgentSkillNitroRequest({
      req: new Request('https://ae.example/SKILL.md', { method: 'POST' }),
    }).status).toBe(405)
  })
})
