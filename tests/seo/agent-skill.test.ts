import { describe, expect, it } from 'vitest'

import { buildPublicAgentSkillMarkdown } from '@/modules/discovery/public'
import { CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES } from '@/modules/customer-request/public-comprehension'
import { AGENT_KEY_ISSUANCE_PATH, ANSWER_THREAD_AGENT_ENTRYPOINT } from '@/modules/answer-thread/public'
import { listMcpActions, mcpToolName } from '@/modules/actions'
import { handlePublicAgentSkillRequest } from '@/routes/SKILL[.]md'

const body = buildPublicAgentSkillMarkdown({
  canonicalBaseUrl: 'https://ae.example',
  routingBaseUrl: 'https://route.ae.example',
  mcpToolNames: listMcpActions().map(mcpToolName),
})

describe('public agent skill', () => {
  it('teaches the resumable customer Request path and listing boundaries', () => {
    expect(body).toContain('https://ae.example/llms.txt')
    expect(body).toContain('https://ae.example/api/v1/requests')
    expect(body).toContain('customer_requests:create')
    expect(body).toContain('navigation.actions')
    expect(body).toContain('routes_ready')
    for (const statement of CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES) {
      expect(body).toContain(statement)
    }
    expect(body).not.toMatch(/\/messages|\/facts|\/confirmation|\/run|\/evidence|\/problems|\/cancellation/u)
    expect(body).not.toMatch(/route\.ae\.example|\.well-known\/ae-routing|\/v1\/route/)
    expect(body).toMatch(/listings are supply facts, not routing or execution authority/i)
    expect(body).toContain('https://ae.example/mcp')
    expect(body).toContain('claude mcp add --transport http agentic-economy https://ae.example/mcp')
    expect(body).toContain('codex mcp add agentic-economy --url https://ae.example/mcp')
    const mcpToolNames = listMcpActions().map(mcpToolName)
    expect(mcpToolNames).toEqual([
      'ae_registry_services_list',
      'ae_registry_services_search',
      'ae_registry_detail',
      'ae_registry_operations_search',
      'ae_registry_operations_detail',
      'ae_registry_operations_compare',
      'ae_registry_operations_inspectPlan',
      'ae_sandbox_checkup_quote',
    ])
    for (const toolName of mcpToolNames) {
      expect(body).toContain(`- \`${toolName}\``)
    }
  })
  it('advertises the complete authenticated WorkTree repeat surface and exact scopes', () => {
    expect(body).toContain('/api/v1/work-tree/{create|inspect|apply|decide|reserveRepeatUse|finalizeRepeatUse|reconcileRepeatUse|inspectRepeatUse}')
    for (const scope of [
      'work_trees:create',
      'work_trees:inspect',
      'work_trees:apply',
      'work_trees:decide',
      'work_trees:repeat_reserve',
      'work_trees:repeat_finalize',
      'work_trees:repeat_reconcile',
      'work_trees:repeat_inspect',
    ]) {
      expect(body).toContain(`\`${scope}\``)
    }
    expect(body).not.toContain('work_trees:*')
    expect(body).toContain('(approve-each writes)')
    expect(body).toContain('(inspect-only)')
  })

  it('leads with the keyless entry before any key-gated instruction', () => {
    const keylessHeading = body.indexOf('## Start here (no key needed)')
    const keylessCall = body.indexOf(`${ANSWER_THREAD_AGENT_ENTRYPOINT.method} https://ae.example${ANSWER_THREAD_AGENT_ENTRYPOINT.path}`)
    const firstScopeMention = body.indexOf('customer_requests:create')
    expect(keylessHeading).toBeGreaterThanOrEqual(0)
    expect(keylessCall).toBeGreaterThan(keylessHeading)
    expect(keylessCall).toBeLessThan(firstScopeMention)
    expect(body).toContain(ANSWER_THREAD_AGENT_ENTRYPOINT.boundary)
    expect(body).toContain(ANSWER_THREAD_AGENT_ENTRYPOINT.responseMediaType)
    expect(body).toContain('https://ae.example/api/businesses')
    expect(body).toContain('https://ae.example/api/businesses/search?q=')
  })

  it('teaches the keyless Services API flow and sandbox boundary', () => {
    const servicesStart = body.indexOf('## Services API')
    const customerRequestStart = body.indexOf('## Confirming and starting an option')
    const servicesSection = body.slice(servicesStart, body.indexOf('## What AE is'))

    expect(servicesStart).toBeGreaterThanOrEqual(0)
    expect(servicesStart).toBeLessThan(customerRequestStart)
    expect(servicesSection).toContain('GET /api/v1/services')
    expect(servicesSection).toContain('GET /api/v1/services/search?q={query}')
    expect(servicesSection).toContain('ONE PAGE')
    expect(servicesSection).toContain('pagination.nextCursor')
    expect(servicesSection).toContain('pagination.hasMore')
    expect(servicesSection).toContain('summary')
    expect(servicesSection).toContain('pricingSummary')
    expect(servicesSection).toContain('price')
    expect(servicesSection).toContain('Discover services')
    expect(servicesSection).toContain('Pick a service')
    expect(servicesSection).toContain("access: 'open'")
    expect(servicesSection).toContain('business_declared')
    expect(servicesSection).toContain('publicly_observed')
    expect(servicesSection).toContain('QUOTE RESPONSE carries `provenance: ae_sandbox_provider`')
    expect(servicesSection).toContain('priced, time-bounded quote JSON')
    expect(servicesSection).not.toContain('description')
    expect(servicesSection).not.toMatch(/payment|x402|booked/iu)
  })


  it('says where a key is issued and what it costs to go without one', () => {
    expect(body).toContain(`https://ae.example${AGENT_KEY_ISSUANCE_PATH}`)
    expect(body).toContain('/agent-access')
    expect(body).toMatch(/seven days/)
    expect(body).toMatch(/revoke/i)
    expect(body).toMatch(/cannot confirm or start anything/)
  })

  it('branches on host without asking the customer to choose', () => {
    expect(body).toContain('## Choose your setup')
    expect(body).toMatch(/Claude Code, Codex CLI, Gemini CLI/)
    expect(body).toMatch(/Never ask the customer which one to use/)
    expect(body).toMatch(/Do not say "endpoint", "SSE", or "Bearer token"/)
  })

  it('recovers from every advertised refusal through a symptom table', () => {
    expect(body).toContain('| Symptom | Meaning | Do next |')
    for (const symptom of ['401', '403', '429', '413', 'routes_ready', 'route_confirmed', 'in_progress', 'outcome_unknown', 'cancelled', 'needs_attention']) {
      expect(body).toMatch(new RegExp(`^\\| \`${symptom}\` \\|.+\\|.+\\|$`, 'mu'))
    }
    expect(body).toMatch(/^\| No search results \|.+\|.+\|$/mu)
    expect(body).toMatch(/200 characters/)
  })

  it('stays under the 8 KB budget for a cold fetch', () => {
    expect(new TextEncoder().encode(body).length).toBeLessThan(8192)
  })

  it('serves markdown from GET /SKILL.md', async () => {
    const response = handlePublicAgentSkillRequest(new Request('https://ae.example/SKILL.md'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/markdown')
    const text = await response.text()
    expect(text).toContain('Start here (no key needed)')
    expect(text).toContain('Confirming and starting an option')
  })
})
