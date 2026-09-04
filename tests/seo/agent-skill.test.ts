import { describe, expect, it } from 'vitest'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'

import { buildPublicAgentSkillMarkdown } from '@/modules/discovery/public'
import { findAction, listMcpActions, listOperationRouteDescriptors, mcpToolName } from '@/modules/actions'
import { AGENT_ACCOUNT_SELF_ACTION_ID } from '@/modules/agent-access/account.actions'
import { OPERATION_INSPECT_ACTION_ID } from '@/modules/capability-execution/operation-commitment'
import handlePublicAgentSkillNitroRequest, { handlePublicAgentSkillRequest } from '@/routes/SKILL[.]md'

const body = buildPublicAgentSkillMarkdown({
  canonicalBaseUrl: 'https://ae.example',
  routingBaseUrl: 'https://route.ae.example',
})

describe('public agent skill', () => {
  it('teaches the exact Operation market loop in order', () => {
    expect(body).toMatch(/^---\nname: agentic-economy\ndescription: .+\n---\n/u)
    const inspect = findAction(OPERATION_INSPECT_ACTION_ID)
    expect(inspect).toBeDefined()
    const commands = [
      'ae search "weather forecast" --json',
      'ae describe "$AE_OPERATION_REF" --json',
      mcpToolName(inspect!),
      'codex mcp add agentic-economy --url "https://ae.example/mcp"',
      'ae_agentAccess_whoami',
      'ae call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --json',
      'ae wait "$AE_INVOCATION_REF" --json',
      'ae recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json',
    ]
    let previous = -1
    for (const command of commands) {
      const current = body.indexOf(command)
      expect(current).toBeGreaterThan(previous)
      previous = current
    }
  })
  it('opens with truthful native client authentication and agent-owned verification', () => {
    const whoami = findAction(AGENT_ACCOUNT_SELF_ACTION_ID)
    expect(whoami).toBeDefined()
    const whoamiToolName = mcpToolName(whoami!)
    const funnelMarkers = [
      '## 1. Search first — no connection required',
      '## 2. Inspect exact terms',
      'codex mcp add agentic-economy --url "https://ae.example/mcp"',
      'codex mcp login agentic-economy',
      'claude mcp add --transport http --scope user agentic-economy "https://ae.example/mcp"',
      'open /mcp, select agentic-economy, then choose Authenticate',
      'cursor --add-mcp \'{"name":"agentic-economy","url":"https://ae.example/mcp"}\'',
      'follow its OAuth prompt',
      whoamiToolName,
      'Report the connected Agent Principal and Account',
      '## 3. Review and invoke',
      'State the price and required input',
    ]
    let previous = -1
    for (const marker of funnelMarkers) {
      const current = body.indexOf(marker)
      expect(current).toBeGreaterThan(previous)
      previous = current
    }
    expect(body).toContain('use the native entry for the current client')
    expect(body).toContain('returns to the same task')
    expect(body).not.toContain('the client opens standard OAuth approval')
    expect(body).not.toContain('codex mcp login agentic-economy --scopes')
    expect(body).not.toMatch(/add-mcp@|restart|npm install|AE_API_KEY=/u)
  })

  it('gives supplier agents a bounded owner-approved onboarding path', () => {
    expect(body).toContain('## Supplier path')
    expect(body).toContain('ae connect --supplier --json')
    expect(body).toContain('ae supply preview --input "$AE_SOURCE_JSON" --json')
    expect(body).toContain('ae supply publish --input "$AE_PUBLICATION_JSON" --json')
    expect(body).toContain('ae supply status "$AE_BUSINESS_REF" "$AE_OPERATION_REF" --json')
    expect(body).toContain('Never put Provider credentials in MCP fields or CLI arguments')
  })

  it('recovers insufficient balance through the agent funding handoff', () => {
    expect(body).toContain('## If credit runs short')
    expect(body).toContain('`funding.handoff.create`')
    expect(body).toContain('`funding.handoff.status`')
    expect(body).toContain('explicitly resubmit the original Operation')
  })

  it('closes on the evidence expectation', () => {
    expect(body).toContain('## What counts as proof')
    expect(body).toContain('literal output plus an `evidenceHash`')
    expect(body).toContain('job stays unproven')
  })
  it('publishes the canonical catalogue outage rule', () => {
    expect(body).toContain('`operation_read_unavailable` means no catalogue read completed')
    expect(body).toContain('It is retryable')
    expect(body).toContain('never proof that an Operation is absent')
    expect(body).toContain('never permission to reuse stale terms')
  })
  it('distinguishes invoke outcomes from status diagnostics', () => {
    expect(body).toContain('it cannot call, retry, or grant authority')
    expect(body).toContain('ae status "$AE_INVOCATION_REF" --json` reads once')
    expect(body).toContain(
      'Outcomes (`result.kind`): `completed | pending | needs_authority | reconciliation_required | refused`.',
    )
    expect(body).toContain(
      'Diagnostics (`found.state`): `gathering_information | awaiting_authority | authorized | leased | in_progress | retryable | reconciliation_required | terminal | cancelled | invalidated`.',
    )
  })

  it('names the anonymous read and authenticated invoke/recovery routes', () => {
    for (const path of [
      '/api/v1/market-operations/list',
      '/api/v1/market-operations/search',
      '/api/v1/market-operations/describe',
      '/api/v1/market-operations/compare',
      '/api/v1/operations/inspect',
    ]) {
      expect(body).toContain(`POST https://ae.example${path}`)
    }
    expect(body).toContain('POST https://ae.example/api/v1/operations/call')
    expect(body).toContain('GET https://ae.example/api/v1/operations/{invocationRef}')
    expect(body).toContain('POST https://ae.example/api/v1/operations/{invocationRef}/reconcile')
    expect(body.indexOf('/api/v1/market-operations/search')).toBeLessThan(body.indexOf('ae connect --json'))
  })

  it('keeps authentication separate from authority and provider credentials', () => {
    expect(body).toContain('If challenged')
    expect(body).toContain('authenticated account read')
    expect(body).toContain('Report the connected Agent Principal and Account')
    expect(body).toContain('The AE key identifies the caller.')
    expect(body).toMatch(/never contains or grants a provider credential/u)
    expect(body).toMatch(/silent consequential authority/u)
    expect(body).toContain('The request JSON body field `idempotencyKey` is required')
    expect(body).toMatch(/same key with identical material replays the original state/u)
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
    expect(body).toContain('If challenged')
    expect(body).toContain('Price may be zero')
    expect(body).toContain('explicit authority approval')
    expect(body).toContain('literal output plus an `evidenceHash`')
  })
  it('documents the installed MCP lifecycle without teaching the legacy business registry', () => {
    expect(body).toContain(`protocol \`${LATEST_PROTOCOL_VERSION}\``)
    expect(body).toContain('the client performs initialization')
    expect(body).toContain('may omit `Mcp-Session-Id`')
    expect(body).toContain('`tools/list` before `tools/call`')
    expect(body).not.toContain('Business catalog is business-only')
    expect(body).not.toContain('`registry.search`')
    expect(body).not.toContain('`registry.detail`')
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
      expect(text).toContain('ae search "weather forecast" --json')
      expect(text).toContain('ae recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --json')
    }
  })

  it('answers HEAD probes with the same discovery headers and no body', async () => {
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
