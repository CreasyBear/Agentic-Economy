import { createFileRoute } from '@tanstack/react-router'

import { AeRemoveBusinessPage } from '@/components/ae/privacy/remove-business/AeRemoveBusinessPage'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'

export const Route = createFileRoute('/privacy/remove-business')({
  head: () => ({
    meta: [
      { title: 'Provider correction or removal | Agentic Economy' },
      { name: 'description', content: 'Request a correction or removal for an Agentic Economy Provider profile or published Tool.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: RemoveBusinessRoute,
})

function RemoveBusinessRoute() {
  return (
    <AePublicPage
      kind="document"
      eyebrow="Privacy"
      title="Remove a Business"
      description="Send the Provider slug, your email, and the exact Tool or profile fact that should change."
    >
      <AeRemoveBusinessPage />
    </AePublicPage>
  )
}
