import { createFileRoute } from '@tanstack/react-router'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { buildPublicPageHead } from '@/modules/seo/public'

/**
 * Public OpenAPI reference, rendered with Scalar's official CDN embed
 * against the document served at `/openapi.json`. No new dependency: Scalar
 * loads itself from its own CDN at runtime, the same way the repo already
 * loads Clerk, Stripe, and PostHog from their CDNs (see the CSP allowlist in
 * `src/lib/http/security-headers.ts`, which lists the same host).
 */
export const Route = createFileRoute('/developers/api')({
  staticData: {
    nav: {
      label: 'API reference',
      footer: { column: 'Resources', order: 0 },
    },
  },
  loader: () => readCanonicalBaseUrlServer(),
  head: () => buildPublicPageHead({
    path: '/developers/api',
    title: 'API reference | Agentic Economy',
    description: 'Interactive OpenAPI 3.1 reference for the Agentic Economy REST surface: the Tool market, the Call gateway, funding, and business discovery.',
  }),
  component: DevelopersApiRoute,
})

/** Scalar mutates `document.body` for dark mode; keep CDN scripts inside srcDoc only. */
const scalarApiReferenceSrcDoc =
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0">' +
  '<script id="api-reference" data-url="/openapi.json"></script>' +
  '<script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>' +
  '</body></html>'

function DevelopersApiRoute() {
  return (
    <AePublicPage
      kind="document"
      eyebrow="Developers"
      title="API reference"
      description="Every public REST operation - Tool market reads, the Call gateway, funding preflight, and business discovery - documented from the same contracts the platform runs on."
    >
      <iframe
        title="API reference"
        className="min-h-[70vh] w-full border-0"
        srcDoc={scalarApiReferenceSrcDoc}
      />
    </AePublicPage>
  )
}
