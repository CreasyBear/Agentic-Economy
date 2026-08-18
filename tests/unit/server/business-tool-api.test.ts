import { describe, expect, it } from 'vitest'

import {
  handleBusinessToolInvoke,
  handleBusinessToolPrepare,
} from '@/lib/server/business-tool-api'
import { BUSINESS_TOOL_AGENT_SCOPE } from '@/modules/business-tools/public'
import { expectQuarantineWriteFrozen } from '../../helpers/http'

const SLUG = 'joondalup-rapid-plumbing'
const TOOL = 'inquiry.submit'

function scopedKey(scopes: readonly string[]) {
  return async () => ({
    isAuthenticated: true,
    tokenType: 'api_key' as const,
    id: 'ak_test',
    subject: 'user_test',
    userId: 'user_test',
    orgId: null,
    scopes,
  })
}

function post(path: string, body: unknown): Request {
  return new Request(`https://ae.test/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>
}

describe('business tool calling over HTTP', () => {
  /**
   * A key is the whole admission story for this surface. Anonymous callers are
   * refused before the handler learns anything about the business, so the
   * endpoint cannot be used to probe which businesses exist or are admitted.
   */
  it('refuses an unauthenticated caller before revealing anything about the business', async () => {
    const response = await handleBusinessToolPrepare(
      post(`${SLUG}/tools/${TOOL}/prepare`, { body: 'hello', contact: {} }),
      SLUG,
      TOOL,
      { authenticate: async () => ({ isAuthenticated: false, tokenType: null, id: null, subject: null, scopes: null }) },
    )

    expect(response.status).toBe(401)
    expect(await readJson(response)).toMatchObject({
      kind: 'UNAUTHENTICATED',
      code: 'authentication_required',
      detail: 'Present a current AE API key.',
      reason: 'Present a current AE API key.',
    })
  })

  it('refuses a key that does not carry the business tool scope', async () => {
    const response = await handleBusinessToolPrepare(
      post(`${SLUG}/tools/${TOOL}/prepare`, { body: 'hello', contact: {} }),
      SLUG,
      TOOL,
      { authenticate: scopedKey(['customer_requests:create']) },
    )

    expect(response.status).toBe(403)
    expect(await readJson(response)).toMatchObject({ kind: 'PERMISSION_DENIED', code: 'scope_required' })
  })

  /**
   * The scope exists to be distinct from the Customer Request scope. A key
   * minted for one plane must not silently authorize the other.
   */
  it('accepts the business tool scope before tool lookup', async () => {
    const refusedByWrongTool = await handleBusinessToolPrepare(
      post(`${SLUG}/tools/nope.doThing/prepare`, { body: 'hello', contact: {} }),
      SLUG,
      'nope.doThing',
      { authenticate: scopedKey([BUSINESS_TOOL_AGENT_SCOPE]) },
    )

    expect(refusedByWrongTool.status).toBe(404)
    expect(await readJson(refusedByWrongTool)).toMatchObject({ kind: 'NOT_FOUND', code: 'unknown_tool' })
  })

  it('freezes authenticated inquiry submit before schema or target checks', async () => {
    const invoke = await handleBusinessToolInvoke(
      post(`${SLUG}/tools/${TOOL}`, { body: '', contact: {}, expectedDigest: 'not-a-digest' }),
      SLUG,
      TOOL,
      { authenticate: scopedKey([BUSINESS_TOOL_AGENT_SCOPE]) },
    )
    await expectQuarantineWriteFrozen(invoke, 'inquiry.submit')

    const prepare = await handleBusinessToolPrepare(
      post(`${SLUG}/tools/${TOOL}/prepare`, {
        body: 'hello',
        contact: {},
        target: { businessSlug: 'somewhere-else', serviceSlug: 'x', capabilityKind: 'phone_inquiry' },
      }),
      SLUG,
      TOOL,
      { authenticate: scopedKey([BUSINESS_TOOL_AGENT_SCOPE]) },
    )
    await expectQuarantineWriteFrozen(prepare, 'inquiry.submit')
  })
})
