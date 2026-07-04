import { createServer, type Server } from 'node:http'

import { describe, expect, it } from 'vitest'
import { signatureHeaders, type Signer } from 'web-bot-auth'
import { signerFromJWK } from 'web-bot-auth/crypto'

import { handleBusinessDetailRequest } from '@/routes/api.businesses.$slug'
import { handleSearchBusinessesRequest } from '@/routes/api.businesses.search'
import { handleInvokeAgentTool, handleListAgentTools } from '@/routes/api.agent.tools'
import { sourceWriteContentDigestHeader } from '@/modules/security/source-write-admission'

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
describe('GET /api/agent/tools', () => {
  it('lists inquiry.submit with boundaries and without protocol vocabulary', async () => {
    const response = await handleListAgentTools()
    const body = (await response.json()) as {
      tools: readonly {
        id: string
        name?: string
        summary: string
        boundaries: readonly string[]
      }[]
    }

    expect(response.status).toBe(200)
    expect(body.tools.map((tool) => tool.id)).toContain('inquiry.submit')

    const submitTool = body.tools.find((tool) => tool.id === 'inquiry.submit')
    expect(submitTool?.boundaries.length).toBeGreaterThan(0)
    expect(JSON.stringify({ id: submitTool?.id, name: submitTool?.name, summary: submitTool?.summary })).not.toMatch(
      /MCP|OpenAPI|callable/i
    )
  })

  it('lists the read-only registry actions with boundaries and without architecture vocabulary', async () => {
    const response = await handleListAgentTools()
    const body = (await response.json()) as {
      tools: readonly {
        id: string
        name?: string
        summary: string
        boundaries: readonly string[]
        readOnly: boolean
      }[]
    }

    const ids = body.tools.map((tool) => tool.id)
    expect(ids).toContain('registry.search')
    expect(ids).toContain('registry.detail')

    const search = body.tools.find((tool) => tool.id === 'registry.search')
    expect(search?.readOnly).toBe(true)
    expect(search?.boundaries.length).toBeGreaterThan(0)
    expect(search?.boundaries.join(' ')).toMatch(/book|charge|dispatch|inquiry/i)
    expect(JSON.stringify(search)).not.toMatch(
      /MCP|OpenAPI|callable|autonomous|agent-native|DTO|fixture/i
    )

    const detail = body.tools.find((tool) => tool.id === 'registry.detail')
    expect(detail?.readOnly).toBe(true)
    expect(detail?.boundaries.length).toBeGreaterThan(0)
  })

  it('does not list registry.list because quiet agents only get narrow search/detail tools', async () => {
    const response = await handleListAgentTools()
    const body = (await response.json()) as {
      tools: readonly { id: string }[]
    }

    expect(response.status).toBe(200)
    expect(body.tools.map((tool) => tool.id)).not.toContain('registry.list')
  })

  it('serves the same quiet-agent tool list to unsigned callers without identity metadata', async () => {
    const response = await handleListAgentTools()
    const body = (await response.json()) as {
      agentIdentity?: unknown
      tools: readonly { id: string }[]
    }

    expect(response.status).toBe(200)
    expect(body.agentIdentity).toBeUndefined()
    expect(body.tools.map((tool) => tool.id).sort()).toEqual([
      'inquiry.submit',
      'registry.detail',
      'registry.search',
    ])
  })
})

