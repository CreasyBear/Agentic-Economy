import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'

import { AeStatusCard } from '@/components/ae/status/AeStatusCard'
import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { Button } from '@/components/ui/button'
import { getDefaultPublicOwnerStatusReadback } from '@/modules/catalog/public'

export const Route = createFileRoute('/claim/success')({
  loader: () => getDefaultPublicOwnerStatusReadback(),
  head: () => ({
    meta: [
      { title: 'Your service page is published | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: ClaimSuccessRoute,
})

function ClaimSuccessRoute() {
  const readback = Route.useLoaderData()

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow="Published"
        title="Your service page is published"
        description="The public page is available. Index and discovery readbacks remain separate so you can see what is queued or degraded."
        actions={
          <Button asChild>
            <Link to="/owner/status">
              <ArrowRightIcon data-icon="inline-start" />
              View owner status
            </Link>
          </Button>
        }
      />
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 pb-16 md:px-6">
        <AeStatusCard readback={readback} />
        <AeCapabilityList catalog={readback.catalog} />
      </section>
    </AePublicShell>
  )
}
