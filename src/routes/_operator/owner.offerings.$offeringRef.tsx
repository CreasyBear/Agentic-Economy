import { createFileRoute, redirect } from '@tanstack/react-router'

import { operatorRouteOptions } from '@/lib/operator/route-options'

/**
 * Historical hand-written Offering editor URLs now resolve to the canonical
 * Provider Tool readback. Source correction is driven from its exact
 * lifecycle continuation instead of a second writer.
 */
export const Route = createFileRoute('/_operator/owner/offerings/$offeringRef')({
  ...operatorRouteOptions,
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/owner/supply/$offeringRef',
      params: { offeringRef: params.offeringRef },
      replace: true,
    })
  },
  head: () => ({ meta: [{ title: 'Tool | Agentic Economy' }, { name: 'robots', content: 'noindex' }] }),
  component: () => null,
})
