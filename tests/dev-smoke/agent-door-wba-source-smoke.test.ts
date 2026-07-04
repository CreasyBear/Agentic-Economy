import { createServer, type Server } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'

import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import { describe, expect, it } from 'vitest'
import { signatureHeaders, type Signer } from 'web-bot-auth'
import { signerFromJWK } from 'web-bot-auth/crypto'

import type { AgentPrincipalRecord } from '@/modules/clearance/principal-contract'

const REQUEST_URL = 'https://ae.example/api/agent/tools'
const DIRECTORY_PATH = '/.well-known/http-message-signatures-directory'

const DEV_PRIVATE_JWK: JsonWebKey = {
  key_ops: ['sign'],
  ext: true,
  alg: 'Ed25519',
  crv: 'Ed25519',
  d: 'EcggSYY2cjPzSpEhd7LNoySS6ZjPASLAnt3rSuS6Y1s',
  x: '61RoMQqm5NkQEf1aYek0kCkUSJjwcEhAOGdqg22hojg',
  kty: 'OKP',
}

const DEV_PUBLIC_JWK: JsonWebKey = {
  key_ops: ['verify'],
  ext: true,
  alg: 'Ed25519',
  crv: 'Ed25519',
  x: '61RoMQqm5NkQEf1aYek0kCkUSJjwcEhAOGdqg22hojg',
  kty: 'OKP',
}

type SmokeEnv = {
  convexUrl: string
  smokeSecret: string
}

type RunningDirectoryServer = {
  server: Server
  origin: string
}

type DirectoryPublicJwk = JsonWebKey & { kid: string }

type LocalPromiseWithResolvers<T> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

declare global {
  interface PromiseConstructor {
    withResolvers<T>(): LocalPromiseWithResolvers<T>
  }
}

const readDevAgentPrincipalByIdentity = makeFunctionReference<
  'query',
  { signatureAgent: string; keyid: string; smokeSecret: string },
  AgentPrincipalRecord | null
>('clearance:readDevAgentPrincipalByIdentity')

loadLocalEnv()

describe('WBA agent door dev source smoke', () => {
  it('verifies a real signed request through the route and reads back the persisted principal', async () => {
    const env = requireSmokeEnv()
    const signer = await signerFromJWK(DEV_PRIVATE_JWK)
    const directory = await startDirectoryServer({
      ...DEV_PUBLIC_JWK,
      kid: signer.keyid,
    })

    const previousDevAgent = process.env.AE_DEV_WBA_SIGNATURE_AGENT
    process.env.AE_DEV_WBA_SIGNATURE_AGENT = directory.origin

    try {
      const { handleInvokeAgentTool } = await import('@/routes/api.agent.tools')
      const request = await signedAgentToolRequest(directory.origin, signer)
      const response = await handleInvokeAgentTool(request)
      const responseText = await response.text()

      expect(response.status, responseText).toBe(200)
      expect(JSON.parse(responseText)).toMatchObject({ kind: 'ok' })

      const client = new ConvexHttpClient(env.convexUrl)
      const principal = await readPrincipal(client, {
        signatureAgent: directory.origin,
        keyid: signer.keyid,
        smokeSecret: env.smokeSecret,
      })

      if (principal === null) {
        throw new Error([
          'WBA signed route returned 200, but Convex did not contain the agent principal row.',
          'Set matching dev Convex env before running this smoke:',
          '  npx convex env set AE_SOURCE_WRITE_SECRET "$AE_SOURCE_WRITE_SECRET"',
          '  npx convex env set AE_DEV_WBA_SMOKE_ENABLED 1',
          '  npx convex env set AE_DEV_WBA_SMOKE_SECRET "$AE_DEV_WBA_SMOKE_SECRET"',
          'Then run: npx convex dev --once --typecheck=disable --codegen=disable',
        ].join('\n'))
      }

      expect(principal).toMatchObject({
        signatureAgent: directory.origin,
        keyid: signer.keyid,
        status: 'active',
        reputationTier: 'unrated',
        sourceVersion: 'agent-principal:v1',
      })
      expect(principal.requestCount).toBeGreaterThanOrEqual(1)
    } finally {
      restoreEnv('AE_DEV_WBA_SIGNATURE_AGENT', previousDevAgent)
      await closeDirectoryServer(directory.server)
    }
  }, 30_000)
})

