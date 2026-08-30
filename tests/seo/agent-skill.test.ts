import { describe, expect, it } from 'vitest'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'

import { buildPublicAgentSkillMarkdown } from '@/modules/discovery/public'
import { AGENT_ACCESS_OAUTH_PATHS } from '@/modules/agent-access/oauth-state'
import { listMcpActions, listOperationRouteDescriptors, mcpToolName } from '@/modules/actions'
import { handlePublicAgentSkillRequest } from '@/routes/SKILL[.]md'

const body = buildPublicAgentSkillMarkdown({
  canonicalBaseUrl: 'https://ae.example',
  routingBaseUrl: 'https://route.ae.example',
})

describe('public agent skill', () => {
  it('teaches the exact Operation market loop in order', () => {
    expect(body).toMatch(/^---\nname: agentic-economy\ndescription: .+\n---\n/u)
    const commands = [
      'curl -fsSL https://ae.example/.well-known/ucp',
      'ae search "weather forecast" --json',
      'ae inspect "$AE_OPERATION_REF" --json',
      'ae call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --json',
      'ae connect --json',
      'ae status "$AE_INVOCATION_REF" --json',
      'ae recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json',
    ]
    let previous = -1
    for (const command of commands) {
      const current = body.indexOf(command)
      expect(current).toBeGreaterThan(previous)
      previous = current
    }
  })
  it('opens with the activation funnel before the market loop', () => {
    const funnelMarkers = [
      '## 1. Pick your path',
      '/llms.txt',
      '/for-agents',
      'npm install --global @agentic-economy/cli',
      'tell your human what you needed',
      '## 2. Price rule — before any paid call',
      'state the total price and the required inputs',
      '## 3. Search by job',
    ]
    let previous = -1
    for (const marker of funnelMarkers) {
      const current = body.indexOf(marker)
      expect(current).toBeGreaterThan(previous)
      previous = current
    }
    expect(body).toMatch(/names begin with `ae_`/u)
    expect(body).toContain('anonymously and free')
  })

  it('gives supplier agents a bounded owner-approved onboarding path', () => {
    expect(body).toContain('## Supplier path')
    expect(body).toContain('Operation: one job')
    expect(body).toContain('ae connect --supplier --json')
    expect(body).toContain('ae doctor "$AE_BUSINESS_ID" --supplier --json')
    expect(body).toContain('never submit provider keys or count setup tests as earnings')
  })

  it('recovers from insufficient credit through the served operator page', () => {
    expect(body).toContain('## If credit runs short')
    expect(body).toContain('`insufficient_credit`')
    expect(body).toContain('`retryable: false`')
    expect(body).toContain('https://ae.example/owner/credit')
    expect(body).toContain('add credit at https://ae.example/owner/credit')
  })

  it('closes on the evidence expectation', () => {
    expect(body).toContain('## What counts as proof')
    expect(body).toContain('literal output plus an `evidenceHash`')
    expect(body).toContain('job stays unproven')
  })
  it('distinguishes invoke outcomes from status diagnostics', () => {
    expect(body).toContain(
      'Only `result.kind` is the operation outcome when present: `completed | pending | needs_authority | reconciliation_required | refused`.',
    )
    expect(body).toContain(
      "A status response's `found.state` is a recovery diagnostic, not an extra operation outcome: `gathering_information | awaiting_authority | authorized | leased | in_progress | retryable | reconciliation_required | terminal | cancelled | invalidated`.",
    )
  })

  it('names the anonymous read and authenticated invoke/recovery routes', () => {
    for (const path of [
      '/api/v1/market-operations/search',
      '/api/v1/market-operations/detail',
      '/api/v1/market-operations/compare',
      '/api/v1/market-operations/inspect-plan',
    ]) {
      expect(body).toContain(`POST https://ae.example${path}`)
    }
    expect(body).toContain('POST https://ae.example/api/v1/operations/call')
    expect(body).toContain('GET https://ae.example/api/v1/operations/{invocationRef}')
    expect(body).toContain('POST https://ae.example/api/v1/operations/{invocationRef}/reconcile')
    expect(body.indexOf('/api/v1/market-operations/search')).toBeLessThan(body.indexOf('ae connect --json'))
  })

  it('keeps the single caller key boundary explicit', () => {
    expect(body).toContain(`https://ae.example${AGENT_ACCESS_OAUTH_PATHS.deviceVerification}?user_code=...`)
    expect(body).toContain('POST https://ae.example/oauth/register')
    expect(body).toContain('POST https://ae.example/oauth/device_authorization')
    expect(body).toContain('POST https://ae.example/oauth/token')
    expect(body).toContain('The AE key identifies the caller.')
    expect(body).toMatch(/never contains or grants a provider credential/u)
    expect(body).toMatch(/silent consequential authority/u)
    expect(body).toContain('The request JSON body field `idempotencyKey` is required')
    expect(body).toMatch(/same key with identical material replays the original state/u)
    expect(body).toContain('export AE_CLI_BASE_URL="https://ae.example"')
  })

  it('documents the MCP projection from the registered action graph', () => {
    expect(body).toContain('https://ae.example/mcp')
    const anonymousToolNames = listMcpActions()
      .filter((action) => action.readOnly && action.credentialAdmission === undefined)
      .map(mcpToolName)
    const authenticatedToolNames = listOperationRouteDescriptors()
      .map(({ mcpToolName }) => mcpToolName)
      .filter((name): name is string => name !== undefined)
    const projection = `Endpoint: \`https://ae.example/mcp\`. Anonymous tools: ${anonymousToolNames.map((name) => `\`${name}\``).join(', ')}. Authenticated tools: ${authenticatedToolNames.map((name) => `\`${name}\``).join(', ')}.`
    expect(body).toContain(projection)
    expect(body).toContain('Connect once with AE')
    expect(body).toContain('price may be zero')
    expect(body).toContain('explicit authority approval')
    expect(body).toContain('return literal output plus an `evidenceHash`')
  })
  it('documents the installed MCP lifecycle and the business-only catalog boundary', () => {
    expect(body).toContain(`protocol \`${LATEST_PROTOCOL_VERSION}\``)
    expect(body).toContain('the client performs initialization')
    expect(body).toContain('may omit `Mcp-Session-Id`')
    expect(body).toContain('`tools/list` before `tools/call`')
    expect(body).toContain('Business catalog is business-only')
    expect(body).toContain('`registry.search` and `registry.detail` read published businesses')
  })

  it('removes the old alternate entry vocabulary and unsupported claims', () => {
    expect(body).not.toMatch(/\bae (?:feeds|run|study)\b/u)
    expect(body).not.toMatch(/Services API|\/api\/v1\/services|\/api\/businesses/u)
    expect(body).toContain('Never infer fulfilment, payment, deployment, or a receipt')
    expect(body).not.toMatch(/\bae reconcile\b/u)
  })

  it('stays under the 8 KB budget for a cold fetch', () => {
    expect(new TextEncoder().encode(body).length).toBeLessThan(8192)
  })

  it('serves one markdown response for the cold-client Accept matrix', async () => {
    const accepts = [undefined, '*/*', 'application/json', 'text/markdown', 'text/plain', 'text/html,application/xhtml+xml'] as const
    let canonicalText: string | undefined

    for (const accept of accepts) {
      const response = handlePublicAgentSkillRequest(new Request('https://ae.example/SKILL.md', {
        ...(accept === undefined ? {} : { headers: { Accept: accept } }),
      }))
      expect(response.status).toBe(200)
      expect(response.headers.get('Content-Type')).toContain('text/markdown')
      const text = await response.text()
      canonicalText ??= text
      expect(text).toBe(canonicalText)
      expect(text).toContain('ae manifest --json')
      expect(text).toContain('ae recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json')
    }
  })
})
