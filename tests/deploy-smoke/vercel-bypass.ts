import type { APIRequestContext, Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

type RequestContextFactory = {
  newContext(options?: RequestContextOptions): Promise<APIRequestContext>
}

type StorageStateCookie = {
  name: string
  value: string
  domain: string
  path: string
  expires: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'Strict' | 'Lax' | 'None'
}

type StorageState = {
  cookies: StorageStateCookie[]
  origins: unknown[]
}

type RequestContextOptions = {
  extraHTTPHeaders?: Record<string, string>
  storageState?: string | StorageState
  [key: string]: unknown
}

export function vercelProtectionBypassHeaders(options: { setBypassCookie?: boolean } = {}): Record<string, string> {
  const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim()

  if (secret === undefined || secret.length === 0) {
    return {}
  }

  return {
    'x-vercel-protection-bypass': secret,
    ...(options.setBypassCookie === true ? { 'x-vercel-set-bypass-cookie': 'true' } : {}),
  }
}

export function withVercelProtectionBypass(
  options: RequestContextOptions = {}
): RequestContextOptions {
  const headers = vercelProtectionBypassHeaders()

  if (Object.keys(headers).length === 0) {
    return options
  }

  return {
    ...options,
    extraHTTPHeaders: {
      ...headers,
      ...options.extraHTTPHeaders,
    },
  }
}

export async function newVercelBypassedRequestContext(
  requestFactory: RequestContextFactory,
  baseUrl: URL,
  options: RequestContextOptions = {}
): Promise<APIRequestContext> {
  const bypassCookie = await vercelProtectionBypassStorageCookie(baseUrl)
  const { extraHTTPHeaders, storageState, ...restOptions } = options
  const mergedStorageState = mergeStorageState(storageState, bypassCookie)

  return requestFactory.newContext(
    withVercelProtectionBypass({
      ...restOptions,
      ...(mergedStorageState === undefined ? {} : { storageState: mergedStorageState }),
      extraHTTPHeaders: {
        ...extraHTTPHeaders,
      },
    })
  )
}

export async function applyVercelProtectionBypassToPage(page: Page, baseUrl: URL): Promise<void> {
  const cookie = await vercelProtectionBypassStorageCookie(baseUrl)
  if (cookie === undefined) {
    return
  }

  await page.context().addCookies([cookie])
}

export async function vercelProtectionBypassCookie(baseUrl: URL): Promise<string | undefined> {
  const headers = vercelProtectionBypassHeaders({ setBypassCookie: true })
  if (Object.keys(headers).length === 0) {
    return undefined
  }

  const response = await fetch(new URL('/', baseUrl), {
    redirect: 'manual',
    headers,
  })
  const cookie = response.headers.get('set-cookie')?.split(';')[0]

  if (cookie === undefined || cookie.trim().length === 0) {
    throw new Error('Vercel protection bypass did not return a bypass cookie.')
  }

  return cookie
}

async function vercelProtectionBypassStorageCookie(baseUrl: URL): Promise<StorageStateCookie | undefined> {
  const cookie = await vercelProtectionBypassCookie(baseUrl)
  if (cookie === undefined) {
    return undefined
  }

  const separatorIndex = cookie.indexOf('=')
  if (separatorIndex <= 0) {
    throw new Error('Vercel protection bypass returned an invalid cookie.')
  }

  return {
    name: cookie.slice(0, separatorIndex),
    value: cookie.slice(separatorIndex + 1),
    domain: baseUrl.hostname,
    path: '/',
    expires: -1,
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  }
}

function mergeStorageState(storageState: RequestContextOptions['storageState'], bypassCookie: StorageStateCookie | undefined): RequestContextOptions['storageState'] {
  const baseState = readStorageState(storageState)

  if (bypassCookie === undefined) {
    return storageState
  }

  return {
    cookies: [
      ...baseState.cookies.filter((cookie) => cookie.name !== bypassCookie.name || cookie.domain !== bypassCookie.domain),
      bypassCookie,
    ],
    origins: baseState.origins,
  }
}

function readStorageState(storageState: RequestContextOptions['storageState']): StorageState {
  if (storageState === undefined) {
    return { cookies: [], origins: [] }
  }

  if (typeof storageState === 'string') {
    return normalizeStorageState(JSON.parse(readFileSync(storageState, 'utf8')) as unknown)
  }

  return normalizeStorageState(storageState)
}

function normalizeStorageState(value: unknown): StorageState {
  if (typeof value !== 'object' || value === null || !Array.isArray((value as { cookies?: unknown }).cookies)) {
    return { cookies: [], origins: [] }
  }

  const record = value as { cookies: StorageStateCookie[]; origins?: unknown[] }
  return {
    cookies: record.cookies,
    origins: Array.isArray(record.origins) ? record.origins : [],
  }
}
