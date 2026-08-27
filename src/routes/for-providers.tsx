import { createFileRoute, useRouter } from '@tanstack/react-router'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSupplyLanding } from '@/components/ae/supply/AeSupplyLanding'
import { loadSupplyLandingReadbackServer } from '@/lib/server/supply-landing.functions'
import { buildPublicPageHead } from '@/modules/seo/public'

export const Route = createFileRoute('/for-providers')({
  loader: () => loadSupplyLandingReadbackServer(),
  head: () => buildPublicPageHead({
    path: '/for-providers',
    title: 'List your tool | Agentic Economy',
    description: 'Publish the job, the price, and the access terms. Agents compare before they call.',
  }),
  component: SupplyLandingRoute,
})

function SupplyLandingRoute() {
  const readback = Route.useLoaderData()
  const router = useRouter()
  const recoveryProps = readback.kind === 'error'
    ? {
        sourceError: 'Supplier information is temporarily unavailable. Try again.',
        onRetry: () => router.invalidate(),
      }
    : {}
  return (
    <AePublicPage>
      <AeSupplyLanding
        tools={readback.kind === 'available' ? readback.tools : []}
        services={readback.kind === 'available' ? readback.services.services : []}
        {...recoveryProps}
      />
    </AePublicPage>
  )
}
