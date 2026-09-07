import { createFileRoute, useRouter } from '@tanstack/react-router'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSupplyLanding } from '@/components/ae/supply/AeSupplyLanding'
import { loadSupplyLandingReadbackServer } from '@/lib/server/supply-landing.functions'
import { buildPublicPageHead } from '@/modules/seo/public'

export const Route = createFileRoute('/for-providers')({
  loader: () => loadSupplyLandingReadbackServer(),
  head: () => buildPublicPageHead({
    path: '/for-providers',
    title: 'Publish a Tool | Agentic Economy',
    description: 'Publish one bounded job, its price, access terms, readiness, and evidence.',
  }),
  component: SupplyLandingRoute,
})

function SupplyLandingRoute() {
  const readback = Route.useLoaderData()
  const router = useRouter()
  const recoveryProps = readback.kind === 'error'
    ? {
        sourceError: 'Provider information is temporarily unavailable. Try again.',
        onRetry: () => router.invalidate(),
      }
    : {}
  return (
    <AePublicPage>
      <AeSupplyLanding
        tools={readback.kind === 'available' ? readback.tools : []}
        publishedTools={readback.kind === 'available' ? readback.listings : []}
        {...recoveryProps}
      />
    </AePublicPage>
  )
}
