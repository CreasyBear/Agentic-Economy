import { createFileRoute } from '@tanstack/react-router'

import { DevelopersApiPage } from '@/components/ae/developers/api-reference/DevelopersApiPage'
import { readDevelopersApiPageServer } from '@/components/ae/developers/api-reference/developers-api.functions'
import { buildPublicPageHead } from '@/modules/seo/public'

/** Human reference projected from the same document served at `/openapi.json`. */
export const Route = createFileRoute('/developers/api')({
  staticData: {
    nav: {
      label: 'API reference',
      footer: { column: 'Resources', order: 0 },
    },
  },
  loader: () => readDevelopersApiPageServer(),
  head: () => buildPublicPageHead({
    path: '/developers/api',
    title: 'API reference | Agentic Economy',
    description: 'Interactive OpenAPI 3.1 reference for the Agentic Economy REST surface: the Tool market, the Call gateway, funding, and business discovery.',
  }),
  component: DevelopersApiRoute,
})

function DevelopersApiRoute() {
  return <DevelopersApiPage page={Route.useLoaderData()} />
}