describe('POST /api/agent/tools', () => {
  it('rejects non-JSON content types', async () => {
    const response = await handleInvokeAgentTool(
      new Request('https://ae.example/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'tool=inquiry.submit',
      })
    )

    expect(response.status).toBe(415)
    await expect(response.json()).resolves.toMatchObject({
      code: 'agent_tools_invalid_content_type',
    })
  })

  it('rejects unknown tools', async () => {
    const response = await handleInvokeAgentTool(
      new Request('https://ae.example/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'does-not-exist', input: {} }),
      })
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      code: 'agent_tools_unknown_tool',
    })
  })

  it('rejects registered actions that are not quiet-agent tools', async () => {
    const response = await handleInvokeAgentTool(
      new Request('https://ae.example/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'registry.list', input: { limit: 1 } }),
      })
    )

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      code: 'agent_tools_unknown_tool',
    })
  })

  it('rejects invalid inquiry.submit input before source writes', async () => {
    const response = await handleInvokeAgentTool(
      new Request('https://ae.example/api/agent/tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'inquiry.submit',
          input: { body: 'Need help with a leak.' },
        }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'error',
      code: 'agent_tools_invalid_input',
      retryable: false,
    })
  })

  it('refuses unsigned inquiry.submit with signature step-up instead of failing open to a write', async () => {
    const response = await handleInvokeAgentTool(
      new Request(REQUEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'inquiry.submit',
          input: validInquirySubmitInput(),
        }),
      })
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('Accept-Signature')).toContain('web-bot-auth')
    await expect(response.json()).resolves.toMatchObject({
      kind: 'error',
      code: 'agent_tools_signature_required',
      retryable: false,
    })
  })

  it('accepts a real Web Bot Auth signed read request without advertising extra tools', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      await runWithLocalDevWbaDirectory(async ({ signatureAgent, signer }) => {
        const before = await listToolIds()
        const response = await handleInvokeAgentTool(await signedAgentToolRequest(signatureAgent, signer, {
          tool: 'registry.search',
          input: { query: 'parramatta' },
        }))
        const responseText = await response.text()
        const body = JSON.parse(responseText) as {
          agentIdentity?: unknown
          kind: string
          tools?: unknown
        }
        const after = await listToolIds()

        expect(response.status, responseText).toBe(200)
        expect(body.kind).toBe('ok')
        expect(body.agentIdentity).toBeUndefined()
        expect(body.tools).toBeUndefined()
        expect(after).toEqual(before)
        expect(after).toEqual(['inquiry.submit', 'registry.detail', 'registry.search'])
      })
    } finally {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalRegistry)
    }
  }, 30_000)

  it('keeps signed read tools available when principal audit source writes are unavailable', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousSourceSecret = process.env.AE_SOURCE_WRITE_SECRET
    const previousPublicSourceSecret = process.env.VITE_AE_SOURCE_WRITE_SECRET
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.AE_SOURCE_WRITE_SECRET
    delete process.env.VITE_AE_SOURCE_WRITE_SECRET

    try {
      await runWithLocalDevWbaDirectory(async ({ signatureAgent, signer }) => {
        const response = await handleInvokeAgentTool(await signedAgentToolRequest(signatureAgent, signer, {
          tool: 'registry.search',
          input: { query: 'parramatta' },
        }))
        const responseText = await response.text()

        expect(response.status, responseText).toBe(200)
        expect(JSON.parse(responseText)).toMatchObject({ kind: 'ok' })
      })
    } finally {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalRegistry)
      restoreEnv('AE_SOURCE_WRITE_SECRET', previousSourceSecret)
      restoreEnv('VITE_AE_SOURCE_WRITE_SECRET', previousPublicSourceSecret)
    }
  }, 30_000)

  it('refuses signed-but-not-admitted inquiry.submit because identity is not write authority', async () => {
    const previousAdmission = process.env.AE_DEV_AGENT_TOOL_WRITE_ADMISSION
    delete process.env.AE_DEV_AGENT_TOOL_WRITE_ADMISSION

    try {
      await runWithLocalDevWbaDirectory(async ({ signatureAgent, signer }) => {
        const response = await handleInvokeAgentTool(await signedAgentToolRequest(signatureAgent, signer, {
          tool: 'inquiry.submit',
          input: validInquirySubmitInput(),
        }))

        expect(response.status).toBe(403)
        await expect(response.json()).resolves.toMatchObject({
          kind: 'error',
          code: 'agent_tools_refused',
          retryable: false,
        })
      })
    } finally {
      restoreEnv('AE_DEV_AGENT_TOOL_WRITE_ADMISSION', previousAdmission)
    }
  }, 30_000)

  it('submits inquiry.submit for a signed and admitted quiet-agent caller', async () => {
    const previousLocalInquiry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousAdmission = process.env.AE_DEV_AGENT_TOOL_WRITE_ADMISSION
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    process.env.AE_DEV_AGENT_TOOL_WRITE_ADMISSION = 'public_inquiry'

    try {
      await runWithLocalDevWbaDirectory(async ({ signatureAgent, signer }) => {
        const response = await handleInvokeAgentTool(await signedAgentToolRequest(signatureAgent, signer, {
          tool: 'inquiry.submit',
          input: validInquirySubmitInput(),
        }))
        const responseText = await response.text()
        const body = JSON.parse(responseText) as {
          kind: string
          code?: string
          receipt?: {
            threadId?: string
            businessId?: string
            serviceId?: string
            notificationStatus?: string
          }
        }

        expect(response.status, responseText).toBe(200)
        expect(body.kind).toBe('ok')
        expect(body.code).toMatch(/inquiry_(submitted|replayed)/)
        expect(body.receipt).toMatchObject({
          businessId: 'business:plumbing-demo',
          serviceId: 'service:business:plumbing-demo:emergency-plumbing',
          notificationStatus: 'held',
        })
        expect(body.receipt?.threadId).toMatch(/^inquiry_thread:/)
      })
    } finally {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalInquiry)
      restoreEnv('AE_DEV_AGENT_TOOL_WRITE_ADMISSION', previousAdmission)
    }
  }, 30_000)
})

