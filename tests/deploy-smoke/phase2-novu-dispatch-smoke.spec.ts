import { expect, test } from '@playwright/test'
import { parseHttpsUrl, parseJsonObject, readRequiredString, resolvePath } from '../helpers/deployed-smoke'

type NovuDispatchSmokeConfig = {
  baseUrl: URL
  outboxSecret: string
  dispatchId: string
}

let config: NovuDispatchSmokeConfig | undefined

test.describe('Phase 2 Novu dispatch provider smoke', () => {
  test.beforeAll(() => {
    config = readNovuDispatchSmokeConfig()
  })

  test('guarded dispatch route triggers or confirms a real Novu-backed notification readback', async ({ request }) => {
    const smokeConfig = requireNovuDispatchSmokeConfig()
    const response = await request.post(resolvePath('/api/notification/novu-dispatch', smokeConfig.baseUrl), {
      data: { dispatchId: smokeConfig.dispatchId },
      headers: {
        Authorization: `Bearer ${smokeConfig.outboxSecret}`,
      },
      failOnStatusCode: false,
      timeout: 30_000,
    })
    const bodyText = await response.text()
    const body = parseJsonObject(bodyText)
    const code = readRequiredString(body, 'code')
    const dispatchStatus = readRequiredString(body, 'dispatchStatus')
    const novuTransactionId = readRequiredString(body, 'novuTransactionId')
    const readbackProviderResponseHash = readRequiredString(body, 'readbackProviderResponseHash')

    expect(response.status(), bodyText).toBe(200)
    expect(response.headers()['cache-control'] ?? '').toContain('no-store')
    expect(body).toMatchObject({
      kind: 'ok',
      dispatchId: smokeConfig.dispatchId,
      businessSlug: expect.any(String),
    })
    expect(['notification_novu_triggered', 'notification_novu_already_recorded']).toContain(code)
    expect(['triggered', 'sent', 'delivered']).toContain(dispatchStatus)
    expect(novuTransactionId).toEqual(expect.any(String))
    expect(readbackProviderResponseHash).toEqual(expect.any(String))
    expect(body.novuMessageCount).toEqual(expect.any(Number))
    expect(bodyText).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    expect(bodyText).not.toMatch(/raw|customer message|private subject|content/i)
  })
})

function readNovuDispatchSmokeConfig(): NovuDispatchSmokeConfig {
  const required = {
    DEPLOY_BASE_URL: process.env.DEPLOY_BASE_URL,
    AE_NOTIFICATION_OUTBOX_SECRET: process.env.AE_NOTIFICATION_OUTBOX_SECRET,
    SMOKE_NOVU_NOTIFICATION_DISPATCH_ID: process.env.SMOKE_NOVU_NOTIFICATION_DISPATCH_ID,
  }

  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined || value.trim().length === 0)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing required Novu dispatch smoke env: ${missing.join(', ')}.`,
        'Set DEPLOY_BASE_URL, AE_NOTIFICATION_OUTBOX_SECRET, and SMOKE_NOVU_NOTIFICATION_DISPATCH_ID.',
        'The deployed server must also have NOVU_SECRET_KEY, NOVU_WORKFLOW_INQUIRY_OWNER, and AE_NOTIFICATION_OUTBOX_SECRET configured.',
        'SMOKE_NOVU_NOTIFICATION_DISPATCH_ID must refer to a queued or already-triggered owner Novu dispatch in the configured deployment.',
      ].join(' ')
    )
  }

  return {
    baseUrl: parseHttpsUrl('DEPLOY_BASE_URL', required.DEPLOY_BASE_URL as string, 'deployed provider smoke'),
    outboxSecret: (required.AE_NOTIFICATION_OUTBOX_SECRET as string).trim(),
    dispatchId: (required.SMOKE_NOVU_NOTIFICATION_DISPATCH_ID as string).trim(),
  }
}

function requireNovuDispatchSmokeConfig(): NovuDispatchSmokeConfig {
  if (config === undefined) {
    throw new Error('Novu dispatch smoke config was not loaded.')
  }

  return config
}

