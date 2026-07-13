import { describe, expect, it } from 'vitest'

import { buildPublicAgentSkillMarkdown } from '@/modules/discovery/public'
import { handlePublicAgentSkillRequest } from '@/routes/SKILL[.]md'

describe('public agent skill', () => {
  it('teaches the resumable customer Request path and listing boundaries', () => {
    const body = buildPublicAgentSkillMarkdown({ canonicalBaseUrl: 'https://ae.example', routingBaseUrl: 'https://route.ae.example' })
    expect(body).toContain('https://ae.example/llms.txt')
    expect(body).toContain('https://ae.example/api/v1/requests')
    expect(body).toContain('/messages')
    expect(body).toContain('/facts')
    expect(body).toContain('customer_requests:create')
    expect(body).toContain('options_ready')
    expect(body).toContain('https://route.ae.example/.well-known/ae-routing.json')
    expect(body).toMatch(/listings are supply facts, not routing or execution authority/i)
  })

  it('serves markdown from GET /SKILL.md', async () => {
    const response = handlePublicAgentSkillRequest(new Request('https://ae.example/SKILL.md'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/markdown')
    const text = await response.text()
    expect(text).toContain('Request sequence')
  })
})