describe('POST /api/agent/tools registry search', () => {
  it('invokes registry.search through the explicit local source path and includes the legacy public catalog page', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const localResponse = handleSearchBusinessesRequest(
        new Request('https://ae.example/api/businesses/search?q=parramatta')
      )
      expect(localResponse.status).toBe(200)
      const localBody = (await localResponse.json()) as {
        items: readonly { slug: string }[]
        pagination: { total: number }
      }

      const response = await handleInvokeAgentTool(
        new Request(REQUEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'registry.search',
            input: { query: 'parramatta' },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        kind: string
        items: readonly { slug: string }[]
        pagination: { total: number }
      }
      expect(body.kind).toBe('ok')
      const slugs = body.items.map((item) => item.slug)
      expect(slugs).toEqual(expect.arrayContaining(localBody.items.map((item) => item.slug)))
      expect(slugs).toContain('parramatta-emergency-plumbing')
      expect(body.pagination.total).toBeGreaterThanOrEqual(localBody.pagination.total)
    } finally {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalRegistry)
    }
  })

  it('keeps the registry literal: a misspelled suburb does not auto-correct', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const localResponse = handleSearchBusinessesRequest(
        new Request('https://ae.example/api/businesses/search?q=paramata')
      )
      expect(localResponse.status).toBe(200)
      const localBody = (await localResponse.json()) as {
        items: readonly { slug: string }[]
        pagination: { total: number }
      }

      const response = await handleInvokeAgentTool(
        new Request(REQUEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'registry.search',
            input: { query: 'paramata' },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        kind: string
        items: readonly { slug: string }[]
        pagination: { total: number }
      }
      expect(body.kind).toBe('ok')
      expect(body.items).toEqual(localBody.items)
      expect(body.pagination.total).toBe(localBody.pagination.total)
      expect(body.items).toEqual([])
      expect(body.pagination.total).toBe(0)
    } finally {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalRegistry)
    }
  })

  it('rejects invalid registry.search input', async () => {
    const response = await handleInvokeAgentTool(
      new Request(REQUEST_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'registry.search', input: {} }),
      })
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'error',
      code: 'agent_tools_invalid_input',
      retryable: false,
    })
  })
})

