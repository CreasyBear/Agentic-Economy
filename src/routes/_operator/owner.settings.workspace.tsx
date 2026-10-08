import { createFileRoute } from '@tanstack/react-router'

import { WorkspaceProfileSettings } from '@/components/ae/settings/WorkspaceProfileSettings'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readWorkspaceSettingsServer } from '@/lib/server/workspace-settings.functions'
import { BROWSER_READ_TIMEOUT_MS, awaitBoundedRead } from '@/lib/bounded-read'

export const Route = createFileRoute('/_operator/owner/settings/workspace')({
  ...operatorRouteOptions,
  loader: async (ctx) => {
    const signal = AbortSignal.any([AbortSignal.timeout(BROWSER_READ_TIMEOUT_MS),
      ...(ctx?.abortController?.signal === undefined ? [] : [ctx.abortController.signal])])
    return await awaitBoundedRead(signal => readWorkspaceSettingsServer({ signal }), signal)
  },
  head: () => ({ meta: [{ title: 'Business profile | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: WorkspaceSettingsRoute,
})

function WorkspaceSettingsRoute() {
  return <WorkspaceProfileSettings {...Route.useLoaderData()} />
}
