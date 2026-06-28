import { createFileRoute } from '@tanstack/react-router'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import type { DefaultFunctionArgs, FunctionReference } from 'convex/server'

import { discoveryTextResponse } from '@/lib/http/discovery-response'
import {
  getPublicDiscoveryQueryClientForTests,
  readFixtureSitemapXml,
} from '@/modules/discovery/public'
import type {
  BuildDiscoveryFileOptions,
  DiscoveryFileBuildResult,
  PublicDiscoveryQueryClient,
} from '@/modules/discovery/public'

type Env = Record<string, string | undefined>

const readSitemapXmlQuery = sourceQuery<BuildDiscoveryFileOptions, DiscoveryFileBuildResult>(
  'discovery:readSitemapXml'
)

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: ({ request }) => handleDurableSitemapXmlRequest(request),
    },
  },
})

export async function handleDurableSitemapXmlRequest(request: Request): Promise<Response> {
  const result = await getPublicDiscoveryQueryClient().sitemap({
    canonicalBaseUrl: requestOrigin(request),
    now: Date.now(),
  })

  return discoveryTextResponse(result.body, 'application/xml; charset=utf-8')
}

export function handleSitemapXmlRequest(request: Request): Response {
  const result = readFixtureSitemapXml({
    canonicalBaseUrl: requestOrigin(request),
    now: Date.now(),
  })

  return discoveryTextResponse(result.body, 'application/xml; charset=utf-8')
}

function getPublicDiscoveryQueryClient(): PublicDiscoveryQueryClient {
  const testClient = getPublicDiscoveryQueryClientForTests()
  if (testClient !== undefined) {
    return testClient
  }

  const client = new ConvexHttpClient(readRequiredConvexUrl(process.env))
  return {
    manifest: async () => {
      throw new Error('UCP discovery query is not available from the sitemap.xml route client.')
    },
    llms: async () => {
      throw new Error('llms discovery query is not available from the sitemap.xml route client.')
    },
    sitemap: (options) => client.query(readSitemapXmlQuery, options),
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
