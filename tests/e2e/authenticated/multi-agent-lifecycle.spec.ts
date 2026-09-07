import { clerk } from '@clerk/testing/playwright'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { createOpaqueOAuthValue, hashOAuthValue } from '@/modules/agent-access/oauth-state'
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
    await page.getByRole('button', { name: 'Technical details' }).click()
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
    await page.getByRole('button', { name: 'Technical details' }).click()
    const disconnect = page.getByRole('button', { name: 'Remove agent everywhere' })
    await expect(disconnect).toHaveCount(1)
    await disconnect.dispatchEvent('click')
    const confirmDisconnect = page.getByRole('button', { name: 'Remove agent everywhere' }).last()
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

  test('connects once, survives a client restart and refresh, then fails closed on revocation', async ({ page }) => {
    const configuredEnvironment = requireAuthenticatedE2EEnvironment()
    if (configuredEnvironment.ownerEmail === undefined) throw new Error('authenticated_e2e_owner_email_missing')
    const callback = 'http://127.0.0.1/callback'
    const verifier = createOpaqueOAuthValue(48)
    const state = createOpaqueOAuthValue(18)

    await expectExactReleaseRevision(page.request, configuredEnvironment.expectedSourceRevision)
    await page.goto('/')
    await clerk.signIn({ page, emailAddress: configuredEnvironment.ownerEmail })

    const clientName = `E2E durable MCP ${Date.now()}`
    const registration = await page.request.post('/oauth/register', {
      data: {
        client_name: clientName,
        redirect_uris: [callback],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      },
    })
    expect(registration.status()).toBe(201)
    const { client_id: clientId } = await registration.json() as { client_id: string }
    const authorize = new URL('/oauth/authorize', configuredEnvironment.baseURL)
    authorize.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callback,
      response_type: 'code',
      state,
      code_challenge: await hashOAuthValue(verifier),
      code_challenge_method: 'S256',
    }).toString()

    await page.goto(authorize.toString())
    await expect(page.getByRole('radio', { name: /Ask each time/ })).toBeChecked()
    const redirectTo = await submitAgentApprovalRedirect(page)
    const callbackUrl = new URL(redirectTo)
    expect(callbackUrl.searchParams.get('state')).toBe(state)
    const code = callbackUrl.searchParams.get('code')
    expect(code).not.toBeNull()

    const initial = await exchangeAuthorizationCode(page.request, {
      clientId,
      code: code!,
      callback,
      verifier,
    })
    const firstIdentity = await callOfficialWhoami(configuredEnvironment.baseURL, initial.accessToken)
    expect(firstIdentity.kind).toBe('authenticated')
    expect(firstIdentity.principalRef).toMatch(/^prn_[0-9a-f]{32}$/u)
    expect(firstIdentity.accountRef).toBeTruthy()

    const refreshed = await refreshAuthorization(page.request, clientId, initial.refreshToken)
    const restartedIdentity = await callOfficialWhoami(configuredEnvironment.baseURL, refreshed.accessToken)
    expect(restartedIdentity).toMatchObject({
      kind: 'authenticated',
      principalRef: firstIdentity.principalRef,
      accountRef: firstIdentity.accountRef,
      authorityMode: firstIdentity.authorityMode,
    })
    expect(restartedIdentity.scopes).toEqual(firstIdentity.scopes)

    await openAgent(page, clientName)
    await expect(page.getByText(clientName, { exact: true }).first()).toBeVisible()
    const disconnect = page.getByRole('button', { name: 'Disconnect', exact: true })
    await disconnect.click()
    await page.getByRole('button', { name: 'Disconnect', exact: true }).last().click()
    const rejectedRefresh = await page.request.post('/oauth/token', {
      form: { grant_type: 'refresh_token', refresh_token: refreshed.refreshToken, client_id: clientId },
    })
    expect(rejectedRefresh.status()).toBe(400)
    await expect(rejectedRefresh.json()).resolves.toMatchObject({ error: 'invalid_grant' })
    const protectedRead = await page.request.get('/api/v1/account', {
      headers: { Authorization: `Bearer ${refreshed.accessToken}` },
    })
    expect(protectedRead.status()).toBe(401)
    await expect(callOfficialWhoami(configuredEnvironment.baseURL, refreshed.accessToken)).rejects.toThrow()

    const anonymous = await callOfficialPublicSearch(configuredEnvironment.baseURL)
    expect(anonymous).toMatchObject({ result: { kind: expect.any(String) } })
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
  await submitAgentApproval(page, 'Connect agent')
  await expect(page.getByText(`Connected to ${name}`)).toBeVisible()
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
  await submitAgentApproval(page, 'Replace credential')
  await expect(page.getByText(`Connected to ${name}`)).toBeVisible()
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

