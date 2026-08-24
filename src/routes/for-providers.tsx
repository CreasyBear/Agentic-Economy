import { createFileRoute, useRouter } from '@tanstack/react-router'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AeSupplyLanding } from '@/components/ae/supply/AeSupplyLanding'
import { loadSupplyLandingReadbackServer } from '@/lib/server/supply-landing.functions'

export const Route = createFileRoute('/for-providers')({
  loader: () => loadSupplyLandingReadbackServer(),
  head: () => ({
    meta: [
      { title: 'List your API or service | Agentic Economy' },
      { name: 'description', content: 'Publish the capability, price and access terms agents need to discover, compare and call your tool.' },
      { name: 'robots', content: 'noindex' },
    ],
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
    <AePublicShell>
      <AeSupplyLanding
        tools={readback.kind === 'available' ? readback.tools : []}
        services={readback.kind === 'available' ? readback.services.services : []}
        {...recoveryProps}
      />
    </AePublicShell>
  )
}
