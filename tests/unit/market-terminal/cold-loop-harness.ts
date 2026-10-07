import { callResultSchema, projectCallMachineResult } from '@/modules/capability-execution/call-contracts'
import { join } from 'node:path'
import { expect, vi } from 'vitest'

import type { CliFailure } from '../../../tools/ae/lib/output'

export function operationRef(seed: string): string {
  return `operation:v1:${seed.repeat(64)}`
}

export function commitmentRef(seed: string): string {
  return `operation-commitment:v1:${seed.repeat(64)}`
}

export function responseJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(callResultSchema.safeParse(body).success ? projectCallMachineResult(callResultSchema.parse(body)) : body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function captureStdout(): { read: () => string; restore: () => void } {
  const writes: string[] = []
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk))
    return true
  })
  return { read: () => writes.join(''), restore: () => spy.mockRestore() }
}

export function captureStderr(): { read: () => string; restore: () => void } {
  const writes: string[] = []
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    writes.push(String(chunk))
    return true
  })
  return { read: () => writes.join(''), restore: () => spy.mockRestore() }
}

export async function withStdout(run: () => Promise<void>): Promise<string> {
  const captured = captureStdout()
  try {
    await run()
    return captured.read()
  } finally {
    captured.restore()
  }
}

export async function withStdoutStderr(
  run: () => Promise<void>,
): Promise<{ stdout: string; stderr: string }> {
  const stdout = captureStdout()
  const stderr = captureStderr()
  try {
    await run()
    return { stdout: stdout.read(), stderr: stderr.read() }
  } finally {
    stdout.restore()
    stderr.restore()
  }
}

export function parseJson<T = Record<string, unknown>>(text: string): T {
  return JSON.parse(text) as T
}

export async function stdoutJson(run: () => Promise<void>): Promise<Record<string, unknown>> {
  return parseJson(await withStdout(run))
}

