import { describe, expect, it } from 'vitest'

import { buildPublicAgentSkillMarkdown } from '@/modules/discovery/public'
import { handlePublicAgentSkillRequest } from '@/routes/SKILL[.]md'

describe('public agent skill', () => {
  it('teaches descriptor, quote authorization, inspection, and listing boundaries', () => {
    const body = buildPublicAgentSkillMarkdown({ canonicalBaseUrl: 'https://ae.example', routingBaseUrl: 'https://route.ae.example' })
    expect(body).toContain('https://ae.example/llms.txt')
    expect(body).toContain('https://route.ae.example/.well-known/ae-routing.json')
    expect(body).toContain('Authorize before `execute`')
    expect(body).toContain('`inspect` and `cancel`')
    expect(body).toMatch(/listings are supply facts, not routing or execution authority/i)
  })

  it('serves markdown from GET /SKILL.md', async () => {
    const response = handlePublicAgentSkillRequest(new Request('https://ae.example/SKILL.md'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/markdown')
    const text = await response.text()
    expect(text).toContain('Hop sequence')
  })
})
