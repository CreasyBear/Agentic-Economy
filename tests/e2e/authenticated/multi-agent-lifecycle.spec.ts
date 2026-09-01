import { clerk } from '@clerk/testing/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { authenticatedE2EEnvironment, requireAuthenticatedE2EEnvironment } from './environment'

const environment = authenticatedE2EEnvironment

test.describe('configured Clerk and Convex multi-agent lifecycle', () => {
  test.skip(!environment.configured, 'Requires Clerk test-instance keys, a dedicated owner, and a configured Convex-backed application.')
  test.describe.configure({ mode: 'serial' })

  test('keeps two agents independent through replacement, selective revocation, and disconnection', async ({ page }) => {
    const configuredEnvironment = requireAuthenticatedE2EEnvironment()
    if (configuredEnvironment.ownerEmail === undefined) throw new Error('authenticated_e2e_owner_email_missing')
    const suffix = `${Date.now()}`
    const agentAName = `E2E Agent A ${suffix}`
    const agentBName = `E2E Agent B ${suffix}`

    await expectExactReleaseRevision(page.request, configuredEnvironment.expectedSourceRevision)
    await page.goto('/')
    await clerk.signIn({ page, emailAddress: configuredEnvironment.ownerEmail })

    const agentA = await connectNewAgent(page, agentAName)
    await refreshOwnerProof(page, configuredEnvironment.ownerEmail)
    const agentB = await connectNewAgent(page, agentBName)
    const identityA = await expectUsableAgent(page.request, agentA.secret)
    const identityB = await expectUsableAgent(page.request, agentB.secret)
    expect(identityA.principalRef).not.toBe(identityB.principalRef)

    await page.goto('/agent-access', { waitUntil: 'networkidle' })
    await ensureAgentVisible(page, agentAName)
    await ensureAgentVisible(page, agentBName)

    await refreshOwnerProof(page, configuredEnvironment.ownerEmail)
    const replacement = await replaceAgentCredential(page, `E2E Agent A replacement ${suffix}`, agentAName)
    const replacedIdentity = await expectUsableAgent(page.request, replacement.secret)
    expect(replacedIdentity.principalRef).toBe(identityA.principalRef)
    await expectUsableAgent(page.request, agentB.secret)

    const predecessor = await page.request.get('/api/v1/account', {
      headers: { Authorization: `Bearer ${agentA.secret}` },
    })
    expect(predecessor.status()).toBe(401)

    await openAgent(page, agentAName)
    await expect(page.getByText('Credential history', { exact: true })).toBeVisible()
    await expect(page.getByText('Generation 1')).toBeVisible()
    await expect(page.getByText('Generation 2')).toBeVisible()
    await expect(page.getByText('Revoked').first()).toBeVisible()
    const revoke = page.getByRole('button', { name: 'Revoke', exact: true })
    await expect(revoke).toBeVisible()
    await revoke.dispatchEvent('click')
    const confirmRevoke = page.getByRole('button', { name: 'Revoke credential' })
    await expect(confirmRevoke).toBeVisible()
    await confirmRevoke.dispatchEvent('click')
    await expect(page.getByText('Disconnected', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Credential history', { exact: true })).toBeVisible()
    await expect(page.getByText('Generation 1')).toBeVisible()
    await expect(page.getByText('Generation 2')).toBeVisible()
    await expect(page.getByText('Revoked', { exact: true })).toHaveCount(2)

    const selectivelyRevoked = await page.request.get('/api/v1/account', {
      headers: { Authorization: `Bearer ${replacement.secret}` },
    })
    expect(selectivelyRevoked.status()).toBe(401)
    await expectUsableAgent(page.request, agentB.secret)

    await openAgent(page, agentBName)
    const disconnect = page.getByRole('button', { name: 'Disconnect agent' })
    await expect(disconnect).toHaveCount(1)
    await disconnect.dispatchEvent('click')
    const confirmDisconnect = page.getByRole('button', { name: 'Disconnect agent' }).last()
    await expect(confirmDisconnect).toBeVisible()
    await confirmDisconnect.dispatchEvent('click')
    await expect(page.getByText('Disconnected', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Credential history', { exact: true })).toBeVisible()
    await expect(page.getByText('Generation 1')).toBeVisible()
    await expect(page.getByText('Revoked', { exact: true })).toBeVisible()
    const disconnected = await page.request.get('/api/v1/account', {
      headers: { Authorization: `Bearer ${agentB.secret}` },
    })
    expect(disconnected.status()).toBe(401)
  })
})

type ConnectedAgent = Readonly<{ secret: string }>

async function refreshOwnerProof(page: Page, ownerEmail: string): Promise<void> {
  await page.goto('/')
  await clerk.signOut({ page })
  await clerk.signIn({ page, emailAddress: ownerEmail })
}

async function connectNewAgent(page: Page, name: string): Promise<ConnectedAgent> {
  const grant = await beginDeviceGrant(page.request, name)
  await page.goto(grant.verificationUri)
  await expect(page.getByRole('heading', { name: `Connect ${name}`, exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Approve access' }).click()
  await confirmAgentApproval(page)
  await expect(page.getByText('Access approved — return to your agent')).toBeVisible()
  return { secret: await exchangeDeviceGrant(page.request, grant.clientId, grant.deviceCode) }
}

async function replaceAgentCredential(page: Page, name: string, targetName: string): Promise<ConnectedAgent> {
  const grant = await beginDeviceGrant(page.request, name)
  await page.goto(grant.verificationUri)
  await expect(page.getByRole('heading', { name: `Connect ${name}`, exact: true })).toBeVisible()
  const replace = page.getByRole('radio', { name: /Replace credential/ })
  for (let pageNumber = 0; await replace.isDisabled(); pageNumber += 1) {
    if (pageNumber >= 50) throw new Error('replacement_agent_page_limit_exceeded')
    await loadNextConsentPage(page)
  }
  await replace.click()
  const selector = page.getByRole('combobox', { name: 'Agent' })
  for (let pageNumber = 0; ; pageNumber += 1) {
    if (pageNumber >= 50) throw new Error('replacement_agent_not_found')
    await selector.click()
    const target = page.getByRole('option', { name: targetName, exact: true })
    if (await target.count() > 0) {
      await target.click()
      break
    }
    await page.keyboard.press('Escape')
    const loadMore = page.getByRole('button', { name: /Load more agents|Retry agent list/ })
    if (await loadMore.count() === 0) throw new Error('replacement_agent_not_found')
    await loadNextConsentPage(page)
  }
  await page.getByRole('button', { name: 'Approve access' }).click()
  await confirmAgentApproval(page)
  await expect(page.getByText('Access approved — return to your agent')).toBeVisible()
  return { secret: await exchangeDeviceGrant(page.request, grant.clientId, grant.deviceCode) }
}

async function loadNextConsentPage(page: Page): Promise<void> {
  await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url())
      return url.pathname === '/oauth/authorize'
        && response.request().method() === 'GET'
        && response.ok()
    }),
    page.getByRole('button', { name: /Load more agents|Retry agent list/ }).click(),
  ])
}

async function confirmAgentApproval(page: Page): Promise<void> {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/oauth/authorize' && response.request().method() === 'POST'
  })
  await page.getByRole('button', { name: 'Confirm and approve' }).click()
  const response = await responsePromise
  await expect(response.json()).resolves.toMatchObject({ kind: 'approved' })
}

