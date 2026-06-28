import { createFileRoute } from '@tanstack/react-router'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import type { DefaultFunctionArgs, FunctionReference } from 'convex/server'

import { discoveryTextResponse } from '@/lib/http/discovery-response'
import {
  getPublicDiscoveryQueryClientForTests,
  readFixtureLlmsTxt,
} from '@/modules/discovery/public'
import type {
  BuildDiscoveryFileOptions,
  DiscoveryFileBuildResult,
  PublicDiscoveryQueryClient,
} from '@/modules/discovery/public'

type Env = Record<string, string | undefined>

const readLlmsTxtQuery = sourceQuery<BuildDiscoveryFileOptions, DiscoveryFileBuildResult>('discovery:readLlmsTxt')

export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: ({ request }) => handleDurableLlmsTxtRequest(request),
    },
  },
})

export async function handleDurableLlmsTxtRequest(request: Request): Promise<Response> {
  const result = await getPublicDiscoveryQueryClient().llms({
    canonicalBaseUrl: requestOrigin(request),
  })

  return discoveryTextResponse(result.body, 'text/plain; charset=utf-8')
}

export function handleLlmsTxtRequest(request: Request): Response {
  const result = readFixtureLlmsTxt({
    canonicalBaseUrl: requestOrigin(request),
  })

  return discoveryTextResponse(result.body, 'text/plain; charset=utf-8')
}

function getPublicDiscoveryQueryClient(): PublicDiscoveryQueryClient {
  const testClient = getPublicDiscoveryQueryClientForTests()
  if (testClient !== undefined) {
    return testClient
  }

  const client = new ConvexHttpClient(readRequiredConvexUrl(process.env))
  return {
    manifest: async () => {
      throw new Error('UCP discovery query is not available from the llms.txt route client.')
    },
    llms: (options) => client.query(readLlmsTxtQuery, options),
    sitemap: async () => {
      throw new Error('sitemap discovery query is not available from the llms.txt route client.')
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
