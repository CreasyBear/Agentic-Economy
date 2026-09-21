import { describe, expect, it, vi } from 'vitest'
import {
  listMcpActions,
  mcpToolName,
  findAction,
} from '@/modules/actions'
import {
  TOOL_PROCURE_ACTION_ID,
  TOOL_PROCURE_PATH,
  TOOL_PROCURE_ROUTE_CONTRACT,
} from '@/modules/capability-execution/procure.actions'
import {
  CapabilityProcurementEngine,
  type CatalogToolCandidate,
} from '@/modules/capability-execution/procure-engine'
import { handleToolProcurePost } from '@/lib/server/procure-api'
import { postMcp, readMcpBody } from '../server/mcp-api-harness'
import type { CallService } from '@/modules/capability-execution/call-authority'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'

const SAMPLE_PRINCIPAL: AgentAccessPrincipal = {
  principalId: 'prn_00000000000040008000000000000044',
  ownerId: 'acc_00000000000040008000000000000044',
  applicationRef: 'app_test',
  environment: 'production',
  credentialId: 'crd_test',
  scopes: ['market_tools:call'],
  authorityMode: 'spending_policy',
}

const SAMPLE_TOOL_CANDIDATE: CatalogToolCandidate = {
  toolRef: 'operation:v1:timezone_converter',
  name: 'Timezone Converter Service',
  description: 'Convert time between international timezones. Fixed price in AUD.',
  endpoint: 'https://api.timezone.example/convert',
  priceAud: '0.0020',
  inputSchema: {
    type: 'object',
    properties: {
      from: { type: 'string', description: 'Origin timezone' },
      to: { type: 'string', description: 'Target timezone' },
      time: { type: 'string', description: 'Time to convert' },
    },
    required: ['from', 'to'],
  },
}