async function submitAgentApproval(page: Page, actionName: 'Connect agent' | 'Replace credential' | 'Revoke and replace credential'): Promise<void> {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/oauth/authorize' && response.request().method() === 'POST'
  })
  await page.getByRole('button', { name: actionName, exact: true }).click()
  const response = await responsePromise
  await expect(response.json()).resolves.toMatchObject({ kind: 'approved' })
}

async function submitAgentApprovalRedirect(page: Page): Promise<string> {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/oauth/authorize' && response.request().method() === 'POST'
  })
  await page.getByRole('button', { name: 'Connect agent', exact: true }).click()
  const response = await responsePromise
  const result = await response.json() as { kind?: string; redirectTo?: string }
  expect(result.kind).toBe('approved')
  expect(result.redirectTo).toBeTruthy()
  return result.redirectTo!
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
  await expect(page.getByRole('button', { name: 'Technical details' })).toBeVisible()
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
      scope: 'market_tools:call customer_requests:read_only',
    },
  })
  expect(registration.status()).toBe(201)
  const client = await registration.json() as { client_id: string }
  const authorization = await request.post('/oauth/device_authorization', {
    form: {
      client_id: client.client_id,
      scope: 'market_tools:call customer_requests:read_only',
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

type DurableTokens = Readonly<{ accessToken: string; refreshToken: string }>

async function exchangeAuthorizationCode(
  request: APIRequestContext,
  input: Readonly<{ clientId: string; code: string; callback: string; verifier: string }>,
): Promise<DurableTokens> {
  const response = await request.post('/oauth/token', {
    form: {
      grant_type: 'authorization_code',
      code: input.code,
      client_id: input.clientId,
      redirect_uri: input.callback,
      code_verifier: input.verifier,
    },
  })
  expect(response.ok()).toBe(true)
  const tokens = await response.json() as { access_token?: string; refresh_token?: string; scope?: string }
  expect(tokens).toMatchObject({
    access_token: expect.stringMatching(/^ak_/u),
    refresh_token: expect.any(String),
    scope: 'market_tools:call customer_requests:approval_required offline_access',
  })
  return { accessToken: tokens.access_token!, refreshToken: tokens.refresh_token! }
}

async function refreshAuthorization(
  request: APIRequestContext,
  clientId: string,
  refreshToken: string,
): Promise<DurableTokens> {
  const response = await request.post('/oauth/token', {
    form: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
    },
  })
  expect(response.ok()).toBe(true)
  const tokens = await response.json() as { access_token?: string; refresh_token?: string }
  expect(tokens.access_token).toMatch(/^ak_/u)
  expect(tokens.refresh_token).toEqual(expect.any(String))
  expect(tokens.refresh_token).not.toBe(refreshToken)
  return { accessToken: tokens.access_token!, refreshToken: tokens.refresh_token! }
}

type AgentIdentity = Readonly<{
  kind: string
  principalRef: string
  accountRef: string
  scopes: readonly string[]
  authorityMode: string
}>

function officialMcpClient(baseURL: string, accessToken?: string): Readonly<{
  client: Client
  transport: StreamableHTTPClientTransport
}> {
  const client = new Client({ name: 'ae-authenticated-e2e', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL('/mcp', baseURL), {
    ...(accessToken === undefined
      ? {}
      : { requestInit: { headers: { authorization: `Bearer ${accessToken}` } } }),
  })
  return { client, transport }
}

async function callOfficialWhoami(baseURL: string, accessToken: string): Promise<AgentIdentity> {
  const { client, transport } = officialMcpClient(baseURL, accessToken)
  try {
    await client.connect(transport as unknown as Parameters<Client['connect']>[0])
    const response = await client.callTool({ name: 'ae_agentAccess_whoami', arguments: {} })
    if (response.isError) throw new Error('agent_access_whoami_rejected')
    const identity = (response.structuredContent as { result?: AgentIdentity } | undefined)?.result
    if (identity === undefined) throw new Error('agent_access_whoami_missing_result')
    return identity
  } finally {
    await client.close().catch(() => undefined)
  }
}

async function callOfficialPublicSearch(baseURL: string): Promise<Record<string, unknown>> {
  const { client, transport } = officialMcpClient(baseURL)
  try {
    await client.connect(transport as unknown as Parameters<Client['connect']>[0])
    const response = await client.callTool({
      name: 'ae_registry_tools_search',
      arguments: { query: 'research' },
    })
    if (response.isError) throw new Error('public_tool_search_rejected')
    return response.structuredContent as Record<string, unknown>
  } finally {
    await client.close().catch(() => undefined)
  }
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
