import { authenticateCustomerRequestAgent } from '@/lib/server/customer-request-agent-auth'
import { readCustomerRequestRelease } from '@/modules/customer-request/release-readback'

type HandlerOptions = Readonly<{
  authenticate?: NonNullable<Parameters<typeof authenticateCustomerRequestAgent>[0]>['authenticate']
  env?: Record<string, string | undefined>
  observedAt?: () => number
}>

export async function handleAgentCustomerRequestReleaseGet(options: HandlerOptions = {}): Promise<Response> {
  const admitted = await authenticateCustomerRequestAgent({
    ...(options.authenticate === undefined ? {} : { authenticate: options.authenticate }),
  })
  if (admitted.kind === 'refused') return response(
    { kind: 'refused', reason: admitted.reason },
    admitted.status,
  )

  const release = readCustomerRequestRelease({
    env: options.env ?? process.env,
    ...(options.observedAt === undefined ? {} : { observedAt: options.observedAt }),
  })
  return response(release, release.kind === 'release_readback' ? 200 : 503)
}

function response(body: unknown, status: number): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Vary: 'Authorization',
    },
  })
}