describe('Native Platform System One Procurement', () => {
  describe('Central Action Registry & MCP Exposure', () => {
    it('registers tool.procure in central action registry', () => {
      const action = findAction(TOOL_PROCURE_ACTION_ID)
      expect(action).toBeDefined()
      expect(action?.id).toBe('tool.procure')
      expect(TOOL_PROCURE_ROUTE_CONTRACT.path).toBe(TOOL_PROCURE_PATH)
      expect(TOOL_PROCURE_ROUTE_CONTRACT.method).toBe('POST')
    })

    it('surfaces ae_tool_procure in MCP actions catalog with correct tool name', () => {
      const mcpActions = listMcpActions()
      const procureMcp = mcpActions.find((a) => a.id === TOOL_PROCURE_ACTION_ID)
      expect(procureMcp).toBeDefined()
      expect(mcpToolName(procureMcp!)).toBe('ae_tool_procure')
      expect(procureMcp?.surfaces).toContain('mcp')
      expect(procureMcp?.credentialAdmission?.scope).toBe('market_tools:call')
    })

    it('executes ae_tool_procure over MCP protocol via CallService delegation', async () => {
      const mockCallService: CallService = {
        quoteTool: vi.fn().mockResolvedValue({
          kind: 'quoted',
          quoteRef: 'quote:mock:12345',
          toolRef: SAMPLE_TOOL_CANDIDATE.toolRef,
          price: { currency: 'AUD', units: '2000', exponent: 6 },
          account: {
            accountRef: 'acc:mock',
            available: { currency: 'AUD', units: '10000000', exponent: 6 },
          },
          budget: {
            principalRef: 'prn:mock',
            maximumPerCall: { currency: 'AUD', units: '10000000', exponent: 6 },
          },
          policyRefs: [],
          evidenceDigest: 'evidence:mock',
          continuation: {
            action: 'tool.call',
            method: 'POST',
            path: '/api/v1/tools/call',
            input: {
              quoteRef: 'quote:mock:12345',
              idempotencyKey: 'idemp:mock',
            },
          },
        }),
        callTool: vi.fn().mockResolvedValue({
          kind: 'completed',
          callRef: 'call:mock:999',
          toolRef: SAMPLE_TOOL_CANDIDATE.toolRef,
          output: { convertedTime: '2026-09-20T08:00:00+10:00' },
          evidenceHash: 'hash:123',
          usage: {
            usageRef: 'usage:123',
            observedAt: Date.now(),
            chargeState: 'paid',
            amount: { currency: 'AUD', units: '2000', exponent: 6 },
            priceDigest: 'digest:123',
          },
        }),
        readCallStatus: vi.fn(),
        cancelCall: vi.fn(),
        reconcileCall: vi.fn(),
      }

      const response = await postMcp(
        {
          jsonrpc: '2.0',
          id: 101,
          method: 'tools/call',
          params: {
            name: 'ae_tool_procure',
            arguments: {
              need: 'Convert 10:00 AM London time to Sydney time',
              maxSpendAud: '0.50',
            },
          },
        },
        {
          authenticate: async () => ({
            isAuthenticated: true,
            tokenType: 'api_key',
            id: 'key:test',
            subject: 'user_test',
            scopes: ['market_tools:call'],
          }),
          resolvePrincipal: async (projection) => ({
            ...projection,
            principalId: SAMPLE_PRINCIPAL.principalId,
            ownerId: SAMPLE_PRINCIPAL.ownerId,
          }),
          callService: mockCallService,
          catalogSearcher: async () => [SAMPLE_TOOL_CANDIDATE],
        },
        {
          authorization: 'Bearer buyer-only',
        },
      )

      expect(response.status).toBe(200)
      const body = await readMcpBody(response)
      const structured = (body.result?.structuredContent as { result?: unknown } | undefined)?.result
      expect(structured).toMatchObject({
        schemaVersion: 'tool.procure:v1',
        kind: 'delivered',
        status: 'delivered',
        toolRef: SAMPLE_TOOL_CANDIDATE.toolRef,
        price: {
          totalAud: 'A$0.0020',
          netAud: 'A$0.0018',
          gstAud: 'A$0.0002',
        },
      })
      expect(mockCallService.quoteTool).toHaveBeenCalledOnce()
      expect(mockCallService.callTool).toHaveBeenCalledOnce()
    })
  })

  describe('Native CallService & Budget Guardrails', () => {
    it('halts immediately before callTool when budget is exceeded at quote step', async () => {
      const mockCallService: CallService = {
        quoteTool: vi.fn().mockResolvedValue({
          kind: 'quoted',
          quoteRef: 'quote:mock:expensive',
          toolRef: SAMPLE_TOOL_CANDIDATE.toolRef,
          price: { currency: 'AUD', units: '1500000', exponent: 6 },
          account: {
            accountRef: 'acc:mock',
            available: { currency: 'AUD', units: '10000000', exponent: 6 },
          },
          budget: {
            principalRef: 'prn:mock',
            maximumPerCall: { currency: 'AUD', units: '10000000', exponent: 6 },
          },
          policyRefs: [],
          evidenceDigest: 'evidence:mock',
          continuation: {
            action: 'tool.call',
            method: 'POST',
            path: '/api/v1/tools/call',
            input: {
              quoteRef: 'quote:mock:expensive',
              idempotencyKey: 'idemp:mock',
            },
          },
        }),
        callTool: vi.fn(),
        readCallStatus: vi.fn(),
        cancelCall: vi.fn(),
        reconcileCall: vi.fn(),
      }

      const engine = new CapabilityProcurementEngine({
        catalogSearcher: async () => [SAMPLE_TOOL_CANDIDATE],
        callService: mockCallService,
        principal: SAMPLE_PRINCIPAL,
      })

      const outcome = await engine.procure({
        need: 'Convert 10:00 AM London to Sydney',
        maxSpendAud: '0.50',
      })

      expect(outcome.status).toBe('refused')
      if (outcome.status === 'refused') {
        expect(outcome.code).toBe('budget_exceeded')
        expect(outcome.detail).toContain('exceeds maximum spend budget')
      }
      expect(mockCallService.quoteTool).toHaveBeenCalledOnce()
      expect(mockCallService.callTool).not.toHaveBeenCalled()
    })

    it('propagates policy refusal from CallService quoteTool', async () => {
      const mockCallService: CallService = {
        quoteTool: vi.fn().mockResolvedValue({
          kind: 'refused',
          toolRef: SAMPLE_TOOL_CANDIDATE.toolRef,
          code: 'budget_exceeded',
          reason: 'Daily policy limit exceeded for account.',
          retryable: false,
          correlationRef: 'corr:test',
        }),
        callTool: vi.fn(),
        readCallStatus: vi.fn(),
        cancelCall: vi.fn(),
        reconcileCall: vi.fn(),
      }

      const engine = new CapabilityProcurementEngine({
        catalogSearcher: async () => [SAMPLE_TOOL_CANDIDATE],
        callService: mockCallService,
        principal: SAMPLE_PRINCIPAL,
      })

      const outcome = await engine.procure({
        need: 'Convert 10:00 AM London to Sydney',
      })

      expect(outcome.status).toBe('refused')
      if (outcome.status === 'refused') {
        expect(outcome.code).toBe('budget_exceeded')
        expect(outcome.detail).toBe('Daily policy limit exceeded for account.')
      }
      expect(mockCallService.callTool).not.toHaveBeenCalled()
    })
  })

  describe('HTTP Surface Authentication Gate', () => {
    it('returns 401 Bearer challenge when unauthenticated request hits POST /api/v1/tools/procure', async () => {
      const request = new Request('http://ae.test/api/v1/tools/procure', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          need: 'Convert 10:00 AM London to Sydney',
        }),
      })

      const response = await handleToolProcurePost(request)
      expect(response.status).toBe(401)
      expect(response.headers.get('www-authenticate')).toContain('Bearer')
      const body = await response.json()
      expect(body.code).toBe('authentication_required')
    })
  })
})
