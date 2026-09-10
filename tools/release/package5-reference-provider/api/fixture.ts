import {
  createPackage5ReferenceProvider,
  type Package5ReferenceProvider,
} from '../core.js'

const FIXTURE_PATHS = new Set([
  '/health',
  '/release-fixtures',
  '/openapi.json',
  '/openapi/execute',
  '/mcp',
  '/agent-plugin/plugin.json',
  '/agent-plugin/mcp.json',
  '/x402/execute',
])

type Environment = Readonly<Record<string, string | undefined>>

export function createPackage5ReferenceProviderVercelHandler(input: Readonly<{
  origin: string
  loadProvider: () => Promise<Package5ReferenceProvider>
}>): Readonly<{ fetch: (request: Request) => Promise<Response> }> {
  let provider: Promise<Package5ReferenceProvider> | undefined
  return {
    fetch: async (request) => {
      const target = fixtureTarget(request, input.origin)
      if (target === undefined) return Response.json({ code: 'fixture_not_found' }, { status: 404 })
      provider ??= input.loadProvider()
      return await (await provider).fetch(new Request(target, request))
    },
  }
}

export function package5ReferenceProviderVercelHandler(
  environment: Environment = process.env,
): Readonly<{ fetch: (request: Request) => Promise<Response> }> {
  const origin = required(environment, 'AE_PACKAGE5_FIXTURE_PUBLIC_ORIGIN')
  return createPackage5ReferenceProviderVercelHandler({
    origin,
    loadProvider: async () => await createPackage5ReferenceProvider({
      origin,
      payTo: required(environment, 'AE_PACKAGE5_FIXTURE_X402_PAY_TO'),
      facilitatorUrl: required(environment, 'AE_PACKAGE5_FIXTURE_X402_FACILITATOR_URL'),
    }),
  })
}

function fixtureTarget(request: Request, publicOrigin: string): URL | undefined {
  const incoming = new URL(request.url)
  const rewrittenPath = incoming.pathname === '/api/fixture'
    ? incoming.searchParams.get('fixturePath')
    : incoming.pathname
  if (rewrittenPath === null || !FIXTURE_PATHS.has(rewrittenPath)) return undefined
  const target = new URL(rewrittenPath, publicOrigin)
  for (const [name, value] of incoming.searchParams) {
    if (name !== 'fixturePath') target.searchParams.append(name, value)
  }
  return target
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim()
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`)
  return value
}

let productionHandler: Readonly<{ fetch: (request: Request) => Promise<Response> }> | undefined

export default {
  fetch(request: Request): Promise<Response> {
    productionHandler ??= package5ReferenceProviderVercelHandler()
    return productionHandler.fetch(request)
  },
}