async function ensureAgentVisible(page: Page, name: string): Promise<void> {
  const link = page.getByRole('link', { name: `Open ${name}`, exact: true })
  for (let pageNumber = 0; await link.count() === 0; pageNumber += 1) {
    if (pageNumber >= 50) throw new Error(`agent_not_found:${name}`)
    const loadMore = page.getByRole('button', { name: 'Load more agents', exact: true })
    if (await loadMore.count() === 0) throw new Error(`agent_not_found:${name}`)
    await loadMore.click()
    await expect(page.getByRole('button', { name: 'Loading more agents…', exact: true })).toBeHidden()
  }
  await expect(link).toBeVisible()
}

async function openAgent(page: Page, name: string): Promise<void> {
  await page.goto('/agent-access', { waitUntil: 'networkidle' })
  await ensureAgentVisible(page, name)
  const link = page.getByRole('link', { name: `Open ${name}`, exact: true })
  const href = await link.getAttribute('href')
  if (href === null || !/^\/agent-access\?caller=prn_[0-9a-f]{32}$/u.test(href)) {
    throw new Error('agent_detail_link_invalid')
  }
  await page.goto(href, { waitUntil: 'networkidle' })
  await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}$`, 'u'))
  await expect(page.getByText('Credential history', { exact: true })).toBeVisible()
}

async function expectExactReleaseRevision(request: APIRequestContext, expected: string | undefined): Promise<void> {
  if (expected === undefined) return
  const response = await request.get('/api/v1/release')
  expect(response.ok()).toBe(true)
  await expect(response.json()).resolves.toEqual({ kind: 'ok', sourceRevision: expected })
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
  const identity = await response.json() as { kind?: string; principalRef?: string; code?: string }
  expect({ status: response.status(), identity }).toMatchObject({
    status: 200,
    identity: { kind: 'authenticated' },
  })
  expect(identity.principalRef).toMatch(/^prn_[0-9a-f]{32}$/u)
  return { principalRef: identity.principalRef! }
}