describe('POST /api/agent/tools registry detail', () => {
  it('invokes registry.detail and returns the same local published business as the legacy detail route', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const localResponse = handleBusinessDetailRequest('parramatta-emergency-plumbing')
      expect(localResponse.status).toBe(200)
      const localBody = (await localResponse.json()) as {
        kind: string
        business?: { slug: string }
      }

      const response = await handleInvokeAgentTool(
        new Request(REQUEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'registry.detail',
            input: { slug: 'parramatta-emergency-plumbing' },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as {
        kind: string
        business?: { slug: string }
      }
      expect(body.kind).toBe(localBody.kind)
      expect(body.business?.slug).toBe(localBody.business?.slug)
      expect(body.business?.slug).toBe('parramatta-emergency-plumbing')
    } finally {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalRegistry)
    }
  })

  it('returns the same not_found result as the local legacy detail route for an unknown slug', async () => {
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'

    try {
      const localResponse = handleBusinessDetailRequest('no-such-business')
      expect(localResponse.status).toBe(404)
      const localBody = (await localResponse.json()) as { kind: string; code?: string }

      const response = await handleInvokeAgentTool(
        new Request(REQUEST_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tool: 'registry.detail',
            input: { slug: 'no-such-business' },
          }),
        })
      )

      expect(response.status).toBe(200)
      const body = (await response.json()) as { kind: string; code?: string }
      expect(body.kind).toBe(localBody.kind)
      expect(body.code).toBe(localBody.code)
      expect(body.kind).toBe('not_found')
    } finally {
      restoreEnv('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E', previousLocalRegistry)
    }
  })
})

async function listToolIds(): Promise<string[]> {
  const response = await handleListAgentTools()
  const body = (await response.json()) as { tools: readonly { id: string }[] }
  return body.tools.map((tool) => tool.id).sort()
}

type LocalDevWbaDirectoryInput = {
  signatureAgent: string
  signer: Signer
}

async function runWithLocalDevWbaDirectory(
  run: (input: LocalDevWbaDirectoryInput) => Promise<void>
): Promise<void> {
  const signer = await signerFromJWK(DEV_PRIVATE_JWK)
  const directory = await startDirectoryServer({
    ...DEV_PUBLIC_JWK,
    kid: signer.keyid,
  })

  const previousSmokeEnabled = process.env.AE_DEV_WBA_SMOKE_ENABLED
  const previousDevAgent = process.env.AE_DEV_WBA_SIGNATURE_AGENT
  process.env.AE_DEV_WBA_SMOKE_ENABLED = '1'
  process.env.AE_DEV_WBA_SIGNATURE_AGENT = directory.origin

  try {
    await run({ signatureAgent: directory.origin, signer })
  } finally {
    restoreEnv('AE_DEV_WBA_SMOKE_ENABLED', previousSmokeEnabled)
    restoreEnv('AE_DEV_WBA_SIGNATURE_AGENT', previousDevAgent)
    await closeDirectoryServer(directory.server)
  }
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

async function signedAgentToolRequest(signatureAgent: string, signer: Signer, body: unknown): Promise<Request> {
  const bodyText = JSON.stringify(body)
  const request = new Request(REQUEST_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Digest': sourceWriteContentDigestHeader(bodyText),
      'Signature-Agent': `"${signatureAgent}"`,
    },
    body: bodyText,
  })
  const signedHeaders = await signatureHeaders(request, signer, {
    created: new Date(Date.now() - 10_000),
    expires: new Date(Date.now() + 50_000),
    components: ['@method', '@authority', '@path', 'content-digest', 'signature-agent'],
  })
  const headers = new Headers(request.headers)
  headers.set('Signature', signedHeaders.Signature)
  headers.set('Signature-Input', signedHeaders['Signature-Input'])

  return new Request(request.url, {
    method: request.method,
    headers,
    body: bodyText,
  })
}

function restoreEnv(name: string, previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env[name]
    return
  }

  process.env[name] = previous
}

function validInquirySubmitInput() {
  return {
    target: {
      businessId: 'business:plumbing-demo',
      serviceId: 'service:business:plumbing-demo:emergency-plumbing',
      capabilityKind: 'phone_inquiry',
    },
    body: 'A pipe is leaking under the sink. Please reply with next steps.',
    contact: {
      name: 'Casey',
      email: 'casey@example.test',
    },
  }
}
