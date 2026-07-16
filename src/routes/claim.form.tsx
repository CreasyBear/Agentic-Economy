import { createFileRoute } from '@tanstack/react-router'

import { requireClaimOwnerSession } from '@/lib/server/claim-owner-session'
import { ClaimFormRoute } from '@/routes/claim'

export const Route = createFileRoute('/claim/form')({
  beforeLoad: requireClaimOwnerSession,
  head: () => ({
    meta: [
      { title: 'Publish your business page | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ClaimFormRoute,
})
