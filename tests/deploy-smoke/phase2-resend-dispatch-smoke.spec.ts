import { expect, test } from '@playwright/test'

type ResendDispatchSmokeConfig = {
  baseUrl: URL
  outboxSecret: string
  dispatchId: string
}

let config: ResendDispatchSmokeConfig | undefined

test.describe('Phase 2 Resend dispatch provider smoke', () => {
  test.beforeAll(() => {
    config = readResendDispatchSmokeConfig()
  })

  test('guarded dispatch route sends or confirms a real Resend-backed notification', async ({ request }) => {
    const smokeConfig = requireResendDispatchSmokeConfig()
    const response = await request.post(resolvePath('/api/notification/resend-dispatch', smokeConfig.baseUrl), {
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
    const resendMessageId = readRequiredString(body, 'resendMessageId')

    expect(response.status(), bodyText).toBe(200)
    expect(response.headers()['cache-control'] ?? '').toContain('no-store')
    expect(body).toMatchObject({
      kind: 'ok',
      dispatchId: smokeConfig.dispatchId,
      businessSlug: expect.any(String),
    })
    expect(['notification_resend_dispatched', 'notification_resend_already_recorded']).toContain(code)
    expect(['sent', 'delivered']).toContain(dispatchStatus)
    expect(resendMessageId).toEqual(expect.any(String))
    expect(bodyText).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    expect(bodyText).not.toMatch(/raw|customer message|private subject/i)
  })
})

function readResendDispatchSmokeConfig(): ResendDispatchSmokeConfig {
  const required = {
    DEPLOY_BASE_URL: process.env.DEPLOY_BASE_URL,
    AE_NOTIFICATION_OUTBOX_SECRET: process.env.AE_NOTIFICATION_OUTBOX_SECRET,
    SMOKE_NOTIFICATION_DISPATCH_ID: process.env.SMOKE_NOTIFICATION_DISPATCH_ID,
  }

  const missing = Object.entries(required)
    .filter(([, value]) => value === undefined || value.trim().length === 0)
    .map(([key]) => key)

  if (missing.length > 0) {
    throw new Error(
      [
        `Missing required Resend dispatch smoke env: ${missing.join(', ')}.`,
        'Set DEPLOY_BASE_URL, AE_NOTIFICATION_OUTBOX_SECRET, and SMOKE_NOTIFICATION_DISPATCH_ID.',
        'The deployed server must also have CLERK_SECRET_KEY, RESEND_API_KEY, RESEND_FROM, and AE_NOTIFICATION_OUTBOX_SECRET configured.',
        'SMOKE_NOTIFICATION_DISPATCH_ID must refer to a queued or already-sent owner Resend dispatch in the configured deployment.',
      ].join(' ')
    )
  }

  return {
    baseUrl: parseHttpsUrl('DEPLOY_BASE_URL', required.DEPLOY_BASE_URL as string),
    outboxSecret: (required.AE_NOTIFICATION_OUTBOX_SECRET as string).trim(),
    dispatchId: (required.SMOKE_NOTIFICATION_DISPATCH_ID as string).trim(),
  }
}

function parseHttpsUrl(name: string, rawValue: string): URL {
  let parsed: URL

  try {
    parsed = new URL(rawValue)
  } catch {
    throw new Error(`${name} must be a valid HTTPS URL.`)
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${name} must use https:// for deployed provider smoke.`)
  }

  if (/^(localhost|127\.0\.0\.1)$/.test(parsed.hostname) || parsed.hostname.endsWith('.local')) {
    throw new Error(`${name} must point at a deployed environment, not localhost.`)
  }

  return parsed
}

function requireResendDispatchSmokeConfig(): ResendDispatchSmokeConfig {
  if (config === undefined) {
    throw new Error('Resend dispatch smoke config was not loaded.')
  }

  return config
}

function resolvePath(path: string, baseUrl: URL): string {
  return new URL(path, baseUrl).toString()
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Handled below.
  }

  throw new Error(`Expected JSON object response, received: ${value.slice(0, 200)}`)
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected response field ${key} to be a non-empty string.`)
  }

  return value
}