function requireSmokeEnv(): SmokeEnv {
  const convexUrl = readEnv('CONVEX_URL') ?? readEnv('VITE_CONVEX_URL')
  const sourceWriteSecret = readEnv('AE_SOURCE_WRITE_SECRET')
  const smokeEnabled = readEnv('AE_DEV_WBA_SMOKE_ENABLED')
  const smokeSecret = readEnv('AE_DEV_WBA_SMOKE_SECRET')
  const nodeEnv = readEnv('NODE_ENV')

  const missing: string[] = []
  if (convexUrl === undefined) missing.push('CONVEX_URL or VITE_CONVEX_URL')
  if (sourceWriteSecret === undefined) missing.push('AE_SOURCE_WRITE_SECRET')
  if (smokeEnabled !== '1') missing.push('AE_DEV_WBA_SMOKE_ENABLED=1')
  if (smokeSecret === undefined) missing.push('AE_DEV_WBA_SMOKE_SECRET')
  if (nodeEnv === 'production') missing.push('NODE_ENV must not be production')

  if (missing.length > 0 || convexUrl === undefined || smokeSecret === undefined) {
    throw new Error([
      'WBA dev source smoke is fail-loud and requires a real dev Convex deployment.',
      `Missing/local mismatch: ${missing.join(', ') || 'none'}`,
      'Local env required:',
      '  VITE_CONVEX_URL=<dev deployment URL> # or CONVEX_URL',
      '  AE_SOURCE_WRITE_SECRET=<same value set in Convex env>',
      '  AE_DEV_WBA_SMOKE_ENABLED=1',
      '  AE_DEV_WBA_SMOKE_SECRET=<same value set in Convex env>',
      'Convex env required:',
      '  npx convex env set AE_SOURCE_WRITE_SECRET "$AE_SOURCE_WRITE_SECRET"',
      '  npx convex env set AE_DEV_WBA_SMOKE_ENABLED 1',
      '  npx convex env set AE_DEV_WBA_SMOKE_SECRET "$AE_DEV_WBA_SMOKE_SECRET"',
    ].join('\n'))
  }

  return { convexUrl, smokeSecret }
}

async function startDirectoryServer(publicJwk: DirectoryPublicJwk): Promise<RunningDirectoryServer> {
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== DIRECTORY_PATH) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('not found')
      return
    }

    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'application/http-message-signatures-directory+json',
    })
    response.end(JSON.stringify({ keys: [publicJwk] }))
  })

  const listen = Promise.withResolvers<void>()
  server.once('error', listen.reject)
  server.listen(0, '127.0.0.1', listen.resolve)
  await listen.promise
  server.off('error', listen.reject)

  const address = server.address()
  if (typeof address !== 'object' || address === null) {
    await closeDirectoryServer(server)
    throw new Error('Local signer directory did not expose a TCP address.')
  }

  return {
    server,
    origin: `http://127.0.0.1:${address.port}`,
  }
}

async function closeDirectoryServer(server: Server): Promise<void> {
  if (!server.listening) {
    return
  }

  const closed = Promise.withResolvers<void>()
  server.close((error) => {
    if (error !== undefined) {
      closed.reject(error)
      return
    }

    closed.resolve()
  })
  await closed.promise
}

async function signedAgentToolRequest(signatureAgent: string, signer: Signer): Promise<Request> {
  const body = JSON.stringify({
    tool: 'registry.search',
    input: { query: 'parramatta' },
  })
  const request = new Request(REQUEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Signature-Agent': `"${signatureAgent}"`,
    },
    body,
  })
  const signedHeaders = await signatureHeaders(request, signer, {
    created: new Date(Date.now() - 10_000),
    expires: new Date(Date.now() + 50_000),
  })
  const headers = new Headers(request.headers)
  headers.set('Signature', signedHeaders.Signature)
  headers.set('Signature-Input', signedHeaders['Signature-Input'])

  return new Request(request.url, {
    method: request.method,
    headers,
    body,
  })
}

async function readPrincipal(
  client: ConvexHttpClient,
  args: { signatureAgent: string; keyid: string; smokeSecret: string },
): Promise<AgentPrincipalRecord | null> {
  try {
    return await client.query(readDevAgentPrincipalByIdentity, args)
  } catch (error) {
    throw new Error([
      'Convex principal readback failed. This smoke requires real dev Convex env, not mocks.',
      'Confirm Convex env has AE_SOURCE_WRITE_SECRET, AE_DEV_WBA_SMOKE_ENABLED=1, and AE_DEV_WBA_SMOKE_SECRET matching local env.',
      error instanceof Error ? error.message : String(error),
    ].join('\n'))
  }
}

function readEnv(name: string): string | undefined {
  const value = process.env[name]
  return value === undefined || value.trim().length === 0 ? undefined : value.trim()
}

function loadLocalEnv(): void {
  loadEnvFile('.env')
  loadEnvFile('.env.local')
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    return
  }

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue
    }

    const separator = trimmed.indexOf('=')
    if (separator <= 0) {
      continue
    }

    const key = trimmed.slice(0, separator).trim()
    const rawValue = trimmed.slice(separator + 1).trim()
    const value = stripInlineEnvComment(rawValue)
    if (process.env[key] === undefined) {
      process.env[key] = unquoteEnvValue(value)
    }
  }
}

function stripInlineEnvComment(value: string): string {
  return value.replace(/\s+#.*$/u, '').trim()
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = previous
}