export function stubFetchResolved(
  body: unknown,
  status = 200,
): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
    if (body instanceof Response) {
      return body.clone()
    }
    return responseJson(body, status)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function stubFetchJsonResponse(
  body: unknown,
  status = 200,
  contentType = 'application/json',
): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => (
    new Response(JSON.stringify(callResultSchema.safeParse(body).success ? projectCallMachineResult(callResultSchema.parse(body)) : body), { status, headers: { 'content-type': contentType } })
  ))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function marketEndpoint(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`
}

export function expectAnonymousPost(
  fetchMock: ReturnType<typeof vi.fn<typeof fetch>>,
  baseUrl: string,
  path: string,
  body: unknown,
): void {
  const [url, init] = fetchMock.mock.calls[0]!
  expect(url).toBe(marketEndpoint(baseUrl, path))
  expect(init?.method).toBe('POST')
  expect(new Headers(init?.headers).get('Authorization')).toBeNull()
  expect(JSON.parse(String(init?.body))).toEqual(body)
}

export async function expectCliFailure(
  run: () => Promise<unknown>,
  expected: Partial<CliFailure>,
  fetchMock?: ReturnType<typeof vi.fn<typeof fetch>>,
): Promise<void> {
  await expect(run()).rejects.toMatchObject(expected satisfies Partial<CliFailure>)
  if (fetchMock !== undefined) expect(fetchMock).not.toHaveBeenCalled()
}

export const OAUTH_MARKET_DEVICE = {
  device_code: 'device-code',
  user_code: 'ABCD-EFGH',
  verification_uri: 'https://market.example/agent-access/authorize?user_code=ABCD-EFGH',
  expires_in: 600,
  interval: 5,
} as const

export const OAUTH_PRIVATE_DEVICE = {
  device_code: 'private-device-code',
  user_code: 'ABCD-EFGH',
  verification_uri: 'https://market.example/agent-access/authorize?user_code=ABCD-EFGH',
  expires_in: 600,
  interval: 1,
} as const

export function oauthRegisterResponse(clientId = 'ae_client', status = 201): Response {
  return Response.json({ client_id: clientId }, { status, headers: { 'content-type': 'application/json' } })
}

export function oauthDeviceResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({ ...OAUTH_MARKET_DEVICE, ...overrides }, {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export function oauthTokenSuccess(
  accessToken = 'ae-issued-secret',
  extra: Record<string, unknown> = {},
): Response {
  return Response.json({
    access_token: accessToken,
    token_type: 'Bearer',
    scope: 'market_tools:call customer_requests:spending_policy',
    ...extra,
  }, { status: 200, headers: { 'content-type': 'application/json' } })
}

export function defaultConnectedAccount() {
  return {
    kind: 'authenticated' as const,
    principalRef: 'principal:buyer',
    accountRef: 'account:buyer',
    credentialId: 'credential:buyer',
    applicationRef: 'agentic-economy',
    environment: 'sandbox' as const,
    scopes: ['market_tools:call', 'customer_requests:spending_policy'],
    authorityMode: 'spending_policy' as const,
  }
}

export function connectFlowFetch(
  arg1?: unknown,
  arg2?: unknown,
  expiresIn = 600,
  interval = 1,
): ReturnType<typeof vi.fn<typeof fetch>> {
  let verificationUri: string | undefined
  let account: unknown = defaultConnectedAccount()

  if (typeof arg1 === 'string' || (arg1 === undefined && typeof arg2 !== 'string')) {
    verificationUri = arg1 as string | undefined
    if (arg2 !== undefined) account = arg2
  } else {
    account = arg1
    verificationUri = arg2 as string | undefined
  }

  const deviceRecord: Record<string, unknown> = {
    device_code: 'device-code',
    user_code: 'ABCD-EFGH',
    expires_in: expiresIn,
    interval,
  }
  if (verificationUri !== undefined) deviceRecord.verification_uri = verificationUri
  return vi.fn<typeof fetch>()
    .mockResolvedValueOnce(oauthRegisterResponse())
    .mockResolvedValueOnce(Response.json(deviceRecord))
    .mockResolvedValueOnce(oauthTokenSuccess())
    .mockResolvedValueOnce(responseJson(account))
}

export function mockStandardOAuthConnect(
  account: unknown,
  accessToken = 'ae-issued-secret',
  tokenExtra?: Record<string, unknown>,
): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>()
    .mockResolvedValueOnce(oauthRegisterResponse())
    .mockResolvedValueOnce(oauthDeviceResponse())
    .mockResolvedValueOnce(oauthTokenSuccess(accessToken, tokenExtra ?? {}))
    .mockResolvedValueOnce(responseJson(account))
}

export function stubOAuthTokenTerminalError(
  oauthError: string,
  clientId = 'client',
): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(oauthRegisterResponse(clientId))
    .mockResolvedValueOnce(Response.json(OAUTH_PRIVATE_DEVICE))
    .mockResolvedValueOnce(Response.json({ error: oauthError }, { status: 400 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function stubOAuthThroughToken(
  account: unknown,
  accessToken = 'private-issued-key',
): ReturnType<typeof vi.fn<typeof fetch>> {
  const fetchMock = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(oauthRegisterResponse('client'))
    .mockResolvedValueOnce(Response.json(OAUTH_PRIVATE_DEVICE))
    .mockResolvedValueOnce(oauthTokenSuccess(accessToken))
    .mockImplementation(async () => responseJson(account))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

export function pendingConnectionsDir(configDir: string): string {
  return join(configDir, 'pending-connections')
}

export function forceStdoutTTY(value: boolean): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(process.stdout, 'isTTY')
  Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value })
  return () => {
    if (descriptor === undefined) {
      Reflect.deleteProperty(process.stdout, 'isTTY')
    } else {
      Object.defineProperty(process.stdout, 'isTTY', descriptor)
    }
  }
}

export async function withAeDisableBrowserOpen(
  disableOpen: string | undefined,
  run: () => Promise<void>,
): Promise<void> {
  const previous = process.env.AE_DISABLE_BROWSER_OPEN
  if (disableOpen === undefined) delete process.env.AE_DISABLE_BROWSER_OPEN
  else process.env.AE_DISABLE_BROWSER_OPEN = disableOpen
  try {
    await run()
  } finally {
    if (previous === undefined) delete process.env.AE_DISABLE_BROWSER_OPEN
    else process.env.AE_DISABLE_BROWSER_OPEN = previous
  }
}
