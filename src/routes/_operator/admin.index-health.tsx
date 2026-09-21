import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { Activity } from 'lucide-react'

import { AeAdminCatalogHealthPage } from '@/components/ae/admin/catalog-health/AeAdminCatalogHealthPage'
import { sourceAuthorityReviewFromSearch } from '@/components/ae/admin/catalog-health/catalog-health.contracts'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAdminIndexHealthThroughSource } from '@/modules/security/admin-readback.functions'

const readAdminIndexHealthServer = createServerFn().handler(() => readAdminIndexHealthThroughSource())

export const Route = createFileRoute('/_operator/admin/index-health')({
  staticData: {
    nav: {
      label: 'Catalog health',
      operator: {
        roles: ['admin'],
        group: 'Records',
        groupOrder: 0,
        order: 0,
        icon: Activity,
        tier: 'core',
      },
    },
  },
  ...operatorRouteOptions,
  validateSearch: z.object({
    publicationRef: z.string().trim().min(1).max(300).optional(),
    expectedRevision: z.coerce.number().int().positive().optional(),
    expectedSourceDigest: z.string().trim().min(1).max(300).optional(),
    operationRef: z.string().trim().min(1).max(300).optional(),
    sourceKind: z.enum(['openapi', 'mcp', 'agent_plugin', 'x402']).optional(),
    sourceUrl: z.string().url().max(2_048).optional(),
  }),
  loader: async () => ({
    readback: await readAdminIndexHealthServer(),
  }),
  head: () => ({
    meta: [
      { title: 'Catalog health | Agentic Economy' },
      {
        name: 'description',
        content: 'Check catalog and projection readbacks before public discovery files ship.',
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: AdminIndexHealthRoute,
})

function AdminIndexHealthRoute() {
  const { readback } = Route.useLoaderData()
  return (
    <AeAdminCatalogHealthPage
      readback={readback}
      review={sourceAuthorityReviewFromSearch(Route.useSearch())}
    />
  )
}
