import { describe, expect, it } from 'vitest'

import { buildPublicAgentSkillMarkdown } from '@/modules/discovery/public'
import { handlePublicAgentSkillRequest } from '@/routes/SKILL[.]md'

describe('public agent skill', () => {
  it('teaches hop sequence, write-wall recovery, and boundaries without banned vocabulary', () => {
    const body = buildPublicAgentSkillMarkdown({ canonicalBaseUrl: 'https://ae.example' })
    expect(body).toContain('https://ae.example/llms.txt')
    expect(body).toContain('https://ae.example/api/agent/tools')
    expect(body).toContain('inquiry.submit')
    expect(body).toContain('Accept-Signature')
    expect(body).toContain('x-ae-authority-receipt')
    expect(body).toMatch(/does not book, charge, dispatch, or auto-fulfil/i)
    expect(body).not.toMatch(/MCP|OpenAPI|agent-native|autonomous|mandate|protocol/i)
  })

  it('serves markdown from GET /SKILL.md', async () => {
    const response = handlePublicAgentSkillRequest(new Request('https://ae.example/SKILL.md'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/markdown')
    const text = await response.text()
    expect(text).toContain('Hop sequence')
  })
})
