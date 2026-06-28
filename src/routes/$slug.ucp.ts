import { createFileRoute } from '@tanstack/react-router'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import type { DefaultFunctionArgs, FunctionReference } from 'convex/server'

import { discoveryJsonResponse } from '@/lib/http/discovery-response'
import {
  getPublicDiscoveryQueryClientForTests,
  readFixtureCatalogDiscoveryManifest,
} from '@/modules/discovery/public'
import type {
  PublicDiscoveryQueryClient,
  ReadCatalogDiscoveryManifestInput,
  ReadCatalogDiscoveryManifestResult,
} from '@/modules/discovery/public'

type Env = Record<string, string | undefined>

const readCatalogDiscoveryManifestQuery = sourceQuery<
  ReadCatalogDiscoveryManifestInput,
  ReadCatalogDiscoveryManifestResult
>('discovery:readCatalogDiscoveryManifest')

export const Route = createFileRoute('/$slug/ucp')({
  server: {
    handlers: {
      GET: ({ request, params }) => handleDurableUcpManifestRequest(request, params.slug),
    },
  },
})

export async function handleDurableUcpManifestRequest(request: Request, slug: string): Promise<Response> {
  const result = await getPublicDiscoveryQueryClient().manifest({
    slug,
    canonicalBaseUrl: requestOrigin(request),
    now: Date.now(),
  })

  if (result.kind === 'hidden') {
    return discoveryJsonResponse(
      {
        kind: 'not_found',
        code: 'discovery_manifest_not_found',
        reason: 'No public discovery manifest exists for this slug.',
      },
      { status: 404 }
    )
  }

  return discoveryJsonResponse(result.manifest)
}

export function handleUcpManifestRequest(request: Request, slug: string): Response {
  const result = readFixtureCatalogDiscoveryManifest({
    slug,
    canonicalBaseUrl: requestOrigin(request),
    now: Date.now(),
  })

  if (result.kind === 'hidden') {
    return discoveryJsonResponse(
      {
        kind: 'not_found',
        code: 'discovery_manifest_not_found',
        reason: 'No public discovery manifest exists for this slug.',
      },
      { status: 404 }
    )
  }

  return discoveryJsonResponse(result.manifest)
}

function getPublicDiscoveryQueryClient(): PublicDiscoveryQueryClient {
  const testClient = getPublicDiscoveryQueryClientForTests()
  if (testClient !== undefined) {
    return testClient
  }

  const client = new ConvexHttpClient(readRequiredConvexUrl(process.env))
  return {
    manifest: (input) => client.query(readCatalogDiscoveryManifestQuery, input),
    llms: async () => {
      throw new Error('llms discovery query is not available from the UCP route client.')
    },
    sitemap: async () => {
      throw new Error('sitemap discovery query is not available from the UCP route client.')
    },
  }
}

function sourceQuery<Args extends DefaultFunctionArgs = DefaultFunctionArgs, Result = unknown>(
  name: string
): FunctionReference<'query', 'public', Args, Result> {
  return makeFunctionReference<'query', Args, Result>(name)
}

function readRequiredConvexUrl(env: Env): string {
  const value = readEnv(env, 'CONVEX_URL') ?? readEnv(env, 'VITE_CONVEX_URL')
  if (value === undefined) {
    throw new Error('CONVEX_URL or VITE_CONVEX_URL is required for public discovery Convex queries.')
  }

  return value
}

function readEnv(env: Env, name: string): string | undefined {
  const value = env[name]
  if (value === undefined || value.trim().length === 0) {
    return undefined
  }

  return value.trim()
}

function requestOrigin(request: Request): string {
  try {
    return new URL(request.url).origin
  } catch {
    return 'https://ae.example'
  }
}
