import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowUpRightIcon, CircleHelp } from 'lucide-react'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { buildPublicPageHead } from '@/modules/seo/public'

const ISSUE_URL = 'https://github.com/CreasyBear/Agentic-Economy/issues/new/choose'
const SUPPORT_EMAIL = 'mailto:support@aecon.ai'

type SupportSearch = {
  callRef?: string
}

export const Route = createFileRoute('/support')({
  validateSearch: (search: Record<string, unknown>): SupportSearch => {
    const raw = search.callRef
    const callRef = typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : undefined
    return callRef === undefined ? {} : { callRef }
  },
  staticData: {
    nav: {
      label: 'Help',
      footer: { column: 'Help', order: 0 },
      operatorUtility: { roles: ['owner', 'admin', 'developer'], order: 2, icon: CircleHelp },
    },
  },
  loader: () => readCanonicalBaseUrlServer(),
  head: () => buildPublicPageHead({
    path: '/support',
    title: 'Help | Agentic Economy',
    description: 'Check a Call, continue Provider setup, or contact private support with a safe request reference.',
  }),
  component: SupportRoute,
})

function supportEmailHref(callRef?: string): string {
  if (callRef === undefined) return SUPPORT_EMAIL
  return `mailto:support@aecon.ai?subject=Help%20with%20Call%20${encodeURIComponent(callRef)}&body=I%20need%20help%20with%20Call%20reference%3A%20${encodeURIComponent(callRef)}%0A%0AWhat%20happened%3A%0A`
}

function SupportRoute() {
  const canonicalBaseUrl = Route.useLoaderData()
  const search = Route.useSearch()
  const supportEmail = supportEmailHref(search.callRef)
  return (
    <AePublicPage
      kind="document"
      eyebrow="Support"
      title="Help"
      description="Keep the request or Call reference shown with the problem. It helps us find the right record without asking you to share private inputs."
      actions={
        <Button asChild className="min-h-touch">
          <a href={supportEmail}>Email support</a>
        </Button>
      }
    >
      <div className="ae-rail grid gap-section pb-page">
        {search.callRef !== undefined ? (
          <div className="rounded-lg border border-border bg-muted/40 px-related py-related text-sm">
            Referenced Call: {search.callRef}
          </div>
        ) : null}
        <AeSection
          id="message-troubleshooting"
          title="Continue from the current status"
          description="The original Call shows its current status and next action. If the result is uncertain, check that Call before trying again."
        >
          <div className="flex flex-wrap gap-related">
            <Button asChild className="min-h-touch"><Link to="/activity">Open Calls</Link></Button>
            <Button asChild variant="outline" className="min-h-touch"><Link to="/owner/operations">Continue Provider setup</Link></Button>
            <Button asChild variant="outline" className="min-h-touch"><Link to="/owner/credit">Review account credit</Link></Button>
          </div>
        </AeSection>
        <AeSection
          title="Agent connection"
          description="Use your client's account connection, then return to your task. Connection and spending permission are separate."
        >
          <Button asChild variant="outline" className="min-h-touch"><Link to="/for-agents">Review agent setup</Link></Button>
          <Accordion type="single" collapsible className="mt-related">
            <AccordionItem value="diagnostics">
              <AccordionTrigger>Advanced connection diagnostics</AccordionTrigger>
              <AccordionContent className="grid gap-related">
                <p>If you use the AE CLI, this read-only check reports the configured server and account status.</p>
                <AeCopyCommand comfortable label="diagnostic command" code={`ae doctor --base-url "${canonicalBaseUrl}"`} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </AeSection>
        <AeSection
          title="Contact support privately"
          description="For account, billing, security or Call problems, email support@aecon.ai with what you expected, what happened and a safe request reference. Do not include credentials, raw inputs or private results."
        >
          <p className="text-sm text-muted-foreground">
            GitHub issues are public. Use them only for non-sensitive developer reports.
          </p>
          <Button asChild variant="outline" className="mt-related min-h-touch">
            <a href={ISSUE_URL} target="_blank" rel="noreferrer">Open a public developer issue <ArrowUpRightIcon aria-hidden="true" /></a>
          </Button>
          <div className="mt-related flex flex-wrap gap-related">
            <Link to="/for-providers" className="inline-flex min-h-touch items-center underline underline-offset-4">Review Provider requirements</Link>
            <Link to="/privacy/remove-business" className="inline-flex min-h-touch items-center underline underline-offset-4">Request a listing correction</Link>
          </div>
        </AeSection>
      </div>
    </AePublicPage>
  )
}
