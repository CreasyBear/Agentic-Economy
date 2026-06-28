import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'
import type { DefaultFunctionArgs, FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

import { AeAdminShell } from '@/components/ae/layout/AeAdminShell'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'
import type { AdminReadbackSurface, AdminShellReadback } from '@/modules/security/public'

type Env = Record<string, string | undefined>

const readAdminAuditEventsQuery = sourceQuery<Record<string, never>, AdminShellReadback>('security:readAdminAuditEvents')

export const readAdminAuditEventsServer = createServerFn().handler(() => readAdminAuditEventsThroughSource())

export async function readAdminAuditEventsThroughSource(): Promise<AdminShellReadback> {
  try {
    return await callAuthenticatedQuery(readAdminAuditEventsQuery, {})
  } catch {
    return deniedAdminReadback('audit_events')
  }
}

export const Route = createFileRoute('/admin/audit-events')({
  loader: () => readAdminAuditEventsServer(),
  component: AdminAuditEventsRoute,
})

function AdminAuditEventsRoute() {
  const readback = Route.useLoaderData()

  return (
    <AeAdminShell
      title="Audit events"
      description="Inspect admin and recovery transitions with redacted payloads after source-owned membership is resolved."
      currentPath="/admin/audit-events"
    >
      <AeAdminReadbackPanel
        title="Audit readback"
        description="Denied reads return no private event rows and preserve the HTTP decision for the operator."
        readback={readback}
      />
    </AeAdminShell>
  )
}

function sourceQuery<Args extends DefaultFunctionArgs = DefaultFunctionArgs, Result = unknown>(
  name: string
): FunctionReference<'query', 'public', Args, Result> {
  return makeFunctionReference<'query', Args, Result>(name)
}

async function callAuthenticatedQuery<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>
): Promise<FunctionReturnType<Query>> {
  const client = await createAuthenticatedConvexClient()
  return client.query(query, args)
}

async function createAuthenticatedConvexClient(): Promise<ConvexHttpClient> {
  const convexUrl = readRequiredConvexUrl(process.env)
  const { auth } = await import('@clerk/tanstack-react-start/server')
  const authObject = await auth()
  if (!authObject.isAuthenticated) {
    throw new Error('Authenticated admin session is required for this Convex call.')
  }

  const token = await authObject.getToken({ template: 'convex' })
  if (token === null || token.trim().length === 0) {
    throw new Error('Clerk did not return a Convex auth token for this request.')
  }

  return new ConvexHttpClient(convexUrl, { auth: token })
}

function deniedAdminReadback(surface: AdminReadbackSurface): AdminShellReadback {
  return {
    kind: 'denied',
    httpStatus: 401,
    reason: 'missing_membership',
    surface,
    generatedAt: Date.now(),
    publicMessage: 'Admin readback requires active source-owned membership.',
    rows: [],
  }
}

function readRequiredConvexUrl(env: Env): string {
  const value = readEnv(env, 'CONVEX_URL') ?? readEnv(env, 'VITE_CONVEX_URL')
  if (value === undefined) {
    throw new Error('CONVEX_URL or VITE_CONVEX_URL is required for server Convex calls.')
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
