import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { HarnessAuthorityBoundaryScheme } from '@/modules/harness/query-authority-receipt'
import { handleInvokeAgentTool } from '@/routes/api.agent.tools'

const REQUEST_URL = 'https://ae.example/api/agent/tools'

const SAVED_KEYS = [
  'VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E',
  'AE_CLEARANCE_SIGNING_SECRET',
  'AE_CLEARANCE_SIGNING_KEY_ID',
] as const

const saved: Record<string, string | undefined> = {}

beforeEach(() => {
  for (const key of SAVED_KEYS) {
    saved[key] = process.env[key]
  }
  // Local-e2e bypass lets registry reads resolve without a live Convex deployment.
  process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
  process.env.AE_CLEARANCE_SIGNING_SECRET = 'integration-clearance-secret'
  process.env.AE_CLEARANCE_SIGNING_KEY_ID = 'integration-key-1'
})

afterEach(() => {
  for (const key of SAVED_KEYS) {
    const value = saved[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

function searchRequest(): Request {
  return new Request(REQUEST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool: 'registry.search', input: { query: 'parramatta' } }),
  })
}

describe('quiet agent door authority receipt exposure', () => {
  it('carries a signed kernel authority-boundary receipt on a successful query response', async () => {
    const response = await handleInvokeAgentTool(searchRequest())
    const bodyText = await response.text()

    expect(response.status, bodyText).toBe(200)

    const receiptRef = response.headers.get('x-ae-authority-receipt')
    expect(receiptRef, bodyText).toMatch(/^harness-query-authority-receipt:v1:hash:/)
    expect(response.headers.get('x-ae-authority-boundary')).toBe(HarnessAuthorityBoundaryScheme)
    expect(response.headers.get('x-ae-authority-signature-posture')).toBe('local_hmac')
    expect(response.headers.get('x-ae-authority-signature')).toContain('integration-key-1:')

    // The receipt is machine metadata only: the response body is the raw tool
    // output and must not leak the receipt reference into agent-visible copy.
    expect(bodyText).not.toContain('x-ae-authority-receipt')
    expect(bodyText).not.toContain(receiptRef ?? 'MISSING_RECEIPT')
  })

  it('reproduces the same receipt reference for an identical query (replay-safe)', async () => {
    const first = await handleInvokeAgentTool(searchRequest())
    const second = await handleInvokeAgentTool(searchRequest())

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.headers.get('x-ae-authority-receipt')).toBe(
      first.headers.get('x-ae-authority-receipt'),
    )
  })
})
