import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import { AgentConnectionSection } from './components/AgentConnectionSection'
import { PrivateSupportSection } from './components/PrivateSupportSection'
import { ReferencedCallBanner } from './components/ReferencedCallBanner'
import { SupportStatusSection } from './components/SupportStatusSection'
import type { AeSupportHelpPageProps } from './help.contracts'
import { useSupportHelpPage } from './useSupportHelpPage'

export function AeSupportHelpPage({ canonicalBaseUrl, callRef }: AeSupportHelpPageProps) {
  const { supportEmailHref, diagnosticCommand } = useSupportHelpPage({ canonicalBaseUrl, callRef })

  return (
    <AePublicPage
      kind="document"
      eyebrow="Support"
      title="Help"
      description="Keep the request or Call reference shown with the problem. It helps us find the right record without asking you to share private inputs."
      actions={
        <a href={supportEmailHref} className={cn(buttonVariants(), 'min-h-touch')}>
          Email support
        </a>
      }
    >
      <div className="ae-rail grid gap-section pb-page">
        {callRef === undefined ? null : <ReferencedCallBanner callRef={callRef} />}
        <SupportStatusSection />
        <AgentConnectionSection diagnosticCommand={diagnosticCommand} />
        <PrivateSupportSection />
      </div>
    </AePublicPage>
  )
}
