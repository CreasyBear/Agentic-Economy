import { clerk, clerkSetup } from '@clerk/testing/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const configured = process.env.CLERK_PUBLISHABLE_KEY?.trim().length !== 0
  && process.env.CLERK_PUBLISHABLE_KEY !== undefined
  && process.env.CLERK_SECRET_KEY?.trim().length !== 0
  && process.env.CLERK_SECRET_KEY !== undefined
  && process.env.AE_E2E_OWNER_EMAIL?.trim().length !== 0
  && process.env.AE_E2E_OWNER_EMAIL !== undefined
  && ((process.env.AE_AUTHENTICATED_E2E_BASE_URL?.trim().length ?? 0) > 0 || [
    'VITE_CLERK_PUBLISHABLE_KEY',
    'CLERK_JWT_ISSUER_DOMAIN',
    'CONVEX_URL',
    'VITE_CONVEX_URL',
    'AE_CONVEX_SERVER_FUNCTION_TOKEN',
  ].every((name) => process.env[name]?.trim().length !== 0 && process.env[name] !== undefined))

test.describe('configured Clerk and Convex multi-agent lifecycle', () => {
  test.skip(!configured, 'Requires a Clerk test owner and a configured Convex-backed application.')
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    await clerkSetup()
  })

  test('keeps two agents independent through replacement and disconnection', async ({ page }) => {
    const suffix = `${Date.now()}`
    const agentAName = `E2E Agent A ${suffix}`
    const agentBName = `E2E Agent B ${suffix}`

    await page.goto('/')
    await clerk.signIn({ page, emailAddress: process.env.AE_E2E_OWNER_EMAIL! })

    const agentA = await connectNewAgent(page, agentAName)
    const agentB = await connectNewAgent(page, agentBName)
    const identityA = await expectUsableAgent(page.request, agentA.secret)
    const identityB = await expectUsableAgent(page.request, agentB.secret)
    expect(identityA.principalRef).not.toBe(identityB.principalRef)

    await page.goto('/agent-access', { waitUntil: 'networkidle' })
    await expect(page.getByRole('link', { name: `Open ${agentAName}` })).toBeVisible()
    await expect(page.getByRole('link', { name: `Open ${agentBName}` })).toBeVisible()

    const replacement = await replaceAgentCredential(page, `E2E Agent A replacement ${suffix}`, identityA.principalRef)
    const replacedIdentity = await expectUsableAgent(page.request, replacement.secret)
    expect(replacedIdentity.principalRef).toBe(identityA.principalRef)
    await expectUsableAgent(page.request, agentB.secret)

    const predecessor = await page.request.get('/api/v1/account', {
      headers: { Authorization: `Bearer ${agentA.secret}` },
    })
    expect(predecessor.status()).toBe(401)

    await page.goto(`/agent-access?caller=${encodeURIComponent(identityA.principalRef)}`, { waitUntil: 'networkidle' })
    await expect(page.getByText('Generation 1')).toBeVisible()
    await expect(page.getByText('Generation 2')).toBeVisible()
    await expect(page.getByText('Revoked').first()).toBeVisible()
    await page.getByRole('button', { name: 'Disconnect agent' }).click()
    await page.getByRole('button', { name: 'Disconnect agent' }).last().click()
    await expect(page.getByText('Disconnected', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Generation 1')).toBeVisible()
    await expect(page.getByText('Generation 2')).toBeVisible()

    const disconnected = await page.request.get('/api/v1/account', {
      headers: { Authorization: `Bearer ${replacement.secret}` },
    })
    expect(disconnected.status()).toBe(401)
    await expectUsableAgent(page.request, agentB.secret)

    await page.goto(`/agent-access?caller=${encodeURIComponent(identityB.principalRef)}`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Disconnect agent' }).click()
    await page.getByRole('button', { name: 'Disconnect agent' }).last().click()
    await expect(page.getByText('Disconnected', { exact: true }).first()).toBeVisible()
  })
})

type ConnectedAgent = Readonly<{ secret: string }>

async function connectNewAgent(page: Page, name: string): Promise<ConnectedAgent> {
  const grant = await beginDeviceGrant(page.request, name)
  await page.goto(grant.verificationUri)
  await expect(page.getByRole('heading', { name: `Connect ${name} to Agentic Economy` })).toBeVisible()
  await page.getByRole('button', { name: 'Approve access' }).click()
  await expect(page.getByText('Approved — return to your assistant.')).toBeVisible()
  return { secret: await exchangeDeviceGrant(page.request, grant.clientId, grant.deviceCode) }
}

async function replaceAgentCredential(page: Page, name: string, principalRef: string): Promise<ConnectedAgent> {
  const grant = await beginDeviceGrant(page.request, name)
  await page.goto(grant.verificationUri)
  const consent = page.locator('[data-ae-consent]')
  const grantRef = await consent.getAttribute('data-grant-ref')
  const authorityMode = await consent.getAttribute('data-authority-mode')
  if (grantRef === null || authorityMode === null) throw new Error('replacement_consent_material_missing')
  const response = await page.request.post('/oauth/authorize', {
    headers: { Origin: new URL(page.url()).origin },
    form: {
      grant_ref: grantRef,
      decision: 'approve',
      authority_mode: authorityMode,
      connection_target: 'replace_credential',
      principal_ref: principalRef,
    },
  })
  expect(response.ok()).toBe(true)
  return { secret: await exchangeDeviceGrant(page.request, grant.clientId, grant.deviceCode) }
}

async function beginDeviceGrant(request: APIRequestContext, name: string) {
  const registration = await request.post('/oauth/register', {
    data: {
      client_name: name,
      redirect_uris: ['http://localhost/callback'],
      grant_types: ['urn:ietf:params:oauth:grant-type:device_code'],
      response_types: [],
      token_endpoint_auth_method: 'none',
      scope: 'market_operations:invoke customer_requests:inspect_only',
    },
  })
  expect(registration.status()).toBe(201)
  const client = await registration.json() as { client_id: string }
  const authorization = await request.post('/oauth/device_authorization', {
    form: {
      client_id: client.client_id,
      scope: 'market_operations:invoke customer_requests:inspect_only',
    },
  })
  expect(authorization.ok()).toBe(true)
  const grant = await authorization.json() as {
    device_code: string
    verification_uri: string
  }
  return { clientId: client.client_id, deviceCode: grant.device_code, verificationUri: grant.verification_uri }
}

async function exchangeDeviceGrant(request: APIRequestContext, clientId: string, deviceCode: string): Promise<string> {
  const response = await request.post('/oauth/token', {
    form: {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId,
      device_code: deviceCode,
    },
  })
  expect(response.ok()).toBe(true)
  const token = await response.json() as { access_token: string }
  expect(token.access_token).toMatch(/^ak_/u)
  return token.access_token
}

async function expectUsableAgent(request: APIRequestContext, secret: string): Promise<{ principalRef: string }> {
  const response = await request.get('/api/v1/account', {
    headers: { Authorization: `Bearer ${secret}` },
  })
  expect(response.ok()).toBe(true)
  const identity = await response.json() as { kind: string; principalRef: string }
  expect(identity.kind).toBe('authenticated')
  expect(identity.principalRef).toMatch(/^prn_[0-9a-f]{32}$/u)
  return { principalRef: identity.principalRef }
}
