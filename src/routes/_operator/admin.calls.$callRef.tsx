import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { api } from '../../../convex/_generated/api'
import { AdminCallObjectPage } from '@/components/ae/admin/call-object/AdminCallObjectPage'
import { AdminCallObjectPageSkeleton } from '@/components/ae/admin/call-object/AdminCallObjectPageSkeleton'
import {
  ADMIN_CALL_OBJECT_COPY,
  type AdminCallLoaderResult,
} from '@/components/ae/admin/call-object/call-object.contracts'
import {
  buildAdminEventProperties,
  captureAdminEvent,
} from '@/lib/observability/admin-event-props'
import { parseAdminObjectRef } from '@/lib/operator/admin-console/ref-parsers'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { createAuthenticatedSourceTransport } from '@/lib/server/convex-source'
import { readOperatorContextThroughSource } from '@/lib/server/operator-context.functions'
import { principalRef } from '@/modules/principal-account/principal/public'

const readAdminCallServer = createServerFn()
  .validator((data: { callRef: string }) => data)
  .handler(async ({ data }): Promise<AdminCallLoaderResult> => {
    const parsed = parseAdminObjectRef('call', data.callRef)
    if (parsed.kind === 'malformed') return { kind: 'malformed' }
    const session = await readOperatorContextThroughSource()
    if (session.kind !== 'authorized' || !session.allowedSurfaces.includes('admin')) {
      return { kind: 'refused', code: 'missing_membership' }
    }
    const source = await createAuthenticatedSourceTransport()
    const result = await source.query(api.adminConsoleObjects.readAdminObject, { ref: parsed.ref })
    captureAdminEvent(
      principalRef(session.principalRef),
      'admin_lookup',
      buildAdminEventProperties('admin_lookup', { refKind: 'call', found: result.kind === 'call' }),
    )
    if (result.kind === 'call' || result.kind === 'object_not_found' || result.kind === 'refused') {
      return result
    }
    return { kind: 'object_not_found' }
  })

export const Route = createFileRoute('/_operator/admin/calls/$callRef')({
  ...operatorRouteOptions,
  loader: ({ params }) => readAdminCallServer({ data: { callRef: params.callRef } }),
  pendingComponent: AdminCallObjectPageSkeleton,
  head: () => ({
    meta: [
      { title: `${ADMIN_CALL_OBJECT_COPY.callsBreadcrumb} | Agentic Economy` },
      { name: 'description', content: ADMIN_CALL_OBJECT_COPY.description },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminCallRoute,
})

function AdminCallRoute() {
  return <AdminCallObjectPage result={Route.useLoaderData()} />
}
