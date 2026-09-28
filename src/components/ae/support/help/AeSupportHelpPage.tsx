import { ArrowUpRightIcon } from 'lucide-react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSiteFaq } from '@/components/ae/website/AeSiteFaq'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import { AgentConnectionSection } from './components/AgentConnectionSection'
import { PrivateSupportSection } from './components/PrivateSupportSection'
import { ReferencedCallBanner } from './components/ReferencedCallBanner'
import { SupportStatusSection } from './components/SupportStatusSection'
import {
  ISSUE_URL,
  SUPPORT_FAQ_HEADING,
  SUPPORT_FAQ_ITEMS,
  type AeSupportHelpPageProps,
} from './help.contracts'
import { useSupportHelpPage } from './useSupportHelpPage'

export function AeSupportHelpPage({ canonicalBaseUrl, callRef }: AeSupportHelpPageProps) {
  const { supportEmailHref, diagnosticCommand } = useSupportHelpPage({ canonicalBaseUrl, callRef })
  const referencedCallRef = callRef.kind === 'valid' ? callRef.value : undefined

  return (
    <AePublicPage
      kind="document"
      eyebrow="Support"
      title="Help"
      description="Keep the Call reference shown with the problem. It helps us find the right record without asking you to share private inputs."
      actions={
        <a href={supportEmailHref} className={cn(buttonVariants(), 'min-h-touch')}>
          Email support (opens email app)
        </a>
      }
    >
      <div className="ae-rail grid gap-section pb-page">
        {referencedCallRef === undefined ? null : <ReferencedCallBanner callRef={referencedCallRef} />}
        <SupportStatusSection callRef={callRef} />
        <AgentConnectionSection diagnosticCommand={diagnosticCommand} />
        <PrivateSupportSection />
        <p className="text-sm text-muted-foreground">
          GitHub issues are public. Use them only for non-sensitive developer reports.
        </p>
        <a
          href={ISSUE_URL}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: 'outline' }), 'min-h-touch')}
        >
          Open a public developer issue (opens in a new tab) <ArrowUpRightIcon aria-hidden="true" />
        </a>
      </div>
      <AeSiteFaq
        labelledBy="support-faq-heading"
        questions={SUPPORT_FAQ_ITEMS}
        title={SUPPORT_FAQ_HEADING}
      />
    </AePublicPage>
  )
}
