import { createParkedFileRoute } from '@/future-phases/route-helpers'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import {
  OwnerContactFollowUpQueue,
  OwnerContactFollowUpReadback,
} from '@/future-phases/04-owner-pending-protected-actions/owner-actions.panels'
import {
  readOwnerContactFollowUpRouteReadback,
  type OwnerContactFollowUpRouteReadback,
} from '@/future-phases/04-owner-pending-protected-actions/owner-actions.readback'

export const Route = createParkedFileRoute<OwnerContactFollowUpRouteReadback>('/owner/actions')({
  loader: () => readOwnerContactFollowUpRouteReadback(),
  head: () => ({
    meta: [
      { title: 'Owner follow-up requests | Agentic Economy' },
      { name: 'description', content: 'Owner-reviewed contact follow-up requests rendered from source-owned readbacks.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: OwnerActionsRoute,
})

function OwnerActionsRoute() {
  const readback = Route.useLoaderData()

  return (
    <AeOperatorShell
      role="owner"
      eyebrow="Owner review"
      title="Contact follow-up requests"
      description="Each request waits for an owner decision before any source-owned follow-up attempt is recorded. Receipts and proof gaps come only from saved readback state."
      currentPath="/owner/actions"
    >
      <div className="grid gap-6">
        <OwnerContactFollowUpQueue queue={readback.queue} />
        <OwnerContactFollowUpReadback reconstructions={readback.reconstructions} />
      </div>
    </AeOperatorShell>
  )
}
